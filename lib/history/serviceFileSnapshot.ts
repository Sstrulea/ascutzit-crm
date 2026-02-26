'use client'

/**
 * Snapshot complet al fișei de serviciu la momentul "Salvează în Istoric".
 * Folosit pentru istoric vizualizabil (o singură înregistrare per apăsare).
 * Nu modifică fișa curentă – doar „fotografie” a stării.
 */

import { supabaseBrowser } from '@/lib/supabase/supabaseClient'
import type { V4SaveData, V4Instrument, V4SelectedService, V4Part } from '@/lib/history/vanzariViewV4Save'
import type { LeadQuoteItem } from '@/lib/types/preturi'
import type { LeadQuote } from '@/lib/types/preturi'
import type { TrayImage } from '@/lib/supabase/imageOperations'
import { URGENT_MARKUP_PCT } from '@/lib/types/preturi'

/** Tip client: Urgent / Urgente / Abonament / Fără abonament / Office direct / Curier Trimis / Retur */
export type SnapshotClientType =
  | 'urgent'
  | 'urgente'
  | 'abonament'
  | 'fara_abonament'
  | 'office_direct'
  | 'curier_trimis'
  | 'retur'

/** O linie instrument în snapshot: nr tăviță, nume instrument, serie, cantitate, articol, discount, NER, garanție, preț unitar, total linie */
export interface SnapshotInstrumentLine {
  trayNumber: string | null
  instrumentName: string
  serialNumbers: string[] | null
  quantity: number
  article?: string | null // ex: Pachet Ascuțire forfecuță cuticule
  cantServ?: number | null
  discountPct?: number | null
  unrepairedCount?: number | null
  garantie?: boolean
  unitPrice: number
  totalLine: number
}

/** Serviciu bifat + preț (ex: Pachet Ascuțire forfecuță cuticule – 29 lei) */
export interface SnapshotServiceLine {
  name: string
  price: number
  quantity: number
  discountPct?: number
  totalLine: number
}

/** Promoție/vânzare bifată (ex: Vânzare Forfecuță PROMO – 44 lei) */
export interface SnapshotPromoLine {
  name: string
  price: number
  quantity: number
  totalLine: number
}

/** Tăvițe: număr + count (ex: #24M, 3 tăvițe) */
export interface SnapshotTrayInfo {
  number: string
  count?: number
}

/** Imagine atașată (link sau referință) */
export interface SnapshotImageRef {
  trayId: string
  trayNumber: string | null
  url: string
  filename?: string | null
  createdAt?: string | null
}

export interface ServiceFileSnapshotPayload {
  /** Tip client (derivat din checkbox-uri) */
  clientType: SnapshotClientType[]
  /** Checkbox „Recepție Comandă” (status comanda) */
  receptieComanda: boolean
  /** Tăvițe (#24M etc. + număr tăvițe) */
  trays: SnapshotTrayInfo[]
  /** Toate instrumentele cu câmpurile cerute */
  instruments: SnapshotInstrumentLine[]
  /** S/N-uri introduse (lista sau text) */
  serialNumbers: string[]
  /** Serviciile bifate + prețuri */
  services: SnapshotServiceLine[]
  /** Promoții/vânzări bifate */
  promos: SnapshotPromoLine[]
  /** Total general comandă (lei) */
  totalGeneral: number
  /** Imagini atașate (Imagini Tăviță) */
  images: SnapshotImageRef[]
  /** Data și ora exactă când s-a apăsat Salvează în Istoric */
  savedAt: string
  /** Opțional: ID fișă curentă */
  serviceFileId?: string | null
  /** Opțional: numele tehnicianului / user care a salvat */
  savedByUserName?: string | null
  /** Opțional: client asociat (lead) */
  leadId?: string | null
  leadName?: string | null
}

export interface ServiceFileSnapshotRow {
  id: string
  service_file_id: string
  lead_id: string | null
  saved_at: string
  saved_by_user_id: string | null
  saved_by_name: string | null
  summary: string | null
  total_amount: number | null
  snapshot: ServiceFileSnapshotPayload
  created_at: string
}

