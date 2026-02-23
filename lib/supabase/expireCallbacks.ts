/**
 * Expirare Call Back / Nu răspunde → Leads + tag Follow Up
 *
 * Rulează „on access”: la încărcarea pipeline-ului Vânzări. Mută lead-urile din Call Back
 * sau Nu răspunde în stage-ul Leads și adaugă tag-ul Follow Up când callback_date sau
 * nu_raspunde_callback_at au trecut.
 *
 * Folosește createAdminClient — apelat doar din API (server-side).
 */

import { createAdminClient } from '@/lib/supabase/api-helpers'

function norm(s: string): string {
  return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
}

function matchesLeads(name: string): boolean {
  const n = norm(name)
  return n === 'leads' || (n.includes('lead') && !n.includes('callback'))
}

function matchesCallback(name: string): boolean {
  const n = norm(name)
  return n.includes('callback') || n.includes('call back') || n.includes('call-back')
}

function matchesNuRaspunde(name: string): boolean {
  const n = norm(name)
  return (n.includes('nu') && n.includes('raspunde')) || (n.includes('nu') && n.includes('rasunde'))
}

function isVanzari(name: string): boolean {
  const n = norm(name)
  return n.includes('vanzari') || n.includes('sales')
}

async function getOrCreateFollowUpTag(supabase: ReturnType<typeof createAdminClient>): Promise<{ id: string } | null> {
  const { data: existing } = await supabase
    .from('tags')
    .select('id')
    .ilike('name', 'follow up')
    .limit(1)
    .maybeSingle()
  if (existing) return { id: (existing as any).id }
  const { data: created, error } = await supabase
    .from('tags')
    .insert([{ name: 'Follow Up', color: 'yellow' }] as any)
    .select('id')
    .single()
  if (error) {
    console.warn('[expireCallbacks] getOrCreateFollowUpTag insert failed:', error.message)
    return null
  }
  return { id: (created as any).id }
}

async function getOrCreateSunaTag(supabase: ReturnType<typeof createAdminClient>): Promise<{ id: string } | null> {
  const { data: existing } = await supabase
    .from('tags')
    .select('id')
    .ilike('name', 'suna!')
    .limit(1)
    .maybeSingle()
  if (existing) return { id: (existing as any).id }
  const { data: created, error } = await supabase
    .from('tags')
    .insert([{ name: 'Suna!', color: 'red' }] as any)
    .select('id')
    .single()
  if (error) {
    console.warn('[expireCallbacks] getOrCreateSunaTag insert failed:', error.message)
    return null
  }
  return { id: (created as any).id }
}

export type ExpireCallbacksResult = {
  ok: boolean
  movedCount: number
  error?: string
}

/**
 * Mută lead-urile din Call Back / Nu răspunde (cu timp expirat) în Leads și adaugă tag Follow Up.
 * Apelat la încărcarea pipeline-ului Vânzări (on access), nu din cron.
 */
