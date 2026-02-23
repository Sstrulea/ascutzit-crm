/**
 * Extrage textul pentru afișare din details (leads.details sau legacy service_files.details).
 * Poate fi text simplu sau JSON legacy cu .text.
 */
export function parseServiceFileDetails(raw: string | null | undefined): string {
  if (raw === undefined || raw === null) return ''
  const s = String(raw).trim()
  if (!s) return ''
  try {
    const p = JSON.parse(s)
    if (typeof p === 'object' && p !== null && typeof p.text === 'string') return p.text || ''
    return s
  } catch {
    return s
  }
}

/**
 * Curăță details pentru salvare (fără paymentCash/paymentCard).
 * Returnează undefined dacă e gol pentru a nu suprascrie existent.
 */
export function cleanDetailsForSave(details: string | undefined | null): string | undefined {
  if (details === undefined || details === null) return undefined
  
  // Dacă este deja string simplu (nu JSON), verifică dacă este gol
  if (typeof details === 'string') {
    // Dacă string-ul este gol, nu salvăm nimic (pentru a nu suprascrie datele existente)
    if (details.trim() === '') return undefined
    
    // Verifică dacă este JSON valid
    try {
      const parsed = JSON.parse(details)
      // Dacă este obiect JSON, extrage doar text-ul
      if (typeof parsed === 'object' && parsed !== null) {
        // Elimină paymentCash și paymentCard dacă există
        const { paymentCash, paymentCard, ...rest } = parsed
        const textValue = rest.text || ''
        // Dacă text-ul este gol după curățare, nu salvăm nimic
        if (textValue.trim() === '' && Object.keys(rest).length === 1) {
          return undefined
        }
        // Returnează doar text-ul sau string-ul simplu dacă nu există text
        return textValue || (Object.keys(rest).length === 0 ? undefined : JSON.stringify(rest))
      }
      return details
    } catch {
      // Nu este JSON valid, returnează string-ul direct
      return details
    }
  }
  
  // Dacă este obiect, transformă în JSON cu doar text
  return JSON.stringify({ text: details })
}
