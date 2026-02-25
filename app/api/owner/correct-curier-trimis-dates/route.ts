/**
 * API: Corectează curier_trimis_at / office_direct_at pe leads din vanzari_apeluri
 * POST /api/owner/correct-curier-trimis-dates
 * Doar pentru owner.
 *
 * Problema: În trecut pe lead se punea curier_trimis_at = data programată curier (mâine),
 * nu momentul când vânzătorul a apăsat „Curier trimis” (azi). Statisticile se bazează pe
 * curier_trimis_at, deci apelul apărea pe ziua greșită.
 *
 * Acest endpoint ia din vanzari_apeluri momentul real al mutării (apel_at) și actualizează
 * lead.curier_trimis_at / lead.office_direct_at cu acel timestamp. Astfel statisticile
 * vor arăta apelul în ziua în care s-a făcut acțiunea.
 *
 * Pentru fiecare lead se folosește prima mutare în stage (MIN(apel_at)) ca „momentul
 * când s-a făcut livrarea”.
 */

import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function POST() {
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

  try {
    const { data: pipeline } = await supabase
      .from('pipelines')
      .select('id')
      .or('name.ilike.%vanzari%,name.ilike.%vanzări%')
      .limit(1)
      .maybeSingle()

    if (!pipeline?.id) {
      return NextResponse.json({ error: 'Pipeline Vânzări nu a fost găsit' }, { status: 500 })
    }

    const { data: stages } = await supabase
      .from('stages')
      .select('id, name')
      .eq('pipeline_id', pipeline.id)
      .is('is_active', true)

    const ctStageId = (stages || []).find(
      (s: { name?: string }) => (s.name || '').toLowerCase().includes('curier') && (s.name || '').toLowerCase().includes('trimis')
    )?.id
    const odStageId = (stages || []).find(
      (s: { name?: string }) => (s.name || '').toLowerCase().includes('office') && (s.name || '').toLowerCase().includes('direct')
    )?.id

    let correctedCT = 0
    let correctedOD = 0

    // Curier Trimis: din vanzari_apeluri ia prima mutare per lead (MIN apel_at), actualizează lead.curier_trimis_at
    if (ctStageId) {
      const { data: apeluri } = await supabase
        .from('vanzari_apeluri')
        .select('lead_id, apel_at')
        .eq('pipeline_id', pipeline.id)
        .eq('to_stage_id', ctStageId)
        .not('lead_id', 'is', null)
        .order('apel_at', { ascending: true })

      const firstByLead = new Map<string, string>()
      for (const r of apeluri || []) {
        const lid = (r as { lead_id?: string }).lead_id
        const at = (r as { apel_at?: string }).apel_at
        if (lid && at && !firstByLead.has(lid)) firstByLead.set(lid, at)
      }

      for (const [leadId, apelAt] of firstByLead) {
        const { error: uErr } = await supabase
          .from('leads')
          .update({
            curier_trimis_at: apelAt,
            updated_at: new Date().toISOString(),
          })
          .eq('id', leadId)
        if (!uErr) correctedCT++
      }
    }

    // Office Direct: la fel
    if (odStageId) {
      const { data: apeluri } = await supabase
        .from('vanzari_apeluri')
        .select('lead_id, apel_at')
        .eq('pipeline_id', pipeline.id)
        .eq('to_stage_id', odStageId)
        .not('lead_id', 'is', null)
        .order('apel_at', { ascending: true })

      const firstByLead = new Map<string, string>()
      for (const r of apeluri || []) {
        const lid = (r as { lead_id?: string }).lead_id
        const at = (r as { apel_at?: string }).apel_at
        if (lid && at && !firstByLead.has(lid)) firstByLead.set(lid, at)
      }

      for (const [leadId, apelAt] of firstByLead) {
        const { error: uErr } = await supabase
          .from('leads')
          .update({
            office_direct_at: apelAt,
            updated_at: new Date().toISOString(),
          })
          .eq('id', leadId)
        if (!uErr) correctedOD++
      }
    }

    return NextResponse.json({
      ok: true,
      corrected_curier_trimis: correctedCT,
      corrected_office_direct: correctedOD,
      message: `Corectate ${correctedCT} lead-uri Curier trimis, ${correctedOD} lead-uri Office direct (curier_trimis_at/office_direct_at = momentul mutării din vanzari_apeluri).`,
    })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Eroare la corectare'
    console.error('[correct-curier-trimis-dates]', e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
