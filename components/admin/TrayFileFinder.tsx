"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Loader2, Search, FileText, User, Package, AlertCircle, CheckCircle, Trash2 } from "lucide-react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { toast } from "sonner"
import { supabaseBrowser } from "@/lib/supabase/supabaseClient"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"

const supabase = supabaseBrowser()

interface Tray {
  id: string
  number: string
  status: string
  service_file_id: string | null
  created_at: string
}

interface ServiceFile {
  id: string
  number: string
  lead?: {
    id: string
    full_name: string
    email?: string
    phone_number?: string
  }
}

interface TrayWithDetails extends Tray {
  service_file?: ServiceFile
}

export default function TrayFileFinder() {
  const [loading, setLoading] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [trayId, setTrayId] = useState("")
  const [foundTray, setFoundTray] = useState<TrayWithDetails | null>(null)
  const [otherTraysInFile, setOtherTraysInFile] = useState<TrayWithDetails[]>([])
  const [searchHistory, setSearchHistory] = useState<string[]>([])
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)

  async function findTrayFile() {
    if (!trayId.trim()) {
      toast.error('Introdu ID-ul tăviței')
      return
    }

    setLoading(true)
    setFoundTray(null)
    setOtherTraysInFile([])

    try {
      // 1. Caută tăvița după ID
      const { data: trayData, error: trayError } = await supabase
        .from('trays')
        .select(`
          id,
          number,
          status,
          service_file_id,
          created_at,
          service_file:service_files (
            id,
            number,
            lead:leads (
              id,
              full_name,
              email,
              phone_number
            )
          )
        `)
        .eq('id', trayId.trim())
        .single()

      if (trayError) {
        if (trayError.code === 'PGRST116') {
          toast.error(`Tăvița cu ID ${trayId} nu a fost găsită`)
        } else {
          throw trayError
        }
        return
      }

      const tray = trayData as TrayWithDetails
      setFoundTray(tray)

      // Adaugă la istoricul de căutări
      if (!searchHistory.includes(trayId.trim())) {
        setSearchHistory(prev => [trayId.trim(), ...prev.slice(0, 4)])
      }

      // 2. Dacă tăvița are fișă de serviciu, caută toate tăvițele din aceeași fișă
      if (tray.service_file_id) {
        const { data: otherTraysData, error: otherTraysError } = await supabase
          .from('trays')
          .select(`
            id,
            number,
            status,
            service_file_id,
            created_at,
            service_file:service_files (
              id,
              number,
              lead:leads (
                id,
                full_name,
                email,
                phone_number
              )
            )
          `)
          .eq('service_file_id', tray.service_file_id)
          .neq('id', tray.id) // Excludem tăvița curentă
          .order('number')

        if (otherTraysError) {
          console.error('Error fetching other trays:', otherTraysError)
          toast.error('Eroare la încărcarea altor tăvițe din fișă')
        } else {
          setOtherTraysInFile(otherTraysData as TrayWithDetails[] || [])
        }
      }

      toast.success(`Tăvița #${tray.number} găsită`)
    } catch (error: any) {
      console.error('Error finding tray:', error)
      toast.error(`Eroare: ${error.message}`)
    } finally {
      setLoading(false)
    }
  }

  function handleSearchFromHistory(historyId: string) {
    setTrayId(historyId)
    // Așteaptă puțin pentru ca state-ul să se actualizeze, apoi execută căutarea
    setTimeout(() => findTrayFile(), 100)
  }

  async function deleteTray() {
    if (!foundTray) return

    setDeleting(true)
    
    try {
      // First, check if tray is in pipeline_items
      const { data: pipelineItems, error: pipelineError } = await supabase
        .from('pipeline_items')
        .select('id')
        .eq('item_id', foundTray.id)
        .eq('type', 'tray')

      if (pipelineError) throw pipelineError

      // Log to items_events before deletion
      await supabase
        .from('items_events')
        .insert({
          type: 'tray',
          item_id: foundTray.id,
          event_type: 'tray_deleted',
          message: `Tăvița #${foundTray.number} ștearsă manual`,
          event_details: {
            tray_id: foundTray.id,
            tray_number: foundTray.number,
            service_file_id: foundTray.service_file_id,
            deleted_by: 'admin',
            deleted_at: new Date().toISOString()
          }
        })

      // Delete from pipeline_items if exists
      if (pipelineItems && pipelineItems.length > 0) {
        const { error: deletePipelineError } = await supabase
          .from('pipeline_items')
          .delete()
          .eq('item_id', foundTray.id)
          .eq('type', 'tray')

        if (deletePipelineError) throw deletePipelineError
      }

      // Delete the tray
      const { error: deleteError } = await supabase
        .from('trays')
        .delete()
        .eq('id', foundTray.id)

      if (deleteError) throw deleteError

      toast.success(`Tăvița #${foundTray.number} a fost ștearsă`)
      setFoundTray(null)
      setOtherTraysInFile([])
      setDeleteDialogOpen(false)
    } catch (error: any) {
      console.error('Error deleting tray:', error)
      toast.error(`Eroare la ștergere: ${error.message}`)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Search className="h-5 w-5" />
          Căutare Fișă după ID Tăviță
        </CardTitle>
        <CardDescription>
          Introdu ID-ul tăviței pentru a găsi fișa de serviciu și lead-ul asociat
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Search Section */}
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="tray-id">ID Tăviță</Label>
            <div className="flex gap-2">
              <Input
                id="tray-id"
                placeholder="Introdu ID-ul tăviței (ex: 123e4567-e89b-12d3-a456-426614174000)"
                value={trayId}
                onChange={(e) => setTrayId(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && findTrayFile()}
                className="flex-1"
              />
              <Button 
                onClick={findTrayFile} 
                disabled={loading || !trayId.trim()}
              >
                {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Search className="h-4 w-4 mr-2" />}
                Caută
              </Button>
            </div>
          </div>

          {/* Search History */}
          {searchHistory.length > 0 && (
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">Istoric căutări:</Label>
              <div className="flex flex-wrap gap-2">
                {searchHistory.map((historyId) => (
                  <Button
                    key={historyId}
                    variant="outline"
                    size="sm"
                    onClick={() => handleSearchFromHistory(historyId)}
                    className="text-xs"
                  >
                    {historyId.slice(0, 8)}...
                  </Button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Results Section */}
        {foundTray && (
          <div className="space-y-6">
            {/* Tray Details */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Package className="h-4 w-4 text-muted-foreground" />
                  <h3 className="text-sm font-semibold">Detalii Tăviță</h3>
                </div>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setDeleteDialogOpen(true)}
                  className="h-8"
                >
                  <Trash2 className="h-3 w-3 mr-2" />
                  Șterge Tăvița
                </Button>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">ID:</span>
                    <code className="text-sm font-mono bg-muted px-2 py-1 rounded">
                      {foundTray.id}
                    </code>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Număr:</span>
                    <span className="text-sm font-medium">{foundTray.number}</span>
                  </div>
                </div>
                
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Status:</span>
                    <Badge variant={foundTray.status === 'active' ? 'default' : 'secondary'}>
                      {foundTray.status}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Creată la:</span>
                    <span className="text-sm">
                      {new Date(foundTray.created_at).toLocaleDateString('ro-RO')}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Are fișă:</span>
                    {foundTray.service_file_id ? (
                      <CheckCircle className="h-4 w-4 text-green-500" />
                    ) : (
                      <AlertCircle className="h-4 w-4 text-amber-500" />
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Service File Details */}
            {foundTray.service_file ? (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <h3 className="text-sm font-semibold">Fișă de Serviciu</h3>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">ID Fișă:</span>
                      <code className="text-sm font-mono bg-muted px-2 py-1 rounded">
                        {foundTray.service_file.id}
                      </code>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Număr Fișă:</span>
                      <span className="text-sm font-medium">#{foundTray.service_file.number}</span>
                    </div>
                  </div>
                  
                  {foundTray.service_file.lead && (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-semibold">Lead Asociat</span>
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground">Nume:</span>
                          <span className="text-sm font-medium">{foundTray.service_file.lead.full_name}</span>
                        </div>
                        {foundTray.service_file.lead.email && (
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-muted-foreground">Email:</span>
                            <span className="text-sm">{foundTray.service_file.lead.email}</span>
                          </div>
                        )}
                        {foundTray.service_file.lead.phone_number && (
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-muted-foreground">Telefon:</span>
                            <span className="text-sm">{foundTray.service_file.lead.phone_number}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="p-4 border rounded-lg bg-muted/30">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-amber-500" />
                  <span className="text-sm">Această tăviță nu are fișă de serviciu asociată</span>
                </div>
              </div>
            )}

            {/* Other Trays in Same File */}
            {otherTraysInFile.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Package className="h-4 w-4 text-muted-foreground" />
                  <h3 className="text-sm font-semibold">
                    Alte Tăvițe din Aceeași Fișă ({otherTraysInFile.length})
                  </h3>
                </div>
                
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Număr</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Creată la</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {otherTraysInFile.map(tray => (
                        <TableRow key={tray.id}>
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              <Package className="h-3 w-3 text-muted-foreground" />
                              {tray.number}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant={tray.status === 'active' ? 'default' : 'secondary'}>
                              {tray.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {new Date(tray.created_at).toLocaleDateString('ro-RO')}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Info Section */}
        {!foundTray && !loading && (
          <div className="p-6 text-center border rounded-lg bg-muted/30">
            <Search className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">
              Introdu ID-ul unei tăvițe pentru a găsi fișa de serviciu și lead-ul asociat
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Sistemul va afișa toate detaliile tăviței, fișa de serviciu și alte tăvițe din aceeași fișă
            </p>
          </div>
        )}
      </CardContent>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Șterge tăvița?</AlertDialogTitle>
            <AlertDialogDescription>
              Ești sigur că vrei să ștergi tăvița #{foundTray?.number}? 
              {foundTray?.service_file_id && (
                <span className="block mt-2 text-amber-600 font-medium">
                  ⚠️ Atenție: Această tăviță are fișă de serviciu asociată!
                </span>
              )}
              <span className="block mt-2">
                Această acțiune va șterge permanent tăvița și va elimina orice intrare din pipeline_items.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Anulează</AlertDialogCancel>
            <AlertDialogAction onClick={deleteTray} disabled={deleting}>
              {deleting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              {deleting ? "Se șterge..." : "Șterge"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}
