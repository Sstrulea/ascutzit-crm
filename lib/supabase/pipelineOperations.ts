'use client'

/**
 * Pipeline Operations
 * 
 * This file contains pipeline item mutation operations.
 * The getKanbanItems and related query functions have been refactored into
 * modular kanban/ directory for better maintainability.
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
// For backward compatibility, re-export query functions from new module

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
 * Add or update an item in a pipeline (generic function).
 * This function is used internally to add any type of item (lead, service_file, tray)
 * to a pipeline. If the item already exists in the pipeline, only the stage is updated.
 * If it doesn't exist, a new record is created in pipeline_items.
 * 
 * @param type - Item type: 'lead', 'service_file', or 'tray'
 * @param itemId - ID of the item to add
 * @param pipelineId - ID of the pipeline to add the item to
 * @param stageId - ID of the stage to place the item in
 * @returns Object with the created/updated pipeline_item data or null and error if any
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
      
      // Log stage change for trays (only if stage actually changed)
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
          // Don't propagate error, move was already done
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
      
      // Log initial addition for trays
      if (type === 'tray') {
        try {
          const logResult = await logTrayInitialStage({
            trayId: itemId,
            pipelineId,
            stageId,
          })
          if (logResult.error) {
            // Safely extract error message
            let errorMessage = 'Unknown logging error'
            let errorCode = null
            let errorDetails = null
            
            if (logResult.error instanceof Error) {
              errorMessage = logResult.error.message || 'Logging error (no message)'
            } else if (typeof logResult.error === 'object' && logResult.error !== null) {
              const err = logResult.error as any
              errorMessage = err?.message || JSON.stringify(err) || 'Logging error (empty object)'
              errorCode = err?.code || null
              errorDetails = err?.details || null
            } else {
              errorMessage = String(logResult.error) || 'Logging error'
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
          // Safely extract error message
          let errorMessage = 'Unknown logging error'
          let errorCode = null
          let errorDetails = null
          
          if (logError instanceof Error) {
            errorMessage = logError.message || 'Logging error (no message)'
          } else if (typeof logError === 'object' && logError !== null) {
            const err = logError as any
            errorMessage = err?.message || JSON.stringify(err) || 'Logging error (empty object)'
            errorCode = err?.code || null
            errorDetails = err?.details || null
          } else {
            errorMessage = String(logError) || 'Logging error'
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
          // Don't propagate error, move was already done
        }
      }
    }

    return result
  } catch (error) {
    return { data: null, error }
  }
}

/**
 * Add a lead to a specific pipeline.
 * This function is a wrapper around addItemToPipeline specialized for leads.
 * The lead is added to pipeline_items and placed in the specified stage.
 * 
 * @param leadId - ID of the lead to add
 * @param pipelineId - ID of the pipeline to add the lead to
 * @param stageId - ID of the stage to place the lead in
 * @returns Object with the created/updated pipeline_item data or null and error if any
 */
export async function addLeadToPipeline(
  leadId: string,
  pipelineId: string,
  stageId: string
): Promise<{ data: any | null; error: any }> {
  return addItemToPipeline('lead', leadId, pipelineId, stageId)
}

/**
 * Add a service file to a specific pipeline.
 * This function is a wrapper around addItemToPipeline specialized for service files.
 * The service file is added to pipeline_items and placed in the specified stage.
 * 
 * @param serviceFileId - ID of the service file to add
 * @param pipelineId - ID of the pipeline to add the file to
 * @param stageId - ID of the stage to place the file in
 * @returns Object with the created/updated pipeline_item data or null and error if any
 */
export async function addServiceFileToPipeline(
  serviceFileId: string,
  pipelineId: string,
  stageId: string
): Promise<{ data: any | null; error: any }> {
  return addItemToPipeline('service_file', serviceFileId, pipelineId, stageId)
}

/**
 * Add a tray to a specific pipeline.
 * This function is a wrapper around addItemToPipeline specialized for trays.
 * The tray is added to pipeline_items and placed in the specified stage.
 * 
 * @param trayId - ID of the tray to add
 * @param pipelineId - ID of the pipeline to add the tray to
 * @param stageId - ID of the stage to place the tray in
 * @returns Object with the created/updated pipeline_item data or null and error if any
 */
export async function addTrayToPipeline(
  trayId: string,
  pipelineId: string,
  stageId: string
): Promise<{ data: any | null; error: any }> {
  return addItemToPipeline('tray', trayId, pipelineId, stageId)
}

/**
 * Move an item to a different stage in the same pipeline.
 * This function updates the stage of an item that is already in a pipeline.
 * The item remains in the same pipeline, only the stage changes.
 * The function first checks if the item exists in the specified pipeline.
 * 
 * @param type - Item type: 'lead', 'service_file', or 'tray'
 * @param itemId - ID of the item to move
 * @param pipelineId - ID of the pipeline the item is in
 * @param newStageId - ID of the new stage to move the item to
 * @param fromStageId - ID of the source stage (optional, for validation)
 * @returns Object with the updated pipeline_item data or null and error if any
 */
