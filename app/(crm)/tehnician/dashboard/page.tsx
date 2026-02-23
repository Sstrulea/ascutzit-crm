'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabaseBrowser } from '@/lib/supabase/supabaseClient'
import { useAuth } from '@/lib/contexts/AuthContext'
import { TechnicianStatisticsService } from '@/lib/supabase/technicianStatisticsService'
import type { TechnicianStatistics } from '@/lib/supabase/technicianStatisticsTypes'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import { 
  ArrowLeft, 
  BarChart3, 
  Clock, 
  DollarSign, 
  Package, 
  Users, 
  Wrench, 
  TrendingUp, 
  TrendingDown,
  Calendar,
  Filter,
  Download,
  RefreshCw,
  Loader2
} from 'lucide-react'
import { toast } from 'sonner'

const supabase = supabaseBrowser()
const statsService = new TechnicianStatisticsService()

export default function TechnicianDashboardPage() {
  const router = useRouter()
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [statistics, setStatistics] = useState<TechnicianStatistics | null>(null)
  const [activeTab, setActiveTab] = useState('overview')
  const [period, setPeriod] = useState<'today' | 'week' | 'month'>('today')
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    if (!user?.id) {
      router.push('/auth/sign-in')
      return
    }
    loadStatistics()
  }, [user, period])

  const loadStatistics = async () => {
    if (!user?.id) return

    setLoading(true)
    try {
      const stats = await statsService.getTechnicianStatistics(user.id, { period })
      setStatistics(stats)
    } catch (error: any) {
      console.error('Error loading statistics:', error)
      toast.error('Eroare la încărcarea statisticilor')
    } finally {
      setLoading(false)
    }
  }

  const handleRefresh = async () => {
    setRefreshing(true)
    statsService.clearCacheForTechnician(user?.id || '')
    await loadStatistics()
    setRefreshing(false)
    toast.success('Statisticile au fost actualizate')
  }

  const formatTime = (minutes: number) => {
    if (minutes < 60) {
      return `${Math.round(minutes)} min`
    }
    const hours = Math.floor(minutes / 60)
    const mins = Math.round(minutes % 60)
    if (mins === 0) {
      return `${hours} h`
    }
    return `${hours} h ${mins} min`
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('ro-RO', {
      style: 'currency',
      currency: 'RON'
    }).format(amount)
  }

  const getEfficiencyColor = (efficiency: number) => {
    if (efficiency >= 100) return 'text-green-600 dark:text-green-400'
    if (efficiency >= 80) return 'text-yellow-600 dark:text-yellow-400'
    return 'text-red-600 dark:text-red-400'
  }

  const getEfficiencyIcon = (efficiency: number) => {
    if (efficiency >= 100) return <TrendingUp className="h-4 w-4" />
    if (efficiency >= 80) return <TrendingUp className="h-4 w-4" />
    return <TrendingDown className="h-4 w-4" />
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!statistics) {
    return (
      <div className="flex flex-col items-center justify-center h-screen">
        <Package className="h-16 w-16 text-muted-foreground mb-4" />
        <h2 className="text-xl font-semibold mb-2">Nu există date</h2>
        <p className="text-muted-foreground mb-4">Nu s-au găsit statistici pentru tehnicianul curent</p>
        <Button onClick={handleRefresh}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Reîncarcă
        </Button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background pb-20 px-4 md:px-6">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-background border-b p-4 md:p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.back()}
              className="gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Înapoi
            </Button>
            <div>
              <h1 className="text-xl md:text-2xl font-semibold">Dashboard Tehnician</h1>
              <p className="text-sm text-muted-foreground">
                {statistics.technicianName} • {period === 'today' ? 'Astăzi' : period === 'week' ? 'Săptămâna' : 'Luna'}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 bg-muted rounded-lg p-1">
              <Button
                variant={period === 'today' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setPeriod('today')}
                className="h-8 px-3"
              >
                Astăzi
              </Button>
              <Button
                variant={period === 'week' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setPeriod('week')}
                className="h-8 px-3"
              >
                Săptămâna
              </Button>
              <Button
                variant={period === 'month' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setPeriod('month')}
                className="h-8 px-3"
              >
                Luna
              </Button>
            </div>
            
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={refreshing}
              className="gap-2"
            >
              {refreshing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Actualizează
            </Button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto py-6 space-y-6">
        {/* Statistici rapide */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Timp lucru */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Timp Lucru
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {formatTime(period === 'today' ? statistics.workTimeToday : 
                          period === 'week' ? statistics.workTimeWeek : 
                          statistics.workTimeMonth)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {period === 'today' ? 'Astăzi' : period === 'week' ? 'Săptămâna' : 'Luna'}
              </p>
            </CardContent>
          </Card>

          {/* Venituri */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <DollarSign className="h-4 w-4" />
                Venituri
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                {formatCurrency(period === 'today' ? statistics.earningsToday : 
                              period === 'week' ? statistics.earningsWeek : 
                              statistics.earningsMonth)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {period === 'today' ? 'Astăzi' : period === 'week' ? 'Săptămâna' : 'Luna'}
              </p>
            </CardContent>
          </Card>

          {/* Tăvițe */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Package className="h-4 w-4" />
                Tăvițe
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {period === 'today' ? statistics.traysToday : 
                 period === 'week' ? statistics.traysWeek : 
                 statistics.traysMonth}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {period === 'today' ? 'Astăzi' : period === 'week' ? 'Săptămâna' : 'Luna'}
              </p>
            </CardContent>
          </Card>

          {/* Eficiență */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <BarChart3 className="h-4 w-4" />
                Eficiență
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <div className={`text-2xl font-bold ${getEfficiencyColor(statistics.efficiencyRate)}`}>
                  {statistics.efficiencyRate.toFixed(1)}%
                </div>
                {getEfficiencyIcon(statistics.efficiencyRate)}
              </div>
              <div className="mt-2">
                <Progress value={Math.min(statistics.efficiencyRate, 100)} className="h-2" />
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Timp estimat vs. real
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Tabs principale */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6">
            <TabsTrigger value="overview">Prezentare generală</TabsTrigger>
            <TabsTrigger value="trays">Tăvițe</TabsTrigger>
            <TabsTrigger value="time">Timp</TabsTrigger>
            <TabsTrigger value="earnings">Venituri</TabsTrigger>
            <TabsTrigger value="instruments">Instrumente</TabsTrigger>
            <TabsTrigger value="split">Împărțire</TabsTrigger>
          </TabsList>

          {/* Prezentare generală */}
          <TabsContent value="overview" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Statistici detaliate */}
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle>Statistici detaliate</CardTitle>
                  <CardDescription>
                    Performanța ta în ultima perioadă
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <h3 className="text-sm font-medium text-muted-foreground">Timp estimat</h3>
                        <p className="text-lg font-semibold">
                          {formatTime(period === 'today' ? statistics.estimatedTimeToday : 
                                     period === 'week' ? statistics.estimatedTimeWeek : 
                                     statistics.estimatedTimeMonth)}
                        </p>
                      </div>
                      <div className="space-y-2">
                        <h3 className="text-sm font-medium text-muted-foreground">Timp în așteptare</h3>
                        <p className="text-lg font-semibold">
                          {formatTime(period === 'today' ? statistics.waitingTimeToday : 
                                     period === 'week' ? statistics.waitingTimeWeek : 
                                     statistics.waitingTimeMonth)}
                        </p>
                      </div>
                    </div>

                    <Separator />

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <h3 className="text-sm font-medium text-muted-foreground">Instrumente folosite</h3>
                        <p className="text-lg font-semibold">
                          {period === 'today' ? statistics.instrumentsToday : 
                           period === 'week' ? statistics.instrumentsWeek : 
                           statistics.instrumentsMonth}
                        </p>
                      </div>
                      <div className="space-y-2">
                        <h3 className="text-sm font-medium text-muted-foreground">Timp mediu/serviciu</h3>
                        <p className="text-lg font-semibold">
                          {formatTime(statistics.averageTimePerService)}
                        </p>
                      </div>
                    </div>

                    <Separator />

                    <div className="space-y-2">
                      <h3 className="text-sm font-medium text-muted-flex items-center gap-2">
                        <Users className="h-4 w-4" />
                        Tăvițe împărțite
                      </h3>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-sm">
                          {statistics.sharedTraysCount} tăvițe
                        </Badge>
                        <span className="text-sm text-muted-foreground">
                          {statistics.splitTrays.length} operațiuni de împărțire
                        </span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Performanță */}
              <Card>
                <CardHeader>
                  <CardTitle>Performanță</CardTitle>
                  <CardDescription>
                    Indicatori de performanță
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Eficiență</span>
                      <span className={`text-sm font-medium ${getEfficiencyColor(statistics.efficiencyRate)}`}>
                        {statistics.efficiencyRate.toFixed(1)}%
                      </span>
                    </div>
                    <Progress value={Math.min(statistics.efficiencyRate, 100)} className="h-2" />
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Utilizare timp</span>
                      <span className="text-sm font-medium">
                        {((statistics.workTimeTotal / (statistics.workTimeTotal + statistics.waitingTimeTotal)) * 100).toFixed(1)}%
                      </span>
                    </div>
                    <Progress 
                      value={(statistics.workTimeTotal / (statistics.workTimeTotal + statistics.waitingTimeTotal)) * 100} 
                      className="h-2" 
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Rata orară</span>
                      <span className="text-sm font-medium text-green-600 dark:text-green-400">
                        {formatCurrency(statistics.earningsTotal / (statistics.workTimeTotal / 60))}/h
                      </span>
                    </div>
                    <Progress 
                      value={Math.min((statistics.earningsTotal / (statistics.workTimeTotal / 60)) / 100, 100)} 
                      className="h-2" 
                    />
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Tăvițe */}
          <TabsContent value="trays" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Tăvițe prelucrate</CardTitle>
                <CardDescription>
                  {statistics.traysProcessed.length} tăvițe în total
                </CardDescription>
              </CardHeader>
              <CardContent>
                {statistics.traysProcessed.length === 0 ? (
                  <div className="text-center py-8">
                    <Package className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <p className="text-muted-foreground">Nu există tăvițe prelucrate în această perioadă</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {statistics.traysProcessed.slice(0, 10).map((tray) => (
                      <div key={tray.trayId} className="flex items-center justify-between p-4 border rounded-lg">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{tray.trayNumber}</span>
                            <Badge variant={tray.status === 'completed' ? 'default' : 'secondary'}>
                              {tray.status === 'completed' ? 'Finalizată' : 
                               tray.status === 'in_progress' ? 'În lucru' : 
                               tray.status === 'waiting' ? 'În așteptare' : 'Împărțită'}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {tray.clientName || 'Fără client'}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-medium">{formatTime(tray.workTime)}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatCurrency(tray.actualAmount)}
                          </p>
                        </div>
                      </div>
                    ))}
                    {statistics.traysProcessed.length > 10 && (
                      <div className="text-center pt-4">
                        <Button variant="outline" size="sm">
                          Vezi toate {statistics.traysProcessed.length} tăvițe
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Timp */}
          <TabsContent value="time" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Timp lucru per tăviță */}
              <Card>
                <CardHeader>
                  <CardTitle>Timp lucru per tăviță</CardTitle>
                  <CardDescription>
                    Distribuția timpului de lucru
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {statistics.workTimePerTray.length === 0 ? (
                    <div className="text-center py-8">
                      <Clock className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                      <p className="text-muted-foreground">Nu există date de timp</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {statistics.workTimePerTray.slice(0, 5).map((tray) => (
                        <div key={tray.trayId} className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium">{tray.trayNumber}</span>
                            <span className="text-sm">{formatTime(tray.workTime)}</span>
                          </div>
                          <Progress value={(tray.workTime / Math.max(...statistics.workTimePerTray.map(t => t.workTime))) * 100} className="h-2" />
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Timp în așteptare */}
              <Card>
                <CardHeader>
                  <CardTitle>Timp în așteptare</CardTitle>
                  <CardDescription>
                    Perioadele de așteptare
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {statistics.waitingTimePerTray.length === 0 ? (
                    <div className="text-center py-8">
                      <Clock className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                      <p className="text-muted-foreground">Nu există timp în așteptare</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {statistics.waitingTimePerTray.slice(0, 5).map((tray) => (
                        <div key={tray.trayId} className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium">{tray.trayNumber}</span>
                            <span className="text-sm">{formatTime(tray.waitingTime)}</span>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {tray.reason || 'Fără motiv specificat'}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Venituri */}
          <TabsContent value="earnings" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Distribuția veniturilor</CardTitle>
                <CardDescription>
                  Venituri totale: {formatCurrency(statistics.earningsTotal)}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  <div className="grid grid-cols-3 gap-4">
                    <div className="text-center p-4 bg-green-50 dark:bg-green-950/20 rounded-lg">
                      <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                        {formatCurrency(statistics.earningsToday)}
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">Astăzi</p>
                    </div>
                    <div className="text-center p-4 bg-green-50 dark:bg-green-950/20 rounded-lg">
                      <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                        {formatCurrency(statistics.earningsWeek)}
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">Săptămâna</p>
                    </div>
                    <div className="text-center p-4 bg-green-50 dark:bg-green-950/20 rounded-lg">
                      <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                        {formatCurrency(statistics.earningsMonth)}
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">Luna</p>
                    </div>
                  </div>

                  <Separator />

                  <div className="space-y-4">
                    <h3 className="text-sm font-medium">Rata orară</h3>
                    <div className="grid grid-cols-3 gap-4">
                      <div className="text-center">
                        <div className="text-lg font-semibold">
                          {formatCurrency(statistics.earningsToday / (statistics.workTimeToday / 60))}/h
                        </div>
                        <p className="text-xs text-muted-foreground">Astăzi</p>
                      </div>
                      <div className="text-center">
                        <div className="text-lg font-semibold">
                          {formatCurrency(statistics.earningsWeek / (statistics.workTimeWeek / 60))}/h
                        </div>
                        <p className="text-xs text-muted-foreground">Săptămâna</p>
                      </div>
                      <div className="text-center">
                        <div className="text-lg font-semibold">
                          {formatCurrency(statistics.earningsMonth / (statistics.workTimeMonth / 60))}/h
                        </div>
                        <p className="text-xs text-muted-foreground">Luna</p>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Instrumente */}
          <TabsContent value="instruments" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Instrumente utilizate</CardTitle>
                <CardDescription>
                  {statistics.instrumentsCount} instrumente în total
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  <div className="grid grid-cols-3 gap-4">
                    <div className="text-center p-4 bg-blue-50 dark:bg-blue-950/20 rounded-lg">
                      <div className="text-2xl font-bold">
                        {statistics.instrumentsToday}
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">Astăzi</p>
                    </div>
                    <div className="text-center p-4 bg-blue-50 dark:bg-blue-950/20 rounded-lg">
                      <div className="text-2xl font-bold">
                        {statistics.instrumentsWeek}
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">Săptămâna</p>
                    </div>
                    <div className="text-center p-4 bg-blue-50 dark:bg-blue-950/20 rounded-lg">
                      <div className="text-2xl font-bold">
                        {statistics.instrumentsMonth}
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">Luna</p>
                    </div>
                  </div>

                  <Separator />

                  <div className="space-y-2">
                    <h3 className="text-sm font-medium">Instrumente per tăviță</h3>
                    <p className="text-muted-foreground">
                      Media: {(statistics.instrumentsCount / statistics.traysCount).toFixed(1)} instrumente/tăviță
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Împărțire */}
          <TabsContent value="split" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Tăvițe împărțite</CardTitle>
                <CardDescription>
                  {statistics.splitTrays.length} operațiuni de împărțire
                </CardDescription>
              </CardHeader>
              <CardContent>
                {statistics.splitTrays.length === 0 ? (
                  <div className="text-center py-8">
                    <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <p className="text-muted-foreground">Nu există tăvițe împărțite</p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {statistics.splitTrays.map((split, index) => (
                      <div key={index} className="space-y-4 p-4 border rounded-lg">
                        <div className="flex items-center justify-between">
                          <div>
                            <h4 className="font-medium">Tăvița originală: {split.originalTrayNumber}</h4>
                            <p className="text-sm text-muted-foreground">
                              Împărțită pe {new Date(split.splitDate).toLocaleDateString('ro-RO')}
                            </p>
                          </div>
                          <Badge variant="outline">
                            {split.splitTrays.length} tăvițe rezultate
                          </Badge>
                        </div>
                        
                        <div className="space-y-3">
                          {split.splitTrays.map((tray, trayIndex) => (
                            <div key={trayIndex} className="flex items-center justify-between p-3 bg-muted/50 rounded">
                              <div className="space-y-1">
                                <p className="text-sm font-medium">{tray.trayNumber}</p>
                                <p className="text-xs text-muted-foreground">{tray.technicianName}</p>
                              </div>
                              <div className="text-right">
                                <p className="text-sm">{tray.itemsCount} item-uri</p>
                                <p className="text-xs text-muted-foreground">{formatTime(tray.estimatedTime)} estimat</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Footer cu informații */}
        <div className="text-center text-sm text-muted-foreground pt-8 border-t">
          <p>Ultima actualizare: {statistics.lastUpdated.toLocaleDateString('ro-RO')} {statistics.lastUpdated.toLocaleTimeString('ro-RO')}</p>
          <p className="mt-1">Datele sunt actualizate automat și pot fi editate de administrator</p>
        </div>
      </div>
    </div>
  )
}
