export interface Pipeline {
    id: string
    name: string
    description: string | null
    position: number
    is_active: boolean
    created_at: string
    updated_at: string
}

export interface Stage {
    id: string
    pipeline_id: string
    name: string
    position: number
    is_active: boolean
    created_at: string
    updated_at: string
}

export interface Lead {
    id: string
    ad_id: string | null
    ad_name: string | null
    adset_id: string | null
    adset_name: string | null
    campaign_id: string | null
    campaign_name: string | null
    form_id: string | null
    lead_id: string | null
    platform: string | null
    page_id: string | null
    page_name: string | null
    form_name: string | null
    full_name: string | null
    email: string | null
    phone_number: string | null
    raw_full_name: string | null
    raw_email: string | null
    raw_phone_number: string | null
    custom_disclaimer_responses: string | null
    partner_name: string | null
    retailer_item_id: string | null
    vehicle: string | null
    form_created_time: string | null
    notes: string | null // Detalii/notițe despre client
    details: string | null // Informații client (din formular sau manual)
    no_deal: boolean | null // Checkbox pentru "No Deal" în Vânzări
    call_back: boolean | null // Checkbox pentru "Call Back" în Vânzări
    callback_date: string | null // Data pentru call back (când vânzătorul trebuie să facă call back)
    nu_raspunde: boolean | null // Checkbox pentru "Nu Raspunde" în Vânzări
    city: string | null // Oraș
    judet: string | null // Județ pentru livrare
    strada: string | null // Stradă și număr pentru livrare
    company_name: string | null // Nume companie
    company_address: string | null // Adresa companiei
    address: string | null // Adresă
    address2: string | null // Adresă 2
    zip: string | null // Cod poștal
    country: string | null // Țară
    // Câmpuri pentru persoana de contact (livrare)
    contact_person: string | null // Persoana de contact pentru livrare
    contact_phone: string | null // Telefon pentru persoana de contact
    // Câmpuri pentru facturare
    billing_nume_prenume: string | null // Nume și prenume pentru facturare
    billing_nume_companie: string | null // Nume companie pentru facturare
    billing_cui: string | null // CUI pentru facturare
    billing_strada: string | null // Stradă pentru facturare
    billing_oras: string | null // Oraș pentru facturare
    billing_judet: string | null // Județ pentru facturare
    billing_cod_postal: string | null // Cod poștal pentru facturare
    claimed_by: string | null // ID-ul vânzătorului care a preluat lead-ul
    created_at: string
    updated_at: string
}

export interface LeadPipeline {
    id: string
    lead_id: string
    pipeline_id: string
    stage_id: string
    assigned_at: string
    updated_at: string
    notes: string | null
}

export interface StageHistory {
    id: string
    lead_id: string
    pipeline_id: string
    from_stage_id: string | null
    to_stage_id: string
    moved_by: string | null
    moved_at: string
    notes: string | null
}

export interface PipelineWithStages extends Pipeline {
    stages: Stage[]
}

export interface LeadWithStage extends Lead {
    stage: string
    stage_id: string
    pipeline_id: string
    assignment_id: string
}

export interface KanbanLead {
    id: string
    name: string
    email: string
    phone: string
    stage: string
    createdAt: string
    campaignName?: string
    adName?: string
    formName?: string
    leadId: string
    stageId: string
    pipelineId: string
    assignmentId: string
    tags?: { id: string; name: string; color: 'green' | 'yellow' | 'red' }[]
    stageMovedAt?: string // data cand lead-ul a fost mutat in stage-ul curent
    technician?: string | null // Tehnicianul atribuit lead-ului
    // Câmpuri pentru quotes (când isQuote = true)
    isQuote?: boolean // true dacă acest card reprezintă o tăviță, nu un lead
    quoteId?: string // ID-ul tăviței (când isQuote = true)
    department?: string // Departamentul tăviței
    leadName?: string // Numele clientului (când isQuote = true)
    // Câmpuri pentru fișe (când isFisa = true)
    isFisa?: boolean // true dacă acest card reprezintă o fișă de serviciu
    fisaId?: string // ID-ul fișei (când isFisa = true)
    // Câmpuri adresă și companie
    city?: string | null
    company_name?: string | null
    company_address?: string | null
    address?: string | null
    address2?: string | null
    zip?: string | null
    strada?: string | null
    judet?: string | null
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
    claimed_by?: string | null // ID-ul vânzătorului care a preluat lead-ul
    claimed_by_name?: string | null // Numele vânzătorului (rezolvat la afișare)
}

