import { NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { runExpireCallbacksAndNuRaspunde } from '@/lib/supabase/expireCallbacks'
import { runExpireColetNeridicat } from '@/lib/supabase/expireColetNeridicat'

/**
 * POST /api/leads/expire-callbacks
 *
 * On-access (nu cron), la încărcarea pipeline-ului Vânzări:
 * 1. Mută lead-urile din Call Back / Nu răspunde (timp expirat) în Leads + tag Follow Up.
 * 2. Mută fișele care sunt în "Curier Trimis" și nu au ajuns la "Colet ajuns" în 36h în "Colet neridicat".
 * Doar utilizatori autentificați.
 */
export async function POST() {
  try {
    const cookieStore = await cookies()
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore })
    const { data: { session }, error: authErr } = await supabase.auth.getSession()
    const user = session?.user
    if (authErr || !user) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
    }

    const [callbacksResult, coletResult] = await Promise.all([
      runExpireCallbacksAndNuRaspunde(),
      runExpireColetNeridicat(),
    ])

    if (!callbacksResult.ok) {
      return NextResponse.json(
        { ok: false, movedCount: callbacksResult.movedCount, error: callbacksResult.error },
        { status: 500 }
      )
    }

    return NextResponse.json({
      ok: true,
      movedCount: callbacksResult.movedCount,
      coletNeridicatMovedCount: coletResult.movedCount ?? 0,
    })
  } catch (e: any) {
    console.error('[/api/leads/expire-callbacks] Error:', e)
    return NextResponse.json(
      { ok: false, movedCount: 0, error: e?.message || 'Unknown error' },
      { status: 500 }
    )
  }
}
