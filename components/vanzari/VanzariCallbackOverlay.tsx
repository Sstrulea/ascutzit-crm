/**
 * MODUL VÂNZARI - CALLBACK OVERLAY
 * ====================================
 * Overlay pentru programare callback
 */

'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Calendar } from 'lucide-react'

interface VanzariCallbackOverlayProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: (date: Date) => void
  defaultDate?: Date
}

export function VanzariCallbackOverlay({
  isOpen,
  onClose,
  onConfirm,
  defaultDate
}: VanzariCallbackOverlayProps) {
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

    const callbackDate = new Date(selectedDate)
    callbackDate.setHours(hours, minutes, 0, 0)
    onConfirm(callbackDate)
    onClose()
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="text-2xl">📞</span>
            Programare Callback
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="date">Data</Label>
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <input
                id="date"
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
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
            Confirmă
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}