const TABLE = 'service_file_snapshots'

/**
 * Construiește tipul client pentru snapshot din starea fișei.
 */
export function buildClientTypes(opts: {
  urgentAllServices: boolean
  subscriptionType: string
  officeDirect: boolean
  curierTrimis: boolean
  retur: boolean
}): SnapshotClientType[] {
  const types: SnapshotClientType[] = []
  if (opts.urgentAllServices) types.push('urgent')
  if (opts.subscriptionType === 'services' || opts.subscriptionType === 'both') types.push('abonament')
  else if (opts.subscriptionType === 'parts') types.push('abonament')
  if (!opts.subscriptionType || opts.subscriptionType === '') types.push('fara_abonament')
  if (opts.officeDirect) types.push('office_direct')
  if (opts.curierTrimis) types.push('curier_trimis')
  if (opts.retur) types.push('retur')
  return types
}

/**
 * Construiește payload-ul de snapshot din datele V4 (VanzariViewV4).
 */
export function buildSnapshotFromV4Data(
  v4Data: V4SaveData,
  context: {
    urgentAllServices: boolean
    subscriptionType: string
    officeDirect: boolean
    curierTrimis: boolean
    retur: boolean
    receptieComanda?: boolean
    serviceFileId?: string | null
    leadId?: string | null
    leadName?: string | null
    savedByUserName?: string | null
    trayImages?: TrayImage[]
    quotes?: LeadQuote[]
  }
): ServiceFileSnapshotPayload {
  const { instruments, services, parts, trays } = v4Data
  const trayById = new Map((trays || []).map((t) => [t.id, t]))

  const instrumentLines: SnapshotInstrumentLine[] = []
  const serialNumbers: string[] = []
  const serviceLines: SnapshotServiceLine[] = []
  const promos: SnapshotPromoLine[] = []
  let subtotal = 0

  instruments.forEach((inst: V4Instrument) => {
    const tid = (v4Data.instrumentTrayId || {})[inst.localId]
    const trayNumber =
      (context.quotes?.find((q) => q.id === tid)?.number ?? null) ||
      (tid ? (trayById.get(tid)?.number ?? null) : null) ||
      null
    const serials = inst.serialNumber
      ? inst.serialNumber.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean)
      : []
    serialNumbers.push(...serials)
    const instServices = (services || []).filter((s) => s.instrumentLocalId === inst.localId)
    const instParts = (parts || []).filter((p) => p.instrumentLocalId === inst.localId)
    let totalLine = 0
    const hasGarantie = inst.garantie ?? false
    instServices.forEach((s: V4SelectedService) => {
      const afterDiscount = hasGarantie ? 0 : s.basePrice * s.quantity * (1 - (s.discount || 0) / 100)
      totalLine += afterDiscount
      if (!hasGarantie) subtotal += afterDiscount
      serviceLines.push({
        name: s.serviceName,
        price: s.basePrice,
        quantity: s.quantity,
        discountPct: s.discount,
        totalLine: afterDiscount,
      })
    })
    instParts.forEach((p: V4Part) => {
      const lineTotal = hasGarantie ? 0 : p.unitPrice * p.quantity
      totalLine += lineTotal
      if (!hasGarantie) subtotal += lineTotal
      serviceLines.push({
        name: p.name,
        price: p.unitPrice,
        quantity: p.quantity,
        totalLine: lineTotal,
      })
    })
    const unitPrice = inst.quantity > 0 ? totalLine / inst.quantity : 0
    instrumentLines.push({
      trayNumber: trayNumber ?? null,
      instrumentName: inst.name,
      serialNumbers: serials.length ? serials : null,
      quantity: inst.quantity,
      discountPct: inst.discount ?? null,
      garantie: hasGarantie,
      unitPrice,
      totalLine,
    })
  })

  const trayInfos: SnapshotTrayInfo[] = (trays || []).map((t) => ({
    number: t.number || '',
    count: 1,
  }))

  const urgentMarkup = context.urgentAllServices ? subtotal * (URGENT_MARKUP_PCT / 100) : 0
  const totalGeneral = subtotal + urgentMarkup

  const images: SnapshotImageRef[] = (context.trayImages || []).map((img) => ({
    trayId: img.tray_id,
    trayNumber: context.quotes?.find((q) => q.id === img.tray_id)?.number ?? null,
    url: img.url,
    filename: img.filename ?? null,
    createdAt: img.created_at ?? null,
  }))

  return {
    clientType: buildClientTypes({
      urgentAllServices: context.urgentAllServices,
      subscriptionType: context.subscriptionType,
      officeDirect: context.officeDirect,
      curierTrimis: context.curierTrimis,
      retur: context.retur,
    }),
    receptieComanda: context.receptieComanda ?? false,
    trays: trayInfos,
    instruments: instrumentLines,
    serialNumbers: [...new Set(serialNumbers)],
    services: serviceLines,
    promos,
    totalGeneral,
    images,
    savedAt: new Date().toISOString(),
    serviceFileId: context.serviceFileId ?? null,
    leadId: context.leadId ?? null,
    leadName: context.leadName ?? null,
    savedByUserName: context.savedByUserName ?? null,
  }
}

