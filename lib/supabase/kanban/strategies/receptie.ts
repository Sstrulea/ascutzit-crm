/**
 * Receptie Pipeline Strategy
 * 
 * Handles the Receptie pipeline which displays service files.
 * Also handles "virtual" service files based on trays in department pipelines
 * that are in specific stages (In Lucru, In Asteptare, Finalizare).
 */

import { supabaseBrowser } from '../../supabaseClient'
import type { PipelineStrategy } from './base'
import type { KanbanItem, KanbanContext, PipelineItemWithStage, RawServiceFile, RawTray, RawTrayItem } from '../types'
import { 
  fetchPipelineItemsReceptie,
  fetchTrayPipelineItemsBatch,
  fetchServiceFilesByIds,
  fetchTagsForLeads,
  fetchTrayItems,
  fetchServicePrices,
  fetchTraysForServiceFiles,
  fetchUserMessageCountByLeadIds
} from '../fetchers'
import type { TrayPipelineItemRow } from '../fetchers'
import { moveItemToStage, addServiceFileToPipeline } from '../../pipelineOperations'
import { loadTechnicianCache, getTechnicianName, getStagesForPipeline } from '../cache'
import { 
  groupPipelineItemsByType, 
  getPipelineItem,
  transformServiceFileToKanbanItem,
  transformTrayToKanbanItem,
  extractTechnicianMap,
  extractAllTechniciansMapFromTrays,
  calculateTrayTotals
} from '../transformers'
import { 
  DEPARTMENT_PIPELINES, 
  findStageByPattern,
  matchesStagePattern 
} from '../constants'

/** Tip pentru valoarea Map-ului returnat de getAllTraysInfoForServiceFiles (evită ambiguitatea parsării în tipul de return). */
type ReceptieTrayInfo = {
  trays: Array<{
    trayId: string
    trayNumber: string | null
    technician: string | null
    status: 'in_lucru' | 'in_asteptare' | 'finalizare' | 'noua' | null
    department: string | null
    executionTime: string | null
    qcValidated?: boolean | null
  }>
  hasInLucru: boolean
  hasInAsteptare: boolean
  allFinalizare: boolean
  allQcValidated: boolean
  hasNoua: boolean
  deptAssignedAt: string | null
}

/** Log la fiecare apel DB din pipeline Receptie: ce s-a apelat și dacă e într-un loop (for/while/forEach). */
function logReceptieDb(apel: string, inLoop: boolean): void {
  console.log('[Receptie DB]', apel, '| inLoop:', inLoop)
}

export class ReceptiePipelineStrategy implements PipelineStrategy {
  
  canHandle(context: KanbanContext): boolean {
    return context.pipelineInfo.isReceptie
  }
  
  async loadItems(context: KanbanContext): Promise<KanbanItem[]> {
    // Dept stage ids pentru un singur request pipeline_items (Receptie + tray în departamente)
    const deptStageIds = this.getReceptieDeptStageIds(context)
    logReceptieDb('loadTechnicianCache()', false)
    logReceptieDb('fetchPipelineItemsReceptie(pipelineId, deptStageIds)', false)
    const [_, pipelineItemsResult] = await Promise.all([
      loadTechnicianCache(),
      fetchPipelineItemsReceptie(context.pipelineId, deptStageIds)
    ])
    
    if (pipelineItemsResult.error) {
      throw pipelineItemsResult.error
    }
    
    const pipelineItems = pipelineItemsResult.receptieItems
    const trayItemsInDept = pipelineItemsResult.trayItemsInDept
    let { serviceFiles, itemMap } = groupPipelineItemsByType(pipelineItems)
    
    // Stages Receptie din cache (evită fetch suplimentar – recomandare 6.2)
    const receptieStages = getStagesForPipeline(context.allStages, context.pipelineId)
    
    // IMPORTANT: Load service files with office_direct or curier_trimis directly from DB
    // even if they're not in pipeline_items yet
    const supabase = supabaseBrowser()
    logReceptieDb("supabase.from('service_files').select(...) office_direct/curier_trimis", false)
    const selectWithColet = `
      id, lead_id, number, status, created_at, office_direct, curier_trimis, colet_neridicat, urgent, nu_raspunde_callback_at,
      lead:leads(id, full_name, email, phone_number, created_at, campaign_name, ad_name, form_name, tray_details, details, city, company_name, company_address, address, address2, zip)
    `
    const selectWithoutColet = `
      id, lead_id, number, status, created_at, office_direct, curier_trimis, urgent, nu_raspunde_callback_at,
      lead:leads(id, full_name, email, phone_number, created_at, campaign_name, ad_name, form_name, tray_details, details, city, company_name, company_address, address, address2, zip)
    `
    let directServiceFilesRaw: any[] | null = null
    let { data: dataWithColet, error: errWithColet } = await supabase
      .from('service_files')
      .select(selectWithColet)
      .or('office_direct.eq.true,curier_trimis.eq.true,colet_neridicat.eq.true')
    if (dataWithColet) {
      directServiceFilesRaw = dataWithColet
    } else if (errWithColet) {
      // La orice eroare (coloană lipsă, RLS, etc.) încercăm fallback fără colet_neridicat
      const { data: dataWithoutColet } = await supabase
        .from('service_files')
        .select(selectWithoutColet)
        .or('office_direct.eq.true,curier_trimis.eq.true')
      directServiceFilesRaw = dataWithoutColet || null
    }
    
    // Exclude fișe cu tăvițe "-copy" (arhivate) – acestea trebuie să rămână în Arhivat, nu în Curier Trimis
    let directServiceFiles = directServiceFilesRaw
    if (directServiceFiles && directServiceFiles.length > 0) {
      const { data: traysForDirect } = await supabase
        .from('trays')
        .select('id, number, service_file_id')
        .in('service_file_id', directServiceFiles.map((sf: any) => sf.id))
      const sfIdsWithCopyTray = new Set<string>()
      if (traysForDirect?.length) {
        for (const t of traysForDirect as Array<{ number: string | null; service_file_id: string | null }>) {
          const num = t.number || ''
          if (num.includes('-copy')) {
            if (t.service_file_id) sfIdsWithCopyTray.add(t.service_file_id)
          }
        }
      }
      directServiceFiles = directServiceFiles.filter((sf: any) => !sfIdsWithCopyTray.has(sf.id))
    }
    
    // Add direct service files to the list if not already present
    if (directServiceFiles && directServiceFiles.length > 0) {
      directServiceFiles.forEach((sf: any) => {
        if (!serviceFiles.includes(sf.id)) {
          serviceFiles.push(sf.id)
        }
        // Create pipeline item if it doesn't exist
        const existingItem = itemMap.get(`service_file:${sf.id}`)
        if (!existingItem) {
          // Find appropriate stage based on checkbox / flag
          let targetStage = receptieStages.find(s => {
            const nameLower = s.name.toLowerCase()
            if ((sf as any).colet_neridicat && nameLower.includes('colet') && nameLower.includes('neridicat')) {
              return true
            }
            if (sf.office_direct && (nameLower.includes('office') && nameLower.includes('direct'))) {
              return true
            }
            if (sf.curier_trimis && (nameLower.includes('curier') && nameLower.includes('trimis'))) {
              return true
            }
            return false
          })
          // Fallback to first active stage if no match
          if (!targetStage) {
            targetStage = receptieStages.find(s => s.name) || receptieStages[0]
          }
          if (targetStage) {
            const virtualItem: PipelineItemWithStage = {
              id: `virtual_${sf.id}`,
              type: 'service_file',
              item_id: sf.id,
              pipeline_id: context.pipelineId,
              stage_id: targetStage.id,
              created_at: sf.created_at,
              updated_at: new Date().toISOString(),
              stage: targetStage,
              isReadOnly: false
            }
            itemMap.set(`service_file:${sf.id}`, virtualItem)
          }
        }
      })
    }
    
    // Get virtual service files from department pipelines (trayItemsInDept din același request pipeline_items)
    logReceptieDb('loadVirtualServiceFiles(...)', false)
    const virtualItems = await this.loadVirtualServiceFiles(
      context,
      serviceFiles,
      receptieStages,
      itemMap,
      trayItemsInDept
    )
    
    // Merge virtual items
    virtualItems.serviceFiles.forEach(sf => {
      if (!serviceFiles.includes(sf.id)) {
        serviceFiles.push(sf.id)
      }
    })
    
    virtualItems.pipelineItems.forEach(pi => {
      itemMap.set(`service_file:${pi.item_id}`, pi)
    })
    
    if (serviceFiles.length === 0) {
      return []
    }
    
    // Fetch service files (excluding those already in virtualItems and directServiceFiles)
    const sfIdsToFetch = serviceFiles.filter(
      id => !virtualItems.serviceFileData.has(id) && 
            !(directServiceFiles && Array.isArray(directServiceFiles) && (() => {
        // FOLOSIM FOR LOOP ÎN LOC DE .some() - MAI SIGUR
        for (let i = 0; i < directServiceFiles.length; i++) {
          const sf = directServiceFiles[i] as any
          if (sf && sf.id === id) {
            return true
          }
        }
        return false
      })())
    )
    
    logReceptieDb('fetchServiceFilesByIds(sfIdsToFetch)', false)
    const { data: fetchedServiceFiles } = await fetchServiceFilesByIds(sfIdsToFetch)
    
    // Merge service file data
    const allServiceFiles: RawServiceFile[] = [
      ...fetchedServiceFiles,
      ...Array.from(virtualItems.serviceFileData.values()),
      ...(directServiceFiles || [])
    ]
    
    // Get all lead IDs for tags BEFORE filtering
    const allLeadIds = allServiceFiles
      .map(sf => sf.lead?.id)
      .filter(Boolean) as string[]
    
    // Fetch tags for all service files to check for department tags
    logReceptieDb('fetchTagsForLeads(allLeadIds)', false)
    const { data: tagMap } = await fetchTagsForLeads(allLeadIds)
    
    // Tag-uri de departament care trebuie să apară în Recepție
    const departmentTags = ['Horeca', 'Saloane', 'Frizerii', 'Reparatii']
    
    // Identifică fișele care au tag-uri de departament
    const serviceFilesWithDepartmentTags = new Set<string>()
    allServiceFiles.forEach(sf => {
      if (sf.lead?.id) {
        const leadTags = tagMap.get(sf.lead.id) || []
        // FOLOSIM FOR LOOP ÎN LOC DE .some() - MAI SIGUR
        let hasDepartmentTag = false
        if (Array.isArray(leadTags)) {
          for (let i = 0; i < leadTags.length; i++) {
            const tag = leadTags[i]
            if (tag && tag.name && departmentTags.includes(tag.name)) {
              hasDepartmentTag = true
              break
            }
          }
        }
        if (hasDepartmentTag) {
          serviceFilesWithDepartmentTags.add(sf.id)
        }
      }
    })
    
    // Filter service files: Receptie should show those with office_direct = true OR curier_trimis = true
    // OR those that have trays in work (from virtual items) OR those with department tags
    // OR any fișă that is already in the pipeline (serviceFiles) – altfel fișele din pipeline_items dispar
    const serviceFileIdsSet = new Set(serviceFiles)
    const virtualServiceFileIds = new Set(virtualItems.serviceFileData.keys())
    const filteredServiceFiles = allServiceFiles.filter(sf => {
      if (serviceFileIdsSet.has(sf.id)) return true
      return sf.office_direct === true || 
             sf.curier_trimis === true || 
             (sf as any).colet_neridicat === true ||
             virtualServiceFileIds.has(sf.id) ||
             serviceFilesWithDepartmentTags.has(sf.id)
    })
    
    // Get lead IDs for filtered service files
    const leadIds = filteredServiceFiles
      .map(sf => sf.lead?.id)
      .filter(Boolean) as string[]
    
    let userMessageCountByLeadId = new Map<string, number>()
    if (leadIds.length > 0) {
      const { data: msgCountData } = await fetchUserMessageCountByLeadIds(leadIds).catch(() => ({ data: undefined }))
      if (msgCountData) userMessageCountByLeadId = msgCountData
    }
    
    // 6.1: Un singur pas trays + tray_items – fetch o dată, refolosim pentru totals și tehnician
    const serviceFileIdsForTotals = filteredServiceFiles.map(sf => sf.id)
    let preloadedTraysForTotals: Array<{ id: string; service_file_id: string | null; technician_id?: string | null; technician2_id?: string | null; technician3_id?: string | null }> = []
    let preloadedTrayItems: RawTrayItem[] = []
    if (serviceFileIdsForTotals.length > 0) {
      logReceptieDb("preload: trays (id, service_file_id, technician_*) pentru totals + tehnician", false)
      const { data: traysPreload } = await supabase
        .from('trays')
        .select('id, service_file_id, technician_id, technician2_id, technician3_id')
        .in('service_file_id', serviceFileIdsForTotals)
      if (traysPreload?.length) {
        preloadedTraysForTotals = traysPreload as Array<{ id: string; service_file_id: string | null; technician_id?: string | null; technician2_id?: string | null; technician3_id?: string | null }>
        const allTrayIdsPreload = preloadedTraysForTotals.map(t => t.id)
        logReceptieDb('preload: fetchTrayItems(allTrayIds)', false)
        const { data: itemsPreload } = await fetchTrayItems(allTrayIdsPreload)
        preloadedTrayItems = itemsPreload ?? []
      }
    }
    const [totalsData, technicianMap] = await Promise.all([
      this.calculateServiceFileTotals(serviceFileIdsForTotals, preloadedTraysForTotals.length ? { trays: preloadedTraysForTotals, trayItems: preloadedTrayItems } : undefined),
      this.getTechnicianMapForServiceFiles(serviceFileIdsForTotals, preloadedTraysForTotals.length ? { trays: preloadedTraysForTotals } : undefined)
    ])

    // Numere de tăvițe per fișă (pentru afișare pe card) – folosim preloadedTraysForTotals care nu are number; încărcăm number separat dacă e nevoie
    const trayNumbersBySf = new Map<string, string[]>()
    if (serviceFileIdsForTotals.length > 0) {
      const { data: traysWithNumber } = await supabase
        .from('trays')
        .select('id, number, service_file_id')
        .in('service_file_id', serviceFileIdsForTotals)
      if (traysWithNumber?.length) {
        for (const t of traysWithNumber as Array<{ id: string; number: string | null; service_file_id: string | null }>) {
          const sfId = t.service_file_id
          if (!sfId) continue
          const num = t.number != null && String(t.number).trim() !== '' ? String(t.number).trim() : null
          if (!trayNumbersBySf.has(sfId)) trayNumbersBySf.set(sfId, [])
          if (num) trayNumbersBySf.get(sfId)!.push(num)
        }
      }
    }
    
    const inLucruStage = findStageByPattern(receptieStages, 'IN_LUCRU')
    const inAsteptareStage = findStageByPattern(receptieStages, 'IN_ASTEPTARE')
    const deFacturatStage = findStageByPattern(receptieStages, 'DE_FACTURAT')
    const coletAjunsStage = findStageByPattern(receptieStages, 'COLET_AJUNS')
    const coletNeridicatStage = findStageByPattern(receptieStages, 'COLET_NERIDICAT')
    const curierTrimisStage = findStageByPattern(receptieStages, 'CURIER_TRIMIS')
    const officeDirectStage = findStageByPattern(receptieStages, 'OFFICE_DIRECT')
    const deTrimisStage = findStageByPattern(receptieStages, 'DE_TRIMIS')
    const ridicPersonalStage = findStageByPattern(receptieStages, 'RIDIC_PERSONAL')
    const messagesStage = findStageByPattern(receptieStages, 'MESSAGES')
    const nuRaspundeStage = findStageByPattern(receptieStages, 'NU_RASPUNDE')
    const arhivatStage = findStageByPattern(receptieStages, 'ARHIVAT')

    // Helper: verifică dacă fișa are "Nu raspunde" (tag pe lead sau nu_raspunde_callback_at pe fișă)
    const toSlug = (s: string) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '')
    const hasNuRaspunde = (sf: RawServiceFile) => {
      if ((sf as any).nu_raspunde_callback_at) return true
      const leadId = sf.lead?.id
      if (!leadId) return false
      const leadTags = tagMap.get(leadId) || []
      return Array.isArray(leadTags) && leadTags.some((t: any) => t?.name && toSlug(t.name) === 'nuraspunde')
    }

