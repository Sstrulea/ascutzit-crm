"use client"

import { useEffect, useState, useMemo } from "react"
import { supabaseBrowser } from "@/lib/supabase/supabaseClient"
import { 
  FileText, 
  Move, 
  UserCheck, 
  ArrowRight, 
  Package, 
  GitBranch, 
  Clock, 
  User,
  Users,
  Save,
  MessageSquare,
  History as HistoryIcon,
  Pencil,
  Plus,
  Trash2,
  Eye,
  UserPlus,
  ImagePlus,
  CheckCircle,
} from "lucide-react"
import { format, formatDistanceToNow, isToday, isYesterday } from "date-fns"
import { ro } from "date-fns/locale"

export type LeadEvent = {
  id: string
  lead_id: string
  actor_id: string | null
  actor_name: string | null
  event_type: string
  message: string
  payload: Record<string, unknown>
  created_at: string
}

function ItemTag({ type }: { type?: string | null }) {
  const t = (type || "").toLowerCase()
  const label = t === "service" ? "Serviciu" : t === "part" ? "Piesă" : "Instrument"
  return <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase">{label}</span>
}

/** Events for which we display the tray status (split / merge); others do not display status. */
const TRAY_EVENT_TYPES_SHOW_STATUS = ["tray_items_split_to_technician", "tray_items_merged_to_technician", "tray_split_to_real"]

function formatTrayLine(tray: any, showStatus: boolean): string {
  if (!tray) return ""
  const num = tray.number ?? ""
  const status = showStatus && tray.status ? ` - ${tray.status}` : ""
  return `${num}${status}`
}

