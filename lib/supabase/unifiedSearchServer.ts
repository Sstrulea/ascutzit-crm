/**
 * Căutare unificată pe server: lead-uri, fișe de serviciu, tăvițe.
 * Suportă: telefon (normalizat), nume (token + diacritice), email, companie, tag, tehnician, serial.
 * Multi-parametru: termeni separați prin virgulă → intersecție (AND) pe leadId.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { searchTraysGloballyWithClient } from './traySearchServer'
import { normalizePhoneNumber, getPhoneVariants, removeDiacritics } from '@/lib/utils'

export type UnifiedSearchItemType = 'lead' | 'service_file' | 'tray'

export type MatchedByType = 'phone' | 'name' | 'email' | 'company' | 'serial' | 'tag' | 'technician' | 'number'

export interface UnifiedSearchResult {
  type: UnifiedSearchItemType
  id: string
  title: string
  subtitle?: string
  /** Pentru redirecționare: pipeline-ul în care se deschide (vanzari, receptie, saloane, etc.) */
  pipelineSlug: string
  /** Payload pentru open: leadId sau serviceFileId sau trayId */
  openId: string
  /** Nume pipeline pentru afișare (ex. Vânzări, Recepție, Saloane) */
  pipelineName?: string
  /** Nume stage pentru afișare (ex. Comandă, În lucru) */
  stageName?: string
  /** ID lead pentru intersecție multi-parametru */
  leadId?: string
  /** Criteriul care a generat match-ul */
  matchedBy?: MatchedByType
  /** Pentru type=tray: id-ul fișei de serviciu care conține tăvița (deschidem detaliile fișei, nu pipeline departament) */
  serviceFileId?: string
  /** Pipeline-ul în care se află fișa (receptie / arhivare etc.) – pentru deschidere corectă și fișe arhivate */
  serviceFilePipelineSlug?: string
}

const LIMIT = 25
const LIMIT_PER_TYPE = 8
const LIMIT_TRAYS = 9

const toSlug = (name: string) =>
  String(name || '')
    .toLowerCase()
    .replace(/[ăâ]/g, 'a')
    .replace(/[îț]/g, (c) => (c === 'î' ? 'i' : 't'))
    .replace(/[șş]/g, 's')
    .replace(/\s+/g, '-')
    .trim()

// ═══════════════════════════════════════════════════════════════════
// STRATEGIA 1: RPC search_unified (rapid, un singur round-trip)
// ═══════════════════════════════════════════════════════════════════

async function searchViaRPC(
  supabase: SupabaseClient,
  query: string
): Promise<{ data: UnifiedSearchResult[]; error: any; rpcAvailable: boolean }> {
  try {
    const { data, error } = await supabase.rpc('search_unified', {
      p_query: query.trim(),
      p_limit: LIMIT,
    })

    // Dacă funcția nu există, semnalăm ca RPC indisponibil
    if (error) {
      const msg = String(error?.message || '')
      const isNotFound =
        msg.includes('function') && msg.includes('does not exist') ||
        error?.code === '42883' ||
        msg.includes('Could not find the function')
      if (isNotFound) {
        return { data: [], error: null, rpcAvailable: false }
      }
      // Altă eroare RPC - propagăm
      return { data: [], error, rpcAvailable: true }
    }

    // RPC returnează jsonb (array de obiecte)
    const rows = Array.isArray(data) ? data : (data as any) || []
    const results: UnifiedSearchResult[] = rows.map((r: any) => ({
      type: r.type as UnifiedSearchItemType,
      id: r.id,
      title: r.title || '',
      subtitle: r.subtitle || undefined,
      pipelineSlug: r.pipelineSlug || r.pipeline_slug || 'receptie',
      openId: r.openId || r.open_id || r.id,
      pipelineName: r.pipelineName || r.pipeline_name || undefined,
      stageName: r.stageName || r.stage_name || undefined,
    }))

    return { data: results, error: null, rpcAvailable: true }
  } catch (err: any) {
    return { data: [], error: err, rpcAvailable: false }
  }
}

// ═══════════════════════════════════════════════════════════════════
// STRATEGIA 2: Fallback pe query-uri directe (lent, multi-roundtrip)
// ═══════════════════════════════════════════════════════════════════

