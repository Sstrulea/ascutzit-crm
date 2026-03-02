/**
 * CRON JOB: Colet Neridicat Automat
 * ======================================
 * POST /api/cron/vanzari-colet-neridicat
 *
 * Rulează zilnic la 23:59
 *
 * Regulă: doar fișele care SUNT în stage-ul "Curier trimis" din pipeline-ul Recepție
 * și au curier_scheduled_at mai vechi de 3 zile se mută în "Colet neridicat".
 *
 * Proces:
 * 1. Recepție: iau pipeline_items (service_file) din stage Curier trimis → filtrez după curier_scheduled_at < 3 zile → mut în Colet neridicat
 * 2. Vânzări: pentru aceleași fișe, mut lead-urile în Colet neridicat, no_deal = true
 */

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000

import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

function isReceptie(name: string): boolean {
  const n = (name || '').toLowerCase()
  return n.includes('receptie') || n.includes('reception')
}
function isCurierTrimisStage(name: string): boolean {
  const n = (name || '').toLowerCase()
  return (n.includes('curier') && n.includes('trimis')) || n.includes('curier_trimis')
}
function isColetNeridicatStage(name: string): boolean {
  const n = (name || '').toLowerCase()
  return n.includes('colet') && n.includes('neridicat')
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies })
    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${process.env.CRON_SECRET_KEY}`) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    console.log('Starting Colet Neridicat cron job...')

    const limitIso = new Date(Date.now() - THREE_DAYS_MS).toISOString()

    // 1. Sursa: doar fișe din stage "Curier trimis" din pipeline Recepție
    const { data: pipelines } = await supabase
      .from('pipelines')
      .select('id, name')
      .eq('is_active', true)
    const receptiePipeline = (pipelines || []).find((p: { name?: string }) => isReceptie(p.name || ''))
    if (!receptiePipeline) {
      return NextResponse.json({
        success: true,
        message: 'Pipeline Recepție negăsit',
        movedCount: 0
      })
    }

    const { data: receptieStages } = await supabase
      .from('stages')
      .select('id, name')
      .eq('pipeline_id', receptiePipeline.id)
      .eq('is_active', true)
    const curierTrimisStage = (receptieStages || []).find((s: { name?: string }) => isCurierTrimisStage(s.name || ''))
    const coletNeridicatStageReceptie = (receptieStages || []).find((s: { name?: string }) => isColetNeridicatStage(s.name || ''))

    if (!curierTrimisStage || !coletNeridicatStageReceptie) {
      return NextResponse.json({
        success: true,
        message: 'Stage-uri Curier trimis / Colet neridicat lipsă în Recepție',
        movedCount: 0
      })
    }

    const { data: receptieItems, error: piErr } = await supabase
      .from('pipeline_items')
      .select('id, item_id')
      .eq('pipeline_id', receptiePipeline.id)
      .eq('type', 'service_file')
      .eq('stage_id', curierTrimisStage.id)

    if (piErr || !receptieItems?.length) {
      return NextResponse.json({
        success: true,
        message: 'Nicio fișă în stage Curier trimis (Recepție)',
        movedCount: 0
      })
    }

    const candidateSfIds = [...new Set((receptieItems as { item_id: string }[]).map((pi) => pi.item_id).filter(Boolean))] as string[]

    // 2. Păstrăm doar fișele cu curier_scheduled_at mai vechi de 3 zile (data programării)
    const { data: serviceFiles, error: sfErr } = await supabase
      .from('service_files')
      .select('id, lead_id, curier_scheduled_at')
      .in('id', candidateSfIds)
      .not('curier_scheduled_at', 'is', null)
      .lt('curier_scheduled_at', limitIso)
      .neq('status', 'facturata')
      .is('anulat', false)

    if (sfErr || !serviceFiles?.length) {
      return NextResponse.json({
        success: true,
        message: 'Nicio fișă eligibilă (în Curier trimis Recepție cu curier_scheduled_at > 3 zile)',
        movedCount: 0
      })
    }

    const expiredSfIds = (serviceFiles as { id: string }[]).map((sf) => sf.id)
    const nowIso = new Date().toISOString()
    const receptieItemIdsToMove = (receptieItems as { id: string; item_id: string }[])
      .filter((pi) => expiredSfIds.includes(pi.item_id))
      .map((pi) => pi.id)

    // 3. Recepție: mut în Colet neridicat doar aceste fișe
    await supabase
      .from('pipeline_items')
      .update({ stage_id: coletNeridicatStageReceptie.id, updated_at: nowIso })
      .in('id', receptieItemIdsToMove)

    await supabase
      .from('service_files')
      .update({ colet_neridicat: true })
      .in('id', expiredSfIds)

    const eventRows = expiredSfIds.map((item_id: string) => ({
      type: 'service_file',
      item_id,
      event_type: 'colet_neridicat',
      message: `Mutare automată în Colet neridicat (3 zile de la data programării)`,
      payload: { to: coletNeridicatStageReceptie.name, automated: true },
      created_at: nowIso,
    }))
    await supabase.from('items_events').insert(eventRows)
    console.log(`Receptie: ${expiredSfIds.length} fise mutate in Colet neridicat`)

    // 4. Vânzări: mut lead-urile în Colet neridicat (pentru aceleași fișe mutate în Recepție)
    const { data: pipeline } = await supabase
      .from('pipelines')
      .select('id')
      .eq('name', 'Vânzări')
      .single()

    if (!pipeline) {
      throw new Error('Vânzări pipeline not found')
    }

    const { data: stage } = await supabase
      .from('stages')
      .select('id')
      .eq('pipeline_id', pipeline.id)
      .ilike('name', '%colet neridicat%')
      .single()

    if (!stage) {
      throw new Error('Colet Neridicat stage not found')
    }

    let movedCount = 0

    for (const sf of serviceFiles as { id: string; lead_id: string; curier_scheduled_at: string }[]) {
      // Mută lead-ul în "Colet Neridicat"
      const { error: moveError } = await supabase
        .from('pipeline_items')
        .update({ stage_id: stage.id })
        .eq('item_id', sf.lead_id)
        .eq('type', 'lead')

      if (moveError) {
        console.error(`Failed to move lead ${sf.lead_id}:`, moveError)
        continue
      }

      // Setează no_deal = true pe service_file
      const { error: updateError } = await supabase
        .from('service_files')
        .update({ no_deal: true })
        .eq('id', sf.id)

      if (updateError) {
        console.error(`Failed to update service_file ${sf.id}:`, updateError)
        continue
      }

      // Loghează în items_events
      await supabase
        .from('items_events')
        .insert({
          type: 'service_file',
          item_id: sf.id,
          event_type: 'colet_neridicat_auto',
          message: `Colet neridicat automat (curier programat acum ${(Date.now() - new Date(sf.curier_scheduled_at).getTime()) / (24 * 60 * 60 * 1000)} zile)`,
          event_details: {
            curier_scheduled_at: sf.curier_scheduled_at,
            days_since_curier: Math.floor((Date.now() - new Date(sf.curier_scheduled_at).getTime()) / (24 * 60 * 60 * 1000)),
            automated: true
          }
        })

      movedCount++
    }

    console.log(`Moved ${movedCount} colete to Colet Neridicat`)

    return NextResponse.json({
      success: true,
      message: `Moved ${movedCount} colete to Colet Neridicat`,
      movedCount
    })

  } catch (error: any) {
    console.error('Colet Neridicat cron error:', error)
    return NextResponse.json(
      { error: error?.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

// GET pentru test manual
export async function GET(request: NextRequest) {
  return NextResponse.json({
    message: 'Use POST to trigger Colet Neridicat cron job',
    usage: 'POST with Authorization: Bearer CRON_SECRET_KEY'
  })
}