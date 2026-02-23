'use client'

import { supabaseBrowser } from './supabaseClient'
import { 
  fetchTraysForServiceFiles, 
  fetchTrayItems, 
  fetchServicePrices,
  fetchServiceFilesForLeads
} from './kanban/fetchers'
import { calculateTrayTotal } from './kanban/transformers'
import { DEPARTMENT_PIPELINES, STAGE_PATTERNS } from './kanban/constants'

// NOTE: tipajul Supabase nu include toate tabelele în `Database`,
// iar `.from('table')` devine `never` → erori TS. Pentru acest modul de dashboard,
// tratăm clientul ca `any` (read-only + agregări) pentru a evita zgomotul de tipuri.
const supabase: any = supabaseBrowser()

export type DashboardInterval = 'day' | 'week' | 'month' | '3months' | '6months' | 'year'

export function getIntervalBounds(interval: DashboardInterval): { start: Date; end: Date } {
  const end = new Date()
  end.setHours(23, 59, 59, 999)
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  switch (interval) {
    case 'day':
      break
    case 'week': {
      const d = start.getDay()
      const diff = start.getDate() - d + (d === 0 ? -6 : 1)
      start.setDate(diff)
      break
    }
    case 'month':
      start.setDate(1)
      break
    case '3months': {
      start.setDate(1)
      start.setMonth(start.getMonth() - 2)
      break
    }
    case '6months': {
      start.setDate(1)
      start.setMonth(start.getMonth() - 5)
      break
    }
    case 'year':
      start.setMonth(0, 1)
      break
    default:
      break
  }
  return { start, end }
}

export function getIntervalLabel(interval: DashboardInterval): string {
  const labels: Record<DashboardInterval, string> = {
    day: 'Ziua curentă',
    week: 'Săptămâna curentă',
    month: 'Luna curentă',
    '3months': 'Ultimele 3 luni',
    '6months': 'Jumătate de an',
    year: 'Anul curent',
  }
  return labels[interval] || interval
}

export interface DashboardMetrics {
  totalLeads: number
  totalRevenue: number
  urgentLeads: number
  newLeadsToday: number
  leadsByPipeline: Record<string, number>
  leadsByStage: Record<string, number>
  revenueByPipeline: Record<string, number>
  revenueByStage: Record<string, number>
  leadsOverTime: Array<{ date: string; count: number }>
  topTechnicians: Array<{ name: string; leads: number; revenue: number }>
  tagDistribution: Record<string, number>
  conversionRate: number
  averageLeadValue: number
  paymentMethodStats: {
    cash: number
    card: number
    none: number
  }
  totalInLucru: number // Suma totală a fișelor de serviciu care au minim o tăviță în lucru
  noDealLeads: number // Numărul de leads cu "no deal"
  // Statistici timp pe stage-uri
  averageTimeByStage: Array<{ stageName: string; averageTime: number; count: number }> // timp mediu în secunde
  totalTimeByStage: Array<{ stageName: string; totalTime: number; count: number }> // timp total în secunde
  // Statistici Vânzări: mutări lead în pipeline-ul Vânzări
  vanzariLeadsApelate: number // mutate din Leads în Callback / No deal / Avem comanda / Nu răspunde
  vanzariMovedFromNuRaspunde: number // mutate din Nu răspunde în alte stage-uri
  vanzariMovedFromCallback: number // mutate din Callback în alte stage-uri
}

const emptyMetrics: DashboardMetrics = {
  totalLeads: 0,
  totalRevenue: 0,
  urgentLeads: 0,
  newLeadsToday: 0,
  leadsByPipeline: {},
  leadsByStage: {},
  revenueByPipeline: {},
  revenueByStage: {},
  leadsOverTime: [],
  topTechnicians: [],
  tagDistribution: {},
  conversionRate: 0,
  averageLeadValue: 0,
  paymentMethodStats: { cash: 0, card: 0, none: 0 },
  totalInLucru: 0,
  noDealLeads: 0,
  averageTimeByStage: [],
  totalTimeByStage: [],
  vanzariLeadsApelate: 0,
  vanzariMovedFromNuRaspunde: 0,
  vanzariMovedFromCallback: 0,
}

/**
 * Calculează suma totală a fișelor de serviciu care au minim o tăviță în lucru
 */
