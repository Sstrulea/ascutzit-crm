/**
 * Componentă pentru secțiunea de mesagerie unificată (mesaje + evenimente)
 */

import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { supabaseBrowser } from '@/lib/supabase/supabaseClient'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Send, Loader2, User, MessageSquare, FileText, Move, UserCheck, ArrowRight, Package, GitBranch, Clock, Save, History as HistoryIcon, ChevronDown, ChevronUp, Pencil, Plus, Trash2 } from 'lucide-react'
import { useAuth } from '@/lib/contexts/AuthContext'
import { format, isToday, isYesterday, formatDistanceToNow } from 'date-fns'
import { ro } from 'date-fns/locale/ro'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { notifyReceptionAboutNewMessage } from '@/lib/supabase/notificationOperations'

const supabase = supabaseBrowser()

interface Quote {
  id: string
  number?: string | null
  [key: string]: any
}

interface LeadMessengerSectionProps {
  isMessengerOpen?: boolean // Păstrat pentru compatibilitate, dar nu mai este folosit
  setIsMessengerOpen?: (open: boolean) => void // Păstrat pentru compatibilitate, dar nu mai este folosit
  leadId: string | null
  leadTechnician?: string | null
  quotes?: Quote[]
  selectedQuoteId?: string | null
  isDepartmentPipeline?: boolean
}

interface Message {
  id: string
  type: 'message'
  conversation_id: string
  sender_id: string
  content: string
  message_type: string
  created_at: string
  sender_name?: string
}

interface Event {
  id: string
  type: 'event'
  lead_id: string
  actor_id: string | null
  actor_name: string | null
  event_type: string
  message: string
  payload: Record<string, unknown>
  created_at: string
}

type UnifiedItem = Message | Event

function EventIcon({ eventType }: { eventType: string }) {
  const iconMap: Record<string, { icon: any; color: string }> = {
    service_sheet_save: { icon: Save, color: "text-blue-600" },
    service_file_created: { icon: FileText, color: "text-indigo-600" },
    instrument_moved: { icon: Move, color: "text-purple-600" },
    technician_assigned: { icon: UserCheck, color: "text-green-600" },
    tray_passed: { icon: ArrowRight, color: "text-orange-600" },
    tray_created: { icon: Package, color: "text-indigo-600" },
    tray_stage_changed: { icon: GitBranch, color: "text-cyan-600" },
    tray_moved_to_pipeline: { icon: GitBranch, color: "text-pink-600" },
    tray_item_updated: { icon: Pencil, color: "text-amber-600" },
    tray_item_added: { icon: Plus, color: "text-emerald-600" },
    tray_item_deleted: { icon: Trash2, color: "text-red-600" },
    message: { icon: MessageSquare, color: "text-gray-600" },
  }
  
  const meta = iconMap[eventType] || { icon: HistoryIcon, color: "text-gray-500" }
  const Icon = meta.icon
  
  return <Icon className={`w-4 h-4 ${meta.color}`} />
}

function formatItemTime(dateString: string): string {
  const date = new Date(dateString)
  if (isToday(date)) {
    return formatDistanceToNow(date, { addSuffix: true, locale: ro })
  }
  if (isYesterday(date)) {
    return `Ieri, ${format(date, 'HH:mm', { locale: ro })}`
  }
  return format(date, 'd MMM yyyy, HH:mm', { locale: ro })
}

function formatGroupDate(dateString: string): string {
  const date = new Date(dateString)
  if (isToday(date)) return 'Astăzi'
  if (isYesterday(date)) return 'Ieri'
  return format(date, 'EEEE, d MMMM yyyy', { locale: ro })
}

// Funcții pentru rendering detalii evenimente (copiate din lead-history.tsx)
function ItemTag({ type }: { type?: string | null }) {
  const t = (type || "").toLowerCase()
  const label = t === "service" ? "Serviciu" : t === "part" ? "Piesă" : "Instrument"
  return <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase">{label}</span>
}

