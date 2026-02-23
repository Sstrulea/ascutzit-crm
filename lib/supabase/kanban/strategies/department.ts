/**
 * Department Pipeline Strategy
 * 
 * Handles department pipelines (Saloane, Horeca, Frizerii, Reparatii).
 * These pipelines display trays assigned to the department.
 * Special filtering applies for non-admin users (see only their assigned trays).
 */

import { supabaseBrowser } from '../../supabaseClient'
import type { PipelineStrategy } from './base'
import type { KanbanItem, KanbanContext, PipelineItemWithStage, RawTrayItem } from '../types'
import { 
  fetchPipelineItems, 
  fetchTraysByIds, 
  fetchTrayItems,
  fetchTagsForLeads,
  fetchServicePrices,
  fetchServiceTimes,
  fetchTrayItemsByDepartment,
  fetchSplitReceiversForTrays,
  createPipelineItems,
  fetchUserMessageCountByLeadIds
} from '../fetchers'
import { loadTechnicianCache, getStagesForPipeline } from '../cache'
import { 
  groupPipelineItemsByType, 
  getPipelineItem,
  transformTrayToKanbanItem,
  extractAllTechniciansMapFromTrays,
  calculateTrayTotals,
  calculateTrayEstimatedTimes
} from '../transformers'
import { findStageByPattern, matchesStagePattern } from '../constants'
import type { KanbanTag } from '../types'

export class DepartmentPipelineStrategy implements PipelineStrategy {
  
  canHandle(context: KanbanContext): boolean {
    return context.pipelineInfo.isDepartment
  }
  