    // === Încarcă evenimente pentru toate stage-urile relevante ===
    // Căutăm în items_events pentru evenimente de mutare în aceste stage-uri
    const coletAjunsMap = new Map<string, string | null>()
    const coletNeridicatMap = new Map<string, string | null>()
    const deFacturatMap = new Map<string, string | null>()
    const deTrimisMap = new Map<string, string | null>()
    const ridicPersonalMap = new Map<string, string | null>()
    
    try {
      const serviceFileIds = filteredServiceFiles.map(sf => sf.id)
      
      if (serviceFileIds.length > 0) {
        // Caută evenimente de mutare în toate stage-urile relevante
        logReceptieDb("supabase.from('items_events').select(...) pentru toate stage-urile relevante", false)
        const { data: eventsData, error: eventsError } = await supabase
          .from('items_events')
          .select('item_id, created_at, payload')
          .eq('type', 'service_file')
          .in('item_id', serviceFileIds)
          .in('event_type', ['stage_change', 'colet_ajuns', 'colet_neridicat', 'de_facturat', 'de_trimis', 'ridic_personal'])
          .order('created_at', { ascending: true })

        if (!eventsError && Array.isArray(eventsData)) {
          for (const ev of eventsData as any[]) {
            const itemId = ev?.item_id as string | undefined
            const createdAt = ev?.created_at as string | undefined
            if (!itemId || !createdAt) continue
            
            const payload = ev?.payload || {}
            const toStage = payload?.to || ''
            const eventType = ev?.event_type || ''
            const toStageLower = typeof toStage === 'string' ? toStage.toLowerCase() : ''
            
            // Verifică dacă este mutare în "Colet Ajuns"
            if (eventType === 'colet_ajuns' || 
                (eventType === 'stage_change' && toStageLower.includes('colet') && toStageLower.includes('ajuns'))) {
              if (!coletAjunsMap.has(itemId)) {
                coletAjunsMap.set(itemId, createdAt)
              }
            }
            
            // Verifică dacă este mutare în "Colet Neridicat"
            if (eventType === 'colet_neridicat' || 
                (eventType === 'stage_change' && (toStageLower.includes('colet') && toStageLower.includes('neridicat')) ||
                 toStageLower.includes('colet_neridicat') || toStageLower.includes('colet-neridicat'))) {
              if (!coletNeridicatMap.has(itemId)) {
                coletNeridicatMap.set(itemId, createdAt)
              }
            }
            
            // Verifică dacă este mutare în "De Facturat"
            if (eventType === 'de_facturat' || 
                (eventType === 'stage_change' && toStageLower.includes('facturat'))) {
              if (!deFacturatMap.has(itemId)) {
                deFacturatMap.set(itemId, createdAt)
              }
            }
            
            // Verifică dacă este mutare în "De trimis"
            if (eventType === 'de_trimis' || 
                (eventType === 'stage_change' && (toStageLower.includes('de trimis') || toStageLower.includes('detrimis') || 
                 toStageLower.includes('trimis') && !toStageLower.includes('curier')))) {
              if (!deTrimisMap.has(itemId)) {
                deTrimisMap.set(itemId, createdAt)
              }
            }
            
            // Verifică dacă este mutare în "Ridic Personal"
            if (eventType === 'ridic_personal' || 
                (eventType === 'stage_change' && (toStageLower.includes('ridic personal') || toStageLower.includes('ridicpersonal') || 
                 toStageLower.includes('ridica personal') || toStageLower.includes('ridică personal')))) {
              if (!ridicPersonalMap.has(itemId)) {
                ridicPersonalMap.set(itemId, createdAt)
              }
            }
          }
        } else {
          console.warn('[ReceptiePipelineStrategy] Nu pot încărca items_events pentru stage-uri relevante:', eventsError?.message || eventsError)
        }
      }
    } catch (e: any) {
      console.warn('[ReceptiePipelineStrategy] Eroare la încărcarea evenimentelor stage-uri relevante:', e?.message || e)
    }

    // QC este per TĂVIȚĂ (nu per fișă). Statusul se calculează în getAllTraysInfoForServiceFiles()
    
    // Un singur request trays + un singur request pipeline_items (tray în dept); refolosit de ambele metode
    const serviceFileIdsForDept = filteredServiceFiles.map(sf => sf.id)
    const deptPipelineIdsForTray = context.allPipelines
      .filter(p => p?.name && DEPARTMENT_PIPELINES.some(d => p.name!.toLowerCase() === d.toLowerCase()))
      .map(p => p.id)
    let preloadedTrays: Array<{ id: string; number: string | null; service_file_id: string | null; technician_id?: string | null; technician2_id?: string | null; technician3_id?: string | null }> = []
    let preloadedTrayPipelineItems: Array<{ item_id: string; stage_id: string; pipeline_id: string }> = []
    if (serviceFileIdsForDept.length > 0 && deptPipelineIdsForTray.length > 0) {
      logReceptieDb("supabase.from('trays').select(...) preload pentru departamente", false)
      const { data: traysForDept } = await supabase
        .from('trays')
        .select('id, number, service_file_id, technician_id, technician2_id, technician3_id')
        .in('service_file_id', serviceFileIdsForDept)
      if (traysForDept?.length) {
        preloadedTrays = traysForDept as Array<{ id: string; number: string | null; service_file_id: string | null; technician_id?: string | null; technician2_id?: string | null; technician3_id?: string | null }>
        const allTrayIdsForDept = preloadedTrays.map(t => t.id)
        logReceptieDb("supabase.from('pipeline_items').select(...) preload tray în dept", false)
        const { data: piDept } = await supabase
          .from('pipeline_items')
          .select('item_id, stage_id, pipeline_id')
          .eq('type', 'tray')
          .in('item_id', allTrayIdsForDept)
          .in('pipeline_id', deptPipelineIdsForTray)
        if (piDept?.length) {
          preloadedTrayPipelineItems = piDept as Array<{ item_id: string; stage_id: string; pipeline_id: string }>
        }
      }
    }
    // 6.3: Un singur query items_events (QC tray) pentru toate tray IDs – pasat la getAllTraysInfoForServiceFiles
    const preloadedQc = await this.fetchQcEventsForTrays(supabase, preloadedTrays.map(t => t.id))
    const preloaded = preloadedTrays.length
      ? { trays: preloadedTrays, trayPipelineItemsInDept: preloadedTrayPipelineItems, preloadedQc }
      : undefined
    logReceptieDb('getAllTraysInfoForServiceFiles(...)', false)
    logReceptieDb('getServiceFilesWithTraysInDepartments(...)', false)
    const [traysInfoPayload, serviceFilesWithTraysInDepartments] = await Promise.all([
      this.getAllTraysInfoForServiceFiles(context, serviceFileIdsForDept, preloaded),
      this.getServiceFilesWithTraysInDepartments(context, serviceFileIdsForDept, preloaded)
    ])
    const traysInfo = traysInfoPayload.result
    const trayQcValidatedAtMap = traysInfoPayload.trayQcValidatedAtMap
    
