/**
 * Kanban Cache Utilities
 * 
 * Centralized caching for frequently accessed data.
 * Reduces database queries and improves performance.
 */

import { supabaseBrowser } from '../supabaseClient'
import { CACHE_TTL } from './constants'

// ==================== TECHNICIAN CACHE ====================

const technicianCache = new Map<string, string>()
let technicianCacheLoaded = false

/**
 * Load technician names into cache (called once)
 */
export async function loadTechnicianCache(): Promise<void> {
  if (technicianCacheLoaded) return
  
  try {
    const supabase = supabaseBrowser()
    const { data: members } = await supabase
      .from('app_members')
      .select('user_id, name')
    
    if (members) {
      members.forEach((m: any) => {
        const name = m.name || `User ${m.user_id.slice(0, 8)}` || 'Necunoscut'
        technicianCache.set(m.user_id, name)
      })
    }
    technicianCacheLoaded = true
  } catch (error) {
    // Silently fail - cache is optional
  }
}

/**
 * Get technician name from cache
 */
export function getTechnicianName(userId: string): string {
  return technicianCache.get(userId) || 'Necunoscut'
}

/**
 * Check if technician cache is loaded
 */
export function isTechnicianCacheLoaded(): boolean {
  return technicianCacheLoaded
}

// ==================== PIPELINES & STAGES CACHE ====================

interface CachedPipelinesAndStages {
  pipelines: Array<{ id: string; name: string }>
  stages: Array<{ id: string; name: string; pipeline_id: string }>
}

let pipelinesStagesCache: CachedPipelinesAndStages | null = null
let cacheTimestamp = 0

/**
 * Get pipelines and stages from cache or database
 */
export async function getCachedPipelinesAndStages(): Promise<CachedPipelinesAndStages> {
  const now = Date.now()
  
  if (pipelinesStagesCache && (now - cacheTimestamp) < CACHE_TTL) {
    return pipelinesStagesCache
  }
  
  const supabase = supabaseBrowser()
  
  const [pipelinesResult, stagesResult] = await Promise.all([
    supabase.from('pipelines').select('id, name'),
    supabase.from('stages').select('id, name, pipeline_id')
  ])
  
  pipelinesStagesCache = {
    pipelines: pipelinesResult.data || [],
    stages: stagesResult.data || []
  }
  cacheTimestamp = now
  
  return pipelinesStagesCache
}

/**
 * Invalidate pipelines and stages cache
 */
export function invalidatePipelinesStagesCache(): void {
  pipelinesStagesCache = null
  cacheTimestamp = 0
}

/**
 * Get stages for a specific pipeline
 */
export function getStagesForPipeline(
  allStages: Array<{ id: string; name: string; pipeline_id: string }>,
  pipelineId: string
): Array<{ id: string; name: string }> {
  return allStages
    .filter(s => s.pipeline_id === pipelineId)
    .map(s => ({ id: s.id, name: s.name }))
}

