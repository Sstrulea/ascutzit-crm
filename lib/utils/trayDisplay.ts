/**
 * Formatează mărimea tăviței pentru afișare: mereu majusculă, fără paranteze.
 * Ex: "m" -> "M", "(m)" -> "M", "l" -> "L"
 */
export function formatTraySizeDisplay(size: string | null | undefined): string {
  if (size == null || size === '') return ''
  const s = String(size).trim()
  if (!s) return ''
  return s.toUpperCase()
}
