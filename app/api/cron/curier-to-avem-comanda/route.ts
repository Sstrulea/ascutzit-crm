/**
 * Cron: Curier Trimis / Office Direct → Avem Comandă după 24h
 *
 * Mută lead-urile care au tag Curier Trimis sau Office Direct atribuit acum > 24h
 * din stage-ul curent (ex. Curier Ajuns Azi) în "Avem Comandă" (Vânzări).
 * Aceeași regulă ca în UI (standard.ts), dar actualizează și pipeline_items în DB.
 *
 * Rulează zilnic (ex. 0 1 * * *). Setează CRON_SECRET în Vercel.
 */

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/api-helpers'

const MS_24H = 24 * 60 * 60 * 1000

function norm(s: string): string {
  return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
}

function isVanzari(name: string): boolean {
  const n = norm(name)
  return n.includes('vanzari') || n.includes('sales')
}

function matchesAvemComanda(name: string): boolean {
  const n = norm(name)
  return (n.includes('avem') && n.includes('comanda')) || n.includes('avem-comanda')
}

export async function GET(request: Request) {
  try {
    const auth = request.headers.get('authorization')
    const secret = process.env.CRON_SECRET
    if (secret && auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const cutoff = new Date(Date.now() - MS_24H).toISOString()
    const supabase = createAdminClient()

    const { data: pipelines, error: pErr } = await supabase
      .from('pipelines')
      .select('id, name')
      .eq('is_active', true)

    if (pErr || !pipelines?.length) {
      return NextResponse.json({
        ok: false,
        error: 'pipelines_fetch',
        message: pErr?.message || 'No pipelines',
      }, { status: 500 })
    }

    const vanzari = pipelines.find((p: any) => isVanzari(p.name || ''))
    if (!vanzari) {
      return NextResponse.json({
        ok: true,
        movedCount: 0,
        reason: 'Vanzari pipeline not found',
      })
    }

    const { data: stages, error: sErr } = await supabase
      .from('stages')
      .select('id, name')
      .eq('pipeline_id', vanzari.id)
      .eq('is_active', true)

    if (sErr || !stages?.length) {
      return NextResponse.json({
        ok: false,
        error: 'stages_fetch',
        message: sErr?.message || 'No stages',
      }, { status: 500 })
    }

    const avemComandaStage = stages.find((s: any) => matchesAvemComanda(s.name || ''))
    if (!avemComandaStage) {
      return NextResponse.json({
        ok: true,
        movedCount: 0,
        reason: 'Avem Comandă stage not found',
      })
    }

    // Lead IDs cu Curier Trimis / Office Direct atribuit acum > 24h
    // 1) Din leads: curier_trimis_at sau office_direct_at <= cutoff
    const { data: leadsCt } = await supabase
      .from('leads')
      .select('id')
      .not('curier_trimis_at', 'is', null)
      .lte('curier_trimis_at', cutoff)
    const { data: leadsOd } = await supabase
      .from('leads')
      .select('id')
      .not('office_direct_at', 'is', null)
      .lte('office_direct_at', cutoff)

    const leadIdsFromLeads = new Set<string>()
    for (const r of (leadsCt || []) as { id: string }[]) {
      if (r?.id) leadIdsFromLeads.add(r.id)
    }
    for (const r of (leadsOd || []) as { id: string }[]) {
      if (r?.id) leadIdsFromLeads.add(r.id)
    }

    // 2) Din service_files: curier_trimis sau office_direct cu dată <= cutoff
    const { data: sfRows } = await supabase
      .from('service_files')
      .select('lead_id, curier_scheduled_at, office_direct_at, curier_trimis, office_direct')
      .or('curier_trimis.eq.true,office_direct.eq.true')

    for (const sf of (sfRows || []) as any[]) {
      const leadId = sf?.lead_id
      if (!leadId) continue
      const at = sf?.curier_scheduled_at || sf?.office_direct_at || sf?.created_at
      if (!at || at > cutoff) continue
      leadIdsFromLeads.add(leadId)
    }

    const leadIdsToMove = Array.from(leadIdsFromLeads)
    if (leadIdsToMove.length === 0) {
      return NextResponse.json({
        ok: true,
        movedCount: 0,
        reason: 'No leads with Curier Trimis/Office Direct older than 24h',
      })
    }

    // Pipeline items în Vânzări pentru acești lead-uri
    const { data: items, error: iErr } = await supabase
      .from('pipeline_items')
      .select('id, item_id, stage_id')
      .eq('pipeline_id', vanzari.id)
      .eq('type', 'lead')
      .in('item_id', leadIdsToMove)

    if (iErr) {
      return NextResponse.json({
        ok: false,
        error: 'pipeline_items_fetch',
        message: iErr.message,
      }, { status: 500 })
    }

    let movedCount = 0
    for (const item of (items || []) as { id: string; item_id: string; stage_id: string }[]) {
      if (item.stage_id === avemComandaStage.id) continue
      try {
        const { error: moveError } = await supabase.rpc('move_item_to_stage', {
          p_type: 'lead',
          p_item_id: item.item_id,
          p_pipeline_id: vanzari.id,
          p_new_stage_id: avemComandaStage.id,
          p_technician_id: null,
        })
        if (moveError) {
          console.error(`[curier-to-avem-comanda] Failed to move lead ${item.item_id}:`, moveError)
          continue
        }
        movedCount++
      } catch (e: any) {
        console.error(`[curier-to-avem-comanda] Error moving lead ${item.item_id}:`, e?.message)
      }
    }

    return NextResponse.json({
      ok: true,
      movedCount,
      reason: `Moved ${movedCount} lead(s) with Curier Trimis/Office Direct (>24h) to Avem Comandă`,
    })
  } catch (e: any) {
    console.error('[/api/cron/curier-to-avem-comanda] Error:', e)
    return NextResponse.json(
      { ok: false, error: 'cron_error', message: e?.message || 'Unknown error' },
      { status: 500 }
    )
  }
}
