/**
 * Expirare Colet Neridicat
 *
 * Mută în stage-ul "Colet neridicat" (Vânzări) fișele care:
 * 1. (Criteriu 36h) Sunt în "Curier Trimis", nu au ajuns la "Colet ajuns" și curier_scheduled_at e mai vechi de 36h.
 * 2. (Criteriu 2 zile) Au curier_trimis=true, created_at mai vechi de 2 zile și sunt încă în "Curier Trimis".
 *
 * Rulează on-access: la încărcarea pipeline-ului Vânzări (împreună cu expire-callbacks).
 * Folosește createAdminClient — apelat doar din API (server-side).
 */

import { createAdminClient } from '@/lib/supabase/api-helpers'

const NORM = (s: string) =>
  (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()

function isVanzari(name: string): boolean {
  const n = NORM(name)
  return n.includes('vanzari') || n.includes('sales')
}

function isCurierTrimisStage(name: string): boolean {
  const n = NORM(name)
  return (n.includes('curier') && n.includes('trimis')) || n.includes('curier_trimis')
}

function isColetAjunsStage(name: string): boolean {
  const n = NORM(name)
  return (n.includes('colet') && n.includes('ajuns')) || n.includes('colet_ajuns')
}

function isColetNeridicatStage(name: string): boolean {
  const n = NORM(name)
  return n.includes('colet') && n.includes('neridicat')
}

const HOURS_MS = 36 * 60 * 60 * 1000
const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000

export type ExpireColetNeridicatResult = {
  ok: boolean
  movedCount: number
  error?: string
}

/**
 * Mută fișele care sunt în "Curier Trimis" și nu au ajuns la "Colet ajuns" în 36h
 * în stage-ul "Colet neridicat" (pipeline Vânzări).
 */
export async function runExpireColetNeridicat(): Promise<ExpireColetNeridicatResult> {
  try {
    const supabase = createAdminClient()
    const now = new Date()
    const limitIso = new Date(now.getTime() - HOURS_MS).toISOString()

    const { data: pipelines, error: pErr } = await supabase
      .from('pipelines')
      .select('id, name')
      .eq('is_active', true)

    if (pErr || !pipelines?.length) {
      return { ok: false, movedCount: 0, error: pErr?.message || 'No pipelines' }
    }

    const vanzari = (pipelines as any[]).find((p: any) => isVanzari(p.name || ''))
    if (!vanzari) return { ok: true, movedCount: 0 }

    const { data: stages, error: sErr } = await supabase
      .from('stages')
      .select('id, name')
      .eq('pipeline_id', vanzari.id)
      .eq('is_active', true)

    if (sErr || !stages?.length) {
      return { ok: false, movedCount: 0, error: sErr?.message || 'No stages' }
    }

    const curierTrimisStage = (stages as any[]).find((s: any) => isCurierTrimisStage(s.name || ''))
    const coletNeridicatStage = (stages as any[]).find((s: any) => isColetNeridicatStage(s.name || ''))

    if (!curierTrimisStage || !coletNeridicatStage) {
      return { ok: true, movedCount: 0 }
    }

    // Fișe cu curier_trimis = true și curier_scheduled_at mai vechi de 36h
    const { data: files, error: fErr } = await supabase
      .from('service_files')
      .select('id, curier_scheduled_at')
      .eq('curier_trimis', true)
      .not('curier_scheduled_at', 'is', null)
      .lt('curier_scheduled_at', limitIso)

    if (fErr || !files?.length) {
      return { ok: true, movedCount: 0 }
    }

    const serviceFileIds = (files as any[]).map((f: any) => f.id)

    // pipeline_items în Vânzări, tip service_file, în stage Curier Trimis
    const { data: pipelineItems, error: piErr } = await supabase
      .from('pipeline_items')
      .select('id, item_id, stage_id')
      .eq('pipeline_id', vanzari.id)
      .eq('type', 'service_file')
      .eq('stage_id', curierTrimisStage.id)
      .in('item_id', serviceFileIds)

    if (piErr || !pipelineItems?.length) {
      return { ok: true, movedCount: 0 }
    }

    const candidateIds = [...new Set((pipelineItems as any[]).map((x: any) => x.item_id).filter(Boolean))] as string[]

    if (candidateIds.length === 0) return { ok: true, movedCount: 0 }

    // Care dintre aceste fișe au avut deja eveniment "Colet ajuns"?
    const { data: coletAjunsEvents } = await supabase
      .from('items_events')
      .select('item_id, event_type, payload')
      .eq('type', 'service_file')
      .in('item_id', candidateIds)
      .or('event_type.eq.colet_ajuns,event_type.eq.stage_change')

    const hadColetAjuns = new Set<string>()
    if (coletAjunsEvents) {
      for (const ev of coletAjunsEvents as any[]) {
        const itemId = ev.item_id
        if (!itemId) continue
        if (ev.event_type === 'colet_ajuns') {
          hadColetAjuns.add(itemId)
          continue
        }
        if (ev.event_type === 'stage_change' && ev.payload) {
          const toStage = typeof ev.payload === 'object' && ev.payload !== null
            ? (ev.payload.to_stage ?? ev.payload.stage?.name ?? '')
            : ''
          const stageStr = typeof toStage === 'string' ? toStage : (toStage?.name ?? '')
          if (isColetAjunsStage(stageStr)) hadColetAjuns.add(itemId)
        }
      }
    }

    const toMove = (pipelineItems as any[]).filter(
      (pi: any) => pi.item_id && !hadColetAjuns.has(pi.item_id)
    )

    const nowIso = now.toISOString()
    let movedCount = 0

    if (toMove.length > 0) {
      const ids = toMove.map((pi: any) => pi.id)
      const { error: upErr } = await supabase
        .from('pipeline_items')
        .update({
          stage_id: coletNeridicatStage.id,
          updated_at: nowIso,
        })
        .in('id', ids)
      if (!upErr) movedCount = ids.length
    }

    // Criteriu 2 zile: fișe cu curier_trimis și created_at mai vechi de 2 zile, încă în Curier Trimis → mutare în Colet neridicat
    const twoDaysAgoISO = new Date(now.getTime() - TWO_DAYS_MS).toISOString()
    const { data: files2d, error: f2Err } = await supabase
      .from('service_files')
      .select('id')
      .eq('curier_trimis', true)
      .lt('created_at', twoDaysAgoISO)

    if (!f2Err && files2d && files2d.length > 0) {
      const ids2d = (files2d as any[]).map((f: any) => f.id).filter(Boolean) as string[]
      const { data: pi2d, error: pi2Err } = await supabase
        .from('pipeline_items')
        .select('id, item_id')
        .eq('pipeline_id', vanzari.id)
        .eq('type', 'service_file')
        .eq('stage_id', curierTrimisStage.id)
        .in('item_id', ids2d)

      if (!pi2Err && pi2d && pi2d.length > 0) {
        const candidateIds2d = [...new Set((pi2d as any[]).map((x: any) => x.item_id).filter(Boolean))] as string[]
        const { data: coletAjunsEvents2d } = await supabase
          .from('items_events')
          .select('item_id, event_type, payload')
          .eq('type', 'service_file')
          .in('item_id', candidateIds2d)
          .or('event_type.eq.colet_ajuns,event_type.eq.stage_change')

        const hadColetAjuns2d = new Set<string>()
        if (coletAjunsEvents2d) {
          for (const ev of coletAjunsEvents2d as any[]) {
            const itemId = ev.item_id
            if (!itemId) continue
            if (ev.event_type === 'colet_ajuns') {
              hadColetAjuns2d.add(itemId)
              continue
            }
            if (ev.event_type === 'stage_change' && ev.payload) {
              const toStage = typeof ev.payload === 'object' && ev.payload !== null
                ? (ev.payload.to_stage ?? ev.payload.stage?.name ?? '')
                : ''
              const stageStr = typeof toStage === 'string' ? toStage : (toStage?.name ?? '')
              if (isColetAjunsStage(stageStr)) hadColetAjuns2d.add(itemId)
            }
          }
        }

        const toMove2d = (pi2d as any[]).filter(
          (pi: any) => pi.item_id && !hadColetAjuns2d.has(pi.item_id)
        )
        if (toMove2d.length > 0) {
          const ids2dToUpdate = toMove2d.map((pi: any) => pi.id)
          const { error: up2Err } = await supabase
            .from('pipeline_items')
            .update({
              stage_id: coletNeridicatStage.id,
              updated_at: nowIso,
            })
            .in('id', ids2dToUpdate)
          if (!up2Err) movedCount += ids2dToUpdate.length
        }
      }
    }

    return { ok: true, movedCount }
  } catch (e: any) {
    console.error('[expireColetNeridicat] Error:', e)
    return { ok: false, movedCount: 0, error: e?.message ?? 'Unknown error' }
  }
}
