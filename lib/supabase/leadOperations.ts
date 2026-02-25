'use client'

import { supabaseBrowser } from './supabaseClient'
import type { Pipeline, Stage, Lead, PipelineWithStages } from '../types/database'
import { moveLeadToPipeline as moveLeadToPipelineFn, type MoveItemResult } from './pipelineOperations'

const supabase = supabaseBrowser()

export type PipelineOption = { id: string; name: string; is_active: boolean; active_stages: number }

export type { MoveItemResult }
export type MoveResult = MoveItemResult

/**
 * Helper function for automatically assigning department tags to a lead.
 * This function analyzes the pipeline name and automatically assigns the corresponding
 * department tag (Horeca, Saloane, Frizerii, Reparatii). If the tag doesn't exist, it creates it.
 * A lead can only have one department tag, so the function automatically removes
 * other department tags before assigning the new tag.
 *
 * @param leadId - The ID of the lead to assign the tag to
 * @param pipelineName - The pipeline name from which the department is deduced
 */
async function assignDepartmentTagToLead(leadId: string, pipelineName: string) {
  const departmentTags = [
    { name: 'Horeca', color: 'orange' as const },
    { name: 'Saloane', color: 'green' as const },
    { name: 'Frizerii', color: 'yellow' as const },
    { name: 'Reparatii', color: 'blue' as const },
  ]

  // Determine the department tag based on the pipeline name
  const pipelineNameUpper = pipelineName.toUpperCase()
  let departmentTagName: string | null = null
  if (pipelineNameUpper.includes('HORECA')) {
    departmentTagName = 'Horeca'
  } else if (pipelineNameUpper.includes('SALOANE') || pipelineNameUpper.includes('SALON')) {
    departmentTagName = 'Saloane'
  } else if (pipelineNameUpper.includes('FRIZER') || pipelineNameUpper.includes('BARBER')) {
    departmentTagName = 'Frizerii'
  } else if (pipelineNameUpper.includes('REPARAT') || pipelineNameUpper.includes('SERVICE')) {
    departmentTagName = 'Reparatii'
  }

  if (!departmentTagName) return

  // Find or create the tag
  const { data: existingTag } = await supabase
    .from('tags')
    .select('id')
    .eq('name', departmentTagName)
    .single()

  let tagId: string
  if (existingTag) {
    tagId = existingTag.id
  } else {
    const tagData = departmentTags.find(t => t.name === departmentTagName)
    if (!tagData) return
    
    const { data: newTag, error: tagError } = await supabase
      .from('tags')
      .insert([{ name: tagData.name, color: tagData.color }] as any)
      .select('id')
      .single()
    
    if (tagError || !newTag) return
    tagId = newTag.id
  }

  // Check if the tag is already assigned
  const { data: existingAssignment } = await supabase
    .from('lead_tags')
    .select('lead_id')
    .eq('lead_id', leadId)
    .eq('tag_id', tagId)
    .maybeSingle()

  // Assign the tag if not already assigned
  if (!existingAssignment) {
    await supabase
      .from('lead_tags')
      .insert([{ lead_id: leadId, tag_id: tagId }] as any)
  }

  // Remove other department tags (a lead can only have one department tag)
  const otherDepartmentTags = departmentTags.filter(t => t.name !== departmentTagName)
  const otherTagNames = otherDepartmentTags.map(t => t.name)
  
  const { data: otherTags } = await supabase
    .from('tags')
    .select('id')
    .in('name', otherTagNames)

  if (otherTags && otherTags.length > 0) {
    const otherTagIds = otherTags.map(t => t.id)
    await supabase
      .from('lead_tags')
      .delete()
      .eq('lead_id', leadId)
      .in('tag_id', otherTagIds)
  }
}


/**
 * Gets the list of available pipeline options.
 * Uses a Supabase RPC (Remote Procedure Call) function to get
 * the active pipelines with the number of active stages for each.
 * This function is used in dropdowns and pipeline selections.
 *
 * @returns Array of pipeline options, each containing:
 *   - id: The pipeline ID
 *   - name: The pipeline name
 *   - is_active: Whether the pipeline is active
 *   - active_stages: Number of active stages in the pipeline
 * @throws Error if the RPC call fails
 */
const PIPELINE_OPTIONS_CACHE_MS = 5 * 60 * 1000 // 5 min
const PIPELINES_STAGES_STORAGE_KEY = 'crm:pipelinesWithStages:v1'
let pipelineOptionsCache: { data: PipelineOption[]; ts: number } | null = null
let pipelineOptionsPromise: Promise<PipelineOption[]> | null = null

export function invalidatePipelineOptionsCache() {
  pipelineOptionsCache = null
  pipelineOptionsPromise = null
  if (typeof window !== 'undefined') {
    try {
      sessionStorage.removeItem(PIPELINES_STAGES_STORAGE_KEY)
    } catch {
      // ignore
    }
  }
}

export async function getPipelineOptions(forceRefresh = false): Promise<PipelineOption[]> {
  const now = Date.now()
  if (!forceRefresh && pipelineOptionsCache && now - pipelineOptionsCache.ts < PIPELINE_OPTIONS_CACHE_MS) {
    return pipelineOptionsCache.data
  }
  if (pipelineOptionsPromise && !forceRefresh) return pipelineOptionsPromise
  pipelineOptionsPromise = (async () => {
    const { data, error } = await supabase.rpc('get_pipeline_options')
    if (error) throw error
    const result = (data ?? []) as PipelineOption[]
    pipelineOptionsCache = { data: result, ts: Date.now() }
    return result
  })()
  const out = await pipelineOptionsPromise
  pipelineOptionsPromise = null
  return out
}