    // Move service files to appropriate stage based on priority order (batch: 1 SELECT + K UPDATE + INSERT pentru fără rând).
    // Prioritate (de la cea mai mare la cea mai mică):
    // VIII. Arhivat (cea mai mare prioritate)
    // VII. De trimis, Ridic Personal
    // VI. Nu raspunde
    // V. De Facturat
    // IV. In Asteptare
    // III. In Lucru
    // II. Colet Neridicat, Colet Ajuns
    // I. Curier trimis, Office direct (cea mai mică prioritate)
    type MoveEntry = { serviceFileId: string; targetStage: { id: string; name: string }; pipelineItem: PipelineItemWithStage }
    const moves: MoveEntry[] = []
    // Fișe considerate „Colet ajuns” (ridicat/ajuns) – le scoatem tagul colet_neridicat
    const serviceFileIdsInColetAjuns = new Set<string>()
    filteredServiceFiles.forEach(serviceFile => {
      const pipelineItem = getPipelineItem(itemMap, 'service_file', serviceFile.id)
      if (!pipelineItem) return

      // ========== VIII. ARHIVAT (cea mai mare prioritate) ==========
      // Fișe cu tăvițe "-copy" (arhivate) → mutăm în Arhivat
      const trayNums = trayNumbersBySf.get(serviceFile.id) || []
      const hasCopyTray = trayNums.some((n: string) => n.includes('-copy'))
      if (hasCopyTray && arhivatStage && pipelineItem.stage_id !== arhivatStage.id) {
        moves.push({ serviceFileId: serviceFile.id, targetStage: arhivatStage, pipelineItem })
        return
      }
      if (arhivatStage && pipelineItem.stage_id === arhivatStage.id) return

      // ========== VIIb. COLET AJUNS (flag explicit de la butonul Trimis) ==========
      // Dacă fișa are colet_ajuns = true (marcată „Trimis”), o mutăm în Colet ajuns chiar dacă are eveniment De trimis
      const hasColetAjunsFlag = (serviceFile as any).colet_ajuns === true
      if (hasColetAjunsFlag && coletAjunsStage) {
        serviceFileIdsInColetAjuns.add(serviceFile.id)
        if (pipelineItem.stage_id !== coletAjunsStage.id) {
          moves.push({ serviceFileId: serviceFile.id, targetStage: coletAjunsStage, pipelineItem })
        }
        return
      }

      // ========== VII. DE TRIMIS, RIDIC PERSONAL ==========
      // Verifică evenimente de mutare în "De trimis" sau "Ridic Personal"
      const hasDeTrimisEvent = deTrimisMap.has(serviceFile.id)
      const hasRidicPersonalEvent = ridicPersonalMap.has(serviceFile.id)
      
      if (hasDeTrimisEvent && deTrimisStage) {
        if (pipelineItem.stage_id !== deTrimisStage.id) {
          moves.push({ serviceFileId: serviceFile.id, targetStage: deTrimisStage, pipelineItem })
        }
        return
      }
      
      if (hasRidicPersonalEvent && ridicPersonalStage) {
        if (pipelineItem.stage_id !== ridicPersonalStage.id) {
          moves.push({ serviceFileId: serviceFile.id, targetStage: ridicPersonalStage, pipelineItem })
        }
        return
      }

      // ========== VI. NU RASPUNDE ==========
      // Fișe cu "Nu raspunde" (tag sau callback_at) merg în stage-ul NU RASPUNDE
      if (nuRaspundeStage && hasNuRaspunde(serviceFile)) {
        if (pipelineItem.stage_id !== nuRaspundeStage.id) {
          moves.push({ serviceFileId: serviceFile.id, targetStage: nuRaspundeStage, pipelineItem })
        }
        return
      }
      
      // ========== V. DE FACTURAT ==========
      // Verifică evenimente de mutare în "De Facturat" sau status tăvițe
      const hasDeFacturatEvent = deFacturatMap.has(serviceFile.id)
      const serviceFileTraysInfo = traysInfo.get(serviceFile.id)
      
      if (hasDeFacturatEvent && deFacturatStage) {
        if (pipelineItem.stage_id !== deFacturatStage.id) {
          moves.push({ serviceFileId: serviceFile.id, targetStage: deFacturatStage, pipelineItem })
        }
        return
      }
      
      // Verifică dacă toate tăvițele sunt finalizate și validate în QC
      if (serviceFileTraysInfo && serviceFileTraysInfo.trays.length > 0) {
        if (serviceFileTraysInfo.allFinalizare && serviceFileTraysInfo.allQcValidated && deFacturatStage) {
          if (pipelineItem.stage_id !== deFacturatStage.id) {
            moves.push({ serviceFileId: serviceFile.id, targetStage: deFacturatStage, pipelineItem })
          }
          return
        }
      }

      // ========== IV. IN ASTEPTARE ==========
      // Când o tăviță se află în așteptare
      if (serviceFileTraysInfo && serviceFileTraysInfo.trays.length > 0) {
        if (serviceFileTraysInfo.hasInAsteptare && inAsteptareStage) {
          if (pipelineItem.stage_id !== inAsteptareStage.id) {
            moves.push({ serviceFileId: serviceFile.id, targetStage: inAsteptareStage, pipelineItem })
          }
          return
        }
      }

      // ========== III. IN LUCRU ==========
      // Când o tăviță se află în lucru
      if (serviceFileTraysInfo && serviceFileTraysInfo.trays.length > 0) {
        if (serviceFileTraysInfo.hasInLucru && inLucruStage) {
          if (pipelineItem.stage_id !== inLucruStage.id) {
            moves.push({ serviceFileId: serviceFile.id, targetStage: inLucruStage, pipelineItem })
          }
          return
        }
        // Dacă toate tăvițele sunt finalizate dar nu validate QC, rămâne în In Lucru
        if (serviceFileTraysInfo.allFinalizare && !serviceFileTraysInfo.allQcValidated && inLucruStage) {
          if (pipelineItem.stage_id !== inLucruStage.id) {
            moves.push({ serviceFileId: serviceFile.id, targetStage: inLucruStage, pipelineItem })
          }
          return
        }
      }

      // ========== II. COLET NERIDICAT, COLET AJUNS ==========
      // Verifică evenimente sau flag colet_neridicat pe fișă.
      // Prioritate: dacă fișa e la Colet ajuns (ridicat/ajuns), i se scoate tagul colet_neridicat.
      const hasColetAjunsEvent = coletAjunsMap.has(serviceFile.id)
      const hasColetNeridicatEvent = coletNeridicatMap.has(serviceFile.id) || (serviceFile as any).colet_neridicat === true
      
      if (hasColetAjunsEvent && coletAjunsStage) {
        serviceFileIdsInColetAjuns.add(serviceFile.id)
        if (pipelineItem.stage_id !== coletAjunsStage.id) {
          moves.push({ serviceFileId: serviceFile.id, targetStage: coletAjunsStage, pipelineItem })
        }
        return
      }
      
      if (hasColetNeridicatEvent && coletNeridicatStage) {
        if (pipelineItem.stage_id !== coletNeridicatStage.id) {
          moves.push({ serviceFileId: serviceFile.id, targetStage: coletNeridicatStage, pipelineItem })
        }
        return
      }
      
      // Fallback la "Colet ajuns" când tăvițele sunt trimise în departamente (coletul a ajuns).
      const hasTraysInDepartments = serviceFilesWithTraysInDepartments.has(serviceFile.id)
      if (
        hasTraysInDepartments &&
        coletAjunsStage &&
        serviceFileTraysInfo &&
        serviceFileTraysInfo.trays.length > 0 &&
        !(serviceFileTraysInfo.allFinalizare && serviceFileTraysInfo.allQcValidated)
      ) {
        serviceFileIdsInColetAjuns.add(serviceFile.id)
        if (pipelineItem.stage_id !== coletAjunsStage.id) {
          moves.push({ serviceFileId: serviceFile.id, targetStage: coletAjunsStage, pipelineItem })
        }
        return
      }

      // ========== I. CURIER TRIMIS, OFFICE DIRECT (cea mai mică prioritate) ==========
      // Doar dacă nu există evenimente în stage-uri cu prioritate mai mare,
      // verifică checkbox-urile "Curier Trimis" (exclus dacă e colet_neridicat) și "Office Direct"
      if (curierTrimisStage && serviceFile.curier_trimis === true && (serviceFile as any).colet_neridicat !== true) {
        if (pipelineItem.stage_id !== curierTrimisStage.id) {
          moves.push({ serviceFileId: serviceFile.id, targetStage: curierTrimisStage, pipelineItem })
        }
        return
      }
      
      if (officeDirectStage && serviceFile.office_direct === true) {
        if (pipelineItem.stage_id !== officeDirectStage.id) {
          moves.push({ serviceFileId: serviceFile.id, targetStage: officeDirectStage, pipelineItem })
        }
        return
      }
    })
    
    if (moves.length > 0) {
      const supabase = supabaseBrowser()
      const now = new Date().toISOString()
      logReceptieDb("batch move: supabase.from('pipeline_items').select(id, item_id) pentru service_file", false)
      const { data: pipelineRows, error: selectErr } = await supabase
        .from('pipeline_items')
        .select('id, item_id')
        .eq('type', 'service_file')
        .eq('pipeline_id', context.pipelineId)
        .in('item_id', moves.map(m => m.serviceFileId))
      
      if (selectErr) {
        const { toast } = await import('@/hooks/use-toast')
        toast({
          title: 'Eroare la mutarea fișelor',
          description: selectErr?.message || 'Nu s-a putut muta fișa în stage-ul nou',
          variant: 'destructive'
        })
        const fallbackPromises = moves.map(m =>
          moveItemToStage('service_file', m.serviceFileId, context.pipelineId, m.targetStage.id)
            .then(() => {
              itemMap.set(`service_file:${m.serviceFileId}`, {
                ...m.pipelineItem,
                stage_id: m.targetStage.id,
                stage: m.targetStage,
                updated_at: now
              })
            })
            .catch(err => {
              const { toast: toast2 } = require('@/hooks/use-toast')
              toast2({
                title: `Eroare la mutarea în ${m.targetStage.name}`,
                description: err?.message || 'Nu s-a putut muta fișa',
                variant: 'destructive'
              })
            })
        )
        await Promise.allSettled(fallbackPromises)
      } else {
        const itemIdToRow = new Map<string, { id: string }>()
        for (const row of (pipelineRows || []) as Array<{ id: string; item_id: string }>) {
          itemIdToRow.set(row.item_id, { id: row.id })
        }
        const byTargetStage = new Map<string, string[]>()
        const pipelineItemIdToMove = new Map<string, MoveEntry>()
        const movesWithoutRow: MoveEntry[] = []
        for (const move of moves) {
          const row = itemIdToRow.get(move.serviceFileId)
          if (!row) {
            movesWithoutRow.push(move)
            continue
          }
          if (!byTargetStage.has(move.targetStage.id)) byTargetStage.set(move.targetStage.id, [])
          byTargetStage.get(move.targetStage.id)!.push(row.id)
          pipelineItemIdToMove.set(row.id, move)
        }
        // UPDATE rânduri existente
        for (const [targetStageId, pipelineItemIds] of byTargetStage) {
          if (pipelineItemIds.length === 0) continue
          logReceptieDb(`batch move: supabase.from('pipeline_items').update(stage_id) pentru ${pipelineItemIds.length} items`, false)
          const { error: updateErr } = await supabase
            .from('pipeline_items')
            .update({ stage_id: targetStageId, updated_at: now })
            .in('id', pipelineItemIds)
          if (updateErr) {
            const { toast } = await import('@/hooks/use-toast')
            toast({
              title: 'Eroare la actualizarea stage-ului',
              description: updateErr?.message || 'Nu s-a putut actualiza stage-ul',
              variant: 'destructive'
            })
            const fallbackPromises = pipelineItemIds
              .map(piId => pipelineItemIdToMove.get(piId))
              .filter((m): m is MoveEntry => !!m)
              .map(move =>
                moveItemToStage('service_file', move.serviceFileId, context.pipelineId, move.targetStage.id).then(() => {
                  itemMap.set(`service_file:${move.serviceFileId}`, {
                    ...move.pipelineItem,
                    stage_id: move.targetStage.id,
                    stage: move.targetStage,
                    updated_at: now
                  })
                })
              )
            await Promise.allSettled(fallbackPromises)
          } else {
            for (const piId of pipelineItemIds) {
              const move = pipelineItemIdToMove.get(piId)
              if (move) {
                itemMap.set(`service_file:${move.serviceFileId}`, {
                  ...move.pipelineItem,
                  stage_id: move.targetStage.id,
                  stage: move.targetStage,
                  updated_at: now
                })
              }
            }
          }
        }
        // INSERT pentru fișe care nu au rând în DB (ex. doar office_direct, virtual)
        if (movesWithoutRow.length > 0) {
          const insertByStage = new Map<string, MoveEntry[]>()
          for (const m of movesWithoutRow) {
            if (!insertByStage.has(m.targetStage.id)) insertByStage.set(m.targetStage.id, [])
            insertByStage.get(m.targetStage.id)!.push(m)
          }
          for (const [targetStageId, moveList] of insertByStage) {
            logReceptieDb(`batch move: supabase.from('pipeline_items').insert pentru ${moveList.length} service_file (fără rând)`, false)
            const toInsert = moveList.map(m => ({
              type: 'service_file' as const,
              item_id: m.serviceFileId,
              pipeline_id: context.pipelineId,
              stage_id: targetStageId
            }))
            const { data: inserted, error: insertErr } = await supabase
              .from('pipeline_items')
              .insert(toInsert)
              .select('id, item_id')
            if (insertErr) {
              const { toast } = await import('@/hooks/use-toast')
              toast({
                title: 'Eroare la adăugarea fișei în pipeline',
                description: insertErr?.message || 'Nu s-a putut adăuga fișa în pipeline',
                variant: 'destructive'
              })
              const insertFallbackPromises = moveList.map(move =>
                addServiceFileToPipeline(move.serviceFileId, context.pipelineId, move.targetStage.id).then(({ data }) => {
                  if (data) {
                    itemMap.set(`service_file:${move.serviceFileId}`, {
                      ...move.pipelineItem,
                      id: (data as any)?.id ?? move.pipelineItem.id,
                      stage_id: move.targetStage.id,
                      stage: move.targetStage,
                      updated_at: now
                    })
                  }
                })
              )
              await Promise.allSettled(insertFallbackPromises)
            } else {
              const insertedById = new Map<string, string>()
              for (const r of (inserted || []) as Array<{ id: string; item_id: string }>) {
                insertedById.set(r.item_id, r.id)
              }
              for (const move of moveList) {
                itemMap.set(`service_file:${move.serviceFileId}`, {
                  ...move.pipelineItem,
                  id: insertedById.get(move.serviceFileId) ?? move.pipelineItem.id,
                  stage_id: move.targetStage.id,
                  stage: move.targetStage,
                  updated_at: now
                })
              }
            }
          }
        }
      }
    }

