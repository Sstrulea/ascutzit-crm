/**
 * Expirare Call Back / Nu răspunde → tag Sună! (fără mutare în Leaduri)
 *
 * Rulează „on access”: la încărcarea pipeline-ului Vânzări. Lead-urile cu callback_date
 * sau nu_raspunde_callback_at expirat rămân în stage-ul Call Back / Nu răspunde și primesc
 * doar tag-ul Sună! (nu se mai mută în Leaduri). Cardul va apărea primul în stage (sortare UI).
 *
 * Folosește createAdminClient — apelat doar din API (server-side).
 */

import { createAdminClient } from '@/lib/supabase/api-helpers'

function norm(s: string): string {
  return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
}

function isVanzari(name: string): boolean {
  const n = norm(name)
  return n.includes('vanzari') || n.includes('sales')
}

async function getOrCreateSunaTag(supabase: ReturnType<typeof createAdminClient>): Promise<{ id: string } | null> {
  const { data: existing } = await supabase
    .from('tags')
    .select('id')
    .ilike('name', 'suna!')
    .limit(1)
    .maybeSingle()
  if (existing) return { id: (existing as any).id }
  const { data: created, error } = await supabase
    .from('tags')
    .insert([{ name: 'Suna!', color: 'red' }] as any)
    .select('id')
    .single()
  if (error) {
    console.warn('[expireCallbacks] getOrCreateSunaTag insert failed:', error.message)
    return null
  }
  return { id: (created as any).id }
}

export type ExpireCallbacksResult = {
  ok: boolean
  movedCount: number
  error?: string
}

/**
 * Adaugă tag Sună! pe lead-urile cu callback/nu_răspunde expirat. Nu mai mută în Leaduri –
 * cardul rămâne în Call Back sau Nu răspunde și va apărea primul în stage (sortare în UI).
 * Apelat la încărcarea pipeline-ului Vânzări (on access), nu din cron.
 */
export async function runExpireCallbacksAndNuRaspunde(): Promise<ExpireCallbacksResult> {
  try {
    const supabase = createAdminClient()
    const nowIso = new Date().toISOString()

    const { data: pipelines, error: pErr } = await supabase
      .from('pipelines')
      .select('id, name')
      .eq('is_active', true)

    if (pErr || !pipelines?.length) {
      return { ok: false, movedCount: 0, error: pErr?.message || 'No pipelines' }
    }

    const vanzari = pipelines.find((p: any) => isVanzari(p.name || ''))
    if (!vanzari) return { ok: true, movedCount: 0 }

    const sunaTag = await getOrCreateSunaTag(supabase)

    // Atribuie tag-ul "Suna!" tuturor lead-urilor cu termen expirat (callback sau nu răspunde), indiferent de stage.
    // Nu mai mutăm lead-urile în Leaduri – rămân în Call Back / Nu răspunde și apar primele (sortare în kanban).
    if (sunaTag) {
      const expiredIds: string[] = []
      const { data: cbExpired } = await supabase
        .from('leads')
        .select('id')
        .not('callback_date', 'is', null)
        .lte('callback_date', nowIso)
      const { data: nrExpired } = await supabase
        .from('leads')
        .select('id')
        .not('nu_raspunde_callback_at', 'is', null)
        .lte('nu_raspunde_callback_at', nowIso)
      ;(cbExpired || []).forEach((x: any) => expiredIds.push(x.id))
      ;(nrExpired || []).forEach((x: any) => expiredIds.push(x.id))
      const uniqueExpired = [...new Set(expiredIds)]
      if (uniqueExpired.length > 0) {
        const { data: existingSuna } = await supabase
          .from('lead_tags')
          .select('lead_id')
          .eq('tag_id', sunaTag.id)
          .in('lead_id', uniqueExpired)
        const haveSuna = new Set((existingSuna || []).map((x: any) => x.lead_id))
        const toAdd = uniqueExpired.filter((id) => !haveSuna.has(id))
        for (const leadId of toAdd) {
          const { error: e } = await supabase
            .from('lead_tags')
            .insert([{ lead_id: leadId, tag_id: sunaTag.id }] as any)
          if (e && (e as any).code !== '23505') console.warn('[expireCallbacks] Suna! tag for lead', leadId, (e as any).message)
        }
      }
    }

    return { ok: true, movedCount: 0 }
  } catch (e: any) {
    console.error('[expireCallbacks] Error:', e)
    return { ok: false, movedCount: 0, error: e?.message || 'Unknown error' }
  }
}
