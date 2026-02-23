/**
 * Quality Pipeline Strategy
 *
 * Pipeline-ul "Quality" este folosit pentru quality check.
 * Cerință: când tăvițele din departamente sunt în stage "Finalizată",
 * atunci ele apar în pipeline-ul Quality în stage-urile corespunzătoare departamentelor lor.
 *
 * Implementare: NU mutăm nimic în DB. Construim item-uri virtuale (read-only)
 * în Quality, distribuite pe stage-uri după departament, bazate pe pipeline_items existente din departamente.
 */

import { supabaseBrowser } from '../../supabaseClient'
import type { PipelineStrategy } from './base'
import type { KanbanItem, KanbanContext, PipelineItemWithStage } from '../types'
import {
  fetchTagsForLeads,
  fetchTraysByIds,
  fetchTrayItems,
} from '../fetchers'
import { loadTechnicianCache } from '../cache'
import {
  extractTechnicianMap,
  transformTrayToKanbanItem,
} from '../transformers'

function isDepartmentPipelineName(name: string): boolean {
  const n = String(name || '').toLowerCase()
  return (
    n.includes('saloane') ||
    n.includes('horeca') ||
    n.includes('frizerii') ||
    n.includes('frizerie') ||
    n.includes('reparatii') ||
    n.includes('reparații')
  )
}

function isFinalizataStageName(name: string): boolean {
  const n = String(name || '').toLowerCase()
  return n.includes('finaliz')
}

function isValidationStageName(name: string): boolean {
  const n = String(name || '').toLowerCase()
  return n === 'validation' || n.includes('valid')
}

/**
 * Normalizează numele pentru matching (elimină diacritice, lowercase, etc.)
 */