    // Dacă fișa e la Colet ajuns (ridicat/ajuns), scoatem tagul colet_neridicat
    if (serviceFileIdsInColetAjuns.size > 0) {
      const supabaseClear = supabaseBrowser()
      const idsToClear = Array.from(serviceFileIdsInColetAjuns)
      await supabaseClear
        .from('service_files')
        .update({ colet_neridicat: false })
        .in('id', idsToClear)
      // Actualizare în itemMap ca la următoarea încărcare să nu mai folosească flag-ul
      idsToClear.forEach(id => {
        const sf = filteredServiceFiles.find(s => s.id === id) as any
        if (sf) sf.colet_neridicat = false
      })
    }
    
    // Transform service files to KanbanItems
    const kanbanItems: KanbanItem[] = []
    
    filteredServiceFiles.forEach(serviceFile => {
      let pipelineItem = getPipelineItem(itemMap, 'service_file', serviceFile.id)
      if (!pipelineItem || !serviceFile.lead) return
      
      // Fișe cu tăvițe "-copy" (arhivate) se afișează MEREU în Arhivat, indiferent de stage-ul din DB
      const trayNums = trayNumbersBySf.get(serviceFile.id) || []
      const hasCopyTray = trayNums.some((n: string) => n.includes('-copy'))
      if (hasCopyTray && arhivatStage && pipelineItem.stage_id !== arhivatStage.id) {
        pipelineItem = {
          ...pipelineItem,
          stage_id: arhivatStage.id,
          stage: { id: arhivatStage.id, name: arhivatStage.name },
        } as PipelineItemWithStage
      }
      
      const leadId = serviceFile.lead.id
      const leadTagsRaw = tagMap.get(leadId) || []
      const leadTags = Array.isArray(leadTagsRaw) ? leadTagsRaw : []
      
      // IMPORTANT: Pentru fișele de serviciu, tag-ul "urgent" vine din câmpul urgent al fișei, nu din tag-urile lead-ului
      // Filtrează tag-ul "urgent" din tag-urile lead-ului și adaugă-l doar dacă fișa are urgent = true
      const tagsWithoutUrgent = leadTags.filter(tag => tag?.name?.toLowerCase() !== 'urgent')
      const serviceFileTags = [...tagsWithoutUrgent]
      
      // Adaugă tag-ul "urgent" doar dacă fișa de serviciu are urgent = true
      if (serviceFile?.urgent === true) {
        // Caută tag-ul "urgent" în lista de tag-uri existente sau creează unul nou
        const urgentTag = leadTags.find(tag => tag?.name?.toLowerCase() === 'urgent')
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
      const isReadOnly = (pipelineItem as any).isReadOnly || false
      const technician = technicianMap.get(serviceFile.id) || null
      const userMessageCount = userMessageCountByLeadId.get(leadId) ?? 0
      
      const kanbanItem = transformServiceFileToKanbanItem(
        serviceFile,
        pipelineItem,
        serviceFileTags,
        total,
        isReadOnly,
        userMessageCount
      )

      // Add technician name to the kanban item
      if (technician) {
        (kanbanItem as any).technician = technician
      }
      
      // Add trays info for this service file (including those without technician)
      const serviceFileTraysInfo = traysInfo.get(serviceFile.id)
      if (serviceFileTraysInfo && serviceFileTraysInfo.trays.length > 0) {
        (kanbanItem as any).traysInLucru = serviceFileTraysInfo.trays
      }
      // Numerele tăvițelor fișei (pentru afișare pe card: #131, #15)
      const trayNumbers = trayNumbersBySf.get(serviceFile.id)
      if (trayNumbers && trayNumbers.length > 0) {
        (kanbanItem as any).trayNumbers = trayNumbers
      }
      
      // Add QC validation status: mov (purple) if in "In Lucru" but not all trays are validated
      if (serviceFileTraysInfo) {
        const isInLucruStage = matchesStagePattern((pipelineItem as any)?.stage?.name || '', 'IN_LUCRU')
        const allFinalizareButNotValidated = serviceFileTraysInfo.allFinalizare && !serviceFileTraysInfo.allQcValidated
        if (isInLucruStage && allFinalizareButNotValidated) {
          (kanbanItem as any).qcInValidation = true // Flag pentru culoarea mov
        }
        // În "De facturat": data validării QC (ultimul quality_validated dintre tăvițe) pentru afișare în loc de data înregistrării
        const isDeFacturatStage = matchesStagePattern((pipelineItem as any)?.stage?.name || '', 'DE_FACTURAT')
        if (isDeFacturatStage && serviceFileTraysInfo.trays.length > 0 && trayQcValidatedAtMap) {
          let latestQcAt: string | null = null
          for (const t of serviceFileTraysInfo.trays) {
            const at = trayQcValidatedAtMap.get(t.trayId) ?? null
            if (at && (!latestQcAt || at > latestQcAt)) latestQcAt = at
          }
          if (latestQcAt) (kanbanItem as any).qcValidatedAt = latestQcAt
        }
      }

      // === Timp total "la noi" (de la "Colet Ajuns" până la "De Facturat") ===
      try {
        // deFacturatAt este deja calculat mai sus
        ;(kanbanItem as any).deFacturatAt = deFacturatAt

        const formatDurationShort = (ms: number) => {
          if (!Number.isFinite(ms) || ms <= 0) return null
          const totalMinutes = Math.floor(ms / (1000 * 60))
          const hoursTotal = Math.floor(totalMinutes / 60)
          const minutes = totalMinutes % 60
          const days = Math.floor(hoursTotal / 24)
          const hours = hoursTotal % 24
          if (days > 0) return `${days}z ${hours}h ${minutes}min`
          if (hoursTotal > 0) return `${hoursTotal}h ${minutes}min`
          return `${minutes}min`
        }

        // Caută momentul când service file-ul a ajuns în "Colet Ajuns"
        let coletAjunsAt: string | null = coletAjunsMap.get(serviceFile.id) || null
        
        // Fallback: dacă nu găsim în items_events, verifică dacă service file-ul este în "Colet Ajuns"
        // și folosește updated_at când a ajuns acolo
        if (!coletAjunsAt && coletAjunsStage) {
          const currentStageName = String((pipelineItem as any)?.stage?.name || '').toLowerCase()
          const isInColetAjuns = currentStageName.includes('colet') && currentStageName.includes('ajuns')
          
          if (isInColetAjuns) {
            // Dacă este în "Colet Ajuns", folosește updated_at
            coletAjunsAt = (pipelineItem as any)?.updated_at || null
          } else {
            // Fallback final: folosește created_at din pipeline_items
            // (presupunem că service file-ul a ajuns în "Colet Ajuns" când a fost creat în pipeline)
            coletAjunsAt = (pipelineItem as any)?.created_at || null
          }
        }
        
        // Caută momentul când service file-ul a ajuns în "De Facturat"
        let deFacturatAt: string | null = deFacturatMap.get(serviceFile.id) || null
        
        // Fallback: dacă nu găsim în items_events, verifică dacă service file-ul este în "De Facturat"
        if (!deFacturatAt) {
          const currentStageName = String((pipelineItem as any)?.stage?.name || '').toLowerCase()
          const isInDeFacturat = currentStageName.includes('facturat')
          
          if (isInDeFacturat) {
            // Dacă este în "De Facturat", folosește updated_at
            deFacturatAt = (pipelineItem as any)?.updated_at || null
          }
        }

        ;(kanbanItem as any).coletAjunsAt = coletAjunsAt

        if (coletAjunsAt) {
          const start = new Date(coletAjunsAt).getTime()
          const end = deFacturatAt ? new Date(deFacturatAt).getTime() : Date.now()
          const duration = end - start
          ;(kanbanItem as any).timeAtUsText = formatDurationShort(duration)
          ;(kanbanItem as any).timeAtUsDone = !!deFacturatAt
        } else {
          ;(kanbanItem as any).timeAtUsText = null
          ;(kanbanItem as any).timeAtUsDone = false
        }
      } catch (e) {
        // nu blocăm cardul dacă nu putem calcula
        ;(kanbanItem as any).timeAtUsText = null
        ;(kanbanItem as any).timeAtUsDone = false
      }
      
      kanbanItems.push(kanbanItem)
    })

    // Adaugă fișele cu mesaje și în stage-ul Messages (carduri duplicate pentru vizibilitate)
    if (messagesStage && leadIds.length > 0) {
      try {
        logReceptieDb("supabase: conversations + messages pentru stage Messages", false)
        const { data: convs } = await supabase
          .from('conversations')
          .select('id, related_id')
          .eq('type', 'lead')
          .in('related_id', leadIds)
        const convList = (convs || []) as Array<{ id: string; related_id: string }>
        const convIdList = convList.map(c => c.id).filter(Boolean)
        if (convIdList.length > 0) {
          const { data: msgData } = await supabase
            .from('messages')
            .select('conversation_id')
            .in('conversation_id', convIdList)
          const convIdsWithMessages = new Set((msgData || []).map((m: any) => m.conversation_id))
          const leadIdsWithMessages = new Set(
            convList.filter(c => convIdsWithMessages.has(c.id)).map(c => c.related_id)
          )
            filteredServiceFiles.forEach(serviceFile => {
              if (!serviceFile.lead || !leadIdsWithMessages.has(serviceFile.lead.id)) return
              const pipelineItem = getPipelineItem(itemMap, 'service_file', serviceFile.id)
              if (!pipelineItem) return
              // Nu duplica în Messages fișele care sunt în Arhivat – rămân doar în Arhivat
              if (arhivatStage && pipelineItem.stage_id === arhivatStage.id) return
              const leadId = serviceFile.lead.id
              const leadTagsRaw = tagMap.get(leadId) || []
              const leadTags = Array.isArray(leadTagsRaw) ? leadTagsRaw : []
              const tagsWithoutUrgent = leadTags.filter(tag => tag?.name?.toLowerCase() !== 'urgent')
              const serviceFileTags = [...tagsWithoutUrgent]
              if (serviceFile?.urgent === true) {
                const urgentTag = leadTags.find(tag => tag?.name?.toLowerCase() === 'urgent')
                if (urgentTag) serviceFileTags.push(urgentTag)
                else serviceFileTags.push({ id: `urgent_${serviceFile.id}`, name: 'URGENT', color: 'red' as const })
              }
              const total = totalsData.get(serviceFile.id) || 0
              const virtualPipelineItem: PipelineItemWithStage = {
                ...pipelineItem,
                id: `msg_${serviceFile.id}`,
                stage_id: messagesStage.id,
                stage: messagesStage,
              }
              const userMessageCount = userMessageCountByLeadId.get(leadId) ?? 0
              const msgKanbanItem = transformServiceFileToKanbanItem(
                serviceFile,
                virtualPipelineItem,
                serviceFileTags,
                total,
                (pipelineItem as any).isReadOnly || false,
                userMessageCount
              )
              const technician = technicianMap.get(serviceFile.id)
              if (technician) (msgKanbanItem as any).technician = technician
              const serviceFileTraysInfo = traysInfo.get(serviceFile.id)
              if (serviceFileTraysInfo && serviceFileTraysInfo.trays.length > 0) {
                (msgKanbanItem as any).traysInLucru = serviceFileTraysInfo.trays
              }
              kanbanItems.push(msgKanbanItem)
            })
        }
      } catch (e: any) {
        console.warn('[ReceptiePipelineStrategy] Eroare la încărcarea fișelor cu mesaje pentru stage Messages:', e?.message || e)
      }
    }

    return kanbanItems
  }
  
