/**
 * API ROUTE: Facturare Service File
 * ================================
 * POST /api/vanzari/factureaza
 * 
 * Proces complet de facturare a unui service file:
 * 1. Validare permisiuni și precondiții
 * 2. Calcul total final cu discount-uri
 * 3. Actualizare service_file (blocare)
 * 4. Arhivare completă
 * 5. Ștergere poziții tăvițe
 * 6. Înregistrare în items_events
 */

import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { factureazaServiceFile } from '@/lib/vanzari/facturare'

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
    const { serviceFileId, facturareData } = body

    if (!serviceFileId) {
      return NextResponse.json(
        { error: 'serviceFileId is required' },
        { status: 400 }
      )
    }

    // 3. Validare permisiuni (vânzător/admin/owner)
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

    // 4. Facturează service file
    const result = await factureazaServiceFile(
      serviceFileId,
      facturareData || {},
      user.id
    )

    if (!result.success) {
      return NextResponse.json(
        {
          error: result.error || 'Facturare failed',
          validationErrors: result.validationErrors
        },
        { status: 400 }
      )
    }

    // 5. Success
    return NextResponse.json({
      success: true,
      facturaId: result.facturaId,
      facturaNumber: result.facturaNumber,
      total: result.total,
      arhivaFisaId: result.arhivaFisaId
    })

  } catch (error: any) {
    console.error('Facturare API error:', error)
    return NextResponse.json(
      { error: error?.message || 'Internal server error' },
      { status: 500 }
    )
  }
}