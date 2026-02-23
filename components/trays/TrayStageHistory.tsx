'use client'

/**
 * Componentă UI pentru afișarea istoricului de stage-uri al unei tăvițe.
 * 
 * Această componentă afișează un timeline complet al mutărilor unei tăvițe
 * între stage-uri, cu statistici, informații despre utilizatori și note.
 */

import { useTrayStageHistory } from '@/hooks/useTrayStageHistory'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Loader2, RefreshCw, Clock, User, ArrowRight, Package } from 'lucide-react'
import { format, formatDistanceToNow, formatDuration, intervalToDuration } from 'date-fns'
import { ro } from 'date-fns/locale'
import { cn } from '@/lib/utils'

interface TrayStageHistoryProps {
  trayId: string | null
  pipelineId?: string | null
  className?: string
  showStats?: boolean
  autoRefresh?: boolean
}

export function TrayStageHistory({
  trayId,
  pipelineId,
  className,
  showStats = true,
  autoRefresh = false,
}: TrayStageHistoryProps) {
  const {
    history,
    currentStage,
    stats,
    loading,
    error,
    refresh,
    loadMore,
    hasMore,
  } = useTrayStageHistory({
    trayId: trayId || '',
    pipelineId: pipelineId || undefined,
    autoRefresh,
  })

  // Dacă nu există trayId, afișează mesaj
  if (!trayId) {
    return (
      <Card className={className}>
        <CardContent className="p-6 text-center text-muted-foreground">
          Selectează o tăviță pentru a vedea istoricul
        </CardContent>
      </Card>
    )
  }

  // Loading state inițial
  if (loading && history.length === 0) {
    return (
      <Card className={className}>
        <CardContent className="p-6 flex items-center justify-center" aria-busy="true" aria-label="Se încarcă istoricul">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          <span className="ml-2 text-muted-foreground">Se încarcă istoricul...</span>
        </CardContent>
      </Card>
    )
  }

  // Error state
  if (error) {
    return (
      <Card className={className}>
        <CardContent className="p-6" role="alert" aria-live="polite">
          <div className="text-center space-y-4">
            <p className="text-destructive">Eroare la încărcarea istoricului</p>
            <p className="text-sm text-muted-foreground">
              {error instanceof Error ? error.message : 'Eroare necunoscută'}
            </p>
            <Button
              onClick={refresh}
              variant="outline"
              size="sm"
              aria-label="Reîncearcă încărcarea istoricului"
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Reîncearcă
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Istoric Mutări Stage-uri</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Istoricul complet al mutărilor tăviței între stage-uri
            </p>
          </div>
          <Button
            onClick={refresh}
            variant="ghost"
            size="sm"
            disabled={loading}
            aria-label={loading ? "Se încarcă istoricul" : "Reîncarcă istoricul"}
            aria-busy={loading}
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Statistici */}
        {showStats && stats && (
          <div className="mb-6 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Total mutări</p>
              <p className="text-2xl font-semibold">{stats.totalMoves}</p>
            </div>

            {stats.currentStage && (
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Stage curent</p>
                <p className="text-sm font-medium">{stats.currentStage.name}</p>
                <p className="text-xs text-muted-foreground">{stats.currentStage.pipelineName}</p>
              </div>
            )}

            {stats.timeInCurrentStage !== null && (
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Timp în stage</p>
                <p className="text-sm font-medium">
                  {formatDuration(
                    intervalToDuration({
                      start: 0,
                      end: stats.timeInCurrentStage * 1000,
                    }),
                    { locale: ro }
                  )}
                </p>
              </div>
            )}

            {stats.lastMoveAt && (
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Ultima mutare</p>
                <p className="text-sm font-medium">
                  {formatDistanceToNow(new Date(stats.lastMoveAt), {
                    addSuffix: true,
                    locale: ro,
                  })}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Timeline */}
        {history.length === 0 ? (
          <div className="text-center py-8 space-y-2" role="status" aria-live="polite">
            <p className="text-muted-foreground">Nu există înregistrări de istoric pentru această tăviță</p>
            <p className="text-sm text-muted-foreground">
              Istoricul va fi creat automat când tăvița este mutată între stage-uri
            </p>
          </div>
        ) : (
          <div
            role="list"
            aria-label="Istoric mutări stage-uri"
            aria-live="polite"
            className="space-y-4"
          >
            {history.map((entry, index) => {
              // Validare date pentru entry-uri
              if (!entry.to_stage) {
                console.warn('[TrayStageHistory] Entry missing to_stage:', entry)
                return null
              }

              const movedAt = entry.moved_at ? new Date(entry.moved_at) : null
              if (!movedAt || isNaN(movedAt.getTime())) {
                console.warn('[TrayStageHistory] Invalid moved_at:', entry.moved_at)
                return null
              }

              const isFirst = index === 0
              const isLast = index === history.length - 1

              return (
                <div
                  key={entry.id}
                  role="listitem"
                  aria-label={`Mutare ${index + 1}: ${entry.from_stage?.name || 'N/A'} → ${entry.to_stage.name}`}
                  className={cn(
                    "relative flex gap-4 pb-4",
                    !isLast && "border-l-2 border-muted pl-4"
                  )}
                >
                  {/* Indicator temporal */}
                  <div className="flex-shrink-0">
                    <div
                      className={cn(
                        "h-3 w-3 rounded-full border-2 mt-1",
                        isFirst
                          ? "bg-primary border-primary"
                          : "bg-muted border-muted-foreground"
                      )}
                    />
                  </div>

                  {/* Conținut */}
                  <div className="flex-1 space-y-2 min-w-0">
                    {/* Stage-uri */}
                    <div className="flex items-center gap-2 flex-wrap">
                      {entry.from_stage ? (
                        <>
                          <Badge variant="outline">{entry.from_stage.name}</Badge>
                          <ArrowRight className="h-4 w-4 text-muted-foreground" />
                        </>
                      ) : (
                        <Package className="h-4 w-4 text-muted-foreground" />
                      )}
                      <Badge variant="default">{entry.to_stage.name}</Badge>
                    </div>

                    {/* Pipeline */}
                    {entry.pipeline && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <span>Pipeline:</span>
                        <span className="font-medium">{entry.pipeline.name}</span>
                      </div>
                    )}

                    {/* Timestamp și utilizator */}
                    <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                      <div className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        <span>
                          {format(movedAt, "dd MMM yyyy, HH:mm", { locale: ro })}
                        </span>
                        <span className="ml-1">
                          ({formatDistanceToNow(movedAt, { addSuffix: true, locale: ro })})
                        </span>
                      </div>

                      {entry.moved_by_user && (
                        <div className="flex items-center gap-1">
                          <User className="h-3 w-3" />
                          <span>{entry.moved_by_user.email || 'Utilizator necunoscut'}</span>
                        </div>
                      )}
                    </div>

                    {/* Note */}
                    {entry.notes && (
                      <div className="text-sm text-muted-foreground bg-muted/50 rounded-md p-2">
                        {entry.notes}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Buton pentru încărcare mai mult */}
        {hasMore && (
          <div className="mt-4 text-center">
            <Button
              onClick={loadMore}
              disabled={loading}
              variant="outline"
              aria-label={loading ? "Se încarcă mai multe înregistrări" : "Încarcă mai multe înregistrări"}
              aria-busy={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Se încarcă...
                </>
              ) : (
                'Încarcă mai mult'
              )}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
