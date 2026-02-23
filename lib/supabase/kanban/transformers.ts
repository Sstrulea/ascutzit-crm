/**
 * Kanban Transformers
 * 
 * Functions that transform raw data into KanbanItem format.
 * Pure transformation logic - no database calls.
 */

import type { 
  KanbanItem, 
  KanbanTag,
  PipelineItemWithStage,
  RawLead,
  RawServiceFile,
  RawTray,
  RawTrayItem
} from './types'
import { getTechnicianName } from './cache'
import { URGENT_MARKUP_PCT, matchesStagePattern } from './constants'
import { formatTraySizeDisplay } from '@/lib/utils/trayDisplay'
import { getLeadDisplayName, getLeadDisplayPhone } from '@/lib/utils/leadDisplay'

// ==================== LEAD TRANSFORMER ====================

/**
 * Transformă un lead brut într-un KanbanItem pentru afișare în board-ul Kanban.
 * Această funcție convertește datele unui lead din formatul bazei de date în formatul
 * standardizat KanbanItem, care include informații despre lead, stage-ul curent, tag-uri
 * și totalul calculat. Funcția este folosită pentru a afișa lead-urile în interfața Kanban.
 * 
 * @param lead - Lead-ul brut din baza de date
 * @param pipelineItem - Item-ul din pipeline care conține informații despre stage și pipeline
 * @param tags - Array cu tag-urile asociate lead-ului (implicit array gol)
 * @param total - Totalul calculat pentru lead (suma tuturor fișelor și tăvițelor) - implicit 0
 * @returns KanbanItem formatat pentru afișare în board-ul Kanban
 */
export function transformLeadToKanbanItem(
  lead: RawLead,
  pipelineItem: PipelineItemWithStage,
  tags: KanbanTag[] = [],
  total: number = 0,
  userMessageCount?: number,
  userNamesMap?: Map<string, string>
): KanbanItem {
  const getName = (userId: string | null | undefined) => (userId && userNamesMap?.get(userId)) || null
  return {
    id: lead.id,
    name: getLeadDisplayName(lead.full_name, lead.details, (lead as any).notes),
    email: lead.email || '',
    phone: getLeadDisplayPhone(lead.phone_number, lead.details, (lead as any).notes),
    stage: pipelineItem.stage?.name || '',
    createdAt: lead.created_at,
    campaignName: lead.campaign_name || undefined,
    adName: lead.ad_name || undefined,
    formName: lead.form_name || undefined,
    leadId: lead.id,
    stageId: pipelineItem.stage_id,
    pipelineId: pipelineItem.pipeline_id,
    assignmentId: pipelineItem.id,
    tags,
    stageMovedAt: pipelineItem.updated_at,
    type: 'lead',
    total,
    city: lead.city || null,
    company_name: lead.company_name || null,
    company_address: lead.company_address || null,
    address: lead.address || null,
    address2: lead.address2 || null,
    zip: lead.zip || null,
    strada: lead.strada || null,
    judet: lead.judet || null,
    callback_date: lead.callback_date || null,
    nu_raspunde_callback_at: lead.nu_raspunde_callback_at ?? null,
    suna_acknowledged_at: (lead as any).suna_acknowledged_at ?? null,
    curier_trimis_at: (lead as any).curier_trimis_at ?? null,
    office_direct_at: (lead as any).office_direct_at ?? null,
    follow_up_set_at: lead.follow_up_set_at ?? null,
    follow_up_callback_at: lead.follow_up_callback_at ?? null,
    has_ever_been_moved: lead.has_ever_been_moved ?? false,
    claimed_by: lead.claimed_by ?? null,
    claimed_by_name: getName(lead.claimed_by) ?? null,
    curier_trimis_user_name: getName((lead as any).curier_trimis_user_id) ?? null,
    office_direct_user_name: getName((lead as any).office_direct_user_id) ?? null,
    contact_person: lead.contact_person || null,
    contact_phone: lead.contact_phone || null,
    billing_nume_prenume: lead.billing_nume_prenume || null,
    billing_nume_companie: lead.billing_nume_companie || null,
    billing_cui: lead.billing_cui || null,
    billing_strada: lead.billing_strada || null,
    billing_oras: lead.billing_oras || null,
    billing_judet: lead.billing_judet || null,
    billing_cod_postal: lead.billing_cod_postal || null,
    details: lead.details ?? null,
    userMessageCount,
  }
}

