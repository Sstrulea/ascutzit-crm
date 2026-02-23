"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Clock } from "lucide-react"

type QuickTimeType = '5m' | '10m' | '15m' | '20m' | '30m' | '1h' | '2h' | '4h' | 'custom'

interface NuRaspundeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (time: string, type: QuickTimeType) => void
  leadName?: string
}

export function NuRaspundeDialog({ open, onOpenChange, onConfirm, leadName }: NuRaspundeDialogProps) {
  const [selectedType, setSelectedType] = useState<QuickTimeType>('1h')
  const [customTime, setCustomTime] = useState<string>("")

  const quickTimes = [
    { value: '5m' as const, label: '5 minute', description: 'Reapel în 5 minute' },
    { value: '10m' as const, label: '10 minute', description: 'Reapel în 10 minute' },
    { value: '15m' as const, label: '15 minute', description: 'Reapel în 15 minute' },
    { value: '20m' as const, label: '20 minute', description: 'Reapel în 20 minute' },
    { value: '30m' as const, label: '30 minute', description: 'Reapel în 30 minute' },
    { value: '1h' as const, label: '1 oră', description: 'Reapel în 1 oră' },
    { value: '2h' as const, label: '2 ore', description: 'Reapel în 2 ore' },
    { value: '4h' as const, label: '4 ore', description: 'Reapel în 4 ore' },
  ]

  const handleConfirm = () => {
    if (selectedType === 'custom') {
      if (!customTime) return
      onConfirm(customTime, 'custom')
    } else {
      // Calculate time from now
      const now = new Date()
      let minutesToAdd = 0
      
      switch (selectedType) {
        case '5m': minutesToAdd = 5; break
        case '10m': minutesToAdd = 10; break
        case '15m': minutesToAdd = 15; break
        case '20m': minutesToAdd = 20; break
        case '30m': minutesToAdd = 30; break
        case '1h': minutesToAdd = 60; break
        case '2h': minutesToAdd = 120; break
        case '4h': minutesToAdd = 240; break
      }
      
      now.setMinutes(now.getMinutes() + minutesToAdd)
      const timeStr = now.toTimeString().slice(0, 5)
      onConfirm(timeStr, selectedType)
    }
  }

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setSelectedType('1h')
      setCustomTime("")
    }
    onOpenChange(newOpen)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Programează Reapel
          </DialogTitle>
          <DialogDescription>
            {leadName && `Pentru: ${leadName}`}
            <span className="block text-sm text-muted-foreground">
              Clientul nu a răspuns. Alege când să reapelăm.
            </span>
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="space-y-3">
            <div className="text-sm font-medium">Opțiuni rapide</div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
              {quickTimes.map((time) => (
                <button
                  key={time.value}
                  type="button"
                  onClick={() => setSelectedType(time.value)}
                  data-button-id={`nuRaspunde${time.value}Button`}
                  aria-label={time.description}
                  className={`
                    p-4 rounded-lg border-2 text-left transition-all
                    ${selectedType === time.value 
                      ? 'border-primary bg-primary/5' 
                      : 'border-border hover:border-primary/50 hover:bg-muted/50'
                    }
                  `}
                >
                  <div className="font-medium">{time.label}</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {time.description}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2 pt-4 border-t">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="callback-type"
                checked={selectedType === 'custom'}
                onChange={() => setSelectedType('custom')}
                className="h-4 w-4"
              />
              <span className="text-sm font-medium">Oră personalizată</span>
            </label>
            
            {selectedType === 'custom' && (
              <div className="ml-6">
                <input
                  type="time"
                  value={customTime}
                  onChange={(e) => setCustomTime(e.target.value)}
                  className="w-full h-10 px-3 rounded-md border border-input bg-background"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Introdu ora la care să reapelăm (ex: 15:30)
                </p>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button 
            variant="outline" 
            onClick={() => handleOpenChange(false)}
            data-button-id="nuRaspundeDialogCancelButton"
            aria-label="Anulează programarea reapel"
          >
            Anulează
          </Button>
          <Button 
            onClick={handleConfirm}
            data-button-id="nuRaspundeDialogConfirmButton"
            aria-label="Confirmă programarea reapel"
          >
            Programează Reapel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}