import { NextResponse } from 'next/server'
import { getVapidPublicKey } from '@/lib/push/sendPush'

/**
 * GET /api/push/vapid-public
 * Returnează cheia publică VAPID pentru înregistrarea subscripției push în browser.
 */
export async function GET() {
  const key = getVapidPublicKey()
  if (!key) {
    return NextResponse.json(
      { error: 'Push notifications not configured' },
      { status: 503 }
    )
  }
  return NextResponse.json({ publicKey: key })
}
