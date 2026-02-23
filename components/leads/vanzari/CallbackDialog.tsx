"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Calendar, Clock, CalendarDays } from "lucide-react"

interface CallbackDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (date: Date, note?: string) => Promise<void> | void
  leadName?: string
  leadPhone?: string
}

export function CallbackDialog({ open, onOpenChange, onConfirm, leadName, leadPhone }: CallbackDialogProps) {
  const [selectedDate, setSelectedDate] = useState<string>("")
  const [selectedTime, setSelectedTime] = useState<string>("")
  const [note, setNote] = useState<string>("")
  const [loading, setLoading] = useState(false)

  // Quick time options for same-day callbacks
  const quickTimeOptions = [
    { label: '10 min', minutes: 10 },
    { label: '15 min', minutes: 15 },
    { label: '30 min', minutes: 30 },
    { label: '1 oră', minutes: 60 },
    { label: '2 ore', minutes: 120 },
    { label: '3 ore', minutes: 180 },
  ]

  // Quick date options for future callbacks
  const quickDateOptions = [
    { label: 'Mâine', days: 1 },
    { label: 'Poimâine', days: 2 },
    { label: 'Săptămâna', days: 7 },
    { label: 'Lună', days: 30 },
  ]

  const handleQuickTime = (minutes: number) => {
    const now = new Date()
    now.setMinutes(now.getMinutes() + minutes)
    setSelectedDate(now.toISOString().split('T')[0])
    setSelectedTime(now.toTimeString().slice(0, 5))
  }

  const handleQuickDate = (days: number) => {
    const now = new Date()
    now.setDate(now.getDate() + days)
    now.setHours(10, 0, 0, 0) // Default la 10:00
    setSelectedDate(now.toISOString().split('T')[0])
    setSelectedTime('10:00')
  }

  const handleQuickSelect = async (date: Date) => {
    setLoading(true)
    try {
      await onConfirm(date, note || undefined)
      onOpenChange(false)
    } catch (error) {
      console.error('Error quick select:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleConfirm = async () => {
    if (!selectedDate || !selectedTime) {
      return // Date/time required
    }

    const dateTime = new Date(`${selectedDate}T${selectedTime}`)
    setLoading(true)
    try {
      await onConfirm(dateTime, note || undefined)
      onOpenChange(false)
    } catch (error) {
      console.error('Error confirm:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      // Reset form on close
      setSelectedDate("")
      setSelectedTime("")
      setNote("")
    }
    onOpenChange(newOpen)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Programează Callback
          </DialogTitle>
          <DialogDescription>
            {leadName && `Pentru: ${leadName}`}
            {leadPhone && <span className="block text-sm text-muted-foreground">{leadPhone}</span>}
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          {/* Quick Selection Section */}
          <div className="space-y-3 pb-3 border-b">
            <Label className="text-sm font-medium flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Programare Rapidă
            </Label>
            
            {/* Time-based quick buttons */}
            <div className="grid grid-cols-3 gap-2">
              {quickTimeOptions.map((option) => (
                <Button
                  key={option.label}
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const date = new Date()
                    date.setMinutes(date.getMinutes() + option.minutes)
                    handleQuickSelect(date)
                  }}
                  disabled={loading}
                  className="text-sm h-9"
                  data-button-id={`callbackQuick${option.minutes}Button`}
                  aria-label={`Programare callback în ${option.label}`}
                >
                  {option.label}
                </Button>
              ))}
            </div>
            
            {/* Date-based quick buttons */}
            <div className="grid grid-cols-4 gap-2">
              {quickDateOptions.map((option) => (
                <Button
                  key={option.label}
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const date = new Date()
                    date.setDate(date.getDate() + option.days)
                    date.setHours(10, 0, 0, 0)
                    handleQuickSelect(date)
                  }}
                  disabled={loading}
                  className="text-sm h-9"
                  data-button-id={`callbackDate${option.days}Button`}
                  aria-label={`Programare callback ${option.label}`}
                >
                  {option.label}
                </Button>
              ))}
            </div>
          </div>

          {/* Manual Selection Section */}
          <div className="space-y-3">
            <Label className="text-sm font-medium flex items-center gap-2">
              <CalendarDays className="h-4 w-4" />
              Selecție Manuală
            </Label>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="callback-date" className="text-xs text-muted-foreground">Data</Label>
                <Input
                  id="callback-date"
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                  disabled={loading}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="callback-time" className="text-xs text-muted-foreground">Ora</Label>
                <Input
                  id="callback-time"
                  type="time"
                  value={selectedTime}
                  onChange={(e) => setSelectedTime(e.target.value)}
                  disabled={loading}
                />
              </div>
            </div>
          </div>

          {/* Note Section */}
          <div className="space-y-2">
            <Label htmlFor="callback-note">Notă (opțional)</Label>
            <Textarea
              id="callback-note"
              placeholder="Adaugă o notă despre acest callback..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              disabled={loading}
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button 
            variant="outline" 
            onClick={() => handleOpenChange(false)} 
            disabled={loading}
            data-button-id="callbackDialogCancelButton"
            aria-label="Anulează programarea callback"
          >
            Anulează
          </Button>
          <Button 
            onClick={handleConfirm}
            disabled={loading || !selectedDate || !selectedTime}
            data-button-id="callbackDialogConfirmButton"
            aria-label="Confirmă programarea callback"
          >
            {loading ? 'Se salvează...' : 'Programează'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}