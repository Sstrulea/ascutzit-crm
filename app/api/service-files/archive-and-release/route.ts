import { NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import {
  archiveServiceFileToDbServer,
  syncLeadUrgentReturTagsFromActiveServiceFiles,
  releaseTraysOnArchiveServer,
  getArhivarePipelineStages,
  moveItemsToArhivarePipelineServer,
  moveLeadToArhivatVanzariServer,
} from '@/lib/supabase/serviceFileArchiveServer'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * POST /api/service-files/archive-and-release
 *
 * Arhivare + eliberare tăvițe într-un singur request (reducem 6–8+ call-uri la 1).
 * Body: { service_file_id: string }
 * Doar utilizatori autentificați; recomandat rol owner/admin (R12).
 */
export async function POST(req: Request) {
  try {
    const cookieStore = await cookies()
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore })
    const { data: { session }, error: authErr } = await supabase.auth.getSession()
    const user = session?.user
    if (authErr || !user) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json().catch(() => ({}))
    const serviceFileId = body?.service_file_id ?? body?.serviceFileId
    if (!serviceFileId || typeof serviceFileId !== 'string') {
      return NextResponse.json(
        { ok: false, error: 'service_file_id required' },
        { status: 400 }
      )
    }
    if (!UUID_REGEX.test(serviceFileId)) {
      return NextResponse.json(
        { ok: false, error: 'service_file_id invalid' },
        { status: 400 }
      )
    }

    // R13: Verificăm că fișa există înainte de orice
    const { data: existingSf, error: fetchSfErr } = await supabase
      .from('service_files')
      .select('id, lead_id, archived_at')
      .eq('id', serviceFileId)
      .single()
    if (fetchSfErr || !existingSf) {
      return NextResponse.json(
        { ok: false, error: 'Fișa nu a fost găsită' },
        { status: 404 }
      )
    }

    // R12: Doar owner/admin (sau receptie dacă există) pot arhiva
    const { data: member } = await supabase
      .from('app_members')
      .select('role')
      .eq('user_id', user.id)
      .maybeSingle()
    const role = (member as any)?.role?.toLowerCase()
    const canArchive = role === 'owner' || role === 'admin' || role === 'receptie'
    if (!canArchive && role != null) {
      return NextResponse.json(
        { ok: false, error: 'Nu ai permisiunea de a arhiva fișe' },
        { status: 403 }
      )
    }

    const { success: archiveOk, leadId, trayIds, error: archiveError } = await archiveServiceFileToDbServer(
      supabase as any,
      serviceFileId
    )
    if (!archiveOk) {
      return NextResponse.json(
        { ok: false, error: archiveError?.message ?? 'Archive failed' },
        { status: 500 }
      )
    }

    if (leadId) {
      await syncLeadUrgentReturTagsFromActiveServiceFiles(supabase as any, leadId)
    }

    const arhivareStages = await getArhivarePipelineStages(supabase as any)

    if (arhivareStages) {
      // Pipeline Arhivare: mută lead în LEADURI, fișa în FISE, tăvițe în TAVITE (fără release)
      const moveResult = await moveItemsToArhivarePipelineServer(supabase as any, arhivareStages, {
        leadId: leadId ?? undefined,
        serviceFileId,
        trayIds,
      })
      return NextResponse.json({
        ok: true,
        deletedCount: 0,
        leadMoved: moveResult.leadMoved,
        fisaMoved: moveResult.fisaMoved,
        traysMoved: moveResult.traysMoved,
        arhivare: true,
      })
    }

    // Fallback: nu există pipeline Arhivare – mută lead în Vânzări/Arhivat + eliberează tăvițe
    const { success: releaseOk, deletedCount, error: releaseError } = await releaseTraysOnArchiveServer(
      supabase as any,
      serviceFileId
    )
    if (!releaseOk) {
      return NextResponse.json(
        { ok: false, error: releaseError?.message ?? 'Release failed' },
        { status: 500 }
      )
    }
    let leadMoved = false
    if (leadId) {
      const { ok: moveOk } = await moveLeadToArhivatVanzariServer(supabase as any, leadId)
      leadMoved = moveOk
    }
    return NextResponse.json({ ok: true, deletedCount: deletedCount ?? 0, leadMoved, arhivare: false })
  } catch (e: any) {
    console.error('[/api/service-files/archive-and-release] Error:', e)
    return NextResponse.json(
      { ok: false, error: e?.message ?? 'Unknown error' },
      { status: 500 }
    )
  }
}
