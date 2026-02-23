'use client'

import { supabaseBrowser } from './supabaseClient'
import { fetchStagesForPipeline } from './kanban/fetchers'
import { matchesStagePattern } from './kanban/constants'
import { getLeadDisplayName } from '@/lib/utils/leadDisplay'

const supabase = supabaseBrowser()

function norm(s: string): string {
  return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim()
}

export type ApeluriByType = {
  comanda: number
  noDeal: number
  callback: number
  nuRaspunde: number
}

function stageNameToApelType(name: string): keyof ApeluriByType | null {
  const n = norm(name)
  if (n.includes('avem') && n.includes('comanda')) return 'comanda'
  // Curier Trimis și Office Direct = Comenzi (livrări atribuite utilizatorului)
  if ((n.includes('curier') && n.includes('trimis')) || (n.includes('office') && n.includes('direct'))) return 'comanda'
  if (n.includes('no') && n.includes('deal')) return 'noDeal'
  if (n.includes('callback') || n.includes('call back')) return 'callback'
  if (n.includes('nu') && n.includes('raspunde')) return 'nuRaspunde'
  return null
}

function emptyByType(): ApeluriByType {
  return { comanda: 0, noDeal: 0, callback: 0, nuRaspunde: 0 }
}

async function getStageIdToTypeMapUncached(pipelineId: string): Promise<Map<string, keyof ApeluriByType>> {
  const { data: stages, error } = await fetchStagesForPipeline(pipelineId)
  const map = new Map<string, keyof ApeluriByType>()
  if (error || !stages?.length) return map
  for (const s of stages) {
    const t = stageNameToApelType(s.name || '')
    if (t) map.set(s.id, t)
  }
  return map
}

function getStageIdToTypeMap(pipelineId: string): Promise<Map<string, keyof ApeluriByType>> {
  const now = Date.now()
  const cached = stageMapCache.get(pipelineId)
  if (cached && now - cached.ts < CACHE_TTL_MS) return Promise.resolve(cached.map)
  let promise = stageMapPromises.get(pipelineId)
  if (promise) return promise
  promise = getStageIdToTypeMapUncached(pipelineId).then((map) => {
    stageMapCache.set(pipelineId, { map, ts: Date.now() })
    stageMapPromises.delete(pipelineId)
    return map
  })
  stageMapPromises.set(pipelineId, promise)
  return promise
}

// Cache pipeline ID și stage map – TTL 5 min, single-flight (plan-optimizare-vanzari-calluri.md)
const CACHE_TTL_MS = 5 * 60 * 1000
let vanzariPipelineIdCache: { id: string | null; ts: number } | null = null
let vanzariPipelineIdPromise: Promise<string | null> | null = null
const stageMapCache = new Map<string, { map: Map<string, keyof ApeluriByType>; ts: number }>()
const stageMapPromises = new Map<string, Promise<Map<string, keyof ApeluriByType>>>()

export function invalidateVanzariCache(): void {
  vanzariPipelineIdCache = null
  vanzariPipelineIdPromise = null
  stageMapCache.clear()
  stageMapPromises.clear()
}

function matchesLeads(n: string): boolean {
  return n === 'leads' || (n.includes('lead') && !n.includes('callback'))
}

function matchesApelatTo(n: string): boolean {
  return (
    n.includes('callback') ||
    n.includes('call back') ||
    (n.includes('no') && n.includes('deal')) ||
    (n.includes('avem') && n.includes('comanda')) ||
    (n.includes('nu') && n.includes('raspunde')) ||
    (n.includes('curier') && n.includes('trimis')) ||
    (n.includes('office') && n.includes('direct'))
  )
}

/** Stage-uri „plasare” în pipeline Vânzări: Curier trimis, Office direct (se numără la Sunați chiar dacă mutarea nu e din Leads). */
function matchesCurierOrOfficeDirect(n: string): boolean {
  return (n.includes('curier') && n.includes('trimis')) || (n.includes('office') && n.includes('direct'))
}

/**
 * Verifică dacă mutarea from → to trebuie înregistrată ca apel:
 * - mutare din Leads în Callback / No deal / Avem comanda / Nu răspunde, sau
 * - mutare în Curier trimis sau Office direct (din orice stage), plasare de user în ziua curentă.
 */
export function isApelMove(fromStageName: string, toStageName: string): boolean {
  const from = norm(fromStageName)
  const to = norm(toStageName)
  if (matchesCurierOrOfficeDirect(to)) return true
  return matchesLeads(from) && matchesApelatTo(to)
}

export type RecordVanzariApelParams = {
  lead_id: string
  pipeline_id: string
  from_stage_id: string | null
  to_stage_id: string
  moved_by?: string | null
}

/** O înregistrare din istoricul de stage al unui lead în pipeline Vânzări (din vanzari_apeluri). */
export type LeadStageHistoryEntry = {
  id: string
  lead_id: string
  pipeline_id: string
  from_stage_id: string | null
  to_stage_id: string
  moved_by: string | null
  apel_at: string
  from_stage_name?: string | null
  to_stage_name?: string | null
}

/**
 * Istoricul mutărilor unui lead în pipeline-ul Vânzări (ce stage-uri a avut, când, de la cine).
 * Sursa: tabelul vanzari_apeluri.
 */
export async function getLeadStageHistoryInVanzari(
  leadId: string,
  options?: { pipelineId?: string | null; limit?: number }
): Promise<{ data: LeadStageHistoryEntry[]; error: any }> {
  try {
    const pid = options?.pipelineId ?? (await getVanzariPipelineId())
    if (!pid) return { data: [], error: null }
    let q = (supabase as any)
      .from('vanzari_apeluri')
      .select('id, lead_id, pipeline_id, from_stage_id, to_stage_id, moved_by, apel_at')
      .eq('lead_id', leadId)
      .eq('pipeline_id', pid)
      .order('apel_at', { ascending: false })
      .limit(Math.min(options?.limit ?? 200, 500))
    const { data: rows, error } = await q
    if (error) return { data: [], error }
    if (!rows?.length) return { data: [], error: null }
    const stageIds = new Set<string>()
    for (const r of rows as any[]) {
      if (r.from_stage_id) stageIds.add(r.from_stage_id)
      if (r.to_stage_id) stageIds.add(r.to_stage_id)
    }
    const { data: stages } = await (supabase as any)
      .from('stages')
      .select('id, name')
      .in('id', [...stageIds])
    const nameById = new Map<string, string>()
    for (const s of stages || []) {
      if ((s as any).id) nameById.set((s as any).id, (s as any).name ?? '')
    }
    const data: LeadStageHistoryEntry[] = (rows as any[]).map((r) => ({
      id: r.id,
      lead_id: r.lead_id,
      pipeline_id: r.pipeline_id,
      from_stage_id: r.from_stage_id ?? null,
      to_stage_id: r.to_stage_id,
      moved_by: r.moved_by ?? null,
      apel_at: r.apel_at,
      from_stage_name: r.from_stage_id ? nameById.get(r.from_stage_id) ?? null : null,
      to_stage_name: r.to_stage_id ? nameById.get(r.to_stage_id) ?? null : null,
    }))
    return { data, error: null }
  } catch (e: any) {
    return { data: [], error: e }
  }
}