function renderServiceSheetDetails(payload: any) {
  const diff = payload?.diff
  if (!diff) return null

  // Bloc pentru items adăugate și șterse (fără diferențe detaliate)
  const SimpleBlock = ({ title, items, color, bgColor }: { title: string; items?: any[]; color: string; bgColor: string }) =>
    items && items.length ? (
      <div className={`rounded-md ${bgColor} p-3 border border-border/50`}>
        <div className={`text-xs font-semibold mb-2 ${color}`}>{title}</div>
        <ul className="space-y-2">
          {items.map((x, idx) => (
            <li key={idx} className="flex items-start gap-2 text-xs">
              <ItemTag type={x.type} />
              <div className="flex-1 space-y-1">
                <div className="font-medium text-foreground">{x.name}</div>
                <div className="text-muted-foreground space-y-0.5">
                  {x.instrument && (
                    <div>Instrument: <span className="font-medium">{x.instrument.name || x.instrument.id || "—"}</span></div>
                  )}
                  {x.department && (
                    <div>Departament: <span className="font-medium">{x.department.name || x.department.id || "—"}</span></div>
                  )}
                  {x.technician && (
                    <div>Tehnician: <span className="font-medium">{x.technician.name || x.technician.id || "—"}</span></div>
                  )}
                  {x.tray && (
                    <div>Tăvița: <span className="font-medium">{x.tray.number}{x.tray.size ? ` ${x.tray.size}` : ""}</span></div>
                  )}
                  {/* Detalii suplimentare pentru items adăugate */}
                  {x.qty !== undefined && (
                    <div>Cantitate: <span className="font-medium">{x.qty}</span></div>
                  )}
                  {x.price !== undefined && x.price > 0 && (
                    <div>Preț: <span className="font-medium">{Number(x.price).toFixed(2)} RON</span></div>
                  )}
                  {(x.discount_pct !== undefined && Number(x.discount_pct) > 0) && (
                    <div>Discount: <span className="font-medium">{Number(x.discount_pct)}%</span></div>
                  )}
                  {x.urgent && (
                    <div className="text-orange-600 font-medium">⚡ Urgent</div>
                  )}
                  {x.brand && (
                    <div>Brand: <span className="font-medium">{x.brand}</span></div>
                  )}
                  {x.serial_number && (
                    <div>Serie: <span className="font-medium">{x.serial_number}</span></div>
                  )}
                  {x.garantie && (
                    <div className="text-blue-600 font-medium">🛡️ Garanție</div>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    ) : null

  // Bloc pentru items actualizate cu diferențe detaliate
  const UpdatedBlock = ({ items }: { items?: any[] }) =>
    items && items.length ? (
      <div className="rounded-md bg-blue-50 dark:bg-blue-950/30 p-3 border border-blue-200 dark:border-blue-800">
        <div className="text-xs font-semibold mb-2 text-blue-600 dark:text-blue-400">Actualizate</div>
        <ul className="space-y-3">
          {items.map((x, idx) => (
            <li key={idx} className="text-xs border-b border-blue-200 dark:border-blue-800 pb-2 last:border-b-0 last:pb-0">
              <div className="flex items-start gap-2 mb-2">
                <ItemTag type={x.type} />
                <div className="flex-1">
                  <div className="font-medium text-foreground">{x.name}</div>
                  {x.instrument && (
                    <div className="text-muted-foreground text-[10px]">Instrument: {x.instrument.name || x.instrument.id || "—"}</div>
                  )}
                </div>
              </div>
              
              {/* Afișează diferențele detaliate */}
              {x.changes && Object.keys(x.changes).length > 0 && (
                <div className="ml-6 space-y-1 bg-white dark:bg-slate-900 rounded-md p-2 border border-blue-100 dark:border-blue-900">
                  <div className="text-[10px] font-semibold text-blue-700 dark:text-blue-300 uppercase mb-1">Modificări:</div>
                  {Object.entries(x.changes).map(([key, change]: [string, any]) => (
                    <div key={key} className="flex items-center gap-2 text-[11px]">
                      <span className="text-muted-foreground font-medium min-w-[70px]">{change.label}:</span>
                      <span className="px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300 line-through">
                        {change.old}
                      </span>
                      <ArrowRight className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                      <span className="px-1.5 py-0.5 rounded bg-green-100 dark:bg-green-950 text-green-700 dark:text-green-300 font-medium">
                        {change.new}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              
              {/* Fallback: dacă nu există changes dar avem previous, afișează diferențele */}
              {(!x.changes || Object.keys(x.changes).length === 0) && x.previous && (
                <div className="ml-6 space-y-1 bg-white dark:bg-slate-900 rounded-md p-2 border border-blue-100 dark:border-blue-900">
                  <div className="text-[10px] font-semibold text-blue-700 dark:text-blue-300 uppercase mb-1">Valori anterioare:</div>
                  {x.previous.qty !== x.qty && (
                    <div className="flex items-center gap-2 text-[11px]">
                      <span className="text-muted-foreground font-medium min-w-[70px]">Cantitate:</span>
                      <span className="px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300 line-through">{x.previous.qty}</span>
                      <ArrowRight className="w-3 h-3 text-muted-foreground" />
                      <span className="px-1.5 py-0.5 rounded bg-green-100 dark:bg-green-950 text-green-700 dark:text-green-300 font-medium">{x.qty}</span>
                    </div>
                  )}
                  {x.previous.price !== x.price && (
                    <div className="flex items-center gap-2 text-[11px]">
                      <span className="text-muted-foreground font-medium min-w-[70px]">Preț:</span>
                      <span className="px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300 line-through">{Number(x.previous.price).toFixed(2)} RON</span>
                      <ArrowRight className="w-3 h-3 text-muted-foreground" />
                      <span className="px-1.5 py-0.5 rounded bg-green-100 dark:bg-green-950 text-green-700 dark:text-green-300 font-medium">{Number(x.price).toFixed(2)} RON</span>
                    </div>
                  )}
                  {x.previous.urgent !== x.urgent && (
                    <div className="flex items-center gap-2 text-[11px]">
                      <span className="text-muted-foreground font-medium min-w-[70px]">Urgent:</span>
                      <span className="px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300 line-through">{x.previous.urgent ? 'Da' : 'Nu'}</span>
                      <ArrowRight className="w-3 h-3 text-muted-foreground" />
                      <span className="px-1.5 py-0.5 rounded bg-green-100 dark:bg-green-950 text-green-700 dark:text-green-300 font-medium">{x.urgent ? 'Da' : 'Nu'}</span>
                    </div>
                  )}
                  {x.previous?.discount_pct !== undefined && x.previous.discount_pct !== x.discount_pct && (
                    <div className="flex items-center gap-2 text-[11px]">
                      <span className="text-muted-foreground font-medium min-w-[70px]">Discount (%):</span>
                      <span className="px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300 line-through">{Number(x.previous.discount_pct)}%</span>
                      <ArrowRight className="w-3 h-3 text-muted-foreground" />
                      <span className="px-1.5 py-0.5 rounded bg-green-100 dark:bg-green-950 text-green-700 dark:text-green-300 font-medium">{Number(x.discount_pct ?? 0)}%</span>
                    </div>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>
    ) : null

  const subLabel = (s: string | null) => s === "services" ? "Servicii" : s === "parts" ? "Piese" : s === "both" ? "Servicii + Piese" : "—"

  return (
    <div className="space-y-3">
      {/* Instrumente și cantități */}
      {payload?.instruments && payload.instruments.length > 0 && (
        <div className="rounded-md bg-purple-50 dark:bg-purple-950/30 p-3 border border-purple-200 dark:border-purple-800">
          <div className="text-xs font-semibold mb-2 text-purple-600 dark:text-purple-400">Instrumente în tăviță</div>
          <ul className="space-y-1.5">
            {payload.instruments.map((inst: any, idx: number) => (
              <li key={idx} className="flex items-center justify-between text-xs">
                <span className="font-medium text-foreground">{inst.name}</span>
                <span className="text-muted-foreground">Cantitate: <span className="font-semibold">{inst.quantity}</span></span>
              </li>
            ))}
          </ul>
        </div>
      )}
      
      <SimpleBlock title="Adăugate" items={diff.added} color="text-green-600 dark:text-green-400" bgColor="bg-green-50 dark:bg-green-950/30" />
      <UpdatedBlock items={diff.updated} />
      <SimpleBlock title="Șterse" items={diff.removed} color="text-red-600 dark:text-red-400" bgColor="bg-red-50 dark:bg-red-950/30" />
      
      {payload?.tray && (
        <div className="flex items-center gap-2 p-2 rounded-md bg-muted/30 border border-border/50">
          <Package className="w-4 h-4 text-muted-foreground" />
          <div className="text-xs">
            <span className="font-medium">Tăvița:</span> {payload.tray.number}{payload.tray.size ? ` (${payload.tray.size})` : ""}{payload.tray.status ? ` - ${payload.tray.status}` : ""}
          </div>
        </div>
      )}
      {payload?.saved_by_user && (
        <div className="flex items-center gap-2 p-2 rounded-md bg-muted/30 border border-border/50">
          <User className="w-4 h-4 text-muted-foreground" />
          <div className="text-xs">
            <span className="font-medium">Salvat de:</span> {payload.saved_by_user.name}{payload.saved_by_user.email ? ` (${payload.saved_by_user.email})` : ""}
          </div>
        </div>
      )}
      {((payload?.global_discount_pct != null && payload.global_discount_pct > 0) || payload?.subscription_type) && (
        <div className="flex flex-wrap items-center gap-3 p-2 rounded-md bg-muted/30 border border-border/50 text-xs">
          {payload.global_discount_pct != null && payload.global_discount_pct > 0 && (
            <span><span className="font-medium">Discount global:</span> {Number(payload.global_discount_pct)}%</span>
          )}
          {payload.subscription_type && (
            <span><span className="font-medium">Abonament:</span> {subLabel(payload.subscription_type)}</span>
          )}
        </div>
      )}
    </div>
  )
}

function renderInstrumentMovedDetails(payload: any) {
  if (!payload) return null
  
  return (
    <div className="space-y-2 rounded-md bg-muted/30 p-3 border border-border/50">
      {payload.source_tray && payload.target_tray && (
        <div className="flex items-center gap-2 text-xs">
          <div className="flex items-center gap-2 px-2 py-1 rounded bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900">
            <Package className="w-3 h-3 text-red-600" />
            <span className="font-medium text-red-900 dark:text-red-100">Din:</span>
            <span>{payload.source_tray.number || payload.source_tray_id}{payload.source_tray.size ? ` (${payload.source_tray.size})` : ""}</span>
          </div>
          <ArrowRight className="w-4 h-4 text-muted-foreground" />
          <div className="flex items-center gap-2 px-2 py-1 rounded bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900">
            <Package className="w-3 h-3 text-green-600" />
            <span className="font-medium text-green-900 dark:text-green-100">În:</span>
            <span>{payload.target_tray.number || payload.target_tray_id}{payload.target_tray.size ? ` (${payload.target_tray.size})` : ""}</span>
          </div>
        </div>
      )}
      {payload.instrument_name && (
        <div className="flex items-center gap-2 text-xs">
          <Move className="w-3 h-3 text-muted-foreground" />
          <span className="font-medium">Instrument:</span>
          <span>{payload.instrument_name}</span>
          {payload.items_count && (
            <span className="text-muted-foreground">({payload.items_count} item{payload.items_count !== 1 ? 'e' : ''})</span>
          )}
        </div>
      )}
      {payload.user && (
        <div className="flex items-center gap-2 text-xs pt-1 border-t border-border/50">
          <User className="w-3 h-3 text-muted-foreground" />
          <span className="font-medium">Mutat de:</span>
          <span>{payload.user.name}{payload.user.email ? ` (${payload.user.email})` : ""}</span>
        </div>
      )}
    </div>
  )
}

function renderTrayItemDeletedDetails(payload: any) {
  if (!payload) return null
  const name = payload.item_name || payload.name || 'Item'
  const type = payload.item_type || payload.type
  return (
    <div className="rounded-md bg-red-50 dark:bg-red-950/30 p-3 border border-red-200 dark:border-red-800">
      <div className="text-xs font-semibold mb-2 text-red-600 dark:text-red-400">Item șters</div>
      <div className="flex items-start gap-2 text-xs">
        <ItemTag type={type} />
        <div className="flex-1 space-y-1">
          <div className="font-medium text-foreground">{name}</div>
          <div className="text-muted-foreground space-y-0.5">
            {payload.instrument && (
              <div>Instrument: <span className="font-medium">{payload.instrument.name || payload.instrument.id || '—'}</span></div>
            )}
            {payload.service && (
              <div>Serviciu: <span className="font-medium">{payload.service.name || payload.service.id || '—'}</span></div>
            )}
            {payload.part && (
              <div>Piesă: <span className="font-medium">{payload.part.name || payload.part.id || '—'}</span></div>
            )}
            {payload.qty != null && (
              <div>Cantitate: <span className="font-medium">{payload.qty}</span></div>
            )}
            {payload.price != null && Number(payload.price) > 0 && (
              <div>Preț: <span className="font-medium">{Number(payload.price).toFixed(2)} RON</span></div>
            )}
            {payload.discount_pct != null && Number(payload.discount_pct) > 0 && (
              <div>Discount: <span className="font-medium">{Number(payload.discount_pct)}%</span></div>
            )}
            {payload.urgent && (
              <div className="text-orange-600 font-medium">⚡ Urgent</div>
            )}
            {payload.brand && (
              <div>Brand: <span className="font-medium">{payload.brand}</span></div>
            )}
            {payload.serial_number && (
              <div>Serie: <span className="font-medium">{payload.serial_number}</span></div>
            )}
            {payload.garantie && (
              <div className="text-blue-600 font-medium">🛡️ Garanție</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function renderTechnicianAssignedDetails(payload: any) {
  if (!payload) return null
  
  return (
    <div className="space-y-2 rounded-md bg-muted/30 p-3 border border-border/50">
      {payload.tray && (
        <div className="flex items-center gap-2 text-xs">
          <Package className="w-3 h-3 text-muted-foreground" />
          <span className="font-medium">Tăviță:</span>
          <span>{payload.tray.number}{payload.tray.size ? ` (${payload.tray.size})` : ""}{payload.tray.status ? ` - ${payload.tray.status}` : ""}</span>
        </div>
      )}
      {(payload.previous_technician || payload.technician) && (
        <div className="flex items-center gap-2 text-xs">
          {payload.previous_technician && payload.technician && (
            <>
              <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900">
                <User className="w-3 h-3 text-red-600" />
                <span className="font-medium text-red-900 dark:text-red-100">Anterior:</span>
                <span>{payload.previous_technician.name || payload.previous_technician.id || "—"}</span>
              </div>
              <ArrowRight className="w-4 h-4 text-muted-foreground" />
            </>
          )}
          {payload.technician && (
            <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900">
              <UserCheck className="w-3 h-3 text-green-600" />
              <span className="font-medium text-green-900 dark:text-green-100">Nou:</span>
              <span>{payload.technician.name || payload.technician.id || "—"}</span>
              {payload.technician.email && <span className="text-muted-foreground">({payload.technician.email})</span>}
            </div>
          )}
        </div>
      )}
      {payload.user && (
        <div className="flex items-center gap-2 text-xs pt-1 border-t border-border/50">
          <User className="w-3 h-3 text-muted-foreground" />
          <span className="font-medium">Atribuit de:</span>
          <span>{payload.user.name}{payload.user.email ? ` (${payload.user.email})` : ""}</span>
        </div>
      )}
    </div>
  )
}

function renderTrayPassedDetails(payload: any) {
  if (!payload) return null
  
  return (
    <div className="space-y-2 rounded-md bg-muted/30 p-3 border border-border/50">
      {payload.tray && (
        <div className="flex items-center gap-2 text-xs">
          <Package className="w-3 h-3 text-muted-foreground" />
          <span className="font-medium">Tăviță:</span>
          <span>{payload.tray.number}{payload.tray.size ? ` (${payload.tray.size})` : ""}{payload.tray.status ? ` - ${payload.tray.status}` : ""}</span>
        </div>
      )}
      {(payload.pipeline || payload.stage) && (
        <div className="flex items-center gap-4 text-xs pt-1 border-t border-border/50">
          {payload.pipeline && (
            <div className="flex items-center gap-1.5">
              <GitBranch className="w-3 h-3 text-muted-foreground" />
              <span className="font-medium">Pipeline:</span>
              <span>{payload.pipeline.name}</span>
            </div>
          )}
          {payload.stage && (
            <div className="flex items-center gap-1.5">
              <span className="font-medium">Stage:</span>
              <span>{payload.stage.name}</span>
            </div>
          )}
        </div>
      )}
      {payload.user && (
        <div className="flex items-center gap-2 text-xs pt-1 border-t border-border/50">
          <User className="w-3 h-3 text-muted-foreground" />
          <span className="font-medium">Pasat de:</span>
          <span>{payload.user.name}{payload.user.email ? ` (${payload.user.email})` : ""}</span>
        </div>
      )}
    </div>
  )
}

function renderServiceFileCreatedDetails(payload: any, actorName?: string | null) {
  if (!payload) return null
  const createdBy = payload?.user?.name ?? payload?.user?.email ?? actorName ?? null
  return (
    <div className="space-y-2 rounded-md bg-muted/30 p-3 border border-border/50">
      {payload.number && (
        <div className="flex items-center gap-2 text-xs">
          <FileText className="w-3 h-3 text-indigo-600" />
          <span className="font-medium">Fișă:</span>
          <span>{payload.number}</span>
        </div>
      )}
      {createdBy && (
        <div className="flex items-center gap-2 text-xs pt-1 border-t border-border/50">
          <User className="w-3 h-3 text-muted-foreground" />
          <span className="font-medium">Creat de:</span>
          <span>{createdBy}{payload?.user?.email && String(payload.user.email) !== String(createdBy) ? ` (${payload.user.email})` : ""}</span>
        </div>
      )}
    </div>
  )
}

function renderTrayCreatedDetails(payload: any) {
  if (!payload) return null
  
  return (
    <div className="space-y-2 rounded-md bg-muted/30 p-3 border border-border/50">
      {payload.tray && (
        <div className="flex items-center gap-2 text-xs">
          <Package className="w-3 h-3 text-indigo-600" />
          <span className="font-medium">Tăviță:</span>
          <span>{payload.tray.number}{payload.tray.size ? ` (${payload.tray.size})` : ""}{payload.tray.status ? ` - ${payload.tray.status}` : ""}</span>
        </div>
      )}
      {(payload.pipeline || payload.stage) && (
        <div className="flex items-center gap-4 text-xs pt-1 border-t border-border/50">
          {payload.pipeline && (
            <div className="flex items-center gap-1.5">
              <GitBranch className="w-3 h-3 text-muted-foreground" />
              <span className="font-medium">Pipeline:</span>
              <span>{payload.pipeline.name}</span>
            </div>
          )}
          {payload.stage && (
            <div className="flex items-center gap-1.5">
              <span className="font-medium">Stage:</span>
              <span>{payload.stage.name}</span>
            </div>
          )}
        </div>
      )}
      {payload.user && (
        <div className="flex items-center gap-2 text-xs pt-1 border-t border-border/50">
          <User className="w-3 h-3 text-muted-foreground" />
          <span className="font-medium">Creată de:</span>
          <span>{payload.user.name}{payload.user.email ? ` (${payload.user.email})` : ""}</span>
        </div>
      )}
    </div>
  )
}

function renderTrayStageChangedDetails(payload: any) {
  if (!payload) return null
  
  return (
    <div className="space-y-2 rounded-md bg-muted/30 p-3 border border-border/50">
      {payload.tray && (
        <div className="flex items-center gap-2 text-xs">
          <Package className="w-3 h-3 text-muted-foreground" />
          <span className="font-medium">Tăviță:</span>
          <span>{payload.tray.number}{payload.tray.size ? ` (${payload.tray.size})` : ""}{payload.tray.status ? ` - ${payload.tray.status}` : ""}</span>
        </div>
      )}
      {(payload.from_stage || payload.stage) && (
        <div className="flex items-center gap-2 text-xs">
          {payload.from_stage && (
            <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900">
              <GitBranch className="w-3 h-3 text-red-600" />
              <span className="font-medium text-red-900 dark:text-red-100">De la:</span>
              <span>{payload.from_stage.name || payload.from_stage_id || "—"}</span>
            </div>
          )}
          {payload.from_stage && payload.stage && (
            <ArrowRight className="w-4 h-4 text-muted-foreground" />
          )}
          {payload.stage && (
            <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900">
              <GitBranch className="w-3 h-3 text-green-600" />
              <span className="font-medium text-green-900 dark:text-green-100">La:</span>
              <span>{payload.stage.name}</span>
            </div>
          )}
        </div>
      )}
      {payload.pipeline && (
        <div className="flex items-center gap-2 text-xs pt-1 border-t border-border/50">
          <GitBranch className="w-3 h-3 text-muted-foreground" />
          <span className="font-medium">Pipeline:</span>
          <span>{payload.pipeline.name}</span>
        </div>
      )}
      {payload.user && (
        <div className="flex items-center gap-2 text-xs pt-1 border-t border-border/50">
          <User className="w-3 h-3 text-muted-foreground" />
          <span className="font-medium">Mutat de:</span>
          <span>{payload.user.name}{payload.user.email ? ` (${payload.user.email})` : ""}</span>
        </div>
      )}
    </div>
  )
}

export function LeadMessengerSection({
  leadId,
  leadTechnician,
  selectedQuoteId,
}: LeadMessengerSectionProps) {
  const { user } = useAuth()
  const [messages, setMessages] = useState<Message[]>([])
  const [events, setEvents] = useState<Event[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [senderNamesCache, setSenderNamesCache] = useState<Record<string, string>>({})
  const [expandedEvents, setExpandedEvents] = useState<Set<string>>(new Set())
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const isMounted = useRef(true)

  // Toggle expandare eveniment
  const toggleEventExpansion = useCallback((eventId: string) => {
    setExpandedEvents((prev) => {
      const next = new Set(prev)
      if (next.has(eventId)) {
        next.delete(eventId)
      } else {
        next.add(eventId)
      }
      return next
    })
  }, [])

  // Încarcă conversația
  useEffect(() => {
    if (!leadId) return

    async function loadConversation() {
      try {
        const { data: convData, error: searchError } = await supabase
          .from('conversations')
          .select('id')
          .eq('related_id', leadId)
          .eq('type', 'lead')
          .maybeSingle()

        if (searchError && searchError.code !== 'PGRST116') {
          console.error('Error searching conversation:', searchError?.message)
        } else if (convData) {
          setConversationId(convData.id)
        } else {
          setConversationId(null)
        }
      } catch (error) {
        console.error('Error loading conversation:', error)
      }
    }

    loadConversation()
  }, [leadId])

  // Încarcă mesajele
  useEffect(() => {
    if (!conversationId) {
      setMessages([])
      return
    }

    async function loadMessages() {
      try {
        const { data: messagesData, error } = await supabase
          .from('messages')
          .select('*')
          .eq('conversation_id', conversationId)
          .order('created_at', { ascending: true })

        if (error) {
          console.error('Error loading messages:', error)
          setMessages([])
        } else {
          setMessages((messagesData || []).map(msg => ({
            ...msg,
            type: 'message' as const,
          })))
        }
      } catch (error) {
        console.error('Error loading messages:', error)
        setMessages([])
      }
    }

    loadMessages()

    // Subscribe la modificări în timp real
    const channel = supabase
      .channel(`messages:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          if (!isMounted.current) return

          if (payload.eventType === 'INSERT') {
            setMessages((prev) => {
              const exists = prev.some((msg) => msg.id === payload.new.id)
              if (exists) return prev
              return [...prev, { ...payload.new, type: 'message' as const }]
            })
          } else if (payload.eventType === 'UPDATE') {
            setMessages((prev) =>
              prev.map((msg) => (msg.id === payload.new.id ? { ...payload.new, type: 'message' as const } : msg))
            )
          } else if (payload.eventType === 'DELETE') {
            setMessages((prev) => prev.filter((msg) => msg.id !== payload.old.id))
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [conversationId])

  // Încarcă evenimentele
  useEffect(() => {
    if (!leadId) {
      setEvents([])
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)

    async function loadEvents() {
      try {
        // Prioritate: selectedQuoteId (trayId) > leadId
        if (selectedQuoteId) {
          const { data: eventsData, error } = await supabase
            .from('items_events')
            .select('*')
            .eq('type', 'tray')
            .eq('item_id', selectedQuoteId)
            .order('created_at', { ascending: false })
            .limit(200)

          if (cancelled) return
          if (error) {
            console.error('Error loading events:', error)
            setEvents([])
          } else {
            setEvents((eventsData || []).map(ev => ({
              ...ev,
              type: 'event' as const,
              lead_id: ev.item_id,
            })))
          }
        } else {
          // Încarcă evenimente DOAR pentru lead (nu istoricul global)
          // Filtrează strict după type='lead' și item_id=leadId pentru a evita evenimentele globale
          const { data: eventsData, error } = await supabase
            .from('items_events')
            .select('*')
            .eq('type', 'lead') // Doar evenimente de tip 'lead'
            .eq('item_id', leadId) // Doar pentru lead-ul curent
            .order('created_at', { ascending: false })
            .limit(200)

          if (cancelled) return
          if (error) {
            console.error('Error loading events:', error)
            setEvents([])
          } else {
            // Asigură-te că toate evenimentele sunt pentru lead-ul corect
            const filteredEvents = (eventsData || []).filter(ev => 
              ev.type === 'lead' && ev.item_id === leadId
            )
            setEvents(filteredEvents.map(ev => ({
              ...ev,
              type: 'event' as const,
              lead_id: ev.item_id,
            })))
          }
        }
      } catch (error) {
        console.error('Error loading events:', error)
        setEvents([])
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    loadEvents()

    // Subscribe la evenimente noi (doar pentru lead-ul curent, nu global)
    const channel = supabase
      .channel(`events_${leadId}_${selectedQuoteId || ''}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'items_events',
          filter: selectedQuoteId 
            ? `type=eq.tray&item_id=eq.${selectedQuoteId}` // Doar pentru tăvița selectată
            : `type=eq.lead&item_id=eq.${leadId}`, // Doar pentru lead-ul curent
        },
        (payload: any) => {
          if (!isMounted.current) return
          // Verifică dublu că evenimentul este pentru lead-ul corect
          if (selectedQuoteId) {
            if (payload.new.type === 'tray' && payload.new.item_id === selectedQuoteId) {
              const event = {
                ...payload.new,
                type: 'event' as const,
                lead_id: payload.new.item_id,
              } as Event
              setEvents((prev) => [event, ...prev])
            }
          } else {
            if (payload.new.type === 'lead' && payload.new.item_id === leadId) {
              const event = {
                ...payload.new,
                type: 'event' as const,
                lead_id: payload.new.item_id,
              } as Event
              setEvents((prev) => [event, ...prev])
            }
          }
        }
      )
      .subscribe()

    return () => {
      cancelled = true
      supabase.removeChannel(channel)
    }
  }, [leadId, selectedQuoteId])

  // Încarcă numele expeditorilor
  useEffect(() => {
    if (messages.length === 0 || !user) return

    async function loadSenderNames() {
      const uniqueSenderIds = [...new Set(messages.map(m => m.sender_id))]
        .filter(id => id !== user.id && !senderNamesCache[id])

      if (uniqueSenderIds.length === 0) return

      try {
        const { data: membersData } = await supabase
          .from('app_members')
          .select('user_id, name')
          .in('user_id', uniqueSenderIds)

        if (membersData && membersData.length > 0) {
          const newCache: Record<string, string> = { ...senderNamesCache }
          membersData.forEach((member: any) => {
            if (member.name) {
              newCache[member.user_id] = member.name
            }
          })
          setSenderNamesCache(newCache)
        }
      } catch (error) {
        console.error('Error loading sender names:', error)
      }
    }

    loadSenderNames()
  }, [messages, user, senderNamesCache])

  // Combină și sortează mesajele și evenimentele
  const unifiedItems = useMemo(() => {
    const all: UnifiedItem[] = [
      ...messages,
      ...events,
    ]
    
    // Sortează după created_at (cronologic)
    return all.sort((a, b) => 
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    )
  }, [messages, events])

  // Grupează după dată
  const groupedItems = useMemo(() => {
    const groups: Record<string, UnifiedItem[]> = {}
    unifiedItems.forEach((item) => {
      const date = new Date(item.created_at)
      const dateKey = format(date, 'yyyy-MM-dd', { locale: ro })
      if (!groups[dateKey]) {
        groups[dateKey] = []
      }
      groups[dateKey].push(item)
    })
    return groups
  }, [unifiedItems])

  const sortedDates = useMemo(() => {
    return Object.keys(groupedItems).sort((a, b) => a.localeCompare(b))
  }, [groupedItems])

  // Scroll la ultimul mesaj
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, 100)
    return () => clearTimeout(timeoutId)
  }, [unifiedItems])

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`
    }
  }, [newMessage])

  // Trimite mesaj
  const handleSendMessage = useCallback(async () => {
    const messageText = newMessage.trim()
    
    if (!messageText) return
    if (!user) {
      toast.error('Trebuie să fii autentificat pentru a trimite mesaje.')
      return
    }
    if (sending) return
    if (!conversationId) {
      toast.error('Conversația se inițializează. Așteptați câteva secunde și reîncercați.')
      return
    }

    setSending(true)
    const tempId = `temp-${Date.now()}`
    
    // Optimistic update
    const optimisticMessage: Message = {
      id: tempId,
      type: 'message',
      conversation_id: conversationId,
      sender_id: user.id,
      content: messageText,
      message_type: 'text',
      created_at: new Date().toISOString(),
      sender_name: user.user_metadata?.display_name || user.email?.split('@')[0] || 'Utilizator',
    }
    setMessages((prev) => [...prev, optimisticMessage])
    setNewMessage('')

    try {
      const { data: newMsg, error } = await supabase
        .from('messages')
        .insert({
          conversation_id: conversationId,
          sender_id: user.id,
          content: messageText,
          message_type: 'text',
        })
        .select()
        .single()

      if (error) throw error

      // Înlocuiește mesajul optimist cu cel real
      setMessages((prev) => prev.map(msg => 
        msg.id === tempId ? { ...newMsg, type: 'message' as const } : msg
      ))

      // Notifică receptia despre mesajul nou
      if (conversationId && user?.id && leadId) {
        notifyReceptionAboutNewMessage({
          conversationId,
          leadId,
          messagePreview: messageText?.trim() || 'Mesaj nou',
          senderId: user.id,
        }).catch(() => {})
      }
    } catch (error: any) {
      console.error('Error sending message:', error)
      toast.error('Eroare la trimiterea mesajului')
      // Elimină mesajul optimist
      setMessages((prev) => prev.filter(msg => msg.id !== tempId))
      setNewMessage(messageText) // Restaurează textul
    } finally {
      setSending(false)
    }
  }, [newMessage, user, conversationId, sending, leadId])

  if (!leadId) return null

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b flex-shrink-0">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium">Mesagerie</span>
        </div>
        {leadTechnician && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <User className="h-3 w-3" />
            <span>Tehnician: {leadTechnician}</span>
          </div>
        )}
      </div>

      {/* Feed unificat */}
      <ScrollArea className="flex-1 min-h-0 overflow-hidden">
        <div className="p-4 space-y-4">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-full min-h-[200px] gap-3">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Se încarcă...</p>
            </div>
          ) : unifiedItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full min-h-[200px] gap-3">
              <div className="rounded-full bg-muted p-4">
                <MessageSquare className="h-8 w-8 text-muted-foreground" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-foreground mb-1">
                  Nu există mesaje sau evenimente încă
                </p>
                <p className="text-xs text-muted-foreground">
                  Trimite primul mesaj pentru a începe conversația
                </p>
              </div>
            </div>
          ) : (
            <>
              {sortedDates.map((dateKey) => {
                const dateItems = groupedItems[dateKey]
                return (
                  <div key={dateKey} className="space-y-3">
                    {/* Header pentru grupul de zile */}
                    <div className="flex items-center gap-2 my-4">
                      <div className="flex-1 h-px bg-border" />
                      <span className="text-xs font-medium text-muted-foreground px-2">
                        {formatGroupDate(dateKey)}
                      </span>
                      <div className="flex-1 h-px bg-border" />
                    </div>

                    {/* Items din grup */}
                    {dateItems.map((item) => {
                      if (item.type === 'message') {
                        const msg = item as Message
                        const isOwnMessage = msg.sender_id === user?.id
                        const senderName = isOwnMessage 
                          ? (user?.user_metadata?.display_name || user?.email?.split('@')[0] || 'Utilizator')
                          : (senderNamesCache[msg.sender_id] || 'Utilizator')

                        return (
                          <div
                            key={msg.id}
                            className={cn(
                              'flex gap-2 animate-in fade-in slide-in-from-bottom-2 duration-300',
                              isOwnMessage ? 'justify-end' : 'justify-start'
                            )}
                          >
                            {!isOwnMessage && (
                              <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium bg-muted text-muted-foreground">
                                <User className="h-4 w-4" />
                              </div>
                            )}

                            <div className={cn('flex flex-col gap-1', isOwnMessage ? 'items-end' : 'items-start', 'max-w-[75%]')}>
                              {!isOwnMessage && (
                                <span className="text-xs font-semibold text-muted-foreground px-1">
                                  {senderName}
                                </span>
                              )}

                              <div
                                className={cn(
                                  'rounded-lg px-3 py-2 shadow-sm',
                                  isOwnMessage
                                    ? 'bg-primary text-primary-foreground rounded-br-sm'
                                    : 'bg-muted text-foreground rounded-bl-sm',
                                )}
                              >
                                <div className="text-sm whitespace-pre-wrap break-words leading-relaxed">
                                  {msg.content}
                                </div>
                                <div
                                  className={cn(
                                    'flex items-center gap-1 mt-1.5 text-[10px]',
                                    isOwnMessage ? 'text-primary-foreground/70' : 'text-muted-foreground'
                                  )}
                                >
                                  <span>
                                    {isToday(new Date(msg.created_at))
                                      ? formatDistanceToNow(new Date(msg.created_at), {
                                          addSuffix: true,
                                          locale: ro,
                                        })
                                      : format(new Date(msg.created_at), 'HH:mm', { locale: ro })}
                                  </span>
                                </div>
                              </div>
                            </div>

                            {isOwnMessage && (
                              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-medium">
                                <User className="h-4 w-4" />
                              </div>
                            )}
                          </div>
                        )
                      } else {
                        const ev = item as Event
                        const isExpanded = expandedEvents.has(ev.id)
                        const hasDetails = ev.payload && Object.keys(ev.payload).length > 0

                        return (
                          <div
                            key={ev.id}
                            className="flex items-start gap-3 p-3 rounded-lg border bg-muted/30 hover:bg-muted/50 transition-colors"
                          >
                            <div className="flex-shrink-0 rounded-full bg-muted p-2">
                              <EventIcon eventType={ev.event_type} />
                            </div>
                            <div className="flex-1 min-w-0 space-y-2">
                              {/* Header cu timp și actor */}
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs text-muted-foreground">
                                  {formatItemTime(ev.created_at)}
                                </span>
                                {ev.actor_name && (
                                  <span className="text-xs text-muted-foreground">
                                    • {ev.actor_name}
                                  </span>
                                )}
                              </div>
                              
                              {/* Mesaj (sumar) */}
                              <div className="text-sm font-medium text-foreground">
                                {ev.message}
                              </div>

                              {/* Detalii expandate */}
                              {isExpanded && hasDetails && (
                                <div className="mt-2 pt-2 border-t border-border/50 space-y-2">
                                  {ev.event_type === "service_sheet_save" && renderServiceSheetDetails(ev.payload as any)}
                                  {ev.event_type === "service_file_created" && renderServiceFileCreatedDetails(ev.payload as any, ev.actor_name)}
                                  {ev.event_type === "instrument_moved" && renderInstrumentMovedDetails(ev.payload as any)}
                                  {ev.event_type === "technician_assigned" && renderTechnicianAssignedDetails(ev.payload as any)}
                                  {ev.event_type === "tray_passed" && renderTrayPassedDetails(ev.payload as any)}
                                  {ev.event_type === "tray_created" && renderTrayCreatedDetails(ev.payload as any)}
                                  {ev.event_type === "tray_stage_changed" && renderTrayStageChangedDetails(ev.payload as any)}
                                  {ev.event_type === "tray_moved_to_pipeline" && renderTrayPassedDetails(ev.payload as any)}
                                  {ev.event_type === "tray_item_deleted" && renderTrayItemDeletedDetails(ev.payload as any)}
                                </div>
                              )}

                              {/* Buton pentru extindere/minimizare */}
                              {hasDetails && (
                                <button
                                  onClick={() => toggleEventExpansion(ev.id)}
                                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mt-1"
                                >
                                  {isExpanded ? (
                                    <>
                                      <ChevronUp className="w-3 h-3" />
                                      <span>Minimizează</span>
                                    </>
                                  ) : (
                                    <>
                                      <ChevronDown className="w-3 h-3" />
                                      <span>Detalii</span>
                                    </>
                                  )}
                                </button>
                              )}
                            </div>
                          </div>
                        )
                      }
                    })}
                  </div>
                )
              })}
              <div ref={messagesEndRef} />
            </>
          )}
        </div>
      </ScrollArea>

      {/* Input pentru mesaje */}
      <div className="p-4 border-t flex-shrink-0">
        <div className="flex gap-2">
          <Textarea
            ref={textareaRef}
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSendMessage()
              }
            }}
            placeholder="Scrie un mesaj..."
            className="min-h-[60px] max-h-[120px] resize-none"
            disabled={sending || !conversationId}
          />
          <Button
            onClick={handleSendMessage}
            disabled={!newMessage.trim() || sending || !conversationId}
            size="icon"
            className="flex-shrink-0"
          >
            {sending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
