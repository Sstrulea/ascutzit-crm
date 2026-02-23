/**
 * Arhivare + eliberare fișă de serviciu – logică server-only.
 * Folosit de API route /api/service-files/archive-and-release (nu importa din serviceFileOperations care are 'use client').
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export async function archiveServiceFileToDbServer(
  db: SupabaseClient,
  serviceFileId: string
): Promise<{ success: boolean; arhivaFisaId?: string; leadId?: string; trayIds?: string[]; error?: any }> {
  try {
    const { data: sf, error: sfErr } = await db
      .from('service_files')
      .select('*')
      .eq('id', serviceFileId)
      .single()

    if (sfErr || !sf) {
      return { success: false, error: sfErr || new Error('Fișă negăsită') }
    }

    // Idempotență (R5, R10): dacă fișa e deja arhivată, returnăm success cu leadId/trayIds ca restul fluxului să ruleze (sync tags, move/release)
    if ((sf as any).archived_at) {
      const { data: trays } = await db
        .from('trays')
        .select('id')
        .eq('service_file_id', serviceFileId)
      const trayIds = (trays || []).map((t: any) => t.id)
      return {
        success: true,
        leadId: (sf as any).lead_id ?? undefined,
        trayIds: trayIds.length ? trayIds : undefined,
      }
    }

    const { data: trays, error: traysErr } = await db
      .from('trays')
      .select('id, number')
      .eq('service_file_id', serviceFileId)

    if (traysErr) return { success: false, error: traysErr }

    const trayIds = (trays || []).map((t: any) => t.id)
    let stageHistory: any[] = []
    let itemsEvents: any[] = []

    if (trayIds.length > 0) {
      const { data: sh } = await (db as any)
        .from('stage_history')
        .select('id, tray_id, pipeline_id, from_stage_id, to_stage_id, moved_by, moved_at, notes')
        .not('tray_id', 'is', null)
        .in('tray_id', trayIds)
        .order('moved_at', { ascending: true })
      stageHistory = sh || []

      const { data: ieTray } = await (db as any)
        .from('items_events')
        .select('id, type, item_id, event_type, message, payload, actor_id, actor_name, created_at')
        .eq('type', 'tray')
        .in('item_id', trayIds)
        .order('created_at', { ascending: true })
      itemsEvents = ieTray || []
    }

    const { data: ieSf } = await (db as any)
      .from('items_events')
      .select('id, type, item_id, event_type, message, payload, actor_id, actor_name, created_at')
      .eq('type', 'service_file')
      .eq('item_id', serviceFileId)
      .order('created_at', { ascending: true })
    itemsEvents = [...itemsEvents, ...(ieSf || [])].sort(
      (a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    )

    // Conversația lead-ului (mesaje) – snapshot la momentul arhivării
    let conversatie: any[] = []
    const { data: conv } = await (db as any)
      .from('conversations')
      .select('id')
      .eq('related_id', sf.lead_id)
      .eq('type', 'lead')
      .maybeSingle()
    if (conv?.id) {
      const { data: msgs } = await (db as any)
        .from('messages')
        .select('id, sender_id, content, message_type, created_at')
        .eq('conversation_id', conv.id)
        .order('created_at', { ascending: true })
      conversatie = msgs || []
    }

    const allTrayItems: any[] = []
    if (trayIds.length > 0) {
      const { data: items, error: itemsErr } = await (db as any)
        .from('tray_items')
        .select(`
          id, tray_id, department_id, instrument_id, service_id, part_id, technician_id, qty, notes, pipeline,
          tray_item_brands(id, brand, garantie, tray_item_brand_serials(id, serial_number))
        `)
        .in('tray_id', trayIds)
      if (!itemsErr && items?.length) allTrayItems.push(...items)
    }

    // Snapshot tăvițe: number, size și itemi cu datele introduse (brand/serial/garanție în info)
    const traysSnapshot = (trays || []).map((t: any) => {
      const itemsInTray = allTrayItems
        .filter((ti: any) => ti.tray_id === t.id)
        .map((ti: any) => {
          const brands = ti.tray_item_brands as any[] | undefined
          let info = ''
          if (brands?.length) {
            const parts = brands.map((b: any) => {
              const serials = (b.tray_item_brand_serials || []).map((s: any) => s.serial_number).filter(Boolean)
              const ser = serials.length ? ` Serial: ${serials.join(', ')}` : ''
              const gar = b.garantie ? ' Garanție: Da' : ' Garanție: Nu'
              return `Brand: ${b.brand || ''}${ser}${gar}`
            })
            info = parts.join(' | ')
          }
          return {
            department_id: ti.department_id ?? null,
            instrument_id: ti.instrument_id ?? null,
            service_id: ti.service_id ?? null,
            part_id: ti.part_id ?? null,
            technician_id: ti.technician_id ?? null,
            qty: ti.qty ?? 1,
            notes: ti.notes ?? null,
            pipeline: ti.pipeline ?? null,
            info: info || null,
          }
        })
      return { id: t.id, number: t.number, size: t.size, items: itemsInTray }
    })

    const istoric = {
      stage_history: stageHistory,
      items_events: itemsEvents,
      trays: traysSnapshot,
      conversatie,
    }

    const row: Record<string, any> = {
      lead_id: sf.lead_id,
      number: sf.number ?? '',
      date: sf.date ?? null,
      status: sf.status ?? 'noua',
      notes: sf.notes ?? null,
      details: sf.details ?? null,
      office_direct: sf.office_direct ?? false,
      office_direct_at: sf.office_direct_at ?? null,
      curier_trimis: sf.curier_trimis ?? false,
      curier_scheduled_at: sf.curier_scheduled_at ?? null,
      nu_raspunde_callback_at: sf.nu_raspunde_callback_at ?? null,
      no_deal: sf.no_deal ?? false,
      urgent: sf.urgent ?? false,
      cash: sf.cash ?? false,
      card: sf.card ?? false,
      global_discount_pct: sf.global_discount_pct ?? 0,
      is_locked: sf.is_locked ?? false,
      istoric,
    }

    const { data: insertedFisa, error: insertFisaErr } = await (db as any)
      .from('arhiva_fise_serviciu')
      .insert(row)
      .select('id')
      .single()

    if (insertFisaErr || !insertedFisa?.id) {
      return { success: false, error: insertFisaErr }
    }

    const arhivaFisaId = insertedFisa.id
    const leadId = (sf as any).lead_id ?? null

    // R2: INSERT tray_items; la prima eroare ștergem rândul din arhivă și refacem throw (rollback logic)
    try {
      for (const ti of allTrayItems) {
        const brands = ti.tray_item_brands as any[] | undefined
        let info = ''
        if (brands?.length) {
          const parts = brands.map((b: any) => {
            const serials = (b.tray_item_brand_serials || []).map((s: any) => s.serial_number).filter(Boolean)
            const ser = serials.length ? ` Serial: ${serials.join(', ')}` : ''
            const gar = b.garantie ? ' Garanție: Da' : ' Garanție: Nu'
            return `Brand: ${b.brand || ''}${ser}${gar}`
          })
          info = parts.join(' | ')
        }
        const { error: tiErr } = await (db as any).from('arhiva_tray_items').insert({
          arhiva_fisa_id: arhivaFisaId,
          department_id: ti.department_id ?? null,
          instrument_id: ti.instrument_id ?? null,
          service_id: ti.service_id ?? null,
          part_id: ti.part_id ?? null,
          technician_id: ti.technician_id ?? null,
          qty: ti.qty ?? 1,
          notes: ti.notes ?? null,
          pipeline: ti.pipeline ?? null,
          info: info || null,
        })
        if (tiErr) throw tiErr
      }
    } catch (trayItemsErr) {
      await (db as any).from('arhiva_tray_items').delete().eq('arhiva_fisa_id', arhivaFisaId)
      await (db as any).from('arhiva_fise_serviciu').delete().eq('id', arhivaFisaId)
      return { success: false, error: trayItemsErr }
    }

    // R4: Marchează fișa ca arhivată doar după ce arhiva + tray_items au reușit
    const { error: updateErr } = await db
      .from('service_files')
      .update({ archived_at: new Date().toISOString() })
      .eq('id', serviceFileId)
    if (updateErr) {
      await (db as any).from('arhiva_tray_items').delete().eq('arhiva_fisa_id', arhivaFisaId)
      await (db as any).from('arhiva_fise_serviciu').delete().eq('id', arhivaFisaId)
      return { success: false, error: updateErr }
    }

    return { success: true, arhivaFisaId, leadId: leadId || undefined, trayIds: trayIds.length ? trayIds : undefined }
  } catch (err: any) {
    return { success: false, error: err }
  }
}

/**
 * Sincronizează tag-urile URGENT și Retur pe lead în funcție de fișele de serviciu active (ne-arhivate).
 * După arhivare, lead-ul pierde tag-ul dacă nici o fișă activă nu mai are urgent/retur.
 */
