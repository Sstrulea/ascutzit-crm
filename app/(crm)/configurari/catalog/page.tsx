'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useRole } from '@/lib/contexts/AuthContext'
import { supabaseBrowser } from '@/lib/supabase/supabaseClient'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Checkbox } from '@/components/ui/checkbox'
import { 
  Search, Plus, Trash2, Save, X, Loader2, Scissors, Wrench, 
  AlertTriangle, ExternalLink, Settings, Package, CheckCircle2
} from 'lucide-react'
import { toast } from 'sonner'

const supabase = supabaseBrowser()

// Tipuri
interface Instrument {
  id: string
  name: string
  department_id: string | null
  pipeline: string | null
  weight: number
  repairable?: boolean
  active?: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}

interface Service {
  id: string
  name: string
  price: number
  instrument_id: string | null
  department_id: string | null
  time: string | null
  active: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}

interface Department {
  id: string
  name: string
}

interface Pipeline {
  id: string
  name: string
}

type Mode = 'instrument' | 'service'

const isMissingColumnInSchemaCache = (err: any, column: string, table: string) => {
  const msg = String(err?.message || '')
  return (
    msg.includes(`'${column}'`) &&
    msg.toLowerCase().includes('schema cache') &&
    msg.toLowerCase().includes(`'${table}'`)
  )
}

// Iconuri pentru instrumente
const getInstrumentIcon = (name: string) => {
  const nameLower = name.toLowerCase()
  if (nameLower.includes('foarfec') || nameLower.includes('forfec')) return '✂️'
  if (nameLower.includes('cleste') || nameLower.includes('clește')) return '🔧'
  if (nameLower.includes('mandrin')) return '⚙️'
  if (nameLower.includes('brici')) return '🪒'
  if (nameLower.includes('penset')) return '🔬'
  if (nameLower.includes('pusher') || nameLower.includes('chiuret')) return '🔨'
  if (nameLower.includes('unitate')) return '🖥️'
  return '🔧'
}

