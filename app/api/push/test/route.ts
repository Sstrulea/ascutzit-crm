import { NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { sendPushToUser } from '@/lib/push/sendPush'

/**
 * POST /api/push/test
 * Trimite o notificare push de test către utilizatorul curent.
 * Util pentru verificarea că push funcționează pe dispozitivul curent.
 */
export async function POST() {
  try {
    const cookieStore = await cookies()
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore })
    const { data: { session }, error: authError } = await supabase.auth.getSession()

    if (authError || !session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '')
    const pushUrl = baseUrl || '/'

    const result = await sendPushToUser(session.user.id, {
      title: '🔔 Test CRM',
      body: 'Dacă vezi această notificare, push funcționează corect pe acest dispozitiv.',
      url: pushUrl,
      tag: 'test-push',
    })

    if (result.errors.length > 0 && result.sent === 0) {
      return NextResponse.json({
        success: false,
        error: result.errors[0] || 'Eroare la trimitere',
        sent: 0,
      })
    }

    return NextResponse.json({
      success: true,
      sent: result.sent,
      failed: result.failed,
    })
  } catch (e: any) {
    console.error('[push/test] Exception:', e?.message)
    return NextResponse.json({ success: false, error: e?.message || 'Internal error' }, { status: 500 })
  }
}