function normalizeName(name: string): string {
  return String(name || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Elimină diacritice
    .trim()
}

/**
 * Verifică dacă numele unui stage din Quality corespunde cu numele unui departament
 * Îmbunătățit pentru a funcționa cu stage-uri care au exact numele departamentului
 */
function matchesDepartmentStage(deptName: string, qualityStageName: string): boolean {
  const deptNorm = normalizeName(deptName)
  const stageNorm = normalizeName(qualityStageName)
  
  // Match exact
  if (deptNorm === stageNorm) return true
  
  // Dacă stage-ul conține numele departamentului (ex: "Saloane" în "Saloane")
  if (stageNorm.includes(deptNorm)) return true
  
  // Dacă numele departamentului conține stage-ul (ex: "Saloane" conține "Saloane")
  if (deptNorm.includes(stageNorm)) return true
  
  // Match parțial pentru cazuri comune - verifică cuvinte cheie
  const deptKeywords = deptNorm.split(/\s+/).filter(kw => kw.length > 2)
  const stageKeywords = stageNorm.split(/\s+/).filter(kw => kw.length > 2)
  
  // Verifică dacă există cuvinte comune semnificative
  for (const deptKw of deptKeywords) {
    for (const stageKw of stageKeywords) {
      if (deptKw === stageKw && deptKw.length > 3) return true
    }
  }
  
  // Match pentru variante comune
  const variants: Record<string, string[]> = {
    'saloane': ['salon', 'saloane'],
    'horeca': ['horeca', 'horeca'],
    'frizerii': ['frizerii', 'frizerie', 'frizer'],
    'reparatii': ['reparatii', 'reparatii', 'reparații', 'reparatie']
  }
  
  for (const [key, values] of Object.entries(variants)) {
    if (deptNorm.includes(key) || stageNorm.includes(key)) {
      for (const variant of values) {
        if (deptNorm.includes(variant) && stageNorm.includes(variant)) return true
      }
    }
  }
  
  return false
}

export class QualityPipelineStrategy implements PipelineStrategy {
  canHandle(context: KanbanContext): boolean {
    const nameLower = String(context.pipelineInfo?.name || '').toLowerCase()
    return nameLower.includes('quality')
  }

  async loadItems(context: KanbanContext): Promise<KanbanItem[]> {
    // Load technician cache (pentru nume tehnician)
    await loadTechnicianCache()

    // Luăm TOATE stage-urile din Quality pipeline (nu doar "Validation")
    const qualityStages = context.allStages.filter(
      s => s.pipeline_id === context.pipelineId
    )

    if (qualityStages.length === 0) {
      console.warn('[QualityPipelineStrategy] Nu există stage-uri în pipeline-ul Quality.')
      return []
    }

    // Identificăm pipeline-urile de departamente și creăm mapping nume -> pipeline
    const departmentPipelines = context.allPipelines.filter(
      p => p?.id && isDepartmentPipelineName(p.name)
    )
    const departmentPipelineIds = departmentPipelines.map(p => p.id)
    const departmentNameToPipeline = new Map<string, { id: string; name: string }>()
    for (const dept of departmentPipelines) {
      if (dept?.id && dept?.name) {
        departmentNameToPipeline.set(dept.id, { id: dept.id, name: dept.name })
      }
    }

    if (departmentPipelineIds.length === 0) {
      return []
    }

    // Identificăm stage-urile "Finalizată" din departamente
    const finalizataStageIds = context.allStages
      .filter(s => departmentPipelineIds.includes(s.pipeline_id) && isFinalizataStageName(s.name))
      .map(s => s.id)

    if (finalizataStageIds.length === 0) {
      return []
    }

    // Luăm toate pipeline_items (tray) din departamente care sunt în "Finalizată"
    const supabase = supabaseBrowser()
    const { data: rows, error } = await supabase
      .from('pipeline_items')
      .select('id, type, item_id, pipeline_id, stage_id, created_at, updated_at')
      .in('pipeline_id', departmentPipelineIds)
      .in('stage_id', finalizataStageIds)
      .eq('type', 'tray')

    if (error) {
      console.warn('[QualityPipelineStrategy] Eroare la încărcarea tăvițelor finalizate:', error?.message || error)
      return []
    }

    const rowsAny = Array.isArray(rows) ? (rows as any[]) : []
    if (rowsAny.length === 0) {
      return []
    }

    // Construim mapping tray_id -> { updated_at, source_pipeline_id }
    const trayIdToDeptUpdatedAt = new Map<string, string>()
    const trayIdToSourcePipelineId = new Map<string, string>()
    const trayIdsSet = new Set<string>()
    for (const r of rowsAny) {
      const trayId = r?.item_id as string | undefined
      const pipelineId = r?.pipeline_id as string | undefined
      const updatedAt = (r?.updated_at as string | undefined) || (r?.created_at as string | undefined)
      if (!trayId || !updatedAt) continue
      trayIdsSet.add(trayId)
      const prev = trayIdToDeptUpdatedAt.get(trayId)
      if (!prev || new Date(updatedAt).getTime() > new Date(prev).getTime()) {
        trayIdToDeptUpdatedAt.set(trayId, updatedAt)
        if (pipelineId) trayIdToSourcePipelineId.set(trayId, pipelineId)
      }
    }

    const trayIds = Array.from(trayIdsSet)
    if (trayIds.length === 0) {
      return []
    }

    // QC status per TĂVIȚĂ (items_events)
    // Regula: ultimul eveniment QC determină statusul:
    // - quality_validated => 'validated' (tăvița NU mai apare în Quality/Validation)
    // - quality_not_validated => 'not_validated' (poate reapărea dacă ajunge iar în Finalizată)
    // - lipsă => null
    const qcStatusByTray = new Map<string, 'validated' | 'not_validated' | null>()
    try {
      const qcEventTypes = ['quality_validated', 'quality_not_validated']
      const latestByTray = new Map<string, { created_at: string; event_type: string }>()
      const chunkSize = 500
      for (let i = 0; i < trayIds.length; i += chunkSize) {
        const chunk = trayIds.slice(i, i + chunkSize)
        const { data: qcRows, error: qcErr } = await supabase
          .from('items_events')
          .select('item_id, event_type, created_at')
          .eq('type', 'tray')
          .in('item_id', chunk)
          .in('event_type', qcEventTypes as any)
          .order('created_at', { ascending: true })
        if (qcErr) {
          console.warn('[QualityPipelineStrategy] Nu pot încărca QC items_events (tray):', qcErr?.message || qcErr)
          break
        }
        const rowsAny2 = Array.isArray(qcRows) ? (qcRows as any[]) : []
        for (const r of rowsAny2) {
          const trayId = r?.item_id as string | undefined
          const ev = r?.event_type as string | undefined
          const createdAt = r?.created_at as string | undefined
          if (!trayId || !ev || !createdAt) continue
          latestByTray.set(trayId, { created_at: createdAt, event_type: ev })
        }
      }
      for (const trayId of trayIds) {
        const last = latestByTray.get(trayId)
        if (!last) qcStatusByTray.set(trayId, null)
        else qcStatusByTray.set(trayId, last.event_type === 'quality_validated' ? 'validated' : 'not_validated')
      }
    } catch (e: any) {
      console.warn('[QualityPipelineStrategy] Eroare încărcare QC (tray) (continuăm fără):', e?.message || e)
      for (const trayId of trayIds) qcStatusByTray.set(trayId, null)
    }

    // Filtrăm: în Quality/Validation afișăm DOAR tăvițele care NU sunt deja validate
    const pendingTrayIds = trayIds.filter(trayId => (qcStatusByTray.get(trayId) ?? null) !== 'validated')
    if (pendingTrayIds.length === 0) return []

    // Fetch trays cu service_file + lead inclus
    const { data: trays, error: traysErr } = await fetchTraysByIds(pendingTrayIds)
    if (traysErr) throw traysErr

    // Exclude tăvițele split: la Quality Check nu apar tăvițele cu status 'Splited' (plan împărțire 2/3 tăvițe reale)
    const traysForQc = (trays || []).filter((t: any) => t?.status !== 'Splited')

    // Tag-uri pentru lead-uri (vizibile pe card)
    const leadIds = traysForQc.map(t => (t as any)?.service_file?.lead?.id).filter(Boolean) as string[]
    const { data: tagMap } = await fetchTagsForLeads(leadIds)

    // Tehnician per tăviță (din tray_items)
    const { data: trayItems } = await fetchTrayItems(pendingTrayIds)
    const technicianMap = extractTechnicianMap(trayItems || [])

    // Construim mapping: departament -> stage din Quality
    // Pentru fiecare departament, găsim stage-ul corespunzător din Quality
    const deptToQualityStage = new Map<string, { id: string; name: string }>()
    const unmatchedDepartments: string[] = []
    
    for (const dept of departmentPipelines) {
      if (!dept?.id || !dept?.name) continue
      
      // Caută stage-ul care se potrivește cu numele departamentului
      const matchingStage = qualityStages.find(s => matchesDepartmentStage(dept.name, s.name))
      
      if (matchingStage) {
        deptToQualityStage.set(dept.id, { id: matchingStage.id, name: matchingStage.name })
        console.log(`[QualityPipelineStrategy] Departament "${dept.name}" → Stage "${matchingStage.name}"`)
      } else {
        unmatchedDepartments.push(dept.name)
        console.warn(`[QualityPipelineStrategy] Nu s-a găsit stage în Quality pentru departamentul "${dept.name}". Stage-uri disponibile:`, qualityStages.map(s => s.name))
      }
    }
    
    // Fallback: dacă nu găsim un match, folosim primul stage disponibil sau "Validation"
    const fallbackStage = qualityStages.find(s => isValidationStageName(s.name)) || qualityStages[0]
    if (!fallbackStage) {
      console.warn('[QualityPipelineStrategy] Nu există stage-uri disponibile în Quality.')
      return []
    }
    
    if (unmatchedDepartments.length > 0) {
      console.warn(`[QualityPipelineStrategy] ${unmatchedDepartments.length} departamente fără stage corespunzător vor folosi fallback stage "${fallbackStage.name}":`, unmatchedDepartments)
    }

    // Construim KanbanItems de tip tray în Quality, distribuite pe stage-uri după departament (read-only)
    const kanbanItems: KanbanItem[] = []
    for (const tray of traysForQc) {
      if (!tray?.id) continue
      const lead = (tray as any)?.service_file?.lead
      if (!lead?.id) continue

      const updatedAt = trayIdToDeptUpdatedAt.get(tray.id) || tray.created_at
      const sourcePipelineId = trayIdToSourcePipelineId.get(tray.id) || null

      // Găsim stage-ul corespunzător departamentului sursă
      let targetStage = fallbackStage
      if (sourcePipelineId && deptToQualityStage.has(sourcePipelineId)) {
        targetStage = deptToQualityStage.get(sourcePipelineId)!
      } else if (sourcePipelineId) {
        // Dacă avem un pipeline sursă dar nu am găsit un match, folosim fallback
        const sourcePipeline = context.allPipelines.find(p => p.id === sourcePipelineId)
        if (sourcePipeline) {
          console.warn(`[QualityPipelineStrategy] Tăvița ${tray.id} din departamentul "${sourcePipeline.name}" nu are stage corespunzător în Quality. Folosind fallback: "${fallbackStage.name}"`)
        }
      }

      const virtualPipelineItem: PipelineItemWithStage = {
        id: `quality_virtual_tray_${tray.id}`,
        type: 'tray',
        item_id: tray.id,
        pipeline_id: context.pipelineId,
        stage_id: targetStage.id,
        created_at: updatedAt,
        updated_at: updatedAt,
        stage: { id: targetStage.id, name: targetStage.name },
        isReadOnly: true,
      }

      const leadTagsRaw = tagMap.get(lead.id) || []
      const leadTags = Array.isArray(leadTagsRaw) ? leadTagsRaw : []
      const tagsWithoutUrgent = leadTags.filter(tag => tag?.name?.toLowerCase() !== 'urgent')
      const trayTags = [...tagsWithoutUrgent]
      if ((tray as any)?.service_file?.urgent === true) {
        const urgentTag = leadTags.find(tag => tag?.name?.toLowerCase() === 'urgent')
        trayTags.push(
          urgentTag || {
            id: `urgent_${tray.id}`,
            name: 'URGENT',
            color: 'red' as const,
          }
        )
      }

      const technician = technicianMap.get(tray.id) || null
      const ki = transformTrayToKanbanItem(tray as any, virtualPipelineItem, trayTags, technician, 0, true)

      const sourcePipelineName =
        sourcePipelineId
          ? (context.allPipelines.find(p => p.id === sourcePipelineId)?.name ?? null)
          : null

      ;(ki as any).qcSourcePipelineId = sourcePipelineId
      ;(ki as any).qcSourcePipelineName = sourcePipelineName

      const qcStatus = qcStatusByTray.get(tray.id) ?? null
      ;(ki as any).qcStatus = qcStatus
      ;(ki as any).qcValidated = qcStatus === 'validated'
      ;(ki as any).qcNotValidated = qcStatus === 'not_validated'
      kanbanItems.push(ki)
    }

    // Sortare: cele mai noi (după updated_at din departament) primele
    kanbanItems.sort((a, b) => {
      const da = new Date(a.stageMovedAt || a.createdAt || 0).getTime()
      const db = new Date(b.stageMovedAt || b.createdAt || 0).getTime()
      return db - da
    })

    return kanbanItems
  }
}