export interface KanbanQuote {
    id: string // quote id
    name: string // quote name (ex: "Tăbliță 1")
    leadId: string
    leadName: string // lead full_name
    leadEmail: string | null
    leadPhone: string | null
    stage: string
    stageId: string
    pipelineId: string
    createdAt: string
    department: string // departamentul tăviței
    technician_id: string | null // Tehnicianul atribuit tăviței (trays.technician_id)
    technician?: string | null // Numele tehnicianului
}

export const STAGE_COLORS: Record<string, string> = {
    'LEAD VECHI': '#6B7280',
    'LEADURI': '#10B981',
    'MESSAGES': '#3B82F6',
    'NU RASPUNDE': '#F59E0B',
    'NO DEAL': '#EF4444',
    'CURIER TRIMIS': '#22C55E'
}

// ==================== TRAY STAGE HISTORY TYPES ====================

/**
 * Interfață de bază pentru înregistrarea istoricului mutărilor tăvițelor.
 * Mapare directă a structurii tabelei `stage_history` pentru tăvițe (tray_id IS NOT NULL).
 * 
 * Notă: `created_at` este inclus pentru audit, în timp ce `moved_at` reprezintă
 * timestamp-ul exact al mutării (folosit pentru sortare și afișare).
 */
export interface TrayStageHistory {
    id: string
    tray_id: string
    pipeline_id: string
    from_stage_id: string | null
    to_stage_id: string
    moved_by: string | null
    moved_at: string // ISO 8601 timestamp
    notes: string | null
    created_at: string // ISO 8601 timestamp
    /** Pentru tăvițe împărțite: tehnicianul căruia i se mută cardul; NULL = un singur card. */
    technician_id?: string | null
}

/**
 * Interfață extinsă care include informații despre stage-uri, pipeline și utilizator.
 * Folosită pentru afișare în UI.
 * 
 * Notă: `moved_by_user.name` nu este disponibil direct din `auth.users`.
 * Poate fi obținut din `app_members` dacă este necesar.
 */
export interface TrayStageHistoryWithDetails extends TrayStageHistory {
    from_stage: {
        id: string
        name: string
    } | null
    to_stage: {
        id: string
        name: string
    }
    pipeline: {
        id: string
        name: string
    }
    moved_by_user: {
        id: string
        email: string | null
        // Notă: name nu este disponibil direct din auth.users
        // Poate fi obținut din app_members dacă este necesar
    } | null
}

/**
 * Parametrii pentru obținerea istoricului unei tăvițe.
 */
export interface GetTrayStageHistoryParams {
    trayId: string
    pipelineId?: string | null
    fromStageId?: string | null
    toStageId?: string | null
    movedBy?: string | null
    dateFrom?: string | null
    dateTo?: string | null
    limit?: number
    offset?: number
}

/**
 * Rezultatul query-ului pentru istoricul unei tăvițe.
 */
export interface GetTrayStageHistoryResult {
    data: TrayStageHistoryWithDetails[]
    count: number | null // Numărul total de înregistrări (pentru paginare)
    error: any | null
}

/**
 * Rezultatul pentru obținerea stage-ului curent al unei tăvițe.
 */
export interface GetTrayCurrentStageResult {
    data: {
        stageId: string
        stageName: string
        pipelineId: string
        pipelineName: string
    } | null
    error: any | null
}

/**
 * Rezultatul pentru obținerea ultimei mutări a unei tăvițe.
 */
export interface GetTrayLastMoveResult {
    data: TrayStageHistoryWithDetails | null
    error: any | null
}

/**
 * Rezultatul pentru obținerea istoricului unei tăvițe într-un pipeline specific.
 */
export interface GetTrayHistoryInPipelineResult {
    data: TrayStageHistoryWithDetails[]
    count: number | null
    error: any | null
}

/**
 * Statistici despre istoricul unei tăvițe.
 */
