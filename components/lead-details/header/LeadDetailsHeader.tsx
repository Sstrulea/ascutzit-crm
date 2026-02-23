/**
 * Componentă pentru header-ul LeadDetailsPanel
 * Design modern cu gradiente și layout îmbunătățit
 */

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuCheckboxItem, DropdownMenuItem } from "@/components/ui/dropdown-menu"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Mail, Phone, Trash2, Printer, ChevronsUpDown, X, Tag, PhoneCall, CalendarIcon, Pin, Loader2, Plus, Info, UserPlus, UserCheck } from "lucide-react"
import { format } from "date-fns"
import { ro } from "date-fns/locale"
import type { Tag as TagType, TagColor } from '@/lib/supabase/tagOperations'
import { cn, formatCallbackDateDisplay } from "@/lib/utils"
import { isTagHiddenFromUI } from "@/hooks/leadDetails/useLeadDetailsTags"

interface LeadDetailsHeaderProps {
  leadName: string
  leadEmail?: string | null
  leadPhone?: string | null
  isOwner: boolean
  isAdmin: boolean
  /** Utilizator vânzător (admin, owner sau member) – pentru No Deal / Nu Răspunde */
  isVanzator?: boolean
  isDepartmentPipeline: boolean
  showActionCheckboxes: boolean
  isCurierPipeline: boolean
  isReceptiePipeline: boolean
  isVanzariPipeline: boolean
  
  // Tags
  allTags: TagType[]
  selectedTagIds: string[]
  assignableTags?: TagType[]
  onToggleTag: (tagId: string) => void
  tagClass: (color: TagColor) => string
  isDepartmentTag: (tagName: string) => boolean
  isAutoTag?: (tagName: string) => boolean
  getDepartmentBadgeStyle: (tagName: string) => string
  
  // Checkbox-uri generale
  callBack: boolean
  callbackDate: string | null
  nuRaspunde: boolean
  nuRaspundeCallbackAt?: string | null
  noDeal: boolean
  onCallBackChange: (checked: boolean) => void
  onCallbackDateChange: (date: string | null) => void
  onNuRaspundeChange: (checked: boolean, callbackTime?: string) => void
  onNoDealChange: (checked: boolean) => void
  
  // Checkbox-uri Curier
  coletAjuns: boolean
  curierRetur: boolean
  coletTrimis: boolean
  asteptRidicarea: boolean
  ridicPersonal: boolean
  onColetAjunsChange: (checked: boolean) => void
  onCurierReturChange: (checked: boolean) => void
  onColetTrimisChange: (checked: boolean) => void
  onAsteptRidicareaChange: (checked: boolean) => void
  onRidicPersonalChange: (checked: boolean) => void
  
  // Pin (Receptie) – pin direct din detalii
  showPinButton?: boolean
  isPinned?: boolean
  isPinning?: boolean
  onPinClick?: () => void

  // Handlers
  onEmailClick: (email: string) => void
  onPhoneClick: (phone: string) => void
  onDeleteClick: () => void
  onClose: () => void
  onPrint?: () => void
  /** Label buton Șterge în funcție de context: „Șterge lead”, „Șterge fișa”, „Șterge tăvița” */
  deleteLabel?: string
  /** Afișează butonul Șterge (pentru owner sau admin) */
  showDeleteButton?: boolean

  /** Selector fișă de serviciu în centrul header-ului (același rând cu Print, Close, nume client) */
  showSheetSelectorInHeader?: boolean
  serviceSheets?: Array<{ id: string; number: string; created_at?: string }>
  selectedFisaId?: string | null
  loadingSheets?: boolean
  onFisaIdChange?: (fisaId: string) => void
  onCreateServiceSheet?: () => void
  isVanzariPipeline?: boolean
  isReceptiePipeline?: boolean
  isVanzator?: boolean

