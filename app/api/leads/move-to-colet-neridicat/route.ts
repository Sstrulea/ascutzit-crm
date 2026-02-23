/**
 * POST /api/leads/move-to-colet-neridicat
 *
 * La apăsarea butonului "Colet neridicat" în pipeline Recepție:
 * Mută TOATE fișele din stage-ul CURIER TRIMIS în stage-ul COLET NERIDICAT
 * și setează service_files.colet_neridicat = true (persistență).
 * Body: { pipelineSlug: 'receptie' }
 * Doar utilizatori autentificați.
 */
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { createAdminClient } from '@/lib/supabase/api-helpers'

const NORM = (s: string) =>
  (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()

function isReceptie(name: string): boolean {
  const n = NORM(name)
  return n.includes('receptie') || n.includes('reception')
}

function isCurierTrimisStage(name: string): boolean {
  const n = NORM(name)
  return (n.includes('curier') && n.includes('trimis')) || n.includes('curier_trimis')
}

function isColetNeridicatStage(name: string): boolean {
  const n = NORM(name)
  return n.includes('colet') && n.includes('neridicat')
}

export async function POST(req: Request) {
  try {
    const cookieStore = await cookies()
    const supabaseAuth = createRouteHandlerClient({ cookies: () => cookieStore })
    const { data: { session }, error: authErr } = await supabaseAuth.auth.getSession()
    if (authErr || !session?.user) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
    }

    let body: { pipelineSlug?: string } = {}
    try {
      body = await req.json().catch(() => ({}))
    } catch {
      body = {}
    }
    const pipelineSlug = (body.pipelineSlug ?? '').toString().trim()
    if (!pipelineSlug || !NORM(pipelineSlug).includes('receptie')) {
      return NextResponse.json(
        { ok: false, error: 'Pipeline Recepție este obligatoriu', movedCount: 0 },
        { status: 400 }
      )
    }

    const supabase = createAdminClient()

    const { data: pipelines, error: pErr } = await supabase
      .from('pipelines')
      .select('id, name')
      .eq('is_active', true)

    if (pErr || !pipelines?.length) {
      return NextResponse.json(
        { ok: false, movedCount: 0, error: pErr?.message || 'Nu există pipeline-uri' },
        { status: 500 }
      )
    }

    const receptie = (pipelines as { id: string; name: string }[]).find((p) =>
      isReceptie(p.name || '')
    )
    if (!receptie) {
      return NextResponse.json(
        { ok: false, movedCount: 0, error: 'Pipeline Recepție negăsit' },
        { status: 404 }
      )
    }

    const { data: stages, error: sErr } = await supabase
      .from('stages')
      .select('id, name')
      .eq('pipeline_id', receptie.id)
      .eq('is_active', true)

    if (sErr || !stages?.length) {
      return NextResponse.json(
        { ok: false, movedCount: 0, error: sErr?.message || 'Stage-uri negăsite' },
        { status: 500 }
      )
    }

    const curierTrimisStage = (stages as { id: string; name: string }[]).find((s) =>
      isCurierTrimisStage(s.name || '')
    )
    const coletNeridicatStage = (stages as { id: string; name: string }[]).find((s) =>
      isColetNeridicatStage(s.name || '')
    )

    if (!curierTrimisStage || !coletNeridicatStage) {
      return NextResponse.json({
        ok: true,
        movedCount: 0,
        message: 'Stage-urile CURIER TRIMIS sau COLET NERIDICAT nu există',
      })
    }

    const { data: pipelineItems, error: piErr } = await supabase
      .from('pipeline_items')
      .select('id, item_id, stage_id')
      .eq('pipeline_id', receptie.id)
      .eq('type', 'service_file')
      .eq('stage_id', curierTrimisStage.id)

    if (piErr || !pipelineItems?.length) {
      return NextResponse.json({ ok: true, movedCount: 0 })
    }

    const itemIds = [
      ...new Set(
        (pipelineItems as { id: string; item_id: string }[]).map((x) => x.item_id).filter(Boolean)
      ),
    ] as string[]
    const pipelineItemIds = (pipelineItems as { id: string }[]).map((x) => x.id)
    const nowIso = new Date().toISOString()

    await supabase
      .from('pipeline_items')
      .update({ stage_id: coletNeridicatStage.id, updated_at: nowIso })
      .in('id', pipelineItemIds)

    await supabase
      .from('service_files')
      .update({ colet_neridicat: true })
      .in('id', itemIds)

    const eventRows = itemIds.map((item_id) => ({
      type: 'service_file',
      item_id,
      event_type: 'colet_neridicat',
      message: `Mutare în ${coletNeridicatStage.name}`,
      payload: { to: coletNeridicatStage.name },
      created_at: nowIso,
    }))
    if (eventRows.length > 0) {
      await supabase.from('items_events').insert(eventRows)
    }

    return NextResponse.json({
      ok: true,
      movedCount: itemIds.length,
    })
  } catch (e: any) {
    console.error('[/api/leads/move-to-colet-neridicat] Error:', e)
    return NextResponse.json(
      { ok: false, movedCount: 0, error: e?.message || 'Eroare necunoscută' },
      { status: 500 }
    )
  }
}