async function calculateTotalInLucru(): Promise<number> {
  try {
    // Găsește pipeline-urile departamentelor
    const { data: pipelines, error: pipelinesError } = await supabase
      .from('pipelines')
      .select('id, name')
      .in('name', DEPARTMENT_PIPELINES)

    if (pipelinesError) throw pipelinesError
    if (!pipelines || pipelines.length === 0) return 0

    const deptPipelineIds = (pipelines as any[]).map((p: any) => p.id)

    // Găsește stage-urile "In Lucru" din pipeline-urile departamentelor
    const { data: stages, error: stagesError } = await supabase
      .from('stages')
      .select('id, name')
      .in('pipeline_id', deptPipelineIds)

    if (stagesError) throw stagesError
    if (!stages || stages.length === 0) return 0

    // Filtrează stage-urile care corespund pattern-ului "In Lucru"
    const inLucruStages = (stages as any[]).filter((s: any) => {
      const stageName = String(s?.name || '').toLowerCase().trim()
      // FOLOSIM FOR LOOP ÎN LOC DE .some() - MAI SIGUR
      const patternsArray = Array.isArray(STAGE_PATTERNS.IN_LUCRU) ? STAGE_PATTERNS.IN_LUCRU : []
      for (let i = 0; i < patternsArray.length; i++) {
        const pattern = patternsArray[i]
        if (pattern && stageName.includes(pattern.toLowerCase())) {
          return true
        }
      }
      return false
    })

    if (inLucruStages.length === 0) return 0

    const inLucruStageIds = inLucruStages.map((s: any) => s.id)

    // Găsește tăvițele care sunt în stage-urile "In Lucru"
    const { data: trayPipelineItems, error: trayItemsError } = await supabase
      .from('pipeline_items')
      .select('item_id')
      .eq('type', 'tray')
      .in('stage_id', inLucruStageIds)

    if (trayItemsError) throw trayItemsError
    if (!trayPipelineItems || trayPipelineItems.length === 0) return 0

    const trayIds = (trayPipelineItems as any[]).map((item: any) => item.item_id as string)

    // Găsește service_files asociate cu aceste tăvițe
    const { data: trays, error: traysError } = await supabase
      .from('trays')
      .select('id, service_file_id')
      .in('id', trayIds)

    if (traysError) throw traysError
    if (!trays || trays.length === 0) return 0

    // Obține service_file IDs unice (o fișă poate avea mai multe tăvițe în lucru)
    const serviceFileIds = [
      ...new Set((trays as any[]).map((t: any) => t.service_file_id).filter(Boolean)),
    ] as string[]

    // Pentru fiecare service_file, calculează totalul tuturor tăvițelor sale
    const { data: allTrays, error: allTraysError } = await fetchTraysForServiceFiles(serviceFileIds)
    if (allTraysError) throw allTraysError
    if (!allTrays || allTrays.length === 0) return 0

    const allTrayIds = (allTrays as any[]).map((t: any) => t.id as string)

    // Obține toate item-urile pentru toate tăvițele din aceste fișe
    const { data: trayItems, error: itemsError } = await fetchTrayItems(allTrayIds)
    if (itemsError) throw itemsError
    if (!trayItems || trayItems.length === 0) return 0

    // Obține prețurile serviciilor
    const serviceIds = [...new Set(trayItems.map(ti => ti.service_id).filter(Boolean))] as string[]
    if (serviceIds.length === 0) return 0
    
    const { data: servicePrices, error: pricesError } = await fetchServicePrices(serviceIds)
    if (pricesError) throw pricesError
    if (!servicePrices) return 0

    // Obține subscription_type pentru fiecare service_file (dacă coloana există)
    // Dacă coloana nu există, folosim valoarea implicită ''
    const subscriptionMap = new Map<string, string>()
    
    try {
      const { data: serviceFiles, error: sfError } = await supabase
        .from('service_files')
        .select('id, subscription_type')
        .in('id', serviceFileIds)

      if (!sfError && serviceFiles) {
        serviceFiles.forEach((sf: any) => {
          subscriptionMap.set(sf.id, sf.subscription_type || '')
        })
      }
    } catch (err) {
      // Dacă coloana nu există, folosim valoarea implicită pentru toate
      serviceFileIds.forEach((sfId: any) => {
        subscriptionMap.set(sfId, '')
      })
    }

    // Calculează totalul pentru fiecare service_file
    const serviceFileTotals = new Map<string, number>()
    
    ;(allTrays as any[]).forEach((tray: any) => {
      const subscriptionType = subscriptionMap.get(tray.service_file_id) || ''
      const trayTotal = calculateTrayTotal(tray.id, trayItems, servicePrices, subscriptionType)
      const currentTotal = serviceFileTotals.get(tray.service_file_id) || 0
      serviceFileTotals.set(tray.service_file_id, currentTotal + trayTotal)
    })

    // Sumă totală pentru toate fișele care au minim o tăviță în lucru
    let total = 0
    serviceFileIds.forEach((sfId: any) => {
      total += serviceFileTotals.get(sfId) || 0
    })

    return total
  } catch (error) {
    const errorMessage = error instanceof Error 
      ? error.message 
      : (error && typeof error === 'object' && 'message' in error)
        ? String((error as any).message)
        : (error && typeof error === 'object' && 'code' in error)
          ? `Error code: ${(error as any).code}`
          : JSON.stringify(error)
    console.error('Error calculating total in lucru:', errorMessage, error)
    return 0
  }
}

/**
 * Calculează totalul revenue pentru service files create în intervalul [start, end].
 * Fără bounds = ziua curentă (comportament implicit).
 */
async function calculateTotalRevenue(bounds?: { start: Date; end: Date }): Promise<number> {
  try {
    let rangeStart: Date
    let rangeEnd: Date
    if (bounds) {
      rangeStart = bounds.start
      rangeEnd = bounds.end
    } else {
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      rangeStart = today
      const todayEnd = new Date(today)
      todayEnd.setHours(23, 59, 59, 999)
      rangeEnd = todayEnd
    }
    const todayStart = rangeStart.toISOString()
    const todayEndISO = rangeEnd.toISOString()

    // Obține toate leads-urile din pipeline_items
    const { data: leadPipelineItems, error: leadError } = await supabase
      .from('pipeline_items')
      .select('item_id')
      .eq('type', 'lead')

    if (leadError) throw leadError
    if (!leadPipelineItems || leadPipelineItems.length === 0) return 0

    const leadIds = [
      ...new Set((leadPipelineItems as any[]).map((item: any) => item.item_id as string)),
    ] as string[]

    // Obține toate service files pentru aceste leads, filtrate doar pentru ziua curentă
    const { data: serviceFiles, error: sfError } = await supabase
      .from('service_files')
      .select('id, lead_id, created_at')
      .in('lead_id', leadIds)
      .gte('created_at', todayStart)
      .lte('created_at', todayEndISO)

    if (sfError) throw sfError
    if (!serviceFiles || serviceFiles.length === 0) return 0

    const serviceFileIds = (serviceFiles as any[]).map((sf: any) => sf.id as string)

    // Obține toate tăvițele pentru aceste service files
    const { data: trays, error: traysError } = await fetchTraysForServiceFiles(serviceFileIds)
    if (traysError) throw traysError
    if (!trays || trays.length === 0) return 0

    const trayIds = (trays as any[]).map((t: any) => t.id as string)

    // Obține toate item-urile pentru toate tăvițele
    const { data: trayItems, error: itemsError } = await fetchTrayItems(trayIds)
    if (itemsError) throw itemsError
    if (!trayItems || trayItems.length === 0) return 0

    // Obține prețurile serviciilor
    const serviceIds = [...new Set(trayItems.map(ti => ti.service_id).filter(Boolean))] as string[]
    if (serviceIds.length === 0) return 0
    
    const { data: servicePrices, error: pricesError } = await fetchServicePrices(serviceIds)
    if (pricesError) throw pricesError
    if (!servicePrices) return 0

    // Obține subscription_type pentru fiecare service_file (dacă coloana există)
    // Dacă coloana nu există, folosim valoarea implicită ''
    const subscriptionMap = new Map<string, string>()
    
    try {
      const { data: sfData, error: subscriptionError } = await supabase
        .from('service_files')
        .select('id, subscription_type')
        .in('id', serviceFileIds)

      if (!subscriptionError && sfData) {
        sfData.forEach((sf: any) => {
          subscriptionMap.set(sf.id, sf.subscription_type || '')
        })
      }
    } catch (err) {
      // Dacă coloana nu există, folosim valoarea implicită pentru toate
      serviceFileIds.forEach((sfId: any) => {
        subscriptionMap.set(sfId, '')
      })
    }

    // Calculează totalul pentru fiecare tăviță
    let totalRevenue = 0
    trays.forEach(tray => {
      const subscriptionType = subscriptionMap.get(tray.service_file_id) || ''
      const trayTotal = calculateTrayTotal(tray.id, trayItems, servicePrices, subscriptionType)
      totalRevenue += trayTotal
    })

    return totalRevenue
  } catch (error) {
    const errorMessage = error instanceof Error 
      ? error.message 
      : (error && typeof error === 'object' && 'message' in error)
        ? String((error as any).message)
        : (error && typeof error === 'object' && 'code' in error)
          ? `Error code: ${(error as any).code}`
          : JSON.stringify(error)
    console.error('Error calculating total revenue:', errorMessage, error)
    return 0
  }
}

