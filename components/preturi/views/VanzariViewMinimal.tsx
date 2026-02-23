'use client'

/**
 * VanzariViewMinimal - Ultra-minimalist sales lead detail interface
 * 
 * Design principles:
 * - Clean, focused layout with lots of white space
 * - Neutral palette: off-white (#F6F7F9), dark slate (#1F2933), desaturated blue accent
 * - Flat design, subtle 1px separators, 8px radius
 * - Typography: 15-16px body, 20-24px titles, Inter/SF Pro style
 * - Two-column layout: Client panel (35%) | Work area (65%)
 * - Segmented controls instead of heavy button cards
 */

import { useState, useRef } from 'react'
import { cn } from '@/lib/utils'
import { useIsMobile } from '@/hooks/use-mobile'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { 
  X, Save, Trash2, Phone, Mail, MapPin, Clock, Calendar as CalendarIcon,
  Upload, Image, Plus, ChevronDown, ChevronRight, History, MessageSquare,
  Package, Truck, Building2, Zap, AlertCircle, User, FileText, Menu
} from 'lucide-react'
import { toast } from 'sonner'
import { format, addDays, addWeeks, addMonths } from 'date-fns'
import { ro } from 'date-fns/locale'
import { URGENT_MARKUP_PCT } from '@/lib/types/preturi'
import type { LeadQuoteItem, LeadQuote } from '@/lib/types/preturi'
import type { Service } from '@/lib/supabase/serviceOperations'
import type { Lead } from '@/app/(crm)/dashboard/page'

// ============================================================================
// DESIGN TOKENS
// ============================================================================

const colors = {
  bg: '#F6F7F9',
  bgCard: '#FFFFFF',
  text: '#1F2933',
  textMuted: '#616E7C',
  textLight: '#9AA5B1',
  border: '#E4E7EB',
  borderLight: '#F0F2F5',
  primary: '#3B82F6',      // Desaturated blue
  primaryHover: '#2563EB',
  success: '#10B981',
  warning: '#F59E0B',
  danger: '#EF4444',
  dangerLight: '#FEE2E2',
}

// ============================================================================
// TYPES
// ============================================================================

type FollowUpType = 'none' | 'no_answer' | 'callback' | 'no_deal' | 'order'
type DeliveryType = 'office' | 'courier' | 'return'

export interface VanzariViewMinimalProps {
  // Lead data
  lead: Lead | null
  items: LeadQuoteItem[]
  quotes?: LeadQuote[]
  selectedQuoteId: string | null
  fisaId?: string | null
  
  // State
  loading: boolean
  saving: boolean
  isDirty: boolean
  urgentAllServices: boolean
  subscriptionType: 'services' | 'parts' | 'both' | ''
  officeDirect: boolean
  curierTrimis: boolean
  retur: boolean
  noDeal: boolean
  nuRaspunde: boolean
  nuRaspundeCallbackAt?: string | null
  callbackDate?: string | null
  currentStage?: string | null
  trayDetails: string
  
  // Services & instruments
  services: Service[]
  instruments: Array<{ id: string; name: string; weight: number; department_id?: string | null }>
  availableServices: Service[]
  availableInstruments: Array<{ id: string; name: string }>
  
  // Images
  trayImages?: Array<{ id: string; file_path: string; filename?: string }>
  uploadingImage?: boolean
  
  // Callbacks
  onSave: () => void
  onClose?: () => void
  onDelete?: () => void
  onUrgentChange: (checked: boolean) => Promise<void>
  onSubscriptionChange: (value: 'services' | 'parts' | 'both' | '') => void
  onOfficeDirectChange: (checked: boolean) => Promise<void>
  onCurierTrimisChange?: (checked: boolean, dateTime?: string) => Promise<void>
  onReturChange?: (checked: boolean) => Promise<void>
  onNoDealChange: (checked: boolean) => void
  onNuRaspundeChange: (checked: boolean, callbackTime?: string) => void
  onApelat?: (callbackDate: string, targetStage: string) => Promise<void>
  onUpdateItem: (id: string, patch: Partial<LeadQuoteItem>) => void
  onDelete: (id: string) => void
  onAddService: () => void
  onImageUpload?: (file: File) => void
  onDetailsChange: (details: string) => void
  