const DEDUP_WINDOW_MS = 2 * 60 * 1000 // 2 minute

/**
 * Înregistrează un apel în vanzari_apeluri. Apelat când un lead e mutat din Leads
 * în Callback / No deal / Avem comanda / Nu răspunde (pipeline Vânzări).
 * Dedup: evită doar duplicate identice (același lead mutat în același stage în 2 min).
 * Mutări diferite (ex: Leads→Callback apoi Callback→Curier Trimis) se înregistrează ambele.
 */
export async function recordVanzariApel(params: RecordVanzariApelParams): Promise<{ error: any }> {
  try {
    const since = new Date(Date.now() - DEDUP_WINDOW_MS).toISOString()
    const { data: existing, error: checkErr } = await (supabase as any)
      .from('vanzari_apeluri')
      .select('id')
      .eq('lead_id', params.lead_id)
      .eq('pipeline_id', params.pipeline_id)
      .eq('to_stage_id', params.to_stage_id)
      .gte('apel_at', since)
      .limit(1)
    if (checkErr) return { error: checkErr }
    if (existing?.length) return { error: null }

    const { error } = await (supabase as any)
      .from('vanzari_apeluri')
      .insert({
        lead_id: params.lead_id,
        pipeline_id: params.pipeline_id,
        from_stage_id: params.from_stage_id,
        to_stage_id: params.to_stage_id,
        moved_by: params.moved_by ?? null,
        apel_at: new Date().toISOString(),
      })
    return { error }
  } catch (e: any) {
    return { error: e }
  }
}

/**
 * Variantă care primește numele stage-ului (ex: 'Curier Trimis', 'Office Direct').
 * Utilitar pentru lead-card când nu avem stage ID la îndemână.
 */
export async function recordVanzariApelForDeliveryByStageName(
  leadId: string,
  stageName: 'Curier Trimis' | 'Office Direct',
  movedByUserId: string | null
): Promise<{ error: any }> {
  const pid = await getVanzariPipelineId()
  if (!pid) return { error: new Error('Pipeline Vânzări nu a fost găsit') }
  const { data: stages } = await (supabase as any)
    .from('stages')
    .select('id, name')
    .eq('pipeline_id', pid)
    .is('is_active', true)
  const stage = (stages || []).find((s: { name?: string }) => {
    const sn = (s.name || '').toLowerCase()
    if (stageName === 'Curier Trimis') return sn.includes('curier') && sn.includes('trimis')
    return sn.includes('office') && sn.includes('direct')
  })
  if (!stage?.id) return { error: new Error(`Stage ${stageName} nu a fost găsit`) }
  return recordVanzariApelForDelivery(leadId, stage.id, movedByUserId)
}

/**
 * Înregistrează un apel „Comandă” când utilizatorul setează Curier Trimis sau Office Direct
 * din overlay (nu din drag). Mutarea se face prin RPC, deci recordVanzariApel nu e apelat automat.
 * Apelat din setLeadCurierTrimis / setLeadOfficeDirect ÎNAINTE de moveItemToStage.
 */
export async function recordVanzariApelForDelivery(
  leadId: string,
  toStageId: string,
  movedByUserId: string | null
): Promise<{ error: any }> {
  try {
    const { data: stageRow, error: stageErr } = await (supabase as any)
      .from('stages')
      .select('pipeline_id')
      .eq('id', toStageId)
      .maybeSingle()
    if (stageErr || !stageRow?.pipeline_id) return { error: stageErr ?? new Error('Stage not found') }
    const pipelineId = stageRow.pipeline_id

    let fromStageId: string | null = null
    const { data: piRows } = await (supabase as any)
      .from('pipeline_items')
      .select('stage_id')
      .eq('pipeline_id', pipelineId)
      .eq('item_id', leadId)
      .limit(1)
    if (piRows?.length && (piRows[0] as any).stage_id) {
      fromStageId = (piRows[0] as any).stage_id
    }

    return recordVanzariApel({
      lead_id: leadId,
      pipeline_id: pipelineId,
      from_stage_id: fromStageId ?? null,
      to_stage_id: toStageId,
      moved_by: movedByUserId ?? null,
    })
  } catch (e: any) {
    return { error: e }
  }
}

async function getVanzariPipelineIdUncached(): Promise<string | null> {
  const { data, error } = await (supabase as any)
    .from('pipelines')
    .select('id')
    .ilike('name', '%vanzari%')
    .limit(1)
    .maybeSingle()
  if (error || !data) return null
  return (data as any).id
}

function getVanzariPipelineId(): Promise<string | null> {
  const now = Date.now()
  if (vanzariPipelineIdCache && now - vanzariPipelineIdCache.ts < CACHE_TTL_MS) {
    return Promise.resolve(vanzariPipelineIdCache.id)
  }
  if (vanzariPipelineIdPromise) return vanzariPipelineIdPromise
  vanzariPipelineIdPromise = getVanzariPipelineIdUncached().then((id) => {
    vanzariPipelineIdCache = { id, ts: Date.now() }
    vanzariPipelineIdPromise = null
    return id
  })
  return vanzariPipelineIdPromise
}

function dayBounds(): { start: Date; end: Date } {
  const end = new Date()
  end.setHours(23, 59, 59, 999)
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  return { start, end }
}

function weekBounds(): { start: Date; end: Date } {
  const end = new Date()
  end.setHours(23, 59, 59, 999)
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  const d = start.getDay()
  const diff = start.getDate() - d + (d === 0 ? -6 : 1)
  start.setDate(diff)
  return { start, end }
}

function monthBounds(): { start: Date; end: Date } {
  const end = new Date()
  end.setHours(23, 59, 59, 999)
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  start.setDate(1)
  return { start, end }
}

