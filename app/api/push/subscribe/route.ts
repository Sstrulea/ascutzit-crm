import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'

/**
 * POST /api/push/subscribe
 * Salvează subscripția Web Push pentru utilizatorul autentificat.
 * Body: { subscription: PushSubscriptionJSON } (endpoint, keys.p256dh, keys.auth)
 */
export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore })
    const { data: { session }, error: authError } = await supabase.auth.getSession()

    if (authError || !session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const subscription = body?.subscription

    if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
      return NextResponse.json(
        { success: false, error: 'Missing subscription (endpoint, keys.p256dh, keys.auth)' },
        { status: 400 }
      )
    }

    const userAgent = request.headers.get('user-agent') ?? null

    const { error } = await supabase
      .from('push_subscriptions')
      .upsert(
        {
          user_id: session.user.id,
          endpoint: subscription.endpoint,
          p256dh: subscription.keys.p256dh,
          auth: subscription.keys.auth,
          user_agent: userAgent,
        },
        { onConflict: 'endpoint' }
      )

    if (error) {
      console.error('[push/subscribe] Error:', error.message)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (e: any) {
    console.error('[push/subscribe] Exception:', e?.message)
    return NextResponse.json(
      { success: false, error: e?.message ?? 'Internal error' },
      { status: 500 }
    )
  }
}