  /** Calculează stage ids de departament pentru request unificat pipeline_items (Receptie). */
  private getReceptieDeptStageIds(context: KanbanContext): string[] {
    const deptPipelines = context.allPipelines.filter(p => {
      if (!p?.name) return false
      const pNameLower = p.name.toLowerCase()
      for (let i = 0; i < DEPARTMENT_PIPELINES.length; i++) {
        if (pNameLower === DEPARTMENT_PIPELINES[i].toLowerCase()) return true
      }
      return false
    })
    if (deptPipelines.length === 0) return []
    const deptPipelineIds = deptPipelines.map(p => p.id)
    const relevantDeptStages = context.allStages.filter(s =>
      deptPipelineIds.includes(s.pipeline_id) &&
      (matchesStagePattern(s.name, 'IN_LUCRU') ||
       matchesStagePattern(s.name, 'IN_ASTEPTARE') ||
       matchesStagePattern(s.name, 'ASTEPT_PIESE') ||
       matchesStagePattern(s.name, 'FINALIZARE') ||
       matchesStagePattern(s.name, 'NOUA'))
    )
    return relevantDeptStages.map(s => s.id)
  }

  /**
   * Un singur fetch items_events (QC) pentru lista de tray IDs – folosit în loadItems pentru consolidare (6.3).
   */
  private async fetchQcEventsForTrays(
    supabase: ReturnType<typeof supabaseBrowser>,
    trayIds: string[]
  ): Promise<{ trayQcValidatedMap: Map<string, boolean | null>; trayQcValidatedAtMap: Map<string, string | null> }> {
    const trayQcValidatedMap = new Map<string, boolean | null>()
    const trayQcValidatedAtMap = new Map<string, string | null>()
    if (trayIds.length === 0) return { trayQcValidatedMap, trayQcValidatedAtMap }
    const qcEventTypes = ['quality_validated', 'quality_not_validated']
    const chunkSize = 1500
    const latestByTray = new Map<string, { created_at: string; event_type: string }>()
    try {
      for (let i = 0; i < trayIds.length; i += chunkSize) {
        const chunk = trayIds.slice(i, i + chunkSize)
        logReceptieDb("fetchQcEventsForTrays: supabase.from('items_events').select(...) QC (tray) batch", false)
        const { data: qcRows, error: qcErr } = await supabase
          .from('items_events')
          .select('item_id, event_type, created_at')
          .eq('type', 'tray')
          .in('item_id', chunk)
          .in('event_type', qcEventTypes as any)
          .order('created_at', { ascending: true })
        if (qcErr) {
          console.warn('[ReceptiePipelineStrategy] fetchQcEventsForTrays:', qcErr?.message || qcErr)
          break
        }
        const rowsAny = Array.isArray(qcRows) ? (qcRows as any[]) : []
        for (const r of rowsAny) {
          const trayId = r?.item_id as string | undefined
          const ev = r?.event_type as string | undefined
          const createdAt = r?.created_at as string | undefined
          if (!trayId || !ev || !createdAt) continue
          latestByTray.set(trayId, { created_at: createdAt, event_type: ev })
        }
      }
      for (const trayId of trayIds) {
        const last = latestByTray.get(trayId)
        if (!last) {
          trayQcValidatedMap.set(trayId, null)
          trayQcValidatedAtMap.set(trayId, null)
        } else {
          const validated = last.event_type === 'quality_validated'
          trayQcValidatedMap.set(trayId, validated)
          trayQcValidatedAtMap.set(trayId, validated ? last.created_at : null)
        }
      }
    } catch (e: any) {
      console.warn('[ReceptiePipelineStrategy] fetchQcEventsForTrays:', e?.message || e)
      for (const trayId of trayIds) {
        trayQcValidatedMap.set(trayId, null)
        trayQcValidatedAtMap.set(trayId, null)
      }
    }
    return { trayQcValidatedMap, trayQcValidatedAtMap }
  }

