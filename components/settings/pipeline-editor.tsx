"use client"

import { useEffect, useMemo, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { GripVertical, Pencil, Check, X } from "lucide-react"
import { cn } from "@/lib/utils"

type StageItem = { id: string; name: string }

type Props = {
  open: boolean
  onOpenChange: (v: boolean) => void
  pipelineName: string
  stages: StageItem[]
  onSubmit: (payload: { pipelineName: string; stages: StageItem[] }) => void | Promise<void>
}

export default function PipelineEditor({
  open,
  onOpenChange,
  pipelineName,
  stages,
  onSubmit,
}: Props) {
  const [name, setName] = useState(pipelineName)
  const [items, setItems] = useState<StageItem[]>(stages)
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingValue, setEditingValue] = useState("")

  useEffect(() => {
    if (open) {
      setName(pipelineName)
      setItems(stages)
      setEditingId(null)
    }
  }, [open, pipelineName, stages])

  const hasChanges = useMemo(() => {
    if (name.trim() !== pipelineName.trim()) return true
    if (items.length !== stages.length) return true
    for (let i = 0; i < items.length; i++) {
      if (items[i].id !== stages[i].id) return true
      if (items[i].name.trim() !== stages[i].name.trim()) return true
    }
    return false
  }, [name, pipelineName, items, stages])

  const onDragStart = (id: string) => () => setDraggedId(id)
  const onDragOver = (index: number) => (e: React.DragEvent) => {
    e.preventDefault()
    if (draggedId === null) return
    setItems((prev) => {
      const fromIndex = prev.findIndex((i) => i.id === draggedId)
      if (fromIndex === -1 || fromIndex === index) return prev
      const arr = [...prev]
      const [moved] = arr.splice(fromIndex, 1)
      arr.splice(index, 0, moved)
      return arr
    })
  }
  const onDragEnd = () => setDraggedId(null)

  const startEdit = (id: string, current: string) => {
    setEditingId(id)
    setEditingValue(current)
  }
  const cancelEdit = () => {
    setEditingId(null)
    setEditingValue("")
  }
  const commitEdit = () => {
    if (!editingId) return
    setItems((prev) => prev.map((it) => (it.id === editingId ? { ...it, name: editingValue.trim() || it.name } : it)))
    cancelEdit()
  }

  const handleSave = async () => {
    await onSubmit({ pipelineName: name.trim(), stages: items })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-0 gap-0 overflow-hidden rounded-lg shadow-xl">
        <DialogHeader className="p-6 pb-4 border-b">
          <DialogTitle className="text-lg font-semibold">Edit board</DialogTitle>
        </DialogHeader>

        <div className="p-6 pt-4 space-y-5">
          <div>
            <Label htmlFor="pipeline-name" className="text-sm font-medium text-foreground">
              Pipeline name
            </Label>
            <Input
              id="pipeline-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1.5"
            />
          </div>

          <div>
            <Label className="text-sm font-medium text-foreground mb-2 block">
              Stages (drag to reorder)
            </Label>
            <ul
              className="max-h-[50vh] overflow-y-auto rounded-md border border-border divide-y divide-border bg-muted/20"
              role="list"
            >
              {items.map((s, idx) => {
                const isEditing = editingId === s.id
                return (
                  <li
                    key={s.id}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2.5 bg-background transition-colors",
                      draggedId === s.id && "opacity-50"
                    )}
                    draggable
                    onDragStart={onDragStart(s.id)}
                    onDragOver={onDragOver(idx)}
                    onDragEnd={onDragEnd}
                  >
                    <GripVertical
                      className="h-4 w-4 shrink-0 text-muted-foreground cursor-grab active:cursor-grabbing"
                      aria-hidden
                    />
                    <div className="flex-1 min-w-0">
                      {isEditing ? (
                        <Input
                          value={editingValue}
                          onChange={(e) => setEditingValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") commitEdit()
                            if (e.key === "Escape") cancelEdit()
                          }}
                          className="h-8"
                          autoFocus
                        />
                      ) : (
                        <span className="font-medium text-foreground">{s.name}</span>
                      )}
                    </div>

                    {isEditing ? (
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          onClick={commitEdit}
                          aria-label="Salvează"
                        >
                          <Check className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          onClick={cancelEdit}
                          aria-label="Anulează"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
                        onClick={() => startEdit(s.id, s.name)}
                        aria-label="Redenumește stage"
                        title="Redenumește stage"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    )}
                  </li>
                )
              })}
            </ul>
          </div>
        </div>

        <DialogFooter className="p-4 pt-0 flex flex-row justify-end gap-2 border-t bg-muted/30">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button onClick={handleSave} disabled={!hasChanges}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
