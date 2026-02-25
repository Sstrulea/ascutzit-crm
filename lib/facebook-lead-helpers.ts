/**
 * Helper functions for Facebook Lead Ads leads.
 * Used by webhook and simulation route.
 *
 * =============================================================================
 * CLIENT COMMUNICATION DETAILS (leads.details) – how it works
 * =============================================================================
 *
 * 1. SOURCES
 *    - Meta Form: on submit, Facebook sends leadgen_id; we get field_data
 *      from Graph API (each field: { name, values }). buildLeadDetailsFromFieldData
 *      builds the text for leads.details.
 *    - Simulation: POST /api/leads/simulate-facebook with field_data (Meta format or
 *      Record). Same helper is used.
 *    - Manual: users with Receptie/Vânzări access edit in UI; saved in
 *      leads.details and logged in history (lead_details_updated).
 *
 * 2. STORAGE AND DISPLAY
 *    - Stored in: leads.details (text). Not in service_files.details.
 *    - Display: LeadDetailsSection / LeadDetailsPanel; initialized from lead?.details
 *      (Kanban) or fetch leads.details by leadId if missing.
 *
 * 3. LOGIC buildLeadDetailsFromFieldData (field_data → text)
 *    - Fields with name in DETAILS_KEYS → main text (message, requirements, etc.).
 *    - Any other field not in SKIP → "Other info: Label: value".
 *    - Fields from SKIP (contact, billing, metadata) don't go into details.
 *    - Result is a single string (possibly multi-line), or null if empty.
 *
 * 4. FIELD TYPES (all fetched and converted to text)
 *    - Text, select, multi-select, store locator: field.values (string[]). Join with ", ".
 *    - Meta may send values or value; we take both. Fields without name are skipped.
 *    - FIELD_LABELS: labels for display (e.g., "Instrument", "Problemă Freză").
 *    - custom_disclaimer_responses (optional checkboxes): separate from field_data,
 *      formatted with customDisclaimerResponsesToDetailsText and applied to details in webhook.
 */

/**
 * True if phone number is "foreign": doesn't start with +40, 40 or 0.
 * Used to place Facebook Ads leads with foreign phone number in stage "Leaduri Straine".
 * 
 * Romanian numbers: start with +40 (international format), 40 (without +) or 0 (local format, ex: 0722 123 456)
 * Foreign numbers: any other prefix (ex: +49, +1, +33, 49, 1, 33, etc.)
 */
export function isForeignPhone(phone: string | null | undefined): boolean {
  if (phone == null || typeof phone !== 'string') return false
  const normalized = phone.trim().replace(/\s/g, '')
  if (normalized === '') return false
  // Romanian if starts with +40, 40 or 0 (ex: 0722, 0744, 0755, etc.)
  const isRomanian = normalized.startsWith('+40') || normalized.startsWith('40') || normalized.startsWith('0')
  return !isRomanian
}

/** Converts values of a Meta field (select, multi-select, text, store locator etc.) to text for details. */
export function fieldValuesToDetailsText(values: unknown): string {
  if (values == null) return ''
  if (Array.isArray(values)) {
    const parts = values
      .map((x) => (x != null && typeof x === 'object' ? JSON.stringify(x) : String(x).trim()))
      .filter(Boolean)
    return parts.join(', ')
  }
  if (typeof values === 'object') return JSON.stringify(values)
  return String(values).trim()
}

/**
 * Formats custom_disclaimer_responses (optional checkboxes) as text for details.
 * Meta sends them separately from field_data. Format: [{ checkbox_key, is_checked }].
 */
export function customDisclaimerResponsesToDetailsText(responses: unknown): string {
  if (!Array.isArray(responses) || responses.length === 0) return ''
  const lines: string[] = []
  for (const r of responses) {
    if (r == null || typeof r !== 'object') continue
    const key = (r as { checkbox_key?: string }).checkbox_key
    const raw = (r as { is_checked?: string | boolean }).is_checked
    if (!key) continue
    const checked = raw === true || raw === '1'
    lines.push(`${key}: ${checked ? 'Checked' : 'Unchecked'}`)
  }
  if (lines.length === 0) return ''
  return `Disclaimers:\n${lines.join('\n')}`
}

/**
 * Labels for form fields (list select, etc.).
 * Field name may have variants (diacritics, spaces vs underscore).
 * Search is by normalized key (lowercase, spaces → _).
 */
