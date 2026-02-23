/**
 * Caseta colapsabilă: Detalii comunicate de client (leads.details).
 * Prima caseta – doar acest conținut.
 * Editabil de cei cu acces la Receptie sau Vânzări. Butoane Editează / Salvează / Anulează.
 */

import { useState, useEffect, type ReactNode } from 'react'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { MessageSquare, ChevronDown, ChevronRight, Loader2, Pencil, Save, X } from 'lucide-react'

/** Render details text cu "Instrument:" și conținutul său în bold roșu */
function renderDetailsWithInstrumentHighlight(text: string) {
  if (!text || !text.trim()) return null
  const lines = text.split(/\r?\n/)
  const nodes: ReactNode[] = []
  const instrumentLabelRegex = /^(\s*)(Instrument:?\s*)(.*)$/i
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const match = line.match(instrumentLabelRegex)
    if (match) {
      const [, leading, label, sameLineValue] = match
      nodes.push(leading ?? '')
      nodes.push(
        <span key={`inst-${i}`} className="font-bold text-red-600 dark:text-red-400">
          {label}
          {sameLineValue ? sameLineValue : ''}
        </span>
      )
      if (!sameLineValue.trim() && i + 1 < lines.length) {
        nodes.push('\n')
        nodes.push(
          <span key={`inst-val-${i}`} className="font-bold text-red-600 dark:text-red-400">
            {lines[i + 1]}
          </span>
        )
        i += 1
      }
      nodes.push(i < lines.length - 1 ? '\n' : '')
      continue
    }
    nodes.push(line)
    if (i < lines.length - 1) nodes.push('\n')
  }
  return <>{nodes}</>
}

export interface LeadDetailsSectionProps {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  trayDetails: string
  setTrayDetails: (details: string) => void
  loadingTrayDetails: boolean
  /** Editabil pentru utilizatori cu acces la Receptie sau Vânzări */
  canEdit?: boolean
  /** Salvare explicită (salvează și în istoric) */
  onSave?: (value: string) => Promise<void>
  saving?: boolean
}

export function LeadDetailsSection({
  isOpen,
  onOpenChange,
  trayDetails,
  setTrayDetails,
  loadingTrayDetails,
  canEdit = false,
  onSave,
  saving = false,
}: LeadDetailsSectionProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState('')

  useEffect(() => {
    if (isEditing) setEditValue(trayDetails)
  }, [isEditing, trayDetails])

  const handleEdit = () => {
    setEditValue(trayDetails)
    setIsEditing(true)
  }

  const handleCancel = () => {
    setIsEditing(false)
    setEditValue('')
  }

  const handleSave = async () => {
    const trimmed = (editValue ?? '').trim()
    if (!trimmed || !onSave) return
    await onSave(trimmed)
    setTrayDetails(trimmed)
    setIsEditing(false)
  }

  return (
    <Collapsible open={isOpen} onOpenChange={onOpenChange}>
      <div className="rounded-xl border bg-gradient-to-br from-slate-50/80 to-white dark:from-slate-900/80 dark:to-slate-800/50 shadow-sm overflow-hidden">
        <CollapsibleTrigger className="flex items-center justify-between w-full p-3 hover:bg-slate-100/50 dark:hover:bg-slate-800/50 transition-colors">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-full bg-gradient-to-br from-amber-400/20 to-orange-500/10 flex items-center justify-center">
              <MessageSquare className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            </div>
            <span className="font-semibold text-sm">Detalii comunicate de client</span>
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
            {loadingTrayDetails ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : isEditing ? (
              <>
                <Textarea
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  placeholder="Introduceți detaliile comunicate de client (din formular sau manual)..."
                  className="min-h-[80px] sm:min-h-[100px] text-xs sm:text-sm resize-none mt-3"
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
                    disabled={saving || !(editValue ?? '').trim()}
                    className="h-8 text-xs gap-1.5 bg-gradient-to-r from-emerald-500 to-green-500 hover:from-emerald-600 hover:to-green-600 text-white shadow-sm"
                  >
                    {saving ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Save className="h-3.5 w-3.5" />
                    )}
                    Salvează
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div className="min-h-[80px] sm:min-h-[100px] text-xs sm:text-sm text-foreground whitespace-pre-wrap rounded-md border border-transparent bg-transparent py-2 px-0">
                  {trayDetails ? renderDetailsWithInstrumentHighlight(trayDetails) : (
                    <span className="text-muted-foreground">
                      {canEdit ? 'Introduceți detaliile comunicate de client (din formular sau manual)...' : 'Doar utilizatorii cu acces la Receptie sau Vânzări pot edita.'}
                    </span>
                  )}
                </div>
                {canEdit && onSave && (
                  <div className="flex justify-end mt-3">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleEdit}
                      className="h-8 text-xs gap-1.5 border-primary/30 text-primary hover:bg-primary/10 hover:border-primary"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      Editează
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