function monthBoundsFor(year: number, month: number): { start: Date; end: Date } {
  const start = new Date(year, month - 1, 1, 0, 0, 0, 0)
  const end = new Date(year, month, 0, 23, 59, 59, 999)
  return { start, end }
}

function dayBoundsFor(date: Date): { start: Date; end: Date } {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  const start = d
  const end = new Date(d)
  end.setHours(23, 59, 59, 999)
  return { start, end }
}

export type LeadCreatedItem = {
  id: string
  lead_name: string | null
  email: string | null
  phone: string | null
  company_name: string | null
  contact_person: string | null
  billing_nume_prenume: string | null
  created_at: string
  created_by: string | null
  created_by_name: string | null
  claimed_by: string | null
  claimed_by_name: string | null
  curier_trimis_at: string | null
  office_direct_at: string | null
  fise_count: number
}

/**
 * Lead-uri create în intervalul de dată (created_at).
 * Returnează lista cu nume, contact, claimed_by și număr fișe.
 * @param date - pentru o singură zi; sau folosește fetchLeadsCreatedForDateRange pentru interval
 */
export async function fetchLeadsCreatedForDate(
  date: Date
): Promise<LeadCreatedItem[]> {
  const { start, end } = dayBoundsFor(date)
  return fetchLeadsCreatedForDateRange(start, end)
}

/**
 * Lead-uri create în intervalul [start, end] (created_at), doar din alte surse (nu de utilizatori CRM).
 * Filtru: created_by IS NULL = creat prin import, API, formular, Facebook etc.
 */
export async function fetchLeadsCreatedForDateRange(
  start: Date,
  end: Date
): Promise<LeadCreatedItem[]> {
  const { data: leads, error } = await (supabase as any)
    .from('leads')
    .select('id, full_name, details, contact_person, company_name, email, phone_number, billing_nume_prenume, created_at, created_by, claimed_by, curier_trimis_user_id, office_direct_user_id, curier_trimis_at, office_direct_at')
    .gte('created_at', start.toISOString())
    .lte('created_at', end.toISOString())
    .is('created_by', null)
    .order('created_at', { ascending: false })
    .limit(500)
  if (error || !leads?.length) return []
  const leadIds = (leads as any[]).map((l) => l.id)

  // Vânzător din vanzari_apeluri (moved_by) când claimed_by/curier/office lipsește
  const pid = await getVanzariPipelineId()
  const movedByByLead = new Map<string, string>()
  if (pid && leadIds.length > 0) {
    const { data: apeluri } = await (supabase as any)
      .from('vanzari_apeluri')
      .select('lead_id, moved_by, apel_at')
      .eq('pipeline_id', pid)
      .in('lead_id', leadIds)
      .not('moved_by', 'is', null)
      .order('apel_at', { ascending: true })
    for (const a of apeluri || []) {
      const lid = (a as any).lead_id
      const mb = (a as any).moved_by
      if (lid && mb && !movedByByLead.has(lid)) movedByByLead.set(lid, mb)
    }
  }

  const { data: sfCount } = await (supabase as any)
    .from('service_files')
    .select('lead_id')
    .in('lead_id', leadIds)
  const fiseByLead = new Map<string, number>()
  for (const r of sfCount || []) {
    const lid = (r as any).lead_id
    if (lid) fiseByLead.set(lid, (fiseByLead.get(lid) ?? 0) + 1)
  }
  const allUserIds = new Set<string>()
  for (const l of leads as any[]) {
    if (l.created_by) allUserIds.add(l.created_by)
    if (l.claimed_by) allUserIds.add(l.claimed_by)
    if (l.curier_trimis_user_id) allUserIds.add(l.curier_trimis_user_id)
    if (l.office_direct_user_id) allUserIds.add(l.office_direct_user_id)
  }
  for (const uid of movedByByLead.values()) allUserIds.add(uid)
  const nameById = new Map<string, string>()
  if (allUserIds.size > 0) {
    const { data: members } = await (supabase as any)
      .from('app_members')
      .select('user_id, name')
      .in('user_id', [...allUserIds])
    for (const m of members || []) {
      nameById.set((m as any).user_id, (m as any).name || (m as any).user_id)
    }
  }
  return (leads as any[]).map((l) => {
    const displayName = getLeadDisplayName(l.full_name, l.details, undefined)
    let leadName = displayName && displayName !== 'Unknown' ? displayName : null
    if (!leadName && l.contact_person?.trim()) leadName = String(l.contact_person).trim()
    if (!leadName && l.billing_nume_prenume?.trim()) leadName = String(l.billing_nume_prenume).trim()
    if (!leadName && l.company_name?.trim()) leadName = String(l.company_name).trim()
    if (!leadName && l.email?.trim() && String(l.email).includes('@')) leadName = String(l.email).trim()
    if (!leadName && l.phone_number?.trim().length >= 6) leadName = String(l.phone_number).trim()
    const sellerId = l.claimed_by ?? l.curier_trimis_user_id ?? l.office_direct_user_id ?? movedByByLead.get(l.id) ?? null
    const sellerName = sellerId ? (nameById.get(sellerId) ?? null) : null
    const creatorName = l.created_by ? (nameById.get(l.created_by) ?? null) : null
    return {
      id: l.id,
      lead_name: leadName,
      email: l.email ?? null,
      phone: l.phone_number ?? null,
      company_name: l.company_name ?? null,
      contact_person: l.contact_person ?? null,
      billing_nume_prenume: l.billing_nume_prenume ?? null,
      created_at: l.created_at,
      created_by: l.created_by ?? null,
      created_by_name: creatorName,
      claimed_by: sellerId,
      claimed_by_name: sellerName,
      curier_trimis_at: l.curier_trimis_at ?? null,
      office_direct_at: l.office_direct_at ?? null,
      fise_count: fiseByLead.get(l.id) ?? 0,
    }
  })
}

async function countApeluri(pipelineId: string, start: Date, end: Date): Promise<number> {
  const { count, error } = await (supabase as any)
    .from('vanzari_apeluri')
    .select('*', { count: 'exact', head: true })
    .eq('pipeline_id', pipelineId)
    .gte('apel_at', start.toISOString())
    .lte('apel_at', end.toISOString())
  if (error) return 0
  return count ?? 0
}

async function fetchApeluriRows(
  pipelineId: string,
  start: Date,
  end: Date,
  movedBy?: string | null
): Promise<Array<{ to_stage_id: string; lead_id?: string }>> {
  let q = (supabase as any)
    .from('vanzari_apeluri')
    .select('to_stage_id, lead_id')
    .eq('pipeline_id', pipelineId)
    .gte('apel_at', start.toISOString())
    .lte('apel_at', end.toISOString())
  if (movedBy) q = q.eq('moved_by', movedBy)
  const { data, error } = await q
  if (error) return []
  return (data || []) as Array<{ to_stage_id: string; lead_id?: string }>
}

