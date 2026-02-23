'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { type DashboardInterval, getIntervalLabel } from '@/lib/supabase/dashboardOperations'
import { Skeleton } from '@/components/ui/skeleton'
import { 
  Users,
  DollarSign,
  AlertTriangle,
  Plus,
  Wrench,
  XCircle,
  Clock,
  GitBranch,
  Package,
  BarChart3,
  ArrowUpRight,
  ArrowDownRight,
  Phone,
  PhoneOff,
  PhoneIncoming,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface StatCardProps {
  title: string
  value: string | number
  subtitle?: string
  change?: number
  changeLabel?: string
  icon: React.ComponentType<{ className?: string }>
  iconColor?: string
  loading?: boolean
}

function StatCard({ 
  title, 
  value, 
  subtitle,
  change, 
  changeLabel, 
  icon: Icon, 
  iconColor = 'text-blue-600',
  loading 
}: StatCardProps) {
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <CardTitle className="text-sm font-semibold text-foreground line-clamp-2">
              {title}
            </CardTitle>
            {subtitle && (
              <div className="mt-1.5 text-xs text-muted-foreground line-clamp-2">
                {subtitle}
              </div>
            )}
          </div>
          <div className={cn('h-5 w-5 flex-shrink-0 mt-0.5', iconColor)}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-7 sm:h-8 w-24" />
            <Skeleton className="h-3 sm:h-4 w-32" />
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-baseline gap-2">
              <div className="text-2xl sm:text-3xl font-bold text-foreground">{value}</div>
              {change !== undefined && changeLabel && (
                <div className={cn(
                  "flex items-center gap-1 text-xs font-medium",
                  change >= 0 ? "text-emerald-600" : "text-red-600"
                )}>
                  {change >= 0 ? (
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  ) : (
                    <ArrowDownRight className="h-3.5 w-3.5" />
                  )}
                  <span>{Math.abs(change)}%</span>
                </div>
              )}
            </div>
            {changeLabel && (
              <div className="text-xs text-muted-foreground">
                {changeLabel}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

interface DashboardStatsProps {
  metrics: {
    totalLeads: number
    totalRevenue: number
    urgentLeads: number
    newLeadsToday: number
    totalInLucru: number
    noDealLeads: number
    averageTimeByStage?: Array<{ stageName: string; averageTime: number; count: number }>
    totalTimeByStage?: Array<{ stageName: string; totalTime: number; count: number }>
    vanzariLeadsApelate?: number
    vanzariMovedFromNuRaspunde?: number
    vanzariMovedFromCallback?: number
  } | null
  loading: boolean
  selectedTrayId?: string | null
  trayStats?: {
    averageTimeByStage: Array<{ stageName: string; averageTime: number; count: number }>
    totalTimeByStage: Array<{ stageName: string; totalTime: number; count: number }>
    currentStageTime: number | null
    currentStageName?: string | null
  } | null
  trayStatsLoading?: boolean
  interval?: DashboardInterval
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '—'
  if (seconds < 60) return `${Math.floor(seconds)}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

export function DashboardStats({
  metrics,
  loading,
  selectedTrayId,
  trayStats,
  trayStatsLoading,
  interval = 'day',
}: DashboardStatsProps) {
  const avg = metrics?.averageTimeByStage || []
  const tot = metrics?.totalTimeByStage || []
  const slowestAvg = avg.length > 0 ? avg[0] : null
  const biggestTotal = tot.length > 0 ? tot[0] : null
  const trackedStages = Math.max(avg.length, tot.length)

  const showTray = !!selectedTrayId
  const trayCurrentTime = trayStats?.currentStageTime ?? null
  const trayCurrentStage = trayStats?.currentStageName ?? null

  const periodLabel = getIntervalLabel(interval)

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* KPI-uri per perioadă */}
      <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-7">
        <StatCard
          title="Total Lead-uri"
          value={metrics?.totalLeads.toLocaleString() || '0'}
          change={12}
          changeLabel="față de luna trecută"
          icon={Users}
          iconColor="text-blue-600"
          loading={loading}
        />
        <StatCard
          title={`Revenue (${periodLabel})`}
          value={`${(metrics?.totalRevenue || 0).toFixed(2)} RON`}
          change={8}
          changeLabel="față de perioada anterioară"
          icon={DollarSign}
          iconColor="text-emerald-600"
          loading={loading}
        />
        <StatCard
          title="Lead-uri Urgente"
          value={metrics?.urgentLeads || 0}
          change={-5}
          changeLabel="față de ieri"
          icon={AlertTriangle}
          iconColor="text-red-600"
          loading={loading}
        />
        <StatCard
          title={`Lead-uri Noi (${periodLabel})`}
          value={metrics?.newLeadsToday || 0}
          change={15}
          changeLabel="față de perioada anterioară"
          icon={Plus}
          iconColor="text-purple-600"
          loading={loading}
        />
        <StatCard
          title="Total În Lucru"
          value={`${(metrics?.totalInLucru || 0).toFixed(2)} RON`}
          icon={Wrench}
          iconColor="text-orange-600"
          loading={loading}
        />
        <StatCard
          title="Ore lucru"
          value="6h 30m"
          icon={Clock}
          iconColor="text-indigo-600"
          loading={loading}
        />
        <StatCard
          title="No Deal"
          value={metrics?.noDealLeads || 0}
          icon={XCircle}
          iconColor="text-red-500"
          loading={loading}
        />
      </div>

      {/* KPI-uri timp pe stage-uri */}
      <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="AVG maxim / stage (global)"
          value={slowestAvg ? formatTime(slowestAvg.averageTime) : '—'}
          subtitle={slowestAvg?.stageName || undefined}
          icon={Clock}
          iconColor="text-fuchsia-600"
          loading={loading}
        />
        <StatCard
          title="TOTAL maxim / stage (global)"
          value={biggestTotal ? formatTime(biggestTotal.totalTime) : '—'}
          subtitle={biggestTotal?.stageName || undefined}
          icon={GitBranch}
          iconColor="text-cyan-600"
          loading={loading}
        />
        <StatCard
          title="Stage-uri urmărite (global)"
          value={trackedStages || 0}
          icon={BarChart3}
          iconColor="text-slate-700"
          loading={loading}
        />
        <StatCard
          title={showTray ? "Tăviță: timp în stage curent" : "Tăviță selectată"}
          value={
            showTray
              ? (trayStatsLoading ? '...' : (trayCurrentTime !== null ? formatTime(trayCurrentTime) : '—'))
              : '—'
          }
          subtitle={showTray ? (trayCurrentStage || undefined) : undefined}
          icon={Package}
          iconColor="text-emerald-600"
          loading={loading}
        />
      </div>

      {/* Statistici Vânzări: leaduri apelate, mutate din Nu răspunde / Callback */}
      <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-3">
        <StatCard
          title={`Lead-uri apelate (${periodLabel})`}
          value={metrics?.vanzariLeadsApelate ?? 0}
          subtitle="Din Leads → Callback / No deal / Avem comanda / Nu răspunde"
          icon={Phone}
          iconColor="text-blue-500"
          loading={loading}
        />
        <StatCard
          title={`Din Nu răspunde → alte stage-uri (${periodLabel})`}
          value={metrics?.vanzariMovedFromNuRaspunde ?? 0}
          subtitle="Mutate din Nu răspunde"
          icon={PhoneOff}
          iconColor="text-amber-600"
          loading={loading}
        />
        <StatCard
          title={`Din Callback → alte stage-uri (${periodLabel})`}
          value={metrics?.vanzariMovedFromCallback ?? 0}
          subtitle="Mutate din Callback"
          icon={PhoneIncoming}
          iconColor="text-teal-600"
          loading={loading}
        />
      </div>
    </div>
  )
}

