import { NextRequest, NextResponse } from 'next/server'
import { createApiSupabaseClient } from '@/lib/supabase/api-helpers'

/**
 * POST /api/tracking
 * Primește evenimente de tracking (click, input_change) din client.
 * Suportă batch: { batch: true, events: [...] } – un singur getSession() pentru toate.
 * Poate fi extins pentru persistență în Supabase (tabel tracking_events).
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createApiSupabaseClient()
    const { data: { session } } = await supabase.auth.getSession()
    const userId = session?.user?.id ?? null

    const body = await request.json()
    const events: unknown[] = body?.batch === true && Array.isArray(body?.events) ? body.events : [body]

    for (const ev of events) {
      const { type, action, timestamp, context } = (ev as Record<string, unknown>) || {}
      if (!type || !action || !timestamp || !(context as Record<string, unknown>)?.pathname) continue
      if (!['click', 'input_change'].includes(type as string)) continue

      const event = {
        ...(ev as object),
        user_id: userId,
        created_at: new Date().toISOString(),
      }

      if (process.env.NODE_ENV === 'development') {
        const id = type === 'click' ? (event as any).identifier : (event as any).fieldName
        console.log('[Tracking API]', type, id ?? '', (context as Record<string, unknown>)?.pathname)
      }
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[Tracking API] Error:', err)
    return NextResponse.json({ success: false, error: 'Internal error' }, { status: 500 })
  }
}
