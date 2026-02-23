/**
 * Cache draft pentru formularul Recepție (VanzariViewV4).
 * La schimbarea taburilor (Fișă → Mesagerie/Istoric) componenta se demontează și se pierd datele.
 * Salvăm periodic în sessionStorage și restaurare la revenire.
 */

const PREFIX = 'receptie-draft-'

function getKey(fisaId: string): string {
  return PREFIX + fisaId
}

export type ReceptieDraftData = {
  instruments: Array<{
    id: string
    localId: string
    name: string
    quantity: number
    serialNumber?: string
    discount?: number
    garantie?: boolean
  }>
  services: Array<{
    instrumentLocalId: string
    serviceId: string
    serviceName: string
    basePrice: number
    instrumentQty?: number
    quantity: number
    discount: number
    unrepairedCount?: number
    trayId?: string
    forSerialNumbers?: string[]
  }>
  parts: Array<{
    id: string
    instrumentLocalId: string
    name: string
    unitPrice: number
    quantity: number
    trayId?: string
    forSerialNumbers?: string[]
    instrumentQty?: number
  }>
  trays: Array<{ id: string; number: string; size?: string }>
  instrumentTrayId: Record<string, string | undefined>
}

export function writeReceptieDraft(fisaId: string, data: ReceptieDraftData): void {
  if (typeof window === 'undefined') return
  try {
    const key = getKey(fisaId)
    sessionStorage.setItem(key, JSON.stringify(data))
  } catch (e) {
    console.warn('[receptieDraftCache] write failed:', e)
  }
}

export function readReceptieDraft(fisaId: string): ReceptieDraftData | null {
  if (typeof window === 'undefined') return null
  try {
    const key = getKey(fisaId)
    const raw = sessionStorage.getItem(key)
    if (!raw) return null
    return JSON.parse(raw) as ReceptieDraftData
  } catch (e) {
    console.warn('[receptieDraftCache] read failed:', e)
    return null
  }
}

export function clearReceptieDraft(fisaId: string): void {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.removeItem(getKey(fisaId))
  } catch (e) {
    console.warn('[receptieDraftCache] clear failed:', e)
  }
}
