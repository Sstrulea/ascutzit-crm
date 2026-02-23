/**
 * Utility functions pentru calcularea timpului estimat proporțional
 * pe bază de instrumente repartizate tehnicianului
 */

import type { RawTrayItem } from '@/lib/supabase/kanban/types'

/**
 * Calculează procentul de instrumente repartizate tehnicianului din totalul tăviței
 * 
 * @param trayItems - Toate item-urile din tăviță
 * @param technicianInstrumentIds - ID-urile instrumentelor repartizate tehnicianului
 * @returns Procentul (0-1) de instrumente repartizate tehnicianului
 */
export function calculateTechnicianInstrumentPercentage(
  trayItems: RawTrayItem[],
  technicianInstrumentIds: string[]
): number {
  if (!trayItems || trayItems.length === 0 || !technicianInstrumentIds || technicianInstrumentIds.length === 0) {
    return 0
  }

  // Obține instrumente unice din tăviță
  const allInstrumentIds = [...new Set(
    trayItems
      .filter(ti => ti.instrument_id && ti.instrument_id.trim() !== '')
      .map(ti => ti.instrument_id)
  )]

  // Dacă nu sunt instrumente în tăviță, nu putem calcula procentaj
  if (allInstrumentIds.length === 0) {
    return 0
  }

  // Contorizează câte instrumente ale tehnicianului sunt în tăviță
  const technicianInstrumentsInTray = technicianInstrumentIds.filter(id =>
    allInstrumentIds.includes(id)
  ).length

  // Calculează procentul
  return technicianInstrumentsInTray / allInstrumentIds.length
}

/**
 * Calculează timpul estimat proporțional pentru tehnician
 * pe bază de procentul instrumentelor sale din tăviță
 * 
 * @param totalTrayTime - Timpul total estimat al tăviței (în minute)
 * @param trayItems - Toate item-urile din tăviță
 * @param technicianInstrumentIds - ID-urile instrumentelor repartizate tehnicianului
 * @returns Timpul estimat pentru tehnician (în minute)
 */
export function calculateProportionalEstimatedTime(
  totalTrayTime: number,
  trayItems: RawTrayItem[],
  technicianInstrumentIds: string[]
): number {
  if (totalTrayTime <= 0) {
    return 0
  }

  const percentage = calculateTechnicianInstrumentPercentage(trayItems, technicianInstrumentIds)
  return Math.round(totalTrayTime * percentage)
}

/**
 * Calculează timpii estimați pentru toți tehnicienii unei tăvițe
 * 
 * @param totalTrayTime - Timpul total estimat al tăviței
 * @param trayItems - Toate item-urile din tăviță
 * @param technicianInstruments - Map cu technician_id -> array de instrument IDs
 * @returns Map cu technician_id -> timp estimat proporțional
 */
export function calculateProportionalTimesForAllTechnicians(
  totalTrayTime: number,
  trayItems: RawTrayItem[],
  technicianInstruments: Map<string, string[]>
): Map<string, number> {
  const result = new Map<string, number>()

  technicianInstruments.forEach((instrumentIds, technicianId) => {
    const proportionalTime = calculateProportionalEstimatedTime(
      totalTrayTime,
      trayItems,
      instrumentIds
    )
    result.set(technicianId, proportionalTime)
  })

  return result
}