export async function syncLeadUrgentReturTagsFromActiveServiceFiles(
  db: SupabaseClient,
  leadId: string
): Promise<{ ok: boolean; error?: any }> {
  try {
    const { data: activeFiles, error: sfErr } = await db
      .from('service_files')
      .select('id, urgent, retur')
      .eq('lead_id', leadId)
      .is('archived_at', null)

    if (sfErr) return { ok: false, error: sfErr }

    const anyUrgent = (activeFiles ?? []).some((f: any) => f.urgent === true || f.urgent === 'true')
    const anyRetur = (activeFiles ?? []).some((f: any) => f.retur === true || f.retur === 'true')

    const { data: tags, error: tagErr } = await db
      .from('tags')
      .select('id, name')
      .or('name.ilike.urgent,name.ilike.retur')

    if (tagErr || !tags?.length) return { ok: true }

    const urgentTag = tags.find((t: any) => (t.name || '').toLowerCase() === 'urgent')
    const returTag = tags.find((t: any) => (t.name || '').toLowerCase().replace(/\s/g, '') === 'retur')

    const { data: leadTags } = await db
      .from('lead_tags')
      .select('tag_id')
      .eq('lead_id', leadId)

    const leadTagIds = new Set((leadTags ?? []).map((r: any) => r.tag_id))

    if (urgentTag) {
      if (anyUrgent && !leadTagIds.has(urgentTag.id)) {
        await db.from('lead_tags').insert([{ lead_id: leadId, tag_id: urgentTag.id }] as any)
      } else if (!anyUrgent && leadTagIds.has(urgentTag.id)) {
        await db.from('lead_tags').delete().eq('lead_id', leadId).eq('tag_id', urgentTag.id)
      }
    }
    if (returTag) {
      if (anyRetur && !leadTagIds.has(returTag.id)) {
        await db.from('lead_tags').insert([{ lead_id: leadId, tag_id: returTag.id }] as any)
      } else if (!anyRetur && leadTagIds.has(returTag.id)) {
        await db.from('lead_tags').delete().eq('lead_id', leadId).eq('tag_id', returTag.id)
      }
    }

    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err }
  }
}

