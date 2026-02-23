/**
 * Pipeline Strategies Index
 * 
 * Exports all pipeline strategies and provides a factory function
 * to get the appropriate strategy for a given pipeline.
 */

import type { PipelineStrategy } from './base'
import type { KanbanContext } from '../types'
import { StandardPipelineStrategy } from './standard'
import { DepartmentPipelineStrategy } from './department'
import { ReceptiePipelineStrategy } from './receptie'
import { CurierPipelineStrategy } from './curier'
import { QualityPipelineStrategy } from './quality'

export { buildContext } from './base'
export type { PipelineStrategy }

// Singleton instances
const qualityStrategy = new QualityPipelineStrategy()
const standardStrategy = new StandardPipelineStrategy()
const departmentStrategy = new DepartmentPipelineStrategy()
const receptieStrategy = new ReceptiePipelineStrategy()
const curierStrategy = new CurierPipelineStrategy()

// All strategies in priority order
const strategies: PipelineStrategy[] = [
  qualityStrategy,
  receptieStrategy,
  curierStrategy,
  departmentStrategy,
  standardStrategy, // Fallback
]

/**
 * Get the appropriate strategy for a pipeline context
 */
export function getStrategyForContext(context: KanbanContext): PipelineStrategy {
  for (const strategy of strategies) {
    if (strategy.canHandle(context)) {
      return strategy
    }
  }
  
  // Fallback to standard (should never happen since standard handles all)
  return standardStrategy
}