/**
 * Calculează numărul de leads-uri urgente (leads cu cel puțin o fișă de serviciu urgentă)
 */
async function calculateUrgentLeads(): Promise<number> {
  try {
    // Obține toate service files urgente
    const { data: urgentServiceFiles, error: sfError } = await supabase
      .from('service_files')
      .select('lead_id')
      .eq('urgent', true)

    if (sfError) throw sfError
    if (!urgentServiceFiles || urgentServiceFiles.length === 0) return 0

    // Numără leads-urile unice care au cel puțin o fișă urgentă
    const urgentLeadIds = [...new Set(urgentServiceFiles.map(sf => sf.lead_id))]
    return urgentLeadIds.length
  } catch (error) {
    const errorMessage = error instanceof Error 
      ? error.message 
      : (error && typeof error === 'object' && 'message' in error)
        ? String((error as any).message)
        : JSON.stringify(error)
    console.error('Error calculating urgent leads:', errorMessage, error)
    return 0
  }
}

/**
 * Calculează numărul de leads-uri noi create în intervalul [start, end].
 * Fără bounds = ziua curentă (comportament implicit).
 */
async function calculateNewLeadsInPeriod(bounds?: { start: Date; end: Date }): Promise<number> {
  try {
    let rangeStart: Date
    let rangeEnd: Date
    if (bounds) {
      rangeStart = bounds.start
      rangeEnd = bounds.end
    } else {
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      rangeStart = today
      const tomorrow = new Date(today)
      tomorrow.setDate(tomorrow.getDate() + 1)
      rangeEnd = tomorrow
    }
    const startISO = rangeStart.toISOString()
    const endISO = rangeEnd.toISOString()

    const { data: leads, error } = await supabase
      .from('leads')
      .select('id')
      .gte('created_at', startISO)
      .lte('created_at', endISO)

    if (error) throw error
    return leads?.length || 0
  } catch (error) {
    const errorMessage = error instanceof Error 
      ? error.message 
      : (error && typeof error === 'object' && 'message' in error)
        ? String((error as any).message)
        : JSON.stringify(error)
    console.error('Error calculating new leads in period:', errorMessage, error)
    return 0
  }
}

/**
 * Calculează distribuția leads-urilor pe pipeline-uri
 */
async function calculateLeadsByPipeline(): Promise<Record<string, number>> {
  try {
    const { data: pipelines, error: pipelinesError } = await supabase
      .from('pipelines')
      .select('id, name')

    if (pipelinesError) throw pipelinesError
    if (!pipelines || pipelines.length === 0) return {}

    const result: Record<string, number> = {}

    for (const pipeline of pipelines) {
      const { count, error } = await supabase
        .from('pipeline_items')
        .select('*', { count: 'exact', head: true })
        .eq('type', 'lead')
        .eq('pipeline_id', pipeline.id)

      if (!error) {
        result[pipeline.name] = count || 0
      }
    }

    return result
  } catch (error) {
    const errorMessage = error instanceof Error 
      ? error.message 
      : (error && typeof error === 'object' && 'message' in error)
        ? String((error as any).message)
        : JSON.stringify(error)
    console.error('Error calculating leads by pipeline:', errorMessage, error)
    return {}
  }
}

/**
 * Calculează distribuția leads-urilor pe stage-uri
 */
async function calculateLeadsByStage(): Promise<Record<string, number>> {
  try {
    const { data: stages, error: stagesError } = await supabase
      .from('stages')
      .select('id, name, pipeline_id')

    if (stagesError) throw stagesError
    if (!stages || stages.length === 0) return {}

    const result: Record<string, number> = {}

    for (const stage of stages) {
      const { count, error } = await supabase
        .from('pipeline_items')
        .select('*', { count: 'exact', head: true })
        .eq('type', 'lead')
        .eq('stage_id', stage.id)

      if (!error) {
        result[stage.name] = count || 0
      }
    }

    return result
  } catch (error) {
    const errorMessage = error instanceof Error 
      ? error.message 
      : (error && typeof error === 'object' && 'message' in error)
        ? String((error as any).message)
        : JSON.stringify(error)
    console.error('Error calculating leads by stage:', errorMessage, error)
    return {}
  }
}

/**
 * Calculează revenue-ul pe pipeline-uri
 */