async function resolvePipelineInfo(
  supabase: SupabaseClient,
  items: Array<{ type: string; id: string }>
): Promise<Map<string, { slug: string; name: string; stageName?: string }>> {
  const result = new Map<string, { slug: string; name: string; stageName?: string }>()
  if (items.length === 0) return result

  const byType = new Map<string, string[]>()
  for (const item of items) {
    const list = byType.get(item.type) || []
    list.push(item.id)
    byType.set(item.type, list)
  }

  const allPiRows: any[] = []
  for (const [type, ids] of byType) {
    const { data: piRows } = await supabase
      .from('pipeline_items')
      .select('item_id, pipeline_id, stage_id, type')
      .eq('type', type)
      .in('item_id', ids)
    if (piRows) allPiRows.push(...piRows)
  }

  if (allPiRows.length === 0) return result

  const pipelineIds = [...new Set(allPiRows.map((r) => r.pipeline_id).filter(Boolean))]
  const pipelineMap = new Map<string, { slug: string; name: string }>()
  if (pipelineIds.length > 0) {
    const { data: pipelines } = await supabase.from('pipelines').select('id, name').in('id', pipelineIds)
    for (const p of pipelines || []) {
      pipelineMap.set(p.id, { slug: toSlug(p.name), name: p.name })
    }
  }

  const stageIds = [...new Set(allPiRows.map((r) => r.stage_id).filter(Boolean))]
  const stageMap = new Map<string, string>()
  if (stageIds.length > 0) {
    const { data: stages } = await supabase.from('stages').select('id, name').in('id', stageIds)
    for (const s of stages || []) stageMap.set(s.id, s.name)
  }

  for (const pi of allPiRows) {
    const key = pi.item_id as string
    const pInfo = pipelineMap.get(pi.pipeline_id)
    if (!pInfo) continue
    const stageName = stageMap.get(pi.stage_id) || undefined
    const existing = result.get(key)
    const stageLower = (stageName || '').toLowerCase()
    const pipelineLower = (pInfo.name || '').toLowerCase()
    const isArhivat = stageLower.includes('arhivat') || pipelineLower.includes('arhivare')
    const isMessages = stageLower.includes('messages')
    const preferThisRow =
      isArhivat ||
      (!isMessages && existing && (existing.stageName || '').toLowerCase().includes('messages'))
    if (!existing || preferThisRow) {
      result.set(key, { slug: pInfo.slug, name: pInfo.name, stageName })
    }
  }

  return result
}

type RawSearchRow = {
  type: UnifiedSearchItemType
  id: string
  title: string
  subtitle?: string
  openId: string
  fallbackSlug: string
  fallbackName: string
  leadId: string
  matchedBy?: MatchedByType
  serviceFileId?: string
}