// ==================== SERVICE FILE TRANSFORMER ====================

/**
 * Transformă o fișă de serviciu brută într-un KanbanItem pentru afișare în board-ul Kanban.
 * Această funcție convertește datele unei fișe de serviciu din formatul bazei de date în
 * formatul standardizat KanbanItem. Fișa de serviciu este afișată cu informații despre lead-ul
 * asociat, numărul fișei, status și totalul calculat. Funcția suportă și flag-ul isReadOnly
 * pentru a indica dacă fișa poate fi modificată sau nu.
 * 
 * @param serviceFile - Fișa de serviciu brută din baza de date
 * @param pipelineItem - Item-ul din pipeline care conține informații despre stage și pipeline
 * @param tags - Array cu tag-urile asociate lead-ului (implicit array gol)
 * @param total - Totalul calculat pentru fișă (suma tuturor tăvițelor) - implicit 0
 * @param isReadOnly - Flag care indică dacă fișa este read-only (nu poate fi modificată) - implicit false
 * @returns KanbanItem formatat pentru afișare în board-ul Kanban
 */
export function transformServiceFileToKanbanItem(
  serviceFile: RawServiceFile,
  pipelineItem: PipelineItemWithStage,
  tags: KanbanTag[] = [],
  total: number = 0,
  isReadOnly: boolean = false,
  userMessageCount?: number
): KanbanItem {
  const lead = serviceFile.lead
  
  return {
    id: serviceFile.id,
    name: lead ? getLeadDisplayName(lead.full_name, lead.details, (lead as any).notes) : 'Unknown',
    email: lead?.email || '',
    phone: lead ? getLeadDisplayPhone(lead.phone_number, lead.details, (lead as any).notes) : '',
    stage: pipelineItem.stage?.name || '',
    createdAt: serviceFile.created_at,
    campaignName: lead?.campaign_name || undefined,
    adName: lead?.ad_name || undefined,
    formName: lead?.form_name || undefined,
    leadId: lead?.id,
    stageId: pipelineItem.stage_id,
    pipelineId: pipelineItem.pipeline_id,
    assignmentId: pipelineItem.id,
    tags,
    stageMovedAt: pipelineItem.updated_at,
    type: 'service_file',
    serviceFileNumber: serviceFile.number,
    serviceFileStatus: serviceFile.status,
    isReadOnly,
    total,
    city: lead?.city || null,
    company_name: lead?.company_name || null,
    company_address: lead?.company_address || null,
    address: lead?.address || null,
    address2: lead?.address2 || null,
    zip: lead?.zip || null,
    strada: lead?.strada || null,
    judet: lead?.judet || null,
    contact_person: lead?.contact_person || null,
    contact_phone: lead?.contact_phone || null,
    billing_nume_prenume: lead?.billing_nume_prenume || null,
    billing_nume_companie: lead?.billing_nume_companie || null,
    billing_cui: lead?.billing_cui || null,
    billing_strada: lead?.billing_strada || null,
    billing_oras: lead?.billing_oras || null,
    billing_judet: lead?.billing_judet || null,
    billing_cod_postal: lead?.billing_cod_postal || null,
    details: lead?.details ?? null,
    claimed_by: lead?.claimed_by ?? null,
    nu_raspunde_callback_at: (serviceFile as any).nu_raspunde_callback_at ?? lead?.nu_raspunde_callback_at ?? null,
    curier_trimis: (serviceFile as any).curier_trimis ?? false,
    office_direct: (serviceFile as any).office_direct ?? false,
    retur: (serviceFile as any).retur ?? false,
    userMessageCount,
  }
}

// ==================== TRAY TRANSFORMER ====================

