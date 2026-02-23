import { supabaseBrowser } from './supabaseClient'
import { getPipelinesWithStages } from './leadOperations'
import { DEPARTMENT_PIPELINES } from './kanban/constants'
import { matchesStagePattern } from './kanban/constants'
import { parseServiceTimeToSeconds } from '@/lib/utils/service-time'
import { getWorkSessionMinutesForRange } from './workSessionOperations'
import {
  getStageIdsCache,
  setStageIdsCache,
  getStageIdsPromise,
  setStageIdsPromise,
  type StageIdsResult,
} from './tehnicianDashboardStageIdsCache'
import { fetchTehnicianDashboardBulk } from './tehnicianDashboardBulk'

const supabase = supabaseBrowser()
const toSlug = (s: string) => String(s || '').toLowerCase().replace(/\s+/g, '-')

async function getCachedStageIds(): Promise<StageIdsResult> {
  const stageIdsCache = getStageIdsCache()
  if (stageIdsCache.cached) {
    return {
      finalizareIds: stageIdsCache.finalizareIds || [],
      inLucruIds: stageIdsCache.inLucruIds || [],
      inAsteptareIds: stageIdsCache.inAsteptareIds || [],
      receptieFinalizateIds: stageIdsCache.receptieFinalizateIds || [],
    }
  }

  // Single-flight: dacă un fetch e deja în curs, așteaptă același Promise
  const existing = getStageIdsPromise()
  if (existing) return existing

  const promise = (async (): Promise<StageIdsResult> => {
    // 1 apel getPipelinesWithStages în loc de 4 – reduce apeluri DB
    const { data: pipelines } = await getPipelinesWithStages()
    const [finalizareIds, inLucruIds, inAsteptareIds, receptieFinalizateIds] = await Promise.all([
      getFinalizareStageIds(pipelines ?? undefined),
      getInLucruStageIds(pipelines ?? undefined),
      getInAsteptareStageIds(pipelines ?? undefined),
      getReceptieFinalizateStageIds(pipelines ?? undefined),
    ])

    setStageIdsCache({ finalizareIds, inLucruIds, inAsteptareIds, receptieFinalizateIds, cached: true })
    setStageIdsPromise(null)
    return { finalizareIds, inLucruIds, inAsteptareIds, receptieFinalizateIds }
  })()

  setStageIdsPromise(promise)
  return promise
}