async function searchViaDirectQueries(
  supabase: SupabaseClient,
  query: string
): Promise<{ data: UnifiedSearchResult[]; error: any }> {
  try {
    const term = query.trim()
    const termLike = `%${term}%`
    const termLower = term.toLowerCase()
    const termNorm = removeDiacritics(term)

    const rawResults: RawSearchRow[] = []
    const seenKeys = new Set<string>()

    // Helper: add leadId to set and push row
    const push = (row: RawSearchRow) => {
      const key = `${row.type}:${row.id}`
      if (seenKeys.has(key)) return
      seenKeys.add(key)
      rawResults.push(row)
    }

    // 1. LEADS: nume (token-based, ordine independentă + diacritice)
    const nameTokens = termNorm
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 0)
    let leadsByName: Array<{ id: string; full_name: string | null; company_name: string | null; phone_number: string | null; email: string | null }> = []
    if (nameTokens.length > 0) {
      let q = supabase
        .from('leads')
        .select('id, full_name, company_name, phone_number, email')
        .limit(LIMIT_PER_TYPE * 2)
      for (const token of nameTokens) {
        q = q.ilike('full_name', `%${token}%`)
      }
      const { data: d } = await q.order('full_name', { ascending: true, nullsFirst: false })
      // Filtrare în memorie: toate token-urile (sau varianta fără diacritice) trebuie să apară în nume
      const normTokens = nameTokens.map((t) => t.toLowerCase())
      leadsByName = (d || []).filter((l) => {
        const name = (l.full_name || '').toLowerCase()
        const nameNorm = removeDiacritics(name)
        return normTokens.every((tok) => name.includes(tok) || nameNorm.includes(tok))
      }) as typeof leadsByName
    }

    // 1b. LEADS: companie, email (ilike)
    const { data: leadsByCompany } = await supabase
      .from('leads')
      .select('id, full_name, company_name, phone_number, email')
      .ilike('company_name', termLike)
      .limit(LIMIT_PER_TYPE)
    const { data: leadsByEmail } = await supabase
      .from('leads')
      .select('id, full_name, company_name, phone_number, email')
      .ilike('email', termLike)
      .limit(LIMIT_PER_TYPE)

    // 1c. LEADS: telefon – toate variantele (0, +40, 40)
    const phoneVariants = getPhoneVariants(term)
    let phoneLeads: Array<{ id: string; full_name: string | null; company_name: string | null; phone_number: string | null; email: string | null }> = []
    if (phoneVariants.length >= 1 && phoneVariants[0].length >= 3) {
      const seenPhoneIds = new Set<string>()
      for (const p of phoneVariants) {
        const pattern = `%${p}%`
        const { data: chunk } = await supabase
          .from('leads')
          .select('id, full_name, company_name, phone_number, email')
          .ilike('phone_number', pattern)
          .limit(LIMIT_PER_TYPE)
        for (const row of chunk || []) {
          const id = row?.id as string
          if (id && !seenPhoneIds.has(id)) {
            seenPhoneIds.add(id)
            phoneLeads.push(row as (typeof phoneLeads)[0])
          }
        }
        if (phoneLeads.length >= LIMIT_PER_TYPE) break
      }
    }

    const allLeadRows = [...leadsByName, ...(leadsByCompany || []), ...(leadsByEmail || []), ...phoneLeads]
    const byLeadId = new Map<string, { row: (typeof allLeadRows)[0]; matchedBy: MatchedByType }>()
    for (const l of leadsByName) {
      if (l.id && !byLeadId.has(l.id)) byLeadId.set(l.id, { row: l, matchedBy: 'name' })
    }
    for (const l of leadsByCompany || []) {
      if (l.id && !byLeadId.has(l.id)) byLeadId.set(l.id, { row: l, matchedBy: 'company' })
    }
    for (const l of leadsByEmail || []) {
      if (l.id && !byLeadId.has(l.id)) byLeadId.set(l.id, { row: l, matchedBy: 'email' })
    }
    for (const l of phoneLeads) {
      if (l.id && !byLeadId.has(l.id)) byLeadId.set(l.id, { row: l, matchedBy: 'phone' })
    }
    const allMatchedLeadIds = new Set(byLeadId.keys())
    const leadIdsForSf = Array.from(allMatchedLeadIds)

    for (const [leadId, { row: l, matchedBy }] of byLeadId) {
      const title = ((l.full_name || l.company_name || '') as string).trim() || 'Fără nume'
      const subtitle = [l.company_name, l.phone_number, l.email].filter(Boolean).join(' · ')
      push({ type: 'lead', id: leadId, title, subtitle: subtitle || undefined, openId: leadId, fallbackSlug: 'vanzari', fallbackName: 'Vânzări', leadId, matchedBy })
    }

    // 2. LEADS + FIȘE + TĂVIȚE: tag (lead_tags + tags)
    const { data: tagsByName } = await supabase.from('tags').select('id').ilike('name', termLike).limit(20)
    const tagIds = (tagsByName || []).map((t: { id: string }) => t.id).filter(Boolean)
    if (tagIds.length > 0) {
      const { data: leadTagsRows } = await supabase.from('lead_tags').select('lead_id').in('tag_id', tagIds)
      const tagLeadIds = [...new Set((leadTagsRows || []).map((r: { lead_id: string }) => r.lead_id).filter(Boolean))]
      for (const lid of tagLeadIds) {
        if (!lid || seenKeys.has(`lead:${lid}`)) continue
        const { data: leadRow } = await supabase.from('leads').select('id, full_name, company_name, phone_number, email').eq('id', lid).single()
        if (!leadRow) continue
        const title = ((leadRow.full_name || leadRow.company_name || '') as string).trim() || 'Fără nume'
        const subtitle = [leadRow.company_name, leadRow.phone_number, leadRow.email].filter(Boolean).join(' · ')
        push({ type: 'lead', id: lid, title, subtitle: subtitle || undefined, openId: lid, fallbackSlug: 'vanzari', fallbackName: 'Vânzări', leadId: lid, matchedBy: 'tag' })
        allMatchedLeadIds.add(lid)
      }
      if (tagLeadIds.length > 0 && !leadIdsForSf.includes(tagLeadIds[0])) {
        leadIdsForSf.push(...tagLeadIds)
      }
    }

    // 3. Tehnician: app_members (name ilike) → user_id; trays (technician_id / 2 / 3) → lead_id
    const { data: members } = await supabase.from('app_members').select('user_id, name').ilike('name', termLike).limit(30)
    const technicianUserIds = [...new Set((members || []).map((m: { user_id: string }) => m.user_id).filter(Boolean))]
    if (technicianUserIds.length > 0) {
      const orParts = technicianUserIds.flatMap((uid) => [`technician_id.eq.${uid}`, `technician2_id.eq.${uid}`, `technician3_id.eq.${uid}`])
      const { data: traysByTech } = await supabase
        .from('trays')
        .select('id, number, service_file_id, service_file:service_files!inner(lead_id, number, lead:leads(id, full_name, company_name))')
        .or(orParts.join(','))
        .limit(LIMIT_TRAYS)
      for (const t of traysByTech || []) {
        const tid = t.id as string
        const sf = (t as any).service_file
        const leadId = sf?.lead_id as string | undefined
        if (!tid || !leadId || seenKeys.has(`tray:${tid}`)) continue
        const lead = sf?.lead
        const leadName = lead?.full_name || lead?.company_name || ''
        const title = `Tăviță ${t.number || ''}`.trim() || `Tăviță ${tid}`
        const subtitle = [leadName, sf?.number].filter(Boolean).join(' · ')
        const sfId = (t as any).service_file_id as string | undefined
        push({ type: 'tray', id: tid, title, subtitle: subtitle || undefined, openId: tid, fallbackSlug: 'saloane', fallbackName: 'Saloane', leadId, matchedBy: 'technician', serviceFileId: sfId })
        allMatchedLeadIds.add(leadId)
      }
    }

    // 4. FIȘE (număr) + prin lead
    const { data: serviceFiles } = await supabase
      .from('service_files')
      .select('id, number, lead_id, lead:leads(id, full_name, company_name)')
      .ilike('number', termLike)
      .limit(LIMIT_PER_TYPE)
    for (const sf of serviceFiles || []) {
      const id = sf.id as string
      const leadId = (sf as any).lead_id as string
      if (!id || seenKeys.has(`sf:${id}`)) continue
      const lead = (sf as any).lead
      const leadName = lead?.full_name || lead?.company_name || ''
      push({ type: 'service_file', id, title: `Fișă ${sf.number || id}`, subtitle: leadName ? `Client: ${leadName}` : undefined, openId: id, fallbackSlug: 'receptie', fallbackName: 'Recepție', leadId: leadId || id, matchedBy: 'number' })
    }
    if (leadIdsForSf.length > 0) {
      const { data: sfsByLead } = await supabase
        .from('service_files')
        .select('id, number, lead_id, lead:leads(id, full_name, company_name)')
        .in('lead_id', leadIdsForSf)
        .limit(LIMIT_PER_TYPE)
      for (const sf of sfsByLead || []) {
        const id = sf.id as string
        const leadId = (sf as any).lead_id as string
        if (!id || seenKeys.has(`sf:${id}`)) continue
        const lead = (sf as any).lead
        push({ type: 'service_file', id, title: `Fișă ${sf.number || id}`, subtitle: lead ? `Client: ${lead.full_name || lead.company_name || ''}` : undefined, openId: id, fallbackSlug: 'receptie', fallbackName: 'Recepție', leadId: leadId || id })
      }
      const { data: sfIdsRows } = await supabase.from('service_files').select('id').in('lead_id', leadIdsForSf)
      const sfIdsForTrays = (sfIdsRows || []).map((r: { id: string }) => r.id).filter(Boolean)
      if (sfIdsForTrays.length > 0) {
        const { data: traysByLead } = await supabase
          .from('trays')
          .select('id, number, service_file_id, service_file:service_files!inner(number, lead:leads!inner(id, full_name, company_name))')
          .in('service_file_id', sfIdsForTrays)
          .limit(LIMIT_TRAYS)
        for (const t of traysByLead || []) {
          const id = t.id as string
          const sf = (t as any).service_file
          const leadId = sf?.lead?.id as string
          if (!id || seenKeys.has(`tray:${id}`)) continue
          const lead = sf?.lead
          const leadName = lead?.full_name || lead?.company_name || ''
          const sfNum = sf?.number || ''
          const title = `Tăviță ${t.number || ''}`.trim() || `Tăviță ${id}`
          const subtitle = [leadName, sfNum].filter(Boolean).join(' · ')
          const sfId = (t as any).service_file_id as string | undefined
          push({ type: 'tray', id, title, subtitle: subtitle || undefined, openId: id, fallbackSlug: 'saloane', fallbackName: 'Saloane', leadId: leadId || id, serviceFileId: sfId })
        }
      }
    }

    // 5. Tăvițe după număr + serial (traySearchServer)
    const { data: trayResults } = await searchTraysGloballyWithClient(supabase, term)
    for (const t of trayResults || []) {
      const id = t.trayId
      if (!id || seenKeys.has(`tray:${id}`)) continue
      const matchBy: MatchedByType = t.matchType === 'serial_number' ? 'serial' : 'number'
      const subtitle = t.matchDetails ? [t.leadName, t.serviceFileNumber, t.matchDetails].filter(Boolean).join(' · ') : [t.leadName, t.serviceFileNumber].filter(Boolean).join(' · ')
      push({ type: 'tray', id, title: `Tăviță ${t.trayNumber}`, subtitle: subtitle || undefined, openId: id, fallbackSlug: 'saloane', fallbackName: 'Saloane', leadId: t.leadId, matchedBy, serviceFileId: t.serviceFileId })
    }

    // 6. REZOLVARE PIPELINE (tray, lead, service_file)
    const pipelineInfo = await resolvePipelineInfo(supabase, rawResults.map((r) => ({ type: r.type, id: r.id })))

    // 7. Pentru tăvițe: rezolvăm pipeline-ul FIȘEI de serviciu (unde se deschide – inclusiv Arhivare)
    const trayWithSf = rawResults.filter((r): r is RawSearchRow & { serviceFileId: string } => r.type === 'tray' && Boolean(r.serviceFileId))
    const pipelineInfoForServiceFile =
      trayWithSf.length > 0
        ? await resolvePipelineInfo(
            supabase,
            trayWithSf.map((r) => ({ type: 'service_file' as const, id: r.serviceFileId }))
          )
        : new Map<string, { slug: string; name: string; stageName?: string }>()

    const results: UnifiedSearchResult[] = rawResults.slice(0, LIMIT).map((r) => {
      const pi = pipelineInfo.get(r.id)
      const sfPipelineSlug = r.type === 'tray' && r.serviceFileId ? pipelineInfoForServiceFile.get(r.serviceFileId)?.slug : undefined
      return {
        type: r.type,
        id: r.id,
        title: r.title,
        subtitle: r.subtitle,
        pipelineSlug: pi?.slug || r.fallbackSlug,
        openId: r.openId,
        pipelineName: pi?.name || r.fallbackName,
        stageName: pi?.stageName,
        leadId: r.leadId,
        matchedBy: r.matchedBy,
        serviceFileId: r.serviceFileId,
        serviceFilePipelineSlug: sfPipelineSlug,
      }
    })
    return { data: results, error: null }
  } catch (err: any) {
    console.error('[searchViaDirectQueries]', err)
    return { data: [], error: err }
  }
}

