/**
 * GET /api/leads/baza-clienti
 *
 * Returnează lista de clienți unici (același nume complet + același telefon, fără prefix +40)
 * cu numărul de leaduri per client.
 * Numele se ia din full_name sau, dacă lipsește, din "Detalii comunicate de client" (details).
 * Doar utilizatori autentificați. Citirea leadurilor se face cu admin client.
 */
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/api-helpers'
import { createApiSupabaseClient } from '@/lib/supabase/api-helpers'
import { getLeadDisplayName } from '@/lib/utils/leadDisplay'

/** Normalizează numele: trim + colapsare spații multiple */
function normalizeName(name: string | null | undefined): string {
  if (name == null) return ''
  const s = String(name).trim().replace(/\s+/g, ' ')
  return s.toLowerCase() === 'unknown' ? '' : s
}

/** Normalizează telefonul: exclude prefix +40/0040, păstrează doar cifre */
function normalizePhone(phone: string | null | undefined): string {
  if (phone == null) return ''
  let s = String(phone).trim().replace(/\s+/g, '')
  if (s.startsWith('+40')) s = s.slice(3).trim()
  else if (s.startsWith('0040')) s = s.slice(4).trim()
  else if (s.startsWith('40') && s.length > 9) s = s.slice(2).trim()
  return s.replace(/\D/g, '') || ''
}

/** Tip client: client = are minim o fișă arhivată; restul după flaguri lead (toate același flag) */
export type ClientTip = 'client' | 'no_deal' | 'nu_raspunde' | 'call_back' | 'lead'

/** Formatează telefon pentru afișare (ex. 0722791179 → 0722 791 179) */
function formatPhoneDisplay(digits: string): string {
  if (!digits) return '—'
  if (digits.length <= 4) return digits
  if (digits.length <= 7) return `${digits.slice(0, 4)} ${digits.slice(4)}`
  return `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7, 10)}${digits.length > 10 ? ' ' + digits.slice(10) : ''}`
}

export type BazaClientiRow = {
  fullName: string
  leadCount: number
  /** client = are cel puțin o fișă arhivată; no_deal/nu_raspunde/call_back = toate leadurile au acel flag; lead = nici o fișă arhivată, flaguri mixte */
  tip: ClientTip
  /** Telefon afișabil (primul întâlnit pentru acest client), fără +40 */
  phoneDisplay: string
  /** Număr de fișe de serviciu (service_files) pentru toate leadurile acestui client */
  fisaCount: number
  /** Cheie client pentru endpoint detalii: base64url(nume::telefon) */
  clientKey: string
}