/** Cheie de dată în fusul orar local (YYYY-MM-DD), pentru consistență cu minutesByDay. */
function dayKeyLocal(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

type TrayTechWeightsResult = {
  participantsByTray: Map<string, Set<string>>
  weightSecondsByTrayTech: Map<string, Map<string, number>>
}

// ==================== TRAY PARTICIPANTS MEMOIZATION ====================
let trayParticipantsCache: Map<string, TrayTechWeightsResult> = new Map()

async function computeTrayParticipantsAndWeights(trayIds: string[]): Promise<TrayTechWeightsResult> {
  const ids = Array.isArray(trayIds) ? trayIds.filter(Boolean) : []
  if (ids.length === 0) return { participantsByTray: new Map(), weightSecondsByTrayTech: new Map() }

  // Verifica dacă sunt deja în cache (acelasi set exact de tray IDs)
  const cacheKey = JSON.stringify(ids.sort())
  if (trayParticipantsCache.has(cacheKey)) {
    return trayParticipantsCache.get(cacheKey)!
  }

  const chunk = <T,>(arr: T[], size: number): T[][] => {
    const out: T[][] = []
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
    return out
  }

  const safeItems: any[] = []
  for (const batch of chunk(ids, 200)) {
    // Optimizare: selectează doar coloanele necesare
    const { data: trayItems, error } = await (supabase as any)
      .from('tray_items')
      .select('tray_id, qty, notes, service_id, instrument_id, technician_id')
      .in('tray_id', batch)
    if (!error && Array.isArray(trayItems) && trayItems.length) safeItems.push(...trayItems)
  }

  const serviceIds = [...new Set(safeItems.map((it) => it?.service_id).filter(Boolean))] as string[]
  const timeByServiceIdSeconds = new Map<string, number>()
  const instrumentIdByServiceId = new Map<string, string>()

  if (serviceIds.length > 0) {
    for (const batch of chunk(serviceIds, 200)) {
      // Optimizare: selectează doar coloanele necesare
      const { data: servicesRows } = await (supabase as any)
        .from('services')
        .select('id, time, instrument_id')
        .in('id', batch)
      for (const s of (servicesRows || []) as any[]) {
        if (!s?.id) continue
        const sec = parseServiceTimeToSeconds(s?.time)
        if (sec > 0) timeByServiceIdSeconds.set(String(s.id), sec)
        if (s?.instrument_id) instrumentIdByServiceId.set(String(s.id), String(s.instrument_id))
      }
    }
  }

  // Tehnicianul e la nivel de tăviță (trays); încarcă trays pentru a avea technician_id per tray
  const { data: traysRows } = await (supabase as any).from('trays').select('id, technician_id, technician2_id, technician3_id').in('id', ids)
  const trayToTechs = new Map<string, Set<string>>()
  ;(traysRows || []).forEach((t: any) => {
    const set = new Set<string>()
    if (t?.technician_id) set.add(t.technician_id)
    if (t?.technician2_id) set.add(t.technician2_id)
    if (t?.technician3_id) set.add(t.technician3_id)
    if (set.size > 0) trayToTechs.set(t.id, set)
  })
  // Extensie: dacă la împărțire pe tehnicieni există technician_id pe tray_items,
  // asigurăm că acel tehnician este inclus în participanții tăviței chiar dacă nu e pe trays.*
  for (const it of safeItems) {
    const trayId = it?.tray_id as string
    const itemTechId = it?.technician_id as string | null
    if (!trayId || !itemTechId) continue
    if (!trayToTechs.has(trayId)) trayToTechs.set(trayId, new Set())
    trayToTechs.get(trayId)!.add(itemTechId)
  }
  const trayInstrumentToTechs = new Map<string, Map<string, Set<string>>>() // folosim același set de tech per tray

  const getItemType = (it: any): 'service' | 'part' | null => {
    let notes: any = {}
    if (it?.notes) {
      try { notes = JSON.parse(it.notes) } catch { notes = {} }
    }
    const itemType = notes?.item_type || (it?.part_id ? 'part' : it?.service_id ? 'service' : null)
    return itemType === 'service' || itemType === 'part' ? itemType : null
  }

  const getInstrumentIdKey = (it: any, itemType: 'service' | 'part' | null): string => {
    const trayItemInstrumentId = (it?.instrument_id as string | null) ?? null
    const serviceId = String(it?.service_id || '')
    const serviceInstrumentId = itemType === 'service' ? (instrumentIdByServiceId.get(serviceId) ?? null) : null
    return trayItemInstrumentId || serviceInstrumentId || '__unknown__'
  }

  for (const it of safeItems) {
    const trayId = it?.tray_id as string
    if (!trayId) continue
    const techs = trayToTechs.get(trayId)
    if (!techs || techs.size === 0) continue
    const itemType = getItemType(it)
    const instrumentIdKey = getInstrumentIdKey(it, itemType)
    if (!trayInstrumentToTechs.has(trayId)) trayInstrumentToTechs.set(trayId, new Map())
    const instMap = trayInstrumentToTechs.get(trayId)!
    if (!instMap.has(instrumentIdKey)) instMap.set(instrumentIdKey, new Set())
    // La tăviță împărțită: rândul poate avea technician_id – folosim doar acel tehnician pentru acest instrument
    if (it?.technician_id && techs.has(it.technician_id)) {
      instMap.get(instrumentIdKey)!.add(it.technician_id)
    } else {
      techs.forEach((tid) => instMap.get(instrumentIdKey)!.add(tid))
    }
  }

  const inferTechnicianId = (trayId: string, instrumentIdKey: string): string | null => {
    const instSet = trayInstrumentToTechs.get(trayId)?.get(instrumentIdKey)
    if (instSet && instSet.size === 1) return Array.from(instSet)[0]
    const traySet = trayToTechs.get(trayId)
    if (traySet && traySet.size === 1) return Array.from(traySet)[0]
    return null
  }

  const participantsByTray = new Map<string, Set<string>>()
  const weightSecondsByTrayTech = new Map<string, Map<string, number>>()

  for (const it of safeItems) {
    const trayId = it?.tray_id as string
    if (!trayId) continue
    const qty = Math.floor(Number(it?.qty ?? 0) || 0)
    if (qty <= 0) continue
    const itemType = getItemType(it)
    const instrumentIdKey = getInstrumentIdKey(it, itemType)
    // La tăviță împărțită: folosim technician_id de pe rând; altfel inferență din tray + instrument
    const trayTechs = trayToTechs.get(trayId)
    let tid = (it?.technician_id && trayTechs?.has(it.technician_id))
      ? it.technician_id
      : inferTechnicianId(trayId, instrumentIdKey)
    // După reuniere: nu avem technician_id pe item; dacă tăvița are 2+ tehnicieni, repartizăm egal
    const participantIds = tid
      ? [tid]
      : (trayTechs && trayTechs.size > 0 ? Array.from(trayTechs) : [])
    if (participantIds.length === 0) continue

    if (!participantsByTray.has(trayId)) participantsByTray.set(trayId, new Set())
    participantIds.forEach((id) => participantsByTray.get(trayId)!.add(id))

    if (itemType !== 'service') continue
    const serviceId = String(it?.service_id || '')
    const sec = timeByServiceIdSeconds.get(serviceId) ?? 0
    if (sec <= 0) continue
    const itemWeight = qty * sec
    const sharePerTech = participantIds.length > 0 ? itemWeight / participantIds.length : 0
    if (!weightSecondsByTrayTech.has(trayId)) weightSecondsByTrayTech.set(trayId, new Map())
    const byTech = weightSecondsByTrayTech.get(trayId)!
    participantIds.forEach((id) => {
      byTech.set(id, (byTech.get(id) ?? 0) + sharePerTech)
    })
  }

  const result = { participantsByTray, weightSecondsByTrayTech }
  
  // Cache rezultatul pentru a evita re-computation dacă se apelează din nou cu aceleași tray IDs
  trayParticipantsCache.set(cacheKey, result)
  
  // Limităurante cache la 5 entries pentru a nu consuma prea multă memorie
  if (trayParticipantsCache.size > 5) {
    const firstKey = trayParticipantsCache.keys().next().value
    if (firstKey) trayParticipantsCache.delete(firstKey)
  }
  
  return result
}

function allocateMinutesForTray(
  trayMinutes: number,
  participants: string[],
  weightsSeconds?: Map<string, number>
): Map<string, number> {
  const mins = Math.max(0, Math.floor(Number(trayMinutes) || 0))
  const ids = Array.isArray(participants) ? participants.filter(Boolean) : []
  const out = new Map<string, number>()
  if (mins <= 0 || ids.length === 0) return out

  const weights = weightsSeconds ? new Map(weightsSeconds) : new Map<string, number>()
  const totalWeight = Array.from(weights.values()).reduce((a, b) => a + (Number(b) || 0), 0)

  // Fallback: fără greutăți → împărțire egală
  if (!Number.isFinite(totalWeight) || totalWeight <= 0) {
    const base = Math.floor(mins / ids.length)
    let rem = mins - base * ids.length
    for (const tid of ids) {
      const add = rem > 0 ? 1 : 0
      if (rem > 0) rem -= 1
      out.set(tid, base + add)
    }
    return out
  }

  const parts = ids.map((tid) => {
    const w = Math.max(0, Number(weights.get(tid) ?? 0) || 0)
    const exact = (mins * w) / totalWeight
    const base = Math.floor(exact)
    const frac = exact - base
    return { tid, base, frac }
  })

  let used = parts.reduce((acc, p) => acc + p.base, 0)
  let rem = Math.max(0, mins - used)
  parts.sort((a, b) => b.frac - a.frac)
  for (const p of parts) {
    const add = rem > 0 ? 1 : 0
    if (rem > 0) rem -= 1
    out.set(p.tid, p.base + add)
  }

  // Siguranță: fără valori negative
  for (const [k, v] of out) out.set(k, Math.max(0, Math.floor(Number(v) || 0)))
  return out
}

export type TehnicianTrayStat = {
  technicianId: string
  technicianName: string
  count: number
  /** Timp petrecut (minute) cu tăvițele în „In lucru” în perioada selectată */
  minutesInLucru?: number
  /** Timp petrecut (minute) cu tăvițele în „În așteptare" în perioada selectată */
  minutesInAsteptare?: number
  /** Suma (RON) pe baza item-urilor atribuite tehnicianului în zi/perioadă (best-effort). */
  totalRon?: number
}

export type TehnicianTrayWork = {
  trayId: string
  trayNumber: string | null
  traySize: string | null
  serviceFileId: string | null
  serviceFileNumber?: string | null
  /** Lead-ul asociat fișei (pentru deschidere în Vânzări). */
  leadId?: string | null
  clientName?: string | null
  /** Minute petrecute de tăviță în stage „In lucru” în ziua selectată (atribuite tehnicianului prin tray_items.technician_id). */
  minutesInLucru: number
  /** Minute petrecute de tăviță în stage „În așteptare" în ziua selectată. */
  minutesInAsteptare?: number
  /** Suma (RON) pentru această tăviță (doar item-urile atribuite tehnicianului). */
  totalRon?: number
  /** Suma (RON) pentru tăviță (toate serviciile/piesele), indiferent de tehnician. */
  trayTotalRon?: number
  /** Stage-ul curent al tăviței. */
  currentStageId?: string | null
  currentStageName?: string | null
  /** True dacă tăvița e încă în stage "În lucru" (nu finalizată). */
  isInLucru?: boolean
  /** True dacă tăvița e în stage "În așteptare". */
  isInAsteptare?: boolean
  /** True dacă tăvița e în stage "De trimis" din Recepție. */
  isDeTrimis?: boolean
  /** True dacă tăvița e în stage "Ridic personal" din Recepție. */
  isRidicPersonal?: boolean
  /** Pipeline-ul în care se află tăvița (pentru afișare icon). */
  pipelineName?: string | null
  /** True dacă tăvița a fost reunită (split șters la merge); datele vin din arhiva_tavite_unite. */
  isReunita?: boolean
}

export type TehnicianInstrumentWork = {
  instrumentId: string | null
  instrumentName: string
  /** Nr. instrumente (qty) - total */
  qty: number
  /** Nr. instrumente din tăvițe în lucru (nefinalizate) */
  qtyInLucru: number
  /** Nr. instrumente din tăvițe în așteptare (nefinalizate) */
  qtyInAsteptare: number
  /** Total RON estimat (best-effort; în prezent egal cu actual) */
  ronEst: number
  /** Total RON actual (best-effort) */
  ronAct: number
  /** Timp estimat (secunde) */
  estSeconds: number
  /** Timp real (secunde) – alocat proporțional din timpul tăviței */
  actSeconds: number
  /** Servicii efectuate pentru acest instrument (doar serviciile, nu piesele). */
  services?: Array<{ serviceId: string; serviceName: string; qty: number; qtyInLucru: number; qtyInAsteptare: number }>
}

export type TehnicianDashboardStats = {
  day: TehnicianTrayStat[]
  week: TehnicianTrayStat[]
  month: TehnicianTrayStat[]
  totalDay: number
  totalWeek: number
  totalMonth: number
  /** Total minute tăvițe în „In lucru” pentru ziua/săptămâna/luna curentă */
  totalMinutesInLucruDay: number
  totalMinutesInLucruWeek: number
  totalMinutesInLucruMonth: number
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

/** Extrage stage IDs din pipelines după pattern. Folosește pipelines deja încărcate – 1 apel DB în loc de 4. */
function extractStageIdsFromPipelines(
  pipelines: any[],
  options: { deptOnly?: boolean; receptieOnly?: boolean; pattern: string | string[] }
): string[] {
  const ids: string[] = []
  const patterns = Array.isArray(options.pattern) ? options.pattern : [options.pattern]
  for (const p of pipelines) {
    const name = (p as any).name || ''
    const slug = toSlug(name)
    if (options.receptieOnly) {
      if (slug !== 'receptie' && !slug.includes('receptie')) continue
    } else if (options.deptOnly) {
      const isDept = DEPARTMENT_PIPELINES.some(
        (d) => toSlug(d) === slug || slug.includes(toSlug(d))
      )
      if (!isDept) continue
    }
    const stages = (p as any).stages || []
    for (const s of stages) {
      const sn = (s as any).name || ''
      const matches = patterns.some((pat) => matchesStagePattern(sn, pat))
      if (matches) ids.push((s as any).id)
    }
  }
  return [...new Set(ids)]
}

async function getFinalizareStageIds(pipelines?: any[]): Promise<string[]> {
  const p = pipelines ?? (await getPipelinesWithStages()).data
  if (!p?.length) return []
  return extractStageIdsFromPipelines(p, { deptOnly: true, pattern: 'FINALIZARE' })
}

async function getInLucruStageIds(pipelines?: any[]): Promise<string[]> {
  const p = pipelines ?? (await getPipelinesWithStages()).data
  if (!p?.length) return []
  return extractStageIdsFromPipelines(p, { deptOnly: true, pattern: 'IN_LUCRU' })
}

async function getInAsteptareStageIds(pipelines?: any[]): Promise<string[]> {
  const p = pipelines ?? (await getPipelinesWithStages()).data
  if (!p?.length) return []
  return extractStageIdsFromPipelines(p, { deptOnly: true, pattern: 'IN_ASTEPTARE' })
}

/** Obține stage IDs pentru "De trimis" și "Ridic personal" din Recepție (considerate finalizate pentru totaluri). */
async function getReceptieFinalizateStageIds(pipelines?: any[]): Promise<string[]> {
  const p = pipelines ?? (await getPipelinesWithStages()).data
  if (!p?.length) return []
  return extractStageIdsFromPipelines(p, { receptieOnly: true, pattern: ['DE_TRIMIS', 'RIDIC_PERSONAL'] })
}

/**
 * Pentru tăvițe split (sau cu un singur tehnician), returnează tray_id -> technician_id.
 * Tăvițele split (status 'Splited' sau parent_tray_id set) au un singur tehnician per copil → timpul se atribuie lui.
 */
async function getTrayToPrimaryTechnicianMap(trayIds: string[]): Promise<Map<string, string>> {
  const ids = Array.isArray(trayIds) ? trayIds.filter(Boolean) : []
  if (ids.length === 0) return new Map()
  const chunk = <T,>(arr: T[], size: number): T[][] => {
    const out: T[][] = []
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
    return out
  }
  const result = new Map<string, string>()
  for (const batch of chunk(ids, 200)) {
    const { data: rows, error } = await (supabase as any)
      .from('trays')
      .select('id, technician_id, technician2_id, technician3_id, status, parent_tray_id')
      .in('id', batch)
    if (error || !Array.isArray(rows)) continue
    for (const t of rows as any[]) {
      const trayId = t?.id as string
      if (!trayId) continue
      const techIds = [t?.technician_id, t?.technician2_id, t?.technician3_id].filter(Boolean) as string[]
      const isSplitChild = t?.status === 'Splited' || (t?.parent_tray_id != null && String(t.parent_tray_id).trim() !== '')
      if (isSplitChild && techIds.length >= 1) {
        result.set(trayId, techIds[0])
      } else if (techIds.length === 1) {
        result.set(trayId, techIds[0])
      }
    }
  }
  return result
}

/**
 * Calculează timpul de execuție per tăviță (același algoritm ca pe Receptie):
 * de la ultimul IN_LUCRU (sau ultimul IN_LUCRU înainte de FINALIZARE) până la FINALIZARE sau acum.
 * Folosit pentru a afișa același „Timp în lucru” pe dashboard ca „Execuție” pe Receptie.
 */
async function getTrayExecutionMinutesMap(trayIds: string[]): Promise<Map<string, number>> {
  const ids = Array.isArray(trayIds) ? trayIds.filter(Boolean) : []
  if (ids.length === 0) return new Map()

  const { inLucruIds, finalizareIds } = await getCachedStageIds()
  const relevantStageIds = Array.from(new Set([...inLucruIds, ...finalizareIds]))
  if (relevantStageIds.length === 0) return new Map()

  const { data: stageHistoryRows, error } = await (supabase as any)
    .from('stage_history' as any)
    .select('tray_id, to_stage_id, moved_at')
    .in('tray_id', ids)
    .in('to_stage_id', relevantStageIds)
    .order('moved_at', { ascending: true })

  if (error || !Array.isArray(stageHistoryRows) || stageHistoryRows.length === 0) return new Map()

  const inLucruSet = new Set(inLucruIds)
  const finalizareSet = new Set(finalizareIds)
  const byTray = new Map<string, Array<{ to_stage_id: string; moved_at: string }>>()
  for (const r of stageHistoryRows as any[]) {
    const trayId = r?.tray_id as string | undefined
    const toStageId = r?.to_stage_id as string | undefined
    const movedAt = r?.moved_at as string | undefined
    if (!trayId || !toStageId || !movedAt) continue
    if (!byTray.has(trayId)) byTray.set(trayId, [])
    byTray.get(trayId)!.push({ to_stage_id: toStageId, moved_at: movedAt })
  }

  const now = Date.now()
  const result = new Map<string, number>()
  for (const trayId of ids) {
    const rows = byTray.get(trayId) || []
    let lastFinalAt: number | null = null
    let lastInLucruBeforeFinal: number | null = null
    let lastInLucruAt: number | null = null

    for (const row of rows) {
      const ts = new Date(row.moved_at).getTime()
      if (!Number.isFinite(ts)) continue
      if (inLucruSet.has(row.to_stage_id)) {
        lastInLucruAt = ts
        if (lastFinalAt !== null && ts <= lastFinalAt) lastInLucruBeforeFinal = ts
      }
      if (finalizareSet.has(row.to_stage_id)) {
        lastFinalAt = ts
        lastInLucruBeforeFinal = null
      }
    }
    if (lastFinalAt !== null) {
      for (const row of rows) {
        const ts = new Date(row.moved_at).getTime()
        if (!Number.isFinite(ts)) continue
        if (ts <= lastFinalAt && inLucruSet.has(row.to_stage_id)) lastInLucruBeforeFinal = ts
      }
    }

    const start = lastFinalAt !== null ? lastInLucruBeforeFinal : lastInLucruAt
    const end = lastFinalAt !== null ? lastFinalAt : null
    if (start != null) {
      const durationMs = (end ?? now) - start
      if (durationMs > 0) result.set(trayId, Math.round(durationMs / 60000))
    }
  }
  return result
}

/** Calculează minutele petrecute în stage „In lucru” per tăviță în interval, apoi per tehnician și per zi. */
async function fetchTimeInLucruForRange(
  dateStart: Date,
  dateEnd: Date
): Promise<{
  minutesByTechnician: Map<string, number>
  minutesByDay: Map<string, number>
  trayMinutes: Map<string, number>
  traysByTechnician: Map<string, Map<string, number>>
}> {
  const { inLucruIds } = await getCachedStageIds()
  if (inLucruIds.length === 0)
    return {
      minutesByTechnician: new Map(),
      minutesByDay: new Map(),
      trayMinutes: new Map(),
      traysByTechnician: new Map(),
    }

  const startStr = dateStart.toISOString()
  const endStr = dateEnd.toISOString()
  const rangeStartMs = dateStart.getTime()
  const rangeEndMs = dateEnd.getTime()

  // 1 query în loc de 2: enter SAU leave din „În lucru"
  const idsStr = inLucruIds.join(',')
  const { data: historyRows, error } = await (supabase as any)
    .from('stage_history' as any)
    .select('tray_id, from_stage_id, to_stage_id, moved_at')
    .not('tray_id', 'is', null)
    .or(`to_stage_id.in.(${idsStr}),from_stage_id.in.(${idsStr})`)
    .gte('moved_at', startStr)
    .lte('moved_at', endStr)
    .order('moved_at', { ascending: true })
  const rows = error ? [] : (historyRows || [])
  if (rows.length === 0)
    return {
      minutesByTechnician: new Map(),
      minutesByDay: new Map(),
      trayMinutes: new Map(),
      traysByTechnician: new Map(),
    }
  rows.sort((a: any, b: any) => (a.moved_at || '').localeCompare(b.moved_at || ''))

  const inLucruSet = new Set(inLucruIds)
  const byTray = new Map<string, Array<{ from_stage_id: string | null; to_stage_id: string; moved_at: string }>>()
  for (const r of rows as any[]) {
    const trayId = r?.tray_id as string
    const fromId = r?.from_stage_id ?? null
    const toId = r?.to_stage_id as string
    const movedAt = r?.moved_at as string
    if (!trayId || !movedAt) continue
    const isEnter = inLucruSet.has(toId)
    const isLeave = fromId && inLucruSet.has(fromId)
    if (!isEnter && !isLeave) continue
    if (!byTray.has(trayId)) byTray.set(trayId, [])
    byTray.get(trayId)!.push({ from_stage_id: fromId, to_stage_id: toId, moved_at: movedAt })
  }

  // La același moved_at: procesăm „leave” înainte de „enter”, ca intervalul să se închidă corect (nu să se deschidă unul nou la același moment)
  for (const events of byTray.values()) {
    events.sort((a, b) => {
      const c = (a.moved_at || '').localeCompare(b.moved_at || '')
      if (c !== 0) return c
      const aLeave = a.from_stage_id != null && inLucruSet.has(a.from_stage_id)
      const bLeave = b.from_stage_id != null && inLucruSet.has(b.from_stage_id)
      return (aLeave ? 0 : 1) - (bLeave ? 0 : 1)
    })
  }

  const trayMinutes = new Map<string, number>()
  for (const [trayId, events] of byTray) {
    let totalMs = 0
    let intervalStart: number | null = null
    for (const ev of events) {
      const ts = new Date(ev.moved_at).getTime()
      if (!Number.isFinite(ts)) continue
      if (inLucruSet.has(ev.to_stage_id)) {
        if (intervalStart === null) intervalStart = ts
      }
      if (ev.from_stage_id && inLucruSet.has(ev.from_stage_id) && intervalStart !== null) {
        const endMs = Math.min(ts, rangeEndMs)
        const startMs = Math.max(intervalStart, rangeStartMs)
        if (endMs > startMs) totalMs += endMs - startMs
        intervalStart = null
      }
    }
    if (intervalStart !== null) {
      const endMs = Math.min(rangeEndMs, Date.now())
      const startMs = Math.max(intervalStart, rangeStartMs)
      if (endMs > startMs) totalMs += endMs - startMs
    }
    if (totalMs > 0) trayMinutes.set(trayId, Math.round(totalMs / 60000))
  }

  function addIntervalToMinutesByDay(
    startMs: number,
    endMs: number,
    minutesByDay: Map<string, number>,
    rangeStartMs: number,
    rangeEndMs: number
  ) {
    const start = Math.max(startMs, rangeStartMs)
    const end = Math.min(endMs, rangeEndMs)
    if (end <= start) return
    let d = new Date(start)
    d.setHours(0, 0, 0, 0)
    const endDate = new Date(end)
    endDate.setHours(23, 59, 59, 999)
    while (d.getTime() <= endDate.getTime()) {
      const dayKey = dayKeyLocal(d)
      const dayStart = d.getTime()
      const dayEnd = dayStart + 24 * 60 * 60 * 1000 - 1
      const segStart = Math.max(start, dayStart)
      const segEnd = Math.min(end, dayEnd)
      if (segEnd > segStart) {
        const mins = Math.round((segEnd - segStart) / 60000)
        minutesByDay.set(dayKey, (minutesByDay.get(dayKey) ?? 0) + mins)
      }
      d.setDate(d.getDate() + 1)
    }
  }

  // Dacă tăvița e încă „În lucru” și a trecut ziua când a intrat, înregistrarea se trece pe ziua curentă
  // (doar dacă ziua curentă este în intervalul de raportare).
  const now = new Date()
  const todayKey = dayKeyLocal(now)
  const todayStartMs = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0).getTime()
  const rangeIncludesToday = rangeEndMs >= todayStartMs
  const minutesByDay = new Map<string, number>()
  for (const [_trayId, events] of byTray) {
    let intervalStart: number | null = null
    for (const ev of events) {
      const ts = new Date(ev.moved_at).getTime()
      if (!Number.isFinite(ts)) continue
      if (inLucruSet.has(ev.to_stage_id)) {
        if (intervalStart === null) intervalStart = ts
      }
      if (ev.from_stage_id && inLucruSet.has(ev.from_stage_id) && intervalStart !== null) {
        addIntervalToMinutesByDay(intervalStart, ts, minutesByDay, rangeStartMs, rangeEndMs)
        intervalStart = null
      }
    }
    if (intervalStart !== null && rangeIncludesToday) {
      const endMs = Math.min(rangeEndMs, Date.now())
      const startMs = Math.max(intervalStart, rangeStartMs)
      if (endMs > startMs) {
        const openMins = Math.round((endMs - startMs) / 60000)
        minutesByDay.set(todayKey, (minutesByDay.get(todayKey) ?? 0) + openMins)
      }
    }
  }

  const trayIds = Array.from(trayMinutes.keys())
  if (trayIds.length === 0)
    return {
      minutesByTechnician: new Map(),
      minutesByDay,
      trayMinutes,
      traysByTechnician: new Map(),
    }

  // Timp de execuție per tăviță (același calcul ca pe Receptie: IN_LUCRU -> FINALIZARE sau acum)
  const trayExecutionMinutesMap = await getTrayExecutionMinutesMap(trayIds)

  // Pentru tăvițe split (sau cu un singur tehnician): atribuirea e după technician_id al tăviței, NU după sesiuni
  // (evită ca un tehnician să primească timpul altei părți din cauza unei sesiuni greșite)
  const trayToPrimaryTechnician = await getTrayToPrimaryTechnicianMap(trayIds)

  // 1) Tăvițe cu tehnician clar (split copil sau tray cu un singur tech): atribuim ÎNTOTDEAUNA după trays.technician_id
  const traysByTechnician = new Map<string, Map<string, number>>()
  const minutesByTechnician = new Map<string, number>()
  const assignedByTrayTech = new Set<string>() // trayIds deja atribuite după tray-ul lor (split/single-tech)

  for (const trayId of trayIds) {
    const techId = trayToPrimaryTechnician.get(trayId)
    if (!techId) continue
    const executionMins = trayExecutionMinutesMap.get(trayId) ?? 0
    if (executionMins <= 0) continue
    assignedByTrayTech.add(trayId)
    if (!traysByTechnician.has(techId)) traysByTechnician.set(techId, new Map())
    traysByTechnician.get(techId)!.set(trayId, executionMins)
    minutesByTechnician.set(techId, (minutesByTechnician.get(techId) ?? 0) + executionMins)
  }

  // 2) Tăvițe fără tehnician unic (mai mulți tehnicieni pe aceeași tăviță): folosim sesiuni sau participanți
  const sessionData = await getWorkSessionMinutesForRange(trayIds, dateStart, dateEnd)
  const unassignedTrayIds = trayIds.filter((id) => !assignedByTrayTech.has(id))

  if (unassignedTrayIds.length > 0 && sessionData.hasSessionData) {
    for (const [techId, trayMap] of sessionData.traysByTechnician) {
      if (!traysByTechnician.has(techId)) traysByTechnician.set(techId, new Map())
      let techSum = minutesByTechnician.get(techId) ?? 0
      for (const [trayId] of trayMap) {
        if (!unassignedTrayIds.includes(trayId)) continue
        const mins = trayExecutionMinutesMap.get(trayId) ?? 0
        if (mins <= 0) continue
        traysByTechnician.get(techId)!.set(trayId, mins)
        techSum += mins
      }
      if (techSum > 0) minutesByTechnician.set(techId, techSum)
    }
    return {
      minutesByTechnician,
      minutesByDay: sessionData.minutesByDay,
      trayMinutes,
      traysByTechnician,
    }
  }

  // 3) Fallback doar pentru tăvițe neatribuite (fără sesiuni): participanți + greutăți; păstrăm rezultatul de la 1)
  if (unassignedTrayIds.length > 0) {
    const { participantsByTray, weightSecondsByTrayTech } = await computeTrayParticipantsAndWeights(unassignedTrayIds)
    for (const trayId of unassignedTrayIds) {
      const mins = trayMinutes.get(trayId) ?? 0
      if (mins <= 0) continue
      let participants = Array.from(participantsByTray.get(trayId) ?? [])
      if (participants.length === 0) {
        const primaryTech = trayToPrimaryTechnician.get(trayId)
        if (primaryTech) participants = [primaryTech]
      }
      if (participants.length === 0) continue
      const alloc = allocateMinutesForTray(mins, participants, weightSecondsByTrayTech.get(trayId))
      const executionMins = trayExecutionMinutesMap.get(trayId) ?? 0
      for (const [tid, m] of alloc) {
        if (m <= 0) continue
        if (!traysByTechnician.has(tid)) traysByTechnician.set(tid, new Map())
        traysByTechnician.get(tid)!.set(trayId, executionMins)
        minutesByTechnician.set(tid, (minutesByTechnician.get(tid) ?? 0) + executionMins)
      }
    }
  }

  return { minutesByTechnician, minutesByDay, trayMinutes, traysByTechnician }
}

/** Calculează minutele petrecute în stage „În așteptare" per tăviță în interval, apoi per tehnician. */
async function fetchTimeInAsteptareForRange(
  dateStart: Date,
  dateEnd: Date
): Promise<{
  minutesByTechnician: Map<string, number>
  trayMinutes: Map<string, number>
  traysByTechnician: Map<string, Map<string, number>>
}> {
  const { inAsteptareIds } = await getCachedStageIds()
  if (inAsteptareIds.length === 0)
    return {
      minutesByTechnician: new Map(),
      trayMinutes: new Map(),
      traysByTechnician: new Map(),
    }

  const startStr = dateStart.toISOString()
  const endStr = dateEnd.toISOString()
  const rangeStartMs = dateStart.getTime()
  const rangeEndMs = dateEnd.getTime()

  const idsStr = inAsteptareIds.join(',')
  const { data: asteptareRows, error: asteptareErr } = await (supabase as any)
    .from('stage_history' as any)
    .select('tray_id, from_stage_id, to_stage_id, moved_at')
    .not('tray_id', 'is', null)
    .or(`to_stage_id.in.(${idsStr}),from_stage_id.in.(${idsStr})`)
    .gte('moved_at', startStr)
    .lte('moved_at', endStr)
    .order('moved_at', { ascending: true })
  const historyRows = asteptareErr ? [] : (asteptareRows || [])
  if (historyRows.length === 0)
    return {
      minutesByTechnician: new Map(),
      trayMinutes: new Map(),
      traysByTechnician: new Map(),
    }
  historyRows.sort((a: any, b: any) => (a.moved_at || '').localeCompare(b.moved_at || ''))

  const inAsteptareSet = new Set(inAsteptareIds)
  const byTray = new Map<string, Array<{ from_stage_id: string | null; to_stage_id: string; moved_at: string }>>()
  for (const r of historyRows as any[]) {
    const trayId = r?.tray_id as string
    const fromId = r?.from_stage_id ?? null
    const toId = r?.to_stage_id as string
    const movedAt = r?.moved_at as string
    if (!trayId || !movedAt) continue
    const isEnter = inAsteptareSet.has(toId)
    const isLeave = fromId && inAsteptareSet.has(fromId)
    if (!isEnter && !isLeave) continue
    if (!byTray.has(trayId)) byTray.set(trayId, [])
    byTray.get(trayId)!.push({ from_stage_id: fromId, to_stage_id: toId, moved_at: movedAt })
  }

  // La același moved_at: procesăm „leave" înainte de „enter"
  for (const events of byTray.values()) {
    events.sort((a, b) => {
      const c = (a.moved_at || '').localeCompare(b.moved_at || '')
      if (c !== 0) return c
      const aLeave = a.from_stage_id != null && inAsteptareSet.has(a.from_stage_id)
      const bLeave = b.from_stage_id != null && inAsteptareSet.has(b.from_stage_id)
      return (aLeave ? 0 : 1) - (bLeave ? 0 : 1)
    })
  }

  const trayMinutes = new Map<string, number>()
  for (const [trayId, events] of byTray) {
    let totalMs = 0
    let intervalStart: number | null = null
    for (const ev of events) {
      const ts = new Date(ev.moved_at).getTime()
      if (!Number.isFinite(ts)) continue
      if (inAsteptareSet.has(ev.to_stage_id)) {
        if (intervalStart === null) intervalStart = ts
      }
      if (ev.from_stage_id && inAsteptareSet.has(ev.from_stage_id) && intervalStart !== null) {
        const endMs = Math.min(ts, rangeEndMs)
        const startMs = Math.max(intervalStart, rangeStartMs)
        if (endMs > startMs) totalMs += endMs - startMs
        intervalStart = null
      }
    }
    if (intervalStart !== null) {
      const endMs = Math.min(rangeEndMs, Date.now())
      const startMs = Math.max(intervalStart, rangeStartMs)
      if (endMs > startMs) totalMs += endMs - startMs
    }
    if (totalMs > 0) trayMinutes.set(trayId, Math.round(totalMs / 60000))
  }

  const trayIds = Array.from(trayMinutes.keys())
  if (trayIds.length === 0)
    return {
      minutesByTechnician: new Map(),
      trayMinutes,
      traysByTechnician: new Map(),
    }
  const { participantsByTray, weightSecondsByTrayTech } = await computeTrayParticipantsAndWeights(trayIds)

  const minutesByTechnician = new Map<string, number>()
  const traysByTechnician = new Map<string, Map<string, number>>()

  for (const [trayId, mins] of trayMinutes) {
    if (mins <= 0) continue
    const participants = Array.from(participantsByTray.get(trayId) ?? [])
    if (participants.length === 0) continue
    const alloc = allocateMinutesForTray(mins, participants, weightSecondsByTrayTech.get(trayId))
    for (const [tid, m] of alloc) {
      if (m <= 0) continue
      minutesByTechnician.set(tid, (minutesByTechnician.get(tid) ?? 0) + m)
      if (!traysByTechnician.has(tid)) traysByTechnician.set(tid, new Map())
      traysByTechnician.get(tid)!.set(trayId, m)
    }
  }

  return { minutesByTechnician, trayMinutes, traysByTechnician }
}

type TimeInLucruResult = Awaited<ReturnType<typeof fetchTimeInLucruForRange>>

async function fetchStatsForRange(
  dateStart: Date,
  dateEnd: Date,
  preFetchedTime?: Pick<TimeInLucruResult, 'minutesByTechnician' | 'traysByTechnician'>
): Promise<{ stats: TehnicianTrayStat[]; techToTrays: Map<string, Set<string>> }> {
  const startStr = dateStart.toISOString()
  const endStr = dateEnd.toISOString()

  // Tehnicienii care au avut tăvițe „În lucru” în perioadă (evită apel duplicat când preFetchedTime e furnizat)
  const { minutesByTechnician, traysByTechnician: traysInLucruByTech } = preFetchedTime ?? await fetchTimeInLucruForRange(dateStart, dateEnd)

  const techToTrays = new Map<string, Set<string>>()

  // Pentru corecta atribuire a tăvițelor split, avem nevoie de technician_id/2/3 + status/parent_tray_id
  const trayIdsFromLucru = new Set<string>()
  for (const [, trayMap] of traysInLucruByTech) {
    for (const trayId of trayMap.keys()) {
      if (trayId) trayIdsFromLucru.add(trayId)
    }
  }
  let traysMetaById = new Map<
    string,
    { technician_ids: string[]; isSplit: boolean; isParent: boolean }
  >()
  if (trayIdsFromLucru.size > 0) {
    const { data: traysMeta } = await (supabase as any)
      .from('trays')
      .select('id, technician_id, technician2_id, technician3_id, status, parent_tray_id')
      .in('id', Array.from(trayIdsFromLucru))
    traysMetaById = new Map(
      (traysMeta || []).map((t: any) => {
        const techIds = [t?.technician_id, t?.technician2_id, t?.technician3_id].filter(Boolean) as string[]
        const isSplit = t?.status === 'Splited' || (t?.parent_tray_id != null && t.parent_tray_id !== '')
        const statusStr = String(t?.status ?? '')
        const isParent = statusStr === '2' || statusStr === '3'
        return [t.id as string, { technician_ids: techIds, isSplit, isParent }]
      })
    )
  }

  // Include și tăvițele „în lucru” în perioadă (split / nefinalizate), nu doar cele finalizate.
  // Nu luăm în calcul tăvița „main” după split (status 2/3) – doar cele 2 sau 3 tăvițe split (copii).
  for (const [techId, trayMap] of traysInLucruByTech) {
    if (!techToTrays.has(techId)) techToTrays.set(techId, new Set())
    for (const trayId of trayMap.keys()) {
      if (!trayId) continue
      const meta = traysMetaById.get(trayId)
      if (meta?.isParent) continue
      if (meta?.isSplit) {
        if (meta.technician_ids.length > 0 && !meta.technician_ids.includes(techId)) continue
      }
      techToTrays.get(techId)!.add(trayId)
    }
  }

  // Asigură că toți tehnicienii atașați tăviței (technician_id, technician2_id, technician3_id) au tăvița în listă,
  // nu doar cel cu sesiuni sau „primary” – astfel ambii/toți tehnicienii care au lucrat la tăviță apar la „Pe tăviță”.
  for (const trayId of trayIdsFromLucru) {
    const meta = traysMetaById.get(trayId)
    if (!meta?.technician_ids?.length || meta.isParent) continue
    for (const techId of meta.technician_ids) {
      if (!techToTrays.has(techId)) techToTrays.set(techId, new Set())
      techToTrays.get(techId)!.add(trayId)
    }
  }

  // Tăvița se atribuie zilei în care s-a lucrat efectiv (are timp în lucru în perioada selectată),
  // nu zilei în care a fost mutată în Finalizare.
  // Ex.: începută ieri, finalizată azi, dar cu timp în lucru azi → contează pentru azi.
  // Dacă s-a finalizat în altă zi dar are timp în lucru în perioada selectată, se atribuie perioadei selectate.
  // Tăvițele cu timp în lucru în perioada selectată sunt deja incluse prin traysInLucruByTech de mai sus.
  // Nu mai adăugăm tăvițele finalizate în perioada selectată dacă nu au timp în lucru în perioadă,
  // pentru că vrem să atribuim statisticile zilei când s-a lucrat efectiv, nu zilei de finalizare.
  
  // Logica veche care atribuia tăvițele zilei de finalizare a fost eliminată.
  // Acum includem doar tăvițele care au avut timp în lucru în perioada selectată (inclus prin traysInLucruByTech).

  // În loc de tăvița main (ex. 38m), afișăm tăvițele split (ex. 38mViorel, 38mGheorghe): eliminăm parent din listă și adăugăm copiii
  const allTrayIdsInTechToTrays = new Set<string>()
  for (const set of techToTrays.values()) {
    for (const id of set) allTrayIdsInTechToTrays.add(id)
  }
  if (allTrayIdsInTechToTrays.size > 0) {
    const { data: traysForCleanup } = await (supabase as any)
      .from('trays')
      .select('id, status, parent_tray_id, technician_id, technician2_id, technician3_id')
      .in('id', Array.from(allTrayIdsInTechToTrays))
    const parentsToReplace = new Set<string>()
    for (const t of traysForCleanup || []) {
      const statusStr = String((t as any)?.status ?? '')
      if (statusStr === '2' || statusStr === '3') parentsToReplace.add((t as any).id)
    }
    if (parentsToReplace.size > 0) {
      const { data: childTraysForParent } = await (supabase as any)
        .from('trays')
        .select('id, technician_id, technician2_id, technician3_id')
        .in('parent_tray_id', Array.from(parentsToReplace))
      for (const [techId, set] of techToTrays) {
        for (const parentId of parentsToReplace) {
          if (!set.has(parentId)) continue
          set.delete(parentId)
          for (const c of childTraysForParent || []) {
            const cid = (c as any)?.id as string
            if (!cid) continue
            const cTechIds = [(c as any)?.technician_id, (c as any)?.technician2_id, (c as any)?.technician3_id].filter(Boolean) as string[]
            if (cTechIds.includes(techId)) set.add(cid)
          }
        }
      }
    }
  }

  // Reuniune: tehnicieni cu tăvițe finalizate + tehnicieni cu tăvițe doar „În lucru” (să apară în dashboard)
  const techIdsFromLucru = Array.from(minutesByTechnician.keys())
  for (const tid of techIdsFromLucru) {
    if (!techToTrays.has(tid)) techToTrays.set(tid, new Set())
  }

  const techIds = Array.from(techToTrays.keys())
  if (techIds.length === 0) return { stats: [], techToTrays }

  const nameById = new Map<string, string>()
  const { data: appMembers, error: appErr } = await (supabase as any)
    .from('app_members')
    .select('user_id, name')
    .in('user_id', techIds)
  if (!appErr && appMembers?.length) {
    for (const m of appMembers as any[]) {
      const rawName = (m.name && String(m.name).trim()) || null
      if (rawName) nameById.set(m.user_id, rawName)
    }
  }
  try {
    const { data: membersDisplay, error: membersErr } = await (supabase as any)
      .from('members')
      .select('user_id, display_name')
      .in('user_id', techIds)
    if (!membersErr && membersDisplay?.length) {
      for (const m of membersDisplay as any[]) {
        const dn = (m as any).display_name && String((m as any).display_name).trim()
        if (dn && !nameById.has(m.user_id)) nameById.set(m.user_id, dn)
      }
    }
  } catch {
    // Tabelul/view "members" poate să nu existe
  }

  const result: TehnicianTrayStat[] = []
  for (const techId of techIds) {
    const trays = techToTrays.get(techId)!
    result.push({
      technicianId: techId,
      technicianName: nameById.get(techId) || `Tehnician ${String(techId).slice(0, 8)}`,
      count: trays.size,
      minutesInLucru: minutesByTechnician.get(techId) ?? 0,
    })
  }
  // Sortare: mai întâi după nr. tăvițe finalizate, apoi după minute în lucru (ca cei cu doar „în lucru” să apară)
  result.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count
    return (b.minutesInLucru ?? 0) - (a.minutesInLucru ?? 0)
  })
  return { stats: result, techToTrays }
}

