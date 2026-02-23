/**
 * Helpere pentru lead-uri din Facebook Lead Ads.
 * Folosit de webhook și de ruta de simulare.
 *
 * =============================================================================
 * DETALII COMUNICATE DE CLIENT (leads.details) – cum funcționează
 * =============================================================================
 *
 * 1. SURSE
 *    - Formular Meta: la submit, Facebook trimite leadgen_id; luăm field_data
 *      din Graph API (fiecare câmp: { name, values }). buildLeadDetailsFromFieldData
 *      construiește textul pentru leads.details.
 *    - Simulare: POST /api/leads/simulate-facebook cu field_data (format Meta sau
 *      Record). Același helper e folosit.
 *    - Manual: utilizatorii cu acces Receptie/Vânzări editează în UI; se salvează
 *      în leads.details și se loghează în istoric (lead_details_updated).
 *
 * 2. STOCARE ȘI AFIȘARE
 *    - Stocate în: leads.details (text). Nu în service_files.details.
 *    - Afișare: LeadDetailsSection / LeadDetailsPanel; inițializare din lead?.details
 *      (Kanban) sau fetch leads.details pe leadId dacă lipsește.
 *
 * 3. LOGICA buildLeadDetailsFromFieldData (field_data → text)
 *    - Câmpuri cu name în DETAILS_KEYS → text principal (mesaj, cerințe, etc.).
 *    - Orice alt câmp care nu e în SKIP → „Alte informații: Label: valoare".
 *    - Câmpuri din SKIP (contact, facturare, metadata) nu intră în details.
 *    - Rezultatul e un singur string (posibil multi-linie), sau null dacă gol.
 *
 * 4. TIPURI DE CÂMPURI (toate preluate și convertite în text)
 *    - Text, select, multi-select, store locator: field.values (string[]). Join cu ", ".
 *    - Meta poate trimite values sau value; preluăm ambele. Câmpuri fără name se sar.
 *    - FIELD_LABELS: etichete pentru afișare (ex. „Instrument", „Problemă Freză").
 *    - custom_disclaimer_responses (checkbox-uri opționale): sunt separate de field_data,
 *      formatate cu customDisclaimerResponsesToDetailsText și aplicate la details în webhook.
 */

/**
 * True dacă numărul de telefon este „străin": nu începe cu +40, 40 sau 0.
 * Folosit pentru a pune lead-urile din Facebook Ads cu număr străin în stage-ul „Leaduri Straine".
 * 
 * Numere românești: încep cu +40 (format internațional), 40 (fără +) sau 0 (format local, ex: 0722 123 456)
 * Numere străine: orice alt prefix (ex: +49, +1, +33, 49, 1, 33, etc.)
 */
export function isForeignPhone(phone: string | null | undefined): boolean {
  if (phone == null || typeof phone !== 'string') return false
  const normalized = phone.trim().replace(/\s/g, '')
  if (normalized === '') return false
  // Românesc dacă începe cu +40, 40 sau 0 (ex: 0722, 0744, 0755, etc.)
  const isRomanian = normalized.startsWith('+40') || normalized.startsWith('40') || normalized.startsWith('0')
  return !isRomanian
}

/** Convertează valorile unui câmp Meta (select, multi-select, text, store locator etc.) în text pentru details. */
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
 * Formatează custom_disclaimer_responses (checkbox-uri opționale) ca text pentru details.
 * Meta le trimite separat de field_data. Format: [{ checkbox_key, is_checked }].
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
    lines.push(`${key}: ${checked ? 'Bifat' : 'Nebifat'}`)
  }
  if (lines.length === 0) return ''
  return `Disclaimer-uri:\n${lines.join('\n')}`
}

/**
 * Etichete pentru câmpuri din formular (listă select, etc.).
 * Numele câmpului poate avea variante (diacritice, spații vs underscore).
 * Căutarea se face după cheie normalizată (lowercase, spații → _).
 */
export const FIELD_LABELS: Record<string, string> = {
  // ===== Formulare România - Ascuțire/Frizerie =====
  
  // Instrument de ascuțit (variante existente)
  'ce_fel_de_instrument_vrei_să_ascuți?': 'Instrument',
  'ce_fel_de_instrument_vrei_să_ascutzi?': 'Instrument',
  'ce fel de instrument vrei să ascuți?': 'Instrument',
  'ce fel de instrument vrei să ascutzi?': 'Instrument',
  
  // NOU: Form - Broad - Frizerie/Mani Pedi/Cutite Ianuarie
  'ce instrumente vrei să ascuțim?': 'Instrument',
  'ce_instrumente_vrei_să_ascuțim?': 'Instrument',
  'ce instrumente vrei să ascutim?': 'Instrument',
  'ce_instrumente_vrei_sa_ascutim?': 'Instrument',
  
  // NOU: Problemă instrument - Form - Broad - Frizerie Ianuarie
  'ce simți acum la instrumentul tău?': 'Problemă',
  'ce_simți_acum_la_instrumentul_tău?': 'Problemă',
  'ce simti acum la instrumentul tau?': 'Problemă',
  'ce_simti_acum_la_instrumentul_tau?': 'Problemă',
  
  // Problemă Freză (Form Freze)
  'spune-ne_despre_freza_ta:': 'Problemă Freză',
  'spune-ne_despre_freza_ta': 'Problemă Freză',
  'spune-ne despre freza ta:': 'Problemă Freză',
  'spune-ne despre freza ta': 'Problemă Freză',
  
  // Curier
  'vrei_să_trimitem_curierul_după_instrumente?': 'Curier',
  'vrei să trimitem curierul după instrumente?': 'Curier',
  'vrei_sa_trimitem_curierul_dupa_instrumente?': 'Curier',
  'vrei sa trimitem curierul dupa instrumente?': 'Curier',
  
  // ===== Formulare B2B Străinătate (ZUSH | B2B Supply) =====
  
  // Tip Business
  'what_best_decribes_your_business?': 'Tip Business',
  'what_best_describes_your_business?': 'Tip Business',
  'what best decribes your business?': 'Tip Business',
  'what best describes your business?': 'Tip Business',
  
  // Volum Lunar
  'what_is_your_expected_monthly_order_volume?': 'Volum Lunar',
  'what is your expected monthly order volume?': 'Volum Lunar',
  
  // Interese
  'what_are_you_interested_in?': 'Interese',
  'what are you interested in?': 'Interese',
  
  // Țară
  country: 'Țară',
  Country: 'Țară',
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
  /** Câmpuri din formular care alimentează direct textul principal al details. */
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
  /** Câmpuri excluse: contact, facturare, metadata. Nu se pun în details. */
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
  const b = other.length ? `Alte informații:\n${other.join('\n')}` : ''
  const out = [a, b].filter(Boolean).join('\n\n').trim()
  return out || null
}