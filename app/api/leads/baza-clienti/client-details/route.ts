/**
 * GET /api/leads/baza-clienti/client-details?clientKey=...
 *
 * Returnează pentru un client (identificat prin clientKey = base64url(nume::telefon)):
 * - totalSum: suma totală comenzi (toate fișele/tăvițele)
 * - instruments: listă instrumente aduse (tip, cantitate, mod: office/curier)
 *
 * Doar utilizatori autentificați.
 */
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/api-helpers'
import { createApiSupabaseClient } from '@/lib/supabase/api-helpers'
import { getLeadDisplayName } from '@/lib/utils/leadDisplay'

function normalizeName(name: string | null | undefined): string {
  if (name == null) return ''
  const s = String(name).trim().replace(/\s+/g, ' ')
  return s.toLowerCase() === 'unknown' ? '' : s
}

function normalizePhone(phone: string | null | undefined): string {
  if (phone == null) return ''
  let s = String(phone).trim().replace(/\s+/g, '')
  if (s.startsWith('+40')) s = s.slice(3).trim()
  else if (s.startsWith('0040')) s = s.slice(4).trim()
  else if (s.startsWith('40') && s.length > 9) s = s.slice(2).trim()
  return s.replace(/\D/g, '') || ''
}

export type ClientDetailsInstrument = {
  instrumentName: string
  qty: number
  mod: 'office' | 'curier'
  fisaNumber?: string
  trayNumber?: string
}

