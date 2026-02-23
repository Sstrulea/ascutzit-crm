import { createApiSupabaseClient } from '@/lib/supabase/api-helpers'
import { searchUnifiedWithClient } from '@/lib/supabase/unifiedSearchServer'
import { logApiError } from '@/lib/utils/apiErrorLog'
import { NextResponse } from 'next/server'

const MAX_QUERY_LENGTH = 200

/**
 * GET /api/search/unified?q=...
 * Caută în paralel: lead-uri, fișe de serviciu, tăvițe.
 * Returnează un array cu { type, id, title, subtitle, pipelineSlug, openId } pentru afișare și redirecționare.
 * Parametrul q este truncat la MAX_QUERY_LENGTH caractere.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const raw = searchParams.get('q')
    const query = raw?.trim().slice(0, MAX_QUERY_LENGTH) ?? ''

    if (query.length < 2) {
      return NextResponse.json({
        success: true,
        data: [],
        message: 'Introdu minim 2 caractere.',
      })
    }

    const supabase = await createApiSupabaseClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) {
      return NextResponse.json(
        { success: false, data: [], error: 'Necesită autentificare.' },
        { status: 401 }
      )
    }

    const { data, error } = await searchUnifiedWithClient(supabase, query)

    if (error) {
      return NextResponse.json({
        success: false,
        data: [],
        error: error?.message || 'Eroare la căutare',
      }, { status: 400 })
    }

    return NextResponse.json({
      success: true,
      data: data || [],
      count: (data || []).length,
    })
  } catch (err: unknown) {
    logApiError('/api/search/unified', err)
    const message = err instanceof Error ? err.message : 'Eroare internă'
    return NextResponse.json({
      success: false,
      data: [],
      error: message,
    }, { status: 500 })
  }
}