async function calculateRevenueByPipeline(): Promise<Record<string, number>> {
  try {
    const { data: pipelines, error: pipelinesError } = await supabase
      .from('pipelines')
      .select('id, name')

    if (pipelinesError) throw pipelinesError
    if (!pipelines || pipelines.length === 0) return {}

    const result: Record<string, number> = {}

    for (const pipeline of pipelines) {
      // Obține leads-urile din acest pipeline
      const { data: leadItems, error: leadError } = await supabase
        .from('pipeline_items')
        .select('item_id')
        .eq('type', 'lead')
        .eq('pipeline_id', pipeline.id)

      if (leadError || !leadItems || leadItems.length === 0) {
        result[pipeline.name] = 0
        continue
      }

      const leadIds = [...new Set((leadItems as any[]).map((item: any) => item.item_id as string))] as string[]

      // Obține service files pentru aceste leads
      const { data: serviceFiles, error: sfError } = await fetchServiceFilesForLeads(leadIds)
      if (sfError || !serviceFiles || serviceFiles.length === 0) {
        result[pipeline.name] = 0
        continue
      }

      const serviceFileIds = (serviceFiles as any[]).map((sf: any) => sf.id as string)

      // Obține tăvițele
      const { data: trays, error: traysError } = await fetchTraysForServiceFiles(serviceFileIds)
      if (traysError || !trays || trays.length === 0) {
        result[pipeline.name] = 0
        continue
      }

      const trayIds = (trays as any[]).map((t: any) => t.id as string)

      // Obține item-urile
      const { data: trayItems, error: itemsError } = await fetchTrayItems(trayIds)
      if (itemsError || !trayItems || trayItems.length === 0) {
        result[pipeline.name] = 0
        continue
      }

      // Obține prețurile
      const serviceIds = [...new Set(trayItems.map(ti => ti.service_id).filter(Boolean))] as string[]
      if (serviceIds.length === 0) {
        result[pipeline.name] = 0
        continue
      }
      
      const { data: servicePrices, error: pricesError } = await fetchServicePrices(serviceIds)
      if (pricesError || !servicePrices) {
        result[pipeline.name] = 0
        continue
      }

      // Obține subscription_type (dacă coloana există)
      const subscriptionMap = new Map<string, string>()
      
      try {
        const { data: sfData } = await supabase
          .from('service_files')
          .select('id, subscription_type')
          .in('id', serviceFileIds)

        if (sfData) {
          sfData.forEach((sf: any) => {
            subscriptionMap.set(sf.id, sf.subscription_type || '')
          })
        }
      } catch (err) {
        // Dacă coloana nu există, folosim valoarea implicită pentru toate
        serviceFileIds.forEach((sfId: any) => {
          subscriptionMap.set(sfId, '')
        })
      }

      // Calculează totalul
      let pipelineRevenue = 0
      ;(trays as any[]).forEach((tray: any) => {
        const subscriptionType = subscriptionMap.get(tray.service_file_id) || ''
        const trayTotal = calculateTrayTotal(tray.id, trayItems, servicePrices, subscriptionType)
        pipelineRevenue += trayTotal
      })

      result[pipeline.name] = pipelineRevenue
    }

    return result
  } catch (error) {
    const errorMessage = error instanceof Error 
      ? error.message 
      : (error && typeof error === 'object' && 'message' in error)
        ? String((error as any).message)
        : JSON.stringify(error)
    console.error('Error calculating revenue by pipeline:', errorMessage, error)
    return {}
  }
}

/**
 * Calculează statisticile pentru payment methods (cash/card)
 */
async function calculatePaymentMethodStats(): Promise<{ cash: number; card: number; none: number }> {
  try {
    // Obține toate service files care sunt în stage-ul "Facturat" din pipeline-ul "Receptie"
    const { data: receptiePipeline } = await supabase
      .from('pipelines')
      .select('id')
      .ilike('name', '%receptie%')
      .single()

    if (!receptiePipeline) return { cash: 0, card: 0, none: 0 }

    const { data: facturatStages } = await supabase
      .from('stages')
      .select('id')
      .eq('pipeline_id', receptiePipeline.id)
      .or('name.ilike.%facturat%,name.ilike.%facturată%')

    if (!facturatStages || facturatStages.length === 0) return { cash: 0, card: 0, none: 0 }

    const facturatStageIds = (facturatStages as any[]).map((s: any) => s.id) as string[]

    const { data: serviceFileItems } = await supabase
      .from('pipeline_items')
      .select('item_id')
      .eq('type', 'service_file')
      .in('stage_id', facturatStageIds)

    if (!serviceFileItems || serviceFileItems.length === 0) return { cash: 0, card: 0, none: 0 }

    const serviceFileIds = (serviceFileItems as any[]).map((item: any) => item.item_id as string) as string[]

    const { data: serviceFiles } = await supabase
      .from('service_files')
      .select('cash, card')
      .in('id', serviceFileIds)

    if (!serviceFiles) return { cash: 0, card: 0, none: 0 }

    let cashCount = 0
    let cardCount = 0
    let noneCount = 0

    ;(serviceFiles as any[]).forEach((sf: any) => {
      // IMPORTANT: cash și card sunt acum în câmpuri separate, nu în details
      // details conține doar text (detalii client)
      if (sf.cash === true) {
        cashCount++
      } else if (sf.card === true) {
        cardCount++
      } else {
        noneCount++
      }
    })

    return { cash: cashCount, card: cardCount, none: noneCount }
  } catch (error) {
    const errorMessage = error instanceof Error 
      ? error.message 
      : (error && typeof error === 'object' && 'message' in error)
        ? String((error as any).message)
        : JSON.stringify(error)
    console.error('Error calculating payment method stats:', errorMessage, error)
    return { cash: 0, card: 0, none: 0 }
  }
}

/**
 * Calculează numărul total de leads din tabelul leads
 */
async function calculateTotalLeads(): Promise<number> {
  try {
    const { count, error } = await supabase
      .from('leads')
      .select('*', { count: 'exact', head: true })

    if (error) throw error
    return count || 0
  } catch (error) {
    const errorMessage = error instanceof Error 
      ? error.message 
      : (error && typeof error === 'object' && 'message' in error)
        ? String((error as any).message)
        : JSON.stringify(error)
    console.error('Error calculating total leads:', errorMessage, error)
    return 0
  }
}

/**
 * Calculează statistici despre timpul petrecut pe stage-uri pentru o tăviță specifică
 */
