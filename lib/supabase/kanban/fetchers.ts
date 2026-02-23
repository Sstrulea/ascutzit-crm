/**
 * Kanban Data Fetchers
 * 
 * Pure data fetching functions that retrieve raw data from Supabase.
 * These functions do NOT contain business logic - they just fetch data.
 */

import { supabaseBrowser } from '../supabaseClient'
import type { 
  PipelineItemWithStage, 
  RawLead, 
  RawServiceFile, 
  RawTray,
  RawTrayItem,
  KanbanTag
} from './types'
import { parseServiceTimeToMinutes } from '@/lib/utils/service-time'

// ==================== PIPELINE ITEMS ====================

/**
 * Obține toate item-urile dintr-un pipeline cu informații despre stage-uri.
 * Această funcție este folosită pentru a încărca toate item-urile (leads, service files, trays)
 * dintr-un pipeline specificat, împreună cu informațiile despre stage-urile în care se află.
 * Rezultatul include ID-ul, tipul, item_id, pipeline_id, stage_id și detaliile stage-ului.
 * 
 * @param pipelineId - ID-ul pipeline-ului pentru care se încarcă item-urile
 * @returns Obiect cu array-ul de PipelineItemWithStage sau array gol și eroarea dacă există
 */
export async function fetchPipelineItems(
  pipelineId: string
): Promise<{ data: PipelineItemWithStage[]; error: any }> {
  const supabase = supabaseBrowser()
  
  const { data, error } = await supabase
    .from('pipeline_items')
    .select(`
      id, type, item_id, pipeline_id, stage_id, created_at, updated_at,
      stage:stages(id, name)
    `)
    .eq('pipeline_id', pipelineId)
    .order('created_at', { ascending: false })
  
  if (error) return { data: [], error }
  return { data: (data || []) as PipelineItemWithStage[], error: null }
}

/**
 * Obține un singur item din pipeline după tip, item_id și pipeline_id.
 * Această funcție este folosită pentru a găsi un item specific într-un pipeline,
 * de exemplu când se verifică dacă un lead este deja într-un pipeline sau pentru
 * a obține informații despre poziția unui item în pipeline.
 * 
 * @param type - Tipul item-ului: 'lead', 'service_file' sau 'tray'
 * @param itemId - ID-ul item-ului de căutat
 * @param pipelineId - ID-ul pipeline-ului în care se caută
 * @returns Obiect cu PipelineItemWithStage sau null dacă nu există și eroarea dacă există
 */
export async function fetchSinglePipelineItem(
  type: string,
  itemId: string,
  pipelineId: string
): Promise<{ data: PipelineItemWithStage | null; error: any }> {
  const supabase = supabaseBrowser()
  
  const { data, error } = await supabase
    .from('pipeline_items')
    .select(`
      id, type, item_id, pipeline_id, stage_id, created_at, updated_at,
      stage:stages(id, name)
    `)
    .eq('type', type)
    .eq('item_id', itemId)
    .eq('pipeline_id', pipelineId)
    .maybeSingle()

  if (error) return { data: null, error }
  return { data: data as PipelineItemWithStage | null, error: null }
}

/**
 * Pentru pipeline Receptie: un singur request care întoarce atât item-urile din pipeline
 * cât și pipeline_items de tip tray din stage-urile de departament (pentru carduri virtuale).
 * Înlocuiește fetchPipelineItems(pipelineId) + query separat type=tray, stage_id in (deptStageIds).
 */
export async function fetchPipelineItemsReceptie(
  pipelineId: string,
  deptStageIds: string[]
): Promise<{
  data: PipelineItemWithStage[]
  receptieItems: PipelineItemWithStage[]
  trayItemsInDept: Array<{ item_id: string; stage_id: string; pipeline_id?: string }>
  error: any
}> {
  const supabase = supabaseBrowser()
  const empty = { data: [], receptieItems: [], trayItemsInDept: [], error: null as any }

  if (deptStageIds.length === 0) {
    const { data, error } = await supabase
      .from('pipeline_items')
      .select('id, type, item_id, pipeline_id, stage_id, created_at, updated_at, stage:stages(id, name)')
      .eq('pipeline_id', pipelineId)
      .order('created_at', { ascending: false })
    if (error) return { ...empty, error }
    const list = (data || []) as PipelineItemWithStage[]
    return { data: list, receptieItems: list, trayItemsInDept: [], error: null }
  }

  const orFilter = `pipeline_id.eq.${pipelineId},and(type.eq.tray,stage_id.in.(${deptStageIds.join(',')}))`
  const { data, error } = await supabase
    .from('pipeline_items')
    .select('id, type, item_id, pipeline_id, stage_id, created_at, updated_at, stage:stages(id, name)')
    .or(orFilter)
    .order('created_at', { ascending: false })

  if (error) return { ...empty, error }
  const list = (data || []) as PipelineItemWithStage[]
  const receptieItems = list.filter(p => p.pipeline_id === pipelineId)
  const trayItemsInDept = list
    .filter(p => p.type === 'tray')
    .map(p => ({ item_id: p.item_id, stage_id: p.stage_id, pipeline_id: p.pipeline_id }))
  return { data: list, receptieItems, trayItemsInDept, error: null }
}

