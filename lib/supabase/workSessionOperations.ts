'use client'

import { supabaseBrowser } from './supabaseClient'
import { parseServiceTimeToMinutes } from '@/lib/utils/service-time'

const supabase = supabaseBrowser()

export interface WorkSession {
  id: string
  tray_id: string
  technician_id: string
  started_at: string
  finished_at: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

/**
 * Pornește o sesiune de lucru pentru un tehnician pe o tăviță.
 * Dacă există deja o sesiune activă, returnează ID-ul ei.
 * 
 * @param trayId - ID-ul tăviței
 * @param technicianId - ID-ul tehnicianului
 * @param notes - Note opționale
 * @returns ID-ul sesiunii create sau existente
 */
export async function startWorkSession(
  trayId: string,
  technicianId: string,
  notes?: string
): Promise<{ data: string | null; error: any }> {
  try {
    const { data, error } = await (supabase as any).rpc('start_work_session', {
      p_tray_id: trayId,
      p_technician_id: technicianId,
      p_notes: notes || null,
    })
    
    if (error) {
      const errMsg = (error as any)?.message ?? (error as any)?.msg ?? String(error)
      const errCode = (error as any)?.code
      const errDetails = (error as any)?.details
      console.error('[startWorkSession] RPC error:', errMsg, errCode ? `(${errCode})` : '', errDetails ?? '')
      return { data: null, error }
    }
    
    return { data: data as string, error: null }
  } catch (error) {
    console.error('[startWorkSession] Error:', error)
    return { data: null, error }
  }
}

/**
 * Finalizează sesiunea de lucru pentru un tehnician pe o tăviță.
 * 
 * @param trayId - ID-ul tăviței
 * @param technicianId - ID-ul tehnicianului
 * @param notes - Note opționale
 * @returns true dacă s-a finalizat cel puțin o sesiune
 */
export async function finishWorkSession(
  trayId: string,
  technicianId: string,
  notes?: string
): Promise<{ data: boolean; error: any }> {
  try {
    const { data, error } = await (supabase as any).rpc('finish_work_session', {
      p_tray_id: trayId,
      p_technician_id: technicianId,
      p_notes: notes || null,
    })
    
    if (error) {
      const msg = (error as any)?.message ?? (error as any)?.msg ?? String(error)
      const code = (error as any)?.code
      const details = (error as any)?.details
      console.error('[finishWorkSession] RPC error:', msg, code ? `(${code})` : '', details ?? '')
      return { data: false, error: error instanceof Error ? error : new Error(msg) }
    }
    
    return { data: data as boolean, error: null }
  } catch (error) {
    console.error('[finishWorkSession] Error:', error)
    return { data: false, error }
  }
}

/**
 * Obține timpul total lucrat de un tehnician pe o tăviță (în minute).
 * 
 * @param trayId - ID-ul tăviței
 * @param technicianId - ID-ul tehnicianului
 * @returns Timpul în minute
 */
export async function getWorkMinutes(
  trayId: string,
  technicianId: string
): Promise<{ data: number; error: any }> {
  try {
    const { data, error } = await (supabase as any).rpc('get_technician_work_minutes', {
      p_tray_id: trayId,
      p_technician_id: technicianId,
    })
    
    if (error) {
      console.error('[getWorkMinutes] RPC error:', error)
      return { data: 0, error }
    }
    
    return { data: Number(data) || 0, error: null }
  } catch (error) {
    console.error('[getWorkMinutes] Error:', error)
    return { data: 0, error }
  }
}

/**
 * Obține sesiunile active (nefinalizate) pentru un tehnician pe o tăviță.
 * 
 * @param trayId - ID-ul tăviței
 * @param technicianId - ID-ul tehnicianului
 * @returns Array de sesiuni active
 */
export async function getActiveSessions(
  trayId: string,
  technicianId: string
): Promise<{ data: WorkSession[]; error: any }> {
  try {
    const { data, error } = await supabase
      .from('technician_work_sessions')
      .select('*')
      .eq('tray_id', trayId)
      .eq('technician_id', technicianId)
      .is('finished_at', null)
      .order('started_at', { ascending: false })
    
    if (error) {
      console.error('[getActiveSessions] Error:', error)
      return { data: [], error }
    }
    
    return { data: (data || []) as WorkSession[], error: null }
  } catch (error) {
    console.error('[getActiveSessions] Error:', error)
    return { data: [], error }
  }
}

/**
 * Verifică dacă un tehnician are o sesiune activă pe o tăviță.
 * 
 * @param trayId - ID-ul tăviței
 * @param technicianId - ID-ul tehnicianului
 * @returns true dacă există o sesiune activă
 */
export async function hasActiveSession(
  trayId: string,
  technicianId: string
): Promise<{ data: boolean; error: any }> {
  const { data, error } = await getActiveSessions(trayId, technicianId)
  return { data: data.length > 0, error }
}

/**
 * Obține toate sesiunile pentru o tăviță (pentru rapoarte).
 * 
 * @param trayId - ID-ul tăviței
 * @returns Array de sesiuni
 */
export async function getTrayWorkSessions(
  trayId: string
): Promise<{ data: WorkSession[]; error: any }> {
  try {
    const { data, error } = await supabase
      .from('technician_work_sessions')
      .select('*')
      .eq('tray_id', trayId)
      .order('started_at', { ascending: true })
    
    if (error) {
      console.error('[getTrayWorkSessions] Error:', error)
      return { data: [], error }
    }
    
    return { data: (data || []) as WorkSession[], error: null }
  } catch (error) {
    console.error('[getTrayWorkSessions] Error:', error)
    return { data: [], error }
  }
}

/**
 * Actualizează o sesiune de lucru (started_at, finished_at).
 * Apelată doar din UI pentru owner; API-ul verifică rolul owner.
 *
 * @param sessionId - ID-ul sesiunii
 * @param payload - started_at și/sau finished_at (ISO string sau null pentru finished_at)
 */
export async function updateWorkSession(
  sessionId: string,
  payload: { started_at?: string; finished_at?: string | null }
): Promise<{ data: WorkSession | null; error: any }> {
  try {
    const res = await fetch(`/api/work-sessions/${sessionId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      credentials: 'same-origin',
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }))
      return { data: null, error: new Error((err as any).error || res.statusText) }
    }
    const data = await res.json()
    return { data: data as WorkSession, error: null }
  } catch (error) {
    console.error('[updateWorkSession] Error:', error)
    return { data: null, error }
  }
}

/**
 * Calculează timpul total per tehnician pentru o tăviță (în minute).
 * 
 * @param trayId - ID-ul tăviței
 * @returns Map cu technician_id -> minute
 */
export async function getTrayWorkMinutesByTechnician(
  trayId: string
): Promise<{ data: Map<string, number>; error: any }> {
  const { data: sessions, error } = await getTrayWorkSessions(trayId)
  
  if (error) {
    return { data: new Map(), error }
  }
  
  const minutesByTech = new Map<string, number>()
  const now = new Date()
  
  for (const session of sessions) {
    const startedAt = new Date(session.started_at)
    const finishedAt = session.finished_at ? new Date(session.finished_at) : now
    const minutes = (finishedAt.getTime() - startedAt.getTime()) / (1000 * 60)
    
    const current = minutesByTech.get(session.technician_id) || 0
    minutesByTech.set(session.technician_id, current + minutes)
  }
  
  return { data: minutesByTech, error: null }
}

/**
 * Obține toate sesiunile active pentru un tehnician (pe toate tăvițele).
 * Util pentru a afișa ce lucrează tehnicianul în momentul curent.
 * 
 * @param technicianId - ID-ul tehnicianului
 * @returns Array de sesiuni active cu detalii tăviță
 */
export async function getTechnicianActiveSessions(
  technicianId: string
): Promise<{ data: Array<WorkSession & { tray?: { id: string; number: string } }>; error: any }> {
  try {
    const { data, error } = await supabase
      .from('technician_work_sessions')
      .select(`
        *,
        tray:trays(id, number)
      `)
      .eq('technician_id', technicianId)
      .is('finished_at', null)
      .order('started_at', { ascending: false })
    
    if (error) {
      console.error('[getTechnicianActiveSessions] Error:', error)
      return { data: [], error }
    }
    
    return { data: data || [], error: null }
  } catch (error) {
    console.error('[getTechnicianActiveSessions] Error:', error)
    return { data: [], error }
  }
}

/**
 * Calculează minutele lucrate pentru un interval de timp pe baza sesiunilor de lucru.
 * Folosită pentru calculul precis al timpului când tăvițele sunt împărțite între tehnicieni.
 * 
 * @param trayIds - Array de ID-uri ale tăvițelor
 * @param dateStart - Data de început a intervalului
 * @param dateEnd - Data de sfârșit a intervalului
 * @returns Map-uri cu minute per tehnician și per tehnician-tăviță
 */
/** Cheie dată locală YYYY-MM-DD pentru minute per zi. */
function dayKeyLocal(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Adaugă minutele unui interval la minutesByDay (per zi, în fus local). */
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
      const mins = (segEnd - segStart) / (1000 * 60)
      minutesByDay.set(dayKey, (minutesByDay.get(dayKey) ?? 0) + mins)
    }
    d.setDate(d.getDate() + 1)
  }
}

export async function getWorkSessionMinutesForRange(
  trayIds: string[],
  dateStart: Date,
  dateEnd: Date
): Promise<{
  minutesByTechnician: Map<string, number>
  minutesByDay: Map<string, number>
  traysByTechnician: Map<string, Map<string, number>>
  hasSessionData: boolean
}> {
  if (!trayIds || trayIds.length === 0) {
    return { minutesByTechnician: new Map(), minutesByDay: new Map(), traysByTechnician: new Map(), hasSessionData: false }
  }

  try {
    const startStr = dateStart.toISOString()
    const endStr = dateEnd.toISOString()

    // Obține toate sesiunile de lucru pentru tăvițele din interval
    const { data: sessions, error } = await (supabase as any)
      .from('technician_work_sessions')
      .select('tray_id, technician_id, started_at, finished_at')
      .in('tray_id', trayIds)
      .or(`started_at.gte.${startStr},finished_at.gte.${startStr},and(started_at.lte.${endStr},finished_at.is.null)`)
      .order('started_at', { ascending: true })

    if (error || !sessions || sessions.length === 0) {
      return { minutesByTechnician: new Map(), minutesByDay: new Map(), traysByTechnician: new Map(), hasSessionData: false }
    }

    const rangeStartMs = dateStart.getTime()
    const rangeEndMs = dateEnd.getTime()
    const minutesByTechnician = new Map<string, number>()
    const minutesByDay = new Map<string, number>()
    const traysByTechnician = new Map<string, Map<string, number>>()

    for (const session of sessions as any[]) {
      const techId = session.technician_id as string
      const trayId = session.tray_id as string
      if (!techId || !trayId) continue

      const sessionStart = new Date(session.started_at).getTime()
      const sessionEnd = session.finished_at 
        ? new Date(session.finished_at).getTime() 
        : Math.min(Date.now(), rangeEndMs)

      const effectiveStart = Math.max(sessionStart, rangeStartMs)
      const effectiveEnd = Math.min(sessionEnd, rangeEndMs)

      if (effectiveEnd <= effectiveStart) continue

      const minutes = (effectiveEnd - effectiveStart) / (1000 * 60)

      minutesByTechnician.set(techId, (minutesByTechnician.get(techId) ?? 0) + minutes)

      addIntervalToMinutesByDay(effectiveStart, effectiveEnd, minutesByDay, rangeStartMs, rangeEndMs)

      if (!traysByTechnician.has(techId)) traysByTechnician.set(techId, new Map())
      const techTrays = traysByTechnician.get(techId)!
      techTrays.set(trayId, (techTrays.get(trayId) ?? 0) + minutes)
    }

    return { minutesByTechnician, minutesByDay, traysByTechnician, hasSessionData: minutesByTechnician.size > 0 }
  } catch (error) {
    console.error('[getWorkSessionMinutesForRange] Error:', error)
    return { minutesByTechnician: new Map(), minutesByDay: new Map(), traysByTechnician: new Map(), hasSessionData: false }
  }
}

/** Rezumat per tehnician pentru o tăviță: timp în lucru, estimat și în așteptare (la reuniere/finalizare). */
export interface TrayTechnicianSummary {
  technicianId: string
  workMinutes: number
  estimatedMinutes: number
  inAsteptareMinutes: number
}

/**
 * Returnează pentru o tăviță sumarul per tehnician: timp în lucru (work_sessions),
 * timp estimat (din servicii) și timp în așteptare (din stage_history când technician_id e setat).
 * Util la reuniere / finalizare pentru a păstra și afișa cei 2 sau 3 tehnicieni și timpii lor.
 */
export async function getTrayTechniciansSummary(
  trayId: string
): Promise<{ data: TrayTechnicianSummary[]; error: any }> {
  try {
    const { data: workMinutesMap, error: workErr } = await getTrayWorkMinutesByTechnician(trayId)
    if (workErr) return { data: [], error: workErr }

    // Tehnicienii: din work_sessions (deja în workMinutesMap) și din tray (technician_id, 2, 3) la reuniere
    const techIds = new Set<string>(workMinutesMap.keys())
    const { data: trayRow } = await supabase
      .from('trays')
      .select('technician_id, technician2_id, technician3_id')
      .eq('id', trayId)
      .single()
    if (trayRow) {
      const t = trayRow as any
      if (t?.technician_id) techIds.add(t.technician_id)
      if (t?.technician2_id) techIds.add(t.technician2_id)
      if (t?.technician3_id) techIds.add(t.technician3_id)
    }

    if (techIds.size === 0) {
      return { data: [], error: null }
    }

    const { data: items, error: itemsErr } = await supabase
      .from('tray_items')
      .select('service_id, qty')
      .eq('tray_id', trayId)

    let totalEstimatedMinutes = 0
    if (!itemsErr && items?.length) {
      const serviceIds = [...new Set((items as any[]).map((i: any) => i.service_id).filter(Boolean))]
      const serviceTimes = new Map<string, number>()
      if (serviceIds.length > 0) {
        const { data: services } = await supabase
          .from('services')
          .select('id, time')
          .in('id', serviceIds)
        ;(services || []).forEach((s: any) => {
          serviceTimes.set(s.id, parseServiceTimeToMinutes(s?.time))
        })
      }
      for (const item of items as any[]) {
        const t = serviceTimes.get(item.service_id) || 0
        const qty = Math.max(1, Number(item.qty) || 1)
        totalEstimatedMinutes += t * qty
      }
    }

    const nTech = techIds.size
    const estimatedPerTech = nTech > 0 ? totalEstimatedMinutes / nTech : 0
    const estimatedByTech = new Map<string, number>()
    techIds.forEach((id) => estimatedByTech.set(id, estimatedPerTech))

    const inAsteptareByTech = new Map<string, number>()
    const techIdsArr = Array.from(techIds)
    const { data: historyRows } = await (supabase as any)
      .from('stage_history' as any)
      .select('technician_id, to_stage_id, moved_at')
      .eq('tray_id', trayId)
      .not('technician_id', 'is', null)
      .order('moved_at', { ascending: true })
    if (historyRows?.length && techIdsArr.length > 0) {
      const stageIds = [...new Set((historyRows as any[]).map((r: any) => r.to_stage_id).filter(Boolean))]
      const { data: stages } = await supabase.from('stages').select('id, name').in('id', stageIds)
      const isAsteptareByName = (name: string) => /asteptare|așteptare/i.test(name || '')
      const stageIsAsteptare = new Map<string, boolean>()
      ;(stages || []).forEach((s: any) => stageIsAsteptare.set(s.id, isAsteptareByName(s?.name)))
      const byTech = new Map<string, Array<{ toStageId: string; movedAt: string }>>()
      ;(historyRows as any[]).forEach((r: any) => {
        const tid = r.technician_id
        if (!tid) return
        if (!byTech.has(tid)) byTech.set(tid, [])
        byTech.get(tid)!.push({ toStageId: r.to_stage_id, movedAt: r.moved_at })
      })
      byTech.forEach((events, techId) => {
        let minutes = 0
        for (let i = 0; i < events.length; i++) {
          const enteredAsteptare = stageIsAsteptare.get(events[i].toStageId)
          if (!enteredAsteptare) continue
          const enterAt = new Date(events[i].movedAt).getTime()
          const leaveAt = i + 1 < events.length ? new Date(events[i + 1].movedAt).getTime() : Date.now()
          minutes += (leaveAt - enterAt) / (1000 * 60)
        }
        inAsteptareByTech.set(techId, minutes)
      })
    }
    techIdsArr.forEach(tid => {
      if (!inAsteptareByTech.has(tid)) inAsteptareByTech.set(tid, 0)
    })

    const data: TrayTechnicianSummary[] = Array.from(techIds).map(technicianId => ({
      technicianId,
      workMinutes: workMinutesMap.get(technicianId) ?? 0,
      estimatedMinutes: estimatedByTech.get(technicianId) ?? 0,
      inAsteptareMinutes: inAsteptareByTech.get(technicianId) ?? 0,
    }))

    return { data, error: null }
  } catch (e: any) {
    console.error('[getTrayTechniciansSummary]', e)
    return { data: [], error: e }
  }
}
