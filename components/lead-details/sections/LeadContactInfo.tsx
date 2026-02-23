/**
 * Componentă pentru informațiile de contact ale lead-ului
 * Cu suport pentru editare inline și design uniform
 */

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { 
  Check, Copy, Mail, MapPin, Phone, User, ChevronDown, ChevronRight, 
  Pencil, Save, X, Loader2, Building2, Hash, Calendar
} from "lucide-react"
import { format } from "date-fns"
import { updateLeadWithHistory } from "@/lib/supabase/leadOperations"
import { supabaseBrowser } from "@/lib/supabase/supabaseClient"
import { useRole, useAuth } from "@/lib/contexts/AuthContext"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { extractNameAndPhoneFromDetails } from "@/lib/utils/leadDisplay"

export { extractNameAndPhoneFromDetails }

export interface LeadContactInfoProps {
  lead: {
    id?: string
    name: string
    phone?: string | null
    email?: string | null
    company_name?: string | null
    company_address?: string | null
    address?: string | null
    address2?: string | null
    city?: string | null
    zip?: string | null
    judet?: string | null
    strada?: string | null
    contact_person?: string | null
    contact_phone?: string | null
    billing_nume_prenume?: string | null
    billing_nume_companie?: string | null
    billing_cui?: string | null
    billing_strada?: string | null
    billing_oras?: string | null
    billing_judet?: string | null
    billing_cod_postal?: string | null
    technician?: string | null
    notes?: string | null
    createdAt?: Date | string | null
    lastActivity?: Date | string | null
    [key: string]: any
  }
  isContactOpen?: boolean
  setIsContactOpen?: (open: boolean) => void
  copiedField: string | null
  /** Conținut doar, fără Collapsible; folosit în LeadDetailsAndContactSection */
  embedded?: boolean
  onCopy: (text: string, field: string) => void
  onPhoneClick: (phone: string) => void
  onEmailClick: (email: string) => void
  onLeadUpdate?: (updatedLead: any) => void
  isVanzariPipeline?: boolean
  isReceptiePipeline?: boolean
}

interface FieldConfig {
  key: string
  label: string
  icon: React.ReactNode
  type: 'text' | 'phone' | 'email'
  placeholder: string
  gridSpan?: string
}

const fieldConfigs: FieldConfig[] = [
  // Rând 1: Nume (full)
  { key: 'name', label: 'Nume', icon: <User className="h-4 w-4" />, type: 'text', placeholder: 'Nume complet', gridSpan: 'col-span-2' },
  // Rând 2–3: Telefon, Cod Poștal (full width)
  { key: 'phone', label: 'Telefon', icon: <Phone className="h-4 w-4" />, type: 'phone', placeholder: '+40 xxx xxx xxx', gridSpan: 'col-span-2' },
  { key: 'zip', label: 'Cod Poștal', icon: <Hash className="h-4 w-4" />, type: 'text', placeholder: 'Cod poștal', gridSpan: 'col-span-2' },
  // Rând 3: Email (full)
  { key: 'email', label: 'Email', icon: <Mail className="h-4 w-4" />, type: 'email', placeholder: 'email@exemplu.ro', gridSpan: 'col-span-2' },
  // Rând 4: Companie (full)
  { key: 'company_name', label: 'Companie', icon: <Building2 className="h-4 w-4" />, type: 'text', placeholder: 'Nume companie', gridSpan: 'col-span-2' },
  // Rând 5: Adresă Companie (full)
  { key: 'company_address', label: 'Adresă Companie', icon: <Building2 className="h-4 w-4" />, type: 'text', placeholder: 'Adresa companiei', gridSpan: 'col-span-2' },
  // Rând 6: Stradă (full)
  { key: 'strada', label: 'Stradă', icon: <MapPin className="h-4 w-4" />, type: 'text', placeholder: 'Strada și număr', gridSpan: 'col-span-2' },
  // Rând 7–8: Oraș, Județ, Persoana de contact, Telefon contact (full width)
  { key: 'city', label: 'Oraș', icon: <MapPin className="h-4 w-4" />, type: 'text', placeholder: 'Oraș', gridSpan: 'col-span-2' },
  { key: 'judet', label: 'Județ', icon: <MapPin className="h-4 w-4" />, type: 'text', placeholder: 'Județ', gridSpan: 'col-span-2' },
  { key: 'contact_person', label: 'Persoana de contact', icon: <User className="h-4 w-4" />, type: 'text', placeholder: 'Nume și prenume', gridSpan: 'col-span-2' },
  { key: 'contact_phone', label: 'Telefon contact', icon: <Phone className="h-4 w-4" />, type: 'phone', placeholder: '+40 xxx xxx xxx', gridSpan: 'col-span-2' },
]

