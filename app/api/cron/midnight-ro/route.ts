/**
 * Cron: No DEAL → Arhivat după 24h
 *
 * Mută lead-urile din "No DEAL" (Vânzări) în "Arhivat" doar dacă au stat în No DEAL
 * cel puțin 24 de ore (folosim pipeline_items.entered_stage_at sau updated_at când au intrat în stage).
 *
 * Call Back / Nu răspunde → Leads + Follow Up: se face „on access” la încărcarea
 * pipeline-ului Vânzări (POST /api/leads/expire-callbacks), nu aici.
 *
 * Rulează conform vercel.json (ex. 0 22 * * *). Setează CRON_SECRET în Vercel.
 */

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/api-helpers'

const HOURS_IN_NO_DEAL = 24

function norm(s: string): string {
  return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
}

function matchesNoDeal(name: string): boolean {
  const n = norm(name)
  return (n.includes('no') && n.includes('deal')) || n === 'no-deal'
}

function matchesArhivat(name: string): boolean {
  const n = norm(name)
  return n.includes('arhivat') || n.includes('arhiva')
}

function isVanzari(name: string): boolean {
  const n = norm(name)
  return n.includes('vanzari') || n.includes('sales')
}

export async function GET(request: Request) {
  try {
    const auth = request.headers.get('authorization')
    const secret = process.env.CRON_SECRET
    if (secret && auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const cutoff = new Date(Date.now() - HOURS_IN_NO_DEAL * 60 * 60 * 1000).toISOString()
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

    const noDeal = stages.find((s: any) => matchesNoDeal(s.name || ''))
    const arhivat = stages.find((s: any) => matchesArhivat(s.name || ''))

    if (!noDeal || !arhivat) {
      return NextResponse.json({
        ok: true,
        movedCount: 0,
        reason: !noDeal ? 'No DEAL stage not found' : 'Arhivat stage not found',
      })
    }

    // Try to use entered_stage_at if column exists, otherwise fall back to updated_at
    // First check if entered_stage_at column exists by trying a query with it
    let timeColumn = 'updated_at'
    try {
      // Test if entered_stage_at exists by doing a simple query
      const testQuery = await supabase
        .from('pipeline_items')
        .select('entered_stage_at')
        .limit(1)
      
      if (!testQuery.error) {
        timeColumn = 'entered_stage_at'
      }
    } catch (e) {
      // Column doesn't exist, use updated_at
      console.log('entered_stage_at column not found, using updated_at')
    }

    const { data: items, error: iErr } = await supabase
      .from('pipeline_items')
      .select('id, item_id, entered_stage_at, updated_at')
      .eq('pipeline_id', vanzari.id)
      .eq('type', 'lead')
      .eq('stage_id', noDeal.id)
      .lte(timeColumn, cutoff)

    if (iErr) {
      return NextResponse.json({
        ok: false,
        error: 'pipeline_items_fetch',
        message: iErr.message,
      }, { status: 500 })
    }

    const pipelineItemIds = (items || []).map((x: any) => x.id).filter(Boolean)
    const leadIds = (items || []).map((x: any) => x.item_id).filter(Boolean)
    if (pipelineItemIds.length === 0) {
      return NextResponse.json({
        ok: true,
        movedCount: 0,
        reason: 'No leads in No DEAL for 24+ hours',
      })
    }

    // Use RPC move_item_to_stage for proper logging and stage_history
    let movedCount = 0
    for (const item of items || []) {
      try {
        const { error: moveError } = await supabase.rpc('move_item_to_stage', {
          p_type: 'lead',
          p_item_id: item.item_id,
          p_pipeline_id: vanzari.id,
          p_new_stage_id: arhivat.id,
          p_technician_id: null
        })

        if (moveError) {
          console.error(`Failed to move lead ${item.item_id} to Arhivat:`, moveError)
          continue
        }

        // Log to items_events
        const enteredAt = item.entered_stage_at || item.updated_at
        const hoursInStage = (Date.now() - new Date(enteredAt).getTime()) / (60 * 60 * 1000)
        
        await supabase
          .from('items_events')
          .insert({
            type: 'lead',
            item_id: item.item_id,
            event_type: 'auto_moved_no_deal_to_arhivat',
            message: `Lead mutat automat din NO DEAL în ARHIVATE după ${Math.floor(hoursInStage)} ore`,
            event_details: {
              from_stage_id: noDeal.id,
              from_stage_name: noDeal.name,
              to_stage_id: arhivat.id,
              to_stage_name: arhivat.name,
              entered_stage_at: enteredAt,
              hours_in_stage: Math.floor(hoursInStage),
              automated: true
            }
          })

        // Set no_deal = true on lead if not already set
        const { data: lead } = await supabase
          .from('leads')
          .select('no_deal')
          .eq('id', item.item_id)
          .single()
          
        if (lead && !lead.no_deal) {
          await supabase
            .from('leads')
            .update({ 
              no_deal: true,
              no_deal_at: new Date().toISOString()
            })
            .eq('id', item.item_id)
        }

        movedCount++
      } catch (error: any) {
        console.error(`Error processing lead ${item.item_id}:`, error)
        continue
      }
    }

    return NextResponse.json({
      ok: true,
      movedCount,
      reason: `Moved ${movedCount} lead(s) from No DEAL to Arhivat (24h+ in stage)`,
    })
  } catch (e: any) {
    console.error('[/api/cron/midnight-ro] Error:', e)
    return NextResponse.json(
      { ok: false, error: 'cron_error', message: e?.message || 'Unknown error' },
      { status: 500 }
    )
  }
}