export async function calculateTrayStageTimeStats(trayId: string): Promise<{
  averageTimeByStage: Array<{ stageName: string; averageTime: number; count: number }>
  totalTimeByStage: Array<{ stageName: string; totalTime: number; count: number }>
  currentStageTime: number | null // timp în secunde
  currentStageName?: string | null
}> {
  try {
    const supabase: any = supabaseBrowser()
    
    // Obține toate mutările pentru această tăviță
    const { data: allMoves, error: movesError } = await supabase
      .from('stage_history' as any)
      .select(`
        id,
        to_stage_id,
        moved_at
      `)
      .eq('tray_id', trayId)
      .not('tray_id', 'is', null)
      .order('moved_at', { ascending: true })
    
    if (movesError) {
      console.error('[calculateTrayStageTimeStats] Error:', movesError)
      return { averageTimeByStage: [], totalTimeByStage: [], currentStageTime: null, currentStageName: null }
    }
    
    if (!allMoves || allMoves.length === 0) {
      return { averageTimeByStage: [], totalTimeByStage: [], currentStageTime: null, currentStageName: null }
    }
    
    // Normalizează timestamp-ul mutării (moved_at dacă există, altfel created_at)
    const moves = (allMoves as any[])
      .map(m => ({
        to_stage_id: m?.to_stage_id as string | null,
        moved_at: (m?.moved_at) as string | null,
      }))
      .filter(m => !!m.to_stage_id && !!m.moved_at)
      .map(m => ({ ...m, movedAtDate: new Date(String(m.moved_at)) }))
      .filter(m => !Number.isNaN(m.movedAtDate.getTime()))
      .sort((a, b) => a.movedAtDate.getTime() - b.movedAtDate.getTime())

    if (moves.length === 0) {
      return { averageTimeByStage: [], totalTimeByStage: [], currentStageTime: null, currentStageName: null }
    }

    // Stage names
    const stageIds = [...new Set(moves.map(m => m.to_stage_id).filter(Boolean))] as string[]
    const stageNamesMap: Record<string, string> = {}
    if (stageIds.length > 0) {
      const { data: stages } = await supabase
        .from('stages')
        .select('id, name')
        .in('id', stageIds)
      if (stages) {
        ;(stages as any[]).forEach(s => {
          if (s?.id) stageNamesMap[String(s.id)] = String(s.name || 'Stage necunoscut')
        })
      }
    }

    const now = new Date()
    const stageStatsByName: Record<string, { totalTime: number; count: number }> = {}

    // Durata pentru fiecare intrare = nextMove - currentMove (sau now pentru ultima)
    for (let i = 0; i < moves.length; i++) {
      const stageId = moves[i].to_stage_id!
      const stageName = stageNamesMap[stageId] || 'Stage necunoscut'
      const start = moves[i].movedAtDate
      const end = i < moves.length - 1 ? moves[i + 1].movedAtDate : now

      const seconds = Math.max(0, Math.floor((end.getTime() - start.getTime()) / 1000))
      if (!stageStatsByName[stageName]) stageStatsByName[stageName] = { totalTime: 0, count: 0 }
      stageStatsByName[stageName].totalTime += seconds
      stageStatsByName[stageName].count += 1
    }

    const lastStageId = moves[moves.length - 1].to_stage_id!
    const currentStageName = stageNamesMap[lastStageId] || 'Stage necunoscut'
    const currentStageTime = Math.max(
      0,
      Math.floor((now.getTime() - moves[moves.length - 1].movedAtDate.getTime()) / 1000)
    )
    
    const averageTimeByStage = Object.entries(stageStatsByName)
      .map(([stageName, stats]) => ({
        stageName,
        averageTime: stats.count > 0 ? Math.floor(stats.totalTime / stats.count) : 0,
        count: stats.count
      }))
      .filter(item => item.count > 0)
      .sort((a, b) => b.averageTime - a.averageTime)
    
    const totalTimeByStage = Object.entries(stageStatsByName)
      .map(([stageName, stats]) => ({
        stageName,
        totalTime: stats.totalTime,
        count: stats.count
      }))
      .filter(item => item.count > 0)
      .sort((a, b) => b.totalTime - a.totalTime)
    
    return {
      averageTimeByStage,
      totalTimeByStage,
      currentStageTime,
      currentStageName
    }
  } catch (error) {
    console.error('[calculateTrayStageTimeStats] Error:', error)
    return { averageTimeByStage: [], totalTimeByStage: [], currentStageTime: null, currentStageName: null }
  }
}

/**
 * Calculează timpul mediu petrecut pe fiecare stage pentru toate tăvițele
 */
