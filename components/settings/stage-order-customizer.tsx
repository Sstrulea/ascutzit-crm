"use client"

import { useEffect, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { GripVertical } from "lucide-react"
import { cn } from "@/lib/utils"

type Props = {
  open: boolean
  onOpenChange: (v: boolean) => void
  pipelineName: string
  stages: string[]
  orderedStages: string[]
  onSave: (ordered: string[]) => void
  onReset: () => void
  /** Numărul de item-uri per stage (opțional, pentru badge) */
  itemCounts?: Record<string, number>
}

export function StageOrderCustomizer({
  open,
  onOpenChange,
  pipelineName,
  stages,
  orderedStages,
  onSave,
  onReset,
  itemCounts = {},
}: Props) {
  const [items, setItems] = useState<string[]>(orderedStages)
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)

  useEffect(() => {
    if (open) {
      setItems(orderedStages)
    }
  }, [open, orderedStages])

  const onDragStart = (index: number) => () => setDraggedIndex(index)
  const onDragOver = (index: number) => (e: React.DragEvent) => {
    e.preventDefault()
    if (draggedIndex === null || draggedIndex === index) return
    setItems((prev) => {
      const arr = [...prev]
      const [moved] = arr.splice(draggedIndex, 1)
      arr.splice(index, 0, moved)
      return arr
    })
    setDraggedIndex(index)
  }
  const onDragEnd = () => setDraggedIndex(null)

  const handleSave = () => {
    onSave(items)
    onOpenChange(false)
  }

  const handleReset = () => {
    onReset()
    setItems(stages)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-0 gap-0 overflow-hidden rounded-lg shadow-xl">
        <DialogHeader className="p-6 pb-4 border-b">
          <DialogTitle className="text-lg font-semibold">Customizare Layout</DialogTitle>
        </DialogHeader>

        <div className="p-6 pt-4 space-y-5">
          <div>
            <Label className="text-sm font-medium text-foreground">Pipeline</Label>
            <p className="mt-1 text-sm text-muted-foreground">{pipelineName}</p>
          </div>

          <div>
            <Label className="text-sm font-medium text-foreground mb-2 block">
              Stages (drag to reorder)
            </Label>
            <ul
              className="max-h-[50vh] overflow-y-auto rounded-md border border-border divide-y divide-border bg-muted/20"
              role="list"
            >
              {items.map((stage, idx) => (
                <li
                  key={stage}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 bg-background transition-colors",
                    draggedIndex === idx && "opacity-50"
                  )}
                  draggable
                  onDragStart={onDragStart(idx)}
                  onDragOver={onDragOver(idx)}
                  onDragEnd={onDragEnd}
                >
                  <GripVertical
                    className="h-4 w-4 shrink-0 text-muted-foreground cursor-grab active:cursor-grabbing"
                    aria-hidden
                  />
                  <span className="flex-1 font-medium text-foreground">{stage}</span>
                  {itemCounts[stage] !== undefined && (
                    <span className="text-xs text-muted-foreground shrink-0">
                      {itemCounts[stage]} item-uri
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <DialogFooter className="p-4 pt-0 flex flex-row justify-end gap-2 border-t bg-muted/30">
          <Button variant="outline" onClick={handleReset}>
            Resetează
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button onClick={handleSave}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