  /** Buton "Detalii Fisa" lângă Print – deschide modalul de detalii fișă */
  showDetaliiFisaInHeader?: boolean
  onDetaliiFisaClick?: () => void

  /** Preluare lead */
  claimedByMe?: boolean
  claimedByOther?: boolean
  claimedByName?: string | null
  isClaiming?: boolean
  onClaimClick?: () => void

  /** Logare în istoric lead când un buton e activat (pentru tracking). */
  onLogButton?: (buttonId: string, buttonLabel: string) => void
}

export function LeadDetailsHeader({
  leadName,
  leadEmail,
  leadPhone,
  isOwner,
  isAdmin,
  isVanzator = false,
  isDepartmentPipeline,
  showActionCheckboxes,
  isCurierPipeline,
  isReceptiePipeline = false,
  isVanzariPipeline = false,
  allTags,
  selectedTagIds,
  assignableTags = [],
  onToggleTag,
  tagClass,
  isDepartmentTag,
  isAutoTag = () => false,
  getDepartmentBadgeStyle,
  callBack,
  callbackDate,
  nuRaspunde,
  nuRaspundeCallbackAt,
  noDeal,
  onCallBackChange,
  onCallbackDateChange,
  onNuRaspundeChange,
  onNoDealChange,
  coletAjuns,
  curierRetur,
  coletTrimis,
  asteptRidicarea,
  ridicPersonal,
  onColetAjunsChange,
  onCurierReturChange,
  onColetTrimisChange,
  onAsteptRidicareaChange,
  onRidicPersonalChange,
  showPinButton = false,
  isPinned = false,
  isPinning = false,
  onPinClick,
  onEmailClick,
  onPhoneClick,
  onDeleteClick,
  onClose,
  onPrint,
  deleteLabel = 'Șterge',
  showDeleteButton = true,
  showSheetSelectorInHeader = false,
  serviceSheets = [],
  selectedFisaId = null,
  loadingSheets = false,
  onFisaIdChange,
  onCreateServiceSheet,
  showDetaliiFisaInHeader = false,
  onDetaliiFisaClick,
  claimedByMe = false,
  claimedByOther = false,
  claimedByName = null,
  isClaiming = false,
  onClaimClick,
  onLogButton,
}: LeadDetailsHeaderProps) {
  const wrap = (buttonId: string, buttonLabel: string, fn: () => void) => () => {
    onLogButton?.(buttonId, buttonLabel)
    fn()
  }
  const canDelete = (isOwner || isAdmin) && showDeleteButton
  // State pentru ora Call Back (Recepție) — alături de dată
  const [callbackHour, setCallbackHour] = useState('09')
  const [callbackMinute, setCallbackMinute] = useState('00')

  const hours = Array.from({ length: 11 }, (_, i) => String(i + 8).padStart(2, '0'))
  const minutes = ['00', '15', '30', '45']

  useEffect(() => {
    if (!callbackDate || !callbackDate.includes('T')) return
    try {
      const d = new Date(callbackDate)
      if (isNaN(d.getTime())) return
      setCallbackHour(String(d.getHours()).padStart(2, '0'))
      setCallbackMinute(String(d.getMinutes()).padStart(2, '0'))
    } catch {}
  }, [callbackDate])

  return (
    <header className="bg-gradient-to-r from-slate-50 via-white to-slate-50 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 border-b border-slate-200 dark:border-slate-700">
      {/* Main Header Row */}
      <div className="px-4 py-3 flex items-center justify-between gap-4">
        {/* Left: Name & Tags */}
        <div className="flex items-center gap-3 min-w-0 flex-1">
          {/* Avatar */}
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center flex-shrink-0">
            <span className="text-lg font-bold text-primary">
              {leadName.charAt(0).toUpperCase()}
            </span>
          </div>
          
          {/* Name & Tags Dropdown */}
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white truncate">
              {leadName}
            </h2>
            <div className="flex items-center gap-2 mt-1">
              {/* Atribuie tag — doar taguri ne-atribuite automat */}
              {assignableTags.length > 0 && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="h-6 px-2 text-[10px] gap-1"
                      disabled={!isAdmin && !(isReceptiePipeline && assignableTags.some(t => t.name === 'PINNED'))}
                    >
                      <Tag className="h-3 w-3" />
                      Atribuie tag
                      <ChevronsUpDown className="h-3 w-3 opacity-50" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-[220px]">
                    {assignableTags.map(tag => (
                      <DropdownMenuItem
                        key={tag.id}
                        onSelect={(e) => { e.preventDefault(); onToggleTag(tag.id) }}
                      >
                        <span className={cn(
                          "inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium",
                          tagClass(tag.color)
                        )}>
                          {tag.name}
                        </span>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
              {/* Etichete — toggle doar taguri ne-atribuite automat */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-6 px-2 text-[10px] text-muted-foreground hover:text-foreground gap-1"
                    disabled={!isAdmin && !isReceptiePipeline}
                  >
                    <Tag className="h-3 w-3" />
                    Etichete
                    <ChevronsUpDown className="h-3 w-3 opacity-50" />
                  </Button>
                </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-[240px]">
                    {allTags
                      .filter(tag => !isAutoTag(tag.name) || (tag.name === 'PINNED' && isReceptiePipeline))
                      .filter(tag => !isTagHiddenFromUI(tag.name))
                      .map(tag => (
                      <DropdownMenuCheckboxItem
                        key={tag.id}
                        checked={selectedTagIds.includes(tag.id)}
                        onCheckedChange={() => onToggleTag(tag.id)}
                        onSelect={(e) => e.preventDefault()}
                      >
                        <span className={cn(
                          "inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium",
                          tagClass(tag.color)
                        )}>
                          {tag.name}
                        </span>
                      </DropdownMenuCheckboxItem>
                    ))}
                  {allTags.filter(tag => !isAutoTag(tag.name) || (tag.name === 'PINNED' && isReceptiePipeline)).filter(tag => !isTagHiddenFromUI(tag.name)).length === 0 && (
                    <div className="px-3 py-2 text-xs text-muted-foreground text-center">
                      Nu există etichete de selectat
                    </div>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Selected Tags Pills — cu buton X pentru înlăturare (când tag-ul nu e auto sau e PINNED în Receptie); tag-urile din TAGS_HIDDEN_FROM_UI nu se afișează */}
              <div className="flex flex-wrap gap-1 max-w-[400px]">
                {allTags
                  .filter(t => selectedTagIds.includes(t.id) && !isTagHiddenFromUI(t.name))
                  .map(tag => {
                    const isUrgent = tag.name.toLowerCase() === 'urgent'
                    const isRetur = tag.name === 'RETUR'
                    const isSpecial = isUrgent || isRetur
                    const canRemove = !isAutoTag(tag.name) || (tag.name === 'PINNED' && isReceptiePipeline)
                    
                    if (isUrgent && isVanzariPipeline) return null
                    
                    const pillContent = (
                      <>
                        {tag.name}
                        {canRemove && (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); onToggleTag(tag.id) }}
                            className="ml-1 rounded p-0.5 hover:bg-white/20 focus:outline-none focus:ring-1 focus:ring-white/50"
                            title="Elimină tag"
                            aria-label={`Elimină ${tag.name}`}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        )}
                      </>
                    )
                    
                    if (isDepartmentTag(tag.name)) {
                      return (
                        <span
                          key={tag.id}
                          className={cn(
                            "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold text-white shadow-sm",
                            getDepartmentBadgeStyle(tag.name),
                            isSpecial && "animate-pulse"
                          )}
                        >
                          {pillContent}
                        </span>
                      )
                    }
                    
                    if (isSpecial) {
                      return (
                        <span
                          key={tag.id}
                          className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-red-500 text-white animate-pulse"
                        >
                          {pillContent}
                        </span>
                      )
                    }
                    
                    return (
                      <span
                        key={tag.id}
                        className={cn(
                          "inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium",
                          tagClass(tag.color)
                        )}
                      >
                        {pillContent}
                      </span>
                    )
                  })}
              </div>
            </div>
          </div>
        </div>

        {/* Center: Selector fișă de serviciu (același rând cu nume și butoane) */}
        {showSheetSelectorInHeader && onFisaIdChange && (
          <div className="flex items-center justify-center gap-2 flex-1 min-w-0 mx-2">
            <label className="text-sm font-medium text-muted-foreground whitespace-nowrap hidden sm:inline">
              Selectează fișa de serviciu:
            </label>
            <Select
              value={selectedFisaId || ''}
              onValueChange={onFisaIdChange}
              disabled={loadingSheets}
            >
              <SelectTrigger className="w-[200px] sm:w-[240px] h-8 text-sm">
                <SelectValue placeholder={loadingSheets ? "Se încarcă..." : "Selectează o fișă"} />
              </SelectTrigger>
              <SelectContent>
                {serviceSheets.map((sheet) => {
                  const createdDate = sheet.created_at
                    ? format(new Date(sheet.created_at), 'dd MMM yyyy')
                    : ''
                  const displayText = createdDate
                    ? `${sheet.number} - ${createdDate}`
                    : sheet.number
                  return (
                    <SelectItem key={sheet.id} value={sheet.id}>
                      {displayText}
                    </SelectItem>
                  )
                })}
                {serviceSheets.length === 0 && !loadingSheets && (
                  <div className="px-2 py-1.5 text-sm text-muted-foreground">
                    Nu există fișe de serviciu
                  </div>
                )}
              </SelectContent>
            </Select>
            {(isVanzariPipeline || (isReceptiePipeline && isVanzator)) && onCreateServiceSheet && (
              <Button
                data-button-id="receptieAddServiceSheetButton"
                variant="outline"
                size="sm"
                onClick={wrap('vanzariPanelAddServiceSheetButton', 'Adaugă Fișă Serviciu', onCreateServiceSheet)}
                className="h-8 gap-1.5 text-xs flex-shrink-0"
              >
                <Plus className="h-4 w-4" />
                <span className="hidden xs:inline">Adaugă Fișă Serviciu</span>
              </Button>
            )}
          </div>
        )}

        {/* Right: Action Buttons */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {showPinButton && onPinClick && (
            <Button
              variant="outline"
              size="sm"
              onClick={wrap('vanzariPanelPinButton', 'Pin', onPinClick)}
              disabled={isPinning}
              className={cn(
                "h-8 gap-1.5 text-xs border-slate-200 dark:border-slate-700",
                isPinned && "text-blue-600 border-blue-300 bg-blue-50 dark:bg-blue-950 dark:border-blue-800"
              )}
              title={isPinned ? "Anulează pin" : "Pin lead (apare primul în stage)"}
            >
              {isPinning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Pin className={cn("h-3.5 w-3.5", isPinned && "fill-current")} />}
              <span className="hidden sm:inline">{isPinned ? "Unpin" : "Pin"}</span>
            </Button>
          )}
          {onClaimClick && (isVanzariPipeline || isReceptiePipeline) && (
            <Button
              data-button-id="receptiePanelClaimButton"
              variant="outline"
              size="sm"
              onClick={wrap('vanzariPanelClaimButton', 'Preia', onClaimClick)}
              disabled={isClaiming || claimedByOther}
              className={cn(
                "h-8 gap-1.5 text-xs border-slate-200 dark:border-slate-700",
                claimedByMe && "text-blue-600 border-blue-300 bg-blue-50 dark:bg-blue-950 dark:border-blue-800"
              )}
              title={claimedByMe ? 'Eliberează lead-ul' : claimedByOther ? `Preluat de ${claimedByName || 'altcineva'}` : 'Preia lead-ul'}
            >
              {isClaiming ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : claimedByMe ? <UserCheck className="h-3.5 w-3.5" /> : <UserPlus className="h-3.5 w-3.5" />}
              <span className="hidden sm:inline">{claimedByMe ? 'Eliberează' : claimedByOther ? `Preluat de ${claimedByName || '...'}` : 'Preia'}</span>
            </Button>
          )}
          {!isDepartmentPipeline && (
            <>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={wrap('vanzariPanelPrintButton', 'Print', () => onPrint?.())}
                className="h-8 gap-1.5 text-xs border-slate-200 dark:border-slate-700"
                title="Printează detaliile lead-ului și fișei de serviciu"
              >
                <Printer className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Print</span>
              </Button>
              {showDetaliiFisaInHeader && onDetaliiFisaClick && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={wrap('vanzariPanelDetaliiFisaButton', 'Detalii Fisa', onDetaliiFisaClick)}
                  className="h-8 gap-1.5 text-xs border-slate-200 dark:border-slate-700"
                  title="Detalii fișă de serviciu"
                >
                  <Info className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Detalii Fisa</span>
                </Button>
              )}
              <Button 
                variant="outline" 
                size="sm" 
                onClick={wrap('vanzariPanelEmailButton', 'Email', () => leadEmail && onEmailClick(leadEmail))}
                disabled={!leadEmail}
                className="h-8 gap-1.5 text-xs border-slate-200 dark:border-slate-700"
                title={leadEmail ? `Deschide clientul de email pentru ${leadEmail}` : "Nu există adresă de email"}
              >
                <Mail className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Email</span>
              </Button>
            </>
          )}
          {canDelete && (
            <Button 
              variant="outline" 
              size="sm" 
              onClick={wrap('vanzariPanelDeleteButton', 'Șterge', onDeleteClick)}
              className="h-8 gap-1.5 text-xs text-red-600 border-red-200 hover:bg-red-50 hover:border-red-300 dark:border-red-900 dark:hover:bg-red-950"
              title={`Șterge ${deleteLabel.toLowerCase()} definitiv din sistem`}
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{deleteLabel}</span>
            </Button>
          )}
          <Button 
            data-button-id="receptiePanelCloseButton"
            variant="outline" 
            size="sm" 
            onClick={wrap('vanzariPanelCloseButton', 'Close', onClose)} 
            className="h-8 gap-1.5 text-xs text-red-600 border-red-200 hover:bg-red-50 hover:border-red-300 dark:border-red-900 dark:hover:bg-red-950"
            title="Închide panoul de detalii"
          >
            Close
          </Button>
        </div>
      </div>

      {/* Action Checkboxes Row — doar Recepție (Call Back); No Deal / Nu Răspunde sunt în secțiunea Callback */}
      {showActionCheckboxes && !isCurierPipeline && isReceptiePipeline && (
        <div className="px-4 pb-3 flex items-center gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <ActionCheckbox
              checked={callBack}
              onChange={onCallBackChange}
              disabled={!isAdmin}
              icon={<PhoneCall className="h-3.5 w-3.5" />}
              label="Call Back"
              color="blue"
            />
            {callBack && (
              <>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className={cn(
                        "h-7 px-2 text-[11px] justify-start text-left font-normal",
                        !callbackDate && "text-muted-foreground"
                      )}
                      disabled={!isAdmin}
                      title="Selectează data și ora pentru callback"
                    >
                      <CalendarIcon className="mr-1.5 h-3 w-3" />
                      {callbackDate ? (
                        formatCallbackDateDisplay(callbackDate)
                      ) : (
                        <span>Selectează data</span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={callbackDate ? new Date(callbackDate) : undefined}
                      onSelect={(date) => {
                        if (date) {
                          const d = new Date(date)
                          d.setHours(parseInt(callbackHour, 10), parseInt(callbackMinute, 10), 0, 0)
                          onCallbackDateChange(d.toISOString())
                        } else {
                          onCallbackDateChange(null)
                        }
                      }}
                      disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                      initialFocus
                      locale={ro}
                    />
                  </PopoverContent>
                </Popover>
                <div className="flex items-center gap-1.5">
                  <Label className="text-[11px] text-muted-foreground whitespace-nowrap">Ora:</Label>
                  <Select
                    value={callbackHour}
                    onValueChange={(v) => {
                      setCallbackHour(v)
                      if (callbackDate) {
                        const d = new Date(callbackDate)
                        d.setHours(parseInt(v, 10), parseInt(callbackMinute, 10), 0, 0)
                        onCallbackDateChange(d.toISOString())
                      }
                    }}
                  >
                    <SelectTrigger className="h-7 w-[64px] text-[11px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {hours.map((h) => (
                        <SelectItem key={h} value={h}>{h}:00</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={callbackMinute}
                    onValueChange={(v) => {
                      setCallbackMinute(v)
                      if (callbackDate) {
                        const d = new Date(callbackDate)
                        d.setHours(parseInt(callbackHour, 10), parseInt(v, 10), 0, 0)
                        onCallbackDateChange(d.toISOString())
                      }
                    }}
                  >
                    <SelectTrigger className="h-7 w-[56px] text-[11px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {minutes.map((m) => (
                        <SelectItem key={m} value={m}>:{m}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
          </div>
        </div>
      )}

    </header>
  )
}

// Componentă helper pentru checkbox-uri stilizate
function ActionCheckbox({ 
  checked, 
  onChange, 
  disabled,
  icon, 
  label, 
  color 
}: { 
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  icon: React.ReactNode
  label: string
  color: 'red' | 'blue' | 'amber' | 'green'
}) {
  const colorClasses = {
    red: {
      base: 'border-red-200 dark:border-red-800',
      checked: 'bg-red-50 border-red-300 dark:bg-red-950 dark:border-red-700',
      text: 'text-red-700 dark:text-red-300',
      checkbox: 'data-[state=checked]:bg-red-500 data-[state=checked]:border-red-500'
    },
    blue: {
      base: 'border-blue-200 dark:border-blue-800',
      checked: 'bg-blue-50 border-blue-300 dark:bg-blue-950 dark:border-blue-700',
      text: 'text-blue-700 dark:text-blue-300',
      checkbox: 'data-[state=checked]:bg-blue-500 data-[state=checked]:border-blue-500'
    },
    amber: {
      base: 'border-amber-200 dark:border-amber-800',
      checked: 'bg-amber-50 border-amber-300 dark:bg-amber-950 dark:border-amber-700',
      text: 'text-amber-700 dark:text-amber-300',
      checkbox: 'data-[state=checked]:bg-amber-500 data-[state=checked]:border-amber-500'
    },
    green: {
      base: 'border-green-200 dark:border-green-800',
      checked: 'bg-green-50 border-green-300 dark:bg-green-950 dark:border-green-700',
      text: 'text-green-700 dark:text-green-300',
      checkbox: 'data-[state=checked]:bg-green-500 data-[state=checked]:border-green-500'
    }
  }

  const classes = colorClasses[color]

  return (
    <label 
      className={cn(
        "flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all",
        !disabled ? "cursor-pointer" : "cursor-default opacity-60",
        classes.base,
        checked && classes.checked
      )}
    >
      <Checkbox
        checked={checked}
        onCheckedChange={(c: any) => !disabled && onChange(!!c)}
        disabled={disabled}
        className={classes.checkbox}
      />
      <span className={cn(
        "flex items-center gap-1.5 text-xs font-medium",
        checked ? classes.text : "text-muted-foreground"
      )}>
        {icon}
        {label}
      </span>
    </label>
  )
}
