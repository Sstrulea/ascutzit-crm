/**
 * Kanban Constants
 * 
 * Centralized configuration for pipeline-specific behavior.
 * This allows changing business rules without modifying code logic.
 */

// Pipeline names that have special behavior
export const DEPARTMENT_PIPELINES = ['Saloane', 'Horeca', 'Frizerii', 'Reparatii'] as const
export type DepartmentPipelineName = typeof DEPARTMENT_PIPELINES[number]

// Special pipeline names
export const RECEPTIE_PIPELINE_NAME = 'receptie'
export const CURIER_PIPELINE_NAME = 'curier'
export const REPARATII_PIPELINE_NAME = 'Reparatii'

// Stage name patterns for matching
export const STAGE_PATTERNS = {
  IN_LUCRU: ['in lucru', 'in work', 'in progress', 'în lucru'],
  IN_ASTEPTARE: ['in asteptare', 'asteptare', 'în așteptare', 'așteptare'],
  FINALIZARE: ['finalizare', 'finalized', 'done', 'finalizata', 'finalizată', 'finalizat', '8 s', '8s'],
  DE_FACTURAT: ['facturat', 'to invoice', 'de facturat', 'de facturată'],
  NOUA: ['noua', 'new', 'nouă'],
  ASTEPT_PIESE: ['astept piese', 'asteptare piese', 'waiting parts', 'aștept piese', 'așteptare piese'],
  COLET_AJUNS: ['colet ajuns', 'colet ajuns la', 'colet a ajuns', 'colet-ajuns', 'coletajuns'],
  COLET_NERIDICAT: ['colet neridicat', 'colet-neridicat', 'neridicat'],
  DE_TRIMIS: ['de trimis', 'detrimis', 'to send', 'trimis'],
  RIDIC_PERSONAL: ['ridic personal', 'ridicpersonal', 'ridica personal', 'ridică personal'],
  RETUR: ['retur', 'return'],
  MESSAGES: ['messages', 'mesaje', 'message'],
  NU_RASPUNDE: ['nu raspunde', 'nu răspunde', 'nuraspunde', 'no answer'],
  ARHIVAT: ['arhivat', 'archived', 'arhiv', 'arhivată'],
} as const

/** Normalize stage name for matching (lowercase, no diacritics). */
function normStageName(s: string): string {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
}

/**
 * Stage unde se afișează lead-urile cu Curier Trimis/Office Direct (≤24h).
 * Returnează true pentru: Livrari, Curier Ajuns Azi, Curier Sent (redenumire actuală).
 */
export function isLivrariOrCurierAjunsAziStage(stageName: string): boolean {
  const n = normStageName(stageName)
  return (
    n.includes('livrari') ||
    (n.includes('curier') && n.includes('sent')) ||
    (n.includes('curier') && n.includes('ajuns') && n.includes('azi'))
  )
}

/**
 * Stage Livrari / Curier Ajuns / Curier Sent – folosit pentru buton Livrare pe card.
 */
export function isLivrariOrCurierAjunsStage(stageName: string): boolean {
  const n = normStageName(stageName)
  return (
    n.includes('livrari') ||
    (n.includes('curier') && n.includes('sent')) ||
    (n.includes('curier') && n.includes('ajuns'))
  )
}

// Cache configuration
export const CACHE_TTL = 60000 // 1 minute

// Pricing configuration
export const URGENT_MARKUP_PCT = 30 // +30% for urgent items

/**
 * Check if a pipeline name matches a pattern
 */
export function isPipelineType(pipelineName: string, type: 'receptie' | 'curier' | 'department'): boolean {
  const nameLower = pipelineName.toLowerCase()
  
  switch (type) {
    case 'receptie':
      return nameLower.includes(RECEPTIE_PIPELINE_NAME)
    case 'curier':
      return nameLower.includes(CURIER_PIPELINE_NAME)
    case 'department':
      // FOLOSIM FOR LOOP ÎN LOC DE .some() - MAI SIGUR
      const deptPipelinesArray = Array.isArray(DEPARTMENT_PIPELINES) ? DEPARTMENT_PIPELINES : []
      for (let i = 0; i < deptPipelinesArray.length; i++) {
        const dept = deptPipelinesArray[i]
        if (dept && (nameLower === dept.toLowerCase() || nameLower.includes(dept.toLowerCase()))) {
          return true
        }
      }
      return false
    default:
      return false
  }
}

/**
 * Check if a stage name matches a pattern
 */
export function matchesStagePattern(
  stageName: string, 
  pattern: keyof typeof STAGE_PATTERNS
): boolean {
  const nameLower = stageName.toLowerCase()
  // FOLOSIM FOR LOOP ÎN LOC DE .some() - MAI SIGUR
  const patternsArray = Array.isArray(STAGE_PATTERNS[pattern]) ? STAGE_PATTERNS[pattern] : []
  for (let i = 0; i < patternsArray.length; i++) {
    const p = patternsArray[i]
    if (p && nameLower.includes(p)) {
      return true
    }
  }
  return false
}

/**
 * Find a stage matching a pattern in a list of stages
 */
export function findStageByPattern(
  stages: Array<{ id: string; name: string }>,
  pattern: keyof typeof STAGE_PATTERNS
): { id: string; name: string } | undefined {
  return stages.find(s => matchesStagePattern(s.name, pattern))
}

