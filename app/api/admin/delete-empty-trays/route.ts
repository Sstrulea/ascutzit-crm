import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { deleteEmptyTrays } from '@/lib/supabase/serviceFileOperations'

/**
 * Șterge toate tăvițele goale (fără număr și mărime – câmpul number NULL sau gol).
 * Util când tăvițele goale blochează mutarea fișei la „De facturat”.
 * POST /api/admin/delete-empty-trays
 */
export async function POST() {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json(
        { success: false, error: 'SUPABASE_SERVICE_ROLE_KEY sau NEXT_PUBLIC_SUPABASE_URL lipsește' },
        { status: 500 }
      )
    }
    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    const result = await deleteEmptyTrays(supabase)
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