const PIPELINES_STAGES_TTL_MS = 5 * 60 * 1000 // 5 min

/**
 * Gets all active pipelines with their associated stages.
 * Cached in sessionStorage (TTL 5 min) - persists on refresh.
 * invalidatePipelineOptionsCache() also clears this cache.
 */
export async function getPipelinesWithStages() {
  try {
    if (typeof window !== 'undefined') {
      const raw = sessionStorage.getItem(PIPELINES_STAGES_STORAGE_KEY)
      if (raw) {
        const { ts, data } = JSON.parse(raw) as { ts: number; data: any[] }
        if (Date.now() - ts < PIPELINES_STAGES_TTL_MS && Array.isArray(data)) {
          return { data, error: null }
        }
      }
    }

    const { data: pipelines, error: pipelineError } = await supabase
      .from('pipelines')
      .select('*')
      .eq('is_active', true)
      .order('position')

    if (pipelineError) throw pipelineError

    const { data: stages, error: stageError } = await supabase
      .from('stages')
      .select('*')
      .eq('is_active', true)
      .order('position')

    if (stageError) throw stageError

    const pipelinesWithStages = pipelines.map(pipeline => ({
      ...pipeline,
      stages: stages.filter(stage => stage.pipeline_id === pipeline.id)
    }))

    if (typeof window !== 'undefined') {
      try {
        sessionStorage.setItem(PIPELINES_STAGES_STORAGE_KEY, JSON.stringify({ ts: Date.now(), data: pipelinesWithStages }))
      } catch {
        // quota
      }
    }

    return { data: pipelinesWithStages, error: null }
  } catch (error) {
    return { data: null, error }
  }
}

/**
 * Creates a new lead in the database.
 * A lead represents a potential customer who has filled out a form or has been
 * manually added to the system. The lead contains contact information (name, email, phone)
 * and details about the lead source (campaign, ad, form, etc.).
 *
 * @param leadData - The lead data to create (any fields from the leads table)
 * @returns Object with:
 *   - data: The created lead or null if an error occurs
 *   - error: null if successful, or the error if a problem occurs
 */
export async function createLead(leadData: any) {
  try {
    const { data, error } = await supabase
      .from('leads')
      .insert([leadData])
      .select()
      .single()

    if (error) throw error

    // Register in history: lead created (for displaying creation date and in History)
    if (data?.id) {
      await logItemEvent(
        'lead',
        data.id,
        `Lead created${data.full_name ? `: ${data.full_name}` : ''}`,
        'lead_created',
        { lead_id: data.id, full_name: data.full_name ?? null, created_at: data.created_at ?? new Date().toISOString() }
      ).catch((err) => console.error('[createLead] logItemEvent:', err))
    }

    return { data, error: null }
  } catch (error) {
    return { data: null, error }
  }
}

/**
 * Creates a lead and automatically adds it to a specified pipeline.
 * This function combines creating the lead with adding it to a pipeline,
 * ensuring the lead is immediately available in the appropriate workflow.
 * After creation, it automatically assigns the department tag based on the pipeline name.
 *
 * @param leadData - The lead data to create
 * @param pipelineId - The ID of the pipeline to add the lead to
 * @param stageId - The ID of the initial stage to place the lead in
 * @param options - Optional: currentUserId from useAuth() – avoids getSession() (Phase 3.4)
 * @returns Object with:
 *   - data: Object with the created lead and the pipeline assignment, or null if an error occurs
 *   - error: null if successful, or the error if a problem occurs
 */
