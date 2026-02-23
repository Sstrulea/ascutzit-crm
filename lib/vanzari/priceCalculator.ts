/**
 * MODUL VÂNZARI - CALCULATOR DE PREȚURI
 * =====================================
 * Sistem avansat de calculare a prețurilor cu discount-uri multiple
 */

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// Types
export interface ItemTotalCalculation {
  unitPrice: number
  subtotal: number
  itemDiscount: number
  urgentDiscount: number
  itemTotal: number
  discountPct: number
  isUrgent: boolean
  trayItem?: any  // Include trayItem pentru generare HTML
}

export interface TrayTotalCalculation {
  trayId: string
  items: ItemTotalCalculation[]
  subtotal: number
  totalItemDiscounts: number
  totalUrgentDiscounts: number
  trayTotal: number
}

export interface ServiceFileTotalCalculation {
  serviceFileId: string
  serviceFile: any
  trays: TrayTotalCalculation[]
  totalTrays: number
  globalDiscountPct: number
  globalDiscount: number
  finalTotal: number
  metodaPlata?: 'cash' | 'card'
}

export interface FacturareData {
  discountGlobal?: number
  metodaPlata?: 'cash' | 'card'
  noteFactura?: string
  urgent?: boolean
}

/**
 * Calculează totalul pentru un singur tray item
 * 
 * @param trayItem - Tray item-ul cu toate relațiile (service, part, instrument)
 * @param serviceFileUrgent - Flag urgent din service_file
 * @returns Detalii calcul pentru item
 */
export function calculateItemTotal(
  trayItem: any,
  serviceFileUrgent: boolean = false
): ItemTotalCalculation {
  // 1. Obține prețul unitar
  let unitPrice = 0
  if (trayItem.service_id && trayItem.service) {
    unitPrice = trayItem.service.price || 0
  } else if (trayItem.part_id && trayItem.part) {
    unitPrice = trayItem.part.price || 0
  } else if (trayItem.instrument_id && trayItem.instrument) {
    unitPrice = trayItem.instrument.price || 0
  }

  // 2. Parsează note-urile pentru discount-uri și flag-uri
  const notes = JSON.parse(trayItem.notes || '{}')
  const discountPct = notes.discount_pct || 0
  const isUrgent = notes.urgent || false

  // 3. Calculează subtotal înainte de discount
  const subtotal = unitPrice * (trayItem.qty || 1)

  // 4. Aplică discount la nivel de item
  const itemDiscount = subtotal * (discountPct / 100)
  const afterItemDiscount = subtotal - itemDiscount

  // 5. Aplică discount pentru urgent (10%)
  // Se aplică doar dacă:
  // - Item-ul este marcat urgent în notes
  // - Service_file are urgent = true
  let urgentDiscount = 0
  if (isUrgent && serviceFileUrgent) {
    urgentDiscount = afterItemDiscount * 0.10
  }

  // 6. Total final pentru item
  const itemTotal = afterItemDiscount - urgentDiscount

  return {
    unitPrice,
    subtotal,
    itemDiscount,
    urgentDiscount,
    itemTotal,
    discountPct,
    isUrgent,
    trayItem  // Include trayItem pentru referință
  }
}

/**
 * Calculează totalul pentru o tăviță
 * 
 * @param tray - Tăvița cu tray_items și service_file
 * @returns Detalii calcul pentru tăviță
 */
export function calculateTrayTotal(tray: any): TrayTotalCalculation {
  const items = (tray.tray_items || [])
  const serviceFileUrgent = tray.service_file?.urgent || false

  let subtotal = 0
  let totalItemDiscounts = 0
  let totalUrgentDiscounts = 0
  const itemCalculations: ItemTotalCalculation[] = []

  // Calculează total pentru fiecare item
  for (const item of items) {
    const itemCalc = calculateItemTotal(item, serviceFileUrgent)
    // Adaugă trayItem la calculare pentru generare HTML
    ;(itemCalc as any).trayItem = item
    itemCalculations.push(itemCalc)

    subtotal += itemCalc.subtotal
    totalItemDiscounts += itemCalc.itemDiscount
    totalUrgentDiscounts += itemCalc.urgentDiscount
  }

  const trayTotal = subtotal - totalItemDiscounts - totalUrgentDiscounts

  return {
    trayId: tray.id,
    items: itemCalculations,
    subtotal,
    totalItemDiscounts,
    totalUrgentDiscounts,
    trayTotal
  }
}

/**
 * Calculează totalul complet pentru o fișă de serviciu
 * 
 * @param serviceFileId - ID-ul service file-ului
 * @returns Detalii calcul complet
 */
