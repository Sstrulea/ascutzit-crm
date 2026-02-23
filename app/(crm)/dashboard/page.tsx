"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useKanbanData } from "@/hooks/useKanbanData"
import { DashboardStats, DashboardInsights } from "@/components/dashboard"
import { LazyDashboardCharts } from "@/components/lazy"
import { calculateDashboardMetrics, calculateTrayStageTimeStats, type DashboardInterval, getIntervalLabel } from "@/lib/supabase/dashboardOperations"
import { useEffect, useState } from "react"
import type { KanbanLead } from "@/lib/types/database"
import type { Tag } from "@/lib/supabase/tagOperations"
import { RefreshCw, TrendingUp, Users, Lock } from "lucide-react"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import { Skeleton } from "@/components/ui/skeleton"
import type { DashboardMetrics } from "@/lib/supabase/dashboardOperations"
import { useAuthContext } from "@/lib/contexts/AuthContext"
import { supabaseBrowser } from "@/lib/supabase/supabaseClient"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

/** Dashboard principal – INACTIV: nu face calluri. Setează true pentru a reactiva. */
const DASHBOARD_MAIN_ACTIVE = false

export type Lead = KanbanLead & { tags?: Tag[] }

function DashboardInactivePlaceholder() {
  const { isOwner, loading: authLoading } = useAuthContext()
  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Skeleton className="w-32 h-10" />
      </div>
    )
  }
  if (!isOwner()) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center space-y-4">
          <Lock className="h-16 w-16 text-amber-500 opacity-50 mx-auto" />
          <h2 className="text-xl font-semibold text-foreground">Acces Restricționat</h2>
          <p className="text-sm text-muted-foreground">Dashboard-ul este disponibil doar pentru proprietari</p>
        </div>
      </div>
    )
  }
  return (
    <div className="flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden">
      <header className="border-b border-border p-3 sm:p-4">
        <h1 className="text-xl sm:text-2xl font-semibold text-foreground">Dashboard</h1>
        <p className="text-xs sm:text-sm text-muted-foreground">Overview complet al activității și performanței</p>
      </header>
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center space-y-6 max-w-md">
          <div className="flex justify-center">
            <Image
              src="/in-dezvoltare.png"
              alt="Apreciez"
              width={480}
              height={480}
              className="animate-slide-horizontal"
            />
          </div>
          <h2 className="text-xl font-semibold text-foreground">In dezvoltare</h2>
          <p className="text-sm text-muted-foreground">
            Lucrăm la îmbunătățiri. Folosește Dashboard Tehnician sau Statistici Apeluri.
          </p>
        </div>
      </div>
    </div>
  )
}

export default function DashboardPage() {
  if (!DASHBOARD_MAIN_ACTIVE) {
    return <DashboardInactivePlaceholder />
  }
  return <DashboardPageContent />
}

