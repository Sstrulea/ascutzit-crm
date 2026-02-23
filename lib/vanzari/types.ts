/**
 * MODUL VÂNZARI - TYPE DEFINITIONS
 * ===================================
 * Definiții de tipuri pentru modulul Vânzări
 */

export interface Lead {
  id: string;
  full_name: string;
  phone_number: string;
  email?: string;
  company_name?: string;
  company_address?: string;
  address?: string;
  strada?: string;
  city?: string;
  zip?: string;
  judet?: string;
  contact_person?: string;
  contact_phone?: string;
  
  // Vânzări fields
  callback_date?: string | null;
  nu_raspunde_callback_at?: string | null;
  no_deal_at?: string | null;
  curier_trimis_at?: string | null;
  curier_trimis_user_id?: string | null;
  office_direct_at?: string | null;
  office_direct_user_id?: string | null;
  
  details?: string;
  created_at: string;
  updated_at: string;
}

export interface ServiceFile {
  id: string;
  lead_id: string;
  number: string;
  date: string;
  status: 'noua' | 'in_lucru' | 'finalizata' | 'comanda' | 'facturata';
  notes?: string;
  details?: string;
  technician_details?: any;
  
  // Flag-uri Recepție
  office_direct?: boolean;
  office_direct_at?: string | null;
  curier_trimis?: boolean;
  curier_scheduled_at?: string | null;
  nu_raspunde_callback_at?: string | null;
  
  // Flag-uri Vânzări
  no_deal?: boolean;
  
  // Flag-uri generale
  urgent?: boolean;
  cash?: boolean;
  card?: boolean;
  global_discount_pct?: number;
  is_locked?: boolean;
  
  // Modul Vânzări fields
  created_from_lead?: boolean;
  original_lead_id?: string | null;
  fulfillment_type?: 'curier_trimis' | 'office_direct';
  
  created_at: string;
  updated_at: string;
}

/**
 * Înregistrare statistică din baza de date (per zi)
 */
export interface SellerStatisticsRecord {
  id: string;
  user_id: string;
  date: string;
  callback_count: number;
  no_deal_count: number;
  calls_made: number;
  curier_trimis_count: number;
  office_direct_count: number;
  created_at: string;
  updated_at: string;
}

/**
 * Statistici dashboard (simple)
 */
export interface SellerStatsDashboard {
  today: {
    callbacks: number;
    noDeals: number;
    callsMade: number;
    curierTrimis: number;
    officeDirect: number;
  };
  thisWeek: {
    callbacks: number;
    noDeals: number;
    callsMade: number;
    curierTrimis: number;
    officeDirect: number;
  };
  thisMonth: {
    callbacks: number;
    noDeals: number;
    callsMade: number;
    curierTrimis: number;
    officeDirect: number;
  };
}

// Alias pentru compatibilitate
export type SellerStatistics = SellerStatisticsRecord;

export interface ItemEvent {
  id: string;
  type: 'lead' | 'service_file' | 'tray';
  item_id: string;
  event_type: string;
  message: string;
  event_details?: any;
  actor_id: string;
  actor_name: string;
  created_at: string;
}

export interface CallbackOptions {
  callbackType?: 'button_rapid' | 'custom';
  callbackDuration?: string;
  buttonLabel?: string;
  note?: string;
}

export interface CurierTrimisResult {
  lead: Lead;
  serviceFile: ServiceFile;
}

export interface OfficeDirectResult {
  lead: Lead;
  serviceFile: ServiceFile;
}

export type StatisticField = 
  | 'callback_count' 
  | 'no_deal_count' 
  | 'calls_made' 
  | 'curier_trimis_count' 
  | 'office_direct_count';

export interface Result<T = any> {
  data: T | null;
  error: any;
}

/**
 * Statistici agregate pentru un vânzător pe un interval de timp
 */
export interface SellerStatsAggregated {
  seller_id: string;
  seller_name?: string;
  seller_email?: string;
  period: 'today' | 'week' | 'month' | 'custom';
  callbacks_set: number;
  nu_raspunde: number;
  no_deal: number;
  curier_trimis: number;
  office_direct: number;
  deals_closed: number;
  service_files_created: number;
  score: number;
}

/**
 * Top seller cu scor ridicat
 */
export interface TopSeller {
  seller_id: string;
  seller_name?: string;
  score: number;
  callbacks_set: number;
  nu_raspunde: number;
  deals_closed: number;
  service_files_created: number;
}

/**
 * Statistici pentru întregul dashboard (azi, săptămână, lună)
 */
export interface SellerStatisticsDashboard {
  today: SellerStatsAggregated & {
    callbacks_change_percent?: number;
    nu_raspunde_change_percent?: number;
    deals_change_percent?: number;
    services_change_percent?: number;
  };
  week: SellerStatsAggregated & {
    callbacks_change_percent?: number;
    nu_raspunde_change_percent?: number;
    deals_change_percent?: number;
    services_change_percent?: number;
  };
  month: SellerStatsAggregated & {
    callbacks_change_percent?: number;
    nu_raspunde_change_percent?: number;
    deals_change_percent?: number;
    services_change_percent?: number;
  };
}
