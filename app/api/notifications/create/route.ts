import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/api-helpers'
import { sendPushToUser } from '@/lib/push/sendPush'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { userId, type, title, message, data } = body

    if (!userId || !type || !title || !message) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      )
    }

    const admin = createAdminClient()

    const { data: notification, error } = await admin
      .from('notifications')
      .insert({
        user_id: userId,
        type,
        title,
        message,
        data: data || {},
        read: false,
      })
      .select()
      .single()

    if (error) {
      console.error('[API /notifications/create] Error:', error.message)
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      )
    }

    // Trimite și notificare push pe telefon/dispozitiv dacă utilizatorul are subscripții
    try {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL ||
        (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '')
      const trayId = data?.trayId ?? data?.tray_id
      const pushUrl = trayId && baseUrl
        ? `${baseUrl}/tehnician/tray/${trayId}`
        : baseUrl || '/'
      const pushResult = await sendPushToUser(userId, {
        title,
        body: message,
        url: pushUrl,
        tag: type,
        data: { notificationId: notification?.id, type, ...data },
      })
      if (pushResult.sent > 0) {
        console.log(`[API /notifications/create] Push trimis: ${pushResult.sent} dispozitive, userId=${userId}`)
      }
      if (pushResult.failed > 0 || pushResult.errors.length > 0) {
        console.warn('[API /notifications/create] Push eșec:', pushResult.failed, 'failed, errors:', pushResult.errors)
      }
      if (pushResult.sent === 0 && pushResult.failed === 0) {
        console.log('[API /notifications/create] Push: niciun push trimis (posibil fără subscripții pentru userId)', userId)
      }
    } catch (pushErr: any) {
      console.warn('[API /notifications/create] Push send failed:', pushErr?.message)
    }

    return NextResponse.json({ success: true, notification })
  } catch (err: any) {
    console.error('[API /notifications/create] Exception:', err.message)
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    )
  }
}