/** Rânduri apeluri cu apel_at pentru sortare (ultimul apel per lead). */
async function fetchApeluriRowsWithTime(
  pipelineId: string,
  start: Date,
  end: Date,
  movedBy?: string | null
): Promise<Array<{ to_stage_id: string; lead_id?: string; apel_at: string }>> {
  let q = (supabase as any)
    .from('vanzari_apeluri')
    .select('to_stage_id, lead_id, apel_at')
    .eq('pipeline_id', pipelineId)
    .gte('apel_at', start.toISOString())
    .lte('apel_at', end.toISOString())
  if (movedBy) q = q.eq('moved_by', movedBy)
  const { data, error } = await q
  if (error) return []
  return (data || []) as Array<{ to_stage_id: string; lead_id?: string; apel_at: string }>
}

export type LeadByTypeItem = {
  lead_id: string
  lead_name: string | null
  /** Pentru comenzi: livrare prin Curier trimis sau Office direct */
  livrare?: 'curier_trimis' | 'office_direct'
  /** Număr fișe de serviciu create pentru acest lead */
  fise_count?: number
  /** Date contact pentru afișare detalii */
  email?: string | null
  phone?: string | null
  company_name?: string | null
  contact_person?: string | null
  billing_nume_prenume?: string | null
}

export type LeadsByTypeForUser = {
  comanda: LeadByTypeItem[]
  noDeal: LeadByTypeItem[]
  callback: LeadByTypeItem[]
  nuRaspunde: LeadByTypeItem[]
}

/**
 * Lead-uri prelucrate de un vânzător în interval, grupate pe tip (Comandă, No Deal, Callback, Nu Răspunde).
 * Pentru fiecare lead se ia ultima mutare (apel_at) ca tip final.
 * Include și comenzi din leads (curier_trimis_user_id, office_direct_user_id, claimed_by).
 */
