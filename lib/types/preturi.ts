import type { TrayItem, Tray } from '@/lib/supabase/serviceFileOperations'
import type { Lead } from '@/app/(crm)/dashboard/page'

/**
 * Tipuri pentru componenta Preturi
 */

// Tip pentru ref-ul expus de componenta Preturi
export interface PreturiRef {
  save: () => Promise<void>
  getSelectedTrayId: () => string | null
  getQuotes: () => LeadQuote[]
  getSelectedQuoteId: () => string | null
  getIsVanzatorMode: () => boolean
  getSendingTrays: () => boolean
  getTraysAlreadyInDepartments: () => boolean
  getOnTraySelect: () => ((trayId: string) => void) | undefined
  getOnAddTray: () => (() => void) | undefined
  getOnDeleteTray: () => ((trayId: string) => void) | undefined
  getOnSendTrays: () => (() => void) | undefined
  openBillingDialog: () => void
}

// Props pentru componenta Preturi
export interface PreturiProps {
  leadId: string
  lead?: Lead | null
  fisaId?: string | null
  initialQuoteId?: string | null
  pipelineSlug?: string
  isDepartmentPipeline?: boolean
  serviceFileNumber?: string | number // Numărul fișei de serviciu pentru print (ex: "4" pentru fișa 4)
  /** Stage-ul fișei din Kanban (Receptie); dacă e setat, evităm getPipelineItemForItem la deschidere. */
  initialServiceFileStage?: string | null
  /** Apelat după Facturare reușită (ex. refresh Kanban). */
  onAfterFacturare?: () => void
  /** Apelat după trimiterea tăvițelor în departamente (ex. refresh Kanban). */
  onAfterSendTrays?: () => void
  /** Apelat după salvare fișă (ex. refresh Kanban pentru urgent / date actualizate). */
  onAfterSave?: () => void
  /** Apelat după ștergere tăviță (ex. refresh Kanban ca board-ul să nu mai afișeze tăvița ștearsă). */
  onAfterDeleteTray?: () => void
  /** Închide panoul / overlay (ex. din overlay-ul „Distribuie instrumentele”). */
  onClose?: () => void
  /** Pentru fișe/tăvițe: afișează butonul Urgentare în secțiunea Recepție Comandă. */
  showUrgentareButton?: boolean
  isUrgentare?: boolean
  isUrgentaring?: boolean
  onUrgentareClick?: () => void
}

/** Facturare → Ridic Personal; Facturare+AWB → De Trimis. */
export type FacturareMode = 'facturare' | 'facturare_awb'

// Tip pentru item-uri în UI (extins din TrayItem)
export type LeadQuoteItem = TrayItem & {
  item_type?: 'service' | 'part' | null
  price: number // Obligatoriu - întotdeauna definit
  discount_pct?: number
  urgent?: boolean
  name_snapshot?: string
  brand?: string | null
  serial_number?: string | null
  garantie?: boolean
  pipeline_id?: string | null
  service_id?: string | null
  instrument_id?: string | null // OBLIGATORIU în DB
  department_id?: string | null // OBLIGATORIU în DB - se preia din instrument
  qty?: number
  department?: string | null // Numele departamentului (derivat din pipeline)
  /** Câte bucăți din cantitatea acestei linii nu se pot repara (0..qty); ex. la Cant. 2 poți seta 1 */
  non_repairable_qty?: number
  brand_groups?: Array<{ 
    id: string
    brand: string
    serialNumbers: string[]
    garantie: boolean 
  }>
}

// Tip pentru tăvițe în UI (extins din Tray)
export type LeadQuote = Tray & { 
  fisa_id?: string | null
  subscription_type?: 'services' | 'parts' | 'both' | null
  sheet_index?: number
  name?: string
  is_cash?: boolean
  is_card?: boolean
}

// Tip pentru tehnician
export type Technician = {
  id: string // user_id din app_members
  name: string
}

// Constante
export const URGENT_MARKUP_PCT = 30 // +30% per line if urgent



