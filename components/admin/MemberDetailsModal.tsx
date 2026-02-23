"use client"

import { useState, useEffect } from "react"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Users, DollarSign, TrendingUp, Activity, Save, Key, Power, Trash2, Loader2, Shield, Circle } from "lucide-react"

interface AppMember {
  id: string
  user_id: string
  role: "owner" | "admin" | "member" | "vanzator" | "receptie" | "tehnician"
  created_at: string
  email?: string
  name?: string
}

interface ExtendedMember extends AppMember {
  last_login?: string
  status: 'active' | 'inactive'
  leads_count: number
  sales_count: number
  pipelines_count: number
  permissions_count: number
  permissions: string[]
}

interface MemberDetailsModalProps {
  member: ExtendedMember
  pipelines: Array<{ id: string; name: string }>
  open: boolean
  onClose: () => void
  onSave: (member: ExtendedMember) => Promise<void>
  onDelete: (member: ExtendedMember) => Promise<void>
  onResetPassword: (userId: string) => Promise<void>
  onToggleStatus: (userId: string, status: 'active' | 'inactive') => Promise<void>
  onSavePermissions: (userId: string, permissions: string[]) => Promise<void>
}

export default function MemberDetailsModal({
  member,
  pipelines,
  open,
  onClose,
  onSave,
  onDelete,
  onResetPassword,
  onToggleStatus,
  onSavePermissions,
}: MemberDetailsModalProps) {
  const [editingName, setEditingName] = useState(member.name || '')
  const [editingRole, setEditingRole] = useState(member.role)
  const [editingStatus, setEditingStatus] = useState(member.status)
  const [permissions, setPermissions] = useState<string[]>(member.permissions || [])

  useEffect(() => {
    setEditingName(member.name || '')
    setEditingRole(member.role)
    setEditingStatus(member.status)
    setPermissions(member.permissions || [])
  }, [member.user_id, member.name, member.role, member.status, member.permissions])

  const [saving, setSaving] = useState(false)
  const [savingPermissions, setSavingPermissions] = useState(false)

  async function handleSave() {
    setSaving(true)
    try {
      await onSave({
        ...member,
        name: editingName,
        role: editingRole,
        status: editingStatus,
        permissions
      })
      onClose()
    } catch (error) {
      console.error('[MemberDetailsModal] Error saving:', error)
    } finally {
      setSaving(false)
    }
  }

  async function handleSavePermissions() {
    setSavingPermissions(true)
    try {
      await onSavePermissions(member.user_id, permissions)
    } catch (error) {
      console.error('[MemberDetailsModal] Error saving permissions:', error)
    } finally {
      setSavingPermissions(false)
    }
  }

  function formatDate(dateString: string): string {
    const date = new Date(dateString)
    return date.toLocaleDateString('ro-RO', { 
      day: '2-digit', 
      month: 'long', 
      year: 'numeric' 
    })
  }

  function formatLastLogin(lastLogin?: string): string {
    if (!lastLogin) return 'Niciodată'
    
    const date = new Date(lastLogin)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 5) return 'Acum câteva minute'
    if (diffMins < 60) return `Acum ${diffMins} minute`
    if (diffHours < 24) return `Acum ${diffHours} ore`
    if (diffDays === 1) return 'Ieri'
    if (diffDays < 7) return `Acum ${diffDays} zile`
    return formatDate(lastLogin)
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Detalii Membru: {member.name || member.email}</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Profile Section */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Profile
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Email</Label>
                  <div className="font-medium mt-1.5">{member.email}</div>
                </div>
                <div>
                  <Label>Role</Label>
                  <Select 
                    value={editingRole} 
                    onValueChange={(v: "owner" | "admin" | "member" | "vanzator" | "receptie" | "tehnician") => setEditingRole(v)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="owner">Owner</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="member">Member</SelectItem>
                      <SelectItem value="vanzator">Vanzator</SelectItem>
                      <SelectItem value="receptie">Receptie</SelectItem>
                      <SelectItem value="tehnician">Tehnician</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Nume</Label>
                  <Input
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    placeholder="Nume"
                    className="mt-1.5"
                  />
                </div>
                <div>
                  <Label>Status</Label>
                  <Select 
                    value={editingStatus} 
                    onValueChange={(v: "active" | "inactive") => setEditingStatus(v)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Created</Label>
                  <div className="text-sm text-muted-foreground mt-1.5">
                    {formatDate(member.created_at)}
                  </div>
                </div>
                <div>
                  <Label>Last Login</Label>
                  <div className="text-sm text-muted-foreground mt-1.5 flex items-center gap-2">
                    {member.status === 'active' ? (
                      <Circle className="h-2 w-2 fill-current text-green-500" />
                    ) : (
                      <Circle className="h-2 w-2 text-gray-400" />
                    )}
                    {formatLastLogin(member.last_login)}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Performance Section */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Activity className="h-5 w-5" />
                Performanță (Ultima Săptămână)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="flex flex-col items-center p-4 rounded-lg bg-muted/50">
                  <Users className="h-8 w-8 text-blue-500 mb-2" />
                  <div className="text-3xl font-bold">{member.leads_count}</div>
                  <div className="text-sm text-muted-foreground mt-1">Leads Noi</div>
                </div>
                <div className="flex flex-col items-center p-4 rounded-lg bg-muted/50">
                  <DollarSign className="h-8 w-8 text-green-500 mb-2" />
                  <div className="text-3xl font-bold">{member.sales_count}</div>
                  <div className="text-sm text-muted-foreground mt-1">Vânzări</div>
                </div>
                <div className="flex flex-col items-center p-4 rounded-lg bg-muted/50">
                  <TrendingUp className="h-8 w-8 text-purple-500 mb-2" />
                  <div className="text-3xl font-bold">
                    {member.leads_count > 0 
                      ? ((member.sales_count / member.leads_count) * 100).toFixed(1)
                      : 0}%
                  </div>
                  <div className="text-sm text-muted-foreground mt-1">Conversie</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Permissions Section */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Permisiuni Pipeline-uri
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {pipelines.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    Nu există pipeline-uri disponibile.
                  </div>
                ) : (
                  pipelines.map(pipeline => {
                    const hasPermission = permissions.includes(pipeline.id)
                    return (
                      <div key={pipeline.id} className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors">
                        <div className="flex items-center gap-3 flex-1">
                          <Checkbox
                            id={`pipeline-${pipeline.id}`}
                            checked={hasPermission}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setPermissions([...permissions, pipeline.id])
                              } else {
                                setPermissions(permissions.filter(p => p !== pipeline.id))
                              }
                            }}
                          />
                          <Label 
                            htmlFor={`pipeline-${pipeline.id}`} 
                            className="cursor-pointer flex-1 font-medium"
                          >
                            {pipeline.name}
                          </Label>
                        </div>
                        {hasPermission && (
                          <Badge variant="secondary" className="text-green-600 bg-green-50">
                            <Circle className="h-1.5 w-1.5 fill-current mr-1" />
                            Activ
                          </Badge>
                        )}
                      </div>
                    )
                  })
                )}
              </div>
              <Button 
                onClick={handleSavePermissions} 
                disabled={savingPermissions}
                className="w-full mt-4"
              >
                {savingPermissions && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                <Shield className="h-4 w-4 mr-2" />
                Salvează Permisiuni ({permissions.length}/{pipelines.length})
              </Button>
            </CardContent>
          </Card>

          {/* Quick Actions */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Activity className="h-5 w-5" />
                Quick Actions
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Button 
                  variant="outline" 
                  onClick={() => onResetPassword(member.user_id)}
                  className="h-auto py-4 flex flex-col gap-2"
                >
                  <Key className="h-6 w-6" />
                  <span className="text-sm">Reset Password</span>
                </Button>
                <Button 
                  variant="outline" 
                  onClick={() => onToggleStatus(member.user_id, editingStatus === 'active' ? 'inactive' : 'active')}
                  className={`h-auto py-4 flex flex-col gap-2 ${editingStatus === 'active' ? 'text-destructive hover:text-destructive hover:bg-destructive/10' : ''}`}
                >
                  <Power className="h-6 w-6" />
                  <span className="text-sm">{editingStatus === 'active' ? 'Deactivate' : 'Activate'}</span>
                </Button>
                <Button 
                  variant="destructive"
                  onClick={() => onDelete(member)}
                  className="h-auto py-4 flex flex-col gap-2"
                >
                  <Trash2 className="h-6 w-6" />
                  <span className="text-sm">Delete Member</span>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            <Save className="h-4 w-4 mr-2" />
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}