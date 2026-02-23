/**
 * CRON JOB: Auto-archive No Deal
 * =================================
 * POST /api/cron/vanzari-archive-no-deal
 * 
 * Rulează săptămânal (duminică la 23:59)
 * 
 * Proces:
 * 1. Caută lead-urile No Deal mai vechi de 30 zile
 * 2. Arhivează în arhiva_fise_serviciu
 * 3. Șterge din pipeline
 * 4. Loghează în items_events
 */

import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    // 1. Autentificare (cron job secret key)
    const supabase = createRouteHandlerClient({ cookies })
    
    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${process.env.CRON_SECRET_KEY}`) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    console.log('Starting Auto-archive No Deal cron job...')

    // 2. Obține pipeline Vânzări și stage No Deal
    const { data: pipeline } = await supabase
      .from('pipelines')
      .select('id')
      .eq('name', 'Vânzări')
      .single()

    if (!pipeline) {
      throw new Error('Vânzări pipeline not found')
    }

    const { data: noDealStage } = await supabase
      .from('stages')
      .select('id')
      .eq('pipeline_id', pipeline.id)
      .ilike('name', '%no deal%')
      .single()

    if (!noDealStage) {
      throw new Error('No Deal stage not found')
    }

    // 3. Caută lead-urile No Deal mai vechi de 30 zile
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

    const { data: pipelineItems, error: queryError } = await supabase
      .from('pipeline_items')
      .select(`
        item_id,
        leads!inner (
          id,
          name,
          no_deal_date,
          service_files (
            id,
            number,
            status
          )
        )
      `)
      .eq('type', 'lead')
      .eq('stage_id', noDealStage.id)
      .lt('leads.no_deal_date', thirtyDaysAgo)

    if (queryError) {
      throw new Error(`Failed to query no deal leads: ${queryError.message}`)
    }

    if (!pipelineItems || pipelineItems.length === 0) {
      console.log('No no-deal leads older than 30 days found')
      return NextResponse.json({
        success: true,
        message: 'No no-deal leads older than 30 days found',
        archivedCount: 0
      })
    }

    console.log(`Found ${pipelineItems.length} no-deal leads older than 30 days`)

    let archivedCount = 0

    // 4. Pentru fiecare lead No Deal
    for (const item of pipelineItems) {
      const lead: any = item.leads

      if (!lead) {
        console.error('Missing lead data')
        continue
      }

      // Obține date complete pentru arhivare
      const { data: fullLead } = await supabase
        .from('leads')
        .select(`
          *,
          service_files (
            *,
            trays (
              *,
              tray_items (
                *,
                service (*),
                part (*),
                instrument (*)
              ),
              service_file (
                id,
                urgent
              )
            ),
            stage_history (*)
          ),
          items_events (
            *
          ),
          conversatie (
            *
          )
        `)
        .eq('id', lead.id)
        .single()

      if (!fullLead) {
        console.error(`Failed to fetch full lead data for ${lead.id}`)
        continue
      }

      // Arhivează în arhiva_fise_serviciu
      const { error: archiveError } = await supabase
        .from('arhiva_fise_serviciu')
        .insert({
          lead_id: lead.id,
          lead_data: JSON.stringify(fullLead),
          archived_by: 'system',
          archived_at: new Date().toISOString(),
          motiv: 'Auto-archive: No Deal older than 30 days',
          metadata: {
            no_deal_date: lead.no_deal_date,
            days_in_no_deal: Math.floor((Date.now() - new Date(lead.no_deal_date).getTime()) / (24 * 60 * 60 * 1000)),
            service_files_count: lead.service_files?.length || 0,
            automated: true
          }
        })

      if (archiveError) {
        console.error(`Failed to archive lead ${lead.id}:`, archiveError)
        continue
      }

      // Șterge din pipeline
      const { error: deleteError } = await supabase
        .from('pipeline_items')
        .delete()
        .eq('item_id', lead.id)
        .eq('type', 'lead')

      if (deleteError) {
        console.error(`Failed to delete from pipeline ${lead.id}:`, deleteError)
        continue
      }

      // Loghează în items_events (înainte de ștergere)
      await supabase
        .from('items_events')
        .insert({
          type: 'lead',
          item_id: lead.id,
          event_type: 'auto_archived_no_deal',
          message: `Lead arhivat automat (No Deal de ${(Date.now() - new Date(lead.no_deal_date).getTime()) / (24 * 60 * 60 * 1000)} zile)`,
          event_details: {
            no_deal_date: lead.no_deal_date,
            days_in_no_deal: Math.floor((Date.now() - new Date(lead.no_deal_date).getTime()) / (24 * 60 * 60 * 1000)),
            service_files_count: lead.service_files?.length || 0,
            archived_at: new Date().toISOString(),
            automated: true
          }
        })

      archivedCount++
    }

    console.log(`Archived ${archivedCount} no-deal leads`)

    return NextResponse.json({
      success: true,
      message: `Archived ${archivedCount} no-deal leads older than 30 days`,
      archivedCount
    })

  } catch (error: any) {
    console.error('Auto-archive No Deal cron error:', error)
    return NextResponse.json(
      { error: error?.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

// GET pentru test manual
export async function GET(request: NextRequest) {
  return NextResponse.json({
    message: 'Use POST to trigger Auto-archive No Deal cron job',
    usage: 'POST with Authorization: Bearer CRON_SECRET_KEY'
  })
}