"use client"

import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

interface PriorityBadgeProps {
  priority: "URGENTARE" | "NORMAL"
  className?: string
}

export function PriorityBadge({ priority, className }: PriorityBadgeProps) {
  if (priority === "URGENTARE") {
    return (
      <Badge
        variant="destructive"
        className={cn("text-xs font-bold uppercase", className)}
      >
        URGENTARE
      </Badge>
    )
  }

  return null // NORMAL nu afișează badge
}
