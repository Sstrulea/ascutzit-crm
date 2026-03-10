'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useAuthContext } from '@/lib/contexts/AuthContext'
import { usePipelinesCache } from '@/hooks/usePipelinesCache'
import {
  fetchVanzariApeluriForDate,
  fetchFiseCountForUser,
  fetchLeadsCreatedForDateRange,
  listVanzariSalespeople,
  fetchLeadsByTypeForUser,
  fetchStatisticiApeluriReport,
  type ApeluriByType,
  type VanzariSalespersonOption,
  type LeadsByTypeForUser,
  type LeadByTypeItem,
  type LeadCreatedItem,
  type StatisticiApeluriReport,
  type LeadSourceType,
} from '@/lib/supabase/vanzariApeluri'
import { Lock, Phone, RefreshCw, CalendarDays, ArrowLeft, ChevronDown, ChevronRight, Loader2, UserPlus, Maximize2, FileText, UserPlus2, TrendingUp } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import Link from 'next/link'
import React, { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, eachDayOfInterval } from 'date-fns'
import { ro } from 'date-fns/locale'
import { cn } from '@/lib/utils'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts'

const toSlug = (s: string) => String(s).toLowerCase().replace(/\s+/g, '-')

type Period = 'day' | 'week' | 'month'

type SalespersonRow = {
  id: string
  name: string
  total: number
  comanda: number
  curier_trimis: number
  office_direct: number
  noDeal: number
  callback: number
  nuRaspunde: number
  fise_count: number
}