async function calculateAverageTimeByStage(): Promise<Array<{ stageName: string; averageTime: number; count: number }>> {
  try {
    const supabase = supabaseBrowser()
    
    // Obține toate mutările din stage_history pentru tăvițe (tray_id IS NOT NULL)
    // Simplificăm query-ul pentru a evita probleme cu foreign keys
    const { data: allMoves, error: movesError } = await supabase
      .from('stage_history' as any)
      .select(`
        id,
        tray_id,
        from_stage_id,
        to_stage_id,
        moved_at
      `)
      .not('tray_id', 'is', null)
      .order('moved_at', { ascending: true })
    
    if (movesError) {
      const errorMessage = movesError.message || JSON.stringify(movesError)
      console.error('[calculateAverageTimeByStage] Error fetching moves:', errorMessage, movesError)
      return []
    }
    
    if (!allMoves || allMoves.length === 0) return []
    
    // Obține numele stage-urilor
    const stageIds = [...new Set(allMoves.map((m: any) => m.to_stage_id).filter(Boolean))]
    const stageNamesMap: Record<string, string> = {}
    
    if (stageIds.length > 0) {
      const { data: stages, error: stagesError } = await supabase
        .from('stages')
        .select('id, name')
        .in('id', stageIds)
      
      if (!stagesError && stages) {
        stages.forEach((stage: any) => {
          stageNamesMap[stage.id] = stage.name
        })
      }
    }
    
    // Grupează mutările pe tăviță și calculează timpul petrecut în fiecare stage
    const trayStageTimes: Record<string, Array<{ stageId: string; stageName: string; startTime: Date; endTime: Date | null }>> = {}
    
    // Procesează mutările pentru a calcula timpul în fiecare stage
    allMoves.forEach((move: any) => {
      const trayId = move.tray_id
      if (!trayStageTimes[trayId]) {
        trayStageTimes[trayId] = []
      }
      
      const stageName = move.to_stage_id ? (stageNamesMap[move.to_stage_id] || 'Stage necunoscut') : 'Stage necunoscut'
      const moveTime = new Date(move.moved_at)
      
      // Dacă există o mutare anterioară în același stage, închide perioada anterioară
      if (move.from_stage_id) {
        const previousEntry = trayStageTimes[trayId].find(e => e.stageId === move.from_stage_id && !e.endTime)
        if (previousEntry) {
          previousEntry.endTime = moveTime
        }
      }
      
      // Adaugă noua intrare pentru stage-ul țintă
      trayStageTimes[trayId].push({
        stageId: move.to_stage_id,
        stageName,
        startTime: moveTime,
        endTime: null // Va fi setat când tăvița părăsește acest stage
      })
    })
    
    // Pentru stage-urile curente (fără endTime), folosește timpul actual
    const now = new Date()
    Object.values(trayStageTimes).forEach(entries => {
      entries.forEach(entry => {
        if (!entry.endTime) {
          entry.endTime = now
        }
      })
    })
    
    // Calculează timpul total și numărul de vizite pentru fiecare stage
    const stageStats: Record<string, { totalTime: number; count: number }> = {}
    
    Object.values(trayStageTimes).forEach(entries => {
      entries.forEach(entry => {
        if (!stageStats[entry.stageName]) {
          stageStats[entry.stageName] = { totalTime: 0, count: 0 }
        }
        
        const timeSpent = Math.floor((entry.endTime!.getTime() - entry.startTime.getTime()) / 1000) // în secunde
        stageStats[entry.stageName].totalTime += timeSpent
        stageStats[entry.stageName].count += 1
      })
    })
    
    // Calculează media pentru fiecare stage
    const result = Object.entries(stageStats)
      .map(([stageName, stats]) => ({
        stageName,
        averageTime: stats.count > 0 ? Math.floor(stats.totalTime / stats.count) : 0,
        count: stats.count
      }))
      .filter(item => item.count > 0)
      .sort((a, b) => b.averageTime - a.averageTime)
    
    return result
  } catch (error) {
    console.error('[calculateAverageTimeByStage] Error:', error)
    return []
  }
}

/**
 * Calculează timpul total petrecut pe fiecare stage
 */
async function calculateTotalTimeByStage(): Promise<Array<{ stageName: string; totalTime: number; count: number }>> {
  try {
    const supabase = supabaseBrowser()
    
    // Obține toate mutările din stage_history pentru tăvițe (tray_id IS NOT NULL)
    // Simplificăm query-ul pentru a evita probleme cu foreign keys
    const { data: allMoves, error: movesError } = await supabase
      .from('stage_history' as any)
      .select(`
        id,
        tray_id,
        from_stage_id,
        to_stage_id,
        moved_at
      `)
      .not('tray_id', 'is', null)
      .order('moved_at', { ascending: true })
    
    if (movesError) {
      const errorMessage = movesError.message || JSON.stringify(movesError)
      console.error('[calculateTotalTimeByStage] Error fetching moves:', errorMessage, movesError)
      return []
    }
    
    if (!allMoves || allMoves.length === 0) return []
    
    // Obține numele stage-urilor
    const stageIds = [...new Set(allMoves.map((m: any) => m.to_stage_id).filter(Boolean))]
    const stageNamesMap: Record<string, string> = {}
    
    if (stageIds.length > 0) {
      const { data: stages, error: stagesError } = await supabase
        .from('stages')
        .select('id, name')
        .in('id', stageIds)
      
      if (!stagesError && stages) {
        stages.forEach((stage: any) => {
          stageNamesMap[stage.id] = stage.name
        })
      }
    }
    
    // Grupează mutările pe tăviță
    const trayStageTimes: Record<string, Array<{ stageId: string; stageName: string; startTime: Date; endTime: Date | null }>> = {}
    
    allMoves.forEach((move: any) => {
      const trayId = move.tray_id
      if (!trayStageTimes[trayId]) {
        trayStageTimes[trayId] = []
      }
      
      const stageName = move.to_stage_id ? (stageNamesMap[move.to_stage_id] || 'Stage necunoscut') : 'Stage necunoscut'
      const moveTime = new Date(move.moved_at)
      
      // Închide perioada anterioară dacă există
      if (move.from_stage_id) {
        const previousEntry = trayStageTimes[trayId].find(e => e.stageId === move.from_stage_id && !e.endTime)
        if (previousEntry) {
          previousEntry.endTime = moveTime
        }
      }
      
      // Adaugă noua intrare
      trayStageTimes[trayId].push({
        stageId: move.to_stage_id,
        stageName,
        startTime: moveTime,
        endTime: null
      })
    })
    
    // Pentru stage-urile curente, folosește timpul actual
    const now = new Date()
    Object.values(trayStageTimes).forEach(entries => {
      entries.forEach(entry => {
        if (!entry.endTime) {
          entry.endTime = now
        }
      })
    })
    
    // Calculează timpul total pentru fiecare stage
    const stageStats: Record<string, { totalTime: number; count: number }> = {}
    
    Object.values(trayStageTimes).forEach(entries => {
      entries.forEach(entry => {
        if (!stageStats[entry.stageName]) {
          stageStats[entry.stageName] = { totalTime: 0, count: 0 }
        }
        
        const timeSpent = Math.floor((entry.endTime!.getTime() - entry.startTime.getTime()) / 1000) // în secunde
        stageStats[entry.stageName].totalTime += timeSpent
        stageStats[entry.stageName].count += 1
      })
    })
    
    const result = Object.entries(stageStats)
      .map(([stageName, stats]) => ({
        stageName,
        totalTime: stats.totalTime,
        count: stats.count
      }))
      .filter(item => item.count > 0)
      .sort((a, b) => b.totalTime - a.totalTime)
    
    return result
  } catch (error) {
    console.error('[calculateTotalTimeByStage] Error:', error)
    return []
  }
}

