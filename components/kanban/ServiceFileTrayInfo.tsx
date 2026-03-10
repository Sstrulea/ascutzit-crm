"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { CheckCircle2, Circle, Clock, Loader2, Scissors, Sparkles, Wrench, Building, Building2, XCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { fetchTrayInfoForServiceFile } from "@/lib/supabase/fetchTrayInfoForServiceFile"

/** O tăviță pe cardul fișei: număr, tehnician, departament */
export type TrayDisplayItem = {
  trayId?: string | null
  trayNumber: string | null
  technician: string | null
  department: string | null
  status?: 'in_lucru' | 'in_asteptare' | 'finalizare' | 'noua' | null
  executionTime?: string | null
  qcValidated?: boolean | null
}

/** Icon pentru departament (Saloane, Frizerii, Horeca, Reparatii) */
function getDepartmentIcon(departmentName: string) {
  const name = String(departmentName || '').toLowerCase()
  if (name.includes('saloane') || name.includes('salon')) return <Sparkles className="h-3.5 w-3.5 flex-shrink-0" />
  if (name.includes('frizeri') || name.includes('frizerie') || name.includes('barber')) return <Scissors className="h-3.5 w-3.5 flex-shrink-0" />
  if (name.includes('reparati') || name.includes('service')) return <Wrench className="h-3.5 w-3.5 flex-shrink-0" />
  if (name.includes('horeca') || name.includes('corporate') || name.includes('business')) return <Building className="h-3.5 w-3.5 flex-shrink-0" />
  return <Building2 className="h-3.5 w-3.5 flex-shrink-0" />
}

function getStatusColor(status: TrayDisplayItem['status'], qcValidated?: boolean | null) {
  if (status === 'finalizare') {
    if (qcValidated === true) return 'text-green-600'
    if (qcValidated === false) return 'text-red-600'
    return 'text-purple-600'
  }
  if (status === 'in_lucru') return 'text-red-600'
  if (status === 'in_asteptare') return 'text-yellow-600'
  if (status === 'noua') return 'text-blue-600'
  return 'text-muted-foreground'
}

interface ServiceFileTrayInfoProps {
  /** ID-ul fișei de serviciu – folosit pentru fetch direct când lipsesc datele din props */
  serviceFileId?: string | null
  trays?: TrayDisplayItem[]
  trayNumbers?: string[]
  technician?: string | null
  onDeassignTray?: (e: React.MouseEvent, trayId: string) => void
  unassigningTrayId?: string | null
  className?: string
}

/**
 * Afișează tăvițe, tehnician și icoană departament pe cardul fișei (Recepție).
 * Dacă nu primește date din props, încarcă singură de la Supabase când serviceFileId e setat.
 */