export async function runExpireCallbacksAndNuRaspunde(): Promise<ExpireCallbacksResult> {
  try {
    const supabase = createAdminClient()
    const nowIso = new Date().toISOString()

    const { data: pipelines, error: pErr } = await supabase
      .from('pipelines')
      .select('id, name')
      .eq('is_active', true)

    if (pErr || !pipelines?.length) {
      return { ok: false, movedCount: 0, error: pErr?.message || 'No pipelines' }
    }

    const vanzari = pipelines.find((p: any) => isVanzari(p.name || ''))
    if (!vanzari) return { ok: true, movedCount: 0 }

    const { data: stages, error: sErr } = await supabase
      .from('stages')
      .select('id, name')
      .eq('pipeline_id', vanzari.id)
      .eq('is_active', true)

    if (sErr || !stages?.length) {
      return { ok: false, movedCount: 0, error: sErr?.message || 'No stages' }
    }

    const leadsStage = stages.find((s: any) => matchesLeads(s.name || ''))
    const callbackStage = stages.find((s: any) => matchesCallback(s.name || ''))
    const nuRaspundeStage = stages.find((s: any) => matchesNuRaspunde(s.name || ''))

    if (!leadsStage || (!callbackStage && !nuRaspundeStage)) {
      return { ok: true, movedCount: 0 }
    }

    const followUpTag = await getOrCreateFollowUpTag(supabase)
    const sunaTag = await getOrCreateSunaTag(supabase)
    if (!followUpTag) return { ok: true, movedCount: 0 }

    type ToMoveItem = { leadId: string; stageId: string; callbackAt: string }
    const toMove: ToMoveItem[] = []

    if (callbackStage) {
      const { data: cbItems } = await supabase
        .from('pipeline_items')
        .select('id, item_id')
        .eq('pipeline_id', vanzari.id)
        .eq('type', 'lead')
        .eq('stage_id', callbackStage.id)
      const cbLeadIds = [...new Set((cbItems || []).map((x: any) => x.item_id).filter(Boolean))]
      if (cbLeadIds.length > 0) {
        const { data: cbLeads } = await supabase
          .from('leads')
          .select('id, callback_date')
          .in('id', cbLeadIds)
          .not('callback_date', 'is', null)
          .lte('callback_date', nowIso)
        ;(cbLeads || []).forEach((x: any) => {
          if (x.callback_date) toMove.push({ leadId: x.id, stageId: callbackStage.id, callbackAt: x.callback_date })
        })
      }
    }

    if (nuRaspundeStage) {
      const { data: nrItems } = await supabase
        .from('pipeline_items')
        .select('id, item_id')
        .eq('pipeline_id', vanzari.id)
        .eq('type', 'lead')
        .eq('stage_id', nuRaspundeStage.id)
      const nrLeadIds = [...new Set((nrItems || []).map((x: any) => x.item_id).filter(Boolean))]
      if (nrLeadIds.length > 0) {
        const { data: nrLeads } = await supabase
          .from('leads')
          .select('id, nu_raspunde_callback_at')
          .in('id', nrLeadIds)
          .not('nu_raspunde_callback_at', 'is', null)
          .lte('nu_raspunde_callback_at', nowIso)
        ;(nrLeads || []).forEach((x: any) => {
          if (x.nu_raspunde_callback_at) toMove.push({ leadId: x.id, stageId: nuRaspundeStage.id, callbackAt: x.nu_raspunde_callback_at })
        })
      }
    }

    let movedCount = 0
    for (const { leadId, stageId, callbackAt } of toMove) {
      const { error: upPi } = await supabase
        .from('pipeline_items')
        .update({
          stage_id: leadsStage.id,
          updated_at: nowIso,
        })
        .eq('pipeline_id', vanzari.id)
        .eq('type', 'lead')
        .eq('stage_id', stageId)
        .eq('item_id', leadId)
      if (upPi) continue
      const isCb = callbackStage && stageId === callbackStage.id
      await supabase
        .from('leads')
        .update({
          ...(isCb
            ? { callback_date: null, call_back: false }
            : { nu_raspunde_callback_at: null, nu_raspunde: false }),
          follow_up_set_at: nowIso,
          follow_up_callback_at: callbackAt,
          has_ever_been_moved: true,
        })
        .eq('id', leadId)
      const { error: tagErr } = await supabase
        .from('lead_tags')
        .insert([{ lead_id: leadId, tag_id: followUpTag.id }] as any)
      if (tagErr && (tagErr as any).code !== '23505') {
        console.warn('[expireCallbacks] lead_tags insert failed for lead', leadId, (tagErr as any).message)
      }
      if (sunaTag) {
        const { error: sunaErr } = await supabase
          .from('lead_tags')
          .insert([{ lead_id: leadId, tag_id: sunaTag.id }] as any)
        if (sunaErr && (sunaErr as any).code !== '23505') {
          console.warn('[expireCallbacks] lead_tags Suna! insert failed for lead', leadId, (sunaErr as any).message)
        }
      }
      movedCount += 1
    }

    // Atribuie tag-ul "Suna!" tuturor lead-urilor cu termen expirat (callback sau nu răspunde), indiferent de stage
    if (sunaTag) {
      const expiredIds: string[] = []
      const { data: cbExpired } = await supabase
        .from('leads')
        .select('id')
        .not('callback_date', 'is', null)
        .lte('callback_date', nowIso)
      const { data: nrExpired } = await supabase
        .from('leads')
        .select('id')
        .not('nu_raspunde_callback_at', 'is', null)
        .lte('nu_raspunde_callback_at', nowIso)
      ;(cbExpired || []).forEach((x: any) => expiredIds.push(x.id))
      ;(nrExpired || []).forEach((x: any) => expiredIds.push(x.id))
      const uniqueExpired = [...new Set(expiredIds)]
      if (uniqueExpired.length > 0) {
        const { data: existingSuna } = await supabase
          .from('lead_tags')
          .select('lead_id')
          .eq('tag_id', sunaTag.id)
          .in('lead_id', uniqueExpired)
        const haveSuna = new Set((existingSuna || []).map((x: any) => x.lead_id))
        const toAdd = uniqueExpired.filter((id) => !haveSuna.has(id))
        for (const leadId of toAdd) {
          const { error: e } = await supabase
            .from('lead_tags')
            .insert([{ lead_id: leadId, tag_id: sunaTag.id }] as any)
          if (e && (e as any).code !== '23505') console.warn('[expireCallbacks] Suna! tag for lead', leadId, (e as any).message)
        }
      }
    }

    return { ok: true, movedCount }
  } catch (e: any) {
    console.error('[expireCallbacks] Error:', e)
    return { ok: false, movedCount: 0, error: e?.message || 'Unknown error' }
  }
}
