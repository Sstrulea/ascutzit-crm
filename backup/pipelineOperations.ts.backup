'use client'

import { supabaseBrowser } from './supabaseClient'

const supabase = supabaseBrowser()

// Cache global pentru tehnicieni (evită multiple auth calls)
const technicianCache = new Map<string, string>()
let technicianCacheLoaded = false

// Încarcă cache-ul de tehnicieni o singură dată
async function loadTechnicianCache() {
  if (technicianCacheLoaded) return
  try {
    const { data: members } = await supabase
      .from('app_members')
      .select('user_id, name, email')
    if (members) {
      members.forEach((m: any) => {
        const name = m.name || m.email?.split('@')[0] || 'Necunoscut'
        technicianCache.set(m.user_id, name)
      })
    }
    technicianCacheLoaded = true
  } catch (error) {
    console.error('Error loading technician cache:', error)
  }
}

// Cache global pentru pipelines și stages (reduce query-uri repetate)
let pipelinesCache: any[] | null = null
let stagesCache: any[] | null = null
let cacheTimestamp = 0
const CACHE_TTL = 60000 // 1 minut

async function getCachedPipelinesAndStages() {
  const now = Date.now()
  if (pipelinesCache && stagesCache && (now - cacheTimestamp) < CACHE_TTL) {
    return { pipelines: pipelinesCache, stages: stagesCache }
  }
  
  const [pipelinesResult, stagesResult] = await Promise.all([
    supabase.from('pipelines').select('id, name'),
    supabase.from('stages').select('id, name, pipeline_id')
  ])
  
  pipelinesCache = pipelinesResult.data || []
  stagesCache = stagesResult.data || []
  cacheTimestamp = now
  
  return { pipelines: pipelinesCache, stages: stagesCache }
}

// Tipuri pentru pipeline_items
export type PipelineItemType = 'lead' | 'service_file' | 'tray'

export type PipelineItem = {
  id: string
  type: PipelineItemType
  item_id: string
  pipeline_id: string
  stage_id: string
  created_at: string
  updated_at: string
}

// Rezultat pentru mutarea unui item într-un pipeline
export type MoveItemResult = {
  ok: true
  data: {
    pipeline_item_id: string
    new_stage_id: string
  }[]
} | {
  ok: false
  code?: string
  message?: string
}

// ==================== PIPELINE ITEMS ====================

/**
 * Creează o intrare în pipeline_items pentru un lead
 */
export async function addLeadToPipeline(
  leadId: string,
  pipelineId: string,
  stageId: string
): Promise<{ data: PipelineItem | null; error: any }> {
  try {
    // Verifică dacă există deja o intrare pentru acest lead în acest pipeline
    const { data: existing } = await supabase
      .from('pipeline_items')
      .select('*')
      .eq('type', 'lead')
      .eq('item_id', leadId)
      .eq('pipeline_id', pipelineId)
      .maybeSingle()

    if (existing) {
      // Actualizează stage-ul existent
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
      return { data: data as PipelineItem, error: null }
    }

    // Creează o intrare nouă
    const { data, error } = await supabase
      .from('pipeline_items')
      .insert([{
        type: 'lead',
        item_id: leadId,
        pipeline_id: pipelineId,
        stage_id: stageId,
      }])
      .select()
      .single()

    if (error) throw error
    return { data: data as PipelineItem, error: null }
  } catch (error) {
    return { data: null, error }
  }
}

/**
 * Creează o intrare în pipeline_items pentru o fișă de serviciu
 */
export async function addServiceFileToPipeline(
  serviceFileId: string,
  pipelineId: string,
  stageId: string
): Promise<{ data: PipelineItem | null; error: any }> {
  try {
    const { data: existing } = await supabase
      .from('pipeline_items')
      .select('*')
      .eq('type', 'service_file')
      .eq('item_id', serviceFileId)
      .eq('pipeline_id', pipelineId)
      .maybeSingle()

    if (existing) {
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
      return { data: data as PipelineItem, error: null }
    }

    const { data, error } = await supabase
      .from('pipeline_items')
      .insert([{
        type: 'service_file',
        item_id: serviceFileId,
        pipeline_id: pipelineId,
        stage_id: stageId,
      }])
      .select()
      .single()

    if (error) throw error
    return { data: data as PipelineItem, error: null }
  } catch (error) {
    return { data: null, error }
  }
}

/**
 * Creează o intrare în pipeline_items pentru o tavă
 */
export async function addTrayToPipeline(
  trayId: string,
  pipelineId: string,
  stageId: string
): Promise<{ data: PipelineItem | null; error: any }> {
  try {
    const { data: existing } = await supabase
      .from('pipeline_items')
      .select('*')
      .eq('type', 'tray')
      .eq('item_id', trayId)
      .eq('pipeline_id', pipelineId)
      .maybeSingle()

    if (existing) {
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
      return { data: data as PipelineItem, error: null }
    }

    const { data, error } = await supabase
      .from('pipeline_items')
      .insert([{
        type: 'tray',
        item_id: trayId,
        pipeline_id: pipelineId,
        stage_id: stageId,
      }])
      .select()
      .single()

    if (error) throw error
    return { data: data as PipelineItem, error: null }
  } catch (error) {
    return { data: null, error }
  }
}

/**
 * Mută un item într-un alt stage din același pipeline
 * @param fromStageId - Stage-ul de unde se mută (opțional, pentru history tracking)
 */
export async function moveItemToStage(
  type: PipelineItemType,
  itemId: string,
  pipelineId: string,
  newStageId: string,
  fromStageId?: string
): Promise<{ data: PipelineItem | null; error: any }> {
  try {
    console.log('🔄 moveItemToStage:', { type, itemId, pipelineId, newStageId })
    
    const { data: current, error: fetchError } = await supabase
      .from('pipeline_items')
      .select('*')
      .eq('type', type)
      .eq('item_id', itemId)
      .eq('pipeline_id', pipelineId)
      .maybeSingle()

    if (fetchError) {
      console.error('Eroare la găsirea pipeline_item:', fetchError)
      throw fetchError
    }
    
    if (!current) {
      console.error('Pipeline item nu a fost găsit:', { type, itemId, pipelineId })
      throw new Error(`Item-ul de tip "${type}" cu id "${itemId}" nu a fost găsit în pipeline-ul specificat`)
    }

    const actualFromStageId = fromStageId || (current as any).stage_id

    const { data, error } = await supabase
      .from('pipeline_items')
      .update({
        stage_id: newStageId,
        updated_at: new Date().toISOString(),
      } as any)
      .eq('id', (current as any).id)
      .select()
      .single()

    if (error) {
      console.error('Eroare la actualizarea stage-ului:', error)
      throw error
    }

    console.log('✅ Stage actualizat cu succes:', data)

    // TODO: Creează un tabel stage_history_items similar cu stage_history dar pentru pipeline_items
    // care să țină evidența mutărilor pentru toate tipurile de items (lead, service_file, tray)
    // Pentru moment, folosim updated_at din pipeline_items

    return { data: data as PipelineItem, error: null }
  } catch (error) {
    console.error('❌ moveItemToStage eroare:', error)
    return { data: null, error }
  }
}

/**
 * Obține toate items-urile dintr-un pipeline (opțional filtrate după stage)
 */
export async function getPipelineItems(
  pipelineId: string,
  stageId?: string,
  type?: PipelineItemType
): Promise<{ data: PipelineItem[]; error: any }> {
  try {
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
    return { data: (data ?? []) as PipelineItem[], error: null }
  } catch (error) {
    return { data: [], error }
  }
}