export function ServiceFileTrayInfo({
  serviceFileId,
  trays = [],
  trayNumbers = [],
  technician,
  onDeassignTray,
  unassigningTrayId,
  className,
}: ServiceFileTrayInfoProps) {
  const [fetched, setFetched] = useState<{
    trays: TrayDisplayItem[]
    trayNumbers: string[]
    technician: string | null
  } | null>(null)
  const [loading, setLoading] = useState(false)

  const hasFromProps =
    trays.length > 0 ||
    trayNumbers.length > 0 ||
    !!(technician && String(technician).trim())

  useEffect(() => {
    if (hasFromProps || !serviceFileId) return
    let cancelled = false
    setLoading(true)
    fetchTrayInfoForServiceFile(serviceFileId)
      .then((res) => {
        if (cancelled) return
        setFetched({
          trays: res.trays.map((t) => ({
            trayId: t.trayId,
            trayNumber: t.trayNumber,
            technician: t.technician,
            department: t.department,
            status: null,
            executionTime: null,
            qcValidated: null,
          })),
          trayNumbers: res.trayNumbers,
          technician: res.technician,
        })
      })
      .catch(() => {
        if (!cancelled) setFetched({ trays: [], trayNumbers: [], technician: null })
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [serviceFileId, hasFromProps])

  const items: TrayDisplayItem[] = []

  if (hasFromProps) {
    if (trays.length > 0) {
      items.push(
        ...trays.map((t) => ({
          trayId: t.trayId,
          trayNumber: t.trayNumber ?? '—',
          technician: t.technician,
          department: t.department,
          status: t.status,
          executionTime: t.executionTime,
          qcValidated: t.qcValidated,
        }))
      )
    } else if (trayNumbers.length > 0) {
      items.push(
        ...trayNumbers.map((num) => ({
          trayNumber: num ?? '—',
          technician: null as string | null,
          department: null as string | null,
          status: null as TrayDisplayItem['status'],
          trayId: null as string | null,
        }))
      )
    } else if (technician && String(technician).trim()) {
      items.push({
        trayNumber: null,
        technician: String(technician).trim(),
        department: null,
        status: null,
      })
    }
  } else if (fetched) {
    if (fetched.trays.length > 0) {
      items.push(
        ...fetched.trays.map((t) => ({
          trayId: t.trayId,
          trayNumber: t.trayNumber ?? '—',
          technician: t.technician,
          department: t.department,
          status: t.status ?? null,
          executionTime: t.executionTime ?? null,
          qcValidated: t.qcValidated ?? null,
        }))
      )
    } else if (fetched.trayNumbers.length > 0) {
      items.push(
        ...fetched.trayNumbers.map((num) => ({
          trayNumber: num ?? '—',
          technician: null as string | null,
          department: null as string | null,
          status: null as TrayDisplayItem['status'],
          trayId: null as string | null,
        }))
      )
    } else if (fetched.technician && String(fetched.technician).trim()) {
      items.push({
        trayNumber: null,
        technician: String(fetched.technician).trim(),
        department: null,
        status: null,
      })
    }
  }

  const showPlaceholder = !loading && items.length === 0

  return (
    <div className={cn('space-y-1.5 w-full', className)}>
      {loading && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin flex-shrink-0" />
          <span>Tăvițe / tehnician...</span>
        </div>
      )}
      {showPlaceholder && !loading && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="font-medium">—</span>
          <span>Tăvițe / tehnician: —</span>
        </div>
      )}
      {items.map((item, idx) => {
        const colorClass = getStatusColor(item.status, item.qcValidated)
        const trayLabel = item.trayNumber ? `#${item.trayNumber}` : '—'
        const hasTechnician = !!(item.technician && String(item.technician).trim())
        const hasDepartment = !!(item.department && String(item.department).trim())

        return (
          <div
            key={item.trayId ?? idx}
            className="flex items-center gap-2 flex-wrap text-xs"
          >
            <span className="font-medium text-muted-foreground flex-shrink-0">
              {trayLabel}
            </span>
            {item.status === 'finalizare' && (
              <CheckCircle2 className={cn('h-3.5 w-3.5 flex-shrink-0', colorClass)} />
            )}
            {(item.status === 'in_lucru' ||
              item.status === 'in_asteptare' ||
              item.status === 'noua' ||
              !item.status) && (
              <Circle
                className={cn(
                  'h-3.5 w-3.5 flex-shrink-0',
                  hasTechnician ? colorClass : 'text-muted-foreground'
                )}
              />
            )}
            {hasTechnician && (
              <span
                className={cn(
                  'font-semibold',
                  hasTechnician ? colorClass : 'text-muted-foreground'
                )}
              >
                {item.technician}
              </span>
            )}
            {hasDepartment && (
              <span
                className={cn('flex-shrink-0', colorClass)}
                title={item.department ?? undefined}
              >
                {getDepartmentIcon(item.department!)}
              </span>
            )}
            {item.executionTime && (
              <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <Clock className="h-3 w-3" />
                {item.executionTime}
              </span>
            )}
            {item.trayId && onDeassignTray && (
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5 min-w-5 flex-shrink-0 rounded-full p-0 opacity-70 hover:opacity-100 hover:bg-destructive/10"
                onClick={(e) => {
                  e.stopPropagation()
                  onDeassignTray?.(e, item.trayId!)
                }}
                title="Dezatribuie tehnicianul de la tăviță"
                disabled={unassigningTrayId === item.trayId}
                aria-label="Dezatribuie tehnician"
              >
                {unassigningTrayId === item.trayId ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <XCircle className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                )}
              </Button>
            )}
          </div>
        )
      })}
    </div>
  )
}