export async function createLeadWithPipeline(
  leadData: any,
  pipelineId: string,
  stageId: string,
  options?: { currentUserId?: string }
): Promise<{ data: { lead: any; assignment: any } | null; error: any }> {
  try {
    const payload = { ...leadData }
    if (options?.currentUserId != null) payload.created_by = options.currentUserId
    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .insert([payload])
      .select()
      .single()

    if (leadError) throw leadError

    // Register in history: lead created (for displaying creation date and in History tab)
    const actorOption = options?.currentUserId
      ? { currentUserId: options.currentUserId, currentUserName: undefined, currentUserEmail: undefined }
      : undefined
    await logItemEvent(
      'lead',
      lead.id,
      `Lead created${lead.full_name ? `: ${lead.full_name}` : ''}`,
      'lead_created',
      { lead_id: lead.id, full_name: lead.full_name ?? null, created_at: lead.created_at ?? new Date().toISOString(), pipeline_id: pipelineId, stage_id: stageId },
      undefined,
      actorOption
    ).catch((err) => console.error('[createLeadWithPipeline] logItemEvent:', err))

    // Add lead to pipeline
    const moveResult = await moveLeadToPipelineFn(lead.id, pipelineId, stageId)

    if (!moveResult.ok || !moveResult.data || moveResult.data.length === 0) {
      const errorMessage = moveResult.ok === false ? moveResult.message : 'Could not add lead to pipeline'
      throw new Error(errorMessage)
    }

    // Automatically assign department tag after creation
    const { data: pipeline } = await supabase
      .from('pipelines')
      .select('name')
      .eq('id', pipelineId)
      .single()
    
    if (pipeline?.name) {
      await assignDepartmentTagToLead(lead.id, pipeline.name)
    }

    // ✅ TRIGGER: Create PUBLIC conversation for lead when the lead is created
    try {
      console.log('🔍 Creating conversation for newly created lead:', lead.id)
      
      // Phase 3.4: currentUserId from caller (useAuth) – avoids getSession()
      let currentUserId = options?.currentUserId
      if (currentUserId == null) {
        const { data: { session } } = await supabase.auth.getSession()
        currentUserId = session?.user?.id ?? undefined
      }
      if (!currentUserId) {
        console.warn('⚠️ No authenticated user found - cannot create conversation')
      } else {
        // Check if conversation already exists (safety check)
        const { data: existingConv, error: searchError } = await supabase
          .from('conversations')
          .select('id')
          .eq('related_id', lead.id)
          .eq('type', 'lead')
          .maybeSingle()

        if (searchError && searchError.code !== 'PGRST116') {
          console.warn('⚠️ Error searching for conversation:', searchError)
        } else if (!existingConv) {
          // Conversation doesn't exist, create it
          console.log('➕ Creating new conversation for lead:', lead.id)
          const { data: newConv, error: insertError } = await supabase
            .from('conversations')
            .insert({
              related_id: lead.id,
              type: 'lead',
              created_by: currentUserId, // Created by current user
            })
            .select('id')
            .single()

          if (insertError) {
            console.error('❌ Error creating conversation:', insertError)
          } else {
            console.log('✅ Conversation created successfully for lead:', newConv?.id)
          }
        } else {
          console.log('✅ Conversation already exists for lead:', existingConv.id)
        }
      }
    } catch (convError) {
      console.error('⚠️ Error in conversation creation process:', convError)
      // Don't stop the process if conversation creation fails
    }

    return {
      data: {
        lead,
        assignment: { id: moveResult.data[0].pipeline_item_id, pipeline_id: pipelineId, stage_id: stageId },
      },
      error: null,
    }
  } catch (error) {
    return { data: null, error }
  }
}

/**
 * Moves a lead to a specified pipeline (uses the new pipeline_items architecture).
 * This function moves a lead from one pipeline to another, or adds it to a pipeline
 * if it wasn't already in one. The lead is automatically placed in the first active stage
 * of the target pipeline if no stage is specified. After moving, it automatically assigns
 * the department tag based on the new pipeline name.
 *
 * @param leadId - The ID of the lead to move
 * @param targetPipelineId - The ID of the target pipeline
 * @param notes - Optional notes about the move (for history)
 * @returns Move result with ok: true/false, data with pipeline_item_id and new_stage_id, or error
 */
export async function moveLeadToPipeline(
  leadId: string,
  targetPipelineId: string,
  notes?: string
): Promise<MoveResult> {
  const result = await moveLeadToPipelineFn(leadId, targetPipelineId, undefined, notes)

  // Automatically assign department tag after move
  if (result.ok && result.data && result.data.length > 0) {
    const { data: pipeline } = await supabase
      .from('pipelines')
      .select('name')
      .eq('id', targetPipelineId)
      .single()

    if (pipeline?.name) {
      await assignDepartmentTagToLead(leadId, pipeline.name)
    }
  }

  return result
}

/**
 * Moves a lead to a pipeline identified by name (not by ID).
 * This function is a convenient variant that allows moving a lead using
 * the pipeline name instead of ID. The function searches for the active pipeline
 * with the specified name and then calls moveLeadToPipeline with the found ID.
 *
 * @param leadId - The ID of the lead to move
 * @param targetPipelineName - The target pipeline name (must be exact)
 * @param notes - Optional notes about the move (for history)
 * @returns Move result with ok: true/false, data with pipeline_item_id and new_stage_id, or error
 */
export async function moveLeadToPipelineByName(
  leadId: string,
  targetPipelineName: string,
  notes?: string
): Promise<MoveResult> {
  // Find pipeline by name (only active)
  const { data: pipeline, error: pErr } = await supabase
    .from('pipelines')
    .select('id')
    .eq('name', targetPipelineName)
    .eq('is_active', true)
    .single()

  if (pErr || !pipeline?.id) {
    return { ok: false, code: 'TARGET_PIPELINE_NOT_ACTIVE', message: pErr?.message ?? 'Pipeline not found or inactive' }
  }

  return moveLeadToPipeline(leadId, pipeline.id, notes)
}


/** Labels for display in history on client data / details changes. */
export const LEAD_FIELD_LABELS: Record<string, string> = {
  full_name: 'Name',
  phone_number: 'Phone',
  email: 'Email',
  company_name: 'Company',
  company_address: 'Company address',
  address: 'Address',
  strada: 'Street',
  city: 'City',
  zip: 'Postal code',
  judet: 'County',
  contact_person: 'Contact person',
  contact_phone: 'Contact phone',
  billing_nume_prenume: 'Billing: First and last name',
  billing_nume_companie: 'Billing: Company',
  billing_cui: 'Billing: CUI',
  billing_strada: 'Billing: Street',
  billing_oras: 'Billing: City',
  billing_judet: 'Billing: County',
  billing_cod_postal: 'Billing: Postal code',
  details: 'Details communicated by client',
  tray_details: 'Tray details',
  callback_date: 'Callback date',
  nu_raspunde_callback_at: 'No response (callback at)',
  nu_raspunde: 'No response',
  no_deal: 'No Deal',
  campaign_name: 'Campaign',
  ad_name: 'Ad',
  form_name: 'Form',
}

