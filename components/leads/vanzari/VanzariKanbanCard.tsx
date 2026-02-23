"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { 
  Phone, 
  PhoneOff, 
  XCircle, 
  Calendar, 
  Clock,
  MoreVertical,
  Tag
} from "lucide-react"
import { 
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { toast } from "sonner"
import { CallbackDialog } from "./CallbackDialog"
import { NuRaspundeDialog } from "./NuRaspundeDialog"
import { setLeadCallback, setLeadNoDeal, setLeadNuRaspunde } from "@/lib/vanzari/leadOperations"
import { format, isBefore, isAfter } from "date-fns"
import { ro } from "date-fns/locale"

interface VanzariKanbanCardProps {
  id: string
  name: string
  phone?: string
  email?: string
  stage?: string
  callbackDate?: string | null
  callbackTime?: string | null
  nuRaspundeTime?: string | null
  tags?: string[]
  isSelected?: boolean
  onSelect?: (selected: boolean) => void
  onMove?: () => void
  onActionComplete?: () => void
  onClick?: () => void
}

export function VanzariKanbanCard({
  id,
  name,
  phone,
  email,
  stage,
  callbackDate,
  callbackTime,
  nuRaspundeTime,
  tags = [],
  isSelected = false,
  onSelect,
  onMove,
  onActionComplete,
  onClick,
}: VanzariKanbanCardProps) {
  const [callbackDialogOpen, setCallbackDialogOpen] = useState(false)
  const [nuRaspundeDialogOpen, setNuRaspundeDialogOpen] = useState(false)
  const [loading, setLoading] = useState<string | null>(null)

  // Check if callback is expired
  const isCallbackExpired = callbackDate && callbackTime
    ? isBefore(new Date(`${callbackDate}T${callbackTime}`), new Date())
    : false

  // Priority tags that should be shown first
  const priorityTags = tags.filter(tag => tag === 'Suna' || tag === 'De Sunat!')
  const otherTags = tags.filter(tag => tag !== 'Suna' && tag !== 'De Sunat!')

  const handleCallback = async (date: Date, note?: string) => {
    setLoading('callback')
    try {
      const result = await setLeadCallback(id, date, { note })
      if (result.error) throw result.error
      
      toast.success('Callback programat cu succes')
      onActionComplete?.()
    } catch (error: any) {
      toast.error(error.message || 'Eroare la programare callback')
    } finally {
      setLoading(null)
    }
  }

  const handleNuRaspunde = async (time: string, _type: string) => {
    setLoading('nu-raspunde')
    try {
      const result = await setLeadNuRaspunde(id, time)
      if (result.error) throw result.error
      
      toast.success('Reapel programat cu succes')
      onActionComplete?.()
    } catch (error: any) {
      toast.error(error.message || 'Eroare la programare reapel')
    } finally {
      setLoading(null)
    }
  }

  const handleNoDeal = async () => {
    if (!confirm('Ești sigur că vrei să marchezi acest lead ca No Deal?')) return
    
    setLoading('no-deal')
    try {
      const result = await setLeadNoDeal(id)
      if (result.error) throw result.error
      
      toast.success('Lead marcat ca No Deal')
      onActionComplete?.()
    } catch (error: any) {
      toast.error(error.message || 'Eroare la marcare No Deal')
    } finally {
      setLoading(null)
    }
  }

  return (
    <>
      <Card 
        className={`group hover:shadow-lg transition-shadow cursor-pointer ${isSelected ? 'ring-2 ring-primary' : ''}`}
        onClick={onClick}
      >
        <CardHeader className="pb-2 px-3 pt-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-start gap-2 flex-1 min-w-0">
              {/* Selectie multipla */}
              <Checkbox
                checked={isSelected}
                onCheckedChange={(checked) => {
                  onSelect?.(checked === true)
                }}
                onClick={(e) => e.stopPropagation()}
                className="mt-1 flex-shrink-0"
              />
              
              {/* Nume lead */}
              <div className="flex-1 min-w-0">
                <h4 className="font-semibold text-sm truncate">{name}</h4>
                {phone && (
                  <p className="text-xs text-muted-foreground truncate">{phone}</p>
                )}
              </div>
            </div>

              {/* Buton Move */}
            <Popover>
              <PopoverTrigger asChild onClick={(e) => e.stopPropagation()}>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-8 w-8 p-0"
                  data-button-id="leadCardMenuButton"
                  aria-label="Meniu lead"
                >
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-48 p-2" align="end" onClick={(e) => e.stopPropagation()}>
                <Button
                  variant="ghost"
                  className="w-full justify-start h-8"
                  onClick={() => {
                    onMove?.()
                  }}
                  data-button-id="leadCardMoveButton"
                  aria-label="Mută leadul în altă coloană"
                >
                  <MoreVertical className="h-4 w-4 mr-2" />
                  Mută în...
                </Button>
              </PopoverContent>
            </Popover>
          </div>

          {/* Tag-uri de prioritate */}
          {(priorityTags.length > 0 || isCallbackExpired) && (
            <div className="flex flex-wrap gap-1 mt-2">
              {priorityTags.map((tag) => (
                <Badge
                  key={tag}
                  variant={tag === 'De Sunat!' ? 'destructive' : 'default'}
                  className="text-[10px] px-1.5 py-0 font-medium"
                >
                  {tag === 'Suna' && '🔥 '}{tag}
                </Badge>
              ))}
              {isCallbackExpired && callbackDate && callbackTime && (
                <Badge variant="destructive" className="text-[10px] px-1.5 py-0 font-medium">
                  De Sunat!
                </Badge>
              )}
            </div>
          )}

          {/* Tag-uri normale */}
          {otherTags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {otherTags.slice(0, 2).map((tag) => (
                <Badge key={tag} variant="secondary" className="text-[10px] px-1.5 py-0">
                  {tag}
                </Badge>
              ))}
              {otherTags.length > 2 && (
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                  +{otherTags.length - 2}
                </Badge>
              )}
            </div>
          )}
        </CardHeader>

        <CardContent className="px-3 pb-3">
          {/* Informatii Callback */}
          {callbackDate && callbackTime && (
            <div className={`flex items-center gap-2 text-xs mt-2 p-2 rounded ${
              isCallbackExpired ? 'bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-400' : 'bg-blue-50 dark:bg-blue-950/20 text-blue-600 dark:text-blue-400'
            }`}>
              <Calendar className="h-3 w-3 flex-shrink-0" />
              <span className="font-medium">
                {format(new Date(callbackDate), 'dd MMM', { locale: ro })}
              </span>
              <span className="font-mono font-bold">{callbackTime}</span>
            </div>
          )}

          {/* Informatii Nu Raspunde */}
          {nuRaspundeTime && (
            <div className="flex items-center gap-2 text-xs mt-2 p-2 rounded bg-orange-50 dark:bg-orange-950/20 text-orange-600 dark:text-orange-400">
              <Clock className="h-3 w-3 flex-shrink-0" />
              <span className="font-mono font-bold">{nuRaspundeTime}</span>
            </div>
          )}

          {/* Butoane rapide */}
          <div className="flex items-center gap-1 mt-3 pt-3 border-t">
            {/* Callback */}
            <Button
              variant="ghost"
              size="sm"
              className="flex-1 h-8 text-xs"
              onClick={(e) => {
                e.stopPropagation()
                setCallbackDialogOpen(true)
              }}
              disabled={loading === 'callback'}
              data-button-id="leadCardCallbackButton"
              aria-label="Programează callback pentru acest lead"
            >
              <Phone className="h-3 w-3 mr-1" />
              Callback
            </Button>

            {/* Nu Raspunde */}
            <Button
              variant="ghost"
              size="sm"
              className="flex-1 h-8 text-xs text-red-600 hover:text-red-700"
              onClick={(e) => {
                e.stopPropagation()
                setNuRaspundeDialogOpen(true)
              }}
              disabled={loading === 'nu-raspunde'}
              data-button-id="leadCardNuRaspundeButton"
              aria-label="Nu răspunde - programează reapel"
            >
              <PhoneOff className="h-3 w-3 mr-1" />
              Nu Rasp
            </Button>

            {/* No Deal */}
            <Button
              variant="ghost"
              size="sm"
              className="flex-1 h-8 text-xs"
              onClick={(e) => {
                e.stopPropagation()
                handleNoDeal()
              }}
              disabled={loading === 'no-deal'}
              data-button-id="leadCardNoDealButton"
              aria-label="Marchează leadul ca No Deal"
            >
              <XCircle className="h-3 w-3 mr-1" />
              No Deal
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Dialogs */}
      <CallbackDialog
        open={callbackDialogOpen}
        onOpenChange={setCallbackDialogOpen}
        onConfirm={handleCallback}
        leadName={name}
        leadPhone={phone}
      />

      <NuRaspundeDialog
        open={nuRaspundeDialogOpen}
        onOpenChange={setNuRaspundeDialogOpen}
        onConfirm={handleNuRaspunde}
        leadName={name}
      />
    </>
  )
}

