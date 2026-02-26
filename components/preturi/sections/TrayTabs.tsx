'use client'

import React, { useState } from 'react'
import { Plus, XIcon, Send, Loader2, ShoppingBag, Printer, FileCheck, Package, Pencil, ChevronLeft, ChevronRight, Check, X } from 'lucide-react'
import type { LeadQuote } from '@/lib/types/preturi'
import { isVanzareTray } from '@/lib/utils/vanzare-helpers'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Label } from '@/components/ui/label'
import { useIsMobile } from '@/hooks/use-mobile'
import { cn } from '@/lib/utils'

/** Slash as Unicode to avoid parser misinterpreting "/" after quote as start of regex */
const SLASH = '\u002F'
const OPACITY_EDIT = 'opacity-100 md:opacity-0 md:group-hover:opacity-100'

interface TrayTabsProps {
  quotes: LeadQuote[]
  selectedQuoteId: string | null
  isVanzariPipeline: boolean
  isReceptiePipeline: boolean
  isDepartmentPipeline: boolean
  isVanzatorMode: boolean
  sendingTrays: boolean
  traysAlreadyInDepartments: boolean
  currentServiceFileStage?: string | null
  officeDirect?: boolean  // Checkbox "Office Direct" bifat
  curierTrimis?: boolean  // Checkbox "Curier Trimis" bifat
  onTraySelect: (trayId: string) => void
  onAddTray: () => void
  onDeleteTray: (trayId: string) => void
  onSendTrays: () => void
  onPrintTrays?: () => void
  /** Creare tăviță inline (număr) fără modal – folosit în Recepție. */
  onCreateTrayInline?: (number: string) => Promise<void>
  /** Editare tăviță inline – disponibil pentru toți utilizatorii */
  onEditTrayInline?: (trayId: string, newNumber: string) => Promise<void>
  /** [OWNER-ONLY] Setează status fișă la "comanda". DE ELIMINAT mai târziu. */
  isOwner?: boolean
  onSetStatusComanda?: () => Promise<void>
  inline?: boolean // Dacă este true, elimină padding-ul pentru integrare inline
}

/**
 * Componentă independentă pentru gestionarea tabs-urilor tăvițelor
 * Include funcționalități de selecție, creare, ștergere și trimitere
 */
