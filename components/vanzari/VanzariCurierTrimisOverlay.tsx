/**
 * MODUL VÂNZARI - CURIER TRIMIS OVERLAY
 * =======================================
 * Overlay pentru programare curier trimis
 */

'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Package } from 'lucide-react'

interface VanzariCurierTrimisOverlayProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: (date: Date) => void
  defaultDate?: Date
}

export function VanzariCurierTrimisOverlay({
  isOpen,
  onClose,
  onConfirm,
  defaultDate
}: VanzariCurierTrimisOverlayProps) {
  const [selectedDate, setSelectedDate] = useState<string>(
    defaultDate ? defaultDate.toISOString().split('T')[0] : new Date().toISOString().split('T')[0]
  )
  const [selectedTime, setSelectedTime] = useState<string>(
    defaultDate ? defaultDate.toTimeString().slice(0, 5) : '09:00'
  )

  const handleConfirm = () => {
    // Validare: trebuie să fie și dată și oră
    if (!selectedDate || !selectedTime) {
      return
    }

    const [hours, minutes] = selectedTime.split(':').map(Number)
    
    // Validare: valorile trebuie să fie numere valide
    if (isNaN(hours) || isNaN(minutes)) {
      return
    }

    const scheduledDate = new Date(selectedDate)
    scheduledDate.setHours(hours, minutes, 0, 0)
    onConfirm(scheduledDate)
    onClose()
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-blue-600">
            <Package className="h-6 w-6" />
            Curier Trimis
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="bg-blue-50 dark:bg-blue-950/20 p-3 rounded-lg">
            <p className="text-sm text-blue-800 dark:text-blue-200">
              <strong>Notă:</strong> Această acțiune va crea automat o fișă de serviciu
              și va muta lead-ul temporar în stage-ul "Curier Trimis" pentru 24h.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="date">Data</Label>
            <input
              id="date"
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="time">Ora</Label>
            <input
              id="time"
              type="time"
              value={selectedTime}
              onChange={(e) => setSelectedTime(e.target.value)}
              className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Anulează
          </Button>
          <Button onClick={handleConfirm} className="bg-blue-600 hover:bg-blue-700">
            Confirmă Curier Trimis
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}