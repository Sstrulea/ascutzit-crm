import { createApiSupabaseClient } from '@/lib/supabase/api-helpers'
import { searchUnifiedWithClient } from '@/lib/supabase/unifiedSearchServer'
import type { UnifiedSearchResult } from '@/lib/supabase/unifiedSearchServer'
import { logApiError } from '@/lib/utils/apiErrorLog'
import { NextResponse } from 'next/server'

const MAX_QUERY_LENGTH = 200
const SEARCH_CACHE_TTL_MS = 30_000
const SEARCH_CACHE_MAX_KEYS = 100

const searchCache = new Map<string, { data: UnifiedSearchResult[]; at: number }>()
function getCachedSearch(query: string): UnifiedSearchResult[] | null {
  const key = query.trim().toLowerCase().slice(0, MAX_QUERY_LENGTH)
  const entry = searchCache.get(key)
  if (!entry) return null
  if (Date.now() - entry.at > SEARCH_CACHE_TTL_MS) {
    searchCache.delete(key)
    return null
  }
  return entry.data
}
function setCachedSearch(query: string, data: UnifiedSearchResult[]) {
  const key = query.trim().toLowerCase().slice(0, MAX_QUERY_LENGTH)
  if (searchCache.size >= SEARCH_CACHE_MAX_KEYS) {
    const oldest = [...searchCache.entries()].sort((a, b) => a[1].at - b[1].at)[0]
    if (oldest) searchCache.delete(oldest[0])
  }
  searchCache.set(key, { data, at: Date.now() })
}

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

    const cached = getCachedSearch(query)
    if (cached) {
      return NextResponse.json({ success: true, data: cached, count: cached.length, cached: true })
    }

    const { data, error } = await searchUnifiedWithClient(supabase, query)
    if (!error && data) setCachedSearch(query, data)

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
