import { createClient } from '@supabase/supabase-js'
import type {
  TechnicianStatistics,
  TrayProcessed,
  SplitTrayInfo,
  WaitingTimePerTray,
  WorkTimePerTray,
  TechnicianStatsFilter,
  EfficiencyMetrics,
  DailyAssignment
} from './technicianStatisticsTypes'

export class TechnicianStatisticsServiceServer {
  private supabase: ReturnType<typeof createClient>
  private cache = new Map<string, { data: any; timestamp: number }>()
  private CACHE_TTL_MS = 5 * 60 * 1000 // 5 minute

  constructor(supabase: ReturnType<typeof createClient>) {
    this.supabase = supabase
  }

  /**
   * Obține statistici complete pentru un tehnician
   */
  async getTechnicianStatistics(
    technicianId: string,
    filter?: TechnicianStatsFilter
  ): Promise<TechnicianStatistics> {
    const cacheKey = `technician:${technicianId}:${JSON.stringify(filter || {})}`
    const cached = this.cache.get(cacheKey)
    
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL_MS) {
      return cached.data
    }

    try {
      // Obține datele de bază ale tehnicianului
      const technician = await this.getTechnicianDetails(technicianId)
      
      // Calculează statisticile în paralel pentru performanță
      const [
        workTimeStats,
        earningsStats,
        traysStats,
        splitTrays,
        waitingTimeStats,
        efficiencyMetrics
      ] = await Promise.all([
        this.calculateWorkTime(technicianId, filter),
        this.calculateEarnings(technicianId, filter),
        this.getTraysProcessed(technicianId, filter),
        this.getSplitTraysInfo(technicianId, filter),
        this.calculateWaitingTime(technicianId, filter),
        this.calculateEfficiencyMetrics(technicianId, filter)
      ])

      // Calculează statistici agregate
      const statistics: TechnicianStatistics = {
        technicianId,
        technicianName: technician.name,
        
        // Timp lucru
        workTimeTotal: workTimeStats.total,
        workTimeToday: workTimeStats.today,
        workTimeWeek: workTimeStats.week,
        workTimeMonth: workTimeStats.month,
        
        // Timp estimat
        estimatedTimeTotal: traysStats.totalEstimatedTime,
        estimatedTimeToday: traysStats.todayEstimatedTime,
        estimatedTimeWeek: traysStats.weekEstimatedTime,
        estimatedTimeMonth: traysStats.monthEstimatedTime,
        
        // Suma servicii prestate
        earningsTotal: earningsStats.total,
        earningsToday: earningsStats.today,
        earningsWeek: earningsStats.week,
        earningsMonth: earningsStats.month,
        
        // Număr instrumente
        instrumentsCount: traysStats.totalInstruments,
        instrumentsToday: traysStats.todayInstruments,
        instrumentsWeek: traysStats.weekInstruments,
        instrumentsMonth: traysStats.monthInstruments,
        
        // Media timp cheltuit
        averageTimePerService: this.calculateAverageTimePerService(traysStats.trays),
        efficiencyRate: efficiencyMetrics.efficiency,
        
        // Tăvițe prelucrate
        traysProcessed: traysStats.trays,
        traysCount: traysStats.totalCount,
        traysToday: traysStats.todayCount,
        traysWeek: traysStats.weekCount,
        traysMonth: traysStats.monthCount,
        
        // Împărțire tăvițe
        splitTrays,
        sharedTraysCount: splitTrays.reduce((acc: number, split) => acc + split.splitTrays.length, 0),
        
        // Timp în așteptare
        waitingTimeTotal: waitingTimeStats.total,
        waitingTimeToday: waitingTimeStats.today,
        waitingTimeWeek: waitingTimeStats.week,
        waitingTimeMonth: waitingTimeStats.month,
        
        // Timp în așteptare per tăviță
        waitingTimePerTray: waitingTimeStats.perTray,
        
        // Timp lucru per tăviță
        workTimePerTray: workTimeStats.perTray,
        
        // Suma tăviță
        trayTotalAmount: earningsStats.total,
        
        // Număr instrumente tăviță
        trayInstrumentsCount: traysStats.totalInstruments,
        
        // Date pentru editare
        isEditable: true,
        lastUpdated: new Date()
      }

      // Cache rezultatul
      this.cache.set(cacheKey, { data: statistics, timestamp: Date.now() })
      
      return statistics
    } catch (error) {
      console.error('Error calculating technician statistics:', error)
      throw new Error(`Failed to calculate statistics: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Obține detalii despre tehnician
   */
  private async getTechnicianDetails(technicianId: string): Promise<{ name: string; email?: string }> {
    const { data: member, error } = await this.supabase
      .from('app_members')
      .select('name, email')
      .eq('user_id', technicianId)
      .single()

    if (error) {
      // Fallback când tehnicianul nu e în app_members – nu apelăm auth
      return {
        name: `Tehnician ${technicianId.slice(0, 8)}`,
        email: null
      }
    }

    return {
      name: member.name || `Tehnician ${technicianId.slice(0, 8)}`,
      email: member.email
    }
  }

  /**
   * Calculează timpul de lucru
   */
  private async calculateWorkTime(
    technicianId: string,
    filter?: TechnicianStatsFilter
  ): Promise<{
    total: number
    today: number
    week: number
    month: number
    perTray: WorkTimePerTray[]
  }> {
    // Implementare simplificată pentru server-side
    // În producție, ar trebui să folosească work_sessions sau stage_history
    
    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const weekStart = this.getWeekStart(now)
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

    // Pentru demo, returnăm valori zero
    return {
      total: 0,
      today: 0,
      week: 0,
      month: 0,
      perTray: []
    }
  }

  /**
   * Calculează veniturile
   */
  private async calculateEarnings(
    technicianId: string,
    filter?: TechnicianStatsFilter
  ): Promise<{
    total: number
    today: number
    week: number
    month: number
  }> {
    // Implementare simplificată pentru server-side
    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const weekStart = this.getWeekStart(now)
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

    return { total: 0, today: 0, week: 0, month: 0 }
  }

  /**
   * Obține tăvițele prelucrate
   */
  private async getTraysProcessed(
    technicianId: string,
    filter?: TechnicianStatsFilter
  ): Promise<{
    trays: TrayProcessed[]
    totalCount: number
    todayCount: number
    weekCount: number
    monthCount: number
    totalEstimatedTime: number
    todayEstimatedTime: number
    weekEstimatedTime: number
    monthEstimatedTime: number
    totalInstruments: number
    todayInstruments: number
    weekInstruments: number
    monthInstruments: number
  }> {
    // Implementare simplificată pentru server-side
    return {
      trays: [],
      totalCount: 0,
      todayCount: 0,
      weekCount: 0,
      monthCount: 0,
      totalEstimatedTime: 0,
      todayEstimatedTime: 0,
      weekEstimatedTime: 0,
      monthEstimatedTime: 0,
      totalInstruments: 0,
      todayInstruments: 0,
      weekInstruments: 0,
      monthInstruments: 0
    }
  }

  /**
   * Obține informații despre tăvițele split
   */
  private async getSplitTraysInfo(
    technicianId: string,
    filter?: TechnicianStatsFilter
  ): Promise<SplitTrayInfo[]> {
    // Implementare simplificată pentru server-side
    return []
  }

  /**
   * Calculează timpul în așteptare
   */
  private async calculateWaitingTime(
    technicianId: string,
    filter?: TechnicianStatsFilter
  ): Promise<{
    total: number
    today: number
    week: number
    month: number
    perTray: WaitingTimePerTray[]
  }> {
    // Implementare simplificată pentru server-side
    return { total: 0, today: 0, week: 0, month: 0, perTray: [] }
  }

  /**
   * Calculează metricile de eficiență
   */
  private async calculateEfficiencyMetrics(
    technicianId: string,
    filter?: TechnicianStatsFilter
  ): Promise<{
    efficiency: number
    utilizationRate: number
    metrics: EfficiencyMetrics[]
  }> {
    // Implementare simplificată pentru server-side
    return {
      efficiency: 0,
      utilizationRate: 0,
      metrics: []
    }
  }

  /**
   * Calculează media timpului pe serviciu
   */
  private calculateAverageTimePerService(trays: TrayProcessed[]): number {
    if (trays.length === 0) return 0
    return 0 // Implementare simplificată
  }

  /**
   * Parsează un string de timp în minute
   */
  private parseTimeToMinutes(timeStr: string): number {
    if (!timeStr) return 0
    return 0 // Implementare simplificată
  }

  /**
   * Obține începutul săptămânii (luni)
   */
  private getWeekStart(date: Date): Date {
    const d = new Date(date)
    const day = d.getDay()
    const diff = d.getDate() - day + (day === 0 ? -6 : 1)
    d.setDate(diff)
    d.setHours(0, 0, 0, 0)
    return d
  }

  /**
   * Obține ID-urile stage-urilor de așteptare
   */
  private async getWaitingStageIds(): Promise<string[]> {
    // Cache pentru stage IDs
    const cacheKey = 'waiting_stage_ids'
    const cached = this.cache.get(cacheKey)
    
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL_MS) {
      return cached.data
    }

    const { data: stages, error } = await this.supabase
      .from('stages')
      .select('id')
      .ilike('name', '%așteptare%')

    if (error || !stages) {
      return []
    }

    const stageIds = stages.map(stage => stage.id)
    this.cache.set(cacheKey, { data: stageIds, timestamp: Date.now() })
    
    return stageIds
  }

  /**
   * Obține atribuirile zilnice corecte
   */
  async getDailyAssignments(
    technicianId: string,
    startDate: Date,
    endDate: Date
  ): Promise<DailyAssignment[]> {
    // Implementare simplificată pentru server-side
    return []
  }

  /**
   * Șterge cache-ul pentru un tehnician specific
   */
  clearCacheForTechnician(technicianId: string): void {
    const keysToDelete: string[] = []
    for (const key of this.cache.keys()) {
      if (key.startsWith(`technician:${technicianId}`)) {
        keysToDelete.push(key)
      }
    }
    
    for (const key of keysToDelete) {
      this.cache.delete(key)
    }
  }

  /**
   * Șterge întregul cache
   */
  clearAllCache(): void {
    this.cache.clear()
  }
}