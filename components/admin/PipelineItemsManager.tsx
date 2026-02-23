"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Loader2, Search, Edit, Trash2, Save, X, Package, Filter, RefreshCw } from "lucide-react"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
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

const supabase = supabaseBrowser()

interface PipelineItem {
  id: string
  type: 'lead' | 'tray'
  item_id: string
  pipeline_id: string
  stage_id: string
  sort_order: number
  entered_stage_at: string
  created_at: string
  updated_at: string
  tray?: {
    id: string
    number: string
    size: string
    status: string
  }
  lead?: {
    id: string
    full_name: string
    email?: string
    phone_number?: string
  }
  pipeline?: {
    id: string
    name: string
  }
  stage?: {
    id: string
    name: string
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

export default function PipelineItemsManager() {
  const [loading, setLoading] = useState(false)
  const [searching, setSearching] = useState(false)
  const [pipelineItems, setPipelineItems] = useState<PipelineItem[]>([])
  const [pipelines, setPipelines] = useState<Pipeline[]>([])
  const [stages, setStages] = useState<Stage[]>([])
  const [selectedPipeline, setSelectedPipeline] = useState<string>("all")
  const [selectedType, setSelectedType] = useState<string>("all")
  const [searchQuery, setSearchQuery] = useState("")
  const [editingItem, setEditingItem] = useState<string | null>(null)
  const [editingValues, setEditingValues] = useState<{
    pipeline_id: string
    stage_id: string
    sort_order: number
    tray_number?: string
  }>({
    pipeline_id: "",
    stage_id: "",
    sort_order: 0
  })
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [itemToDelete, setItemToDelete] = useState<PipelineItem | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Load pipelines on mount
  useEffect(() => {
    loadPipelines()
  }, [])

  // Load stages when pipeline is selected
  useEffect(() => {
    if (selectedPipeline && selectedPipeline !== "all") {
      loadStages(selectedPipeline)
    } else {
      setStages([])
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
    } catch (error: any) {
      console.error('Error loading stages:', error)
      toast.error('Eroare la încărcarea stage-urilor')
    }
  }

  async function searchPipelineItems() {
    setSearching(true)
    
    try {
      let query = supabase
        .from('pipeline_items')
        .select(`
          id,
          type,
          item_id,
          pipeline_id,
          stage_id,
          sort_order,
          entered_stage_at,
          created_at,
          updated_at,
          tray:trays!pipeline_items_item_id_fkey(
            id,
            number,
            size,
            status
          ),
          lead:leads!pipeline_items_item_id_fkey(
            id,
            full_name,
            email,
            phone_number
          ),
          pipeline:pipelines!pipeline_items_pipeline_id_fkey(
            id,
            name
          ),
          stage:stages!pipeline_items_stage_id_fkey(
            id,
            name
          )
        `)
        .order('created_at', { ascending: false })
        .limit(100)

      // Apply filters
      if (selectedPipeline !== "all") {
        query = query.eq('pipeline_id', selectedPipeline)
      }
      
      if (selectedType !== "all") {
        query = query.eq('type', selectedType)
      }
      
      if (searchQuery.trim()) {
        const searchTerm = `%${searchQuery}%`
        query = query.or(`tray.number.ilike.${searchTerm},lead.full_name.ilike.${searchTerm}`)
      }

      const { data, error } = await query

      if (error) throw error
      setPipelineItems(data || [])
      
      if ((data || []).length === 0) {
        toast.info('Nu s-au găsit rezultate')
      } else {
        toast.success(`S-au găsit ${data?.length} intrări`)
      }
    } catch (error: any) {
      console.error('Error searching pipeline items:', error)
      toast.error(`Eroare la căutare: ${error.message}`)
    } finally {
      setSearching(false)
    }
  }

  function startEditing(item: PipelineItem) {
    setEditingItem(item.id)
    setEditingValues({
      pipeline_id: item.pipeline_id,
      stage_id: item.stage_id,
      sort_order: item.sort_order,
      tray_number: item.tray?.number
    })
  }

  function cancelEditing() {
    setEditingItem(null)
    setEditingValues({
      pipeline_id: "",
      stage_id: "",
      sort_order: 0
    })
  }

  async function saveEditing(itemId: string) {
    if (!editingValues.pipeline_id || !editingValues.stage_id) {
      toast.error('Pipeline și stage sunt obligatorii')
      return
    }

    try {
      // Update pipeline item
      const { error: updateError } = await supabase
        .from('pipeline_items')
        .update({
          pipeline_id: editingValues.pipeline_id,
          stage_id: editingValues.stage_id,
          sort_order: editingValues.sort_order,
          updated_at: new Date().toISOString()
        })
        .eq('id', itemId)

      if (updateError) throw updateError

      // Update tray number if changed
      const item = pipelineItems.find(i => i.id === itemId)
      if (item?.type === 'tray' && editingValues.tray_number && editingValues.tray_number !== item.tray?.number) {
        const { error: trayError } = await supabase
          .from('trays')
          .update({ number: editingValues.tray_number })
          .eq('id', item.item_id)

        if (trayError) throw trayError
      }

      // Log to items_events
      await supabase
        .from('items_events')
        .insert({
          type: item?.type || 'unknown',
          item_id: item?.item_id || '',
          event_type: 'pipeline_item_updated',
          message: `Intrare pipeline actualizată manual`,
          event_details: {
            pipeline_item_id: itemId,
            old_pipeline_id: item?.pipeline_id,
            new_pipeline_id: editingValues.pipeline_id,
            old_stage_id: item?.stage_id,
            new_stage_id: editingValues.stage_id,
            updated_by: 'admin'
          }
        })

      toast.success('Modificările au fost salvate')
      cancelEditing()
      searchPipelineItems() // Refresh the list
    } catch (error: any) {
      console.error('Error saving edits:', error)
      toast.error(`Eroare la salvare: ${error.message}`)
    }
  }

  async function deletePipelineItem() {
    if (!itemToDelete) return

    setDeleting(true)
    
    try {
      // First, log the deletion
      await supabase
        .from('items_events')
        .insert({
          type: itemToDelete.type,
          item_id: itemToDelete.item_id,
          event_type: 'pipeline_item_deleted',
          message: `Intrare pipeline ștearsă manual`,
          event_details: {
            pipeline_item_id: itemToDelete.id,
            pipeline_id: itemToDelete.pipeline_id,
            stage_id: itemToDelete.stage_id,
            deleted_by: 'admin'
          }
        })

      // Then delete the pipeline item
      const { error } = await supabase
        .from('pipeline_items')
        .delete()
        .eq('id', itemToDelete.id)

      if (error) throw error

      toast.success('Intrare pipeline ștearsă')
      setDeleteDialogOpen(false)
      setItemToDelete(null)
      searchPipelineItems() // Refresh the list
    } catch (error: any) {
      console.error('Error deleting pipeline item:', error)
      toast.error(`Eroare la ștergere: ${error.message}`)
    } finally {
      setDeleting(false)
    }
  }

  const filteredStages = stages.filter(stage => 
    !selectedPipeline || selectedPipeline === "all" || stage.pipeline_id === selectedPipeline
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Package className="h-5 w-5" />
          Management Intrări Pipeline
        </CardTitle>
        <CardDescription>
          Caută, editează și șterge intrări din pipeline_items. Poți edita și numărul tăviței.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Search Section */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Căutare și Filtrare</h3>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <Select value={selectedPipeline} onValueChange={setSelectedPipeline}>
                <SelectTrigger>
                  <SelectValue placeholder="Toate pipeline-urile" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toate pipeline-urile</SelectItem>
                  {pipelines.map(pipeline => (
                    <SelectItem key={pipeline.id} value={pipeline.id}>
                      {pipeline.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Select value={selectedType} onValueChange={setSelectedType}>
                <SelectTrigger>
                  <SelectValue placeholder="Toate tipurile" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toate tipurile</SelectItem>
                  <SelectItem value="tray">Tăvițe</SelectItem>
                  <SelectItem value="lead">Leads</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="md:col-span-2">
              <Input
                placeholder="Caută după număr tăviță sau nume lead..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && searchPipelineItems()}
              />
            </div>
          </div>
          
          <div className="flex gap-2">
            <Button 
              onClick={searchPipelineItems} 
              disabled={searching}
              className="flex-1"
              data-button-id="pipelineItemsSearchButton"
              aria-label="Caută intrări în pipeline"
            >
              {searching ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Search className="h-4 w-4 mr-2" />}
              Caută
            </Button>
            <Button 
              variant="outline"
              onClick={searchPipelineItems}
              disabled={searching}
              data-button-id="pipelineItemsRefreshButton"
              aria-label="Reîmprospătează lista de intrări"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Results Section */}
        {pipelineItems.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold">
                  Rezultate ({pipelineItems.length} intrări)
                </h3>
              </div>
            </div>

            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tip</TableHead>
                    <TableHead>Item</TableHead>
                    <TableHead>Pipeline</TableHead>
                    <TableHead>Stage</TableHead>
                    <TableHead>Sort Order</TableHead>
                    <TableHead>Creat la</TableHead>
                    <TableHead className="text-right">Acțiuni</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pipelineItems.map(item => (
                    <TableRow key={item.id}>
                      <TableCell>
                        <Badge variant={item.type === 'tray' ? 'default' : 'secondary'}>
                          {item.type}
                        </Badge>
                      </TableCell>
                      
                      <TableCell>
                        {item.type === 'tray' ? (
                          <div className="space-y-1">
                            <div className="font-medium">Tăviță #{item.tray?.number || 'N/A'}</div>
                            {editingItem === item.id ? (
                              <Input
                                value={editingValues.tray_number || ''}
                                onChange={(e) => setEditingValues(prev => ({
                                  ...prev,
                                  tray_number: e.target.value
                                }))}
                                placeholder="Număr tăviță"
                                className="h-7 text-xs"
                              />
                            ) : (
                              <div className="text-xs text-muted-foreground">
                                {item.tray?.status}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="space-y-1">
                            <div className="font-medium">{item.lead?.full_name || 'N/A'}</div>
                            <div className="text-xs text-muted-foreground">
                              {item.lead?.email || item.lead?.phone_number || 'Fără contact'}
                            </div>
                          </div>
                        )}
                      </TableCell>
                      
                      <TableCell>
                        {editingItem === item.id ? (
                          <Select
                            value={editingValues.pipeline_id}
                            onValueChange={(value) => setEditingValues(prev => ({
                              ...prev,
                              pipeline_id: value,
                              stage_id: "" // Reset stage when pipeline changes
                            }))}
                          >
                            <SelectTrigger className="h-7 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {pipelines.map(pipeline => (
                                <SelectItem key={pipeline.id} value={pipeline.id}>
                                  {pipeline.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <div className="text-sm">{item.pipeline?.name || 'N/A'}</div>
                        )}
                      </TableCell>
                      
                      <TableCell>
                        {editingItem === item.id ? (
                          <Select
                            value={editingValues.stage_id}
                            onValueChange={(value) => setEditingValues(prev => ({
                              ...prev,
                              stage_id: value
                            }))}
                            disabled={!editingValues.pipeline_id}
                          >
                            <SelectTrigger className="h-7 text-xs">
                              <SelectValue placeholder={editingValues.pipeline_id ? "Selectează stage" : "Selectează mai întâi pipeline"} />
                            </SelectTrigger>
                            <SelectContent>
                              {filteredStages.map(stage => (
                                <SelectItem key={stage.id} value={stage.id}>
                                  {stage.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <div className="text-sm">{item.stage?.name || 'N/A'}</div>
                        )}
                      </TableCell>
                      
                      <TableCell>
                        {editingItem === item.id ? (
                          <Input
                            type="number"
                            value={editingValues.sort_order}
                            onChange={(e) => setEditingValues(prev => ({
                              ...prev,
                              sort_order: parseInt(e.target.value) || 0
                            }))}
                            className="h-7 text-xs w-20"
                          />
                        ) : (
                          <div className="text-sm">{item.sort_order}</div>
                        )}
                      </TableCell>
                      
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(item.created_at).toLocaleDateString('ro-RO')}
                      </TableCell>
                      
                      <TableCell className="text-right">
                        {editingItem === item.id ? (
                          <div className="flex justify-end gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={cancelEditing}
                              className="h-7"
                              data-button-id={`pipelineItemCancelEdit${item.id}Button`}
                              aria-label="Anulează editarea intrării"
                            >
                              <X className="h-3 w-3 mr-1" />
                              Anulează
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => saveEditing(item.id)}
                              className="h-7"
                              data-button-id={`pipelineItemSave${item.id}Button`}
                              aria-label="Salvează modificările intrării"
                            >
                              <Save className="h-3 w-3 mr-1" />
                              Salvează
                            </Button>
                          </div>
                        ) : (
                          <div className="flex justify-end gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => startEditing(item)}
                              className="h-7"
                              data-button-id={`pipelineItemEdit${item.id}Button`}
                              aria-label="Editează intrarea din pipeline"
                            >
                              <Edit className="h-3 w-3 mr-1" />
                              Editează
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => {
                                setItemToDelete(item)
                                setDeleteDialogOpen(true)
                              }}
                              className="h-7"
                              data-button-id={`pipelineItemDelete${item.id}Button`}
                              aria-label="Șterge intrarea din pipeline"
                            >
                              <Trash2 className="h-3 w-3 mr-1" />
                              Șterge
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        {/* Info Section */}
        {pipelineItems.length === 0 && !searching && (
          <div className="p-6 text-center border rounded-lg bg-muted/30">
            <Search className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">
              Folosește filtrele de mai sus pentru a căuta intrări în pipeline_items
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Poți căuta după număr tăviță, nume lead, pipeline sau tip
            </p>
          </div>
        )}
      </CardContent>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Șterge intrarea din pipeline?</AlertDialogTitle>
            <AlertDialogDescription>
              Ești sigur că vrei să ștergi această intrare? Această acțiune va elimina item-ul din pipeline, dar nu va șterge item-ul însuși (tăvița sau lead-ul).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              data-button-id="pipelineItemDeleteDialogCancelButton"
            >
              Anulează
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={deletePipelineItem} 
              disabled={deleting}
              data-button-id="pipelineItemDeleteDialogConfirmButton"
            >
              {deleting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              {deleting ? "Se șterge..." : "Șterge"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}
                           