/**
 * Updates an existing lead in the database.
 * Allows modifying any lead fields: name, email, phone, details about
 * campaign, ad, form, etc. The function is used for editing customer information.
 *
 * @param leadId - The ID of the lead to update
 * @param updates - Object with the fields to update (any fields from the leads table)
 * @returns Object with:
 *   - data: The updated lead or null if an error occurs
 *   - error: null if successful, or the error if a problem occurs
 */
export async function updateLead(leadId: string, updates: any) {
  try {
    const { data, error } = await supabase
      .from('leads')
      .update(updates)
      .eq('id', leadId)
      .select()
      .single()

    if (error) throw error
    return { data, error: null }
  } catch (error) {
    return { data: null, error }
  }
}

/**
 * Claims a lead – sets claimed_by to current userId.
 * If force=false and the lead is already claimed by someone else, returns an error.
 */
export async function claimLead(
  leadId: string,
  userId: string,
  force = false
): Promise<{ data: any; error: any }> {
  try {
    if (!force) {
      const { data: existing } = await supabase
        .from('leads')
        .select('claimed_by')
        .eq('id', leadId)
        .single()
      if (existing?.claimed_by && existing.claimed_by !== userId) {
        return { data: null, error: { message: 'Lead is already claimed by someone else.' } }
      }
    }
    const { data, error } = await supabase
      .from('leads')
      .update({ claimed_by: userId })
      .eq('id', leadId)
      .select()
      .single()
    if (error) throw error
    return { data, error: null }
  } catch (error) {
    return { data: null, error }
  }
}

/**
 * Releases a lead – sets claimed_by to null.
 */
export async function unclaimLead(leadId: string): Promise<{ data: any; error: any }> {
  try {
    const { data, error } = await supabase
      .from('leads')
      .update({ claimed_by: null })
      .eq('id', leadId)
      .select()
      .single()
    if (error) throw error
    return { data, error: null }
  } catch (error) {
    return { data: null, error }
  }
}

export type UpdateLeadWithHistoryActor = {
  currentUserId?: string
  currentUserName?: string | null
  currentUserEmail?: string | null
}

/**
 * Updates the lead and logs each modified field in items_events with
 * the previous and current version (for audit / admin history).
 * Use this function instead of updateLead when you want to maintain a change history.
 */
export async function updateLeadWithHistory(
  leadId: string,
  updates: Record<string, any>,
  actorOption?: UpdateLeadWithHistoryActor
): Promise<{ data: any; error: any }> {
  const keys = Object.keys(updates).filter(k => k !== 'updated_at')
  if (keys.length === 0) {
    return updateLead(leadId, updates)
  }

  try {
    const { data: current, error: fetchErr } = await supabase
      .from('leads')
      .select(keys.join(','))
      .eq('id', leadId)
      .single()

    if (fetchErr || !current) {
      const result = await updateLead(leadId, updates)
      return result
    }

    const changes: Array<{ field: string; field_label: string; previous_value: any; new_value: any }> = []
    for (const field of keys) {
      const prev = (current as any)[field]
      const next = updates[field]
      const prevStr = prev == null ? '' : String(prev)
      const nextStr = next == null ? '' : String(next)
      if (prevStr.trim() !== nextStr.trim()) {
        changes.push({
          field,
          field_label: LEAD_FIELD_LABELS[field] || field,
          previous_value: prev,
          new_value: next,
        })
      }
    }

    const { data, error } = await updateLead(leadId, updates)
    if (error) return { data: null, error }

    if (changes.length > 0) {
      const fmt = (v: any) => (v != null && v !== '' ? String(v).trim() : '—')
      const oneLine = (c: (typeof changes)[0]) => `${c.field_label}: ${fmt(c.previous_value)} --> ${fmt(c.new_value)}`
      const message =
        changes.length === 1
          ? oneLine(changes[0])
          : `${oneLine(changes[0])} and ${changes.length - 1} other fields`
      await logItemEvent(
        'lead',
        leadId,
        message,
        'lead_field_updated',
        { changes },
        undefined,
        actorOption
      ).catch((err) => console.error('[updateLeadWithHistory] logItemEvent:', err))
    }

    return { data, error: null }
  } catch (err) {
    return { data: null, error: err }
  }
}

/**
 * Deletes a lead from the database and all associated data.
 * WARNING: Deleting a lead is irreversible and will delete all associated data:
 * service files, trays, items, events, tags, etc.
 * Use with caution, as the operation is permanent.
 *
 * Deletion order:
 * 1. Delete all service files (which will automatically delete trays and tray_items via cascade)
 * 2. Delete pipeline_items for lead and service_files
 * 3. Delete lead_tags
 * 4. Delete stage_history
 * 5. Delete the lead
 *
 * @param leadId - The ID of the lead to delete
 * @returns Object with:
 *   - success: true if deletion succeeds, false otherwise
 *   - error: null if successful, or the error if a problem occurs
 */