/** Sumă minute „în lucru” din traysByTechnician, fiecare tăviță numărată o singură dată (același calcul ca în tabel). */
function sumExecutionMinutesUniqueTrays(traysByTechnician: Map<string, Map<string, number>>): number {
  let sum = 0
  const seen = new Set<string>()
  for (const m of traysByTechnician.values()) {
    for (const [trayId, mins] of m) {
      if (!seen.has(trayId)) {
        seen.add(trayId)
        sum += mins
      }
    }
  }
  return sum
}

export async function fetchTehnicianDashboardStats(): Promise<TehnicianDashboardStats> {
  const [dayB, weekB, monthB] = [dayBounds(), weekBounds(), monthBounds()]
  // 3 apeluri fetchTimeInLucruForRange (nu 6) – rezultatul se transmite la fetchStatsForRange
  const [dayTime, weekTime, monthTime] = await Promise.all([
    fetchTimeInLucruForRange(dayB.start, dayB.end),
    fetchTimeInLucruForRange(weekB.start, weekB.end),
    fetchTimeInLucruForRange(monthB.start, monthB.end),
  ])
  const [dayResult, weekResult, monthResult] = await Promise.all([
    fetchStatsForRange(dayB.start, dayB.end, dayTime),
    fetchStatsForRange(weekB.start, weekB.end, weekTime),
    fetchStatsForRange(monthB.start, monthB.end, monthTime),
  ])

  const sum = (arr: TehnicianTrayStat[]) => arr.reduce((acc, x) => acc + x.count, 0)

  return {
    day: dayResult.stats,
    week: weekResult.stats,
    month: monthResult.stats,
    totalDay: sum(dayResult.stats),
    totalWeek: sum(weekResult.stats),
    totalMonth: sum(monthResult.stats),
    totalMinutesInLucruDay: sumExecutionMinutesUniqueTrays(dayTime.traysByTechnician),
    totalMinutesInLucruWeek: sumExecutionMinutesUniqueTrays(weekTime.traysByTechnician),
    totalMinutesInLucruMonth: sumExecutionMinutesUniqueTrays(monthTime.traysByTechnician),
  }
}

