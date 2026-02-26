import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { deleteEmptyTrays } from '@/lib/supabase/serviceFileOperations'
import { requireAdminOrOwner } from '@/lib/supabase/api-helpers'

const CRON_SECRET = process.env.CRON_SECRET
const CRON_SECRET_KEY = process.env.CRON_SECRET_KEY

/**
 * Verifică dacă request-ul vine de la cron (Bearer secret).
 * Acceptă CRON_SECRET sau CRON_SECRET_KEY.
 */
function isCronRequest(request: NextRequest): boolean {
  const auth = request.headers.get('authorization')
  if (!auth || !auth.startsWith('Bearer ')) return false
  const token = auth.slice(7).trim()
  return (!!CRON_SECRET && token === CRON_SECRET) || (!!CRON_SECRET_KEY && token === CRON_SECRET_KEY)
}

/**
 * Șterge toate tăvițele goale (fără număr, fără itemi, fără imagini).
 * Util când tăvițele goale blochează mutarea fișei la „De facturat”.
 *
 * Autorizare (Etapa 1 – Analiza riscurilor):
 * - Cron: Header Authorization: Bearer <CRON_SECRET> sau Bearer <CRON_SECRET_KEY>
 * - Dashboard: utilizator autentificat cu rol admin sau owner
 *
 * POST /api/admin/delete-empty-trays
 */
export async function POST(request: NextRequest) {
  const isCron = isCronRequest(request)
  let supabase: ReturnType<typeof createClient>

  if (isCron) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json(
        { success: false, error: 'SUPABASE_SERVICE_ROLE_KEY sau NEXT_PUBLIC_SUPABASE_URL lipsește' },
        { status: 500 }
      )
    }
    supabase = createClient(supabaseUrl, supabaseServiceKey)
  } else {
    try {
      const { admin } = await requireAdminOrOwner()
      supabase = admin
    } catch (res: unknown) {
      if (res && typeof res === 'object' && 'status' in res) {
        return res as NextResponse
      }
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }
  }

  try {
    const result = await deleteEmptyTrays(supabase, {
      minAgeMinutes: isCron ? 10 : 0,
    })
    if (!result.success) {
      return NextResponse.json(
        { success: false, deletedCount: result.deletedCount, error: String(result.error?.message ?? result.error) },
        { status: 500 }
      )
    }
    return NextResponse.json({ success: true, deletedCount: result.deletedCount })
  } catch (e: any) {
    console.error('[delete-empty-trays]', e)
    return NextResponse.json({ success: false, error: e?.message ?? String(e) }, { status: 500 })
  }
}
