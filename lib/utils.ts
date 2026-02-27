import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { format } from "date-fns"
import { ro } from "date-fns/locale"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Creates a debounced function that delays execution until after a time interval
 * has elapsed since the last call. Useful for limiting calls to expensive functions.
 * 
 * @param func - Function to execute
 * @param wait - Wait time in milliseconds (default: 500ms)
 * @returns Debounced function
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
 * Normalizes a phone number for search
 * Removes +, spaces, -, and keeps only digits
 * 
 * @param phone - Phone number to normalize
 * @returns Normalized number (digits only)
 * 
 * @example
 * normalizePhoneNumber("+40 721 312 123") // "40721312123"
 * normalizePhoneNumber("0721-312-123") // "0721312123"
 * normalizePhoneNumber("40 721 312 123") // "40721312123"
 */
export function normalizePhoneNumber(phone: string | null | undefined): string {
  if (!phone) return ''
  // Remove all non-numeric characters (+, spaces, -, parentheses, etc.)
  return phone.replace(/\D/g, '')
}

/**
 * Removes diacritics (ă, â, î, ș, ț) for search normalization.
 * Used for name/technician search so "Ștefan" matches "Stefan".
 */
export function removeDiacritics(s: string | null | undefined): string {
  if (!s) return ''
  return String(s)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[șş]/gi, 's')
    .replace(/[țţ]/gi, 't')
    .replace(/[ăâ]/gi, 'a')
    .replace(/î/gi, 'i')
}

/**
 * Returns all phone number variants for search (0, +40, 40 prefix).
 * Used so "0721123456", "+40721123456", "40721123456" all match.
 */
export function getPhoneVariants(input: string | null | undefined): string[] {
  const digits = normalizePhoneNumber(input)
  if (!digits.length) return []
  const variants: string[] = []
  if (digits.startsWith('40') && digits.length > 2) {
    variants.push('0' + digits.slice(2), '+' + digits, digits)
  } else if (digits.startsWith('0')) {
    variants.push(digits, '40' + digits.slice(1), '+40' + digits.slice(1))
  } else {
    variants.push('0' + digits, '40' + digits, '+40' + digits)
  }
  return [...new Set(variants)]
}

/**
 * Checks if a search query matches a phone number
 * Compares normalized numbers (digits only) to allow searching
 * in different formats (+40, 40, 0721, etc.)
 * 
 * @param query - Search query
 * @param phone - Phone number to check
 * @returns true if number matches query
 * 
 * @example
 * matchesPhoneNumber("+401234342", "40 123 434 200") // true (contains "401234342")
 * matchesPhoneNumber("0721", "0721312123") // true
 * matchesPhoneNumber("40", "40721312123") // true
 */
export function matchesPhoneNumber(query: string, phone: string | null | undefined): boolean {
  if (!phone) return false
  const normalizedQuery = normalizePhoneNumber(query)
  const normalizedPhone = normalizePhoneNumber(phone)
  
  // If normalized query is empty, no match
  if (!normalizedQuery) return false
  
  // Check if normalized phone number contains normalized query
  return normalizedPhone.includes(normalizedQuery)
}

/**
 * Formats callback_date for display (date or date+time)
 * If value is ISO (contains 'T'), displays dd MMM yyyy HH:mm, otherwise dd MMM yyyy.
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