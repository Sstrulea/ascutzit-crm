'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useAuthContext } from '@/lib/contexts/AuthContext'
import { ArrowLeft, RefreshCw, Users, Loader2, Filter, UserCheck, UserX, PhoneOff, PhoneCall, User, ChevronDown, ChevronRight, Package, Banknote, Download } from 'lucide-react'
import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState, Fragment } from 'react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

type ClientTip = 'client' | 'no_deal' | 'nu_raspunde' | 'call_back' | 'lead'

type BazaClientiRow = {
  fullName: string
  leadCount: number
  tip: ClientTip
}

type FilterKind = 'all' | 'client' | 'no_deal' | 'nu_raspunde' | 'call_back' | 'lead'

type ClientDetails = {
  totalSum: number
  currency: string
  instruments: { instrumentName: string; qty: number; mod: 'office' | 'curier'; fisaNumber?: string; trayNumber?: string }[]
  fisaCount: number
}

export default function BazaClientiPage() {
  const { profile, loading: authLoading } = useAuthContext()
  const [clients, setClients] = useState<BazaClientiRow[]>([])
  const [expandedKey, setExpandedKey] = useState<string | null>(null)
  const [detailsCache, setDetailsCache] = useState<Record<string, { data: ClientDetails; loading?: boolean }>>({})
  const [stats, setStats] = useState<{
    total: number
    clientCount: number
    noDealCount: number
    nuRaspundeCount: number
    callBackCount: number
    leadCount: number
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [filter, setFilter] = useState<FilterKind>('all')

  const loadData = useCallback(async () => {
    try {
      const res = await fetch('/api/leads/baza-clienti', { credentials: 'include' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data?.ok) {
        toast.error(data?.error ?? 'Eroare la încărcarea bazei clienți')
        setClients([])
        setStats(null)
        return
      }
      setClients(data.clients ?? [])
      setStats(data.stats ?? null)
    } catch (e) {
      console.error(e)
      toast.error('Eroare la încărcarea bazei clienți')
      setClients([])
      setStats(null)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    if (authLoading) return
    setLoading(true)
    loadData()
  }, [authLoading, loadData])

  const handleRefresh = () => {
    setRefreshing(true)
    loadData()
  }

  const filteredClients = useMemo(() => {
    if (filter === 'all') return clients
    return clients.filter((c) => c.tip === filter)
  }, [clients, filter])

  const fetchClientDetails = useCallback(async (clientKey: string) => {
    let doFetch = false
    setDetailsCache((prev) => {
      if (prev[clientKey]?.data) return prev
      doFetch = true
      return { ...prev, [clientKey]: { ...prev[clientKey], loading: true } }
    })
    if (!doFetch) return
    try {
      const res = await fetch(`/api/leads/baza-clienti/client-details?clientKey=${encodeURIComponent(clientKey)}`, {
        credentials: 'include',
      })
      const data = await res.json().catch(() => ({}))
      if (data?.ok) {
        setDetailsCache((prev) => ({
          ...prev,
          [clientKey]: { data: data as ClientDetails, loading: false },
        }))
      } else {
        setDetailsCache((prev) => ({ ...prev, [clientKey]: { data: { totalSum: 0, currency: 'RON', instruments: [], fisaCount: 0 }, loading: false } }))
      }
    } catch {
      setDetailsCache((prev) => ({ ...prev, [clientKey]: { data: { totalSum: 0, currency: 'RON', instruments: [], fisaCount: 0 }, loading: false } }))
    }
  }, [])

  const toggleExpand = useCallback((clientKey: string) => {
    setExpandedKey((prev) => (prev === clientKey ? null : clientKey))
    fetchClientDetails(clientKey)
  }, [fetchClientDetails])

  const tipLabels: Record<ClientTip, string> = {
    client: 'Client',
    no_deal: 'No deal',
    nu_raspunde: 'Nu răspunde',
    call_back: 'Call back',
    lead: 'Lead',
  }

  const handleExportCsv = useCallback(() => {
    const headers = ['Nume', 'Telefon', 'Tip', 'Nr. leaduri', 'Nr. fișe']
    const rows = filteredClients.map((c) => [
      (c.fullName ?? '').replace(/"/g, '""'),
      (c.phoneDisplay ?? '').replace(/"/g, '""'),
      tipLabels[c.tip],
      String(c.leadCount),
      String(c.fisaCount ?? 0),
    ])
    const csv = [headers.join(','), ...rows.map((r) => r.map((c) => `"${c}"`).join(','))].join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `baza-clienti-${filter === 'all' ? 'toti' : filter}-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }, [filteredClients, filter])

  if (authLoading) {
    return (
      <div className="flex flex-col min-h-[50vh] items-center justify-center gap-4 p-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Se încarcă...</p>
      </div>
    )
  }

  if (!profile?.user_id) {
    return (
      <div className="flex flex-col min-h-[60vh] items-center justify-center gap-4 text-muted-foreground">
        <p className="text-lg font-medium">Trebuie să fii autentificat.</p>
        <Link href="/dashboard">
          <Button variant="outline">Înapoi la Dashboard</Button>
        </Link>
      </div>
    )
  }

  return (
    <div className="flex flex-col min-h-0 overflow-hidden">
      <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 sm:p-6 border-b flex-shrink-0 sticky top-0 bg-background z-10">
        <div className="flex items-center gap-3">
          <Link href="/dashboard">
            <Button variant="ghost" size="sm" className="gap-1.5">
              <ArrowLeft className="h-4 w-4" />
              Înapoi
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold">Baza Clienți</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              <Users className="h-3.5 w-3.5 inline mr-1" />
              Clienți unici (nume + telefon, fără prefix +40) și numărul de leaduri
            </p>
            {stats && (
              <p className="text-xs text-muted-foreground mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                <span>
                  <strong className="text-foreground">{stats.clientCount}</strong> clienți (cu fișă arhivată)
                </span>
                <span>
                  <strong className="text-foreground">{stats.noDealCount}</strong> no deal
                </span>
                <span>
                  <strong className="text-foreground">{stats.nuRaspundeCount}</strong> nu răspunde
                </span>
                <span>
                  <strong className="text-foreground">{stats.callBackCount}</strong> call back
                </span>
                <span>
                  <strong className="text-foreground">{stats.leadCount}</strong> lead
                </span>
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Select value={filter} onValueChange={(v) => setFilter(v as FilterKind)} disabled={loading}>
            <SelectTrigger className="w-[200px] gap-1.5">
              <Filter className="h-3.5 w-3.5" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toți ({clients.length})</SelectItem>
              <SelectItem value="client">Clienți – cu fișă arhivată ({stats?.clientCount ?? 0})</SelectItem>
              <SelectItem value="no_deal">No deal ({stats?.noDealCount ?? 0})</SelectItem>
              <SelectItem value="nu_raspunde">Nu răspunde ({stats?.nuRaspundeCount ?? 0})</SelectItem>
              <SelectItem value="call_back">Call back ({stats?.callBackCount ?? 0})</SelectItem>
              <SelectItem value="lead">Lead ({stats?.leadCount ?? 0})</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={handleExportCsv}
            disabled={loading || filteredClients.length === 0}
          >
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={handleRefresh}
            disabled={refreshing || loading}
          >
            <RefreshCw className={cn('h-4 w-4', (refreshing || loading) && 'animate-spin')} />
            Reîmprospătează
          </Button>
        </div>
      </header>

      <div className="flex-1 overflow-auto p-4 sm:p-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              {filter === 'all'
                ? `${clients.length} ${clients.length === 1 ? 'client unic' : 'clienți unici'}`
                : (() => {
                    const labels: Record<FilterKind, string> = {
                      all: '',
                      client: 'clienți (cu fișă arhivată)',
                      no_deal: 'no deal',
                      nu_raspunde: 'nu răspunde',
                      call_back: 'call back',
                      lead: 'lead',
                    }
                    return `${filteredClients.length} ${labels[filter]}`
                  })()}
              {filter !== 'all' && (
                <span className="text-muted-foreground font-normal text-sm ml-2">
                  (filtrat din {clients.length})
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : clients.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                Nu există date de afișat.
              </p>
            ) : filteredClients.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                Niciun rezultat pentru filtrul selectat.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[32px]"></TableHead>
                    <TableHead className="w-[1%]">#</TableHead>
                    <TableHead>Nume complet</TableHead>
                    <TableHead className="w-[100px]">Telefon</TableHead>
                    <TableHead className="w-[120px]">Tip</TableHead>
                    <TableHead className="text-right w-[90px]">Nr. leaduri</TableHead>
                    <TableHead className="text-right w-[80px]">Nr. fișe</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredClients.map((row, index) => {
                    const isExpanded = expandedKey === row.clientKey
                    const cached = detailsCache[row.clientKey]
                    const details = cached?.data
                    const loadingDetails = cached?.loading
                    return (
                      <Fragment key={row.clientKey}>
                        <TableRow
                          key={`${row.clientKey}-${index}`}
                          className={cn(isExpanded && 'bg-muted/30')}
                        >
                          <TableCell className="w-[32px] p-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => toggleExpand(row.clientKey)}
                              aria-label={isExpanded ? 'Ascunde detalii' : 'Afișează detalii'}
                            >
                              {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                            </Button>
                          </TableCell>
                          <TableCell className="text-muted-foreground font-mono text-xs">
                            {index + 1}
                          </TableCell>
                          <TableCell className="font-medium">{row.fullName}</TableCell>
                          <TableCell className="text-muted-foreground text-sm tabular-nums">
                            {row.phoneDisplay ?? '—'}
                          </TableCell>
                          <TableCell>
                            {row.tip === 'client' && (
                              <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 text-xs font-medium">
                                <UserCheck className="h-3.5 w-3.5" />
                                Client
                              </span>
                            )}
                            {row.tip === 'no_deal' && (
                              <span className="inline-flex items-center gap-1 text-red-600 dark:text-red-400 text-xs font-medium">
                                <UserX className="h-3.5 w-3.5" />
                                No deal
                              </span>
                            )}
                            {row.tip === 'nu_raspunde' && (
                              <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 text-xs font-medium">
                                <PhoneOff className="h-3.5 w-3.5" />
                                Nu răspunde
                              </span>
                            )}
                            {row.tip === 'call_back' && (
                              <span className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 text-xs font-medium">
                                <PhoneCall className="h-3.5 w-3.5" />
                                Call back
                              </span>
                            )}
                            {row.tip === 'lead' && (
                              <span className="inline-flex items-center gap-1 text-muted-foreground text-xs font-medium">
                                <User className="h-3.5 w-3.5" />
                                Lead
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-right font-semibold tabular-nums">
                            {row.leadCount}
                          </TableCell>
                          <TableCell className="text-right font-semibold tabular-nums">
                            {row.fisaCount ?? 0}
                          </TableCell>
                        </TableRow>
                        {isExpanded && (
                          <TableRow key={`${row.clientKey}-${index}-details`} className="bg-muted/20 hover:bg-muted/20">
                            <TableCell colSpan={7} className="p-4">
                              {loadingDetails ? (
                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                  Se încarcă detaliile...
                                </div>
                              ) : details ? (
                                <div className="space-y-3">
                                  <div className="flex flex-wrap items-center gap-4">
                                    <div className="flex items-center gap-2 text-sm">
                                      <Banknote className="h-4 w-4 text-emerald-600" />
                                      <span className="font-medium">Total comenzi:</span>
                                      <span className="font-semibold tabular-nums">{details.totalSum.toFixed(2)} {details.currency}</span>
                                    </div>
                                  </div>
                                  {details.instruments.length > 0 ? (
                                    <div>
                                      <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
                                        <Package className="h-3.5 w-3.5" />
                                        Instrumente aduse
                                      </p>
                                      <ul className="space-y-1.5 text-sm">
                                        {details.instruments.map((inst, i) => (
                                          <li key={i} className="flex flex-wrap items-center gap-2">
                                            <span className="font-medium">{inst.instrumentName}</span>
                                            <span className="text-muted-foreground">× {inst.qty}</span>
                                            <span className={cn(
                                              'text-xs px-1.5 py-0.5 rounded',
                                              inst.mod === 'office' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' : 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300'
                                            )}>
                                              {inst.mod === 'office' ? 'Office' : 'Curier'}
                                            </span>
                                            {(inst.fisaNumber || inst.trayNumber) && (
                                              <span className="text-muted-foreground text-xs">
                                                {inst.fisaNumber && `Fișa ${inst.fisaNumber}`}
                                                {inst.fisaNumber && inst.trayNumber && ' · '}
                                                {inst.trayNumber && `#${inst.trayNumber}`}
                                              </span>
                                            )}
                                          </li>
                                        ))}
                                      </ul>
                                    </div>
                                  ) : (
                                    <p className="text-sm text-muted-foreground">Nu există instrumente înregistrate.</p>
                                  )}
                                </div>
                              ) : null}
                            </TableCell>
                          </TableRow>
                        )}
                      </Fragment>
                    )
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
