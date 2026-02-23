'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { 
  TrendingUp, 
  AlertCircle, 
  Clock, 
  Users,
  ArrowRight,
  Lightbulb
} from 'lucide-react'
import { cn } from '@/lib/utils'
import Link from 'next/link'

interface Insight {
  type: 'success' | 'warning' | 'info'
  title: string
  description: string
  action?: {
    label: string
    href: string
  }
}

interface DashboardInsightsProps {
  metrics: {
    urgentLeads: number
    topTechnicians: Array<{ name: string; leads: number; revenue: number }>
    conversionRate: number
    averageLeadValue: number
  } | null
  loading: boolean
}

export function DashboardInsights({ metrics, loading }: DashboardInsightsProps) {
  const insights: Insight[] = []

  if (metrics) {
    // Insight pentru lead-uri urgente
    if (metrics.urgentLeads > 0) {
      insights.push({
        type: 'warning',
        title: `${metrics.urgentLeads} Lead-uri Urgente`,
        description: 'Există lead-uri marcate ca urgente care necesită atenție imediată.',
        action: {
          label: 'Vezi lead-urile urgente',
          href: '/leads?filter=urgent'
        }
      })
    }

    // Insight pentru conversion rate
    if (metrics.conversionRate < 20) {
      insights.push({
        type: 'warning',
        title: 'Rate de Conversie Scăzut',
        description: `Rate-ul de conversie este ${metrics.conversionRate.toFixed(1)}%. Ar putea fi nevoie de optimizare a procesului.`,
      })
    } else if (metrics.conversionRate > 50) {
      insights.push({
        type: 'success',
        title: 'Rate de Conversie Excelent',
        description: `Rate-ul de conversie este ${metrics.conversionRate.toFixed(1)}%. Procesul funcționează bine!`,
      })
    }

    // Insight pentru valoarea medie a lead-ului
    if (metrics.averageLeadValue > 0) {
      insights.push({
        type: 'info',
        title: `Valoare Medie Lead: ${metrics.averageLeadValue.toFixed(2)} RON`,
        description: 'Aceasta este valoarea medie a unui lead în sistem.',
      })
    }

    // Insight pentru top technician
    if (metrics.topTechnicians.length > 0) {
      const topTech = metrics.topTechnicians[0]
      insights.push({
        type: 'success',
        title: `Top Tehnician: ${topTech.name}`,
        description: `${topTech.leads} lead-uri, ${topTech.revenue.toFixed(2)} RON revenue.`,
      })
    }
  }

  if (loading) {
    return (
      <Card className="hidden lg:block">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Skeleton className="h-5 w-5" />
            <Skeleton className="h-6 w-48" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  if (insights.length === 0) {
    return (
      <Card className="hidden lg:block">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Lightbulb className="h-5 w-5 text-muted-foreground" />
            <CardTitle>Insights</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Lightbulb className="h-12 w-12 text-muted-foreground mb-3 opacity-50" />
            <p className="text-sm text-muted-foreground">
              Nu există insights disponibile momentan
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="hidden lg:block">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Lightbulb className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground" />
          <CardTitle className="text-base sm:text-lg">Insights & Recomandări</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2 sm:space-y-3">
          {insights.map((insight, index) => (
            <div
              key={index}
              className={cn(
                "flex items-start gap-2 sm:gap-3 p-3 sm:p-4 rounded-lg border",
                insight.type === 'success' && "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800",
                insight.type === 'warning' && "bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800",
                insight.type === 'info' && "bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800"
              )}
            >
              <div className={cn(
                "flex-shrink-0 mt-0.5",
                insight.type === 'success' && "text-emerald-600",
                insight.type === 'warning' && "text-amber-600",
                insight.type === 'info' && "text-blue-600"
              )}>
                {insight.type === 'success' && <TrendingUp className="h-4 w-4 sm:h-5 sm:w-5" />}
                {insight.type === 'warning' && <AlertCircle className="h-4 w-4 sm:h-5 sm:w-5" />}
                {insight.type === 'info' && <Clock className="h-4 w-4 sm:h-5 sm:w-5" />}
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="font-semibold text-xs sm:text-sm mb-1">{insight.title}</h4>
                <p className="text-xs sm:text-sm text-muted-foreground">{insight.description}</p>
                {insight.action && (
                  <Button
                    variant="link"
                    size="sm"
                    className="mt-2 h-auto p-0 text-xs"
                    asChild
                  >
                    <Link href={insight.action.href}>
                      {insight.action.label}
                      <ArrowRight className="ml-1 h-3 w-3" />
                    </Link>
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

