/**
 * MODUL VÂNZARI - NU RĂSPUNDE OVERLAY
 * ====================================
 * Overlay pentru programare reapel
 */

'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { PhoneOff } from 'lucide-react'

interface VanzariNuRaspundeOverlayProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: (time: string) => void
  defaultTime?: string
}

export function VanzariNuRaspundeOverlay({
  isOpen,
  onClose,
  onConfirm,
  defaultTime = '15:00'
}: VanzariNuRaspundeOverlayProps) {
  const [hours, setHours] = useState<number>(parseInt(defaultTime.split(':')[0]))
  const [minutes, setMinutes] = useState<number>(parseInt(defaultTime.split(':')[1]))

  const handleConfirm = () => {
    const timeString = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
    onConfirm(timeString)
    onClose()
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PhoneOff className="h-6 w-6 text-orange-500" />
            Nu Răspunde - Programare Reapel
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Ora programării</Label>
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <Label htmlFor="hours" className="sr-only">Ora</Label>
                <input
                  id="hours"
                  type="number"
                  min="0"
                  max="23"
                  value={hours}
                  onChange={(e) => setHours(Math.min(23, Math.max(0, parseInt(e.target.value) || 0)))}
                  className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500 text-center text-2xl"
                />
              </div>
              <span className="text-2xl font-bold">:</span>
              <div className="flex-1">
                <Label htmlFor="minutes" className="sr-only">Minutul</Label>
                <input
                  id="minutes"
                  type="number"
                  min="0"
                  max="59"
                  value={minutes}
                  onChange={(e) => setMinutes(Math.min(59, Math.max(0, parseInt(e.target.value) || 0)))}
                  className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500 text-center text-2xl"
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Dacă ora a trecut, reapelul va fi programat pentru mâine
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Anulează
          </Button>
          <Button onClick={handleConfirm} className="bg-orange-600 hover:bg-orange-700">
            Confirmă
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}