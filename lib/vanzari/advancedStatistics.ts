/**
 * MODUL VÂNZARI - STATISTICI AVANSATE
 * =====================================
 * Funcții pentru statistici avansate de vânzări
 */

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export interface TimeToCloseStats {
  averageDays: number
  medianDays: number
  minDays: number
  maxDays: number
  totalFacturi: number
  distribution: {
    '< 7 zile': number
    '7-14 zile': number
    '15-30 zile': number
    '> 30 zile': number
  }
}

export interface SellerStats {
  userId: string
  userName: string
  totalFacturi: number
  totalRevenue: number
  averagePerFactura: number
  averageTimeToClose: number
  conversionRate: number
}

export interface DiscountAnalysis {
  totalDiscountGiven: number
  averageDiscountPct: number
  discountsByType: {
    itemDiscount: number
    urgentDiscount: number
    globalDiscount: number
  }
  topDiscounters: {
    userId: string
    userName: string
    totalDiscountGiven: number
    averageDiscountPct: number
  }[]
}

export interface PaymentMethodsStats {
  cash: {
    count: number
    total: number
    percentage: number
  }
  card: {
    count: number
    total: number
    percentage: number
  }
  both: {
    count: number
    total: number
    percentage: number
  }
}

/**
 * Calculează statistici Time to Close (timp de la lead la factură)
 * 
 * @param startDate - Data de start (opțional, ultimele 30 zile default)
 * @param endDate - Data de final (opțional, azi default)
 * @returns Statistici Time to Close
 */
export async function getTimeToCloseStats(
  startDate?: Date,
  endDate?: Date
): Promise<TimeToCloseStats> {
  const start = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const end = endDate || new Date()

  // Obține service_files facturate în perioada
  const { data: serviceFiles, error } = await supabase
    .from('service_files')
    .select(`
      id,
      created_at,
      factura_date
    `)
    .eq('status', 'facturata')
    .gte('created_at', start.toISOString())
    .lte('created_at', end.toISOString())
    .order('created_at', { ascending: true })

  if (error || !serviceFiles) {
    throw new Error(`Failed to fetch service files: ${error?.message}`)
  }

  // Calculează timpul pentru fiecare
  const timesInDays = serviceFiles
    .map(sf => {
      const created = new Date(sf.created_at)
      const facturat = new Date(sf.factura_date || sf.created_at)
      const diffTime = facturat.getTime() - created.getTime()
      const diffDays = diffTime / (24 * 60 * 60 * 1000)
      return Math.round(diffDays * 10) / 10 // 1 zecimală
    })
    .filter(days => days >= 0 && days < 365) // Filtrează valori extreme

  if (timesInDays.length === 0) {
    return {
      averageDays: 0,
      medianDays: 0,
      minDays: 0,
      maxDays: 0,
      totalFacturi: 0,
      distribution: {
        '< 7 zile': 0,
        '7-14 zile': 0,
        '15-30 zile': 0,
        '> 30 zile': 0
      }
    }
  }

  // Calculează statistici
  const average = timesInDays.reduce((a, b) => a + b, 0) / timesInDays.length
  const sorted = timesInDays.sort((a, b) => a - b)
  const median = sorted.length % 2 === 0
    ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
    : sorted[Math.floor(sorted.length / 2)]

  // Distribuție
  const distribution = {
    '< 7 zile': timesInDays.filter(d => d < 7).length,
    '7-14 zile': timesInDays.filter(d => d >= 7 && d < 14).length,
    '15-30 zile': timesInDays.filter(d => d >= 15 && d < 30).length,
    '> 30 zile': timesInDays.filter(d => d >= 30).length
  }

  return {
    averageDays: Math.round(average * 10) / 10,
    medianDays: Math.round(median * 10) / 10,
    minDays: Math.round(sorted[0] * 10) / 10,
    maxDays: Math.round(sorted[sorted.length - 1] * 10) / 10,
    totalFacturi: timesInDays.length,
    distribution
  }
}

/**
 * Obține clasamentul vânzătorilor
 * 
 * @param startDate - Data de start (opțional)
 * @param endDate - Data de final (opțional)
 * @returns Clasament vânzători
 */
export async function getTopSellers(
  startDate?: Date,
  endDate?: Date
): Promise<SellerStats[]> {
  const start = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const end = endDate || new Date()

  // Obține service_files facturate cu lead-uri
  const { data: serviceFiles, error } = await supabase
    .from('service_files')
    .select(`
      id,
      total,
      factura_date,
      lead!inner (
        id,
        created_at,
        assigned_to,
        user_profiles!inner (
          id,
          full_name
        )
      )
    `)
    .eq('status', 'facturata')
    .gte('factura_date', start.toISOString())
    .lte('factura_date', end.toISOString())
    .order('factura_date', { ascending: true })

  if (error || !serviceFiles) {
    throw new Error(`Failed to fetch service files: ${error?.message}`)
  }

  // Grupează pe vânzător
  const sellerMap = new Map<string, SellerStats>()

  for (const sf of serviceFiles) {
    const lead: any = sf.lead
    const seller: any = lead?.user_profiles

    if (!seller) continue

    const existing = sellerMap.get(seller.id) || {
      userId: seller.id,
      userName: seller.full_name || 'Unknown',
      totalFacturi: 0,
      totalRevenue: 0,
      averagePerFactura: 0,
      averageTimeToClose: 0,
      conversionRate: 0
    }

    existing.totalFacturi++
    existing.totalRevenue += sf.total || 0

    sellerMap.set(seller.id, existing)
  }

  // Calculează medii și conversion rate pentru fiecare vânzător
  const stats = Array.from(sellerMap.values()).map(stat => {
    stat.averagePerFactura = stat.totalRevenue / stat.totalFacturi
    return stat
  })

  // Sortează după revenue total
  stats.sort((a, b) => b.totalRevenue - a.totalRevenue)

  return stats
}