/**
 * Calculează numărul de leads cu "no deal"
 * Acum no_deal este salvat în tabelul leads, nu în service_files
 */
async function calculateNoDealLeads(): Promise<number> {
  try {
    // Obține toate leads-urile cu no_deal = true sau 'true' sau 1
    const { data: allLeads, error: leadsError } = await supabase
      .from('leads')
      .select('id, no_deal')

    if (leadsError) throw leadsError
    if (!allLeads || allLeads.length === 0) return 0

    // Filtrează leads-urile cu no_deal activ (true, 'true', 1, '1', etc.)
    const noDealLeads = (allLeads as any[]).filter((lead: any) => {
      const noDealValue = lead.no_deal
      // Verifică multiple formate posibile
      return noDealValue === true || 
             noDealValue === 'true' || 
             noDealValue === 1 || 
             noDealValue === '1' ||
             (typeof noDealValue === 'string' && noDealValue.toLowerCase() === 'true')
    })

    return noDealLeads.length
  } catch (error) {
    const errorMessage = error instanceof Error 
      ? error.message 
      : (error && typeof error === 'object' && 'message' in error)
        ? String((error as any).message)
        : JSON.stringify(error)
    console.error('Error calculating no deal leads:', errorMessage, error)
    return 0
  }
}

/** Normalizează nume stage pentru match flexibil. */
function normStageName(s: string): string {
  return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim()
}

function matchesLeadsStage(n: string): boolean {
  return n === 'leads' || (n.includes('lead') && !n.includes('callback'))
}

function matchesCallbackStage(n: string): boolean {
  return n.includes('callback') || n.includes('call back')
}

function matchesNuRaspundeStage(n: string): boolean {
  return n.includes('nu') && n.includes('raspunde')
}

function matchesApelatToStage(n: string): boolean {
  return matchesCallbackStage(n) ||
    (n.includes('no') && n.includes('deal')) ||
    (n.includes('avem') && n.includes('comanda')) ||
    matchesNuRaspundeStage(n)
}

/**
 * Statistici Vânzări: leaduri apelate, mutate din Nu răspunde, mutate din Callback.
 * Folosește items_events (stage_change) pentru lead-uri mutate în pipeline-ul Vânzări.
 */
async function calculateVanzariLeadMoveStats(bounds: { start: Date; end: Date }): Promise<{
  leadsApelate: number
  movedFromNuRaspunde: number
  movedFromCallback: number
}> {
  try {
    const { data: vanzariPipeline, error: pErr } = await supabase
      .from('pipelines')
      .select('id')
      .ilike('name', '%vanzari%')
      .limit(1)
      .maybeSingle()

    if (pErr || !vanzariPipeline) {
      return { leadsApelate: 0, movedFromNuRaspunde: 0, movedFromCallback: 0 }
    }

    const vanzariId = (vanzariPipeline as any).id

    const { data: stages, error: sErr } = await supabase
      .from('stages')
      .select('id, name')
      .eq('pipeline_id', vanzariId)

    if (sErr || !stages?.length) {
      return { leadsApelate: 0, movedFromNuRaspunde: 0, movedFromCallback: 0 }
    }

    const stageIdToName = new Map<string, string>()
    ;(stages as any[]).forEach((s: any) => {
      if (s?.id) stageIdToName.set(s.id, String(s?.name ?? ''))
    })

    const startISO = bounds.start.toISOString()
    const endISO = bounds.end.toISOString()

    const { data: events, error: eErr } = await supabase
      .from('items_events' as any)
      .select('item_id, payload, created_at')
      .eq('type', 'lead')
      .eq('event_type', 'stage_change')
      .gte('created_at', startISO)
      .lte('created_at', endISO)

    if (eErr || !events?.length) {
      return { leadsApelate: 0, movedFromNuRaspunde: 0, movedFromCallback: 0 }
    }

    const vanzariEvents = (events as any[]).filter((e: any) => {
      const pid = e?.payload?.pipeline_id
      return pid === vanzariId
    })

    const apelateIds = new Set<string>()
    const fromNuRaspundeIds = new Set<string>()
    const fromCallbackIds = new Set<string>()

    for (const e of vanzariEvents) {
      const fromId = e?.payload?.from_stage_id
      const toId = e?.payload?.to_stage_id
      const leadId = e?.item_id
      if (!leadId || !fromId || !toId) continue

      const fromName = normStageName(stageIdToName.get(fromId) ?? '')
      const toName = normStageName(stageIdToName.get(toId) ?? '')

      if (matchesLeadsStage(fromName) && matchesApelatToStage(toName)) {
        apelateIds.add(leadId)
      }
      if (matchesNuRaspundeStage(fromName) && fromName !== toName) {
        fromNuRaspundeIds.add(leadId)
      }
      if (matchesCallbackStage(fromName) && fromName !== toName) {
        fromCallbackIds.add(leadId)
      }
    }

    return {
      leadsApelate: apelateIds.size,
      movedFromNuRaspunde: fromNuRaspundeIds.size,
      movedFromCallback: fromCallbackIds.size,
    }
  } catch (err) {
    console.error('[calculateVanzariLeadMoveStats]', err)
    return { leadsApelate: 0, movedFromNuRaspunde: 0, movedFromCallback: 0 }
  }
}

/**
 * Calculează toate metricile pentru dashboard.
 * interval: perioada pentru Revenue și Lead-uri Noi (implicit 'day').
 */
