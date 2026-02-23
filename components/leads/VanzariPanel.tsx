"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Calendar, Clock, Phone, X, Package, Store, FileText } from "lucide-react"
import { toast } from "sonner"
import { 
  setLeadCallback, 
  setLeadNuRaspunde, 
  setLeadNoDeal,
  setLeadCurierTrimis,
  setLeadOfficeDirect
} from "@/lib/vanzari/leadOperations"
import { CallbackDialog } from "./vanzari/CallbackDialog"
import { NuRaspundeDialog } from "./vanzari/NuRaspundeDialog"

interface VanzariPanelProps {
  leadId: string
  leadName?: string
  leadPhone?: string
  onActionComplete?: () => void
}

export function VanzariPanel({ leadId, leadName, leadPhone, onActionComplete }: VanzariPanelProps) {
  const [callbackDialogOpen, setCallbackDialogOpen] = useState(false)
  const [nuRaspundeDialogOpen, setNuRaspundeDialogOpen] = useState(false)
  const [loading, setLoading] = useState<string | null>(null)

  const handleCallback = async (date: Date, note?: string) => {
    setLoading('callback')
    try {
      const result = await setLeadCallback(leadId, date, { note })
      if (result.error) throw result.error
      
      toast.success('Callback programat cu succes')
      setCallbackDialogOpen(false)
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
      const result = await setLeadNuRaspunde(leadId, time)
      if (result.error) throw result.error
      
      toast.success('Reapel programat cu succes')
      setNuRaspundeDialogOpen(false)
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
      const result = await setLeadNoDeal(leadId)
      if (result.error) throw result.error
      
      toast.success('Lead marcat ca No Deal')
      onActionComplete?.()
    } catch (error: any) {
      toast.error(error.message || 'Eroare la marcare No Deal')
    } finally {
      setLoading(null)
    }
  }

  const handleCurierTrimis = async () => {
    if (!confirm('Ești sigur că vrei să marchezi acest lead ca Curier Trimis? Aceasta va crea automat o fișă de serviciu.')) return
    
    setLoading('curier-trimis')
    try {
      const scheduledDate = new Date() // Default: imediat
      const result = await setLeadCurierTrimis(leadId, scheduledDate)
      if (result.error) throw result.error
      
      toast.success('Curier trimis marcat cu succes. Fișă de serviciu creată.')
      onActionComplete?.()
    } catch (error: any) {
      toast.error(error.message || 'Eroare la marcare Curier Trimis')
    } finally {
      setLoading(null)
    }
  }

  const handleOfficeDirect = async () => {
    if (!confirm('Ești sigur că vrei să marchezi acest lead ca Office Direct? Aceasta va crea automat o fișă de serviciu.')) return
    
    setLoading('office-direct')
    try {
      const scheduledDate = new Date() // Default: imediat
      const result = await setLeadOfficeDirect(leadId, scheduledDate)
      if (result.error) throw result.error
      
      toast.success('Office direct marcat cu succes. Fișă de serviciu creată.')
      onActionComplete?.()
    } catch (error: any) {
      toast.error(error.message || 'Eroare la marcare Office Direct')
    } finally {
      setLoading(null)
    }
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Package className="h-5 w-5 text-primary" />
            Acțiuni Vânzări
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Callback Section */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Phone className="h-4 w-4" />
              Callback
            </div>
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={() => setCallbackDialogOpen(true)}
              disabled={loading === 'callback'}
            >
              <Calendar className="h-4 w-4 mr-2" />
              Programează Callback
            </Button>
          </div>

          {/* Nu Răspunde Section */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Clock className="h-4 w-4" />
              Nu Răspunde
            </div>
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={() => setNuRaspundeDialogOpen(true)}
              disabled={loading === 'nu-raspunde'}
            >
              <Clock className="h-4 w-4 mr-2" />
              Programează Reapel
            </Button>
          </div>

          {/* Fulfillment Section */}
          <div className="space-y-2 pt-2 border-t">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Package className="h-4 w-4" />
              Fulfillment
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleCurierTrimis}
                disabled={loading === 'curier-trimis'}
              >
                <Store className="h-4 w-4 mr-2" />
                Curier Trimis
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleOfficeDirect}
                disabled={loading === 'office-direct'}
              >
                <FileText className="h-4 w-4 mr-2" />
                Office Direct
              </Button>
            </div>
          </div>

          {/* No Deal Section */}
          <div className="space-y-2 pt-2 border-t">
            <Button
              variant="destructive"
              className="w-full"
              onClick={handleNoDeal}
              disabled={loading === 'no-deal'}
            >
              <X className="h-4 w-4 mr-2" />
              Marchează No Deal
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Dialogs */}
      <CallbackDialog
        open={callbackDialogOpen}
        onOpenChange={setCallbackDialogOpen}
        onConfirm={handleCallback}
        leadName={leadName}
        leadPhone={leadPhone}
      />

      <NuRaspundeDialog
        open={nuRaspundeDialogOpen}
        onOpenChange={setNuRaspundeDialogOpen}
        onConfirm={handleNuRaspunde}
        leadName={leadName}
      />
    </>
  )
}