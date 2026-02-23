/**
 * Kanban Types
 * 
 * Centralized type definitions for the Kanban system.
 * This file contains all interfaces and types used across the kanban module.
 */

// ==================== PIPELINE ITEM TYPES ====================

export type PipelineItemType = 'lead' | 'service_file' | 'tray'

export interface PipelineItem {
  id: string
  type: PipelineItemType
  item_id: string
  pipeline_id: string
  stage_id: string
  created_at: string
  updated_at: string
}

export interface PipelineItemWithStage extends PipelineItem {
  stage: {
    id: string
    name: string
  } | null
  isReadOnly?: boolean
}

// ==================== KANBAN ITEM (OUTPUT) ====================

export interface KanbanItem {
  id: string
  name: string
  email: string
  phone: string
  stage: string
  createdAt: string
  campaignName?: string
  adName?: string
  formName?: string
  leadId?: string
  stageId: string
  pipelineId: string
  /** Nume pipeline (ex. Horeca, Reparații) – pentru istoric și afișare; evitat „Pipeline necunoscut” */
  pipelineName?: string
  assignmentId: string
  tags?: KanbanTag[]
  stageMovedAt?: string
  technician?: string | null
  /** Al doilea tehnician (nume) */
  technician2?: string | null
  /** Al treilea tehnician (nume) */
  technician3?: string | null
  type: PipelineItemType
  // Service file specific
  serviceFileNumber?: string
  serviceFileStatus?: string
  /** Numerele tăvițelor fișei (ex. ['131', '15']) – afișate pe card în Receptie */
  trayNumbers?: string[]
  // Tray specific
  trayNumber?: string
  traySize?: string
  trayStatus?: string
  /** true dacă tăviță e rezultatul unui split (status='Splited') */
  isSplitChild?: boolean
  // Totals
  total?: number
  /** Timpul estimat pentru finalizare (în minute) - suma timpilor serviciilor */
  estimatedTime?: number
  // Read-only flag
  isReadOnly?: boolean
  // Timestamps for specific stages
  inLucruSince?: string
  inAsteptareSince?: string
  // Câmpuri adresă și companie
  city?: string | null
  company_name?: string | null
  company_address?: string | null
  address?: string | null
  address2?: string | null
  zip?: string | null
  strada?: string | null
  judet?: string | null
  // Call back date
  callback_date?: string | null
  /** Ora programată pentru a suna din nou (Nu Răspunde) - afișată pe card */
  nu_raspunde_callback_at?: string | null
  /** Când utilizatorul a eliminat eticheta Sună! – ascunde tag-ul până la următoarea dată de callback/nu răspunde */
  suna_acknowledged_at?: string | null
  /** Data când a fost setat Curier Trimis pe lead – afișare tag cu posibilitate eliminare */
  curier_trimis_at?: string | null
  /** Data când a fost setat Office Direct pe lead – afișare tag cu posibilitate eliminare */
  office_direct_at?: string | null
  /** Numele utilizatorului care a preluat lead-ul (claimed_by) */
  claimed_by_name?: string | null
  /** Numele utilizatorului care a atribuit Curier Trimis */
  curier_trimis_user_name?: string | null
  /** Numele utilizatorului care a atribuit Office Direct */
  office_direct_user_name?: string | null
  /** Ora la care a fost setat Follow Up - afișată pe card în Leaduri (doar ora) */
  follow_up_set_at?: string | null
  /** Ora din Call Back / Nu răspunde (înainte de mutare în Leaduri + Follow Up); afișată pe card */
  follow_up_callback_at?: string | null
  /** true dacă lead-ul a fost mutat cel puțin o dată; eticheta NOU dispare la prima mutare */
  has_ever_been_moved?: boolean | null
  // Câmpuri pentru persoana de contact (livrare)
  contact_person?: string | null
  contact_phone?: string | null
  // Câmpuri pentru facturare
  billing_nume_prenume?: string | null
  billing_nume_companie?: string | null
  billing_cui?: string | null
  billing_strada?: string | null
  billing_oras?: string | null
  billing_judet?: string | null
  billing_cod_postal?: string | null
  /** Informații client (din formular sau manual) */
  details?: string | null
  /** Data când a fost validat Quality Check (în stage De facturat se afișează în loc de createdAt) */
  qcValidatedAt?: string | null
  /** Număr de mesaje din conversație (doar mesaje utilizator, nu SYSTEM) – afișat pe card cu iconiță */
  userMessageCount?: number
}

export interface KanbanTag {
  id: string
  name: string
  color: 'green' | 'yellow' | 'red' | 'blue' | 'orange'
}

// ==================== RAW DATA TYPES ====================

export interface RawLead {
  id: string
  full_name: string | null
  email: string | null
  phone_number: string | null
  created_at: string
  campaign_name?: string | null
  ad_name?: string | null
  form_name?: string | null
  tray_details?: any
  city?: string | null
  company_name?: string | null
  company_address?: string | null
  address?: string | null
  address2?: string | null
  zip?: string | null
  callback_date?: string | null
  nu_raspunde_callback_at?: string | null
  suna_acknowledged_at?: string | null
  curier_trimis_at?: string | null
  office_direct_at?: string | null
  curier_trimis_user_id?: string | null
  office_direct_user_id?: string | null
  claimed_by?: string | null
  follow_up_set_at?: string | null
  follow_up_callback_at?: string | null
  has_ever_been_moved?: boolean | null
  no_deal?: boolean | null
  strada?: string | null
  judet?: string | null
  contact_person?: string | null
  contact_phone?: string | null
  billing_nume_prenume?: string | null
  billing_nume_companie?: string | null
  billing_cui?: string | null
  billing_strada?: string | null
  billing_oras?: string | null
  billing_judet?: string | null
  billing_cod_postal?: string | null
  /** Informații client (din formular sau manual) */
  details?: string | null
}

export interface RawServiceFile {
  id: string
  lead_id: string
  number: string
  status: string
  created_at: string
  office_direct?: boolean
  curier_trimis?: boolean
  /** Marcat ca colet neridicat; afișat în stage COLET NERIDICAT până la Trimite Tăvițele / status comanda */
  colet_neridicat?: boolean
  urgent?: boolean
  lead?: RawLead | null
}

export interface RawTray {
  id: string
  number: string
  /** Coloana size a fost eliminată din tabelul trays; păstrată opțional pentru compatibilitate. */
  size?: string
  status: string
  created_at: string
  service_file_id: string
  technician_id?: string | null
  technician2_id?: string | null
  technician3_id?: string | null
  /** Notițe din Quality Check. */
  qc_notes?: string | null
  service_file?: {
    lead_id: string
    urgent?: boolean
    lead?: RawLead | null
  } | null
}

export interface RawTrayItem {
  tray_id: string
  notes: string | null
  qty: number
  service_id: string | null
  instrument_id?: string | null
}

// ==================== PIPELINE CONTEXT ====================

export interface PipelineInfo {
  id: string
  name: string
  isReceptie: boolean
  isCurier: boolean
  isDepartment: boolean
}

export interface KanbanContext {
  pipelineId: string
  pipelineInfo: PipelineInfo
  currentUserId?: string
  isAdminOrOwner: boolean
  allPipelines: Array<{ id: string; name: string }>
  allStages: Array<{ id: string; name: string; pipeline_id: string }>
}

// ==================== RESULT TYPES ====================

export interface KanbanResult {
  data: KanbanItem[]
  error: any
}

export interface DataFetchResult<T> {
  data: T | null
  error: any
}

// ==================== MOVE RESULT TYPE ====================

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
