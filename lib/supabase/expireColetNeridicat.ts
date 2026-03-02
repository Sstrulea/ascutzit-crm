/**
 * Expirare Colet Neridicat
 *
 * Regulă: doar fișele care SUNT în stage-ul "Curier trimis" din pipeline-ul Recepție
 * și au curier_scheduled_at mai vechi de 3 zile se mută în "Colet neridicat".
 * Criteriul este doar data programării (curier_scheduled_at), nu created_at.
 *
 * Rulează on-access la încărcarea pipeline-ului Vânzări (împreună cu expire-callbacks).
 * Folosește createAdminClient — apelat doar din API (server-side).
 */

import { createAdminClient } from '@/lib/supabase/api-helpers'

const NORM = (s: string) =>
  (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()

function isVanzari(name: string): boolean {
  const n = NORM(name)
  return n.includes('vanzari') || n.includes('sales')
}

function isReceptie(name: string): boolean {
  const n = NORM(name)
  return n.includes('receptie') || n.includes('reception')
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

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000

export type ExpireColetNeridicatResult = {
  ok: boolean
  movedCount: number
  error?: string
}

/**
 * Mută în "Colet neridicat" doar fișele care sunt în stage "Curier trimis" în pipeline Recepție
 * și au curier_scheduled_at mai vechi de 3 zile. Actualizează Recepție și Vânzări.
 */
export async function runExpireColetNeridicat(): Promise<ExpireColetNeridicatResult> {
  try {
    const supabase = createAdminClient()
    const now = new Date()
    const limitIso = new Date(now.getTime() - THREE_DAYS_MS).toISOString()
    const nowIso = now.toISOString()

    const { data: pipelines, error: pErr } = await supabase
      .from('pipelines')
      .select('id, name')
      .eq('is_active', true)

    if (pErr || !pipelines?.length) {
      return { ok: false, movedCount: 0, error: pErr?.message || 'No pipelines' }
    }

    const receptie = (pipelines as any[]).find((p: any) => isReceptie(p.name || ''))
    if (!receptie) return { ok: true, movedCount: 0 }

    const { data: receptieStages, error: rsErr } = await supabase
      .from('stages')
      .select('id, name')
      .eq('pipeline_id', receptie.id)
      .eq('is_active', true)

    if (rsErr || !receptieStages?.length) {
      return { ok: false, movedCount: 0, error: rsErr?.message || 'No stages Recepție' }
    }

    const receptieCurierTrimis = (receptieStages as any[]).find((s: any) => isCurierTrimisStage(s.name || ''))
    const receptieColetNeridicat = (receptieStages as any[]).find((s: any) => isColetNeridicatStage(s.name || ''))
    if (!receptieCurierTrimis || !receptieColetNeridicat) return { ok: true, movedCount: 0 }

    // 1. Doar fișe care SUNT în stage Curier trimis în pipeline Recepție
    const { data: receptieItems, error: piErr } = await supabase
      .from('pipeline_items')
      .select('id, item_id')
      .eq('pipeline_id', receptie.id)
      .eq('type', 'service_file')
      .eq('stage_id', receptieCurierTrimis.id)

    if (piErr || !receptieItems?.length) return { ok: true, movedCount: 0 }

    const candidateSfIds = [...new Set((receptieItems as any[]).map((x: any) => x.item_id).filter(Boolean))] as string[]

    // 2. Păstrăm doar cele cu curier_scheduled_at mai vechi de 3 zile (data programării)
    const { data: files, error: fErr } = await supabase
      .from('service_files')
      .select('id')
      .in('id', candidateSfIds)
      .not('curier_scheduled_at', 'is', null)
      .lt('curier_scheduled_at', limitIso)

    if (fErr || !files?.length) return { ok: true, movedCount: 0 }

    const movedSfIds = (files as any[]).map((f: any) => f.id)
    const receptieItemIdsToMove = (receptieItems as any[]).filter((pi: any) => movedSfIds.includes(pi.item_id)).map((pi: any) => pi.id)

    // 3. Recepție: mut în Colet neridicat
    if (receptieItemIdsToMove.length > 0) {
      await supabase
        .from('pipeline_items')
        .update({ stage_id: receptieColetNeridicat.id, updated_at: nowIso })
        .in('id', receptieItemIdsToMove)
      await supabase.from('service_files').update({ colet_neridicat: true }).in('id', movedSfIds)
      const eventRows = movedSfIds.map((item_id: string) => ({
        type: 'service_file',
        item_id,
        event_type: 'colet_neridicat',
        message: `Mutare în ${receptieColetNeridicat.name}`,
        payload: { to: receptieColetNeridicat.name, automated: true },
        created_at: nowIso,
      }))
      await supabase.from('items_events').insert(eventRows)
    }

    // 4. Vânzări: mut aceleași fișe (pipeline_items tip service_file) din Curier trimis în Colet neridicat
    const vanzari = (pipelines as any[]).find((p: any) => isVanzari(p.name || ''))
    if (vanzari && movedSfIds.length > 0) {
      const { data: vanzariStages } = await supabase
        .from('stages')
        .select('id, name')
        .eq('pipeline_id', vanzari.id)
        .eq('is_active', true)
      const vanzariCurierTrimis = (vanzariStages as any[])?.find((s: any) => isCurierTrimisStage(s.name || ''))
      const vanzariColetNeridicat = (vanzariStages as any[])?.find((s: any) => isColetNeridicatStage(s.name || ''))
      if (vanzariCurierTrimis && vanzariColetNeridicat) {
        const { data: coletAjunsEvents } = await supabase
          .from('items_events')
          .select('item_id, event_type, payload')
          .eq('type', 'service_file')
          .in('item_id', movedSfIds)
          .or('event_type.eq.colet_ajuns,event_type.eq.stage_change')
        const hadColetAjuns = new Set<string>()
        if (coletAjunsEvents) {
          for (const ev of coletAjunsEvents as any[]) {
            if (ev.event_type === 'colet_ajuns' && ev.item_id) hadColetAjuns.add(ev.item_id)
            if (ev.event_type === 'stage_change' && ev.payload) {
              const toStage = typeof ev.payload === 'object' ? (ev.payload as any).to_stage ?? (ev.payload as any).stage?.name ?? '' : ''
              const stageStr = typeof toStage === 'string' ? toStage : (toStage?.name ?? '')
              if (ev.item_id && isColetAjunsStage(stageStr)) hadColetAjuns.add(ev.item_id)
            }
          }
        }
        const { data: vanzariItems } = await supabase
          .from('pipeline_items')
          .select('id, item_id')
          .eq('pipeline_id', vanzari.id)
          .eq('type', 'service_file')
          .eq('stage_id', vanzariCurierTrimis.id)
          .in('item_id', movedSfIds)
        if (vanzariItems?.length) {
          const toMoveVanzari = (vanzariItems as any[]).filter((pi: any) => pi.item_id && !hadColetAjuns.has(pi.item_id))
          if (toMoveVanzari.length > 0) {
            await supabase
              .from('pipeline_items')
              .update({ stage_id: vanzariColetNeridicat.id, updated_at: nowIso })
              .in('id', toMoveVanzari.map((pi: any) => pi.id))
          }
        }
      }
    }

    return { ok: true, movedCount: movedSfIds.length }
  } catch (e: any) {
    console.error('[expireColetNeridicat] Error:', e)
    return { ok: false, movedCount: 0, error: e?.message ?? 'Unknown error' }
  }
}