export async function fetchTehnicianStatsForMonth(
  year: number,
  month: number
): Promise<{ stats: TehnicianTrayStat[]; total: number; totalMinutesInLucru: number }> {
  const start = new Date(year, month - 1, 1, 0, 0, 0, 0)
  const end = new Date(year, month, 0, 23, 59, 59, 999)
  const time = await fetchTimeInLucruForRange(start, end)
  const statsResult = await fetchStatsForRange(start, end, time)
  const stats = statsResult.stats
  const total = stats.reduce((acc, x) => acc + x.count, 0)
  const totalMinutesInLucru = sumExecutionMinutesUniqueTrays(time.traysByTechnician)
  return { stats, total, totalMinutesInLucru }
}

/** Statistici pentru o singură zi (pentru selector de dată). */
export async function fetchTehnicianStatsForDate(
  date: Date
): Promise<{
  stats: TehnicianTrayStat[]
  total: number
  totalMinutesInLucru: number
  totalMinutesInAsteptare: number
  traysByTechnician?: Record<string, TehnicianTrayWork[]>
  instrumentWorkByTechnician?: Record<string, TehnicianInstrumentWork[]>
}> {
  const start = new Date(date)
  start.setHours(0, 0, 0, 0)
  const end = new Date(date)
  end.setHours(23, 59, 59, 999)
  const [statsResult, time, timeAsteptare, { receptieFinalizateIds: receptieFinalizateStageIds }] = await Promise.all([
    fetchStatsForRange(start, end),
    fetchTimeInLucruForRange(start, end),
    fetchTimeInAsteptareForRange(start, end),
    getCachedStageIds(),
  ])
  const stats = statsResult.stats
  const techToTrays = statsResult.techToTrays
  const total = stats.reduce((acc, x) => acc + x.count, 0)
  const totalMinutesInLucru = sumExecutionMinutesUniqueTrays(time.traysByTechnician)
  const totalMinutesInAsteptare = Array.from(timeAsteptare.minutesByTechnician.values()).reduce((a, b) => a + b, 0)

  // Breakdown pe tăviță per tehnician (doar pentru ziua selectată)
  let traysByTechnician: Record<string, TehnicianTrayWork[]> | undefined = undefined
  let instrumentWorkByTechnician: Record<string, TehnicianInstrumentWork[]> | undefined = undefined
  try {
    const allTrayIds = new Set<string>()
    for (const m of time.traysByTechnician.values()) {
      for (const trayId of m.keys()) allTrayIds.add(trayId)
    }
    // Includem și tăvițele care intră doar la număr (ex. finalizate azi fără minute „În lucru" azi), ca lista să corespundă cu totalul
    for (const trayIdSet of techToTrays.values()) {
      for (const trayId of trayIdSet) allTrayIds.add(trayId)
    }
    
    // Adăugăm și tăvițele din "De trimis" și "Ridic personal" din Recepție (receptieFinalizateStageIds deja încărcat în paralel mai sus)
    const additionalTraysByTech = new Map<string, Set<string>>() // techId -> Set<trayId>
    if (receptieFinalizateStageIds.length > 0) {
      // Găsim tăvițele care sunt în aceste stage-uri
      const { data: receptieTrays } = await (supabase as any)
        .from('pipeline_items')
        .select('item_id')
        .eq('type', 'tray')
        .in('stage_id', receptieFinalizateStageIds)
      
      if (receptieTrays?.length) {
        const receptieTrayIds = (receptieTrays as any[]).map(r => r.item_id).filter(Boolean) as string[]
        // Găsim tehnicienii atribuiți acestor tăvițe
        if (receptieTrayIds.length > 0) {
          const { data: receptieTraysRows } = await (supabase as any)
            .from('trays')
            .select('id, technician_id, technician2_id, technician3_id')
            .in('id', receptieTrayIds)
          if (receptieTraysRows?.length) {
            for (const t of receptieTraysRows as any[]) {
              const trayId = t?.id as string
              if (!trayId) continue
              const techIds = [t?.technician_id, t?.technician2_id, t?.technician3_id].filter(Boolean) as string[]
              if (techIds.length === 0) continue
              allTrayIds.add(trayId)
              for (const techId of techIds) {
                if (!additionalTraysByTech.has(techId)) additionalTraysByTech.set(techId, new Set())
                additionalTraysByTech.get(techId)!.add(trayId)
                if (!time.traysByTechnician.has(techId)) time.traysByTechnician.set(techId, new Map())
                const techMap = time.traysByTechnician.get(techId)!
                if (!techMap.has(trayId)) techMap.set(trayId, 0)
              }
            }
          }
        }
      }
    }
    
    const trayIds = Array.from(allTrayIds)
    if (trayIds.length > 0) {
      const [traysResult, trayPipelineItemsResult] = await Promise.all([
        (supabase as any)
          .from('trays')
          .select('id, number, service_file_id, status, parent_tray_id, technician_id, technician2_id, technician3_id')
          .in('id', trayIds),
        (supabase as any)
          .from('pipeline_items')
          .select('item_id, stage_id, pipeline_id, stage:stages(id, name), pipeline:pipelines(id, name)')
          .eq('type', 'tray')
          .in('item_id', trayIds),
      ])
      const { data: trays, error: traysErr } = traysResult
      const { data: trayPipelineItems } = trayPipelineItemsResult
      if (!traysErr) {
        const trayById = new Map<string, any>()
        for (const t of trays || []) {
          trayById.set(t.id, t)
        }
        const foundTrayIds = new Set(trayById.keys())
        const missingTrayIds = trayIds.filter((id) => !foundTrayIds.has(id))
        const mergedTrayInfoByChildId = new Map<string, { trayNumber: string | null; traySize: string | null; serviceFileId: string | null; parentTrayId: string | null }>()
        const serviceFileIds = [...new Set((trays || []).map((t: any) => t?.service_file_id).filter(Boolean))] as string[]
        const [arhivaResult, sfsTraysResult] = await Promise.all([
          missingTrayIds.length > 0
            ? (supabase as any)
                .from('arhiva_tavite_unite')
                .select('parent_tray_id, service_file_id, tray_number, tray_size, child_tray_ids, child_tray_numbers')
                .limit(500)
            : Promise.resolve({ data: [] }),
          serviceFileIds.length > 0
            ? (supabase as any).from('service_files').select('id, number, lead_id').in('id', serviceFileIds)
            : Promise.resolve({ data: [] }),
        ])
        const arhivaRows = arhivaResult?.data ?? []
        const sfsTrays = sfsTraysResult?.data ?? []
        if (missingTrayIds.length > 0 && Array.isArray(arhivaRows)) {
          const missingSet = new Set(missingTrayIds)
          for (const row of arhivaRows as any[]) {
            const childIds = (row?.child_tray_ids || []) as string[]
            const childNumbers = (row?.child_tray_numbers || []) as string[]
            for (let i = 0; i < childIds.length; i++) {
              const cid = childIds[i]
              if (!cid || !missingSet.has(cid)) continue
              mergedTrayInfoByChildId.set(cid, {
                trayNumber: (childNumbers[i] != null && childNumbers[i] !== '') ? String(childNumbers[i]) : null,
                traySize: row?.tray_size ?? null,
                serviceFileId: row?.service_file_id ?? null,
                parentTrayId: row?.parent_tray_id ?? null,
              })
            }
          }
        }
        const archiveServiceFileIds = [...new Set(Array.from(mergedTrayInfoByChildId.values()).map((v) => v.serviceFileId).filter(Boolean))] as string[]
        const serviceFileByIdForArchive = new Map<string, { id: string; number: string | null; lead_id: string | null }>()
        const leadNameByIdForArchive = new Map<string, string>()
        const leadIdsFromTrays = [...new Set((sfsTrays as any[]).map((sf: any) => sf?.lead_id).filter(Boolean))] as string[]
        const serviceFileById = new Map<string, { id: string; number: string | null; lead_id: string | null }>()
        const leadNameById = new Map<string, string>()
        for (const sf of (sfsTrays || []) as any[]) {
          serviceFileById.set(sf.id, { id: sf.id, number: sf.number ?? null, lead_id: sf.lead_id ?? null })
        }
        const [sfsArchiveResult, leadsTraysResult] = await Promise.all([
          archiveServiceFileIds.length > 0
            ? (supabase as any).from('service_files').select('id, number, lead_id').in('id', archiveServiceFileIds)
            : Promise.resolve({ data: [] }),
          leadIdsFromTrays.length > 0
            ? (supabase as any).from('leads').select('id, full_name, company_name').in('id', leadIdsFromTrays)
            : Promise.resolve({ data: [] }),
        ])
        const sfsArchive = (sfsArchiveResult?.data ?? []) as any[]
        const leadsTrays = (leadsTraysResult?.data ?? []) as any[]
        for (const sf of sfsArchive) {
          serviceFileByIdForArchive.set(sf.id, { id: sf.id, number: sf.number ?? null, lead_id: sf.lead_id ?? null })
        }
        const leadIdsArchive = [...new Set(sfsArchive.map((sf: any) => sf?.lead_id).filter(Boolean))] as string[]
        if (leadIdsArchive.length > 0) {
          const { data: leadsArchive } = await (supabase as any)
            .from('leads')
            .select('id, full_name, company_name')
            .in('id', leadIdsArchive)
          for (const l of (leadsArchive || []) as any[]) {
            const name =
              (l.full_name && String(l.full_name).trim()) ||
              (l.company_name && String(l.company_name).trim()) ||
              null
            if (name) leadNameByIdForArchive.set(l.id, name)
          }
        }
        for (const l of leadsTrays as any[]) {
          const name =
            (l.full_name && String(l.full_name).trim()) ||
            (l.company_name && String(l.company_name).trim()) ||
            null
          if (name) leadNameById.set(l.id, name)
        }

        const trayCurrentStage = new Map<string, { stageId: string; stageName: string; pipelineId: string | null; pipelineName: string | null; isInLucru: boolean; isInAsteptare: boolean; isDeTrimis: boolean; isRidicPersonal: boolean }>()
        if (trayPipelineItems?.length) {
          for (const pi of trayPipelineItems as any[]) {
            const stageId = pi?.stage_id ?? null
            const stageName = pi?.stage?.name ?? ''
            const pipelineRow = (pi as any)?.pipeline ?? (pi as any)?.pipelines
            const pipelineId = (pi?.pipeline_id ?? pipelineRow?.id) ?? null
            const pipelineName = (pipelineRow?.name && String(pipelineRow.name).trim()) ? String(pipelineRow.name) : null
            const isInLucru = matchesStagePattern(stageName, 'IN_LUCRU')
            const isInAsteptare = matchesStagePattern(stageName, 'IN_ASTEPTARE')
            const isDeTrimis = matchesStagePattern(stageName, 'DE_TRIMIS')
            const isRidicPersonal = matchesStagePattern(stageName, 'RIDIC_PERSONAL')
            if (pi?.item_id) {
              trayCurrentStage.set(pi.item_id, { stageId, stageName, pipelineId, pipelineName, isInLucru, isInAsteptare, isDeTrimis, isRidicPersonal })
            }
          }
        }

        // Totaluri pe tăviță per tehnician (serviceFileById, leadNameById deja încărcate mai sus în paralel) (doar item-urile atribuite tehnicianului)
        const URGENT_MARKUP_PCT = 30

        const techIds = Array.from(new Set([...time.traysByTechnician.keys(), ...techToTrays.keys()]))
        const totalByTechTray = new Map<string, Map<string, number>>()
        const totalByTrayAll = new Map<string, number>()
        const instrumentQtyByTech = new Map<string, Map<string, number>>() // instrumentId -> qty (final, după fuziune)
        const explicitQtyByTechTrayInstrument = new Map<string, Map<string, Map<string, number>>>() // tech -> tray -> instrument -> qty (rânduri explicite)
        const instrumentNameByKey = new Map<string, string>() // instrumentIdKey -> name
        const fallbackMaxQtyByTechTrayInstrument = new Map<string, Map<string, Map<string, number>>>() // tech -> tray -> instrument -> maxQty
        const servicesByTechInstrument = new Map<string, Map<string, Map<string, { name: string; qty: number }>>>()
        // Urmărim qty per tăviță pentru a calcula qtyInLucru/qtyInAsteptare mai târziu
        const qtyByTechTrayInstrument = new Map<string, Map<string, Map<string, number>>>() // tech -> tray -> instrument -> qty
        const servicesByTechTrayInstrument = new Map<string, Map<string, Map<string, Map<string, { name: string; qty: number }>>>>() // tech -> tray -> instrument -> serviceId -> {name, qty}
        const estSecondsByTechInstrument = new Map<string, Map<string, number>>() // instrumentId -> seconds
        const ronByTechInstrument = new Map<string, Map<string, number>>() // instrumentId -> ron
        const estSecondsByTechTray = new Map<string, Map<string, number>>() // trayId -> seconds
        const estSecondsByTechTrayInstrument = new Map<string, Map<string, Map<string, number>>>() // trayId -> instrumentId -> seconds
        if (techIds.length > 0) {
          const techIdsSet = new Set(techIds)
          const { data: trayItems } = await (supabase as any)
            .from('tray_items')
            .select('tray_id, qty, notes, service_id, part_id, instrument_id, technician_id, service:services(name,price,time), part:parts(price), instrument:instruments(name)')
            .in('tray_id', trayIds)

          const safeItems = Array.isArray(trayItems) ? trayItems : []
          // Fetch service times separat (mai robust decât join-ul, și suportă formate gen "30 min", "00:30:00", "1h30")
          const serviceIds = [...new Set(safeItems.map((it: any) => it?.service_id).filter(Boolean))] as string[]
          const timeByServiceIdSeconds = new Map<string, number>()
          const nameByServiceId = new Map<string, string>()
          const instrumentIdByServiceId = new Map<string, string>()
          const instrumentNameFromServices = new Map<string, string>()
          if (serviceIds.length > 0) {
            const { data: servicesTimes } = await (supabase as any)
              .from('services')
              .select('id, time, name, instrument_id')
              .in('id', serviceIds)
            for (const s of (servicesTimes || []) as any[]) {
              const sec = parseServiceTimeToSeconds(s?.time)
              if (sec > 0) timeByServiceIdSeconds.set(s.id, sec)
              const nm = s?.name && String(s.name).trim()
              if (nm) nameByServiceId.set(s.id, nm)
              if (s?.instrument_id) instrumentIdByServiceId.set(String(s.id), String(s.instrument_id))
            }

            // Pentru serviciile care nu au instrument_id pe tray_item, avem nevoie de numele instrumentului
            const instrumentIdsFromServices = [...new Set((servicesTimes || []).map((s: any) => s?.instrument_id).filter(Boolean))] as string[]
            if (instrumentIdsFromServices.length > 0) {
              const { data: instRows } = await (supabase as any)
                .from('instruments')
                .select('id, name')
                .in('id', instrumentIdsFromServices)
              for (const r of (instRows || []) as any[]) {
                if (r?.id && r?.name) instrumentNameFromServices.set(String(r.id), String(r.name))
              }
            }
          }

          const { data: traysForTech } = await (supabase as any).from('trays').select('id, technician_id, technician2_id, technician3_id').in('id', trayIds)
          const trayToTechs = new Map<string, Set<string>>()
          ;(traysForTech || []).forEach((t: any) => {
            const set = new Set<string>()
            if (t?.technician_id) set.add(t.technician_id)
            if (t?.technician2_id) set.add(t.technician2_id)
            if (t?.technician3_id) set.add(t.technician3_id)
            if (set.size > 0) trayToTechs.set(t.id, set)
          })
          const trayInstrumentToTechs = new Map<string, Map<string, Set<string>>>()
          for (const it of safeItems as any[]) {
            const trId = it?.tray_id as string
            if (!trId) continue
            const techs = trayToTechs.get(trId)
            if (!techs) continue
            let notes: any = {}
            if (it?.notes) {
              try { notes = JSON.parse(it.notes) } catch { notes = {} }
            }
            const itemType = notes?.item_type || (it?.part_id ? 'part' : it?.service_id ? 'service' : null)
            const trayItemInstrumentId = (it?.instrument_id as string | null) ?? null
            const serviceId = String(it?.service_id || '')
            const serviceInstrumentId = itemType === 'service' ? (instrumentIdByServiceId.get(serviceId) ?? null) : null
            const instrumentIdKey = trayItemInstrumentId || serviceInstrumentId || '__unknown__'
            if (!trayInstrumentToTechs.has(trId)) trayInstrumentToTechs.set(trId, new Map())
            const instMap = trayInstrumentToTechs.get(trId)!
            if (!instMap.has(instrumentIdKey)) instMap.set(instrumentIdKey, new Set())
            // La tăviță împărțită: rândul poate avea technician_id – folosim doar acel tehnician pentru acest instrument
            if (it?.technician_id && techs.has(it.technician_id)) {
              instMap.get(instrumentIdKey)!.add(it.technician_id)
            } else {
              techs.forEach((tid) => instMap.get(instrumentIdKey)!.add(tid))
            }
          }

          const inferTechnicianId = (trayId: string, instrumentIdKey: string): string | null => {
            const instSet = trayInstrumentToTechs.get(trayId)?.get(instrumentIdKey)
            if (instSet && instSet.size === 1) return Array.from(instSet)[0]
            const traySet = trayToTechs.get(trayId)
            if (traySet && traySet.size === 1) return Array.from(traySet)[0]
            return null
          }

          for (const it of safeItems as any[]) {
            const trId = it?.tray_id as string
            if (!trId) continue
            const rawTid = inferTechnicianId(trId, (() => {
              let notes: any = {}
              if (it?.notes) {
                try { notes = JSON.parse(it.notes) } catch { notes = {} }
              }
              const itemType = notes?.item_type || (it?.part_id ? 'part' : it?.service_id ? 'service' : null)
              const trayItemInstrumentId = (it?.instrument_id as string | null) ?? null
              const serviceId = String(it?.service_id || '')
              const serviceInstrumentId = itemType === 'service' ? instrumentIdByServiceId.get(serviceId) ?? null : null
              return trayItemInstrumentId || serviceInstrumentId || '__unknown__'
            })())
            const qty = Number(it?.qty ?? 0) || 0
            if (qty <= 0) continue

            // Parse notes JSON pentru price/discount/urgent/item_type
            let notes: any = {}
            if (it?.notes) {
              try {
                notes = JSON.parse(it.notes)
              } catch {
                notes = {}
              }
            }
            const itemType = notes?.item_type || (it?.part_id ? 'part' : it?.service_id ? 'service' : null)

            // Instrument id / nume (pentru breakdown)
            const trayItemInstrumentId = (it?.instrument_id as string | null) ?? null
            const serviceId = String(it?.service_id || '')
            const serviceInstrumentId = itemType === 'service'
              ? (instrumentIdByServiceId.get(serviceId) ?? null)
              : null
            const instrumentIdKey = trayItemInstrumentId || serviceInstrumentId || '__unknown__'
            const instrumentName =
              (it?.instrument?.name && String(it.instrument.name).trim()) ||
              (instrumentIdKey !== '__unknown__' ? instrumentNameFromServices.get(instrumentIdKey) : null) ||
              (notes?.instrument_name && String(notes.instrument_name).trim()) ||
              'Instrument necunoscut'
            if (!instrumentNameByKey.has(instrumentIdKey) && instrumentName) {
              instrumentNameByKey.set(instrumentIdKey, instrumentName)
            }

            // Tehnician: la tăviță împărțită folosim technician_id de pe rând; altfel inferență din tray + instrument
            // După reuniere: fără technician_id pe item; dacă tăvița are 2+ tehnicieni, repartizăm RON/timp egal
            const tidSingle = (it?.technician_id && techIdsSet.has(it.technician_id))
              ? it.technician_id
              : (rawTid || inferTechnicianId(trId, instrumentIdKey))
            const trayTechsHere = trayToTechs.get(trId)
            const participantIds: string[] = tidSingle && techIdsSet.has(tidSingle)
              ? [tidSingle]
              : (trayTechsHere ? Array.from(trayTechsHere).filter(id => techIdsSet.has(id)) : [])
            if (participantIds.length === 0) continue

            const nShare = participantIds.length
            const lineTotalShare = (lineTotal: number) => lineTotal / nShare
            const estSecondsShare = (est: number) => est / nShare

            // Număr instrumente: preferăm item-urile "instrument" (item_type null); urmărim per tăviță pentru fuziune corectă.
            if (!itemType) {
              participantIds.forEach((tid) => {
                if (!explicitQtyByTechTrayInstrument.has(tid)) explicitQtyByTechTrayInstrument.set(tid, new Map())
                const trayMapExpl = explicitQtyByTechTrayInstrument.get(tid)!
                if (!trayMapExpl.has(trId)) trayMapExpl.set(trId, new Map())
                const instMapExpl = trayMapExpl.get(trId)!
                instMapExpl.set(instrumentIdKey, (instMapExpl.get(instrumentIdKey) ?? 0) + qty / nShare)
              })
              continue
            }

            const explicitPrice = Number(notes?.price)
            const price =
              Number.isFinite(explicitPrice) && explicitPrice > 0
                ? explicitPrice
                : itemType === 'service'
                  ? Number(it?.service?.price ?? 0) || 0
                  : Number(it?.part?.price ?? 0) || 0

            const discPctRaw = Number(notes?.discount_pct ?? 0) || 0
            const discPct = Math.min(100, Math.max(0, discPctRaw)) / 100
            const urgent = Boolean(notes?.urgent)
            const base = qty * price
            const disc = base * discPct
            const afterDisc = base - disc
            const urgentAmount = urgent ? afterDisc * (URGENT_MARKUP_PCT / 100) : 0
            const lineTotal = afterDisc + urgentAmount

            // Total tăviță (independent de tehnician)
            totalByTrayAll.set(trId, (totalByTrayAll.get(trId) ?? 0) + lineTotal)

            participantIds.forEach((tid) => {
              if (!totalByTechTray.has(tid)) totalByTechTray.set(tid, new Map())
              const m = totalByTechTray.get(tid)!
              m.set(trId, (m.get(trId) ?? 0) + lineTotalShare(lineTotal))
            })

            // RON pe instrument (include service+part)
            participantIds.forEach((tid) => {
              if (!ronByTechInstrument.has(tid)) ronByTechInstrument.set(tid, new Map())
              const mRon = ronByTechInstrument.get(tid)!
              mRon.set(instrumentIdKey, (mRon.get(instrumentIdKey) ?? 0) + lineTotalShare(lineTotal))
            })

            // Timp estimat doar pentru servicii (time din services)
            if (itemType === 'service') {
              const perItemSeconds =
                (serviceId ? timeByServiceIdSeconds.get(serviceId) : 0) ||
                parseServiceTimeToSeconds(it?.service?.time)
              const estSeconds = perItemSeconds > 0 ? perItemSeconds * qty : 0
              if (estSeconds > 0) {
                participantIds.forEach((tid) => {
                  if (!estSecondsByTechInstrument.has(tid)) estSecondsByTechInstrument.set(tid, new Map())
                  const mEst = estSecondsByTechInstrument.get(tid)!
                  mEst.set(instrumentIdKey, (mEst.get(instrumentIdKey) ?? 0) + estSecondsShare(estSeconds))

                  if (!estSecondsByTechTray.has(tid)) estSecondsByTechTray.set(tid, new Map())
                  const mTray = estSecondsByTechTray.get(tid)!
                  mTray.set(trId, (mTray.get(trId) ?? 0) + estSecondsShare(estSeconds))

                  if (!estSecondsByTechTrayInstrument.has(tid)) estSecondsByTechTrayInstrument.set(tid, new Map())
                  const mTrayInst = estSecondsByTechTrayInstrument.get(tid)!
                  if (!mTrayInst.has(trId)) mTrayInst.set(trId, new Map())
                  const mInst = mTrayInst.get(trId)!
                  mInst.set(instrumentIdKey, (mInst.get(instrumentIdKey) ?? 0) + estSecondsShare(estSeconds))
                })
              }

              // Breakdown servicii pe instrument (global)
              participantIds.forEach((tid) => {
                if (!servicesByTechInstrument.has(tid)) servicesByTechInstrument.set(tid, new Map())
                const techMap = servicesByTechInstrument.get(tid)!
                if (!techMap.has(instrumentIdKey)) techMap.set(instrumentIdKey, new Map())
                const instSvcMap = techMap.get(instrumentIdKey)!
                if (serviceId) {
                  const svcName =
                    (it?.service?.name && String(it.service.name).trim()) ||
                    nameByServiceId.get(serviceId) ||
                    'Serviciu'
                  const prev = instSvcMap.get(serviceId)
                  instSvcMap.set(serviceId, {
                    name: svcName,
                    qty: (prev?.qty ?? 0) + qty / nShare,
                  })
                }

                // Urmărim și per tăviță pentru a calcula qtyInLucru/qtyInAsteptare
                if (!servicesByTechTrayInstrument.has(tid)) servicesByTechTrayInstrument.set(tid, new Map())
                const techTrayMap = servicesByTechTrayInstrument.get(tid)!
                if (!techTrayMap.has(trId)) techTrayMap.set(trId, new Map())
                const trayInstMap = techTrayMap.get(trId)!
                if (!trayInstMap.has(instrumentIdKey)) trayInstMap.set(instrumentIdKey, new Map())
                const trayInstSvcMap = trayInstMap.get(instrumentIdKey)!
                if (serviceId) {
                  const svcName =
                    (it?.service?.name && String(it.service.name).trim()) ||
                    nameByServiceId.get(serviceId) ||
                    'Serviciu'
                  const prevTray = trayInstSvcMap.get(serviceId)
                  trayInstSvcMap.set(serviceId, {
                    name: svcName,
                    qty: (prevTray?.qty ?? 0) + qty / nShare,
                  })
                }
              })
            }

            // Fallback pentru număr instrumente dacă nu există item-uri "instrument":
            // folosim max(qty) pe (trayId, instrumentId) din liniile de servicii/piese.
            const fallbackQty = participantIds.length > 0 ? qty / participantIds.length : 0
            participantIds.forEach((tid) => {
              if (!fallbackMaxQtyByTechTrayInstrument.has(tid)) fallbackMaxQtyByTechTrayInstrument.set(tid, new Map())
              const trayMap = fallbackMaxQtyByTechTrayInstrument.get(tid)!
              if (!trayMap.has(trId)) trayMap.set(trId, new Map())
              const instMap = trayMap.get(trId)!
              instMap.set(instrumentIdKey, Math.max(instMap.get(instrumentIdKey) ?? 0, fallbackQty))
            })
          }
        }

        // Fuzionăm qty-urile explicite cu fallback PER TĂVIȚĂ.
        // Pentru fiecare tăviță și instrument: dacă există qty explicit în acea tăviță, folosim explicit; dacă nu, folosim fallback.
        // Apoi adunăm peste toate tăvițele.
        for (const techId of techIds) {
          const explicitTrayMap = explicitQtyByTechTrayInstrument.get(techId) ?? new Map<string, Map<string, number>>()
          const fallbackTrayMap = fallbackMaxQtyByTechTrayInstrument.get(techId) ?? new Map<string, Map<string, number>>()
          
          // Colectăm toate tăvițele (din explicit și fallback)
          const allTrayIds = new Set<string>([...explicitTrayMap.keys(), ...fallbackTrayMap.keys()])
          
          const mergedQtyMap = new Map<string, number>()
          for (const trayId of allTrayIds) {
            const explicitInstMap = explicitTrayMap.get(trayId) ?? new Map<string, number>()
            const fallbackInstMap = fallbackTrayMap.get(trayId) ?? new Map<string, number>()
            
            // Colectăm toate instrumentele din această tăviță
            const allInstIds = new Set<string>([...explicitInstMap.keys(), ...fallbackInstMap.keys()])
            
            for (const instId of allInstIds) {
              // Dacă există qty explicit pentru acest instrument în această tăviță, folosim explicit; altfel fallback
              const qtyForThisTray = explicitInstMap.has(instId)
                ? (explicitInstMap.get(instId) ?? 0)
                : (fallbackInstMap.get(instId) ?? 0)
              
              if (qtyForThisTray > 0) {
                mergedQtyMap.set(instId, (mergedQtyMap.get(instId) ?? 0) + qtyForThisTray)
              }
            }
          }
          
          if (mergedQtyMap.size > 0) instrumentQtyByTech.set(techId, mergedQtyMap)
        }

        // Construim breakdown pe instrument per tehnician (nr / ron / est/act time)
        instrumentWorkByTechnician = {}
        for (const techId of techIds) {
          const qtyMap = instrumentQtyByTech.get(techId) ?? new Map()
          const ronMap = ronByTechInstrument.get(techId) ?? new Map()
          const estMap = estSecondsByTechInstrument.get(techId) ?? new Map()
          const svcMap = servicesByTechInstrument.get(techId) ?? new Map()
          const svcTrayMap = servicesByTechTrayInstrument.get(techId) ?? new Map()
          const explicitTrayMap = explicitQtyByTechTrayInstrument.get(techId) ?? new Map()
          const fallbackTrayMap = fallbackMaxQtyByTechTrayInstrument.get(techId) ?? new Map()

          // Timp real alocat proporțional pe baza timpului estimat per tăviță
          const actSecondsByInstrument = new Map<string, number>()
          const trayMap = time.traysByTechnician.get(techId) ?? new Map()
          const trayEstTotals = estSecondsByTechTray.get(techId) ?? new Map()
          const trayEstByInst = estSecondsByTechTrayInstrument.get(techId) ?? new Map()
          for (const [trayId, mins] of trayMap) {
            // mins sunt deja în minute (din trayMap), convertim la secunde
            const trayActSeconds = Math.max(0, (Number(mins) || 0) * 60)
            if (trayActSeconds <= 0) continue
            const estTotal = trayEstTotals.get(trayId) ?? 0
            const instMap = trayEstByInst.get(trayId) ?? new Map()
            if (estTotal > 0 && instMap.size > 0) {
              for (const [instId, estSec] of instMap) {
                const share = estSec > 0 ? trayActSeconds * (estSec / estTotal) : 0
                if (share > 0) actSecondsByInstrument.set(instId, (actSecondsByInstrument.get(instId) ?? 0) + share)
              }
            }
          }

          // Calculăm qty per status (în lucru / în așteptare) pentru instrumente
          const qtyInLucruByInstrument = new Map<string, number>()
          const qtyInAsteptareByInstrument = new Map<string, number>()
          const allTrayIdsForTech = new Set<string>([...explicitTrayMap.keys(), ...fallbackTrayMap.keys()])
          for (const trayId of allTrayIdsForTech) {
            const stageInfo = trayCurrentStage.get(trayId)
            const isInLucru = stageInfo?.isInLucru ?? false
            const isInAsteptare = stageInfo?.isInAsteptare ?? false
            if (!isInLucru && !isInAsteptare) continue // Tăviță finalizată, nu contorizăm
            
            const explicitInstMap = explicitTrayMap.get(trayId) ?? new Map()
            const fallbackInstMap = fallbackTrayMap.get(trayId) ?? new Map()
            const allInstIds = new Set<string>([...explicitInstMap.keys(), ...fallbackInstMap.keys()])
            
            for (const instId of allInstIds) {
              const qtyForTray = explicitInstMap.has(instId)
                ? (explicitInstMap.get(instId) ?? 0)
                : (fallbackInstMap.get(instId) ?? 0)
              
              if (qtyForTray > 0) {
                if (isInLucru) {
                  qtyInLucruByInstrument.set(instId, (qtyInLucruByInstrument.get(instId) ?? 0) + qtyForTray)
                } else if (isInAsteptare) {
                  qtyInAsteptareByInstrument.set(instId, (qtyInAsteptareByInstrument.get(instId) ?? 0) + qtyForTray)
                }
              }
            }
          }

          // Calculăm qty per status pentru servicii
          const svcQtyInLucruByInstrument = new Map<string, Map<string, number>>() // instrumentId -> serviceId -> qty
          const svcQtyInAsteptareByInstrument = new Map<string, Map<string, number>>()
          for (const [trayId, instMap] of svcTrayMap) {
            const stageInfo = trayCurrentStage.get(trayId)
            const isInLucru = stageInfo?.isInLucru ?? false
            const isInAsteptare = stageInfo?.isInAsteptare ?? false
            if (!isInLucru && !isInAsteptare) continue
            
            for (const [instId, svcIdMap] of instMap) {
              for (const [svcId, svcData] of svcIdMap) {
                if (isInLucru) {
                  if (!svcQtyInLucruByInstrument.has(instId)) svcQtyInLucruByInstrument.set(instId, new Map())
                  const m = svcQtyInLucruByInstrument.get(instId)!
                  m.set(svcId, (m.get(svcId) ?? 0) + svcData.qty)
                } else if (isInAsteptare) {
                  if (!svcQtyInAsteptareByInstrument.has(instId)) svcQtyInAsteptareByInstrument.set(instId, new Map())
                  const m = svcQtyInAsteptareByInstrument.get(instId)!
                  m.set(svcId, (m.get(svcId) ?? 0) + svcData.qty)
                }
              }
            }
          }

          // Domeniu instrumente: orice apare în qty/ron/est/act
          const allKeys = new Set<string>([
            ...Array.from(qtyMap.keys()),
            ...Array.from(ronMap.keys()),
            ...Array.from(estMap.keys()),
            ...Array.from(actSecondsByInstrument.keys()),
          ])

          const rows: TehnicianInstrumentWork[] = []
          for (const key of allKeys) {
            const qty = qtyMap.get(key) ?? 0
            const qtyInLucru = qtyInLucruByInstrument.get(key) ?? 0
            const qtyInAsteptare = qtyInAsteptareByInstrument.get(key) ?? 0
            const ron = ronMap.get(key) ?? 0
            const estSeconds = estMap.get(key) ?? 0
            const actSeconds = actSecondsByInstrument.get(key) ?? 0
            const name = instrumentNameByKey.get(key) || (key === '__unknown__' ? 'Instrument necunoscut' : 'Instrument')
            
            // Servicii cu qty per status
            const svcInLucruMap = svcQtyInLucruByInstrument.get(key) ?? new Map()
            const svcInAsteptareMap = svcQtyInAsteptareByInstrument.get(key) ?? new Map()
            const services = Array.from((svcMap.get(key) ?? new Map()).entries())
              .map(([serviceId, v]) => ({
                serviceId,
                serviceName: v.name,
                qty: v.qty,
                qtyInLucru: svcInLucruMap.get(serviceId) ?? 0,
                qtyInAsteptare: svcInAsteptareMap.get(serviceId) ?? 0,
              }))
              .sort((a, b) => (b.qty ?? 0) - (a.qty ?? 0))
            
            rows.push({
              instrumentId: key === '__unknown__' ? null : key,
              instrumentName: name,
              qty,
              qtyInLucru,
              qtyInAsteptare,
              ronEst: Math.round(ron * 100) / 100,
              ronAct: Math.round(ron * 100) / 100,
              estSeconds: Math.round(estSeconds),
              actSeconds: Math.round(actSeconds),
              services,
            })
          }
          // sort: cele mai multe secunde reale, apoi RON
          rows.sort((a, b) => (b.actSeconds ?? 0) - (a.actSeconds ?? 0) || (b.ronAct ?? 0) - (a.ronAct ?? 0))
          instrumentWorkByTechnician[techId] = rows
        }

        traysByTechnician = {}
        for (const techId of techToTrays.keys()) {
          const trayIdSet = techToTrays.get(techId)!
          const list: TehnicianTrayWork[] = []
          for (const trayId of trayIdSet) {
            const t = trayById.get(trayId)
            if (!t) {
              // Tăviță ștearsă la reuniune (split → merge): afișăm din arhivă ca să corespundă numărul cu lista.
              const archived = mergedTrayInfoByChildId.get(trayId)
              if (!archived) continue
              const sfArchive = archived.serviceFileId ? serviceFileByIdForArchive.get(archived.serviceFileId) : null
              const clientNameArchive = sfArchive?.lead_id ? leadNameByIdForArchive.get(sfArchive.lead_id) ?? null : null
              const mins = time.traysByTechnician.get(techId)?.get(trayId) ?? 0
              const minsInAsteptare = timeAsteptare.traysByTechnician.get(techId)?.get(trayId) ?? 0
              list.push({
                trayId,
                trayNumber: archived.trayNumber,
                traySize: archived.traySize,
                serviceFileId: archived.serviceFileId,
                serviceFileNumber: sfArchive?.number ?? null,
                leadId: sfArchive?.lead_id ?? null,
                clientName: clientNameArchive ?? null,
                minutesInLucru: mins,
                minutesInAsteptare: minsInAsteptare,
                totalRon: 0,
                trayTotalRon: 0,
                currentStageId: null,
                currentStageName: null,
                isInLucru: false,
                isInAsteptare: false,
                isDeTrimis: false,
                isRidicPersonal: false,
                pipelineName: null,
                isReunita: true,
              })
              continue
            }
            const statusStr = String(t?.status ?? '')
            if (statusStr === '2' || statusStr === '3') continue
            const isSplitTray = t?.status === 'Splited' || (t?.parent_tray_id != null && t.parent_tray_id !== '')
            if (isSplitTray && t) {
              const assignedTechs = [t.technician_id, t.technician2_id, t.technician3_id].filter(Boolean) as string[]
              if (assignedTechs.length > 0 && !assignedTechs.includes(techId)) continue
            }
            const mins = time.traysByTechnician.get(techId)?.get(trayId) ?? 0
            const sfId = (t?.service_file_id ?? null) as string | null
            const sf = sfId ? serviceFileById.get(sfId) : null
            const clientName = sf?.lead_id ? leadNameById.get(sf.lead_id) ?? null : null
            const totalRon = totalByTechTray.get(techId)?.get(trayId)
            const trayTotalRon = totalByTrayAll.get(trayId)
            // Stage curent al tăviței
            const stageInfo = trayCurrentStage.get(trayId)
            // Minute în așteptare pentru această tăviță (alocate pe tehnician)
            const minsInAsteptare = timeAsteptare.traysByTechnician.get(techId)?.get(trayId) ?? 0
            list.push({
              trayId,
              trayNumber: t?.number ?? null,
              traySize: t?.size ?? null,
              serviceFileId: sfId,
              serviceFileNumber: sf?.number ?? null,
              leadId: sf?.lead_id ?? null,
              clientName,
              minutesInLucru: mins,
              minutesInAsteptare: minsInAsteptare,
              totalRon: Number.isFinite(totalRon) ? Math.round((totalRon as number) * 100) / 100 : 0,
              trayTotalRon: Number.isFinite(trayTotalRon) ? Math.round((trayTotalRon as number) * 100) / 100 : 0,
              currentStageId: stageInfo?.stageId ?? null,
              currentStageName: stageInfo?.stageName ?? null,
              isInLucru: stageInfo?.isInLucru ?? false,
              isInAsteptare: stageInfo?.isInAsteptare ?? false,
              isDeTrimis: stageInfo?.isDeTrimis ?? false,
              isRidicPersonal: stageInfo?.isRidicPersonal ?? false,
              pipelineName: stageInfo?.pipelineName ?? null,
            })
          }
          // sort: cele mai multe minute primele (fallback pe sumă)
          list.sort((a, b) => (b.minutesInLucru ?? 0) - (a.minutesInLucru ?? 0) || ((b.totalRon ?? 0) - (a.totalRon ?? 0)))
          traysByTechnician[techId] = list
        }

        // Atașăm suma totală pe tehnician (toate tăvițele: finalizate + în lucru + în așteptare)
        // IMPORTANT: Folosim totalRon (suma specifică tehnicianului), NU trayTotalRon (suma întreagă a tăviței)
        const totalRonByTech = new Map<string, number>()
        for (const [techId, list] of Object.entries(traysByTechnician)) {
          const allTrays = list || []
          const sum = allTrays.reduce((acc, x) => acc + (Number(x.totalRon) || 0), 0)
          totalRonByTech.set(techId, Math.round(sum * 100) / 100)
        }
        for (const s of stats) {
          if (totalRonByTech.has(s.technicianId)) {
            s.totalRon = totalRonByTech.get(s.technicianId) ?? 0
          }
          // Adăugăm minutele în lucru și în așteptare per tehnician
          s.minutesInLucru = time.minutesByTechnician.get(s.technicianId) ?? 0
          s.minutesInAsteptare = timeAsteptare.minutesByTechnician.get(s.technicianId) ?? 0
        }
      }
    }
  } catch {
    // best effort — nu blocăm dashboardul dacă nu putem încărca detaliile tăvițelor
  }

  return { stats, total, totalMinutesInLucru, totalMinutesInAsteptare, traysByTechnician, instrumentWorkByTechnician }
}

