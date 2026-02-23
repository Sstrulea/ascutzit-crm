'use client'

import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Loader2, ArrowRight, Move, Plus, Package } from 'lucide-react'
import type { LeadQuote } from '@/lib/types/preturi'

interface MoveInstrumentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  instrumentToMove: { instrument: { id: string; name: string }; items: any[] } | null
  quotes: LeadQuote[]
  selectedQuoteId: string | null
  targetTrayId: string
  newTrayNumber: string
  movingInstrument: boolean
  onTargetTrayChange: (value: string) => void
  onNewTrayNumberChange: (value: string) => void
  onMove: () => void
  onCancel: () => void
}

export function MoveInstrumentDialog({
  open,
  onOpenChange,
  instrumentToMove,
  quotes,
  selectedQuoteId,
  targetTrayId,
  newTrayNumber,
  movingInstrument,
  onTargetTrayChange,
  onNewTrayNumberChange,
  onMove,
  onCancel,
}: MoveInstrumentDialogProps) {
  const availableTrays = (quotes || []).filter(q => {
    // Exclude tăvița curentă (selectedQuoteId) și tăvițele undefined (fără număr)
    return q.id !== selectedQuoteId && q.number && q.number.trim() !== ''
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg p-0 overflow-hidden border-0 shadow-2xl">
        {/* Accessibility title - hidden visually */}
        <DialogTitle className="sr-only">Mută Instrument în Tăviță</DialogTitle>
        
        {/* Header cu gradient portocaliu */}
        <div className="bg-gradient-to-r from-amber-500 to-orange-600 px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-xl bg-white/20 flex items-center justify-center">
              <Move className="h-6 w-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Mută Instrument în Tăviță</h2>
              <p className="text-amber-100 text-sm">
                {instrumentToMove?.instrument.name}
                <span className="ml-2 px-2 py-0.5 rounded-full bg-white/20 text-xs">
                  Cant: {instrumentToMove?.items.reduce((sum, item) => sum + (Number(item.qty) || 1), 0) || 0}
                </span>
              </p>
            </div>
          </div>
        </div>
        
        {/* Content */}
        <div className="p-6 space-y-5">
          {/* Info despre instrument */}
          <div className="p-4 bg-orange-50 dark:bg-orange-950/30 rounded-xl border border-orange-200 dark:border-orange-800">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-orange-500 flex items-center justify-center shadow">
                <span className="text-white font-bold">
                  {instrumentToMove?.items.reduce((sum, item) => sum + (Number(item.qty) || 1), 0) || 0}
                </span>
              </div>
              <div>
                <p className="font-medium text-orange-900 dark:text-orange-100">
                  {instrumentToMove?.instrument.name}
                  <span className="ml-2 text-sm font-normal text-orange-700 dark:text-orange-300">
                    (Cant: {instrumentToMove?.items.reduce((sum, item) => sum + (Number(item.qty) || 1), 0) || 0})
                  </span>
                </p>
                <div className="flex gap-2 mt-1">
                  <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                    {instrumentToMove?.items.filter(i => i.item_type === 'service').length || 0} servicii
                  </span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                    {instrumentToMove?.items.filter(i => i.item_type === null).length || 0} fără serviciu
                  </span>
                </div>
              </div>
            </div>
          </div>
          
          {/* Selectează tăviță */}
          <div className="space-y-2">
            <Label htmlFor="target-tray" className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Selectează tăvița țintă
            </Label>
            <Select value={targetTrayId} onValueChange={onTargetTrayChange} disabled={movingInstrument}>
              <SelectTrigger 
                id="target-tray" 
                className="h-12 text-lg border-2 focus:border-orange-500 focus:ring-orange-500/20"
              >
                <SelectValue placeholder="Alege unde să muți..." />
              </SelectTrigger>
              <SelectContent>
                {availableTrays.map((q) => (
                  <SelectItem key={q.id} value={q.id} className="py-3">
                    <div className="flex items-center gap-3">
                      <span className="h-8 w-8 rounded-lg bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300 flex items-center justify-center font-bold">
                        {q.number}
                      </span>
                      <div>
                        <span className="font-medium">Tăviță {q.number}</span>
                      </div>
                    </div>
                  </SelectItem>
                ))}
                <SelectItem value="new" className="py-3">
                  <div className="flex items-center gap-3 text-emerald-600 dark:text-emerald-400">
                    <span className="h-8 w-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center">
                      <Plus className="h-4 w-4" />
                    </span>
                    <span className="font-medium">Creează tăviță nouă</span>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          {/* Formularul pentru tăviță nouă */}
          {targetTrayId === 'new' && (
            <div className="p-4 bg-emerald-50 dark:bg-emerald-950/20 rounded-xl border border-emerald-200 dark:border-emerald-800 space-y-4 animate-in slide-in-from-top-2 duration-200">
              <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400 text-sm font-medium">
                <Package className="h-4 w-4" />
                Detalii tăviță nouă
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="new-tray-number" className="text-xs text-emerald-700 dark:text-emerald-400">
                  Număr
                </Label>
                <Input
                  id="new-tray-number"
                  placeholder="1, 2, A..."
                  value={newTrayNumber}
                  onChange={(e) => onNewTrayNumberChange(e.target.value)}
                  disabled={movingInstrument}
                  className="h-10 font-semibold border-2 border-emerald-200 focus:border-emerald-500"
                  autoFocus
                />
              </div>
            </div>
          )}
        </div>
        
        {/* Footer */}
        <div className="border-t px-6 py-4 bg-gray-50 dark:bg-slate-800/50 flex items-center justify-between gap-3">
          <Button
            variant="ghost"
            onClick={onCancel}
            disabled={movingInstrument}
            className="text-gray-600 hover:text-gray-900 dark:text-gray-400"
          >
            Anulează
          </Button>
          <Button
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              console.log('[MoveInstrumentDialog] Button clicked, targetTrayId:', targetTrayId, 'newTrayNumber:', newTrayNumber)
              console.log('[MoveInstrumentDialog] onMove function:', typeof onMove)
              if (onMove) {
                onMove()
              } else {
                console.error('[MoveInstrumentDialog] onMove is not defined!')
              }
            }}
            disabled={movingInstrument || (!targetTrayId || (targetTrayId === 'new' && !newTrayNumber.trim()))}
            className="bg-orange-600 hover:bg-orange-700 text-white gap-2 px-6 shadow-lg"
          >
            {movingInstrument ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Se mută...
              </>
            ) : (
              <>
                <ArrowRight className="h-4 w-4" />
                Mută Instrumentul
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