  async loadItems(context: KanbanContext): Promise<KanbanItem[]> {
    // Load technician cache in parallel with initial data
    const [_, pipelineItemsResult] = await Promise.all([
      loadTechnicianCache(),
      fetchPipelineItems(context.pipelineId)
    ])
    
    if (pipelineItemsResult.error) {
      throw pipelineItemsResult.error
    }
    
    let pipelineItems = pipelineItemsResult.data
    let { trays, itemMap } = groupPipelineItemsByType(pipelineItems)
    
    // Auto-create pipeline_items for trays that belong to this department
    // but don't have a pipeline_item yet
    const autoCreatedItems = await this.autoCreateMissingTrayItems(
      context,
      pipelineItems,
      trays
    )
    
    if (autoCreatedItems.length > 0) {
      // Merge auto-created items
      autoCreatedItems.forEach(item => {
        const key = `tray:${item.item_id}`
        itemMap.set(key, item as PipelineItemWithStage)
        trays.push(item.item_id)
      })
    }
    
    if (trays.length === 0) {
      return []
    }
    
    // OPTIMIZARE: Filtrare la nivel DB înainte de a încărca tăvițele
    // Această abordare previne încărcarea datelor inutile și elimină riscul
    // de afișare a tăvițelor nepermise în caz de bug sau întârziere
    let filteredTrayIds = trays
    let trayItems: RawTrayItem[] = []
    
    // DEBUG: Log pentru diagnosticare
    console.log('[DepartmentPipelineStrategy] Context:', {
      currentUserId: context.currentUserId,
      isAdminOrOwner: context.isAdminOrOwner,
      pipelineId: context.pipelineId,
      pipelineName: context.pipelineInfo.name
    })
    
    // IMPORTANT: Verificare strictă - doar dacă avem currentUserId ȘI nu suntem admin/owner
    // Pentru admin/owner, trebuie să vedem TOATE tăvițele, indiferent de technician_id
    if (context.isAdminOrOwner) {
      // Pentru admin/owner, încarcă toate tray_items și toate tăvițele (comportament vechi)
      console.log('[DepartmentPipelineStrategy] Admin/Owner detectat - se încarcă toate tăvițele')
      console.log(`[DepartmentPipelineStrategy] Total trays în pipeline: ${trays.length}`)
      
      const { data: allItems, error: itemsError } = await fetchTrayItems(trays)
    
      if (itemsError) {
        throw itemsError
      }
      
      trayItems = allItems || []
      // Pentru admin, filteredTrayIds rămâne setat la toate trays (nu se filtrează)
      filteredTrayIds = trays
    } else if (context.currentUserId) {
      // Tăvițe vizibile: atribuite utilizatorului, neatribuite, SAU tăvițe split (toți membrii cu acces la pipeline le văd)
      console.log(`[DepartmentPipelineStrategy] Filtrare pentru utilizator: ${context.currentUserId}, isAdminOrOwner: ${context.isAdminOrOwner}`)
      console.log(`[DepartmentPipelineStrategy] Total trays în pipeline: ${trays.length}`)

      const { data: trayRows, error: trayErr } = await supabaseBrowser()
        .from('trays')
        .select('id, technician_id, status, parent_tray_id')
        .in('id', trays)

      if (trayErr) {
        console.error('[DepartmentPipelineStrategy] Eroare la citire trays:', trayErr)
        return []
      }

      const isSplitTray = (t: { status?: string | null; parent_tray_id?: string | null }) =>
        t?.status === 'Splited' || (t?.parent_tray_id != null && t.parent_tray_id !== '')
      const allowedTrayIds = (trayRows || []).filter(
        (t: any) =>
          t?.technician_id === context.currentUserId ||
          t?.technician_id == null ||
          isSplitTray(t)
      ).map((t: any) => t.id)

      const { data: filteredItems, error: itemsError } = await fetchTrayItems(allowedTrayIds)

      if (itemsError) {
        console.error('[DepartmentPipelineStrategy] Eroare la filtrare DB:', itemsError)
        return []
      }

      trayItems = filteredItems || []

      const assignedTrayIds = new Set<string>()
      trayItems.forEach(ti => {
        if (ti.tray_id) assignedTrayIds.add(ti.tray_id)
      })

      // EXCEPTIE: Exclude tăvițe în stage "Noua" care sunt atribuite tehnicianului (tray.technician_id)
      const trayStageMap = new Map<string, string>()
      pipelineItems.forEach(pi => {
        if (pi?.type === 'tray' && pi?.stage) {
          trayStageMap.set(pi.item_id, pi.stage.name?.toLowerCase() || '')
        }
      })
      const { data: traysAssignedToMe } = await supabaseBrowser()
        .from('trays')
        .select('id')
        .in('id', Array.from(assignedTrayIds))
        .eq('technician_id', context.currentUserId)
      const trayIdsAssignedToMe = new Set((traysAssignedToMe || []).map((t: any) => t.id))
      filteredTrayIds = Array.from(assignedTrayIds).filter(trayId => {
        const stageName = trayStageMap.get(trayId) || ''
        const isNouaStage = matchesStagePattern(stageName, 'NOUA')
        if (isNouaStage && trayIdsAssignedToMe.has(trayId)) {
          return false
        }
        return true
      })

      if (filteredTrayIds.length === 0) {
        return []
      }
    } else {
      // IMPORTANT: Dacă currentUserId lipsește pentru non-admin, returnăm array gol pentru siguranță
      // Aceasta poate fi o condiție normală în timpul încărcării inițiale (race condition cu useAuth)
      console.log('[DepartmentPipelineStrategy] currentUserId nu este disponibil încă pentru non-admin - se returnează array gol')
      return []
    }
    
    // Stage „Noua” și split receivers (pentru tehnicienii care primesc împărțirea – card în Noua cu etichetă „De la [nume]”)
    const pipelineStages = getStagesForPipeline(context.allStages, context.pipelineId)
    const nouaStage = findStageByPattern(pipelineStages, 'NOUA')
    let splitReceiversMap = new Map<string, Map<string, { senderName: string }>>()
    if (context.currentUserId && nouaStage) {
      const { data: splitMap } = await fetchSplitReceiversForTrays(filteredTrayIds)
      splitReceiversMap = splitMap || splitReceiversMap
    }

    // Fetch remaining data in parallel (doar pentru filtered trays)
    const [traysResult, servicePricesResult, serviceTimesResult] = await Promise.all([
      fetchTraysByIds(filteredTrayIds),
      this.getServicePrices(trayItems),
      this.getServiceTimes(trayItems)
    ])
    
    if (traysResult.error) {
      throw traysResult.error
    }
    
    // Get all lead IDs for tag fetching
    const leadIds = traysResult.data
      .map(t => t.service_file?.lead?.id)
      .filter(Boolean) as string[]
    
    const [tagResult, messageCountRes] = await Promise.all([
      fetchTagsForLeads(leadIds),
      fetchUserMessageCountByLeadIds(leadIds).catch(() => ({ data: new Map<string, number>(), error: null }))
    ])
    const { data: tagMap } = tagResult
    const userMessageCountByLeadId = messageCountRes.data ?? new Map<string, number>()
    
    // Calculate totals, estimated times and extract technicians
    const trayTotals = calculateTrayTotals(filteredTrayIds, trayItems, servicePricesResult)
    const trayEstimatedTimes = calculateTrayEstimatedTimes(filteredTrayIds, trayItems, serviceTimesResult)
    const allTechniciansMap = extractAllTechniciansMapFromTrays(traysResult.data)

    // Tăvițe în "Finalizată" validate în Quality Check → nu le afișăm în departament
    const finalizataTrayIds = traysResult.data
      .filter(t => {
        const pi = getPipelineItem(itemMap, 'tray', t.id)
        return matchesStagePattern(pi?.stage?.name ?? '', 'FINALIZARE')
      })
      .map(t => t.id)
    const qcValidatedTrayIds = await this.fetchQcValidatedTrayIds(finalizataTrayIds)

    // Transform to KanbanItems (UN SINGUR CARD per tăviță, cu toți tehnicienii)
    const kanbanItems: KanbanItem[] = []

    traysResult.data.forEach(tray => {
      const pipelineItem = getPipelineItem(itemMap, 'tray', tray.id)
      if (!pipelineItem || !tray.service_file?.lead) return

      const isFinalizata = matchesStagePattern(pipelineItem.stage?.name ?? '', 'FINALIZARE')
      if (isFinalizata && qcValidatedTrayIds.has(tray.id)) return
      
      const leadId = tray.service_file.lead.id
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
      
      // Extrage TOȚI tehnicienii unici din tray_items
      const allTechs = allTechniciansMap.get(tray.id) || []
      const technician = allTechs[0] || null
      const technician2 = allTechs[1] || null
      const technician3 = allTechs[2] || null
      
      const total = trayTotals.get(tray.id) || 0
      const estimatedTime = trayEstimatedTimes.get(tray.id) || 0
      const userMessageCount = userMessageCountByLeadId.get(leadId) ?? 0
      
      const kanbanItem = transformTrayToKanbanItem(
        tray,
        pipelineItem,
        trayTags,
        technician,
        total,
        false, // Not read-only in department pipelines
        estimatedTime,
        userMessageCount
      )
      
      // Adaugă tehnicianul 2 și 3
      kanbanItem.technician2 = technician2
      kanbanItem.technician3 = technician3
      kanbanItem.pipelineName = context.pipelineInfo.name

      // Pentru tehnicienii care au primit împărțirea: afișează cardul în „Noua” cu eticheta „De la [nume tehnician]”
      if (context.currentUserId && nouaStage) {
        const splitForTray = splitReceiversMap.get(tray.id)
        const splitToCurrent = splitForTray?.get(context.currentUserId)
        if (splitToCurrent) {
          kanbanItem.stageId = nouaStage.id
          kanbanItem.stage = nouaStage.name
          const deLaTag: KanbanTag = {
            id: `de_la_${tray.id}_${context.currentUserId}`,
            name: `De la ${splitToCurrent.senderName}`,
            color: 'blue',
          }
          kanbanItem.tags = [...(kanbanItem.tags || []), deLaTag]
        }
      }

      kanbanItems.push(kanbanItem)
    })
    
    return kanbanItems
  }
  
