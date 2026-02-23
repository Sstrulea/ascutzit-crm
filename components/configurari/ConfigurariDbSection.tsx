'use client'

import { useState, useEffect } from 'react'
import { Card } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area'
import { Loader2, Database, FileCode, Archive, Eye } from 'lucide-react'
import { toast } from 'sonner'

interface TableRowData {
  name: string
  count: number | null
  error?: string
}

interface ColumnInfo {
  name: string
  inferredType: string
  nonNullCount?: number | null
}

export function ConfigurariDbSection() {
  const [tables, setTables] = useState<TableRowData[]>([])
  const [loading, setLoading] = useState(true)
  const [backups, setBackups] = useState<Array<{ filename: string; path: string; size: number; created: string }>>([])
  const [backupsLoading, setBackupsLoading] = useState(false)
  const [tableDetailOpen, setTableDetailOpen] = useState(false)
  const [tableDetailName, setTableDetailName] = useState<string | null>(null)
  const [tableDetailColumns, setTableDetailColumns] = useState<ColumnInfo[]>([])
  const [tableDetailRows, setTableDetailRows] = useState<Record<string, unknown>[]>([])
  const [tableDetailTotalRows, setTableDetailTotalRows] = useState<number | null>(null)
  const [tableDetailLoading, setTableDetailLoading] = useState(false)
  const [tableDetailError, setTableDetailError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function fetchTables() {
      try {
        const res = await fetch('/api/owner/db/tables')
        const data = await res.json()
        if (!res.ok) {
          if (res.status === 403) toast.error('Acces interzis')
          return
        }
        if (!cancelled && data?.tables) setTables(data.tables)
      } catch (e) {
        if (!cancelled) toast.error('Eroare la încărcarea tabelelor')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    fetchTables()
    return () => { cancelled = true }
  }, [])

  async function loadBackups() {
    setBackupsLoading(true)
    try {
      const res = await fetch('/api/admin/backup')
      const data = await res.json()
      if (res.ok && Array.isArray(data?.backups)) {
        setBackups(data.backups.map((b: { filename: string; path: string; size: number; created: Date }) => ({
          filename: b.filename,
          path: b.path,
          size: b.size,
          created: b.created ? new Date(b.created).toISOString() : '',
        })))
      } else if (res.status === 403) {
        toast.error('Acces interzis. Doar owner.')
      }
    } catch {
      toast.error('Eroare la listarea backup-urilor')
    } finally {
      setBackupsLoading(false)
    }
  }

  function formatCount(n: number | null, error?: string): string {
    if (error) return '—'
    if (n === null) return '—'
    return n.toLocaleString('ro-RO')
  }

  async function openTableDetail(tableName: string) {
    setTableDetailName(tableName)
    setTableDetailOpen(true)
    setTableDetailError(null)
    setTableDetailColumns([])
    setTableDetailRows([])
    setTableDetailLoading(true)
    try {
      const res = await fetch(`/api/owner/db/table/${encodeURIComponent(tableName)}`)
      const data = await res.json()
      if (!res.ok) {
        setTableDetailError(data?.error ?? 'Eroare la încărcare')
        return
      }
      setTableDetailColumns(data.columns ?? [])
      setTableDetailRows(Array.isArray(data.rows) ? data.rows : [])
      setTableDetailTotalRows(typeof data.totalRows === 'number' ? data.totalRows : null)
    } catch {
      setTableDetailError('Eroare la încărcare')
    } finally {
      setTableDetailLoading(false)
    }
  }

  function formatCellValue(val: unknown): string {
    if (val === null || val === undefined) return '—'
    if (typeof val === 'object' && val !== null && typeof (val as { toISOString?: () => string }).toISOString === 'function') {
      return (val as { toISOString: () => string }).toISOString().slice(0, 19).replace('T', ' ')
    }
    const s = String(val)
    return s.length > 80 ? s.slice(0, 80) + '…' : s
  }

  return (
    <div className="space-y-6 p-6">
      {/* Tabele + count */}
      <Card className="p-0">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="font-semibold flex items-center gap-2">
            <Database className="h-4 w-4" />
            Tabele (schema public)
          </h2>
          {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </div>
        {loading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Se încarcă…</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tabel</TableHead>
                <TableHead className="w-32 text-right">Nr. rânduri</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tables.map((row) => (
                <TableRow key={row.name} className="group">
                  <TableCell className="font-mono text-sm">
                    <span className="flex items-center gap-2">
                      {row.name}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => openTableDetail(row.name)}
                        title="Vezi coloane și date"
                      >
                        <Eye className="h-3.5 w-3.5 mr-1" />
                        Vezi
                      </Button>
                    </span>
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {formatCount(row.count, row.error)}
                    {row.error && (
                      <span className="ml-1 text-xs text-destructive" title={row.error}>!</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      {/* Migrări */}
      <Card className="p-4">
        <h2 className="font-semibold flex items-center gap-2 mb-2">
          <FileCode className="h-4 w-4" />
          Migrări
        </h2>
        <p className="text-sm text-muted-foreground">
          Fișierele SQL din <code className="rounded bg-muted px-1">supabase/migrations</code> se aplică cu Supabase CLI:{' '}
          <code className="rounded bg-muted px-1">supabase db push</code> sau din Supabase Dashboard → SQL Editor.
          Nu rula migrări necunoscute direct pe producție.
        </p>
      </Card>

      {/* Backup */}
      <Card className="p-4">
        <h2 className="font-semibold flex items-center gap-2 mb-2">
          <Archive className="h-4 w-4" />
          Backup
        </h2>
        <p className="text-sm text-muted-foreground mb-3">
          Lista backup-urilor disponibile pe server. Crearea și descărcarea se face din aplicație (API-uri protejate pentru owner).
        </p>
        <Button variant="outline" size="sm" onClick={loadBackups} disabled={backupsLoading}>
          {backupsLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
          Listează backup-uri
        </Button>
        {backups.length > 0 && (
          <ul className="mt-3 space-y-1 text-sm">
            {backups.map((b) => (
              <li key={b.path} className="flex items-center gap-2">
                <span className="font-mono">{b.filename}</span>
                <span className="text-muted-foreground">{(b.size / 1024).toFixed(1)} KB</span>
                <a
                  href={`/api/admin/download-backup?path=${encodeURIComponent(b.path)}`}
                  className="text-primary hover:underline"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Descarcă
                </a>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Dialog detaliu tabel: coloane + date – mare, cu scroll */}
      <Dialog open={tableDetailOpen} onOpenChange={setTableDetailOpen}>
        <DialogContent
          className="flex flex-col w-[96vw] max-w-[1200px] h-[90vh] max-h-[90vh] p-4 sm:p-6 overflow-hidden"
          fullScreen={false}
        >
          <DialogHeader className="shrink-0">
            <DialogTitle className="font-mono">
              Tabel: {tableDetailName ?? '—'}
            </DialogTitle>
          </DialogHeader>
          {tableDetailLoading ? (
            <div className="flex items-center justify-center flex-1 min-h-[200px]">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : tableDetailError ? (
            <p className="text-destructive text-sm py-4">{tableDetailError}</p>
          ) : (
            <div className="flex flex-col gap-4 flex-1 min-h-0 overflow-hidden">
              {tableDetailTotalRows !== null && (
                <p className="text-sm text-muted-foreground shrink-0">
                  Total rânduri în tabel: <strong className="text-foreground">{tableDetailTotalRows.toLocaleString('ro-RO')}</strong>
                </p>
              )}
              <div className="flex flex-col min-h-0 shrink-0">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase mb-2 shrink-0">
                  Coloane – câte înregistrări au date în fiecare câmp
                </h3>
                {tableDetailColumns.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Tabel gol; coloanele nu pot fi deduse fără date.</p>
                ) : (
                  <ScrollArea className="border rounded-md h-[min(40vh,320px)]">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="font-mono text-xs">Coloană</TableHead>
                          <TableHead className="text-xs w-28">Tip</TableHead>
                          <TableHead className="text-xs text-right w-36">Înregistrări (cu date)</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {tableDetailColumns.map((col) => (
                          <TableRow key={col.name}>
                            <TableCell className="font-mono text-sm">{col.name}</TableCell>
                            <TableCell className="text-muted-foreground text-xs">{col.inferredType}</TableCell>
                            <TableCell className="text-right font-mono text-sm">
                              {col.nonNullCount != null
                                ? col.nonNullCount.toLocaleString('ro-RO')
                                : '—'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                )}
              </div>
              <div className="flex flex-col flex-1 min-h-0">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase mb-2 shrink-0">
                  Primele {tableDetailRows.length} rânduri (read-only)
                </h3>
                <ScrollArea className="border rounded-md flex-1 min-h-[180px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {tableDetailColumns.map((col) => (
                          <TableHead key={col.name} className="font-mono text-xs whitespace-nowrap">
                            {col.name}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {tableDetailRows.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={tableDetailColumns.length} className="text-muted-foreground text-sm text-center py-8">
                            Nu există rânduri.
                          </TableCell>
                        </TableRow>
                      ) : (
                        tableDetailRows.map((row, idx) => (
                          <TableRow key={idx}>
                            {tableDetailColumns.map((col) => (
                              <TableCell key={col.name} className="font-mono text-xs max-w-[200px] truncate" title={formatCellValue(row[col.name])}>
                                {formatCellValue(row[col.name])}
                              </TableCell>
                            ))}
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                  <ScrollBar orientation="horizontal" />
                </ScrollArea>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