export async function fetchLeadsByTypeForUser(
  userId: string,
  start: Date,
  end: Date
): Promise<LeadsByTypeForUser> {
  const empty: LeadsByTypeForUser = {
    comanda: [],
    noDeal: [],
    callback: [],
    nuRaspunde: [],
  }
  const pid = await getVanzariPipelineId()
  if (!pid) return empty
  const stageIdToType = await getStageIdToTypeMap(pid)
  const rows = await fetchApeluriRowsWithTime(pid, start, end, userId)

  // Pentru fiecare lead_id, păstrăm doar ultima mutare (apel_at desc)
  const latestByLead = new Map<string, { to_stage_id: string; apel_at: string }>()
  for (const r of rows) {
    if (!r.lead_id) continue
    const existing = latestByLead.get(r.lead_id)
    if (!existing || r.apel_at > existing.apel_at) {
      latestByLead.set(r.lead_id, { to_stage_id: r.to_stage_id, apel_at: r.apel_at })
    }
  }

  // Comenzi: include și lead-uri din leads (curier/office/claimed)
  const comandaLeadIds = new Set<string>()
  for (const [leadId, { to_stage_id }] of latestByLead) {
    const t = stageIdToType.get(to_stage_id)
    if (t === 'comanda') comandaLeadIds.add(leadId)
  }
  const fromLeads = await fetchComandaLeadIdsFromLeads(userId, start, end)
  for (const id of fromLeads) comandaLeadIds.add(id)

  const noDealIds = new Set<string>()
  const callbackIds = new Set<string>()
  const nuRaspundeIds = new Set<string>()
  for (const [leadId, { to_stage_id }] of latestByLead) {
    const t = stageIdToType.get(to_stage_id)
    if (t === 'noDeal') noDealIds.add(leadId)
    else if (t === 'callback') callbackIds.add(leadId)
    else if (t === 'nuRaspunde') nuRaspundeIds.add(leadId)
  }

  const allIds = [...comandaLeadIds, ...noDealIds, ...callbackIds, ...nuRaspundeIds]
  const uniqueIds = [...new Set(allIds)]
  if (!uniqueIds.length) return empty

  // 0. Număr fișe de serviciu per lead
  const fiseCountByLeadId = new Map<string, number>()
  const { data: sfCountRows } = await (supabase as any)
    .from('service_files')
    .select('lead_id')
    .in('lead_id', uniqueIds)
  for (const r of sfCountRows || []) {
    const lid = (r as any).lead_id
    if (lid) fiseCountByLeadId.set(lid, (fiseCountByLeadId.get(lid) ?? 0) + 1)
  }

  // 1. Încearcă direct din leads (când vanzari_apeluri.lead_id = lead id)
  const { data: leadsData, error: leadsErr } = await (supabase as any)
    .from('leads')
    .select('id, full_name, details, contact_person, company_name, email, phone_number, billing_nume_prenume, curier_trimis_at, office_direct_at')
    .in('id', uniqueIds)
  if (leadsErr) {
    console.warn('[fetchLeadsByTypeForUser] Eroare leads:', leadsErr)
  }
  const nameById = new Map<string, string | null>()
  const livrareByLeadId = new Map<string, 'curier_trimis' | 'office_direct'>()
  const leadDetailsById = new Map<string, { email?: string | null; phone?: string | null; company_name?: string | null; contact_person?: string | null; billing_nume_prenume?: string | null }>()
  for (const l of leadsData || []) {
    const lid = (l as any).id
    const ct = (l as any).curier_trimis_at
    const od = (l as any).office_direct_at
    if (ct) livrareByLeadId.set(lid, 'curier_trimis')
    else if (od) livrareByLeadId.set(lid, 'office_direct')
    const fullName = (l as any).full_name ?? null
    const details = (l as any).details ?? null
    const contactPerson = (l as any).contact_person ?? null
    const companyName = (l as any).company_name ?? null
    const email = (l as any).email ?? null
    const phone = (l as any).phone_number ?? null
    const billingNume = (l as any).billing_nume_prenume ?? null
    let displayName = getLeadDisplayName(fullName, details, undefined)
    if ((!displayName || displayName === 'Unknown') && contactPerson && String(contactPerson).trim()) {
      displayName = String(contactPerson).trim()
    }
    if ((!displayName || displayName === 'Unknown') && billingNume && String(billingNume).trim()) {
      displayName = String(billingNume).trim()
    }
    if ((!displayName || displayName === 'Unknown') && companyName && String(companyName).trim()) {
      displayName = String(companyName).trim()
    }
    if ((!displayName || displayName === 'Unknown') && email && String(email).trim()) {
      const e = String(email).trim()
      if (e.length > 0 && e.includes('@')) displayName = e
    }
    if ((!displayName || displayName === 'Unknown') && phone && String(phone).trim()) {
      const p = String(phone).trim()
      if (p.length >= 6) displayName = p
    }
    const finalName = displayName && displayName !== 'Unknown' ? displayName : null
    nameById.set((l as any).id, finalName)
    leadDetailsById.set((l as any).id, {
      email: (l as any).email ?? null,
      phone: (l as any).phone_number ?? null,
      company_name: (l as any).company_name ?? null,
      contact_person: (l as any).contact_person ?? null,
      billing_nume_prenume: (l as any).billing_nume_prenume ?? null,
    })
  }

  // 2. Pentru ID-uri fără nume: rezolvă service_file/tray → lead (când vanzari_apeluri stochează item_id)
  const idsWithoutName = uniqueIds.filter((id) => !nameById.has(id))
  if (idsWithoutName.length > 0) {
    const { data: sfRows } = await (supabase as any)
      .from('service_files')
      .select('id, lead_id')
      .in('id', idsWithoutName)
    const resolvedLeadIds = new Set<string>()
    const itemToLead = new Map<string, string>()
    for (const r of sfRows || []) {
      if ((r as any).lead_id) {
        itemToLead.set((r as any).id, (r as any).lead_id)
        resolvedLeadIds.add((r as any).lead_id)
      }
    }
    const stillMissing = idsWithoutName.filter((id) => !itemToLead.has(id))
    if (stillMissing.length > 0) {
      const { data: trayRows } = await (supabase as any)
        .from('trays')
        .select('id, service_file_id')
        .in('id', stillMissing)
      const sfIds = [...new Set((trayRows || []).map((r: any) => r.service_file_id).filter(Boolean))]
      if (sfIds.length > 0) {
        const { data: sf2 } = await (supabase as any)
          .from('service_files')
          .select('id, lead_id')
          .in('id', sfIds)
        const sfToLead = new Map<string, string>()
        for (const x of sf2 || []) {
          if ((x as any).lead_id) sfToLead.set((x as any).id, (x as any).lead_id)
        }
        for (const r of trayRows || []) {
          const leadId = sfToLead.get((r as any).service_file_id)
          if (leadId) {
            itemToLead.set((r as any).id, leadId)
            resolvedLeadIds.add(leadId)
          }
        }
      }
    }
    if (resolvedLeadIds.size > 0) {
      const { data: leads2 } = await (supabase as any)
        .from('leads')
        .select('id, full_name, details, contact_person, company_name, email, phone_number, billing_nume_prenume, curier_trimis_at, office_direct_at')
        .in('id', [...resolvedLeadIds])
      for (const l of leads2 || []) {
        const lid = (l as any).id
        const ct = (l as any).curier_trimis_at
        const od = (l as any).office_direct_at
        if (ct) livrareByLeadId.set(lid, 'curier_trimis')
        else if (od) livrareByLeadId.set(lid, 'office_direct')
        const fullName = (l as any).full_name ?? null
        const details = (l as any).details ?? null
        const contactPerson = (l as any).contact_person ?? null
        const companyName = (l as any).company_name ?? null
        const email = (l as any).email ?? null
        const phone = (l as any).phone_number ?? null
        const billingNume = (l as any).billing_nume_prenume ?? null
        let displayName = getLeadDisplayName(fullName, details, undefined)
        if ((!displayName || displayName === 'Unknown') && contactPerson && String(contactPerson).trim()) displayName = String(contactPerson).trim()
        if ((!displayName || displayName === 'Unknown') && billingNume && String(billingNume).trim()) displayName = String(billingNume).trim()
        if ((!displayName || displayName === 'Unknown') && companyName && String(companyName).trim()) displayName = String(companyName).trim()
        if ((!displayName || displayName === 'Unknown') && email && String(email).trim() && (email as string).includes('@')) displayName = String(email).trim()
        if ((!displayName || displayName === 'Unknown') && phone && String(phone).trim().length >= 6) displayName = String(phone).trim()
        const finalName = displayName && displayName !== 'Unknown' ? displayName : null
        nameById.set((l as any).id, finalName)
        leadDetailsById.set((l as any).id, {
          email: (l as any).email ?? null,
          phone: (l as any).phone_number ?? null,
          company_name: (l as any).company_name ?? null,
          contact_person: (l as any).contact_person ?? null,
          billing_nume_prenume: (l as any).billing_nume_prenume ?? null,
        })
      }
      for (const [itemId, leadId] of itemToLead) {
        const n = nameById.get(leadId)
        if (n !== undefined) nameById.set(itemId, n)
        const d = leadDetailsById.get(leadId)
        if (d) leadDetailsById.set(itemId, d)
      }
    }
  }

  const toItems = (ids: Set<string>) =>
    [...ids].map((id) => {
      const details = leadDetailsById.get(id)
      return {
        lead_id: id,
        lead_name: nameById.get(id) ?? null,
        fise_count: fiseCountByLeadId.get(id) ?? 0,
        ...details,
      }
    })
  const toComandaItems = (ids: Set<string>) =>
    [...ids].map((id) => {
      const details = leadDetailsById.get(id)
      return {
        lead_id: id,
        lead_name: nameById.get(id) ?? null,
        livrare: livrareByLeadId.get(id),
        fise_count: fiseCountByLeadId.get(id) ?? 0,
        ...details,
      }
    })

  return {
    comanda: toComandaItems(comandaLeadIds),
    noDeal: toItems(noDealIds),
    callback: toItems(callbackIds),
    nuRaspunde: toItems(nuRaspundeIds),
  }
}

/**
 * Numără Curier trimis și Office direct în interval.
 * Pentru userId: doar lead-uri atribuite vânzătorului.
 */
