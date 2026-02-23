import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { TechnicianStatisticsServiceServer } from '@/lib/supabase/technicianStatisticsServiceServer'
import type { TechnicianStatsFilter } from '@/lib/supabase/technicianStatisticsTypes'

export async function GET(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies })
    const statsService = new TechnicianStatisticsServiceServer(supabase)
    
    // Verifică autentificarea (getUser validează JWT pe server – securitate API)
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: 'Neautorizat' },
        { status: 401 }
      )
    }

    // Obține parametrii din query
    const searchParams = request.nextUrl.searchParams
    const technicianId = searchParams.get('technicianId') || user.id
    const period = searchParams.get('period') as 'today' | 'week' | 'month' | null
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')
    const includeSplitTrays = searchParams.get('includeSplitTrays') === 'true'
    const includeWaitingTime = searchParams.get('includeWaitingTime') !== 'false'
    const groupBy = searchParams.get('groupBy') as 'day' | 'week' | 'month' | 'tray' | null

    // Verifică permisiuni (doar admin sau tehnicianul propriu)
    const { data: member } = await supabase
      .from('app_members')
      .select('role')
      .eq('user_id', user.id)
      .single()

    const isAdmin = member?.role === 'admin' || member?.role === 'owner'
    const isOwnData = technicianId === user.id

    if (!isAdmin && !isOwnData) {
      return NextResponse.json(
        { success: false, error: 'Permisiuni insuficiente' },
        { status: 403 }
      )
    }

    // Construiește filtrul
    const filter: TechnicianStatsFilter = {}

    if (period) {
      filter.period = period
    }

    if (startDate && endDate) {
      filter.dateRange = {
        start: new Date(startDate),
        end: new Date(endDate)
      }
    }

    if (includeSplitTrays !== undefined) {
      filter.includeSplitTrays = includeSplitTrays
    }

    if (includeWaitingTime !== undefined) {
      filter.includeWaitingTime = includeWaitingTime
    }

    if (groupBy) {
      filter.groupBy = groupBy
    }

    // Obține statisticile
    const statistics = await statsService.getTechnicianStatistics(technicianId, filter)

    return NextResponse.json({
      success: true,
      data: statistics,
      timestamp: new Date()
    })

  } catch (error: any) {
    console.error('Error fetching technician statistics:', error)
    return NextResponse.json(
      { 
        success: false, 
        error: error.message || 'Eroare la obținerea statisticilor',
        timestamp: new Date()
      },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies })
    const statsService = new TechnicianStatisticsServiceServer(supabase as any)
    
    // Verifică autentificarea (getUser validează JWT pe server – securitate API)
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: 'Neautorizat' },
        { status: 401 }
      )
    }

    // Verifică dacă este admin
    const { data: member } = await supabase
      .from('app_members')
      .select('role')
      .eq('user_id', user.id)
      .single()

    const isAdmin = member?.role === 'admin' || member?.role === 'owner'

    if (!isAdmin) {
      return NextResponse.json(
        { success: false, error: 'Doar administratorii pot edita statistici' },
        { status: 403 }
      )
    }

    // Parsează body-ul
    const body = await request.json()
    const { technicianId, field, newValue, reason } = body

    if (!technicianId || !field || newValue === undefined) {
      return NextResponse.json(
        { success: false, error: 'Date incomplete' },
        { status: 400 }
      )
    }

    // Obține valoarea veche
    const oldStats = await statsService.getTechnicianStatistics(technicianId)
    const oldValue = (oldStats as any)[field]

    // Înregistrează editarea în istoric
    const { error: historyError } = await supabase
      .from('technician_stats_history')
      .insert({
        technician_id: technicianId,
        field,
        old_value: oldValue,
        new_value: newValue,
        edited_by: user.id,
        edit_reason: reason || null,
        edited_at: new Date().toISOString()
      })

    if (historyError) {
      console.error('Error saving edit history:', historyError)
    }

    // Șterge cache-ul pentru acest tehnician
    statsService.clearCacheForTechnician(technicianId)

    return NextResponse.json({
      success: true,
      message: 'Statistica a fost actualizată',
      data: {
        technicianId,
        field,
        oldValue,
        newValue,
        editedBy: user.id,
        editDate: new Date()
      },
      timestamp: new Date()
    })

  } catch (error: any) {
    console.error('Error updating technician statistics:', error)
    return NextResponse.json(
      { 
        success: false, 
        error: error.message || 'Eroare la actualizarea statisticilor',
        timestamp: new Date()
      },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies })
    const statsService = new TechnicianStatisticsServiceServer(supabase as any)
    
    // Verifică autentificarea (getUser validează JWT pe server – securitate API)
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: 'Neautorizat' },
        { status: 401 }
      )
    }

    // Verifică dacă este admin
    const { data: member } = await supabase
      .from('app_members')
      .select('role')
      .eq('user_id', user.id)
      .single()

    const isAdmin = member?.role === 'admin' || member?.role === 'owner'

    if (!isAdmin) {
      return NextResponse.json(
        { success: false, error: 'Doar administratorii pot șterge cache' },
        { status: 403 }
      )
    }

    // Obține parametrii
    const searchParams = request.nextUrl.searchParams
    const technicianId = searchParams.get('technicianId')
    const clearAll = searchParams.get('clearAll') === 'true'

    if (clearAll) {
      statsService.clearAllCache()
      return NextResponse.json({
        success: true,
        message: 'Cache-ul a fost șters complet',
        timestamp: new Date()
      })
    }

    if (technicianId) {
      statsService.clearCacheForTechnician(technicianId)
      return NextResponse.json({
        success: true,
        message: `Cache-ul pentru tehnicianul ${technicianId} a fost șters`,
        timestamp: new Date()
      })
    }

    return NextResponse.json({
      success: false,
      error: 'Specificați technicianId sau setați clearAll=true',
      timestamp: new Date()
    }, { status: 400 })

  } catch (error: any) {
    console.error('Error clearing cache:', error)
    return NextResponse.json(
      { 
        success: false, 
        error: error.message || 'Eroare la ștergerea cache-ului',
        timestamp: new Date()
      },
      { status: 500 }
    )
  }
}