/**
 * Analizează discount-urile acordate
 * 
 * @param startDate - Data de start (opțional)
 * @param endDate - Data de final (opțional)
 * @returns Analiză discount-uri
 */
export async function getDiscountAnalysis(
  startDate?: Date,
  endDate?: Date
): Promise<DiscountAnalysis> {
  const start = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const end = endDate || new Date()

  // Obține service_files facturate cu global discount
  const { data: serviceFiles, error } = await supabase
    .from('service_files')
    .select(`
      id,
      total,
      global_discount_pct
    `)
    .eq('status', 'facturata')
    .gte('factura_date', start.toISOString())
    .lte('factura_date', end.toISOString())

  if (error || !serviceFiles) {
    throw new Error(`Failed to fetch service files: ${error?.message}`)
  }

  // Calculează total discount-uri
  let totalGlobalDiscount = 0
  let globalDiscountCount = 0

  for (const sf of serviceFiles) {
    if (sf.global_discount_pct && sf.global_discount_pct > 0) {
      totalGlobalDiscount += sf.total * (sf.global_discount_pct / 100)
      globalDiscountCount++
    }
  }

  const averageGlobalDiscount = globalDiscountCount > 0
    ? totalGlobalDiscount / globalDiscountCount
    : 0

  return {
    totalDiscountGiven: totalGlobalDiscount,
    averageDiscountPct: globalDiscountCount > 0
      ? serviceFiles
          .filter(sf => sf.global_discount_pct > 0)
          .reduce((acc, sf) => acc + (sf.global_discount_pct || 0), 0) / globalDiscountCount
      : 0,
    discountsByType: {
      itemDiscount: 0, // Necesită date din tray_items
      urgentDiscount: 0, // Necesită date din tray_items
      globalDiscount: totalGlobalDiscount
    },
    topDiscounters: [] // Necesită date assigned_to din leads
  }
}

/**
 * Calculează distribuția metodelor de plată
 * 
 * @param startDate - Data de start (opțional)
 * @param endDate - Data de final (opțional)
 * @returns Statistici metode plată
 */
export async function getPaymentMethodsStats(
  startDate?: Date,
  endDate?: Date
): Promise<PaymentMethodsStats> {
  const start = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const end = endDate || new Date()

  // Obține service_files facturate
  const { data: serviceFiles, error } = await supabase
    .from('service_files')
    .select(`
      id,
      total,
      cash,
      card
    `)
    .eq('status', 'facturata')
    .gte('factura_date', start.toISOString())
    .lte('factura_date', end.toISOString())

  if (error || !serviceFiles) {
    throw new Error(`Failed to fetch service files: ${error?.message}`)
  }

  // Grupează pe metodă plată
  let cashCount = 0
  let cashTotal = 0
  let cardCount = 0
  let cardTotal = 0
  let bothCount = 0
  let bothTotal = 0

  for (const sf of serviceFiles) {
    if (sf.cash && sf.card) {
      bothCount++
      bothTotal += sf.total || 0
    } else if (sf.cash) {
      cashCount++
      cashTotal += sf.total || 0
    } else if (sf.card) {
      cardCount++
      cardTotal += sf.total || 0
    }
  }

  const total = cashTotal + cardTotal + bothTotal
  const countTotal = cashCount + cardCount + bothCount

  return {
    cash: {
      count: cashCount,
      total: cashTotal,
      percentage: countTotal > 0 ? (cashCount / countTotal) * 100 : 0
    },
    card: {
      count: cardCount,
      total: cardTotal,
      percentage: countTotal > 0 ? (cardCount / countTotal) * 100 : 0
    },
    both: {
      count: bothCount,
      total: bothTotal,
      percentage: countTotal > 0 ? (bothCount / countTotal) * 100 : 0
    }
  }
}

/**
 * Obține un dashboard complet de statistici avansate
 * 
 * @returns Obiect cu toate statisticile
 */
export async function getAdvancedDashboardStats() {
  const [timeToClose, topSellers, discountAnalysis, paymentMethods] = await Promise.all([
    getTimeToCloseStats(),
    getTopSellers(),
    getDiscountAnalysis(),
    getPaymentMethodsStats()
  ])

  return {
    timeToClose,
    topSellers,
    discountAnalysis,
    paymentMethods
  }
}