/**
 * Construiește un rezumat scurt pentru listă (ex: "3 forfecuțe cuticule – Pachet ascuțire – 87 lei").
 */
export function buildSnapshotSummary(payload: ServiceFileSnapshotPayload): string {
  const parts: string[] = []
  if (payload.instruments.length > 0) {
    const names = payload.instruments.slice(0, 3).map((i) => i.instrumentName)
    parts.push(names.join(', '))
  }
  if (payload.services.length > 0) {
    parts.push(payload.services.slice(0, 2).map((s) => s.name).join(' – '))
  }
  parts.push(`${payload.totalGeneral.toFixed(2)} lei`)
  return parts.join(' – ')
}

/**
 * Salvează snapshot-ul în tabelul service_file_snapshots.
 * Nu modifică fișa curentă.
 */
export async function saveServiceFileSnapshot(
  serviceFileId: string,
  payload: ServiceFileSnapshotPayload,
  opts?: {
    leadId?: string | null
    savedByUserId?: string | null
    savedByName?: string | null
  }
): Promise<{ id: string | null; error: Error | null }> {
  const supabase = supabaseBrowser()
  const summary = buildSnapshotSummary(payload)
  const row = {
    service_file_id: serviceFileId,
    lead_id: opts?.leadId ?? payload.leadId ?? null,
    saved_at: payload.savedAt,
    saved_by_user_id: opts?.savedByUserId ?? null,
    saved_by_name: opts?.savedByName ?? payload.savedByUserName ?? null,
    summary,
    total_amount: payload.totalGeneral,
    snapshot: payload as unknown as Record<string, unknown>,
  }
  const { data, error } = await supabase
    .from(TABLE)
    .insert(row as any)
    .select('id')
    .single()
  if (error) return { id: null, error }
  return { id: (data as any)?.id ?? null, error: null }
}

/**
 * Listează snapshot-urile pentru o fișă (pentru tab Istoric).
 */
export async function listServiceFileSnapshots(
  serviceFileId: string
): Promise<{ data: ServiceFileSnapshotRow[]; error: Error | null }> {
  const supabase = supabaseBrowser()
  const { data, error } = await supabase
    .from(TABLE)
    .select('id, service_file_id, lead_id, saved_at, saved_by_user_id, saved_by_name, summary, total_amount, snapshot, created_at')
    .eq('service_file_id', serviceFileId)
    .order('saved_at', { ascending: false })
  if (error) return { data: [], error }
  return { data: (data ?? []) as ServiceFileSnapshotRow[], error: null }
}