export async function deleteLead(leadId: string) {
  try {
    // 1. Get all service files for this lead
    const { data: serviceFiles, error: sfError } = await supabase
      .from('service_files')
      .select('id')
      .eq('lead_id', leadId)

    if (sfError) throw sfError

    // 2. Delete all service files (cascade will automatically delete trays and tray_items)
    if (serviceFiles && serviceFiles.length > 0) {
      const serviceFileIds = serviceFiles.map(sf => sf.id)
      
      // Delete pipeline_items for service_files
      const { error: piError } = await supabase
        .from('pipeline_items')
        .delete()
        .in('item_id', serviceFileIds)
        .eq('type', 'service_file')

      if (piError) throw piError

      // Delete service files (cascade will delete trays and tray_items)
      const { error: deleteSfError } = await supabase
        .from('service_files')
        .delete()
        .eq('lead_id', leadId)

      if (deleteSfError) throw deleteSfError
    }

    // 3. Delete pipeline_items for lead
    const { error: leadPiError } = await supabase
      .from('pipeline_items')
      .delete()
      .eq('item_id', leadId)
      .eq('type', 'lead')

    if (leadPiError) throw leadPiError

    // 4. Delete lead_tags
    const { error: tagsError } = await supabase
      .from('lead_tags')
      .delete()
      .eq('lead_id', leadId)

    if (tagsError) throw tagsError

    // 5. Delete stage_history
    const { error: historyError } = await supabase
      .from('stage_history')
      .delete()
      .eq('lead_id', leadId)

    if (historyError) throw historyError

    // 6. Delete the lead
    const { error } = await supabase
      .from('leads')
      .delete()
      .eq('id', leadId)

    if (error) throw error
    return { success: true, error: null }
  } catch (error) {
    return { success: false, error }
  }
}

/**
 * Searches leads by a search term.
 * The function searches in three main fields: full name, email, and phone number.
 * The search is case-insensitive and uses pattern matching (ilike) to find
 * partial matches. Results include all leads that contain the search term
 * in any of the three fields.
 *
 * @param searchTerm - The search term (searched in name, email, phone)
 * @returns Object with:
 *   - data: Array of found leads or null if an error occurs
 *   - error: null if successful, or the error if a problem occurs
 */
export async function searchLeads(searchTerm: string) {
  try {
    const { data, error } = await supabase
      .from('leads')
      .select('*')
      .or(`full_name.ilike.%${searchTerm}%,email.ilike.%${searchTerm}%,phone_number.ilike.%${searchTerm}%`)

    if (error) throw error
    return { data, error: null }
  } catch (error) {
    return { data: null, error }
  }
}

/**
 * Updates a pipeline and reorders its stages.
 * This function allows modifying the name of a pipeline and reordering stages
 * in a single atomic operation. Uses a Supabase RPC function to ensure
 * data consistency. Stages are reordered according to the order in the provided array.
 *
 * @param pipelineId - The ID of the pipeline to update
 * @param pipelineName - The new name of the pipeline (or null to keep the current name)
 * @param stages - Array with stages in the final desired order (each with id and name)
 * @returns Object with error: null if successful, or the error if a problem occurs
 */
export async function updatePipelineAndStages(
  pipelineId: string,
  pipelineName: string,                     // pass current/new name
  stages: { id: string; name: string }[]    // final order
) {
  const payload = stages.map((s, i) => ({ id: s.id, position: i, name: s.name.trim() }))
  const { error } = await supabase.rpc('update_pipeline_and_reorder_stages', {
    p_pipeline_id: pipelineId,
    p_pipeline_name: pipelineName?.trim() ?? null, // send null if you want to skip renaming
    p_items: payload
})
  return { error }
}

// ==================== HELPER FUNCTIONS FOR DETAILED TRACKING ====================

/**
 * Gets complete details about a tray, including current pipeline and stage.
 *
 * @param trayId - The tray ID
 * @returns Complete tray details or null if it doesn't exist
 */
export async function getTrayDetails(trayId: string): Promise<{
  id: string
  number: string
  status: string
  service_file_id: string | null
  pipeline: { id: string; name: string } | null
  stage: { id: string; name: string } | null
} | null> {
  if (!trayId || typeof trayId !== 'string' || trayId.trim() === '') {
    return null
  }
  
  try {
    const supabase = supabaseBrowser()
    
    // Get tray details and pipeline/stage in parallel
    const [trayResult, pipelineItemResult] = await Promise.all([
      supabase
        .from('trays')
        .select('id, number, status, service_file_id')
        .eq('id', trayId)
        .single(),
      supabase
        .from('pipeline_items')
        .select(`
          pipeline_id,
          stage_id,
          pipeline:pipelines!inner(id, name),
          stage:stages!inner(id, name)
        `)
        .eq('type', 'tray')
        .eq('item_id', trayId)
        .maybeSingle()
    ])
    
    if (trayResult.error || !trayResult.data) {
      if (trayResult.error?.code !== 'PGRST116') { // PGRST116 = not found
        console.error('[getTrayDetails] Error fetching tray:', trayResult.error)
      }
      return null
    }
    
    const tray = trayResult.data
    const pipelineItem = pipelineItemResult.data
    
    return {
      id: tray.id,
      number: tray.number || 'unsigned',
      status: tray.status || '',
      service_file_id: tray.service_file_id,
      pipeline: pipelineItem?.pipeline ? {
        id: (pipelineItem.pipeline as any).id,
        name: (pipelineItem.pipeline as any).name,
      } : null,
      stage: pipelineItem?.stage ? {
        id: (pipelineItem.stage as any).id,
        name: (pipelineItem.stage as any).name,
      } : null,
    }
  } catch (error) {
    console.error('[getTrayDetails] Unexpected error:', error)
    return null
  }
}