  /**
   * Load virtual service files based on trays in department pipelines
   * that are in specific stages (In Lucru, In Asteptare, Finalizare).
   * trayItemsInDept: din același request pipeline_items (fetchPipelineItemsReceptie).
   * Returnează allTrayPipelineItems pentru getServiceFilesWithTraysInDepartments / getAllTraysInfoForServiceFiles.
   */
  private async loadVirtualServiceFiles(
    context: KanbanContext,
    existingServiceFiles: string[],
    receptieStages: Array<{ id: string; name: string }>,
    itemMap: Map<string, PipelineItemWithStage>,
    trayItemsInDept: Array<{ item_id: string; stage_id: string; pipeline_id?: string }> = []
  ): Promise<{
    serviceFiles: Array<{ id: string }>
    pipelineItems: PipelineItemWithStage[]
    serviceFileData: Map<string, RawServiceFile>
    allTrayPipelineItems: TrayPipelineItemRow[]
  }> {
    const result = {
      serviceFiles: [] as Array<{ id: string }>,
      pipelineItems: [] as PipelineItemWithStage[],
      serviceFileData: new Map<string, RawServiceFile>(),
      allTrayPipelineItems: [] as TrayPipelineItemRow[]
    }
    
    const supabase = supabaseBrowser()
    
    // Tray ids din departamente: fie din request unificat (trayItemsInDept), fie query separat dacă lipsește
    let trayIds: string[]
    let initialTrayItems: Array<{ item_id: string; stage_id: string }> = []
    if (trayItemsInDept.length > 0) {
      trayIds = trayItemsInDept.map(t => t.item_id)
      initialTrayItems = trayItemsInDept.map(t => ({ item_id: t.item_id, stage_id: t.stage_id }))
    } else {
      const deptPipelines = context.allPipelines.filter(p => {
        if (!p?.name) return false
        const pNameLower = p.name.toLowerCase()
        for (let i = 0; i < DEPARTMENT_PIPELINES.length; i++) {
          if (pNameLower === DEPARTMENT_PIPELINES[i].toLowerCase()) return true
        }
        return false
      })
      if (deptPipelines.length === 0) return result
      const deptPipelineIds = context.allPipelines
        .filter(p => p?.name && DEPARTMENT_PIPELINES.some(d => p.name!.toLowerCase() === d.toLowerCase()))
        .map(p => p.id)
      const relevantDeptStages = context.allStages.filter(s =>
        deptPipelineIds.includes(s.pipeline_id) &&
        (matchesStagePattern(s.name, 'IN_LUCRU') ||
         matchesStagePattern(s.name, 'IN_ASTEPTARE') ||
         matchesStagePattern(s.name, 'ASTEPT_PIESE') ||
         matchesStagePattern(s.name, 'FINALIZARE') ||
         matchesStagePattern(s.name, 'NOUA'))
      )
      if (relevantDeptStages.length === 0) return result
      const targetStageIds = relevantDeptStages.map(s => s.id)
      logReceptieDb("loadVirtualServiceFiles: supabase.from('pipeline_items').select(...) tray in dept stages", false)
      const { data: trayPipelineItems } = await supabase
        .from('pipeline_items')
        .select('item_id, stage_id')
        .eq('type', 'tray')
        .in('stage_id', targetStageIds)
      if (!trayPipelineItems?.length) return result
      trayIds = (trayPipelineItems as Array<{ item_id: string }>).map(item => item.item_id)
      initialTrayItems = (trayPipelineItems as Array<{ item_id: string; stage_id: string }>)
    }
    
    const deptPipelineIds = context.allPipelines
      .filter(p => p?.name && DEPARTMENT_PIPELINES.some(d => p.name!.toLowerCase() === d.toLowerCase()))
      .map(p => p.id)
    const relevantDeptStages = context.allStages.filter(s =>
      deptPipelineIds.includes(s.pipeline_id) &&
      (matchesStagePattern(s.name, 'IN_LUCRU') ||
       matchesStagePattern(s.name, 'IN_ASTEPTARE') ||
       matchesStagePattern(s.name, 'ASTEPT_PIESE') ||
       matchesStagePattern(s.name, 'FINALIZARE') ||
       matchesStagePattern(s.name, 'NOUA'))
    )
    
    // Map tray to stage type (din request unificat sau din query inițial)
    const trayToStageType = new Map<string, 'in_lucru' | 'in_asteptare' | 'finalizare' | 'new_unassigned'>()
    initialTrayItems.forEach(item => {
      const stage = relevantDeptStages.find(s => s.id === item.stage_id)
      if (stage) {
        if (matchesStagePattern(stage.name, 'IN_LUCRU')) trayToStageType.set(item.item_id, 'in_lucru')
        else if (matchesStagePattern(stage.name, 'IN_ASTEPTARE') || matchesStagePattern(stage.name, 'ASTEPT_PIESE')) trayToStageType.set(item.item_id, 'in_asteptare')
        else if (matchesStagePattern(stage.name, 'FINALIZARE')) trayToStageType.set(item.item_id, 'finalizare')
        else if (matchesStagePattern(stage.name, 'NOUA')) trayToStageType.set(item.item_id, 'new_unassigned')
      }
    })
    
    // Get trays with service file and lead data
    logReceptieDb("loadVirtualServiceFiles: supabase.from('trays').select(...) cu service_file/lead", false)
    const { data: trays } = await supabase
      .from('trays')
      .select(`
        id,
        service_file_id,
        service_file:service_files!inner(
          id, lead_id, number, status, created_at, office_direct, curier_trimis, urgent,
          lead:leads!inner(id, full_name, email, phone_number, created_at, campaign_name, ad_name, form_name, tray_details, details)
        )
      `)
      .in('id', trayIds)
    
    if (!trays || trays.length === 0) {
      return result
    }
    
    // Get all trays for these service files to determine combined status
    const serviceFileIds = [...new Set((trays as Array<{ service_file_id: string | null }>).map(t => t.service_file_id).filter(Boolean) as string[])]
    logReceptieDb("loadVirtualServiceFiles: supabase.from('trays').select(id, service_file_id) allTraysForSfs", false)
    const { data: allTraysForSfs } = await supabase
      .from('trays')
      .select('id, service_file_id')
      .in('service_file_id', serviceFileIds)
    
    // Get stage status for all these trays
    const allTrayIds = (allTraysForSfs as Array<{ id: string }> | null)?.map(t => t.id) || []
    
    // === QC status per TĂVIȚĂ (items_events) ===
    const trayQcValidatedMap = new Map<string, boolean | null>()
    try {
      const qcEventTypes = ['quality_validated', 'quality_not_validated']
      const chunkSize = 1500
      const latestByTray = new Map<string, { created_at: string; event_type: string }>()

      for (let i = 0; i < allTrayIds.length; i += chunkSize) {
        const chunk = allTrayIds.slice(i, i + chunkSize)
        logReceptieDb("loadVirtualServiceFiles: supabase.from('items_events').select(...) QC (tray) chunk", true)
        const { data: qcRows, error: qcErr } = await supabase
          .from('items_events')
          .select('item_id, event_type, created_at')
          .eq('type', 'tray')
          .in('item_id', chunk)
          .in('event_type', qcEventTypes as any)
          .order('created_at', { ascending: true })

        if (qcErr) {
          console.warn('[ReceptiePipelineStrategy.loadVirtualServiceFiles] Nu pot încărca QC items_events (tray):', qcErr?.message || qcErr)
          break
        }

        const rowsAny = Array.isArray(qcRows) ? (qcRows as any[]) : []
        for (const r of rowsAny) {
          const trayId = r?.item_id as string | undefined
          const ev = r?.event_type as string | undefined
          const createdAt = r?.created_at as string | undefined
          if (!trayId || !ev || !createdAt) continue
          latestByTray.set(trayId, { created_at: createdAt, event_type: ev })
        }
      }

      for (const trayId of allTrayIds) {
        const last = latestByTray.get(trayId)
        if (!last) trayQcValidatedMap.set(trayId, null)
        else trayQcValidatedMap.set(trayId, last.event_type === 'quality_validated')
      }
    } catch (e: any) {
      console.warn('[ReceptiePipelineStrategy.loadVirtualServiceFiles] Eroare încărcare QC (tray) (continuăm fără):', e?.message || e)
      for (const trayId of allTrayIds) trayQcValidatedMap.set(trayId, null)
    }
    logReceptieDb('loadVirtualServiceFiles: fetchTrayPipelineItemsBatch(allTrayIds)', false)
    const { data: allTrayPipelineItems } = await fetchTrayPipelineItemsBatch(allTrayIds)
    result.allTrayPipelineItems = allTrayPipelineItems || []
    
    // Map all trays to their stage types
    const allTrayToStageType = new Map<string, string>()
    ;(allTrayPipelineItems || []).forEach(item => {
      const stage = context.allStages.find(s => s.id === item.stage_id)
      if (stage) {
        if (matchesStagePattern(stage.name, 'IN_LUCRU')) {
          allTrayToStageType.set(item.item_id, 'in_lucru')
        } else if (matchesStagePattern(stage.name, 'IN_ASTEPTARE') || matchesStagePattern(stage.name, 'ASTEPT_PIESE')) {
          allTrayToStageType.set(item.item_id, 'in_asteptare')
        } else if (matchesStagePattern(stage.name, 'FINALIZARE')) {
          allTrayToStageType.set(item.item_id, 'finalizare')
        } else if (matchesStagePattern(stage.name, 'NOUA')) {
          allTrayToStageType.set(item.item_id, 'new_unassigned')
        }
      }
    })
    
    // Group trays by service file and determine Receptie stage (allTrayPipelineItems folosit și în getServiceFilesWithTraysInDepartments / getAllTraysInfoForServiceFiles)
    const sfToReceptieStage = new Map<string, { id: string; name: string }>()
    
    for (const sfId of serviceFileIds) {
      const sfTrays = (allTraysForSfs as Array<{ id: string; service_file_id: string | null }> | null)?.filter(t => t.service_file_id === sfId) || []
      const sfTrayIds = sfTrays.map(t => t.id)
      
      // Get stage types for all trays in this service file
      const stageTypes = sfTrayIds
        .map(id => allTrayToStageType.get(id))
        .filter(Boolean) as string[]
      
      const hasInLucru = stageTypes.includes('in_lucru')
      const hasInAsteptare = stageTypes.includes('in_asteptare')
      const hasNewUnassigned = stageTypes.includes('new_unassigned')
      const allFinalizare = stageTypes.length > 0 && stageTypes.every(s => s === 'finalizare')
      
      // Verifică dacă toate tăvițele finalizate sunt validate în Quality
      let allQcValidated = false
      if (allFinalizare && sfTrayIds.length > 0) {
        const finalizedTrayIds = sfTrayIds.filter(id => {
          const stageType = allTrayToStageType.get(id)
          return stageType === 'finalizare'
        })
        if (finalizedTrayIds.length > 0) {
          allQcValidated = finalizedTrayIds.every(id => trayQcValidatedMap.get(id) === true)
        }
      }
      
      // Determine Receptie stage based on priority: In Asteptare > In Lucru > De Facturat > Colet Ajuns (new_unassigned)
      // IMPORTANT: "In Asteptare" are prioritate mai mare decât "In Lucru" și "De Facturat"
      let receptieStage: { id: string; name: string } | undefined
      
      if (hasInAsteptare) {
        // Dacă există tăvițe în "In Asteptare" sau "Astept Piese", mută în "In Asteptare"
        receptieStage = findStageByPattern(receptieStages, 'IN_ASTEPTARE')
      } else if (hasInLucru) {
        // Dacă nu există tăvițe în așteptare, verifică "In Lucru"
        receptieStage = findStageByPattern(receptieStages, 'IN_LUCRU')
      } else if (allFinalizare && allQcValidated) {
        // Dacă toate tăvițele sunt finalizate ȘI validate în Quality, mută în "De Facturat"
        receptieStage = findStageByPattern(receptieStages, 'DE_FACTURAT')
      } else if (allFinalizare && !allQcValidated) {
        // Dacă toate tăvițele sunt finalizate DAR nu sunt toate validate, rămâne în "In Lucru" (cu status mov)
        receptieStage = findStageByPattern(receptieStages, 'IN_LUCRU')
      } else if (hasNewUnassigned) {
        // Dacă sunt tăvițe neatribuite din stagiul NOUĂ, pune-le în COLET AJUNS
        receptieStage = findStageByPattern(receptieStages, 'COLET_AJUNS')
      }
      
      // Fallback - dacă nu e nicio altă situație
      if (!receptieStage) {
        receptieStage = findStageByPattern(receptieStages, 'COLET_AJUNS')
      }
      
      if (receptieStage) {
        sfToReceptieStage.set(sfId, receptieStage)
      }
    }
    
    // Create virtual pipeline items for service files not already in Receptie
    const existingSet = new Set(existingServiceFiles)
    
    for (const tray of trays as Array<{ service_file?: any }>) {
      if (!tray.service_file) continue
      
      const sfId = tray.service_file.id
      if (existingSet.has(sfId)) continue
      if (result.serviceFileData.has(sfId)) continue
      
      const receptieStage = sfToReceptieStage.get(sfId)
      if (!receptieStage) continue
      
      // Store service file data
      result.serviceFileData.set(sfId, tray.service_file as any)
      result.serviceFiles.push({ id: sfId })
      
      // Create virtual pipeline item
      const virtualPipelineItem: PipelineItemWithStage = {
        id: `virtual_${sfId}`,
        type: 'service_file',
        item_id: sfId,
        pipeline_id: context.pipelineId,
        stage_id: receptieStage.id,
        created_at: tray.service_file.created_at,
        updated_at: new Date().toISOString(),
        stage: receptieStage,
        isReadOnly: true
      }
      
      result.pipelineItems.push(virtualPipelineItem)
    }
    
    return result
  }
  
  /**
   * Calculate totals for service files.
   * Când preloaded e furnizat (recomandare 6.1), nu mai face fetch la trays / tray_items.
   */
  private async calculateServiceFileTotals(
    serviceFileIds: string[],
    preloaded?: {
      trays: Array<{ id: string; service_file_id: string | null }>
      trayItems: RawTrayItem[]
    }
  ): Promise<Map<string, number>> {
    const totals = new Map<string, number>()
    
    if (serviceFileIds.length === 0) {
      return totals
    }
    
    let trays: Array<{ id: string; service_file_id: string | null }>
    let trayItems: RawTrayItem[]
    
    if (preloaded?.trays?.length) {
      trays = preloaded.trays
      trayItems = preloaded.trayItems ?? []
    } else {
      logReceptieDb('calculateServiceFileTotals: fetchTraysForServiceFiles(serviceFileIds)', false)
      const { data: traysData } = await fetchTraysForServiceFiles(serviceFileIds)
      if (traysData.length === 0) return totals
      trays = traysData
      const trayIds = trays.map(t => t.id)
      logReceptieDb('calculateServiceFileTotals: fetchTrayItems(trayIds)', false)
      const { data: items } = await fetchTrayItems(trayIds)
      trayItems = items ?? []
    }
    
    const trayIds = trays.map(t => t.id)
    if (trayIds.length === 0) return totals
    
    const servicePricesResult = await this.getServicePrices(trayIds, preloaded?.trayItems)
    
    const trayTotals = calculateTrayTotals(trayIds, trayItems, servicePricesResult)
    
    trays.forEach(t => {
      const sfId = t.service_file_id
      if (!sfId) return
      const trayTotal = trayTotals.get(t.id) || 0
      const currentTotal = totals.get(sfId) || 0
      totals.set(sfId, currentTotal + trayTotal)
    })
    
    return totals
  }
  
  /**
   * Get service prices for trays. Când trayItemsPreloaded e furnizat, nu mai face fetch la tray_items.
   */
  private async getServicePrices(
    trayIds: string[],
    trayItemsPreloaded?: RawTrayItem[]
  ): Promise<Map<string, number>> {
    let trayItems: RawTrayItem[]
    if (trayItemsPreloaded && trayItemsPreloaded.length > 0) {
      trayItems = trayItemsPreloaded
    } else {
      logReceptieDb('getServicePrices: fetchTrayItems(trayIds)', false)
      const { data } = await fetchTrayItems(trayIds)
      trayItems = data ?? []
    }
    
    const serviceIds = [...new Set(
      trayItems.map(ti => ti.service_id).filter(Boolean)
    )] as string[]
    
    if (serviceIds.length === 0) {
      return new Map()
    }
    
    logReceptieDb('getServicePrices: fetchServicePrices(serviceIds)', false)
    const { data: prices } = await fetchServicePrices(serviceIds)
    return prices
  }
  