/** Tip returnat de fetchTrayPipelineItemsBatch */
export type TrayPipelineItemRow = { item_id: string; stage_id: string; pipeline_id: string }

/**
 * Un singur request pentru toate pipeline_items de tip tray pentru un set de tray ids.
 * Folosit în Receptie pentru loadVirtualServiceFiles, getServiceFilesWithTraysInDepartments,
 * getAllTraysInfoForServiceFiles – înlocuiește 3 query-uri separate.
 */
export async function fetchTrayPipelineItemsBatch(
  trayIds: string[]
): Promise<{ data: TrayPipelineItemRow[]; error: any }> {
  const supabase = supabaseBrowser()
  if (trayIds.length === 0) return { data: [], error: null }
  const { data, error } = await supabase
    .from('pipeline_items')
    .select('item_id, stage_id, pipeline_id')
    .eq('type', 'tray')
    .in('item_id', trayIds)
  if (error) return { data: [], error }
  return { data: (data || []) as TrayPipelineItemRow[], error: null }
}

// ==================== LEADS ====================

/**
 * Obține lead-uri după ID-uri (batch fetch).
 * Această funcție este folosită pentru a încărca mai multe lead-uri simultan,
 * optimizând numărul de query-uri către baza de date. Returnează doar câmpurile
 * necesare pentru afișarea în Kanban: nume, email, telefon, date despre campanie/anunț/formular.
 * 
 * @param leadIds - Array cu ID-urile lead-urilor de încărcat
 * @returns Obiect cu array-ul de RawLead sau array gol dacă nu există lead-uri sau apare o eroare
 */
const LEADS_SELECT_FULL =
  'id, full_name, email, phone_number, created_at, campaign_name, ad_name, form_name, tray_details, details, city, company_name, company_address, address, address2, zip, strada, judet, callback_date, nu_raspunde_callback_at, suna_acknowledged_at, curier_trimis_at, office_direct_at, curier_trimis_user_id, office_direct_user_id, follow_up_set_at, follow_up_callback_at, has_ever_been_moved, no_deal, claimed_by, contact_person, contact_phone, billing_nume_prenume, billing_nume_companie, billing_cui, billing_strada, billing_oras, billing_judet, billing_cod_postal'
const LEADS_SELECT_NO_HAS_EVER =
  'id, full_name, email, phone_number, created_at, campaign_name, ad_name, form_name, tray_details, details, city, company_name, company_address, address, address2, zip, strada, judet, callback_date, nu_raspunde_callback_at, suna_acknowledged_at, curier_trimis_at, office_direct_at, curier_trimis_user_id, office_direct_user_id, follow_up_set_at, no_deal, claimed_by, contact_person, contact_phone, billing_nume_prenume, billing_nume_companie, billing_cui, billing_strada, billing_oras, billing_judet, billing_cod_postal'
const LEADS_SELECT_MINIMAL =
  'id, full_name, email, phone_number, created_at, campaign_name, ad_name, form_name, tray_details, details, city, company_name, company_address, address, address2, zip, strada, judet, callback_date, nu_raspunde_callback_at, suna_acknowledged_at, curier_trimis_at, office_direct_at, curier_trimis_user_id, office_direct_user_id, no_deal, claimed_by, contact_person, contact_phone, billing_nume_prenume, billing_nume_companie, billing_cui, billing_strada, billing_oras, billing_judet, billing_cod_postal'
/** Fallback fără suna_acknowledged_at când coloana nu există încă în DB */
const LEADS_SELECT_MINIMAL_LEGACY =
  'id, full_name, email, phone_number, created_at, campaign_name, ad_name, form_name, tray_details, details, city, company_name, company_address, address, address2, zip, strada, judet, callback_date, nu_raspunde_callback_at, no_deal, contact_person, contact_phone, billing_nume_prenume, billing_nume_companie, billing_cui, billing_strada, billing_oras, billing_judet, billing_cod_postal'