export interface TrayStageHistoryStats {
    totalMoves: number
    currentStage: {
        id: string
        name: string
        pipelineId: string
        pipelineName: string
    } | null
    firstMoveAt: string | null // ISO 8601 timestamp
    lastMoveAt: string | null // ISO 8601 timestamp
    timeInCurrentStage: number | null // în secunde (calculat din momentul actual)
}

/**
 * Rezultatul pentru obținerea statisticilor despre istoricul unei tăvițe.
 */
export interface GetTrayStageHistoryStatsResult {
    data: TrayStageHistoryStats | null
    error: any | null
}

/**
 * Parametrii pentru logarea unei schimbări de stage.
 */
export interface LogTrayStageChangeParams {
    trayId: string
    pipelineId: string
    toStageId: string
    fromStageId?: string | null
    movedBy?: string | null // Opțional, se folosește utilizatorul curent dacă nu este specificat
    notes?: string | null
}

/**
 * Rezultatul operației de logare a unei schimbări de stage.
 */
export interface LogTrayStageChangeResult {
    data: TrayStageHistory | null
    error: any | null
}

/**
 * Parametrii pentru logarea adăugării inițiale a unei tăvițe într-un pipeline.
 */
export interface LogTrayInitialStageParams {
    trayId: string
    pipelineId: string
    stageId: string
    movedBy?: string | null
    notes?: string | null
}

/**
 * Parametrii pentru logarea mutării unei tăvițe între stage-uri (în același pipeline).
 */
export interface LogTrayStageMoveParams {
    trayId: string
    pipelineId: string
    fromStageId: string
    toStageId: string
    movedBy?: string | null
    notes?: string | null
}

/**
 * Parametrii pentru logarea mutării unei tăvițe între pipeline-uri.
 */
export interface LogTrayPipelineMoveParams {
    trayId: string
    fromPipelineId: string
    fromStageId: string | null
    toPipelineId: string
    toStageId: string
    movedBy?: string | null
    notes?: string | null
}

/**
 * Opțiuni pentru hook-ul `useTrayStageHistory`.
 */
export interface UseTrayStageHistoryOptions {
    trayId: string
    pipelineId?: string | null
    autoRefresh?: boolean
    refreshInterval?: number // ms, default: 30000 (30 secunde)
    limit?: number // default: 20
}

/**
 * Rezultatul hook-ului `useTrayStageHistory`.
 */
export interface UseTrayStageHistoryResult {
    history: TrayStageHistoryWithDetails[]
    currentStage: GetTrayCurrentStageResult['data']
    stats: TrayStageHistoryStats | null
    loading: boolean
    error: any | null
    refresh: () => Promise<void>
    loadMore: () => Promise<void>
    hasMore: boolean
}

// ==================== ARHIVĂ FIȘE DE SERVICIU ȘI TRAY_ITEMS ====================

/** Arhivă fișă de serviciu – structură identică cu service_files. */
export interface ArhivaFisaServiciu {
    id: string
    lead_id: string
    number: string
    date: string | null
    status: 'noua' | 'in_lucru' | 'finalizata' | 'comanda' | 'facturata'
    notes: string | null
    details: string | null
    office_direct: boolean
    office_direct_at: string | null
    curier_trimis: boolean
    curier_scheduled_at: string | null
    nu_raspunde_callback_at: string | null
    no_deal: boolean
    urgent: boolean
    cash: boolean
    card: boolean
    global_discount_pct: number
    is_locked: boolean
    created_at: string
    updated_at: string
    archived_at: string
    /** Istoric arhivat: stage_history, items_events, trays (number, size, items cu date), conversatie (mesaje lead). */
    istoric?: Record<string, unknown> | null
}

/** Arhivă tray_item – cu câmpul Info (text) pentru brand, serial number, garanție. */
export interface ArhivaTrayItem {
    id: string
    arhiva_fisa_id: string
    department_id: string | null
    instrument_id: string | null
    service_id: string | null
    part_id: string | null
    technician_id: string | null
    qty: number
    notes: string | null
    pipeline: string | null
    /** Brand, serial number, garanție – text liber (ex: "Brand: X, Serial: Y, Garanție: Da"). */
    info: string | null
    created_at: string
}