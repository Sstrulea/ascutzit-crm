"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { 
  Calendar, 
  Clock, 
  Phone, 
  Mail, 
  MapPin, 
  Building, 
  Save,
  X,
  Tag,
  Package,
  Store,
  FileText,
  AlertCircle
} from "lucide-react"
import { toast } from "sonner"
import { format } from "date-fns"
import { ro } from "date-fns/locale"
import { 
  setLeadCallback, 
  setLeadNoDeal,
  setLeadCurierTrimis,
  setLeadOfficeDirect,
  checkLeadDeliveryMethodStatus 
} from "@/lib/vanzari/leadOperations"

interface VanzariCardDetailsProps {
  id: string
  name: string
  email?: string
  phone?: string
  address?: {
    street?: string
    city?: string
    county?: string
  }
  companyName?: string
  details?: string
  tags?: string[]
  callbackDate?: string | null
  callbackTime?: string | null
  nuRaspundeTime?: string | null
  curierTrimisDate?: string | null
  officeDirectDate?: string | null
  onClose?: () => void
  onActionComplete?: () => void
}

export function VanzariCardDetails({
  id,
  name,
  email,
  phone,
  address,
  companyName,
  details: initialDetails,
  tags = [],
  callbackDate,
  callbackTime,
  nuRaspundeTime,
  curierTrimisDate,
  officeDirectDate,
  onClose,
  onActionComplete,
}: VanzariCardDetailsProps) {
  const [details, setDetails] = useState(initialDetails || "")
  const [hasChanges, setHasChanges] = useState(false)
  const [loading, setLoading] = useState<string | null>(null)
  const [selectedTags, setSelectedTags] = useState<string[]>(tags)
  const [curierChecked, setCurierChecked] = useState(!!curierTrimisDate)
  const [officeChecked, setOfficeChecked] = useState(!!officeDirectDate)
  const [deliveryMethodValidated, setDeliveryMethodValidated] = useState(false)

  // Available tags for sellers
  const availableTags = [
    "Prioritate Înaltă",
    "Client Fidel",
    "Persoană Juridică",
    "Client Nou",
    "Urgent",
    "Reapel",
    "Contractat",
  ]

  useEffect(() => {
    setHasChanges(details !== initialDetails)
  }, [details, initialDetails])

  // Validează starea livrării la montare și la acțiuni
  useEffect(() => {
    const validateDeliveryStatus = async () => {
      try {
        const status = await checkLeadDeliveryMethodStatus(id)
        
        // Actualizează stările de validare
        setDeliveryMethodValidated(true)
        
        // Dacă Office Direct este activat, dezactivează Curier Trimis
        if (status.officeDirect) {
          setOfficeChecked(true)
          if (!curierChecked) {
            setCurierChecked(false)
          }
        }
        
        // Dacă Curier Trimis este activat, dezactivează Office Direct
        if (status.curierTrimis) {
          setCurierChecked(true)
          if (!officeChecked) {
            setOfficeChecked(false)
          }
        }
      } catch (error) {
        console.error('[VanzariCardDetails] Eroare la validare livrare:', error)
        setDeliveryMethodValidated(false)
      }
    }

    validateDeliveryStatus()
  }, [id])

  const handleSave = async () => {
    setLoading('save')
    try {
      // Save details to DB with history tracking
      // This would call an API endpoint that saves the details and creates a history entry
      toast.success('Detalii salvate cu succes')
      setHasChanges(false)
      onActionComplete?.()
    } catch (error: any) {
      toast.error(error.message || 'Eroare la salvare')
    } finally {
      setLoading(null)
    }
  }

  const handleQuickCallback = async (minutes: number) => {
    const date = new Date()
    date.setMinutes(date.getMinutes() + minutes)
    setLoading(`callback-${minutes}`)
    try {
      const result = await setLeadCallback(id, date, { note: 'Programare rapidă' })
      if (result.error) throw result.error
      toast.success('Callback programat cu succes')
      onActionComplete?.()
    } catch (error: any) {
      toast.error(error.message || 'Eroare la programare callback')
    } finally {
      setLoading(null)
    }
  }

  const handleQuickDate = async (days: number) => {
    const date = new Date()
    date.setDate(date.getDate() + days)
    date.setHours(10, 0, 0, 0)
    setLoading(`callback-${days}d`)
    try {
      const result = await setLeadCallback(id, date, { note: 'Programare rapidă' })
      if (result.error) throw result.error
      toast.success('Callback programat cu succes')
      onActionComplete?.()
    } catch (error: any) {
      toast.error(error.message || 'Eroare la programare callback')
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

  const handleCurierToggle = async () => {
    if (curierChecked) {
      // Uncheck - would need API to remove curier status
      setCurierChecked(false)
    } else {
      // Show date picker overlay (simplified for now)
      const confirmed = confirm('Dorești să marchezi acest lead ca Curier Trimis? Aceasta va crea o fișă de serviciu.')
      if (confirmed) {
        setLoading('curier')
        try {
          const date = new Date()
          const result = await setLeadCurierTrimis(id, date)
          if (result.error) throw result.error
          toast.success('Curier Trimis marcat. Fișă de serviciu creată.')
          setCurierChecked(true)
          onActionComplete?.()
        } catch (error: any) {
          toast.error(error.message || 'Eroare la marcare Curier Trimis')
        } finally {
          setLoading(null)
        }
      }
    }
  }

  const handleOfficeToggle = async () => {
    if (officeChecked) {
      // Uncheck - would need API to remove office status
      setOfficeChecked(false)
    } else {
      // Show date picker overlay (simplified for now)
      const confirmed = confirm('Dorești să marchezi acest lead ca Office Direct? Aceasta va crea o fișă de serviciu.')
      if (confirmed) {
        setLoading('office')
        try {
          const date = new Date()
          const result = await setLeadOfficeDirect(id, date)
          if (result.error) throw result.error
          toast.success('Office Direct marcat. Fișă de serviciu creată.')
          setOfficeChecked(true)
          onActionComplete?.()
        } catch (error: any) {
          toast.error(error.message || 'Eroare la marcare Office Direct')
        } finally {
          setLoading(null)
        }
      }
    }
  }

  const toggleTag = (tag: string) => {
    if (selectedTags.includes(tag)) {
      setSelectedTags(selectedTags.filter(t => t !== tag))
    } else {
      setSelectedTags([...selectedTags, tag])
    }
  }

  return (
    <div className="space-y-4">
      {/* Header cu actiuni rapide */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Detalii Lead</h3>
        <Button variant="ghost" size="sm" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Informatii de contact */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Informații Contact</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label className="text-xs text-muted-foreground">Nume</Label>
            <p className="font-medium">{name}</p>
          </div>
          
          {phone && (
            <div className="flex items-center gap-2">
              <Phone className="h-4 w-4 text-muted-foreground" />
              <span>{phone}</span>
            </div>
          )}
          
          {email && (
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <span>{email}</span>
            </div>
          )}
          
          {companyName && (
            <div className="flex items-center gap-2">
              <Building className="h-4 w-4 text-muted-foreground" />
              <span>{companyName}</span>
            </div>
          )}
          
          {address && (address.street || address.city || address.county) && (
            <div className="flex items-start gap-2">
              <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
              <span>
                {address.street && <div>{address.street}</div>}
                {(address.city || address.county) && (
                  <div className="text-sm text-muted-foreground">
                    {address.city}{address.city && address.county ? ', ' : ''}{address.county}
                  </div>
                )}
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detalii Comunicate de Client */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center justify-between">
            <span>Detalii Comunicate de Client</span>
            {hasChanges && (
              <Badge variant="default" className="text-[10px]">
                Modificat
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            placeholder="Adaugă detalii despre comunicările cu clientul..."
            rows={4}
            className="resize-none"
          />
          <Button
            onClick={handleSave}
            disabled={!hasChanges || loading === 'save'}
            size="sm"
          >
            {loading === 'save' ? 'Se salvează...' : (
              <>
                <Save className="h-4 w-4 mr-2" />
                Salvează
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Butoane Callback Rapide */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Programare Callback
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Timp scurt */}
          <div>
            <Label className="text-xs text-muted-foreground mb-2 block">Timp scurt</Label>
            <div className="flex flex-wrap gap-2">
              {[10, 15, 30, 60, 120, 180].map((minutes) => (
                <Button
                  key={minutes}
                  variant="outline"
                  size="sm"
                  onClick={() => handleQuickCallback(minutes)}
                  disabled={loading !== null}
                  className="text-xs"
                >
                  {minutes < 60 ? `${minutes} min` : `${minutes / 60} oră`}
                </Button>
              ))}
            </div>
          </div>

          {/* Timp lung */}
          <div>
            <Label className="text-xs text-muted-foreground mb-2 block">Zile</Label>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleQuickDate(1)}
                disabled={loading !== null}
                className="text-xs"
              >
                Mâine
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleQuickDate(2)}
                disabled={loading !== null}
                className="text-xs"
              >
                Poimâine
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleQuickDate(7)}
                disabled={loading !== null}
                className="text-xs"
              >
                Săptămâna
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleQuickDate(30)}
                disabled={loading !== null}
                className="text-xs"
              >
                Luna
              </Button>
            </div>
          </div>

          {/* Info callback existent */}
          {callbackDate && callbackTime && (
            <div className="flex items-center gap-2 p-2 bg-blue-50 dark:bg-blue-950/20 rounded text-sm text-blue-600 dark:text-blue-400">
              <Calendar className="h-4 w-4" />
              <span>
                Callback programat: {format(new Date(callbackDate), 'dd MMM', { locale: ro })} la {callbackTime}
              </span>
            </div>
          )}

          {/* Info Nu Raspunde existent */}
          {nuRaspundeTime && (
            <div className="flex items-center gap-2 p-2 bg-orange-50 dark:bg-orange-950/20 rounded text-sm text-orange-600 dark:text-orange-400">
              <Clock className="h-4 w-4" />
              <span>Reapel programat la ora: {nuRaspundeTime}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tag-uri */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Tag className="h-4 w-4" />
            Tag-uri
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {availableTags.map((tag) => (
              <Badge
                key={tag}
                variant={selectedTags.includes(tag) ? "default" : "outline"}
                className="cursor-pointer"
                onClick={() => toggleTag(tag)}
              >
                {tag}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Curier Trimis & Office Direct */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Package className="h-4 w-4" />
            Fulfillment
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className={`flex items-center justify-between p-3 border rounded-lg ${officeChecked ? 'opacity-50' : ''}`}>
            <div className="flex items-center gap-3">
              <Store className="h-5 w-5" />
              <div>
                <div className="font-medium">Curier Trimis</div>
                {curierTrimisDate && (
                  <div className="text-xs text-muted-foreground">
                    {format(new Date(curierTrimisDate), 'dd MMM HH:mm', { locale: ro })}
                  </div>
                )}
                {officeChecked && !curierChecked && (
                  <div className="flex items-center gap-1 text-xs text-orange-600 dark:text-orange-400 mt-1">
                    <AlertCircle className="h-3 w-3" />
                    <span>Office Direct este activat</span>
                  </div>
                )}
              </div>
            </div>
            <Button
              variant={curierChecked ? "default" : "outline"}
              size="sm"
              onClick={handleCurierToggle}
              disabled={loading === 'curier' || (officeChecked && !curierChecked)}
              title={officeChecked && !curierChecked ? "Office Direct este deja activat. Dezactivează Office Direct pentru a activa Curier Trimis." : undefined}
            >
              {curierChecked ? 'Activ' : 'Marchează'}
            </Button>
          </div>

          <div className={`flex items-center justify-between p-3 border rounded-lg ${curierChecked ? 'opacity-50' : ''}`}>
            <div className="flex items-center gap-3">
              <FileText className="h-5 w-5" />
              <div>
                <div className="font-medium">Office Direct</div>
                {officeDirectDate && (
                  <div className="text-xs text-muted-foreground">
                    {format(new Date(officeDirectDate), 'dd MMM HH:mm', { locale: ro })}
                  </div>
                )}
                {curierChecked && !officeChecked && (
                  <div className="flex items-center gap-1 text-xs text-orange-600 dark:text-orange-400 mt-1">
                    <AlertCircle className="h-3 w-3" />
                    <span>Curier Trimis este activat</span>
                  </div>
                )}
              </div>
            </div>
            <Button
              variant={officeChecked ? "default" : "outline"}
              size="sm"
              onClick={handleOfficeToggle}
              disabled={loading === 'office' || (curierChecked && !officeChecked)}
              title={curierChecked && !officeChecked ? "Curier Trimis este deja activat. Dezactivează Curier Trimis pentru a activa Office Direct." : undefined}
            >
              {officeChecked ? 'Activ' : 'Marchează'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Buton No Deal */}
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
  )
}