/**
 * Gets complete details about a technician (user).
 *
 * NOTE: The email can only be obtained for the current user due to RLS limitations.
 * For other users, the email will be null.
 */
/** Options to avoid Auth call when caller already provides the current user (e.g., from useAuth()). */
export type CurrentUserOption = { id: string; email?: string | null }

export async function getTechnicianDetails(
  technicianId: string | null,
  options?: { currentUser?: CurrentUserOption }
): Promise<{
  id: string
  name: string
  email: string | null
} | null> {
  if (!technicianId) return null
  
  try {
    const supabase = supabaseBrowser()
    let email: string | null = null

    // Phase 3: if caller provided current user and it's the same as technicianId, don't call Auth
    if (options?.currentUser?.id === technicianId) {
      email = options.currentUser.email ?? null
    } else {
      const { data: { user: currentUser } } = await supabase.auth.getUser()
      if (currentUser?.id === technicianId) {
        email = currentUser.email || null
      }
    }
    
    // Try to get from app_members
    const { data: member, error: memberError } = await supabase
      .from('app_members')
      .select('user_id, name')
      .eq('user_id', technicianId)
      .maybeSingle()
    
    // If not found in app_members, use email or ID
    let name: string
    if (member) {
      name = (member as any).name || (member as any).Name || email || `Technician ${technicianId.slice(0, 8)}`
    } else if (email) {
      name = email.split('@')[0] // Use part before @ as name
    } else {
      name = `Technician ${technicianId.slice(0, 8)}`
    }
    
    return {
      id: technicianId,
      name,
      email,
    }
  } catch (error) {
    console.error('[getTechnicianDetails] Error:', error)
    return {
      id: technicianId,
      name: `Technician ${technicianId.slice(0, 8)}`,
      email: null,
    }
  }
}

/**
 * Gets complete details about a user (actor).
 *
 * NOTE: The email can only be obtained for the current user due to RLS limitations.
 * For other users, the email will be null.
 */
export async function getUserDetails(
  userId: string | null,
  options?: { currentUser?: CurrentUserOption }
): Promise<{
  id: string
  name: string
  email: string | null
} | null> {
  if (!userId) return null
  
  try {
    const supabase = supabaseBrowser()
    let email: string | null = null

    // Phase 3: if caller provided current user and it's the same as userId, don't call Auth
    if (options?.currentUser?.id === userId) {
      email = options.currentUser.email ?? null
    } else {
      // getSession avoids auth server call (session.user is enough for email)
      const { data: { session } } = await supabase.auth.getSession()
      const currentUser = session?.user
      email = currentUser?.id === userId ? currentUser.email || null : null
    }
    
    // Try to get from app_members
    const { data: member, error: memberError } = await supabase
      .from('app_members')
      .select('user_id, name')
      .eq('user_id', userId)
      .maybeSingle()
    
    // If not found in app_members, use email or ID
    let name: string
    if (member) {
      name = (member as any).name || (member as any).Name || email || `User ${userId.slice(0, 8)}`
    } else if (email) {
      name = email.split('@')[0] // Use part before @ as name
    } else {
      name = `User ${userId.slice(0, 8)}`
    }
    
    return {
      id: userId,
      name,
      email,
    }
  } catch (error) {
    console.error('[getUserDetails] Error:', error)
    return {
      id: userId,
      name: `User ${userId.slice(0, 8)}`,
      email: null,
    }
  }
}

/**
 * Gets details about pipeline and stage.
 */
export async function getPipelineStageDetails(
  pipelineId: string | null,
  stageId: string | null
): Promise<{
  pipeline: { id: string; name: string } | null
  stage: { id: string; name: string } | null
}> {
  if (!pipelineId || !stageId) {
    return { pipeline: null, stage: null }
  }
  
  try {
    const supabase = supabaseBrowser()
    
    const [pipelineResult, stageResult] = await Promise.all([
      supabase
        .from('pipelines')
        .select('id, name')
        .eq('id', pipelineId)
        .maybeSingle(),
      supabase
        .from('stages')
        .select('id, name')
        .eq('id', stageId)
        .maybeSingle(),
    ])
    
    return {
      pipeline: pipelineResult.data ? {
        id: pipelineResult.data.id,
        name: pipelineResult.data.name,
      } : null,
      stage: stageResult.data ? {
        id: stageResult.data.id,
        name: stageResult.data.name,
      } : null,
    }
  } catch (error) {
    console.error('[getPipelineStageDetails] Error:', error)
    return { pipeline: null, stage: null }
  }
}

/**
 * Gets current pipeline and stage for a tray.
 *
 * @param trayId - The tray ID
 * @returns Current pipeline and stage or null if the tray is not in any pipeline
 */