  // Form state
  instrumentForm: any
  svc: any
  onInstrumentChange: (instrumentId: string) => void
  onServiceSelect: (serviceId: string, serviceName: string) => void
  onSvcQtyChange: (qty: string) => void
  onSvcDiscountChange: (discount: string) => void
  
  stages?: string[]
}

// ============================================================================
// HELPER COMPONENTS
// ============================================================================

function StatusPill({ status }: { status: string }) {
  const statusConfig: Record<string, { bg: string; text: string; label: string }> = {
    new: { bg: '#E0F2FE', text: '#0369A1', label: 'Nou' },
    callback: { bg: '#FEF3C7', text: '#B45309', label: 'Callback' },
    no_deal: { bg: '#FEE2E2', text: '#B91C1C', label: 'No Deal' },
    no_answer: { bg: '#F3F4F6', text: '#4B5563', label: 'Nu răspunde' },
    order: { bg: '#D1FAE5', text: '#047857', label: 'Comandă' },
  }
  
  const config = statusConfig[status] || statusConfig.new
  
  return (
    <span 
      className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium"
      style={{ backgroundColor: config.bg, color: config.text }}
    >
      {config.label}
    </span>
  )
}

function SegmentedControl({ 
  options, 
  value, 
  onChange,
  size = 'md'
}: { 
  options: Array<{ value: string; label: string; icon?: React.ReactNode }>
  value: string
  onChange: (value: string) => void
  size?: 'sm' | 'md'
}) {
  return (
    <div className="inline-flex rounded-lg p-0.5" style={{ backgroundColor: colors.borderLight }}>
      {options.map((option) => (
        <button
          key={option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md transition-all duration-150",
            size === 'sm' ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-sm",
            value === option.value 
              ? "bg-white shadow-sm font-medium" 
              : "text-gray-500 hover:text-gray-700"
          )}
          style={{ 
            color: value === option.value ? colors.text : colors.textMuted 
          }}
        >
          {option.icon}
          {option.label}
        </button>
      ))}
    </div>
  )
}

