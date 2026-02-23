"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { TrendingUp, TrendingDown, Calendar, Users, DollarSign, Package, Clock, ArrowRight, ArrowLeft } from "lucide-react"
import { SellerStatisticsDashboard as SellerStatisticsDashboardType, SellerStatsAggregated } from "@/lib/vanzari/types"
import { getSellerStatisticsDashboard } from "@/lib/vanzari/statistics"

interface StatCardProps {
  title: string
  value: string | number
  icon: React.ReactNode
  trend?: number
  trendLabel?: string
}

function StatCard({ title, value, icon, trend, trendLabel }: StatCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">
          {title}
        </CardTitle>
        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
          {icon}
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {trend !== undefined && (
          <div className={`flex items-center text-xs mt-1 ${trend >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {trend >= 0 ? <TrendingUp className="h-3 w-3 mr-1" /> : <TrendingDown className="h-3 w-3 mr-1" />}
            {Math.abs(trend)}% {trendLabel || 'vs perioada anterioară'}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

interface StatsGridProps {
  title: string
  periodLabel: string
  stats: SellerStatsAggregated
  changes?: {
    callbacks_change_percent?: number
    nu_raspunde_change_percent?: number
    deals_change_percent?: number
    services_change_percent?: number
  }
}

function StatsGrid({ title, periodLabel, stats, changes }: StatsGridProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">{title}</h3>
        <span className="text-sm text-muted-foreground">{periodLabel}</span>
      </div>
      
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard
          title="Callback-uri"
          value={stats.callbacks_set}
          icon={<Clock className="h-4 w-4 text-primary" />}
          trend={changes?.callbacks_change_percent}
          trendLabel="vs perioada anterioară"
        />
        
        <StatCard
          title="Nu Răspunde"
          value={stats.nu_raspunde}
          icon={<Users className="h-4 w-4 text-primary" />}
          trend={changes?.nu_raspunde_change_percent}
          trendLabel="vs perioada anterioară"
        />
        
        <StatCard
          title="No Deal"
          value={stats.no_deal}
          icon={<ArrowRight className="h-4 w-4 text-primary" />}
          trend={changes?.deals_change_percent}
          trendLabel="vs perioada anterioară"
        />
        
        <StatCard
          title="Curier Trimis"
          value={stats.curier_trimis}
          icon={<Package className="h-4 w-4 text-primary" />}
          trend={changes?.services_change_percent}
          trendLabel="vs perioada anterioară"
        />
        
        <StatCard
          title="Office Direct"
          value={stats.office_direct}
          icon={<Calendar className="h-4 w-4 text-primary" />}
          trend={changes?.services_change_percent}
          trendLabel="vs perioada anterioară"
        />
        
        <StatCard
          title="Deals închise"
          value={stats.deals_closed}
          icon={<DollarSign className="h-4 w-4 text-primary" />}
          trend={changes?.deals_change_percent}
          trendLabel="vs perioada anterioară"
        />
      </div>
      
      <Card className="bg-muted/30">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Scor Performanță</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="text-3xl font-bold text-primary">
              {stats.score.toFixed(1)}
            </div>
            <div className="text-sm text-muted-foreground">
              {stats.score >= 80 ? 'Excelent' : stats.score >= 60 ? 'Bun' : stats.score >= 40 ? 'Mediu' : 'Necesită îmbunătățire'}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

interface SellerStatisticsDashboardProps {
  userId?: string
}

export function SellerStatisticsDashboardComponent({ userId }: SellerStatisticsDashboardProps) {
  const [period, setPeriod] = useState<'today' | 'week' | 'month'>('today')
  const [dashboard, setDashboard] = useState<SellerStatisticsDashboardType | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadDashboard()
  }, [userId, period])

  async function loadDashboard() {
    setLoading(true)
    try {
      const result = await getSellerStatisticsDashboard()
      if (result.data) {
        setDashboard(result.data)
      }
    } catch (error: any) {
      console.error('[SellerStatisticsDashboard] Error loading dashboard:', error)
    } finally {
      setLoading(false)
    }
  }

  const getPeriodData = (): SellerStatsAggregated | null => {
    if (!dashboard) return null
    switch (period) {
      case 'today': return dashboard.today
      case 'week': return dashboard.week
      case 'month': return dashboard.month
      default: return null
    }
  }

  const getPeriodChanges = () => {
    if (!dashboard) return undefined
    switch (period) {
      case 'today': return dashboard.today
      case 'week': return dashboard.week
      case 'month': return dashboard.month
      default: return undefined
    }
  }

  const stats = getPeriodData()
  const changes = getPeriodChanges()

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-32 bg-muted rounded-lg animate-pulse" />
        <div className="h-32 bg-muted rounded-lg animate-pulse" />
        <div className="h-32 bg-muted rounded-lg animate-pulse" />
      </div>
    )
  }

  if (!dashboard) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <p className="text-muted-foreground">Nu s-au putut încărca statisticile</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Period Selector */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Dashboard Statistici</h2>
        <div className="flex gap-2">
          <Button
            variant={period === 'today' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setPeriod('today')}
          >
            Azi
          </Button>
          <Button
            variant={period === 'week' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setPeriod('week')}
          >
            Săptămâna
          </Button>
          <Button
            variant={period === 'month' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setPeriod('month')}
          >
            Luna
          </Button>
        </div>
      </div>

      {/* Stats Grid */}
      {stats && (
        <>
          <StatsGrid
            title="Statistici Generale"
            periodLabel={
              period === 'today' ? 'Astăzi' : period === 'week' ? 'Săptămâna aceasta' : 'Luna aceasta'
            }
            stats={stats}
            changes={changes}
          />
          
          {/* Additional Info Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">Fișe de Serviciu Create</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.service_files_created}</div>
                <p className="text-sm text-muted-foreground mt-1">
                  Total în această perioadă
                </p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">Rată Conversie</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {stats.callbacks_set > 0 
                    ? ((stats.deals_closed / stats.callbacks_set) * 100).toFixed(1) 
                    : '0.0'}%
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  {stats.deals_closed} din {stats.callbacks_set} callback-uri convertite
                </p>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  )
}

// Alias pentru compatibilitate
export const SellerStatisticsDashboard = SellerStatisticsDashboardComponent