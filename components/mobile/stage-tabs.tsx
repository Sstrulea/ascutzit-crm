'use client'

import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'

interface StageTabsProps {
  stages: string[]
  currentStage: string
  onStageChange: (stage: string) => void
  leadCounts?: Record<string, number>
}

export function StageTabs({ stages, currentStage, onStageChange, leadCounts = {} }: StageTabsProps) {
  return (
    <div className="border-b bg-background sticky top-0 z-10 md:hidden">
      <div className="overflow-x-auto overflow-y-hidden scrollbar-hide scroll-smooth-horizontal -webkit-overflow-scrolling-touch">
        <div className="flex gap-3 px-4 py-3.5 min-w-max">
          {stages.map((stage) => {
            const count = leadCounts[stage] || 0
            const isActive = stage === currentStage
            
            return (
              <button
                key={stage}
                onClick={() => onStageChange(stage)}
                className={cn(
                  "flex items-center gap-2.5 px-5 py-3 rounded-xl text-sm font-semibold whitespace-nowrap transition-all",
                  "min-h-[48px] touch-manipulation select-none active:scale-[0.98]",
                  isActive
                    ? "bg-foreground text-background shadow-sm"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                )}
              >
                <span className="uppercase tracking-wide">{stage}</span>
                {count > 0 && (
                  <Badge
                    className={cn(
                      "text-xs min-w-[24px] h-6 px-2 flex items-center justify-center rounded-full font-medium",
                      isActive
                        ? "bg-background/20 text-background border-0"
                        : "bg-background/10 text-muted-foreground border-0"
                    )}
                  >
                    {count}
                  </Badge>
                )}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

