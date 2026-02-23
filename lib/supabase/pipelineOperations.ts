'use client'

/**
 * Pipeline Operations
 * 
 * This file contains pipeline item mutation operations.
 * The getKanbanItems and related query functions have been refactored into
 * the modular kanban/ directory for better maintainability.
 * 
 * Architecture:
 * - This file: Mutation operations (add, move, remove items)
 * - ./kanban/: Query operations (getKanbanItems, getSingleKanbanItem)
 */

import { supabaseBrowser } from './supabaseClient'
import {
  logTrayInitialStage,
  logTrayStageMove,
  logTrayPipelineMove,
} from './trayStageOperations'
import { mergeSplitTraysIfAllFinalized } from './serviceFileOperations'
import { fetchStagesForPipeline } from './kanban/fetchers'
import { matchesStagePattern } from './kanban/constants'

// ==================== RE-EXPORTS FROM KANBAN MODULE ====================
// For backward compatibility, re-export the query functions from the new module

export { 
  getKanbanItems, 
  getSingleKanbanItem,
  getKanbanItemsByType,
  type KanbanItem,
  type PipelineItemType,
  type MoveItemResult,
  type PipelineItem
} from './kanban'

// Re-export types for backward compatibility
export type { KanbanItem as KanbanItemType } from './kanban'

// ==================== MUTATION OPERATIONS ====================

/**
 * Adaugă sau actualizează un item într-un pipeline (funcție generică).
 * Această funcție este folosită intern pentru a adăuga orice tip de item (lead, service_file, tray)
 * într-un pipeline. Dacă item-ul există deja în pipeline, funcția actualizează doar stage-ul.
 * Dacă nu există, creează o nouă înregistrare în pipeline_items.
 * 
 * @param type - Tipul item-ului: 'lead', 'service_file' sau 'tray'
 * @param itemId - ID-ul item-ului de adăugat
 * @param pipelineId - ID-ul pipeline-ului în care se adaugă item-ul
 * @param stageId - ID-ul stage-ului în care se plasează item-ul
 * @returns Obiect cu data pipeline_item-ului creat/actualizat sau null și eroarea dacă există
 */
