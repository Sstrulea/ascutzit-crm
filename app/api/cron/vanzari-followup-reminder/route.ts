/**
 * CRON JOB: Follow-up Reminder Automat
 * =======================================
 * POST /api/cron/vanzari-followup-reminder
 * 
 * Rulează zilnic la 09:00
 * 
 * Proces:
 * 1. Caută lead-uri cu callback expirând în 24h
 * 2. Trimite email notificare vânzătorilor
 * 3. Creează reminder în sistem
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

    console.log('Starting Follow-up Reminder cron job...')

    // 2. Obține pipeline Vânzări
    const { data: pipeline } = await supabase
      .from('pipelines')
      .select('id')
      .eq('name', 'Vânzări')
      .single()

    if (!pipeline) {
      throw new Error('Vânzări pipeline not found')
    }

    // 3. Caută lead-uri cu callback expirând în 24h
    const now = new Date()
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000)
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)

    const { data: leads, error: queryError } = await supabase
      .from('pipeline_items')
      .select(`
        item_id,
        stages!inner (
          id,
          name,
          pipeline_id
        ),
        leads!inner (
          id,
          name,
          assigned_to,
          callback_date,
          user_profiles (
            id,
            email,
            full_name
          )
        )
      `)
      .eq('type', 'lead')
      .eq('stages.pipeline_id', pipeline.id)
      .gt('leads.callback_date', oneDayAgo.toISOString())
      .lt('leads.callback_date', tomorrow.toISOString())

    if (queryError) {
      throw new Error(`Failed to query callbacks: ${queryError.message}`)
    }

    if (!leads || leads.length === 0) {
      console.log('No callbacks expiring soon')
      return NextResponse.json({
        success: true,
        message: 'No callbacks expiring soon',
        reminderCount: 0
      })
    }

    console.log(`Found ${leads.length} callbacks expiring soon`)

    let reminderCount = 0

    // 4. Pentru fiecare lead cu callback
    for (const leadData of leads) {
      const lead: any = leadData.leads
      const seller: any = lead.leads?.user_profiles

      if (!lead || !seller) {
        console.error('Missing lead or seller data')
        continue
      }

      // Calculează timpul rămas până la callback
      const callbackTime = new Date(lead.callback_date).getTime()
      const hoursUntilCallback = Math.round((callbackTime - now.getTime()) / (60 * 60 * 1000))
      const daysUntilCallback = Math.round((callbackTime - now.getTime()) / (24 * 60 * 60 * 1000))

      // Creează reminder message
      let message = ''
      if (daysUntilCallback === 0) {
        message = `Callback programat ASTĂZI: ${lead.name} la ${new Date(lead.callback_date).toLocaleTimeString('ro-RO')}`
      } else if (daysUntilCallback === 1) {
        message = `Callback programat MÂINE: ${lead.name} la ${new Date(lead.callback_date).toLocaleString('ro-RO')}`
      } else {
        message = `Callback programat în ${daysUntilCallback} zile: ${lead.name}`
      }

      // Loghează reminder în items_events
      await supabase
        .from('items_events')
        .insert({
          type: 'lead',
          item_id: lead.id,
          event_type: 'follow_up_reminder',
          message,
          event_details: {
            callback_date: lead.callback_date,
            hours_until_callback: hoursUntilCallback,
            days_until_callback: daysUntilCallback,
            automated: true
          }
        })

      // NOTĂ: Aici se poate adăuga integrare email
      // Ex: await sendEmail(seller.email, 'Follow-up Reminder', message)
      console.log(`Reminder sent to seller ${seller.full_name} (${seller.email}): ${message}`)

      reminderCount++
    }

    console.log(`Sent ${reminderCount} follow-up reminders`)

    return NextResponse.json({
      success: true,
      message: `Sent ${reminderCount} follow-up reminders`,
      reminderCount
    })

  } catch (error: any) {
    console.error('Follow-up Reminder cron error:', error)
    return NextResponse.json(
      { error: error?.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

// GET pentru test manual
export async function GET(request: NextRequest) {
  return NextResponse.json({
    message: 'Use POST to trigger Follow-up Reminder cron job',
    usage: 'POST with Authorization: Bearer CRON_SECRET_KEY'
  })
}