/**
 * API: Backfill vanzari_apeluri din lead-uri cu Curier Trimis / Office Direct
 * POST /api/owner/backfill-vanzari-apeluri
 * Doar pentru owner. Populează vanzari_apeluri pentru lead-uri care au curier_trimis_user_id
 * sau office_direct_user_id dar nu au înregistrare în vanzari_apeluri.
 *
 * Query: ?atribuie=1&userId=xxx - opțional: atribuie comenzi neînregistrate (curier_trimis_at set,
 * user_id null) la claimed_by, apoi găsește fișe în Curier Trimis/Office Direct cu lead.claimed_by=userId
 * și le actualizează.
 */

import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const cookieStore = await cookies()
  const supabase = createRouteHandlerClient({ cookies: () => cookieStore })

  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: member, error: memberErr } = await supabase
    .from('app_members')
    .select('role')
    .eq('user_id', user.id)
    .single()

  if (memberErr || !member || member.role !== 'owner') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const url = new URL(req.url)
  const doAtribuie = url.searchParams.get('atribuie') === '1'
  const targetUserId = url.searchParams.get('userId') || undefined

  try {
    // 0. Atribuie comenzi orfane: curier_trimis_at/office_direct_at set, user_id null → folosește claimed_by
    let attributed = 0
    const { data: orphanCT } = await supabase
      .from('leads')
      .select('id, claimed_by')
      .not('curier_trimis_at', 'is', null)
      .is('curier_trimis_user_id', null)
      .not('claimed_by', 'is', null)
    for (const l of orphanCT || []) {
      const cb = (l as any).claimed_by
      if (!cb) continue
      const { error: uErr } = await supabase.from('leads').update({
        curier_trimis_user_id: cb,
        updated_at: new Date().toISOString(),
      }).eq('id', l.id)
      if (!uErr) attributed++
    }
    const { data: orphanOD } = await supabase
      .from('leads')
      .select('id, claimed_by')
      .not('office_direct_at', 'is', null)
      .is('office_direct_user_id', null)
      .not('claimed_by', 'is', null)
    for (const l of orphanOD || []) {
      const cb = (l as any).claimed_by
      if (!cb) continue
      const { error: uErr } = await supabase.from('leads').update({
        office_direct_user_id: cb,
        updated_at: new Date().toISOString(),
      }).eq('id', l.id)
      if (!uErr) attributed++
    }

    // 0b. Dacă ?atribuie=1&userId=xxx: găsește fișe în Curier Trimis/Office Direct cu lead.claimed_by=userId
    //    și lead.curier_trimis_at null → setează curier_trimis_at=azi, curier_trimis_user_id=userId
    if (doAtribuie && targetUserId) {
      const todayStart = new Date()
      todayStart.setHours(0, 0, 0, 0)
      const todayEnd = new Date()
      todayEnd.setHours(23, 59, 59, 999)
      const { data: pipeline } = await supabase.from('pipelines').select('id').or('name.ilike.%vanzari%,name.ilike.%vanzări%').limit(1).maybeSingle()
      if (pipeline?.id) {
        const { data: stages } = await supabase.from('stages').select('id, name').eq('pipeline_id', pipeline.id).is('is_active', true)
        const ctStageId = (stages || []).find((s: any) => (s.name || '').toLowerCase().includes('curier') && (s.name || '').toLowerCase().includes('trimis'))?.id
        const odStageId = (stages || []).find((s: any) => (s.name || '').toLowerCase().includes('office') && (s.name || '').toLowerCase().includes('direct'))?.id
        for (const stageId of [ctStageId, odStageId].filter(Boolean)) {
          const isCT = stageId === ctStageId
          const { data: piRows } = await supabase.from('pipeline_items').select('item_id, type').eq('pipeline_id', pipeline.id).eq('stage_id', stageId)
          for (const pi of piRows || []) {
            let leadId: string | null = null
            if (pi.type === 'lead') leadId = pi.item_id
            else if (pi.type === 'service_file') {
              const { data: sf } = await supabase.from('service_files').select('lead_id').eq('id', pi.item_id).maybeSingle()
              leadId = (sf as any)?.lead_id ?? null
            }
            if (!leadId) continue
            const { data: lead } = await supabase.from('leads').select('id, curier_trimis_at, curier_trimis_user_id, office_direct_at, office_direct_user_id, claimed_by').eq('id', leadId).single()
            if (!lead || (lead as any).claimed_by !== targetUserId) continue
            const needsCT = isCT && !(lead as any).curier_trimis_at
            const needsOD = !isCT && !(lead as any).office_direct_at
            if (needsCT) {
              const { error: uErr } = await supabase.from('leads').update({
                curier_trimis_at: todayStart.toISOString(),
                curier_trimis_user_id: targetUserId,
                updated_at: new Date().toISOString(),
              }).eq('id', leadId)
              if (!uErr) attributed++
            } else if (needsOD) {
              const { error: uErr } = await supabase.from('leads').update({
                office_direct_at: todayStart.toISOString(),
                office_direct_user_id: targetUserId,
                updated_at: new Date().toISOString(),
              }).eq('id', leadId)
              if (!uErr) attributed++
            }
          }
        }
      }
    }

    // 1. Pipeline Vânzări
    const { data: pipeline } = await supabase
      .from('pipelines')
      .select('id')
      .or('name.ilike.%vanzari%,name.ilike.%vanzări%')
      .limit(1)
      .maybeSingle()

    if (!pipeline?.id) {
      return NextResponse.json({ error: 'Pipeline Vânzări nu a fost găsit' }, { status: 500 })
    }

    const pipelineId = pipeline.id

    // 2. Stage IDs: Curier Trimis, Office Direct
    const { data: stages } = await supabase
      .from('stages')
      .select('id, name')
      .eq('pipeline_id', pipelineId)
      .is('is_active', true)

    const stageByName = new Map<string, string>()
    for (const s of stages || []) {
      const n = (s.name || '').toLowerCase()
      if (n.includes('curier') && n.includes('trimis')) stageByName.set('curier_trimis', s.id)
      if (n.includes('office') && n.includes('direct')) stageByName.set('office_direct', s.id)
    }

    const curierTrimisStageId = stageByName.get('curier_trimis')
    const officeDirectStageId = stageByName.get('office_direct')

    if (!curierTrimisStageId && !officeDirectStageId) {
      return NextResponse.json({ error: 'Stage-uri Curier Trimis / Office Direct nu au fost găsite' }, { status: 500 })
    }

    let inserted = 0
    let skipped = 0

    // 3. Lead-uri cu Curier Trimis
    if (curierTrimisStageId) {
      const { data: leadsCT } = await supabase
        .from('leads')
        .select('id, curier_trimis_at, curier_trimis_user_id')
        .not('curier_trimis_at', 'is', null)
        .not('curier_trimis_user_id', 'is', null)

      for (const lead of leadsCT || []) {
        const leadId = lead.id
        const movedBy = lead.curier_trimis_user_id
        const apelAt = lead.curier_trimis_at

        if (!movedBy || !apelAt) continue

        // Evită duplicate: există deja în vanzari_apeluri pentru acest lead + stage + moved_by?
        const { data: existing } = await supabase
          .from('vanzari_apeluri')
          .select('id')
          .eq('lead_id', leadId)
          .eq('to_stage_id', curierTrimisStageId)
          .eq('moved_by', movedBy)
          .limit(1)

        if (existing?.length) {
          skipped++
          continue
        }

        const { error: insErr } = await supabase.from('vanzari_apeluri').insert({
          lead_id: leadId,
          pipeline_id: pipelineId,
          from_stage_id: null,
          to_stage_id: curierTrimisStageId,
          moved_by: movedBy,
          apel_at: apelAt,
        })

        if (!insErr) inserted++
      }
    }

    // 4. Lead-uri cu Office Direct
    if (officeDirectStageId) {
      const { data: leadsOD } = await supabase
        .from('leads')
        .select('id, office_direct_at, office_direct_user_id')
        .not('office_direct_at', 'is', null)
        .not('office_direct_user_id', 'is', null)

      for (const lead of leadsOD || []) {
        const leadId = lead.id
        const movedBy = lead.office_direct_user_id
        const apelAt = lead.office_direct_at

        if (!movedBy || !apelAt) continue

        const { data: existing } = await supabase
          .from('vanzari_apeluri')
          .select('id')
          .eq('lead_id', leadId)
          .eq('to_stage_id', officeDirectStageId)
          .eq('moved_by', movedBy)
          .limit(1)

        if (existing?.length) {
          skipped++
          continue
        }

        const { error: insErr } = await supabase.from('vanzari_apeluri').insert({
          lead_id: leadId,
          pipeline_id: pipelineId,
          from_stage_id: null,
          to_stage_id: officeDirectStageId,
          moved_by: movedBy,
          apel_at: apelAt,
        })

        if (!insErr) inserted++
      }
    }

    const parts = [`${inserted} înregistrări noi`, `${skipped} deja existente`]
    if (attributed > 0) parts.unshift(`${attributed} comenzi atribuite (claimed_by)`)
    return NextResponse.json({
      ok: true,
      inserted,
      skipped,
      attributed,
      message: `Backfill complet: ${parts.join(', ')}.`,
    })
  } catch (e: any) {
    console.error('[backfill-vanzari-apeluri]', e)
    return NextResponse.json({ error: e?.message || 'Eroare la backfill' }, { status: 500 })
  }
}