export async function GET(request: Request) {
  try {
    const supabase = await createApiSupabaseClient()
    const { data: { session }, error: authErr } = await supabase.auth.getSession()
    if (authErr || !session?.user) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const clientKeyB64 = searchParams.get('clientKey')
    if (!clientKeyB64) {
      return NextResponse.json({ ok: false, error: 'clientKey required' }, { status: 400 })
    }

    let keyDecoded: string
    try {
      keyDecoded = Buffer.from(clientKeyB64, 'base64url').toString('utf-8')
    } catch {
      return NextResponse.json({ ok: false, error: 'Invalid clientKey' }, { status: 400 })
    }

    const admin = createAdminClient()

    // Găsește leadIds pentru acest client (același nume+telefon)
    const [namePart, phonePart] = keyDecoded.split('::')
    const targetNameNorm = (namePart ?? '').toLowerCase().trim()
    const targetPhoneNorm = (phonePart ?? '').replace(/\D/g, '')

    const { data: leads } = await admin
      .from('leads')
      .select('id, full_name, phone_number, details')

    const raw = (leads ?? []) as { id: string; full_name: string | null; phone_number: string | null; details: string | null }[]
    const leadIds: string[] = []
    for (const lead of raw) {
      const displayName = getLeadDisplayName(lead.full_name, lead.details, null)
      const nameNorm = normalizeName(displayName).toLowerCase()
      const phone = normalizePhone(lead.phone_number)
      if (nameNorm === targetNameNorm && phone === targetPhoneNorm) {
        leadIds.push(lead.id)
      }
    }

    if (leadIds.length === 0) {
      return NextResponse.json({ ok: true, totalSum: 0, instruments: [], fisaCount: 0 })
    }

    // Fișe de serviciu pentru aceste leaduri (inclusiv arhivate – pentru total comenzi)
    const { data: serviceFiles } = await admin
      .from('service_files')
      .select('id, lead_id, number, urgent, global_discount_pct, office_direct, curier_trimis')
      .in('lead_id', leadIds)

    const sfList = serviceFiles ?? []
    const sfIds = sfList.map((s: { id: string }) => s.id)
    const sfMap = new Map(sfList.map((s: any) => [s.id, s]))

    if (sfIds.length === 0) {
      return NextResponse.json({ ok: true, totalSum: 0, instruments: [], fisaCount: 0 })
    }

    // Tăvițe
    const { data: trays } = await admin
      .from('trays')
      .select('id, service_file_id, number, subscription_type')
      .in('service_file_id', sfIds)
      .not('status', 'in', '("2","3")')

    const trayList = trays ?? []
    const trayIds = trayList.map((t: { id: string }) => t.id)
    const trayMap = new Map(trayList.map((t: any) => [t.id, t]))

    // Tray items
    const { data: items } = trayIds.length > 0
      ? await admin.from('tray_items').select('id, tray_id, instrument_id, service_id, part_id, qty, notes').in('tray_id', trayIds)
      : { data: [] as any[] }

    const itemList = items ?? []

    // Instrumente (id, name)
    const instrumentIds = [...new Set(itemList.map((i: any) => i.instrument_id).filter(Boolean))]
    const { data: instrumentsData } = instrumentIds.length > 0
      ? await admin.from('instruments').select('id, name').in('id', instrumentIds)
      : { data: [] as any[] }
    const instrumentNameMap = new Map((instrumentsData ?? []).map((i: any) => [i.id, i.name ?? '']))

    // Listă instrumente aduse (tip, cantitate, mod)
    const instruments: ClientDetailsInstrument[] = []
    for (const it of itemList) {
      if (!it.instrument_id) continue
      const tray = trayMap.get(it.tray_id)
      const sf = tray ? sfMap.get(tray.service_file_id) : null
      const mod: 'office' | 'curier' = sf?.office_direct ? 'office' : 'curier'
      const name = instrumentNameMap.get(it.instrument_id) || 'Instrument'
      instruments.push({
        instrumentName: name,
        qty: it.qty ?? 1,
        mod,
        fisaNumber: sf?.number,
        trayNumber: tray?.number,
      })
    }

    // Total sumă: încarcă services, parts; pentru fiecare item preț din service/part/notes; aplică discount, urgent, subscription
    const serviceIds = [...new Set(itemList.map((i: any) => i.service_id).filter(Boolean))]
    const partIds = [...new Set(itemList.map((i: any) => i.part_id).filter(Boolean))]
    const [servicesData, partsData] = await Promise.all([
      serviceIds.length > 0 ? admin.from('services').select('id, price').in('id', serviceIds) : Promise.resolve({ data: [] as any[] }),
      partIds.length > 0 ? admin.from('parts').select('id, price').in('id', partIds) : Promise.resolve({ data: [] as any[] }),
    ])
    const servicePriceMap = new Map((servicesData.data ?? []).map((s: any) => [s.id, Number(s.price) ?? 0]))
    const partPriceMap = new Map((partsData.data ?? []).map((p: any) => [p.id, Number(p.price) ?? 0]))

    let totalSum = 0
    for (const tray of trayList) {
      const sf = sfMap.get(tray.service_file_id)
      const trayItems = itemList.filter((i: any) => i.tray_id === tray.id)
      const isUrgent = !!sf?.urgent
      const subscriptionType = tray.subscription_type || null

      let subtotal = 0
      let totalDiscount = 0
      let servicesTotal = 0
      let partsTotal = 0

      for (const it of trayItems) {
        let price = 0
        let itemType: 'service' | 'part' | null = null
        let notesData: any = {}
        if (it.notes) {
          try {
            notesData = JSON.parse(it.notes)
          } catch {}
        }
        if (it.service_id) {
          price = servicePriceMap.get(it.service_id) ?? notesData.price ?? 0
          itemType = 'service'
        } else if (it.part_id) {
          price = partPriceMap.get(it.part_id) ?? notesData.price ?? 0
          itemType = 'part'
        } else {
          continue
        }
        const qty = Math.max(1, it.qty ?? 1)
        const discountPct = Math.min(100, Math.max(0, notesData.discount_pct ?? 0))
        const itemSubtotal = qty * price
        const itemDiscount = itemSubtotal * (discountPct / 100)
        subtotal += itemSubtotal
        totalDiscount += itemDiscount
        const afterDisc = itemSubtotal - itemDiscount
        if (itemType === 'service') servicesTotal += afterDisc + (isUrgent ? afterDisc * 0.3 : 0)
        if (itemType === 'part') partsTotal += afterDisc
      }

      const urgentAmount = isUrgent
        ? trayItems
            .filter((it: any) => it.service_id)
            .reduce((acc: number, it: any) => {
              const price = servicePriceMap.get(it.service_id) ?? 0
              const qty = Math.max(1, it.qty ?? 1)
              const disc = (it.notes ? (() => { try { return JSON.parse(it.notes).discount_pct ?? 0 } catch { return 0 } })() : 0) / 100
              return acc + qty * price * (1 - disc) * 0.3
            }, 0)
        : 0

      let subscriptionDiscount = 0
      if (subscriptionType === 'services' || subscriptionType === 'both') subscriptionDiscount += servicesTotal * 0.1
      if (subscriptionType === 'parts' || subscriptionType === 'both') subscriptionDiscount += partsTotal * 0.05

      const baseTotal = subtotal - totalDiscount + urgentAmount
      totalSum += baseTotal - subscriptionDiscount
    }

    return NextResponse.json({
      ok: true,
      totalSum: Math.round(totalSum * 100) / 100,
      currency: 'RON',
      instruments,
      fisaCount: sfList.length,
    })
  } catch (e: unknown) {
    console.error('[/api/leads/baza-clienti/client-details]', e)
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Eroare necunoscută' },
      { status: 500 }
    )
  }
}
