'use client'

import { useState, useMemo } from 'react'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Loader2, MessageSquare, Info, ChevronDown, ChevronUp } from 'lucide-react'

interface TrayDetailsSectionProps {
  trayDetails: string
  loadingTrayDetails: boolean
  isCommercialPipeline: boolean
  onDetailsChange: (details: string) => void
  setIsDirty?: (dirty: boolean) => void
  isExpanded?: boolean
  onToggleExpanded?: () => void
  isVanzariPipeline?: boolean
  isReceptiePipeline?: boolean
}

export function TrayDetailsSection({
  trayDetails,
  loadingTrayDetails,
  isCommercialPipeline,
  onDetailsChange,
  setIsDirty,
  isExpanded: externalIsExpanded,
  onToggleExpanded: externalOnToggleExpanded,
  isVanzariPipeline = false,
  isReceptiePipeline = false,
}: TrayDetailsSectionProps) {
  // IMPORTANT: Detaliile pot fi modificate DOAR dacă nu există deja detalii populate
  // Odată populate, detaliile sunt constante și nu pot fi modificate de nimeni
  const hasDetails = trayDetails && trayDetails.trim().length > 0
  const canEdit = !hasDetails // Poate edita doar dacă nu există detalii
  
  // State local dacă nu este controlat extern - minimizat by default pentru toți utilizatorii
  const [internalIsExpanded, setInternalIsExpanded] = useState(false)
  const isExpanded = externalIsExpanded !== undefined ? externalIsExpanded : internalIsExpanded
  const toggleExpanded = externalOnToggleExpanded || (() => setInternalIsExpanded(prev => !prev))

  if (!isCommercialPipeline) {
    return null
  }

  return (
    <div className="mx-2 sm:mx-4">
      <div className="rounded-xl border-2 border-amber-200/80 dark:border-amber-700/50 bg-gradient-to-br from-amber-50 via-orange-50/50 to-yellow-50/30 dark:from-amber-950/40 dark:via-orange-950/30 dark:to-yellow-950/20 shadow-sm overflow-hidden">
        {/* Header — responsive, touch-friendly pe mobile */}
        <div className="px-3 py-3 sm:px-4 bg-gradient-to-r from-amber-100/80 to-orange-100/60 dark:from-amber-900/40 dark:to-orange-900/30 border-b border-amber-200/60 dark:border-amber-700/40">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <div className="h-9 w-9 flex-shrink-0 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-sm">
                <MessageSquare className="h-4.5 w-4.5 text-white" />
              </div>
              <div className="min-w-0">
                <h3 className="font-semibold text-sm text-amber-900 dark:text-amber-100">
                  Informații Fișă Client
                </h3>
                <p className="text-[11px] text-amber-700/80 dark:text-amber-300/70 truncate">
                  {hasDetails 
                    ? 'Detalii constante • Vizibil pentru toate tăvițele'
                    : 'Notează ce a spus clientul • Vizibil pentru toate tăvițele'}
                </p>
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={toggleExpanded}
              className="h-9 w-9 min-h-11 min-w-11 md:min-h-9 md:min-w-9 p-0 flex-shrink-0 touch-manipulation"
              title={isExpanded ? 'Minimizează' : 'Maximizează'}
              aria-label={isExpanded ? 'Minimizează' : 'Maximizează'}
            >
              {isExpanded ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>

        {/* Content */}
        {isExpanded && (
          <div className="p-3 sm:p-4 space-y-3">
          <Label className="text-[10px] font-bold text-amber-800/90 dark:text-amber-200 uppercase tracking-wider flex items-center gap-1.5">
            <Info className="h-3 w-3" />
            Detalii comandă comunicate de client
          </Label>
          
          {loadingTrayDetails ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-amber-500" />
            </div>
          ) : (
            <Textarea
              value={trayDetails}
              onChange={(e) => {
                if (canEdit) {
                  onDetailsChange(e.target.value)
                  if (setIsDirty) setIsDirty(true)
                }
              }}
              placeholder={canEdit ? 'Ex.: "Vârfuri ascuțite", "Nu scurtați lama", "Retur curier".' : 'Detalii constante • Nu pot fi modificate.'}
              className="min-h-[100px] text-base md:text-sm resize-none border-amber-200/80 dark:border-amber-700/50 focus-visible:ring-amber-400/50 focus-visible:border-amber-400 bg-white/90 dark:bg-slate-950/60 placeholder:text-amber-600/40 dark:placeholder:text-amber-400/30 touch-manipulation"
              disabled={!canEdit}
              readOnly={!canEdit}
            />
          )}

          <p className="text-[10px] text-amber-700/70 dark:text-amber-300/50 flex items-center gap-1">
            <span className="inline-block h-1 w-1 rounded-full bg-amber-400" />
            {canEdit 
              ? "Salvare automată la închiderea panoului • Vizibil în toate departamentele" 
              : "Detalii constante • Nu pot fi modificate • Vizibil în toate departamentele"}
          </p>
        </div>
        )}
      </div>
    </div>
  )
}