/** Ultimul fallback – doar coloane esențiale pentru Kanban (când schema e incompatibilă). */
const LEADS_SELECT_ULTRA =
  'id, full_name, email, phone_number, created_at, campaign_name, ad_name, form_name, tray_details, details, city, company_name, company_address, address, address2, zip, strada, judet, callback_date, nu_raspunde_callback_at, no_deal, contact_person, contact_phone'

function isMissingColumnError(e: any): boolean {
  if (!e) return false
  const code = String(e?.code ?? '')
  const msg = String(e?.message ?? '')
  const details = String(e?.details ?? '')
  const status = e?.status ?? e?.statusCode
  const is400 = status === 400
  const looksLikeColumn = /does not exist|has_ever_been_moved|follow_up_set_at|follow_up_callback_at|suna_acknowledged_at|curier_trimis_at|office_direct_at|curier_trimis_user_id|office_direct_user_id|colet_ajuns|column.*does not exist|42703/i.test(msg + details)
  return is400 || code === '42703' || looksLikeColumn
}

/** Chunk size pentru .in() – URL prea lung cu 80+ UUID-uri → 400. */
const IN_CHUNK = 80

/**
 * Număr de mesaje trimise de utilizatori (exclude SYSTEM) per lead.
 * Conversația e legată de lead prin conversations.related_id = lead_id, type = 'lead'.
 */
export async function fetchUserMessageCountByLeadIds(
  leadIds: string[]
): Promise<{ data: Map<string, number>; error: any }> {
  const out = new Map<string, number>()
  if (leadIds.length === 0) return { data: out, error: null }
  const supabase = supabaseBrowser()
  const uniq = Array.from(new Set(leadIds))
  const convList: Array<{ id: string; related_id: string }> = []
  for (let i = 0; i < uniq.length; i += IN_CHUNK) {
    const chunk = uniq.slice(i, i + IN_CHUNK)
    const { data: convs, error: convErr } = await supabase
      .from('conversations')
      .select('id, related_id')
      .eq('type', 'lead')
      .in('related_id', chunk)
    if (convErr) return { data: out, error: convErr }
    convList.push(...((convs || []) as Array<{ id: string; related_id: string }>))
  }
  const convIds = convList.map((c) => c.id).filter(Boolean)
  if (convIds.length === 0) {
    uniq.forEach((id) => out.set(id, 0))
    return { data: out, error: null }
  }
  const messages: Array<{ conversation_id: string; message_type?: string | null }> = []
  for (let i = 0; i < convIds.length; i += IN_CHUNK) {
    const chunk = convIds.slice(i, i + IN_CHUNK)
    const { data: msgs, error: msgErr } = await supabase
      .from('messages')
      .select('id, conversation_id, message_type')
      .in('conversation_id', chunk)
    if (msgErr) return { data: out, error: msgErr }
    messages.push(...((msgs || []) as Array<{ conversation_id: string; message_type?: string | null }>))
  }
  const convToLead = new Map(convList.map((c) => [c.id, c.related_id]))
  const countByConv = new Map<string, number>()
  for (const m of (messages || []) as Array<{ conversation_id: string; message_type?: string | null }>) {
    const type = (m.message_type || '').toLowerCase()
    if (type === 'system') continue
    const c = countByConv.get(m.conversation_id) ?? 0
    countByConv.set(m.conversation_id, c + 1)
  }
  uniq.forEach((leadId) => out.set(leadId, 0))
  countByConv.forEach((count, convId) => {
    const leadId = convToLead.get(convId)
    if (leadId != null) out.set(leadId, (out.get(leadId) ?? 0) + count)
  })
  return { data: out, error: null }
}

/**
 * Obține numele utilizatorilor din app_members după user_id.
 * Folosit pentru claimed_by_name, curier_trimis_user_name, office_direct_user_name pe carduri.
 */
export async function fetchUserNamesByIds(
  userIds: string[]
): Promise<{ data: Map<string, string>; error: any }> {
  const out = new Map<string, string>()
  const uniq = Array.from(new Set(userIds)).filter(Boolean)
  if (uniq.length === 0) return { data: out, error: null }
  const supabase = supabaseBrowser()
  const { data, error } = await supabase
    .from('app_members')
    .select('user_id, name')
    .in('user_id', uniq)
  if (error) return { data: out, error }
  for (const row of (data || []) as { user_id: string; name: string | null }[]) {
    const name = (row?.name && String(row.name).trim()) || null
    if (row?.user_id && name) out.set(row.user_id, name)
  }
  return { data: out, error: null }
}

/** Secvența de fallback pentru leads: de la select complet la ultra-minimal (400 Bad Request = coloană inexistentă). */
const LEADS_SELECT_SEQUENCE = [
  LEADS_SELECT_MINIMAL,
  LEADS_SELECT_NO_HAS_EVER,
  LEADS_SELECT_MINIMAL_LEGACY,
  LEADS_SELECT_ULTRA,
] as const