export type TehnicianDayStat = { date: string; count: number; /** Total minute tăvițe în „In lucru” în acea zi */ totalMinutesInLucru?: number }

/** Număr de tăvițe prelucrate pe fiecare zi dintr-un interval (dată -> count) + total minute „In lucru” per zi. */
export async function fetchTehnicianStatsByDayInRange(
  dateStart: Date,
  dateEnd: Date
): Promise<TehnicianDayStat[]> {
  const { finalizareIds } = await getCachedStageIds()
  if (finalizareIds.length === 0) return []

  const startStr = dateStart.toISOString()
  const endStr = dateEnd.toISOString()

  const [{ data: historyRows, error: historyErr }, { minutesByDay }] = await Promise.all([
    (supabase as any)
      .from('stage_history' as any)
      .select('moved_at, tray_id')
      .not('tray_id', 'is', null)
      .in('to_stage_id', finalizareIds)
      .gte('moved_at', startStr)
      .lte('moved_at', endStr),
    fetchTimeInLucruForRange(dateStart, dateEnd),
  ])

  if (historyErr || !historyRows?.length) return []

  const dayToTrays = new Map<string, Set<string>>()
  for (const r of historyRows as any[]) {
    const movedAt = r.moved_at as string
    const trayId = r.tray_id as string
    if (!movedAt || !trayId) continue
    const dateKey = dayKeyLocal(new Date(movedAt))
    if (!dayToTrays.has(dateKey)) dayToTrays.set(dateKey, new Set())
    dayToTrays.get(dateKey)!.add(trayId)
  }

  const allDates = new Set<string>([...dayToTrays.keys(), ...minutesByDay.keys()])
  const result: TehnicianDayStat[] = []
  for (const date of allDates) {
    const trays = dayToTrays.get(date)
    result.push({
      date,
      count: trays?.size ?? 0,
      totalMinutesInLucru: minutesByDay.get(date) ?? 0,
    })
  }
  result.sort((a, b) => a.date.localeCompare(b.date))
  return result
}