/**
 * Transformă o tăviță brută într-un KanbanItem pentru afișare în board-ul Kanban.
 * Această funcție convertește datele unei tăvițe din formatul bazei de date în formatul
 * standardizat KanbanItem. Tăvița este afișată cu informații despre lead-ul asociat (prin
 * fișa de serviciu), numărul tăviței, mărime, status, tehnician atribuit și totalul calculat.
 * Funcția calculează automat câmpurile inLucruSince și inAsteptareSince bazate pe stage-ul curent.
 * 
 * @param tray - Tăvița brută din baza de date
 * @param pipelineItem - Item-ul din pipeline care conține informații despre stage și pipeline
 * @param tags - Array cu tag-urile asociate lead-ului (implicit array gol)
 * @param technician - Numele tehnicianului atribuit tăviței (implicit null)
 * @param total - Totalul calculat pentru tăviță (suma tuturor item-urilor) - implicit 0
 * @param isReadOnly - Flag care indică dacă tăvița este read-only (nu poate fi modificată) - implicit false
 * @returns KanbanItem formatat pentru afișare în board-ul Kanban
 */
export function transformTrayToKanbanItem(
  tray: RawTray,
  pipelineItem: PipelineItemWithStage,
  tags: KanbanTag[] = [],
  technician: string | null = null,
  total: number = 0,
  isReadOnly: boolean = false,
  estimatedTime: number = 0,
  userMessageCount?: number
): KanbanItem {
  const lead = tray.service_file?.lead
  const stageName = pipelineItem.stage?.name?.toUpperCase() || ''
  
  // Calculate in_lucru_since and in_asteptare_since based on current stage
  const isInLucru = matchesStagePattern(stageName, 'IN_LUCRU')
  const isInAsteptare = matchesStagePattern(stageName, 'IN_ASTEPTARE')
  
  return {
    id: tray.id,
    name: lead ? getLeadDisplayName(lead.full_name, lead.details, (lead as any).notes) : 'Unknown',
    email: lead?.email || '',
    phone: lead ? getLeadDisplayPhone(lead.phone_number, lead.details, (lead as any).notes) : '',
    stage: pipelineItem.stage?.name || '',
    createdAt: tray.created_at,
    campaignName: lead?.campaign_name || undefined,
    adName: lead?.ad_name || undefined,
    formName: lead?.form_name || undefined,
    leadId: lead?.id,
    stageId: pipelineItem.stage_id,
    pipelineId: pipelineItem.pipeline_id,
    assignmentId: pipelineItem.id,
    tags,
    stageMovedAt: pipelineItem.updated_at,
    technician,
    type: 'tray',
    trayNumber: tray.number,
    traySize: formatTraySizeDisplay(tray.size),
    trayStatus: tray.status,
    isSplitChild: tray.status === 'Splited', // Marchează tăvitele rezultate din split
    total,
    estimatedTime: estimatedTime > 0 ? estimatedTime : undefined,
    isReadOnly,
    inLucruSince: isInLucru ? pipelineItem.updated_at : undefined,
    inAsteptareSince: isInAsteptare ? pipelineItem.updated_at : undefined,
    city: lead?.city || null,
    company_name: lead?.company_name || null,
    company_address: lead?.company_address || null,
    address: lead?.address || null,
    address2: lead?.address2 || null,
    zip: lead?.zip || null,
    strada: lead?.strada || null,
    judet: lead?.judet || null,
    contact_person: lead?.contact_person || null,
    contact_phone: lead?.contact_phone || null,
    billing_nume_prenume: lead?.billing_nume_prenume || null,
    billing_nume_companie: lead?.billing_nume_companie || null,
    billing_cui: lead?.billing_cui || null,
    billing_strada: lead?.billing_strada || null,
    billing_oras: lead?.billing_oras || null,
    billing_judet: lead?.billing_judet || null,
    billing_cod_postal: lead?.billing_cod_postal || null,
    details: lead?.details ?? null,
    userMessageCount,
  }
}

// ==================== TECHNICIAN EXTRACTION ====================

/**
 * Extrage maparea tehnicianilor din item-urile de tăviță.
 * (Backward compat: tray_items nu mai au technician_id; returnează map gol.)
 */
export function extractTechnicianMap(
  _trayItems: RawTrayItem[]
): Map<string, string> {
  return new Map<string, string>()
}

/**
 * Extrage maparea primului tehnician din tăvițe (trays.technician_id).
 */
export function extractTechnicianMapFromTrays(
  trays: RawTray[]
): Map<string, string> {
  const technicianMap = new Map<string, string>()
  trays.forEach(t => {
    if (t.id && (t as any).technician_id) {
      technicianMap.set(t.id, getTechnicianName((t as any).technician_id))
    }
  })
  return technicianMap
}