/** Mărime maximă a batch-ului pentru .in() – URL-ul depășește limitele (~16KB) cu 80+ UUID-uri. */
const LEADS_IN_CHUNK_SIZE = 80

function isUriTooLongError(e: any): boolean {
  if (!e) return false
  const msg = String(e?.message ?? '').toLowerCase()
  const status = e?.status ?? e?.statusCode
  return status === 400 || status === 414 || msg.includes('uri') || msg.includes('too long') || msg.includes('bad request')
}

export async function fetchLeadsByIds(
  leadIds: string[]
): Promise<{ data: RawLead[]; error: any }> {
  if (leadIds.length === 0) return { data: [], error: null }
  
  const supabase = supabaseBrowser()
  const uniq = Array.from(new Set(leadIds))
  let lastError: any = null
  
  const fetchChunk = async (chunk: string[], selectStr: string) => {
    const { data, error } = await supabase
      .from('leads')
      .select(selectStr)
      .in('id', chunk)
    return { data, error }
  }

  for (const selectStr of LEADS_SELECT_SEQUENCE) {
    if (uniq.length <= LEADS_IN_CHUNK_SIZE) {
      const { data, error } = await fetchChunk(uniq, selectStr)
      if (!error) return { data: (data || []) as RawLead[], error: null }
      lastError = error
      if (!isMissingColumnError(error)) return { data: [], error }
      continue
    }

    // Chunking: multe ID-uri → URL prea lung → 400. Împărțim în batch-uri.
    const allData: RawLead[] = []
    let chunkError: any = null
    for (let i = 0; i < uniq.length; i += LEADS_IN_CHUNK_SIZE) {
      const chunk = uniq.slice(i, i + LEADS_IN_CHUNK_SIZE)
      const { data, error } = await fetchChunk(chunk, selectStr)
      if (error) {
        chunkError = error
        if (isMissingColumnError(error) || isUriTooLongError(error)) break
        return { data: [], error }
      }
      allData.push(...((data || []) as RawLead[]))
    }
    if (!chunkError) return { data: allData, error: null }
    lastError = chunkError
    if (!isMissingColumnError(chunkError) && !isUriTooLongError(chunkError)) return { data: [], error: chunkError }
  }
  
  if (process.env.NODE_ENV === 'development' && lastError) {
    console.error('[fetchLeadsByIds] Toate fallback-urile au eșuat. Ultima eroare:', {
      message: lastError?.message,
      details: lastError?.details,
      hint: lastError?.hint,
      code: lastError?.code,
    })
  }
  return { data: [], error: lastError }
}


// ==================== SERVICE FILES ====================

/**
 * Obține fișe de serviciu după ID-uri cu date despre lead-ul asociat.
 * Această funcție încarcă fișele de serviciu împreună cu informațiile despre lead-ul
 * asociat într-un singur query (folosind join). Este folosită pentru a afișa fișele
 * în board-ul Kanban cu toate detaliile necesare despre client.
 * 
 * @param serviceFileIds - Array cu ID-urile fișelor de serviciu de încărcat
 * @returns Obiect cu array-ul de RawServiceFile (cu lead inclus) sau array gol dacă nu există sau apare o eroare
 */
const SERVICE_FILES_SELECT = `
  id, lead_id, number, status, created_at, office_direct, curier_trimis, urgent, nu_raspunde_callback_at,
  lead:leads(id, full_name, email, phone_number, created_at, campaign_name, ad_name, form_name, tray_details, details, city, company_name, company_address, address, address2, zip, strada, judet, contact_person, contact_phone, billing_nume_prenume, billing_nume_companie, billing_cui, billing_strada, billing_oras, billing_judet, billing_cod_postal)
`
const SERVICE_FILES_SELECT_WITH_COLET = `
  id, lead_id, number, status, created_at, office_direct, curier_trimis, colet_neridicat, colet_ajuns, urgent, nu_raspunde_callback_at,
  lead:leads(id, full_name, email, phone_number, created_at, campaign_name, ad_name, form_name, tray_details, details, city, company_name, company_address, address, address2, zip, strada, judet, contact_person, contact_phone, billing_nume_prenume, billing_nume_companie, billing_cui, billing_strada, billing_oras, billing_judet, billing_cod_postal)
`
/** Fallback cu lead minimal – doar coloane esențiale (când schema leads e incompatibilă). */
const SERVICE_FILES_SELECT_MINIMAL_LEAD = `
  id, lead_id, number, status, created_at, office_direct, curier_trimis, urgent, nu_raspunde_callback_at,
  lead:leads(id, full_name, email, phone_number, created_at, campaign_name, ad_name, form_name, tray_details, details, city, company_name, company_address, address)
`

