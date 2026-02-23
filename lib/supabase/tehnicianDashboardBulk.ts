/**
 * Procesare BULK a dashboard-ului tehnicieni.
 * Un singur RPC returnează TOATE datele, apoi totul se procesează local.
 * Reduce ~135 apeluri Supabase la 1.
 */
import { supabaseBrowser } from './supabaseClient'
import { DEPARTMENT_PIPELINES, matchesStagePattern } from './kanban/constants'
import { parseServiceTimeToSeconds } from '@/lib/utils/service-time'
import type {
  TehnicianDashboardFullParams,
  TehnicianDashboardFullResponse,
  TehnicianDashboardStats,
  TehnicianTrayStat,
  TehnicianTrayWork,
  TehnicianInstrumentWork,
  TehnicianDayStat,
  TehnicianOption,
} from './tehnicianDashboard'

// ==================== TYPES ====================

type BulkRawData = {
  pipelines: any[]
  stages: any[]
  stage_history: any[]
  trays: any[]
  tray_items: any[]
  services: any[]
  parts: any[]
  instruments: any[]
  pipeline_items: any[]
  service_files: any[]
  leads: any[]
  app_members: any[]
  members: any[]
  arhiva_tavite_unite: any[]
}

type StageIdsResult = {
  finalizareIds: string[]
  inLucruIds: string[]
  inAsteptareIds: string[]
  receptieFinalizateIds: string[]
}

type TrayTechWeightsResult = {
  participantsByTray: Map<string, Set<string>>
  weightSecondsByTrayTech: Map<string, Map<string, number>>
}

type TimeInStageResult = {
  minutesByTechnician: Map<string, number>
  minutesByDay: Map<string, number>
  trayMinutes: Map<string, number>
  traysByTechnician: Map<string, Map<string, number>>
}

// ==================== HELPERS ====================

const toSlug = (s: string) => String(s || '').toLowerCase().replace(/\s+/g, '-')

function dayKeyLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function dayBounds(): { start: Date; end: Date } {
  const end = new Date(); end.setHours(23, 59, 59, 999)
  const start = new Date(); start.setHours(0, 0, 0, 0)
  return { start, end }
}
function weekBounds(): { start: Date; end: Date } {
  const end = new Date(); end.setHours(23, 59, 59, 999)
  const start = new Date(); start.setHours(0, 0, 0, 0)
  const d = start.getDay(); const diff = start.getDate() - d + (d === 0 ? -6 : 1)
  start.setDate(diff)
  return { start, end }
}
function monthBounds(): { start: Date; end: Date } {
  const end = new Date(); end.setHours(23, 59, 59, 999)
  const start = new Date(); start.setHours(0, 0, 0, 0); start.setDate(1)
  return { start, end }
}

// ==================== STAGE IDS ====================

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
      const isDept = DEPARTMENT_PIPELINES.some((d) => toSlug(d) === slug || slug.includes(toSlug(d)))
      if (!isDept) continue
    }
    const stages = (p as any).stages || []
    for (const s of stages) {
      const sn = (s as any).name || ''
      const matches = patterns.some((pat) => matchesStagePattern(sn, pat as any))
      if (matches) ids.push((s as any).id)
    }
  }
  return [...new Set(ids)]
}

function resolveStageIds(bulk: BulkRawData): StageIdsResult {
  const pipelinesWithStages = bulk.pipelines.map(p => ({
    ...p,
    stages: bulk.stages.filter(s => String(s.pipeline_id) === String(p.id)),
  }))
  return {
    finalizareIds: extractStageIdsFromPipelines(pipelinesWithStages, { deptOnly: true, pattern: 'FINALIZARE' }),
    inLucruIds: extractStageIdsFromPipelines(pipelinesWithStages, { deptOnly: true, pattern: 'IN_LUCRU' }),
    inAsteptareIds: extractStageIdsFromPipelines(pipelinesWithStages, { deptOnly: true, pattern: 'IN_ASTEPTARE' }),
    receptieFinalizateIds: extractStageIdsFromPipelines(pipelinesWithStages, { receptieOnly: true, pattern: ['DE_TRIMIS', 'RIDIC_PERSONAL'] }),
  }
}

// ==================== ALLOCATION ====================

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

  if (!Number.isFinite(totalWeight) || totalWeight <= 0) {
    const base = Math.floor(mins / ids.length)
    let rem = mins - base * ids.length
    for (const tid of ids) {
      const add = rem > 0 ? 1 : 0; if (rem > 0) rem -= 1
      out.set(tid, base + add)
    }
    return out
  }

  const parts = ids.map((tid) => {
    const w = Math.max(0, Number(weights.get(tid) ?? 0) || 0)
    const exact = (mins * w) / totalWeight
    const base = Math.floor(exact)
    return { tid, base, frac: exact - base }
  })
  let used = parts.reduce((acc, p) => acc + p.base, 0)
  let rem = Math.max(0, mins - used)
  parts.sort((a, b) => b.frac - a.frac)
  for (const p of parts) {
    const add = rem > 0 ? 1 : 0; if (rem > 0) rem -= 1
    out.set(p.tid, p.base + add)
  }
  for (const [k, v] of out) out.set(k, Math.max(0, Math.floor(Number(v) || 0)))
  return out
}

// ==================== TRAY PARTICIPANTS & WEIGHTS ====================

