/**
 * Căutare unificată pe server: lead-uri, fișe de serviciu, tăvițe.
 * 
 * Strategia:
 * 1. Încearcă RPC `search_unified` (un singur round-trip, cu indexuri GIN trigram).
 * 2. Dacă RPC-ul nu există (funcția nu a fost deploy-ată încă), fallback pe query-uri directe.
 * 
 * Pipeline slug-ul e determinat din pipeline_items (nu hardcodat).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { searchTraysGloballyWithClient } from './traySearchServer'
import { normalizePhoneNumber } from '@/lib/utils'

export type UnifiedSearchItemType = 'lead' | 'service_file' | 'tray'

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
}

const LIMIT = 25
const LIMIT_PER_TYPE = 15

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

async function searchViaDirectQueries(
  supabase: SupabaseClient,
  query: string
): Promise<{ data: UnifiedSearchResult[]; error: any }> {
  try {
    const term = query.trim()
    const termLike = `%${term}%`

    // Generăm variante de căutare pentru nume (ambele ordine)
    const nameSearchTerms = [termLike]
    const words = term.trim().split(/\s+/).filter((w) => w.length > 0)
    if (words.length >= 2) {
      // Inversează ordinea cuvintelor pentru căutare în ambele formate
      const reversed = [...words].reverse().join(' ')
      nameSearchTerms.push(`%${reversed}%`)
    }
    const nameOrFilters = nameSearchTerms.map((t) => `full_name.ilike.${t}`).join(',')

    const rawResults: Array<{
      type: UnifiedSearchItemType
      id: string
      title: string
      subtitle?: string
      openId: string
      fallbackSlug: string
      fallbackName: string
    }> = []
    const seenKeys = new Set<string>()

    // 1. LEADS: text match (toate lead-urile care conțin termenul, indiferent de pipeline)
    const { data: leads } = await supabase
      .from('leads')
      .select('id, full_name, company_name, phone_number, email')
      .or(`${nameOrFilters},company_name.ilike.${termLike},phone_number.ilike.${termLike},email.ilike.${termLike}`)
      .order('full_name', { ascending: true, nullsFirst: false })
      .limit(LIMIT_PER_TYPE)

    // 1b. LEADS: telefon normalizat (0773739114 ↔ +40773739114) – variante pentru potrivire 0 vs +40
    const digitsOnly = normalizePhoneNumber(term)
    let phoneLeads: typeof leads = []
    if (digitsOnly.length >= 3) {
      const patterns: string[] = []
      patterns.push(digitsOnly)
      if (digitsOnly.startsWith('0') && digitsOnly.length >= 10) {
        patterns.push('4' + digitsOnly)
        patterns.push(digitsOnly.slice(1))
      }
      if (digitsOnly.startsWith('40') && digitsOnly.length > 2) {
        patterns.push('0' + digitsOnly.slice(2))
      }
      const seenPhoneIds = new Set<string>()
      for (const p of patterns) {
        const pattern = `%${p}%`
        const { data: chunk } = await supabase
          .from('leads')
          .select('id, full_name, company_name, phone_number, email')
          .ilike('phone_number', pattern)
          .order('full_name', { ascending: true, nullsFirst: false })
          .limit(LIMIT_PER_TYPE)
        for (const row of chunk || []) {
          const id = row?.id as string
          if (id && !seenPhoneIds.has(id)) {
            seenPhoneIds.add(id)
            phoneLeads = [...(phoneLeads || []), row]
          }
        }
        if ((phoneLeads?.length ?? 0) >= LIMIT_PER_TYPE) break
      }
    }

    // 1c. ID-uri lead-uri găsite (nume, companie, telefon) – pentru fișe și tăvițe asociate
    const allMatchedLeadIds = new Set<string>()
    for (const l of [...(leads || []), ...(phoneLeads || [])]) {
      const id = l?.id as string
      if (id) allMatchedLeadIds.add(id)
    }
    const leadIdsForSf = Array.from(allMatchedLeadIds)

    for (const l of [...(leads || []), ...(phoneLeads || [])]) {
      const id = l.id as string
      if (!id || seenKeys.has(`lead:${id}`)) continue
      seenKeys.add(`lead:${id}`)
      const title = ((l.full_name || l.company_name || '') as string).trim() || 'Fără nume'
      const subtitle = [l.company_name, l.phone_number, l.email].filter(Boolean).join(' · ')
      rawResults.push({ type: 'lead', id, title, subtitle: subtitle || undefined, openId: id, fallbackSlug: 'vanzari', fallbackName: 'Vânzări' })
    }

    // 2. FIȘE DE SERVICIU
    const { data: serviceFiles } = await supabase
      .from('service_files')
      .select('id, number, lead:leads(id, full_name, company_name)')
      .ilike('number', termLike)
      .limit(LIMIT_PER_TYPE)

    for (const sf of serviceFiles || []) {
      const id = sf.id as string
      if (!id || seenKeys.has(`sf:${id}`)) continue
      seenKeys.add(`sf:${id}`)
      const lead = (sf as any).lead
      const leadName = lead?.full_name || lead?.company_name || ''
      rawResults.push({ type: 'service_file', id, title: `Fișă ${sf.number || id}`, subtitle: leadName ? `Client: ${leadName}` : undefined, openId: id, fallbackSlug: 'receptie', fallbackName: 'Recepție' })
    }

    if (leadIdsForSf.length > 0) {
      const { data: sfsByLead } = await supabase
        .from('service_files')
        .select('id, number, lead:leads(id, full_name, company_name)')
        .in('lead_id', leadIdsForSf)
        .limit(LIMIT_PER_TYPE)
      for (const sf of sfsByLead || []) {
        const id = sf.id as string
        if (!id || seenKeys.has(`sf:${id}`)) continue
        seenKeys.add(`sf:${id}`)
        const lead = (sf as any).lead
        rawResults.push({ type: 'service_file', id, title: `Fișă ${sf.number || id}`, subtitle: lead ? `Client: ${lead.full_name || lead.company_name || ''}` : undefined, openId: id, fallbackSlug: 'receptie', fallbackName: 'Recepție' })
      }

      // Tăvițe ale lead-urilor găsite (fișă + tăvițe afișate la căutare)
      const { data: sfIdsRows } = await supabase
        .from('service_files')
        .select('id')
        .in('lead_id', leadIdsForSf)
      const sfIdsForTrays = (sfIdsRows || []).map((r: { id: string }) => r.id).filter(Boolean)
      if (sfIdsForTrays.length > 0) {
        const { data: traysByLead } = await supabase
          .from('trays')
          .select(`
            id,
            number,
            service_file:service_files!inner(number, lead:leads!inner(full_name, company_name))
          `)
          .in('service_file_id', sfIdsForTrays)
          .limit(LIMIT_PER_TYPE)
        for (const t of traysByLead || []) {
          const id = t.id as string
          if (!id || seenKeys.has(`tray:${id}`)) continue
          seenKeys.add(`tray:${id}`)
          const sf = (t as any).service_file
          const lead = sf?.lead
          const leadName = lead?.full_name || lead?.company_name || ''
          const sfNum = sf?.number || ''
          const title = `Tăviță ${t.number || ''}`.trim() || `Tăviță ${id}`
          const subtitle = [leadName, sfNum].filter(Boolean).join(' · ')
          rawResults.push({ type: 'tray', id, title, subtitle: subtitle || undefined, openId: id, fallbackSlug: 'saloane', fallbackName: 'Saloane' })
        }
      }
    }

    // 3. TĂVIȚE (după număr/dimensiune – se adaugă la cele de mai sus)
    const { data: trayResults } = await searchTraysGloballyWithClient(supabase, term)
    for (const t of trayResults || []) {
      const id = t.trayId
      if (!id || seenKeys.has(`tray:${id}`)) continue
      seenKeys.add(`tray:${id}`)
      const title = `Tăviță ${t.trayNumber}`
      const subtitle = [t.leadName, t.serviceFileNumber].filter(Boolean).join(' · ')
      rawResults.push({ type: 'tray', id, title, subtitle: subtitle || undefined, openId: id, fallbackSlug: 'saloane', fallbackName: 'Saloane' })
    }

    // 4. REZOLVARE PIPELINE
    const pipelineInfo = await resolvePipelineInfo(
      supabase,
      rawResults.map((r) => ({ type: r.type, id: r.id }))
    )

    // 5. CONSTRUCȚIE REZULTATE FINALE (limităm la LIMIT pentru UI)
    const results: UnifiedSearchResult[] = rawResults
      .map((r) => {
        const pi = pipelineInfo.get(r.id)
        return {
          type: r.type,
          id: r.id,
          title: r.title,
          subtitle: r.subtitle,
          pipelineSlug: pi?.slug || r.fallbackSlug,
          openId: r.openId,
          pipelineName: pi?.name || r.fallbackName,
          stageName: pi?.stageName,
        }
      })
      .slice(0, LIMIT)

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
  if (!query || query.trim().length < 2) {
    return { data: [], error: null }
  }

  // Folosim mereu query-urile directe pe leads/service_files/trays, ca să găsim toate
  // lead-urile (inclusiv cele doar în Recepție, ex. „Emilia Marcu” în COLET AJUNS).
  // RPC search_unified poate filtra după pipeline și exclude unele rezultate.
  const direct = await searchViaDirectQueries(supabase, query)
  if (direct.error) {
    // Dacă direct query dă eroare, încercăm RPC ca fallback
    const rpcResult = await searchViaRPC(supabase, query)
    if (rpcResult.rpcAvailable && !rpcResult.error) {
      return { data: rpcResult.data, error: null }
    }
    return direct
  }
  return direct
}
