/**
 * CRON JOB: Colet Neridicat Automat
 * ======================================
 * POST /api/cron/vanzari-colet-neridicat
 * 
 * Rulează zilnic la 23:59
 * 
 * Proces:
 * 1. Caută service_files cu curier_trimis și mai vechi de 2 zile
 * 2. Mută lead-urile în stage "Colet Neridicat"
 * 3. Setează no_deal = true
 * 4. Trimite notificări vânzătorilor
 * 5. Loghează în items_events
 */

import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    // 1. Autentificare (cron job secret key)
    const supabase = createRouteHandlerClient({ cookies })
    
    // Verificare secret key pentru cron (pentru securitate)
    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${process.env.CRON_SECRET_KEY}`) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    console.log('Starting Colet Neridicat cron job...')

    // 2. Caută service_files cu curier_trimis expirat
    const { data: expiredFiles, error: queryError } = await supabase
      .from('service_files')
      .select('id, lead_id, curier_scheduled_at')
      .eq('curier_trimis', true)
      .neq('status', 'facturata')
      .lt('curier_scheduled_at', new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString())
      .is('anulat', false)

    if (queryError) {
      throw new Error(`Failed to query expired curier: ${queryError.message}`)
    }

    if (!expiredFiles || expiredFiles.length === 0) {
      console.log('No expired colete found')
      return NextResponse.json({
        success: true,
        message: 'No expired colete found',
        movedCount: 0
      })
    }

    console.log(`Found ${expiredFiles.length} expired colete`)

    // 3. Obține stage "Colet Neridicat" din pipeline Vânzări
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

    // 4. Pentru fiecare service file expirat
    for (const sf of expiredFiles) {
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