export async function GET() {
  try {
    const supabase = await createApiSupabaseClient()
    const { data: { session }, error: authErr } = await supabase.auth.getSession()
    if (authErr || !session?.user) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
    }

    const admin = createAdminClient()
    const { data: leads, error } = await admin
      .from('leads')
      .select('id, full_name, phone_number, details, no_deal, nu_raspunde, call_back')

    if (error) {
      console.error('[/api/leads/baza-clienti]', error)
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    }

    const raw = (leads ?? []) as {
      id: string
      full_name: string | null
      phone_number: string | null
      details: string | null
      no_deal: boolean | null
      nu_raspunde: boolean | null
      call_back: boolean | null
    }[]

    /** Per client: fullName, leadCount, leadIds, phoneDisplay (primul telefon raw), flags */
    const keyToClient = new Map<string, {
      fullName: string
      leadCount: number
      leadIds: string[]
      phoneDisplay: string
      allNoDeal: boolean
      allNuRaspunde: boolean
      allCallBack: boolean
    }>()

    for (const lead of raw) {
      const displayName = getLeadDisplayName(lead.full_name, lead.details, null)
      const nameNorm = normalizeName(displayName)
      const phone = normalizePhone(lead.phone_number)
      const key = `${nameNorm}::${phone}`
      const isNoDeal = lead.no_deal === true
      const isNuRaspunde = lead.nu_raspunde === true
      const isCallBack = lead.call_back === true
      const phoneDisplay = formatPhoneDisplay(phone)

      const existing = keyToClient.get(key)
      if (existing) {
        existing.leadCount += 1
        existing.leadIds.push(lead.id)
        if (existing.fullName === '(Fără nume)' && nameNorm) existing.fullName = displayName.trim()
        if (!isNoDeal) existing.allNoDeal = false
        if (!isNuRaspunde) existing.allNuRaspunde = false
        if (!isCallBack) existing.allCallBack = false
      } else {
        keyToClient.set(key, {
          fullName: nameNorm ? displayName.trim() : '(Fără nume)',
          leadCount: 1,
          leadIds: [lead.id],
          phoneDisplay,
          allNoDeal: isNoDeal,
          allNuRaspunde: isNuRaspunde,
          allCallBack: isCallBack,
        })
      }
    }

    /** Nr. fișe per lead_id */
    const allLeadIds = Array.from(keyToClient.values()).flatMap((c) => c.leadIds)
    const fisaCountByLeadId = new Map<string, number>()
    if (allLeadIds.length > 0) {
      const { data: serviceFiles } = await admin
        .from('service_files')
        .select('lead_id')
        .in('lead_id', allLeadIds)
      for (const sf of serviceFiles ?? []) {
        const lid = (sf as { lead_id: string }).lead_id
        fisaCountByLeadId.set(lid, (fisaCountByLeadId.get(lid) ?? 0) + 1)
      }
    }

    /** Lead IDs care au cel puțin o fișă arhivată */
    const { data: archivedRows } = await admin
      .from('service_files')
      .select('lead_id')
      .not('archived_at', 'is', null)
    const leadIdsWithArchivedFisa = new Set((archivedRows ?? []).map((r: { lead_id: string }) => r.lead_id))

    /** Client = are minim o fișă arhivată; altfel no_deal / nu_raspunde / call_back dacă toate au acel flag, altfel lead */
    function deriveTip(
      c: { leadIds: string[]; allNoDeal: boolean; allNuRaspunde: boolean; allCallBack: boolean }
    ): ClientTip {
      const hasArchivedFisa = c.leadIds.some((id) => leadIdsWithArchivedFisa.has(id))
      if (hasArchivedFisa) return 'client'
      if (c.allNoDeal) return 'no_deal'
      if (c.allNuRaspunde) return 'nu_raspunde'
      if (c.allCallBack) return 'call_back'
      return 'lead'
    }

    /** clientKey pentru endpoint detalii: base64url(nume::telefon) */
    const toClientKey = (key: string) => Buffer.from(key, 'utf-8').toString('base64url')

    const clients: BazaClientiRow[] = Array.from(keyToClient.entries()).map(([key, c]) => {
      const fisaCount = c.leadIds.reduce((sum, lid) => sum + (fisaCountByLeadId.get(lid) ?? 0), 0)
      return {
        fullName: c.fullName,
        leadCount: c.leadCount,
        tip: deriveTip(c),
        phoneDisplay: c.phoneDisplay,
        fisaCount,
        clientKey: toClientKey(key),
      }
    }).sort(
      (a, b) => (b.leadCount - a.leadCount) || a.fullName.localeCompare(b.fullName)
    )

    const noDealCount = clients.filter((c) => c.tip === 'no_deal').length
    const nuRaspundeCount = clients.filter((c) => c.tip === 'nu_raspunde').length
    const callBackCount = clients.filter((c) => c.tip === 'call_back').length
    const clientCount = clients.filter((c) => c.tip === 'client').length
    const leadCount = clients.filter((c) => c.tip === 'lead').length

    return NextResponse.json({
      ok: true,
      clients,
      stats: {
        total: clients.length,
        clientCount,
        noDealCount,
        nuRaspundeCount,
        callBackCount,
        leadCount,
      },
    })
  } catch (e: unknown) {
    console.error('[/api/leads/baza-clienti]', e)
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Eroare necunoscută' },
      { status: 500 }
    )
  }
}
