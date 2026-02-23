/**
 * Helpers pentru afișarea numelui și telefonului lead-ului.
 * Extrage din leads.details când full_name / phone_number lipsesc sau sunt "Unknown".
 *
 * Format așteptat în details (ex. de la Facebook Lead Ads):
 * - "Nume Complet: Violeta Capatina"
 * - "Numar De Telefon: +40769480277" / "Număr De Telefon:"
 * - "Telefon:", "E-Mail:", etc.
 */
export function extractNameAndPhoneFromDetails(
  details: string | null | undefined
): { name?: string; phone?: string } {
  if (!details || typeof details !== 'string') return {}

  const result: { name?: string; phone?: string } = {}
  const lines = details.split('\n')

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue

    // Nume: Nume Complet, Nume, Nume Prenume, Client, Contact, Persoana contact, Denumire, Firma, etc.
    if (trimmed.match(/Nume\s*Complet\s*:/i) || trimmed.match(/^Nume\s*:/i) || trimmed.match(/Nume\s*(și\s*)?Prenume\s*:/i) || trimmed.match(/^Client\s*:/i) || trimmed.match(/^Contact\s*:/i) || trimmed.match(/Persoana\s*(de\s*)?contact\s*:/i) || trimmed.match(/^Denumire\s*:/i) || trimmed.match(/^Firma\s*:/i) || trimmed.match(/^Companie\s*:/i)) {
      const parts = trimmed.split(':')
      if (parts.length > 1) {
        const val = parts.slice(1).join(':').trim()
        if (val && val.length > 1) result.name = val
      }
    }

    if (trimmed.match(/Num[aă]r\s*De\s*Telefon\s*:/i) || trimmed.match(/Number\s*.*Telefon\s*:/i)) {
      const parts = trimmed.split(':')
      if (parts.length > 1) {
        const val = parts.slice(1).join(':').trim()
        if (val) result.phone = val
      }
    }

    if (!result.phone && (trimmed.match(/^Telefon\s*:/i) || trimmed.match(/^Nr\.?\s*Telefon\s*:/i))) {
      const parts = trimmed.split(':')
      if (parts.length > 1) {
        const val = parts.slice(1).join(':').trim()
        if (val) result.phone = val
      }
    }
  }

  // Fallback: prima linie care arată ca un nume (1–5 cuvinte, litere/spații/crățime, fără ":")
  if (!result.name && lines.length > 0) {
    for (const line of lines) {
      const t = line.trim()
      if (!t || t.includes(':') || t.length < 3) continue
      const words = t.split(/\s+/).filter(Boolean)
      const looksLikeName = words.length >= 1 && words.length <= 5 && /^[\p{L}\p{N}\s\-'.]+$/u.test(t)
      if (looksLikeName) {
        result.name = t
        break
      }
    }
  }

  return result
}

/**
 * Returnează numărul de telefon de afișat: phone_number, sau extras din details/notes când lipsește.
 */
export function getLeadDisplayPhone(
  phoneNumber: string | null | undefined,
  details: string | null | undefined,
  notes?: string | null
): string {
  const hasRealPhone = (v: string) => {
    if (!v || !String(v).trim()) return false
    const t = String(v).trim()
    if (/^\+40\s*xxx\s*xxx\s*xxx$/i.test(t)) return false
    return t.length >= 6 || /^[\d\s\-+()]{6,}$/.test(t)
  }
  if (hasRealPhone(phoneNumber ?? '')) return phoneNumber!.trim()
  const extracted = extractNameAndPhoneFromDetails(details ?? notes)
  return extracted.phone || phoneNumber || ''
}

/**
 * Returnează numele de afișat pentru lead: full_name, sau extras din details/notes când lipsește.
 */
export function getLeadDisplayName(
  fullName: string | null | undefined,
  details: string | null | undefined,
  notes?: string | null
): string {
  const hasRealName = (v: string) =>
    v && String(v).trim() && String(v).trim().toLowerCase() !== 'unknown'
  if (hasRealName(fullName ?? '')) return fullName!.trim()
  const extracted = extractNameAndPhoneFromDetails(details ?? notes)
  return extracted.name || fullName || 'Unknown'
}
