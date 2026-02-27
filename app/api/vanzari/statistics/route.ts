/**
 * API ROUTE: Statistici Avansate Vânzări
 * ========================================
 * GET /api/vanzari/statistics
 * 
 * Returnează statistici avansate:
 * - Time to Close (timp mediu de la lead la factură)
 * - Top Sellers (clasament vânzători)
 * - Discount Analysis (analiza discount-urilor)
 * - Payment Methods (distribuția cash/card)
 */

import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import {
  getTimeToCloseStats,
  getTopSellers,
  getDiscountAnalysis,
  getPaymentMethodsStats,
  getAdvancedDashboardStats
} from '@/lib/vanzari/advancedStatistics'

export async function GET(request: NextRequest) {
  try {
    // 1. Autentificare
    const supabase = createRouteHandlerClient({ cookies })
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // 2. Validare permisiuni (admin/owner/vanzar)
    const { data: userProfile } = await supabase
      .from('app_members')
      .select('role')
      .eq('user_id', user.id)
      .single()

    const role = userProfile?.role?.toLowerCase()
    if (
      role !== 'vanzator' &&
      role !== 'admin' &&
      role !== 'owner'
    ) {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      )
    }

    // 3. Parse query params pentru date personalizate
    const searchParams = request.nextUrl.searchParams
    const startDateParam = searchParams.get('startDate')
    const endDateParam = searchParams.get('endDate')

    let startDate: Date | undefined
    let endDate: Date | undefined

    if (startDateParam) {
      startDate = new Date(startDateParam)
    }
    if (endDateParam) {
      endDate = new Date(endDateParam)
    }

    // 4. Obține statistici în funcție de parametri
    const type = searchParams.get('type')

    if (type === 'timeToClose') {
      const stats = await getTimeToCloseStats(startDate, endDate)
      return NextResponse.json({ success: true, type: 'timeToClose', data: stats })
    }

    if (type === 'topSellers') {
      const stats = await getTopSellers(startDate, endDate)
      return NextResponse.json({ success: true, type: 'topSellers', data: stats })
    }

    if (type === 'discounts') {
      const stats = await getDiscountAnalysis(startDate, endDate)
      return NextResponse.json({ success: true, type: 'discounts', data: stats })
    }

    if (type === 'paymentMethods') {
      const stats = await getPaymentMethodsStats(startDate, endDate)
      return NextResponse.json({ success: true, type: 'paymentMethods', data: stats })
    }

    // 5. Default: returnează toate statisticile
    const allStats = await getAdvancedDashboardStats()
    return NextResponse.json({
      success: true,
      type: 'all',
      data: allStats
    })

  } catch (error: any) {
    console.error('Statistics API error:', error)
    return NextResponse.json(
      { error: error?.message || 'Internal server error' },
      { status: 500 }
    )
  }
}