function DeliveryPill({ 
  type, 
  selected, 
  onClick, 
  icon: Icon, 
  label 
}: { 
  type: DeliveryType
  selected: boolean
  onClick: () => void
  icon: React.ElementType
  label: string
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex-1 flex flex-col items-center gap-2 py-4 px-3 rounded-lg border transition-all duration-150",
        selected 
          ? "border-blue-200 bg-blue-50" 
          : "border-gray-200 hover:border-gray-300 bg-white"
      )}
    >
      <Icon 
        className={cn("h-5 w-5", selected ? "text-blue-600" : "text-gray-400")} 
        strokeWidth={1.5}
      />
      <span className={cn(
        "text-sm font-medium",
        selected ? "text-blue-700" : "text-gray-600"
      )}>
        {label}
      </span>
    </button>
  )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function VanzariViewMinimal({
  lead,
  items,
  quotes = [],
  selectedQuoteId,
  fisaId,
  loading,
  saving,
  isDirty,
  urgentAllServices,
  subscriptionType,
  officeDirect,
  curierTrimis,
  retur,
  noDeal,
  nuRaspunde,
  nuRaspundeCallbackAt,
  callbackDate,
  currentStage,
  trayDetails,
  services,
  instruments,
  availableServices,
  availableInstruments,
  trayImages = [],
  uploadingImage,
  onSave,
  onClose,
  onUrgentChange,
  onSubscriptionChange,
  onOfficeDirectChange,
  onCurierTrimisChange,
  onReturChange,
  onNoDealChange,
  onNuRaspundeChange,
  onApelat,
  onUpdateItem,
  onDelete,
  onAddService,
  onImageUpload,
  onDetailsChange,
  instrumentForm,
  svc,
  onInstrumentChange,
  onServiceSelect,
  onSvcQtyChange,
  onSvcDiscountChange,
  stages = [],
}: VanzariViewMinimalProps) {
  
  // ============================================================================
  // STATE
  // ============================================================================
  
  const [followUpType, setFollowUpType] = useState<FollowUpType>(
    noDeal ? 'no_deal' : nuRaspunde ? 'no_answer' : 'none'
  )
  const [callbackDateTime, setCallbackDateTime] = useState<Date | undefined>(
    callbackDate ? new Date(callbackDate) : undefined
  )
  const [callbackHour, setCallbackHour] = useState('10')
  const [callbackMinute, setCallbackMinute] = useState('00')
  const [showNotes, setShowNotes] = useState(false)
  const [deliveryType, setDeliveryType] = useState<DeliveryType>(
    officeDirect ? 'office' : curierTrimis ? 'courier' : retur ? 'return' : 'office'
  )
  
  const fileInputRef = useRef<HTMLInputElement>(null)
  const isMobile = useIsMobile()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  
  // Compute status from current stage
  const computedStatus = noDeal ? 'no_deal' : nuRaspunde ? 'no_answer' : 
    currentStage?.toLowerCase().includes('callback') ? 'callback' :
    currentStage?.toLowerCase().includes('comand') ? 'order' : 'new'
  
  // ============================================================================
  // HANDLERS
  // ============================================================================
  
  const handleFollowUpChange = (type: FollowUpType) => {
    setFollowUpType(type)
    
    if (type === 'no_deal') {
      onNoDealChange(true)
    } else if (type === 'no_answer') {
      const now = new Date()
      now.setHours(parseInt(callbackHour), parseInt(callbackMinute), 0, 0)
      onNuRaspundeChange(true, now.toISOString())
    }
  }
  
  const handleSaveFollowUp = async () => {
    if (followUpType === 'callback' && callbackDateTime && onApelat) {
      const date = new Date(callbackDateTime)
      date.setHours(parseInt(callbackHour), parseInt(callbackMinute), 0, 0)
      
      const callbackStage = stages.find(s => 
        s.toLowerCase().includes('callback')
      )
      
      if (callbackStage) {
        await onApelat(date.toISOString(), callbackStage)
        toast.success('Callback salvat')
      }
    } else if (followUpType === 'order') {
      // Highlight order section
      toast.success('Completează comanda mai jos')
    }
  }
  
  const handleDeliveryChange = async (type: DeliveryType) => {
    setDeliveryType(type)
    
    if (type === 'office') {
      await onOfficeDirectChange(true)
      if (curierTrimis && onCurierTrimisChange) await onCurierTrimisChange(false)
      if (retur && onReturChange) await onReturChange(false)
    } else if (type === 'courier') {
      await onOfficeDirectChange(false)
      if (onCurierTrimisChange) await onCurierTrimisChange(true)
      if (retur && onReturChange) await onReturChange(false)
    } else if (type === 'return') {
      await onOfficeDirectChange(false)
      if (curierTrimis && onCurierTrimisChange) await onCurierTrimisChange(false)
      if (onReturChange) await onReturChange(true)
    }
  }
  
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file && onImageUpload) {
      onImageUpload(file)
    }
  }
  
  const hours = Array.from({ length: 11 }, (_, i) => String(i + 8).padStart(2, '0'))
  const minutes = ['00', '15', '30', '45']
  
  // Calculate totals
  const subtotal = items.reduce((acc, item) => {
    const base = (item.qty || 0) * (item.price || 0)
    const disc = Math.min(100, Math.max(0, item.discount_pct || 0))
    return acc + base * (1 - disc / 100)
  }, 0)
  
  const urgentMarkup = urgentAllServices ? subtotal * (URGENT_MARKUP_PCT / 100) : 0
  const total = subtotal + urgentMarkup

  // ============================================================================
  // RENDER
  // ============================================================================

  // Mobile Bottom Bar Component
  const MobileBottomBar = () => (
    <div 
      className="fixed bottom-0 left-0 right-0 z-50 border-t px-4 py-3 flex items-center justify-between gap-2 lg:hidden"
      style={{ backgroundColor: colors.bgCard, borderColor: colors.border }}
    >
      <Button
        variant="ghost"
        size="sm"
        onClick={onClose}
        className="text-gray-500"
      >
        <X className="h-5 w-5" strokeWidth={1.5} />
      </Button>
      
      <div className="flex items-center gap-2">
        <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" size="sm">
              <Menu className="h-4 w-4 mr-1.5" strokeWidth={1.5} />
              Mai mult
            </Button>
          </SheetTrigger>
          <SheetContent side="bottom" className="h-auto max-h-[60vh]">
            <SheetHeader>
              <SheetTitle>Acțiuni</SheetTitle>
            </SheetHeader>
            <div className="py-4 space-y-2">
              <button className="w-full flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-gray-50 text-left">
                <History className="h-5 w-5 text-gray-400" strokeWidth={1.5} />
                <span>Istoric complet</span>
              </button>
              <button className="w-full flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-gray-50 text-left">
                <MessageSquare className="h-5 w-5 text-gray-400" strokeWidth={1.5} />
                <span>Mesaje</span>
              </button>
              <button className="w-full flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-red-50 text-left text-red-600">
                <Trash2 className="h-5 w-5" strokeWidth={1.5} />
                <span>Șterge lead</span>
              </button>
            </div>
          </SheetContent>
        </Sheet>
        
        <Button
          size="sm"
          onClick={onSave}
          disabled={saving || !isDirty}
          className="bg-blue-600 hover:bg-blue-700 text-white px-6"
        >
          {saving ? (
            <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <>
              <Save className="h-4 w-4 mr-1.5" strokeWidth={1.5} />
              Salvează
            </>
          )}
        </Button>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen pb-20 lg:pb-0" style={{ backgroundColor: colors.bg }}>
      {/* ================================================================== */}
      {/* TOP BAR - Desktop                                                  */}
      {/* ================================================================== */}
      <header 
        className="sticky top-0 z-50 border-b px-4 lg:px-6 py-3 flex items-center justify-between"
        style={{ backgroundColor: colors.bgCard, borderColor: colors.border }}
      >
        <div className="flex items-center gap-3 lg:gap-4 min-w-0">
          <h1 className="text-base lg:text-lg font-semibold truncate" style={{ color: colors.text }}>
            {lead?.name || 'Lead nou'}
          </h1>
          <StatusPill status={computedStatus} />
        </div>
        
        {/* Desktop actions */}
        <div className="hidden lg:flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
          >
            <X className="h-4 w-4 mr-1.5" strokeWidth={1.5} />
            Închide
          </Button>
          
          <Button
            variant="ghost"
            size="sm"
            className="text-red-500 hover:text-red-600 hover:bg-red-50"
          >
            <Trash2 className="h-4 w-4 mr-1.5" strokeWidth={1.5} />
            Șterge
          </Button>
          
          <Button
            size="sm"
            onClick={onSave}
            disabled={saving || !isDirty}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            {saving ? (
              <span className="flex items-center gap-1.5">
                <div className="h-3 w-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Salvare...
              </span>
            ) : (
              <>
                <Save className="h-4 w-4 mr-1.5" strokeWidth={1.5} />
                Salvează
              </>
            )}
          </Button>
        </div>
        
        {/* Mobile: show only status info, actions in bottom bar */}
        <div className="flex lg:hidden items-center gap-2">
          <button
            onClick={() => setMobileMenuOpen(true)}
            className="p-2 rounded-lg hover:bg-gray-100"
          >
            <Menu className="h-5 w-5" style={{ color: colors.textMuted }} strokeWidth={1.5} />
          </button>
        </div>
      </header>

      {/* ================================================================== */}
      {/* MAIN CONTENT - Two Columns (stacked on mobile)                     */}
      {/* ================================================================== */}
      <main className="max-w-7xl mx-auto px-4 lg:px-6 py-4 lg:py-6">
        <div className="grid grid-cols-12 gap-4 lg:gap-6">
          
          {/* ============================================================== */}
          {/* LEFT COLUMN - Client Panel (35%)                               */}
          {/* ============================================================== */}
          <aside className="col-span-12 lg:col-span-4 space-y-4">
            
            {/* Client Card */}
            <div 
              className="rounded-lg p-5"
              style={{ backgroundColor: colors.bgCard }}
            >
              <h2 
                className="text-sm font-semibold uppercase tracking-wide mb-4"
                style={{ color: colors.textMuted }}
              >
                Client
              </h2>
              
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <div 
                    className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium"
                    style={{ backgroundColor: colors.borderLight, color: colors.textMuted }}
                  >
                    {lead?.name?.charAt(0)?.toUpperCase() || '?'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate" style={{ color: colors.text }}>
                      {lead?.name || '—'}
                    </p>
                    <p className="text-sm" style={{ color: colors.textMuted }}>
                      Lead #{lead?.id?.slice(-6) || '—'}
                    </p>
                  </div>
                </div>
                
                <div className="pt-3 space-y-2.5" style={{ borderTop: `1px solid ${colors.borderLight}` }}>
                  <div className="flex items-center gap-2.5">
                    <Phone className="h-4 w-4 flex-shrink-0" style={{ color: colors.textLight }} strokeWidth={1.5} />
                    <span className="text-sm" style={{ color: colors.text }}>
                      {lead?.phone || '—'}
                    </span>
                  </div>
                  
                  <div className="flex items-center gap-2.5">
                    <Mail className="h-4 w-4 flex-shrink-0" style={{ color: colors.textLight }} strokeWidth={1.5} />
                    <span className="text-sm truncate" style={{ color: colors.text }}>
                      {lead?.email || '—'}
                    </span>
                  </div>
                  
                  <div className="flex items-start gap-2.5">
                    <MapPin className="h-4 w-4 flex-shrink-0 mt-0.5" style={{ color: colors.textLight }} strokeWidth={1.5} />
                    <span className="text-sm" style={{ color: colors.text }}>
                      {lead?.address || '—'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Notes Card */}
            <div 
              className="rounded-lg p-5"
              style={{ backgroundColor: colors.bgCard }}
            >
              <h2 
                className="text-sm font-semibold uppercase tracking-wide mb-3"
                style={{ color: colors.textMuted }}
              >
                Notițe client
              </h2>
              
              <div className="relative">
                <p 
                  className={cn(
                    "text-sm leading-relaxed",
                    !showNotes && "line-clamp-3"
                  )}
                  style={{ color: colors.text }}
                >
                  {trayDetails || 'Nicio notiță adăugată.'}
                </p>
                
                {trayDetails && trayDetails.length > 150 && (
                  <button
                    onClick={() => setShowNotes(!showNotes)}
                    className="text-sm font-medium mt-2"
                    style={{ color: colors.primary }}
                  >
                    {showNotes ? 'Arată mai puțin' : 'Arată mai mult'}
                  </button>
                )}
              </div>
              
              <Textarea
                placeholder="Adaugă notițe..."
                value={trayDetails}
                onChange={(e) => onDetailsChange(e.target.value)}
                className="mt-3 min-h-[80px] text-sm resize-none border-gray-200 focus:border-blue-300 focus:ring-blue-200"
              />
            </div>
            
            {/* Quick Links */}
            <div className="flex items-center gap-4 px-1">
              <button 
                className="flex items-center gap-1.5 text-sm"
                style={{ color: colors.textMuted }}
              >
                <History className="h-4 w-4" strokeWidth={1.5} />
                Istoric complet
              </button>
              
              <button 
                className="flex items-center gap-1.5 text-sm"
                style={{ color: colors.textMuted }}
              >
                <MessageSquare className="h-4 w-4" strokeWidth={1.5} />
                Mesaje
              </button>
            </div>
          </aside>

          {/* ============================================================== */}
          {/* RIGHT COLUMN - Work Area (65%)                                 */}
          {/* ============================================================== */}
          <div className="col-span-12 lg:col-span-8 space-y-4">
            
            {/* Block 1: Follow-up / Callback */}
            <div 
              className="rounded-lg p-5"
              style={{ backgroundColor: colors.bgCard }}
            >
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <h2 
                    className="text-sm font-semibold uppercase tracking-wide"
                    style={{ color: colors.textMuted }}
                  >
                    Rezultat apel
                  </h2>
                  
                  <SegmentedControl
                    options={[
                      { value: 'none', label: 'Selectează' },
                      { value: 'no_answer', label: 'Nu răspunde' },
                      { value: 'callback', label: 'Callback' },
                      { value: 'no_deal', label: 'No Deal' },
                      { value: 'order', label: 'Comandă' },
                    ]}
                    value={followUpType}
                    onChange={(v) => handleFollowUpChange(v as FollowUpType)}
                    size="sm"
                  />
                </div>
                
                {(followUpType === 'callback' || followUpType === 'no_answer') && (
                  <div className="flex items-center gap-3">
                    <Popover>
                      <PopoverTrigger asChild>
                        <button 
                          className="flex items-center gap-2 px-3 py-1.5 rounded-md border text-sm"
                          style={{ borderColor: colors.border }}
                        >
                          <CalendarIcon className="h-4 w-4" style={{ color: colors.textMuted }} strokeWidth={1.5} />
                          {callbackDateTime 
                            ? format(callbackDateTime, 'dd MMM', { locale: ro })
                            : 'Data'
                          }
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="end">
                        <Calendar
                          mode="single"
                          selected={callbackDateTime}
                          onSelect={setCallbackDateTime}
                          locale={ro}
                        />
                      </PopoverContent>
                    </Popover>
                    
                    <div className="flex items-center gap-1">
                      <select 
                        value={callbackHour}
                        onChange={(e) => setCallbackHour(e.target.value)}
                        className="px-2 py-1.5 rounded-md border text-sm"
                        style={{ borderColor: colors.border }}
                      >
                        {hours.map(h => <option key={h} value={h}>{h}</option>)}
                      </select>
                      <span style={{ color: colors.textMuted }}>:</span>
                      <select 
                        value={callbackMinute}
                        onChange={(e) => setCallbackMinute(e.target.value)}
                        className="px-2 py-1.5 rounded-md border text-sm"
                        style={{ borderColor: colors.border }}
                      >
                        {minutes.map(m => <option key={m} value={m}>{m}</option>)}
                      </select>
                    </div>
                    
                    <Button
                      size="sm"
                      onClick={handleSaveFollowUp}
                      className="bg-blue-600 hover:bg-blue-700 text-white"
                    >
                      Salvează
                    </Button>
                  </div>
                )}
              </div>
            </div>

            {/* Block 2: New Order */}
            <div 
              className={cn(
                "rounded-lg p-5 transition-all duration-200",
                followUpType === 'order' && "ring-2 ring-blue-200"
              )}
              style={{ backgroundColor: colors.bgCard }}
            >
              <div className="flex items-center justify-between mb-5">
                <h2 
                  className="text-sm font-semibold uppercase tracking-wide"
                  style={{ color: colors.textMuted }}
                >
                  Comandă nouă
                </h2>
                
                <div className="flex items-center gap-2">
                  {/* Urgent Toggle */}
                  <button
                    onClick={() => onUrgentChange(!urgentAllServices)}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all",
                      urgentAllServices 
                        ? "bg-red-100 text-red-700" 
                        : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                    )}
                  >
                    <Zap className="h-3.5 w-3.5" strokeWidth={2} />
                    Urgent
                    {urgentAllServices && <span>+{URGENT_MARKUP_PCT}%</span>}
                  </button>
                  
                  {/* Subscription Toggle */}
                  <select
                    value={subscriptionType}
                    onChange={(e) => onSubscriptionChange(e.target.value as any)}
                    className="px-3 py-1.5 rounded-full text-xs font-medium bg-gray-100 border-0"
                    style={{ color: colors.textMuted }}
                  >
                    <option value="">Fără abonament</option>
                    <option value="services">Abonament servicii</option>
                    <option value="parts">Abonament piese</option>
                    <option value="both">Abonament complet</option>
                  </select>
                </div>
              </div>
              
              {/* Delivery Options */}
              <div className="mb-5">
                <Label 
                  className="text-xs font-medium uppercase tracking-wide mb-2 block"
                  style={{ color: colors.textMuted }}
                >
                  Livrare
                </Label>
                <div className="flex gap-3">
                  <DeliveryPill
                    type="office"
                    selected={deliveryType === 'office'}
                    onClick={() => handleDeliveryChange('office')}
                    icon={Building2}
                    label="Office Direct"
                  />
                  <DeliveryPill
                    type="courier"
                    selected={deliveryType === 'courier'}
                    onClick={() => handleDeliveryChange('courier')}
                    icon={Truck}
                    label="Curier"
                  />
                  <DeliveryPill
                    type="return"
                    selected={deliveryType === 'return'}
                    onClick={() => handleDeliveryChange('return')}
                    icon={Package}
                    label="Retur"
                  />
                </div>
              </div>
              
              {/* Items List */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <Label 
                    className="text-xs font-medium uppercase tracking-wide"
                    style={{ color: colors.textMuted }}
                  >
                    Instrumente & Servicii
                  </Label>
                  
                  <button
                    onClick={onAddService}
                    className="flex items-center gap-1 text-sm font-medium"
                    style={{ color: colors.primary }}
                  >
                    <Plus className="h-4 w-4" strokeWidth={2} />
                    Adaugă
                  </button>
                </div>
                
                {items.length > 0 ? (
                  <div className="rounded-lg border overflow-hidden" style={{ borderColor: colors.border }}>
                    <table className="w-full text-sm">
                      <thead>
                        <tr style={{ backgroundColor: colors.borderLight }}>
                          <th className="text-left py-2.5 px-3 font-medium" style={{ color: colors.textMuted }}>
                            Denumire
                          </th>
                          <th className="text-center py-2.5 px-3 font-medium w-20" style={{ color: colors.textMuted }}>
                            Cant.
                          </th>
                          <th className="text-right py-2.5 px-3 font-medium w-24" style={{ color: colors.textMuted }}>
                            Preț
                          </th>
                          <th className="text-right py-2.5 px-3 font-medium w-24" style={{ color: colors.textMuted }}>
                            Total
                          </th>
                          <th className="w-10"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.filter(it => it.item_type !== null || it.instrument_id).map((item) => {
                          const disc = Math.min(100, Math.max(0, item.discount_pct || 0))
                          const base = (item.qty || 0) * (item.price || 0)
                          const lineTotal = base * (1 - disc / 100)
                          
                          return (
                            <tr 
                              key={item.id} 
                              className="border-t"
                              style={{ borderColor: colors.borderLight }}
                            >
                              <td className="py-2.5 px-3" style={{ color: colors.text }}>
                                {item.name_snapshot}
                              </td>
                              <td className="py-2.5 px-3 text-center">
                                <input
                                  type="number"
                                  value={item.qty}
                                  onChange={(e) => onUpdateItem(item.id, { qty: parseInt(e.target.value) || 1 })}
                                  className="w-14 text-center py-1 px-2 rounded border text-sm"
                                  style={{ borderColor: colors.border }}
                                  min={1}
                                />
                              </td>
                              <td className="py-2.5 px-3 text-right tabular-nums" style={{ color: colors.text }}>
                                {item.price.toFixed(2)}
                              </td>
                              <td className="py-2.5 px-3 text-right tabular-nums font-medium" style={{ color: colors.text }}>
                                {lineTotal.toFixed(2)}
                              </td>
                              <td className="py-2.5 px-1">
                                <button
                                  onClick={() => onDelete(item.id)}
                                  className="p-1 rounded hover:bg-red-50"
                                >
                                  <X className="h-4 w-4 text-gray-400 hover:text-red-500" strokeWidth={1.5} />
                                </button>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                    
                    {/* Totals */}
                    <div 
                      className="px-3 py-3 border-t"
                      style={{ backgroundColor: colors.borderLight, borderColor: colors.border }}
                    >
                      <div className="flex justify-end gap-8 text-sm">
                        <div className="text-right">
                          <p style={{ color: colors.textMuted }}>Subtotal</p>
                          {urgentAllServices && (
                            <p className="text-red-600">Urgent +{URGENT_MARKUP_PCT}%</p>
                          )}
                          <p className="font-semibold text-base mt-1" style={{ color: colors.text }}>Total</p>
                        </div>
                        <div className="text-right tabular-nums">
                          <p style={{ color: colors.text }}>{subtotal.toFixed(2)} lei</p>
                          {urgentAllServices && (
                            <p className="text-red-600">+{urgentMarkup.toFixed(2)} lei</p>
                          )}
                          <p className="font-semibold text-base mt-1" style={{ color: colors.text }}>
                            {total.toFixed(2)} lei
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div 
                    className="rounded-lg border-2 border-dashed py-8 text-center"
                    style={{ borderColor: colors.border }}
                  >
                    <p className="text-sm" style={{ color: colors.textMuted }}>
                      Niciun instrument sau serviciu adăugat.
                    </p>
                    <button
                      onClick={onAddService}
                      className="text-sm font-medium mt-2"
                      style={{ color: colors.primary }}
                    >
                      Adaugă primul element
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Block 3: Attachments */}
            <div 
              className="rounded-lg p-5"
              style={{ backgroundColor: colors.bgCard }}
            >
              <div className="flex items-center justify-between mb-4">
                <h2 
                  className="text-sm font-semibold uppercase tracking-wide flex items-center gap-2"
                  style={{ color: colors.textMuted }}
                >
                  <Image className="h-4 w-4" strokeWidth={1.5} />
                  Atașamente
                  {trayImages.length > 0 && (
                    <span 
                      className="inline-flex items-center justify-center w-5 h-5 rounded-full text-xs"
                      style={{ backgroundColor: colors.borderLight, color: colors.textMuted }}
                    >
                      {trayImages.length}
                    </span>
                  )}
                </h2>
              </div>
              
              {/* Image Grid */}
              {trayImages.length > 0 && (
                <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
                  {trayImages.map((img) => (
                    <div 
                      key={img.id}
                      className="w-20 h-20 rounded-lg bg-gray-100 flex-shrink-0 overflow-hidden"
                    >
                      <img 
                        src={img.file_path} 
                        alt={img.filename || 'Attachment'}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ))}
                </div>
              )}
              
              {/* Upload Zone */}
              <div
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                  "rounded-lg border-2 border-dashed py-6 px-4 text-center cursor-pointer transition-colors",
                  "hover:border-blue-300 hover:bg-blue-50/50"
                )}
                style={{ borderColor: colors.border }}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                
                {uploadingImage ? (
                  <div className="flex items-center justify-center gap-2">
                    <div className="h-4 w-4 border-2 border-blue-300 border-t-blue-600 rounded-full animate-spin" />
                    <span className="text-sm" style={{ color: colors.textMuted }}>Se încarcă...</span>
                  </div>
                ) : (
                  <>
                    <Upload className="h-6 w-6 mx-auto mb-2" style={{ color: colors.textLight }} strokeWidth={1.5} />
                    <p className="text-sm" style={{ color: colors.textMuted }}>
                      Click sau trage imagini aici
                    </p>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
      
      {/* Mobile Bottom Bar */}
      <MobileBottomBar />
    </div>
  )
}