/**
 * Găsește un număr de tăviță disponibil în format "original-copyN".
 * Ex: A12 → A12-copy1, dacă A12-copy1 există → A12-copy2, etc.
 */
async function findAvailableCopyNumber(
  db: SupabaseClient,
  originalNumber: string
): Promise<string> {
  let copyIndex = 1
  let newNumber = `${originalNumber}-copy${copyIndex}`
  
  // Verifică dacă există deja tăvițe cu acest număr
  while (true) {
    const { data: existing } = await db
      .from('trays')
      .select('id')
      .eq('number', newNumber)
      .limit(1)
    
    if (!existing || existing.length === 0) {
      return newNumber
    }
    
    copyIndex++
    newNumber = `${originalNumber}-copy${copyIndex}`
    
    // Safety: max 100 copii pentru a evita loop infinit
    if (copyIndex > 100) {
      return `${originalNumber}-copy${Date.now()}`
    }
  }
}

/**
 * Eliberează tăvițele asociate cu o fișă de serviciu când aceasta este arhivată.
 * NU șterge tăvițele, ci:
 * 1. Redenumește tăvița (A12 → A12-copy1, A12-copy2, etc.)
 * 2. Desasociază tăvița de fișă (service_file_id = null)
 * 3. Scoate tăvița din pipeline_items
 * 4. Păstrează toate datele (instrumente, servicii, brand-uri, imagini) în tăvița redenumită
 * 
 * Astfel, numărul original (A12) devine disponibil pentru reutilizare.
 */
export async function releaseTraysOnArchiveServer(
  db: SupabaseClient,
  serviceFileId: string
): Promise<{ success: boolean; deletedCount: number; error: any }> {
  try {
    // R6: Încearcă RPC atomic (dacă există migrate_release_trays_on_archive_rpc.sql rulat)
    const { data: rpcRows, error: rpcErr } = await (db as any).rpc('release_trays_on_archive', {
      p_service_file_id: serviceFileId,
    })
    const rpcData = Array.isArray(rpcRows) ? rpcRows[0] : rpcRows
    if (!rpcErr && rpcData?.success) {
      return { success: true, deletedCount: rpcData.deleted_count ?? 0, error: null }
    }
    if (!rpcErr && rpcData && !rpcData.success && rpcData.err_msg) {
      return { success: false, deletedCount: 0, error: new Error(rpcData.err_msg) }
    }

    // Fallback: pași separați (comportament anterior)
    const { data: trays, error: fetchError } = await db
      .from('trays')
      .select('id, number')
      .eq('service_file_id', serviceFileId)

    if (fetchError) throw fetchError
    if (!trays || trays.length === 0) {
      return { success: true, deletedCount: 0, error: null }
    }

    const trayIds = trays.map((t: any) => t.id)
    await db.from('pipeline_items').delete().eq('type', 'tray').in('item_id', trayIds)

    for (const tray of trays) {
      const newNumber = await findAvailableCopyNumber(db, tray.number)
      const { error: updateError } = await db
        .from('trays')
        .update({ number: newNumber })
        .eq('id', tray.id)
      if (updateError) {
        console.error(`[releaseTraysOnArchiveServer] Eroare la redenumire tăviță ${tray.number} → ${newNumber}:`, updateError)
      }
    }
    return { success: true, deletedCount: trays.length, error: null }
  } catch (error) {
    console.error('[releaseTraysOnArchiveServer] ❌ Eroare:', error)
    return { success: false, deletedCount: 0, error }
  }
}