/**
 * Extrage TOȚI tehnicienii (technician_id, technician2_id, technician3_id) pentru fiecare tăviță.
 */
export function extractAllTechniciansMap(
  _trayItems: RawTrayItem[]
): Map<string, string[]> {
  return new Map<string, string[]>()
}

/**
 * Extrage TOȚI tehnicienii din tăvițe (technician_id, technician2_id, technician3_id).
 * @returns Map cu cheia tray_id și valoarea array de nume tehnicieni
 */
export function extractAllTechniciansMapFromTrays(
  trays: RawTray[]
): Map<string, string[]> {
  const result = new Map<string, string[]>()
  trays.forEach(t => {
    if (!t?.id) return
    const ids = [(t as any).technician_id, (t as any).technician2_id, (t as any).technician3_id].filter(Boolean) as string[]
    const names = ids.map(id => getTechnicianName(id)).filter(Boolean)
    if (names.length) result.set(t.id, names)
  })
  return result
}

// ==================== VIRTUAL CARDS PER TECHNICIAN ====================

/**
 * Grupează item-urile de tăviță pe tehnicieni.
 * @returns Map cu cheia tray_id și valoarea Map<technician_id, count>
 */
export function groupTrayItemsByTechnician(
  trayItems: RawTrayItem[]
): Map<string, Map<string | null, number>> {
  const result = new Map<string, Map<string | null, number>>()
  trayItems.forEach(ti => {
    if (!result.has(ti.tray_id)) {
      result.set(ti.tray_id, new Map())
    }
    const techMap = result.get(ti.tray_id)!
    const key: string | null = null
    const currentCount = techMap.get(key) || 0
    techMap.set(key, currentCount + (ti.qty || 1))
  })
  return result
}

/**
 * Transformă o tăviță în CARDURI VIRTUALE - câte unul per tehnician.
 * 
 * Dacă o tăviță are item-uri atribuite la mai mulți tehnicieni, se generează
 * câte un card separat pentru fiecare tehnician. Fiecare card afișează:
 * - Același număr de tăviță
 * - Numele tehnicianului
 * - Totalul și timpul estimat doar pentru item-urile acelui tehnician
 * 
 * @param tray - Tăvița brută
 * @param pipelineItem - Item-ul din pipeline
 * @param tags - Tag-urile lead-ului
 * @param trayItems - Item-urile tăviței (pentru grupare pe tehnicieni)
 * @param servicePrices - Prețurile serviciilor
 * @param serviceTimes - Timpii serviciilor
 * @returns Array de KanbanItem-uri (carduri virtuale)
 */