function DashboardPageContent() {
  const { leads, pipelines, loading, error, refresh } = useKanbanData()
  const { isOwner, loading: authLoading } = useAuthContext()
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null)
  const [metricsLoading, setMetricsLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [selectedTrayId, setSelectedTrayId] = useState<string | null>(null)
  const [trayOptions, setTrayOptions] = useState<Array<{ id: string; label: string }>>([])
  const [trayStats, setTrayStats] = useState<{
    averageTimeByStage: Array<{ stageName: string; averageTime: number; count: number }>
    totalTimeByStage: Array<{ stageName: string; totalTime: number; count: number }>
    currentStageTime: number | null
    currentStageName?: string | null
  } | null>(null)
  const [trayStatsLoading, setTrayStatsLoading] = useState(false)
  const [interval, setInterval] = useState<DashboardInterval>('day')

  // Calculează metricile pentru dashboard - încărcare paralelă cu leads
  useEffect(() => {
    async function loadMetrics() {
      setMetricsLoading(true)
      try {
        const [calculatedMetrics, traysRes] = await Promise.all([
          calculateDashboardMetrics({ interval }),
          (async () => {
            try {
              const supabase = supabaseBrowser()
              // 1) Trays (fără join-uri, ca să evităm relații lipsă)
              const { data: traysData } = await supabase
                .from('trays')
                .select('id, number, size, service_file_id, created_at')
                .order('created_at', { ascending: false })
                .limit(60)

              const trays = (traysData ?? []) as any[]
              const serviceFileIds = [...new Set(trays.map(t => t.service_file_id).filter(Boolean))] as string[]

              // 2) Service files
              const serviceFilesMap = new Map<string, any>()
              const leadIds: string[] = []
              if (serviceFileIds.length > 0) {
                const { data: sfs } = await supabase
                  .from('service_files')
                  .select('id, number, lead_id')
                  .in('id', serviceFileIds)
                ;(sfs ?? []).forEach((sf: any) => {
                  if (!sf?.id) return
                  serviceFilesMap.set(sf.id, sf)
                  if (sf.lead_id) leadIds.push(sf.lead_id)
                })
              }

              // 3) Leads
              const leadsMap = new Map<string, any>()
              const uniqueLeadIds = [...new Set(leadIds.filter(Boolean))] as string[]
              if (uniqueLeadIds.length > 0) {
                const { data: leadsData } = await supabase
                  .from('leads')
                  .select('id, name, email')
                  .in('id', uniqueLeadIds)
                ;(leadsData ?? []).forEach((l: any) => {
                  if (!l?.id) return
                  leadsMap.set(l.id, l)
                })
              }

              const options = trays.map((t: any) => {
                const trayLabel = `#${t?.number || '—'}`
                const sf = t?.service_file_id ? serviceFilesMap.get(t.service_file_id) : null
                const sfLabel = sf?.number ? `Fișa ${sf.number}` : (sf?.id ? `Fișa ${String(sf.id).slice(0, 6)}…` : 'Fișă —')
                const lead = sf?.lead_id ? leadsMap.get(sf.lead_id) : null
                const leadLabel = lead?.name || lead?.email || (lead?.id ? String(lead.id).slice(0, 6) + '…' : '')
                const label = leadLabel ? `${trayLabel} — ${sfLabel} — ${leadLabel}` : `${trayLabel} — ${sfLabel}`
                return { id: t.id as string, label }
              })
              return { options }
            } catch {
              return { options: [] as Array<{ id: string; label: string }> }
            }
          })(),
        ])
        setMetrics(calculatedMetrics)
        setTrayOptions(traysRes.options)
      } catch (error) {
        console.error('Error loading dashboard metrics:', error)
        toast.error('Eroare la încărcarea metricilor')
      } finally {
        setMetricsLoading(false)
      }
    }

    loadMetrics()
  }, [interval])

  // Încarcă statistici pentru tăvița selectată (pt. KPI + Charts)
  useEffect(() => {
    let cancelled = false
    if (!selectedTrayId) {
      setTrayStats(null)
      setTrayStatsLoading(false)
      return
    }
    setTrayStatsLoading(true)
    calculateTrayStageTimeStats(selectedTrayId)
      .then((stats) => {
        if (cancelled) return
        setTrayStats(stats)
        setTrayStatsLoading(false)
      })
      .catch((err) => {
        console.error('Error loading tray stage stats:', err)
        if (cancelled) return
        setTrayStats(null)
        setTrayStatsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [selectedTrayId])

  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      await refresh()
      const calculatedMetrics = await calculateDashboardMetrics({ interval })
      setMetrics(calculatedMetrics)
      toast.success('Dashboard actualizat')
    } catch (error) {
      console.error('Error refreshing dashboard:', error)
      toast.error('Eroare la actualizare')
    } finally {
      setRefreshing(false)
    }
  }

  // Verifică dacă userul e owner
  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Skeleton className="w-32 h-10" />
      </div>
    )
  }

  if (!isOwner()) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center space-y-4">
          <div className="flex justify-center">
            <Lock className="h-16 w-16 text-amber-500 opacity-50" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-foreground">Acces Restricționat</h2>
            <p className="text-sm text-muted-foreground mt-2">
              Dashboard-ul este disponibil doar pentru proprietari
            </p>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-red-500">Error: {error}</div>
      </div>
    )
  }

  return (
    <div className="flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden">
      <header className="border-b border-border p-3 sm:p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-foreground">Dashboard</h1>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Overview complet al activității și performanței
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={refreshing}
          className="w-full sm:w-auto"
        >
          <RefreshCw className={refreshing ? "h-4 w-4 mr-2 animate-spin" : "h-4 w-4 mr-2"} />
          Actualizează
        </Button>
      </header>

      <div className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6 space-y-4 sm:space-y-6">
        {/* Perioadă și tăviță pentru statistici */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Perioadă și tăviță pentru statistici</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:items-center">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Perioadă</label>
                <Select value={interval} onValueChange={(v) => setInterval(v as DashboardInterval)}>
                  <SelectTrigger className="h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="day">{getIntervalLabel('day')}</SelectItem>
                    <SelectItem value="week">{getIntervalLabel('week')}</SelectItem>
                    <SelectItem value="month">{getIntervalLabel('month')}</SelectItem>
                    <SelectItem value="3months">{getIntervalLabel('3months')}</SelectItem>
                    <SelectItem value="6months">{getIntervalLabel('6months')}</SelectItem>
                    <SelectItem value="year">{getIntervalLabel('year')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="sm:col-span-2 lg:col-span-1 flex flex-col sm:flex-row gap-2 sm:items-end">
                <div className="flex-1">
                  <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Tăviță (opțional)</label>
                  <Select value={selectedTrayId ?? ''} onValueChange={(v) => setSelectedTrayId(v || null)}>
                    <SelectTrigger className="h-10">
                      <SelectValue placeholder="Alege o tăviță..." />
                    </SelectTrigger>
                    <SelectContent>
                      {trayOptions.map(opt => (
                        <SelectItem key={opt.id} value={opt.id}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedTrayId(null)}
                  disabled={!selectedTrayId}
                  className="h-10 shrink-0"
                >
                  Reset
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* KPI Cards */}
        <DashboardStats
          metrics={metrics}
          loading={metricsLoading}
          selectedTrayId={selectedTrayId}
          trayStats={trayStats}
          trayStatsLoading={trayStatsLoading}
          interval={interval}
        />

        {/* Charts */}
        <LazyDashboardCharts
          metrics={metrics}
          loading={metricsLoading}
          selectedTrayId={selectedTrayId}
          trayStats={trayStats}
          trayStatsLoading={trayStatsLoading}
          interval={interval}
        />

        {/* Insights & Top Technicians */}
        <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
          <DashboardInsights metrics={metrics} loading={metricsLoading} />
          
          {/* Top Technicians */}
          <Card className="hidden lg:block">
            <CardHeader>
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground" />
                <CardTitle className="text-base sm:text-lg">Top Tehnicieni</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              {metricsLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="flex items-center gap-3">
                      <Skeleton className="h-10 w-10 rounded-full" />
                      <div className="flex-1 space-y-2">
                        <Skeleton className="h-4 w-24" />
                        <Skeleton className="h-3 w-32" />
                      </div>  
                    </div>
                  ))}
                </div>
              ) : metrics?.topTechnicians && metrics.topTechnicians.length > 0 ? (
                <div className="space-y-3">
                  {metrics.topTechnicians.slice(0, 5).map((tech, index) => (
                    <div
                      key={tech.name}
                      className="flex items-center justify-between p-2 sm:p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                    >
                      <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                        <div className="flex items-center justify-center h-8 w-8 sm:h-10 sm:w-10 rounded-full bg-primary/10 text-primary font-semibold text-xs sm:text-sm flex-shrink-0">
                          {index + 1}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-xs sm:text-sm truncate">{tech.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {tech.leads} lead-uri
                          </p>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0 ml-2">
                        <p className="font-semibold text-xs sm:text-sm text-emerald-600">
                          {tech.revenue.toFixed(2)} RON
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <Users className="h-12 w-12 text-muted-foreground mb-3 opacity-50" />
                  <p className="text-sm text-muted-foreground">
                    Nu există date despre tehnicieni
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