export function TrayTabs({
  quotes,
  selectedQuoteId,
  isVanzariPipeline,
  isReceptiePipeline,
  isDepartmentPipeline,
  isVanzatorMode,
  sendingTrays,
  traysAlreadyInDepartments,
  currentServiceFileStage = null,
  officeDirect = false,
  curierTrimis = false,
  onTraySelect,
  onAddTray,
  onDeleteTray,
  onSendTrays,
  onPrintTrays,
  onCreateTrayInline,
  onEditTrayInline,
  isOwner = false,
  onSetStatusComanda,
  inline = false,
}: TrayTabsProps) {
  const isMobile = useIsMobile()
  const [statusComandaLoading, setStatusComandaLoading] = useState(false)
  const [inlineTrayNum, setInlineTrayNum] = useState('')
  const [creatingInline, setCreatingInline] = useState(false)
  
  // State pentru editare inline
  const [editingTrayId, setEditingTrayId] = useState<string | null>(null)
  const [editNumber, setEditNumber] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)
  
  const n = (currentServiceFileStage || '').toLowerCase().replace(new RegExp('\\s+', 'g'), ' ').trim()
  const isCurierTrimisOrOfficeDirect =
    (n.includes('curier') && n.includes('trimis')) || (n.includes('office') && n.includes('direct'))
  // Butonul "Trimite tăvițele": când fișa e în stage Curier Trimis/Office Direct SAU când checkbox-urile sunt bifate
  // (fallback pentru membri, când currentServiceFileStage poate lipsi)
  const shouldShowSendButton =
    isReceptiePipeline &&
    (isCurierTrimisOrOfficeDirect || officeDirect || curierTrimis)
  
  // Navigare între tăvițe (pentru mobil)
  const currentIndex = quotes.findIndex(q => q.id === selectedQuoteId)
  const canGoPrev = currentIndex > 0
  const canGoNext = currentIndex < quotes.length - 1
  
  const goToPrevTray = () => {
    if (canGoPrev) {
      onTraySelect(quotes[currentIndex - 1].id)
    }
  }
  
  const goToNextTray = () => {
    if (canGoNext) {
      onTraySelect(quotes[currentIndex + 1].id)
    }
  }

  /** Când mai multe tăvițe au același număr, afișează (1), (2) ca să le poți diferenția */
  const getTrayTabLabel = (q: LeadQuote, index: number) => {
    const num = (q.number || '').trim()
    const norm = num.toLowerCase()
    if (!num) return isReceptiePipeline ? 'Vanzare' : 'Nerepartizat'
    const sameNumberIndex = quotes.slice(0, index).filter((o) => (o.number || '').trim().toLowerCase() === norm).length
    const suffix = sameNumberIndex > 0 ? ' (' + (sameNumberIndex + 1) + ')' : ''
    return 'Tăviță ' + (q.number || '') + suffix
  }
  
  // Funcție pentru deschiderea popover-ului de editare
  const openEditPopover = (tray: LeadQuote) => {
    setEditingTrayId(tray.id)
    setEditNumber(tray.number || '')
  }
  
  // Funcție pentru salvarea editării
  const handleSaveEdit = async () => {
    if (!editingTrayId || !onEditTrayInline) return
    if (!editNumber.trim()) return
    
    setSavingEdit(true)
    try {
      await onEditTrayInline(editingTrayId, editNumber.trim())
      setEditingTrayId(null)
    } finally {
      setSavingEdit(false)
    }
  }
  
  // Nu afișa tabs în mod departament
  // Permite afișarea în VanzariView (isVanzariPipeline) și ReceptieView (isReceptiePipeline)
  if (isDepartmentPipeline) {
    return null
  }

  const traysToSend = shouldShowSendButton ? quotes.filter(q => q.number && q.number.trim() !== '' && !isVanzareTray(q.number)) : []
  const vanzareTraysCount = shouldShowSendButton ? quotes.filter(q => isVanzareTray(q.number)).length : 0
  const sendButtonTitle = shouldShowSendButton
    ? (sendingTrays ? 'Se trimit tăvițele...' : traysToSend.length === 0 ? (vanzareTraysCount > 0 ? 'Toate tăvițele sunt de tip vânzare și nu necesită trimitere' : 'Nu există tăvițe de trimis') : traysAlreadyInDepartments ? 'Tăvițele sunt deja trimise în departamente' : 'Trimite ' + traysToSend.length + ' tăviț' + (traysToSend.length === 1 ? 'ă' : 'e') + ' în departamente' + (vanzareTraysCount > 0 ? ' (' + vanzareTraysCount + ' tăviț' + (vanzareTraysCount === 1 ? 'ă' : 'e') + ' de vânzare exclus' + (vanzareTraysCount === 1 ? 'ă' : 'e') + ')' : ''))
    : ''

  const wrapperClass = inline ? '' : 'px-2 sm:px-3 lg:px-4 pb-2 sm:pb-3'
  return (
    <div className={wrapperClass}>
      {/* Mobile Navigation Bar */}
      {isMobile && quotes.length > 1 && (
        <div className="flex items-center justify-between gap-2 mb-2 pb-2 border-b border-slate-200 dark:border-slate-700">
          <button
            type="button"
            onClick={goToPrevTray}
            disabled={!canGoPrev}
            className={cn(
              "flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-medium transition-all touch-manipulation",
              canGoPrev 
                ? "bg-slate-100 text-slate-700 active:bg-slate-200 dark:bg-slate-800 dark:text-slate-300" 
                : "bg-slate-50 text-slate-300 dark:bg-slate-900 dark:text-slate-600 cursor-not-allowed"
            )}
          >
            <ChevronLeft className="h-4 w-4" />
            Prev
          </button>
          
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
              {currentIndex + 1}{' ' + SLASH + ' '}{quotes.length}
            </span>
            {selectedQuoteId && (() => {
              const currentTray = quotes.find(q => q.id === selectedQuoteId)
              if (!currentTray) return null
              const isUnassigned = !currentTray.number || currentTray.number.trim() === ''
              return (
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {isUnassigned ? 'Nerepartizat' : currentTray.number}
                </span>
              )
            })()}
          </div>
          
          <button
            type="button"
            onClick={goToNextTray}
            disabled={!canGoNext}
            className={cn(
              "flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-medium transition-all touch-manipulation",
              canGoNext 
                ? "bg-slate-100 text-slate-700 active:bg-slate-200 dark:bg-slate-800 dark:text-slate-300" 
                : "bg-slate-50 text-slate-300 dark:bg-slate-900 dark:text-slate-600 cursor-not-allowed"
            )}
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
      
      <React.Fragment>
      <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto overflow-y-hidden scrollbar-hide py-0.5 touch-manipulation">
        {quotes.map((q, index) => {
          const isUnassigned = !q.number || q.number.trim() === ''
          const isVanzare = isVanzareTray(q.number)
          const isEditing = editingTrayId === q.id
          const tabLabel = isUnassigned ? (isReceptiePipeline ? 'Vanzare' : 'Nerepartizat') : isVanzare ? q.number : getTrayTabLabel(q, index)
          
          const slash20 = 'shadow-slate-500' + SLASH + '20'
          const slash25 = 'shadow-slate-600' + SLASH + '25'
          const btnCls = selectedQuoteId === q.id
            ? (isVanzare || isUnassigned ? 'bg-slate-500 text-white shadow-md ' + slash20 : 'bg-slate-600 text-white shadow-md ' + slash25)
            : (isVanzare ? 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700')
          const prCls = (isVanzariPipeline || isReceptiePipeline) && quotes.length > 1 ? 'pr-14' : onEditTrayInline ? 'pr-9' : ''
          const badgeSlash = 'bg-slate-400' + SLASH + '30'
          const badgeCls = selectedQuoteId === q.id ? ('bg-white' + SLASH + '20 text-white') : (isVanzare ? badgeSlash + ' text-slate-700 dark:text-slate-300' : badgeSlash + ' text-slate-600 dark:text-slate-400')
          return (
          <div key={q.id} className="relative group flex-shrink-0">
            <button
              type="button"
              onClick={() => onTraySelect(q.id)}
              className={cn('flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 lg:px-4 py-2 sm:py-2 min-h-11 md:min-h-0 rounded-md sm:rounded-lg text-xs sm:text-sm font-medium transition-all duration-200 whitespace-nowrap touch-manipulation', btnCls, prCls)}
              title={isVanzare ? 'Tăviță de vânzare - nu se trimite în departamente' : undefined}
            >
              <span className={cn('flex items-center justify-center w-5 h-5 rounded-full text-xs font-bold flex-shrink-0', badgeCls)}>
                {isVanzare ? <ShoppingBag className="h-3 w-3" /> : isUnassigned ? '?' : (q.number || index + 1)}
              </span>
              <span className="truncate max-w-[120px] sm:max-w-none">{tabLabel}</span>
            </button>
            
            {/* Buton Editare — disponibil pentru toți utilizatorii */}
            {onEditTrayInline && (
              <Popover open={isEditing} onOpenChange={(open) => {
                if (open) {
                  openEditPopover(q)
                } else {
                  setEditingTrayId(null)
                }
              }}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                    }}
                    className={cn(
                      'absolute top-1' + SLASH + '2 -translate-y-1' + SLASH + '2 p-1.5 min-h-[32px] min-w-[32px] flex items-center justify-center rounded-full transition-all touch-manipulation',
                      (isVanzariPipeline || isReceptiePipeline) && quotes.length > 1 ? 'right-8' : 'right-1',
                      selectedQuoteId === q.id
                        ? ('bg-white' + SLASH + '20 hover:bg-white' + SLASH + '30 text-white')
                        : ('bg-blue-500' + SLASH + '10 hover:bg-blue-500' + SLASH + '20 text-blue-600 dark:text-blue-400'),
                      OPACITY_EDIT
                    )}
                    title="Editează tăvița"
                    aria-label="Editează tăvița"
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-64 p-3" align="start">
                  <div className="space-y-3">
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Editează Tăvița</p>
                    <div className="space-y-2">
                      <div>
                        <Label className="text-xs text-slate-500">Număr</Label>
                        <Input
                          placeholder="1, 2, A..."
                          value={editNumber}
                          onChange={(e) => setEditNumber(e.target.value)}
                          disabled={savingEdit}
                          className="h-9 text-sm mt-1"
                          autoFocus
                        />
                      </div>
                    </div>
                    <div className="flex items-center gap-2 pt-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditingTrayId(null)}
                        disabled={savingEdit}
                        className="flex-1"
                      >
                        <X className="h-3.5 w-3.5 mr-1" />
                        Anulează
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        onClick={handleSaveEdit}
                        disabled={savingEdit || !editNumber.trim()}
                        className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
                      >
                        {savingEdit ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                        ) : (
                          <Check className="h-3.5 w-3.5 mr-1" />
                        )}
                        Salvează
                      </Button>
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            )}
            
            {/* Buton ștergere — vizibil pe touch (max-md) deoarece hover nu funcționează */}
            {(isVanzariPipeline || isReceptiePipeline) && quotes.length > 1 && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onDeleteTray(q.id)
                }}
                className={'absolute right-1 top-1' + SLASH + '2 -translate-y-1' + SLASH + '2 p-1.5 min-h-[36px] min-w-[36px] flex items-center justify-center rounded-full bg-red-500' + SLASH + '10 hover:bg-red-500' + SLASH + '20 text-red-500 hover:text-red-600 transition-all opacity-100 md:opacity-0 md:group-hover:opacity-100 touch-manipulation'}
                title="Șterge tăvița"
                aria-label="Șterge tăvița"
              >
                <XIcon className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )})}
        
        {/* Creare tăviță inline (Recepție) – fără modal */}
        {isReceptiePipeline && onCreateTrayInline ? (
          <div className={'flex items-center gap-1.5 flex-shrink-0 rounded-lg border-2 border-dashed border-emerald-300 dark:border-emerald-700 bg-emerald-50' + SLASH + '50 dark:bg-emerald-950' + SLASH + '20 p-1.5 gap-2'}>
            <Input
              placeholder="Număr"
              value={inlineTrayNum}
              onChange={(e) => setInlineTrayNum(e.target.value)}
              disabled={creatingInline}
              className="h-8 w-16 text-sm font-medium"
            />
            <Button
              type="button"
              size="sm"
              disabled={creatingInline || !inlineTrayNum.trim()}
              className="h-8 gap-1 bg-emerald-600 hover:bg-emerald-700 text-white flex-shrink-0"
              onClick={async () => {
                if (!onCreateTrayInline || !inlineTrayNum.trim()) return
                setCreatingInline(true)
                try {
                  await onCreateTrayInline(inlineTrayNum.trim())
                  setInlineTrayNum('')
                } finally {
                  setCreatingInline(false)
                }
              }}
            >
              {creatingInline ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Package className="h-3.5 w-3.5" />}
              Creează
            </Button>
          </div>
        ) : (
          <button
            type="button"
            onClick={onAddTray}
            className="flex items-center gap-1.5 px-3 py-2 min-h-11 md:min-h-0 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-200 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 transition-all duration-200 whitespace-nowrap border-2 border-dashed border-slate-300 dark:border-slate-600 hover:border-slate-400 flex-shrink-0 touch-manipulation"
          >
            <Plus className="h-4 w-4" />
            <span>Nouă</span>
          </button>
        )}
        
        {/* Butonul "Print tăvițe" - A4 cu toate tăvițele fișei */}
        {onPrintTrays && quotes.length > 0 && (
          <button
            type="button"
            onClick={onPrintTrays}
            className="flex items-center gap-1.5 px-3 py-2 min-h-11 md:min-h-0 rounded-lg text-sm font-medium bg-slate-600 hover:bg-slate-700 text-white transition-all duration-200 whitespace-nowrap flex-shrink-0 touch-manipulation"
            title="Print tăvițe (A4). În dialogul de print: Pages → Odd pages only (doar pagini impare)."
          >
            <Printer className="h-4 w-4" />
            <span>Print tăvițe</span>
          </button>
        )}

        {/* [OWNER-ONLY] Buton temporar: setează status fișă la "comanda". DE ELIMINAT mai târziu. */}
        {isOwner && onSetStatusComanda && quotes.length > 0 && (
          <button
            type="button"
            onClick={async () => {
              setStatusComandaLoading(true)
              try {
                await onSetStatusComanda()
              } finally {
                setStatusComandaLoading(false)
              }
            }}
            disabled={statusComandaLoading}
            className="flex items-center gap-1.5 px-3 py-2 min-h-11 md:min-h-0 rounded-lg text-sm font-medium bg-slate-600 hover:bg-slate-700 text-white transition-all duration-200 whitespace-nowrap flex-shrink-0 touch-manipulation disabled:opacity-50 disabled:cursor-not-allowed"
            title="Setează status fișă la Comandă (doar Owner)"
          >
            {statusComandaLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FileCheck className="h-4 w-4" />
            )}
            <span>Status Comandă</span>
          </button>
        )}

        {shouldShowSendButton && (
          <button
            type="button"
            onClick={onSendTrays}
            disabled={sendingTrays || traysToSend.length === 0 || traysAlreadyInDepartments}
            className={'flex items-center gap-1.5 px-4 py-2 min-h-11 rounded-lg text-sm font-medium text-white shadow-md transition-all duration-200 disabled:opacity-50 whitespace-nowrap flex-shrink-0 touch-manipulation'.replace('shadow-md', 'shadow-md shadow-emerald-500' + SLASH + '30').concat(' disabled:cursor-not-allowed md:min-h-0')}
            style={{
              backgroundColor: sendingTrays || traysToSend.length === 0 || traysAlreadyInDepartments ? 'rgb(16 185 129)' : undefined,
              animation: sendingTrays || traysToSend.length === 0 || traysAlreadyInDepartments ? 'none' : 'pulse-green 2s ease-in-out infinite'
            }}
            title={sendButtonTitle}
          >
            {sendingTrays ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Se trimit...
              </>
            ) : (
              <>
                <Send className="h-4 w-4" /> Trimite ({traysToSend.length})
              </>
            )}
          </button>
        )}
      </div>
      </React.Fragment>
    </div>
  )
}