export function transformTrayToVirtualKanbanItems(
  tray: RawTray,
  pipelineItem: PipelineItemWithStage,
  tags: KanbanTag[] = [],
  trayItems: RawTrayItem[],
  servicePrices: Map<string, number>,
  serviceTimes: Map<string, number>
): KanbanItem[] {
  const lead = tray.service_file?.lead
  const stageName = pipelineItem.stage?.name?.toUpperCase() || ''
  const isInLucru = matchesStagePattern(stageName, 'IN_LUCRU')
  const isInAsteptare = matchesStagePattern(stageName, 'IN_ASTEPTARE')
  
  // Tehnicianul e la nivel de tăviță (trays), nu per item; un singur card per tăviță
  const itemsForThisTray = trayItems.filter(ti => ti.tray_id === tray.id)
  const t = tray as RawTray
  const techIds = [t.technician_id, t.technician2_id, t.technician3_id].filter(Boolean) as string[]
  const techId = t.technician_id ?? null
  // După reuniere: tăvița poate avea 2–3 tehnicieni; afișăm toți pe card
  const techName = techIds.length > 0
    ? techIds.map(id => getTechnicianName(id)).join(', ')
    : null
  const technicianGroups = new Map<string | null, RawTrayItem[]>()
  technicianGroups.set(techId, itemsForThisTray)
  
  // Un singur card per tăviță (technician din tray; după reuniere toți tehnicienii)
  if (technicianGroups.size <= 1) {
    const techItems = technicianGroups.get(techId) || []
    const total = calculateTrayTotal(tray.id, itemsForThisTray, servicePrices)
    // Calculează timp estimat pentru tehnician pe bază de item-urile sale
    const estimatedTime = calculateTrayEstimatedTime(tray.id, techItems, serviceTimes)
    const itemsCount = techItems.reduce((sum, ti) => sum + (ti.qty || 1), 0)
    
    return [{
      id: tray.id,
      name: lead ? getLeadDisplayName(lead.full_name, lead.details, (lead as any).notes) : 'Unknown',
      email: lead?.email || '',
      phone: lead ? getLeadDisplayPhone(lead.phone_number, lead.details, (lead as any).notes) : '',
      stage: pipelineItem.stage?.name || '',
      createdAt: tray.created_at,
      campaignName: lead?.campaign_name || undefined,
      adName: lead?.ad_name || undefined,
      formName: lead?.form_name || undefined,
      leadId: lead?.id,
      stageId: pipelineItem.stage_id,
      pipelineId: pipelineItem.pipeline_id,
      assignmentId: pipelineItem.id,
      tags,
      stageMovedAt: pipelineItem.updated_at,
      technician: techName,
      technicianId: techId,
      type: 'tray',
      trayNumber: tray.number,
      traySize: formatTraySizeDisplay(tray.size),
      trayStatus: tray.status,
      isSplitChild: tray.status === 'Splited', // Marchează tăvitele rezultate din split
      total,
      estimatedTime: estimatedTime > 0 ? estimatedTime : undefined,
      isReadOnly: false,
      inLucruSince: isInLucru ? pipelineItem.updated_at : undefined,
      inAsteptareSince: isInAsteptare ? pipelineItem.updated_at : undefined,
      city: lead?.city || null,
      company_name: lead?.company_name || null,
      company_address: lead?.company_address || null,
      address: lead?.address || null,
      address2: lead?.address2 || null,
      zip: lead?.zip || null,
      strada: lead?.strada || null,
      judet: lead?.judet || null,
      contact_person: lead?.contact_person || null,
      contact_phone: lead?.contact_phone || null,
      billing_nume_prenume: lead?.billing_nume_prenume || null,
      billing_nume_companie: lead?.billing_nume_companie || null,
      billing_cui: lead?.billing_cui || null,
      billing_strada: lead?.billing_strada || null,
      billing_oras: lead?.billing_oras || null,
      billing_judet: lead?.billing_judet || null,
      billing_cod_postal: lead?.billing_cod_postal || null,
      details: lead?.details ?? null,
      isVirtualCard: false,
      realTrayId: tray.id,
      itemsCount,
    }]
  }
  
  // Generează carduri virtuale pentru fiecare tehnician
  const virtualCards: KanbanItem[] = []
  
  technicianGroups.forEach((techItems, techId) => {
    const techName = techId ? getTechnicianName(techId) : 'Neatribuit'
    
    // Calculează total și timp estimat doar pentru item-urile acestui tehnician
    const techTotal = calculateTrayTotal(tray.id, techItems, servicePrices)
    // Calculează timp estimat direct pentru item-urile tehnicianului
    const techEstimatedTime = calculateTrayEstimatedTime(tray.id, techItems, serviceTimes)
    const itemsCount = techItems.reduce((sum, ti) => sum + (ti.qty || 1), 0)
    
    // ID-ul virtual: {trayId}__tech__{technicianId}
    const virtualId = techId 
      ? `${tray.id}__tech__${techId}` 
      : `${tray.id}__tech__unassigned`
    
    virtualCards.push({
      id: virtualId,
      name: lead ? getLeadDisplayName(lead.full_name, lead.details, (lead as any).notes) : 'Unknown',
      email: lead?.email || '',
      phone: lead ? getLeadDisplayPhone(lead.phone_number, lead.details, (lead as any).notes) : '',
      stage: pipelineItem.stage?.name || '',
      createdAt: tray.created_at,
      campaignName: lead?.campaign_name || undefined,
      adName: lead?.ad_name || undefined,
      formName: lead?.form_name || undefined,
      leadId: lead?.id,
      stageId: pipelineItem.stage_id,
      pipelineId: pipelineItem.pipeline_id,
      assignmentId: pipelineItem.id,
      tags,
      stageMovedAt: pipelineItem.updated_at,
      technician: techName,
      technicianId: techId,
      type: 'tray',
      trayNumber: tray.number,
      traySize: formatTraySizeDisplay(tray.size),
      trayStatus: tray.status,
      isSplitChild: tray.status === 'Splited', // Marchează tăvitele rezultate din split
      total: techTotal,
      estimatedTime: techEstimatedTime > 0 ? techEstimatedTime : undefined,
      isReadOnly: false,
      inLucruSince: isInLucru ? pipelineItem.updated_at : undefined,
      inAsteptareSince: isInAsteptare ? pipelineItem.updated_at : undefined,
      city: lead?.city || null,
      company_name: lead?.company_name || null,
      company_address: lead?.company_address || null,
      address: lead?.address || null,
      address2: lead?.address2 || null,
      zip: lead?.zip || null,
      strada: lead?.strada || null,
      judet: lead?.judet || null,
      contact_person: lead?.contact_person || null,
      contact_phone: lead?.contact_phone || null,
      billing_nume_prenume: lead?.billing_nume_prenume || null,
      billing_nume_companie: lead?.billing_nume_companie || null,
      billing_cui: lead?.billing_cui || null,
      billing_strada: lead?.billing_strada || null,
      billing_oras: lead?.billing_oras || null,
      billing_judet: lead?.billing_judet || null,
      billing_cod_postal: lead?.billing_cod_postal || null,
      details: lead?.details ?? null,
      // Câmpuri specifice cardurilor virtuale
      isVirtualCard: true,
      realTrayId: tray.id,
      itemsCount,
    })
  })
  
  return virtualCards
}

