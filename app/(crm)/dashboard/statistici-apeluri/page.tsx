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
  type ApeluriByType,
  type VanzariSalespersonOption,
  type LeadsByTypeForUser,
  type LeadByTypeItem,
  type LeadCreatedItem,
} from '@/lib/supabase/vanzariApeluri'
import { Lock, Phone, RefreshCw, CalendarDays, ArrowLeft, ChevronDown, ChevronRight, Loader2, UserPlus, Maximize2, FileText, UserPlus2 } from 'lucide-react'
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

      {/* Conținut scrollabil */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
        {/* Summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total Apeluri</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p className="text-2xl font-bold">{loading ? '...' : grandTotal.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-xs font-medium text-emerald-600 uppercase tracking-wider">Comenzi</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p className="text-2xl font-bold text-emerald-600">{loading ? '...' : grandTotal.comanda}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-xs font-medium text-teal-600 uppercase tracking-wider">Fise</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p className="text-2xl font-bold text-teal-600">{loading ? '...' : grandTotal.fise_count}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-xs font-medium text-blue-600 uppercase tracking-wider">Curier trimis</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p className="text-2xl font-bold text-blue-600">{loading ? '...' : grandTotal.curier_trimis}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-xs font-medium text-violet-600 uppercase tracking-wider">Office direct</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p className="text-2xl font-bold text-violet-600">{loading ? '...' : grandTotal.office_direct}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-xs font-medium text-red-600 uppercase tracking-wider">No Deal</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p className="text-2xl font-bold text-red-600">{loading ? '...' : grandTotal.noDeal}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-xs font-medium text-amber-600 uppercase tracking-wider">Callback</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p className="text-2xl font-bold text-amber-600">{loading ? '...' : grandTotal.callback}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-xs font-medium text-orange-600 uppercase tracking-wider">Nu Răspunde</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p className="text-2xl font-bold text-orange-600">{loading ? '...' : grandTotal.nuRaspunde}</p>
          </CardContent>
        </Card>
      </div>

      {/* Secțiune Leaduri create */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <UserPlus2 className="h-5 w-5 text-primary" />
              Leaduri create din alte surse {period === 'day' ? (format(selectedDate, 'd MMM yyyy', { locale: ro }) === format(new Date(), 'd MMM yyyy', { locale: ro }) ? 'astăzi' : `pe ${format(selectedDate, 'd MMM yyyy', { locale: ro })}`) : `în perioada selectată`}
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setLeadsCreatedExpanded(!leadsCreatedExpanded)}
              className="gap-1"
            >
              {leadsCreatedExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              {leadsCreatedExpanded ? 'Ascunde' : 'Afișează'}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-16 w-full" />
          ) : (
            <>
              <div className="flex items-center gap-4 mb-4">
                <p className="text-2xl font-bold">{leadsCreated.length}</p>
                <p className="text-sm text-muted-foreground">
                  din alte surse (nu de utilizatori CRM)
                </p>
              </div>
              {leadsCreatedExpanded && leadsCreated.length > 0 && (
                <div className="space-y-4">
                  {/* Grupare pe claimed_by */}
                  {(() => {
                    const byClaimed = new Map<string | null, LeadCreatedItem[]>()
                    for (const l of leadsCreated) {
                      const key = l.claimed_by ?? '__neatribuit__'
                      if (!byClaimed.has(key)) byClaimed.set(key, [])
                      byClaimed.get(key)!.push(l)
                    }
                    const claimedOrder = [...byClaimed.entries()].sort((a, b) => b[1].length - a[1].length)
                    return (
                      <div className="space-y-3">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Per vânzător (preluate)</p>
                        <div className="overflow-x-auto rounded-md border">
                          <table className="w-full text-sm">
                            <thead className="bg-muted/50">
                              <tr>
                                <th className="text-left p-2 font-medium">Vânzător</th>
                                <th className="text-right p-2 font-medium">Nr. leaduri</th>
                                <th className="text-right p-2 font-medium">Fise</th>
                                <th className="text-right p-2 font-medium">Curier / Office</th>
                              </tr>
                            </thead>
                            <tbody>
                              {claimedOrder.map(([key, items]) => {
                                const name = key === '__neatribuit__' ? 'Neatribuit' : (items[0]?.claimed_by_name ?? key)
                                const fiseTotal = items.reduce((s, i) => s + (i.fise_count ?? 0), 0)
                                const ct = items.filter((i) => i.curier_trimis_at).length
                                const od = items.filter((i) => i.office_direct_at).length
                                return (
                                  <tr key={key ?? 'null'} className="border-t">
                                    <td className="p-2 font-medium">{name}</td>
                                    <td className="p-2 text-right">{items.length}</td>
                                    <td className="p-2 text-right text-teal-600">{fiseTotal}</td>
                                    <td className="p-2 text-right">
                                      <span className="text-blue-600">{ct}</span>
                                      <span className="text-muted-foreground mx-1">/</span>
                                      <span className="text-violet-600">{od}</span>
                                    </td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        </div>
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider pt-2">Lista leaduri</p>
                        <div className="max-h-64 overflow-y-auto rounded-md border">
                          <table className="w-full text-sm">
                            <thead className="bg-muted/50 sticky top-0">
                              <tr>
                                <th className="text-left p-2 font-medium">Lead</th>
                                <th className="text-left p-2 font-medium">Creat de</th>
                                <th className="text-left p-2 font-medium">Preluat de</th>
                                <th className="text-center p-2 font-medium">Fise</th>
                                <th className="text-left p-2 font-medium">Livrare</th>
                                <th className="w-8 p-2" />
                                <th className="w-8 p-2" />
                              </tr>
                            </thead>
                            <tbody>
                              {leadsCreated.map((item) => (
                                <tr key={item.id} className="border-t border-border/40 hover:bg-muted/30">
                                  <td className="p-2 font-medium truncate max-w-[180px]" title={item.lead_name || item.id}>
                                    {item.lead_name || 'Fără nume'}
                                  </td>
                                  <td className="p-2 text-muted-foreground">{item.created_by_name ?? '—'}</td>
                                  <td className="p-2 text-muted-foreground">{item.claimed_by_name ?? '—'}</td>
                                  <td className="p-2 text-center">
                                    {item.fise_count > 0 ? (
                                      <span className="inline-flex items-center gap-1 text-teal-600">
                                        <FileText className="h-3.5 w-3.5" />
                                        {item.fise_count}
                                      </span>
                                    ) : (
                                      <span className="text-muted-foreground">—</span>
                                    )}
                                  </td>
                                  <td className="p-2">
                                    {item.curier_trimis_at ? (
                                      <span className="px-1.5 py-0.5 rounded text-xs bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">Curier</span>
                                    ) : item.office_direct_at ? (
                                      <span className="px-1.5 py-0.5 rounded text-xs bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300">Office</span>
                                    ) : (
                                      <span className="text-muted-foreground">—</span>
                                    )}
                                  </td>
                                  <td className="p-2">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-7 w-7 p-0"
                                      title="Maximizează – vezi datele leadului"
                                      onClick={() => setLeadCreatedDetailOpen(item)}
                                    >
                                      <Maximize2 className="h-3.5 w-3.5" />
                                    </Button>
                                  </td>
                                  <td className="p-2">
                                    <Link href={`/leads/vanzari?openLeadId=${item.id}`} className="text-primary hover:underline" title="Deschide lead">
                                      →
                                    </Link>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )
                  })()}
                </div>
              )}
              {leadsCreatedExpanded && leadsCreated.length === 0 && (
                <p className="text-sm text-muted-foreground py-4">Nu au fost create leaduri din alte surse în perioada selectată.</p>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Detalii per vânzător</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-3">
              {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : rows.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <Phone className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>Nu există apeluri înregistrate pentru această perioadă.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th className="text-left p-3 font-medium">Vânzător</th>
                    <th className="text-right p-3 font-medium">Total</th>
                    <th className="text-right p-3 font-medium text-emerald-600">Comenzi</th>
                    <th className="text-right p-3 font-medium text-teal-600">Fise</th>
                    <th className="text-right p-3 font-medium text-blue-600">Curier trimis</th>
                    <th className="text-right p-3 font-medium text-violet-600">Office direct</th>
                    <th className="text-right p-3 font-medium text-red-600">No Deal</th>
                    <th className="text-right p-3 font-medium text-amber-600">Callback</th>
                    <th className="text-right p-3 font-medium text-orange-600">Nu Răspunde</th>
                    <th className="text-right p-3 font-medium">Rată conversie</th>
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
                        <tr className={cn("border-b transition-colors", !isExpanded && "hover:bg-muted/20", isExpanded && "bg-muted/30")}>
                          <td className="p-3">
                            <div className="flex items-center gap-2">
                              {hasAnyLeads ? (
                                <button
                                  type="button"
                                  onClick={() => toggleExpand(row.id)}
                                  disabled={isLoadingLeads}
                                  className="p-0.5 rounded hover:bg-muted transition-colors disabled:opacity-50"
                                  title={isExpanded ? "Ascunde lead-urile" : "Afișează lead-urile prelucrate"}
                                >
                                  {isLoadingLeads ? (
                                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                                  ) : isExpanded ? (
                                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                  ) : (
                                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                  )}
                                </button>
                              ) : (
                                <span className="w-5" />
                              )}
                              <span className="font-medium">{row.name}</span>
                            </div>
                          </td>
                          <td className="p-3 text-right font-bold">{row.total}</td>
                          <td className="p-3 text-right text-emerald-600 font-semibold">{row.comanda}</td>
                          <td className="p-3 text-right text-teal-600" title="Fișe de serviciu create">
                            {row.fise_count ?? 0}
                          </td>
                          <td className="p-3 text-right text-blue-600">{row.curier_trimis}</td>
                          <td className="p-3 text-right text-violet-600">{row.office_direct}</td>
                          <td className="p-3 text-right text-red-600">{row.noDeal}</td>
                          <td className="p-3 text-right text-amber-600">{row.callback}</td>
                          <td className="p-3 text-right text-orange-600">{row.nuRaspunde}</td>
                          <td className="p-3 text-right">
                            <span className={cn(
                              "px-2 py-0.5 rounded-full text-xs font-medium",
                              Number(conversionRate) >= 30 ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" :
                              Number(conversionRate) >= 15 ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" :
                              "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                            )}>
                              {conversionRate}%
                            </span>
                          </td>
                        </tr>
                        {isExpanded && leads && (
                          <tr className="border-b bg-muted/20">
                            <td colSpan={10} className="p-0">
                              <div className="px-4 py-3 pl-12">
                                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                                  Lead-uri atribuite contului vânzătorului
                                </div>
                                <div className="max-h-48 overflow-y-auto rounded-md border border-border/60">
                                  {leads.comanda.length + leads.noDeal.length + leads.callback.length + leads.nuRaspunde.length === 0 ? (
                                    <div className="p-4 text-center text-muted-foreground text-sm">Nu există lead-uri atribuite contului în această perioadă</div>
                                  ) : (
                                    <table className="w-full text-sm">
                                      <thead className="bg-muted/50 sticky top-0">
                                        <tr>
                                          <th className="text-left p-2 font-medium">Lead</th>
                                          <th className="text-left p-2 font-medium">Rezultat</th>
                                          <th className="text-center p-2 font-medium">Fise</th>
                                          <th className="w-8 p-2" />
                                          <th className="w-8 p-2" />
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {[
                                          ...leads.comanda.map((i) => ({
                                            ...i,
                                            outcome: 'Comandă' as const,
                                            outcomeColor: 'text-emerald-600',
                                            livrare: (i as { livrare?: 'curier_trimis' | 'office_direct' }).livrare,
                                          })),
                                          ...leads.noDeal.map((i) => ({ ...i, outcome: 'No Deal' as const, outcomeColor: 'text-red-600', livrare: undefined })),
                                          ...leads.callback.map((i) => ({ ...i, outcome: 'Callback' as const, outcomeColor: 'text-amber-600', livrare: undefined })),
                                          ...leads.nuRaspunde.map((i) => ({ ...i, outcome: 'Nu Răspunde' as const, outcomeColor: 'text-orange-600', livrare: undefined })),
                                        ]
                                          .sort((a, b) => (a.lead_name || '').localeCompare(b.lead_name || ''))
                                          .map((item) => (
                                            <tr key={item.lead_id} className="border-t border-border/40 hover:bg-muted/30">
                                              <td className="p-2 font-medium truncate max-w-[200px]" title={item.lead_name || item.lead_id}>
                                                {item.lead_name || 'Fără nume'}
                                              </td>
                                              <td className={cn("p-2 font-medium", item.outcomeColor)}>
                                                <span>{item.outcome}</span>
                                                {item.outcome === 'Comandă' && item.livrare && (
                                                  <span className={cn(
                                                    "ml-1.5 px-1.5 py-0.5 rounded text-xs font-medium",
                                                    item.livrare === 'curier_trimis' && "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
                                                    item.livrare === 'office_direct' && "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300"
                                                  )}>
                                                    {item.livrare === 'curier_trimis' ? 'Curier trimis' : 'Office direct'}
                                                  </span>
                                                )}
                                              </td>
                                              <td className="p-2 text-center">
                                                {(item as LeadByTypeItem).fise_count != null && (item as LeadByTypeItem).fise_count > 0 ? (
                                                  <span className="inline-flex items-center gap-1 text-teal-600" title="Fișe create">
                                                    <FileText className="h-3.5 w-3.5" />
                                                    {(item as LeadByTypeItem).fise_count}
                                                  </span>
                                                ) : (
                                                  <span className="text-muted-foreground">—</span>
                                                )}
                                              </td>
                                              <td className="p-2">
                                                <Button
                                                  variant="ghost"
                                                  size="sm"
                                                  className="h-7 w-7 p-0"
                                                  title="Maximizează – vezi datele leadului"
                                                  onClick={() => setLeadDetailOpen(item as LeadByTypeItem)}
                                                >
                                                  <Maximize2 className="h-3.5 w-3.5" />
                                                </Button>
                                              </td>
                                              <td className="p-2">
                                                <Link
                                                  href={`/leads/vanzari?openLeadId=${item.lead_id}`}
                                                  className="text-primary hover:underline"
                                                  title="Deschide lead în pipeline"
                                                >
                                                  →
                                                </Link>
                                              </td>
                                            </tr>
                                          ))}
                                      </tbody>
                                    </table>
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
                <tfoot>
                  <tr className="bg-muted/60 font-bold">
                    <td className="p-3">TOTAL</td>
                    <td className="p-3 text-right">{grandTotal.total}</td>
                    <td className="p-3 text-right text-emerald-600">{grandTotal.comanda}</td>
                    <td className="p-3 text-right text-teal-600">{grandTotal.fise_count}</td>
                    <td className="p-3 text-right text-blue-600">{grandTotal.curier_trimis}</td>
                    <td className="p-3 text-right text-violet-600">{grandTotal.office_direct}</td>
                    <td className="p-3 text-right text-red-600">{grandTotal.noDeal}</td>
                    <td className="p-3 text-right text-amber-600">{grandTotal.callback}</td>
                    <td className="p-3 text-right text-orange-600">{grandTotal.nuRaspunde}</td>
                    <td className="p-3 text-right">
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-muted">
                        {grandTotal.total > 0 ? ((grandTotal.comanda / grandTotal.total) * 100).toFixed(1) : '0.0'}%
                      </span>
                    </td>
                  </tr>
                </tfoot>
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
