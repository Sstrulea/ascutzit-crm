// Tipuri de date pentru statisticile tehnicienilor

export interface TechnicianStatistics {
  // Statistici de bază
  technicianId: string
  technicianName: string
  
  // Timp lucru
  workTimeTotal: number // în minute
  workTimeToday: number
  workTimeWeek: number
  workTimeMonth: number
  
  // Timp estimat
  estimatedTimeTotal: number // în minute
  estimatedTimeToday: number
  estimatedTimeWeek: number
  estimatedTimeMonth: number
  
  // Suma servicii prestate
  earningsTotal: number // în RON
  earningsToday: number
  earningsWeek: number
  earningsMonth: number
  
  // Număr instrumente
  instrumentsCount: number
  instrumentsToday: number
  instrumentsWeek: number
  instrumentsMonth: number
  
  // Media timp cheltuit pe prestarea serviciilor
  averageTimePerService: number // în minute
  efficiencyRate: number // (Timp estimat / Timp real) × 100%
  
  // Tăvițe prelucrate
  traysProcessed: TrayProcessed[]
  traysCount: number
  traysToday: number
  traysWeek: number
  traysMonth: number
  
  // Împărțire tăvițe
  splitTrays: SplitTrayInfo[]
  sharedTraysCount: number
  
  // Timp în așteptare
  waitingTimeTotal: number // în minute
  waitingTimeToday: number
  waitingTimeWeek: number
  waitingTimeMonth: number
  
  // Timp în așteptare per tăviță
  waitingTimePerTray: WaitingTimePerTray[]
  
  // Timp lucru per tăviță
  workTimePerTray: WorkTimePerTray[]
  
  // Suma tăviță
  trayTotalAmount: number // în RON
  
  // Număr instrumente tăviță
  trayInstrumentsCount: number
  
  // Client tăviță
  trayClientInfo?: ClientInfo
  
  // Fișă tăviță
  trayServiceFileInfo?: ServiceFileInfo
  
  // Date pentru editare de către admin
  isEditable: boolean
  lastUpdated: Date
  updatedBy?: string
}

export interface TrayProcessed {
  trayId: string
  trayNumber: string
  traySize: string | null
  serviceFileId: string | null
  leadId: string | null
  clientName: string | null
  startDate: Date
  endDate: Date | null
  workTime: number // în minute
  waitingTime: number // în minute
  estimatedTime: number // în minute
  actualAmount: number // în RON
  status: 'in_progress' | 'completed' | 'waiting' | 'split'
  technicians: string[] // Tehnicienii care au lucrat la tăviță
  splitFrom?: string // ID-ul tăviței originale dacă este split
  mergedTo?: string // ID-ul tăviței rezultate dacă a fost reunită
}

export interface SplitTrayInfo {
  originalTrayId: string
  originalTrayNumber: string
  splitTrays: {
    trayId: string
    trayNumber: string
    technicianId: string
    technicianName: string
    splitDate: Date
    itemsCount: number
    estimatedTime: number
    actualTime: number
  }[]
  splitDate: Date
  splitBy: string // ID-ul utilizatorului care a făcut split
}

export interface WaitingTimePerTray {
  trayId: string
  trayNumber: string
  waitingTime: number // în minute
  waitingStart: Date
  waitingEnd: Date | null
  reason?: string // Motivul așteptării
}

export interface WorkTimePerTray {
  trayId: string
  trayNumber: string
  workTime: number // în minute
  workStart: Date
  workEnd: Date | null
  workSessions: WorkSession[]
}

export interface WorkSession {
  sessionId: string
  startTime: Date
  endTime: Date | null
  duration: number // în minute
  notes?: string
}

export interface ClientInfo {
  clientId: string
  clientName: string
  companyName?: string
  phone?: string
  email?: string
}

export interface ServiceFileInfo {
  serviceFileId: string
  serviceFileNumber: string
  createdAt: Date
  status: string
  totalAmount: number
}

// Tipuri pentru filtre și query-uri
export interface TechnicianStatsFilter {
  technicianId?: string
  dateRange?: {
    start: Date
    end: Date
  }
  period?: 'today' | 'week' | 'month' | 'custom'
  includeSplitTrays?: boolean
  includeWaitingTime?: boolean
  groupBy?: 'day' | 'week' | 'month' | 'tray'
}

// Tipuri pentru editare de către admin
export interface EditableTechnicianStats {
  technicianId: string
  field: keyof TechnicianStatistics
  oldValue: any
  newValue: any
  editedBy: string
  editDate: Date
  reason?: string
}

// Tipuri pentru rapoarte manager/financiar
export interface ManagerDashboardStats {
  period: {
    start: Date
    end: Date
  }
  technicians: TechnicianStatistics[]
  totals: {
    totalWorkTime: number
    totalEarnings: number
    totalTrays: number
    averageEfficiency: number
    totalWaitingTime: number
  }
  trends: {
    dailyEfficiency: { date: string; efficiency: number }[]
    weeklyProductivity: { week: string; traysCompleted: number }[]
    monthlyRevenue: { month: string; revenue: number }[]
  }
}

export interface FinancialDashboardStats {
  period: {
    start: Date
    end: Date
  }
  revenueByTechnician: {
    technicianId: string
    technicianName: string
    revenue: number
    cost?: number
    profit?: number
  }[]
  revenueByTray: {
    trayId: string
    trayNumber: string
    revenue: number
    cost: number
    profit: number
    technicianNames: string[]
  }[]
  totals: {
    totalRevenue: number
    totalCost: number
    totalProfit: number
    averageProfitMargin: number
  }
}

// Tipuri pentru API responses
export interface TechnicianStatsResponse {
  success: boolean
  data?: TechnicianStatistics
  error?: string
  timestamp: Date
}

export interface ManagerStatsResponse {
  success: boolean
  data?: ManagerDashboardStats
  error?: string
  timestamp: Date
}

export interface FinancialStatsResponse {
  success: boolean
  data?: FinancialDashboardStats
  error?: string
  timestamp: Date
}

// Tipuri pentru calcul eficiență
export interface EfficiencyMetrics {
  technicianId: string
  technicianName: string
  date: Date
  estimatedTime: number
  actualTime: number
  efficiency: number // (estimated / actual) × 100
  traysCompleted: number
  revenueGenerated: number
  waitingTime: number
  utilizationRate: number // (workTime / (workTime + waitingTime)) × 100
}

// Tipuri pentru atribuire corectă pe zi
export interface DailyAssignment {
  date: Date
  technicianId: string
  traysStarted: TrayProcessed[]
  traysCompleted: TrayProcessed[]
  traysInProgress: TrayProcessed[]
  totalWorkTime: number
  totalWaitingTime: number
  revenue: number
}