function computeParticipantsAndWeights(
  trayIds: string[],
  bulk: BulkRawData
): TrayTechWeightsResult {
  const ids = trayIds.filter(Boolean)
  if (ids.length === 0) return { participantsByTray: new Map(), weightSecondsByTrayTech: new Map() }

  const idSet = new Set(ids)
  const safeItems = bulk.tray_items.filter(ti => idSet.has(String(ti.tray_id)))

  const timeByServiceIdSeconds = new Map<string, number>()
  const instrumentIdByServiceId = new Map<string, string>()
  const svcIds = new Set(safeItems.map(it => it?.service_id).filter(Boolean).map(String))
  for (const s of bulk.services) {
    if (!svcIds.has(String(s.id))) continue
    const sec = parseServiceTimeToSeconds(s?.time)
    if (sec > 0) timeByServiceIdSeconds.set(String(s.id), sec)
    if (s?.instrument_id) instrumentIdByServiceId.set(String(s.id), String(s.instrument_id))
  }

  const trayToTechs = new Map<string, Set<string>>()
  for (const t of bulk.trays) {
    if (!idSet.has(String(t.id))) continue
    const set = new Set<string>()
    if (t?.technician_id) set.add(String(t.technician_id))
    if (t?.technician2_id) set.add(String(t.technician2_id))
    if (t?.technician3_id) set.add(String(t.technician3_id))
    if (set.size > 0) trayToTechs.set(String(t.id), set)
  }
  for (const it of safeItems) {
    const trayId = String(it?.tray_id)
    const itemTechId = it?.technician_id ? String(it.technician_id) : null
    if (!trayId || !itemTechId) continue
    if (!trayToTechs.has(trayId)) trayToTechs.set(trayId, new Set())
    trayToTechs.get(trayId)!.add(itemTechId)
  }

  const trayInstrumentToTechs = new Map<string, Map<string, Set<string>>>()
  const getItemType = (it: any): 'service' | 'part' | null => {
    let notes: any = {}
    if (it?.notes) { try { notes = JSON.parse(it.notes) } catch { notes = {} } }
    const itemType = notes?.item_type || (it?.part_id ? 'part' : it?.service_id ? 'service' : null)
    return itemType === 'service' || itemType === 'part' ? itemType : null
  }
  const getInstrumentIdKey = (it: any, itemType: 'service' | 'part' | null): string => {
    const trayItemInstrumentId = (it?.instrument_id ? String(it.instrument_id) : null)
    const serviceId = String(it?.service_id || '')
    const serviceInstrumentId = itemType === 'service' ? (instrumentIdByServiceId.get(serviceId) ?? null) : null
    return trayItemInstrumentId || serviceInstrumentId || '__unknown__'
  }

  for (const it of safeItems) {
    const trayId = String(it?.tray_id)
    if (!trayId) continue
    const techs = trayToTechs.get(trayId)
    if (!techs || techs.size === 0) continue
    const itemType = getItemType(it)
    const instrumentIdKey = getInstrumentIdKey(it, itemType)
    if (!trayInstrumentToTechs.has(trayId)) trayInstrumentToTechs.set(trayId, new Map())
    const instMap = trayInstrumentToTechs.get(trayId)!
    if (!instMap.has(instrumentIdKey)) instMap.set(instrumentIdKey, new Set())
    if (it?.technician_id && techs.has(String(it.technician_id))) {
      instMap.get(instrumentIdKey)!.add(String(it.technician_id))
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
    const trayId = String(it?.tray_id)
    if (!trayId) continue
    const qty = Math.floor(Number(it?.qty ?? 0) || 0)
    if (qty <= 0) continue
    const itemType = getItemType(it)
    const instrumentIdKey = getInstrumentIdKey(it, itemType)
    const trayTechs = trayToTechs.get(trayId)
    let tid = (it?.technician_id && trayTechs?.has(String(it.technician_id)))
      ? String(it.technician_id)
      : inferTechnicianId(trayId, instrumentIdKey)
    const participantIds = tid ? [tid] : (trayTechs && trayTechs.size > 0 ? Array.from(trayTechs) : [])
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
    participantIds.forEach((id) => { byTech.set(id, (byTech.get(id) ?? 0) + sharePerTech) })
  }

  return { participantsByTray, weightSecondsByTrayTech }
}

// ==================== TRAY → PRIMARY TECHNICIAN ====================

function getTrayToPrimaryTechMap(trayIds: string[], bulk: BulkRawData): Map<string, string> {
  const idSet = new Set(trayIds)
  const result = new Map<string, string>()
  for (const t of bulk.trays) {
    const trayId = String(t?.id)
    if (!idSet.has(trayId)) continue
    const techIds = [t?.technician_id, t?.technician2_id, t?.technician3_id].filter(Boolean).map(String)
    const isSplitChild = t?.status === 'Splited' || (t?.parent_tray_id != null && String(t.parent_tray_id).trim() !== '')
    if (isSplitChild && techIds.length >= 1) {
      result.set(trayId, techIds[0])
    } else if (techIds.length === 1) {
      result.set(trayId, techIds[0])
    }
  }
  return result
}

// ==================== EXECUTION MINUTES ====================

function computeExecutionMinutes(
  trayIds: string[],
  stageIds: StageIdsResult,
  bulk: BulkRawData
): Map<string, number> {
  const ids = trayIds.filter(Boolean)
  if (ids.length === 0) return new Map()

  const inLucruSet = new Set(stageIds.inLucruIds.map(String))
  const finalizareSet = new Set(stageIds.finalizareIds.map(String))
  const relevantSet = new Set([...inLucruSet, ...finalizareSet])
  if (relevantSet.size === 0) return new Map()

  const idSet = new Set(ids)
  const rows = bulk.stage_history
    .filter(sh => idSet.has(String(sh.tray_id)) && relevantSet.has(String(sh.to_stage_id)))
    .sort((a: any, b: any) => (a.moved_at || '').localeCompare(b.moved_at || ''))

  const byTray = new Map<string, Array<{ to_stage_id: string; moved_at: string }>>()
  for (const r of rows) {
    const trayId = String(r.tray_id)
    const toStageId = String(r.to_stage_id)
    const movedAt = r.moved_at as string
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
        if (ts <= lastFinalAt! && inLucruSet.has(row.to_stage_id)) lastInLucruBeforeFinal = ts
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

// ==================== TIME IN STAGE (lucru / asteptare) ====================

function computeTimeInStage(
  dateStart: Date,
  dateEnd: Date,
  stageIdSet: Set<string>,
  bulk: BulkRawData
): { trayMinutes: Map<string, number>; minutesByDay: Map<string, number> } {
  const rangeStartMs = dateStart.getTime()
  const rangeEndMs = dateEnd.getTime()
  const startStr = dateStart.toISOString()
  const endStr = dateEnd.toISOString()

  const rows = bulk.stage_history.filter(sh => {
    if (!sh.tray_id) return false
    const movedAt = sh.moved_at as string
    if (!movedAt || movedAt < startStr || movedAt > endStr) return false
    const toId = String(sh.to_stage_id ?? '')
    const fromId = String(sh.from_stage_id ?? '')
    return stageIdSet.has(toId) || stageIdSet.has(fromId)
  }).sort((a: any, b: any) => (a.moved_at || '').localeCompare(b.moved_at || ''))

  if (rows.length === 0) return { trayMinutes: new Map(), minutesByDay: new Map() }

  const byTray = new Map<string, Array<{ from_stage_id: string | null; to_stage_id: string; moved_at: string }>>()
  for (const r of rows) {
    const trayId = String(r.tray_id)
    const fromId = r.from_stage_id ? String(r.from_stage_id) : null
    const toId = String(r.to_stage_id)
    const movedAt = r.moved_at as string
    if (!trayId || !movedAt) continue
    const isEnter = stageIdSet.has(toId)
    const isLeave = fromId ? stageIdSet.has(fromId) : false
    if (!isEnter && !isLeave) continue
    if (!byTray.has(trayId)) byTray.set(trayId, [])
    byTray.get(trayId)!.push({ from_stage_id: fromId, to_stage_id: toId, moved_at: movedAt })
  }

  for (const events of byTray.values()) {
    events.sort((a, b) => {
      const c = (a.moved_at || '').localeCompare(b.moved_at || '')
      if (c !== 0) return c
      const aLeave = a.from_stage_id != null && stageIdSet.has(a.from_stage_id)
      const bLeave = b.from_stage_id != null && stageIdSet.has(b.from_stage_id)
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
      if (stageIdSet.has(ev.to_stage_id)) { if (intervalStart === null) intervalStart = ts }
      if (ev.from_stage_id && stageIdSet.has(ev.from_stage_id) && intervalStart !== null) {
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

  const minutesByDay = new Map<string, number>()
  const now = new Date()
  const todayKey = dayKeyLocal(now)
  const todayStartMs = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0).getTime()
  const rangeIncludesToday = rangeEndMs >= todayStartMs

  for (const [_trayId, events] of byTray) {
    let intervalStart: number | null = null
    for (const ev of events) {
      const ts = new Date(ev.moved_at).getTime()
      if (!Number.isFinite(ts)) continue
      if (stageIdSet.has(ev.to_stage_id)) { if (intervalStart === null) intervalStart = ts }
      if (ev.from_stage_id && stageIdSet.has(ev.from_stage_id) && intervalStart !== null) {
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

  return { trayMinutes, minutesByDay }
}

function addIntervalToMinutesByDay(startMs: number, endMs: number, minutesByDay: Map<string, number>, rangeStartMs: number, rangeEndMs: number) {
  const start = Math.max(startMs, rangeStartMs)
  const end = Math.min(endMs, rangeEndMs)
  if (end <= start) return
  let d = new Date(start); d.setHours(0, 0, 0, 0)
  const endDate = new Date(end); endDate.setHours(23, 59, 59, 999)
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

// ==================== FULL TIME IN LUCRU ====================

function computeFullTimeInLucru(
  dateStart: Date,
  dateEnd: Date,
  stageIds: StageIdsResult,
  bulk: BulkRawData
): TimeInStageResult {
  const inLucruSet = new Set(stageIds.inLucruIds.map(String))
  if (inLucruSet.size === 0) return { minutesByTechnician: new Map(), minutesByDay: new Map(), trayMinutes: new Map(), traysByTechnician: new Map() }

  const { trayMinutes, minutesByDay } = computeTimeInStage(dateStart, dateEnd, inLucruSet, bulk)
  const trayIds = Array.from(trayMinutes.keys())
  if (trayIds.length === 0) return { minutesByTechnician: new Map(), minutesByDay, trayMinutes, traysByTechnician: new Map() }

  const trayExecutionMinutesMap = computeExecutionMinutes(trayIds, stageIds, bulk)
  const trayToPrimaryTechnician = getTrayToPrimaryTechMap(trayIds, bulk)

  const traysByTechnician = new Map<string, Map<string, number>>()
  const minutesByTechnician = new Map<string, number>()
  const assignedByTrayTech = new Set<string>()

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

  const unassignedTrayIds = trayIds.filter((id) => !assignedByTrayTech.has(id))
  if (unassignedTrayIds.length > 0) {
    const { participantsByTray, weightSecondsByTrayTech } = computeParticipantsAndWeights(unassignedTrayIds, bulk)
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

// ==================== FULL TIME IN ASTEPTARE ====================

function computeFullTimeInAsteptare(
  dateStart: Date,
  dateEnd: Date,
  stageIds: StageIdsResult,
  bulk: BulkRawData
): { minutesByTechnician: Map<string, number>; trayMinutes: Map<string, number>; traysByTechnician: Map<string, Map<string, number>> } {
  const inAsteptareSet = new Set(stageIds.inAsteptareIds.map(String))
  if (inAsteptareSet.size === 0) return { minutesByTechnician: new Map(), trayMinutes: new Map(), traysByTechnician: new Map() }

  const { trayMinutes } = computeTimeInStage(dateStart, dateEnd, inAsteptareSet, bulk)
  const trayIds = Array.from(trayMinutes.keys())
  if (trayIds.length === 0) return { minutesByTechnician: new Map(), trayMinutes, traysByTechnician: new Map() }

  const { participantsByTray, weightSecondsByTrayTech } = computeParticipantsAndWeights(trayIds, bulk)
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

// ==================== STATS FOR RANGE ====================

function sumExecutionMinutesUniqueTrays(traysByTechnician: Map<string, Map<string, number>>): number {
  let sum = 0
  const seen = new Set<string>()
  for (const m of traysByTechnician.values()) {
    for (const [trayId, mins] of m) {
      if (!seen.has(trayId)) { seen.add(trayId); sum += mins }
    }
  }
  return sum
}

function buildStatsForRange(
  dateStart: Date,
  dateEnd: Date,
  stageIds: StageIdsResult,
  bulk: BulkRawData,
  preFetchedTime?: Pick<TimeInStageResult, 'minutesByTechnician' | 'traysByTechnician'>
): { stats: TehnicianTrayStat[]; techToTrays: Map<string, Set<string>> } {
  const { minutesByTechnician, traysByTechnician: traysInLucruByTech } = preFetchedTime ?? computeFullTimeInLucru(dateStart, dateEnd, stageIds, bulk)

  const techToTrays = new Map<string, Set<string>>()
  const trayIdsFromLucru = new Set<string>()
  for (const [, trayMap] of traysInLucruByTech) {
    for (const trayId of trayMap.keys()) if (trayId) trayIdsFromLucru.add(trayId)
  }

  const traysMetaById = new Map<string, { technician_ids: string[]; isSplit: boolean; isParent: boolean }>()
  for (const t of bulk.trays) {
    const tid = String(t.id)
    if (!trayIdsFromLucru.has(tid)) continue
    const techIds = [t?.technician_id, t?.technician2_id, t?.technician3_id].filter(Boolean).map(String)
    const isSplit = t?.status === 'Splited' || (t?.parent_tray_id != null && String(t.parent_tray_id).trim() !== '')
    const statusStr = String(t?.status ?? '')
    const isParent = statusStr === '2' || statusStr === '3'
    traysMetaById.set(tid, { technician_ids: techIds, isSplit, isParent })
  }

  for (const [techId, trayMap] of traysInLucruByTech) {
    if (!techToTrays.has(techId)) techToTrays.set(techId, new Set())
    for (const trayId of trayMap.keys()) {
      if (!trayId) continue
      const meta = traysMetaById.get(trayId)
      if (meta?.isParent) continue
      if (meta?.isSplit && meta.technician_ids.length > 0 && !meta.technician_ids.includes(techId)) continue
      techToTrays.get(techId)!.add(trayId)
    }
  }

  for (const trayId of trayIdsFromLucru) {
    const meta = traysMetaById.get(trayId)
    if (!meta?.technician_ids?.length || meta.isParent) continue
    for (const techId of meta.technician_ids) {
      if (!techToTrays.has(techId)) techToTrays.set(techId, new Set())
      techToTrays.get(techId)!.add(trayId)
    }
  }

  // Replace parent trays with child trays
  const allTrayIdsInTechToTrays = new Set<string>()
  for (const set of techToTrays.values()) for (const id of set) allTrayIdsInTechToTrays.add(id)
  if (allTrayIdsInTechToTrays.size > 0) {
    const parentsToReplace = new Set<string>()
    for (const t of bulk.trays) {
      const tid = String(t.id)
      if (!allTrayIdsInTechToTrays.has(tid)) continue
      const statusStr = String(t?.status ?? '')
      if (statusStr === '2' || statusStr === '3') parentsToReplace.add(tid)
    }
    if (parentsToReplace.size > 0) {
      const childTraysForParent = bulk.trays.filter(t => parentsToReplace.has(String(t.parent_tray_id)))
      for (const [techId, set] of techToTrays) {
        for (const parentId of parentsToReplace) {
          if (!set.has(parentId)) continue
          set.delete(parentId)
          for (const c of childTraysForParent) {
            const cid = String(c.id)
            const cTechIds = [c?.technician_id, c?.technician2_id, c?.technician3_id].filter(Boolean).map(String)
            if (cTechIds.includes(techId)) set.add(cid)
          }
        }
      }
    }
  }

  const techIdsFromLucru = Array.from(minutesByTechnician.keys())
  for (const tid of techIdsFromLucru) {
    if (!techToTrays.has(tid)) techToTrays.set(tid, new Set())
  }

  const techIds = Array.from(techToTrays.keys())
  if (techIds.length === 0) return { stats: [], techToTrays }

  const nameById = new Map<string, string>()
  for (const m of bulk.app_members) {
    const rawName = (m.name && String(m.name).trim()) || null
    if (rawName && techIds.includes(String(m.user_id))) nameById.set(String(m.user_id), rawName)
  }
  for (const m of bulk.members) {
    const dn = m?.display_name && String(m.display_name).trim()
    if (dn && !nameById.has(String(m.user_id))) nameById.set(String(m.user_id), dn)
  }

  const result: TehnicianTrayStat[] = []
  for (const techId of techIds) {
    const trays = techToTrays.get(techId)!
    result.push({
      technicianId: techId,
      technicianName: nameById.get(techId) || `Tehnician ${techId.slice(0, 8)}`,
      count: trays.size,
      minutesInLucru: minutesByTechnician.get(techId) ?? 0,
    })
  }
  result.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count
    return (b.minutesInLucru ?? 0) - (a.minutesInLucru ?? 0)
  })
  return { stats: result, techToTrays }
}

// ==================== DAY STATS (by day in range) ====================

function buildDayStatsList(
  dateStart: Date,
  dateEnd: Date,
  stageIds: StageIdsResult,
  bulk: BulkRawData
): TehnicianDayStat[] {
  const finalizareSet = new Set(stageIds.finalizareIds.map(String))
  if (finalizareSet.size === 0) return []

  const startStr = dateStart.toISOString()
  const endStr = dateEnd.toISOString()

  const historyRows = bulk.stage_history.filter(sh =>
    sh.tray_id && finalizareSet.has(String(sh.to_stage_id)) && sh.moved_at >= startStr && sh.moved_at <= endStr
  )

  const { minutesByDay } = computeFullTimeInLucru(dateStart, dateEnd, stageIds, bulk)

  const dayToTrays = new Map<string, Set<string>>()
  for (const r of historyRows) {
    const movedAt = r.moved_at as string
    const trayId = String(r.tray_id)
    if (!movedAt || !trayId) continue
    const dateKey = dayKeyLocal(new Date(movedAt))
    if (!dayToTrays.has(dateKey)) dayToTrays.set(dateKey, new Set())
    dayToTrays.get(dateKey)!.add(trayId)
  }

  const allDates = new Set<string>([...dayToTrays.keys(), ...minutesByDay.keys()])
  const result: TehnicianDayStat[] = []
  for (const date of allDates) {
    const trays = dayToTrays.get(date)
    result.push({ date, count: trays?.size ?? 0, totalMinutesInLucru: minutesByDay.get(date) ?? 0 })
  }
  result.sort((a, b) => a.date.localeCompare(b.date))
  return result
}

// ==================== FULL DAY DATA (detailed) ====================

function buildDetailedDayData(
  date: Date,
  stageIds: StageIdsResult,
  bulk: BulkRawData
): {
  stats: TehnicianTrayStat[]
  total: number
  totalMinutesInLucru: number
  totalMinutesInAsteptare: number
  traysByTechnician?: Record<string, TehnicianTrayWork[]>
  instrumentWorkByTechnician?: Record<string, TehnicianInstrumentWork[]>
} {
  const start = new Date(date); start.setHours(0, 0, 0, 0)
  const end = new Date(date); end.setHours(23, 59, 59, 999)

  const statsResult = buildStatsForRange(start, end, stageIds, bulk)
  const time = computeFullTimeInLucru(start, end, stageIds, bulk)
  const timeAsteptare = computeFullTimeInAsteptare(start, end, stageIds, bulk)

  const stats = statsResult.stats
  const techToTrays = statsResult.techToTrays
  const total = stats.reduce((acc, x) => acc + x.count, 0)
  const totalMinutesInLucru = sumExecutionMinutesUniqueTrays(time.traysByTechnician)
  const totalMinutesInAsteptare = Array.from(timeAsteptare.minutesByTechnician.values()).reduce((a, b) => a + b, 0)

  let traysByTechnician: Record<string, TehnicianTrayWork[]> | undefined = undefined
  let instrumentWorkByTechnician: Record<string, TehnicianInstrumentWork[]> | undefined = undefined

  try {
    const allTrayIds = new Set<string>()
    for (const m of time.traysByTechnician.values()) for (const trayId of m.keys()) allTrayIds.add(trayId)
    for (const trayIdSet of techToTrays.values()) for (const trayId of trayIdSet) allTrayIds.add(trayId)

    // Add receptie finalizate trays
    if (stageIds.receptieFinalizateIds.length > 0) {
      const rfSet = new Set(stageIds.receptieFinalizateIds.map(String))
      const receptieTrayIds = bulk.pipeline_items
        .filter(pi => rfSet.has(String(pi.stage_id)))
        .map(pi => String(pi.item_id))
      for (const trayId of receptieTrayIds) {
        allTrayIds.add(trayId)
        const t = bulk.trays.find(t => String(t.id) === trayId)
        if (t) {
          const techIds = [t?.technician_id, t?.technician2_id, t?.technician3_id].filter(Boolean).map(String)
          for (const techId of techIds) {
            if (!time.traysByTechnician.has(techId)) time.traysByTechnician.set(techId, new Map())
            if (!time.traysByTechnician.get(techId)!.has(trayId)) time.traysByTechnician.get(techId)!.set(trayId, 0)
          }
        }
      }
    }

    const trayIds = Array.from(allTrayIds)
    if (trayIds.length > 0) {
      const trayIdSet = new Set(trayIds)
      const trayById = new Map<string, any>()
      for (const t of bulk.trays) { if (trayIdSet.has(String(t.id))) trayById.set(String(t.id), t) }

      // Build lookup maps
      const servicesById = new Map(bulk.services.map(s => [String(s.id), s]))
      const partsById = new Map((bulk.parts || []).map((p: any) => [String(p.id), p]))
      const instrumentsById = new Map(bulk.instruments.map(i => [String(i.id), i]))
      const stagesById = new Map(bulk.stages.map(s => [String(s.id), s]))
      const pipelinesById = new Map(bulk.pipelines.map(p => [String(p.id), p]))

      // Pipeline items for current stage
      const trayCurrentStage = new Map<string, { stageId: string; stageName: string; pipelineId: string | null; pipelineName: string | null; isInLucru: boolean; isInAsteptare: boolean; isDeTrimis: boolean; isRidicPersonal: boolean }>()
      for (const pi of bulk.pipeline_items) {
        const itemId = String(pi.item_id)
        if (!trayIdSet.has(itemId)) continue
        const stageId = String(pi.stage_id ?? '')
        const stage = stagesById.get(stageId)
        const stageName = stage?.name ?? ''
        const pipeline = pipelinesById.get(String(pi.pipeline_id))
        const pipelineName = pipeline?.name ? String(pipeline.name) : null
        trayCurrentStage.set(itemId, {
          stageId,
          stageName,
          pipelineId: String(pi.pipeline_id ?? ''),
          pipelineName,
          isInLucru: matchesStagePattern(stageName, 'IN_LUCRU'),
          isInAsteptare: matchesStagePattern(stageName, 'IN_ASTEPTARE'),
          isDeTrimis: matchesStagePattern(stageName, 'DE_TRIMIS'),
          isRidicPersonal: matchesStagePattern(stageName, 'RIDIC_PERSONAL'),
        })
      }

      // Service files & leads
      const serviceFileById = new Map<string, any>()
      for (const sf of bulk.service_files) serviceFileById.set(String(sf.id), sf)
      const leadNameById = new Map<string, string>()
      for (const l of bulk.leads) {
        const name = (l.full_name && String(l.full_name).trim()) || (l.company_name && String(l.company_name).trim()) || null
        if (name) leadNameById.set(String(l.id), name)
      }

      // Arhiva tavite unite
      const mergedTrayInfoByChildId = new Map<string, { trayNumber: string | null; serviceFileId: string | null; parentTrayId: string | null }>()
      const foundTrayIds = new Set(trayById.keys())
      const missingTrayIds = trayIds.filter(id => !foundTrayIds.has(id))
      if (missingTrayIds.length > 0) {
        const missingSet = new Set(missingTrayIds)
        for (const row of bulk.arhiva_tavite_unite) {
          const childIds = (row?.child_tray_ids || []) as string[]
          const childNumbers = (row?.child_tray_numbers || []) as string[]
          for (let i = 0; i < childIds.length; i++) {
            const cid = String(childIds[i])
            if (!missingSet.has(cid)) continue
            mergedTrayInfoByChildId.set(cid, {
              trayNumber: childNumbers[i] != null && childNumbers[i] !== '' ? String(childNumbers[i]) : null,
              serviceFileId: row?.service_file_id ? String(row.service_file_id) : null,
              parentTrayId: row?.parent_tray_id ? String(row.parent_tray_id) : null,
            })
          }
        }
      }

      // RON, instrument breakdown
      const URGENT_MARKUP_PCT = 30
      const techIds = Array.from(new Set([...time.traysByTechnician.keys(), ...techToTrays.keys()]))
      const techIdsSet = new Set(techIds)

      const safeItems = bulk.tray_items.filter(ti => trayIdSet.has(String(ti.tray_id)))
      const timeByServiceIdSeconds = new Map<string, number>()
      const nameByServiceId = new Map<string, string>()
      const instrumentIdByServiceId = new Map<string, string>()
      const instrumentNameFromServices = new Map<string, string>()

      for (const s of bulk.services) {
        const sec = parseServiceTimeToSeconds(s?.time)
        if (sec > 0) timeByServiceIdSeconds.set(String(s.id), sec)
        if (s?.name) nameByServiceId.set(String(s.id), String(s.name).trim())
        if (s?.instrument_id) {
          instrumentIdByServiceId.set(String(s.id), String(s.instrument_id))
          const inst = instrumentsById.get(String(s.instrument_id))
          if (inst?.name) instrumentNameFromServices.set(String(s.instrument_id), String(inst.name))
        }
      }

      const trayToTechs = new Map<string, Set<string>>()
      for (const t of bulk.trays) {
        if (!trayIdSet.has(String(t.id))) continue
        const set = new Set<string>()
        if (t?.technician_id) set.add(String(t.technician_id))
        if (t?.technician2_id) set.add(String(t.technician2_id))
        if (t?.technician3_id) set.add(String(t.technician3_id))
        if (set.size > 0) trayToTechs.set(String(t.id), set)
      }

      const trayInstrumentToTechs = new Map<string, Map<string, Set<string>>>()
      for (const it of safeItems) {
        const trId = String(it?.tray_id)
        if (!trId) continue
        const techs = trayToTechs.get(trId)
        if (!techs) continue
        let notes: any = {}
        if (it?.notes) { try { notes = JSON.parse(it.notes) } catch { notes = {} } }
        const itemType = notes?.item_type || (it?.part_id ? 'part' : it?.service_id ? 'service' : null)
        const trayItemInstrumentId = it?.instrument_id ? String(it.instrument_id) : null
        const serviceId = String(it?.service_id || '')
        const serviceInstrumentId = itemType === 'service' ? (instrumentIdByServiceId.get(serviceId) ?? null) : null
        const instrumentIdKey = trayItemInstrumentId || serviceInstrumentId || '__unknown__'
        if (!trayInstrumentToTechs.has(trId)) trayInstrumentToTechs.set(trId, new Map())
        const instMap = trayInstrumentToTechs.get(trId)!
        if (!instMap.has(instrumentIdKey)) instMap.set(instrumentIdKey, new Set())
        if (it?.technician_id && techs.has(String(it.technician_id))) {
          instMap.get(instrumentIdKey)!.add(String(it.technician_id))
        } else {
          techs.forEach(tid => instMap.get(instrumentIdKey)!.add(tid))
        }
      }

      const inferTechnicianId = (trayId: string, instrumentIdKey: string): string | null => {
        const instSet = trayInstrumentToTechs.get(trayId)?.get(instrumentIdKey)
        if (instSet && instSet.size === 1) return Array.from(instSet)[0]
        const traySet = trayToTechs.get(trayId)
        if (traySet && traySet.size === 1) return Array.from(traySet)[0]
        return null
      }

      const instrumentNameByKey = new Map<string, string>()
      const totalByTechTray = new Map<string, Map<string, number>>()
      const totalByTrayAll = new Map<string, number>()
      const instrumentQtyByTech = new Map<string, Map<string, number>>()
      const explicitQtyByTechTrayInstrument = new Map<string, Map<string, Map<string, number>>>()
      const fallbackMaxQtyByTechTrayInstrument = new Map<string, Map<string, Map<string, number>>>()
      const servicesByTechInstrument = new Map<string, Map<string, Map<string, { name: string; qty: number }>>>()
      const servicesByTechTrayInstrument = new Map<string, Map<string, Map<string, Map<string, { name: string; qty: number }>>>>()
      const estSecondsByTechInstrument = new Map<string, Map<string, number>>()
      const ronByTechInstrument = new Map<string, Map<string, number>>()
      const estSecondsByTechTray = new Map<string, Map<string, number>>()
      const estSecondsByTechTrayInstrument = new Map<string, Map<string, Map<string, number>>>()

      for (const it of safeItems) {
        const trId = String(it?.tray_id)
        if (!trId) continue
        let notes: any = {}
        if (it?.notes) { try { notes = JSON.parse(it.notes) } catch { notes = {} } }
        const itemType = notes?.item_type || (it?.part_id ? 'part' : it?.service_id ? 'service' : null)
        const trayItemInstrumentId = it?.instrument_id ? String(it.instrument_id) : null
        const serviceId = String(it?.service_id || '')
        const serviceInstrumentId = itemType === 'service' ? (instrumentIdByServiceId.get(serviceId) ?? null) : null
        const instrumentIdKey = trayItemInstrumentId || serviceInstrumentId || '__unknown__'

        const rawTid = inferTechnicianId(trId, instrumentIdKey)
        const qty = Number(it?.qty ?? 0) || 0
        if (qty <= 0) continue

        const instrumentName =
          (it?.instrument_id ? instrumentsById.get(String(it.instrument_id))?.name : null) ||
          (instrumentIdKey !== '__unknown__' ? instrumentNameFromServices.get(instrumentIdKey) : null) ||
          (notes?.instrument_name && String(notes.instrument_name).trim()) ||
          'Instrument necunoscut'
        if (!instrumentNameByKey.has(instrumentIdKey) && instrumentName) {
          instrumentNameByKey.set(instrumentIdKey, instrumentName)
        }

        const tidSingle = (it?.technician_id && techIdsSet.has(String(it.technician_id)))
          ? String(it.technician_id)
          : (rawTid || inferTechnicianId(trId, instrumentIdKey))
        const trayTechsHere = trayToTechs.get(trId)
        const participantIds: string[] = tidSingle && techIdsSet.has(tidSingle)
          ? [tidSingle]
          : (trayTechsHere ? Array.from(trayTechsHere).filter(id => techIdsSet.has(id)) : [])
        if (participantIds.length === 0) continue

        const nShare = participantIds.length
        const lineTotalShare = (lineTotal: number) => lineTotal / nShare
        const estSecondsShare = (est: number) => est / nShare

        if (!itemType) {
          participantIds.forEach(tid => {
            if (!explicitQtyByTechTrayInstrument.has(tid)) explicitQtyByTechTrayInstrument.set(tid, new Map())
            const trayMapExpl = explicitQtyByTechTrayInstrument.get(tid)!
            if (!trayMapExpl.has(trId)) trayMapExpl.set(trId, new Map())
            trayMapExpl.get(trId)!.set(instrumentIdKey, (trayMapExpl.get(trId)!.get(instrumentIdKey) ?? 0) + qty / nShare)
          })
          continue
        }

        const service = servicesById.get(serviceId)
        const part = it?.part_id ? partsById.get(String(it.part_id)) : null

        const explicitPrice = Number(notes?.price)
        const price = Number.isFinite(explicitPrice) && explicitPrice > 0
          ? explicitPrice
          : itemType === 'service'
            ? Number(service?.price ?? 0) || 0
            : Number(part?.price ?? 0) || 0

        const discPctRaw = Number(notes?.discount_pct ?? 0) || 0
        const discPct = Math.min(100, Math.max(0, discPctRaw)) / 100
        const urgent = Boolean(notes?.urgent)
        const base = qty * price
        const disc = base * discPct
        const afterDisc = base - disc
        const urgentAmount = urgent ? afterDisc * (URGENT_MARKUP_PCT / 100) : 0
        const lineTotal = afterDisc + urgentAmount

        totalByTrayAll.set(trId, (totalByTrayAll.get(trId) ?? 0) + lineTotal)

        participantIds.forEach(tid => {
          if (!totalByTechTray.has(tid)) totalByTechTray.set(tid, new Map())
          totalByTechTray.get(tid)!.set(trId, (totalByTechTray.get(tid)!.get(trId) ?? 0) + lineTotalShare(lineTotal))
        })
        participantIds.forEach(tid => {
          if (!ronByTechInstrument.has(tid)) ronByTechInstrument.set(tid, new Map())
          ronByTechInstrument.get(tid)!.set(instrumentIdKey, (ronByTechInstrument.get(tid)!.get(instrumentIdKey) ?? 0) + lineTotalShare(lineTotal))
        })

        if (itemType === 'service') {
          const perItemSeconds = (serviceId ? timeByServiceIdSeconds.get(serviceId) : 0) || parseServiceTimeToSeconds(service?.time)
          const estSeconds = perItemSeconds > 0 ? perItemSeconds * qty : 0
          if (estSeconds > 0) {
            participantIds.forEach(tid => {
              if (!estSecondsByTechInstrument.has(tid)) estSecondsByTechInstrument.set(tid, new Map())
              estSecondsByTechInstrument.get(tid)!.set(instrumentIdKey, (estSecondsByTechInstrument.get(tid)!.get(instrumentIdKey) ?? 0) + estSecondsShare(estSeconds))
              if (!estSecondsByTechTray.has(tid)) estSecondsByTechTray.set(tid, new Map())
              estSecondsByTechTray.get(tid)!.set(trId, (estSecondsByTechTray.get(tid)!.get(trId) ?? 0) + estSecondsShare(estSeconds))
              if (!estSecondsByTechTrayInstrument.has(tid)) estSecondsByTechTrayInstrument.set(tid, new Map())
              if (!estSecondsByTechTrayInstrument.get(tid)!.has(trId)) estSecondsByTechTrayInstrument.get(tid)!.set(trId, new Map())
              estSecondsByTechTrayInstrument.get(tid)!.get(trId)!.set(instrumentIdKey, (estSecondsByTechTrayInstrument.get(tid)!.get(trId)!.get(instrumentIdKey) ?? 0) + estSecondsShare(estSeconds))
            })
          }

          const svcName = (service?.name && String(service.name).trim()) || nameByServiceId.get(serviceId) || 'Serviciu'
          participantIds.forEach(tid => {
            if (!servicesByTechInstrument.has(tid)) servicesByTechInstrument.set(tid, new Map())
            const techMap = servicesByTechInstrument.get(tid)!
            if (!techMap.has(instrumentIdKey)) techMap.set(instrumentIdKey, new Map())
            const prev = techMap.get(instrumentIdKey)!.get(serviceId)
            techMap.get(instrumentIdKey)!.set(serviceId, { name: svcName, qty: (prev?.qty ?? 0) + qty / nShare })

            if (!servicesByTechTrayInstrument.has(tid)) servicesByTechTrayInstrument.set(tid, new Map())
            if (!servicesByTechTrayInstrument.get(tid)!.has(trId)) servicesByTechTrayInstrument.get(tid)!.set(trId, new Map())
            if (!servicesByTechTrayInstrument.get(tid)!.get(trId)!.has(instrumentIdKey)) servicesByTechTrayInstrument.get(tid)!.get(trId)!.set(instrumentIdKey, new Map())
            const prevTray = servicesByTechTrayInstrument.get(tid)!.get(trId)!.get(instrumentIdKey)!.get(serviceId)
            servicesByTechTrayInstrument.get(tid)!.get(trId)!.get(instrumentIdKey)!.set(serviceId, { name: svcName, qty: (prevTray?.qty ?? 0) + qty / nShare })
          })
        }

        const fallbackQty = participantIds.length > 0 ? qty / participantIds.length : 0
        participantIds.forEach(tid => {
          if (!fallbackMaxQtyByTechTrayInstrument.has(tid)) fallbackMaxQtyByTechTrayInstrument.set(tid, new Map())
          const trayMap = fallbackMaxQtyByTechTrayInstrument.get(tid)!
          if (!trayMap.has(trId)) trayMap.set(trId, new Map())
          trayMap.get(trId)!.set(instrumentIdKey, Math.max(trayMap.get(trId)!.get(instrumentIdKey) ?? 0, fallbackQty))
        })
      }

      // Merge qty (explicit vs fallback)
      for (const techId of techIds) {
        const explicitTrayMap = explicitQtyByTechTrayInstrument.get(techId) ?? new Map()
        const fallbackTrayMap = fallbackMaxQtyByTechTrayInstrument.get(techId) ?? new Map()
        const allTrayIds2 = new Set([...explicitTrayMap.keys(), ...fallbackTrayMap.keys()])
        const mergedQtyMap = new Map<string, number>()
        for (const trayId of allTrayIds2) {
          const explicitInstMap = explicitTrayMap.get(trayId) ?? new Map()
          const fallbackInstMap = fallbackTrayMap.get(trayId) ?? new Map()
          const allInstIds = new Set([...explicitInstMap.keys(), ...fallbackInstMap.keys()])
          for (const instId of allInstIds) {
            const qtyForThisTray = explicitInstMap.has(instId) ? (explicitInstMap.get(instId) ?? 0) : (fallbackInstMap.get(instId) ?? 0)
            if (qtyForThisTray > 0) mergedQtyMap.set(instId, (mergedQtyMap.get(instId) ?? 0) + qtyForThisTray)
          }
        }
        if (mergedQtyMap.size > 0) instrumentQtyByTech.set(techId, mergedQtyMap)
      }

      // Build instrument breakdown
      instrumentWorkByTechnician = {}
      for (const techId of techIds) {
        const qtyMap = instrumentQtyByTech.get(techId) ?? new Map()
        const ronMap = ronByTechInstrument.get(techId) ?? new Map()
        const estMap = estSecondsByTechInstrument.get(techId) ?? new Map()
        const svcMap = servicesByTechInstrument.get(techId) ?? new Map()
        const svcTrayMap = servicesByTechTrayInstrument.get(techId) ?? new Map()
        const explicitTrayMap = explicitQtyByTechTrayInstrument.get(techId) ?? new Map()
        const fallbackTrayMap = fallbackMaxQtyByTechTrayInstrument.get(techId) ?? new Map()

        const actSecondsByInstrument = new Map<string, number>()
        const trayMap = time.traysByTechnician.get(techId) ?? new Map()
        const trayEstTotals = estSecondsByTechTray.get(techId) ?? new Map()
        const trayEstByInst = estSecondsByTechTrayInstrument.get(techId) ?? new Map()
        for (const [trayId2, mins] of trayMap) {
          const trayActSeconds = Math.max(0, (Number(mins) || 0) * 60)
          if (trayActSeconds <= 0) continue
          const estTotal = trayEstTotals.get(trayId2) ?? 0
          const instMap = trayEstByInst.get(trayId2) ?? new Map()
          if (estTotal > 0 && instMap.size > 0) {
            for (const [instId, estSec] of instMap) {
              const share = estSec > 0 ? trayActSeconds * (estSec / estTotal) : 0
              if (share > 0) actSecondsByInstrument.set(instId, (actSecondsByInstrument.get(instId) ?? 0) + share)
            }
          }
        }

        const qtyInLucruByInstrument = new Map<string, number>()
        const qtyInAsteptareByInstrument = new Map<string, number>()
        const allTrayIdsForTech = new Set([...explicitTrayMap.keys(), ...fallbackTrayMap.keys()])
        for (const trayId2 of allTrayIdsForTech) {
          const stageInfo = trayCurrentStage.get(trayId2)
          const isInLucru2 = stageInfo?.isInLucru ?? false
          const isInAsteptare2 = stageInfo?.isInAsteptare ?? false
          if (!isInLucru2 && !isInAsteptare2) continue
          const explicitInstMap = explicitTrayMap.get(trayId2) ?? new Map()
          const fallbackInstMap = fallbackTrayMap.get(trayId2) ?? new Map()
          const allInstIds = new Set([...explicitInstMap.keys(), ...fallbackInstMap.keys()])
          for (const instId of allInstIds) {
            const qtyForTray = explicitInstMap.has(instId) ? (explicitInstMap.get(instId) ?? 0) : (fallbackInstMap.get(instId) ?? 0)
            if (qtyForTray > 0) {
              if (isInLucru2) qtyInLucruByInstrument.set(instId, (qtyInLucruByInstrument.get(instId) ?? 0) + qtyForTray)
              else if (isInAsteptare2) qtyInAsteptareByInstrument.set(instId, (qtyInAsteptareByInstrument.get(instId) ?? 0) + qtyForTray)
            }
          }
        }

        const svcQtyInLucruByInstrument = new Map<string, Map<string, number>>()
        const svcQtyInAsteptareByInstrument = new Map<string, Map<string, number>>()
        for (const [trayId2, instMap] of svcTrayMap) {
          const stageInfo = trayCurrentStage.get(trayId2)
          const isInLucru2 = stageInfo?.isInLucru ?? false
          const isInAsteptare2 = stageInfo?.isInAsteptare ?? false
          if (!isInLucru2 && !isInAsteptare2) continue
          for (const [instId, svcIdMap] of instMap) {
            for (const [svcId, svcData] of svcIdMap) {
              if (isInLucru2) {
                if (!svcQtyInLucruByInstrument.has(instId)) svcQtyInLucruByInstrument.set(instId, new Map())
                const m2 = svcQtyInLucruByInstrument.get(instId)!
                m2.set(svcId, (m2.get(svcId) ?? 0) + svcData.qty)
              } else {
                if (!svcQtyInAsteptareByInstrument.has(instId)) svcQtyInAsteptareByInstrument.set(instId, new Map())
                const m2 = svcQtyInAsteptareByInstrument.get(instId)!
                m2.set(svcId, (m2.get(svcId) ?? 0) + svcData.qty)
              }
            }
          }
        }

        const allKeys = new Set([...qtyMap.keys(), ...ronMap.keys(), ...estMap.keys(), ...actSecondsByInstrument.keys()])
        const rows: TehnicianInstrumentWork[] = []
        for (const key of allKeys) {
          const svcInLucruMap = svcQtyInLucruByInstrument.get(key) ?? new Map()
          const svcInAsteptareMap = svcQtyInAsteptareByInstrument.get(key) ?? new Map()
          const services = Array.from((svcMap.get(key) ?? new Map()).entries())
            .map(([serviceId, v]) => ({ serviceId, serviceName: v.name, qty: v.qty, qtyInLucru: svcInLucruMap.get(serviceId) ?? 0, qtyInAsteptare: svcInAsteptareMap.get(serviceId) ?? 0 }))
            .sort((a, b) => (b.qty ?? 0) - (a.qty ?? 0))
          rows.push({
            instrumentId: key === '__unknown__' ? null : key,
            instrumentName: instrumentNameByKey.get(key) || (key === '__unknown__' ? 'Instrument necunoscut' : 'Instrument'),
            qty: qtyMap.get(key) ?? 0,
            qtyInLucru: qtyInLucruByInstrument.get(key) ?? 0,
            qtyInAsteptare: qtyInAsteptareByInstrument.get(key) ?? 0,
            ronEst: Math.round((ronMap.get(key) ?? 0) * 100) / 100,
            ronAct: Math.round((ronMap.get(key) ?? 0) * 100) / 100,
            estSeconds: Math.round(estMap.get(key) ?? 0),
            actSeconds: Math.round(actSecondsByInstrument.get(key) ?? 0),
            services,
          })
        }
        rows.sort((a, b) => (b.actSeconds ?? 0) - (a.actSeconds ?? 0) || (b.ronAct ?? 0) - (a.ronAct ?? 0))
        instrumentWorkByTechnician[techId] = rows
      }

      // Build traysByTechnician
      traysByTechnician = {}
      for (const techId of techToTrays.keys()) {
        const trayIdSetForTech = techToTrays.get(techId)!
        const list: TehnicianTrayWork[] = []
        for (const trayId of trayIdSetForTech) {
          const t = trayById.get(trayId)
          if (!t) {
            const archived = mergedTrayInfoByChildId.get(trayId)
            if (!archived) continue
            const sfArchive = archived.serviceFileId ? serviceFileById.get(archived.serviceFileId) : null
            const clientNameArchive = sfArchive?.lead_id ? leadNameById.get(String(sfArchive.lead_id)) ?? null : null
            list.push({
              trayId, trayNumber: archived.trayNumber,
              serviceFileId: archived.serviceFileId, serviceFileNumber: sfArchive?.number ?? null,
              leadId: sfArchive?.lead_id ? String(sfArchive.lead_id) : null, clientName: clientNameArchive,
              minutesInLucru: time.traysByTechnician.get(techId)?.get(trayId) ?? 0,
              minutesInAsteptare: timeAsteptare.traysByTechnician.get(techId)?.get(trayId) ?? 0,
              totalRon: 0, trayTotalRon: 0, currentStageId: null, currentStageName: null,
              isInLucru: false, isInAsteptare: false, isDeTrimis: false, isRidicPersonal: false,
              pipelineName: null, isReunita: true,
            })
            continue
          }
          const statusStr = String(t?.status ?? '')
          if (statusStr === '2' || statusStr === '3') continue
          const isSplitTray = t?.status === 'Splited' || (t?.parent_tray_id != null && String(t.parent_tray_id) !== '')
          if (isSplitTray && t) {
            const assignedTechs = [t.technician_id, t.technician2_id, t.technician3_id].filter(Boolean).map(String)
            if (assignedTechs.length > 0 && !assignedTechs.includes(techId)) continue
          }
          const sfId = t?.service_file_id ? String(t.service_file_id) : null
          const sf = sfId ? serviceFileById.get(sfId) : null
          const clientName = sf?.lead_id ? leadNameById.get(String(sf.lead_id)) ?? null : null
          const stageInfo = trayCurrentStage.get(trayId)
          list.push({
            trayId, trayNumber: t?.number ?? null,
            serviceFileId: sfId, serviceFileNumber: sf?.number ?? null,
            leadId: sf?.lead_id ? String(sf.lead_id) : null, clientName,
            minutesInLucru: time.traysByTechnician.get(techId)?.get(trayId) ?? 0,
            minutesInAsteptare: timeAsteptare.traysByTechnician.get(techId)?.get(trayId) ?? 0,
            totalRon: Number.isFinite(totalByTechTray.get(techId)?.get(trayId)) ? Math.round((totalByTechTray.get(techId)!.get(trayId)!) * 100) / 100 : 0,
            trayTotalRon: Number.isFinite(totalByTrayAll.get(trayId)) ? Math.round((totalByTrayAll.get(trayId)!) * 100) / 100 : 0,
            currentStageId: stageInfo?.stageId ?? null, currentStageName: stageInfo?.stageName ?? null,
            isInLucru: stageInfo?.isInLucru ?? false, isInAsteptare: stageInfo?.isInAsteptare ?? false,
            isDeTrimis: stageInfo?.isDeTrimis ?? false, isRidicPersonal: stageInfo?.isRidicPersonal ?? false,
            pipelineName: stageInfo?.pipelineName ?? null,
          })
        }
        list.sort((a, b) => (b.minutesInLucru ?? 0) - (a.minutesInLucru ?? 0) || ((b.totalRon ?? 0) - (a.totalRon ?? 0)))
        traysByTechnician[techId] = list
      }

      // Attach totalRon + minutesInLucru/Asteptare to stats
      const totalRonByTech = new Map<string, number>()
      for (const [techId, list] of Object.entries(traysByTechnician)) {
        totalRonByTech.set(techId, Math.round((list || []).reduce((acc, x) => acc + (Number(x.totalRon) || 0), 0) * 100) / 100)
      }
      for (const s of stats) {
        if (totalRonByTech.has(s.technicianId)) s.totalRon = totalRonByTech.get(s.technicianId) ?? 0
        s.minutesInLucru = time.minutesByTechnician.get(s.technicianId) ?? 0
        s.minutesInAsteptare = timeAsteptare.minutesByTechnician.get(s.technicianId) ?? 0
      }
    }
  } catch (err) {
    console.error('[buildDetailedDayData] Error:', err)
  }

  return { stats, total, totalMinutesInLucru, totalMinutesInAsteptare, traysByTechnician, instrumentWorkByTechnician }
}

// ==================== ORCHESTRATION ====================

async function callBulkRpc(monthStart: Date, monthEnd: Date): Promise<BulkRawData | null> {
  try {
    const supabase = supabaseBrowser()
    const { data, error } = await (supabase as any).rpc('get_technician_dashboard_bulk', {
      p_start: monthStart.toISOString(),
      p_end: monthEnd.toISOString(),
    })
    if (error) {
      console.warn('[bulk RPC] Error:', error.message ?? error)
      return null
    }
    if (!data || typeof data !== 'object') return null
    return {
      pipelines: data.pipelines ?? [],
      stages: data.stages ?? [],
      stage_history: data.stage_history ?? [],
      trays: data.trays ?? [],
      tray_items: data.tray_items ?? [],
      services: data.services ?? [],
      parts: data.parts ?? [],
      instruments: data.instruments ?? [],
      pipeline_items: data.pipeline_items ?? [],
      service_files: data.service_files ?? [],
      leads: data.leads ?? [],
      app_members: data.app_members ?? [],
      members: data.members ?? [],
      arhiva_tavite_unite: data.arhiva_tavite_unite ?? [],
    }
  } catch (err) {
    console.warn('[bulk RPC] Exception:', err)
    return null
  }
}

export async function fetchTehnicianDashboardBulk(
  params: TehnicianDashboardFullParams
): Promise<TehnicianDashboardFullResponse | null> {
  const { period, selectedDate, selectedMonthKey, includeTechnicians } = params

  // Determine the largest date range needed (month)
  const mb = monthBounds()
  let rangeStart = mb.start
  let rangeEnd = mb.end

  if (period === 'month-custom' && selectedMonthKey) {
    const [y, m] = selectedMonthKey.split('-').map(Number)
    if (y && m) {
      const customStart = new Date(y, m - 1, 1, 0, 0, 0, 0)
      const customEnd = new Date(y, m, 0, 23, 59, 59, 999)
      if (customStart < rangeStart) rangeStart = customStart
      if (customEnd > rangeEnd) rangeEnd = customEnd
    }
  }

  // Also include selected date range
  const dayStart = new Date(selectedDate); dayStart.setHours(0, 0, 0, 0)
  const dayEnd = new Date(selectedDate); dayEnd.setHours(23, 59, 59, 999)
  if (dayStart < rangeStart) rangeStart = dayStart
  if (dayEnd > rangeEnd) rangeEnd = dayEnd

  const bulk = await callBulkRpc(rangeStart, rangeEnd)
  if (!bulk) return null

  const stageIds = resolveStageIds(bulk)

  // Day/week/month bounds
  const [dayB, weekB, monthB] = [dayBounds(), weekBounds(), monthBounds()]

  // Compute time for day/week/month in parallel (local processing, no DB)
  const dayTime = computeFullTimeInLucru(dayB.start, dayB.end, stageIds, bulk)
  const weekTime = computeFullTimeInLucru(weekB.start, weekB.end, stageIds, bulk)
  const monthTime = computeFullTimeInLucru(monthB.start, monthB.end, stageIds, bulk)

  const dayResult = buildStatsForRange(dayB.start, dayB.end, stageIds, bulk, dayTime)
  const weekResult = buildStatsForRange(weekB.start, weekB.end, stageIds, bulk, weekTime)
  const monthResult = buildStatsForRange(monthB.start, monthB.end, stageIds, bulk, monthTime)

  const sum = (arr: TehnicianTrayStat[]) => arr.reduce((acc, x) => acc + x.count, 0)

  const dashStats: TehnicianDashboardStats = {
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

  // Technicians
  const technicians: TehnicianOption[] = includeTechnicians
    ? bulk.app_members
        .filter(m => m.role === 'technician')
        .map(m => ({ id: String(m.user_id), name: m.name ?? `Tehnician ${String(m.user_id).slice(0, 8)}` }))
        .sort((a, b) => a.name.localeCompare(b.name))
    : []

  // Period data
  let dayData: TehnicianDashboardFullResponse['dayData'] = null
  let monthData: TehnicianDashboardFullResponse['monthData'] = null
  let byDayList: TehnicianDayStat[] = []

  if (period === 'day') {
    dayData = buildDetailedDayData(selectedDate, stageIds, bulk)
  } else if (period === 'month-custom' && selectedMonthKey) {
    const [y, m] = selectedMonthKey.split('-').map(Number)
    if (y && m) {
      const mStart = new Date(y, m - 1, 1, 0, 0, 0, 0)
      const mEnd = new Date(y, m, 0, 23, 59, 59, 999)
      const mTime = computeFullTimeInLucru(mStart, mEnd, stageIds, bulk)
      const mStats = buildStatsForRange(mStart, mEnd, stageIds, bulk, mTime)
      monthData = {
        stats: mStats.stats,
        total: mStats.stats.reduce((acc, x) => acc + x.count, 0),
        totalMinutesInLucru: sumExecutionMinutesUniqueTrays(mTime.traysByTechnician),
      }
    }
  } else if (period === 'week' || period === 'month') {
    const b = period === 'week' ? weekBounds() : monthBounds()
    byDayList = buildDayStatsList(b.start, b.end, stageIds, bulk)
  }

  return {
    stats: dashStats,
    technicians,
    dayData,
    monthData,
    byDayList,
  }
}