// ═══════════════════════════════════════════════════════════════════
// FUNCȚIA PRINCIPALĂ EXPORTATĂ
// ═══════════════════════════════════════════════════════════════════

export async function searchUnifiedWithClient(
  supabase: SupabaseClient,
  query: string
): Promise<{ data: UnifiedSearchResult[]; error: any }> {
  const trimmed = query?.trim() ?? ''
  if (trimmed.length < 2) {
    return { data: [], error: null }
  }

  // lead-urile (inclusiv cele doar în Recepție, ex. „Emilia Marcu” în COLET AJUNS).
  const terms = trimmed.split(',').map((t) => t.trim()).filter(Boolean)
  if (terms.length >= 2) {
    const resultSets: UnifiedSearchResult[][] = []
    for (const term of terms) {
      const { data, error } = await searchViaDirectQueries(supabase, term)
      if (error) return { data: [], error }
      resultSets.push(data || [])
    }
    const leadIdsPerTerm = resultSets.map((set) => new Set(set.map((r) => r.leadId).filter(Boolean)))
    const commonLeadIds = leadIdsPerTerm.reduce((acc, set) => {
      if (acc.size === 0) return new Set(set)
      return new Set([...acc].filter((id) => set.has(id)))
    }, new Set<string>())
    if (commonLeadIds.size === 0) return { data: [], error: null }
    const combined = resultSets.flat()
    const seen = new Set<string>()
    const filtered: UnifiedSearchResult[] = []
    for (const r of combined) {
      const leadId = r.leadId ?? (r.type === 'lead' ? r.id : undefined)
      if (!leadId || !commonLeadIds.has(leadId)) continue
      const key = `${r.type}:${r.id}`
      if (seen.has(key)) continue
      seen.add(key)
      filtered.push(r)
    }
    return { data: filtered.slice(0, LIMIT), error: null }
  }

  const direct = await searchViaDirectQueries(supabase, trimmed)
  if (direct.error) {
    const rpcResult = await searchViaRPC(supabase, trimmed)
    if (rpcResult.rpcAvailable && !rpcResult.error) {
      return { data: rpcResult.data, error: null }
    }
    return direct
  }
  return direct
}
