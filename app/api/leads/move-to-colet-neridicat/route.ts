/**
 * POST /api/leads/move-to-colet-neridicat
 *
 * La apăsarea butonului "Colet neridicat" în stage-ul CURIER TRIMIS (Recepție):
 * Mută în COLET NERIDICAT doar fișele create acum 3+ zile (după created_at),
 * și setează service_files.colet_neridicat = true.
 * Body: { pipelineSlug: 'receptie', debug?: boolean }
 * Doar utilizatori autentificați.
 */
import { NextResponse } from 'next/server'
import { createApiSupabaseClient, createAdminClient } from '@/lib/supabase/api-helpers'

const NORM = (s: string) =>
  (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()

/** ID-uri cunoscute pentru pipeline Recepție – folosite ca fallback dacă match-ul după nume eșuează */
const RECEPTIE_STAGE_IDS = {
  curierTrimis: '081a56b9-d2f1-4afb-9fd0-56cacd7d147d',
  coletNeridicat: '8761501c-073b-45f1-9d95-27b398e1dcd7',
} as const

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
    const supabaseAuth = await createApiSupabaseClient()
    const { data: { session }, error: authErr } = await supabaseAuth.auth.getSession()
    if (authErr || !session?.user) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
    }

    let body: { pipelineSlug?: string; debug?: boolean } = {}
    try {
      body = await req.json().catch(() => ({}))
    } catch {
      body = {}
    }
    const pipelineSlug = (body.pipelineSlug ?? '').toString().trim()
    const debug = !!body.debug
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

    const stagesList = stages as { id: string; name: string }[]
    let curierTrimisStage = stagesList.find((s) => isCurierTrimisStage(s.name || ''))
    let coletNeridicatStage = stagesList.find((s) => isColetNeridicatStage(s.name || ''))
    // Fallback: folosim ID-urile cunoscute dacă există în lista de stage-uri ale pipeline-ului Recepție
    if (!curierTrimisStage && stagesList.some((s) => s.id === RECEPTIE_STAGE_IDS.curierTrimis)) {
      curierTrimisStage = stagesList.find((s) => s.id === RECEPTIE_STAGE_IDS.curierTrimis)!
    }
    if (!coletNeridicatStage && stagesList.some((s) => s.id === RECEPTIE_STAGE_IDS.coletNeridicat)) {
      coletNeridicatStage = stagesList.find((s) => s.id === RECEPTIE_STAGE_IDS.coletNeridicat)!
    }

    if (!curierTrimisStage || !coletNeridicatStage) {
      return NextResponse.json({
        ok: true,
        movedCount: 0,
        message: 'Stage-urile CURIER TRIMIS sau COLET NERIDICAT nu există',
        ...(debug && { debug: { pipelineId: receptie.id, stageIds: stagesList.map((s) => ({ id: s.id, name: s.name })) } }),
      })
    }

    const { data: pipelineItems, error: piErr } = await supabase
      .from('pipeline_items')
      .select('id, item_id, stage_id')
      .eq('pipeline_id', receptie.id)
      .eq('type', 'service_file')
      .eq('stage_id', curierTrimisStage.id)

    if (piErr) {
      return NextResponse.json({
        ok: false,
        movedCount: 0,
        error: piErr.message,
        ...(debug && { debug: { step: 'pipeline_items', error: piErr.message } }),
      }, { status: 500 })
    }

    if (!pipelineItems?.length) {
      return NextResponse.json({
        ok: true,
        movedCount: 0,
        message: 'Niciun card în stage-ul Curier Trimis (0 rânduri în pipeline_items)',
        ...(debug && { debug: { pipelineId: receptie.id, curierTrimisStageId: curierTrimisStage.id, pipelineItemsCount: 0 } }),
      })
    }

    const allItemIds = [
      ...new Set(
        (pipelineItems as { id: string; item_id: string }[]).map((x) => x.item_id).filter(Boolean)
      ),
    ] as string[]

    // Fișe mai vechi de 3 zile după created_at (indiferent de flag-ul curier_trimis)
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()
    const { data: expiredFiles, error: sfErr } = await supabase
      .from('service_files')
      .select('id, created_at')
      .in('id', allItemIds)
      .lt('created_at', threeDaysAgo)

    if (sfErr) {
      return NextResponse.json({
        ok: false,
        movedCount: 0,
        error: sfErr.message,
        ...(debug && { debug: { step: 'service_files_filter', error: sfErr.message } }),
      }, { status: 500 })
    }

    if (!expiredFiles?.length) {
      // Diagnostic: ce created_at au fișele din stage (primele 5) ca să vedem de ce nu trec filtrul
      const { data: sampleSf } = await supabase
        .from('service_files')
        .select('id, created_at, number')
        .in('id', allItemIds.slice(0, 10))
        .order('created_at', { ascending: true })
      return NextResponse.json({
        ok: true,
        movedCount: 0,
        message: 'Niciun card cu created_at mai vechi de 3 zile în Curier Trimis',
        ...(debug && {
          debug: {
            pipelineId: receptie.id,
            curierTrimisStageId: curierTrimisStage.id,
            pipelineItemsCount: pipelineItems.length,
            allItemIdsCount: allItemIds.length,
            threeDaysAgo,
            expiredCount: 0,
            sampleServiceFiles: (sampleSf || []).map((s: any) => ({ id: s.id, number: s.number, created_at: s.created_at })),
          },
        }),
      })
    }

    const itemIds = (expiredFiles as { id: string; created_at?: string }[]).map((x) => x.id)
    const pipelineItemIds = (pipelineItems as { id: string; item_id: string }[])
      .filter((pi) => itemIds.includes(pi.item_id))
      .map((x) => x.id)

    if (pipelineItemIds.length === 0) {
      return NextResponse.json({ ok: true, movedCount: 0 })
    }

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