const SERVICE_FILES_SELECT_SEQUENCE = [
  SERVICE_FILES_SELECT_WITH_COLET,
  SERVICE_FILES_SELECT,
  SERVICE_FILES_SELECT_MINIMAL_LEAD,
] as const

/** Chunk size pentru .in() – evită 400 când URL-ul depășește ~16KB. */
const IN_FILTER_CHUNK_SIZE = 80

export async function fetchServiceFilesByIds(
  serviceFileIds: string[]
): Promise<{ data: RawServiceFile[]; error: any }> {
  if (serviceFileIds.length === 0) return { data: [], error: null }
  
  const supabase = supabaseBrowser()
  const uniq = Array.from(new Set(serviceFileIds))
  let lastError: any = null
  
  const fetchChunk = (chunk: string[], selectStr: string) =>
    supabase.from('service_files').select(selectStr).in('id', chunk)
  
  for (const selectStr of SERVICE_FILES_SELECT_SEQUENCE) {
    const chunks: string[][] = []
    for (let i = 0; i < uniq.length; i += IN_FILTER_CHUNK_SIZE) {
      chunks.push(uniq.slice(i, i + IN_FILTER_CHUNK_SIZE))
    }
    const allData: RawServiceFile[] = []
    let chunkError: any = null
    for (const chunk of chunks) {
      const { data, error } = await fetchChunk(chunk, selectStr)
      if (error) {
        chunkError = error
        break
      }
      allData.push(...((data || []) as RawServiceFile[]))
    }
    if (!chunkError) return { data: allData, error: null }
    lastError = chunkError
    if (!isMissingColumnError(chunkError) && !isUriTooLongError(chunkError)) return { data: [], error: chunkError }
  }
  
  if (process.env.NODE_ENV === 'development' && lastError) {
    console.error('[fetchServiceFilesByIds] Toate fallback-urile au eșuat:', lastError?.message, lastError?.details)
  }
  return { data: [], error: lastError }
}

/**
 * Obține toate fișele de serviciu pentru lead-uri specificate.
 * Această funcție este folosită pentru a găsi toate fișele de serviciu asociate cu
 * un set de lead-uri. Este folosită în calcularea totalurilor pentru lead-uri,
 * unde trebuie să se găsească toate fișele unui lead pentru a calcula suma totală.
 * 
 * @param leadIds - Array cu ID-urile lead-urilor pentru care se caută fișele
 * @returns Obiect cu array-ul de obiecte {id, lead_id} sau array gol dacă nu există sau apare o eroare
 */
export async function fetchServiceFilesForLeads(
  leadIds: string[]
): Promise<{ data: Array<{ id: string; lead_id: string }>; error: any }> {
  if (leadIds.length === 0) return { data: [], error: null }
  
  const supabase = supabaseBrowser()
  const uniq = Array.from(new Set(leadIds))
  const allData: Array<{ id: string; lead_id: string }> = []
  
  for (let i = 0; i < uniq.length; i += IN_FILTER_CHUNK_SIZE) {
    const chunk = uniq.slice(i, i + IN_FILTER_CHUNK_SIZE)
    const { data, error } = await supabase
      .from('service_files')
      .select('id, lead_id')
      .in('lead_id', chunk)
    if (error) return { data: [], error }
    allData.push(...(data || []))
  }
  return { data: allData, error: null }
}

// ==================== TRAYS ====================

/**
 * Obține tăvițe după ID-uri cu date despre fișa de serviciu și lead-ul asociat.
 * Această funcție încarcă tăvițele împreună cu informațiile despre fișa de serviciu
 * și lead-ul asociat într-un singur query (folosind join-uri nested). Este folosită
 * pentru a afișa tăvițele în board-ul Kanban cu toate detaliile necesare despre client.
 * 
 * @param trayIds - Array cu ID-urile tăvițelor de încărcat
 * @returns Obiect cu array-ul de RawTray (cu service_file și lead incluși) sau array gol dacă nu există sau apare o eroare
 */
export async function fetchTraysByIds(
  trayIds: string[]
): Promise<{ data: RawTray[]; error: any }> {
  if (trayIds.length === 0) return { data: [], error: null }
  
  const supabase = supabaseBrowser()
  
  const { data, error } = await supabase
    .from('trays')
    .select(`
      id, number, status, created_at, service_file_id, technician_id, technician2_id, technician3_id,
      service_file:service_files!inner(lead_id, urgent, lead:leads!inner(id, full_name, email, phone_number, created_at, campaign_name, ad_name, form_name, tray_details, details, city, company_name, company_address, address, address2, zip, strada, judet, contact_person, contact_phone, billing_nume_prenume, billing_nume_companie, billing_cui, billing_strada, billing_oras, billing_judet, billing_cod_postal))
    `)
    .in('id', trayIds)
  
  if (error) return { data: [], error }
  return { data: (data || []) as RawTray[], error: null }
}