// Configurație separată pentru câmpurile de facturare
const billingFieldConfigs: FieldConfig[] = [
  // Toate câmpurile full width
  { key: 'billing_nume_prenume', label: 'Nume și Prenume', icon: <User className="h-4 w-4" />, type: 'text', placeholder: 'Nume și prenume', gridSpan: 'col-span-2' },
  { key: 'billing_nume_companie', label: 'Nume Companie', icon: <Building2 className="h-4 w-4" />, type: 'text', placeholder: 'Nume companie', gridSpan: 'col-span-2' },
  { key: 'billing_cui', label: 'CUI', icon: <Hash className="h-4 w-4" />, type: 'text', placeholder: 'CUI', gridSpan: 'col-span-2' },
  { key: 'billing_strada', label: 'Stradă', icon: <MapPin className="h-4 w-4" />, type: 'text', placeholder: 'Stradă, număr', gridSpan: 'col-span-2' },
  { key: 'billing_oras', label: 'Oraș', icon: <MapPin className="h-4 w-4" />, type: 'text', placeholder: 'Oraș', gridSpan: 'col-span-2' },
  { key: 'billing_judet', label: 'Județ', icon: <MapPin className="h-4 w-4" />, type: 'text', placeholder: 'Județ', gridSpan: 'col-span-2' },
  { key: 'billing_cod_postal', label: 'Cod postal', icon: <Hash className="h-4 w-4" />, type: 'text', placeholder: 'Cod poștal', gridSpan: 'col-span-2' },
]

/**
 * Extrage Nume și Telefon din "Detalii comunicate de client"
 * Caută pattern-uri cum ar fi:
 * - "Nume Complet: Violeta Capatina"
 * - "Numar De Telefon: +40769480277" / "Număr De Telefon:"
 * - "Telefon:", "E-Mail:", etc.
 */
function buildEditDataFromLead(lead: LeadContactInfoProps['lead']): Record<string, string> {
  const raw: Record<string, string> = {}
  fieldConfigs.forEach(field => {
    raw[field.key] = (lead as any)[field.key] || ''
  })
  const L = lead as any
  billingFieldConfigs.forEach(field => {
    const v = L[field.key]
    raw[field.key] = (typeof v === 'string' ? v : '') || ''
  })
  
  // Extrage din "Detalii comunicate de client" când Nume sau Telefon lipsesc / sunt "Unknown" / placeholder
  const extracted = extractNameAndPhoneFromDetails(L.details || L.notes)
  const hasRealName = (v: string) => (v && String(v).trim() && String(v).trim().toLowerCase() !== 'unknown')
  const hasRealPhone = (v: string) => {
    if (!v || !String(v).trim()) return false
    const t = String(v).trim()
    if (/^\+40\s*xxx\s*xxx\s*xxx$/i.test(t)) return false
    if (/^[\d\s\-+()]{6,}$/.test(t)) return true
    return t.length >= 6
  }
  const nameFromLead = raw.name || L.full_name || ''
  const phoneFromLead = raw.phone || L.phone_number || ''
  const name = hasRealName(nameFromLead) ? nameFromLead : (extracted.name || nameFromLead || '')
  const phone = hasRealPhone(phoneFromLead) ? phoneFromLead : (extracted.phone || phoneFromLead || '')
  const data = { ...raw, name, phone }
  if (!data.contact_phone && phone) data.contact_phone = phone
  if (!data.contact_person && name) data.contact_person = name
  if (!data.billing_nume_prenume && name) data.billing_nume_prenume = name
  if (!data.billing_nume_companie && data.company_name) data.billing_nume_companie = data.company_name
  if (!data.billing_strada && data.strada) data.billing_strada = data.strada
  if (!data.billing_oras && data.city) data.billing_oras = data.city
  if (!data.billing_judet && data.judet) data.billing_judet = data.judet
  if (!data.billing_cod_postal && data.zip) data.billing_cod_postal = data.zip
  if (!data.strada && L.address) data.strada = L.address
  return data
}

