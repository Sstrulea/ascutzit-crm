/**
 * Raport lunar „Servicii și comision tehnician” – export Excel.
 * Conține doar fișe facturate: cele arhivate sau în stage Ridicat personal / De trimis din receptie.
 * Datele sunt citite din arhivă (arhiva_fise_serviciu + arhiva_tray_items).
 * GET /api/admin/reports/servicii-comision-tehnician?year=2026&month=3
 * Doar owner poate accesa.
 */

import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { requireOwner } from '@/lib/supabase/api-helpers'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function parseNotes(notes: string | null): {
  price?: number
  discount?: number
  /** Cantitate nereparată: din notes.unrepaired_qty sau notes.non_repairable_qty (ca în restul app-ului). */
  unrepairedQty: number
} {
  if (!notes) return { unrepairedQty: 0 }
  try {
    const o = JSON.parse(notes) as Record<string, unknown>
    const price = typeof o.price === 'number' ? o.price : undefined
    const discount = typeof o.discount === 'number' ? o.discount : undefined
    const unrepaired =
      typeof (o as any).unrepaired_qty === 'number'
        ? (o as any).unrepaired_qty
        : typeof o.non_repairable_qty === 'number'
          ? o.non_repairable_qty
          : 0
    return {
      price,
      discount,
      unrepairedQty: Number.isFinite(unrepaired) ? Math.max(0, Number(unrepaired)) : 0,
    }
  } catch {
    return { unrepairedQty: 0 }
  }
}