  /**
   * Auto-create pipeline_items for trays that belong to this department
   * but don't have a pipeline_item yet
   */
  private async autoCreateMissingTrayItems(
    context: KanbanContext,
    existingPipelineItems: PipelineItemWithStage[],
    existingTrayIds: string[]
  ): Promise<any[]> {
    // Find all trays that have tray_items with department_id = pipelineId
    const { data: deptTrayItems } = await fetchTrayItemsByDepartment(context.pipelineId)
    
    if (!deptTrayItems || deptTrayItems.length === 0) {
      return []
    }
    
    // Get unique tray IDs from department
    const deptTrayIds = [...new Set(deptTrayItems.map(ti => ti.tray_id).filter(Boolean))]
    
    // Find which ones don't have pipeline_items yet
    const existingSet = new Set(existingTrayIds)
    const missingTrayIds = deptTrayIds.filter(id => !existingSet.has(id))
    
    if (missingTrayIds.length === 0) {
      return []
    }
    
    // Find the "Noua" stage (or first stage) for this pipeline
    const pipelineStages = getStagesForPipeline(context.allStages, context.pipelineId)
    let defaultStage = findStageByPattern(pipelineStages, 'NOUA')
    if (!defaultStage && pipelineStages.length > 0) {
      defaultStage = pipelineStages[0]
    }
    
    if (!defaultStage) {
      return []
    }
    
    // Create pipeline_items for missing trays
    const itemsToCreate = missingTrayIds.map(trayId => ({
      type: 'tray',
      item_id: trayId,
      pipeline_id: context.pipelineId,
      stage_id: defaultStage!.id
    }))
    
    const { data: createdItems } = await createPipelineItems(itemsToCreate)
    
    return createdItems || []
  }
  