/**
 * Single call move: RPC move_item_to_stage does SELECT + UPDATE + log tray/lead in DB.
 * For type='tray', optional technicianId allows per-technician log in stage_history (waiting time at reunion).
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
    // IMPORTANT: Always send all 5 parameters (including p_technician_id: null)
    // to avoid PostgreSQL ambiguity between the 4-parameter and 5-parameter functions.
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

    // Auto-merge: if moved tray is from split and all sisters are in Finalizare, merge them
    if (type === 'tray') {
      mergeSplitTraysIfAllFinalized(itemId, pipelineId).then((res) => {
        if (res.data?.merged) {
          // Merge done; UI can re-fetch (realtime or refresh)
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
 * Get all items from a pipeline (optionally filtered).
 * This function allows getting all items from a pipeline, with options
 * to filter by stage or item type. Results are sorted descending by
 * creation date (newest first).
 * 
 * @param pipelineId - ID of the pipeline to get items from
 * @param stageId - ID of the stage to filter by (optional)
 * @param type - Item type to filter by: 'lead', 'service_file', or 'tray' (optional)
 * @returns Object with the pipeline_items array or empty array and error if any
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
 * Find the pipeline ID where an item is located (without filtering by pipeline).
 * Useful when moving when the card has an old/stale pipelineId and RPC returns "not found in specified pipeline".
 *
 * @param type - Item type: 'lead', 'service_file', or 'tray'
 * @param itemId - ID of the item
 * @returns pipeline_id if a row exists in pipeline_items, otherwise null
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
 * Get the pipeline_item for a specific item.
 * This function looks for the record in pipeline_items that associates an item
 * (lead, service_file, or tray) with a specific pipeline. It's used to
 * check if an item is already in a pipeline and what stage it's in.
 * 
 * @param type - Item type: 'lead', 'service_file', or 'tray'
 * @param itemId - ID of the item to look for the pipeline_item
 * @param pipelineId - ID of the pipeline to search in
 * @returns Object with the pipeline_item data or null if not found and error if any
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
 * Remove an item from a pipeline.
 * This function deletes the record from pipeline_items, which means the
 * item will no longer appear in that pipeline. The item itself (lead, service_file, or tray)
 * is not deleted, only the association with the pipeline is removed.
 * 
 * @param type - Item type: 'lead', 'service_file', or 'tray'
 * @param itemId - ID of the item to remove from pipeline
 * @param pipelineId - ID of the pipeline to remove the item from
 * @returns Object with success: true if removal succeeded, false otherwise, and error if any
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
 * Get the first active stage from a pipeline (helper function).
 * This function is used internally to find the initial stage when an item
 * is added to a pipeline without specifying a stage. Returns the stage with
 * the lowest position (first in workflow).
 * 
 * @param pipelineId - ID of the pipeline to find the first active stage for
 * @returns Object with the id of the first active stage or null if no active stages exist
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
 * Return the ID of the "Retur" stage from a pipeline, if it exists.
 * Exported for use when sending trays to department (Retur tag → Retur stage).
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
 * Return the lead_id associated with a tray (through service_file), or null.
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
 * Check if the lead has the "Retur" tag (name ilike 'retur').
 * Exported for use when sending trays to department.
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
 * Move a lead to a new pipeline.
 * This function moves a lead from one pipeline to another, or adds it to a pipeline
 * if it wasn't already in one. If no target stage is specified, the lead is placed
 * automatically in the first active stage of the target pipeline. The function returns a
 * structured result with ok: true/false and details about the move or error.
 * 
 * @param leadId - ID of the lead to move
 * @param targetPipelineId - ID of the target pipeline
 * @param targetStageId - ID of the target stage (optional, uses first active stage if not specified)
 * @param notes - Optional notes about the move (for history)
 * @returns Structured result with:
 *   - ok: true if move succeeded, false otherwise
 *   - data: Array with pipeline_item_id and new_stage_id (if ok: true)
 *   - code and message: Error code and message (if ok: false)
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

/** Optional: pre-fetched service files and pipeline/stages to avoid N requests per batch. */
export type TryMoveArhivatOptions = {
  serviceFiles?: Array<{ id: string; status: string }>
  vanzariPipelineId?: string
  arhivatStageId?: string
}