export default function StatisticiApeluriPage() {
  const { hasAccess, profile, loading: authLoading } = useAuthContext()
  const { getPipelines } = usePipelinesCache()
  const [allowed, setAllowed] = useState<boolean | null>(null)
  const [salespeople, setSalespeople] = useState<VanzariSalespersonOption[]>([])
  const [rows, setRows] = useState<SalespersonRow[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [leadsByUser, setLeadsByUser] = useState<Record<string, LeadsByTypeForUser>>({})
  const [loadingLeads, setLoadingLeads] = useState<string | null>(null)
  const [period, setPeriod] = useState<Period>('day')
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date())
  const [backfilling, setBackfilling] = useState(false)
  const [atribuieOpen, setAtribuieOpen] = useState(false)
  const [atribuieLeadId, setAtribuieLeadId] = useState<string>('')
  const [atribuieLeadLabel, setAtribuieLeadLabel] = useState<string>('')
  const [atribuieUserId, setAtribuieUserId] = useState<string>('')
  const [atribuieStatus, setAtribuieStatus] = useState<string>('')
  const [atribuieDate, setAtribuieDate] = useState<Date>(() => new Date())
  const [atribuieLoading, setAtribuieLoading] = useState(false)
  const [leadSearchQ, setLeadSearchQ] = useState('')
  const [leadSearchResults, setLeadSearchResults] = useState<{ id: string; title: string; subtitle?: string }[]>([])
  const [leadSearching, setLeadSearching] = useState(false)
  const [leadSearchOpen, setLeadSearchOpen] = useState(false)
  const [leadDetailOpen, setLeadDetailOpen] = useState<LeadByTypeItem | null>(null)
  const [leadsCreated, setLeadsCreated] = useState<LeadCreatedItem[]>([])
  const [leadsCreatedExpanded, setLeadsCreatedExpanded] = useState(false)
  const [leadCreatedDetailOpen, setLeadCreatedDetailOpen] = useState<LeadCreatedItem | null>(null)
  const [report, setReport] = useState<StatisticiApeluriReport | null>(null)

  const loadAccess = useCallback(async () => {
    try {
      const data = await getPipelines()
      if (!data?.length) { setAllowed(false); return }
      const vanzari = data.find((p: any) => toSlug(p?.name || '') === 'vanzari' || (p?.name || '').toLowerCase().includes('vanzari'))
      if (!vanzari) { setAllowed(false); return }
      const ok = profile?.role === 'owner' || profile?.role === 'admin' || profile?.role === 'vanzator' || hasAccess(vanzari.id)
      setAllowed(ok)
    } catch { setAllowed(false) }
  }, [getPipelines, hasAccess, profile?.role])

  useEffect(() => {
    if (authLoading) return
    loadAccess()
  }, [authLoading, loadAccess])

  const loadData = useCallback(async () => {
    try {
      const people = await listVanzariSalespeople()
      setSalespeople(people)

      let dates: Date[]
      if (period === 'day') {
        dates = [selectedDate]
      } else if (period === 'week') {
        const start = startOfWeek(selectedDate, { weekStartsOn: 1 })
        const end = endOfWeek(selectedDate, { weekStartsOn: 1 })
        dates = eachDayOfInterval({ start, end })
      } else {
        const start = startOfMonth(selectedDate)
        const end = endOfMonth(selectedDate)
        dates = eachDayOfInterval({ start, end })
      }

      const rangeStart = new Date(dates[0])
      rangeStart.setHours(0, 0, 0, 0)
      const rangeEnd = new Date(dates[dates.length - 1])
      rangeEnd.setHours(23, 59, 59, 999)

      const [results, createdList] = await Promise.all([
        Promise.all(people.map(async (sp) => {
          const dayResults = await Promise.all(
            dates.map((d) => fetchVanzariApeluriForDate(d, sp.id))
          )
          const totals = dayResults.reduce(
            (acc, r) => ({
              total: acc.total + r.total,
              comanda: acc.comanda + r.byType.comanda,
              curier_trimis: acc.curier_trimis + r.curier_trimis,
              office_direct: acc.office_direct + r.office_direct,
              noDeal: acc.noDeal + r.byType.noDeal,
              callback: acc.callback + r.byType.callback,
              nuRaspunde: acc.nuRaspunde + r.byType.nuRaspunde,
              fise_count: 0, // nu sumăm per zi – evitate dublare
            }),
            { total: 0, comanda: 0, curier_trimis: 0, office_direct: 0, noDeal: 0, callback: 0, nuRaspunde: 0, fise_count: 0 }
          )
          // Fise: un singur apel pentru întreaga perioadă
          totals.fise_count = await fetchFiseCountForUser(sp.id, rangeStart, rangeEnd)
          return { id: sp.id, name: sp.name, ...totals }
        })),
        fetchLeadsCreatedForDateRange(rangeStart, rangeEnd),
      ])

      setRows(results.sort((a, b) => b.total - a.total))
      setLeadsCreated(createdList)
      setLeadsByUser({})
      setExpandedId(null)
    } catch (e) {
      console.error(e)
      toast.error('Eroare la încărcarea statisticilor')
    }
  }, [period, selectedDate])

  useEffect(() => {
    if (allowed !== true) return
    setLoading(true)
    loadData().finally(() => setLoading(false))
  }, [allowed, loadData])

  const handleRefresh = async () => {
    setRefreshing(true)
    await loadData()
    setRefreshing(false)
  }

  const toggleExpand = useCallback(async (rowId: string) => {
    if (expandedId === rowId) {
      setExpandedId(null)
      return
    }
    if (leadsByUser[rowId]) {
      setExpandedId(rowId)
      return
    }
    setLoadingLeads(rowId)
    try {
      let dates: Date[]
      if (period === 'day') {
        dates = [selectedDate]
      } else if (period === 'week') {
        const start = startOfWeek(selectedDate, { weekStartsOn: 1 })
        const end = endOfWeek(selectedDate, { weekStartsOn: 1 })
        dates = eachDayOfInterval({ start, end })
      } else {
        const start = startOfMonth(selectedDate)
        const end = endOfMonth(selectedDate)
        dates = eachDayOfInterval({ start, end })
      }
      const start = new Date(dates[0])
      start.setHours(0, 0, 0, 0)
      const end = new Date(dates[dates.length - 1])
      end.setHours(23, 59, 59, 999)
      const data = await fetchLeadsByTypeForUser(rowId, start, end)
      setLeadsByUser((prev) => ({ ...prev, [rowId]: data }))
      setExpandedId(rowId)
    } catch (e) {
      console.error(e)
      toast.error('Eroare la încărcarea lead-urilor')
    } finally {
      setLoadingLeads(null)
    }
  }, [expandedId, leadsByUser, period, selectedDate])

  const handleBackfill = async () => {
    if (profile?.role !== 'owner') return
    setBackfilling(true)
    try {
      const res = await fetch('/api/owner/backfill-vanzari-apeluri', { method: 'POST', credentials: 'include' })
      const data = await res.json()
      if (!res.ok) {
        if (res.status === 401) throw new Error('Sesiune expirată. Te rugăm să te reconectezi.')
        throw new Error(data.error || 'Eroare la backfill')
      }
      toast.success(data.message || `Backfill: ${data.inserted} comenzi adăugate`)
      await loadData()
    } catch (e: any) {
      toast.error(e?.message || 'Eroare la backfill')
    } finally {
      setBackfilling(false)
    }
  }

  const handleAtribuieComenzi = async () => {
    if (profile?.role !== 'owner' || !atribuieUserId) return
    setAtribuieLoading(true)
    try {
      const res = await fetch(`/api/owner/backfill-vanzari-apeluri?atribuie=1&userId=${encodeURIComponent(atribuieUserId)}`, { method: 'POST', credentials: 'include' })
      const data = await res.json()
      if (!res.ok) {
        if (res.status === 401) throw new Error('Sesiune expirată. Te rugăm să te reconectezi.')
        throw new Error(data.error || 'Eroare la atribuire')
      }
      toast.success(data.message || `Atribuit: ${data.attributed ?? 0} comenzi, ${data.inserted ?? 0} înregistrări noi`)
      setAtribuieOpen(false)
      setAtribuieUserId('')
      await loadData()
    } catch (e: any) {
      toast.error(e?.message || 'Eroare la atribuire')
    } finally {
      setAtribuieLoading(false)
    }
  }

  const handleAtribuieApelManual = async () => {
    if (profile?.role !== 'owner' || !atribuieLeadId || !atribuieUserId || !atribuieStatus) return
    setAtribuieLoading(true)
    try {
      const apelAt = atribuieDate.toISOString()
      const res = await fetch('/api/owner/atribuie-apel-manual', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId: atribuieLeadId, userId: atribuieUserId, status: atribuieStatus, apelAt }),
      })
      const data = await res.json()
      if (!res.ok) {
        if (res.status === 401) throw new Error('Sesiune expirată. Te rugăm să te reconectezi.')
        throw new Error(data.error || 'Eroare la atribuire')
      }
      toast.success(data.message || 'Apel atribuit cu succes.')
      setAtribuieOpen(false)
      setAtribuieLeadId('')
      setAtribuieLeadLabel('')
      setAtribuieUserId('')
      setAtribuieStatus('')
      await loadData()
    } catch (e: any) {
      toast.error(e?.message || 'Eroare la atribuire')
    } finally {
      setAtribuieLoading(false)
    }
  }

  useEffect(() => {
    if (!leadSearchQ || leadSearchQ.trim().length < 2) {
      setLeadSearchResults([])
      return
    }
    const t = setTimeout(async () => {
      setLeadSearching(true)
      try {
        const res = await fetch(`/api/search/unified?q=${encodeURIComponent(leadSearchQ)}`)
        const json = await res.json()
        const items = (json.data || []).filter((x: any) => x.type === 'lead').slice(0, 10)
        setLeadSearchResults(items.map((x: any) => ({ id: x.id, title: x.title, subtitle: x.subtitle })))
      } catch {
        setLeadSearchResults([])
      } finally {
        setLeadSearching(false)
      }
    }, 300)
    return () => clearTimeout(t)
  }, [leadSearchQ])

  const grandTotal = rows.reduce((acc, r) => ({
    total: acc.total + r.total,
    comanda: acc.comanda + r.comanda,
    curier_trimis: acc.curier_trimis + r.curier_trimis,
    office_direct: acc.office_direct + r.office_direct,
    noDeal: acc.noDeal + r.noDeal,
    callback: acc.callback + r.callback,
    nuRaspunde: acc.nuRaspunde + r.nuRaspunde,
    fise_count: acc.fise_count + (r.fise_count ?? 0),
  }), { total: 0, comanda: 0, curier_trimis: 0, office_direct: 0, noDeal: 0, callback: 0, nuRaspunde: 0, fise_count: 0 })

  const periodLabel = period === 'day'
    ? format(selectedDate, 'd MMMM yyyy', { locale: ro })
    : period === 'week'
      ? `${format(startOfWeek(selectedDate, { weekStartsOn: 1 }), 'd MMM', { locale: ro })} – ${format(endOfWeek(selectedDate, { weekStartsOn: 1 }), 'd MMM yyyy', { locale: ro })}`
      : format(selectedDate, 'MMMM yyyy', { locale: ro })

  if (authLoading || allowed === null) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Skeleton className="h-10 w-60" />
      </div>
    )
  }

  if (allowed === false) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-muted-foreground">
        <Lock className="h-12 w-12" />
        <p className="text-lg font-medium">Nu ai acces la această pagină</p>
        <Link href="/dashboard">
          <Button variant="outline">Înapoi la Dashboard</Button>
        </Link>
      </div>
    )
  }

  return (
    <div className="flex flex-col min-h-0 overflow-hidden">
      {/* Header */}
      <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 sm:p-6 border-b flex-shrink-0 sticky top-0 bg-background z-10">
        <div className="flex items-center gap-3">
          <Link href="/dashboard">
            <Button variant="ghost" size="sm" className="gap-1.5">
              <ArrowLeft className="h-4 w-4" />
              Înapoi
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold">Statistici Apeluri</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              <Phone className="h-3.5 w-3.5 inline mr-1" />
              Apeluri per vânzător — {periodLabel}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
            <SelectTrigger className="w-[130px] h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="day">Zi</SelectItem>
              <SelectItem value="week">Săptămână</SelectItem>
              <SelectItem value="month">Lună</SelectItem>
            </SelectContent>
          </Select>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 gap-1.5">
                <CalendarDays className="h-4 w-4" />
                {format(selectedDate, 'd MMM yyyy', { locale: ro })}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={(d) => d && setSelectedDate(d)}
                locale={ro}
              />
            </PopoverContent>
          </Popover>

          <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={handleRefresh} disabled={refreshing || loading}>
            <RefreshCw className={cn("h-4 w-4", (refreshing || loading) && "animate-spin")} />
            Reîmprospătează
          </Button>

          {profile?.role === 'owner' && (
            <>
              <Button variant="secondary" size="sm" className="h-9 gap-1.5" onClick={handleBackfill} disabled={backfilling || loading}>
                <RefreshCw className={cn("h-4 w-4", backfilling && "animate-spin")} />
                {backfilling ? 'Backfill...' : 'Backfill comenzi'}
              </Button>
              <Dialog open={atribuieOpen} onOpenChange={(o) => {
                  setAtribuieOpen(o)
                  if (!o) {
                    setLeadSearchQ('')
                    setLeadSearchResults([])
                    setLeadSearchOpen(false)
                    setAtribuieLeadId('')
                    setAtribuieLeadLabel('')
                    setAtribuieStatus('')
                  }
                }}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm" className="h-9 gap-1.5">
                    <UserPlus className="h-4 w-4" />
                    Atribuie apel manual
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle>Atribuie apel manual</DialogTitle>
                    <DialogDescription>
                      Selectează lead-ul, vânzătorul și statusul (Comandă, No Deal, Callback, Nu Răspunde) pentru a adăuga în statistici.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-4 py-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Lead</label>
                      <div className="relative">
                        <input
                          type="text"
                          placeholder="Caută lead (nume, email, telefon)..."
                          value={atribuieLeadId ? atribuieLeadLabel : leadSearchQ}
                          onChange={(e) => {
                            if (atribuieLeadId) { setAtribuieLeadId(''); setAtribuieLeadLabel(''); }
                            setLeadSearchQ(e.target.value)
                            setLeadSearchOpen(true)
                          }}
                          onFocus={() => setLeadSearchOpen(true)}
                          onBlur={() => setTimeout(() => setLeadSearchOpen(false), 200)}
                          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                        />
                        {atribuieLeadId && (
                          <Button type="button" variant="ghost" size="sm" className="absolute right-1 top-1 h-7 text-xs" onClick={() => { setAtribuieLeadId(''); setAtribuieLeadLabel(''); setLeadSearchQ(''); }}>
                            Șterge
                          </Button>
                        )}
                        {leadSearchOpen && leadSearchQ.length >= 2 && (
                          <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover p-1 shadow-md max-h-48 overflow-auto">
                            {leadSearching ? (
                              <div className="py-2 text-center text-sm text-muted-foreground">Se caută...</div>
                            ) : leadSearchResults.length === 0 ? (
                              <div className="py-2 text-center text-sm text-muted-foreground">Niciun rezultat</div>
                            ) : (
                              leadSearchResults.map((r) => (
                                <button
                                  key={r.id}
                                  type="button"
                                  className="w-full text-left px-2 py-1.5 text-sm rounded hover:bg-accent"
                                  onMouseDown={(e) => {
                                    e.preventDefault()
                                    setAtribuieLeadId(r.id)
                                    setAtribuieLeadLabel(r.title || r.subtitle || r.id)
                                    setLeadSearchQ('')
                                    setLeadSearchResults([])
                                    setLeadSearchOpen(false)
                                  }}
                                >
                                  {r.title || r.subtitle || r.id}
                                </button>
                              ))
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Vânzător</label>
                      <Select value={atribuieUserId} onValueChange={setAtribuieUserId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Selectează vânzătorul" />
                        </SelectTrigger>
                        <SelectContent>
                          {salespeople.map((sp) => (
                            <SelectItem key={sp.id} value={sp.id}>{sp.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Status</label>
                      <Select value={atribuieStatus} onValueChange={setAtribuieStatus}>
                        <SelectTrigger>
                          <SelectValue placeholder="Selectează statusul" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="comanda">Comandă</SelectItem>
                          <SelectItem value="noDeal">No Deal</SelectItem>
                          <SelectItem value="callback">Callback</SelectItem>
                          <SelectItem value="nuRaspunde">Nu Răspunde</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Data apelului</label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" size="sm" className="w-full justify-start text-left font-normal">
                            <CalendarDays className="mr-2 h-4 w-4" />
                            {format(atribuieDate, 'd MMM yyyy', { locale: ro })}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar mode="single" selected={atribuieDate} onSelect={(d) => d && setAtribuieDate(d)} locale={ro} />
                        </PopoverContent>
                      </Popover>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setAtribuieOpen(false)}>Anulează</Button>
                    <Button
                      onClick={handleAtribuieApelManual}
                      disabled={!atribuieLeadId || !atribuieUserId || !atribuieStatus || atribuieLoading}
                    >
                      {atribuieLoading ? 'Se procesează...' : 'Atribuie'}
                    </Button>
                  </DialogFooter>
                  <div className="border-t pt-3 mt-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full text-muted-foreground"
                      onClick={handleAtribuieComenzi}
                      disabled={!atribuieUserId || atribuieLoading}
                    >
                      Găsește automat comenzi neînregistrate pentru vânzătorul selectat
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </>
          )}
        </div>
      </header>

      {/* Conținut scrollabil - NOU DESIGN */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 bg-slate-50/50">
        
        {/* Top Section: Metrics + Volume Chart + Promo */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
          
          {/* Left Side: 4 Metric Cards */}
          <div className="xl:col-span-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
            
            {/* Total Apeluri */}
            <Card className="rounded-2xl border-0 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] bg-white overflow-hidden">
              <CardContent className="p-5 flex flex-col justify-between h-full">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                      <Phone className="h-4 w-4" />
                    </div>
                    <span className="font-semibold text-slate-800">Total Apeluri</span>
                  </div>
                  <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground"><span className="text-xl leading-none -mt-2">...</span></Button>
                </div>
                <div>
                  <h3 className="text-4xl font-bold text-slate-900 mb-2">{loading ? '...' : grandTotal.total}</h3>
                  <div className="flex items-center gap-1.5 text-sm">
                    <span className="text-emerald-500 font-medium">100%</span>
                    <span className="text-slate-400">Total volume</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Comenzi / Total Revenue */}
            <Card className="rounded-2xl border-0 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] bg-white overflow-hidden">
              <CardContent className="p-5 flex flex-col justify-between h-full">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
                      <FileText className="h-4 w-4" />
                    </div>
                    <span className="font-semibold text-slate-800">Comenzi</span>
                  </div>
                  <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground"><span className="text-xl leading-none -mt-2">...</span></Button>
                </div>
                <div>
                  <h3 className="text-4xl font-bold text-slate-900 mb-2">{loading ? '...' : grandTotal.comanda}</h3>
                  <div className="flex items-center gap-1.5 text-sm">
                    <span className="text-blue-500 font-medium">{grandTotal.curier_trimis} Curier</span>
                    <span className="text-slate-400">/ {grandTotal.office_direct} Office</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Conversie / Total Customers */}
            <Card className="rounded-2xl border-0 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] bg-white overflow-hidden">
              <CardContent className="p-5 flex flex-col justify-between h-full">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <div className="p-2 bg-teal-50 text-teal-600 rounded-lg">
                      <UserPlus className="h-4 w-4" />
                    </div>
                    <span className="font-semibold text-slate-800">Rată Conversie</span>
                  </div>
                  <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground"><span className="text-xl leading-none -mt-2">...</span></Button>
                </div>
                <div>
                  <h3 className="text-4xl font-bold text-slate-900 mb-2">
                    {loading || grandTotal.total === 0 ? '0.0' : ((grandTotal.comanda / grandTotal.total) * 100).toFixed(1)}%
                  </h3>
                  <div className="flex items-center gap-1.5 text-sm">
                    <span className="text-emerald-500 font-medium">↗</span>
                    <span className="text-slate-400">Succes apeluri</span>
                  </div>
                </div>
              </CardContent>
            </Card>

             {/* Oportunități pierdute / Total Return */}
             <Card className="rounded-2xl border-0 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] bg-white overflow-hidden">
              <CardContent className="p-5 flex flex-col justify-between h-full">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <div className="p-2 bg-red-50 text-red-600 rounded-lg">
                      <Phone className="h-4 w-4" />
                    </div>
                    <span className="font-semibold text-slate-800">Ratate & Refuzuri</span>
                  </div>
                  <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground"><span className="text-xl leading-none -mt-2">...</span></Button>
                </div>
                <div>
                  <h3 className="text-4xl font-bold text-slate-900 mb-2">{loading ? '...' : (grandTotal.noDeal + grandTotal.nuRaspunde)}</h3>
                  <div className="flex items-center gap-1.5 text-sm">
                    <span className="text-red-500 font-medium">{grandTotal.noDeal} No Deal</span>
                    <span className="text-slate-400">/ {grandTotal.nuRaspunde} Lipsă răspuns</span>
                  </div>
                </div>
              </CardContent>
            </Card>

          </div>

          {/* Middle: Volume / Distribution Chart */}
          <div className="xl:col-span-4">
            <Card className="h-full rounded-2xl border-0 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] bg-white">
              <CardHeader className="pb-0 pt-5 px-5 flex flex-row items-center justify-between">
                <CardTitle className="text-lg font-bold text-slate-800">Distribuție Apeluri</CardTitle>
                <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground"><span className="text-xl leading-none -mt-2">...</span></Button>
              </CardHeader>
              <CardContent className="p-5 h-[240px]">
                {loading ? (
                  <Skeleton className="w-full h-full rounded-xl" />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={[
                      { name: 'Comenzi', val: grandTotal.comanda, fill: '#3b82f6' },
                      { name: 'No Deal', val: grandTotal.noDeal, fill: '#ef4444' },
                      { name: 'Fără răsp', val: grandTotal.nuRaspunde, fill: '#f97316' },
                      { name: 'Callback', val: grandTotal.callback, fill: '#f59e0b' }
                    ]} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} dy={10} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                      <RechartsTooltip 
                        cursor={{ fill: 'rgba(241, 245, 249, 0.5)' }}
                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
                      />
                      <Bar dataKey="val" radius={[6, 6, 6, 6]} barSize={40}>
                        {
                          [
                            { name: 'Comenzi', val: grandTotal.comanda, fill: '#3b82f6' },
                            { name: 'No Deal', val: grandTotal.noDeal, fill: '#bac5d6' },
                            { name: 'Fără răsp', val: grandTotal.nuRaspunde, fill: '#dbeafe' },
                            { name: 'Callback', val: grandTotal.callback, fill: '#93c5fd' }
                          ].map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.fill} />
                          ))
                        }
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right Side: Promo Action Card */}
          <div className="xl:col-span-3">
             <div className="h-full rounded-2xl bg-gradient-to-br from-blue-600 to-blue-500 p-6 text-white shadow-lg flex flex-col justify-between relative overflow-hidden">
                {/* Decorative shapes */}
                <div className="absolute top-0 right-0 -mr-8 -mt-8 w-32 h-32 rounded-full bg-white opacity-10"></div>
                <div className="absolute bottom-0 right-10 -mb-4 w-16 h-16 rounded-full bg-white opacity-10"></div>
                
                <div className="z-10">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="p-2 bg-white/20 rounded-lg">
                      <TrendingUp className="h-5 w-5 text-white" />
                    </div>
                  </div>
                  <h3 className="text-2xl font-bold mb-2">Crește Rata de Conversie!</h3>
                  <p className="text-blue-100 text-sm leading-relaxed mb-6">
                    Afișează performanțele, gestionează call-back-urile prompt și transformă lead-urile înenzi!
                  </p>
                </div>
                
                <Button className="w-full bg-white text-blue-600 hover:bg-blue-50 hover:text-blue-700 font-semibold rounded-xl h-12 z-10 shadow-sm transition-all hover:scale-[1.02]">
                  Acționează acum!
                </Button>
             </div>
          </div>
        </div>

        {/* Chart Evolution Recharts Replaces "Secțiune Leaduri create" */}
        <div className="grid grid-cols-1 gap-6">
           <Card className="col-span-1 rounded-2xl border-0 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] bg-white">
              <CardHeader className="pb-0 pt-6 px-6 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-lg font-bold text-slate-800">Evoluție Apeluri & Comenzi</CardTitle>
                </div>
                <div className="flex gap-2 bg-slate-100 p-1 rounded-lg">
                   <Button variant="ghost" size="sm" className="h-8 rounded-md bg-white shadow-sm text-xs font-medium text-slate-800">Curent</Button>
                   <Button variant="ghost" size="sm" className="h-8 rounded-md text-xs font-medium text-slate-500 hover:text-slate-800">Anterior</Button>
                </div>
              </CardHeader>
              <CardContent className="p-6 h-[320px]">
                 {loading ? (
                    <div className="w-full h-full flex items-center justify-center">
                       <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                    </div>
                 ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={rows} margin={{ top: 20, right: 0, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} dy={10} />
                        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                        <RechartsTooltip 
                          cursor={{ fill: 'rgba(241, 245, 249, 0.4)' }}
                          contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', padding: '12px' }}
                        />
                        <Bar name="Apeluri Total" dataKey="total" fill="#e2e8f0" radius={[6, 6, 6, 6]} barSize={32} />
                        <Bar name="Comenzi" dataKey="comanda" fill="#3b82f6" radius={[6, 6, 6, 6]} barSize={32} />
                      </BarChart>
                    </ResponsiveContainer>
                 )}
              </CardContent>
           </Card>
        </div>

        {/* Tabel Angajați Replaces "Detalii per vânzător" */}
        <Card className="rounded-2xl border-0 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] bg-white overflow-hidden">
          <CardHeader className="pb-4 pt-6 px-6 flex flex-row items-center justify-between border-b border-slate-100">
            <CardTitle className="text-lg font-bold text-slate-800">Detalii Vânzători</CardTitle>
            <div className="flex items-center gap-3 relative">
               <div className="relative">
                 <input 
                   type="text" 
                   placeholder="Caută vânzător..." 
                   className="pl-9 pr-4 py-2 bg-slate-50 border-transparent focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-200 rounded-xl text-sm transition-all outline-none w-[200px]"
                 />
                 <svg className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                 </svg>
               </div>
               <Button variant="outline" className="h-9 rounded-xl border-slate-200 text-slate-600 gap-2">
                 <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                 </svg>
                 Filtru
               </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-6 space-y-4">
                {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-12 w-full rounded-xl" />)}
              </div>
            ) : rows.length === 0 ? (
              <div className="p-12 text-center text-slate-400">
                <Phone className="h-10 w-10 mx-auto mb-3 opacity-20" />
                <p className="font-medium text-slate-500">Nu există apeluri înregistrate pentru această perioadă.</p>
              </div>
            ) : (
              <div className="overflow-x-auto p-4">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-slate-500 border-b border-slate-100">
                      <th className="text-left py-3 px-4 font-semibold">Vânzător</th>
                      <th className="text-center py-3 px-4 font-semibold">Total Apeluri</th>
                      <th className="text-center py-3 px-4 font-semibold">Rată Conversie</th>
                      <th className="text-center py-3 px-4 font-semibold">Comenzi</th>
                      <th className="text-center py-3 px-4 font-semibold">Curier/Office</th>
                      <th className="text-center py-3 px-4 font-semibold">Pierdute</th>
                      <th className="text-center py-3 px-4 font-semibold w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => {
                      const conversionRate = row.total > 0 ? ((row.comanda / row.total) * 100).toFixed(1) : '0.0'
                      const isExpanded = expandedId === row.id
                      const leads = leadsByUser[row.id]
                      const isLoadingLeads = loadingLeads === row.id
                      const hasAnyLeads = row.total > 0
                      
                      return (
                        <React.Fragment key={row.id}>
                          <tr className={cn("transition-colors group", !isExpanded && "hover:bg-slate-50/80", isExpanded && "bg-blue-50/30")}>
                            <td className="py-3 px-4 rounded-l-xl">
                              <div className="flex items-center gap-3">
                                <div className="h-8 w-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-xs">
                                  {row.name.substring(0, 2).toUpperCase()}
                                </div>
                                <span className="font-semibold text-slate-800">{row.name}</span>
                              </div>
                            </td>
                            <td className="py-3 px-4 text-center font-medium text-slate-700">{row.total}</td>
                            <td className="py-3 px-4 text-center">
                               <span className={cn(
                                "px-2.5 py-1 rounded-lg text-xs font-bold",
                                Number(conversionRate) >= 30 ? "bg-emerald-50 text-emerald-600" :
                                Number(conversionRate) >= 15 ? "bg-amber-50 text-amber-600" :
                                "bg-red-50 text-red-600"
                              )}>
                                {conversionRate}%
                              </span>
                            </td>
                            <td className="py-3 px-4 text-center font-bold text-blue-600">{row.comanda}</td>
                            <td className="py-3 px-4 text-center text-slate-500">
                              <span className="text-blue-500">{row.curier_trimis}</span> / <span className="text-violet-500">{row.office_direct}</span>
                            </td>
                            <td className="py-3 px-4 text-center text-slate-500">
                               <span className="text-red-500">{row.noDeal}</span> + <span className="text-orange-500">{row.nuRaspunde}</span>
                            </td>
                            <td className="py-3 px-4 text-center rounded-r-xl">
                               {hasAnyLeads && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => toggleExpand(row.id)}
                                    disabled={isLoadingLeads}
                                    className="h-8 w-8 text-slate-400 hover:text-blue-600 hover:bg-blue-50 opacity-0 group-hover:opacity-100 transition-all rounded-lg"
                                  >
                                    {isLoadingLeads ? (
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : isExpanded ? (
                                      <ChevronDown className="h-4 w-4" />
                                    ) : (
                                      <ChevronRight className="h-4 w-4" />
                                    )}
                                  </Button>
                                )}
                            </td>
                          </tr>
                          
                          {/* Expanded Leads View */}
                          {isExpanded && leads && (
                            <tr>
                              <td colSpan={7} className="p-0 border-b border-slate-100">
                                <div className="px-16 py-4 bg-slate-50/50 inner-shadow-sm">
                                  <div className="flex items-center justify-between mb-3">
                                     <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Lead-uri procesate de {row.name}</h4>
                                     {leads.comanda.length > 0 && <span className="text-xs font-medium bg-white border border-slate-200 px-2 py-1 rounded-md text-slate-600">{leads.comanda.length} Comenzi aduse</span>}
                                  </div>
                                  
                                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                     {/* Comenzi List */}
                                     {leads.comanda.length > 0 && (
                                        <div className="bg-white p-3 rounded-xl border border-slate-100 shadow-sm max-h-48 overflow-y-auto">
                                           <h5 className="text-xs font-semibold text-emerald-600 flex items-center gap-1.5 mb-2 border-b border-slate-50 pb-2"><div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>Comenzi</h5>
                                           <ul className="space-y-2">
                                              {leads.comanda.map(l => (
                                                <li key={l.lead_id} className="text-xs flex items-center justify-between group">
                                                   <span className="text-slate-700 font-medium truncate shrink">{l.lead_name || 'Fără nume'}</span>
                                                   <Link href={`/leads/vanzari?openLeadId=${l.lead_id}`} className="text-emerald-500 opacity-0 group-hover:opacity-100 transition-opacity p-1">→ </Link>
                                                </li>
                                              ))}
                                           </ul>
                                        </div>
                                     )}
                                     
                                     {/* Callback List */}
                                     {leads.callback.length > 0 && (
                                        <div className="bg-white p-3 rounded-xl border border-slate-100 shadow-sm max-h-48 overflow-y-auto">
                                           <h5 className="text-xs font-semibold text-amber-500 flex items-center gap-1.5 mb-2 border-b border-slate-50 pb-2"><div className="w-1.5 h-1.5 rounded-full bg-amber-500"></div>Așteaptă revenire</h5>
                                           <ul className="space-y-2">
                                              {leads.callback.map(l => (
                                                <li key={l.lead_id} className="text-xs flex items-center justify-between group">
                                                   <span className="text-slate-700 font-medium truncate shrink">{l.lead_name || 'Fără nume'}</span>
                                                   <Link href={`/leads/vanzari?openLeadId=${l.lead_id}`} className="text-amber-500 opacity-0 group-hover:opacity-100 transition-opacity p-1">→ </Link>
                                                </li>
                                              ))}
                                           </ul>
                                        </div>
                                     )}

                                     {/* Nu răspunde List */}
                                      {leads.nuRaspunde.length > 0 && (
                                        <div className="bg-white p-3 rounded-xl border border-slate-100 shadow-sm max-h-48 overflow-y-auto">
                                           <h5 className="text-xs font-semibold text-orange-500 flex items-center gap-1.5 mb-2 border-b border-slate-50 pb-2"><div className="w-1.5 h-1.5 rounded-full bg-orange-500"></div>Nu răspund</h5>
                                           <ul className="space-y-2">
                                              {leads.nuRaspunde.map(l => (
                                                <li key={l.lead_id} className="text-xs flex items-center justify-between group">
                                                   <span className="text-slate-700 font-medium truncate shrink">{l.lead_name || 'Fără nume'}</span>
                                                   <Link href={`/leads/vanzari?openLeadId=${l.lead_id}`} className="text-orange-500 opacity-0 group-hover:opacity-100 transition-opacity p-1">→ </Link>
                                                </li>
                                              ))}
                                           </ul>
                                        </div>
                                     )}

                                     {/* No Deal List */}
                                     {leads.noDeal.length > 0 && (
                                        <div className="bg-white p-3 rounded-xl border border-slate-100 shadow-sm max-h-48 overflow-y-auto">
                                           <h5 className="text-xs font-semibold text-red-500 flex items-center gap-1.5 mb-2 border-b border-slate-50 pb-2"><div className="w-1.5 h-1.5 rounded-full bg-red-500"></div>Pierdute (No Deal)</h5>
                                           <ul className="space-y-2">
                                              {leads.noDeal.map(l => (
                                                <li key={l.lead_id} className="text-xs flex items-center justify-between group">
                                                   <span className="text-slate-700 font-medium truncate shrink">{l.lead_name || 'Fără nume'}</span>
                                                   <Link href={`/leads/vanzari?openLeadId=${l.lead_id}`} className="text-red-500 opacity-0 group-hover:opacity-100 transition-opacity p-1">→ </Link>
                                                </li>
                                              ))}
                                           </ul>
                                        </div>
                                     )}

                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>



      {/* Dialog detalii lead (din apeluri) */}
      <Dialog open={!!leadDetailOpen} onOpenChange={(o) => !o && setLeadDetailOpen(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Detalii lead</DialogTitle>
            <DialogDescription>
              Nume și date de contact ale lead-ului
            </DialogDescription>
          </DialogHeader>
          {leadDetailOpen && (
            <div className="space-y-4 py-2">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Nume</p>
                <p className="font-medium">{leadDetailOpen.lead_name || 'Fără nume'}</p>
              </div>
              {leadDetailOpen.email && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Email</p>
                  <p className="text-sm">{leadDetailOpen.email}</p>
                </div>
              )}
              {leadDetailOpen.phone && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Telefon</p>
                  <p className="text-sm">{leadDetailOpen.phone}</p>
                </div>
              )}
              {leadDetailOpen.company_name && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Companie</p>
                  <p className="text-sm">{leadDetailOpen.company_name}</p>
                </div>
              )}
              {leadDetailOpen.contact_person && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Persoană contact</p>
                  <p className="text-sm">{leadDetailOpen.contact_person}</p>
                </div>
              )}
              {leadDetailOpen.billing_nume_prenume && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Facturare</p>
                  <p className="text-sm">{leadDetailOpen.billing_nume_prenume}</p>
                </div>
              )}
              <div className="flex items-center gap-2 pt-2">
                {leadDetailOpen.livrare && (
                  <span className={cn(
                    "px-2 py-1 rounded text-xs font-medium",
                    leadDetailOpen.livrare === 'curier_trimis' && "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
                    leadDetailOpen.livrare === 'office_direct' && "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300"
                  )}>
                    {leadDetailOpen.livrare === 'curier_trimis' ? 'Curier trimis' : 'Office direct'}
                  </span>
                )}
                {(leadDetailOpen.fise_count ?? 0) > 0 && (
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300">
                    <FileText className="h-3 w-3" />
                    {leadDetailOpen.fise_count} fișe
                  </span>
                )}
              </div>
              <Link href={`/leads/vanzari?openLeadId=${leadDetailOpen.lead_id}`}>
                <Button variant="outline" size="sm" className="w-full mt-2">
                  Deschide lead în pipeline →
                </Button>
              </Link>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog detalii lead (din secțiunea Leaduri create) */}
      <Dialog open={!!leadCreatedDetailOpen} onOpenChange={(o) => !o && setLeadCreatedDetailOpen(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Detalii lead</DialogTitle>
            <DialogDescription>
              Nume și date de contact ale lead-ului creat
            </DialogDescription>
          </DialogHeader>
          {leadCreatedDetailOpen && (
            <div className="space-y-4 py-2">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Nume</p>
                <p className="font-medium">{leadCreatedDetailOpen.lead_name || 'Fără nume'}</p>
              </div>
              {leadCreatedDetailOpen.email && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Email</p>
                  <p className="text-sm">{leadCreatedDetailOpen.email}</p>
                </div>
              )}
              {leadCreatedDetailOpen.phone && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Telefon</p>
                  <p className="text-sm">{leadCreatedDetailOpen.phone}</p>
                </div>
              )}
              {leadCreatedDetailOpen.company_name && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Companie</p>
                  <p className="text-sm">{leadCreatedDetailOpen.company_name}</p>
                </div>
              )}
              {leadCreatedDetailOpen.contact_person && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Persoană contact</p>
                  <p className="text-sm">{leadCreatedDetailOpen.contact_person}</p>
                </div>
              )}
              {leadCreatedDetailOpen.billing_nume_prenume && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Facturare</p>
                  <p className="text-sm">{leadCreatedDetailOpen.billing_nume_prenume}</p>
                </div>
              )}
              <div className="flex items-center gap-2 pt-2 flex-wrap">
                {leadCreatedDetailOpen.created_by_name && (
                  <span className="px-2 py-1 rounded text-xs font-medium bg-muted">
                    Creat de: {leadCreatedDetailOpen.created_by_name}
                  </span>
                )}
                {leadCreatedDetailOpen.claimed_by_name && (
                  <span className="px-2 py-1 rounded text-xs font-medium bg-muted">
                    Preluat: {leadCreatedDetailOpen.claimed_by_name}
                  </span>
                )}
                {leadCreatedDetailOpen.curier_trimis_at && (
                  <span className="px-2 py-1 rounded text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                    Curier trimis
                  </span>
                )}
                {leadCreatedDetailOpen.office_direct_at && (
                  <span className="px-2 py-1 rounded text-xs font-medium bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300">
                    Office direct
                  </span>
                )}
                {(leadCreatedDetailOpen.fise_count ?? 0) > 0 && (
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300">
                    <FileText className="h-3 w-3" />
                    {leadCreatedDetailOpen.fise_count} fișe
                  </span>
                )}
              </div>
              <Link href={`/leads/vanzari?openLeadId=${leadCreatedDetailOpen.id}`}>
                <Button variant="outline" size="sm" className="w-full mt-2">
                  Deschide lead în pipeline →
                </Button>
              </Link>
            </div>
          )}
        </DialogContent>
      </Dialog>
      </div>
    </div>
  )
}