export async function fetchCurierTrimisOfficeDirectCounts(
  start: Date,
  end: Date,
  userId?: string | null
): Promise<{ curier_trimis: number; office_direct: number }> {
  const startIso = start.toISOString()
  const endIso = end.toISOString()
  let ctCount = 0
  let odCount = 0
  let qCt = (supabase as any)
    .from('leads')
    .select('id', { count: 'exact', head: true })
    .gte('curier_trimis_at', startIso)
    .lte('curier_trimis_at', endIso)
  if (userId) qCt = qCt.or(`curier_trimis_user_id.eq.${userId},and(curier_trimis_user_id.is.null,claimed_by.eq.${userId})`)
  const { count: ct } = await qCt
  ctCount = ct ?? 0

  let qOd = (supabase as any)
    .from('leads')
    .select('id', { count: 'exact', head: true })
    .gte('office_direct_at', startIso)
    .lte('office_direct_at', endIso)
  if (userId) qOd = qOd.or(`office_direct_user_id.eq.${userId},and(office_direct_user_id.is.null,claimed_by.eq.${userId})`)
  const { count: od } = await qOd
  odCount = od ?? 0

  return { curier_trimis: ctCount, office_direct: odCount }
}

/**
 * Lead-uri cu Curier Trimis sau Office Direct în interval, atribuite utilizatorului:
 * - curier_trimis_user_id = userId SAU office_direct_user_id = userId (tag cu numele lui)
 * - SAU claimed_by = userId (lead preluat de el)
 */
/**
 * Numără fișele de serviciu create pentru lead-urile prelucrate de un vânzător în interval.
 * Exportat pentru a evita dublarea la agregare pe săptămână/lună.
 */
export async function fetchFiseCountForUser(
  userId: string,
  start: Date,
  end: Date
): Promise<number> {
  const pid = await getVanzariPipelineId()
  if (!pid) return 0
  const stageIdToType = await getStageIdToTypeMap(pid)
  const rows = await fetchApeluriRowsWithTime(pid, start, end, userId)
  const leadIds = new Set<string>()
  for (const r of rows) {
    if (r.lead_id) leadIds.add(r.lead_id)
  }
  const fromLeads = await fetchComandaLeadIdsFromLeads(userId, start, end)
  for (const id of fromLeads) leadIds.add(id)
  const ids = [...leadIds]
  if (!ids.length) return 0
  const { count, error } = await (supabase as any)
    .from('service_files')
    .select('*', { count: 'exact', head: true })
    .in('lead_id', ids)
  if (error) return 0
  return count ?? 0
}

async function fetchComandaLeadIdsFromLeads(
  userId: string,
  start: Date,
  end: Date
): Promise<Set<string>> {
  const startIso = start.toISOString()
  const endIso = end.toISOString()
  const ids = new Set<string>()

  // Curier Trimis: curier_trimis_at în range AND (curier_trimis_user_id = user OR claimed_by = user)
  const { data: ct } = await (supabase as any)
    .from('leads')
    .select('id')
    .gte('curier_trimis_at', startIso)
    .lte('curier_trimis_at', endIso)
    .or(`curier_trimis_user_id.eq.${userId},and(curier_trimis_user_id.is.null,claimed_by.eq.${userId})`)
  for (const r of ct || []) {
    if (r?.id) ids.add(r.id)
  }

  // Office Direct: office_direct_at în range AND (office_direct_user_id = user OR claimed_by = user)
  const { data: od } = await (supabase as any)
    .from('leads')
    .select('id')
    .gte('office_direct_at', startIso)
    .lte('office_direct_at', endIso)
    .or(`office_direct_user_id.eq.${userId},and(office_direct_user_id.is.null,claimed_by.eq.${userId})`)
  for (const r of od || []) {
    if (r?.id) ids.add(r.id)
  }

  return ids
}

async function countApeluriByType(
  pipelineId: string,
  start: Date,
  end: Date,
  stageIdToType: Map<string, keyof ApeluriByType>,
  movedBy?: string | null
): Promise<{ total: number } & ApeluriByType> {
  const rows = await fetchApeluriRows(pipelineId, start, end, movedBy)
  const by: ApeluriByType = emptyByType()
  for (const r of rows) {
    const t = stageIdToType.get(r.to_stage_id)
    if (t) by[t]++
  }
  const total = rows.length
  return { total, ...by }
}

export type VanzariApeluriStats = {
  day: number
  week: number
  month: number
  dayByType: ApeluriByType
  weekByType: ApeluriByType
  monthByType: ApeluriByType
}

/**
 * Total apeluri: ziua curentă, săptămâna curentă, luna curentă, plus breakdown pe tip (Comandă, No deal, Callback, Nu răspunde).
 */
export async function fetchVanzariApeluriStats(): Promise<VanzariApeluriStats> {
  const pid = await getVanzariPipelineId()
  const empty = emptyByType()
  if (!pid) {
    return {
      day: 0,
      week: 0,
      month: 0,
      dayByType: { ...empty },
      weekByType: { ...empty },
      monthByType: { ...empty },
    }
  }
  const stageIdToType = await getStageIdToTypeMap(pid)
  const { start: dS, end: dE } = dayBounds()
  const { start: wS, end: wE } = weekBounds()
  const { start: mS, end: mE } = monthBounds()
  const [dayData, weekData, monthData] = await Promise.all([
    countApeluriByType(pid, dS, dE, stageIdToType),
    countApeluriByType(pid, wS, wE, stageIdToType),
    countApeluriByType(pid, mS, mE, stageIdToType),
  ])
  return {
    day: dayData.total,
    week: weekData.total,
    month: monthData.total,
    dayByType: { comanda: dayData.comanda, noDeal: dayData.noDeal, callback: dayData.callback, nuRaspunde: dayData.nuRaspunde },
    weekByType: { comanda: weekData.comanda, noDeal: weekData.noDeal, callback: weekData.callback, nuRaspunde: weekData.nuRaspunde },
    monthByType: { comanda: monthData.comanda, noDeal: monthData.noDeal, callback: monthData.callback, nuRaspunde: monthData.nuRaspunde },
  }
}

/**
 * Total apeluri pentru o lună anume (month 1–12, year ex. 2025).
 */
export async function fetchVanzariApeluriForMonth(year: number, month: number): Promise<number> {
  const pid = await getVanzariPipelineId()
  if (!pid) return 0
  const { start, end } = monthBoundsFor(year, month)
  return countApeluri(pid, start, end)
}

export type VanzariSalespersonOption = { id: string; name: string }

/**
 * Lista vânzătorilor (utilizatori care au făcut cel puțin un apel SAU au comenzi din leads).
 * Include: moved_by din vanzari_apeluri, curier_trimis_user_id, office_direct_user_id, claimed_by din leads.
 */