/** Rezultat stage-uri pipeline Arhivare (LEADURI, FISE, TAVITE). */
export type ArhivareStages = {
  pipelineId: string
  leaduriStageId: string
  fiseStageId: string
  taviteStageId: string
}

/**
 * Găsește pipeline-ul Arhivare și stage-urile LEADURI, FISE, TAVITE.
 */
export async function getArhivarePipelineStages(
  db: SupabaseClient
): Promise<ArhivareStages | null> {
  const { data: pipelines } = await db
    .from('pipelines')
    .select('id')
    .ilike('name', '%arhivare%')
    .limit(1)
  const pipelineId = pipelines?.[0]?.id
  if (!pipelineId) return null

  const { data: stages } = await db
    .from('stages')
    .select('id, name')
    .eq('pipeline_id', pipelineId)
  if (!stages?.length) return null

  const byName = (name: string) => stages.find((s: any) => (s.name || '').toLowerCase().includes(name.toLowerCase()))?.id
  const leaduriStageId = byName('leaduri')
  const fiseStageId = byName('fise')
  const taviteStageId = byName('tavite')
  if (!leaduriStageId || !fiseStageId || !taviteStageId) return null

  return { pipelineId, leaduriStageId, fiseStageId, taviteStageId }
}

/**
 * Mută lead, fișă și tăvițe în pipeline-ul Arhivare (stage-uri LEADURI, FISE, TAVITE).
 */
export async function moveItemsToArhivarePipelineServer(
  db: SupabaseClient,
  stages: ArhivareStages,
  opts: { leadId?: string; serviceFileId?: string; trayIds?: string[] }
): Promise<{ leadMoved: boolean; fisaMoved: boolean; traysMoved: number; error?: any }> {
  const out = { leadMoved: false, fisaMoved: false, traysMoved: 0 }
  const rpc = async (type: 'lead' | 'service_file' | 'tray', itemId: string, stageId: string) => {
    const { error } = await db.rpc('move_item_to_stage', {
      p_type: type,
      p_item_id: itemId,
      p_pipeline_id: stages.pipelineId,
      p_new_stage_id: stageId,
      p_technician_id: null,
    })
    return !error
  }
  if (opts.leadId) out.leadMoved = await rpc('lead', opts.leadId, stages.leaduriStageId)
  if (opts.serviceFileId) out.fisaMoved = await rpc('service_file', opts.serviceFileId, stages.fiseStageId)
  for (const trayId of opts.trayIds || []) {
    if (await rpc('tray', trayId, stages.taviteStageId)) out.traysMoved++
  }
  return out
}

/**
 * Mută lead-ul în stage-ul Arhivat din pipeline-ul Vânzări (fallback când nu există pipeline Arhivare).
 */
export async function moveLeadToArhivatVanzariServer(
  db: SupabaseClient,
  leadId: string
): Promise<{ ok: boolean; error?: any }> {
  try {
    const { data: pipelines } = await db
      .from('pipelines')
      .select('id')
      .ilike('name', '%vanzari%')
      .limit(1)
    const pipelineId = pipelines?.[0]?.id
    if (!pipelineId) return { ok: false, error: new Error('Pipeline Vânzări not found') }

    const { data: stages } = await db
      .from('stages')
      .select('id')
      .eq('pipeline_id', pipelineId)
      .ilike('name', '%arhivat%')
      .limit(1)
    const stageId = stages?.[0]?.id
    if (!stageId) return { ok: false, error: new Error('Stage Arhivat not found') }

    const { error } = await db.rpc('move_item_to_stage', {
      p_type: 'lead',
      p_item_id: leadId,
      p_pipeline_id: pipelineId,
      p_new_stage_id: stageId,
      p_technician_id: null,
    })
    if (error) return { ok: false, error }
    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err }
  }
}