const MONTH_NAMES = ['Ian', 'Feb', 'Mar', 'Apr', 'Mai', 'Iun', 'Iul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export type TehnicianMonthOption = { year: number; month: number; label: string }

export function getTehnicianMonthOptions(lastN: number = 12): TehnicianMonthOption[] {
  const now = new Date()
  const items: TehnicianMonthOption[] = []
  for (let i = 0; i < lastN; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const y = d.getFullYear()
    const m = d.getMonth() + 1
    items.push({
      year: y,
      month: m,
      label: `${MONTH_NAMES[m - 1]} ${y}`,
    })
  }
  return items
}

export type TehnicianOption = { id: string; name: string }

/** Lista tehnicienilor (app_members cu role = technician) pentru filtre admin. Afișează name (numele/utilizatorului), nu id. */
export async function listTechniciansForDashboard(): Promise<TehnicianOption[]> {
  const { data, error } = await (supabase as any)
    .from('app_members')
    .select('user_id, name')
    .eq('role', 'technician')
    .order('name', { ascending: true })

  if (error || !data?.length) return []
  return (data as any[]).map((m: any) => {
    const displayName = m.name ?? (m as any).display_name ?? `Tehnician ${String(m.user_id).slice(0, 8)}`
    return {
      id: m.user_id as string,
      name: displayName as string,
    }
  })
}

/** Parametri pentru încărcarea consolidată a dashboard-ului. */
export type TehnicianDashboardFullParams = {
  period: 'day' | 'week' | 'month' | 'month-custom'
  selectedDate: Date
  selectedMonthKey: string
  includeTechnicians: boolean
  /** Dacă true, ignoră cache-ul sessionStorage (ex. la click pe Refresh) */
  forceRefresh?: boolean
}

/** Răspuns consolidat – un singur call returnează toate datele necesare. */
export type TehnicianDashboardFullResponse = {
  stats: TehnicianDashboardStats
  technicians: TehnicianOption[]
  dayData: {
    stats: TehnicianTrayStat[]
    total: number
    totalMinutesInLucru: number
    totalMinutesInAsteptare: number
    traysByTechnician?: Record<string, TehnicianTrayWork[]>
    instrumentWorkByTechnician?: Record<string, TehnicianInstrumentWork[]>
  } | null
  monthData: { stats: TehnicianTrayStat[]; total: number; totalMinutesInLucru: number } | null
  byDayList: TehnicianDayStat[]
}

const DASHBOARD_FULL_STORAGE_PREFIX = 'crm:dashboardFull:v1:'
const DASHBOARD_FULL_TTL_MS = 90 * 1000 // 90 sec – la refresh rapid, încărcare instant

/** Șterge cache-ul dashboard full din sessionStorage (la modificare pipelines/stages) */
export function clearDashboardFullCache() {
  if (typeof window === 'undefined') return
  try {
    const keys: string[] = []
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i)
      if (k?.startsWith(DASHBOARD_FULL_STORAGE_PREFIX)) keys.push(k)
    }
    keys.forEach((k) => sessionStorage.removeItem(k))
  } catch {
    // ignore
  }
}