  /**
   * Check which service files have trays in department pipelines.
   * Dacă preloaded conține trays + trayPipelineItemsInDept (din loadItems), nu face requesturi.
   */
  private async getServiceFilesWithTraysInDepartments(
    context: KanbanContext,
    serviceFileIds: string[],
    preloaded?: {
      trays: Array<{ id: string; service_file_id: string | null }>
      trayPipelineItemsInDept: Array<{ item_id: string }>
    }
  ): Promise<Set<string>> {
    const result = new Set<string>()
    
    if (serviceFileIds.length === 0) {
      return result
    }
    
    if (preloaded?.trays?.length && preloaded?.trayPipelineItemsInDept?.length) {
      const trayToServiceFile = new Map<string, string>()
      preloaded.trays.forEach(tray => {
        if (tray.service_file_id) trayToServiceFile.set(tray.id, tray.service_file_id)
      })
      const trayIdsInDepartments = new Set(preloaded.trayPipelineItemsInDept.map(item => item.item_id))
      trayIdsInDepartments.forEach(trayId => {
        const sfId = trayToServiceFile.get(trayId)
        if (sfId) result.add(sfId)
      })
      return result
    }
    
    const supabase = supabaseBrowser()
    const deptPipelines = context.allPipelines.filter(p => {
      if (!p || !p.name) return false
      const pNameLower = p.name.toLowerCase()
      for (let i = 0; i < DEPARTMENT_PIPELINES.length; i++) {
        if (pNameLower === DEPARTMENT_PIPELINES[i].toLowerCase()) return true
      }
      return false
    })
    if (deptPipelines.length === 0) return result
    const deptPipelineIds = deptPipelines.map(p => p.id)
    
    logReceptieDb("getServiceFilesWithTraysInDepartments: supabase.from('trays').select(...)", false)
    const { data: allTrays } = await supabase
      .from('trays')
      .select('id, service_file_id')
      .in('service_file_id', serviceFileIds)
    if (!allTrays?.length) return result
    const allTrayIds = (allTrays as Array<{ id: string }>).map(t => t.id)
    
    logReceptieDb("getServiceFilesWithTraysInDepartments: supabase.from('pipeline_items').select(...)", false)
    const { data: trayPipelineItems } = await supabase
      .from('pipeline_items')
      .select('item_id, pipeline_id')
      .eq('type', 'tray')
      .in('item_id', allTrayIds)
      .in('pipeline_id', deptPipelineIds)
    if (!trayPipelineItems?.length) return result
    
    const trayToServiceFile = new Map<string, string>()
    ;(allTrays as Array<{ id: string; service_file_id: string | null }>).forEach(tray => {
      if (tray.service_file_id) trayToServiceFile.set(tray.id, tray.service_file_id)
    })
    const trayIdsInDepartments = new Set((trayPipelineItems as Array<{ item_id: string }>).map(item => item.item_id))
    trayIdsInDepartments.forEach(trayId => {
      const sfId = trayToServiceFile.get(trayId)
      if (sfId) result.add(sfId)
    })
    return result
  }
  
  /**
   * Get technician names for service files based on their trays.
   * Când preloaded.trays e furnizat (recomandare 6.1), nu mai face fetch la trays.
   */
  private async getTechnicianMapForServiceFiles(
    serviceFileIds: string[],
    preloaded?: {
      trays: Array<{ id: string; service_file_id: string | null; technician_id?: string | null; technician2_id?: string | null; technician3_id?: string | null }>
    }
  ): Promise<Map<string, string>> {
    const technicianMap = new Map<string, string>()
    
    if (serviceFileIds.length === 0) {
      return technicianMap
    }
    
    let trays: Array<{ id: string; service_file_id: string | null; technician_id?: string | null; technician2_id?: string | null; technician3_id?: string | null }>
    if (preloaded?.trays?.length) {
      trays = preloaded.trays
    } else {
      logReceptieDb('getTechnicianMapForServiceFiles: fetchTraysForServiceFiles(serviceFileIds)', false)
      const { data: traysData } = await fetchTraysForServiceFiles(serviceFileIds)
      if (!traysData?.length) return technicianMap
      trays = traysData as Array<{ id: string; service_file_id: string | null; technician_id?: string | null; technician2_id?: string | null; technician3_id?: string | null }>
    }
    
    const serviceFileToTrays = new Map<string, typeof trays>()
    trays.forEach(t => {
      const sfId = t.service_file_id
      if (!sfId) return
      if (!serviceFileToTrays.has(sfId)) serviceFileToTrays.set(sfId, [])
      serviceFileToTrays.get(sfId)!.push(t)
    })
    
    serviceFileIds.forEach(sfId => {
      const traysForSf = serviceFileToTrays.get(sfId) || []
      const firstTrayWithTech = traysForSf.find((t: any) => t.technician_id || t.technician2_id || t.technician3_id)
      const firstTechnicianId = firstTrayWithTech?.technician_id || firstTrayWithTech?.technician2_id || firstTrayWithTech?.technician3_id
      if (firstTechnicianId) {
        const techName = getTechnicianName(firstTechnicianId)
        if (techName) {
          technicianMap.set(sfId, techName)
        }
      }
    })
    
    return technicianMap
  }
  
