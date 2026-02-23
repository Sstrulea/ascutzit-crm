import { NextResponse } from 'next/server'
import { isPushConfigured } from '@/lib/push/sendPush'

/**
 * GET /api/push/config-check
 * Verifică dacă VAPID este configurat pe server (fără a expune cheile).
 * Utilitar de diagnostic pentru push notifications.
 */
export async function GET() {
  const configured = isPushConfigured()
  return NextResponse.json({
    configured,
    hint: configured
      ? 'VAPID configurat. Dacă notificările tot nu merg, verifică: redeploy după adăugare env, sesiune/logare pe telefon, Service Worker.'
      : 'VAPID lipsă. Adaugă NEXT_PUBLIC_VAPID_PUBLIC_KEY și VAPID_PRIVATE_KEY în Vercel → Settings → Environment Variables, apoi redeploy.',
  })
}
