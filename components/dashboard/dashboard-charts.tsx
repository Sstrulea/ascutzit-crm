'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, Area, AreaChart } from 'recharts'
import { Skeleton } from '@/components/ui/skeleton'
import { calculateTrayStageTimeStats, type DashboardInterval } from '@/lib/supabase/dashboardOperations'
import { Clock, Package } from 'lucide-react'

interface DashboardChartsProps {
  metrics: {
    leadsByPipeline: Record<string, number>
    leadsByStage: Record<string, number>
    revenueByPipeline: Record<string, number>
    revenueByStage: Record<string, number>
    leadsOverTime: Array<{ date: string; count: number }>
    topTechnicians: Array<{ name: string; leads: number; revenue: number }>
    tagDistribution: Record<string, number>
    paymentMethodStats: {
      cash: number
      card: number
      none: number
    }
    averageTimeByStage?: Array<{ stageName: string; averageTime: number; count: number }>
    totalTimeByStage?: Array<{ stageName: string; totalTime: number; count: number }>
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

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899']

export function DashboardCharts({
  metrics,
  loading,
  selectedTrayId,
  trayStats: propTrayStats,
  trayStatsLoading: propTrayStatsLoading,
  interval: _interval,
}: DashboardChartsProps) {
  // calculeaza raza pentru pie chart in functie de dimensiunea ecranului
  const [pieRadius, setPieRadius] = useState(60)
  const [internalTrayStats, setInternalTrayStats] = useState<{
    averageTimeByStage: Array<{ stageName: string; averageTime: number; count: number }>
    totalTimeByStage: Array<{ stageName: string; totalTime: number; count: number }>
    currentStageTime: number | null
    currentStageName?: string | null
  } | null>(null)
  const [internalTrayStatsLoading, setInternalTrayStatsLoading] = useState(false)

  useEffect(() => {
    const updatePieRadius = () => {
      if (window.innerWidth < 640) {
        setPieRadius(50)
      } else if (window.innerWidth < 768) {
        setPieRadius(70)
      } else {
        setPieRadius(80)
      }
    }

    updatePieRadius()
    window.addEventListener('resize', updatePieRadius)
    return () => window.removeEventListener('resize', updatePieRadius)
  }, [])

  // Încarcă statistici pentru tăvița selectată (doar dacă nu vin din props)
  useEffect(() => {
    if (!selectedTrayId) {
      setInternalTrayStats(null)
      setInternalTrayStatsLoading(false)
      return
    }
    // Dacă vin din props, nu mai încărcăm aici
    // (DashboardPage poate gestiona o singură încărcare pentru Stats + Charts)
    const externalControl =
      typeof propTrayStatsLoading === 'boolean' || propTrayStats !== undefined
    if (externalControl) return

    setInternalTrayStatsLoading(true)
    calculateTrayStageTimeStats(selectedTrayId)
      .then(stats => {
        setInternalTrayStats(stats)
        setInternalTrayStatsLoading(false)
      })
      .catch(error => {
        console.error('Error loading tray stats:', error)
        setInternalTrayStatsLoading(false)
      })
  }, [selectedTrayId, propTrayStats, propTrayStatsLoading])

  // Rezolvă sursa de adevăr (props > intern)
  const trayStats = propTrayStats ?? internalTrayStats
  const trayStatsLoading =
    typeof propTrayStatsLoading === 'boolean' ? propTrayStatsLoading : internalTrayStatsLoading

  // Transformă datele pentru statistici timp pe stage-uri
  // Dacă avem tăviță selectată, folosim statisticile pentru acea tăviță, altfel folosim statisticile globale
  const useTrayStats = selectedTrayId && trayStats
  
  const averageTimeData = useTrayStats && trayStats
    ? trayStats.averageTimeByStage
        .map(item => ({
          name: item.stageName,
          value: Math.floor(item.averageTime / 3600 * 100) / 100, // Convertim în ore cu 2 zecimale
          count: item.count
        }))
        .slice(0, 10)
    : metrics?.averageTimeByStage 
      ? metrics.averageTimeByStage
          .map(item => ({
            name: item.stageName,
            value: Math.floor(item.averageTime / 3600 * 100) / 100,
            count: item.count
          }))
          .slice(0, 10)
      : []

  const totalTimeData = useTrayStats && trayStats
    ? trayStats.totalTimeByStage
        .map(item => ({
          name: item.stageName,
          value: Math.floor(item.totalTime / 3600 * 100) / 100,
          count: item.count
        }))
        .slice(0, 10)
    : metrics?.totalTimeByStage
      ? metrics.totalTimeByStage
          .map(item => ({
            name: item.stageName,
            value: Math.floor(item.totalTime / 3600 * 100) / 100,
            count: item.count
          }))
          .slice(0, 10)
      : []
  
  // Formatare timp pentru afișare
  const formatTime = (seconds: number): string => {
    if (seconds < 60) return `${seconds}s`
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`
  }

  const chartConfig = {
    leads: {
      label: 'Lead-uri',
      color: 'hsl(var(--chart-1))',
    },
    revenue: {
      label: 'Revenue (RON)',
      color: 'hsl(var(--chart-2))',
    },
    time: {
      label: 'Timp (ore)',
      color: 'hsl(var(--chart-3))',
    },
  }

  if (loading) {
    return (
      <div className="grid gap-3 sm:gap-4 grid-cols-1 md:grid-cols-2">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i} className="hidden lg:block">
            <CardHeader>
              <Skeleton className="h-5 sm:h-6 w-32" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-[200px] sm:h-[300px] w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Statistici pentru tăvița selectată */}
      {selectedTrayId && (
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Package className="w-4 h-4 text-primary" />
              <CardTitle className="text-base sm:text-lg">Statistici Tăviță Selectată</CardTitle>
            </div>
            <CardDescription className="text-xs sm:text-sm">
              {trayStatsLoading ? 'Se încarcă...' : 'Timpul petrecut pe stage-uri pentru tăvița selectată'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {trayStatsLoading ? (
              <Skeleton className="h-[200px] w-full" />
            ) : trayStats && trayStats.currentStageTime !== null ? (
              <div className="space-y-4">
                <div className="flex items-center gap-4 p-3 rounded-lg bg-muted/50 border">
                  <Clock className="w-5 h-5 text-primary" />
                  <div>
                    <div className="text-sm font-medium">Timp în stage-ul curent</div>
                    {trayStats.currentStageName && (
                      <div className="text-xs text-muted-foreground">
                        Stage: <span className="font-medium text-foreground">{trayStats.currentStageName}</span>
                      </div>
                    )}
                    <div className="text-lg font-bold text-primary">{formatTime(trayStats.currentStageTime)}</div>
                  </div>
                </div>
                {trayStats.averageTimeByStage.length > 0 && (
                  <div>
                    <div className="text-sm font-medium mb-2">Timp mediu pe stage</div>
                    <div className="space-y-2">
                      {trayStats.averageTimeByStage.slice(0, 5).map((item, idx) => (
                        <div key={idx} className="flex items-center justify-between p-2 rounded bg-background border">
                          <span className="text-sm">{item.stageName}</span>
                          <span className="text-sm font-medium">{formatTime(item.averageTime)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">Nu există date pentru această tăviță</div>
            )}
          </CardContent>
        </Card>
      )}
      
      <div className="grid gap-3 sm:gap-4 grid-cols-1 md:grid-cols-2">
        {/* Timp Mediu pe Stage */}
        <Card className="hidden lg:block">
          <CardHeader>
            <CardTitle className="text-base sm:text-lg">
              {selectedTrayId ? 'Timp Mediu pe Stage (Tăviță Selectată)' : 'Timp Mediu pe Stage (Global)'}
            </CardTitle>
            <CardDescription className="text-xs sm:text-sm">Timpul mediu petrecut în fiecare stage (ore)</CardDescription>
          </CardHeader>
        <CardContent>
          {averageTimeData.length > 0 ? (
            <ChartContainer config={chartConfig} className="h-[200px] sm:h-[250px] md:h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={averageTimeData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="name" 
                    angle={-45}
                    textAnchor="end"
                    height={80}
                    fontSize={12}
                  />
                  <YAxis fontSize={12} />
                  <ChartTooltip 
                    content={<ChartTooltipContent />}
                    formatter={(value: any, name: string, props: any) => [
                      `${Number(value).toFixed(2)} ore (${props.payload.count} vizite)`,
                      'Timp mediu'
                    ]}
                  />
                  <Bar dataKey="value" fill="var(--color-time)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartContainer>
          ) : (
            <div className="flex items-center justify-center h-[300px] text-muted-foreground">
              Nu există date
            </div>
          )}
        </CardContent>
        </Card>

        {/* Timp Total pe Stage */}
        <Card className="hidden lg:block">
          <CardHeader>
            <CardTitle className="text-base sm:text-lg">
              {selectedTrayId ? 'Timp Total pe Stage (Tăviță Selectată)' : 'Timp Total pe Stage (Global)'}
            </CardTitle>
            <CardDescription className="text-xs sm:text-sm">Timpul total petrecut în fiecare stage (ore)</CardDescription>
          </CardHeader>
          <CardContent>
          {totalTimeData.length > 0 ? (
            <ChartContainer config={chartConfig} className="h-[200px] sm:h-[250px] md:h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={totalTimeData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="name" 
                    angle={-45}
                    textAnchor="end"
                    height={60}
                    fontSize={10}
                    className="text-xs"
                  />
                  <YAxis fontSize={10} className="text-xs" />
                  <ChartTooltip 
                    content={<ChartTooltipContent />}
                    formatter={(value: any, name: string, props: any) => [
                      `${Number(value).toFixed(2)} ore (${props.payload.count} vizite)`,
                      'Timp total'
                    ]}
                  />
                  <Bar dataKey="value" fill="var(--color-time)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartContainer>
          ) : (
            <div className="flex items-center justify-center h-[200px] sm:h-[250px] md:h-[300px] text-muted-foreground text-sm">
              Nu există date
            </div>
          )}
        </CardContent>
        </Card>
      </div>

      {/* Lead-uri pe Timp */}
      <Card className="hidden lg:block">
        <CardHeader>
          <CardTitle className="text-base sm:text-lg">Lead-uri Noi (Ultimele 30 Zile)</CardTitle>
          <CardDescription className="text-xs sm:text-sm">Evoluția lead-urilor noi pe timp</CardDescription>
        </CardHeader>
        <CardContent>
          {metrics?.leadsOverTime && metrics.leadsOverTime.length > 0 ? (
            <ChartContainer config={chartConfig} className="h-[200px] sm:h-[250px] md:h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={metrics.leadsOverTime}>
                  <defs>
                    <linearGradient id="colorLeads" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--color-leads)" stopOpacity={0.8}/>
                      <stop offset="95%" stopColor="var(--color-leads)" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="date" 
                    tickFormatter={(value) => {
                      const date = new Date(value)
                      return `${date.getDate()}/${date.getMonth() + 1}`
                    }}
                    fontSize={10}
                    className="text-xs"
                  />
                  <YAxis fontSize={10} className="text-xs" />
                  <ChartTooltip 
                    content={<ChartTooltipContent />}
                    labelFormatter={(value) => {
                      const date = new Date(value)
                      return date.toLocaleDateString('ro-RO')
                    }}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="count" 
                    stroke="var(--color-leads)" 
                    fillOpacity={1}
                    fill="url(#colorLeads)" 
                  />
                </AreaChart>
              </ResponsiveContainer>
            </ChartContainer>
          ) : (
            <div className="flex items-center justify-center h-[200px] sm:h-[250px] md:h-[300px] text-muted-foreground text-sm">
              Nu există date
            </div>
          )}
        </CardContent>
      </Card>

      {/* Metode de plata - Cash vs Card */}
      <Card className="hidden lg:block">
        <CardHeader>
          <CardTitle className="text-base sm:text-lg">Metode de Plată</CardTitle>
          <CardDescription className="text-xs sm:text-sm">Distribuția lead-urilor după metoda de plată</CardDescription>
        </CardHeader>
        <CardContent>
          {metrics?.paymentMethodStats && (metrics.paymentMethodStats.cash > 0 || metrics.paymentMethodStats.card > 0 || metrics.paymentMethodStats.none > 0) ? (
            <ChartContainer config={chartConfig} className="h-[200px] sm:h-[250px] md:h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={[
                      { name: 'Cash', value: metrics.paymentMethodStats.cash },
                      { name: 'Card', value: metrics.paymentMethodStats.card },
                      { name: 'Nespecificat', value: metrics.paymentMethodStats.none }
                    ]}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, value, percent }) => `${name}: ${value} (${(percent * 100).toFixed(0)}%)`}
                    outerRadius={pieRadius}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {[
                      { name: 'Cash', value: metrics.paymentMethodStats.cash },
                      { name: 'Card', value: metrics.paymentMethodStats.card },
                      { name: 'Nespecificat', value: metrics.paymentMethodStats.none }
                    ].map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={index === 0 ? '#10b981' : index === 1 ? '#3b82f6' : '#6b7280'} />
                    ))}
                  </Pie>
                  <ChartTooltip content={<ChartTooltipContent />} />
                </PieChart>
              </ResponsiveContainer>
            </ChartContainer>
          ) : (
            <div className="flex items-center justify-center h-[200px] sm:h-[250px] md:h-[300px] text-muted-foreground text-sm">
              Nu există date
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

