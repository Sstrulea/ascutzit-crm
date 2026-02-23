'use client'

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Loader2, Package, Edit } from 'lucide-react'

interface EditTrayDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  editingTrayNumber: string
  updatingTray: boolean
  onNumberChange: (value: string) => void
  onUpdate: () => void
  onCancel: () => void
}

export function EditTrayDialog({
  open,
  onOpenChange,
  editingTrayNumber,
  updatingTray,
  onNumberChange,
  onUpdate,
  onCancel,
}: EditTrayDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md p-0 overflow-hidden border-0 shadow-2xl">
        <DialogHeader className="sr-only">
          <DialogTitle>Editează Tăviță</DialogTitle>
          <DialogDescription>
            Modifică detaliile tăviței.
          </DialogDescription>
        </DialogHeader>
        
        {/* Header cu gradient */}
        <div className="bg-gradient-to-r from-blue-500 to-indigo-600 px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-xl bg-white/20 flex items-center justify-center">
              <Edit className="h-6 w-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Editează Tăviță</h2>
              <p className="text-blue-100 text-sm">Modifică detaliile tăviței</p>
            </div>
          </div>
        </div>
        
        {/* Content */}
        <div className="p-6 space-y-5">
          {/* Info box */}
          <div className="p-4 bg-blue-50 dark:bg-blue-950/20 rounded-xl border border-blue-200 dark:border-blue-800">
            <div className="flex items-center gap-3">
              <Package className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              <div>
                <p className="font-medium text-blue-900 dark:text-blue-100">Tăvița #{editingTrayNumber}</p>
                <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                  Actualizează numărul tăviței
                </p>
              </div>
            </div>
          </div>
          
          {/* Form fields */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-tray-number" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Număr tăviță
              </Label>
              <Input
                id="edit-tray-number"
                placeholder="ex: 1, 2, A, B..."
                value={editingTrayNumber}
                onChange={(e) => onNumberChange(e.target.value)}
                disabled={updatingTray}
                className="h-12 text-lg font-semibold border-2 focus:border-blue-500 focus:ring-blue-500/20"
                autoFocus
              />
            </div>
          </div>
        </div>
        
        {/* Footer */}
        <div className="border-t px-6 py-4 bg-gray-50 dark:bg-slate-800/50 flex items-center justify-between gap-3">
          <Button
            variant="ghost"
            onClick={onCancel}
            disabled={updatingTray}
            className="text-gray-600 hover:text-gray-900 dark:text-gray-400"
          >
            Anulează
          </Button>
          <Button
            onClick={onUpdate}
            disabled={updatingTray || !editingTrayNumber.trim()}
            className="bg-blue-600 hover:bg-blue-700 text-white gap-2 px-6 shadow-lg"
          >
            {updatingTray ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Se actualizează...
              </>
            ) : (
              <>
                <Edit className="h-4 w-4" />
                Salvează
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}