  /**
   * Get information about all trays for service files in department pipelines.
   * Dacă preloaded conține trays + trayPipelineItemsInDept (din loadItems), nu face requesturi pentru trays/pipeline_items.
   */
  private async getAllTraysInfoForServiceFiles(
    context: KanbanContext,
    serviceFileIds: string[],
    preloaded?: {
      trays: Array<{ id: string; number: string | null; service_file_id: string | null; technician_id?: string | null; technician2_id?: string | null; technician3_id?: string | null }>
      trayPipelineItemsInDept: Array<{ item_id: string; stage_id: string; pipeline_id: string }>
      preloadedQc?: { trayQcValidatedMap: Map<string, boolean | null>; trayQcValidatedAtMap: Map<string, string | null> }
    }
  ): Promise<{ result: Map<string, ReceptieTrayInfo>; trayQcValidatedAtMap: Map<string, string | null> }> {
    const result = new Map<string, {
      trays: Array<{
        trayId: string
        trayNumber: string | null
        technician: string | null
        status: 'in_lucru' | 'in_asteptare' | 'finalizare' | 'noua' | null
        department: string | null
        executionTime: string | null
        qcValidated?: boolean | null
      }>
      hasInLucru: boolean
      hasInAsteptare: boolean
      allFinalizare: boolean
      allQcValidated: boolean
      hasNoua: boolean
      deptAssignedAt: string | null
    }>()
    
    if (serviceFileIds.length === 0) {
      return { result, trayQcValidatedAtMap: new Map<string, string | null>() }
    }
    
    const supabase = supabaseBrowser()
    
    // Find department pipelines
    // FOLOSIM FOR LOOP ÎN LOC DE .some() - MAI SIGUR
    const deptPipelines = context.allPipelines.filter(p => {
      if (!p || !p.name) return false
      const pNameLower = p.name.toLowerCase()
      for (let i = 0; i < DEPARTMENT_PIPELINES.length; i++) {
        const dept = DEPARTMENT_PIPELINES[i]
        if (pNameLower === dept.toLowerCase()) {
          return true
        }
      }
      return false
    })
    
    if (deptPipelines.length === 0) {
      return { result, trayQcValidatedAtMap: new Map<string, string | null>() }
    }
    
    const deptPipelineIds = deptPipelines.map(p => p.id)
    
    const formatDurationShort = (ms: number) => {
      if (!Number.isFinite(ms) || ms <= 0) return null
      const totalMinutes = Math.floor(ms / (1000 * 60))
      const hoursTotal = Math.floor(totalMinutes / 60)
      const minutes = totalMinutes % 60
      const days = Math.floor(hoursTotal / 24)
      const hours = hoursTotal % 24
      if (days > 0) return `${days}z ${hours}h ${minutes}min`
      if (hoursTotal > 0) return `${hoursTotal}h ${minutes}min`
      return `${minutes}min`
    }

    type TrayRow = { id: string; number: string | null; service_file_id: string | null; technician_id?: string | null; technician2_id?: string | null; technician3_id?: string | null }
    let allTrays: TrayRow[]
    if (preloaded?.trays?.length) {
      allTrays = preloaded.trays
    } else {
      logReceptieDb("getAllTraysInfoForServiceFiles: supabase.from('trays').select(...)", false)
      const { data: traysData } = await supabase
        .from('trays')
        .select('id, number, service_file_id, technician_id, technician2_id, technician3_id')
        .in('service_file_id', serviceFileIds)
      if (!traysData?.length) return { result, trayQcValidatedAtMap: new Map<string, string | null>() }
      allTrays = traysData as TrayRow[]
    }
    const allTrayIds = allTrays.map(t => t.id)

    // === QC status per TĂVIȚĂ (items_events) – din preload (6.3) sau fetch local ===
    let trayQcValidatedMap: Map<string, boolean | null>
    let trayQcValidatedAtMap: Map<string, string | null>
    if (preloaded?.preloadedQc) {
      trayQcValidatedMap = preloaded.preloadedQc.trayQcValidatedMap
      trayQcValidatedAtMap = preloaded.preloadedQc.trayQcValidatedAtMap
    } else {
      trayQcValidatedMap = new Map<string, boolean | null>()
      trayQcValidatedAtMap = new Map<string, string | null>()
      try {
        const qcEventTypes = ['quality_validated', 'quality_not_validated']
        const chunkSize = 1500
        const latestByTray = new Map<string, { created_at: string; event_type: string }>()
        for (let i = 0; i < allTrayIds.length; i += chunkSize) {
          const chunk = allTrayIds.slice(i, i + chunkSize)
          logReceptieDb("getAllTraysInfoForServiceFiles: supabase.from('items_events').select(...) QC (tray) chunk", true)
          const { data: qcRows, error: qcErr } = await supabase
            .from('items_events')
            .select('item_id, event_type, created_at')
            .eq('type', 'tray')
            .in('item_id', chunk)
            .in('event_type', qcEventTypes as any)
            .order('created_at', { ascending: true })
          if (qcErr) {
            console.warn('[ReceptiePipelineStrategy] Nu pot încărca QC items_events (tray):', qcErr?.message || qcErr)
            break
          }
          const rowsAny = Array.isArray(qcRows) ? (qcRows as any[]) : []
          for (const r of rowsAny) {
            const trayId = r?.item_id as string | undefined
            const ev = r?.event_type as string | undefined
            const createdAt = r?.created_at as string | undefined
            if (!trayId || !ev || !createdAt) continue
            latestByTray.set(trayId, { created_at: createdAt, event_type: ev })
          }
        }
        for (const trayId of allTrayIds) {
          const last = latestByTray.get(trayId)
          if (!last) {
            trayQcValidatedMap.set(trayId, null)
            trayQcValidatedAtMap.set(trayId, null)
          } else {
            trayQcValidatedMap.set(trayId, last.event_type === 'quality_validated')
            trayQcValidatedAtMap.set(trayId, last.event_type === 'quality_validated' ? last.created_at : null)
          }
        }
      } catch (e: any) {
        console.warn('[ReceptiePipelineStrategy] Eroare încărcare QC (tray) (continuăm fără):', e?.message || e)
        for (const trayId of allTrayIds) {
          trayQcValidatedMap.set(trayId, null)
          trayQcValidatedAtMap.set(trayId, null)
        }
      }
    }

    // === Timp execuție (IN_LUCRU -> FINALIZARE) per tăviță ===
    // Calcul: ultimul IN_LUCRU înainte de ultimul FINALIZARE (sau până acum dacă nu e finalizată)
    const trayExecutionTimeMap = new Map<string, string | null>()
    const trayDeptAssignedAtMap = new Map<string, string | null>() // per tray: primul moved_at relevant în dept
    try {
      // Ia doar stage-urile relevante din pipeline-urile de departament
      const inLucruStageIds = context.allStages
        .filter(s => deptPipelineIds.includes(s.pipeline_id) && matchesStagePattern(s.name, 'IN_LUCRU'))
        .map(s => s.id)
      const inAsteptareStageIds = context.allStages
        .filter(s => deptPipelineIds.includes(s.pipeline_id) && (matchesStagePattern(s.name, 'IN_ASTEPTARE') || matchesStagePattern(s.name, 'ASTEPT_PIESE')))
        .map(s => s.id)
      const finalizareStageIds = context.allStages
        .filter(s => deptPipelineIds.includes(s.pipeline_id) && matchesStagePattern(s.name, 'FINALIZARE'))
        .map(s => s.id)
      const nouaStageIds = context.allStages
        .filter(s => deptPipelineIds.includes(s.pipeline_id) && matchesStagePattern(s.name, 'NOUA'))
        .map(s => s.id)

      const relevantStageIds = Array.from(new Set([
        ...inLucruStageIds,
        ...inAsteptareStageIds,
        ...finalizareStageIds,
        ...nouaStageIds
      ]))

      if (relevantStageIds.length > 0 && allTrayIds.length > 0) {
        const inLucruSet = new Set(inLucruStageIds)
        const finalizareSet = new Set(finalizareStageIds)

        logReceptieDb("getAllTraysInfoForServiceFiles: supabase.from('stage_history').select(...)", false)
        const { data: stageHistoryRows, error: stageHistoryError } = await supabase
          .from('stage_history' as any)
          .select('tray_id, to_stage_id, moved_at')
          .in('tray_id', allTrayIds)
          .in('to_stage_id', relevantStageIds)
          .order('moved_at', { ascending: true })

        if (!stageHistoryError && Array.isArray(stageHistoryRows)) {
          const byTray = new Map<string, Array<{ to_stage_id: string; moved_at: string }>>()
          for (const r of stageHistoryRows as any[]) {
            const trayId = r?.tray_id as string | undefined
            const toStageId = r?.to_stage_id as string | undefined
            const movedAt = r?.moved_at as string | undefined
            if (!trayId || !toStageId || !movedAt) continue
            if (!byTray.has(trayId)) byTray.set(trayId, [])
            byTray.get(trayId)!.push({ to_stage_id: toStageId, moved_at: movedAt })
          }

          const now = Date.now()
          for (const trayId of allTrayIds) {
            const rows = byTray.get(trayId) || []
            // deptAssignedAt = primul moved_at din istoric (în stage-urile relevante)
            if (rows.length > 0) {
              trayDeptAssignedAtMap.set(trayId, rows[0]?.moved_at || null)
            } else {
              trayDeptAssignedAtMap.set(trayId, null)
            }

            let lastFinalAt: number | null = null
            let lastInLucruBeforeFinal: number | null = null
            let lastInLucruAt: number | null = null

            for (const row of rows) {
              const ts = new Date(row.moved_at).getTime()
              if (!Number.isFinite(ts)) continue

              if (inLucruSet.has(row.to_stage_id)) {
                lastInLucruAt = ts
                // dacă avem deja un final, ținem ultimul IN_LUCRU înainte de el
                if (lastFinalAt !== null && ts <= lastFinalAt) {
                  lastInLucruBeforeFinal = ts
                }
              }
              if (finalizareSet.has(row.to_stage_id)) {
                lastFinalAt = ts
                // când găsim un final, resetăm markerul și îl recalculăm pe parcurs
                lastInLucruBeforeFinal = null
              }
            }

            // a doua trecere pentru a găsi ultimul IN_LUCRU <= ultimul FINAL (dacă există)
            if (lastFinalAt !== null) {
              for (const row of rows) {
                const ts = new Date(row.moved_at).getTime()
                if (!Number.isFinite(ts)) continue
                if (ts <= lastFinalAt && inLucruSet.has(row.to_stage_id)) {
                  lastInLucruBeforeFinal = ts
                }
              }
            }

            const start = lastFinalAt !== null ? lastInLucruBeforeFinal : lastInLucruAt
            const end = lastFinalAt !== null ? lastFinalAt : null
            if (start) {
              const durationMs = (end ?? now) - start
              trayExecutionTimeMap.set(trayId, formatDurationShort(durationMs))
            } else {
              trayExecutionTimeMap.set(trayId, null)
            }
          }
        } else {
          // Dacă tabela/coloanele nu există sau RLS blochează, nu întrerupe fluxul
          console.warn('[ReceptiePipelineStrategy] Nu pot încărca stage_history pentru execuție:', stageHistoryError?.message || stageHistoryError)
          // fallback safe
          for (const trayId of allTrayIds) trayDeptAssignedAtMap.set(trayId, null)
        }
      }
    } catch (e: any) {
      console.warn('[ReceptiePipelineStrategy] Eroare calcul execuție (continuăm fără):', e?.message || e)
      for (const trayId of allTrayIds) trayDeptAssignedAtMap.set(trayId, null)
    }

    let allTrayPipelineItems: Array<{ item_id: string; stage_id: string; pipeline_id: string }>
    if (preloaded?.trayPipelineItemsInDept?.length) {
      allTrayPipelineItems = preloaded.trayPipelineItemsInDept
    } else {
      logReceptieDb("getAllTraysInfoForServiceFiles: supabase.from('pipeline_items').select(...) tray în dept", false)
      const { data: piData } = await supabase
        .from('pipeline_items')
        .select('item_id, stage_id, pipeline_id')
        .eq('type', 'tray')
        .in('item_id', allTrayIds)
        .in('pipeline_id', deptPipelineIds)
      // Nu returnăm early când piData e gol: tăvițele din De trimis/Ridic personal/Arhivat
      // nu mai sunt în pipeline-uri de departament, dar trebuie incluse cu tehnician pentru afișare pe card
      allTrayPipelineItems = (piData || []) as Array<{ item_id: string; stage_id: string; pipeline_id: string }>
    }
    
    // Map trays to their stage types and departments
    // Agregare: dacă aceeași tăviță e în mai multe departamente (ex. 2 tehnicieni), folosim
    // etapa „cea mai restrictivă” (in_asteptare > in_lucru > finalizare) ca să nu considerăm
    // tăvița finalizată dacă mai e în lucru într-un alt departament.
    type StageType = 'in_lucru' | 'in_asteptare' | 'finalizare' | 'noua' | 'other'
    const stageTypesByTray = new Map<string, StageType[]>()
    const departmentByTray = new Map<string, string | null>()
    allTrayPipelineItems.forEach(item => {
      const stage = context.allStages.find(s => s.id === item.stage_id)
      let st: StageType = 'other'
      if (stage) {
        if (matchesStagePattern(stage.name, 'IN_LUCRU')) st = 'in_lucru'
        else if (matchesStagePattern(stage.name, 'IN_ASTEPTARE') || matchesStagePattern(stage.name, 'ASTEPT_PIESE')) st = 'in_asteptare'
        else if (matchesStagePattern(stage.name, 'FINALIZARE')) st = 'finalizare'
        else if (matchesStagePattern(stage.name, 'NOUA')) st = 'noua'
      }
      if (!stageTypesByTray.has(item.item_id)) {
        stageTypesByTray.set(item.item_id, [])
        const pipeline = context.allPipelines.find(p => p.id === item.pipeline_id)
        departmentByTray.set(item.item_id, pipeline?.name ?? null)
      }
      stageTypesByTray.get(item.item_id)!.push(st)
    })
    const trayToStageType = new Map<string, StageType>()
    stageTypesByTray.forEach((types, trayId) => {
      const unique = [...new Set(types)]
      let agg: StageType
      if (unique.some(t => t === 'in_asteptare')) agg = 'in_asteptare'
      else if (unique.some(t => t === 'in_lucru')) agg = 'in_lucru'
      else if (unique.every(t => t === 'finalizare')) agg = 'finalizare'
      else if (unique.some(t => t === 'noua')) agg = 'noua'
      else agg = unique[0] ?? 'other'
      trayToStageType.set(trayId, agg)
    })
    const trayToDepartment = departmentByTray
    
    // Tehnicienii sunt la nivel de tăviță (trays.technician_id, technician2_id, technician3_id)
    const allTechniciansMap = extractAllTechniciansMapFromTrays(allTrays as RawTray[])
    
    // Group trays by service file and determine status
    // Include ALL trays: cele în departamente (in_lucru, in_asteptare, finalizare, noua) ȘI cele
    // din De trimis/Ridic personal/Arhivat (nu mai sunt în dept) – pentru afișare tehnician pe card
    allTrays.forEach(tray => {
      if (!tray.service_file_id) return
      
      // Tăvițe în departamente: au stageType. Tăvițe din De trimis/Ridic/Arhivat: nu sunt în dept → 'other'
      const stageType = trayToStageType.get(tray.id) ?? 'other'
      const effectiveStatus: 'in_lucru' | 'in_asteptare' | 'finalizare' | 'noua' | null =
        stageType === 'in_lucru' || stageType === 'in_asteptare' || stageType === 'finalizare' || stageType === 'noua'
          ? stageType
          : 'finalizare' // Tăvițe finalizate (De trimis/Ridic/Arhivat) – afișăm tehnicianul
      
      // Get ALL technicians for this tray (can be empty if no technician assigned)
      const allTechs = allTechniciansMap.get(tray.id) || []
      const technician = allTechs.length > 0 ? allTechs.join(' • ') : null
      
      if (!result.has(tray.service_file_id)) {
        result.set(tray.service_file_id, {
          trays: [],
          hasInLucru: false,
          hasInAsteptare: false,
          allFinalizare: false,
          allQcValidated: false,
          hasNoua: false,
          deptAssignedAt: null,
        })
      }
      
      const info = result.get(tray.service_file_id)!
      
      // Get department for this tray
      const department = trayToDepartment.get(tray.id) || null
      
      // Add tray info (including trays without technician, their status, and department). Mărime: majusculă, fără paranteze.
      info.trays.push({
        trayId: tray.id,
        trayNumber: tray.number,
        technician,
        status: effectiveStatus,
        department,
        executionTime: trayExecutionTimeMap.get(tray.id) ?? null,
        qcValidated: trayQcValidatedMap.get(tray.id) ?? null,
      })

      // deptAssignedAt la nivel de service_file = minimul dintre tăvițe
      const trayAssignedAt = trayDeptAssignedAtMap.get(tray.id) || null
      if (trayAssignedAt) {
        if (!info.deptAssignedAt) {
          info.deptAssignedAt = trayAssignedAt
        } else {
          const a = new Date(info.deptAssignedAt).getTime()
          const b = new Date(trayAssignedAt).getTime()
          if (Number.isFinite(a) && Number.isFinite(b) && b < a) {
            info.deptAssignedAt = trayAssignedAt
          }
        }
      }
      
      // Check stage type for this tray
      if (stageType === 'in_lucru') {
        info.hasInLucru = true
      } else if (stageType === 'in_asteptare') {
        info.hasInAsteptare = true
      } else if (stageType === 'noua') {
        info.hasNoua = true
      }
    })
    
    // Determine if all trays are finalized and validated for each service file
    result.forEach((info, sfId) => {
      const sfTrays = allTrays.filter(t => t.service_file_id === sfId)
      const sfTrayIds = sfTrays.map(t => t.id)
      
      // Get stage types for all trays in this service file
      const stageTypes = sfTrayIds
        .map(id => trayToStageType.get(id))
        .filter(Boolean) as string[]
      
      // All trays are finalized if all have stage type 'finalizare' and there are no other types
      info.allFinalizare = stageTypes.length > 0 && 
                           stageTypes.every(s => s === 'finalizare') &&
                           !info.hasInLucru &&
                           !info.hasInAsteptare
      
      // All trays are QC validated if:
      // 1. All trays are finalized (allFinalizare = true)
      // 2. All finalized trays have qcValidated = true (nu null, nu false)
      if (info.allFinalizare && info.trays.length > 0) {
        const finalizedTrays = info.trays.filter(t => t.status === 'finalizare')
        if (finalizedTrays.length > 0) {
          info.allQcValidated = finalizedTrays.every(t => t.qcValidated === true)
        } else {
          info.allQcValidated = false
        }
      } else {
        info.allQcValidated = false
      }
    })

    return { result, trayQcValidatedAtMap }
  }
}

