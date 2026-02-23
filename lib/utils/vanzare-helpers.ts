/**
 * Helper functions pentru serviciile de vânzare
 * Serviciile VANZARE și VANZARE PROMO sunt tratate special:
 * - Sunt atribuite automat unei tăvițe speciale "Vanzare N"
 * - Tăvițele de vânzare NU sunt trimise în departamente
 */

/**
 * Verifică dacă un serviciu este de tip vânzare
 * @param serviceName - Numele serviciului
 * @returns true dacă serviciul este VANZARE sau VANZARE PROMO
 */
export function isVanzareService(serviceName: string | null | undefined): boolean {
  if (!serviceName) return false
  const normalized = serviceName.toUpperCase().trim()
  return normalized === 'VANZARE' || 
         normalized === 'VANZARE PROMO' ||
         normalized.startsWith('VANZARE ') ||
         normalized.includes('VANZARE PROMO')
}

/**
 * Verifică dacă o tăviță este de tip vânzare (nume începe cu "Vanzare")
 * @param trayNumber - Numărul/numele tăviței
 * @returns true dacă tăvița este de tip vânzare
 */
export function isVanzareTray(trayNumber: string | null | undefined): boolean {
  if (!trayNumber) return false
  const normalized = trayNumber.toLowerCase().trim()
  return normalized.startsWith('vanzare') || normalized.startsWith('vânzare')
}

/**
 * Generează numele pentru o tăviță de vânzare nouă
 * @param existingTrays - Lista tăvițelor existente
 * @param serviceFileNumber - Numărul fișei de serviciu (ex: "Fisa 4567" sau 4567)
 * @returns Numele noii tăvițe de vânzare (ex: "VANZARE 4567")
 */
export function generateVanzareTrayName(
  existingTrays: Array<{ number?: string | null }>,
  serviceFileNumber?: string | number | null
): string {
  // Dacă avem numărul fișei de serviciu, folosim acela
  if (serviceFileNumber) {
    // Extrage doar numărul din "Fisa 4567" sau folosește direct dacă e număr
    const match = String(serviceFileNumber).match(/\d+/)
    if (match) {
      return `VANZARE ${match[0]}`
    }
  }
  
  // Fallback: găsește cel mai mare index de vânzare existent
  let maxIndex = 0
  
  for (const tray of existingTrays) {
    if (!tray.number) continue
    const normalized = tray.number.toLowerCase().trim()
    
    if (normalized.startsWith('vanzare') || normalized.startsWith('vânzare')) {
      // Extrage numărul din "Vanzare N"
      const match = tray.number.match(/\d+/)
      if (match) {
        const num = parseInt(match[0], 10)
        if (num > maxIndex) {
          maxIndex = num
        }
      }
    }
  }
  
  return `VANZARE ${maxIndex + 1}`
}

/**
 * Găsește sau creează ID-ul tăviței de vânzare pentru un serviciu
 * @param quotes - Lista tuturor tăvițelor
 * @param serviceName - Numele serviciului de vânzare
 * @returns ID-ul tăviței de vânzare existente sau null dacă trebuie creată
 */
export function findExistingVanzareTray(
  quotes: Array<{ id: string; number?: string | null }>,
  serviceName: string
): { id: string; number: string } | null {
  // Pentru moment, toate serviciile de vânzare merg în aceeași tăviță de vânzare
  // (sau în ultima tăviță de vânzare dacă există mai multe)
  const vanzareTrays = quotes.filter(q => isVanzareTray(q.number))
  
  if (vanzareTrays.length > 0) {
    const lastVanzareTray = vanzareTrays[vanzareTrays.length - 1]
    return {
      id: lastVanzareTray.id,
      number: lastVanzareTray.number || 'Vanzare'
    }
  }
  
  return null
}