export async function getTrayPipelineStage(trayId: string): Promise<{
  pipeline: { id: string; name: string } | null
  stage: { id: string; name: string } | null
}> {
  if (!trayId || typeof trayId !== 'string' || trayId.trim() === '') {
    return { pipeline: null, stage: null }
  }
  
  try {
    const supabase = supabaseBrowser()
    
    const { data: pipelineItem, error } = await supabase
      .from('pipeline_items')
      .select(`
        pipeline_id,
        stage_id,
        pipeline:pipelines!inner(id, name),
        stage:stages!inner(id, name)
      `)
      .eq('type', 'tray')
      .eq('item_id', trayId)
      .maybeSingle()
    
    if (error) {
      if (error.code !== 'PGRST116') { // PGRST116 = not found
        console.error('[getTrayPipelineStage] Error:', error)
      }
      return { pipeline: null, stage: null }
    }
    
    if (!pipelineItem) return { pipeline: null, stage: null }
    
    return {
      pipeline: pipelineItem.pipeline ? {
        id: (pipelineItem.pipeline as any).id,
        name: (pipelineItem.pipeline as any).name,
      } : null,
      stage: pipelineItem.stage ? {
        id: (pipelineItem.stage as any).id,
        name: (pipelineItem.stage as any).name,
      } : null,
    }
  } catch (error) {
    console.error('[getTrayPipelineStage] Unexpected error:', error)
    return { pipeline: null, stage: null }
  }
}

// ==================== LOGGING FUNCTIONS ====================

/**
 * Logs an event for an item (lead, service_file, or tray).
 * This function creates a record in the items_events table to track the history
 * of actions and changes on an item. Events can be messages, stage moves,
 * updates, etc. The function automatically identifies the current user and tries to get
 * their name from app_members or user_metadata.
 *
 * @param itemType - The type of item: 'lead', 'service_file', or 'tray'
 * @param itemId - The ID of the item to log the event for
 * @param message - The event message (description of the action)
 * @param eventType - The event type (e.g., 'message', 'stage_change', 'update') - default 'message'
 * @param payload - Optional JSON object with additional event data
 * @param details - Optional details to automatically extend the payload (tray, technician, pipeline, stage, user)
 * @param actorOption - Phase 3: when caller provides the current user (e.g., from useAuth()), we avoid getUser()
 * @returns The created event data (id, type, item_id, event_type, message, actor_name, created_at)
 * @throws Error if event creation fails
 */
export async function logItemEvent(
  itemType: 'lead' | 'service_file' | 'tray',
  itemId: string,
  message: string,
  eventType: string = 'message',
  payload: Record<string, any> = {},
  details?: {
    tray?: { id: string; number: string; status?: string; service_file_id?: string | null }
    technician?: { id: string; name: string; email?: string | null }
    previous_technician?: { id: string | null; name: string | null; email?: string | null }
    pipeline?: { id: string; name: string }
    stage?: { id: string; name: string }
    user?: { id: string; name: string; email: string | null }
  },
  actorOption?: { currentUserId?: string; currentUserName?: string | null; currentUserEmail?: string | null }
) {
  const supabase = supabaseBrowser()
  let actorId: string | null = null
  let actorName: string | null = null
  let actorEmail: string | null = null

  // Phase 3: if caller provided current user, don't call Auth
  if (actorOption?.currentUserId) {
    actorId = actorOption.currentUserId
    actorName = actorOption.currentUserName ?? null
    actorEmail = actorOption.currentUserEmail ?? null
  } else {
    const { data: { user } } = await supabase.auth.getUser()
    actorId = user?.id ?? null
    if (user?.id) {
      const { data: memberData } = await supabase
        .from('app_members')
        .select('*')
        .eq('user_id', user.id)
        .single()
      if (memberData && (memberData as any).name) {
        actorName = (memberData as any).name
      } else {
        actorName =
          (user?.user_metadata as any)?.name ||
          (user?.user_metadata as any)?.full_name ||
          user?.email ||
          null
      }
      actorEmail = user?.email || null
    }
  }

  // Extend payload with information from details
  const extendedPayload = {
    ...payload,
    // Add tray details if provided
    ...(details?.tray && {
      tray: {
        id: details.tray.id,
        number: details.tray.number,
        status: details.tray.status || null,
        service_file_id: details.tray.service_file_id || null,
      },
    }),
    // Add technician details if provided
    ...(details?.technician && {
      technician: {
        id: details.technician.id,
        name: details.technician.name,
        email: details.technician.email || null,
      },
    }),
    // Add previous technician details if provided
    ...(details?.previous_technician && {
      previous_technician: {
        id: details.previous_technician.id,
        name: details.previous_technician.name,
        email: details.previous_technician.email || null,
      },
    }),
    // Add pipeline details if provided
    ...(details?.pipeline && {
      pipeline: {
        id: details.pipeline.id,
        name: details.pipeline.name,
      },
    }),
    // Add stage details if provided
    ...(details?.stage && {
      stage: {
        id: details.stage.id,
        name: details.stage.name,
      },
    }),
    // Add user details if provided (or use current user)
    ...(details?.user ? {
      user: {
        id: details.user.id,
        name: details.user.name,
        email: details.user.email || null,
      },
    } : (actorId ? {
      user: {
        id: actorId,
        name: actorName || 'unknown user',
        email: actorEmail || null,
      },
    } : {})),
  }

  const { data, error } = await supabase
    .from("items_events")
    .insert([{
      type: itemType,
      item_id: itemId,
      event_type: eventType,
      message,
      payload: extendedPayload,
      actor_id: actorId,
      actor_name: actorName,
    }] as any)
    .select("id, type, item_id, event_type, message, actor_name, created_at")
    .single()

  if (error) throw error
  return data
}

