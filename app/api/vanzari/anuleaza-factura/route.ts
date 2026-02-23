/**
 * API ROUTE: Anulare Factură
 * ============================
 * POST /api/vanzari/anuleaza-factura
 * 
 * Proces de anulare a unei facturi:
 * 1. Validare permisiuni (admin/owner only)
 * 2. Validare motiv (obligatoriu)
 * 3. Deblocare service_file
 * 4. Resetare status
 * 5. Înregistrare în items_events
 */

import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { anuleazaFactura } from '@/lib/vanzari/facturare'

export async function POST(request: NextRequest) {
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

    // 2. Validare body
    const body = await request.json()
    const { serviceFileId, motiv } = body

    if (!serviceFileId) {
      return NextResponse.json(
        { error: 'serviceFileId is required' },
        { status: 400 }
      )
    }

    if (!motiv || motiv.trim().length === 0) {
      return NextResponse.json(
        { error: 'Motivul anulării este obligatoriu' },
        { status: 400 }
      )
    }

    // 3. Validare permisiuni (admin/owner only)
    const { data: userProfile } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    const role = userProfile?.role?.toLowerCase()
    if (role !== 'admin' && role !== 'owner') {
      return NextResponse.json(
        { error: 'Insufficient permissions. Only admin/owner can cancel invoices' },
        { status: 403 }
      )
    }

    // 4. Anulează factură
    const result = await anuleazaFactura(
      serviceFileId,
      motiv,
      user.id
    )

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Anulare failed' },
        { status: 400 }
      )
    }

    // 5. Success
    return NextResponse.json({
      success: true,
      message: 'Factura a fost anulată cu succes'
    })

  } catch (error: any) {
    console.error('Anulare factura API error:', error)
    return NextResponse.json(
      { error: error?.message || 'Internal server error' },
      { status: 500 }
    )
  }
}