  /**
   * Get service prices for tray items
   */
  private async getServicePrices(
    trayItems: Array<{ service_id: string | null }>
  ): Promise<Map<string, number>> {
    const serviceIds = [...new Set(
      trayItems.map(ti => ti.service_id).filter(Boolean)
    )] as string[]
    
    if (serviceIds.length === 0) {
      return new Map()
    }
    
    const { data: prices } = await fetchServicePrices(serviceIds)
    return prices
  }
  
  /**
   * Get service times for tray items (pentru calculul timpului estimat)
   */
  private async getServiceTimes(
    trayItems: Array<{ service_id: string | null }>
  ): Promise<Map<string, number>> {
    const serviceIds = [...new Set(
      trayItems.map(ti => ti.service_id).filter(Boolean)
    )] as string[]

    if (serviceIds.length === 0) {
      return new Map()
    }

    const { data: times } = await fetchServiceTimes(serviceIds)
    return times
  }

  /**
   * Returnează Set de tray IDs care au fost validate în Quality Check (quality_validated).
   * Folosit pentru a exclude din "Finalizată" tăvițele care au trecut de QC.
   */
  private async fetchQcValidatedTrayIds(trayIds: string[]): Promise<Set<string>> {
    const out = new Set<string>()
    if (trayIds.length === 0) return out

    const supabase = supabaseBrowser()
    const qcEventTypes = ['quality_validated', 'quality_not_validated']
    const latestByTray = new Map<string, { created_at: string; event_type: string }>()
    const chunkSize = 500

    for (let i = 0; i < trayIds.length; i += chunkSize) {
      const chunk = trayIds.slice(i, i + chunkSize)
      const { data: rows, error } = await supabase
        .from('items_events')
        .select('item_id, event_type, created_at')
        .eq('type', 'tray')
        .in('item_id', chunk)
        .in('event_type', qcEventTypes as any)
        .order('created_at', { ascending: true })

      if (error) {
        console.warn('[DepartmentPipelineStrategy] fetchQcValidatedTrayIds:', error?.message || error)
        break
      }

      const arr = Array.isArray(rows) ? (rows as any[]) : []
      for (const r of arr) {
        const trayId = r?.item_id as string | undefined
        const ev = r?.event_type as string | undefined
        const createdAt = r?.created_at as string | undefined
        if (!trayId || !ev || !createdAt) continue
        latestByTray.set(trayId, { created_at: createdAt, event_type: ev })
      }
    }

    for (const trayId of trayIds) {
      const last = latestByTray.get(trayId)
      if (last && last.event_type === 'quality_validated') out.add(trayId)
    }
    return out
  }
}

