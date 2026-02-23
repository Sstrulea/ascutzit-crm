'use client'

import { useState } from 'react'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Ban, Clock, PhoneOff } from 'lucide-react'
import { format } from 'date-fns'
import { ro } from 'date-fns/locale'
import type { Lead } from '@/app/(crm)/dashboard/page'

interface ClientDetailsProps {
  lead: Lead | null
  noDeal: boolean
  nuRaspunde: boolean
  nuRaspundeCallbackAt?: string | null
  callBack: boolean
  onNoDealChange: (checked: boolean) => void
  onNuRaspundeChange: (checked: boolean, callbackTime?: string) => void
  onCallBackChange: (checked: boolean) => void
  showCheckboxes?: boolean
}

/**
 * Componentă independentă pentru afișarea și gestionarea detaliilor clientului
 * Include informațiile de contact și checkboxes-urile pentru acțiuni lead
 */
export function ClientDetails({
  lead,
  noDeal,
  nuRaspunde,
  nuRaspundeCallbackAt,
  callBack,
  onNoDealChange,
  onNuRaspundeChange,
  onCallBackChange,
  showCheckboxes = true,
}: ClientDetailsProps) {
  // State pentru dialog-ul de selectare oră pentru Nu Răspunde
  const [showNuRaspundeDialog, setShowNuRaspundeDialog] = useState(false)
  const [selectedHour, setSelectedHour] = useState('09')
  const [selectedMinute, setSelectedMinute] = useState('00')

  // Generează opțiunile pentru ore (08:00 - 18:00)
  const hours = Array.from({ length: 11 }, (_, i) => String(i + 8).padStart(2, '0'))
  // Generează opțiunile pentru minute (00, 15, 30, 45)
  const minutes = ['00', '15', '30', '45']

  // Formatează ora de callback pentru afișare
  const formatCallbackTime = (dateTimeString: string | null | undefined) => {
    if (!dateTimeString) return null
    try {
      const date = new Date(dateTimeString)
      return format(date, 'HH:mm', { locale: ro })
    } catch {
      return null
    }
  }

  const callbackTimeDisplay = formatCallbackTime(nuRaspundeCallbackAt)

  if (!lead) return null

  return (
    <div className="space-y-4">
      {/* Informații Contact */}
      <div className="px-4 py-3 bg-muted/30 border rounded-lg">
        <h3 className="font-medium text-sm mb-2">Informații Contact</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm">
          <div>
            <span className="text-muted-foreground">Nume: </span>
            <span className="font-medium">{lead.name || '—'}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Email: </span>
            <span className="font-medium">{lead.email || '—'}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Telefon: </span>
            <span className="font-medium">{lead.phone || '—'}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Oraș: </span>
            <span className="font-medium">{lead.city || '—'}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Adresa: </span>
            <span className="font-medium">{lead.address || '—'}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Adresa 2: </span>
            <span className="font-medium">{lead.address2 || '—'}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Cod postal: </span>
            <span className="font-medium">{lead.zip || '—'}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Denumirea Companiei: </span>
            <span className="font-medium">{lead.company_name || '—'}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Adresa companiei: </span>
            <span className="font-medium">{lead.company_address || '—'}</span>
          </div>
        </div>
      </div>

      {/* Acțiuni Lead — No Deal / Nu Răspunde ca butoane (ca Programează Callback), Call Back rămâne checkbox */}
      {showCheckboxes && (
        <div className="px-4 py-3 bg-muted/30 border rounded-lg">
          <h4 className="font-medium text-sm mb-3">Acțiuni Lead</h4>
          <div className="flex flex-wrap items-center gap-3">
            {/* No Deal — buton */}
            {noDeal ? (
              <div className="flex items-center gap-2 px-2 py-1 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/50">
                <span className="text-xs font-medium text-red-700 dark:text-red-300">No Deal activ</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onNoDealChange(false)}
                  className="h-6 px-2 text-xs text-red-700 hover:bg-red-100 dark:text-red-300 dark:hover:bg-red-900/50"
                >
                  Anulează
                </Button>
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onNoDealChange(true)}
                className="h-8 px-3 text-xs gap-1.5 border-red-200 text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950/50"
              >
                <Ban className="h-3.5 w-3.5" />
                No Deal
              </Button>
            )}
            {/* Call Back — checkbox ca înainte */}
            <label className="flex items-center gap-2 cursor-pointer">
              <Checkbox
                checked={callBack}
                onCheckedChange={onCallBackChange}
                className="data-[state=checked]:bg-blue-500 data-[state=checked]:border-blue-500"
              />
              <span className={`text-sm font-medium ${callBack ? 'text-blue-600' : 'text-muted-foreground'}`}>
                Call Back
              </span>
            </label>
            {/* Nu Răspunde — buton */}
            {nuRaspunde ? (
              <div className="flex items-center gap-2 px-2 py-1 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/50">
                <span className="text-xs font-medium text-amber-700 dark:text-amber-300">
                  Nu răspunde{callbackTimeDisplay ? ` (${callbackTimeDisplay})` : ''}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onNuRaspundeChange(false)}
                  className="h-6 px-2 text-xs text-amber-700 hover:bg-amber-100 dark:text-amber-300 dark:hover:bg-amber-900/50"
                >
                  Anulează
                </Button>
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowNuRaspundeDialog(true)}
                className="h-8 px-3 text-xs gap-1.5 border-amber-200 text-amber-700 hover:bg-amber-50 dark:border-amber-800 dark:text-amber-300 dark:hover:bg-amber-950/50"
              >
                <PhoneOff className="h-3.5 w-3.5" />
                Nu răspunde
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Dialog pentru selectarea orei de callback pentru Nu Răspunde */}
      <Dialog 
        open={showNuRaspundeDialog} 
        onOpenChange={(open) => {
          setShowNuRaspundeDialog(open)
          if (!open) {
            // Resetează la valori implicite când se închide dialog-ul
            setSelectedHour('09')
            setSelectedMinute('00')
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Când să sunăm din nou?</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">
              Selectează ora la care să fie sunat din nou clientul astăzi ({format(new Date(), 'dd MMMM yyyy', { locale: ro })})
            </p>
            <div className="flex items-center gap-4">
              <div className="flex-1 space-y-2">
                <Label>Ora</Label>
                <Select value={selectedHour} onValueChange={setSelectedHour}>
                  <SelectTrigger>
                    <SelectValue placeholder="Ora" />
                  </SelectTrigger>
                  <SelectContent>
                    {hours.map((hour) => (
                      <SelectItem key={hour} value={hour}>
                        {hour}:00
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-1 space-y-2">
                <Label>Minute</Label>
                <Select value={selectedMinute} onValueChange={setSelectedMinute}>
                  <SelectTrigger>
                    <SelectValue placeholder="Minute" />
                  </SelectTrigger>
                  <SelectContent>
                    {minutes.map((minute) => (
                      <SelectItem key={minute} value={minute}>
                        :{minute}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="text-center p-3 bg-orange-50 dark:bg-orange-950/30 rounded-lg">
              <p className="text-sm font-medium text-orange-700 dark:text-orange-400">
                <Clock className="inline h-4 w-4 mr-1" />
                Ora programată: {selectedHour}:{selectedMinute}
              </p>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setShowNuRaspundeDialog(false)}
            >
              Anulează
            </Button>
            <Button
              className="bg-orange-500 hover:bg-orange-600"
              onClick={() => {
                // Creează timestamp-ul pentru ziua curentă cu ora selectată
                const today = new Date()
                today.setHours(parseInt(selectedHour), parseInt(selectedMinute), 0, 0)
                const callbackTime = today.toISOString()
                
                onNuRaspundeChange(true, callbackTime)
                setShowNuRaspundeDialog(false)
              }}
            >
              Confirmă
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}