/**
 * If the lead has ONLY files with status "facturata" (invoiced), move it to Arhivat (Sales).
 * Can optionally receive serviceFiles / vanzariPipelineId / arhivatStageId for batch (0 requests per lead).
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
 * Batch: 1 service_files query for all leadIds, then move to Arhivat only those with all files invoiced.
 * Reduces hundreds of requests to 1 (service_files) + 1 (pipelines) + 1 (stages) + M (move/add per moved lead).
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
 * Move a service file to a new pipeline.
 * This function moves a service file from one pipeline to another, or adds it to a
 * pipeline if it wasn't already in one. If no target stage is specified, the file
 * is placed automatically in the first active stage of the target pipeline. The function
 * returns a structured result with ok: true/false and details about the move or error.
 *
 * @param serviceFileId - ID of the service file to move
 * @param targetPipelineId - ID of the target pipeline
 * @param targetStageId - ID of the target stage (optional, uses first active stage if not specified)
 * @param notes - Optional notes about the move (for history)
 * @returns Structured result with:
 *   - ok: true if move succeeded, false otherwise
 *   - data: Array with pipeline_item_id and new_stage_id (if ok: true)
 *   - code and message: Error code and message (if ok: false)
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
 * Move a tray to a new pipeline.
 * This function moves a tray from one pipeline to another, or adds it to a pipeline
 * if it wasn't already in one. If no target stage is specified, the tray is placed
 * automatically in the first active stage of the target pipeline. The function returns a
 * structured result with ok: true/false and details about the move or error.
 * 
 * @param trayId - ID of the tray to move
 * @param targetPipelineId - ID of the target pipeline
 * @param targetStageId - ID of the target stage (optional, uses first active stage if not specified)
 * @param notes - Optional notes about the move (for history)
 * @returns Structured result with:
 *   - ok: true if move succeeded, false otherwise
 *   - data: Array with pipeline_item_id and new_stage_id (if ok: true)
 *   - code and message: Error code and message (if ok: false)
 */
export async function moveTrayToPipeline(
  trayId: string,
  targetPipelineId: string,
  targetStageId?: string,
  notes?: string
): Promise<MoveResult> {
  try {
    const supabase = supabaseBrowser()
    
    // Find the tray's current pipeline (if it exists)
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

    // Move tray to new pipeline
    // Note: addTrayToPipeline will log initial addition if tray wasn't in pipeline
    const result = await addTrayToPipeline(trayId, targetPipelineId, stageId)

    if (result.error) {
      return {
        ok: false,
        code: 'MOVE_ERROR',
        message: result.error.message,
      }
    }

    // Log move between pipelines (only if tray was in a different pipeline)
    // Note: logTrayPipelineMove only logs addition to new pipeline, so no duplicates exist
    if (fromPipelineId && fromPipelineId !== targetPipelineId) {
      try {
        const logResult = await logTrayPipelineMove({
          trayId,
          fromPipelineId,
          fromStageId,
          toPipelineId: targetPipelineId,
          toStageId: stageId,
          notes: notes || `Tray moved from pipeline ${fromPipelineId} to ${targetPipelineId}`,
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
        // Don't propagate error, move was already done
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
 * Move leads that have at least one service file to the "Lead-uri Vechi" (Old Leads) stage in the "Vânzări" pipeline.
 * This function identifies all leads that have at least one associated service file,
 * and automatically moves them to the "Lead-uri Vechi" stage in the sales pipeline.
 * 
 * @returns Object with result: { success: boolean, movedLeadsCount: number, error?: any }
 */
export async function moveLeadsWithServiceFilesToOldStage(): Promise<{
  success: boolean
  movedLeadsCount: number
  error?: any
}> {
  try {
    const supabase = supabaseBrowser()
    
    // 1. Find the "Vânzări" (Sales) pipeline
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
    
    // 2. Find the "Lead-uri Vechi" (Old Leads) stage in the Sales pipeline
    const oldLeadsStage = (vanzariPipeline.stages as any[])?.find((s: any) =>
      s.name?.toLowerCase().includes('vechi') || s.name?.toLowerCase().includes('old')
    )
    
    if (!oldLeadsStage) {
      throw new Error('Stage "Lead-uri Vechi" not found in Vânzări pipeline')
    }
    
    // 3. Find all leads that have at least one service file
    // SELECT lead_id from service_files, then DISTINCT to get unique leads
    const { data: serviceFileLeads, error: sfError } = await supabase
      .from('service_files')
      .select('lead_id')
    
    if (sfError) {
      throw new Error(`Error fetching service files: ${sfError.message}`)
    }
    
    // Get unique list of lead IDs
    const leadIdsWithServiceFiles = [...new Set(
      (serviceFileLeads as any[])
        ?.map((sf: any) => sf.lead_id)
        .filter((id: string | null) => id !== null && id !== undefined) || []
    )]
    
    if (leadIdsWithServiceFiles.length === 0) {
      return { success: true, movedLeadsCount: 0 }
    }

    const nowIso = new Date().toISOString()

    // 4. Single batch select: all pipeline_items (lead, Sales) for leadIdsWithServiceFiles
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