// ==================== TOTAL CALCULATION ====================

interface TrayItemWithParsedNotes extends RawTrayItem {
  parsedNotes?: {
    price?: number
    discount_pct?: number
    urgent?: boolean
    item_type?: 'service' | 'part'
  }
}

/**
 * Calculează totalul pentru o singură tăviță.
 * Această funcție calculează prețul total al unei tăvițe bazându-se pe item-urile sale.
 * Funcția procesează item-urile vizibile (cele cu item_type în notes), aplică discount-uri,
 * markup-uri pentru urgent, și discount-uri pentru abonamente. Calculează separat totalurile
 * pentru servicii și piese pentru a aplica discount-uri diferite pentru abonamente.
 * 
 * @param trayId - ID-ul tăviței pentru care se calculează totalul
 * @param trayItems - Array cu toate item-urile de tăviță (se filtrează după tray_id)
 * @param servicePrices - Map cu prețurile serviciilor (service_id -> price)
 * @param subscriptionType - Tipul abonamentului ('services', 'parts', 'both' sau '') - implicit ''
 * @returns Totalul calculat pentru tăviță (subtotal - discount + urgent markup - subscription discount)
 */
export function calculateTrayTotal(
  trayId: string,
  trayItems: RawTrayItem[],
  servicePrices: Map<string, number>,
  subscriptionType: string = ''
): number {
  const trayItemsArray = Array.isArray(trayItems) ? trayItems : []
  const items = trayItemsArray.filter(ti => ti?.tray_id === trayId)
  
  // Filter visible items (those with item_type in notes)
  const visibleItems = items.filter(ti => {
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
  
  visibleItems.forEach(ti => {
    const qty = ti.qty || 1
    let itemPrice = 0
    let discountPct = 0
    let isUrgent = false
    let itemType: 'service' | 'part' | null = null
    
    // Parse notes if JSON
    if (ti.notes) {
      try {
        const notesData = JSON.parse(ti.notes)
        itemPrice = notesData.price || 0
        discountPct = notesData.discount_pct || 0
        isUrgent = notesData.urgent || false
        itemType = notesData.item_type || null
      } catch {
        // Notes is not JSON
      }
    }
    
    // Fallback to service price
    if (!itemPrice && ti.service_id) {
      itemPrice = servicePrices.get(ti.service_id) || 0
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
  
  // Apply subscription discounts
  let subscriptionDiscount = 0
  if (subscriptionType === 'services' || subscriptionType === 'both') {
    subscriptionDiscount += servicesTotal * 0.10
  }
  if (subscriptionType === 'parts' || subscriptionType === 'both') {
    subscriptionDiscount += partsTotal * 0.05
  }
  
  return Math.max(0, subtotal - totalDiscount + urgentAmount - subscriptionDiscount)
}

/**
 * Calculează totalurile pentru mai multe tăvițe.
 * Această funcție este o variantă optimizată care calculează totalurile pentru mai multe
 * tăvițe într-un singur apel. Folosește calculateTrayTotal pentru fiecare tăviță și
 * returnează un Map cu rezultatele. Este folosită pentru a calcula totalurile tuturor
 * tăvițelor dintr-un pipeline într-o singură operație.
 * 
 * @param trayIds - Array cu ID-urile tăvițelor pentru care se calculează totalurile
 * @param trayItems - Array cu toate item-urile de tăviță (se filtrează pentru fiecare tray_id)
 * @param servicePrices - Map cu prețurile serviciilor (service_id -> price)
 * @returns Map cu cheia tray_id și valoarea totalul calculat pentru fiecare tăviță
 */
export function calculateTrayTotals(
  trayIds: string[],
  trayItems: RawTrayItem[],
  servicePrices: Map<string, number>
): Map<string, number> {
  const totalsMap = new Map<string, number>()
  
  trayIds.forEach(trayId => {
    totalsMap.set(trayId, calculateTrayTotal(trayId, trayItems, servicePrices))
  })
  
  return totalsMap
}

// ==================== ESTIMATED TIME CALCULATION ====================

/**
 * Calculează timpul estimat pentru o tăviță (în minute).
 * Timpul estimat este suma timpilor serviciilor (câmpul `time`) înmulțită cu cantitatea.
 * 
 * @param trayId - ID-ul tăviței pentru care se calculează timpul
 * @param trayItems - Array cu toate item-urile de tăviță
 * @param serviceTimes - Map cu timpii serviciilor (service_id -> time în minute)
 * @returns Timpul total estimat în minute
 */
export function calculateTrayEstimatedTime(
  trayId: string,
  trayItems: RawTrayItem[],
  serviceTimes: Map<string, number>,
  technicianInstrumentIds?: string[] | null
): number {
  const items = trayItems.filter(ti => ti.tray_id === trayId)
  
  let totalTime = 0
  let totalInstrumentCount = 0
  let technicianInstrumentCount = 0
  let technicianTime = 0
  
  items.forEach(item => {
    if (!item.service_id) return
    
    const serviceTime = serviceTimes.get(item.service_id) || 0
    const qty = item.qty || 1
    const itemTime = serviceTime * qty
    
    totalTime += itemTime
    
    // Contorizează instrumente
    if (item.instrument_id) {
      totalInstrumentCount += 1
      
      // Dacă am instrument IDs pentru tehnician, verific dacă item-ul e pentru lui
      if (technicianInstrumentIds && technicianInstrumentIds.includes(item.instrument_id)) {
        technicianInstrumentCount += 1
        technicianTime += itemTime
      }
    }
  })
  
  // Dacă s-au specificat instrumente pentru tehnician, returnează timp proporțional
  if (technicianInstrumentIds && technicianInstrumentIds.length > 0) {
    // Returnează direct suma pentru instrumentele tehnicianului
    // (care deja a fost calculată în loop-ul de sus)
    return technicianTime
  }
  
  return totalTime
}

/**
 * Calculează timpul estimat pentru mai multe tăvițe.
 * Returnează un Map cu tray_id -> timpul total estimat (în minute).
 * 
 * @param trayIds - Array cu ID-urile tăvițelor
 * @param trayItems - Array cu toate item-urile de tăviță
 * @param serviceTimes - Map cu timpii serviciilor (service_id -> time în minute)
 * @returns Map cu cheia tray_id și valoarea timpul estimat în minute
 */
export function calculateTrayEstimatedTimes(
  trayIds: string[],
  trayItems: RawTrayItem[],
  serviceTimes: Map<string, number>
): Map<string, number> {
  const timesMap = new Map<string, number>()
  
  trayIds.forEach(trayId => {
    timesMap.set(trayId, calculateTrayEstimatedTime(trayId, trayItems, serviceTimes))
  })
  
  return timesMap
}

// ==================== TRAY FILTERING ====================

/**
 * Filtrează tăvițele pentru pipeline-urile de departament bazat pe atribuirea tehnicianului.
 * Această funcție implementă logica de filtrare pentru pipeline-urile de departament (Saloane,
 * Horeca, Frizerii, Reparatii), unde utilizatorii non-admin pot vedea doar tăvițele care
 * le sunt atribuite. Regulile de filtrare sunt:
 * - Utilizatorul poate vedea tăvițe unde are cel puțin un item atribuit
 * - Utilizatorul poate vedea tăvițe fără tehnician atribuit (vizibile pentru toți)
 * - Tăvițele în stage-ul "Noua" NU sunt vizibile pentru tehnicianul atribuit (excepție specială)
 * 
 * @param trayIds - Array cu ID-urile tăvițelor de filtrat
 * @param trayItems - Array cu toate item-urile de tăviță (nefolosit dacă trays e dat; păstrat pentru compatibilitate)
 * @param pipelineItems - Array cu item-urile din pipeline (pentru a identifica stage-urile)
 * @param currentUserId - ID-ul utilizatorului curent pentru care se face filtrarea
 * @param trays - Opțional: tăvițe cu technician_id/technician2_id/technician3_id; dacă dat, filtrarea se face după acestea
 * @returns Array filtrat cu ID-urile tăvițelor vizibile pentru utilizator
 */
export function filterTraysForUser(
  trayIds: string[],
  trayItems: RawTrayItem[],
  pipelineItems: PipelineItemWithStage[],
  currentUserId: string,
  trays?: RawTray[]
): string[] {
  // DEBUG / SIMPLIFICARE TEMPORARĂ:
  // La cerere, dezactivăm TOATE filtrările pe tăvițe în pipeline-urile de departament.
  // Toate tăvițele care există în pipeline vor fi vizibile pentru toți utilizatorii.
  const trayIdsArray = Array.isArray(trayIds) ? trayIds : []
  return trayIdsArray
}

// ==================== PIPELINE ITEM GROUPING ====================

/**
 * Grupează item-urile din pipeline după tip.
 * Această funcție separă item-urile din pipeline în trei categorii: leads, service files
 * și trays. De asemenea, creează un Map pentru acces rapid la item-uri după tip și ID.
 * Funcția este folosită pentru a organiza datele înainte de a le transforma în KanbanItems.
 * 
 * @param pipelineItems - Array cu toate item-urile din pipeline
 * @returns Obiect cu:
 *   - leads: Array cu ID-urile lead-urilor
 *   - serviceFiles: Array cu ID-urile fișelor de serviciu
 *   - trays: Array cu ID-urile tăvițelor
 *   - itemMap: Map cu cheia "type:id" și valoarea PipelineItemWithStage pentru acces rapid
 */
export function groupPipelineItemsByType(
  pipelineItems: PipelineItemWithStage[]
): {
  leads: string[]
  serviceFiles: string[]
  trays: string[]
  itemMap: Map<string, PipelineItemWithStage>
} {
  const leads: string[] = []
  const serviceFiles: string[] = []
  const trays: string[] = []
  const itemMap = new Map<string, PipelineItemWithStage>()
  
  pipelineItems.forEach(item => {
    const key = `${item.type}:${item.item_id}`
    itemMap.set(key, item)
    
    if (item.type === 'lead') leads.push(item.item_id)
    else if (item.type === 'service_file') serviceFiles.push(item.item_id)
    else if (item.type === 'tray') trays.push(item.item_id)
  })
  
  return { leads, serviceFiles, trays, itemMap }
}

/**
 * Obține un item din pipeline din map-ul de item-uri.
 * Această funcție este un helper pentru a obține rapid un item din pipeline folosind
 * tipul și ID-ul item-ului. Folosește map-ul creat de groupPipelineItemsByType pentru
 * acces O(1) la item-uri.
 * 
 * @param itemMap - Map-ul de item-uri creat de groupPipelineItemsByType
 * @param type - Tipul item-ului: 'lead', 'service_file' sau 'tray'
 * @param itemId - ID-ul item-ului de obținut
 * @returns PipelineItemWithStage dacă există, sau undefined dacă nu există
 */
export function getPipelineItem(
  itemMap: Map<string, PipelineItemWithStage>,
  type: string,
  itemId: string
): PipelineItemWithStage | undefined {
  return itemMap.get(`${type}:${itemId}`)
}

