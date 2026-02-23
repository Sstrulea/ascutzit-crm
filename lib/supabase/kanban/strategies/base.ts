/**
 * Base Pipeline Strategy
 * 
 * Abstract base class for pipeline-specific loading strategies.
 * Each pipeline type (standard, receptie, department) extends this.
 */

import type { 
  KanbanItem, 
  KanbanContext, 
  PipelineItemWithStage 
} from '../types'

export interface PipelineStrategy {
  /**
   * Load and transform items for this pipeline type
   */
  loadItems(context: KanbanContext): Promise<KanbanItem[]>
  
  /**
   * Check if this strategy should handle the given pipeline
   */
  canHandle(context: KanbanContext): boolean
}

/**
 * Shared context builder for all strategies
 */
export function buildContext(
  pipelineId: string,
  pipelineName: string,
  allPipelines: Array<{ id: string; name: string }>,
  allStages: Array<{ id: string; name: string; pipeline_id: string }>,
  currentUserId?: string,
  isAdminOrOwner: boolean = false
): KanbanContext {
  const nameLower = pipelineName.toLowerCase()
  
  return {
    pipelineId,
    pipelineInfo: {
      id: pipelineId,
      name: pipelineName,
      isReceptie: nameLower.includes('receptie'),
      isCurier: nameLower.includes('curier'),
      // FOLOSIM FOR LOOP ÎN LOC DE .some() - MAI SIGUR
      isDepartment: (() => {
        const deptNames = ['saloane', 'horeca', 'frizerii', 'reparatii']
        for (let i = 0; i < deptNames.length; i++) {
          const dept = deptNames[i]
          if (nameLower === dept || nameLower.includes(dept)) {
            return true
          }
        }
        return false
      })(),
    },
    currentUserId,
    isAdminOrOwner,
    allPipelines,
    allStages,
  }
}

