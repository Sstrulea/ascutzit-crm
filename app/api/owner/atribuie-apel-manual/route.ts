/**
 * API: Atribuie manual un apel (Comandă, No Deal, Callback, Nu Răspunde) unui lead și vânzător.
 * POST /api/owner/atribuie-apel-manual
 * Body: { leadId: string, userId: string, status: 'comanda' | 'noDeal' | 'callback' | 'nuRaspunde', apelAt?: string }
 */

import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

function stageMatchesStatus(stageName: string, status: string): boolean {
  const n = stageName.toLowerCase()
  switch (status) {
    case 'comanda':
      return (n.includes('curier') && n.includes('trimis')) || (n.includes('office') && n.includes('direct')) || (n.includes('avem') && n.includes('comanda'))
    case 'noDeal':
      return n.includes('no') && n.includes('deal')
    case 'callback':
      return n.includes('callback') || n.includes('call back')
    case 'nuRaspunde':
      return n.includes('nu') && n.includes('raspunde')
    default:
      return false
  }
}

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

  let body: { leadId?: string; userId?: string; status?: string; apelAt?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Body invalid' }, { status: 400 })
  }

  const { leadId, userId, status, apelAt } = body
  if (!leadId || !userId || !status) {
    return NextResponse.json({ error: 'Lipsesc leadId, userId sau status' }, { status: 400 })
  }

  const validStatus = ['comanda', 'noDeal', 'callback', 'nuRaspunde'].includes(status)
  if (!validStatus) {
    return NextResponse.json({ error: 'Status invalid. Folosește: comanda, noDeal, callback, nuRaspunde' }, { status: 400 })
  }

  const apelAtIso = apelAt || new Date().toISOString()

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
      .select('id, name, position')
      .eq('pipeline_id', pipeline.id)
      .is('is_active', true)
      .order('position', { ascending: true })

    const allStages = stages || []
    const firstStageId = allStages[0]?.id ?? null
    const matchingStages = allStages.filter((s: any) => stageMatchesStatus(s.name || '', status))
    const stage = status === 'comanda'
      ? matchingStages.find((s: any) => (s.name || '').toLowerCase().includes('curier'))
        || matchingStages.find((s: any) => (s.name || '').toLowerCase().includes('office'))
        || matchingStages[0]
      : matchingStages[0]

    if (!stage?.id) {
      return NextResponse.json({ error: `Stage pentru ${status} nu a fost găsit` }, { status: 500 })
    }

    if (status === 'comanda') {
      const sn = (stage.name || '').toLowerCase()
      const isCurierTrimis = sn.includes('curier') && sn.includes('trimis')
      const isOfficeDirect = sn.includes('office') && sn.includes('direct')
      if (isCurierTrimis) {
        await supabase.from('leads').update({
          curier_trimis_at: apelAtIso,
          curier_trimis_user_id: userId,
          updated_at: new Date().toISOString(),
        }).eq('id', leadId)
      } else if (isOfficeDirect) {
        await supabase.from('leads').update({
          office_direct_at: apelAtIso,
          office_direct_user_id: userId,
          updated_at: new Date().toISOString(),
        }).eq('id', leadId)
      } else {
        await supabase.from('leads').update({
          curier_trimis_at: apelAtIso,
          curier_trimis_user_id: userId,
          updated_at: new Date().toISOString(),
        }).eq('id', leadId)
      }
    }

    const fromStageId = firstStageId ?? stage.id
    const { error: insErr } = await supabase.from('vanzari_apeluri').insert({
      lead_id: leadId,
      pipeline_id: pipeline.id,
      from_stage_id: fromStageId,
      to_stage_id: stage.id,
      moved_by: userId,
      apel_at: apelAtIso,
    })

    if (insErr) {
      if (String(insErr.message || '').includes('duplicate') || (insErr as any)?.code === '23505') {
        return NextResponse.json({ ok: true, message: 'Înregistrarea exista deja.' })
      }
      return NextResponse.json({ error: insErr.message || 'Eroare la inserare' }, { status: 500 })
    }

    return NextResponse.json({ ok: true, message: 'Apel atribuit cu succes.' })
  } catch (e: any) {
    console.error('[atribuie-apel-manual]', e)
    return NextResponse.json({ error: e?.message || 'Eroare internă' }, { status: 500 })
  }
}
