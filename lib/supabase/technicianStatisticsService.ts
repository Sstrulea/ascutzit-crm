import { supabaseBrowser } from './supabaseClient'
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

const supabase = supabaseBrowser()

export class TechnicianStatisticsService {
  private cache = new Map<string, { data: any; timestamp: number }>()
  private CACHE_TTL_MS = 5 * 60 * 1000 // 5 minute

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
        sharedTraysCount: splitTrays.reduce((acc, split) => acc + split.splitTrays.length, 0),
        
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
    const { data: member, error } = await supabase
      .from('app_members')
      .select('name, email')
      .eq('user_id', technicianId)
      .single()

    if (error) {
      // Fallback la auth.users
      const { data: user } = await supabase.auth.getUser()
      return {
        name: user.user?.email?.split('@')[0] || `Tehnician ${technicianId.slice(0, 8)}`,
        email: user.user?.email
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
    // Folosește work_sessions ca sursă principală pentru timpul real
    const { data: workSessions, error } = await supabase
      .from('work_sessions')
      .select('*')
      .eq('technician_id', technicianId)
      .order('started_at', { ascending: true })

    if (error) {
      console.warn('No work sessions found, using fallback calculation')
      return this.calculateWorkTimeFallback(technicianId, filter)
    }

    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const weekStart = this.getWeekStart(now)
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

    let total = 0
    let today = 0
    let week = 0
    let month = 0
    const perTrayMap = new Map<string, WorkTimePerTray>()

    for (const session of workSessions) {
      const startTime = new Date(session.started_at)
      const endTime = session.finished_at ? new Date(session.finished_at) : now
      const duration = Math.max(0, (endTime.getTime() - startTime.getTime()) / (1000 * 60)) // în minute

      // Adaugă la totaluri
      total += duration
      if (startTime >= todayStart) today += duration
      if (startTime >= weekStart) week += duration
      if (startTime >= monthStart) month += duration

      // Grupează per tăviță
      if (session.tray_id) {
        const trayId = session.tray_id
        if (!perTrayMap.has(trayId)) {
          perTrayMap.set(trayId, {
            trayId,
            trayNumber: '', // Va fi populat mai târziu
            workTime: 0,
            workStart: startTime,
            workEnd: endTime,
            workSessions: []
          })
        }
        
        const trayWork = perTrayMap.get(trayId)!
        trayWork.workTime += duration
        trayWork.workStart = new Date(Math.min(trayWork.workStart.getTime(), startTime.getTime()))
        trayWork.workEnd = new Date(Math.max(trayWork.workEnd?.getTime() || 0, endTime.getTime()))
        trayWork.workSessions.push({
          sessionId: session.id,
          startTime,
          endTime,
          duration,
          notes: session.notes || undefined
        })
      }
    }

    // Obține numerele tăvițelor
    const trayIds = Array.from(perTrayMap.keys())
    if (trayIds.length > 0) {
      const { data: trays } = await supabase
        .from('trays')
        .select('id, number')
        .in('id', trayIds)

      for (const tray of trays || []) {
        const trayWork = perTrayMap.get(tray.id)
        if (trayWork) {
          trayWork.trayNumber = tray.number
        }
      }
    }

    const perTray = Array.from(perTrayMap.values())

    return { total, today, week, month, perTray }
  }

  /**
   * Fallback pentru calcul timp de lucru (când nu există work_sessions)
   */
  private async calculateWorkTimeFallback(
    technicianId: string,
    filter?: TechnicianStatsFilter
  ): Promise<{
    total: number
    today: number
    week: number
    month: number
    perTray: WorkTimePerTray[]
  }> {
    // Folosește stage_history pentru a estima timpul
    // Aceasta este o aproximare și ar trebui înlocuită cu work_sessions când este posibil
    const { data: stageHistory, error } = await supabase
      .from('stage_history')
      .select('*')
      .eq('technician_id', technicianId)
      .order('moved_at', { ascending: true })

    if (error) {
      return { total: 0, today: 0, week: 0, month: 0, perTray: [] }
    }

    // Implementare simplificată - în producție ar trebui să folosească work_sessions
    return { total: 0, today: 0, week: 0, month: 0, perTray: [] }
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
    // Obține toate tray_items pentru tehnician
    const { data: trayItems, error } = await supabase
      .from('tray_items')
      .select(`
        id,
        tray_id,
        qty,
        notes,
        service_id,
        part_id,
        technician_id,
        created_at,
        service:services(price),
        part:parts(price)
      `)
      .eq('technician_id', technicianId)

    if (error || !trayItems) {
      return { total: 0, today: 0, week: 0, month: 0 }
    }

    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const weekStart = this.getWeekStart(now)
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

    let total = 0
    let today = 0
    let week = 0
    let month = 0

    for (const item of trayItems) {
      const createdAt = new Date(item.created_at)
      
      // Parse notes pentru preț explicit
      let explicitPrice = 0
      if (item.notes) {
        try {
          const notes = JSON.parse(item.notes)
          if (notes.price && typeof notes.price === 'number') {
            explicitPrice = notes.price
          }
        } catch {
          // Ignoră erorile de parsing
        }
      }

      // Determină prețul
      let price = 0
      if (explicitPrice > 0) {
        price = explicitPrice
      } else if (item.service_id && item.service) {
        price = (item.service as any).price || 0
      } else if (item.part_id && item.part) {
        price = (item.part as any).price || 0
      }

      const quantity = item.qty || 1
      const itemTotal = price * quantity

      total += itemTotal
      if (createdAt >= todayStart) today += itemTotal
      if (createdAt >= weekStart) week += itemTotal
      if (createdAt >= monthStart) month += itemTotal
    }

    return { total, today, week, month }
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
    // Obține toate tăvițele unde tehnicianul a lucrat
    const { data: trays, error } = await supabase
      .from('trays')
      .select(`
        id,
        number,
        service_file_id,
        technician_id,
        technician2_id,
        technician3_id,
        status,
        parent_tray_id,
        created_at,
        updated_at,
        service_files!inner(
          id,
          lead_id,
          leads!inner(
            id,
            full_name,
            company_name
          )
        )
      `)
      .or(`technician_id.eq.${technicianId},technician2_id.eq.${technicianId},technician3_id.eq.${technicianId}`)

    if (error || !trays) {
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

    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const weekStart = this.getWeekStart(now)
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

    const processedTrays: TrayProcessed[] = []
    let totalCount = 0
    let todayCount = 0
    let weekCount = 0
    let monthCount = 0
    let totalEstimatedTime = 0
    let todayEstimatedTime = 0
    let weekEstimatedTime = 0
    let monthEstimatedTime = 0
    let totalInstruments = 0
    let todayInstruments = 0
    let weekInstruments = 0
    let monthInstruments = 0

    // Pentru fiecare tăviță, calculează statisticile
    for (const tray of trays) {
      const createdAt = new Date(tray.created_at)
      const updatedAt = new Date(tray.updated_at)
      
      // Determină tehnicienii
      const technicians: string[] = []
      if (tray.technician_id) technicians.push(tray.technician_id)
      if (tray.technician2_id) technicians.push(tray.technician2_id)
      if (tray.technician3_id) technicians.push(tray.technician3_id)

      // Obține item-urile tăviței pentru calcul timp estimat și instrumente
      const { data: trayItems } = await supabase
        .from('tray_items')
        .select(`
          id,
          qty,
          service_id,
          part_id,
          instrument_id,
          service:services(time)
        `)
        .eq('tray_id', tray.id)

      // Calculează timpul estimat
      let estimatedTime = 0
      let instrumentsCount = 0
      if (trayItems) {
        for (const item of trayItems) {
          // Timp estimat din servicii
          if (item.service_id && item.service) {
            const timeStr = (item.service as any).time
            if (timeStr) {
              // Parsează timpul (ex: "30 min", "1h30", "00:30:00")
              estimatedTime += this.parseTimeToMinutes(timeStr) * (item.qty || 1)
            }
          }
          
          // Numără instrumentele
          if (item.instrument_id) {
            instrumentsCount += item.qty || 1
          }
        }
      }

      // Determină status-ul
      let status: TrayProcessed['status'] = 'completed'
      if (tray.status === 'Splited') {
        status = 'split'
      } else if (tray.status === 'In progress') {
        status = 'in_progress'
      } else if (tray.status === 'Waiting') {
        status = 'waiting'
      }

      // Client info
      const serviceFile = tray.service_files?.[0]
      const lead = serviceFile?.leads?.[0]
      const clientName = lead?.full_name || lead?.company_name || null

      // Creează obiectul TrayProcessed
      const processedTray: TrayProcessed = {
        trayId: tray.id,
        trayNumber: tray.number,
        serviceFileId: tray.service_file_id,
        leadId: serviceFile?.lead_id || null,
        clientName,
        startDate: createdAt,
        endDate: status === 'completed' ? updatedAt : null,
        workTime: 0, // Va fi populat din work_sessions
        waitingTime: 0, // Va fi populat din waiting time
        estimatedTime,
        actualAmount: 0, // Va fi calculat din earnings
        status,
        technicians,
        splitFrom: tray.parent_tray_id || undefined,
        mergedTo: undefined // Va fi populat dacă tăvița a fost reunită
      }

      // Adaugă la listă
      processedTrays.push(processedTray)

      // Actualizează contoarele
      totalCount++
      totalEstimatedTime += estimatedTime
      totalInstruments += instrumentsCount

      if (createdAt >= todayStart) {
        todayCount++
        todayEstimatedTime += estimatedTime
        todayInstruments += instrumentsCount
      }
      if (createdAt >= weekStart) {
        weekCount++
        weekEstimatedTime += estimatedTime
        weekInstruments += instrumentsCount
      }
      if (createdAt >= monthStart) {
        monthCount++
        monthEstimatedTime += estimatedTime
        monthInstruments += instrumentsCount
      }
    }

    return {
      trays: processedTrays,
      totalCount,
      todayCount,
      weekCount,
      monthCount,
      totalEstimatedTime,
      todayEstimatedTime,
      weekEstimatedTime,
      monthEstimatedTime,
      totalInstruments,
      todayInstruments,
      weekInstruments,
      monthInstruments
    }
  }

  /**
   * Obține informații despre tăvițele split
   */
  private async getSplitTraysInfo(
    technicianId: string,
    filter?: TechnicianStatsFilter
  ): Promise<SplitTrayInfo[]> {
    // Obține tăvițele split unde tehnicianul este implicat
    const { data: splitTrays, error } = await supabase
      .from('trays')
      .select(`
        id,
        number,
        parent_tray_id,
        created_at,
        technician_id,
        technician2_id,
        technician3_id
      `)
      .not('parent_tray_id', 'is', null)
      .or(`technician_id.eq.${technicianId},technician2_id.eq.${technicianId},technician3_id.eq.${technicianId}`)

    if (error || !splitTrays) {
      return []
    }

    // Grupează după parent_tray_id
    const splitByParent = new Map<string, SplitTrayInfo>()

    for (const tray of splitTrays) {
      const parentId = tray.parent_tray_id
      if (!parentId) continue

      if (!splitByParent.has(parentId)) {
        // Obține informații despre tăvița originală
        const { data: parentTray } = await supabase
          .from('trays')
          .select('number')
          .eq('id', parentId)
          .single()

        splitByParent.set(parentId, {
          originalTrayId: parentId,
          originalTrayNumber: parentTray?.number || 'Necunoscut',
          splitTrays: [],
          splitDate: new Date(tray.created_at),
          splitBy: '' // Va fi populat din stage_history sau items_events
        })
      }

      const splitInfo = splitByParent.get(parentId)!
      splitInfo.splitTrays.push({
        trayId: tray.id,
        trayNumber: tray.number,
        technicianId,
        technicianName: '', // Va fi populat mai târziu
        splitDate: new Date(tray.created_at),
        itemsCount: 0, // Va fi calculat
        estimatedTime: 0, // Va fi calculat
        actualTime: 0 // Va fi calculat din work_sessions
      })
    }

    // Populează numele tehnicienilor
    for (const splitInfo of splitByParent.values()) {
      for (const splitTray of splitInfo.splitTrays) {
        const technician = await this.getTechnicianDetails(splitTray.technicianId)
        splitTray.technicianName = technician.name
      }
    }

    return Array.from(splitByParent.values())
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
    // Folosește stage_history pentru a identifica perioadele în așteptare
    const { data: stageHistory, error } = await supabase
      .from('stage_history')
      .select('*')
      .eq('technician_id', technicianId)
      .in('to_stage_id', await this.getWaitingStageIds())
      .order('moved_at', { ascending: true })

    if (error || !stageHistory) {
      return { total: 0, today: 0, week: 0, month: 0, perTray: [] }
    }

    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const weekStart = this.getWeekStart(now)
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

    let total = 0
    let today = 0
    let week = 0
    let month = 0
    const perTrayMap = new Map<string, WaitingTimePerTray>()

    // Procesează stage_history pentru a calcula timpul în așteptare
    for (let i = 0; i < stageHistory.length; i++) {
      const entry = stageHistory[i]
      const trayId = entry.tray_id
      const movedAt = new Date(entry.moved_at)
      
      if (!trayId) continue

      // Caută următoarea intrare pentru aceeași tăviță
      let waitingEnd: Date | null = null
      for (let j = i + 1; j < stageHistory.length; j++) {
        const nextEntry = stageHistory[j]
        if (nextEntry.tray_id === trayId) {
          waitingEnd = new Date(nextEntry.moved_at)
          break
        }
      }

      // Dacă nu există următoarea intrare, tăvița este încă în așteptare
      if (!waitingEnd) {
        waitingEnd = now
      }

      const waitingDuration = Math.max(0, (waitingEnd.getTime() - movedAt.getTime()) / (1000 * 60))

      // Adaugă la totaluri
      total += waitingDuration
      if (movedAt >= todayStart) today += waitingDuration
      if (movedAt >= weekStart) week += waitingDuration
      if (movedAt >= monthStart) month += waitingDuration

      // Grupează per tăviță
      if (!perTrayMap.has(trayId)) {
        perTrayMap.set(trayId, {
          trayId,
          trayNumber: '',
          waitingTime: 0,
          waitingStart: movedAt,
          waitingEnd,
          reason: entry.reason || undefined
        })
      }

      const trayWaiting = perTrayMap.get(trayId)!
      trayWaiting.waitingTime += waitingDuration
      trayWaiting.waitingStart = new Date(Math.min(trayWaiting.waitingStart.getTime(), movedAt.getTime()))
      trayWaiting.waitingEnd = new Date(Math.max(trayWaiting.waitingEnd?.getTime() || 0, waitingEnd.getTime()))
    }

    // Obține numerele tăvițelor
    const trayIds = Array.from(perTrayMap.keys())
    if (trayIds.length > 0) {
      const { data: trays } = await supabase
        .from('trays')
        .select('id, number')
        .in('id', trayIds)

      for (const tray of trays || []) {
        const trayWaiting = perTrayMap.get(tray.id)
        if (trayWaiting) {
          trayWaiting.trayNumber = tray.number
        }
      }
    }

    const perTray = Array.from(perTrayMap.values())

    return { total, today, week, month, perTray }
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
    // Obține datele pentru calcul eficiență
    const [workTimeStats, waitingTimeStats, traysStats] = await Promise.all([
      this.calculateWorkTime(technicianId, filter),
      this.calculateWaitingTime(technicianId, filter),
      this.getTraysProcessed(technicianId, filter)
    ])

    // Calculează eficiența: (Timp estimat / Timp real) × 100%
    const totalEstimatedTime = traysStats.totalEstimatedTime
    const totalActualTime = workTimeStats.total
    const efficiency = totalActualTime > 0 ? (totalEstimatedTime / totalActualTime) * 100 : 0

    // Calculează rata de utilizare: (Timp lucru / (Timp lucru + Timp așteptare)) × 100%
    const totalWorkTime = workTimeStats.total
    const totalWaitingTime = waitingTimeStats.total
    const totalAvailableTime = totalWorkTime + totalWaitingTime
    const utilizationRate = totalAvailableTime > 0 ? (totalWorkTime / totalAvailableTime) * 100 : 0

    // Creează metricile zilnice
    const metrics: EfficiencyMetrics[] = []
    // Implementare simplificată - în producție ar trebui să grupeze pe zile

    return {
      efficiency,
      utilizationRate,
      metrics
    }
  }

  /**
   * Calculează media timpului pe serviciu
   */
  private calculateAverageTimePerService(trays: TrayProcessed[]): number {
    if (trays.length === 0) return 0

    const totalWorkTime = trays.reduce((sum, tray) => sum + tray.workTime, 0)
    const totalServices = trays.reduce((sum, tray) => {
      // Numără serviciile din tăviță (simplificat)
      return sum + 1 // În producție ar trebui să numere serviciile reale
    }, 0)

    return totalServices > 0 ? totalWorkTime / totalServices : 0
  }

  /**
   * Parsează un string de timp în minute
   */
  private parseTimeToMinutes(timeStr: string): number {
    if (!timeStr) return 0

    // Încearcă formatul "HH:MM:SS"
    const timeParts = timeStr.split(':')
    if (timeParts.length === 3) {
      const hours = parseInt(timeParts[0]) || 0
      const minutes = parseInt(timeParts[1]) || 0
      const seconds = parseInt(timeParts[2]) || 0
      return hours * 60 + minutes + seconds / 60
    }

    // Încearcă formatul "XhYm" sau "X h Y min"
    const hourMatch = timeStr.match(/(\d+)\s*h/i)
    const minuteMatch = timeStr.match(/(\d+)\s*min/i)
    
    const hours = hourMatch ? parseInt(hourMatch[1]) : 0
    const minutes = minuteMatch ? parseInt(minuteMatch[1]) : 0
    
    return hours * 60 + minutes
  }

  /**
   * Obține începutul săptămânii (luni)
   */
  private getWeekStart(date: Date): Date {
    const d = new Date(date)
    const day = d.getDay()
    const diff = d.getDate() - day + (day === 0 ? -6 : 1) // Ajustează pentru duminică
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

    // Obține stage-urile "În așteptare" din toate pipeline-urile
    const { data: stages, error } = await supabase
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
    const assignments: DailyAssignment[] = []
    
    // Iterează prin fiecare zi din interval
    const currentDate = new Date(startDate)
    currentDate.setHours(0, 0, 0, 0)
    
    while (currentDate <= endDate) {
      const dayStart = new Date(currentDate)
      const dayEnd = new Date(currentDate)
      dayEnd.setHours(23, 59, 59, 999)
      
      // Obține tăvițele pentru această zi
      const filter: TechnicianStatsFilter = {
        dateRange: { start: dayStart, end: dayEnd }
      }
      
      const [workTimeStats, earningsStats, traysStats] = await Promise.all([
        this.calculateWorkTime(technicianId, filter),
        this.calculateEarnings(technicianId, filter),
        this.getTraysProcessed(technicianId, filter)
      ])
      
      // Separa tăvițele după status
      const traysStarted = traysStats.trays.filter(tray => {
        const startDate = new Date(tray.startDate)
        return startDate >= dayStart && startDate <= dayEnd
      })
      
      const traysCompleted = traysStats.trays.filter(tray => {
        return tray.status === 'completed' && tray.endDate && 
               tray.endDate >= dayStart && tray.endDate <= dayEnd
      })
      
      const traysInProgress = traysStats.trays.filter(tray => {
        return tray.status === 'in_progress' || 
               (tray.status === 'waiting' && tray.startDate <= dayEnd)
      })
      
      assignments.push({
        date: new Date(currentDate),
        technicianId,
        traysStarted,
        traysCompleted,
        traysInProgress,
        totalWorkTime: workTimeStats.total,
        totalWaitingTime: 0, // Va fi calculat din waiting time
        revenue: earningsStats.total
      })
      
      // Trece la următoarea zi
      currentDate.setDate(currentDate.getDate() + 1)
    }
    
    return assignments
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