export const FIELD_LABELS: Record<string, string> = {
  // ===== Romania Forms - Sharpening/Barbershop =====
  
  // Instrument to sharpen (existing variants)
  'ce_fel_de_instrument_vrei_să_ascuți?': 'Instrument',
  'ce_fel_de_instrument_vrei_să_ascutzi?': 'Instrument',
  'ce fel de instrument vrei să ascuți?': 'Instrument',
  'ce fel de instrument vrei să ascutzi?': 'Instrument',
  
  // NEW: Form - Broad - Barbershop/Mani Pedi/Knives January
  'ce instrumente vrei să ascuțim?': 'Instrument',
  'ce_instrumente_vrei_să_ascuțim?': 'Instrument',
  'ce instrumente vrei să ascutim?': 'Instrument',
  'ce_instrumente_vrei_sa_ascutim?': 'Instrument',
  
  // NEW: Instrument problem - Form - Broad - Barbershop January
  'ce simți acum la instrumentul tău?': 'Problem',
  'ce_simți_acum_la_instrumentul_tău?': 'Problem',
  'ce simti acum la instrumentul tau?': 'Problem',
  'ce_simti_acum_la_instrumentul_tau?': 'Problem',
  
  // Freza problem (Form Freze)
  'spune-ne_despre_freza_ta:': 'Freza Problem',
  'spune-ne_despre_freza_ta': 'Freza Problem',
  'spune-ne despre freza ta:': 'Freza Problem',
  'spune-ne despre freza ta': 'Freza Problem',
  
  // Courier
  'vrei_să_trimitem_curierul_după_instrumente?': 'Courier',
  'vrei să trimitem curierul după instrumente?': 'Courier',
  'vrei_sa_trimitem_curierul_dupa_instrumente?': 'Courier',
  'vrei sa trimitem curierul dupa instrumente?': 'Courier',
  
  // ===== Foreign B2B Forms (ZUSH | B2B Supply) =====
  
  // Business Type
  'what_best_decribes_your_business?': 'Business Type',
  'what_best_describes_your_business?': 'Business Type',
  'what best decribes your business?': 'Business Type',
  'what best describes your business?': 'Business Type',
  
  // Monthly Volume
  'what_is_your_expected_monthly_order_volume?': 'Monthly Volume',
  'what is your expected monthly order volume?': 'Monthly Volume',
  
  // Interests
  'what_are_you_interested_in?': 'Interests',
  'what are you interested in?': 'Interests',
  
  // Country
  country: 'Country',
  Country: 'Country',
}

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/\s+/g, '_').trim()
}

function buildLabelMap(): Map<string, string> {
  const m = new Map<string, string>()
  for (const [raw, label] of Object.entries(FIELD_LABELS)) {
    m.set(normalizeKey(raw), label)
  }
  return m
}

const FIELD_LABEL_MAP = buildLabelMap()

export function buildLeadDetailsFromFieldData(
  fieldData: Record<string, string>
): string | null {
  /** Form fields that directly feed the main text of details. */
  const DETAILS_KEYS = [
    'message',
    'mesaj',
    'detalii_comanda',
    'detalii',
    'cerinte',
    'comentarii',
    'notes',
    'order_details',
    'additional_info',
    'description',
    'what_do_you_need',
    'cereri',
    'observatii',
    'observații',
    'instructiuni',
    'custom_comments',
    'comments',
    'informatii',
    'informații',
    'alte_informatii',
    'comentariu',
    'cerere',
  ]
  /** Excluded fields: contact, billing, metadata. Not put in details. */
  const SKIP = new Set([
    'full_name',
    'name',
    'first_name',
    'last_name',
    'email',
    'phone',
    'phone_number',
    'company_name',
    'company',
    'city',
    'address',
    'street_address',
    'zip',
    'zip_code',
    'postal_code',
    'state',
    'region',
    'judet',
    'contact_person',
    'contact_phone',
    'contact_name',
    'contact_phone_number',
    'phone_contact',
    'form_id',
    'page_id',
    'ad_id',
    'adset_id',
    'campaign_id',
    'lead_id',
    'custom_disclaimer_responses',
  ])

  const main: string[] = []
  const other: string[] = []

  for (const [key, val] of Object.entries(fieldData)) {
    const v = (val || '').trim()
    if (!v) continue
    const k = normalizeKey(key)
    if (SKIP.has(k)) continue
    if (DETAILS_KEYS.some((d) => k === d.toLowerCase())) {
      main.push(v)
    } else {
      const label = FIELD_LABEL_MAP.get(k) ?? key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
      other.push(`${label}: ${v}`)
    }
  }

  const a = main.join('\n\n').trim()
  const b = other.length ? `Other info:\n${other.join('\n')}` : ''
  const out = [a, b].filter(Boolean).join('\n\n').trim()
  return out || null
}