export function LeadContactInfo({
  lead,
  isContactOpen = true,
  setIsContactOpen,
  copiedField,
  onCopy,
  onPhoneClick,
  onEmailClick,
  onLeadUpdate,
  isVanzariPipeline = false,
  isReceptiePipeline = false,
  embedded = false,
}: LeadContactInfoProps) {
  const { isAdmin, isOwner, isMember } = useRole()
  const { user } = useAuth?.() ?? {}

  // Permite editarea în Vânzări sau Recepție pentru owner, admin sau member
  const canEdit = (isVanzariPipeline || isReceptiePipeline) && (isOwner || isAdmin || isMember)
  const [isEditing, setIsEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editData, setEditData] = useState<Record<string, string>>({})
  const originalEditDataRef = useRef<Record<string, string>>({})
  const hydratedLeadIdRef = useRef<string | null>(null)

  useEffect(() => {
    setEditData(buildEditDataFromLead(lead))
  }, [lead])

  const handleEdit = () => {
    // Snapshot pentru diff: evită să trimitem null-uri la câmpuri neatinse (prevenim suprascrieri accidentale)
    originalEditDataRef.current = buildEditDataFromLead(lead)
    setIsEditing(true)
  }

  const handleCancel = () => {
    setIsEditing(false)
    setEditData(buildEditDataFromLead(lead))
  }

  const handleSave = async () => {
    const leadId = (lead as any).leadId ?? lead.id
    if (!leadId) {
      toast.error('ID-ul lead-ului lipsește')
      return
    }

    setSaving(true)
    try {
      const trStr = (v: string | undefined) => (v ?? '').trim()
      const toDb = (v: string | undefined) => {
        const t = trStr(v)
        return t.length ? t : null
      }

      const before = originalEditDataRef.current || {}
      const changed = (k: string) => trStr(editData[k]) !== trStr(before[k])

      // IMPORTANT: Trimitem în DB DOAR câmpurile schimbate.
      // Asta elimină incertitudinea „nu se salvează / se rescrie”, când lead-ul din UI e incomplet (cache)
      // și ar fi trimis null-uri pentru câmpuri pe care user nu le-a atins.
      const dbUpdate: Record<string, any> = { updated_at: new Date().toISOString() }

      if (changed('name')) dbUpdate.full_name = toDb(editData.name)
      if (changed('phone')) dbUpdate.phone_number = toDb(editData.phone)
      if (changed('email')) dbUpdate.email = toDb(editData.email)
      if (changed('company_name')) dbUpdate.company_name = toDb(editData.company_name)
      if (changed('company_address')) dbUpdate.company_address = toDb(editData.company_address)
      if (changed('city')) dbUpdate.city = toDb(editData.city)
      if (changed('zip')) dbUpdate.zip = toDb(editData.zip)
      if (changed('judet')) dbUpdate.judet = toDb(editData.judet)

      // Strada: ținem și compatibilitatea cu câmpul legacy `address`
      if (changed('strada')) {
        const stradaDb = toDb(editData.strada)
        dbUpdate.strada = stradaDb
        dbUpdate.address = stradaDb
      }

      if (changed('contact_person')) dbUpdate.contact_person = toDb(editData.contact_person)
      if (changed('contact_phone')) dbUpdate.contact_phone = toDb(editData.contact_phone)

      if (changed('billing_nume_prenume')) dbUpdate.billing_nume_prenume = toDb(editData.billing_nume_prenume)
      if (changed('billing_nume_companie')) dbUpdate.billing_nume_companie = toDb(editData.billing_nume_companie)
      if (changed('billing_cui')) dbUpdate.billing_cui = toDb(editData.billing_cui)
      if (changed('billing_strada')) dbUpdate.billing_strada = toDb(editData.billing_strada)
      if (changed('billing_oras')) dbUpdate.billing_oras = toDb(editData.billing_oras)
      if (changed('billing_judet')) dbUpdate.billing_judet = toDb(editData.billing_judet)
      if (changed('billing_cod_postal')) dbUpdate.billing_cod_postal = toDb(editData.billing_cod_postal)

      // Dacă user nu a schimbat nimic, evităm update inutil
      if (Object.keys(dbUpdate).length === 1) {
        toast.message('Nu există modificări de salvat.')
        setIsEditing(false)
        return
      }

      const actorOption = user ? {
        currentUserId: user.id,
        currentUserName: (user as any)?.user_metadata?.name ?? (user as any)?.user_metadata?.full_name ?? (user as any)?.email ?? null,
        currentUserEmail: (user as any)?.email ?? null,
      } : undefined
      const { data: updatedRow, error } = await updateLeadWithHistory(leadId, dbUpdate, actorOption)

      if (error) {
        console.error('[LeadContactInfo] DB Error:', error)
        throw error
      }

      toast.success('Informațiile au fost salvate cu succes!')
      setIsEditing(false)

      const row = updatedRow as Record<string, unknown> | null
      const out = row
        ? {
            ...lead,
            name: (row.full_name as string) ?? lead.name,
            phone: (row.phone_number as string) ?? lead.phone,
            email: (row.email as string) ?? lead.email,
            company_name: (row.company_name as string) ?? lead.company_name,
            company_address: (row.company_address as string) ?? lead.company_address,
            city: (row.city as string) ?? lead.city,
            zip: (row.zip as string) ?? lead.zip,
            // IMPORTANT: nu suprascriem cu '' dacă row nu are valoare; păstrăm ce aveam deja în UI
            judet: row.judet != null ? String(row.judet) : (lead as any).judet ?? lead.judet ?? null,
            strada: row.strada != null ? String(row.strada) : (lead as any).strada ?? lead.strada ?? null,
            address: (row.address as string) ?? (row.strada as string) ?? lead.address,
            contact_person: (row.contact_person as string) ?? lead.contact_person,
            contact_phone: (row.contact_phone as string) ?? lead.contact_phone,
            billing_nume_prenume: (row.billing_nume_prenume as string) ?? lead.billing_nume_prenume,
            billing_nume_companie: (row.billing_nume_companie as string) ?? lead.billing_nume_companie,
            billing_cui: (row.billing_cui as string) ?? lead.billing_cui,
            billing_strada: row.billing_strada != null ? String(row.billing_strada) : (lead as any).billing_strada ?? lead.billing_strada ?? null,
            billing_oras: (row.billing_oras as string) ?? lead.billing_oras,
            billing_judet: row.billing_judet != null ? String(row.billing_judet) : (lead as any).billing_judet ?? lead.billing_judet ?? null,
            billing_cod_postal: (row.billing_cod_postal as string) ?? lead.billing_cod_postal,
          }
        : {
            ...lead,
            name: editData.name,
            phone: editData.phone,
            email: editData.email,
            company_name: editData.company_name,
            company_address: editData.company_address,
            city: editData.city,
            zip: editData.zip,
            judet: editData.judet,
            strada: editData.strada,
            address: strada,
            contact_person: editData.contact_person,
            contact_phone: editData.contact_phone,
            billing_nume_prenume: editData.billing_nume_prenume,
            billing_nume_companie: editData.billing_nume_companie,
            billing_cui: editData.billing_cui,
            billing_strada: editData.billing_strada,
            billing_oras: editData.billing_oras,
            billing_judet: editData.billing_judet,
            billing_cod_postal: editData.billing_cod_postal,
          }
      onLeadUpdate?.(out)
    } catch (error: any) {
      console.error('Error saving contact info:', error)
      toast.error('Eroare la salvarea informațiilor: ' + (error?.message || 'Eroare necunoscută'))
    } finally {
      setSaving(false)
    }
  }

  // Dacă lead-ul din UI vine fără câmpurile de adresă, dar DB le are, le „hidrătăm” o dată ca să se afișeze corect.
  useEffect(() => {
    const leadId = ((lead as any).leadId ?? lead.id) as string | undefined
    if (!leadId) return
    if (hydratedLeadIdRef.current === leadId) return

    const L = lead as any
    // Dacă unele câmpuri sunt goale în UI, dar există în DB, facem o hidratare 1x.
    // IMPORTANT: nu ne bazăm pe "are orice câmp" (ex: doar oraș), pentru că exact asta produce incertitudinea.
    const shouldHydrate =
      !L.strada ||
      !L.judet ||
      !L.zip ||
      !L.company_address ||
      !L.billing_strada ||
      !L.billing_oras ||
      !L.billing_judet ||
      !L.billing_cod_postal
    if (!shouldHydrate) return

    hydratedLeadIdRef.current = leadId
    ;(async () => {
      try {
        const supabase = supabaseBrowser()
        const { data, error } = await supabase
          .from('leads')
          .select('id, full_name, email, phone_number, company_name, company_address, address, strada, city, judet, zip, contact_person, contact_phone, billing_nume_prenume, billing_nume_companie, billing_cui, billing_strada, billing_oras, billing_judet, billing_cod_postal')
          .eq('id', leadId)
          .maybeSingle()
        if (error || !data) return

        const preferDbIfEmpty = (current: any, db: any) => {
          const cur = (typeof current === 'string' ? current.trim() : current) || null
          const val = (typeof db === 'string' ? db.trim() : db) || null
          return cur ? current : (val ?? current)
        }

        const hydrated = {
          ...lead,
          name: preferDbIfEmpty((lead as any).name, (data as any).full_name),
          phone: preferDbIfEmpty((lead as any).phone, (data as any).phone_number),
          email: preferDbIfEmpty((lead as any).email, (data as any).email),
          company_name: preferDbIfEmpty((lead as any).company_name, (data as any).company_name),
          company_address: preferDbIfEmpty((lead as any).company_address, (data as any).company_address),
          address: preferDbIfEmpty((lead as any).address, (data as any).address),
          strada: preferDbIfEmpty((lead as any).strada, (data as any).strada),
          city: preferDbIfEmpty((lead as any).city, (data as any).city),
          judet: preferDbIfEmpty((lead as any).judet, (data as any).judet),
          zip: preferDbIfEmpty((lead as any).zip, (data as any).zip),
          contact_person: preferDbIfEmpty((lead as any).contact_person, (data as any).contact_person),
          contact_phone: preferDbIfEmpty((lead as any).contact_phone, (data as any).contact_phone),
          billing_nume_prenume: preferDbIfEmpty((lead as any).billing_nume_prenume, (data as any).billing_nume_prenume),
          billing_nume_companie: preferDbIfEmpty((lead as any).billing_nume_companie, (data as any).billing_nume_companie),
          billing_cui: preferDbIfEmpty((lead as any).billing_cui, (data as any).billing_cui),
          billing_strada: preferDbIfEmpty((lead as any).billing_strada, (data as any).billing_strada),
          billing_oras: preferDbIfEmpty((lead as any).billing_oras, (data as any).billing_oras),
          billing_judet: preferDbIfEmpty((lead as any).billing_judet, (data as any).billing_judet),
          billing_cod_postal: preferDbIfEmpty((lead as any).billing_cod_postal, (data as any).billing_cod_postal),
        }
        onLeadUpdate?.(hydrated)
        setEditData(buildEditDataFromLead(hydrated as any))
      } catch {
        // ignore
      }
    })()
  }, [lead, onLeadUpdate])

  const handleFieldChange = (key: string, value: string) => {
    setEditData(prev => {
      const updated = { ...prev, [key]: value }
      
      // Logica de pre-populare pentru câmpuri cu aceleași denumiri
      // Nume principal -> Persoana de contact și Billing nume prenume
      if (key === 'name') {
        if (!prev.contact_person || prev.contact_person === prev.name) {
          updated.contact_person = value
        }
        if (!prev.billing_nume_prenume || prev.billing_nume_prenume === prev.name) {
          updated.billing_nume_prenume = value
        }
      }
      
      // Telefon principal -> Telefon contact
      if (key === 'phone') {
        if (!prev.contact_phone || prev.contact_phone === prev.phone) {
          updated.contact_phone = value
        }
      }
      
      // Companie -> Billing nume companie (bidirecțional)
      if (key === 'company_name') {
        if (!prev.billing_nume_companie || prev.billing_nume_companie === prev.company_name) {
          updated.billing_nume_companie = value
        }
      }
      if (key === 'billing_nume_companie') {
        if (!prev.company_name || prev.company_name === prev.billing_nume_companie) {
          updated.company_name = value
        }
      }
      
      // Adresă -> Billing adresă
      if (key === 'strada') {
        if (!prev.billing_strada || prev.billing_strada === prev.strada) {
          updated.billing_strada = value
        }
      }
      if (key === 'city') {
        if (!prev.billing_oras || prev.billing_oras === prev.city) {
          updated.billing_oras = value
        }
      }
      if (key === 'judet') {
        if (!prev.billing_judet || prev.billing_judet === prev.judet) {
          updated.billing_judet = value
        }
      }
      if (key === 'zip') {
        if (!prev.billing_cod_postal || prev.billing_cod_postal === prev.zip) {
          updated.billing_cod_postal = value
        }
      }
      
      // Billing -> Adresă (invers)
      if (key === 'billing_strada') {
        if (!prev.strada || prev.strada === prev.billing_strada) {
          updated.strada = value
        }
      }
      if (key === 'billing_oras') {
        if (!prev.city || prev.city === prev.billing_oras) {
          updated.city = value
        }
      }
      if (key === 'billing_judet') {
        if (!prev.judet || prev.judet === prev.billing_judet) {
          updated.judet = value
        }
      }
      if (key === 'billing_cod_postal') {
        if (!prev.zip || prev.zip === prev.billing_cod_postal) {
          updated.zip = value
        }
      }
      
      // Billing nume prenume -> Nume principal și Persoana de contact (invers)
      if (key === 'billing_nume_prenume') {
        if (!prev.name || prev.name === prev.billing_nume_prenume) {
          updated.name = value
        }
        if (!prev.contact_person || prev.contact_person === prev.billing_nume_prenume) {
          updated.contact_person = value
        }
      }
      
      // Persoana de contact -> Nume principal și Billing nume prenume (invers)
      if (key === 'contact_person') {
        if (!prev.name || prev.name === prev.contact_person) {
          updated.name = value
        }
        if (!prev.billing_nume_prenume || prev.billing_nume_prenume === prev.contact_person) {
          updated.billing_nume_prenume = value
        }
      }
      
      // Telefon contact -> Telefon principal (invers)
      if (key === 'contact_phone') {
        if (!prev.phone || prev.phone === prev.contact_phone) {
          updated.phone = value
        }
      }
      
      return updated
    })
  }

  const renderField = (config: FieldConfig) => {
    const value = editData[config.key] || ''
    const displayValue = value || config.placeholder
    const isEmpty = !value

    return (
      <div 
        key={config.key}
        className={cn(
          "group min-w-0",
          config.gridSpan || ''
        )}
      >
        {/* Label cu iconță */}
        <div className="flex items-center gap-1.5 mb-1.5 min-w-0">
          <span className="text-muted-foreground shrink-0">{config.icon}</span>
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider truncate">
            {config.label}
          </span>
        </div>
        
        {/* Input/Display - același stil */}
        <div className="relative min-w-0">
          <Input
            value={value}
            onChange={(e) => handleFieldChange(config.key, e.target.value)}
            placeholder={config.placeholder}
            className={cn(
              "h-10 text-sm transition-all min-w-0 overflow-x-auto",
              isEditing 
                ? "bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-600 focus:border-primary focus:ring-2 focus:ring-primary/20" 
                : "bg-slate-50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-700 cursor-default",
              !isEditing && "pr-16",
              isEmpty && !isEditing && "text-muted-foreground"
            )}
            disabled={!isEditing || saving}
            readOnly={!isEditing}
          />
          
          {/* Butoane de acțiune: Sună / Trimite email (doar phone/email) + Copiază (toate câmpurile) */}
          {!isEditing && (
            <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              {config.type === 'phone' && !isEmpty && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 bg-emerald-100 hover:bg-emerald-200 dark:bg-emerald-900/50 dark:hover:bg-emerald-800/50"
                  onClick={() => onPhoneClick(value)}
                  title="Sună"
                >
                  <Phone className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                </Button>
              )}
              {config.type === 'email' && !isEmpty && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 bg-blue-100 hover:bg-blue-200 dark:bg-blue-900/50 dark:hover:bg-blue-800/50"
                  onClick={() => onEmailClick(value)}
                  title="Trimite email"
                >
                  <Mail className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 disabled:opacity-50"
                onClick={() => !isEmpty && onCopy(value, config.label)}
                disabled={isEmpty}
                title={isEmpty ? 'Fără conținut de copiat' : 'Copiază'}
              >
                {copiedField === config.label ? (
                  <Check className="h-3.5 w-3.5 text-green-600" />
                ) : (
                  <Copy className="h-3.5 w-3.5 text-slate-600 dark:text-slate-400" />
                )}
              </Button>
            </div>
          )}
        </div>
      </div>
    )
  }

  const contactContent = (
    <div className={embedded ? 'space-y-4' : 'px-3 pb-4 space-y-4'}>
            {!embedded && (
              <div className="h-px bg-gradient-to-r from-transparent via-border to-transparent" />
            )}
            {/* Butoane acțiune */}
            <div className="flex justify-center gap-2">
              {isEditing ? (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCancel}
                    disabled={saving}
                    className="h-8 text-xs gap-1.5"
                  >
                    <X className="h-3.5 w-3.5" />
                    Anulează
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleSave}
                    disabled={saving}
                    className="h-8 text-xs gap-1.5 bg-gradient-to-r from-emerald-500 to-green-500 hover:from-emerald-600 hover:to-green-600 text-white shadow-sm"
                  >
                    {saving ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Save className="h-3.5 w-3.5" />
                    )}
                    Salvează
                  </Button>
                </>
              ) : (
                canEdit && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleEdit}
                    className="h-8 text-xs gap-1.5 border-primary/30 text-primary hover:bg-primary/10 hover:border-primary"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Editează
                  </Button>
                )
              )}
            </div>

            {/* Grid cu câmpuri - design uniform; min-w-0 permite shrink corect în coloane înguste */}
            <div className="grid grid-cols-2 gap-3 min-w-0">
              {fieldConfigs.map(config => renderField(config))}
            </div>

            {/* Separator pentru date de facturare - doar pentru Recepție și Vânzări */}
            {(isVanzariPipeline || isReceptiePipeline) && (
              <>
                <div className="h-px bg-gradient-to-r from-transparent via-border to-transparent my-2" />
                
                {/* Header pentru secțiunea Date de facturare */}
                <div className="flex items-center gap-2 mb-2">
                  <Building2 className="h-4 w-4 text-primary" />
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Date de facturare
                  </span>
                </div>

                {/* Grid cu câmpuri de facturare */}
                <div className="grid grid-cols-2 gap-3 min-w-0">
                  {billingFieldConfigs.map(config => renderField(config))}
                </div>
              </>
            )}

            {/* Informații suplimentare (read-only) */}
            {(lead.technician || lead.notes) && (
              <>
                <div className="h-px bg-gradient-to-r from-transparent via-border to-transparent my-2" />
                
                {lead.technician && (
                  <div className="flex items-center gap-2 p-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
                    <User className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                    <span className="text-xs font-medium text-amber-700 dark:text-amber-300">
                      Tehnician: {lead.technician}
                    </span>
                  </div>
                )}

                {lead.notes && (
                  <div className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block mb-1">
                      Notițe
                    </span>
                    <p className="text-sm text-muted-foreground">{lead.notes}</p>
                  </div>
                )}
              </>
            )}

            {/* Footer cu date sistem */}
            <div className="flex items-center justify-center gap-4 pt-2 border-t border-dashed">
              {lead?.createdAt && (
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  <Calendar className="h-3 w-3" />
                  <span>Creat: {format(new Date(lead.createdAt), "dd MMM yyyy")}</span>
                </div>
              )}
              {lead?.lastActivity && (
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  <Calendar className="h-3 w-3" />
                  <span>Activitate: {format(new Date(lead.lastActivity), "dd MMM yyyy")}</span>
                </div>
              )}
            </div>
          </div>
  )

  if (embedded) {
    return contactContent
  }

  return (
    <Collapsible open={isContactOpen} onOpenChange={setIsContactOpen!}>
      <div className="rounded-xl border bg-gradient-to-br from-slate-50/80 to-white dark:from-slate-900/80 dark:to-slate-800/50 shadow-sm overflow-hidden">
        <CollapsibleTrigger className="flex items-center justify-between w-full p-3 hover:bg-slate-100/50 dark:hover:bg-slate-800/50 transition-colors">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-full bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center">
              <User className="h-4 w-4 text-primary" />
            </div>
            <div className="text-left">
              <span className="font-semibold text-sm block">Informații Contact</span>
              <span className="text-[10px] text-muted-foreground">
                {editData.name || lead.name || '—'} • {editData.phone || lead.phone || 'Fără telefon'}
              </span>
            </div>
          </div>
          {isContactOpen ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
        </CollapsibleTrigger>
        <CollapsibleContent>
          {contactContent}
        </CollapsibleContent>
      </div>
    </Collapsible>
  )
}