export default function CatalogConfiguratorPage() {
  const { isOwner, role, loading: roleLoading } = useRole()
  const canManage = isOwner || role === 'admin'
  const [supportsRepairable, setSupportsRepairable] = useState(true)

  // State pentru mod
  const [mode, setMode] = useState<Mode>('instrument')

  // State pentru date
  const [instruments, setInstruments] = useState<Instrument[]>([])
  const [services, setServices] = useState<Service[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [pipelines, setPipelines] = useState<Pipeline[]>([])
  const [loading, setLoading] = useState(true)

  // State pentru selecție
  const [selectedInstrumentId, setSelectedInstrumentId] = useState<string | null>(null)
  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(null)

  // State pentru filtre
  const [searchQuery, setSearchQuery] = useState('')
  const [filterPipeline, setFilterPipeline] = useState<string>('all')
  const [filterActive, setFilterActive] = useState<string>('all')
  const [filterInstrument, setFilterInstrument] = useState<string>('all')
  const [filterService, setFilterService] = useState<string>('all')

  // State pentru toggle creator info
  const [showCreatorInfo, setShowCreatorInfo] = useState(true)

  // State pentru editare
  const [editingInstrument, setEditingInstrument] = useState<Instrument | null>(null)
  const [editingService, setEditingService] = useState<Service | null>(null)
  const [hasChanges, setHasChanges] = useState(false)
  const [saving, setSaving] = useState(false)

  // State pentru dialog-uri
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [showAddServiceModal, setShowAddServiceModal] = useState(false)
  const [showAssociateServiceModal, setShowAssociateServiceModal] = useState(false)
  const [showAddInstrumentModal, setShowAddInstrumentModal] = useState(false)
  const [newService, setNewService] = useState<Partial<Service>>({
    name: '',
    price: 0,
    time: '',
    active: true,
    instrument_id: null,
    department_id: null
  })
  const [newInstrument, setNewInstrument] = useState<Partial<Instrument>>({
    name: '',
    department_id: null,
    pipeline: null,
    weight: 0,
    repairable: true
  })
  const [selectedServicesToAssociate, setSelectedServicesToAssociate] = useState<string[]>([])
  const [associateSearchQuery, setAssociateSearchQuery] = useState('')
  const [showNonRepairableDialog, setShowNonRepairableDialog] = useState(false)

  // Încărcare date
  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      const [instrumentsRes, servicesRes, departmentsRes, pipelinesRes] = await Promise.all([
        supabase.from('instruments').select('*').order('name'),
        supabase.from('services').select('*').order('name'),
        supabase.from('departments').select('*').order('name'),
        supabase.from('pipelines').select('*').order('name')
      ])

      if (instrumentsRes.error) {
        console.error('Eroare instruments:', instrumentsRes.error)
        throw new Error(`Instruments: ${instrumentsRes.error.message}`)
      }
      if (servicesRes.error) {
        console.error('Eroare services:', servicesRes.error)
        throw new Error(`Services: ${servicesRes.error.message}`)
      }
      if (departmentsRes.error) {
        console.error('Eroare departments:', departmentsRes.error)
        console.error('Detalii RLS departments:', {
          code: departmentsRes.error.code,
          message: departmentsRes.error.message,
          details: departmentsRes.error.details,
          hint: departmentsRes.error.hint
        })
        throw new Error(`Departments (RLS?): ${departmentsRes.error.message}`)
      }
      if (pipelinesRes.error) {
        console.error('Eroare pipelines:', pipelinesRes.error)
        throw new Error(`Pipelines: ${pipelinesRes.error.message}`)
      }

      setInstruments(instrumentsRes.data || [])
      setServices(servicesRes.data || [])
      setDepartments(departmentsRes.data || [])
      setPipelines(pipelinesRes.data || [])
      
      // Debug: verifică dacă departments s-au încărcat
      if (!(departmentsRes.data && departmentsRes.data.length > 0)) {
        console.warn('ATENȚIE: Nu s-au încărcat departamente! Verifică RLS policies pentru tabelul departments.')
      }
    } catch (error: any) {
      console.error('Eroare completă la încărcare:', error)
      toast.error(`Eroare la încărcare: ${error.message}`)
    } finally {
      setLoading(false)
    }
  }

  // Filtrare instrumente
  const filteredInstruments = useMemo(() => {
    return instruments.filter(inst => {
      const matchesSearch = inst.name.toLowerCase().includes(searchQuery.toLowerCase())
      const matchesPipeline = filterPipeline === 'all' || inst.pipeline === filterPipeline
      // Filtru după serviciu - verifică dacă instrumentul are serviciul selectat asociat
      let matchesService = filterService === 'all'
      if (!matchesService) {
        // FOLOSIM FOR LOOP ÎN LOC DE .some() - MAI SIGUR
        const servicesArray = Array.isArray(services) ? services : []
        let hasService = false
        if (inst && inst.id) {
          for (let i = 0; i < servicesArray.length; i++) {
            const svc = servicesArray[i]
            if (svc && svc.instrument_id === inst.id && svc.id === filterService) {
              hasService = true
              break
            }
          }
        }
        matchesService = hasService
      }
      return matchesSearch && matchesPipeline && matchesService
    })
  }, [instruments, services, searchQuery, filterPipeline, filterService])

  // Separă instrumente în active și inactive
  const activeInstruments = useMemo(() => {
    return filteredInstruments.filter(inst => inst.active !== false)
  }, [filteredInstruments])

  const inactiveInstruments = useMemo(() => {
    return filteredInstruments.filter(inst => inst.active === false)
  }, [filteredInstruments])

  // Filtrare servicii (bazat pe pipeline-ul instrumentului asociat)
  const filteredServices = useMemo(() => {
    return services.filter(svc => {
      const matchesSearch = svc.name.toLowerCase().includes(searchQuery.toLowerCase())
      // Găsește pipeline-ul prin instrumentul asociat
      let matchesPipeline = filterPipeline === 'all'
      if (!matchesPipeline && svc.instrument_id) {
        const inst = instruments.find(i => i.id === svc.instrument_id)
        matchesPipeline = inst?.pipeline === filterPipeline
      }
      // Filtru după instrument
      const matchesInstrument = filterInstrument === 'all' || svc.instrument_id === filterInstrument
      const matchesActive = filterActive === 'all' || 
        (filterActive === 'active' && svc.active) || 
        (filterActive === 'inactive' && !svc.active)
      return matchesSearch && matchesPipeline && matchesInstrument && matchesActive
    })
  }, [services, instruments, searchQuery, filterPipeline, filterActive, filterInstrument])

  // Servicii pentru instrumentul selectat
  const servicesForSelectedInstrument = useMemo(() => {
    if (!selectedInstrumentId) return []
    return services.filter(svc => svc.instrument_id === selectedInstrumentId)
  }, [services, selectedInstrumentId])

  // Instrumente marcate ca „nu se pot repara” (listă aparte)
  const nonRepairableInstruments = useMemo(() => {
    if (!supportsRepairable) return []
    return instruments.filter(inst => inst.repairable === false)
  }, [instruments, supportsRepairable])

  // Număr de servicii per instrument (pentru afișare în listă)
  const serviceCountPerInstrument = useMemo(() => {
    const counts: Record<string, number> = {}
    services.forEach(svc => {
      if (svc.instrument_id) {
        counts[svc.instrument_id] = (counts[svc.instrument_id] || 0) + 1
      }
    })
    return counts
  }, [services])

  // Servicii neasociate (pentru modal de asociere)
  const unassociatedServices = useMemo(() => {
    let filtered = services.filter(svc => !svc.instrument_id)
    if (associateSearchQuery) {
      filtered = filtered.filter(svc => 
        svc.name.toLowerCase().includes(associateSearchQuery.toLowerCase())
      )
    }
    return filtered
  }, [services, associateSearchQuery])

  // Selectare instrument
  const handleSelectInstrument = (inst: Instrument) => {
    if (hasChanges) {
      if (!confirm('Ai modificări nesalvate. Ești sigur că vrei să schimbi selecția?')) {
        return
      }
    }
    setSelectedInstrumentId(inst.id)
    setEditingInstrument({ ...inst })
    setHasChanges(false)
  }

  // Selectare serviciu
  const handleSelectService = (svc: Service) => {
    if (hasChanges) {
      if (!confirm('Ai modificări nesalvate. Ești sigur că vrei să schimbi selecția?')) {
        return
      }
    }
    setSelectedServiceId(svc.id)
    setEditingService({ ...svc })
    setHasChanges(false)
  }

  // Modificare câmp instrument
  const handleInstrumentChange = (field: keyof Instrument, value: any) => {
    if (!editingInstrument) return
    setEditingInstrument({ ...editingInstrument, [field]: value })
    setHasChanges(true)
  }

  // Modificare câmp serviciu
  const handleServiceChange = (field: keyof Service, value: any) => {
    if (!editingService) return
    setEditingService({ ...editingService, [field]: value })
    setHasChanges(true)
  }

  // Salvare instrument
  const handleSaveInstrument = async () => {
    if (!editingInstrument) return
    setSaving(true)
    try {
      const { id, created_at, updated_at, ...updateData } = editingInstrument
      const updatePayload: any = { ...updateData, updated_at: new Date().toISOString() }
      if (!supportsRepairable) delete updatePayload.repairable

      let { error } = await supabase.from('instruments').update(updatePayload).eq('id', id)

      // Fallback pentru DB-uri fără coloana repairable
      if (error && isMissingColumnInSchemaCache(error, 'repairable', 'instruments')) {
        setSupportsRepairable(false)
        delete updatePayload.repairable
        ;({ error } = await supabase.from('instruments').update(updatePayload).eq('id', id))
      }

      if (error) throw error

      toast.success('Instrument salvat cu succes')
      setHasChanges(false)
      loadData()
    } catch (error: any) {
      toast.error(`Eroare la salvare: ${error.message}`)
    } finally {
      setSaving(false)
    }
  }

  // Salvare serviciu
  const handleSaveService = async () => {
    if (!editingService) return
    setSaving(true)
    try {
      const { id, created_at, updated_at, ...updateData } = editingService
      const { error } = await supabase
        .from('services')
        .update({ ...updateData, updated_at: new Date().toISOString() })
        .eq('id', id)

      if (error) throw error

      toast.success('Serviciu salvat cu succes')
      setHasChanges(false)
      loadData()
    } catch (error: any) {
      toast.error(`Eroare la salvare: ${error.message}`)
    } finally {
      setSaving(false)
    }
  }

  // Ștergere instrument
  const handleDeleteInstrument = async () => {
    if (!selectedInstrumentId) return
    try {
      const { error } = await supabase
        .from('instruments')
        .delete()
        .eq('id', selectedInstrumentId)

      if (error) throw error

      toast.success('Instrument șters cu succes')
      setShowDeleteDialog(false)
      setSelectedInstrumentId(null)
      setEditingInstrument(null)
      loadData()
    } catch (error: any) {
      toast.error(`Eroare la ștergere: ${error.message}`)
    }
  }

  // Ștergere serviciu
  const handleDeleteService = async () => {
    if (!selectedServiceId) return
    try {
      const { error } = await supabase
        .from('services')
        .delete()
        .eq('id', selectedServiceId)

      if (error) throw error

      toast.success('Serviciu șters cu succes')
      setShowDeleteDialog(false)
      setSelectedServiceId(null)
      setEditingService(null)
      loadData()
    } catch (error: any) {
      toast.error(`Eroare la ștergere: ${error.message}`)
    }
  }

  // Adaugă serviciu nou pentru instrument
  const handleAddNewService = async () => {
    if (!newService.name) {
      toast.error('Numele serviciului este obligatoriu')
      return
    }

    // Verifică permisiunile
    if (!canManage) {
      toast.error('Nu ai permisiunea de a adăuga servicii')
      return
    }

    setSaving(true)
    try {
      const instrument = selectedInstrumentId ? instruments.find(i => i.id === selectedInstrumentId) : null
      const { data: userData, error: authError } = await supabase.auth.getUser()

      if (authError) {
        console.error('Eroare autentificare:', authError)
        throw new Error(`Eroare autentificare: ${authError.message}`)
      }

      if (!userData?.user?.id) {
        throw new Error('Utilizatorul nu este autentificat')
      }

      // Verifică dacă instrumentul există dacă este specificat
      const finalInstrumentId = selectedInstrumentId || newService.instrument_id || null
      if (finalInstrumentId) {
        const instExists = instruments.find(i => i.id === finalInstrumentId)
        if (!instExists) {
          throw new Error(`Instrumentul selectat nu există în baza de date`)
        }
      }

      const serviceData = {
        name: newService.name.trim(),
        price: Number(newService.price) || 0,
        time: newService.time?.trim() || null,
        active: newService.active ?? true,
        instrument_id: finalInstrumentId,
        department_id: newService.department_id || instrument?.department_id || null,
        created_by: userData.user.id
      }


      const { data, error } = await supabase.from('services').insert(serviceData).select().single()

      if (error) {
        console.error('Eroare la inserare serviciu:', error)
        console.error('Detalii eroare:', {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint
        })
        
        // Mesaje de eroare mai clare
        if (error.code === '42501') {
          throw new Error('Nu ai permisiunea de a adăuga servicii. Verifică rolul tău în app_members.')
        } else if (error.code === '23503') {
          throw new Error('Instrumentul sau departamentul selectat nu există în baza de date.')
        } else if (error.code === '23505') {
          throw new Error('Un serviciu cu acest nume există deja pentru acest instrument.')
        }
        
        throw error
      }

      toast.success('Serviciu adăugat cu succes')
      setShowAddServiceModal(false)
      setNewService({ name: '', price: 0, time: '', active: true, department_id: null, instrument_id: null })
      await loadData()

      // Dacă suntem în modul serviciu și am creat un serviciu nou, selectează-l
      if (mode === 'service' && data) {
        setSelectedServiceId(data.id)
        setEditingService(data)
      }
    } catch (error: any) {
      console.error('Eroare completă la adăugare serviciu:', error)
      const errorMessage = error.message || 'Eroare necunoscută'
      const errorDetails = error.details ? ` (${error.details})` : ''
      const errorHint = error.hint ? ` Hint: ${error.hint}` : ''
      toast.error(`Eroare la adăugare: ${errorMessage}${errorDetails}${errorHint}`)
    } finally {
      setSaving(false)
    }
  }

  // Asociază servicii existente
  const handleAssociateServices = async () => {
    if (!selectedInstrumentId || selectedServicesToAssociate.length === 0) return
    setSaving(true)
    try {
      const instrument = instruments.find(i => i.id === selectedInstrumentId)
      
      const { error } = await supabase
        .from('services')
        .update({ 
          instrument_id: selectedInstrumentId,
          department_id: instrument?.department_id || null,
          updated_at: new Date().toISOString()
        })
        .in('id', selectedServicesToAssociate)

      if (error) throw error

      toast.success(`${selectedServicesToAssociate.length} servicii asociate cu succes`)
      setShowAssociateServiceModal(false)
      setSelectedServicesToAssociate([])
      loadData()
    } catch (error: any) {
      toast.error(`Eroare la asociere: ${error.message}`)
    } finally {
      setSaving(false)
    }
  }

  // Adaugă instrument nou
  const handleAddNewInstrument = async () => {
    if (!newInstrument.name) {
      toast.error('Numele instrumentului este obligatoriu')
      return
    }
    setSaving(true)
    try {
      const { data: userData } = await supabase.auth.getUser()

      const payload: any = {
        name: newInstrument.name,
        department_id: newInstrument.department_id || null,
        pipeline: newInstrument.pipeline || null,
        weight: newInstrument.weight || 0,
        created_by: userData?.user?.id || null
      }
      if (supportsRepairable) {
        payload.repairable = newInstrument.repairable !== false
      }

      let { data, error } = await supabase.from('instruments').insert(payload).select().single()

      // Fallback pentru DB-uri fără coloana repairable
      if (error && isMissingColumnInSchemaCache(error, 'repairable', 'instruments')) {
        setSupportsRepairable(false)
        delete payload.repairable
        ;({ data, error } = await supabase.from('instruments').insert(payload).select().single())
      }

      if (error) throw error

      toast.success('Instrument adăugat cu succes')
      setShowAddInstrumentModal(false)
      setNewInstrument({ name: '', department_id: null, pipeline: null, weight: 0, repairable: true })
      await loadData()
      
      // Selectează automat instrumentul nou creat
      if (data) {
        setSelectedInstrumentId(data.id)
        setEditingInstrument(data)
      }
    } catch (error: any) {
      toast.error(`Eroare la adăugare: ${error.message}`)
    } finally {
      setSaving(false)
    }
  }

  // Șterge serviciu (nu poate fi dezasociat deoarece instrument_id este NOT NULL)
  const handleRemoveServiceFromInstrument = async (serviceId: string) => {
    const service = services.find(s => s.id === serviceId)
    if (!service) return
    
    if (!confirm(`Ești sigur că vrei să ștergi serviciul "${service.name}"? Această acțiune este permanentă.`)) {
      return
    }
    
    try {
      const { error } = await supabase
        .from('services')
        .delete()
        .eq('id', serviceId)

      if (error) throw error

      toast.success('Serviciu șters cu succes')
      loadData()
    } catch (error: any) {
      toast.error(`Eroare: ${error.message}`)
    }
  }

  // State pentru editare servicii inline cu debounce
  const [editingServiceValues, setEditingServiceValues] = useState<Record<string, Record<string, any>>>({})
  const [saveTimeouts, setSaveTimeouts] = useState<Record<string, NodeJS.Timeout>>({})

  // Editare serviciu inline cu debounce
  const handleInlineServiceChange = (serviceId: string, field: string, value: any) => {
    // Update local state
    setEditingServiceValues(prev => ({
      ...prev,
      [serviceId]: {
        ...(prev[serviceId] || {}),
        [field]: value
      }
    }))

    // Clear previous timeout
    if (saveTimeouts[`${serviceId}-${field}`]) {
      clearTimeout(saveTimeouts[`${serviceId}-${field}`])
    }

    // Set new timeout para a salva după 800ms
    const timeoutId = setTimeout(() => {
      handleInlineServiceEdit(serviceId, field, value)
    }, 800)

    setSaveTimeouts(prev => ({
      ...prev,
      [`${serviceId}-${field}`]: timeoutId
    }))
  }

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      Object.values(saveTimeouts).forEach(timeout => clearTimeout(timeout))
    }
  }, [saveTimeouts])
  const handleInlineServiceEdit = async (serviceId: string, field: string, value: any) => {
    try {
      const { error } = await supabase
        .from('services')
        .update({ [field]: value, updated_at: new Date().toISOString() })
        .eq('id', serviceId)

      if (error) throw error

      toast.success('Serviciu actualizat')
      loadData()
    } catch (error: any) {
      toast.error(`Eroare: ${error.message}`)
    }
  }

  // Schimbare mod și selectare instrument din serviciu
  const handleNavigateToInstrument = (instrumentId: string) => {
    setMode('instrument')
    const instrument = instruments.find(i => i.id === instrumentId)
    if (instrument) {
      handleSelectInstrument(instrument)
    }
  }

  // Helper pentru nume departament
  const getDepartmentName = (departmentId: string | null) => {
    if (!departmentId) return '-'
    return departments.find(d => d.id === departmentId)?.name || '-'
  }

  // Helper pentru nume pipeline
  const getPipelineName = (pipelineId: string | null) => {
    if (!pipelineId) return '-'
    return pipelines.find(p => p.id === pipelineId)?.name || '-'
  }

  // Helper pentru nume instrument
  const getInstrumentName = (instrumentId: string | null) => {
    if (!instrumentId) return '-'
    return instruments.find(i => i.id === instrumentId)?.name || '-'
  }

  if (roleLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* Header */}
      <div className="border-b bg-background p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <Settings className="h-6 w-6" />
                Configurare Instrumente & Servicii
              </h1>
              <p className="text-sm text-muted-foreground">
                Gestionează catalogul de instrumente și servicii
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* Toggle mod */}
            <div className="flex rounded-lg border p-1 bg-muted">
              <Button
                variant={mode === 'instrument' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setMode('instrument')}
                className="gap-2"
              >
                <Wrench className="h-4 w-4" />
                Mod Instrument
              </Button>
              <Button
                variant={mode === 'service' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setMode('service')}
                className="gap-2"
              >
                <Package className="h-4 w-4" />
                Mod Serviciu
              </Button>
            </div>

            {/* Căutare globală */}
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={mode === 'instrument' ? 'Caută instrument...' : 'Caută serviciu...'}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Conținut principal */}
      <div className="flex flex-1 overflow-hidden">
        {/* Coloana stânga - Lista */}
        <div className="w-96 border-r flex flex-col h-full">
          {/* Filtre */}
          <div className="p-4 border-b space-y-3 flex-shrink-0">
            {/* Primul rând - Pipeline (comun pentru ambele moduri) */}
            <div className="flex gap-2">
              <Select value={filterPipeline} onValueChange={setFilterPipeline}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Pipeline" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toate pipeline-urile</SelectItem>
                  {pipelines
                    .filter(p => ['saloane', 'horeca', 'reparatii', 'frizerii'].includes(p.name.toLowerCase()))
                    .map(pipe => (
                      <SelectItem key={pipe.id} value={pipe.id}>{pipe.name}</SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            {/* Al doilea rând - Filtre specifice modului */}
            {mode === 'instrument' ? (
              <div className="flex gap-2">
                <Select value={filterService} onValueChange={setFilterService}>
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Serviciu" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Toate serviciile</SelectItem>
                    {services.map(svc => (
                      <SelectItem key={svc.id} value={svc.id}>
                        {svc.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="flex gap-2">
                <Select value={filterInstrument} onValueChange={setFilterInstrument}>
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Instrument" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Toate instrumentele</SelectItem>
                    {instruments.map(inst => (
                      <SelectItem key={inst.id} value={inst.id}>
                        {getInstrumentIcon(inst.name)} {inst.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={filterActive} onValueChange={setFilterActive}>
                  <SelectTrigger className="w-32">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Toate</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                {mode === 'instrument' 
                  ? `${filteredInstruments.length} instrumente` 
                  : `${filteredServices.length} servicii`}
              </span>
              {canManage && (
                mode === 'instrument' ? (
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setShowNonRepairableDialog(true)}
                      title="Instrumente marcate ca „nu se pot repara”"
                    >
                      <AlertTriangle className="h-3 w-3 mr-1" />
                      Nereparabile ({nonRepairableInstruments.length})
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setShowAddInstrumentModal(true)}>
                      <Plus className="h-3 w-3 mr-1" />
                      Adaugă
                    </Button>
                  </div>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => {
                    setSelectedInstrumentId(null)
                    setShowAddServiceModal(true)
                  }}>
                    <Plus className="h-3 w-3 mr-1" />
                    Adaugă
                  </Button>
                )
              )}
            </div>
          </div>

          {/* Lista cu scroll */}
          <div className="flex-1 overflow-hidden">
            <ScrollArea className="h-full">
              {loading ? (
                <div className="flex items-center justify-center h-64">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : mode === 'instrument' ? (
                filteredInstruments.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
                    <Wrench className="h-8 w-8 mb-2 opacity-50" />
                    <p className="text-sm">Nu există instrumente</p>
                    {canManage && (
                      <Button 
                        size="sm" 
                        variant="link" 
                        onClick={() => setShowAddInstrumentModal(true)}
                      >
                        Adaugă primul instrument
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Instrumente Active */}
                    {activeInstruments.length > 0 && (
                      <div>
                        <div className="px-3 py-2 sticky top-0 bg-background/95 border-b">
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                            Activ ({activeInstruments.length})
                          </p>
                        </div>
                        <div className="divide-y">
                          {activeInstruments.map(inst => (
                            <div
                              key={inst.id}
                              className={`p-3 cursor-pointer hover:bg-accent transition-colors ${
                                selectedInstrumentId === inst.id ? 'bg-accent border-l-2 border-l-primary' : ''
                              }`}
                              onClick={() => handleSelectInstrument(inst)}
                            >
                              <div className="flex items-center gap-3">
                                <span className="text-xl">{getInstrumentIcon(inst.name)}</span>
                                <div className="flex-1 min-w-0">
                                  <p className="font-medium truncate">{inst.name}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {getPipelineName(inst.pipeline)}
                                  </p>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  {supportsRepairable && inst.repairable === false && (
                                    <Badge variant="outline" className="text-xs text-amber-600 border-amber-300" title="Nu se poate repara">
                                      <AlertTriangle className="h-3 w-3 mr-0.5" />
                                    </Badge>
                                  )}
                                  <Badge variant="secondary" className="text-xs">
                                    {serviceCountPerInstrument[inst.id] || 0} svc
                                  </Badge>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Instrumente Inactive (Ascunse) */}
                    {inactiveInstruments.length > 0 && (
                      <div>
                        <div className="px-3 py-2 sticky top-0 bg-background/95 border-b bg-red-50/50 dark:bg-red-950/20">
                          <p className="text-xs font-semibold text-red-600 dark:text-red-400 uppercase tracking-wide">
                            🙈 Ascunse din selecție ({inactiveInstruments.length})
                          </p>
                        </div>
                        <div className="divide-y opacity-75">
                          {inactiveInstruments.map(inst => (
                            <div
                              key={inst.id}
                              className={`p-3 cursor-pointer hover:bg-accent/50 transition-colors ${
                                selectedInstrumentId === inst.id ? 'bg-accent border-l-2 border-l-primary' : ''
                              }`}
                              onClick={() => handleSelectInstrument(inst)}
                            >
                              <div className="flex items-center gap-3">
                                <span className="text-xl opacity-60">{getInstrumentIcon(inst.name)}</span>
                                <div className="flex-1 min-w-0">
                                  <p className="font-medium truncate line-through">{inst.name}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {getPipelineName(inst.pipeline)}
                                  </p>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <Badge variant="outline" className="text-xs text-red-600 border-red-300">Ascuns</Badge>
                                  {supportsRepairable && inst.repairable === false && (
                                    <Badge variant="outline" className="text-xs text-amber-600 border-amber-300" title="Nu se poate repara">
                                      <AlertTriangle className="h-3 w-3 mr-0.5" />
                                    </Badge>
                                  )}
                                  <Badge variant="secondary" className="text-xs">
                                    {serviceCountPerInstrument[inst.id] || 0} svc
                                  </Badge>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )
              ) : (
                filteredServices.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
                    <Package className="h-8 w-8 mb-2 opacity-50" />
                    <p className="text-sm">Nu există servicii</p>
                  </div>
                ) : (
                  <div className="divide-y">
                    {filteredServices.map(svc => (
                      <div
                        key={svc.id}
                        className={`p-3 cursor-pointer hover:bg-accent transition-colors ${
                          selectedServiceId === svc.id ? 'bg-accent border-l-2 border-l-primary' : ''
                        }`}
                        onClick={() => handleSelectService(svc)}
                      >
                        <div className="flex items-center gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="font-medium truncate">{svc.name}</p>
                              {!svc.active && (
                                <Badge variant="outline" className="text-xs">Inactiv</Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <span>{getInstrumentName(svc.instrument_id)}</span>
                              <span>•</span>
                              <span>{getPipelineName(instruments.find(i => i.id === svc.instrument_id)?.pipeline || null)}</span>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="font-medium">{svc.price.toFixed(2)} RON</p>
                            {svc.time && <p className="text-xs text-muted-foreground">{svc.time}</p>}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              )}
            </ScrollArea>
          </div>
        </div>

        {/* Panou dreapta - Detalii */}
        <div className="flex-1 overflow-hidden">
          {mode === 'instrument' ? (
            // MOD INSTRUMENT
            selectedInstrumentId && editingInstrument ? (
              <Tabs defaultValue="details" className="h-full flex flex-col">
                <div className="border-b px-4 pt-4">
                  <div className="flex items-center justify-between mb-4">
                    <TabsList>
                      <TabsTrigger value="details">Detalii instrument</TabsTrigger>
                      <TabsTrigger value="services">
                        Servicii asociate
                        <Badge variant="secondary" className="ml-2">
                          {servicesForSelectedInstrument.length}
                        </Badge>
                      </TabsTrigger>
                      <TabsTrigger value="extra">Date suplimentare</TabsTrigger>
                    </TabsList>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowCreatorInfo(!showCreatorInfo)}
                      className="text-xs"
                      title={showCreatorInfo ? "Ascunde informații creator" : "Arată informații creator"}
                    >
                      {showCreatorInfo ? "🙈 Ascunde creator" : "👁️ Arată creator"}
                    </Button>
                  </div>
                </div>

                <ScrollArea className="flex-1">
                  <TabsContent value="details" className="p-6 m-0">
                    <div className="grid grid-cols-2 gap-6 max-w-3xl">
                      {/* Coloana stânga */}
                      <div className="space-y-4">
                        <div>
                          <Label>Nume instrument</Label>
                          <Input
                            value={editingInstrument.name || ''}
                            onChange={(e) => handleInstrumentChange('name', e.target.value)}
                            disabled={!canManage}
                          />
                        </div>

                        <div>
                          <Label>Departament</Label>
                          <Select
                            value={editingInstrument.department_id || ''}
                            onValueChange={(v) => handleInstrumentChange('department_id', v || null)}
                            disabled={!canManage}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Selectează departament" />
                            </SelectTrigger>
                            <SelectContent>
                              {departments.map(dept => (
                                <SelectItem key={dept.id} value={dept.id}>{dept.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div>
                          <Label>Pipeline</Label>
                          <Select
                            value={editingInstrument.pipeline || ''}
                            onValueChange={(v) => handleInstrumentChange('pipeline', v || null)}
                            disabled={!canManage}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Selectează pipeline" />
                            </SelectTrigger>
                            <SelectContent>
                              {pipelines.map(pipe => (
                                <SelectItem key={pipe.id} value={pipe.id}>{pipe.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div>
                          <Label>Greutate (weight)</Label>
                          <Input
                            type="number"
                            value={editingInstrument.weight ?? 0}
                            onChange={(e) => handleInstrumentChange('weight', Number(e.target.value))}
                            disabled={!canManage}
                          />
                        </div>

                        <div className="flex items-center justify-between rounded-lg border p-4">
                          <div className="space-y-0.5">
                            <Label>Se poate repara</Label>
                            <p className="text-xs text-muted-foreground">
                              Dacă este dezactivat, instrumentul apare în lista „Instrumente nereparabile”.
                            </p>
                          </div>
                          {supportsRepairable ? (
                            <Switch
                              checked={editingInstrument.repairable !== false}
                              onCheckedChange={(checked) => handleInstrumentChange('repairable', checked)}
                              disabled={!canManage}
                            />
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              (indisponibil – lipsește coloana în DB)
                            </span>
                          )}
                        </div>

                        <div className="flex items-center justify-between rounded-lg border p-4 bg-blue-50 dark:bg-blue-950/20">
                          <div className="space-y-0.5">
                            <Label>Activ (Visible în introducere)</Label>
                            <p className="text-xs text-muted-foreground">
                              Dacă este dezactivat, instrumentul NU va apărea în selecție (Receptie, Vânzări, Department).
                            </p>
                          </div>
                          <Switch
                            checked={editingInstrument.active !== false}
                            onCheckedChange={(checked) => handleInstrumentChange('active', checked)}
                            disabled={!canManage}
                          />
                        </div>
                      </div>

                      {/* Coloana dreapta */}
                      <div className="space-y-4">
                        {showCreatorInfo && (
                          <>
                            <div>
                              <Label>Creat de</Label>
                              <Input
                                value={editingInstrument.created_by || '-'}
                                disabled
                                className="bg-muted"
                              />
                            </div>

                            <div>
                              <Label>Creat la</Label>
                              <Input
                                value={new Date(editingInstrument.created_at).toLocaleString('ro-RO')}
                                disabled
                                className="bg-muted"
                              />
                            </div>

                            <div>
                              <Label>Ultima actualizare</Label>
                              <Input
                                value={new Date(editingInstrument.updated_at).toLocaleString('ro-RO')}
                                disabled
                                className="bg-muted"
                              />
                            </div>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Butoane acțiuni */}
                    {canManage && (
                      <div className="mt-8 pt-6 border-t flex items-center justify-between max-w-3xl">
                        <div className="flex gap-2">
                          <Button onClick={handleSaveInstrument} disabled={!hasChanges || saving}>
                            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                            Salvează
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => {
                              const original = instruments.find(i => i.id === selectedInstrumentId)
                              if (original) setEditingInstrument({ ...original })
                              setHasChanges(false)
                            }}
                            disabled={!hasChanges}
                          >
                            Anulează
                          </Button>
                        </div>

                        <Button
                          variant="destructive"
                          onClick={() => setShowDeleteDialog(true)}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Șterge instrument
                        </Button>
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="services" className="p-6 m-0">
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="font-semibold">Servicii pentru acest instrument</h3>
                          <p className="text-sm text-muted-foreground">
                            Aceste servicii vor fi disponibile în tăvițele care folosesc acest instrument.
                          </p>
                        </div>
                        {canManage && (
                          <div className="flex gap-2">
                            <Button variant="outline" onClick={() => setShowAssociateServiceModal(true)}>
                              <ExternalLink className="h-4 w-4 mr-2" />
                              Asociază serviciu existent
                            </Button>
                            <Button onClick={() => setShowAddServiceModal(true)}>
                              <Plus className="h-4 w-4 mr-2" />
                              Adaugă serviciu nou
                            </Button>
                          </div>
                        )}
                      </div>

                      {/* Tabel servicii asociate */}
                      <ScrollArea className="border rounded-lg" style={{ height: '576px' }}>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Nume serviciu</TableHead>
                              <TableHead className="w-32">Preț (RON)</TableHead>
                              <TableHead className="w-28">Durată</TableHead>
                              <TableHead className="w-20">Activ</TableHead>
                              {canManage && <TableHead className="w-20">Acțiuni</TableHead>}
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {servicesForSelectedInstrument.length === 0 ? (
                              <TableRow>
                                <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                                  Nu există servicii asociate acestui instrument.
                                </TableCell>
                              </TableRow>
                            ) : (
                              servicesForSelectedInstrument.map(svc => (
                                <TableRow key={svc.id}>
                                  <TableCell className="font-medium">
                                    {canManage ? (
                                      <Input
                                        value={editingServiceValues[svc.id]?.name ?? svc.name ?? ''}
                                        onChange={(e) => handleInlineServiceChange(svc.id, 'name', e.target.value)}
                                        className="h-8"
                                      />
                                    ) : (
                                      svc.name
                                    )}
                                  </TableCell>
                                  <TableCell>
                                    {canManage ? (
                                      <Input
                                        type="number"
                                        value={editingServiceValues[svc.id]?.price ?? svc.price ?? 0}
                                        onChange={(e) => handleInlineServiceChange(svc.id, 'price', Number(e.target.value))}
                                        className="w-24 h-8"
                                      />
                                    ) : (
                                      (svc.price ?? 0).toFixed(2)
                                    )}
                                  </TableCell>
                                  <TableCell>
                                    {canManage ? (
                                      <Input
                                        value={editingServiceValues[svc.id]?.time ?? svc.time ?? ''}
                                        onChange={(e) => handleInlineServiceChange(svc.id, 'time', e.target.value || null)}
                                        className="w-24 h-8"
                                        placeholder="-"
                                      />
                                    ) : (
                                      svc.time || '-'
                                    )}
                                  </TableCell>
                                  <TableCell>
                                    {canManage ? (
                                      <Switch
                                        checked={svc.active}
                                        onCheckedChange={(checked) => handleInlineServiceEdit(svc.id, 'active', checked)}
                                      />
                                    ) : (
                                      <Badge variant={svc.active ? 'default' : 'secondary'}>
                                        {svc.active ? 'Da' : 'Nu'}
                                      </Badge>
                                    )}
                                  </TableCell>
                                  {canManage && (
                                    <TableCell>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => handleRemoveServiceFromInstrument(svc.id)}
                                        title="Șterge serviciul"
                                        className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30"
                                      >
                                        <X className="h-4 w-4" />
                                      </Button>
                                    </TableCell>
                                  )}
                                </TableRow>
                              ))
                            )}
                          </TableBody>
                        </Table>
                      </ScrollArea>
                    </div>
                  </TabsContent>

                  <TabsContent value="extra" className="p-6 m-0">
                    <div className="max-w-xl space-y-4">
                      <div>
                        <Label>Note tehnice</Label>
                        <Textarea
                          placeholder="Note sau observații despre acest instrument..."
                          rows={4}
                          disabled={!canManage}
                        />
                      </div>
                      <div>
                        <Label>Cod intern</Label>
                        <Input placeholder="Ex: INS-001" disabled={!canManage} />
                      </div>
                    </div>
                  </TabsContent>
                </ScrollArea>
              </Tabs>
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                <div className="text-center">
                  <Wrench className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Selectează un instrument din lista din stânga</p>
                </div>
              </div>
            )
          ) : (
            // MOD SERVICIU
            selectedServiceId && editingService ? (
              <Tabs defaultValue="details" className="h-full flex flex-col">
                <div className="border-b px-4 pt-4">
                  <div className="flex items-center justify-between mb-4">
                    <TabsList>
                      <TabsTrigger value="details">Detalii serviciu</TabsTrigger>
                      <TabsTrigger value="extra">Date suplimentare</TabsTrigger>
                    </TabsList>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowCreatorInfo(!showCreatorInfo)}
                      className="text-xs"
                      title={showCreatorInfo ? "Ascunde informații creator" : "Arată informații creator"}
                    >
                      {showCreatorInfo ? "🙈 Ascunde creator" : "👁️ Arată creator"}
                    </Button>
                  </div>
                </div>

                <ScrollArea className="flex-1">
                  <TabsContent value="details" className="p-6 m-0">
                    <div className="grid grid-cols-2 gap-6 max-w-3xl">
                      {/* Coloana stânga */}
                      <div className="space-y-4">
                        <div>
                          <Label>Nume serviciu</Label>
                          <Input
                            value={editingService.name || ''}
                            onChange={(e) => handleServiceChange('name', e.target.value)}
                            disabled={!canManage}
                          />
                        </div>

                        <div>
                          <Label>Instrument</Label>
                          <Select
                            value={editingService.instrument_id || '__none__'}
                            onValueChange={(v) => {
                              const newValue = v === '__none__' ? null : v
                              setEditingService((prev) => {
                                if (!prev) return prev
                                const next: Service = { ...prev, instrument_id: newValue }
                                if (newValue) {
                                  const inst = instruments.find((i) => i.id === newValue)
                                  if (inst) next.department_id = inst.department_id
                                }
                                return next
                              })
                              setHasChanges(true)
                            }}
                            disabled={!canManage}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Selectează instrument" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">Fără instrument</SelectItem>
                              {instruments.map(inst => (
                                <SelectItem key={inst.id} value={inst.id}>
                                  {getInstrumentIcon(inst.name)} {inst.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        {/* Card context instrument */}
                        {editingService.instrument_id && (
                          <Card className="bg-muted/50">
                            <CardContent className="p-3">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <span className="text-lg">
                                    {getInstrumentIcon(getInstrumentName(editingService.instrument_id))}
                                  </span>
                                  <div>
                                    <p className="font-medium text-sm">
                                      {getInstrumentName(editingService.instrument_id)}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                      {getDepartmentName(
                                        instruments.find(i => i.id === editingService.instrument_id)?.department_id || null
                                      )} • {getPipelineName(
                                        instruments.find(i => i.id === editingService.instrument_id)?.pipeline || null
                                      )}
                                    </p>
                                  </div>
                                </div>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleNavigateToInstrument(editingService.instrument_id!)}
                                >
                                  <ExternalLink className="h-4 w-4" />
                                </Button>
                              </div>
                            </CardContent>
                          </Card>
                        )}

                        <div>
                          <Label>Departament</Label>
                          <Select
                            value={editingService.department_id || ''}
                            onValueChange={(v) => handleServiceChange('department_id', v || null)}
                            disabled={!canManage}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Selectează departament" />
                            </SelectTrigger>
                            <SelectContent>
                              {departments.map(dept => (
                                <SelectItem key={dept.id} value={dept.id}>{dept.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      {/* Coloana dreapta */}
                      <div className="space-y-4">
                        <div>
                          <Label>Preț (RON)</Label>
                          <Input
                            type="number"
                            value={editingService.price ?? 0}
                            onChange={(e) => handleServiceChange('price', Number(e.target.value))}
                            disabled={!canManage}
                          />
                        </div>

                        <div>
                          <Label>Durată estimată</Label>
                          <Input
                            value={editingService.time || ''}
                            onChange={(e) => handleServiceChange('time', e.target.value || null)}
                            placeholder="Ex: 30 min"
                            disabled={!canManage}
                          />
                        </div>

                        <div className="flex items-center gap-3 pt-2">
                          <Switch
                            checked={editingService.active}
                            onCheckedChange={(checked) => handleServiceChange('active', checked)}
                            disabled={!canManage}
                          />
                          <Label>Serviciu activ</Label>
                        </div>

                        <div className="pt-4 space-y-2 text-sm text-muted-foreground">
                          <p>Creat la: {new Date(editingService.created_at).toLocaleString('ro-RO')}</p>
                          <p>Actualizat la: {new Date(editingService.updated_at).toLocaleString('ro-RO')}</p>
                        </div>
                      </div>
                    </div>

                    {/* Butoane acțiuni */}
                    {canManage && (
                      <div className="mt-8 pt-6 border-t flex items-center justify-between max-w-3xl">
                        <div className="flex gap-2">
                          <Button onClick={handleSaveService} disabled={!hasChanges || saving}>
                            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                            Salvează
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => {
                              const original = services.find(s => s.id === selectedServiceId)
                              if (original) setEditingService({ ...original })
                              setHasChanges(false)
                            }}
                            disabled={!hasChanges}
                          >
                            Anulează
                          </Button>
                        </div>

                        <Button
                          variant="destructive"
                          onClick={() => setShowDeleteDialog(true)}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Șterge serviciu
                        </Button>
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="extra" className="p-6 m-0">
                    <div className="max-w-xl space-y-4">
                      <div>
                        <Label>Descriere scurtă</Label>
                        <Textarea
                          placeholder="Descriere sau detalii despre serviciu..."
                          rows={4}
                          disabled={!canManage}
                        />
                      </div>
                      <div>
                        <Label>Tip abonament implicit</Label>
                        <Select disabled={!canManage}>
                          <SelectTrigger>
                            <SelectValue placeholder="Selectează tip" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Fără abonament</SelectItem>
                            <SelectItem value="services">Servicii (-10%)</SelectItem>
                            <SelectItem value="parts">Piese (-5%)</SelectItem>
                            <SelectItem value="both">Ambele</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {showCreatorInfo && (
                        <>
                          <div className="pt-4 border-t space-y-4">
                            <h4 className="font-semibold text-sm">Informații administrator</h4>
                            <div>
                              <Label>Creat de</Label>
                              <Input
                                value={editingService.created_by || '-'}
                                disabled
                                className="bg-muted"
                              />
                            </div>

                            <div>
                              <Label>Creat la</Label>
                              <Input
                                value={new Date(editingService.created_at).toLocaleString('ro-RO')}
                                disabled
                                className="bg-muted"
                              />
                            </div>

                            <div>
                              <Label>Ultima actualizare</Label>
                              <Input
                                value={new Date(editingService.updated_at).toLocaleString('ro-RO')}
                                disabled
                                className="bg-muted"
                              />
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  </TabsContent>
                </ScrollArea>
              </Tabs>
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                <div className="text-center">
                  <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Selectează un serviciu din lista din stânga</p>
                </div>
              </div>
            )
          )}
        </div>
      </div>

      {/* Dialog Ștergere */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Confirmă ștergerea
            </DialogTitle>
            <DialogDescription>
              {mode === 'instrument' 
                ? 'Ești sigur că vrei să ștergi acest instrument? Toate serviciile asociate vor rămâne fără instrument.'
                : 'Ești sigur că vrei să ștergi acest serviciu? Această acțiune nu poate fi anulată.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>
              Anulează
            </Button>
            <Button 
              variant="destructive" 
              onClick={mode === 'instrument' ? handleDeleteInstrument : handleDeleteService}
            >
              Șterge
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Adaugă serviciu nou */}
      <Dialog open={showAddServiceModal} onOpenChange={(open) => {
        setShowAddServiceModal(open)
        if (!open) setNewService({ name: '', price: 0, time: '', active: true, department_id: null })
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              Adaugă serviciu nou
            </DialogTitle>
            <DialogDescription>
              {selectedInstrumentId && editingInstrument 
                ? `Serviciul va fi asociat cu instrumentul "${editingInstrument.name}"`
                : 'Completează datele pentru noul serviciu'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>Nume serviciu *</Label>
              <Input
                value={newService.name || ''}
                onChange={(e) => setNewService({ ...newService, name: e.target.value })}
                placeholder="Ex: Ascuțire"
              />
            </div>
            
            {/* Afișează selectoarele doar dacă nu avem un instrument selectat */}
            {!selectedInstrumentId && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Instrument (opțional)</Label>
                  <Select
                    value={newService.instrument_id || '__none__'}
                    onValueChange={(v) => {
                      const newValue = v === '__none__' ? null : v
                      setNewService({ ...newService, instrument_id: newValue })
                      // Actualizează departamentul bazat pe instrument
                      if (newValue) {
                        const inst = instruments.find(i => i.id === newValue)
                        if (inst) {
                          setNewService(prev => ({ ...prev, instrument_id: newValue, department_id: inst.department_id }))
                        }
                      }
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Fără instrument" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Fără instrument</SelectItem>
                      {instruments.map(inst => (
                        <SelectItem key={inst.id} value={inst.id}>
                          {getInstrumentIcon(inst.name)} {inst.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Departament</Label>
                  <Select
                    value={newService.department_id || ''}
                    onValueChange={(v) => setNewService({ ...newService, department_id: v || null })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selectează" />
                    </SelectTrigger>
                    <SelectContent>
                      {departments.map(dept => (
                        <SelectItem key={dept.id} value={dept.id}>{dept.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Preț (RON)</Label>
                <Input
                  type="number"
                  value={newService.price ?? 0}
                  onChange={(e) => setNewService({ ...newService, price: Number(e.target.value) })}
                />
              </div>
              <div>
                <Label>Durată</Label>
                <Input
                  value={newService.time || ''}
                  onChange={(e) => setNewService({ ...newService, time: e.target.value })}
                  placeholder="Ex: 30 min"
                />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Switch
                checked={newService.active ?? true}
                onCheckedChange={(checked) => setNewService({ ...newService, active: checked })}
              />
              <Label>Serviciu activ</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setShowAddServiceModal(false)
              setNewService({ name: '', price: 0, time: '', active: true, department_id: null })
            }}>
              Anulează
            </Button>
            <Button onClick={handleAddNewService} disabled={!newService.name || saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              <Plus className="h-4 w-4 mr-2" />
              Adaugă serviciu
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Asociază servicii existente */}
      <Dialog open={showAssociateServiceModal} onOpenChange={(open) => {
        setShowAssociateServiceModal(open)
        if (!open) setAssociateSearchQuery('')
      }}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Asociază servicii existente</DialogTitle>
            <DialogDescription>
              Selectează serviciile pe care vrei să le asociezi cu {editingInstrument?.name}
            </DialogDescription>
          </DialogHeader>
          <div className="relative mb-2">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Caută serviciu..."
              value={associateSearchQuery}
              onChange={(e) => setAssociateSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <ScrollArea className="max-h-96">
            <div className="space-y-2 py-2">
              {unassociatedServices.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  {associateSearchQuery 
                    ? 'Nu s-au găsit servicii care să corespundă căutării.'
                    : 'Nu există servicii neasociate disponibile.'}
                </p>
              ) : (
                unassociatedServices.map(svc => (
                  <div
                    key={svc.id}
                    className="flex items-center gap-3 p-3 border rounded-lg hover:bg-accent cursor-pointer"
                    onClick={() => {
                      if (selectedServicesToAssociate.includes(svc.id)) {
                        setSelectedServicesToAssociate(prev => prev.filter(id => id !== svc.id))
                      } else {
                        setSelectedServicesToAssociate(prev => [...prev, svc.id])
                      }
                    }}
                  >
                    <Checkbox
                      checked={selectedServicesToAssociate.includes(svc.id)}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setSelectedServicesToAssociate(prev => [...prev, svc.id])
                        } else {
                          setSelectedServicesToAssociate(prev => prev.filter(id => id !== svc.id))
                        }
                      }}
                    />
                    <div className="flex-1">
                      <p className="font-medium">{svc.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {getDepartmentName(svc.department_id)} • {svc.price.toFixed(2)} RON
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setShowAssociateServiceModal(false)
              setSelectedServicesToAssociate([])
              setAssociateSearchQuery('')
            }}>
              Anulează
            </Button>
            <Button 
              onClick={handleAssociateServices} 
              disabled={selectedServicesToAssociate.length === 0 || saving}
            >
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Asociază selecția ({selectedServicesToAssociate.length})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Adaugă instrument nou */}
      <Dialog open={showAddInstrumentModal} onOpenChange={setShowAddInstrumentModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wrench className="h-5 w-5" />
              Adaugă instrument nou
            </DialogTitle>
            <DialogDescription>
              Completează datele pentru noul instrument
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>Nume instrument *</Label>
              <Input
                value={newInstrument.name || ''}
                onChange={(e) => setNewInstrument({ ...newInstrument, name: e.target.value })}
                placeholder="Ex: Forfecuță cuticule"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Departament</Label>
                <Select
                  value={newInstrument.department_id || ''}
                  onValueChange={(v) => setNewInstrument({ ...newInstrument, department_id: v || null })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selectează" />
                  </SelectTrigger>
                  <SelectContent>
                    {departments.map(dept => (
                      <SelectItem key={dept.id} value={dept.id}>{dept.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Pipeline</Label>
                <Select
                  value={newInstrument.pipeline || ''}
                  onValueChange={(v) => setNewInstrument({ ...newInstrument, pipeline: v || null })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selectează" />
                  </SelectTrigger>
                  <SelectContent>
                    {pipelines.map(pipe => (
                      <SelectItem key={pipe.id} value={pipe.id}>{pipe.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Greutate (weight)</Label>
              <Input
                type="number"
                value={newInstrument.weight ?? 0}
                onChange={(e) => setNewInstrument({ ...newInstrument, weight: Number(e.target.value) })}
                placeholder="0"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setShowAddInstrumentModal(false)
              setNewInstrument({ name: '', department_id: null, pipeline: null, weight: 0, repairable: true })
            }}>
              Anulează
            </Button>
            <Button onClick={handleAddNewInstrument} disabled={!newInstrument.name || saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              <Plus className="h-4 w-4 mr-2" />
              Adaugă instrument
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Listă instrumente nereparabile (selectate din tabelul instrumentelor) */}
      <Dialog open={showNonRepairableDialog} onOpenChange={setShowNonRepairableDialog}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
              Instrumente ce nu se pot repara
            </DialogTitle>
            <DialogDescription>
              Listă instrumente marcate ca „nu se poate repara”, selectate din catalogul de instrumente. Poți schimba setarea din detalii instrument.
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="flex-1 border rounded-lg min-h-[200px]">
            {nonRepairableInstruments.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <CheckCircle2 className="h-10 w-10 mb-2 text-green-500" />
                <p className="text-sm">Toate instrumentele sunt reparabile.</p>
                <p className="text-xs mt-1">Marchează „Se poate repara” = Nu în detalii instrument pentru a le adăuga aici.</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Instrument</TableHead>
                    <TableHead>Pipeline</TableHead>
                    <TableHead>Departament</TableHead>
                    <TableHead className="w-24">Servicii</TableHead>
                    <TableHead className="w-28">Acțiune</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {nonRepairableInstruments.map(inst => (
                    <TableRow key={inst.id}>
                      <TableCell className="font-medium">
                        <span className="mr-2">{getInstrumentIcon(inst.name)}</span>
                        {inst.name}
                      </TableCell>
                      <TableCell>{getPipelineName(inst.pipeline)}</TableCell>
                      <TableCell>{getDepartmentName(inst.department_id)}</TableCell>
                      <TableCell>{serviceCountPerInstrument[inst.id] || 0}</TableCell>
                      <TableCell>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setShowNonRepairableDialog(false)
                            handleSelectInstrument(inst)
                          }}
                        >
                          Deschide
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  )
}