/**
 * Încărcare consolidată: un singur RPC call care returnează TOATE datele necesare.
 * Reduce ~135 apeluri Supabase la 1 singur apel.
 * Fallback la metoda veche (multiple calluri) dacă RPC-ul nu e disponibil.
 * Cache în sessionStorage (TTL 90 sec).
 */
export async function fetchTehnicianDashboardFull(
  params: TehnicianDashboardFullParams
): Promise<TehnicianDashboardFullResponse> {
  const { period, selectedDate, selectedMonthKey, includeTechnicians, forceRefresh } = params

  const cacheKey = `${DASHBOARD_FULL_STORAGE_PREFIX}${period}:${selectedDate?.toISOString?.() ?? ''}:${selectedMonthKey}:${includeTechnicians}`
  if (!forceRefresh && typeof window !== 'undefined') {
    try {
      const raw = sessionStorage.getItem(cacheKey)
      if (raw) {
        const { ts, data } = JSON.parse(raw) as { ts: number; data: TehnicianDashboardFullResponse }
        if (Date.now() - ts < DASHBOARD_FULL_TTL_MS && data) {
          return data
        }
      }
    } catch {
      // ignore
    }
  }

  // BULK: Un singur RPC → procesare locală (~135 calluri → 1)
  try {
    const bulkResult = await fetchTehnicianDashboardBulk(params)
    if (bulkResult) {
      if (typeof window !== 'undefined') {
        try { sessionStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), data: bulkResult })) } catch { /* quota */ }
      }
      return bulkResult
    }
  } catch (err) {
    console.warn('[fetchTehnicianDashboardFull] Bulk RPC failed, falling back to legacy:', err)
  }

  // LEGACY FALLBACK: multiple apeluri individuale (dacă RPC-ul nu e disponibil)
  const fetchPeriodData = async () => {
    if (period === 'day') {
      const d = await fetchTehnicianStatsForDate(selectedDate)
      return {
        dayData: d,
        monthData: null as TehnicianDashboardFullResponse['monthData'],
        byDayList: [] as TehnicianDayStat[],
      }
    }
    if (period === 'month-custom' && selectedMonthKey) {
      const [y, m] = selectedMonthKey.split('-').map(Number)
      if (y && m) {
        const monthRes = await fetchTehnicianStatsForMonth(y, m)
        return {
          dayData: null,
          monthData: monthRes,
          byDayList: [],
        }
      }
    }
    if (period === 'week' || period === 'month' || (period === 'month-custom' && selectedMonthKey)) {
      let start: Date
      let end: Date
      if (period === 'week') {
        const b = weekBounds()
        start = b.start
        end = b.end
      } else if (period === 'month') {
        const b = monthBounds()
        start = b.start
        end = b.end
      } else {
        const [y, m] = selectedMonthKey.split('-').map(Number)
        if (!y || !m) return { dayData: null, monthData: null, byDayList: [] }
        start = new Date(y, m - 1, 1, 0, 0, 0, 0)
        end = new Date(y, m, 0, 23, 59, 59, 999)
      }
      const list = await fetchTehnicianStatsByDayInRange(start, end)
      return {
        dayData: null,
        monthData: null,
        byDayList: list,
      }
    }
    return { dayData: null, monthData: null, byDayList: [] }
  }

  const [stats, technicians, periodResult] = await Promise.all([
    fetchTehnicianDashboardStats(),
    includeTechnicians ? listTechniciansForDashboard() : Promise.resolve([]),
    fetchPeriodData(),
  ])

  const result: TehnicianDashboardFullResponse = {
    stats,
    technicians,
    dayData: periodResult.dayData,
    monthData: periodResult.monthData,
    byDayList: periodResult.byDayList,
  }

  if (typeof window !== 'undefined') {
    try {
      sessionStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), data: result }))
    } catch {
      // quota
    }
  }

  return result
}