async function addItemToPipeline(
  type: 'lead' | 'service_file' | 'tray',
  itemId: string,
  pipelineId: string,
  stageId: string
): Promise<{ data: any | null; error: any }> {
  try {
    const supabase = supabaseBrowser()
    
    // Check if item already exists in this pipeline
    const { data: existing } = await supabase
      .from('pipeline_items')
      .select('*')
      .eq('type', type)
      .eq('item_id', itemId)
      .eq('pipeline_id', pipelineId)
      .maybeSingle()

    let result: { data: any | null; error: any }

    if (existing) {
      // Update existing item's stage
      const oldStageId = existing.stage_id
      
      const { data, error } = await supabase
        .from('pipeline_items')
        .update({
          stage_id: stageId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
        .select()
        .single()

      if (error) throw error
      
      result = { data, error: null }
      
      // Loghează mutarea între stage-uri pentru tăvițe (doar dacă stage-ul s-a schimbat)
      if (type === 'tray' && oldStageId !== stageId) {
        try {
          const logResult = await logTrayStageMove({
            trayId: itemId,
            pipelineId,
            fromStageId: oldStageId,
            toStageId: stageId,
          })
          if (logResult.error) {
            console.error('[addItemToPipeline] Error logging stage change:', {
              error: logResult.error,
              message: logResult.error instanceof Error ? logResult.error.message : String(logResult.error),
              trayId: itemId,
              pipelineId,
              fromStageId: oldStageId,
              toStageId: stageId,
            })
          }
        } catch (logError) {
          console.error('[addItemToPipeline] Error logging stage change:', {
            error: logError,
            message: logError instanceof Error ? logError.message : String(logError),
            trayId: itemId,
            pipelineId,
            fromStageId: oldStageId,
            toStageId: stageId,
          })
          // Nu propagă eroarea, mutarea a fost făcută deja
        }
      }
      if (type === 'lead' && oldStageId !== stageId) {
        try {
          await supabase.from('leads').update({ has_ever_been_moved: true }).eq('id', itemId)
        } catch (e) {
          console.warn('[addItemToPipeline] has_ever_been_moved update failed for lead', itemId, e)
        }
      }
    } else {
      // Create new item
      const { data, error } = await supabase
        .from('pipeline_items')
        .insert([{
          type,
          item_id: itemId,
          pipeline_id: pipelineId,
          stage_id: stageId,
        }])
        .select()
        .single()

      if (error) throw error
      
      result = { data, error: null }
      
      // Loghează adăugarea inițială pentru tăvițe
      if (type === 'tray') {
        try {
          const logResult = await logTrayInitialStage({
            trayId: itemId,
            pipelineId,
            stageId,
          })
          if (logResult.error) {
            // Extrage mesajul erorii într-un mod sigur
            let errorMessage = 'Eroare necunoscută la logging'
            let errorCode = null
            let errorDetails = null
            
            if (logResult.error instanceof Error) {
              errorMessage = logResult.error.message || 'Eroare la logging (fără mesaj)'
            } else if (typeof logResult.error === 'object' && logResult.error !== null) {
              const err = logResult.error as any
              errorMessage = err?.message || JSON.stringify(err) || 'Eroare la logging (obiect gol)'
              errorCode = err?.code || null
              errorDetails = err?.details || null
            } else {
              errorMessage = String(logResult.error) || 'Eroare la logging'
            }
            
            console.error('[addItemToPipeline] Error logging initial stage:', {
              message: errorMessage,
              code: errorCode,
              details: errorDetails,
              errorType: logResult.error?.constructor?.name || typeof logResult.error,
              errorKeys: logResult.error && typeof logResult.error === 'object' ? Object.keys(logResult.error) : [],
              trayId: itemId,
              pipelineId,
              stageId,
              fullError: logResult.error,
            })
          }
        } catch (logError) {
          // Extrage mesajul erorii într-un mod sigur
          let errorMessage = 'Eroare necunoscută la logging'
          let errorCode = null
          let errorDetails = null
          
          if (logError instanceof Error) {
            errorMessage = logError.message || 'Eroare la logging (fără mesaj)'
          } else if (typeof logError === 'object' && logError !== null) {
            const err = logError as any
            errorMessage = err?.message || JSON.stringify(err) || 'Eroare la logging (obiect gol)'
            errorCode = err?.code || null
            errorDetails = err?.details || null
          } else {
            errorMessage = String(logError) || 'Eroare la logging'
          }
          
          console.error('[addItemToPipeline] Error logging initial stage (catch):', {
            message: errorMessage,
            code: errorCode,
            details: errorDetails,
            errorType: logError?.constructor?.name || typeof logError,
            errorKeys: logError && typeof logError === 'object' ? Object.keys(logError) : [],
            trayId: itemId,
            pipelineId,
            stageId,
            fullError: logError,
          })
          // Nu propagă eroarea, mutarea a fost făcută deja
        }
      }
    }

    return result
  } catch (error) {
    return { data: null, error }
  }
}

/**
 * Adaugă un lead într-un pipeline specificat.
 * Această funcție este un wrapper peste addItemToPipeline specializat pentru lead-uri.
 * Lead-ul este adăugat în pipeline_items și plasat în stage-ul specificat.
 * 
 * @param leadId - ID-ul lead-ului de adăugat
 * @param pipelineId - ID-ul pipeline-ului în care se adaugă lead-ul
 * @param stageId - ID-ul stage-ului în care se plasează lead-ul
 * @returns Obiect cu data pipeline_item-ului creat/actualizat sau null și eroarea dacă există
 */
export async function addLeadToPipeline(
  leadId: string,
  pipelineId: string,
  stageId: string
): Promise<{ data: any | null; error: any }> {
  return addItemToPipeline('lead', leadId, pipelineId, stageId)
}

/**
 * Adaugă o fișă de serviciu într-un pipeline specificat.
 * Această funcție este un wrapper peste addItemToPipeline specializat pentru service files.
 * Fișa de serviciu este adăugată în pipeline_items și plasată în stage-ul specificat.
 * 
 * @param serviceFileId - ID-ul fișei de serviciu de adăugat
 * @param pipelineId - ID-ul pipeline-ului în care se adaugă fișa
 * @param stageId - ID-ul stage-ului în care se plasează fișa
 * @returns Obiect cu data pipeline_item-ului creat/actualizat sau null și eroarea dacă există
 */
export async function addServiceFileToPipeline(
  serviceFileId: string,
  pipelineId: string,
  stageId: string
): Promise<{ data: any | null; error: any }> {
  return addItemToPipeline('service_file', serviceFileId, pipelineId, stageId)
}

/**
 * Adaugă o tăviță într-un pipeline specificat.
 * Această funcție este un wrapper peste addItemToPipeline specializat pentru tăvițe.
 * Tăvița este adăugată în pipeline_items și plasată în stage-ul specificat.
 * 
 * @param trayId - ID-ul tăviței de adăugat
 * @param pipelineId - ID-ul pipeline-ului în care se adaugă tăvița
 * @param stageId - ID-ul stage-ului în care se plasează tăvița
 * @returns Obiect cu data pipeline_item-ului creat/actualizat sau null și eroarea dacă există
 */
export async function addTrayToPipeline(
  trayId: string,
  pipelineId: string,
  stageId: string
): Promise<{ data: any | null; error: any }> {
  return addItemToPipeline('tray', trayId, pipelineId, stageId)
}

/**
 * Mută un item într-un alt stage din același pipeline.
 * Această funcție actualizează stage-ul unui item care este deja în pipeline.
 * Item-ul rămâne în același pipeline, doar stage-ul se schimbă.
 * Funcția verifică mai întâi dacă item-ul există în pipeline-ul specificat.
 * 
 * @param type - Tipul item-ului: 'lead', 'service_file' sau 'tray'
 * @param itemId - ID-ul item-ului de mutat
 * @param pipelineId - ID-ul pipeline-ului în care se află item-ul
 * @param newStageId - ID-ul noului stage în care se mută item-ul
 * @param fromStageId - ID-ul stage-ului de origine (opțional, pentru validare)
 * @returns Obiect cu data pipeline_item-ului actualizat sau null și eroarea dacă există
 */
/**
 * Mutare într-un singur call: RPC move_item_to_stage face SELECT + UPDATE + log tray/lead în DB.
 * Pentru type='tray', technicianId opțional permite log per tehnician în stage_history (timp în așteptare la reuniere).
 */
export async function moveItemToStage(
  type: 'lead' | 'service_file' | 'tray',
  itemId: string,
  pipelineId: string,
  newStageId: string,
  _fromStageId?: string,
  technicianId?: string | null
): Promise<{ data: any | null; error: any }> {
  try {
    const supabase = supabaseBrowser()
    // IMPORTANT: Trimitem MEREU toți 5 parametrii (inclusiv p_technician_id: null)
    // pentru a evita ambiguitatea PostgreSQL între funcția cu 4 și cea cu 5 parametri.
    const params: Record<string, unknown> = {
      p_type: type,
      p_item_id: itemId,
      p_pipeline_id: pipelineId,
      p_new_stage_id: newStageId,
      p_technician_id: (type === 'tray' && technicianId) ? technicianId : null,
    }

    const { data: row, error } = await supabase.rpc('move_item_to_stage', params)

    if (error) {
      const errMsg = error?.message ?? (typeof error === 'object' && error !== null ? JSON.stringify(error) : String(error))
      console.error('[moveItemToStage] RPC error:', errMsg || '(empty)', {
        errorMessage: error?.message,
        errorCode: error?.code,
        errorHint: error?.hint,
        errorDetails: error?.details,
        params: { type, itemId, pipelineId, newStageId },
      })
      return { data: null, error }
    }

    // Reuniune automată: dacă tăvița mutată e din split și toate surorile sunt în Finalizare, reunește
    if (type === 'tray') {
      mergeSplitTraysIfAllFinalized(itemId, pipelineId).then((res) => {
        if (res.data?.merged) {
          // Reuniune făcută; UI-ul poate reface fetch (realtime sau refresh)
        }
      }).catch(() => { /* ignore */ })
    }

    return { data: row ?? null, error: null }
  } catch (error) {
    console.error('[moveItemToStage] Catch error:', error instanceof Error ? error.message : error)
    return { data: null, error }
  }
}

/**
 * Obține toate item-urile dintr-un pipeline (opțional filtrate).
 * Această funcție permite obținerea tuturor item-urilor dintr-un pipeline, cu opțiuni
 * de filtrare după stage sau tip de item. Rezultatele sunt sortate descrescător după
 * data creării (cele mai noi primele).
 * 
 * @param pipelineId - ID-ul pipeline-ului pentru care se caută item-urile
 * @param stageId - ID-ul stage-ului pentru filtrare (opțional)
 * @param type - Tipul item-ului pentru filtrare: 'lead', 'service_file' sau 'tray' (opțional)
 * @returns Obiect cu array-ul de pipeline_items sau array gol și eroarea dacă există
 */
export async function getPipelineItems(
  pipelineId: string,
  stageId?: string,
  type?: 'lead' | 'service_file' | 'tray'
): Promise<{ data: any[]; error: any }> {
  try {
    const supabase = supabaseBrowser()
    
    let query = supabase
      .from('pipeline_items')
      .select('*')
      .eq('pipeline_id', pipelineId)

    if (stageId) {
      query = query.eq('stage_id', stageId)
    }

    if (type) {
      query = query.eq('type', type)
    }

    query = query.order('created_at', { ascending: false })

    const { data, error } = await query

    if (error) throw error
    return { data: data ?? [], error: null }
  } catch (error) {
    return { data: [], error }
  }
}

/**
 * Găsește ID-ul pipeline-ului în care se află un item (fără a filtra după pipeline).
 * Util la mutare când cardul are pipelineId vechi/stale și RPC returnează "not found in the specified pipeline".
 *
 * @param type - Tipul item-ului: 'lead', 'service_file' sau 'tray'
 * @param itemId - ID-ul item-ului
 * @returns pipeline_id dacă există un rând în pipeline_items, altfel null
 */
export async function getPipelineIdForItem(
  type: 'lead' | 'service_file' | 'tray',
  itemId: string
): Promise<{ data: string | null; error: any }> {
  try {
    const supabase = supabaseBrowser()
    const { data, error } = await supabase
      .from('pipeline_items')
      .select('pipeline_id')
      .eq('type', type)
      .eq('item_id', itemId)
      .limit(1)
    if (error) return { data: null, error }
    const pipelineId = Array.isArray(data) && data.length > 0 ? data[0]?.pipeline_id : null
    return { data: pipelineId ?? null, error: null }
  } catch (e) {
    return { data: null, error: e }
  }
}

/**
 * Obține pipeline_item-ul pentru un item specific.
 * Această funcție caută înregistrarea din pipeline_items care asociază un item
 * (lead, service_file sau tray) cu un pipeline specific. Este folosită pentru a
 * verifica dacă un item este deja într-un pipeline și în ce stage se află.
 * 
 * @param type - Tipul item-ului: 'lead', 'service_file' sau 'tray'
 * @param itemId - ID-ul item-ului pentru care se caută pipeline_item-ul
 * @param pipelineId - ID-ul pipeline-ului în care se caută
 * @returns Obiect cu data pipeline_item-ului sau null dacă nu există și eroarea dacă există
 */
export async function getPipelineItemForItem(
  type: 'lead' | 'service_file' | 'tray',
  itemId: string,
  pipelineId: string
): Promise<{ data: any | null; error: any }> {
  try {
    const supabase = supabaseBrowser()
    
    const { data, error } = await supabase
      .from('pipeline_items')
      .select('*')
      .eq('type', type)
      .eq('item_id', itemId)
      .eq('pipeline_id', pipelineId)
      .maybeSingle()

    if (error && error.code !== 'PGRST116') throw error
    return { data, error: null }
  } catch (error) {
    return { data: null, error }
  }
}

/**
 * Elimină un item dintr-un pipeline.
 * Această funcție șterge înregistrarea din pipeline_items, ceea ce înseamnă că
 * item-ul nu va mai apărea în acel pipeline. Item-ul în sine (lead, service_file sau tray)
 * nu este șters, doar asocierea cu pipeline-ul este eliminată.
 * 
 * @param type - Tipul item-ului: 'lead', 'service_file' sau 'tray'
 * @param itemId - ID-ul item-ului de eliminat din pipeline
 * @param pipelineId - ID-ul pipeline-ului din care se elimină item-ul
 * @returns Obiect cu success: true dacă eliminarea a reușit, false altfel, și eroarea dacă există
 */
export async function removeItemFromPipeline(
  type: 'lead' | 'service_file' | 'tray',
  itemId: string,
  pipelineId: string
): Promise<{ success: boolean; error: any }> {
  try {
    const supabase = supabaseBrowser()
    
    const { error } = await supabase
      .from('pipeline_items')
      .delete()
      .eq('type', type)
      .eq('item_id', itemId)
      .eq('pipeline_id', pipelineId)

    if (error) throw error
    return { success: true, error: null }
  } catch (error) {
    return { success: false, error }
  }
}

/**
 * Obține primul stage activ dintr-un pipeline (funcție helper).
 * Această funcție este folosită intern pentru a găsi stage-ul inițial când un item
 * este adăugat într-un pipeline fără a specifica un stage. Returnează stage-ul cu
 * cea mai mică poziție (primul din workflow).
 * 
 * @param pipelineId - ID-ul pipeline-ului pentru care se caută primul stage activ
 * @returns Obiect cu id-ul primului stage activ sau null dacă nu există stage-uri active
 */
async function getFirstActiveStage(pipelineId: string): Promise<{ id: string } | null> {
  const supabase = supabaseBrowser()
  
  const { data: stages, error: stagesError } = await supabase
    .from('stages')
    .select('id')
    .eq('pipeline_id', pipelineId)
    .eq('is_active', true)
    .order('position', { ascending: true })
    .limit(1)

  if (stagesError || !stages || stages.length === 0) {
    return null
  }
  return { id: stages[0].id }
}

/**
 * Returnează ID-ul stage-ului "Retur" dintr-un pipeline, dacă există.
 * Exportat pentru utilizare la trimiterea tăvițelor în departament (tag Retur → stage Retur).
 */
export async function getReturStageId(pipelineId: string): Promise<string | null> {
  const { data: stages, error } = await fetchStagesForPipeline(pipelineId)
  if (error || !stages?.length) return null
  const returStage = (stages as { id: string; name?: string }[]).find((s) =>
    matchesStagePattern(s.name || '', 'RETUR')
  )
  return returStage?.id ?? null
}

/**
 * Returnează lead_id asociat tăviței (prin service_file), sau null.
 */
async function getTrayLeadId(trayId: string): Promise<string | null> {
  const supabase = supabaseBrowser()
  const { data: tray, error: trayErr } = await (supabase as any)
    .from('trays')
    .select('service_file_id')
    .eq('id', trayId)
    .maybeSingle()
  if (trayErr || !tray?.service_file_id) return null
  const { data: sf, error: sfErr } = await (supabase as any)
    .from('service_files')
    .select('lead_id')
    .eq('id', tray.service_file_id)
    .maybeSingle()
  if (sfErr || !sf?.lead_id) return null
  return sf.lead_id
}

/**
 * Verifică dacă lead-ul are tag-ul "Retur" (nume ilike 'retur').
 * Exportat pentru utilizare la trimiterea tăvițelor în departament.
 */
export async function leadHasReturTag(leadId: string): Promise<boolean> {
  const supabase = supabaseBrowser()
  const { data: lt, error: ltErr } = await (supabase as any)
    .from('lead_tags')
    .select('tag_id')
    .eq('lead_id', leadId)
  if (ltErr || !lt?.length) return false
  const tagIds = (lt as { tag_id: string }[]).map((r) => r.tag_id)
  const { data: tags, error: tagsErr } = await (supabase as any)
    .from('tags')
    .select('id')
    .in('id', tagIds)
    .ilike('name', 'retur')
  return !tagsErr && (tags?.length ?? 0) > 0
}

// Type for move results
type MoveResult = {
  ok: true
  data: { pipeline_item_id: string; new_stage_id: string }[]
} | {
  ok: false
  code?: string
  message?: string
}

/**
 * Mută un lead într-un pipeline nou.
 * Această funcție mută un lead dintr-un pipeline în altul, sau îl adaugă într-un pipeline
 * dacă nu era deja într-unul. Dacă nu se specifică un stage țintă, lead-ul este plasat
 * automat în primul stage activ al pipeline-ului țintă. Funcția returnează un rezultat
 * structurat cu ok: true/false și detalii despre mutare sau eroare.
 * 
 * @param leadId - ID-ul lead-ului de mutat
 * @param targetPipelineId - ID-ul pipeline-ului țintă
 * @param targetStageId - ID-ul stage-ului țintă (opțional, se folosește primul stage activ dacă nu se specifică)
 * @param notes - Note opționale despre mutare (pentru istoric)
 * @returns Rezultat structurat cu:
 *   - ok: true dacă mutarea a reușit, false altfel
 *   - data: Array cu pipeline_item_id și new_stage_id (dacă ok: true)
 *   - code și message: Cod și mesaj de eroare (dacă ok: false)
 */
export async function moveLeadToPipeline(
  leadId: string,
  targetPipelineId: string,
  targetStageId?: string,
  notes?: string
): Promise<MoveResult> {
  try {
    let stageId = targetStageId
    if (!stageId) {
      const firstStage = await getFirstActiveStage(targetPipelineId)
      if (!firstStage) {
        return {
          ok: false,
          code: 'TARGET_PIPELINE_NO_ACTIVE_STAGES',
          message: 'Target pipeline has no active stages',
        }
      }
      stageId = firstStage.id
    }

    const result = await addLeadToPipeline(leadId, targetPipelineId, stageId)

    if (result.error) {
      return {
        ok: false,
        code: 'MOVE_ERROR',
        message: result.error.message,
      }
    }

    return {
      ok: true,
      data: [{
        pipeline_item_id: result.data!.id,
        new_stage_id: stageId,
      }],
    }
  } catch (error: any) {
    return {
      ok: false,
      code: 'UNKNOWN_ERROR',
      message: error?.message || 'Unknown error',
    }
  }
}

const normPipelineStage = (s: string) =>
  (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()

/** Opțional: fișe și pipeline/stages pre-fetched pentru a evita N requesturi la batch. */
export type TryMoveArhivatOptions = {
  serviceFiles?: Array<{ id: string; status: string }>
  vanzariPipelineId?: string
  arhivatStageId?: string
}

/**
 * Dacă lead-ul are DOAR fișe cu status "facturata", îl mută în Arhivat (Vânzări).
 * Poate primi opțional serviceFiles / vanzariPipelineId / arhivatStageId pentru batch (0 requesturi per lead).
 */
export async function tryMoveLeadToArhivatIfAllFacturate(
  leadId: string,
  options?: TryMoveArhivatOptions
): Promise<{ moved: boolean; error?: any }> {
  const supabase = supabaseBrowser()
  try {
    let files = options?.serviceFiles
    if (!files?.length) {
      const { data: f, error: filesErr } = await supabase
        .from('service_files')
        .select('id, status')
        .eq('lead_id', leadId)
      if (filesErr || !f?.length) return { moved: false }
      files = f
    }

    const allFacturate = files.every((f: any) => String(f.status || '').toLowerCase() === 'facturata')
    if (!allFacturate) return { moved: false }

    let vanzariId = options?.vanzariPipelineId
    let arhivatId = options?.arhivatStageId
    if (!vanzariId || !arhivatId) {
      const { data: pipelines, error: pErr } = await supabase
        .from('pipelines')
        .select('id, name')
        .eq('is_active', true)
      if (pErr || !pipelines?.length) return { moved: false }
      const vanzari = (pipelines as any[]).find(
        (p: any) => normPipelineStage(p.name || '').includes('vanzari') || normPipelineStage(p.name || '').includes('sales')
      )
      if (!vanzari) return { moved: false }
      vanzariId = vanzari.id
      const { data: stages, error: sErr } = await supabase
        .from('stages')
        .select('id, name')
        .eq('pipeline_id', vanzari.id)
        .eq('is_active', true)
      if (sErr || !stages?.length) return { moved: false }
      const arhivat = (stages as any[]).find(
        (s: any) => normPipelineStage(s.name || '').includes('arhivat') || normPipelineStage(s.name || '').includes('arhiva')
      )
      if (!arhivat) return { moved: false }
      arhivatId = arhivat.id
    }

    const { data: existing } = await supabase
      .from('pipeline_items')
      .select('id, stage_id')
      .eq('type', 'lead')
      .eq('item_id', leadId)
      .eq('pipeline_id', vanzariId)
      .maybeSingle()

    if (existing) {
      if (existing.stage_id === arhivatId) return { moved: false }
      const { error: moveErr } = await moveItemToStage('lead', leadId, vanzariId, arhivatId)
      if (moveErr) {
        console.error('[tryMoveLeadToArhivatIfAllFacturate] moveItemToStage:', moveErr)
        return { moved: false, error: moveErr }
      }
    } else {
      const { error: addErr } = await addLeadToPipeline(leadId, vanzariId, arhivatId)
      if (addErr) {
        console.error('[tryMoveLeadToArhivatIfAllFacturate] addLeadToPipeline:', addErr)
        return { moved: false, error: addErr }
      }
    }
    return { moved: true }
  } catch (err: any) {
    console.error('[tryMoveLeadToArhivatIfAllFacturate]', err)
    return { moved: false, error: err }
  }
}

/**
 * Batch: 1 query service_files pentru toți leadIds, apoi mută în Arhivat doar pe cei care au toate fișele facturate.
 * Reduce sute de requesturi la 1 (service_files) + 1 (pipelines) + 1 (stages) + M (move/add per lead mutat).
 */
export async function tryMoveLeadsToArhivatIfAllFacturateBatch(leadIds: string[]): Promise<{ movedCount: number }> {
  if (leadIds.length === 0) return { movedCount: 0 }
  const supabase = supabaseBrowser()
  const { data: allFiles, error: filesErr } = await supabase
    .from('service_files')
    .select('lead_id, id, status')
    .in('lead_id', leadIds)
  if (filesErr) return { movedCount: 0 }

  const byLead = new Map<string, Array<{ id: string; status: string }>>()
  for (const row of allFiles || []) {
    const leadId = (row as any).lead_id
    if (!leadId) continue
    if (!byLead.has(leadId)) byLead.set(leadId, [])
    byLead.get(leadId)!.push({ id: (row as any).id, status: (row as any).status || '' })
  }

  const toMove: string[] = []
  for (const leadId of leadIds) {
    const files = byLead.get(leadId)
    if (!files?.length) continue
    if (files.every(f => String(f.status || '').toLowerCase() === 'facturata')) toMove.push(leadId)
  }
  if (toMove.length === 0) return { movedCount: 0 }

  const { data: pipelines, error: pErr } = await supabase
    .from('pipelines')
    .select('id, name')
    .eq('is_active', true)
  if (pErr || !pipelines?.length) return { movedCount: 0 }
  const vanzari = (pipelines as any[]).find(
    (p: any) => normPipelineStage(p.name || '').includes('vanzari') || normPipelineStage(p.name || '').includes('sales')
  )
  if (!vanzari) return { movedCount: 0 }
  const { data: stages, error: sErr } = await supabase
    .from('stages')
    .select('id, name')
    .eq('pipeline_id', vanzari.id)
    .eq('is_active', true)
  if (sErr || !stages?.length) return { movedCount: 0 }
  const arhivat = (stages as any[]).find(
    (s: any) => normPipelineStage(s.name || '').includes('arhivat') || normPipelineStage(s.name || '').includes('arhiva')
  )
  if (!arhivat) return { movedCount: 0 }

  let movedCount = 0
  for (const leadId of toMove) {
    const { moved } = await tryMoveLeadToArhivatIfAllFacturate(leadId, {
      serviceFiles: byLead.get(leadId),
      vanzariPipelineId: vanzari.id,
      arhivatStageId: arhivat.id,
    })
    if (moved) movedCount++
  }
  return { movedCount }
}

/**
 * Mută o fișă de serviciu într-un pipeline nou.
 * Această funcție mută o fișă de serviciu dintr-un pipeline în altul, sau o adaugă într-un
 * pipeline dacă nu era deja într-unul. Dacă nu se specifică un stage țintă, fișa este plasată
 * automat în primul stage activ al pipeline-ului țintă. Funcția returnează un rezultat
 * structurat cu ok: true/false și detalii despre mutare sau eroare.
 *
 * @param serviceFileId - ID-ul fișei de serviciu de mutat
 * @param targetPipelineId - ID-ul pipeline-ului țintă
 * @param targetStageId - ID-ul stage-ului țintă (opțional, se folosește primul stage activ dacă nu se specifică)
 * @param notes - Note opționale despre mutare (pentru istoric)
 * @returns Rezultat structurat cu:
 *   - ok: true dacă mutarea a reușit, false altfel
 *   - data: Array cu pipeline_item_id și new_stage_id (dacă ok: true)
 *   - code și message: Cod și mesaj de eroare (dacă ok: false)
 */
export async function moveServiceFileToPipeline(
  serviceFileId: string,
  targetPipelineId: string,
  targetStageId?: string,
  notes?: string
): Promise<MoveResult> {
  try {
    let stageId = targetStageId
    if (!stageId) {
      const firstStage = await getFirstActiveStage(targetPipelineId)
      if (!firstStage) {
        return {
          ok: false,
          code: 'TARGET_PIPELINE_NO_ACTIVE_STAGES',
          message: 'Target pipeline has no active stages',
        }
      }
      stageId = firstStage.id
    }

    const result = await addServiceFileToPipeline(serviceFileId, targetPipelineId, stageId)

    if (result.error) {
      return {
        ok: false,
        code: 'MOVE_ERROR',
        message: result.error.message,
      }
    }

    return {
      ok: true,
      data: [{
        pipeline_item_id: result.data!.id,
        new_stage_id: stageId,
      }],
    }
  } catch (error: any) {
    return {
      ok: false,
      code: 'UNKNOWN_ERROR',
      message: error?.message || 'Unknown error',
    }
  }
}

/**
 * Mută o tăviță într-un pipeline nou.
 * Această funcție mută o tăviță dintr-un pipeline în altul, sau o adaugă într-un pipeline
 * dacă nu era deja într-unul. Dacă nu se specifică un stage țintă, tăvița este plasată
 * automat în primul stage activ al pipeline-ului țintă. Funcția returnează un rezultat
 * structurat cu ok: true/false și detalii despre mutare sau eroare.
 * 
 * @param trayId - ID-ul tăviței de mutat
 * @param targetPipelineId - ID-ul pipeline-ului țintă
 * @param targetStageId - ID-ul stage-ului țintă (opțional, se folosește primul stage activ dacă nu se specifică)
 * @param notes - Note opționale despre mutare (pentru istoric)
 * @returns Rezultat structurat cu:
 *   - ok: true dacă mutarea a reușit, false altfel
 *   - data: Array cu pipeline_item_id și new_stage_id (dacă ok: true)
 *   - code și message: Cod și mesaj de eroare (dacă ok: false)
 */
export async function moveTrayToPipeline(
  trayId: string,
  targetPipelineId: string,
  targetStageId?: string,
  notes?: string
): Promise<MoveResult> {
  try {
    const supabase = supabaseBrowser()
    
    // Găsește pipeline-ul curent al tăviței (dacă există)
    const { data: currentPipelineItem } = await supabase
      .from('pipeline_items')
      .select('pipeline_id, stage_id')
      .eq('type', 'tray')
      .eq('item_id', trayId)
      .maybeSingle()

    const fromPipelineId = currentPipelineItem?.pipeline_id
    const fromStageId = currentPipelineItem?.stage_id || null

    let stageId = targetStageId
    if (!stageId) {
      const leadId = await getTrayLeadId(trayId)
      const returStageId =
        leadId && (await leadHasReturTag(leadId))
          ? await getReturStageId(targetPipelineId)
          : null
      if (returStageId) {
        stageId = returStageId
      } else {
        const firstStage = await getFirstActiveStage(targetPipelineId)
        if (!firstStage) {
          return {
            ok: false,
            code: 'TARGET_PIPELINE_NO_ACTIVE_STAGES',
            message: 'Target pipeline has no active stages',
          }
        }
        stageId = firstStage.id
      }
    }

    // Mută tăvița în noul pipeline
    // Notă: addTrayToPipeline va loga adăugarea inițială dacă tăvița nu era în pipeline
    const result = await addTrayToPipeline(trayId, targetPipelineId, stageId)

    if (result.error) {
      return {
        ok: false,
        code: 'MOVE_ERROR',
        message: result.error.message,
      }
    }

    // Loghează mutarea între pipeline-uri (doar dacă tăvița era într-un alt pipeline)
    // Notă: logTrayPipelineMove loghează doar adăugarea în noul pipeline, deci nu există duplicate
    if (fromPipelineId && fromPipelineId !== targetPipelineId) {
      try {
        const logResult = await logTrayPipelineMove({
          trayId,
          fromPipelineId,
          fromStageId,
          toPipelineId: targetPipelineId,
          toStageId: stageId,
          notes: notes || `Tăvița a fost mutată din pipeline ${fromPipelineId} în ${targetPipelineId}`,
        })
        if (logResult.error) {
          console.error('[moveTrayToPipeline] Error logging pipeline move:', {
            error: logResult.error,
            message: logResult.error instanceof Error ? logResult.error.message : String(logResult.error),
            trayId,
            fromPipelineId,
            toPipelineId: targetPipelineId,
            toStageId: stageId,
          })
        }
      } catch (logError) {
        console.error('[moveTrayToPipeline] Error logging pipeline move:', {
          error: logError,
          message: logError instanceof Error ? logError.message : String(logError),
          trayId,
          fromPipelineId,
          toPipelineId: targetPipelineId,
          toStageId: stageId,
        })
        // Nu propagă eroarea, mutarea a fost făcută deja
      }
    }

    return {
      ok: true,
      data: [{
        pipeline_item_id: result.data!.id,
        new_stage_id: stageId,
      }],
    }
  } catch (error: any) {
    return {
      ok: false,
      code: 'UNKNOWN_ERROR',
      message: error?.message || 'Unknown error',
    }
  }
}

/**
 * Mişte lead-urile care au cel puţin o fişă de serviciu în stagiul "Lead-uri Vechi" din pipeline-ul "Vânzări".
 * Această funcție identifică toate lead-urile care au cel puţin o fişă de serviciu asociată,
 * și le mişte automat în stagiul "Lead-uri Vechi" din pipeline-ul de vânzări.
 * 
 * @returns Obiect cu rezultat: { success: boolean, movedLeadsCount: number, error?: any }
 */
export async function moveLeadsWithServiceFilesToOldStage(): Promise<{
  success: boolean
  movedLeadsCount: number
  error?: any
}> {
  try {
    const supabase = supabaseBrowser()
    
    // 1. Găsește pipeline-ul "Vânzări"
    const { data: pipelines, error: pipelineError } = await supabase
      .from('pipelines')
      .select('id, name, stages(id, name)')
      .ilike('name', '%Vânzări%')
    
    if (pipelineError) {
      throw new Error(`Error fetching pipelines: ${pipelineError.message}`)
    }
    
    const vanzariPipeline = pipelines?.[0]
    if (!vanzariPipeline) {
      throw new Error('Pipeline "Vânzări" not found')
    }
    
    // 2. Găsește stagiul "Lead-uri Vechi" în pipeline-ul Vânzări
    const oldLeadsStage = (vanzariPipeline.stages as any[])?.find((s: any) =>
      s.name?.toLowerCase().includes('vechi') || s.name?.toLowerCase().includes('old')
    )
    
    if (!oldLeadsStage) {
      throw new Error('Stage "Lead-uri Vechi" not found in Vânzări pipeline')
    }
    
    // 3. Găsește toate lead-urile care au cel puţin o fişă de serviciu
    // SELECT lead_id din service_files, apoi DISTINCT pentru a obţine lead-urile unice
    const { data: serviceFileLeads, error: sfError } = await supabase
      .from('service_files')
      .select('lead_id')
    
    if (sfError) {
      throw new Error(`Error fetching service files: ${sfError.message}`)
    }
    
    // Obţine lista unică de lead IDs
    const leadIdsWithServiceFiles = [...new Set(
      (serviceFileLeads as any[])
        ?.map((sf: any) => sf.lead_id)
        .filter((id: string | null) => id !== null && id !== undefined) || []
    )]
    
    if (leadIdsWithServiceFiles.length === 0) {
      return { success: true, movedLeadsCount: 0 }
    }

    const nowIso = new Date().toISOString()

    // 4. Un singur select batch: toate pipeline_items (lead, Vânzări) pentru leadIdsWithServiceFiles
    const { data: existingItems, error: selectError } = await supabase
      .from('pipeline_items')
      .select('id, item_id')
      .eq('type', 'lead')
      .eq('pipeline_id', vanzariPipeline.id)
      .in('item_id', leadIdsWithServiceFiles)

    if (selectError) {
      throw new Error(`Error fetching pipeline_items: ${selectError.message}`)
    }

    const existingByLeadId = new Map<string, string>()
    ;(existingItems || []).forEach((row: any) => {
      if (row?.item_id && row?.id) existingByLeadId.set(row.item_id, row.id)
    })
    const existingIds = Array.from(existingByLeadId.values())
    const leadIdsToInsert = leadIdsWithServiceFiles.filter((id) => !existingByLeadId.has(id))

    let movedCount = 0

    if (existingIds.length > 0) {
      const { error: updateError } = await supabase
        .from('pipeline_items')
        .update({ stage_id: oldLeadsStage.id, updated_at: nowIso })
        .in('id', existingIds)
      if (!updateError) movedCount += existingIds.length
      else console.warn('[moveLeadsWithServiceFilesToOldStage] Batch update error:', updateError)
    }

    if (leadIdsToInsert.length > 0) {
      const rows = leadIdsToInsert.map((item_id) => ({
        type: 'lead',
        item_id,
        pipeline_id: vanzariPipeline.id,
        stage_id: oldLeadsStage.id,
      }))
      const { data: inserted, error: insertError } = await supabase
        .from('pipeline_items')
        .insert(rows)
        .select('id')
      if (!insertError && inserted?.length) movedCount += inserted.length
      else if (insertError) {
        console.warn('[moveLeadsWithServiceFilesToOldStage] Batch insert error (possible duplicates):', insertError.message)
        for (const leadId of leadIdsToInsert) {
          try {
            const { error: singleError } = await supabase.from('pipeline_items').insert({
              type: 'lead',
              item_id: leadId,
              pipeline_id: vanzariPipeline.id,
              stage_id: oldLeadsStage.id,
            })
            if (!singleError) movedCount += 1
          } catch (_) {}
        }
      }
    }

    return { success: true, movedLeadsCount: movedCount }
  } catch (error: any) {
    return {
      success: false,
      movedLeadsCount: 0,
      error: error?.message || 'Unknown error',
    }
  }
}
