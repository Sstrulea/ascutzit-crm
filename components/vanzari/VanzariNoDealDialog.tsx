/**
 * MODUL VÂNZARI - NO DEAL DIALOG
 * ================================
 * Dialog de confirmare pentru marcarea lead-ului ca No Deal
 */

'use client'

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { XCircle, AlertTriangle } from 'lucide-react'

interface VanzariNoDealDialogProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  leadName?: string
}

export function VanzariNoDealDialog({
  isOpen,
  onClose,
  onConfirm,
  leadName
}: VanzariNoDealDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-600">
            <XCircle className="h-6 w-6" />
            Confirmare No Deal
          </DialogTitle>
          <DialogDescription className="flex items-start gap-2 mt-2">
            <AlertTriangle className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">
                Ești sigur că dorești să marchezi acest lead ca No Deal?
              </p>
              {leadName && (
                <p className="text-sm text-muted-foreground mt-1">
                  Lead: <strong>{leadName}</strong>
                </p>
              )}
              <p className="text-sm text-muted-foreground mt-2">
                Această acțiune va:
              </p>
              <ul className="text-sm text-muted-foreground list-disc list-inside mt-1 space-y-1">
                <li>Muta lead-ul în stage-ul "No Deal"</li>
                <li>Incrementa statistica de No Deal</li>
                <li>Înregistra acțiunea în istoric</li>
              </ul>
            </div>
          </DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Anulează
          </Button>
          <Button 
            onClick={onConfirm} 
            className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
          >
            Confirmă No Deal
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}