export async function calculateServiceFileTotal(
  serviceFileId: string
): Promise<ServiceFileTotalCalculation> {
  // 1. Obține service_file
  const { data: serviceFile, error: sfError } = await supabase
    .from('service_files')
    .select('*')
    .eq('id', serviceFileId)
    .single()

  if (sfError || !serviceFile) {
    throw new Error('Service file not found')
  }

  // 2. Obține toate tăvițele pentru fișă
  const { data: trays, error: traysError } = await supabase
    .from('trays')
    .select(`
      *,
      service_file!inner (
        id,
        urgent,
        global_discount_pct
      ),
      tray_items (
        *,
        service (id, name, price),
        part (id, name, price),
        instrument (id, name, price)
      )
    `)
    .eq('service_file_id', serviceFileId)

  if (traysError) {
    throw new Error('Failed to fetch trays')
  }

  // 3. Calculează total pentru fiecare tăviță
  let totalTrays = 0
  const trayCalculations: TrayTotalCalculation[] = []

  for (const tray of (trays || [])) {
    const trayCalc = calculateTrayTotal(tray)
    trayCalculations.push(trayCalc)
    totalTrays += trayCalc.trayTotal
  }

  // 4. Aplică discount global
  const globalDiscountPct = serviceFile.global_discount_pct || 0
  const globalDiscount = totalTrays * (globalDiscountPct / 100)
  const finalTotal = totalTrays - globalDiscount

  // 5. Determină metoda de plată
  let metodaPlata: 'cash' | 'card' | undefined
  if (serviceFile.cash) metodaPlata = 'cash'
  else if (serviceFile.card) metodaPlata = 'card'

  return {
    serviceFileId,
    serviceFile,
    trays: trayCalculations,
    totalTrays,
    globalDiscountPct,
    globalDiscount,
    finalTotal,
    metodaPlata
  }
}

/**
 * Validare înainte de facturare
 * 
 * @param serviceFileId - ID-ul service file-ului
 * @returns Object cu validare și erori
 */
export async function validateForFacturare(
  serviceFileId: string
): Promise<{ valid: boolean; errors: string[] }> {
  const errors: string[] = []

  // 1. Verifică dacă service_file există
  const { data: serviceFile, error: sfError } = await supabase
    .from('service_files')
    .select('*')
    .eq('id', serviceFileId)
    .single()

  if (sfError || !serviceFile) {
    return { valid: false, errors: ['Service file not found'] }
  }

  // 2. Verifică dacă nu este deja facturată
  if (serviceFile.status === 'facturata') {
    errors.push('Service file is already facturata')
  }

  // 3. Verifică dacă nu este blocată
  if (serviceFile.is_locked) {
    errors.push('Service file is locked')
  }

  // 4. Verifică dacă are tăvițe
  const { count: trayCount } = await supabase
    .from('trays')
    .select('*', { count: 'exact', head: true })
    .eq('service_file_id', serviceFileId)

  if (!trayCount || trayCount === 0) {
    errors.push('No trays found for this service file')
  }

  // 5. Verifică dacă toate tăvițele sunt finalizate (opțional)
  const { data: trays } = await supabase
    .from('trays')
    .select('status')
    .eq('service_file_id', serviceFileId)

  const nonFinalizedTrays = (trays || []).filter((t: any) => t.status !== 'finalizata')
  if (nonFinalizedTrays.length > 0) {
    errors.push(`${nonFinalizedTrays.length} tray(s) not finalized`)
  }

  return {
    valid: errors.length === 0,
    errors
  }
}

/**
 * Formatează un număr ca valoare monetară în RON
 * 
 * @param amount - Valoarea de formatat
 * @returns String formatat (ex: "1.234,56 RON")
 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('ro-RO', {
    style: 'currency',
    currency: 'RON',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount)
}

/**
 * Obține un rezumat scurt al calculului total
 * 
 * @param calculation - Calculul complet
 * @returns Rezumat pentru display
 */
export function getCalculationSummary(
  calculation: ServiceFileTotalCalculation
): {
  totalItems: number
  totalTrays: number
  averageDiscount: number
  urgentItems: number
} {
  let totalItems = 0
  let totalDiscounts = 0
  let urgentItems = 0

  for (const tray of calculation.trays) {
    totalItems += tray.items.length
    
    for (const item of tray.items) {
      totalDiscounts += item.discountPct
      if (item.isUrgent) urgentItems++
    }
  }

  const averageDiscount = totalItems > 0 
    ? totalDiscounts / totalItems 
    : 0

  return {
    totalItems,
    totalTrays: calculation.trays.length,
    averageDiscount: Math.round(averageDiscount * 100) / 100,
    urgentItems
  }
}