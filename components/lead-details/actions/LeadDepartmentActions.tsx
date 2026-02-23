/**
 * Componentă pentru acțiunile rapide în pipeline-urile departament
 */

import { Button } from "@/components/ui/button"
import { CheckCircle, Clock, Wrench } from "lucide-react"
import { cn } from "@/lib/utils"

interface LeadDepartmentActionsProps {
  isDepartmentPipeline: boolean
  isReparatiiPipeline: boolean
  isSaloaneHorecaFrizeriiPipeline: boolean
  onInLucru: () => void
  onFinalizare: () => void
  onAsteptPiese: () => void
  onInAsteptare: () => void
  /** Stage sau status curent (ex. lead.stage) pentru butoane active – nuanță mai închisă. */
  currentStage?: string | null
}

function normStage(s: string) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

export function LeadDepartmentActions({
  isDepartmentPipeline,
  isReparatiiPipeline,
  isSaloaneHorecaFrizeriiPipeline,
  onInLucru,
  onFinalizare,
  onAsteptPiese,
  onInAsteptare,
  currentStage,
}: LeadDepartmentActionsProps) {
  if (!isDepartmentPipeline) return null

  const s = normStage(currentStage || '')
  const activeInLucru = /lucru|in_lucru/.test(s)
  const activeFinalizare = /finalizat|gata|finalizata|finalizare/.test(s)
  const activeAsteptPiese = /astept\s*piese|astept_piese/.test(s)
  const activeInAsteptare = /asteptare|in_asteptare/.test(s)

  // Finalizare apare doar când cardul e în: În lucru, În așteptare piese sau În așteptare
  const showFinalizare = activeInLucru || activeAsteptPiese || activeInAsteptare

  return (
    <div className="mb-4 flex items-center gap-3 p-3 bg-muted/50 rounded-lg flex-wrap">
      <span className="text-sm font-medium text-muted-foreground">Acțiuni rapide:</span>
      <Button
        variant="default"
        size="sm"
        onClick={onInLucru}
        className={cn(
          "flex items-center gap-2 text-white border-0",
          activeInLucru
            ? "bg-violet-600 hover:bg-violet-700 ring-2 ring-violet-400 shadow-sm"
            : "bg-violet-100 text-violet-700 hover:bg-violet-200 dark:bg-violet-950/60 dark:text-violet-300 dark:hover:bg-violet-900/60"
        )}
        title="Mută lead-ul în stage-ul În lucru"
      >
        <Wrench className="h-4 w-4" />
        În lucru
      </Button>
      {showFinalizare && (
        <Button
          variant="default"
          size="sm"
          onClick={onFinalizare}
          className={cn(
            "flex items-center gap-2 border-0",
            activeFinalizare
              ? "bg-emerald-600 hover:bg-emerald-700 text-white ring-2 ring-emerald-400 shadow-sm"
              : "bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:hover:bg-emerald-900/60"
          )}
          title="Marchează lead-ul ca finalizat"
        >
          <CheckCircle className="h-4 w-4" />
          Finalizare
        </Button>
      )}
      {isReparatiiPipeline && (
        <Button
          variant="outline"
          size="sm"
          onClick={onAsteptPiese}
          className={cn(
            "flex items-center gap-2 border-2",
            activeAsteptPiese
              ? "bg-amber-600 hover:bg-amber-700 text-white border-amber-600 ring-2 ring-amber-400 shadow-sm"
              : "bg-amber-50 text-amber-700 hover:bg-amber-100 border-amber-300 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-700 dark:hover:bg-amber-900/40"
          )}
          title="Mută lead-ul în stage-ul Aștept piese"
        >
          <Clock className="h-4 w-4" />
          Aștept piese
        </Button>
      )}
      {isSaloaneHorecaFrizeriiPipeline && (
        <Button
          variant="outline"
          size="sm"
          onClick={onInAsteptare}
          className={cn(
            "flex items-center gap-2 border-2",
            activeInAsteptare
              ? "bg-sky-600 hover:bg-sky-700 text-white border-sky-600 ring-2 ring-sky-400 shadow-sm"
              : "bg-sky-50 text-sky-700 hover:bg-sky-100 border-sky-300 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-700 dark:hover:bg-sky-900/40"
          )}
          title="Mută lead-ul în stage-ul În așteptare"
        >
          <Clock className="h-4 w-4" />
          În așteptare
        </Button>
      )}
    </div>
  )
}