/** Cantitate nereparată: din notes (unrepaired_qty / non_repairable_qty) sau din coloana unrepaired_qty pe item, ca în restul app-ului. */
function getUnrepairedQty(item: any, notesData: { unrepairedQty: number }): number {
  if (notesData.unrepairedQty > 0) return notesData.unrepairedQty
  if (typeof item?.unrepaired_qty === 'number' && Number.isFinite(item.unrepaired_qty)) return Math.max(0, item.unrepaired_qty)
  return 0
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${day}-${m}-${y}`
}

/** Formatează mesajele conversației într-un singur text (pentru coloana Excel). */
function formatConversatie(messages: Array<{ content?: string; created_at?: string; sender_id?: string }> | null | undefined): string {
  if (!Array.isArray(messages) || messages.length === 0) return ''
  return messages
    .map((m) => {
      const data = m.created_at ? formatDate(m.created_at) : ''
      const text = (m.content ?? '').toString().replace(/\r?\n/g, ' ')
      return data ? `[${data}] ${text}` : text
    })
    .filter(Boolean)
    .join(' | ')
}

/** Formatează detaliile comunicate de tehnician (stageLabel + text + at). */
function formatTechnicianDetails(details: Array<{ stageLabel?: string; text?: string; at?: string }> | null | undefined): string {
  if (!Array.isArray(details) || details.length === 0) return ''
  return details
    .map((d) => {
      const data = d.at ? formatDate(d.at) : ''
      const label = (d.stageLabel ?? '').toString().trim()
      const text = (d.text ?? '').toString().replace(/\r?\n/g, ' ')
      const part = label ? `${label}: ${text}` : text
      return data ? `[${data}] ${part}` : part
    })
    .filter(Boolean)
    .join(' | ')
}

export async function GET(request: NextRequest) {
  try {
    const { admin } = await requireOwner()
    const { searchParams } = new URL(request.url)
    const year = parseInt(searchParams.get('year') ?? '', 10)
    const month = parseInt(searchParams.get('month') ?? '', 10)
    const now = new Date()
    const y = Number.isFinite(year) ? year : now.getFullYear()
    const m = Number.isFinite(month) && month >= 1 && month <= 12 ? month : now.getMonth() + 1
    const start = new Date(y, m - 1, 1)
    const end = new Date(y, m, 0, 23, 59, 59, 999)
    const startStr = start.toISOString()
    const endStr = end.toISOString()

    // Fișe facturate (arhivate) în luna selectată – din arhivă (inclusiv istoric pentru conversație)
    const { data: fiseArhivate, error: fiseErr } = await admin
      .from('arhiva_fise_serviciu')
      .select(`
        id,
        lead_id,
        number,
        date,
        status,
        created_at,
        istoric,
        technician_details,
        leads ( full_name, company_name )
      `)
      .gte('created_at', startStr)
      .lte('created_at', endStr)

    if (fiseErr) {
      return NextResponse.json({ ok: false, error: fiseErr.message }, { status: 500 })
    }

    const arhivaFisaIds = (fiseArhivate ?? []).map((f: any) => f.id)
    const emptyExcel = () => {
      const wb = XLSX.utils.book_new()
      const ws = XLSX.utils.aoa_to_sheet([
        ['Servicii si comision tehnician'],
        [],
        ['Data început', '', 'Data sfârşit', '', 'Tehnician', 'Toți'],
        [formatDate(startStr), '', formatDate(endStr), '', '', ''],
        [],
        ['Departament', 'Denumire servicii', 'Bucati totale', 'Data introducere comanda', 'Data factura', 'Nr. fișă', 'Cantitate reparata', 'Cantitate nereparata', 'Client', 'Tehnician', 'Statut', 'Preţ cu TVA', 'Discount', 'Suma total', 'Conversație'],
      ])
      XLSX.utils.book_append_sheet(wb, ws, 'Raport')
      const arr = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as number[]
      return new NextResponse(new Uint8Array(arr), {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="servicii-comision-tehnician-${y}-${String(m).padStart(2, '0')}.xlsx"`,
        },
      })
    }

    // Item-uri din arhivă (dacă există fișe arhivate în luna selectată)
    let items: any[] = []
    if (arhivaFisaIds.length > 0) {
      const { data: archiveItems, error: itemsErr } = await admin
        .from('arhiva_tray_items')
        .select(`
          id,
          arhiva_fisa_id,
          service_id,
          part_id,
          technician_id,
          department_id,
          qty,
          unrepaired_qty,
          notes,
          pipeline,
          discount,
          serials,
          services ( name, price, instrument_id, instrument:instruments ( pipeline, pipelines ( name ) ) ),
          parts ( price )
        `)
        .in('arhiva_fisa_id', arhivaFisaIds)
      if (itemsErr) {
        return NextResponse.json({ ok: false, error: itemsErr.message }, { status: 500 })
      }
      items = archiveItems ?? []
    }

    // Fișe facturate LIVE (în stage Arhivat / De trimis / Ridicat personal) care nu sunt încă arhivate – actualizate în luna selectată
    const { data: receptiePipelines } = await admin
      .from('pipelines')
      .select('id')
      .ilike('name', '%receptie%')
      .limit(1)
    const receptieId = receptiePipelines?.[0]?.id
    let liveSfIds: string[] = []
    if (receptieId) {
      const { data: stages } = await admin
        .from('stages')
        .select('id, name')
        .eq('pipeline_id', receptieId)
      const facturatStageIds = (stages ?? [])
        .filter((s: any) => {
          const n = (s.name || '').toLowerCase()
          return n.includes('arhivat') || n.includes('arhiva') || n.includes('de trimis') || n.includes('ridicat')
        })
        .map((s: any) => s.id)
      if (facturatStageIds.length > 0) {
        const { data: piRows } = await admin
          .from('pipeline_items')
          .select('item_id')
          .eq('type', 'service_file')
          .eq('pipeline_id', receptieId)
          .in('stage_id', facturatStageIds)
        const sfIdsInStages = (piRows ?? []).map((r: any) => r.item_id).filter(Boolean)
        if (sfIdsInStages.length > 0) {
          const { data: liveFise } = await admin
            .from('service_files')
            .select('id, lead_id, created_at, updated_at, status, leads ( full_name, company_name )')
            .in('id', sfIdsInStages)
            .is('archived_at', null)
          liveSfIds = (liveFise ?? []).map((f: any) => f.id)
        }
      }
    }
    let liveTrays: any[] = []
    let liveItems: any[] = []
    const liveFisaById = new Map<string, any>()
    if (liveSfIds.length > 0) {
      const { data: sfWithLeads } = await admin
        .from('service_files')
        .select('id, lead_id, number, date, created_at, updated_at, status, technician_details, leads ( full_name, company_name )')
        .in('id', liveSfIds)
      for (const f of sfWithLeads ?? []) {
        liveFisaById.set((f as any).id, f)
      }
      const { data: traysLive } = await admin
        .from('trays')
        .select('id, service_file_id, created_at')
        .in('service_file_id', liveSfIds)
      liveTrays = traysLive ?? []
      const liveTrayIds = liveTrays.map((t: any) => t.id)
      if (liveTrayIds.length > 0) {
        const { data: itemsLive } = await admin
          .from('tray_items')
          .select(`
            id,
            tray_id,
            service_id,
            part_id,
            technician_id,
            department_id,
            qty,
            unrepaired_qty,
            notes,
            pipeline,
            services ( name, price, instrument_id, instrument:instruments ( pipeline, pipelines ( name ) ) ),
            parts ( price )
          `)
          .in('tray_id', liveTrayIds)
        liveItems = itemsLive ?? []
      }
    }

    // Rezolvăm pentru coloana Departament: în raport folosim PIPELINE (nu department). Colectăm din arhivă + live.
    const departmentIds = new Set<string>()
    const pipelineIds = new Set<string>()
    const uuidLike = (s: string) => typeof s === 'string' && s.length >= 32 && /^[0-9a-f-]{36}$/i.test(s.trim())
    for (const it of items) {
      const o = it as any
      if (o.department_id) departmentIds.add(o.department_id)
      if (o.pipeline && uuidLike(o.pipeline)) pipelineIds.add(o.pipeline.trim())
    }
    for (const it of liveItems) {
      const o = it as any
      if (o.department_id) departmentIds.add(o.department_id)
      if (o.pipeline && uuidLike(o.pipeline)) pipelineIds.add(o.pipeline.trim())
    }
    const departmentNameById = new Map<string, string>()
    const pipelineNameById = new Map<string, string>()
    if (departmentIds.size > 0) {
      const { data: deps } = await admin
        .from('departments')
        .select('id, name')
        .in('id', Array.from(departmentIds))
      for (const d of deps ?? []) {
        const id = (d as any).id
        if (id) departmentNameById.set(id, (d as any).name ?? '')
      }
    }
    const departmentNamesLower = new Set([...departmentNameById.values()].map((n) => n.toLowerCase()))
    if (pipelineIds.size > 0) {
      const { data: pipes } = await admin
        .from('pipelines')
        .select('id, name')
        .in('id', Array.from(pipelineIds))
      for (const p of pipes ?? []) {
        const id = (p as any).id
        if (id) pipelineNameById.set(id, (p as any).name ?? '')
      }
    }

    const techIds = new Set<string>()
    for (const it of items) {
      const tid = (it as any).technician_id
      if (tid) techIds.add(tid)
    }
    for (const it of liveItems) {
      const tid = (it as any).technician_id
      if (tid) techIds.add(tid)
    }
    const techNameById = new Map<string, string>()
    if (techIds.size > 0) {
      const { data: members } = await admin
        .from('app_members')
        .select('user_id, name')
        .in('user_id', Array.from(techIds))
      for (const mem of members ?? []) {
        const id = (mem as any).user_id
        const name = (mem as any).name ?? ''
        if (id) techNameById.set(id, name)
      }
      // Fallback: tehnicieni care nu sunt în app_members (ex. cont șters) – nume din auth
      const missing = Array.from(techIds).filter((id) => !techNameById.get(id))
      if (missing.length > 0 && admin.auth?.admin) {
        try {
          for (const uid of missing) {
            const { data: u } = await admin.auth.admin.getUserById(uid)
            const name =
              (u?.user?.user_metadata?.name ?? u?.user?.user_metadata?.full_name ?? u?.user?.email ?? '').toString() || ''
            if (uid && name) techNameById.set(uid, name)
          }
        } catch {
          // ignoră erori auth
        }
      }
    }

    const fisaById = new Map<string, any>()
    for (const f of fiseArhivate ?? []) {
      fisaById.set((f as any).id, f)
    }
    const liveTrayById = new Map<string, any>()
    for (const t of liveTrays) {
      liveTrayById.set((t as any).id, t)
    }

    // Conversație per lead: din arhivă (istoric) și din DB pentru fișe live
    const conversatieByLeadId = new Map<string, string>()
    for (const f of fiseArhivate ?? []) {
      const leadId = (f as any).lead_id
      const istoric = (f as any).istoric as { conversatie?: any[] } | null | undefined
      if (leadId && istoric?.conversatie) {
        conversatieByLeadId.set(leadId, formatConversatie(istoric.conversatie))
      }
    }
    const liveLeadIds = [...new Set([...liveFisaById.values()].map((f: any) => f.lead_id).filter(Boolean))]
    if (liveLeadIds.length > 0) {
      const { data: convs } = await admin
        .from('conversations')
        .select('id, related_id')
        .eq('type', 'lead')
        .in('related_id', liveLeadIds)
      const convIds = (convs ?? []).map((c: any) => c.id)
      const convToLead = new Map<string, string>()
      for (const c of convs ?? []) {
        if ((c as any).related_id) convToLead.set((c as any).id, (c as any).related_id)
      }
      if (convIds.length > 0) {
        const { data: msgs } = await admin
          .from('messages')
          .select('conversation_id, content, created_at')
          .in('conversation_id', convIds)
          .order('created_at', { ascending: true })
        const msgsByConv = new Map<string, any[]>()
        for (const msg of msgs ?? []) {
          const cid = (msg as any).conversation_id
          if (!msgsByConv.has(cid)) msgsByConv.set(cid, [])
          msgsByConv.get(cid)!.push(msg)
        }
        for (const [convId, list] of msgsByConv) {
          const leadId = convToLead.get(convId)
          if (leadId) conversatieByLeadId.set(leadId, formatConversatie(list))
        }
      }
    }

    const rows: (string | number)[][] = []
    const seenArchiveKeys = new Set<string>()
    for (const item of items) {
      const it = item as any
      const fisa = fisaById.get(it.arhiva_fisa_id)
      const lead = Array.isArray(fisa?.leads) ? fisa.leads[0] : fisa?.leads
      const clientName = lead?.full_name || lead?.company_name || ''
      // În raport coloana Departament = pipeline (nu department). Prefer pipeline din instrument (service->instrument->pipelines.name), apoi pipeline UUID/text din arhivă; nu folosim nume department (ex. "ascutire") ca pipeline.
      const serviceRow = Array.isArray(it.services) ? it.services[0] : it.services
      const inst = serviceRow?.instrument ?? (Array.isArray(serviceRow?.instruments) ? serviceRow.instruments[0] : serviceRow?.instruments)
      const pipelineFromInstrument = inst?.pipelines
      const pipelineNameFromInst = (Array.isArray(pipelineFromInstrument) ? pipelineFromInstrument[0] : pipelineFromInstrument)?.name ?? null
      const pipelineText = typeof it.pipeline === 'string' && it.pipeline.trim() ? it.pipeline.trim() : null
      const pipelineTextIsDepartmentName = pipelineText && departmentNamesLower.has(pipelineText.toLowerCase())
      const departament =
        pipelineNameFromInst ??
        (it.pipeline && uuidLike(it.pipeline) ? pipelineNameById.get(it.pipeline.trim()) : null) ??
        (pipelineText && !pipelineTextIsDepartmentName ? pipelineText : null) ??
        (it.department_id ? departmentNameById.get(it.department_id) : null) ??
        ''
      const service = Array.isArray(it.services) ? it.services[0] : it.services
      const part = Array.isArray(it.parts) ? it.parts[0] : it.parts
      const serviceName = service?.name ?? (part ? 'Piese' : '')
      const servicePrice = Number(service?.price ?? part?.price ?? 0) || 0
      const notesData = parseNotes(it.notes ?? null)
      const qty = Math.max(0, Number(it.qty) || 1)
      const nonRep = getUnrepairedQty(it, notesData)
      const repQty = Math.max(0, qty - nonRep)
      const priceTva = notesData.price ?? servicePrice
      const discount = notesData.discount ?? 0
      const pretFinal = Math.max(0, priceTva - discount)
      const priceTvaTotal = Math.round(priceTva * repQty * 100) / 100
      const discountTotal = Math.round(discount * repQty * 100) / 100
      const pretFinalTotal = Math.round(pretFinal * repQty * 100) / 100
      if ((departament || '').toLowerCase().includes('receptie')) continue
      if (pretFinalTotal === 0 && !departament) continue
      const rowKey = `arhiva:${it.arhiva_fisa_id}:${it.id}`
      if (seenArchiveKeys.has(rowKey)) continue
      seenArchiveKeys.add(rowKey)
      const dataIntroducere = fisa?.date ? (fisa.date.includes('-') || fisa.date.includes('/') ? formatDate(fisa.date) : fisa.date) : ''
      const dataFactura = fisa?.created_at ? formatDate(fisa.created_at) : ''
      const nrFisa = (fisa as any)?.number ?? ''
      const technicianName = it.technician_id ? (techNameById.get(it.technician_id) || '') : ''
      const statut = fisa?.status ?? 'facturata'
      const leadId = (fisa as any)?.lead_id ?? ''
      const techDetails = formatTechnicianDetails((fisa as any)?.technician_details)
      const conversatieText = [conversatieByLeadId.get(leadId) ?? '', techDetails ? `Detalii tehnician: ${techDetails}` : ''].filter(Boolean).join(' | ')

      rows.push([
        departament,
        serviceName,
        qty,
        dataIntroducere,
        dataFactura,
        nrFisa,
        repQty,
        nonRep,
        clientName,
        technicianName,
        statut,
        priceTvaTotal,
        discountTotal,
        pretFinalTotal,
        conversatieText,
      ])
    }

    const seenLiveKeys = new Set<string>()
    // Rânduri din fișe live (Arhivat / De trimis / Ridicat) actualizate în luna selectată
    for (const item of liveItems) {
      const it = item as any
      const tray = liveTrayById.get(it.tray_id)
      const fisa = tray ? liveFisaById.get(tray.service_file_id) : null
      const lead = Array.isArray(fisa?.leads) ? fisa?.leads[0] : fisa?.leads
      const clientName = lead?.full_name || lead?.company_name || ''
      const serviceRow = Array.isArray(it.services) ? it.services[0] : it.services
      const inst = serviceRow?.instrument ?? (Array.isArray(serviceRow?.instruments) ? serviceRow.instruments[0] : serviceRow?.instruments)
      const pipelineFromInstrument = inst?.pipelines
      const pipelineNameFromInst = (Array.isArray(pipelineFromInstrument) ? pipelineFromInstrument[0] : pipelineFromInstrument)?.name ?? null
      const pipelineText = typeof it.pipeline === 'string' && it.pipeline.trim() ? it.pipeline.trim() : null
      const pipelineTextIsDepartmentName = pipelineText && departmentNamesLower.has(pipelineText.toLowerCase())
      const departament =
        pipelineNameFromInst ??
        (it.pipeline && uuidLike(it.pipeline) ? pipelineNameById.get(it.pipeline.trim()) : null) ??
        (pipelineText && !pipelineTextIsDepartmentName ? pipelineText : null) ??
        (it.department_id ? departmentNameById.get(it.department_id) : null) ??
        ''
      if ((departament || '').toLowerCase().includes('receptie')) continue
      const service = Array.isArray(it.services) ? it.services[0] : it.services
      const part = Array.isArray(it.parts) ? it.parts[0] : it.parts
      const serviceName = service?.name ?? (part ? 'Piese' : '')
      const servicePrice = Number(service?.price ?? part?.price ?? 0) || 0
      const notesData = parseNotes(it.notes ?? null)
      const qty = Math.max(0, Number(it.qty) || 1)
      const nonRep = getUnrepairedQty(it, notesData)
      const repQty = Math.max(0, qty - nonRep)
      const priceTva = notesData.price ?? servicePrice
      const discount = notesData.discount ?? 0
      const pretFinal = Math.max(0, priceTva - discount)
      const priceTvaTotal = Math.round(priceTva * repQty * 100) / 100
      const discountTotal = Math.round(discount * repQty * 100) / 100
      const pretFinalTotal = Math.round(pretFinal * repQty * 100) / 100
      if (pretFinalTotal === 0 && !departament) continue
      const rowKey = `live:${it.tray_id}:${it.id}`
      if (seenLiveKeys.has(rowKey)) continue
      seenLiveKeys.add(rowKey)
      const dataIntroducere = tray?.created_at ? formatDate(tray.created_at) : ''
      const dataFactura = fisa?.updated_at ? formatDate(fisa.updated_at) : ''
      const nrFisa = (fisa as any)?.number ?? ''
      const technicianName = it.technician_id ? (techNameById.get(it.technician_id) || '') : ''
      const statut = fisa?.status ?? 'facturata'
      const leadId = (fisa as any)?.lead_id ?? ''
      const techDetails = formatTechnicianDetails((fisa as any)?.technician_details)
      const conversatieText = [conversatieByLeadId.get(leadId) ?? '', techDetails ? `Detalii tehnician: ${techDetails}` : ''].filter(Boolean).join(' | ')
      rows.push([
        departament,
        serviceName,
        qty,
        dataIntroducere,
        dataFactura,
        nrFisa,
        repQty,
        nonRep,
        clientName,
        technicianName,
        statut,
        priceTvaTotal,
        discountTotal,
        pretFinalTotal,
        conversatieText,
      ])
    }

    if (rows.length === 0) {
      return emptyExcel()
    }

    // Rânduri cu toate coloanele identice = aceeași înregistrare; afișăm o singură dată în Excel
    function rowSignature(r: (string | number)[]): string {
      return r.map((v, i) => {
        if (typeof v === 'number') return (Math.round(Number(v) * 100) / 100).toFixed(2)
        return String(v ?? '')
      }).join('\t')
    }
    const seenSignatures = new Set<string>()
    const uniqueRows = rows.filter((row) => {
      const sig = rowSignature(row)
      if (seenSignatures.has(sig)) return false
      seenSignatures.add(sig)
      return true
    })

    const headerRow = ['Departament', 'Denumire servicii', 'Bucati totale', 'Data introducere comanda', 'Data factura', 'Nr. fișă', 'Cantitate reparata', 'Cantitate nereparata', 'Client', 'Tehnician', 'Statut', 'Preţ cu TVA', 'Discount', 'Suma total', 'Conversație']
    const sheetData = [
      ['Servicii si comision tehnician'],
      [],
      ['Data început', '', 'Data sfârşit', '', 'Tehnician', 'Toți'],
      [formatDate(startStr), '', formatDate(endStr), '', '', ''],
      [],
      headerRow,
      ...uniqueRows,
    ]
    const ws = XLSX.utils.aoa_to_sheet(sheetData)
    // Format coloane preț (L, M, N = 11, 12, 13: Preț TVA, Discount, Suma total) ca numere cu 2 zecimale
    const colLetters = ['A','B','C','D','E','F','G','H','I','J','K','L','M','N','O']
    const dataStartRow = 7
    for (let r = 0; r < uniqueRows.length; r++) {
      const rowNum = dataStartRow + r
      for (const col of [11, 12, 13]) {
        const ref = colLetters[col] + rowNum
        if (ws[ref] && typeof ws[ref].v === 'number') {
          ws[ref].z = '0.00'
          ws[ref].t = 'n'
        }
      }
    }
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Raport')
    const arr = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as number[]
    return new NextResponse(new Uint8Array(arr), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="servicii-comision-tehnician-${y}-${String(m).padStart(2, '0')}.xlsx"`,
      },
    })
  } catch (err: unknown) {
    if (err instanceof Response) return err
    const message = err instanceof Error ? err.message : 'Eroare la generare raport'
    console.error('[servicii-comision-tehnician]', err)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