function renderServiceSheetDetails(payload: any) {
  const diff = payload?.diff
  if (!diff) return null

  // Block for added and removed items (without detailed differences)
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
                    <div>Tăvița: <span className="font-medium">{x.tray.number}</span></div>
                  )}
                  {/* Additional details for added items */}
                  {x.qty !== undefined && (
                    <div>Cantitate: <span className="font-medium">{x.qty}</span></div>
                  )}
                  {x.price !== undefined && (
                    <div>Preț: <span className="font-medium">{Number(x.price).toFixed(2)} RON</span></div>
                  )}
                  {x.discount_pct !== undefined && (
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

  // Block for updated items with detailed differences
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
              
              {/* Display detailed differences */}
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
              
              {/* Fallback: if no changes but we have previous, display differences */}
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
  const counts = payload?.counts
  const hasDiscounts = (payload?.totals?.total_discount ?? 0) > 0 || (payload?.global_discount_pct ?? 0) > 0

  return (
    <div className="space-y-3">
      {/* Summary: what was entered (services, parts, urgent lines) */}
      {counts && (
        <div className="rounded-md bg-slate-50 dark:bg-slate-950/30 p-3 border border-slate-200 dark:border-slate-800">
          <div className="text-xs font-semibold mb-2 text-slate-600 dark:text-slate-400">Ce s-a introdus</div>
          <ul className="space-y-1 text-xs text-foreground">
            <li><span className="font-medium">Servicii:</span> {counts.services ?? 0}</li>
            <li><span className="font-medium">Piese:</span> {counts.parts ?? 0}</li>
            {Number(counts.urgent_lines) > 0 && (
              <li><span className="font-medium text-orange-600">Linii urgente:</span> {counts.urgent_lines}</li>
            )}
            {payload?.totals && (
              <li><span className="font-medium">Total:</span> {Number(payload.totals.total).toFixed(2)} RON</li>
            )}
          </ul>
        </div>
      )}

      {/* Applied discounts */}
      {hasDiscounts && (
        <div className="rounded-md bg-emerald-50 dark:bg-emerald-950/30 p-3 border border-emerald-200 dark:border-emerald-800">
          <div className="text-xs font-semibold mb-2 text-emerald-600 dark:text-emerald-400">Reduceri aplicate</div>
          <ul className="space-y-1 text-xs text-foreground">
            {(payload?.global_discount_pct ?? 0) > 0 && (
              <li><span className="font-medium">Discount global:</span> {payload.global_discount_pct}%</li>
            )}
            {(payload?.totals?.total_discount ?? 0) > 0 && (
              <li><span className="font-medium">Total reduceri:</span> {Number(payload?.totals?.total_discount ?? 0).toFixed(2)} RON</li>
            )}
          </ul>
        </div>
      )}

      {/* Instruments in tray (trays / assigned items) */}
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
            <span className="font-medium">Tăvița în care s-a salvat:</span> {formatTrayLine(payload.tray, false)}
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
            <span>{payload.source_tray.number || payload.source_tray_id}</span>
          </div>
          <ArrowRight className="w-4 h-4 text-muted-foreground" />
          <div className="flex items-center gap-2 px-2 py-1 rounded bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900">
            <Package className="w-3 h-3 text-green-600" />
            <span className="font-medium text-green-900 dark:text-green-100">În:</span>
            <span>{payload.target_tray.number || payload.target_tray_id}</span>
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
      {(payload.pipeline || payload.stage) && (
        <div className="flex items-center gap-4 text-xs">
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
          <span className="font-medium">Mutat de:</span>
          <span>{payload.user.name}{payload.user.email ? ` (${payload.user.email})` : ""}</span>
        </div>
      )}
    </div>
  )
}

function renderTechnicianAssignedDetails(payload: any, eventType?: string) {
  if (!payload) return null
  
  return (
    <div className="space-y-2 rounded-md bg-muted/30 p-3 border border-border/50">
      {payload.tray && (
        <div className="flex items-center gap-2 text-xs">
          <Package className="w-3 h-3 text-muted-foreground" />
          <span className="font-medium">Tăviță:</span>
          <span>{formatTrayLine(payload.tray, TRAY_EVENT_TYPES_SHOW_STATUS.includes(eventType ?? ""))}</span>
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
          <span className="font-medium">Atribuit de:</span>
          <span>{payload.user.name}{payload.user.email ? ` (${payload.user.email})` : ""}</span>
        </div>
      )}
    </div>
  )
}

function renderTrayItemDeletedDetails(payload: any) {
  if (!payload) return null
  const name = payload.item_name || payload.name || "Item"
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
              <div>Instrument: <span className="font-medium">{payload.instrument.name || payload.instrument.id || "—"}</span></div>
            )}
            {payload.service && (
              <div>Serviciu: <span className="font-medium">{payload.service.name || payload.service.id || "—"}</span></div>
            )}
            {payload.part && (
              <div>Piesă: <span className="font-medium">{payload.part.name || payload.part.id || "—"}</span></div>
            )}
            {payload.qty != null && (
              <div>Cantitate: <span className="font-medium">{payload.qty}</span></div>
            )}
            {payload.price != null && (
              <div>Preț: <span className="font-medium">{Number(payload.price).toFixed(2)} RON</span></div>
            )}
            {payload.discount_pct != null && (
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

function renderTrayItemAddedDetails(payload: any) {
  if (!payload) return null
  const name = payload.item_name || payload.name || "Item"
  const type = payload.item_type || payload.type
  const instrumentName = payload.instrument_name ?? payload.instrument?.name
  const qty = payload.qty != null ? Number(payload.qty) : null
  const nonRep = payload.non_repairable_qty != null ? Number(payload.non_repairable_qty) : null
  const discountPct = payload.discount_pct != null ? Number(payload.discount_pct) : null
  return (
    <div className="rounded-md bg-green-50 dark:bg-green-950/30 p-3 border border-green-200 dark:border-green-800">
      <div className="text-xs font-semibold mb-2 text-green-600 dark:text-green-400">Item adăugat</div>
      <div className="flex items-start gap-2 text-xs">
        <ItemTag type={type} />
        <div className="flex-1 space-y-1">
          {instrumentName && (
            <div className="text-muted-foreground">Instrument: <span className="font-medium text-foreground">{instrumentName}</span></div>
          )}
          <div className="font-medium text-foreground">Serviciu/piesă: {name}</div>
          <div className="text-muted-foreground space-y-0.5">
            {qty != null && (
              <div>Cantitate: <span className="font-medium text-foreground">{qty}</span></div>
            )}
            {payload.price != null && (
              <div>Preț: <span className="font-medium text-foreground">{Number(payload.price).toFixed(2)} RON</span></div>
            )}
            {discountPct != null && (
              <div>Discount: <span className="font-medium text-foreground">{discountPct}%</span></div>
            )}
            {nonRep != null && nonRep > 0 && qty != null && (
              <div><span className="font-medium text-foreground">{nonRep}</span> din {qty} nereparabile</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function renderTrayItemUpdatedDetails(payload: any) {
  if (!payload) return null
  const name = payload.item_name || payload.name || "Item"
  const type = payload.item_type || payload.type
  const instrumentName = payload.instrument_name ?? payload.instrument?.name
  const qty = payload.qty != null ? Number(payload.qty) : null
  const nonRep = payload.non_repairable_qty != null ? Number(payload.non_repairable_qty) : null
  const discountPct = payload.discount_pct != null ? Number(payload.discount_pct) : null
  return (
    <div className="rounded-md bg-amber-50 dark:bg-amber-950/30 p-3 border border-amber-200 dark:border-amber-800">
      <div className="text-xs font-semibold mb-2 text-amber-600 dark:text-amber-400">Item actualizat</div>
      <div className="flex items-start gap-2 text-xs">
        <ItemTag type={type} />
        <div className="flex-1 space-y-1">
          {instrumentName && (
            <div className="text-muted-foreground">Instrument: <span className="font-medium text-foreground">{instrumentName}</span></div>
          )}
          <div className="font-medium text-foreground">Serviciu/piesă: {name}</div>
          <div className="text-muted-foreground space-y-0.5">
            {payload.field && (
              <div className="flex items-center gap-2">
                <span className="font-medium">{payload.field}:</span>
                <span className="px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-950 line-through">{String(payload.old_value)}</span>
                <ArrowRight className="w-3 h-3 flex-shrink-0" />
                <span className="px-1.5 py-0.5 rounded bg-green-100 dark:bg-green-950 font-medium">{String(payload.new_value)}</span>
              </div>
            )}
            {qty != null && (
              <div>Cantitate: <span className="font-medium text-foreground">{qty}</span></div>
            )}
            {payload.price != null && (
              <div>Preț: <span className="font-medium text-foreground">{Number(payload.price).toFixed(2)} RON</span></div>
            )}
            {discountPct != null && (
              <div>Discount: <span className="font-medium text-foreground">{discountPct}%</span></div>
            )}
            {nonRep != null && nonRep > 0 && qty != null && (
              <div><span className="font-medium text-foreground">{nonRep}</span> din {qty} nereparabile</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

/** Format a value for display (empty → "—"). */
function formatChangeValue(v: unknown): string {
  return v != null && v !== '' ? String(v).trim() : '—'
}

/** One line per change: "Field: old_value ---> new_value" (time and user are in the card). */
function renderFieldUpdatedDetails(
  payload: any,
  title: string,
  boxClass: string = "rounded-md bg-amber-50 dark:bg-amber-950/30 p-3 border border-amber-200 dark:border-amber-800"
) {
  const changes = Array.isArray(payload?.changes) ? payload.changes : []
  if (changes.length === 0) return null
  return (
    <div className={boxClass}>
      <div className="text-xs font-semibold mb-2 text-amber-600 dark:text-amber-400">{title}</div>
      <div className="space-y-1.5">
        {changes.map((c: any, idx: number) => {
          const prev = formatChangeValue(c.previous_value)
          const next = formatChangeValue(c.new_value)
          const label = c.field_label ?? c.field
          return (
            <div key={idx} className="text-xs text-foreground">
              <span className="font-medium">{label}:</span>{' '}
              <span className="line-through text-muted-foreground">{prev}</span>
              <span className="mx-1 text-muted-foreground">--- {'>'}</span>
              <span className="font-medium text-foreground"> {next}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** Client data updates – previous and current versions on one line (e.g., Name: Marinela ---> Ion). */
function renderLeadFieldUpdatedDetails(payload: any) {
  return renderFieldUpdatedDetails(payload, "Date client / detalii actualizate")
}

/** Service file updates – previous and current versions (e.g., Status: noua ---> comanda). */
function renderServiceFileFieldUpdatedDetails(payload: any) {
  return renderFieldUpdatedDetails(
    payload,
    "Fișă de serviciu actualizată",
    "rounded-md bg-indigo-50 dark:bg-indigo-950/30 p-3 border border-indigo-200 dark:border-indigo-800"
  )
}

function renderTrayPassedDetails(payload: any, eventType?: string) {
  if (!payload) return null
  
  return (
    <div className="space-y-2 rounded-md bg-muted/30 p-3 border border-border/50">
      {payload.tray && (
        <div className="flex items-center gap-2 text-xs">
          <Package className="w-3 h-3 text-muted-foreground" />
          <span className="font-medium">Tăviță:</span>
          <span>{formatTrayLine(payload.tray, TRAY_EVENT_TYPES_SHOW_STATUS.includes(eventType ?? ""))}</span>
        </div>
      )}
      {(payload.previous_technician || payload.technician) && (
        <div className="flex items-center gap-2 text-xs">
          {payload.previous_technician && (
            <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900">
              <User className="w-3 h-3 text-red-600" />
              <span className="font-medium text-red-900 dark:text-red-100">De la:</span>
              <span>{payload.previous_technician.name || payload.previous_technician.id || "—"}</span>
            </div>
          )}
          {payload.previous_technician && payload.technician && (
            <ArrowRight className="w-4 h-4 text-muted-foreground" />
          )}
          {payload.technician && (
            <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900">
              <User className="w-3 h-3 text-green-600" />
              <span className="font-medium text-green-900 dark:text-green-100">Către:</span>
              <span>{payload.technician.name || payload.technician.id || "—"}</span>
              {payload.technician.email && <span className="text-muted-foreground">({payload.technician.email})</span>}
            </div>
          )}
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

function renderTrayCreatedDetails(payload: any, eventType?: string) {
  if (!payload) return null
  
  return (
    <div className="space-y-2 rounded-md bg-muted/30 p-3 border border-border/50">
      {payload.tray && (
        <div className="flex items-center gap-2 text-xs">
          <Package className="w-3 h-3 text-indigo-600" />
          <span className="font-medium">Tăviță:</span>
          <span>{formatTrayLine(payload.tray, TRAY_EVENT_TYPES_SHOW_STATUS.includes(eventType ?? ""))}</span>
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

function renderTrayStageChangedDetails(payload: any, eventType?: string) {
  if (!payload) return null
  
  return (
    <div className="space-y-2 rounded-md bg-muted/30 p-3 border border-border/50">
      {payload.tray && (
        <div className="flex items-center gap-2 text-xs">
          <Package className="w-3 h-3 text-muted-foreground" />
          <span className="font-medium">Tăviță:</span>
          <span>{formatTrayLine(payload.tray, TRAY_EVENT_TYPES_SHOW_STATUS.includes(eventType ?? ""))}</span>
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
      {payload.technician && (
        <div className="flex items-center gap-2 text-xs pt-1 border-t border-border/50">
          <UserCheck className="w-3 h-3 text-muted-foreground" />
          <span className="font-medium">Tehnician:</span>
          <span>{payload.technician.name}{payload.technician.email ? ` (${payload.technician.email})` : ""}</span>
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

function renderTraySplitToRealDetails(payload: any) {
  if (!payload) return null
  const names = Array.isArray(payload.technician_names) ? payload.technician_names.filter(Boolean) : []
  if (names.length === 0) return null
  return (
    <div className="mt-2 rounded-md bg-muted/30 p-3 border border-border/50">
      <div className="flex items-center gap-2 text-xs">
        <Users className="w-3 h-3 text-violet-600" />
        <span className="font-medium text-muted-foreground">Cu:</span>
        <span className="text-foreground font-medium">{names.join(", ")}</span>
      </div>
    </div>
  )
}

function renderTrayItemsSplitDetails(payload: any) {
  const moves = Array.isArray(payload?.moves) ? payload.moves : []
  const tech = payload?.technician || null

  return (
    <div className="mt-2 space-y-2 rounded-md bg-muted/30 p-3 border border-border/50">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-semibold text-muted-foreground uppercase">Împărțire către tehnician</div>
        {tech?.name && (
          <div className="text-xs font-medium">
            <span className="text-muted-foreground">Țintă:</span>{" "}
            <span className="text-foreground font-semibold">{tech.name}</span>
          </div>
        )}
      </div>

      {moves.length > 0 ? (
        <div className="space-y-1.5">
          {moves.map((m: any, idx: number) => {
            const inst = m?.instrument_name || m?.instrument_id || "—"
            const svc = m?.service_name || m?.name_snapshot || m?.service_id || "—"
            const qty = m?.qty_moved ?? "—"
            return (
              <div
                key={idx}
                className="flex items-center justify-between gap-3 text-xs rounded-md bg-background/60 border border-border/50 px-2 py-1"
              >
                <div className="min-w-0">
                  <div className="truncate">
                    <span className="font-semibold">{inst}</span>
                    <span className="text-muted-foreground"> — </span>
                    <span className="truncate">{svc}</span>
                  </div>
                  {m?.operation && (
                    <div className="text-[10px] text-muted-foreground truncate">
                      Operație: {String(m.operation)}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-muted-foreground">x</span>
                  <span className="font-semibold">{qty}</span>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="text-xs text-muted-foreground">—</div>
      )}

      {payload?.tray && (
        <div className="flex items-center gap-2 text-xs pt-1 border-t border-border/50">
          <Package className="w-3 h-3 text-muted-foreground" />
          <span className="font-medium">Tăviță:</span>
          <span>{formatTrayLine(payload.tray, true)}</span>
        </div>
      )}
      {payload?.user && (
        <div className="flex items-center gap-2 text-xs pt-1 border-t border-border/50">
          <User className="w-3 h-3 text-muted-foreground" />
          <span className="font-medium">Împărțit de:</span>
          <span>{payload.user.name}{payload.user.email ? ` (${payload.user.email})` : ""}</span>
        </div>
      )}
    </div>
  )
}

export function EventIcon({ eventType }: { eventType: string }) {
  const iconMap: Record<string, { icon: any; color: string }> = {
    lead_created: { icon: UserPlus, color: "text-emerald-600" },
    service_sheet_save: { icon: Save, color: "text-blue-600" },
    service_file_created: { icon: FileText, color: "text-indigo-600" },
    instrument_moved: { icon: Move, color: "text-purple-600" },
    technician_assigned: { icon: UserCheck, color: "text-green-600" },
    tray_passed: { icon: ArrowRight, color: "text-orange-600" },
    tray_created: { icon: Package, color: "text-indigo-600" },
    tray_stage_changed: { icon: GitBranch, color: "text-cyan-600" },
    tray_moved_to_pipeline: { icon: GitBranch, color: "text-pink-600" },
    tray_items_split_to_technician: { icon: Users, color: "text-fuchsia-600" },
    tray_items_merged_to_technician: { icon: Users, color: "text-fuchsia-600" },
    tray_split_to_real: { icon: GitBranch, color: "text-violet-600" },
    tray_item_updated: { icon: Pencil, color: "text-amber-600" },
    tray_item_added: { icon: Plus, color: "text-emerald-600" },
    tray_item_deleted: { icon: Trash2, color: "text-red-600" },
    tray_image_added: { icon: ImagePlus, color: "text-sky-600" },
    tray_image_deleted: { icon: Trash2, color: "text-red-500" },
    qc_message: { icon: CheckCircle, color: "text-violet-600" },
    lead_field_updated: { icon: Pencil, color: "text-amber-600" },
    service_file_field_updated: { icon: Pencil, color: "text-indigo-600" },
    lead_details_updated: { icon: MessageSquare, color: "text-amber-600" },
    lead_details_opened: { icon: Eye, color: "text-sky-600" },
    message: { icon: MessageSquare, color: "text-gray-600" },
  }
  
  const meta = iconMap[eventType] || { icon: HistoryIcon, color: "text-gray-500" }
  const Icon = meta.icon
  
  return <Icon className={`w-4 h-4 ${meta.color}`} />
}

export function EventBadge({ eventType }: { eventType: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    confirm_request: { label: "DE CONFIRMAT", cls: "bg-yellow-100 text-yellow-900 border-yellow-300" },
    confirm_reply:   { label: "RĂSPUNS CLIENT", cls: "bg-blue-100 text-blue-900 border-blue-300" },
    confirm_done:    { label: "CONFIRMAT", cls: "bg-emerald-100 text-emerald-900 border-emerald-300" },
    confirm_auto_move:{ label: "AUTO MOVE", cls: "bg-slate-100 text-slate-900 border-slate-300" },
  }
  const meta = map[eventType]
  if (!meta) return null
  return (
    <span className={`ml-2 inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold ${meta.cls} border`}>
      {meta.label}
    </span>
  )
}

function formatEventTime(dateString: string): string {
  const date = new Date(dateString)
  if (isToday(date)) {
    return `Astăzi, ${format(date, "HH:mm", { locale: ro })}`
  } else if (isYesterday(date)) {
    return `Ieri, ${format(date, "HH:mm", { locale: ro })}`
  } else {
    return format(date, "d MMM yyyy, HH:mm", { locale: ro })
  }
}

const supabase = supabaseBrowser()

interface LeadHistoryProps {
  leadId: string
  serviceFileId?: string | null
  trayId?: string | null
  isVanzariPipeline?: boolean
  isReceptiePipeline?: boolean
  isDepartmentPipeline?: boolean
}

async function fetchTrayIdsForServiceFile(serviceFileId: string): Promise<string[]> {
  const { data } = await supabase
    .from("trays")
    .select("id")
    .eq("service_file_id", serviceFileId)
  return (data || []).map((t: any) => t.id)
}

/** All service files of the lead (for global history). */
async function fetchServiceFileIdsForLead(leadId: string): Promise<string[]> {
  const { data } = await supabase
    .from("service_files")
    .select("id")
    .eq("lead_id", leadId)
  return (data || []).map((sf: any) => sf.id)
}

/** Lead ID from tray (tray → service_file → lead_id). For global history when we only have trayId (e.g., Department view). */
async function fetchLeadIdFromTray(trayId: string): Promise<string | null> {
  const { data: tray } = await supabase.from("trays").select("service_file_id").eq("id", trayId).single()
  if (!tray?.service_file_id) return null
  const { data: sf } = await supabase.from("service_files").select("lead_id").eq("id", tray.service_file_id).single()
  return sf?.lead_id ?? null
}

function normalizeEvent(item: any): LeadEvent {
  return { ...item, lead_id: item.item_id }
}

export default function LeadHistory({
  leadId,
  serviceFileId,
  trayId,
  isVanzariPipeline = false,
  isReceptiePipeline = false,
  isDepartmentPipeline = false,
}: LeadHistoryProps) {
  const [items, setItems] = useState<LeadEvent[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    let channel: any = null

    // ═══════════════════════════════════════════════════════════════════════════════
    // GLOBAL HISTORY: same history (lead + all files + all trays) across all
    // pipelines and views. Resolve leadId from tray if missing (e.g., Department view).
    // ═══════════════════════════════════════════════════════════════════════════════

    const run = async () => {
      // Resolve leadId: directly or from tray (tray → service_file → lead_id)
      let effectiveLeadId: string | null = leadId || null
      if (!effectiveLeadId && trayId) {
        effectiveLeadId = await fetchLeadIdFromTray(trayId)
        if (cancelled) return
      }

      // Global history: lead + all service files of the lead + all their trays
      if (effectiveLeadId) {
        const serviceFileIds = await fetchServiceFileIdsForLead(effectiveLeadId)
        if (cancelled) return
        let trayIds: string[] = []
        if (serviceFileIds.length > 0) {
          const { data: trays } = await supabase
            .from("trays")
            .select("id")
            .in("service_file_id", serviceFileIds)
          trayIds = (trays || []).map((t: any) => t.id)
        }
        if (cancelled) return

        const [leadRes, sfRes, trayRes] = await Promise.all([
          supabase.from("items_events").select("*").eq("type", "lead").eq("item_id", effectiveLeadId).order("created_at", { ascending: false }).limit(1000),
          serviceFileIds.length
            ? supabase.from("items_events").select("*").eq("type", "service_file").in("item_id", serviceFileIds).order("created_at", { ascending: false }).limit(1000)
            : Promise.resolve({ data: [] as any[], error: null }),
          trayIds.length
            ? supabase.from("items_events").select("*").eq("type", "tray").in("item_id", trayIds).order("created_at", { ascending: false }).limit(1000)
            : Promise.resolve({ data: [] as any[], error: null }),
        ])
        if (cancelled) return
        const err = leadRes.error || sfRes.error || trayRes.error
        if (err) {
          setError(err.message)
          setItems([])
        } else {
          const merged = [...(leadRes.data ?? []), ...(sfRes.data ?? []), ...(trayRes.data ?? [])]
          merged.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
          setItems(merged.slice(0, 1000).map(normalizeEvent))
          setError(null)
        }
        setLoading(false)

        const leadIdSet = effectiveLeadId
        const sfIdSet = new Set(serviceFileIds)
        const trayIdSet = new Set(trayIds)
        channel = supabase
          .channel(`global_history_${effectiveLeadId}`)
          .on("postgres_changes", { event: "INSERT", schema: "public", table: "items_events" }, (p: any) => {
            if (cancelled) return
            const n = p.new
            if (!n?.type || n.item_id == null) return
            const isLead = n.type === "lead" && n.item_id === leadIdSet
            const isSf = n.type === "service_file" && sfIdSet.has(n.item_id)
            const isTray = n.type === "tray" && trayIdSet.has(n.item_id)
            if (isLead || isSf || isTray) {
              setItems((prev) => [normalizeEvent(n), ...(prev ?? [])])
            }
          })
          .subscribe()
        return
      }

      // No lead: only tray events (e.g., Department view without resolved lead)
      if (trayId) {
        const { data, error: err } = await supabase
          .from("items_events")
          .select("*")
          .eq("type", "tray")
          .eq("item_id", trayId)
          .order("created_at", { ascending: false })
          .limit(200)
        if (cancelled) return
        if (err) {
          setError(err.message)
          setItems([])
        } else {
          setItems((data ?? []).map(normalizeEvent))
          setError(null)
        }
        setLoading(false)
        channel = supabase
          .channel(`tray_events_${trayId}`)
          .on("postgres_changes", { event: "INSERT", schema: "public", table: "items_events", filter: `type=eq.tray&item_id=eq.${trayId}` }, (payload: any) => {
            if (payload.new?.type === "tray" && payload.new?.item_id === trayId) {
              setItems((prev) => [normalizeEvent(payload.new), ...(prev ?? [])])
            }
          })
          .subscribe()
        return
      }

      setItems([])
      setError(null)
      setLoading(false)
    }

    run()
    return () => {
      cancelled = true
      if (channel) supabase.removeChannel(channel)
    }
  }, [leadId, serviceFileId, trayId, isVanzariPipeline, isReceptiePipeline, isDepartmentPipeline])

  // Move all hooks before conditional returns
  // to respect React hooks rule
  
  // Group events by date
  const groupedItems = useMemo(() => {
    if (!items || items.length === 0) return {}
    const groups: Record<string, LeadEvent[]> = {}
    items.forEach((item) => {
      const date = new Date(item.created_at)
      const dateKey = format(date, "yyyy-MM-dd", { locale: ro })
      if (!groups[dateKey]) {
        groups[dateKey] = []
      }
      groups[dateKey].push(item)
    })
    return groups
  }, [items])

  // Display first 50 by default, or all if showAll is true
  const displayItems = useMemo(() => {
    if (!items || items.length === 0) return []
    return showAll ? items : items.slice(0, 50)
  }, [items, showAll])
  
  const hasMore = items ? items.length > 50 : false

  // Also group displayItems
  const groupedDisplayItems = useMemo(() => {
    if (!displayItems || displayItems.length === 0) return {}
    const groups: Record<string, LeadEvent[]> = {}
    displayItems.forEach((item) => {
      const date = new Date(item.created_at)
      const dateKey = format(date, "yyyy-MM-dd", { locale: ro })
      if (!groups[dateKey]) {
        groups[dateKey] = []
      }
      groups[dateKey].push(item)
    })
    return groups
  }, [displayItems])

  const sortedDates = useMemo(() => {
    return Object.keys(groupedDisplayItems).sort((a, b) => b.localeCompare(a))
  }, [groupedDisplayItems])

  // Conditional returns after all hooks
  if (loading) return <div className="p-4 text-sm text-muted-foreground">Se încarcă istoricul…</div>
  if (error) return <div className="p-4 text-sm text-destructive">{error}</div>
  if (!items || items.length === 0) return <div className="p-4 text-sm text-muted-foreground">Nu există evenimente încă.</div>

  return (
    <div className="flex flex-col h-full space-y-4">
      {hasMore && !showAll && (
        <div className="p-4 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/20 dark:to-indigo-950/20 rounded-lg border border-blue-200 dark:border-blue-800 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-blue-900 dark:text-blue-100 mb-1">
                Se afișează {displayItems.length} din {items.length} evenimente
              </div>
              <div className="text-xs text-blue-700 dark:text-blue-300">
                Apasă pentru a vedea toate evenimentele
              </div>
            </div>
            <button
              onClick={() => setShowAll(true)}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors"
            >
              Afișează toate ({items.length})
            </button>
          </div>
        </div>
      )}
      
      <div className="flex-1 overflow-y-auto space-y-6 min-h-0">
        {sortedDates.map((dateKey) => {
          const dateEvents = groupedDisplayItems[dateKey]
          const date = new Date(dateKey)
          const dateLabel = isToday(date) 
            ? "Astăzi" 
            : isYesterday(date) 
            ? "Ieri" 
            : format(date, "EEEE, d MMMM yyyy", { locale: ro })
          
          return (
            <div key={dateKey} className="space-y-3">
              <div className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b border-border pb-2">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-muted-foreground" />
                  <h3 className="text-sm font-semibold text-foreground">{dateLabel}</h3>
                  <span className="text-xs text-muted-foreground">({dateEvents.length})</span>
                </div>
              </div>
              
              <div className="space-y-3 pl-4 border-l-2 border-muted">
                {dateEvents.map((ev) => (
                  <div 
                    key={ev.id} 
                    className="group relative rounded-lg border bg-card hover:border-primary/50 hover:shadow-md transition-all duration-200 p-4"
                  >
                    <div className="flex items-start gap-3">
                      {/* Icon and vertical line */}
                      <div className="flex flex-col items-center pt-0.5">
                        <div className="rounded-full bg-muted p-2 group-hover:bg-primary/10 transition-colors">
                          <EventIcon eventType={ev.event_type} />
                        </div>
                        <div className="w-0.5 h-full bg-gradient-to-b from-muted to-transparent mt-2" />
                      </div>
                      
                      {/* Content */}
                      <div className="flex-1 min-w-0 space-y-2">
                        {/* Header */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs font-medium text-muted-foreground">
                                {formatEventTime(ev.created_at)}
                              </span>
                              <EventBadge eventType={ev.event_type} />
                            </div>
                            {ev.actor_name && (
                              <div className="flex items-center gap-1.5 mt-1">
                                <User className="w-3 h-3 text-muted-foreground" />
                                <span className="text-xs text-muted-foreground">
                                  {ev.actor_name}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                        
                        {/* Message */}
                        <div className="text-sm leading-relaxed text-foreground font-medium">
                          {ev.message}
                        </div>
                        
                        {/* Details */}
                        <div className="mt-3 space-y-2">
                          {ev.event_type === "service_sheet_save" && renderServiceSheetDetails(ev.payload as any)}
                          {ev.event_type === "service_file_created" && renderServiceFileCreatedDetails(ev.payload as any, ev.actor_name)}
                          {ev.event_type === "instrument_moved" && renderInstrumentMovedDetails(ev.payload as any)}
                          {ev.event_type === "technician_assigned" && renderTechnicianAssignedDetails(ev.payload as any, ev.event_type)}
                          {ev.event_type === "tray_passed" && renderTrayPassedDetails(ev.payload as any, ev.event_type)}
                          {ev.event_type === "tray_created" && renderTrayCreatedDetails(ev.payload as any, ev.event_type)}
                          {ev.event_type === "tray_stage_changed" && renderTrayStageChangedDetails(ev.payload as any, ev.event_type)}
                          {ev.event_type === "tray_moved_to_pipeline" && renderTrayPassedDetails(ev.payload as any, ev.event_type)}
                          {ev.event_type === "tray_items_split_to_technician" && renderTrayItemsSplitDetails(ev.payload as any)}
                          {ev.event_type === "tray_split_to_real" && renderTraySplitToRealDetails(ev.payload as any)}
                          {ev.event_type === "tray_item_added" && renderTrayItemAddedDetails(ev.payload as any)}
                          {ev.event_type === "tray_item_updated" && renderTrayItemUpdatedDetails(ev.payload as any)}
                          {ev.event_type === "tray_item_deleted" && renderTrayItemDeletedDetails(ev.payload as any)}
                          {ev.event_type === "lead_field_updated" && renderLeadFieldUpdatedDetails(ev.payload as any)}
                          {ev.event_type === "service_file_field_updated" && renderServiceFileFieldUpdatedDetails(ev.payload as any)}
                        </div>
                      </div>
                    </div>
        </div>
      ))}
              </div>
            </div>
          )
        })}
      </div>
      
      {showAll && hasMore && (
        <div className="p-4 bg-muted/30 rounded-lg border border-dashed text-center flex-shrink-0">
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <HistoryIcon className="w-4 h-4" />
            <span>Se afișează toate {items.length} evenimente</span>
          </div>
        </div>
      )}
    </div>
  )
}