/**
 * Obține toate tăvițele pentru fișe de serviciu specificate.
 * Această funcție este folosită pentru a găsi toate tăvițele asociate cu un set de
 * fișe de serviciu. Este folosită în calcularea totalurilor, unde trebuie să se găsească
 * toate tăvițele unei fișe pentru a calcula suma totală.
 * 
 * @param serviceFileIds - Array cu ID-urile fișelor de serviciu pentru care se caută tăvițele
 * @returns Obiect cu array-ul de obiecte {id, service_file_id} sau array gol dacă nu există sau apare o eroare
 */
export async function fetchTraysForServiceFiles(
  serviceFileIds: string[]
): Promise<{ data: Array<{ id: string; service_file_id: string }>; error: any }> {
  if (serviceFileIds.length === 0) return { data: [], error: null }
  
  const supabase = supabaseBrowser()
  
  const { data, error } = await supabase
    .from('trays')
    .select('id, service_file_id')
    .in('service_file_id', serviceFileIds)
  
  if (error) return { data: [], error }
  return { data: data || [], error: null }
}

// ==================== TRAY ITEMS ====================

/**
 * Obține item-urile de tăviță pentru ID-uri de tăvițe specificate.
 * Această funcție încarcă toate item-urile (servicii, piese) dintr-un set de tăvițe.
 * Item-urile conțin informații despre tehnician, cantitate, serviciu și note (care pot
 * conține preț, discount, urgent, etc.). Este folosită pentru calcularea totalurilor
 * și pentru afișarea detaliilor tăvițelor.
 * 
 * @param trayIds - Array cu ID-urile tăvițelor pentru care se încarcă item-urile
 * @returns Obiect cu array-ul de RawTrayItem sau array gol dacă nu există sau apare o eroare
 */
export async function fetchTrayItems(
  trayIds: string[]
): Promise<{ data: RawTrayItem[]; error: any }> {
  if (trayIds.length === 0) return { data: [], error: null }
  
  const supabase = supabaseBrowser()
  
  const { data, error } = await supabase
    .from('tray_items')
    .select('tray_id, notes, qty, service_id, instrument_id')
    .in('tray_id', trayIds)
  
  if (error) return { data: [], error }
  return { data: (data || []) as RawTrayItem[], error: null }
}

/**
 * Obține item-urile de tăviță pentru tăvițe atribuite tehnicianului sau neatribuite.
 * Filtrarea se face la nivel de tray (trays.technician_id = technicianId sau NULL), nu pe tray_items.
 */
export async function fetchTrayItemsForTechnicianOrUnassigned(
  trayIds: string[],
  technicianId: string
): Promise<{ data: RawTrayItem[]; error: any }> {
  if (trayIds.length === 0) return { data: [], error: null }
  const supabase = supabaseBrowser()
  const { data: trays, error: traysErr } = await supabase
    .from('trays')
    .select('id')
    .in('id', trayIds)
    .or(`technician_id.eq.${technicianId},technician_id.is.null`)
  if (traysErr || !trays?.length) return { data: [], error: traysErr ?? null }
  const allowedTrayIds = trays.map((t: any) => t.id)
  return fetchTrayItems(allowedTrayIds)
}

/**
 * Obține item-urile de tăviță filtrate după departament.
 * Această funcție este folosită pentru pipeline-urile de departament pentru a găsi
 * toate tăvițele care au item-uri atribuite unui departament specific. Este folosită
 * în strategia DepartmentPipelineStrategy pentru a auto-crea pipeline_items pentru
 * tăvițe care aparțin departamentului dar nu au încă o înregistrare în pipeline_items.
 * 
 * @param departmentId - ID-ul departamentului (care corespunde cu pipeline_id pentru departamente)
 * @returns Obiect cu array-ul de obiecte {tray_id} sau array gol dacă nu există sau apare o eroare
 */
export async function fetchTrayItemsByDepartment(
  departmentId: string
): Promise<{ data: Array<{ tray_id: string }>; error: any }> {
  const supabase = supabaseBrowser()
  
  const { data, error } = await supabase
    .from('tray_items')
    .select('tray_id')
    .eq('department_id', departmentId)
  
  if (error) return { data: [], error }
  return { data: data || [], error: null }
}

