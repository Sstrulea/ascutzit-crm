/**
 * Componentă pentru secțiunea de pipelines
 */

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { ArrowRight, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

interface LeadPipelinesSectionProps {
  allPipeNames: string[]
  selectedPipes: string[]
  movingPipes: boolean
  onTogglePipe: (name: string) => void
  onPickAll: () => void
  onClearAll: () => void
  onBulkMove: () => void
  onMoveToPipeline: (targetName: string) => void
  /** Mod compact (~15% mai puțin spațiu) – pentru mobil */
  compact?: boolean
}

export function LeadPipelinesSection({
  allPipeNames,
  selectedPipes,
  movingPipes,
  onTogglePipe,
  onPickAll,
  onClearAll,
  onBulkMove,
  onMoveToPipeline,
  compact = false,
}: LeadPipelinesSectionProps) {
  return (
    <div className={compact ? "space-y-1.5" : ""}>
      <label className={cn(
        "text-xs font-medium text-muted-foreground uppercase block",
        compact ? "mb-1.5" : "mb-2"
      )}>
        Mută în Pipeline
      </label>

      <div className={cn(
        "flex flex-wrap border-t",
        compact ? "gap-1.5 mt-2 pt-2" : "gap-2 mt-3 pt-3"
      )}>
        {allPipeNames.slice(0, 5).map((pipeName) => (
          <Button
            key={pipeName}
            variant="outline"
            size="sm"
            onClick={() => onMoveToPipeline(pipeName)}
            className={compact ? "h-6 text-xs px-2" : "h-7 text-xs"}
          >
            <ArrowRight className={compact ? "h-2.5 w-2.5 mr-1" : "h-3 w-3 mr-1"} />
            {pipeName}
          </Button>
        ))}
      </div>
    </div>
  )
}


