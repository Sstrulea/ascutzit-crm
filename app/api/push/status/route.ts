import { NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'

/**
 * GET /api/push/status
 * Verifică dacă utilizatorul are subscripții push active (pentru afișarea corectă a statusului).
 */
export async function GET() {
  try {
    const cookieStore = await cookies()
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore })
    const { data: { session }, error: authError } = await supabase.auth.getSession()

    if (authError || !session?.user) {
      return NextResponse.json({ hasSubscription: false })
    }

    const { count, error } = await supabase
      .from('push_subscriptions')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', session.user.id)

    if (error) {
      console.error('[push/status] Error:', error.message)
      return NextResponse.json({ hasSubscription: false })
    }

    return NextResponse.json({ hasSubscription: (count ?? 0) > 0 })
  } catch (e: any) {
    console.error('[push/status] Exception:', e?.message)
    return NextResponse.json({ hasSubscription: false })
  }
}