export async function listVanzariSalespeople(): Promise<VanzariSalespersonOption[]> {
  const pid = await getVanzariPipelineId()
  if (!pid) return []
  const userIds = new Set<string>()

  const { data: rows, error } = await (supabase as any)
    .from('vanzari_apeluri')
    .select('moved_by')
    .eq('pipeline_id', pid)
    .not('moved_by', 'is', null)
  if (!error && rows?.length) {
    for (const r of rows as { moved_by: string }[]) if (r.moved_by) userIds.add(r.moved_by)
  }

  const { data: leadsRows } = await (supabase as any)
    .from('leads')
    .select('curier_trimis_user_id, office_direct_user_id, claimed_by')
    .or('curier_trimis_at.not.is.null,office_direct_at.not.is.null,claimed_by.not.is.null')
  if (leadsRows?.length) {
    for (const l of leadsRows as { curier_trimis_user_id?: string; office_direct_user_id?: string; claimed_by?: string }[]) {
      if (l.curier_trimis_user_id) userIds.add(l.curier_trimis_user_id)
      if (l.office_direct_user_id) userIds.add(l.office_direct_user_id)
      if (l.claimed_by) userIds.add(l.claimed_by)
    }
  }

  const ids = [...userIds]
  if (!ids.length) return []
  const { data: members, error: membersErr } = await (supabase as any)
    .from('app_members')
    .select('user_id, name, role')
    .in('user_id', ids)
  if (membersErr || !members?.length) {
    return []
  }
  // Afișăm doar membrii cu rolul owner sau vanzator (pentru „Detalii per vânzător”)
  const allowedRoles = ['owner', 'vanzator']
  const filtered = (members as { user_id: string; name: string | null; role?: string }[]).filter(
    (m) => m.role && allowedRoles.includes(String(m.role).toLowerCase())
  )
  const nameById = new Map<string, string>()
  for (const m of filtered) {
    nameById.set(m.user_id, m.name || m.user_id)
  }
  const allowedIds = new Set(filtered.map((m) => m.user_id))
  return ids
    .filter((id) => allowedIds.has(id))
    .map((id) => ({ id, name: nameById.get(id) || id }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * Total apeluri + breakdown pe tip pentru o zi anume (dată calendar).
 * Opțional filtrat pe un vânzător (userId = moved_by).
 * Comenzi: include și lead-uri cu Curier Trimis/Office Direct unde curier_trimis_user_id/office_direct_user_id = user
 * sau claimed_by = user (lead preluat de el).
 */
export type VanzariApeluriForDateResult = {
  total: number
  byType: ApeluriByType
  curier_trimis: number
  office_direct: number
  fise_count: number
}

export async function fetchVanzariApeluriForDate(
  date: Date,
  userId?: string | null
): Promise<VanzariApeluriForDateResult> {
  const pid = await getVanzariPipelineId()
  const empty = emptyByType()
  if (!pid) return { total: 0, byType: { ...empty }, curier_trimis: 0, office_direct: 0, fise_count: 0 }
  const { start, end } = dayBoundsFor(date)
  const stageIdToType = await getStageIdToTypeMap(pid)
  const data = await countApeluriByType(pid, start, end, stageIdToType, userId ?? undefined)
  const { curier_trimis, office_direct } = await fetchCurierTrimisOfficeDirectCounts(start, end, userId ?? undefined)
  const fise_count = userId ? await fetchFiseCountForUser(userId, start, end) : 0

  let comanda = data.comanda
  if (userId) {
    const rows = await fetchApeluriRows(pid, start, end, userId)
    const comandaStageIds = new Set<string>()
    for (const [sid, t] of stageIdToType) {
      if (t === 'comanda') comandaStageIds.add(sid)
    }
    const fromApeluri = new Set<string>()
    for (const r of rows) {
      if (comandaStageIds.has(r.to_stage_id) && r.lead_id) fromApeluri.add(r.lead_id)
    }
    const fromLeads = await fetchComandaLeadIdsFromLeads(userId, start, end)
    for (const id of fromLeads) fromApeluri.add(id)
    comanda = fromApeluri.size
  }

  return {
    total: data.noDeal + data.callback + data.nuRaspunde + comanda,
    byType: { comanda, noDeal: data.noDeal, callback: data.callback, nuRaspunde: data.nuRaspunde },
    curier_trimis,
    office_direct,
    fise_count,
  }
}

/**
 * Total apeluri + breakdown pe tip pentru o lună (month 1–12, year ex. 2025).
 */
export async function fetchVanzariApeluriForMonthWithTypes(
  year: number,
  month: number
): Promise<{ total: number; byType: ApeluriByType }> {
  const pid = await getVanzariPipelineId()
  const empty = emptyByType()
  if (!pid) return { total: 0, byType: { ...empty } }
  const { start, end } = monthBoundsFor(year, month)
  const stageIdToType = await getStageIdToTypeMap(pid)
  const data = await countApeluriByType(pid, start, end, stageIdToType)
  return {
    total: data.total,
    byType: { comanda: data.comanda, noDeal: data.noDeal, callback: data.callback, nuRaspunde: data.nuRaspunde },
  }
}

export type VanzariApeluriMonthItem = {
  year: number
  month: number
  label: string
  count: number
}

const MONTH_NAMES = ['Ian', 'Feb', 'Mar', 'Apr', 'Mai', 'Iun', 'Iul', 'Aug', 'Sep', 'Oct', 'Noi', 'Dec']

/**
 * Ultimele N luni cu total apeluri per lună (pentru dropdown / „în funcție de lună”).
 * Folosește RPC get_vanzari_apeluri_counts_by_month (1 request în loc de N).
 * Dacă RPC nu există încă (migrare neaplicată), fallback la N× countApeluri.
 */
export async function fetchVanzariApeluriMonths(lastN: number = 12): Promise<VanzariApeluriMonthItem[]> {
  const pid = await getVanzariPipelineId()
  if (!pid) return []
  const { data, error } = await (supabase as any).rpc('get_vanzari_apeluri_counts_by_month', {
    p_pipeline_id: pid,
    p_last_n_months: lastN,
  })
  if (!error && data?.length) {
    return (data as { year: number; month: number; count: number }[]).map((row) => ({
      year: row.year,
      month: row.month,
      label: `${MONTH_NAMES[row.month - 1]} ${row.year}`,
      count: Number(row.count),
    }))
  }
  // Fallback dacă RPC nu e încă disponibil (migrare neaplicată)
  const now = new Date()
  const monthPromises: Promise<VanzariApeluriMonthItem>[] = []
  for (let i = 0; i < lastN; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const y = d.getFullYear()
    const m = d.getMonth() + 1
    const { start, end } = monthBoundsFor(y, m)
    monthPromises.push(
      countApeluri(pid, start, end).then((count) => ({
        year: y,
        month: m,
        label: `${MONTH_NAMES[m - 1]} ${y}`,
        count,
      }))
    )
  }
  return Promise.all(monthPromises)
}

/** Ieri în timp local (00:00–23:59:59). */
function yesterdayBounds(): { start: Date; end: Date } {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return dayBoundsFor(d)
}

export type ComenziZiuaAnterioara = {
  total: number
  ajunse: number
  neajunse: number
}

/**
 * Comenzi (fișe de serviciu) din ziua anterioară: lead-uri cu apel → Avem comanda ieri,
 * apoi toate fișele cu status 'comanda' pentru acești lead-uri. „Ajunse” = curier_trimis = true, „Neajunse” = false/null.
 */
export async function fetchComenziZiuaAnterioara(): Promise<ComenziZiuaAnterioara> {
  const empty: ComenziZiuaAnterioara = { total: 0, ajunse: 0, neajunse: 0 }
  const pid = await getVanzariPipelineId()
  if (!pid) return empty
  const stageIdToType = await getStageIdToTypeMap(pid)
  const stageIdsComanda = [...stageIdToType.entries()]
    .filter(([, t]) => t === 'comanda')
    .map(([id]) => id)
  if (!stageIdsComanda.length) return empty
  const { start, end } = yesterdayBounds()
  const { data: apeluriRows, error: apelErr } = await (supabase as any)
    .from('vanzari_apeluri')
    .select('lead_id')
    .eq('pipeline_id', pid)
    .in('to_stage_id', stageIdsComanda)
    .gte('apel_at', start.toISOString())
    .lte('apel_at', end.toISOString())
  if (apelErr || !apeluriRows?.length) return empty
  const leadIds = [...new Set((apeluriRows as { lead_id: string }[]).map((r) => r.lead_id))]
  if (!leadIds.length) return empty
  const { data: sfRows, error: sfErr } = await (supabase as any)
    .from('service_files')
    .select('id, curier_trimis')
    .in('lead_id', leadIds)
    .eq('status', 'comanda')
  if (sfErr || !sfRows?.length) return empty
  const total = sfRows.length
  const ajunse = (sfRows as { curier_trimis: boolean | null }[]).filter((r) => r.curier_trimis === true).length
  const neajunse = total - ajunse
  return { total, ajunse, neajunse }
}

export type ComandaInAsteptare = {
  id: string
  number: string
  lead_id: string
  lead_name?: string | null
}

/** Același format: fișă + lead, pentru comenzi la care coletul nu a ajuns încă. */
export type ComandaNeajunsa = {
  id: string
  number: string
  lead_id: string
  lead_name?: string | null
}

/**
 * Fișe cu lead-urile la care comanda nu a ajuns încă (coletul nu a fost în stage „Colet Ajuns”).
 * Condiții: status = comanda, curier_trimis = true, iar fișa în pipeline Vânzări nu este în stage „Colet Ajuns”.
 * Opțional: filterDate limitează la fișe actualizate în ziua respectivă.
 */
export async function fetchComenziNeajunse(
  limit: number = 100,
  filterDate?: Date | null
): Promise<ComandaNeajunsa[]> {
  const pid = await getVanzariPipelineId()
  if (!pid) return []

  const { data: stages, error: stagesErr } = await fetchStagesForPipeline(pid)
  if (stagesErr || !stages?.length) return []

  const coletAjunsStage = (stages as { id: string; name?: string }[]).find((s) =>
    matchesStagePattern(s.name || '', 'COLET_AJUNS')
  )
  const coletAjunsStageId = coletAjunsStage?.id

  // Toate pipeline_items din Vânzări, tip service_file, care NU sunt în stage Colet Ajuns
  let q = (supabase as any)
    .from('pipeline_items')
    .select('item_id')
    .eq('pipeline_id', pid)
    .eq('type', 'service_file')
    .not('stage_id', 'is', null)
  if (coletAjunsStageId) {
    q = q.neq('stage_id', coletAjunsStageId)
  }
  const { data: piRows, error: piErr } = await q
  if (piErr || !piRows?.length) return []

  const serviceFileIds = [...new Set((piRows as { item_id: string }[]).map((r) => r.item_id).filter(Boolean))]
  if (!serviceFileIds.length) return []

  let sfQuery = (supabase as any)
    .from('service_files')
    .select('id, number, lead_id, updated_at, lead:leads(full_name)')
    .eq('status', 'comanda')
    .eq('curier_trimis', true)
    .in('id', serviceFileIds)
    .order('updated_at', { ascending: false })
    .limit(limit)
  if (filterDate) {
    const { start, end } = dayBoundsFor(filterDate)
    sfQuery = sfQuery.gte('updated_at', start.toISOString()).lte('updated_at', end.toISOString())
  }
  const { data: rows, error } = await sfQuery
  if (error || !rows?.length) return []

  return (rows as Array<{ id: string; number: string; lead_id: string; lead?: { full_name: string | null } | null }>).map(
    (r) => ({
      id: r.id,
      number: r.number ?? '',
      lead_id: r.lead_id,
      lead_name: r.lead?.full_name ?? null,
    })
  )
}

/**
 * Fișe cu status Comandă și curier netrimis (în așteptare).
 * Exclude fișele „office direct” (client vine la sediu) – nu țin de curier.
 * Dacă filterDate e dat, se filtrează după ziua respectivă (updated_at în acea zi); altfel ultimele N, ordonate după updated_at desc.
 */
export async function fetchComenziInAsteptare(
  limit: number = 50,
  filterDate?: Date | null
): Promise<ComandaInAsteptare[]> {
  let q = (supabase as any)
    .from('service_files')
    .select('id, number, lead_id, updated_at, lead:leads(full_name)')
    .eq('status', 'comanda')
    .or('curier_trimis.eq.false,curier_trimis.is.null')
    .or('office_direct.eq.false,office_direct.is.null')
    .order('updated_at', { ascending: false })
    .limit(limit)
  if (filterDate) {
    const { start, end } = dayBoundsFor(filterDate)
    q = q.gte('updated_at', start.toISOString()).lte('updated_at', end.toISOString())
  }
  const { data: rows, error } = await q
  if (error) return []
  if (!rows?.length) return []
  return (rows as Array<{ id: string; number: string; lead_id: string; lead?: { full_name: string | null } | null }>).map(
    (r) => ({
      id: r.id,
      number: r.number ?? '',
      lead_id: r.lead_id,
      lead_name: r.lead?.full_name ?? null,
    })
  )
}
