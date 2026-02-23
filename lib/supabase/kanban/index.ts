/**
 * Kanban Module - Main Entry Point
 * 
 * This is the refactored, modular version of the kanban data loading system.
 * The original 1800+ line getKanbanItems function has been split into:
 * 
 * - types.ts: Type definitions
 * - constants.ts: Configuration and pipeline matching
 * - cache.ts: Caching utilities
 * - fetchers.ts: Pure data fetching functions
 * - transformers.ts: Data transformation logic
 * - strategies/: Pipeline-specific loading strategies
 *   - base.ts: Base strategy interface
 *   - standard.ts: Standard pipelines (Vanzari)
 *   - department.ts: Department pipelines (Saloane, Horeca, Frizerii, Reparatii)
 *   - receptie.ts: Receptie pipeline with virtual items
 * 
 * Usage:
 *   import { getKanbanItems, getSingleKanbanItem } from '@/lib/supabase/kanban'
 */

import type { KanbanItem, KanbanResult, PipelineItemType } from './types'
import { getCachedPipelinesAndStages, loadTechnicianCache } from './cache'
import { buildContext, getStrategyForContext } from './strategies'
import { fetchSinglePipelineItem, fetchLeadsByIds, fetchServiceFilesByIds, fetchTraysByIds, fetchTagsForLeads, fetchTrayItems } from './fetchers'
import { transformLeadToKanbanItem, transformServiceFileToKanbanItem, transformTrayToKanbanItem, extractTechnicianMap } from './transformers'

// Re-export types
export type { 
  KanbanItem, 
  PipelineItemType, 
  MoveItemResult, 
  PipelineItem,
  KanbanResult,
  KanbanTag,
  KanbanContext,
  PipelineInfo
} from './types'

/**
 * Get all Kanban items for a pipeline
 * 
 * This is the main entry point, replacing the original 1800+ line function.
 * It uses the strategy pattern to delegate to pipeline-specific loaders.
 * 
 * @param pipelineId - The pipeline ID to load items for
 * @param currentUserId - Optional current user ID (for filtering in department pipelines)
 * @param isAdminOrOwner - Whether the current user is admin/owner (bypasses filtering)
 */
export async function getKanbanItems(
  pipelineId?: string,
  currentUserId?: string,
  isAdminOrOwner: boolean = false
): Promise<KanbanResult> {
  try {
    if (!pipelineId) {
      return { data: [], error: null }
    }
    
    // Load cached pipelines and stages
    const { pipelines, stages } = await getCachedPipelinesAndStages()
    
    // Find the current pipeline
    const currentPipeline = pipelines.find(p => p.id === pipelineId)
    if (!currentPipeline) {
      return { data: [], error: null }
    }
    
    // Build context
    const context = buildContext(
      pipelineId,
      currentPipeline.name,
      pipelines,
      stages,
      currentUserId,
      isAdminOrOwner
    )
    
    // Get the appropriate strategy
    const strategy = getStrategyForContext(context)
    
    // Load items using the strategy
    const items = await strategy.loadItems(context)
    
    return { data: items, error: null }
    
  } catch (error) {
    return { data: [], error }
  }
}

/**
 * Get a single Kanban item (for real-time updates)
 */
