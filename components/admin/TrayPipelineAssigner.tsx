"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Loader2, Search, Filter, CheckCircle, AlertCircle, Package, ArrowRight } from "lucide-react"
import { toast } from "sonner"
import { supabaseBrowser } from "@/lib/supabase/supabaseClient"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"

const supabase = supabaseBrowser()

interface Tray {
  id: string
  number: string
  size: string
  status: string
  service_file_id: string | null
  created_at: string
  service_file?: {
    id: string
    number: string
    lead?: {
      id: string
      full_name: string
    }
  }
}

interface Pipeline {
  id: string
  name: string
}

interface Stage {
  id: string
  name: string
  pipeline_id: string
}

export default function TrayPipelineAssigner() {
  const [loading, setLoading] = useState(false)
  const [searching, setSearching] = useState(false)
  const [assigning, setAssigning] = useState(false)
  const [trays, setTrays] = useState<Tray[]>([])
  const [pipelines, setPipelines] = useState<Pipeline[]>([])
  const [stages, setStages] = useState<Stage[]>([])
  const [selectedPipeline, setSelectedPipeline] = useState<string>("")
  const [selectedStage, setSelectedStage] = useState<string>("")
  const [selectedTrays, setSelectedTrays] = useState<Set<string>>(new Set())
  const [searchQuery, setSearchQuery] = useState("")
  const [filterServiceFile, setFilterServiceFile] = useState<string>("all") // "all", "with", "without"

  // Load pipelines on mount
  useEffect(() => {
    loadPipelines()
  }, [])

  // Load stages when pipeline is selected
  useEffect(() => {
    if (selectedPipeline) {
      loadStages(selectedPipeline)
    } else {
      setStages([])
      setSelectedStage("")
    }
  }, [selectedPipeline])

  async function loadPipelines() {
    try {
      const { data, error } = await supabase
        .from('pipelines')
        .select('id, name')
        .eq('is_active', true)
        .order('position')

      if (error) throw error
      setPipelines(data || [])
    } catch (error: any) {
      console.error('Error loading pipelines:', error)
      toast.error('Eroare la încărcarea pipeline-urilor')
    }
  }

  async function loadStages(pipelineId: string) {
    try {
      const { data, error } = await supabase
        .from('stages')
        .select('id, name, pipeline_id')
        .eq('pipeline_id', pipelineId)
        .eq('is_active', true)
        .order('position')

      if (error) throw error
      setStages(data || [])
      
      // Auto-select first stage if available
      if (data && data.length > 0 && !selectedStage) {
        setSelectedStage(data[0].id)
      }
    } catch (error: any) {
      console.error('Error loading stages:', error)
      toast.error('Eroare la încărcarea stage-urilor')
    }
  }

  async function findOrphanedTrays() {
    if (!searchQuery.trim()) {
      toast.error('Introdu un termen de căutare (număr tăviță, nume client, etc.)')
      return
    }

    setSearching(true)
    setSelectedTrays(new Set())
    
    try {
      // First, get all tray IDs that are in pipeline_items
      const { data: pipelineTrays, error: pipelineError } = await supabase
        .from('pipeline_items')
        .select('item_id')
        .eq('type', 'tray')

      if (pipelineError) throw pipelineError

      const pipelineTrayIds = new Set(pipelineTrays?.map(item => item.item_id) || [])

      // Search for trays that match the search query
      const searchTerm = `%${searchQuery}%`
      
      const { data: trayData, error: trayError } = await supabase
        .from('trays')
        .select(`
          id,
          number,
          size,
          status,
          service_file_id,
          created_at,
          service_file:service_files (
            id,
            number,
            lead:leads (
              id,
              full_name
            )
          )
        `)
        .or(`number.ilike.${searchTerm},service_file.lead.full_name.ilike.${searchTerm}`)
        .order('created_at', { ascending: false })
        .limit(50)

      if (trayError) throw trayError

      // Filter out trays that are already in pipeline_items
      const orphanedTrays = (trayData || []).filter(tray => !pipelineTrayIds.has(tray.id))

      // Apply additional filters
      let filteredTrays = orphanedTrays
      
      if (filterServiceFile === "with") {
        filteredTrays = filteredTrays.filter(tray => tray.service_file_id)
      } else if (filterServiceFile === "without") {
        filteredTrays = filteredTrays.filter(tray => !tray.service_file_id)
      }

      setTrays(filteredTrays)

      if (filteredTrays.length === 0) {
        toast.info('Nu s-au găsit tăvițe care să nu fie în pipeline_items')
      } else {
        toast.success(`S-au găsit ${filteredTrays.length} tăvițe care nu sunt în pipeline_items`)
      }
    } catch (error: any) {
      console.error('Error finding orphaned trays:', error)
      toast.error(`Eroare la căutare: ${error.message}`)
    } finally {
      setSearching(false)
    }
  }

  function toggleTraySelection(trayId: string) {
    const newSelected = new Set(selectedTrays)
    if (newSelected.has(trayId)) {
      newSelected.delete(trayId)
    } else {
      newSelected.add(trayId)
    }
    setSelectedTrays(newSelected)
  }

  function toggleSelectAll() {
    if (selectedTrays.size === trays.length) {
      // Deselect all
      setSelectedTrays(new Set())
    } else {
      // Select all
      const allIds = new Set(trays.map(tray => tray.id))
      setSelectedTrays(allIds)
    }
  }

  async function assignTraysToPipeline() {
    if (selectedTrays.size === 0) {
      toast.error('Selectează cel puțin o tăviță')
      return
    }

    if (!selectedPipeline || !selectedStage) {
      toast.error('Selectează un pipeline și un stage')
      return
    }

    setAssigning(true)
    
    try {
      const trayIds = Array.from(selectedTrays)
      const assignments = trayIds.map(trayId => ({
        type: 'tray' as const,
        item_id: trayId,
        pipeline_id: selectedPipeline,
        stage_id: selectedStage,
      }))

      const { data, error } = await supabase
        .from('pipeline_items')
        .insert(assignments)
        .select()

      if (error) throw error

      // Log to items_events
      const eventPromises = trayIds.map(trayId =>
        supabase.from('items_events').insert({
          type: 'tray',
          item_id: trayId,
          event_type: 'manual_pipeline_assignment',
          message: `Tăviță asignată manual în pipeline ${selectedPipeline}, stage ${selectedStage}`,
          event_details: {
            pipeline_id: selectedPipeline,
            stage_id: selectedStage,
            assigned_by: 'admin',
            assigned_at: new Date().toISOString()
          }
        })
      )

      await Promise.all(eventPromises)

      // Remove assigned trays from the list
      const remainingTrays = trays.filter(tray => !selectedTrays.has(tray.id))
      setTrays(remainingTrays)
      setSelectedTrays(new Set())

      toast.success(`${trayIds.length} tăvițe au fost asignate cu succes`)
    } catch (error: any) {
      console.error('Error assigning trays:', error)
      toast.error(`Eroare la asignare: ${error.message}`)
    } finally {
      setAssigning(false)
    }
  }

  const selectedPipelineName = pipelines.find(p => p.id === selectedPipeline)?.name || ""
  const selectedStageName = stages.find(s => s.id === selectedStage)?.name || ""

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Package className="h-5 w-5" />
          Asignare Tăvițe în Pipeline
        </CardTitle>
        <CardDescription>
          Găsește tăvițe care nu sunt în pipeline_items și le asignează în pipeline-uri și stage-uri
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Search Section */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Căutare Tăvițe</h3>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="md:col-span-2">
              <Input
                placeholder="Caută după număr tăviță sau nume client..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && findOrphanedTrays()}
              />
            </div>
            <div>
              <Select value={filterServiceFile} onValueChange={setFilterServiceFile}>
                <SelectTrigger>
                  <SelectValue placeholder="Filtrează după fișă" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toate tăvițele</SelectItem>
                  <SelectItem value="with">Cu fișă de serviciu</SelectItem>
                  <SelectItem value="without">Fără fișă de serviciu</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <Button 
            onClick={findOrphanedTrays} 
            disabled={searching || !searchQuery.trim()}
            className="w-full md:w-auto"
            data-button-id="searchOrphanedTraysButton"
            aria-label="Caută tăvițe care nu sunt în pipeline"
          >
            {searching ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Search className="h-4 w-4 mr-2" />}
            Caută Tăvițe
          </Button>
        </div>

        {/* Results Section */}
        {trays.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold">
                  Rezultate ({trays.length} tăvițe găsite)
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="select-all"
                  checked={selectedTrays.size === trays.length && trays.length > 0}
                  onCheckedChange={toggleSelectAll}
                />
                <Label htmlFor="select-all" className="text-sm cursor-pointer">
                  Selectează toate ({selectedTrays.size} selectate)
                </Label>
              </div>
            </div>

            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12"></TableHead>
                    <TableHead>Tăviță</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Fișă Serviciu</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Creată la</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {trays.map(tray => (
                    <TableRow key={tray.id} className={selectedTrays.has(tray.id) ? "bg-muted/50" : ""}>
                      <TableCell>
                        <Checkbox
                          checked={selectedTrays.has(tray.id)}
                          onCheckedChange={() => toggleTraySelection(tray.id)}
                        />
                      </TableCell>
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
                      <TableCell>
                        {tray.service_file ? (
                          <div className="text-sm">
                            #{tray.service_file.number}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">Fără fișă</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {tray.service_file?.lead ? (
                          <div className="text-sm truncate max-w-[150px]">
                            {tray.service_file.lead.full_name}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">N/A</span>
                        )}
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

        {/* Assignment Section */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Asignare în Pipeline</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="pipeline-select">Pipeline</Label>
              <Select value={selectedPipeline} onValueChange={setSelectedPipeline}>
                <SelectTrigger id="pipeline-select">
                  <SelectValue placeholder="Selectează pipeline" />
                </SelectTrigger>
                <SelectContent>
                  {pipelines.map(pipeline => (
                    <SelectItem key={pipeline.id} value={pipeline.id}>
                      {pipeline.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="stage-select">Stage</Label>
              <Select 
                value={selectedStage} 
                onValueChange={setSelectedStage}
                disabled={!selectedPipeline || stages.length === 0}
              >
                <SelectTrigger id="stage-select">
                  <SelectValue placeholder={stages.length === 0 ? "Selectează mai întâi pipeline" : "Selectează stage"} />
                </SelectTrigger>
                <SelectContent>
                  {stages.map(stage => (
                    <SelectItem key={stage.id} value={stage.id}>
                      {stage.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {selectedPipeline && selectedStage && (
            <div className="p-3 bg-muted/30 rounded-lg">
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle className="h-4 w-4 text-green-500" />
                <span>
                  Vei asigna <strong>{selectedTrays.size}</strong> tăvițe în pipeline-ul{' '}
                  <strong>{selectedPipelineName}</strong>, stage{' '}
                  <strong>{selectedStageName}</strong>
                </span>
              </div>
            </div>
          )}

          <Button
            onClick={assignTraysToPipeline}
            disabled={assigning || selectedTrays.size === 0 || !selectedPipeline || !selectedStage}
            className="w-full"
            size="lg"
            data-button-id="assignTraysToPipelineButton"
            aria-label={`Asignează ${selectedTrays.size} tăvițe în pipeline`}
          >
            {assigning ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Se asignează...
              </>
            ) : (
              <>
                <ArrowRight className="h-4 w-4 mr-2" />
                Asignează {selectedTrays.size} Tăvițe
              </>
            )}
          </Button>
        </div>

        {/* Info Section */}
        {trays.length === 0 && !searching && (
          <div className="p-6 text-center border rounded-lg bg-muted/30">
            <AlertCircle className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">
              Introduce un termen de căutare pentru a găsi tăvițe care nu sunt în pipeline_items.
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Tăvițele găsite aici nu au o intrare în tabelul pipeline_items.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