/**
 * Obține pipeline_item pentru un item specific
 */
export async function getPipelineItemForItem(
  type: PipelineItemType,
  itemId: string,
  pipelineId: string
): Promise<{ data: PipelineItem | null; error: any }> {
  try {
    const { data, error } = await supabase
      .from('pipeline_items')
      .select('*')
      .eq('type', type)
      .eq('item_id', itemId)
      .eq('pipeline_id', pipelineId)
      .maybeSingle()

    if (error && error.code !== 'PGRST116') throw error // PGRST116 = not found
    return { data: data as PipelineItem | null, error: null }
  } catch (error) {
    return { data: null, error }
  }
}

/**
 * Șterge un pipeline_item
 */
export async function removeItemFromPipeline(
  type: PipelineItemType,
  itemId: string,
  pipelineId: string
): Promise<{ success: boolean; error: any }> {
  try {
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
 * Helper pentru a obține primul stage activ dintr-un pipeline
 */
async function getFirstActiveStage(pipelineId: string): Promise<{ id: string } | null> {
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
 * Mută un lead într-un pipeline nou (similar cu moveLeadToPipeline din vechea arhitectură)
 */
export async function moveLeadToPipeline(
  leadId: string,
  targetPipelineId: string,
  targetStageId?: string,
  notes?: string
): Promise<MoveItemResult> {
  try {
    // Dacă nu avem targetStageId, obținem primul stage activ din pipeline
    let stageId = targetStageId
    if (!stageId) {
      const firstStage = await getFirstActiveStage(targetPipelineId)
      if (!firstStage) {
        return {
          ok: false,
          code: 'TARGET_PIPELINE_NO_ACTIVE_STAGES',
          message: 'Pipeline-ul țintă nu are stage-uri active',
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
      message: error?.message || 'Eroare necunoscută',
    }
  }
}

/**
 * Mută o fișă de serviciu într-un pipeline
 */
export async function moveServiceFileToPipeline(
  serviceFileId: string,
  targetPipelineId: string,
  targetStageId?: string,
  notes?: string
): Promise<MoveItemResult> {
  try {
    let stageId = targetStageId
    if (!stageId) {
      const firstStage = await getFirstActiveStage(targetPipelineId)
      if (!firstStage) {
        return {
          ok: false,
          code: 'TARGET_PIPELINE_NO_ACTIVE_STAGES',
          message: 'Pipeline-ul țintă nu are stage-uri active',
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
      message: error?.message || 'Eroare necunoscută',
    }
  }
}

/**
 * Mută o tavă într-un pipeline
 */
export async function moveTrayToPipeline(
  trayId: string,
  targetPipelineId: string,
  targetStageId?: string,
  notes?: string
): Promise<MoveItemResult> {
  try {
    let stageId = targetStageId
    if (!stageId) {
      const firstStage = await getFirstActiveStage(targetPipelineId)
      if (!firstStage) {
        return {
          ok: false,
          code: 'TARGET_PIPELINE_NO_ACTIVE_STAGES',
          message: 'Pipeline-ul țintă nu are stage-uri active',
        }
      }
      stageId = firstStage.id
    }

    const result = await addTrayToPipeline(trayId, targetPipelineId, stageId)

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
      message: error?.message || 'Eroare necunoscută',
    }
  }
}

/**
 * Tip pentru un item Kanban (lead, service_file sau tray)
 */
export type KanbanItem = {
  id: string
  name: string
  email: string
  phone: string
  stage: string
  createdAt: string
  campaignName?: string
  adName?: string
  formName?: string
  leadId?: string // Pentru leads este același cu id, pentru service_files/trays este lead_id din relație
  stageId: string
  pipelineId: string
  assignmentId: string // pipeline_item.id
  tags?: { id: string; name: string; color: 'green' | 'yellow' | 'red' | 'blue' | 'orange' }[]
  stageMovedAt?: string
  technician?: string | null
  type: 'lead' | 'service_file' | 'tray'
  // Câmpuri specifice pentru service_file
  serviceFileNumber?: string
  serviceFileStatus?: string
  // Câmpuri specifice pentru tray
  trayNumber?: string
  traySize?: string
  trayStatus?: string
  // Total pentru tray (suma serviciilor și pieselor)
  total?: number
  // Flag pentru a marca cardurile ca non-draggable (ex: service_files din Receptie bazat pe tăvițe)
  isReadOnly?: boolean
}

/**
 * Obține toate items-urile Kanban pentru un pipeline - OPTIMIZED
 */
export async function getKanbanItems(pipelineId?: string): Promise<{ data: KanbanItem[]; error: any }> {
  try {
    const startTime = performance.now()
    
    // OPTIMIZARE: Încarcă cache-ul de tehnicieni, pipelines și stages ÎN PARALEL cu query-ul principal
    const [_, cachedData, pipelineItemsResult] = await Promise.all([
      loadTechnicianCache(),
      getCachedPipelinesAndStages(),
      supabase
        .from('pipeline_items')
        .select(`
          id, type, item_id, pipeline_id, stage_id, created_at, updated_at,
          stage:stages(id, name)
        `)
        .eq('pipeline_id', pipelineId || '')
    ])
    
    const { pipelines: allPipelines, stages: allStages } = cachedData
    const pipelineItems = pipelineItemsResult.data || []
    const itemsError = pipelineItemsResult.error
    
    if (itemsError) throw itemsError
    
    // Verifică dacă este pipeline-ul Receptie folosind cache-ul
    const currentPipeline = allPipelines.find((p: any) => p.id === pipelineId)
    const isReceptiePipeline = currentPipeline?.name?.toLowerCase().includes('receptie') || false
    const receptiePipelineId = isReceptiePipeline ? pipelineId : null
    
    console.log(`⚡ getKanbanItems - pipeline_items încărcate în ${(performance.now() - startTime).toFixed(0)}ms:`, pipelineItems?.length || 0)

    // Grupează items-urile după tip
    const leads: string[] = []
    const serviceFiles: string[] = []
    const trays: string[] = []

    // Mapăază fiecare pipeline_item la item_id pentru căutare rapidă
    const pipelineItemMap = new Map<string, any>()
    if (pipelineItems && pipelineItems.length > 0) {
      pipelineItems.forEach((item: any) => {
        const key = `${item.type}:${item.item_id}`
        pipelineItemMap.set(key, item)
        
        if (item.type === 'lead') leads.push(item.item_id)
        else if (item.type === 'service_file') serviceFiles.push(item.item_id)
        else if (item.type === 'tray') trays.push(item.item_id)
      })
    }

    // PENTRU PIPELINE RECEPTIE: Adaugă service_files virtuale bazate pe tăvițe din departamente
    // Trebuie făcut ÎNAINTE de procesarea datelor pentru a include și aceste service_files
    const serviceFilesData: any[] = []
    
    if (isReceptiePipeline && receptiePipelineId) {
      // Găsește stage-urile din Receptie
      const { data: receptieStages } = await supabase
        .from('stages')
        .select('id, name')
        .eq('pipeline_id', receptiePipelineId)
      
      console.log('🔍 Receptie pipeline - Stage-uri găsite:', receptieStages?.map((s: any) => s.name) || [])
      
      if (receptieStages && receptieStages.length > 0) {
        // Găsește pipeline-urile departamentelor (Saloane, Horeca, Frizerii, Reparatii)
        const { data: deptPipelines } = await supabase
          .from('pipelines')
          .select('id, name')
          .in('name', ['Saloane', 'Horeca', 'Frizerii', 'Reparatii'])
        
        console.log('🏭 Pipeline-uri departamente găsite:', deptPipelines?.map((p: any) => p.name) || [])
        
        if (deptPipelines && deptPipelines.length > 0) {
          // Găsește stage-urile "In Lucru", "In Asteptare" și "Finalizare" în pipeline-urile departamentelor
          const deptPipelineIds = deptPipelines.map((p: any) => p.id)
          
          const { data: deptStages } = await supabase
            .from('stages')
            .select('id, name, pipeline_id')
            .in('pipeline_id', deptPipelineIds)
            .or('name.ilike.%in lucru%,name.ilike.%in asteptare%,name.ilike.%finalizare%')
          
          console.log('📋 Stage-uri departamente găsite:', deptStages?.map((s: any) => s.name) || [])
          
          if (deptStages && deptStages.length > 0) {
            const targetStageIds = deptStages.map((s: any) => s.id)
            
            // Găsește tăvițe care sunt în aceste stage-uri
            const { data: relevantTrayItems } = await supabase
              .from('pipeline_items')
              .select('item_id, stage_id')
              .eq('type', 'tray')
              .in('stage_id', targetStageIds)
            
            console.log('📦 Tăvițe găsite în stage-uri departamente:', relevantTrayItems?.length || 0)
            
            if (relevantTrayItems && relevantTrayItems.length > 0) {
              const trayIds = relevantTrayItems.map((item: any) => item.item_id)
              
              // Mapăază fiecare tăviță relevantă la stage-ul său pentru a determina unde să apară în Receptie
              const trayToDeptStage = new Map<string, string>()
              relevantTrayItems.forEach((item: any) => {
                const deptStage = deptStages.find((s: any) => s.id === item.stage_id)
                if (deptStage) {
                  const stageNameLower = deptStage.name.toLowerCase()
                  if (stageNameLower.includes('in lucru')) {
                    trayToDeptStage.set(item.item_id, 'in_lucru')
                  } else if (stageNameLower.includes('in asteptare') || stageNameLower.includes('asteptare')) {
                    trayToDeptStage.set(item.item_id, 'in_asteptare')
                  } else if (stageNameLower.includes('finalizare')) {
                    trayToDeptStage.set(item.item_id, 'finalizare')
                  }
                }
              })
              
              // Obține tăvițele relevante cu service_files și leads
              const { data: relevantTrays } = await supabase
                .from('trays')
                .select(`
                  id,
                  service_file_id,
                  service_file:service_files!inner(
                    id,
                    lead_id,
                    number,
                    status,
                    created_at,
                    lead:leads!inner(id, full_name, email, phone_number, created_at, campaign_name, ad_name, form_name)
                  )
                `)
                .in('id', trayIds)
              
              console.log('📦 Tăvițe relevante cu service_files:', relevantTrays?.length || 0)
              
              // Obține service_file_id-urile care au tăvițe relevante
              const relevantServiceFileIds = [...new Set(relevantTrays?.map((t: any) => t.service_file_id).filter(Boolean) || [])]
              
              // Obține TOATE tăvițele pentru aceste service_files (pentru a verifica status-ul complet)
              const { data: allTraysForServiceFiles } = await supabase
                .from('trays')
                .select(`
                  id,
                  service_file_id
                `)
                .in('service_file_id', relevantServiceFileIds)
              
              // Obține stage-urile pentru TOATE tăvițele din aceste service_files
              const allTrayIds = allTraysForServiceFiles?.map((t: any) => t.id) || []
              
              // Obține pipeline_items pentru toate tăvițele din pipeline-urile departamentelor
              const { data: allTrayPipelineItems } = await supabase
                .from('pipeline_items')
                .select('item_id, stage_id')
                .eq('type', 'tray')
                .in('item_id', allTrayIds)
                .in('pipeline_id', deptPipelineIds)
              
              // Mapăază fiecare tăviță (inclusiv cele din alte stage-uri) la stage-ul său
              const allTrayToDeptStage = new Map<string, string>()
              allTrayPipelineItems?.forEach((item: any) => {
                const deptStage = deptStages.find((s: any) => s.id === item.stage_id)
                if (deptStage) {
                  const stageNameLower = deptStage.name.toLowerCase()
                  if (stageNameLower.includes('in lucru')) {
                    allTrayToDeptStage.set(item.item_id, 'in_lucru')
                  } else if (stageNameLower.includes('in asteptare') || stageNameLower.includes('asteptare')) {
                    allTrayToDeptStage.set(item.item_id, 'in_asteptare')
                  } else if (stageNameLower.includes('finalizare')) {
                    allTrayToDeptStage.set(item.item_id, 'finalizare')
                  }
                }
              })
              
              console.log('📦 Total tăvițe pentru service_files relevante:', allTrayIds.length)
              
              if (relevantTrays && relevantTrays.length > 0) {
                // Grupează tăvițele relevante după service_file_id (pentru a obține service_file data)
                const serviceFileDataMap = new Map<string, any>()
                
                relevantTrays.forEach((tray: any) => {
                  if (tray && tray.service_file) {
                    const sfId = tray.service_file.id
                    if (!serviceFileDataMap.has(sfId)) {
                      serviceFileDataMap.set(sfId, tray.service_file)
                    }
                  }
                })
                
                // Pentru fiecare service_file, determină stage-ul din Receptie bazat pe TOATE tăvițele din fișă
                const serviceFileMap = new Map<string, { serviceFile: any; receptieStage: any }>()
                
                for (const [sfId, serviceFile] of serviceFileDataMap.entries()) {
                  // Obține TOATE tăvițele din acest service_file
                  const allTraysForThisServiceFile = allTraysForServiceFiles?.filter((t: any) => t.service_file_id === sfId) || []
                  const allTrayIdsForThisServiceFile = allTraysForThisServiceFile.map((t: any) => t.id)
                  
                  // Verifică status-urile tuturor tăvițelor din fișă
                  const trayStatuses = allTrayIdsForThisServiceFile
                    .map((trayId: string) => allTrayToDeptStage.get(trayId))
                    .filter(Boolean) as string[]
                  
                  const hasInLucru = trayStatuses.includes('in_lucru')
                  const hasInAsteptare = trayStatuses.includes('in_asteptare')
                  const hasFinalizare = trayStatuses.includes('finalizare')
                  
                  // Dacă există tăvițe care nu sunt în stage-uri relevante, le ignorăm
                  // Dacă toate tăvițele sunt în "Finalizare" sau am doar "Finalizare" și "In Asteptare"
                  const allRelevantFinalizare = trayStatuses.length > 0 && 
                    trayStatuses.every(s => s === 'finalizare')
                  
                  console.log('🔍 Service file', sfId, '- Status tăvițe:', {
                    hasInLucru,
                    hasInAsteptare,
                    hasFinalizare,
                    allRelevantFinalizare,
                    totalTrays: allTrayIdsForThisServiceFile.length,
                    trayStatuses
                  })
                  
                  // Determină stage-ul din Receptie bazat pe prioritate
                  let receptieStage: any = null
                  
                  // Prioritate 1: Dacă există măcar o tăviță în "In Lucru" → "IN LUCRU"
                  if (hasInLucru) {
                    receptieStage = receptieStages.find((s: any) => 
                      s.name.toLowerCase().includes('in lucru')
                    )
                  }
                  // Prioritate 2: Dacă există măcar o tăviță în "In Asteptare" (și niciuna în "In Lucru") → "IN ASTEPTARE"
                  else if (hasInAsteptare) {
                    receptieStage = receptieStages.find((s: any) => 
                      s.name.toLowerCase().includes('asteptare') && 
                      !s.name.toLowerCase().includes('confirmare')
                    )
                  }
                  // Prioritate 3: Dacă toate tăvițele relevante sunt în "Finalizare" → "DE FACTURAT"
                  else if (allRelevantFinalizare) {
                    receptieStage = receptieStages.find((s: any) => 
                      s.name.toLowerCase().includes('facturat')
                    )
                  }
                  
                  // Fallback: dacă nu găsește un stage specific
                  if (!receptieStage) {
                    receptieStage = receptieStages.find((s: any) => 
                      s.name.toLowerCase().includes('in lucru')
                    )
                  }
                  
                  if (receptieStage) {
                    serviceFileMap.set(sfId, {
                      serviceFile,
                      receptieStage,
                    })
                  }
                }
                
                console.log('📄 Service files de adăugat în Receptie:', serviceFileMap.size)
                
                // Adaugă service_files în pipeline Receptie dacă nu există deja
                for (const [sfId, data] of serviceFileMap.entries()) {
                  const existsInReceptie = serviceFiles.includes(sfId)
                  
                  if (!existsInReceptie && data.receptieStage) {
                    // Verifică dacă există deja în pipeline_items pentru Receptie
                    const { data: existingItem } = await supabase
                      .from('pipeline_items')
                      .select('id')
                      .eq('type', 'service_file')
                      .eq('item_id', sfId)
                      .eq('pipeline_id', receptiePipelineId)
                      .maybeSingle()
                    
                    // Dacă nu există, creează un pipeline_item virtual
                    if (!existingItem) {
                      const serviceFile = data.serviceFile
                      const lead = serviceFile.lead
                      
                      console.log('➕ Adăugare service_file în Receptie:', {
                        serviceFileId: sfId,
                        stageName: data.receptieStage.name,
                        leadName: lead?.full_name
                      })
                      
                      // Adaugă în rezultat ca service_file
                      serviceFiles.push(sfId)
                      serviceFilesData.push({
                        ...serviceFile,
                        lead,
                      })
                      
                      // Creează un pipeline_item virtual pentru mapare (marcat ca read-only)
                      const virtualPipelineItem = {
                        id: `virtual_${sfId}`,
                        type: 'service_file',
                        item_id: sfId,
                        pipeline_id: receptiePipelineId,
                        stage_id: data.receptieStage.id,
                        created_at: serviceFile.created_at,
                        updated_at: new Date().toISOString(),
                        stage: {
                          id: data.receptieStage.id,
                          name: data.receptieStage.name,
                        },
                        isReadOnly: true, // Marcă pentru non-draggable
                      }
                      
                      pipelineItemMap.set(`service_file:${sfId}`, virtualPipelineItem)
                    }
                  }
                }
              }
            }
          }
        }
      }
    }

    // OPTIMIZAT: Obține datele pentru leads, service_files și trays ÎN PARALEL
    const serviceFilesToFetch = serviceFiles.filter(sfId => 
      !serviceFilesData.some(sf => sf.id === sfId)
    )
    
    const [leadsResult, serviceFilesResult, traysResult] = await Promise.all([
      leads.length > 0 
        ? supabase.from('leads').select('id, full_name, email, phone_number, created_at, campaign_name, ad_name, form_name').in('id', leads)
        : Promise.resolve({ data: [] }),
      serviceFilesToFetch.length > 0
        ? supabase.from('service_files').select(`
            id, lead_id, number, status, created_at,
            lead:leads(id, full_name, email, phone_number, created_at, campaign_name, ad_name, form_name)
          `).in('id', serviceFilesToFetch)
        : Promise.resolve({ data: [] }),
      trays.length > 0
        ? supabase.from('trays').select(`
            id, number, size, status, created_at, service_file_id,
            service_file:service_files!inner(lead_id, lead:leads!inner(id, full_name, email, phone_number, created_at, campaign_name, ad_name, form_name))
          `).in('id', trays)
        : Promise.resolve({ data: [] })
    ])
    
    const leadsData: any[] = leadsResult.data || []
    if (serviceFilesResult.data) serviceFilesData.push(...serviceFilesResult.data)
    const traysData: any[] = traysResult.data || []
    
    console.log(`⚡ Date principale încărcate - leads: ${leadsData.length}, sf: ${serviceFilesData.length}, trays: ${traysData.length}`)

    // OPTIMIZAT: Obține tags ȘI tray_items ÎN PARALEL
    const allLeadIds = [
      ...leadsData.map(l => l.id),
      ...serviceFilesData.map(sf => sf.lead_id),
      ...traysData.map(t => t.service_file?.lead_id).filter(Boolean),
    ]
    const uniqueLeadIds = [...new Set(allLeadIds)]

    const [tagsResult, trayItemsResult, traysSubscriptionResult] = await Promise.all([
      uniqueLeadIds.length > 0
        ? supabase.from('v_lead_tags').select('lead_id, tags').in('lead_id', uniqueLeadIds)
        : Promise.resolve({ data: [] }),
      trays.length > 0
        ? supabase.from('tray_items').select('tray_id, technician_id, notes, qty, service_id').in('tray_id', trays)
        : Promise.resolve({ data: [] }),
      // subscription_type nu există în trays - returnăm array gol
      Promise.resolve({ data: [] })
    ])

    const tagMap = new Map<string, any[]>()
    if (tagsResult.data) {
      tagsResult.data.forEach((r: any) => tagMap.set(r.lead_id, r.tags || []))
    }

    // Obține technicians și totaluri pentru trays (din tray_items) cu calcul complet
    let technicianMap = new Map<string, string>()
    let trayTotalMap = new Map<string, number>()
    const URGENT_MARKUP_PCT = 30 // +30% pentru urgent
    
    if (trays.length > 0) {
      const allTrayItems = trayItemsResult.data || []
      const subscriptionTypeMap = new Map<string, 'services' | 'parts' | 'both' | ''>()
      if (traysSubscriptionResult.data) {
        traysSubscriptionResult.data.forEach((t: any) => {
          subscriptionTypeMap.set(t.id, t.subscription_type || '')
        })
      }

      if (allTrayItems && allTrayItems.length > 0) {
        // Obține prețurile serviciilor pentru items cu service_id
        const serviceIds = [...new Set(allTrayItems.map((ti: any) => ti.service_id).filter(Boolean))]
        let servicePriceMap = new Map<string, number>()
        
        if (serviceIds.length > 0) {
          const { data: servicesData } = await supabase
            .from('services')
            .select('id, price')
            .in('id', serviceIds)
          
          if (servicesData) {
            servicesData.forEach((s: any) => {
              servicePriceMap.set(s.id, s.price || 0)
            })
          }
        }
        
        // Grupează items-urile pe tray și calculează totalurile complete
        const trayItemsMap = new Map<string, any[]>()
        allTrayItems.forEach((ti: any) => {
          if (!trayItemsMap.has(ti.tray_id)) {
            trayItemsMap.set(ti.tray_id, [])
          }
          trayItemsMap.get(ti.tray_id)!.push(ti)
        })
        
        // Calculează totalul complet pentru fiecare tray (cu discount, urgent, subscription)
        trayItemsMap.forEach((items, trayId) => {
          // Filtrează items-urile cu item_type (exclude doar instrumente fără servicii)
          const visibleItems = items.filter((ti: any) => {
            if (!ti.notes) return true
            try {
              const notesData = JSON.parse(ti.notes)
              return notesData.item_type !== null && notesData.item_type !== undefined
            } catch {
              return true
            }
          })
          
          let subtotal = 0
          let totalDiscount = 0
          let urgentAmount = 0
          let servicesTotal = 0
          let partsTotal = 0
          
          visibleItems.forEach((ti: any) => {
            const qty = ti.qty || 1
            let itemPrice = 0
            let discountPct = 0
            let isUrgent = false
            let itemType: 'service' | 'part' | null = null
            
            if (ti.notes) {
              try {
                const notesData = JSON.parse(ti.notes)
                itemPrice = notesData.price || 0
                discountPct = notesData.discount_pct || 0
                isUrgent = notesData.urgent || false
                itemType = notesData.item_type || null
              } catch (e) {
                // Notes nu este JSON
              }
            }
            
            // Dacă nu avem preț din notes, încearcă din serviciu
            if (!itemPrice && ti.service_id) {
              itemPrice = servicePriceMap.get(ti.service_id) || 0
              if (!itemType) itemType = 'service'
            }
            
            if (!itemType && !ti.service_id) {
              itemType = 'part'
            }
            
            const base = qty * itemPrice
            const disc = base * (Math.min(100, Math.max(0, discountPct)) / 100)
            const afterDisc = base - disc
            const urgent = isUrgent ? afterDisc * (URGENT_MARKUP_PCT / 100) : 0
            
            subtotal += base
            totalDiscount += disc
            urgentAmount += urgent
            
            const itemTotal = afterDisc + urgent
            if (itemType === 'service') {
              servicesTotal += itemTotal
            } else if (itemType === 'part') {
              partsTotal += itemTotal
            }
          })
          
          // Aplică subscription discounts
          const subscriptionType = subscriptionTypeMap.get(trayId) || ''
          let subscriptionDiscount = 0
          if (subscriptionType === 'services' || subscriptionType === 'both') {
            subscriptionDiscount += servicesTotal * 0.10
          }
          if (subscriptionType === 'parts' || subscriptionType === 'both') {
            subscriptionDiscount += partsTotal * 0.05
          }
          
          // Total final: subtotal - discount + urgent - subscriptionDiscount
          const finalTotal = subtotal - totalDiscount + urgentAmount - subscriptionDiscount
          trayTotalMap.set(trayId, Math.max(0, finalTotal))
        })
        
        // OPTIMIZAT: Folosește cache-ul de tehnicieni în loc de apeluri individuale auth.getUser
        // Mapăază fiecare tray la technician-ul său (primul non-null din tray_items)
        allTrayItems.forEach((ti: any) => {
          if (!technicianMap.has(ti.tray_id) && ti.technician_id) {
            // Folosește cache-ul global de tehnicieni (încărcat la început)
            const techName = technicianCache.get(ti.technician_id) || 'Necunoscut'
            technicianMap.set(ti.tray_id, techName)
          }
        })
      }
    }

    // Calculează totalurile pentru leads și service_files (suma tuturor tăvițelor asociate)
    const leadTotalMap = new Map<string, number>()
    const serviceFileTotalMap = new Map<string, number>()
    
    // Obține toate lead-urile care au carduri în pipeline-ul curent (pentru calcul totaluri)
    const leadIdsInPipeline = [
      ...leadsData.map((l: any) => l.id),
      ...serviceFilesData.map((sf: any) => sf.lead_id).filter(Boolean),
      ...traysData.map((t: any) => t.service_file?.lead_id).filter(Boolean)
    ]
    const uniqueLeadIdsForTotals = [...new Set(leadIdsInPipeline)]
    
    if (uniqueLeadIdsForTotals.length > 0) {
      // Obține TOATE service_files pentru aceste lead-uri (nu doar cele din pipeline-ul curent)
      const { data: allServiceFilesForLeads } = await supabase
        .from('service_files')
        .select('id, lead_id')
        .in('lead_id', uniqueLeadIdsForTotals)
      
      if (allServiceFilesForLeads && allServiceFilesForLeads.length > 0) {
        const allServiceFileIds = allServiceFilesForLeads.map((sf: any) => sf.id)
        
        // Obține TOATE tăvițele pentru aceste service_files
        const { data: allTraysForServiceFiles } = await supabase
          .from('trays')
          .select('id, service_file_id')
          .in('service_file_id', allServiceFileIds)
        
        if (allTraysForServiceFiles && allTraysForServiceFiles.length > 0) {
          const allTrayIds = allTraysForServiceFiles.map((t: any) => t.id)
          
          // Calculează totalurile pentru toate tăvițele (nu doar cele din pipeline-ul curent)
          // Folosim aceeași logică ca mai sus, dar pentru toate tăvițele
          const allTrayItemsResult = await supabase
            .from('tray_items')
            .select('tray_id, notes, qty, service_id')
            .in('tray_id', allTrayIds)
          
          const allTrayItemsComplete = allTrayItemsResult.data || []
          // subscription_type nu există în trays - folosim map gol
          const allSubscriptionTypeMap = new Map<string, 'services' | 'parts' | 'both' | ''>()
          
          // Obține prețurile serviciilor
          const serviceIdsComplete = [...new Set(allTrayItemsComplete.map((ti: any) => ti.service_id).filter(Boolean))]
          let servicePriceMapComplete = new Map<string, number>()
          
          if (serviceIdsComplete.length > 0) {
            const { data: servicesDataComplete } = await supabase
              .from('services')
              .select('id, price')
              .in('id', serviceIdsComplete)
            
            if (servicesDataComplete) {
              servicesDataComplete.forEach((s: any) => {
                servicePriceMapComplete.set(s.id, s.price || 0)
              })
            }
          }
          
          // Calculează totalurile pentru toate tăvițele
          const allTrayItemsMap = new Map<string, any[]>()
          allTrayItemsComplete.forEach((ti: any) => {
            if (!allTrayItemsMap.has(ti.tray_id)) {
              allTrayItemsMap.set(ti.tray_id, [])
            }
            allTrayItemsMap.get(ti.tray_id)!.push(ti)
          })
          
          const allTrayTotalMap = new Map<string, number>()
          
          // Folosește totalurile deja calculate pentru trays din pipeline-ul curent
          trayTotalMap.forEach((total, trayId) => {
            allTrayTotalMap.set(trayId, total)
          })
          
          // Calculează totalurile doar pentru trays care nu sunt deja în trayTotalMap
          allTrayItemsMap.forEach((items, trayId) => {
            // Dacă deja am calculat totalul pentru această tăviță, sări-l
            if (allTrayTotalMap.has(trayId)) {
              return
            }
            const visibleItems = items.filter((ti: any) => {
              if (!ti.notes) return true
              try {
                const notesData = JSON.parse(ti.notes)
                return notesData.item_type !== null && notesData.item_type !== undefined
              } catch {
                return true
              }
            })
            
            let subtotal = 0
            let totalDiscount = 0
            let urgentAmount = 0
            let servicesTotal = 0
            let partsTotal = 0
            
            visibleItems.forEach((ti: any) => {
              const qty = ti.qty || 1
              let itemPrice = 0
              let discountPct = 0
              let isUrgent = false
              let itemType: 'service' | 'part' | null = null
              
              if (ti.notes) {
                try {
                  const notesData = JSON.parse(ti.notes)
                  itemPrice = notesData.price || 0
                  discountPct = notesData.discount_pct || 0
                  isUrgent = notesData.urgent || false
                  itemType = notesData.item_type || null
                } catch (e) {
                  // Notes nu este JSON
                }
              }
              
              if (!itemPrice && ti.service_id) {
                itemPrice = servicePriceMapComplete.get(ti.service_id) || 0
                if (!itemType) itemType = 'service'
              }
              
              if (!itemType && !ti.service_id) {
                itemType = 'part'
              }
              
              const base = qty * itemPrice
              const disc = base * (Math.min(100, Math.max(0, discountPct)) / 100)
              const afterDisc = base - disc
              const urgent = isUrgent ? afterDisc * (URGENT_MARKUP_PCT / 100) : 0
              
              subtotal += base
              totalDiscount += disc
              urgentAmount += urgent
              
              const itemTotal = afterDisc + urgent
              if (itemType === 'service') {
                servicesTotal += itemTotal
              } else if (itemType === 'part') {
                partsTotal += itemTotal
              }
            })
            
            const subscriptionType = allSubscriptionTypeMap.get(trayId) || ''
            let subscriptionDiscount = 0
            if (subscriptionType === 'services' || subscriptionType === 'both') {
              subscriptionDiscount += servicesTotal * 0.10
            }
            if (subscriptionType === 'parts' || subscriptionType === 'both') {
              subscriptionDiscount += partsTotal * 0.05
            }
            
            const finalTotal = subtotal - totalDiscount + urgentAmount - subscriptionDiscount
            allTrayTotalMap.set(trayId, Math.max(0, finalTotal))
          })
          
          // Calculează totalurile pentru service_files (suma tuturor tăvițelor)
          allTraysForServiceFiles.forEach((t: any) => {
            const trayTotal = allTrayTotalMap.get(t.id) || 0
            const serviceFileId = t.service_file_id
            
            const currentSfTotal = serviceFileTotalMap.get(serviceFileId) || 0
            serviceFileTotalMap.set(serviceFileId, currentSfTotal + trayTotal)
          })
          
          // Calculează totalurile pentru leads (suma tuturor service_files ale lead-ului)
          allServiceFilesForLeads.forEach((sf: any) => {
            const sfTotal = serviceFileTotalMap.get(sf.id) || 0
            const leadId = sf.lead_id
            
            const currentLeadTotal = leadTotalMap.get(leadId) || 0
            leadTotalMap.set(leadId, currentLeadTotal + sfTotal)
          })
        }
      }
    }

    // Construiește rezultatul
    const kanbanItems: KanbanItem[] = []

    // Procesează leads
    leadsData.forEach((lead: any) => {
      const pipelineItem = pipelineItemMap.get(`lead:${lead.id}`)
      if (!pipelineItem) return

      kanbanItems.push({
        id: lead.id,
        name: lead.full_name || 'Unknown',
        email: lead.email || '',
        phone: lead.phone_number || '',
        stage: (pipelineItem.stage as any)?.name || '',
        createdAt: lead.created_at,
        campaignName: lead.campaign_name,
        adName: lead.ad_name,
        formName: lead.form_name,
        leadId: lead.id,
        stageId: pipelineItem.stage_id,
        pipelineId: pipelineItem.pipeline_id,
        assignmentId: pipelineItem.id,
        tags: tagMap.get(lead.id) || [],
        stageMovedAt: pipelineItem.updated_at,
        type: 'lead',
        total: leadTotalMap.get(lead.id) || 0,
      })
    })

    // Procesează service_files
    serviceFilesData.forEach((serviceFile: any) => {
      const pipelineItem = pipelineItemMap.get(`service_file:${serviceFile.id}`)
      if (!pipelineItem || !serviceFile.lead) return

      const lead = serviceFile.lead

      kanbanItems.push({
        id: serviceFile.id,
        name: lead.full_name || 'Unknown',
        email: lead.email || '',
        phone: lead.phone_number || '',
        stage: (pipelineItem.stage as any)?.name || '',
        createdAt: serviceFile.created_at,
        campaignName: lead.campaign_name,
        adName: lead.ad_name,
        formName: lead.form_name,
        leadId: lead.id,
        stageId: pipelineItem.stage_id,
        pipelineId: pipelineItem.pipeline_id,
        assignmentId: pipelineItem.id,
        tags: tagMap.get(lead.id) || [],
        stageMovedAt: pipelineItem.updated_at,
        type: 'service_file',
        serviceFileNumber: serviceFile.number,
        serviceFileStatus: serviceFile.status,
        isReadOnly: (pipelineItem as any).isReadOnly || false,
        total: serviceFileTotalMap.get(serviceFile.id) || 0,
      })
    })

    // Procesează trays
    traysData.forEach((tray: any) => {
      const pipelineItem = pipelineItemMap.get(`tray:${tray.id}`)
      if (!pipelineItem || !tray.service_file?.lead) return

      const lead = tray.service_file.lead

      kanbanItems.push({
        id: tray.id,
        name: lead.full_name || 'Unknown',
        email: lead.email || '',
        phone: lead.phone_number || '',
        stage: (pipelineItem.stage as any)?.name || '',
        createdAt: tray.created_at,
        campaignName: lead.campaign_name,
        adName: lead.ad_name,
        formName: lead.form_name,
        leadId: lead.id,
        stageId: pipelineItem.stage_id,
        pipelineId: pipelineItem.pipeline_id,
        assignmentId: pipelineItem.id,
        tags: tagMap.get(lead.id) || [],
        stageMovedAt: pipelineItem.updated_at,
        technician: technicianMap.get(tray.id) || null,
        type: 'tray',
        trayNumber: tray.number,
        traySize: tray.size,
        trayStatus: tray.status,
        total: trayTotalMap.get(tray.id) || 0,
      })
    })

    // LOGICĂ SPECIALĂ: Adaugă tăvițele din stage-urile specifice în stage-ul "In asteptare"
    if (pipelineId) {
      // Găsește pipeline-ul curent pentru a verifica dacă este Saloane, Frizerii sau Horeca
      const currentPipeline = allPipelines.find((p: any) => p.id === pipelineId)
      const isDeptPipeline = currentPipeline && ['Saloane', 'Frizerii', 'Horeca'].includes(currentPipeline.name)
      
      // Găsește stage-ul "In asteptare" din pipeline-ul curent
      const { data: currentPipelineStages } = await supabase
        .from('stages')
        .select('id, name')
        .eq('pipeline_id', pipelineId)
      
      const inAsteptareStage = currentPipelineStages?.find((s: any) => 
        s.name.toLowerCase().includes('in asteptare') || s.name.toLowerCase().includes('asteptare')
      )
      
      if (inAsteptareStage) {
        // Găsește pipeline-urile Saloane, Frizerii, Horeca
        const { data: deptPipelines } = await supabase
          .from('pipelines')
          .select('id, name')
          .in('name', ['Saloane', 'Frizerii', 'Horeca'])
        
        // Găsește pipeline-ul Reparatii
        const { data: reparatiiPipeline } = await supabase
          .from('pipelines')
          .select('id, name')
          .eq('name', 'Reparatii')
          .single()
        
        const targetStageIds: string[] = []
        
        // Găsește stage-ul "In asteptare" din Saloane, Frizerii, Horeca
        if (deptPipelines && deptPipelines.length > 0) {
          const deptPipelineIds = deptPipelines.map((p: any) => p.id)
          const { data: deptInAsteptareStages } = await supabase
            .from('stages')
            .select('id, name')
            .in('pipeline_id', deptPipelineIds)
            .or('name.ilike.%in asteptare%,name.ilike.%asteptare%')
          
          if (deptInAsteptareStages) {
            targetStageIds.push(...deptInAsteptareStages.map((s: any) => s.id))
          }
        }
        
        // Găsește stage-ul "Astept piese" din Reparatii
        if (reparatiiPipeline) {
          const { data: asteptPieseStage } = await supabase
            .from('stages')
            .select('id, name')
            .eq('pipeline_id', reparatiiPipeline.id)
            .or('name.ilike.%astept piese%,name.ilike.%asteptare piese%')
          
          if (asteptPieseStage && asteptPieseStage.length > 0) {
            targetStageIds.push(...asteptPieseStage.map((s: any) => s.id))
          }
        }
        
        // Găsește tăvițele din aceste stage-uri
        if (targetStageIds.length > 0) {
          const { data: specialTrayItems } = await supabase
            .from('pipeline_items')
            .select('id, item_id, stage_id, pipeline_id')
            .eq('type', 'tray')
            .in('stage_id', targetStageIds)
          
          if (specialTrayItems && specialTrayItems.length > 0) {
            // Creează un map pentru a găsi rapid pipeline_item ID-ul pentru fiecare tăviță
            const trayToPipelineItemMap = new Map<string, { id: string; pipeline_id: string; stage_id: string }>()
            specialTrayItems.forEach((item: any) => {
              trayToPipelineItemMap.set(item.item_id, {
                id: item.id,
                pipeline_id: item.pipeline_id,
                stage_id: item.stage_id
              })
            })
            
            const specialTrayIds = specialTrayItems.map((item: any) => item.item_id)
            
            // Obține datele pentru aceste tăvițe (dacă nu sunt deja în traysData)
            const existingTrayIds = new Set(traysData.map((t: any) => t.id))
            const newTrayIds = specialTrayIds.filter(id => !existingTrayIds.has(id))
            
            if (newTrayIds.length > 0) {
              const { data: specialTrays } = await supabase
                .from('trays')
                .select(`
                  id,
                  number,
                  size,
                  status,
                  created_at,
                  service_file_id,
                  service_file:service_files!inner(
                    id,
                    lead_id,
                    lead:leads!inner(id, full_name, email, phone_number, created_at, campaign_name, ad_name, form_name)
                  )
                `)
                .in('id', newTrayIds)
              
              if (specialTrays && specialTrays.length > 0) {
                // Obține tags și technician pentru aceste tăvițe
                const specialTrayLeadIds = specialTrays.map((t: any) => t.service_file?.lead?.id).filter(Boolean)
                const specialTrayIdsForTech = specialTrays.map((t: any) => t.id)
                
                // Obține tags pentru leads
                if (specialTrayLeadIds.length > 0) {
                  const { data: specialTags } = await supabase
                    .from('lead_tags')
                    .select('lead_id, tag:tags(id, name, color)')
                    .in('lead_id', specialTrayLeadIds)
                  
                  if (specialTags) {
                    specialTags.forEach((lt: any) => {
                      if (lt.tag && lt.lead_id) {
                        const existingTags = tagMap.get(lt.lead_id) || []
                        if (!existingTags.find((t: any) => t.id === lt.tag.id)) {
                          tagMap.set(lt.lead_id, [...existingTags, {
                            id: lt.tag.id,
                            name: lt.tag.name,
                            color: lt.tag.color || 'blue'
                          }])
                        }
                      }
                    })
                  }
                }
                
                // Obține technician pentru tăvițe
                if (specialTrayIdsForTech.length > 0) {
                  const { data: specialTrayItemsForTech } = await supabase
                    .from('tray_items')
                    .select('tray_id, technician_id')
                    .in('tray_id', specialTrayIdsForTech)
                    .not('technician_id', 'is', null)
                    .limit(1)
                  
                  if (specialTrayItemsForTech && specialTrayItemsForTech.length > 0) {
                    const techIds = [...new Set(specialTrayItemsForTech.map((ti: any) => ti.technician_id).filter(Boolean))]
                    if (techIds.length > 0) {
                      const { data: techData } = await supabase
                        .from('app_members')
                        .select('user_id, name, email')
                        .in('user_id', techIds)
                      
                      if (techData) {
                        specialTrayItemsForTech.forEach((ti: any) => {
                          const tech = techData.find((t: any) => t.user_id === ti.technician_id)
                          if (tech) {
                            const techName = tech.name || tech.email?.split('@')[0] || `User ${tech.user_id.slice(0, 8)}`
                            technicianMap.set(ti.tray_id, techName)
                          }
                        })
                      }
                    }
                  }
                }
                
                // Obține total-urile pentru aceste tăvițe
                const specialTrayTotals = await Promise.all(
                  specialTrays.map(async (tray: any) => {
                    const { data: items } = await supabase
                      .from('tray_items')
                      .select('qty, service_id, part_id')
                      .eq('tray_id', tray.id)
                    
                    if (!items || items.length === 0) return { trayId: tray.id, total: 0 }
                    
                    let total = 0
                    for (const item of items) {
                      if (item.service_id) {
                        const { data: service } = await supabase
                          .from('services')
                          .select('price')
                          .eq('id', item.service_id)
                          .single()
                        if (service) {
                          total += (item.qty || 1) * (service.price || 0)
                        }
                      } else if (item.part_id) {
                        const { data: part } = await supabase
                          .from('parts')
                          .select('price')
                          .eq('id', item.part_id)
                          .single()
                        if (part) {
                          total += (item.qty || 1) * (part.price || 0)
                        }
                      }
                    }
                    return { trayId: tray.id, total }
                  })
                )
                
                specialTrayTotals.forEach(({ trayId, total }) => {
                  trayTotalMap.set(trayId, total)
                })
                
                // Adaugă tăvițele în kanbanItems cu stage-ul "In asteptare"
                specialTrays.forEach((tray: any) => {
                  if (!tray.service_file?.lead) return
                  
                  const lead = tray.service_file.lead
                  
                  // Găsește pipeline_item-ul real pentru această tăviță (din pipeline-ul original)
                  const originalPipelineItem = trayToPipelineItemMap.get(tray.id)
                  
                  // Dacă tăvița nu are pipeline_item în pipeline-ul curent, verifică dacă trebuie creat unul
                  // Pentru pipeline-urile Saloane, Frizerii, Horeca, folosim pipeline_item-ul din pipeline-ul original
                  let assignmentId: string
                  let actualPipelineId = pipelineId
                  let actualStageId = inAsteptareStage.id
                  
                  if (originalPipelineItem && isDeptPipeline) {
                    // Pentru pipeline-urile departamentelor, folosim pipeline_item-ul din pipeline-ul original
                    // Dar actualizăm stage-ul la "In asteptare" din pipeline-ul curent
                    assignmentId = originalPipelineItem.id
                    // Dacă tăvița este mutată în pipeline-ul curent, trebuie să avem un pipeline_item aici
                    // Verifică dacă există deja un pipeline_item în pipeline-ul curent
                    const existingInCurrentPipeline = pipelineItems.find((pi: any) => 
                      pi.type === 'tray' && pi.item_id === tray.id && pi.pipeline_id === pipelineId
                    )
                    if (existingInCurrentPipeline) {
                      assignmentId = existingInCurrentPipeline.id
                      actualStageId = existingInCurrentPipeline.stage_id
                    } else {
                      // Dacă nu există, folosim ID-ul din pipeline-ul original pentru a permite mutarea
                      assignmentId = originalPipelineItem.id
                    }
                  } else {
                    // Pentru alte cazuri, folosim ID virtual
                    assignmentId = `virtual-${tray.id}`
                  }
                  
                  kanbanItems.push({
                    id: tray.id,
                    name: lead.full_name || 'Unknown',
                    email: lead.email || '',
                    phone: lead.phone_number || '',
                    stage: inAsteptareStage.name,
                    createdAt: tray.created_at,
                    campaignName: lead.campaign_name,
                    adName: lead.ad_name,
                    formName: lead.form_name,
                    leadId: lead.id,
                    stageId: actualStageId,
                    pipelineId: actualPipelineId,
                    assignmentId: assignmentId,
                    tags: tagMap.get(lead.id) || [],
                    stageMovedAt: tray.created_at,
                    technician: technicianMap.get(tray.id) || null,
                    type: 'tray',
                    trayNumber: tray.number,
                    traySize: tray.size,
                    trayStatus: tray.status,
                    total: trayTotalMap.get(tray.id) || 0,
                    // Permite drag and drop pentru tăvițele din "In asteptare" în pipeline-urile Saloane, Frizerii, Horeca
                    isReadOnly: !isDeptPipeline, // Doar pentru pipeline-urile departamentelor (Saloane, Frizerii, Horeca) permitem drag and drop
                  })
                })
              }
            }
          }
        }
      }
    }

    console.log(`✅ getKanbanItems completat în ${(performance.now() - startTime).toFixed(0)}ms - ${kanbanItems.length} items`)
    return { data: kanbanItems, error: null }
  } catch (error) {
    console.error('❌ Eroare getKanbanItems:', error)
    return { data: [], error }
  }
}

/**
 * Obține un singur item Kanban (pentru incremental updates)
 */
export async function getSingleKanbanItem(
  type: PipelineItemType,
  itemId: string,
  pipelineId: string
): Promise<{ data: KanbanItem | null; error: any }> {
  try {
    const { data: pipelineItem, error: itemError } = await supabase
      .from('pipeline_items')
      .select(`
        id,
        type,
        item_id,
        pipeline_id,
        stage_id,
        created_at,
        updated_at,
        stage:stages(id, name)
      `)
      .eq('type', type)
      .eq('item_id', itemId)
      .eq('pipeline_id', pipelineId)
      .single()

    if (itemError || !pipelineItem) {
      return { data: null, error: itemError }
    }

    let kanbanItem: KanbanItem | null = null

    if (type === 'lead') {
      const { data: lead } = await supabase
        .from('leads')
        .select('id, full_name, email, phone_number, created_at, campaign_name, ad_name, form_name')
        .eq('id', itemId)
        .single()

      if (!lead) return { data: null, error: new Error('Lead not found') }

      const { data: tagRows } = await supabase
        .from('v_lead_tags')
        .select('lead_id, tags')
        .eq('lead_id', itemId)
        .single()

      kanbanItem = {
        id: lead.id,
        name: lead.full_name || 'Unknown',
        email: lead.email || '',
        phone: lead.phone_number || '',
        stage: (pipelineItem.stage as any)?.name || '',
        createdAt: lead.created_at,
        campaignName: lead.campaign_name,
        adName: lead.ad_name,
        formName: lead.form_name,
        leadId: lead.id,
        stageId: pipelineItem.stage_id,
        pipelineId: pipelineItem.pipeline_id,
        assignmentId: pipelineItem.id,
        tags: tagRows?.tags || [],
        stageMovedAt: pipelineItem.updated_at,
        technician: null,
        type: 'lead',
      }
    } else if (type === 'service_file') {
      const { data: serviceFile } = await supabase
        .from('service_files')
        .select(`
          id,
          lead_id,
          number,
          status,
          created_at,
          lead:leads(id, full_name, email, phone_number, created_at, campaign_name, ad_name, form_name)
        `)
        .eq('id', itemId)
        .single()

      if (!serviceFile || !serviceFile.lead) return { data: null, error: new Error('Service file not found') }

      const lead = serviceFile.lead

      const { data: tagRows } = await supabase
        .from('v_lead_tags')
        .select('lead_id, tags')
        .eq('lead_id', lead.id)
        .single()

      kanbanItem = {
        id: serviceFile.id,
        name: lead.full_name || 'Unknown',
        email: lead.email || '',
        phone: lead.phone_number || '',
        stage: (pipelineItem.stage as any)?.name || '',
        createdAt: serviceFile.created_at,
        campaignName: lead.campaign_name,
        adName: lead.ad_name,
        formName: lead.form_name,
        leadId: lead.id,
        stageId: pipelineItem.stage_id,
        pipelineId: pipelineItem.pipeline_id,
        assignmentId: pipelineItem.id,
        tags: tagRows?.tags || [],
        stageMovedAt: pipelineItem.updated_at,
        technician: null,
        type: 'service_file',
        serviceFileNumber: serviceFile.number,
        serviceFileStatus: serviceFile.status,
      }
    } else if (type === 'tray') {
      const { data: tray } = await supabase
        .from('trays')
        .select(`
          id,
          number,
          size,
          status,
          created_at,
          service_file_id,
          service_file:service_files!inner(lead_id, lead:leads!inner(id, full_name, email, phone_number, created_at, campaign_name, ad_name, form_name))
        `)
        .eq('id', itemId)
        .single()

      if (!tray || !tray.service_file?.lead) return { data: null, error: new Error('Tray not found') }

      const lead = tray.service_file.lead

      const { data: tagRows } = await supabase
        .from('v_lead_tags')
        .select('lead_id, tags')
        .eq('lead_id', lead.id)
        .single()

      // Obține technician din tray_items
      const { data: trayItems } = await supabase
        .from('tray_items')
        .select('technician_id')
        .eq('tray_id', itemId)
        .not('technician_id', 'is', null)
        .limit(1)
        .single()

      let technician: string | null = null
      if (trayItems?.technician_id) {
        // Obține numele technician-ului din app_members sau user_metadata
        try {
          const { data: { user } } = await supabase.auth.getUser(trayItems.technician_id)
          technician = 
            (user?.user_metadata as any)?.name ||
            (user?.user_metadata as any)?.full_name ||
            user?.email?.split('@')[0] ||
            null
        } catch (error) {
          // Dacă nu se poate obține utilizatorul, lasă null
          technician = null
        }
      }

      kanbanItem = {
        id: tray.id,
        name: lead.full_name || 'Unknown',
        email: lead.email || '',
        phone: lead.phone_number || '',
        stage: (pipelineItem.stage as any)?.name || '',
        createdAt: tray.created_at,
        campaignName: lead.campaign_name,
        adName: lead.ad_name,
        formName: lead.form_name,
        leadId: lead.id,
        stageId: pipelineItem.stage_id,
        pipelineId: pipelineItem.pipeline_id,
        assignmentId: pipelineItem.id,
        tags: tagRows?.tags || [],
        stageMovedAt: pipelineItem.updated_at,
        technician: technician,
        type: 'tray',
        trayNumber: tray.number,
        traySize: tray.size,
        trayStatus: tray.status,
      }
    }

    return { data: kanbanItem, error: null }
  } catch (error) {
    return { data: null, error }
  }
}

/**
 * Obține items-urile Kanban filtrate după tip
 */
export async function getKanbanItemsByType(
  type: PipelineItemType,
  pipelineId?: string
): Promise<{ data: KanbanItem[]; error: any }> {
  const result = await getKanbanItems(pipelineId)
  if (result.error) return result

  const filtered = result.data.filter(item => item.type === type)
  return { data: filtered, error: null }
}

