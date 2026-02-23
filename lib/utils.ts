import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { format } from "date-fns"
import { ro } from "date-fns/locale"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Creează o funcție debounced care amână execuția până după ce s-a trecut un interval de timp
 * fără apeluri noi. Util pentru a limita numărul de apeluri la funcții costisitoare.
 * 
 * @param func - Funcția de executat
 * @param wait - Timpul de așteptare în milisecunde (default: 500ms)
 * @returns Funcția debounced
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number = 500
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null

  return function executedFunction(...args: Parameters<T>) {
    const later = () => {
      timeout = null
      func(...args)
    }

    if (timeout) {
      clearTimeout(timeout)
    }
    timeout = setTimeout(later, wait)
  }
}

/**
 * Normalizează un număr de telefon pentru căutare
 * Elimină +, spații, -, și păstrează doar cifrele
 * 
 * @param phone - Numărul de telefon de normalizat
 * @returns Numărul normalizat (doar cifre)
 * 
 * @example
 * normalizePhoneNumber("+40 721 312 123") // "40721312123"
 * normalizePhoneNumber("0721-312-123") // "0721312123"
 * normalizePhoneNumber("40 721 312 123") // "40721312123"
 */
export function normalizePhoneNumber(phone: string | null | undefined): string {
  if (!phone) return ''
  // Elimină toate caracterele non-numerice (+, spații, -, paranteze, etc.)
  return phone.replace(/\D/g, '')
}

/**
 * Verifică dacă un query de căutare se potrivește cu un număr de telefon
 * Compară numerele normalizate (doar cifre) pentru a permite căutarea
 * în formate diferite (+40, 40, 0721, etc.)
 * 
 * @param query - Query-ul de căutare
 * @param phone - Numărul de telefon de verificat
 * @returns true dacă numărul se potrivește cu query-ul
 * 
 * @example
 * matchesPhoneNumber("+401234342", "40 123 434 200") // true (conține "401234342")
 * matchesPhoneNumber("0721", "0721312123") // true
 * matchesPhoneNumber("40", "40721312123") // true
 */
export function matchesPhoneNumber(query: string, phone: string | null | undefined): boolean {
  if (!phone) return false
  const normalizedQuery = normalizePhoneNumber(query)
  const normalizedPhone = normalizePhoneNumber(phone)
  
  // Dacă query-ul normalizat este gol, nu se potrivește
  if (!normalizedQuery) return false
  
  // Verifică dacă numărul normalizat conține query-ul normalizat
  return normalizedPhone.includes(normalizedQuery)
}

/**
 * Formatează callback_date pentru afișare (dată sau dată+oră)
 * Dacă valoarea e ISO (conține 'T'), afișează dd MMM yyyy HH:mm, altfel dd MMM yyyy.
 */
export function formatCallbackDateDisplay(val: string | null | undefined): string {
  if (!val) return ''
  try {
    const d = new Date(val)
    if (isNaN(d.getTime())) return val
    return val.includes('T')
      ? format(d, 'dd MMM yyyy HH:mm', { locale: ro })
      : format(d, 'dd MMM yyyy', { locale: ro })
  } catch {
    return val
  }
}