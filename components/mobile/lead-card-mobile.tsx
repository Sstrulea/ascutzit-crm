'use client'

import { KanbanLead } from '@/lib/types/database'
import { Mail, Phone, Clock, MoreVertical, Move, Package, User, MessageCircle } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { formatExactDuration } from '@/lib/utils/service-time'
import { ro } from 'date-fns/locale'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { isTagHiddenFromUI } from '@/hooks/leadDetails/useLeadDetailsTags'
import { useAuth } from '@/lib/contexts/AuthContext'
import { supabaseBrowser } from '@/lib/supabase/supabaseClient'
import { useState, useEffect } from 'react'

const supabase = supabaseBrowser()

interface LeadCardMobileProps {
  lead: KanbanLead
  onClick: () => void
  onMove?: () => void
  onEdit?: () => void
  onArchive?: () => void
  pipelineName?: string
  /** Pipeline departament (Saloane, Frizerii, Horeca, Reparații) – pentru layout (tehnician, timp, tag-uri). */
  isDepartmentPipeline?: boolean
}

export function LeadCardMobile({ 
  lead, 
  onClick, 
  onMove, 
  onEdit, 
  onArchive,
  pipelineName,
  isDepartmentPipeline = false,
}: LeadCardMobileProps) {
  const { user } = useAuth()
  const [isTechnician, setIsTechnician] = useState(false)
  const [currentTime, setCurrentTime] = useState(new Date())
  
  // Timer pentru a actualiza "NOU" badge
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date())
    }, 60000) // 60 secunde
    return () => clearInterval(interval)
  }, [])
  
  // Verifică dacă utilizatorul este tehnician
  useEffect(() => {
    async function checkTechnician() {
      if (!user?.id) {
        setIsTechnician(false)
        return
      }
      const { data } = await supabase
        .from('app_members')
        .select('user_id, role')
        .eq('user_id', user.id)
        .single()
      
      setIsTechnician(!!data && data.role !== 'owner' && data.role !== 'admin')
    }
    checkTechnician()
  }, [user])
  
  // Verifică dacă lead-ul este o tăviță
  const leadAny = lead as any
  const isTray = leadAny.type === 'tray' || leadAny.isQuote || leadAny.quoteId
  const isServiceFile = leadAny.type === 'service_file' || leadAny.isFisa === true
  const itemType = leadAny.type || (lead.isQuote ? 'quote' : lead.isFisa ? 'service_file' : 'lead')
  const userMessageCount = leadAny.userMessageCount != null ? Number(leadAny.userMessageCount) : 0
  const showMessageBadge = (itemType === 'lead' || itemType === 'service_file' || itemType === 'tray') && userMessageCount > 0

  const canonicalTag = (name: string) =>
    String(name || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')

  const hasNuRaspunde = (lead.tags || []).some((t: any) => canonicalTag(t?.name) === 'nuraspunde')
  const getTimeAgo = (dateString: string) => {
    try {
      const date = new Date(dateString)
      return formatDistanceToNow(date, { addSuffix: true, locale: ro })
    } catch {
      return 'Data necunoscută'
    }
  }

  const getStageTime = () => {
    if (lead.stageMovedAt) {
      return getTimeAgo(lead.stageMovedAt)
    }
    if (lead.createdAt) {
      return getTimeAgo(lead.createdAt)
    }
    return 'Data necunoscută'
  }

  const getTagColor = (color?: string) => {
    switch (color) {
      case 'green': return 'bg-emerald-100 text-emerald-800 border-emerald-200'
      case 'yellow': return 'bg-amber-100 text-amber-800 border-amber-200'
      case 'red': return 'bg-rose-100 text-rose-800 border-rose-200'
      case 'blue': return 'bg-blue-100 text-blue-800 border-blue-200'
      case 'orange': return 'bg-orange-100 text-orange-800 border-orange-200'
      default: return 'bg-gray-100 text-gray-800 border-gray-200'
    }
  }

  // Tag-uri departament – stil ca pe desktop (Horeca, Saloane, Frizerii, Reparatii)
  const isDepartmentTag = (tagName: string) => {
    const departmentTags = ['Horeca', 'Saloane', 'Frizerii', 'Reparatii']
    return departmentTags.includes(tagName)
  }
  const getDepartmentBadgeStyle = (tagName: string) => {
    const styles: Record<string, string> = {
      'Horeca': 'bg-gradient-to-r from-orange-500 to-orange-600 border-orange-300 text-white',
      'Saloane': 'bg-gradient-to-r from-emerald-500 to-emerald-600 border-emerald-300 text-white',
      'Frizerii': 'bg-gradient-to-r from-amber-500 to-amber-600 border-amber-300 text-white',
      'Reparatii': 'bg-gradient-to-r from-blue-500 to-blue-600 border-blue-300 text-white',
    }
    return styles[tagName] || 'bg-gradient-to-r from-gray-500 to-gray-600 border-gray-300 text-white'
  }

  // Tag-urile ascunse din UI (Follow Up, Frizerii, Horeca, PINNED, Reparatii, Saloane) nu se afișează
  const visibleTags = (lead.tags ?? []).filter(tag => !isTagHiddenFromUI(tag?.name))
  const displayTags = (isDepartmentPipeline && isTray) ? visibleTags : visibleTags.slice(0, 3)
  const hasMoreTags = visibleTags.length > displayTags.length

  // Eticheta "NOU" - dispare după 4 ore
  const isNewBadgeVisible = (() => {
    if (!lead.createdAt || isServiceFile) return false
    const createdDate = new Date(lead.createdAt)
    const diffInHours = (currentTime.getTime() - createdDate.getTime()) / (1000 * 60 * 60)
    return diffInHours < 4
  })()

  return (
    <div
      onClick={onClick}
      className={cn(
        "bg-card border rounded-xl p-4",
        "min-h-[100px] touch-manipulation",
        "shadow-sm active:scale-[0.99] active:shadow transition-all duration-150",
        "cursor-pointer hover:bg-accent/50 transition-colors",
        isServiceFile && hasNuRaspunde && "border-red-600 border-2 animate-border-nu-raspunde"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        {/* Conținut principal */}
        <div className="flex-1 min-w-0">
          {/* Nume lead */}
          <h3 className="font-semibold text-base mb-1.5 truncate leading-snug">
            {lead.name || 'Fără nume'}
          </h3>

          {/* Pentru departament + tăviță: tray #, tehnician, timp estimat, În lucru/În așteptare (ca pe desktop) */}
          {isDepartmentPipeline && isTray && (
            <div className="space-y-1 mb-2">
              {(leadAny.trayNumber || leadAny.traySize || leadAny.isSplitChild) && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground flex-wrap">
                  <Package className="h-3.5 w-3.5 flex-shrink-0" />
                  <span>#{leadAny.trayNumber || 'N/A'}{leadAny.traySize ? ` • ${leadAny.traySize}` : ''}</span>
                  {leadAny.isSplitChild && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 text-xs font-semibold border border-orange-300">
                      🔀 SPLIT
                    </span>
                  )}
                </div>
              )}
              {(leadAny.technician || leadAny.technician2 || leadAny.technician3) && (
                <div className="flex items-center gap-1.5 text-xs font-semibold text-red-600">
                  <User className="h-3.5 w-3.5 flex-shrink-0" />
                  <span className="truncate">
                    {[leadAny.technician, leadAny.technician2, leadAny.technician3].filter(Boolean).join(' • ')}
                  </span>
                </div>
              )}
              {leadAny.estimatedTime != null && leadAny.estimatedTime > 0 && (
                <div className="text-xs text-blue-600 font-medium">
                  ⏱ {leadAny.estimatedTime >= 60
                    ? `${Math.floor(leadAny.estimatedTime / 60)}h ${leadAny.estimatedTime % 60 > 0 ? `${leadAny.estimatedTime % 60}min` : ''}`
                    : `${leadAny.estimatedTime}min`}
                </div>
              )}
              {(leadAny.inLucruSince || leadAny.inAsteptareSince) && (
                <div className="text-[10px] text-muted-foreground">
                  {leadAny.inLucruSince && (
                    <span>În lucru: {formatExactDuration(new Date(leadAny.inLucruSince))}</span>
                  )}
                  {leadAny.inLucruSince && leadAny.inAsteptareSince && ' · '}
                  {leadAny.inAsteptareSince && (
                    <span>În așteptare: {formatExactDuration(new Date(leadAny.inAsteptareSince))}</span>
                  )}
                </div>
              )}
              {leadAny.timeAtUsText && (
                <div className="text-[10px] text-muted-foreground">
                  La noi: <span className="font-semibold">{leadAny.timeAtUsText}</span>
                  {leadAny.timeAtUsDone ? ' (ridicat)' : ' (în curs)'}
                </div>
              )}
            </div>
          )}

          {/* Tehnicieni + info pentru orice tip de card tray (nu doar departament) */}
          {!isDepartmentPipeline && isTray && (leadAny.technician || leadAny.technician2 || leadAny.technician3) && (
            <div className="flex items-center gap-1.5 text-xs font-semibold text-red-600 mb-1">
              <User className="h-3.5 w-3.5 flex-shrink-0" />
              <span className="truncate">
                {[leadAny.technician, leadAny.technician2, leadAny.technician3].filter(Boolean).join(' • ')}
              </span>
            </div>
          )}

          {/* Service file: arată tăvițele cu tehnicieni (ca pe desktop) */}
          {isServiceFile && Array.isArray(leadAny.traysInLucru) && leadAny.traysInLucru.length > 0 && (
            <div className="space-y-0.5 mb-1.5">
              <div className="text-[10px] font-semibold text-muted-foreground uppercase">Status:</div>
              {leadAny.traysInLucru.map((trayInfo: any, idx: number) => (
                <div key={idx} className="text-xs flex items-center gap-1.5 flex-wrap">
                  <span className="text-muted-foreground">
                    {trayInfo.trayNumber || 'Fără nr'}
                    {trayInfo.traySize ? ` ${trayInfo.traySize}` : ''}
                  </span>
                  {trayInfo.technician && (
                    <span className={cn(
                      "font-semibold",
                      trayInfo.status === 'finalizare' ? 'text-green-600' :
                      trayInfo.status === 'in_lucru' ? 'text-red-600' :
                      trayInfo.status === 'in_asteptare' ? 'text-yellow-600' :
                      'text-muted-foreground'
                    )}>
                      {trayInfo.technician}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Email și telefon – ascunse pentru card tăviță în departament (ca pe desktop) */}
          {!(isDepartmentPipeline && isTray) && !(isServiceFile && Array.isArray(leadAny.traysInLucru) && leadAny.traysInLucru.length > 0) && (
            <div className="space-y-1.5 mb-3">
              {lead.email && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Mail className="h-3.5 w-3.5 flex-shrink-0" />
                  <span className="truncate">{lead.email}</span>
                </div>
              )}
              {lead.phone && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Phone className="h-3.5 w-3.5 flex-shrink-0" />
                  <span className="truncate">{lead.phone}</span>
                </div>
              )}
            </div>
          )}

          {/* Data / vârstă lead */}
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2">
            <Clock className="h-3 w-3 flex-shrink-0" />
            <span>{getStageTime()}</span>
          </div>

          {/* Tag-uri – stil ca pe desktop: departament, URGENT/RETUR, rest */}
          {(isNewBadgeVisible || displayTags.length > 0) && (
            <div className="flex flex-wrap items-center gap-1">
              {isNewBadgeVisible && (
                <Badge className="text-[10px] px-2 py-0.5 bg-gradient-to-r from-blue-500 to-blue-600 text-white border-0 font-semibold animate-pulse">
                  🆕 NOU
                </Badge>
              )}
              {displayTags.map((tag) => {
                const isUrgent = tag.name.toLowerCase() === 'urgent'
                const isRetur = tag.name === 'RETUR'
                const isUrgentOrRetur = isUrgent || isRetur
                if (isUrgent && pipelineName && pipelineName.toLowerCase().includes('vanzari')) return null
                if (isDepartmentTag(tag.name)) {
                  return (
                    <span
                      key={tag.id}
                      className={cn(
                        "inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border",
                        getDepartmentBadgeStyle(tag.name),
                        isUrgentOrRetur && "animate-border-strobe"
                      )}
                    >
                      {tag.name}
                    </span>
                  )
                }
                if (isUrgentOrRetur) {
                  return (
                    <Badge key={tag.id} variant="outline" className="text-[10px] px-1.5 py-0.5 bg-red-600 text-white border-red-600 animate-border-strobe">
                      {tag.name}
                    </Badge>
                  )
                }
                return (
                  <Badge key={tag.id} variant="outline" className={cn("text-[10px] px-1.5 py-0.5", getTagColor(tag.color))}>
                    {tag.name}
                  </Badge>
                )
              })}
              {hasMoreTags && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0.5 text-muted-foreground">
                  +{(lead.tags?.length || 0) - displayTags.length}
                </Badge>
              )}
            </div>
          )}

          {/* Info suplimentare pentru tăvițe/fișe – pentru departament+tray doar total + buton (restul e deja sus) */}
          {(lead.isQuote || lead.isFisa || leadAny.type === 'tray') && (
            <div className="mt-2 space-y-1.5">
              {!(isDepartmentPipeline && isTray) && (
                <>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      {leadAny.type === 'tray' && <Package className="h-3.5 w-3.5 flex-shrink-0" />}
                      <div className="flex items-center gap-1.5">
                        {leadAny.type === 'tray' && (
                          <span className="font-medium">
                            Tăviță #{leadAny.trayNumber || 'N/A'}
                            {leadAny.traySize && ` • ${leadAny.traySize}`}
                          </span>
                        )}
                        {lead.isQuote && !leadAny.type && (lead.trayNumber || (lead as any).traySize) && (
                          <span>#{lead.trayNumber}{(lead as any).traySize && ` • ${(lead as any).traySize}`}</span>
                        )}
                        {lead.isFisa && lead.fisaId && <span>Fișă #{lead.fisaId}</span>}
                      </div>
                    </div>
                    {lead.total !== undefined && lead.total > 0 && (
                      <span className="text-sm font-semibold text-foreground">{lead.total.toFixed(2)} RON</span>
                    )}
                  </div>
                  {leadAny.type === 'tray' && (leadAny.technician || leadAny.technician2 || leadAny.technician3 || leadAny.estimatedTime) && (
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground flex-wrap">
                      {(leadAny.technician || leadAny.technician2 || leadAny.technician3) && (
                        <span className="text-red-600 font-semibold">
                          👤 {[leadAny.technician, leadAny.technician2, leadAny.technician3].filter(Boolean).join(' • ')}
                        </span>
                      )}
                      {leadAny.estimatedTime && leadAny.estimatedTime > 0 && (
                        <span className="text-blue-600 font-medium">
                          ⏱ {leadAny.estimatedTime >= 60
                            ? `${Math.floor(leadAny.estimatedTime / 60)}h ${leadAny.estimatedTime % 60 > 0 ? `${leadAny.estimatedTime % 60}min` : ''}`
                            : `${leadAny.estimatedTime}min`}
                        </span>
                      )}
                    </div>
                  )}
                  {(leadAny.inLucruSince || leadAny.inAsteptareSince) && (
                    <div className="text-[10px] text-muted-foreground">
                      {leadAny.inLucruSince && <span>În lucru: {formatExactDuration(new Date(leadAny.inLucruSince))}</span>}
                      {leadAny.inAsteptareSince && <span>În așteptare: {formatExactDuration(new Date(leadAny.inAsteptareSince))}</span>}
                    </div>
                  )}
                </>
              )}
              {/* Total – afișat și pentru department+tray */}
              {(isDepartmentPipeline && isTray) && lead.total != null && lead.total > 0 && (
                <div className="text-sm font-semibold text-foreground">
                  Total: {lead.total.toFixed(2)} RON
                </div>
              )}
            </div>
          )}
        </div>

        {/* Badge mesaje + menu kebab - zonă de atingere mărită */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {showMessageBadge && (
            <span className="relative inline-flex h-9 w-9 min-h-[44px] min-w-[44px] items-center justify-center text-muted-foreground touch-manipulation" title="Mesaje de la utilizatori">
              <MessageCircle className="h-5 w-5" />
              <span className="absolute right-0 top-0 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[11px] font-bold text-white">
                {userMessageCount > 99 ? '99+' : userMessageCount}
              </span>
            </span>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-11 min-h-[44px] w-11 min-w-[44px] p-0 flex-shrink-0 rounded-xl touch-manipulation"
                onClick={(e) => {
                  e.stopPropagation()
                }}
                aria-label="Opțiuni"
              >
                <MoreVertical className="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
            {onMove && (
              <DropdownMenuItem onClick={onMove}>
                <Move className="h-4 w-4 mr-2" />
                Mută lead
              </DropdownMenuItem>
            )}
            {onEdit && (
              <DropdownMenuItem onClick={onEdit}>
                Editează
              </DropdownMenuItem>
            )}
            {onArchive && (
              <DropdownMenuItem onClick={onArchive} className="text-destructive">
                Arhivează
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  )
}