export async function calculateDashboardMetrics(opts?: { excludePipeline?: string; interval?: DashboardInterval }): Promise<DashboardMetrics> {
  try {
    const interval = opts?.interval ?? 'day'
    const bounds = getIntervalBounds(interval)

    const [
      totalLeadsResult,
      totalRevenue,
      urgentLeads,
      newLeadsInPeriod,
      leadsByPipeline,
      leadsByStage,
      revenueByPipeline,
      paymentMethodStats,
      totalInLucru,
      noDealLeads,
      averageTimeByStage,
      totalTimeByStage,
      vanzariMoveStats,
    ] = await Promise.all([
      calculateTotalLeads(),
      calculateTotalRevenue(bounds),
      calculateUrgentLeads(),
      calculateNewLeadsInPeriod(bounds),
      calculateLeadsByPipeline(),
      calculateLeadsByStage(),
      calculateRevenueByPipeline(),
      calculatePaymentMethodStats(),
      calculateTotalInLucru(),
      calculateNoDealLeads(),
      calculateAverageTimeByStage(),
      calculateTotalTimeByStage(),
      calculateVanzariLeadMoveStats(bounds),
    ])

    const totalLeads = totalLeadsResult || 0

    return {
      totalLeads,
      totalRevenue,
      urgentLeads,
      newLeadsToday: newLeadsInPeriod,
      leadsByPipeline,
      leadsByStage,
      revenueByPipeline,
      revenueByStage: {}, // Poate fi implementat similar cu revenueByPipeline
      leadsOverTime: [], // Poate fi implementat cu agregări pe date
      topTechnicians: [], // Poate fi implementat cu agregări pe technician_id
      tagDistribution: {}, // Poate fi implementat cu lead_tags
      conversionRate: 0,
      averageLeadValue: totalLeads > 0 ? totalRevenue / totalLeads : 0,
      paymentMethodStats,
      totalInLucru,
      noDealLeads,
      averageTimeByStage,
      totalTimeByStage,
      vanzariLeadsApelate: vanzariMoveStats.leadsApelate,
      vanzariMovedFromNuRaspunde: vanzariMoveStats.movedFromNuRaspunde,
      vanzariMovedFromCallback: vanzariMoveStats.movedFromCallback,
    }
  } catch (error) {
    const errorMessage = error instanceof Error 
      ? error.message 
      : (error && typeof error === 'object' && 'message' in error)
        ? String((error as any).message)
        : JSON.stringify(error)
    console.error('Error calculating dashboard metrics:', errorMessage, error)
    return emptyMetrics
  }
}

/**
 * Get Vanzari dashboard metrics
 */
export async function calculateVanzariMetrics(): Promise<DashboardMetrics> {
  try {
    // Pentru Vanzari, calculăm doar leads-urile din pipeline-ul Vanzari
    const { data: vanzariPipeline } = await supabase
      .from('pipelines')
      .select('id')
      .ilike('name', '%vanzari%')
      .single()

    if (!vanzariPipeline) return emptyMetrics

    // Obține leads-urile din pipeline-ul Vanzari
    const { data: leadItems, error: leadError } = await supabase
      .from('pipeline_items')
      .select('item_id')
      .eq('type', 'lead')
      .eq('pipeline_id', vanzariPipeline.id)

    if (leadError || !leadItems || leadItems.length === 0) {
      return { ...emptyMetrics, totalLeads: 0 }
    }

    const leadIds = [...new Set((leadItems as any[]).map((item: any) => item.item_id as string))] as string[]

    // Calculează revenue-ul pentru aceste leads
    const { data: serviceFiles, error: sfError } = await fetchServiceFilesForLeads(leadIds)
    let totalRevenue = 0

    if (!sfError && serviceFiles && serviceFiles.length > 0) {
      const serviceFileIds = (serviceFiles as any[]).map((sf: any) => sf.id as string)
      const { data: trays, error: traysError } = await fetchTraysForServiceFiles(serviceFileIds)

      if (!traysError && trays && trays.length > 0) {
        const trayIds = (trays as any[]).map((t: any) => t.id as string)
        const { data: trayItems, error: itemsError } = await fetchTrayItems(trayIds)

        if (!itemsError && trayItems && trayItems.length > 0) {
          const serviceIds = [...new Set(trayItems.map(ti => ti.service_id).filter(Boolean))] as string[]
          
          if (serviceIds.length > 0) {
            const { data: servicePrices, error: pricesError } = await fetchServicePrices(serviceIds)

            if (!pricesError && servicePrices) {
              const subscriptionMap = new Map<string, string>()
              
              try {
                const { data: sfData } = await supabase
                  .from('service_files')
                  .select('id, subscription_type')
                  .in('id', serviceFileIds)

                if (sfData) {
                  sfData.forEach((sf: any) => {
                    subscriptionMap.set(sf.id, sf.subscription_type || '')
                  })
                }
              } catch (err) {
                // Dacă coloana nu există, folosim valoarea implicită pentru toate
                serviceFileIds.forEach((sfId: any) => {
                  subscriptionMap.set(sfId, '')
                })
              }

              trays.forEach(tray => {
                const subscriptionType = subscriptionMap.get(tray.service_file_id) || ''
                const trayTotal = calculateTrayTotal(tray.id, trayItems, servicePrices, subscriptionType)
                totalRevenue += trayTotal
              })
            }
          }
        }
      }
    }

    // Calculează celelalte metrici
    const urgentLeads = await calculateUrgentLeads()
    const newLeadsToday = await calculateNewLeadsInPeriod()
    const paymentMethodStats = await calculatePaymentMethodStats()
    const totalInLucru = await calculateTotalInLucru()
    const averageTimeByStage = await calculateAverageTimeByStage()
    const totalTimeByStage = await calculateTotalTimeByStage()

    return {
      totalLeads: leadIds.length,
      totalRevenue,
      urgentLeads,
      newLeadsToday,
      leadsByPipeline: { 'Vanzari': leadIds.length },
      leadsByStage: {},
      revenueByPipeline: { 'Vanzari': totalRevenue },
      revenueByStage: {},
      leadsOverTime: [],
      topTechnicians: [],
      tagDistribution: {},
      conversionRate: 0,
      averageLeadValue: leadIds.length > 0 ? totalRevenue / leadIds.length : 0,
      paymentMethodStats,
      totalInLucru,
      noDealLeads: await calculateNoDealLeads(),
      averageTimeByStage,
      totalTimeByStage
    }
  } catch (error) {
    const errorMessage = error instanceof Error 
      ? error.message 
      : (error && typeof error === 'object' && 'message' in error)
        ? String((error as any).message)
        : JSON.stringify(error)
    console.error('Error calculating Vanzari metrics:', errorMessage, error)
    return emptyMetrics
  }
}
