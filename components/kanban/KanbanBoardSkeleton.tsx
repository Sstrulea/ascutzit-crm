"use client"

import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

const COLUMNS = 5
const CARDS_PER_COLUMN = 4

export function KanbanBoardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("flex gap-4 overflow-x-auto pb-2 min-h-[420px]", className)}>
      {Array.from({ length: COLUMNS }).map((_, colIndex) => (
        <div
          key={colIndex}
          className="flex-shrink-0 w-[280px] rounded-lg border border-border bg-muted/30 flex flex-col"
        >
          <div className="p-3 border-b border-border">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-4 w-12 mt-2" />
          </div>
          <div className="p-2 flex flex-col gap-2 flex-1 min-h-[200px]">
            {Array.from({ length: CARDS_PER_COLUMN }).map((_, cardIndex) => (
              <div
                key={cardIndex}
                className="rounded-md border border-border/50 bg-background p-3 space-y-2"
              >
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-1/2" />
                <div className="flex gap-1 pt-1">
                  <Skeleton className="h-5 w-14 rounded-full" />
                  <Skeleton className="h-5 w-16 rounded-full" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
