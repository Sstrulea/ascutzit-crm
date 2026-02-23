import { createApiSupabaseClient } from '@/lib/supabase/api-helpers'
import { searchTraysGloballyWithClient } from '@/lib/supabase/traySearchServer'
import { NextResponse } from 'next/server'

/**
 * GET /api/search/trays?q=search-term
 *
 * Caută tăvițe global după:
 * - Numărul tăviței
 * - Serial numbers
 * - Brand-uri
 *
 * Folosește client Supabase pe server (nu supabaseBrowser).
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const query = searchParams.get('q')

    if (!query || query.trim().length < 2) {
      return NextResponse.json({
        success: true,
        data: [],
        message: 'Query prea scurt. Introduceți minim 2 caractere.',
      })
    }

    const supabase = await createApiSupabaseClient()
    const { data, error } = await searchTraysGloballyWithClient(supabase, query)

    if (error) {
      return NextResponse.json({
        success: false,
        data: [],
        error: error?.message || 'Search error',
      }, { status: 400 })
    }

    return NextResponse.json({
      success: true,
      data,
      count: data.length,
    })
  } catch (error: any) {
    console.error('[/api/search/trays] Error:', error)

    return NextResponse.json({
      success: false,
      data: [],
      error: error?.message || 'Internal server error',
    }, { status: 500 })
  }
}