export async function getSingleKanbanItem(
  type: PipelineItemType,
  itemId: string,
  pipelineId: string
): Promise<{ data: KanbanItem | null; error: any }> {
  try {
    // Fetch the pipeline item (folosim maybeSingle în fetchers ca să nu primim 406 la 0 rânduri)
    const { data: pipelineItem, error: itemError } = await fetchSinglePipelineItem(
      type,
      itemId,
      pipelineId
    )
    // 406 / PGRST116 = "single row requested, 0 or multiple returned" – tratăm ca "not found", fără eroare
    const is406 = itemError && ((itemError as any)?.code === 'PGRST116' || (itemError as any)?.status === 406)
    if (itemError || !pipelineItem) {
      return { data: null, error: is406 ? null : itemError }
    }
    
    // Load technician cache if needed
    await loadTechnicianCache()
    
    let kanbanItem: KanbanItem | null = null
    
    if (type === 'lead') {
      const { data: leads } = await fetchLeadsByIds([itemId])
      if (leads.length === 0) {
        return { data: null, error: new Error('Lead not found') }
      }
      
      const lead = leads[0]
      const { data: tagMap } = await fetchTagsForLeads([itemId])
      const tags = tagMap.get(itemId) || []
      
      kanbanItem = transformLeadToKanbanItem(lead, pipelineItem, tags, 0)
      
    } else if (type === 'service_file') {
      const { data: serviceFiles } = await fetchServiceFilesByIds([itemId])
      if (serviceFiles.length === 0 || !serviceFiles[0].lead) {
        return { data: null, error: new Error('Service file not found') }
      }
      
      const serviceFile = serviceFiles[0]
      const { data: tagMap } = await fetchTagsForLeads([serviceFile.lead!.id])
      const leadTags = tagMap.get(serviceFile.lead!.id) || []
      
      // IMPORTANT: Pentru fișele de serviciu, tag-ul "urgent" vine din câmpul urgent al fișei, nu din tag-urile lead-ului
      // Filtrează tag-ul "urgent" din tag-urile lead-ului și adaugă-l doar dacă fișa are urgent = true
      const tagsWithoutUrgent = leadTags.filter(tag => tag.name.toLowerCase() !== 'urgent')
      const serviceFileTags = [...tagsWithoutUrgent]
      
      // Adaugă tag-ul "urgent" doar dacă fișa de serviciu are urgent = true
      if (serviceFile.urgent === true) {
        // Caută tag-ul "urgent" în lista de tag-uri existente sau creează unul nou
        const urgentTag = leadTags.find(tag => tag.name.toLowerCase() === 'urgent')
        if (urgentTag) {
          serviceFileTags.push(urgentTag)
        } else {
          // Creează un tag "urgent" temporar pentru afișare
          serviceFileTags.push({
            id: `urgent_${serviceFile.id}`,
            name: 'URGENT',
            color: 'red' as const
          })
        }
      }
      
      kanbanItem = transformServiceFileToKanbanItem(serviceFile, pipelineItem, serviceFileTags, 0)
      
    } else if (type === 'tray') {
      const { data: trays } = await fetchTraysByIds([itemId])
      if (trays.length === 0 || !trays[0].service_file?.lead) {
        return { data: null, error: new Error('Tray not found') }
      }
      
      const tray = trays[0]
      const leadId = tray.service_file!.lead!.id
      
      const [{ data: tagMap }, { data: trayItems }] = await Promise.all([
        fetchTagsForLeads([leadId]),
        fetchTrayItems([itemId])
      ])
      
      const leadTagsRaw = tagMap.get(leadId) || []
      const leadTags = Array.isArray(leadTagsRaw) ? leadTagsRaw : []
      
      // IMPORTANT: Pentru tăvițe, tag-ul "urgent" vine din câmpul urgent al fișei de serviciu, nu din tag-urile lead-ului
      // Filtrează tag-ul "urgent" din tag-urile lead-ului și adaugă-l doar dacă fișa are urgent = true
      const tagsWithoutUrgent = leadTags.filter(tag => tag?.name?.toLowerCase() !== 'urgent')
      const trayTags = [...tagsWithoutUrgent]
      
      // Adaugă tag-ul "urgent" doar dacă fișa de serviciu are urgent = true
      if (tray.service_file?.urgent === true) {
        // Caută tag-ul "urgent" în lista de tag-uri existente sau creează unul nou
        const urgentTag = leadTags.find(tag => tag?.name?.toLowerCase() === 'urgent')
        if (urgentTag) {
          trayTags.push(urgentTag)
        } else {
          // Creează un tag "urgent" temporar pentru afișare
          trayTags.push({
            id: `urgent_${tray.id}`,
            name: 'URGENT',
            color: 'red' as const
          })
        }
      }
      
      const technicianMap = extractTechnicianMap(trayItems)
      const technician = technicianMap.get(itemId) || null
      
      kanbanItem = transformTrayToKanbanItem(tray, pipelineItem, trayTags, technician, 0)
    }
    
    return { data: kanbanItem, error: null }
    
  } catch (error) {
    return { data: null, error }
  }
}

/**
 * Get Kanban items filtered by type
 */
export async function getKanbanItemsByType(
  type: PipelineItemType,
  pipelineId?: string,
  currentUserId?: string
): Promise<KanbanResult> {
  const result = await getKanbanItems(pipelineId, currentUserId)
  
  if (result.error) {
    return result
  }
  
  const filtered = result.data.filter(item => item.type === type)
  return { data: filtered, error: null }
}
