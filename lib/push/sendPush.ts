/**
 * Trimite notificări Web Push către dispozitivele utilizatorului.
 * Folosește VAPID keys din env (VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY).
 * Generează chei: npx web-push generate-vapid-keys
 */

import webPush from 'web-push'
import { createAdminClient } from '@/lib/supabase/api-helpers'

const vapidPublic = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? process.env.VAPID_PUBLIC_KEY
const vapidPrivate = process.env.VAPID_PRIVATE_KEY

if (vapidPublic && vapidPrivate) {
  webPush.setVapidDetails(
    'mailto:support@crm.local',
    vapidPublic,
    vapidPrivate
  )
}

export function isPushConfigured(): boolean {
  return Boolean(vapidPublic && vapidPrivate)
}

export function getVapidPublicKey(): string | null {
  return vapidPublic ?? null
}

export interface PushPayload {
  title: string
  body: string
  url?: string
  tag?: string
  data?: Record<string, unknown>
}

/**
 * Trimite o notificare push către toate subscripțiile utilizatorului.
 */
export async function sendPushToUser(
  userId: string,
  payload: PushPayload
): Promise<{ sent: number; failed: number; errors: string[] }> {
  const errors: string[] = []
  let sent = 0
  let failed = 0

  if (!vapidPublic || !vapidPrivate) {
    console.warn('[sendPush] Web Push neconfigurat: lipsesc VAPID_PUBLIC_KEY sau VAPID_PRIVATE_KEY. Adaugă-le pe Vercel (Environment Variables).')
    return { sent: 0, failed: 0, errors: ['Web Push nu este configurat (lipsesc VAPID keys pe server).'] }
  }

  const admin = createAdminClient()
  const { data: subscriptions, error } = await admin
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('user_id', userId)

  if (error) {
    return { sent: 0, failed: 0, errors: [error.message] }
  }

  if (!subscriptions?.length) {
    return { sent: 0, failed: 0, errors: [] }
  }

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : (process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '')
  const url = payload.url ?? (baseUrl || '/')
  const urlAbsolute = url.startsWith('http') ? url : (baseUrl ? `${baseUrl}${url.startsWith('/') ? url : '/' + url}` : url)
  const baseOrigin = (baseUrl || '').replace(/\/$/, '')
  // URL absolut pentru icon/badge – pe Android iconița trebuie să fie ~192x192 px (PNG) pentru afișare corectă
  const iconUrl = baseOrigin ? `${baseOrigin}/logo.png` : ''
  const payloadStr = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: urlAbsolute,
    tag: payload.tag ?? 'crm-notification',
    icon: iconUrl,
    badge: iconUrl,
    ...payload.data,
  })

  for (const sub of subscriptions as { id: string; endpoint: string; p256dh: string; auth: string }[]) {
    try {
      await webPush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.p256dh,
            auth: sub.auth,
          },
        },
        payloadStr,
        {
          TTL: 60 * 60 * 24, // 24h
          urgency: 'normal',
        }
      )
      sent++
    } catch (e: any) {
      failed++
      const msg = e?.message ?? String(e)
      errors.push(msg)
      if (e?.statusCode === 410 || e?.statusCode === 404) {
        try {
          await admin.from('push_subscriptions').delete().eq('id', sub.id)
        } catch (_) {}
      }
    }
  }

  return { sent, failed, errors }
}
