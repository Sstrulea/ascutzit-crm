/**
 * Curier Pipeline Strategy
 * 
 * Handles the Curier pipeline which displays service files.
 * Similar to Receptie, but for delivery pipeline.
 */

import { supabaseBrowser } from '../../supabaseClient'
import type { PipelineStrategy } from './base'
import type { KanbanItem, KanbanContext, PipelineItemWithStage, RawServiceFile } from '../types'
import { 
  fetchPipelineItems, 
  fetchServiceFilesByIds,
  fetchTagsForLeads,
  fetchTrayItems,
  fetchServicePrices,
  fetchTraysForServiceFiles
} from '../fetchers'
import { loadTechnicianCache } from '../cache'
import { 
  groupPipelineItemsByType, 
  getPipelineItem,
  transformServiceFileToKanbanItem,
  calculateTrayTotals
} from '../transformers'

export class CurierPipelineStrategy implements PipelineStrategy {
  
  canHandle(context: KanbanContext): boolean {
    return context.pipelineInfo.isCurier
  }
  
  async loadItems(context: KanbanContext): Promise<KanbanItem[]> {
    // Load technician cache in parallel with pipeline items
    const [_, pipelineItemsResult] = await Promise.all([
      loadTechnicianCache(),
      fetchPipelineItems(context.pipelineId)
    ])
    
    if (pipelineItemsResult.error) {
      throw pipelineItemsResult.error
    }
    
    const pipelineItems = pipelineItemsResult.data
    let { serviceFiles, itemMap } = groupPipelineItemsByType(pipelineItems)
    
    if (serviceFiles.length === 0) {
      return []
    }
    
    // Fetch service files
    const { data: fetchedServiceFiles, error: sfError } = await fetchServiceFilesByIds(serviceFiles)
    
    if (sfError) {
      throw sfError
    }
    
    // Get all lead IDs for tags
    const leadIds = fetchedServiceFiles
      .map(sf => sf.lead?.id)
      .filter(Boolean) as string[]
    
    // Fetch tags and calculate totals
    const [{ data: tagMap }, totalsData] = await Promise.all([
      fetchTagsForLeads(leadIds),
      this.calculateServiceFileTotals(serviceFiles)
    ])
    
    // Transform to KanbanItems
    const kanbanItems: KanbanItem[] = []
    
    fetchedServiceFiles.forEach(serviceFile => {
      const pipelineItem = getPipelineItem(itemMap, 'service_file', serviceFile.id)
      if (!pipelineItem || !serviceFile.lead) return
      
      const leadId = serviceFile.lead.id
      const leadTags = tagMap.get(leadId) || []
      
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
      
      const total = totalsData.get(serviceFile.id) || 0
      
      kanbanItems.push(transformServiceFileToKanbanItem(
        serviceFile,
        pipelineItem,
        serviceFileTags,
        total,
        false // Not read-only for Curier
      ))
    })
    
    return kanbanItems
  }
  
  /**
   * Calculate totals for service files
   */
  private async calculateServiceFileTotals(
    serviceFileIds: string[]
  ): Promise<Map<string, number>> {
    const totals = new Map<string, number>()
    
    if (serviceFileIds.length === 0) {
      return totals
    }
    
    // Get all trays for these service files
    const { data: trays } = await fetchTraysForServiceFiles(serviceFileIds)
    if (trays.length === 0) {
      return totals
    }
    
    const trayIds = trays.map(t => t.id)
    
    // Get tray items and prices
    const [{ data: trayItems }, servicePricesResult] = await Promise.all([
      fetchTrayItems(trayIds),
      this.getServicePrices(trayIds)
    ])
    
    // Calculate tray totals
    const trayTotals = calculateTrayTotals(trayIds, trayItems, servicePricesResult)
    
    // Aggregate to service file totals
    trays.forEach(t => {
      const trayTotal = trayTotals.get(t.id) || 0
      const currentTotal = totals.get(t.service_file_id) || 0
      totals.set(t.service_file_id, currentTotal + trayTotal)
    })
    
    return totals
  }
  
  /**
   * Get service prices for trays
   */
  private async getServicePrices(trayIds: string[]): Promise<Map<string, number>> {
    const { data: trayItems } = await fetchTrayItems(trayIds)
    
    const serviceIds = [...new Set(
      trayItems.map(ti => ti.service_id).filter(Boolean)
    )] as string[]
    
    if (serviceIds.length === 0) {
      return new Map()
    }
    
    const { data: prices } = await fetchServicePrices(serviceIds)
    return prices
  }
}

