'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { 
  Edit, 
  Save, 
  X, 
  Clock, 
  DollarSign, 
  Package, 
  Wrench, 
  TrendingUp,
  Loader2,
  AlertCircle
} from 'lucide-react'
import { toast } from 'sonner'
import type { TechnicianStatistics } from '@/lib/supabase/technicianStatisticsTypes'

interface TechnicianStatsEditorProps {
  statistics: TechnicianStatistics
  onSave?: (updatedStats: Partial<TechnicianStatistics>) => Promise<void>
  isAdmin?: boolean
}

const EDITABLE_FIELDS = [
  { key: 'workTimeTotal', label: 'Timp lucru total', unit: 'minute', icon: Clock },
  { key: 'earningsTotal', label: 'Venituri totale', unit: 'RON', icon: DollarSign },
  { key: 'traysCount', label: 'Număr tăvițe', unit: 'bucăți', icon: Package },
  { key: 'instrumentsCount', label: 'Număr instrumente', unit: 'bucăți', icon: Wrench },
  { key: 'efficiencyRate', label: 'Eficiență', unit: '%', icon: TrendingUp },
  { key: 'averageTimePerService', label: 'Timp mediu/serviciu', unit: 'minute', icon: Clock },
  { key: 'waitingTimeTotal', label: 'Timp în așteptare', unit: 'minute', icon: Clock },
] as const

export function TechnicianStatsEditor({ statistics, onSave, isAdmin = false }: TechnicianStatsEditorProps) {
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [edits, setEdits] = useState<Record<string, any>>({})
  const [editReason, setEditReason] = useState('')

  if (!isAdmin) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5" />
            Permisiuni insuficiente
          </CardTitle>
          <CardDescription>
            Doar administratorii pot edita statisticile
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  const handleEdit = (field: string, value: any) => {
    setEdits(prev => ({
      ...prev,
      [field]: value
    }))
  }

  const handleSave = async () => {
    if (Object.keys(edits).length === 0) {
      toast.error('Nu există modificări de salvat')
      return
    }

    if (!editReason.trim()) {
      toast.error('Vă rugăm să specificați motivul modificării')
      return
    }

    setSaving(true)
    try {
      // Trimite modificările către server
      const response = await fetch('/api/technician-stats', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          technicianId: statistics.technicianId,
          edits,
          reason: editReason
        }),
      })

      const data = await response.json()

      if (!data.success) {
        throw new Error(data.error || 'Eroare la salvarea modificărilor')
      }

      // Notifică componenta părinte
      if (onSave) {
        await onSave(edits)
      }

      // Resetează starea
      setEdits({})
      setEditReason('')
      setEditing(false)

      toast.success('Modificările au fost salvate cu succes')
    } catch (error: any) {
      console.error('Error saving edits:', error)
      toast.error(error.message || 'Eroare la salvarea modificărilor')
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = () => {
    setEdits({})
    setEditReason('')
    setEditing(false)
  }

  const getFieldValue = (field: string) => {
    return edits[field] !== undefined ? edits[field] : (statistics as any)[field]
  }

  const hasChanges = Object.keys(edits).length > 0

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Editare Statistici</CardTitle>
            <CardDescription>
              {statistics.technicianName} • Ultima actualizare: {statistics.lastUpdated.toLocaleDateString('ro-RO')}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {!editing ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditing(true)}
                className="gap-2"
              >
                <Edit className="h-4 w-4" />
                Editează
              </Button>
            ) : (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCancel}
                  className="gap-2"
                  disabled={saving}
                >
                  <X className="h-4 w-4" />
                  Anulează
                </Button>
                <Button
                  size="sm"
                  onClick={handleSave}
                  disabled={saving || !hasChanges}
                  className="gap-2"
                >
                  {saving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  Salvează
                </Button>
              </div>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Motivul editării */}
        {editing && (
          <div className="space-y-2">
            <Label htmlFor="editReason">Motivul modificării *</Label>
            <Textarea
              id="editReason"
              placeholder="Specificați motivul pentru care modificați aceste statistici..."
              value={editReason}
              onChange={(e) => setEditReason(e.target.value)}
              rows={2}
            />
            <p className="text-xs text-muted-foreground">
              Toate modificările sunt înregistrate în istoric pentru audit
            </p>
          </div>
        )}

        <Separator />

        {/* Câmpuri editabile */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {EDITABLE_FIELDS.map(({ key, label, unit, icon: Icon }) => {
            const value = getFieldValue(key)
            const isEdited = edits[key] !== undefined
            const originalValue = (statistics as any)[key]

            return (
              <div key={key} className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor={key} className="flex items-center gap-2">
                    <Icon className="h-4 w-4" />
                    {label}
                  </Label>
                  {isEdited && (
                    <Badge variant="outline" className="text-xs">
                      Modificat
                    </Badge>
                  )}
                </div>
                
                {editing ? (
                  <div className="space-y-2">
                    <Input
                      id={key}
                      type="number"
                      value={value}
                      onChange={(e) => handleEdit(key, parseFloat(e.target.value) || 0)}
                      placeholder={`Introduceți ${label.toLowerCase()}`}
                    />
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Unitate: {unit}</span>
                      {isEdited && (
                        <span className="text-blue-600 dark:text-blue-400">
                          Original: {originalValue} {unit}
                        </span>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <div className="text-lg font-semibold">
                      {value} {unit}
                    </div>
                    {isEdited && (
                      <div className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                        Modificat față de original: {originalValue} {unit}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Statistici avansate */}
        <div className="space-y-4">
          <h3 className="text-sm font-medium">Statistici avansate</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Tăvițe împărțite</p>
              <p className="font-medium">{statistics.sharedTraysCount}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Timp estimat total</p>
              <p className="font-medium">{statistics.estimatedTimeTotal} min</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Rata orară</p>
              <p className="font-medium">
                {((statistics.earningsTotal / (statistics.workTimeTotal / 60)) || 0).toFixed(2)} RON/h
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Utilizare timp</p>
              <p className="font-medium">
                {((statistics.workTimeTotal / (statistics.workTimeTotal + statistics.waitingTimeTotal)) * 100).toFixed(1)}%
              </p>
            </div>
          </div>
        </div>

        {/* Informații despre editare */}
        {statistics.updatedBy && (
          <div className="p-3 bg-blue-50 dark:bg-blue-950/20 rounded-lg">
            <p className="text-sm">
              <span className="font-medium">Ultima editare:</span> de către {statistics.updatedBy}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              La {statistics.lastUpdated.toLocaleDateString('ro-RO')} {statistics.lastUpdated.toLocaleTimeString('ro-RO')}
            </p>
          </div>
        )}

        {/* Avertizare pentru modificări */}
        {editing && hasChanges && (
          <div className="p-3 bg-amber-50 dark:bg-amber-950/20 rounded-lg border border-amber-200 dark:border-amber-800">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5" />
              <div className="space-y-1">
                <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                  Atenție: Modificări în așteptare
                </p>
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  {Object.keys(edits).length} câmpuri au fost modificate. Toate modificările vor fi înregistrate în istoric.
                </p>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}