// ==================== SPLIT EVENTS (pentru „De la [nume]” la împărțire tăviță) ====================

/**
 * Pentru tăvițe date, returnează pentru fiecare tehnician țintă (receptor de split) numele
 * utilizatorului care a făcut împărțirea. Folosit în pipeline-urile de departament ca să afișăm
 * cardul în stage „Noua” cu eticheta „De la [nume]” pentru tehnicienii care au primit volume.
 *
 * @param trayIds - ID-uri de tăvițe
 * @returns Map<trayId, Map<targetTechnicianId, { senderName: string }>>
 */
export async function fetchSplitReceiversForTrays(
  trayIds: string[]
): Promise<{ data: Map<string, Map<string, { senderName: string }>>; error: any }> {
  if (trayIds.length === 0) return { data: new Map(), error: null }

  const supabase = supabaseBrowser()
  const { data: rows, error } = await supabase
    .from('items_events')
    .select('item_id, payload, actor_name, created_at')
    .eq('type', 'tray')
    .eq('event_type', 'tray_items_split_to_technician')
    .in('item_id', trayIds)
    .order('created_at', { ascending: false })

  if (error) return { data: new Map(), error }

  const out = new Map<string, Map<string, { senderName: string }>>()
  const seen = new Set<string>() // "trayId|targetTechnicianId" - păstrăm doar ultimul eveniment per pereche

  for (const row of rows || []) {
    const trayId = row.item_id as string
    const payload = (row.payload as Record<string, unknown>) || {}
    const targetId = (payload.target_technician_id as string) || null
    const userObj = payload.user as { name?: string } | undefined
    const senderName =
      (userObj?.name as string) ||
      (row.actor_name as string) ||
      'Coleg'

    if (!trayId || !targetId) continue
    const key = `${trayId}|${targetId}`
    if (seen.has(key)) continue
    seen.add(key)

    if (!out.has(trayId)) out.set(trayId, new Map())
    out.get(trayId)!.set(targetId, { senderName })
  }

  return { data: out, error: null }
}

// ==================== TAGS ====================

/**
 * Obține tag-urile pentru lead-uri specificate (batch fetch).
 * Această funcție folosește view-ul v_lead_tags pentru a obține toate tag-urile
 * asociate cu un set de lead-uri într-un singur query. Returnează un Map pentru
 * acces rapid la tag-urile unui lead după ID. Este folosită pentru a afișa tag-urile
 * pe card-urile Kanban.
 * 
 * @param leadIds - Array cu ID-urile lead-urilor pentru care se încarcă tag-urile
 * @returns Obiect cu Map-ul de tag-uri (lead_id -> KanbanTag[]) sau Map gol dacă nu există sau apare o eroare
 */
export async function fetchTagsForLeads(
  leadIds: string[]
): Promise<{ data: Map<string, KanbanTag[]>; error: any }> {
  if (leadIds.length === 0) return { data: new Map(), error: null }
  
  const supabase = supabaseBrowser()
  const uniq = Array.from(new Set(leadIds))
  const tagMap = new Map<string, KanbanTag[]>()
  
  for (let i = 0; i < uniq.length; i += IN_FILTER_CHUNK_SIZE) {
    const chunk = uniq.slice(i, i + IN_FILTER_CHUNK_SIZE)
    const { data, error } = await supabase
      .from('v_lead_tags')
      .select('lead_id, tags')
      .in('lead_id', chunk)
    if (error) return { data: new Map(), error }
    if (data) data.forEach((r: any) => tagMap.set(r.lead_id, r.tags || []))
  }
  return { data: tagMap, error: null }
}

// ==================== SERVICES (for pricing) ====================

/**
 * Obține prețurile serviciilor după ID-uri (batch fetch).
 * Această funcție este folosită pentru a încărca prețurile serviciilor necesare
 * pentru calcularea totalurilor tăvițelor. Returnează un Map pentru acces rapid
 * la prețul unui serviciu după ID. Este folosită în calcularea totalurilor când
 * item-urile de tăviță nu au preț explicit în notes.
 * 
 * @param serviceIds - Array cu ID-urile serviciilor pentru care se încarcă prețurile
 * @returns Obiect cu Map-ul de prețuri (service_id -> price) sau Map gol dacă nu există sau apare o eroare
 */
export async function fetchServicePrices(
  serviceIds: string[]
): Promise<{ data: Map<string, number>; error: any }> {
  if (serviceIds.length === 0) return { data: new Map(), error: null }
  
  const supabase = supabaseBrowser()
  
  const { data, error } = await supabase
    .from('services')
    .select('id, price')
    .in('id', serviceIds)
  
  if (error) return { data: new Map(), error }
  
  const priceMap = new Map<string, number>()
  if (data) {
    data.forEach((s: any) => priceMap.set(s.id, s.price || 0))
  }
  
  return { data: priceMap, error: null }
}

