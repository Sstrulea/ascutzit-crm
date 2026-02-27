'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  fetchTehnicianDashboardFull,
  getTehnicianMonthOptions,
  type TehnicianTrayStat,
  type TehnicianDashboardStats,
  type TehnicianDayStat,
  type TehnicianOption,
  type TehnicianTrayWork,
  type TehnicianInstrumentWork,
} from '@/lib/supabase/tehnicianDashboard'
import { useAuthContext } from '@/lib/contexts/AuthContext'
import { RefreshCw, Package, User, CalendarDays, Clock, ChevronDown, ChevronRight, Wrench, TrendingUp, Timer, Pause, Scissors, Sparkles, Building, Briefcase, Phone, StopCircle, Pencil } from 'lucide-react'
import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import { useIsMobile } from '@/hooks/use-mobile'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { format, isToday } from 'date-fns'
import { ro } from 'date-fns/locale'
import { useRouter } from 'next/navigation'
import { TRAY_SEARCH_OPEN_KEY, type TraySearchOpenPayload } from '@/components/search/SmartTraySearch'
import { cn } from '@/lib/utils'
import { finishWorkSession, getTrayWorkSessions, updateWorkSession, type WorkSession } from '@/lib/supabase/workSessionOperations'
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogHeader,
  DialogFooter,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'

/** Iconița pipeline-ului în care se află tăvița (Saloane, Frizerii, Horeca, Reparații, Receptie etc.). */
function PipelineIcon({ pipelineName }: { pipelineName?: string | null }) {
  const n = (pipelineName ?? '').toLowerCase()
  if (n.includes('receptie') || n.includes('reception')) return <Phone className="h-4 w-4 text-muted-foreground" />
  if (n.includes('frizeri') || n.includes('barber')) return <Scissors className="h-4 w-4 text-muted-foreground" />
  if (n.includes('saloane') || n.includes('salon')) return <Sparkles className="h-4 w-4 text-muted-foreground" />
  if (n.includes('horeca') || n.includes('corporate') || n.includes('business')) return <Building className="h-4 w-4 text-muted-foreground" />
  if (n.includes('reparati') || n.includes('service')) return <Wrench className="h-4 w-4 text-muted-foreground" />
  return <Briefcase className="h-4 w-4 text-muted-foreground" />
}

/** Afișare timp plăcută: ore și minute întregi (fără zecimale). */
function formatMinutesInLucru(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return '—'
  const totalM = Math.round(minutes)
  const h = Math.floor(totalM / 60)
  const m = totalM % 60
  if (h > 0 && m > 0) return `${h} h ${m} m`
  if (h > 0) return `${h} h`
  return `${m} m`
}

/** Ore:minute (ex. 6:30) pentru afișare compactă. */
function formatMinutesAsHoursMinutes(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes < 0) return '—'
  const totalM = Math.round(minutes)
  const h = Math.floor(totalM / 60)
  const m = totalM % 60
  return `${h}:${String(m).padStart(2, '0')}`
}

/** Convertește ore zecimale în format Hh Mm (ex. 6.5 -> "6h 30m"). */
function formatDecimalHoursAsHoursMinutes(decimalHours: number): string {
  if (!Number.isFinite(decimalHours) || decimalHours < 0) return '—'
  const hours = Math.floor(decimalHours)
  const minutes = Math.round((decimalHours - hours) * 60)
  if (hours > 0 && minutes > 0) return `${hours}h ${minutes}m`
  if (hours > 0) return `${hours}h`
  return `${minutes}m`
}

