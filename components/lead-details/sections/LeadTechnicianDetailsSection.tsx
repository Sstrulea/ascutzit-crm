/**
 * Caseta colapsabilă: Detalii comunicate de tehnician.
 * Append-only: fiecare adăugare se marchează cu stage-ul în care a fost introdusă.
 * Editabil DOAR în departamente tehnice (Saloane, Frizerii, Horeca, Reparatii).
 */

import { useState } from 'react'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Wrench, ChevronDown, ChevronRight, Loader2, Pencil, Save, X } from 'lucide-react'
import type { TechnicianDetailEntry } from '@/lib/supabase/serviceFileOperations'
import { format } from 'date-fns'
import { ro } from 'date-fns/locale'

export interface LeadTechnicianDetailsSectionProps {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  entries: TechnicianDetailEntry[]
  /** Editabil doar în departamente tehnice */
  canEdit?: boolean
  /** Stage-urile disponibile pentru selecție la adăugare */
  availableStages?: Array<{ key: string; label: string }>
  /** Stage implicit pentru noile intrări */
  defaultStageLabel?: string
  defaultStageKey?: string
  /** Callback la adăugare - returnează lista actualizată */
  onAppend?: (text: string, stage: string, stageLabel: string) => Promise<TechnicianDetailEntry[]>
  saving?: boolean
  loading?: boolean
}

function formatEntryDisplay(entry: TechnicianDetailEntry): string {
  const date = entry.at ? format(new Date(entry.at), 'dd MMM HH:mm', { locale: ro }) : ''
  return date ? `[${entry.stageLabel}]: ${entry.text}\n(${date})` : `[${entry.stageLabel}]: ${entry.text}`
}

export function LeadTechnicianDetailsSection({
  isOpen,
  onOpenChange,
  entries,
  canEdit = false,
  availableStages = [
    { key: 'in_lucru', label: 'In lucru' },
    { key: 'qc', label: 'QC' },
    { key: 'finalizare', label: 'Finalizare' },
    { key: 'in_asteptare', label: 'In Asteptare' },
    { key: 'noua', label: 'Noua' },
  ],
  defaultStageLabel = 'In lucru',
  defaultStageKey = 'in_lucru',
  onAppend,
  saving = false,
  loading = false,
}: LeadTechnicianDetailsSectionProps) {
  const [isAdding, setIsAdding] = useState(false)
  const [newText, setNewText] = useState('')
  const [selectedStageKey, setSelectedStageKey] = useState(defaultStageKey)
  const selectedStage = availableStages.find((s) => s.key === selectedStageKey) ?? availableStages[0]

  const handleAdd = () => {
    setNewText('')
    setSelectedStageKey(defaultStageKey)
    setIsAdding(true)
  }

  const handleCancel = () => {
    setIsAdding(false)
    setNewText('')
  }

  const handleSave = async () => {
    const trimmed = (newText ?? '').trim()
    if (!trimmed || !onAppend) return
    await onAppend(trimmed, selectedStage.key, selectedStage.label)
    setNewText('')
    setIsAdding(false)
  }

  const displayText = entries.length > 0
    ? entries.map(formatEntryDisplay).join('\n\n')
    : null

  return (
    <Collapsible open={isOpen} onOpenChange={onOpenChange}>
      <div className="rounded-xl border bg-gradient-to-br from-slate-50/80 to-white dark:from-slate-900/80 dark:to-slate-800/50 shadow-sm overflow-hidden">
        <CollapsibleTrigger className="flex items-center justify-between w-full p-3 hover:bg-slate-100/50 dark:hover:bg-slate-800/50 transition-colors">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-full bg-gradient-to-br from-blue-400/20 to-indigo-500/10 flex items-center justify-center">
              <Wrench className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            </div>
            <span className="font-semibold text-sm">Detalii comunicate de tehnician</span>
          </div>
          {isOpen ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="px-3 pb-4">
            <div className="h-px bg-gradient-to-r from-transparent via-border to-transparent" />
            {loading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : isAdding ? (
              <>
                <div className="mt-2 mb-2 flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Etapă:</span>
                  <Select value={selectedStageKey} onValueChange={setSelectedStageKey}>
                    <SelectTrigger className="h-8 w-[140px] text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {availableStages.map((s) => (
                        <SelectItem key={s.key} value={s.key}>
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Textarea
                  value={newText}
                  onChange={(e) => setNewText(e.target.value)}
                  placeholder="Ex: S-a rupt o foarfecă..."
                  className="min-h-[80px] text-xs sm:text-sm resize-none mt-1"
                />
                <div className="flex justify-end gap-2 mt-3">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCancel}
                    disabled={saving}
                    className="h-8 text-xs gap-1.5"
                  >
                    <X className="h-3.5 w-3.5" />
                    Anulează
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleSave}
                    disabled={saving || !(newText ?? '').trim()}
                    className="h-8 text-xs gap-1.5 bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600 text-white shadow-sm"
                  >
                    {saving ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Save className="h-3.5 w-3.5" />
                    )}
                    Adaugă
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div className="min-h-[60px] text-xs sm:text-sm text-foreground whitespace-pre-wrap rounded-md py-2 px-0">
                  {displayText ?? (
                    <span className="text-muted-foreground">
                      {canEdit
                        ? 'Adaugă detalii din etapa de lucru, QC etc. Fiecare notă se marchează cu etapa în care a fost introdusă.'
                        : 'Doar utilizatorii din departamente tehnice (Saloane, Frizerii, Horeca, Reparatii) pot adăuga detalii.'}
                    </span>
                  )}
                </div>
                {canEdit && onAppend && (
                  <div className="flex justify-end mt-3">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleAdd}
                      className="h-8 text-xs gap-1.5 border-primary/30 text-primary hover:bg-primary/10 hover:border-primary"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      Adaugă notă
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  )
}