/**
 * Logs an event for a lead (wrapper over logItemEvent).
 * This function is a convenient wrapper that calls logItemEvent with itemType='lead'.
 * It is used to simplify logging lead-specific events.
 *
 * @param leadId - The ID of the lead to log the event for
 * @param message - The event message (description of the action)
 * @param eventType - The event type (e.g., 'message', 'stage_change', 'update') - default 'message'
 * @param payload - Optional JSON object with additional event data
 * @returns The created event data (id, type, item_id, event_type, message, actor_name, created_at)
 * @throws Error if event creation fails
 */
export async function logLeadEvent(
  leadId: string,
  message: string,
  eventType: string = 'message',
  payload: Record<string, any> = {}
) {
  return await logItemEvent('lead', leadId, message, eventType, payload)
}

/**
 * Registers in the lead history that a button was activated by the current user.
 * Used for tracking: button X activated by user Y at date/time Z (actor_name, created_at from items_events).
 *
 * @param params.leadId - Lead ID (priority)
 * @param params.serviceFileId - If leadId is missing, resolve lead_id from service_files
 * @param params.buttonId - data-button-id (e.g., vanzariCardDeliveryButton)
 * @param params.buttonLabel - Label for message (e.g., "Livrare")
 * @param params.actorOption - Current user (avoids getUser if already available)
 */
export async function logButtonEvent(params: {
  leadId?: string | null
  serviceFileId?: string | null
  buttonId: string
  buttonLabel?: string
  actorOption?: { currentUserId?: string; currentUserName?: string | null; currentUserEmail?: string | null }
}): Promise<void> {
  const { leadId, serviceFileId, buttonId, buttonLabel, actorOption } = params
  let resolvedLeadId = leadId
  if (!resolvedLeadId && serviceFileId) {
    const { data: sf } = await supabase
      .from('service_files')
      .select('lead_id')
      .eq('id', serviceFileId)
      .maybeSingle()
    resolvedLeadId = (sf as any)?.lead_id ?? null
  }
  if (!resolvedLeadId) return
  const label = buttonLabel ?? buttonId
  const message = `Button "${label}" activated`
  await logItemEvent(
    'lead',
    resolvedLeadId,
    message,
    'button_clicked',
    { button_id: buttonId, button_label: label },
    undefined,
    actorOption
  ).catch((err) => console.warn('[logButtonEvent]', err))
}

/**
 * Logs changes to order details (tray items): update qty/service/discount/urgent,
 * add service/part, delete item. Used on mobile (LeadDetailsSheet), desktop (Preturi) and
 * technician page. Events appear in history regardless of device.
 *
 * @param trayId - Tray ID
 * @param message - Message for history
 * @param eventType - 'tray_item_updated' | 'tray_item_added' | 'tray_item_deleted'
 * @param payload - item_id, item_name, field, old_value, new_value, etc.
 * @param serviceFileId - Optional; if exists, also logs to service_file.
 */
export async function logTrayItemChange(params: {
  trayId: string
  message: string
  eventType: 'tray_item_updated' | 'tray_item_added' | 'tray_item_deleted'
  payload: Record<string, any>
  serviceFileId?: string | null
  /** Optional: tray number for display in history after archiving (if missing, loads from getTrayDetails) */
  trayNumber?: string | null
}) {
  const { trayId, message, eventType, payload, serviceFileId, trayNumber } = params
  try {
    let tray_number = trayNumber ?? null
    if (tray_number == null && trayId) {
      const details = await getTrayDetails(trayId)
      if (details) tray_number = details.number || null
    }
    const payloadWithTray = { ...payload, tray_id: trayId, tray_number }
    await logItemEvent('tray', trayId, message, eventType, payloadWithTray)
    if (serviceFileId) {
      await logItemEvent('service_file', serviceFileId, message, eventType, {
        ...payloadWithTray,
        service_file_id: serviceFileId,
      })
    }
  } catch (e) {
    console.warn('[logTrayItemChange]', e)
  }
}

/**
 * Logs in history the addition of an image to a tray (who, when, what file).
 */
export async function logTrayImageAdded(params: {
  trayId: string
  filename: string
  imageId?: string | null
  serviceFileId?: string | null
}) {
  const { trayId, filename, imageId, serviceFileId } = params
  try {
    const message = `Image added: ${filename}`
    const payload: Record<string, any> = { tray_id: trayId, filename }
    if (imageId) payload.image_id = imageId
    await logItemEvent('tray', trayId, message, 'tray_image_added', payload)
    if (serviceFileId) {
      await logItemEvent('service_file', serviceFileId, message, 'tray_image_added', {
        ...payload,
        service_file_id: serviceFileId,
      })
    }
  } catch (e) {
    console.warn('[logTrayImageAdded]', e)
  }
}

/**
 * Logs in history the deletion of an image from a tray (who, when, what file).
 */
export async function logTrayImageDeleted(params: {
  trayId: string
  filename: string
  serviceFileId?: string | null
}) {
  const { trayId, filename, serviceFileId } = params
  try {
    const message = `Image deleted: ${filename}`
    const payload = { tray_id: trayId, filename }
    await logItemEvent('tray', trayId, message, 'tray_image_deleted', payload)
    if (serviceFileId) {
      await logItemEvent('service_file', serviceFileId, message, 'tray_image_deleted', {
        ...payload,
        service_file_id: serviceFileId,
      })
    }
  } catch (e) {
    console.warn('[logTrayImageDeleted]', e)
  }
}