/** Afișare timp HH:MM:SS (secunde întregi, fără zecimale). */
function formatSecondsHms(seconds: number): string {
  const total = Math.max(0, Math.floor(Number(seconds) || 0))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

const ronFmt = new Intl.NumberFormat('ro-RO', {
  style: 'currency',
  currency: 'RON',
  maximumFractionDigits: 2,
})

function formatRon(value?: number | null): string {
  const v = Number(value ?? 0)
  if (!Number.isFinite(v) || v <= 0) return '—'
  return ronFmt.format(v)
}

type Period = 'day' | 'week' | 'month' | 'month-custom' | 'custom-range'

function getWeekBounds(): { start: Date; end: Date } {
  const end = new Date()
  end.setHours(23, 59, 59, 999)
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  const d = start.getDay()
  const diff = start.getDate() - d + (d === 0 ? -6 : 1)
  start.setDate(diff)
  return { start, end }
}

function getMonthBounds(): { start: Date; end: Date } {
  const end = new Date()
  end.setHours(23, 59, 59, 999)
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  start.setDate(1)
  return { start, end }
}

/** Ore lucru în perioadă: 6.5h/zi, 32.5h/săptămână (5 zile), ~143h/lună × 6.5h */
const HOURS_PER_DAY = 6.5
const WORKING_DAYS_PER_WEEK = 5
const WORKING_DAYS_PER_MONTH = 22

function getWorkingHoursForPeriod(
  period: Period,
  _selectedDate: Date,
  selectedMonthKey: string
): number {
  if (period === 'day') return HOURS_PER_DAY // 8 h
  if (period === 'week') return WORKING_DAYS_PER_WEEK * HOURS_PER_DAY // 40 h
  if (period === 'month') return WORKING_DAYS_PER_MONTH * HOURS_PER_DAY // 176 h
  if (period === 'month-custom' && selectedMonthKey) {
    const [y, m] = selectedMonthKey.split('-').map(Number)
    if (!y || !m) return WORKING_DAYS_PER_MONTH * HOURS_PER_DAY
    const lastDay = new Date(y, m, 0).getDate()
    const workingDays = Math.round(lastDay * (WORKING_DAYS_PER_MONTH / 30))
    return Math.min(31, workingDays) * HOURS_PER_DAY
  }
  return WORKING_DAYS_PER_MONTH * HOURS_PER_DAY
}

export default function DashboardTehnicianPage() {
  const router = useRouter()
  const isMobile = useIsMobile()
  const { profile, loading: authLoading, isAdmin, isOwner } = useAuthContext()
  const canSelectTechnician = isAdmin() || isOwner()
  const [expandedInstrumentRows, setExpandedInstrumentRows] = useState<Set<string>>(() => new Set())
  const [stats, setStats] = useState<TehnicianDashboardStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [period, setPeriod] = useState<Period>('day')
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date())
  const [selectedTechnicianId, setSelectedTechnicianId] = useState<string>('')
  const [customRangeStart, setCustomRangeStart] = useState<Date>(() => new Date())
  const [customRangeEnd, setCustomRangeEnd] = useState<Date>(() => new Date())
  const [technicianOptions, setTechnicianOptions] = useState<TehnicianOption[]>([])
  const [dayData, setDayData] = useState<{
    stats: TehnicianTrayStat[]
    total: number
    totalMinutesInLucru: number
    totalMinutesInAsteptare: number
    traysByTechnician?: Record<string, TehnicianTrayWork[]>
    instrumentWorkByTechnician?: Record<string, TehnicianInstrumentWork[]>
  } | null>(null)
  const [dayDataLoading, setDayDataLoading] = useState(false)
  const [monthOptions] = useState(() => getTehnicianMonthOptions(12))
  const [selectedMonthKey, setSelectedMonthKey] = useState<string>('')
  const [monthData, setMonthData] = useState<{ stats: TehnicianTrayStat[]; total: number; totalMinutesInLucru: number } | null>(null)
  const [monthDataLoading, setMonthDataLoading] = useState(false)
  const [byDayList, setByDayList] = useState<TehnicianDayStat[]>([])
  const [byDayLoading, setByDayLoading] = useState(false)
  const [expandedTechnicians, setExpandedTechnicians] = useState<Set<string>>(() => new Set())
  const pendingRestoreScrollYRef = useRef<number | null>(null)
  const [editSessionDialog, setEditSessionDialog] = useState<{
    open: boolean
    trayId: string | null
    technicianId: string | null
    technicianName: string
    trayNumber: string
    sessions: WorkSession[]
    loading: boolean
    saving: boolean
  }>({ open: false, trayId: null, technicianId: null, technicianName: '', trayNumber: '', sessions: [], loading: false, saving: false })
  const [editingSessionTimes, setEditingSessionTimes] = useState<Record<string, { started_at: string; finished_at: string | null }>>({})

  const DASHBOARD_UI_KEY = 'crm:dashboard-tehnician:ui:v1'

  // Restore UI state după revenire din altă pagină (ex. Vânzări → Close)
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(DASHBOARD_UI_KEY)
      if (!raw) return
      sessionStorage.removeItem(DASHBOARD_UI_KEY)
      const saved = JSON.parse(raw) as any
      if (saved?.period) setPeriod(saved.period)
      if (saved?.selectedDate) {
        const d = new Date(saved.selectedDate)
        if (Number.isFinite(d.getTime())) setSelectedDate(d)
      }
      if (typeof saved?.selectedTechnicianId === 'string') setSelectedTechnicianId(saved.selectedTechnicianId)
      if (Array.isArray(saved?.expandedTechnicians)) setExpandedTechnicians(new Set(saved.expandedTechnicians))
      if (Array.isArray(saved?.expandedInstrumentRows)) setExpandedInstrumentRows(new Set(saved.expandedInstrumentRows))
      if (typeof saved?.scrollY === 'number') pendingRestoreScrollYRef.current = saved.scrollY
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Aplică scroll după ce datele pe zi au fost încărcate (ca să nu sară)
  useEffect(() => {
    const y = pendingRestoreScrollYRef.current
    if (y == null) return
    if (period === 'day' && dayDataLoading) return
    pendingRestoreScrollYRef.current = null
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.scrollTo({ top: y, left: 0, behavior: 'instant' as any })
      })
    })
  }, [dayDataLoading, period])

  // Încărcare consolidată: un singur call returnează stats + tehnicieni + date per perioadă
  useEffect(() => {
    if (authLoading) return
    setLoading(true)
    setDayDataLoading(true)
    setMonthDataLoading(true)
    setByDayLoading(true)
    fetchTehnicianDashboardFull({
      period,
      selectedDate,
      selectedMonthKey,
      includeTechnicians: canSelectTechnician,
      customRangeStart: period === 'custom-range' ? customRangeStart : undefined,
      customRangeEnd: period === 'custom-range' ? customRangeEnd : undefined,
    })
      .then((res) => {
        setStats(res.stats)
        if (canSelectTechnician && Array.isArray(res.technicians)) setTechnicianOptions(res.technicians)
        setDayData(res.dayData)
        setMonthData(res.monthData)
        setByDayList(res.byDayList || [])
      })
      .catch((e) => {
        console.error(e)
        toast.error('Eroare la încărcarea datelor')
      })
      .finally(() => {
        setLoading(false)
        setDayDataLoading(false)
        setMonthDataLoading(false)
        setByDayLoading(false)
      })
  }, [authLoading, period, selectedDate?.toISOString(), selectedMonthKey, canSelectTechnician, customRangeStart, customRangeEnd])

  // Reset expand la schimbare perioadă / dată
  useEffect(() => {
    setExpandedTechnicians(new Set())
  }, [period, selectedDate?.toISOString(), selectedTechnicianId])


  useEffect(() => {
    if (!editSessionDialog.open || !editSessionDialog.trayId || !editSessionDialog.technicianId) return
    setEditSessionDialog((prev) => ({ ...prev, loading: true }))
    getTrayWorkSessions(editSessionDialog.trayId)
      .then(({ data }) => {
        const forTech = (data || []).filter((s) => s.technician_id === editSessionDialog.technicianId)
        const initial: Record<string, { started_at: string; finished_at: string }> = {}
        forTech.forEach((s) => {
          initial[s.id] = {
            started_at: s.started_at ? new Date(s.started_at).toISOString().slice(0, 16) : '',
            finished_at: s.finished_at ? new Date(s.finished_at).toISOString().slice(0, 16) : '',
          }
        })
        setEditingSessionTimes(initial)
        setEditSessionDialog((prev) => ({ ...prev, sessions: forTech, loading: false }))
      })
      .catch(() => setEditSessionDialog((prev) => ({ ...prev, sessions: [], loading: false })))
  }, [editSessionDialog.open, editSessionDialog.trayId, editSessionDialog.technicianId])


  const refreshDayData = useCallback(() => {
    setDayDataLoading(true)
    fetchTehnicianDashboardFull({
      period,
      selectedDate,
      selectedMonthKey,
      includeTechnicians: canSelectTechnician,
      forceRefresh: true,
      customRangeStart: period === 'custom-range' ? customRangeStart : undefined,
      customRangeEnd: period === 'custom-range' ? customRangeEnd : undefined,
    })
      .then((res) => {
        setStats(res.stats)
        setDayData(res.dayData)
        setMonthData(res.monthData)
        setByDayList(res.byDayList || [])
      })
      .catch(() => setDayData(null))
      .finally(() => setDayDataLoading(false))
  }, [period, selectedDate, selectedMonthKey, canSelectTechnician, customRangeStart, customRangeEnd])

  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      const res = await fetchTehnicianDashboardFull({
        period,
        selectedDate,
        selectedMonthKey,
        includeTechnicians: canSelectTechnician,
        forceRefresh: true,
        customRangeStart: period === 'custom-range' ? customRangeStart : undefined,
        customRangeEnd: period === 'custom-range' ? customRangeEnd : undefined,
      })
      setStats(res.stats)
      if (canSelectTechnician && Array.isArray(res.technicians)) setTechnicianOptions(res.technicians)
      setDayData(res.dayData)
      setMonthData(res.monthData)
      setByDayList(res.byDayList || [])
      toast.success('Date actualizate')
    } catch {
      toast.error('Eroare la actualizare')
    } finally {
      setRefreshing(false)
    }
  }

  const currentStats = (): { total: number; list: TehnicianTrayStat[] } => {
    if (period === 'day' && dayData) {
      return { total: dayData.total, list: dayData.stats }
    }
    if (period === 'month-custom' && monthData) {
      return { total: monthData.total, list: monthData.stats }
    }
    if (!stats) return { total: 0, list: [] }
    if (period === 'week') return { total: stats.totalWeek, list: stats.week }
    return { total: stats.totalMonth, list: stats.month }
  }

  const periodLabel =
    period === 'day'
      ? selectedDate && isToday(selectedDate)
        ? 'Azi'
        : selectedDate
          ? format(selectedDate, 'd MMM yyyy', { locale: ro })
          : 'Zi'
      : period === 'week'
        ? 'Săptămâna curentă'
        : period === 'month'
          ? 'Luna curentă'
          : 'Lună selectată'

  const rawStats = currentStats()
  const list = selectedTechnicianId
    ? rawStats.list.filter((r) => r.technicianId === selectedTechnicianId)
    : rawStats.list
  const total = selectedTechnicianId
    ? list.reduce((acc, r) => acc + r.count, 0)
    : rawStats.total
  
  // Suma totală în RON pentru perioada curentă
  const totalRonForPeriod = list.reduce((acc, r) => acc + (r.totalRon ?? 0), 0)
  
  const workingHours = getWorkingHoursForPeriod(period, selectedDate ?? new Date(), selectedMonthKey)
  const totalMinutesInLucruForPeriod =
    period === 'day' && dayData
      ? selectedTechnicianId && dayData.traysByTechnician?.[selectedTechnicianId]
        ? (dayData.traysByTechnician[selectedTechnicianId] as { minutesInLucru?: number }[]).reduce((acc, t) => acc + (t?.minutesInLucru ?? 0), 0)
        : (dayData.totalMinutesInLucru ?? 0)
      : period === 'month-custom' && monthData
        ? monthData.totalMinutesInLucru ?? 0
        : period === 'week' && stats
          ? stats.totalMinutesInLucruWeek ?? 0
          : period === 'month' && stats
            ? stats.totalMinutesInLucruMonth ?? 0
            : 0
  const totalMinutesInAsteptareForPeriod =
    period === 'day' && dayData
      ? dayData.totalMinutesInAsteptare ?? 0
      : 0
  const isLoading =
    loading ||
    (period === 'month-custom' && monthDataLoading) ||
    (period === 'day' && dayDataLoading)

  // ==================== MOBILE UI ====================
  if (isMobile) {
    return (
      <div className="flex-1 min-w-0 min-h-0 flex flex-col bg-background">
        {/* Header mobil */}
        <header className="border-b border-border px-4 py-3 flex items-center justify-between sticky top-0 bg-background z-10">
          <div>
            <h1 className="text-lg font-semibold">Dashboard</h1>
            <p className="text-xs text-muted-foreground">Statistici tehnician</p>
          </div>
          <Button variant="ghost" size="icon" onClick={handleRefresh} disabled={refreshing}>
            <RefreshCw className={refreshing ? 'h-5 w-5 animate-spin' : 'h-5 w-5'} />
          </Button>
        </header>

        <div className="flex-1 overflow-y-auto pb-20">
          {/* Filtre mobil */}
          <div className="p-4 space-y-3 border-b bg-muted/30">
            {/* Perioadă */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground w-20">Perioadă:</span>
              <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
                <SelectTrigger className="flex-1 h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="day">Azi</SelectItem>
                  <SelectItem value="week">Săptămâna</SelectItem>
                  <SelectItem value="month">Luna</SelectItem>
                  <SelectItem value="month-custom">Alege luna</SelectItem>
                  <SelectItem value="custom-range">Interval personalizat</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Data pentru "day" */}
            {period === 'day' && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground w-20">Data:</span>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="flex-1 h-10 justify-start">
                      <CalendarDays className="mr-2 h-4 w-4" />
                      {selectedDate ? format(selectedDate, 'd MMM yyyy', { locale: ro }) : 'Alege data'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={selectedDate}
                      onSelect={(d) => d && setSelectedDate(d)}
                      locale={ro}
                    />
                  </PopoverContent>
                </Popover>
              </div>
            )}

            {/* Luna pentru "month-custom" */}
            {period === 'month-custom' && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground w-20">Luna:</span>
                <Select value={selectedMonthKey} onValueChange={setSelectedMonthKey}>
                  <SelectTrigger className="flex-1 h-10">
                    <SelectValue placeholder="Alege luna" />
                  </SelectTrigger>
                  <SelectContent>
                    {monthOptions.map((m) => (
                      <SelectItem key={`${m.year}-${m.month}`} value={`${m.year}-${m.month}`}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Interval personalizat */}
            {period === 'custom-range' && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground w-20">De la:</span>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="flex-1 h-10 justify-start">
                        <CalendarDays className="mr-2 h-4 w-4" />
                        {customRangeStart ? format(customRangeStart, 'd MMM yyyy', { locale: ro }) : 'Alege data'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={customRangeStart}
                        onSelect={(d) => d && setCustomRangeStart(d)}
                        locale={ro}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground w-20">Până la:</span>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="flex-1 h-10 justify-start">
                        <CalendarDays className="mr-2 h-4 w-4" />
                        {customRangeEnd ? format(customRangeEnd, 'd MMM yyyy', { locale: ro }) : 'Alege data'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={customRangeEnd}
                        onSelect={(d) => d && setCustomRangeEnd(d)}
                        locale={ro}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
            )}

            {/* Selector tehnician (doar pentru admin/owner) */}
            {canSelectTechnician && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground w-20">Tehnician:</span>
                <Select value={selectedTechnicianId || 'all'} onValueChange={(v) => setSelectedTechnicianId(v === 'all' ? '' : v)}>
                  <SelectTrigger className="flex-1 h-10">
                    <SelectValue placeholder="Toți" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Toți tehnicienii</SelectItem>
                    {technicianOptions.map((t) => (
                      <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* Card-uri KPI */}
          <div className="p-4 space-y-4">
            {/* Total săptămână + lună (mereu vizibile când avem stats) */}
            {stats && (
              <div className="grid grid-cols-2 gap-2">
                <Card>
                  <CardContent className="p-3">
                    <p className="text-xs text-muted-foreground">Săpt. curentă</p>
                    <p className="text-lg font-bold">{stats.totalWeek}</p>
                    <p className="text-[10px] text-muted-foreground">{formatMinutesAsHoursMinutes(stats.totalMinutesInLucruWeek ?? 0)} ore</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-3">
                    <p className="text-xs text-muted-foreground">Luna curentă</p>
                    <p className="text-lg font-bold">{stats.totalMonth}</p>
                    <p className="text-[10px] text-muted-foreground">{formatMinutesAsHoursMinutes(stats.totalMinutesInLucruMonth ?? 0)} ore</p>
                  </CardContent>
                </Card>
              </div>
            )}
            {isLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-24 w-full" />
              </div>
            ) : (
              <>
                {/* Total tăvițe */}
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">{periodLabel}</p>
                        <p className="text-3xl font-bold">{total}</p>
                        <p className="text-xs text-muted-foreground">tăvițe prelucrate</p>
                      </div>
                      <div className="h-12 w-12 rounded-full bg-sky-100 dark:bg-sky-900/30 flex items-center justify-center">
                        <Package className="h-6 w-6 text-sky-600 dark:text-sky-400" />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Total RON */}
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">{periodLabel} - Total în RON</p>
                        <p className="text-3xl font-bold text-green-600 dark:text-green-400">{formatRon(totalRonForPeriod)}</p>
                        <p className="text-xs text-muted-foreground">valoare totală lucrări</p>
                      </div>
                      <div className="h-12 w-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                        <TrendingUp className="h-6 w-6 text-green-600 dark:text-green-400" />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Timp în lucru / așteptare */}
                <div className="grid grid-cols-2 gap-3">
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2 mb-1">
                        <Timer className="h-4 w-4 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">În lucru</span>
                      </div>
                      <p className="text-xl font-bold">{formatMinutesInLucru(totalMinutesInLucruForPeriod)}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2 mb-1">
                        <Pause className="h-4 w-4 text-orange-500" />
                        <span className="text-xs text-muted-foreground">În așteptare</span>
                      </div>
                      <p className="text-xl font-bold text-orange-500">{formatMinutesInLucru(totalMinutesInAsteptareForPeriod)}</p>
                    </CardContent>
                  </Card>
                </div>

                {/* Ore lucru (timp efectiv în lucru) */}
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Ore lucru</p>
                        <p className="text-2xl font-bold">{formatMinutesAsHoursMinutes(totalMinutesInLucruForPeriod)}</p>
                      </div>
                      <Clock className="h-8 w-8 text-muted-foreground/30" />
                    </div>
                  </CardContent>
                </Card>

                {/* Lista tehnicienilor */}
                {list.length > 0 && (
                  <div className="space-y-3">
                    <h2 className="text-sm font-medium text-muted-foreground px-1">Pe tehnician</h2>
                    <Accordion type="multiple" className="space-y-2">
                      {list.map((row) => {
                        const isDay = period === 'day'
                        const trayList = (dayData?.traysByTechnician?.[row.technicianId] || []).filter(
                          (t) => (t?.minutesInLucru ?? 0) > 0 || (t?.minutesInAsteptare ?? 0) > 0
                        )
                        const trayTotal = trayList.reduce((acc, t) => acc + (Number((t as any)?.trayTotalRon ?? (t as any)?.totalRon) || 0), 0)

                        return (
                          <AccordionItem key={row.technicianId} value={row.technicianId} className="border rounded-lg bg-card overflow-hidden">
                            <AccordionTrigger className="px-4 py-3 hover:no-underline">
                              <div className="flex-1 flex items-center gap-3">
                                <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                                  <User className="h-5 w-5 text-muted-foreground" />
                                </div>
                                <div className="flex-1 text-left">
                                  <p className="font-medium">{row.technicianName}</p>
                                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                    <span>{row.count} tăvițe</span>
                                    {isDay && trayList.length > 0 && (
                                      <Badge variant="secondary" className="text-[10px]">
                                        {trayList.length} active
                                      </Badge>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </AccordionTrigger>
                            <AccordionContent className="px-4 pb-4">
                              {/* Stats per tehnician */}
                              <div className="grid grid-cols-2 gap-2 mb-3">
                                <div className="rounded-md border bg-muted/30 p-2">
                                  <p className="text-[10px] text-muted-foreground">Timp lucru</p>
                                  <p className="text-sm font-medium">{formatMinutesInLucru(row.minutesInLucru ?? 0)}</p>
                                </div>
                                <div className="rounded-md border bg-orange-50 dark:bg-orange-900/20 p-2">
                                  <p className="text-[10px] text-muted-foreground">În așteptare</p>
                                  <p className="text-sm font-medium text-orange-600 dark:text-orange-400">{formatMinutesInLucru(row.minutesInAsteptare ?? 0)}</p>
                                </div>
                                <div className="rounded-md border bg-muted/30 p-2 col-span-2">
                                  <p className="text-[10px] text-muted-foreground">Total</p>
                                  <p className="text-sm font-medium">{isDay ? formatRon(row.totalRon ?? trayTotal) : '—'}</p>
                                </div>
                              </div>

                              {/* Lista tăvițelor (doar pentru "day") */}
                              {isDay && trayList.length > 0 && (
                                <div className="space-y-2">
                                  <p className="text-xs font-medium text-muted-foreground">Tăvițe:</p>
                                  {trayList.map((t) => (
                                    <div
                                      key={t.trayId}
                                      className="rounded-md border bg-background p-3 active:bg-muted/50"
                                      onClick={() => {
                                        if (t?.leadId) {
                                          const payload: TraySearchOpenPayload = {
                                            pipelineSlug: 'vanzari',
                                            openType: 'lead',
                                            openId: String(t.leadId),
                                            returnTo: '/dashboard/tehnician',
                                          }
                                          try {
                                            sessionStorage.setItem(TRAY_SEARCH_OPEN_KEY, JSON.stringify(payload))
                                          } catch {}
                                          router.push('/leads/vanzari')
                                        }
                                      }}
                                    >
                                      <div className="flex items-center justify-between mb-2">
                                        <div className="flex items-center gap-2">
                                          <PipelineIcon pipelineName={t.pipelineName} />
                                          <span className="font-medium text-sm">
                                            {t.trayNumber ? `#${t.trayNumber}` : 'Tăviță'}
                                          </span>
                                          {t.isInLucru && (
                                            <Badge variant="destructive" className="text-[10px] py-0">În lucru</Badge>
                                          )}
                                          {t.isInAsteptare && (
                                            <Badge className="text-[10px] py-0 bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400">În așteptare</Badge>
                                          )}
                                          {(t as any).isDeTrimis && (
                                            <Badge className="text-[10px] py-0 bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">De trimis</Badge>
                                          )}
                                          {(t as any).isReunita && (
                                            <Badge variant="secondary" className="text-[10px] py-0">Reunită</Badge>
                                          )}
                                        </div>
                                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                      </div>
                                      <div className="grid grid-cols-3 gap-2 text-xs">
                                        <div>
                                          <p className="text-muted-foreground">Client</p>
                                          <p className="font-medium truncate">{t.clientName || '—'}</p>
                                        </div>
                                        <div>
                                          <p className="text-muted-foreground">Fișă</p>
                                          <p className="font-medium">{t.serviceFileNumber || '—'}</p>
                                        </div>
                                        <div className="text-right">
                                          <p className="text-muted-foreground">Total</p>
                                          <p className={cn(
                                            "font-medium",
                                            (t.isInLucru || t.isInAsteptare) && "text-muted-foreground/50 line-through"
                                          )}>
                                            {formatRon((t as any)?.trayTotalRon ?? t.totalRon)}
                                          </p>
                                        </div>
                                      </div>
                                      <div className="flex items-center gap-4 mt-2 pt-2 border-t text-xs">
                                        <div className="flex items-center gap-1">
                                          <Timer className="h-3 w-3 text-muted-foreground" />
                                          <span>{formatMinutesInLucru(t.minutesInLucru ?? 0)}</span>
                                        </div>
                                        {isOwner() && (
                                          <div className="flex items-center gap-1 ml-auto" onClick={(e) => e.stopPropagation()}>
                                            <Button
                                              type="button"
                                              variant="ghost"
                                              size="sm"
                                              className="h-7 text-xs text-amber-600"
                                              onClick={async () => {
                                                if (!t?.trayId || !row?.technicianId) return
                                                const { error } = await finishWorkSession(t.trayId, row.technicianId)
                                                if (error) toast.error((error as Error)?.message || 'Eroare la oprirea timpului')
                                                else { toast.success('Timp oprit'); refreshDayData() }
                                              }}
                                            >
                                              <StopCircle className="h-3.5 w-3.5" /> Oprește
                                            </Button>
                                            <Button
                                              type="button"
                                              variant="ghost"
                                              size="sm"
                                              className="h-7 text-xs"
                                              onClick={() => setEditSessionDialog({
                                                open: true,
                                                trayId: t.trayId,
                                                technicianId: row.technicianId,
                                                technicianName: row.technicianName,
                                                trayNumber: t.trayNumber ? `#${t.trayNumber}` : 'Tăviță',
                                                sessions: [],
                                                loading: true,
                                                saving: false,
                                              })}
                                            >
                                              <Pencil className="h-3.5 w-3.5" /> Modifică
                                            </Button>
                                          </div>
                                        )}
                                        {(t.minutesInAsteptare ?? 0) > 0 && (
                                          <div className="flex items-center gap-1 text-orange-500">
                                            <Pause className="h-3 w-3" />
                                            <span>{formatMinutesInLucru(t.minutesInAsteptare ?? 0)}</span>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </AccordionContent>
                          </AccordionItem>
                        )
                      })}
                    </Accordion>
                  </div>
                )}

                {list.length === 0 && (
                  <Card>
                    <CardContent className="p-6 text-center">
                      <Wrench className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
                      <p className="text-sm text-muted-foreground">
                        Nicio tăviță prelucrată în perioada selectată.
                      </p>
                    </CardContent>
                  </Card>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ==================== DESKTOP UI ====================
  return (
    <div className="flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden">
      <header className="border-b border-border p-3 sm:p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 flex-shrink-0 sticky top-0 bg-background z-10">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-foreground">Tehnician</h1>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Tăvițe prelucrate (mutate în Finalizare) și tehnicieni cu tăvițe în lucru (Saloane / Frizerii / Horeca / Reparații)
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing}>
          <RefreshCw className={refreshing ? 'h-4 w-4 mr-2 animate-spin' : 'h-4 w-4 mr-2'} />
          Actualizează
        </Button>
      </header>

      <div className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6 space-y-4 sm:space-y-6">
        {/* Perioadă */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">Perioadă:</span>
          <Select
            value={period}
            onValueChange={(v) => setPeriod(v as Period)}
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="day">Azi</SelectItem>
              <SelectItem value="week">Săptămâna curentă</SelectItem>
              <SelectItem value="month">Luna curentă</SelectItem>
              <SelectItem value="month-custom">Lună (selectează)</SelectItem>
              <SelectItem value="custom-range">Interval personalizat</SelectItem>
            </SelectContent>
          </Select>
          {period === 'day' && (
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-[200px] justify-start text-left font-normal">
                  <CalendarDays className="mr-2 h-4 w-4" />
                  {selectedDate ? format(selectedDate, 'd MMM yyyy', { locale: ro }) : 'Alege data'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={(d) => d && setSelectedDate(d)}
                  locale={ro}
                />
              </PopoverContent>
            </Popover>
          )}
          {period === 'month-custom' && (
            <Select
              value={selectedMonthKey}
              onValueChange={setSelectedMonthKey}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Alege luna" />
              </SelectTrigger>
              <SelectContent>
                {monthOptions.map((m) => (
                  <SelectItem key={`${m.year}-${m.month}`} value={`${m.year}-${m.month}`}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {period === 'custom-range' && (
            <div className="flex items-center gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-[200px] justify-start text-left font-normal">
                    <CalendarDays className="mr-2 h-4 w-4" />
                    {customRangeStart ? format(customRangeStart, 'd MMM yyyy', { locale: ro }) : 'De la'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={customRangeStart}
                    onSelect={(d) => d && setCustomRangeStart(d)}
                    locale={ro}
                  />
                </PopoverContent>
              </Popover>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-[200px] justify-start text-left font-normal">
                    <CalendarDays className="mr-2 h-4 w-4" />
                    {customRangeEnd ? format(customRangeEnd, 'd MMM yyyy', { locale: ro }) : 'Până la'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={customRangeEnd}
                    onSelect={(d) => d && setCustomRangeEnd(d)}
                    locale={ro}
                  />
                </PopoverContent>
              </Popover>
            </div>
          )}
          {canSelectTechnician && (
            <>
              <span className="text-sm text-muted-foreground ml-2 sm:ml-4">Tehnician:</span>
              <Select
                value={selectedTechnicianId || 'all'}
                onValueChange={(v) => setSelectedTechnicianId(v === 'all' ? '' : v)}
              >
                <SelectTrigger className="w-[220px]">
                  <SelectValue placeholder="Toți tehnicienii" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toți tehnicienii</SelectItem>
                  {technicianOptions.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          )}
        </div>

        {/* Total săptămână + lună (mereu vizibile când avem stats) */}
        {stats && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Total — Săptămâna curentă</CardTitle>
                <Package className="h-4 w-4 text-sky-500/70" />
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="text-xl font-bold">{stats.totalWeek}</span>
                  <span className="text-sm text-muted-foreground">
                    tăvițe · <span className="font-medium text-foreground">{formatMinutesAsHoursMinutes(stats.totalMinutesInLucruWeek ?? 0)}</span> ore lucru
                  </span>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Total — Luna curentă</CardTitle>
                <Package className="h-4 w-4 text-sky-500" />
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="text-xl font-bold">{stats.totalMonth}</span>
                  <span className="text-sm text-muted-foreground">
                    tăvițe · <span className="font-medium text-foreground">{formatMinutesAsHoursMinutes(stats.totalMinutesInLucruMonth ?? 0)}</span> ore lucru
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Total per perioada selectată */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total tăvițe prelucrate — {periodLabel}
            </CardTitle>
            <Package className="h-4 w-4 text-sky-500" />
          </CardHeader>
          <CardContent>
            {loading && period !== 'month-custom' ? (
              <Skeleton className="h-8 w-16" />
            ) : period === 'month-custom' && monthDataLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="text-2xl font-bold">{total}</span>
                <span className="text-sm text-muted-foreground">
                  tăvițe · <span className="font-medium text-foreground">{formatMinutesAsHoursMinutes(totalMinutesInLucruForPeriod)}</span> ore lucru
                  {totalMinutesInAsteptareForPeriod > 0 && (
                    <> · <span className="font-medium text-orange-500">{formatMinutesInLucru(totalMinutesInAsteptareForPeriod)}</span> în așteptare</>
                  )}
                </span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Tabel tehnicieni */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pe tehnician</CardTitle>
            <p className="text-sm text-muted-foreground">
              Tehnicienii care au finalizat tăvițe sau au avut cel puțin o tăviță în lucru în perioada selectată.
            </p>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-32 w-full" />
            ) : list.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nicio tăviță prelucrată în perioada selectată.</p>
            ) : (
              <div className="rounded-md border overflow-hidden">
                {period === 'day' && dayData && (
                  <div className="border-b bg-muted/10 p-3">
                    {(() => {
                      const techIdsInView = new Set(list.map((r) => r.technicianId))
                      const totalTrays = list.reduce((acc, r) => acc + (r.count ?? 0), 0)
                      const instrumentRows = Array.from(techIdsInView).flatMap(
                        (tid) => (dayData.instrumentWorkByTechnician?.[tid] || []) as TehnicianInstrumentWork[]
                      )
                      const totalInstruments = instrumentRows.reduce((acc, r) => acc + (Number(r?.qty) || 0), 0)
                      const totalEstSeconds = instrumentRows.reduce((acc, r) => acc + (Number(r?.estSeconds) || 0), 0)
                      const totalActSeconds = (dayData.totalMinutesInLucru ?? 0) * 60
                      const avgSeconds = totalInstruments > 0 ? totalActSeconds / totalInstruments : 0
                      const totalRon = Array.from(techIdsInView).reduce((acc, tid) => {
                        const trayList = dayData.traysByTechnician?.[tid] || []
                        return acc + trayList.reduce((a, t) => a + (Number((t as any)?.trayTotalRon ?? (t as any)?.totalRon) || 0), 0)
                      }, 0)
                      return (
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                          <div className="rounded-md border bg-background p-2">
                            <div className="text-[11px] font-medium text-muted-foreground">NR. TĂVIȚE (TOTAL)</div>
                            <div className="text-sm font-semibold tabular-nums">{totalTrays > 0 ? totalTrays : '—'}</div>
                          </div>
                          <div className="rounded-md border bg-background p-2">
                            <div className="text-[11px] font-medium text-muted-foreground">RON, EST (TOTAL)</div>
                            <div className="text-sm font-semibold tabular-nums">{formatRon(totalRon)}</div>
                          </div>
                          <div className="rounded-md border bg-background p-2">
                            <div className="text-[11px] font-medium text-muted-foreground">RON, ACT (TOTAL)</div>
                            <div className="text-sm font-semibold tabular-nums">{formatRon(totalRon)}</div>
                          </div>
                          <div className="rounded-md border bg-background p-2">
                            <div className="text-[11px] font-medium text-muted-foreground">h, EST (TOTAL)</div>
                            <div className="text-sm font-semibold tabular-nums">{formatSecondsHms(totalEstSeconds)}</div>
                          </div>
                          <div className="rounded-md border bg-background p-2">
                            <div className="text-[11px] font-medium text-muted-foreground">h, ACT (TOTAL)</div>
                            <div className="text-sm font-semibold tabular-nums">{formatSecondsHms(totalActSeconds)}</div>
                          </div>
                          <div className="rounded-md border bg-background p-2">
                            <div className="text-[11px] font-medium text-muted-foreground">MEDIA (TOTAL)</div>
                            <div className="text-sm font-semibold tabular-nums">{formatSecondsHms(avgSeconds)}</div>
                          </div>
                        </div>
                      )
                    })()}
                  </div>
                )}
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left p-3 font-medium">Tehnician</th>
                      <th className="text-right p-3 font-medium">Nr. tăvițe</th>
                      <th className="text-right p-3 font-medium">Nr. instrumente</th>
                      <th className="text-right p-3 font-medium">Ore lucru</th>
                      <th className="text-right p-3 font-medium">Timp în lucru</th>
                      <th className="text-right p-3 font-medium">Timp în așteptare</th>
                      <th className="text-right p-3 font-medium text-green-600 dark:text-green-400">Total RON</th>
                      <th className="text-right p-3 font-medium">Total (zi)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((row) => {
                      const isDay = period === 'day'
                      const expanded = expandedTechnicians.has(row.technicianId)
                      const trayList = (dayData?.traysByTechnician?.[row.technicianId] || [])
                      // „tăvițe în lucru” trebuie să însemne tăvițe AFLATE acum în stage „În lucru”,
                      // nu toate tăvițele care au avut timp în lucru în ziua respectivă.
                      const traysInLucruCount = trayList.filter((t) => t?.isInLucru).length
                      const trayTotal = trayList.reduce((acc, t) => acc + (Number((t as any)?.trayTotalRon ?? (t as any)?.totalRon) || 0), 0)
                      // Calculează numărul total de instrumente pentru acest tehnician
                      const instrumentRows = isDay && dayData?.instrumentWorkByTechnician?.[row.technicianId] 
                        ? (dayData.instrumentWorkByTechnician[row.technicianId] as TehnicianInstrumentWork[])
                        : []
                      const totalInstruments = instrumentRows.reduce((acc, r) => acc + (Number(r?.qty) || 0), 0)
                      return (
                        <Fragment key={row.technicianId}>
                          <tr
                            className={isDay ? "border-b cursor-pointer hover:bg-muted/30" : "border-b"}
                            onClick={() => {
                              if (!isDay) return
                              setExpandedTechnicians((prev) => {
                                const next = new Set(prev)
                                if (next.has(row.technicianId)) next.delete(row.technicianId)
                                else next.add(row.technicianId)
                                return next
                              })
                            }}
                          >
                            <td className="p-3">
                              <div className="flex items-center gap-2">
                                {isDay && (
                                  expanded ? (
                                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                  ) : (
                                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                  )
                                )}
                                <User className="h-4 w-4 text-muted-foreground" />
                                <span className="font-medium">{row.technicianName}</span>
                                {isDay && (
                                  <span className="text-xs text-muted-foreground ml-2">
                                    {traysInLucruCount > 0 ? `${traysInLucruCount} tăvițe în lucru` : trayList.length > 0 ? `${trayList.length} tăvițe` : '—'}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="p-3 text-right font-medium">{row.count}</td>
                            <td className="p-3 text-right font-medium tabular-nums">
                              {isDay && totalInstruments > 0 ? totalInstruments : '—'}
                            </td>
                            <td className="p-3 text-right text-muted-foreground tabular-nums">{formatDecimalHoursAsHoursMinutes(workingHours)}</td>
                            <td className="p-3 text-right text-muted-foreground tabular-nums">
                              {formatMinutesInLucru(row.minutesInLucru ?? 0)}
                            </td>
                            <td className="p-3 text-right text-orange-500 tabular-nums">
                              {formatMinutesInLucru(row.minutesInAsteptare ?? 0)}
                            </td>
                            <td className="p-3 text-right font-medium text-green-600 dark:text-green-400 tabular-nums">
                              {formatRon(row.totalRon ?? trayTotal)}
                            </td>
                            <td className="p-3 text-right text-muted-foreground tabular-nums">
                              {isDay ? formatRon(row.totalRon ?? trayTotal) : '—'}
                            </td>
                          </tr>

                          {isDay && expanded && (
                            <tr key={`${row.technicianId}-details`} className="border-b bg-muted/10">
                              <td colSpan={7} className="p-3">
                                {trayList.length === 0 ? (
                                  <p className="text-sm text-muted-foreground">
                                    Nu există tăvițe cu timp „în lucru” în ziua selectată pentru acest tehnician.
                                  </p>
                                ) : (
                                  (() => {
                                    const instrumentRows = (dayData?.instrumentWorkByTechnician?.[row.technicianId] || []) as TehnicianInstrumentWork[]
                                    const totalInstruments = instrumentRows.reduce((acc, r) => acc + (Number(r?.qty) || 0), 0)
                                    const totalInstrumentsInLucru = instrumentRows.reduce((acc, r) => acc + (Number((r as any)?.qtyInLucru) || 0), 0)
                                    const totalInstrumentsInAsteptare = instrumentRows.reduce((acc, r) => acc + (Number((r as any)?.qtyInAsteptare) || 0), 0)
                                    const totalInstrumentsFinalizat = totalInstruments - totalInstrumentsInLucru - totalInstrumentsInAsteptare
                                    const totalEstSeconds = instrumentRows.reduce((acc, r) => acc + (Number(r?.estSeconds) || 0), 0)
                                    const totalActSeconds = trayList.reduce((acc, t) => acc + (Number(t?.minutesInLucru) || 0) * 60, 0)
                                    const avgSeconds = totalInstruments > 0 ? totalActSeconds / totalInstruments : 0
                                    const totalRon = trayList.reduce((a, t) => a + (Number((t as any)?.trayTotalRon ?? (t as any)?.totalRon) || 0), 0)
                                    return (
                                      <div className="space-y-3">
                                        {/* KPI-uri (stil existent: border + background) */}
                                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                                          <div className="rounded-md border bg-background p-2">
                                            <div className="text-[11px] font-medium text-muted-foreground">NR.</div>
                                            <div className="text-sm font-semibold tabular-nums flex items-center gap-1">
                                              {totalInstrumentsFinalizat > 0 && <span>{totalInstrumentsFinalizat}</span>}
                                              {totalInstrumentsInLucru > 0 && (
                                                <span className="text-red-600 dark:text-red-400" title="În lucru">
                                                  {totalInstrumentsFinalizat > 0 ? `+${totalInstrumentsInLucru}` : totalInstrumentsInLucru}
                                                </span>
                                              )}
                                              {totalInstrumentsInAsteptare > 0 && (
                                                <span className="text-orange-600 dark:text-orange-400" title="În așteptare">
                                                  {(totalInstrumentsFinalizat > 0 || totalInstrumentsInLucru > 0) ? `+${totalInstrumentsInAsteptare}` : totalInstrumentsInAsteptare}
                                                </span>
                                              )}
                                              {totalInstruments === 0 && '—'}
                                            </div>
                                          </div>
                                          <div className="rounded-md border bg-background p-2">
                                            <div className="text-[11px] font-medium text-muted-foreground">RON, EST</div>
                                            <div className="text-sm font-semibold tabular-nums">{formatRon(totalRon)}</div>
                                          </div>
                                          <div className="rounded-md border bg-background p-2">
                                            <div className="text-[11px] font-medium text-muted-foreground">RON, ACT</div>
                                            <div className="text-sm font-semibold tabular-nums">{formatRon(totalRon)}</div>
                                          </div>
                                          <div className="rounded-md border bg-background p-2">
                                            <div className="text-[11px] font-medium text-muted-foreground">h, EST</div>
                                            <div className="text-sm font-semibold tabular-nums">{formatSecondsHms(totalEstSeconds)}</div>
                                          </div>
                                          <div className="rounded-md border bg-background p-2">
                                            <div className="text-[11px] font-medium text-muted-foreground">h, ACT</div>
                                            <div className="text-sm font-semibold tabular-nums">{formatSecondsHms(totalActSeconds)}</div>
                                          </div>
                                          <div className="rounded-md border bg-background p-2">
                                            <div className="text-[11px] font-medium text-muted-foreground">MEDIA</div>
                                            <div className="text-sm font-semibold tabular-nums">{formatSecondsHms(avgSeconds)}</div>
                                          </div>
                                        </div>

                                        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                                          {/* Breakdown pe instrument */}
                                          <div className="rounded-md border bg-background overflow-hidden">
                                            <div className="border-b bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground">
                                              Pe instrument
                                            </div>
                                            {instrumentRows.length === 0 ? (
                                              <div className="p-3 text-sm text-muted-foreground">Nu există date pe instrument pentru acest tehnician.</div>
                                            ) : (
                                              <div className="overflow-x-auto">
                                                <table className="w-full text-sm">
                                                  <thead>
                                                    <tr className="border-b bg-muted/50">
                                                      <th className="text-left p-2 font-medium">Instrument</th>
                                                      <th className="text-right p-2 font-medium">NR.</th>
                                                      <th className="text-right p-2 font-medium">RON, EST</th>
                                                      <th className="text-right p-2 font-medium">RON, ACT</th>
                                                      <th className="text-right p-2 font-medium">h, EST</th>
                                                      <th className="text-right p-2 font-medium">h, ACT</th>
                                                      <th className="text-right p-2 font-medium">MEDIA</th>
                                                    </tr>
                                                  </thead>
                                                  <tbody>
                                                    {instrumentRows.map((r, idx) => {
                                                      const qty = Number(r?.qty) || 0
                                                      const qtyInLucru = Number((r as any)?.qtyInLucru) || 0
                                                      const qtyInAsteptare = Number((r as any)?.qtyInAsteptare) || 0
                                                      const qtyFinalizat = qty - qtyInLucru - qtyInAsteptare
                                                      const act = Number(r?.actSeconds) || 0
                                                      const avg = qty > 0 ? act / qty : 0
                                                      const instKey = `${row.technicianId}:${r.instrumentId || r.instrumentName}:${idx}`
                                                      const hasServices = (r.services?.length ?? 0) > 0
                                                      const isExpanded = expandedInstrumentRows.has(instKey)
                                                      return (
                                                        <Fragment key={`${r.instrumentId || r.instrumentName}-${idx}`}>
                                                          <tr className="border-b">
                                                            <td className="p-2">
                                                              <div className="flex items-center gap-2">
                                                                <button
                                                                  type="button"
                                                                  className={cn(
                                                                    "h-6 w-6 inline-flex items-center justify-center rounded hover:bg-muted/50",
                                                                    !hasServices && "opacity-40 cursor-not-allowed"
                                                                  )}
                                                                  onClick={(e) => {
                                                                    e.stopPropagation()
                                                                    if (!hasServices) return
                                                                    setExpandedInstrumentRows((prev) => {
                                                                      const next = new Set(prev)
                                                                      if (next.has(instKey)) next.delete(instKey)
                                                                      else next.add(instKey)
                                                                      return next
                                                                    })
                                                                  }}
                                                                  title={hasServices ? "Vezi servicii" : "Nu există servicii"}
                                                                >
                                                                  {isExpanded ? (
                                                                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                                                  ) : (
                                                                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                                                  )}
                                                                </button>
                                                                <span className="font-medium">{r.instrumentName}</span>
                                                              </div>
                                                            </td>
                                                            <td className="p-2 text-right tabular-nums">
                                                              <div className="flex items-center justify-end gap-1">
                                                                {qtyFinalizat > 0 && <span>{qtyFinalizat}</span>}
                                                                {qtyInLucru > 0 && (
                                                                  <span className="text-red-600 dark:text-red-400" title="În lucru">
                                                                    {qtyFinalizat > 0 ? `+${qtyInLucru}` : qtyInLucru}
                                                                  </span>
                                                                )}
                                                                {qtyInAsteptare > 0 && (
                                                                  <span className="text-orange-600 dark:text-orange-400" title="În așteptare">
                                                                    {(qtyFinalizat > 0 || qtyInLucru > 0) ? `+${qtyInAsteptare}` : qtyInAsteptare}
                                                                  </span>
                                                                )}
                                                                {qty === 0 && '—'}
                                                              </div>
                                                            </td>
                                                            <td className="p-2 text-right tabular-nums text-muted-foreground">{formatRon(r.ronEst)}</td>
                                                            <td className="p-2 text-right tabular-nums text-muted-foreground">{formatRon(r.ronAct)}</td>
                                                            <td className="p-2 text-right tabular-nums text-muted-foreground">{formatSecondsHms(Number(r?.estSeconds) || 0)}</td>
                                                            <td className="p-2 text-right tabular-nums text-muted-foreground">{formatSecondsHms(act)}</td>
                                                            <td className="p-2 text-right tabular-nums text-muted-foreground">{formatSecondsHms(avg)}</td>
                                                          </tr>
                                                          {hasServices && isExpanded && (
                                                            <tr className="border-b last:border-0 bg-muted/10">
                                                              <td className="p-2" colSpan={7}>
                                                                <div className="rounded-md border bg-background overflow-hidden">
                                                                  <div className="border-b bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground">
                                                                    Servicii (nr. servicii efectuate)
                                                                  </div>
                                                                  <div className="px-3 py-2">
                                                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                                                      {(r.services || []).map((s) => {
                                                                        const sQty = Number(s.qty) || 0
                                                                        const sQtyInLucru = Number((s as any)?.qtyInLucru) || 0
                                                                        const sQtyInAsteptare = Number((s as any)?.qtyInAsteptare) || 0
                                                                        const sQtyFinalizat = sQty - sQtyInLucru - sQtyInAsteptare
                                                                        return (
                                                                          <div key={s.serviceId} className="flex items-center justify-between gap-3 rounded border px-2 py-1 text-xs">
                                                                            <span className="text-foreground truncate">{s.serviceName}</span>
                                                                            <div className="flex items-center gap-1 tabular-nums font-semibold">
                                                                              {sQtyFinalizat > 0 && <span className="text-muted-foreground">{sQtyFinalizat}</span>}
                                                                              {sQtyInLucru > 0 && (
                                                                                <span className="text-red-600 dark:text-red-400" title="În lucru">
                                                                                  {sQtyFinalizat > 0 ? `+${sQtyInLucru}` : sQtyInLucru}
                                                                                </span>
                                                                              )}
                                                                              {sQtyInAsteptare > 0 && (
                                                                                <span className="text-orange-600 dark:text-orange-400" title="În așteptare">
                                                                                  {(sQtyFinalizat > 0 || sQtyInLucru > 0) ? `+${sQtyInAsteptare}` : sQtyInAsteptare}
                                                                                </span>
                                                                              )}
                                                                              {sQty === 0 && <span className="text-muted-foreground">0</span>}
                                                                            </div>
                                                                          </div>
                                                                        )
                                                                      })}
                                                                    </div>
                                                                  </div>
                                                                </div>
                                                              </td>
                                                            </tr>
                                                          )}
                                                        </Fragment>
                                                      )
                                                    })}
                                                  </tbody>
                                                </table>
                                              </div>
                                            )}
                                          </div>

                                          {/* Pe tăviță */}
                                          <div className="rounded-md border bg-background overflow-hidden">
                                            <div className="border-b bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground">
                                              Pe tăviță
                                            </div>
                                            <div className="overflow-x-auto">
                                              <table className="w-full text-sm">
                                                <thead>
                                                  <tr className="border-b bg-muted/50">
                                                    <th className="text-left p-2 font-medium">Client</th>
                                                    <th className="text-left p-2 font-medium">Tăviță</th>
                                                    <th className="text-left p-2 font-medium">Fișă</th>
                                                    <th className="text-right p-2 font-medium">Total</th>
                                                    <th className="text-right p-2 font-medium">Timp în lucru</th>
                                                    <th className="text-right p-2 font-medium">Timp în așteptare</th>
                                                    {isOwner() && <th className="text-right p-2 font-medium w-[140px]">Acțiuni</th>}
                                                  </tr>
                                                </thead>
                                                <tbody>
                                                  {trayList.map((t) => (
                                                    <tr
                                                      key={t.trayId}
                                                      className="border-b last:border-0 cursor-pointer hover:bg-muted/30"
                                                      onClick={(e) => {
                                                        e.stopPropagation()
                                                        if (!t?.trayId) return
                                                        // Deschide în LeadDetailsPanel folosind VanzariView (desktop), nu pagina tehnician/tray.
                                                        // Navigăm la /leads/vanzari și deschidem lead-ul asociat tăviței/fișei.
                                                        if (t?.leadId) {
                                                          // Salvăm starea UI ca să revenim cu aceleași celule expandate + scroll.
                                                          try {
                                                            const snapshot = {
                                                              period,
                                                              selectedDate: selectedDate?.toISOString?.() ?? null,
                                                              selectedTechnicianId,
                                                              expandedTechnicians: Array.from(expandedTechnicians),
                                                              expandedInstrumentRows: Array.from(expandedInstrumentRows),
                                                              scrollY: typeof window !== 'undefined' ? window.scrollY : 0,
                                                              savedAt: Date.now(),
                                                            }
                                                            sessionStorage.setItem(DASHBOARD_UI_KEY, JSON.stringify(snapshot))
                                                          } catch {}

                                                          const payload: TraySearchOpenPayload = {
                                                            pipelineSlug: 'vanzari',
                                                            openType: 'lead',
                                                            openId: String(t.leadId),
                                                            returnTo: '/dashboard/tehnician',
                                                          }
                                                          try {
                                                            sessionStorage.setItem(TRAY_SEARCH_OPEN_KEY, JSON.stringify(payload))
                                                          } catch {}
                                                          router.push('/leads/vanzari')
                                                          return
                                                        }
                                                        // fallback dacă nu avem fișa
                                                        router.push(`/tehnician/tray/${t.trayId}`)
                                                      }}
                                                    >
                                                      <td className="p-2 text-muted-foreground">
                                                        {t.clientName && String(t.clientName).trim() ? String(t.clientName) : '—'}
                                                      </td>
                                                      <td className="p-2">
                                                        <div className="flex items-center gap-2">
                                                          <PipelineIcon pipelineName={t.pipelineName} />
                                                          <span className="font-medium">
                                                            {t.trayNumber && String(t.trayNumber).trim()
                                                              ? `#${t.trayNumber}`
                                                                : 'Tăviță'}
                                                          </span>
                                                          {t.isInLucru && (
                                                            <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900/30 dark:text-red-400">
                                                              În lucru
                                                            </span>
                                                          )}
                                                          {t.isInAsteptare && (
                                                            <span className="inline-flex items-center rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700 dark:bg-orange-900/30 dark:text-orange-400">
                                                              În așteptare
                                                            </span>
                                                          )}
                                                          {(t as any).isDeTrimis && (
                                                            <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
                                                              De trimis
                                                            </span>
                                                          )}
                                                          {(t as any).isRidicPersonal && (
                                                            <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                                                              Ridic personal
                                                            </span>
                                                          )}
                                                          {(t as any).isReunita && (
                                                            <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                                                              Reunită
                                                            </span>
                                                          )}
                                                        </div>
                                                      </td>
                                                      <td className="p-2 text-muted-foreground">
                                                        {t.serviceFileNumber && String(t.serviceFileNumber).trim()
                                                          ? String(t.serviceFileNumber)
                                                          : t.serviceFileId
                                                            ? String(t.serviceFileId).slice(0, 8)
                                                            : '—'}
                                                      </td>
                                                      <td className={cn(
                                                        "p-2 text-right tabular-nums",
                                                        (t.isInLucru || t.isInAsteptare)
                                                          ? "text-muted-foreground/50 line-through"
                                                          : "text-muted-foreground"
                                                      )}>
                                                        {formatRon((t as any)?.trayTotalRon ?? t.totalRon)}
                                                      </td>
                                                      <td className={cn(
                                                        "p-2 text-right tabular-nums",
                                                        (t.isInLucru || t.isInAsteptare)
                                                          ? "text-muted-foreground/50 line-through"
                                                          : "text-muted-foreground"
                                                      )}>
                                                        {formatMinutesInLucru(t.minutesInLucru ?? 0)}
                                                      </td>
                                                      <td className="p-2 text-right tabular-nums text-orange-500">
                                                        {formatMinutesInLucru(t.minutesInAsteptare ?? 0)}
                                                      </td>
                                                      {isOwner() && (
                                                        <td className="p-2 text-right" onClick={(e) => e.stopPropagation()}>
                                                          <div className="flex items-center justify-end gap-1">
                                                            <Button
                                                              type="button"
                                                              variant="ghost"
                                                              size="sm"
                                                              className="h-8 text-xs text-amber-600 hover:text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950/30"
                                                              title="Oprește timpul în lucru (închide sesiunea)"
                                                              onClick={async () => {
                                                                if (!t?.trayId || !row?.technicianId) return
                                                                const { error } = await finishWorkSession(t.trayId, row.technicianId)
                                                                if (error) {
                                                                  toast.error((error as Error)?.message || 'Eroare la oprirea timpului')
                                                                  return
                                                                }
                                                                toast.success('Timp oprit')
                                                                refreshDayData()
                                                              }}
                                                            >
                                                              <StopCircle className="h-4 w-4" />
                                                            </Button>
                                                            <Button
                                                              type="button"
                                                              variant="ghost"
                                                              size="sm"
                                                              className="h-8 text-xs text-muted-foreground hover:text-foreground"
                                                              title="Modifică timpul (început / sfârșit)"
                                                              onClick={() => {
                                                                setEditSessionDialog({
                                                                  open: true,
                                                                  trayId: t.trayId,
                                                                  technicianId: row.technicianId,
                                                                  technicianName: row.technicianName,
                                                                  trayNumber: t.trayNumber ? `#${t.trayNumber}` : 'Tăviță',
                                                                  sessions: [],
                                                                  loading: true,
                                                                  saving: false,
                                                                })
                                                              }}
                                                            >
                                                              <Pencil className="h-4 w-4" />
                                                            </Button>
                                                          </div>
                                                        </td>
                                                      )}
                                                    </tr>
                                                  ))}
                                                  <tr className="border-t bg-muted/20">
                                                    <td className="p-2 font-medium" colSpan={3}>Total</td>
                                                    <td className="p-2 text-right font-medium tabular-nums">{formatRon(trayList.reduce((a, t) => a + (Number((t as any)?.trayTotalRon ?? (t as any)?.totalRon) || 0), 0))}</td>
                                                    <td className="p-2" />
                                                    <td className="p-2" />
                                                    {isOwner() && <td className="p-2" />}
                                                  </tr>
                                                </tbody>
                                              </table>
                                            </div>
                                          </div>
                                        </div>
                                      </div>
                                    )
                                  })()
                                )}
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      )
                    })}
                    {/* Rând total pentru toți tehnicienii */}
                    <tr className="border-t bg-muted/20 font-semibold">
                      <td className="p-3">TOTAL</td>
                      <td className="p-3 text-right tabular-nums">{total}</td>
                      <td className="p-3 text-right tabular-nums">
                        {(() => {
                          if (period === 'day' && dayData) {
                            const totalInstruments = Array.from(new Set(list.map((r) => r.technicianId)))
                              .reduce((acc, tid) => {
                                const instruments = (dayData.instrumentWorkByTechnician?.[tid] || []) as TehnicianInstrumentWork[]
                                return acc + instruments.reduce((a, r) => a + (Number(r?.qty) || 0), 0)
                              }, 0)
                            return totalInstruments > 0 ? totalInstruments : '—'
                          }
                          return '—'
                        })()}
                      </td>
                      <td className="p-3 text-right tabular-nums text-muted-foreground">{formatDecimalHoursAsHoursMinutes(workingHours)}</td>
                      <td className="p-3 text-right tabular-nums text-muted-foreground">
                        {formatMinutesInLucru(
                          list.reduce((acc, r) => acc + (r.minutesInLucru ?? 0), 0)
                        )}
                      </td>
                      <td className="p-3 text-right tabular-nums text-orange-500">
                        {formatMinutesInLucru(
                          list.reduce((acc, r) => acc + (r.minutesInAsteptare ?? 0), 0)
                        )}
                      </td>
                      <td className="p-3 text-right tabular-nums text-green-600 dark:text-green-400">
                        {formatRon(totalRonForPeriod)}
                      </td>
                      <td className="p-3 text-right tabular-nums text-muted-foreground">
                        {period === 'day' ? formatRon(totalRonForPeriod) : '—'}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Dialog modificare timp sesiuni (doar owner) */}
        <Dialog
          open={editSessionDialog.open}
          onOpenChange={(open) => {
            if (!open) setEditSessionDialog((prev) => ({ ...prev, open: false, trayId: null, technicianId: null, sessions: [] }))
          }}
        >
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Modifică timp în lucru</DialogTitle>
              <p className="text-sm text-muted-foreground">
                {editSessionDialog.technicianName} – {editSessionDialog.trayNumber}
              </p>
            </DialogHeader>
            {editSessionDialog.loading ? (
              <p className="text-sm text-muted-foreground">Se încarcă sesiunile...</p>
            ) : editSessionDialog.sessions.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nu există sesiuni pentru această tăviță și tehnician.</p>
            ) : (
              <div className="space-y-3 max-h-[60vh] overflow-y-auto">
                {editSessionDialog.sessions.map((s) => (
                  <div key={s.id} className="rounded-lg border p-3 space-y-2">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Început</Label>
                        <Input
                          type="datetime-local"
                          value={editingSessionTimes[s.id]?.started_at ?? ''}
                          onChange={(e) =>
                            setEditingSessionTimes((prev) => ({
                              ...prev,
                              [s.id]: { ...prev[s.id], started_at: e.target.value, finished_at: prev[s.id]?.finished_at ?? '' },
                            }))
                          }
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Sfârșit (gol = în curs)</Label>
                        <Input
                          type="datetime-local"
                          value={editingSessionTimes[s.id]?.finished_at ?? ''}
                          onChange={(e) =>
                            setEditingSessionTimes((prev) => ({
                              ...prev,
                              [s.id]: { ...prev[s.id], started_at: prev[s.id]?.started_at ?? '', finished_at: e.target.value },
                            }))
                          }
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setEditSessionDialog((prev) => ({ ...prev, open: false }))}
              >
                Închide
              </Button>
              {editSessionDialog.sessions.length > 0 && (
                <Button
                  disabled={editSessionDialog.saving}
                  onClick={async () => {
                    setEditSessionDialog((prev) => ({ ...prev, saving: true }))
                    let ok = true
                    for (const s of editSessionDialog.sessions) {
                      const times = editingSessionTimes[s.id]
                      if (!times) continue
                      const started_at = times.started_at ? new Date(times.started_at).toISOString() : undefined
                      const finished_at = times.finished_at ? new Date(times.finished_at).toISOString() : null
                      const payload: { started_at?: string; finished_at?: string | null } = {}
                      if (started_at) payload.started_at = started_at
                      payload.finished_at = finished_at
                      if (!payload.started_at && payload.finished_at === undefined) continue
                      const { error } = await updateWorkSession(s.id, payload)
                      if (error) {
                        toast.error(`Eroare la sesiunea ${s.id.slice(0, 8)}: ${error?.message ?? 'necunoscut'}`)
                        ok = false
                      }
                    }
                    setEditSessionDialog((prev) => ({ ...prev, saving: false }))
                    if (ok) {
                      toast.success('Timp actualizat')
                      setEditSessionDialog((prev) => ({ ...prev, open: false }))
                      refreshDayData()
                    }
                  }}
                >
                  {editSessionDialog.saving ? 'Se salvează...' : 'Salvează'}
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Prelucrări pe zile — afișat pentru săptămână / lună */}
        {period !== 'day' && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Prelucrări pe zile</CardTitle>
              <p className="text-sm text-muted-foreground">
                Număr de tăvițe prelucrate în fiecare zi din perioada selectată (în dependență de dată).
              </p>
            </CardHeader>
            <CardContent>
              {byDayLoading ? (
                <Skeleton className="h-32 w-full" />
              ) : byDayList.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nicio tăviță prelucrată în zilele din perioadă.</p>
              ) : (
                <div className="rounded-md border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-left p-3 font-medium">Data</th>
                        <th className="text-right p-3 font-medium">Nr. tăvițe</th>
                        <th className="text-right p-3 font-medium">Timp în lucru</th>
                        <th className="text-right p-3 font-medium text-green-600 dark:text-green-400">Total RON</th>
                      </tr>
                    </thead>
                    <tbody>
                      {byDayList.map((row) => (
                        <tr key={row.date} className="border-b last:border-0">
                          <td className="p-3 flex items-center gap-2">
                            <CalendarDays className="h-4 w-4 text-muted-foreground" />
                            {format(new Date(row.date + 'T12:00:00'), 'EEEE, d MMM yyyy', { locale: ro })}
                          </td>
                          <td className="p-3 text-right font-medium">{row.count}</td>
                          <td className="p-3 text-right text-muted-foreground tabular-nums">{formatMinutesInLucru(row.totalMinutesInLucru ?? 0)}</td>
                          <td className="p-3 text-right font-medium text-green-600 dark:text-green-400 tabular-nums">{formatRon(row.totalRon ?? 0)}</td>
                        </tr>
                      ))}
                      {/* Rând total pentru prelucrările pe zile */}
                      <tr className="border-t bg-muted/20 font-semibold">
                        <td className="p-3">TOTAL</td>
                        <td className="p-3 text-right tabular-nums">{byDayList.reduce((acc, r) => acc + r.count, 0)}</td>
                        <td className="p-3 text-right tabular-nums text-muted-foreground">
                          {formatMinutesInLucru(byDayList.reduce((acc, r) => acc + (r.totalMinutesInLucru ?? 0), 0))}
                        </td>
                        <td className="p-3 text-right tabular-nums text-green-600 dark:text-green-400">
                          {formatRon(byDayList.reduce((acc, r) => acc + (r.totalRon ?? 0), 0))}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Dialog modificare timp sesiuni (doar owner) */}
        <Dialog
          open={editSessionDialog.open}
          onOpenChange={(open) => {
            if (!open) setEditSessionDialog((prev) => ({ ...prev, open: false }))
          }}
        >
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Modifică timp în lucru</DialogTitle>
              <p className="text-sm text-muted-foreground">
                {editSessionDialog.technicianName} · Tăviță {editSessionDialog.trayNumber}
              </p>
            </DialogHeader>
            {editSessionDialog.loading ? (
              <p className="text-sm text-muted-foreground py-4">Se încarcă sesiunile...</p>
            ) : editSessionDialog.sessions.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">Nu există sesiuni de lucru pentru această tăviță și tehnician.</p>
            ) : (
              <div className="space-y-3 max-h-[60vh] overflow-y-auto">
                {editSessionDialog.sessions.map((s) => {
                  const times = editingSessionTimes[s.id]
                  if (!times) return null
                  return (
                    <div key={s.id} className="rounded-lg border p-3 space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className="text-xs">Început</Label>
                          <Input
                            type="datetime-local"
                            value={times.started_at}
                            onChange={(e) =>
                              setEditingSessionTimes((prev) => ({
                                ...prev,
                                [s.id]: { ...prev[s.id], started_at: e.target.value },
                              }))
                            }
                            className="h-9 text-sm"
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Sfârșit (gol = în curs)</Label>
                          <Input
                            type="datetime-local"
                            value={times.finished_at ?? ''}
                            onChange={(e) =>
                              setEditingSessionTimes((prev) => ({
                                ...prev,
                                [s.id]: { ...prev[s.id], finished_at: e.target.value || null },
                              }))
                            }
                            className="h-9 text-sm"
                          />
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
            <DialogFooter>
              <Button
                variant="ghost"
                onClick={() => setEditSessionDialog((prev) => ({ ...prev, open: false }))}
              >
                Închide
              </Button>
              {!editSessionDialog.loading && editSessionDialog.sessions.length > 0 && (
                <Button
                  disabled={editSessionDialog.saving}
                  onClick={async () => {
                    setEditSessionDialog((prev) => ({ ...prev, saving: true }))
                    let hasError = false
                    for (const s of editSessionDialog.sessions) {
                      const times = editingSessionTimes[s.id]
                      if (!times) continue
                      const payload: { started_at?: string; finished_at?: string | null } = {}
                      if (times.started_at) payload.started_at = new Date(times.started_at).toISOString()
                      payload.finished_at = times.finished_at ? new Date(times.finished_at).toISOString() : null
                      const { error } = await updateWorkSession(s.id, payload)
                      if (error) {
                        toast.error(`Eroare la sesiunea ${s.id.slice(0, 8)}: ${error?.message ?? 'necunoscut'}`)
                        hasError = true
                      }
                    }
                    setEditSessionDialog((prev) => ({ ...prev, saving: false }))
                    if (!hasError) {
                      toast.success('Timp actualizat')
                      setEditSessionDialog((prev) => ({ ...prev, open: false }))
                      refreshDayData()
                    }
                  }}
                >
                  {editSessionDialog.saving ? 'Se salvează...' : 'Salvează'}
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}