/**
 * Obține timpii serviciilor (câmpul `time`) pentru ID-uri de servicii specificate.
 * Timpul este stocat ca string (ex. "30", "45", "60" - minute).
 * 
 * @param serviceIds - Array cu ID-urile serviciilor pentru care se încarcă timpii
 * @returns Obiect cu Map<serviceId, timeInMinutes> sau Map gol dacă nu există
 */
export async function fetchServiceTimes(
  serviceIds: string[]
): Promise<{ data: Map<string, number>; error: any }> {
  if (serviceIds.length === 0) return { data: new Map(), error: null }
  
  const supabase = supabaseBrowser()
  
  const { data, error } = await supabase
    .from('services')
    .select('id, time')
    .in('id', serviceIds)
  
  if (error) return { data: new Map(), error }
  
  const timeMap = new Map<string, number>()
  if (data) {
    data.forEach((s: any) => {
      const timeValue = parseServiceTimeToMinutes(s?.time)
      if (Number.isFinite(timeValue) && timeValue > 0) timeMap.set(s.id, timeValue)
    })
  }
  
  return { data: timeMap, error: null }
}

// ==================== STAGES ====================

/**
 * Obține toate stage-urile pentru un pipeline specificat.
 * Această funcție încarcă toate stage-urile (active și inactive) dintr-un pipeline.
 * Este folosită pentru a construi structura board-ului Kanban și pentru a valida
 * stage-urile în operațiile de mutare.
 * 
 * @param pipelineId - ID-ul pipeline-ului pentru care se încarcă stage-urile
 * @returns Obiect cu array-ul de stage-uri {id, name} sau array gol dacă nu există sau apare o eroare
 */
export async function fetchStagesForPipeline(
  pipelineId: string
): Promise<{ data: Array<{ id: string; name: string }>; error: any }> {
  const supabase = supabaseBrowser()
  
  const { data, error } = await supabase
    .from('stages')
    .select('id, name')
    .eq('pipeline_id', pipelineId)
  
  if (error) return { data: [], error }
  return { data: data || [], error: null }
}

/**
 * Obține stage-uri după ID-uri (batch fetch).
 * Această funcție este folosită pentru a încărca mai multe stage-uri simultan,
 * optimizând numărul de query-uri către baza de date. Returnează ID-ul, numele
 * și pipeline_id pentru fiecare stage. Este folosită pentru validarea stage-urilor
 * și pentru construirea mapărilor stage_id -> stage name.
 * 
 * @param stageIds - Array cu ID-urile stage-urilor de încărcat
 * @returns Obiect cu array-ul de stage-uri {id, name, pipeline_id} sau array gol dacă nu există sau apare o eroare
 */
export async function fetchStagesByIds(
  stageIds: string[]
): Promise<{ data: Array<{ id: string; name: string; pipeline_id: string }>; error: any }> {
  if (stageIds.length === 0) return { data: [], error: null }
  
  const supabase = supabaseBrowser()
  
  const { data, error } = await supabase
    .from('stages')
    .select('id, name, pipeline_id')
    .in('id', stageIds)
  
  if (error) return { data: [], error }
  return { data: data || [], error: null }
}

// ==================== PIPELINE ITEM MUTATIONS ====================

/**
 * Creează mai multe pipeline_items în bulk (operație batch).
 * Această funcție este folosită pentru a crea mai multe înregistrări în pipeline_items
 * într-un singur query, optimizând performanța. Este folosită în strategia DepartmentPipelineStrategy
 * pentru a auto-crea pipeline_items pentru tăvițe care aparțin unui departament dar nu au
 * încă o înregistrare în pipeline_items.
 * 
 * @param items - Array cu obiecte care conțin:
 *   - type: Tipul item-ului ('lead', 'service_file' sau 'tray')
 *   - item_id: ID-ul item-ului
 *   - pipeline_id: ID-ul pipeline-ului
 *   - stage_id: ID-ul stage-ului în care se plasează item-ul
 * @returns Obiect cu array-ul de pipeline_items create sau array gol și eroarea dacă există
 */
export async function createPipelineItems(
  items: Array<{ type: string; item_id: string; pipeline_id: string; stage_id: string }>
): Promise<{ data: any[]; error: any }> {
  if (items.length === 0) return { data: [], error: null }
  
  const supabase = supabaseBrowser()
  
  const { data, error } = await supabase
    .from('pipeline_items')
    .insert(items)
    .select()
  
  if (error) return { data: [], error }
  return { data: data || [], error: null }
}

