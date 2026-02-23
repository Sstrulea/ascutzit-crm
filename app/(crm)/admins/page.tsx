"use client"

import { useEffect, useState, useMemo } from "react"
import { useRole } from "@/lib/contexts/AuthContext"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Loader2, Crown, ChevronDown, ChevronUp, Save, Shield, UserPlus, Edit2, X, Check, Database, Users, Package, FileSearch, List } from "lucide-react"
import { toast } from "sonner"
import { Checkbox } from "@/components/ui/checkbox"
import { grantPipelineAccess, revokePipelineAccess } from "@/lib/supabase/pipelinePermissions"
import { supabaseBrowser } from "@/lib/supabase/supabaseClient"
import dynamic from "next/dynamic"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface AppMember {
  id: string
  user_id: string
  role: "owner" | "admin" | "member"
  created_at: string
  email?: string
  name?: string
}

const supabase = supabaseBrowser()
const DEFAULT_PASSWORD = "Welcome123"

const BackupManager = dynamic(() => import('@/components/admin/BackupManager').then(mod => mod.default), {
  ssr: false,
  loading: () => <Loader2 className="h-8 w-8 animate-spin" />
})

const TrayPipelineAssigner = dynamic(() => import('@/components/admin/TrayPipelineAssigner').then(mod => mod.default), {
  ssr: false,
  loading: () => <Loader2 className="h-8 w-8 animate-spin" />
})

const TrayFileFinder = dynamic(() => import('@/components/admin/TrayFileFinder').then(mod => mod.default), {
  ssr: false,
  loading: () => <Loader2 className="h-8 w-8 animate-spin" />
})

const PipelineItemsManager = dynamic(() => import('@/components/admin/PipelineItemsManager').then(mod => mod.default), {
  ssr: false,
  loading: () => <Loader2 className="h-8 w-8 animate-spin" />
})

export default function AdminsPage() {
  const { isOwner, loading: roleLoading } = useRole()
  const [activeTab, setActiveTab] = useState<'members' | 'backups' | 'trays' | 'tray-finder' | 'pipeline-items'>('members')
  const [members, setMembers] = useState<AppMember[]>([])
  const [loading, setLoading] = useState(true)
  const [newEmail, setNewEmail] = useState("")
  const [newName, setNewName] = useState("")
  const [newRole, setNewRole] = useState<"owner" | "admin" | "member">("admin")
  const [adding, setAdding] = useState(false)
  const [updatingRole, setUpdatingRole] = useState<string | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [memberToDelete, setMemberToDelete] = useState<AppMember | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [expandedMember, setExpandedMember] = useState<string | null>(null)
  const [pipelines, setPipelines] = useState<Array<{ id: string; name: string }>>([])
  const [memberPermissions, setMemberPermissions] = useState<{ [userId: string]: string[] }>({})
  const [savingPermissions, setSavingPermissions] = useState(false)
  const [editingName, setEditingName] = useState<string | null>(null)
  const [editingNameValue, setEditingNameValue] = useState("")
  const [savingName, setSavingName] = useState(false)

  useEffect(() => {
    loadMembers()
    loadPipelines()
  }, [])

  // IMPORTANT: Reîncarcă permisiunile când se schimbă lista de membri (după salvare, refresh, etc.)
  // Folosim JSON.stringify pentru a detecta schimbări în lista de membri
  useEffect(() => {
    if (members.length > 0) {
      console.log('[AdminsPage] Reîncărcare permisiuni pentru membrii existenți:', members.length)
      const userIds = members.map(m => m.user_id)
      console.log('[AdminsPage] User IDs pentru reîncărcare:', userIds)
      loadAllMemberPermissions(userIds)
    }
  }, [JSON.stringify(members.map(m => m.user_id))]) // Reîncarcă când se schimbă lista de membri

  // DEBUG: Monitorizează schimbările în memberPermissions
  useEffect(() => {
    console.log('[AdminsPage] memberPermissions changed:', memberPermissions)
  }, [memberPermissions])

  async function loadPipelines() {
    const { data } = await supabase
      .from('pipelines')
      .select('id, name')
      .eq('is_active', true)
      .order('position')
    setPipelines(data || [])
  }

  async function loadMembers() {
    setLoading(true)
    try {
      const res = await fetch("/api/admin/members")
      const data = await res.json()
      if (!res.ok || !data.ok) throw new Error(data.error || "Error")
      const loadedMembers = data.members || []
      setMembers(loadedMembers)
      
      await loadAllMemberPermissions(loadedMembers.map((m: AppMember) => m.user_id))
    } catch (error: any) {
      toast.error(error.message || "Eroare la încărcare")
    } finally {
      setLoading(false)
    }
  }

  async function loadAllMemberPermissions(userIds: string[]) {
    if (userIds.length === 0) {
      console.log('[loadAllMemberPermissions] Nu există user IDs')
      return
    }
    
    console.log('[loadAllMemberPermissions] ════════════════════════════════════════')
    console.log('[loadAllMemberPermissions] Încărcare permisiuni pentru user IDs:', userIds)
    console.log('[loadAllMemberPermissions] User IDs count:', userIds.length)
    
    try {
      // IMPORTANT: Verifică dacă există permisiuni în DB pentru orice user (fără filtru)
      const { data: allData, error: allError } = await supabase
      .from('user_pipeline_permissions')
      .select('user_id, pipeline_id')
        .limit(10) // Doar primele 10 pentru debugging
      
      console.log('[loadAllMemberPermissions] 🔍 DEBUG: Toate permisiunile din DB (primele 10):', allData)
      if (allError) {
        console.error('[loadAllMemberPermissions] ❌ EROARE la query general:', allError)
      }
      
      // Query-ul principal pentru user IDs specifici
      const { data, error, count } = await supabase
        .from('user_pipeline_permissions')
        .select('user_id, pipeline_id', { count: 'exact' })
      .in('user_id', userIds)
    
      if (error) {
        console.error('[loadAllMemberPermissions] ❌ EROARE la încărcare permisiuni:', error)
        console.error('[loadAllMemberPermissions] Error details:', {
          message: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint
        })
        
        // Dacă este eroare RLS, încercă cu service role sau altă metodă
        if (error.code === '42501' || error.message?.includes('permission') || error.message?.includes('policy')) {
          console.error('[loadAllMemberPermissions] ⚠️ PROBLEMĂ RLS IDENTIFICATĂ!')
          console.error('[loadAllMemberPermissions] Policy-ul actual permite doar utilizatorilor să vadă permisiunile proprii.')
          console.error('[loadAllMemberPermissions] Owner-ii nu pot vedea permisiunile altor utilizatori.')
          console.error('[loadAllMemberPermissions] SOLUȚIE: Rulează scriptul SQL din Secvente/FIX_RLS_USER_PIPELINE_PERMISSIONS.sql')
          toast.error('Eroare RLS: Owner-ii nu pot vedea permisiunile. Rulează scriptul SQL pentru fix.')
        } else {
          toast.error(`Eroare la încărcare permisiuni: ${error.message}`)
        }
        return
      }
      
      console.log('[loadAllMemberPermissions] ✅ Query executat cu succes')
      console.log('[loadAllMemberPermissions] Count din DB:', count)
      console.log('[loadAllMemberPermissions] Date primite din DB:', data)
      console.log('[loadAllMemberPermissions] Data length:', data?.length || 0)
      
    const permsMap: { [userId: string]: string[] } = {}
    userIds.forEach(id => {
      permsMap[id] = []
    })
    
      if (data && data.length > 0) {
        console.log('[loadAllMemberPermissions] ✅ Procesare', data.length, 'permisiuni')
      data.forEach((p: any) => {
          const userId = String(p.user_id)
          const pipelineId = String(p.pipeline_id)
          
          console.log(`[loadAllMemberPermissions]   → user=${userId}, pipeline=${pipelineId}`)
          
          if (!permsMap[userId]) {
            permsMap[userId] = []
        }
          permsMap[userId].push(pipelineId)
        })
      } else {
        console.warn('[loadAllMemberPermissions] ⚠️ Nu există permisiuni în DB pentru acești utilizatori')
        console.warn('[loadAllMemberPermissions] Verifică dacă există permisiuni în tabelul user_pipeline_permissions')
        console.warn('[loadAllMemberPermissions] User IDs căutați:', userIds)
        console.warn('[loadAllMemberPermissions] Dacă există permisiuni în DB dar nu se încarcă, verifică RLS policies')
      }
      
      console.log('[loadAllMemberPermissions] Permisiuni procesate:', permsMap)
      console.log('[loadAllMemberPermissions] Detalii per user:')
      Object.keys(permsMap).forEach(userId => {
        const count = permsMap[userId].length
        console.log(`[loadAllMemberPermissions]   - ${userId}: ${count} permisiuni`, permsMap[userId])
        if (count === 0) {
          console.warn(`[loadAllMemberPermissions]     ⚠️ User ${userId} are 0 permisiuni`)
    }
      })
    
      setMemberPermissions(prev => {
        const updated = { ...prev, ...permsMap }
        console.log('[loadAllMemberPermissions] State actualizat:', updated)
        console.log('[loadAllMemberPermissions] ════════════════════════════════════════')
        return updated
      })
    } catch (err: any) {
      console.error('[loadAllMemberPermissions] ❌ Exception:', err)
      toast.error(`Eroare neașteptată: ${err.message}`)
    }
  }

  async function loadMemberPermissions(userId: string) {
    try {
      const { data, error } = await supabase
      .from('user_pipeline_permissions')
      .select('pipeline_id')
      .eq('user_id', userId)
      
      if (error) {
        console.error('[loadMemberPermissions] Eroare la încărcare permisiuni pentru user:', userId, error)
        toast.error(`Eroare la încărcare permisiuni: ${error.message}`)
        return
      }
      
      // IMPORTANT: Asigură-te că pipeline_id este string și nu null/undefined
      const pipelineIds = (data || [])
        .map((p: any) => {
          // Convert to string to ensure consistent comparison
          const id = p.pipeline_id
          return id != null && id !== undefined ? String(id) : null
        })
        .filter((id: any) => id != null) as string[]
      
      console.log('[loadMemberPermissions] Permisiuni încărcate pentru user:', userId)
      console.log('[loadMemberPermissions] Pipeline IDs (raw):', data)
      console.log('[loadMemberPermissions] Pipeline IDs (processed):', pipelineIds)
      console.log('[loadMemberPermissions] Available pipelines:', pipelines.map(p => ({ id: String(p.id), name: p.name })))
      
      setMemberPermissions(prev => {
        const updated = { ...prev, [userId]: pipelineIds }
        console.log('[loadMemberPermissions] Updated memberPermissions for', userId, ':', pipelineIds)
        return updated
      })
    } catch (err: any) {
      console.error('[loadMemberPermissions] Exception:', err)
      toast.error(`Eroare la încărcare permisiuni: ${err.message}`)
    }
  }

  async function handleAddMember(e: React.FormEvent) {
    e.preventDefault()
    if (!newEmail || !newName) {
      toast.error("Completează toate câmpurile")
      return
    }
    setAdding(true)
    try {
      const res = await fetch("/api/admin/members/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: newEmail, name: newName, password: DEFAULT_PASSWORD, role: newRole }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) throw new Error(data.error || "Error")
      toast.success("Membru adăugat")
      setNewEmail("")
      setNewName("")
      setNewRole("admin")
      loadMembers()
    } catch (error: any) {
      toast.error(error.message)
    } finally {
      setAdding(false)
    }
  }

  async function handleRoleChange(member: AppMember, newRole: "owner" | "admin" | "member") {
    if (member.role === newRole) return
    setUpdatingRole(member.user_id)
    try {
      const res = await fetch("/api/admin/members", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId: member.user_id, role: newRole }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) throw new Error(data.error || "Error")
      toast.success(`Rol schimbat în ${newRole}`)
      setMembers(prev => prev.map(m => m.user_id === member.user_id ? { ...m, role: newRole } : m))
    } catch (error: any) {
      toast.error(error.message)
    } finally {
      setUpdatingRole(null)
    }
  }

  async function handleNameChange(member: AppMember) {
    if (!editingNameValue.trim()) {
      toast.error("Numele nu poate fi gol")
      return
    }
    setSavingName(true)
    try {
      const res = await fetch("/api/admin/members", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId: member.user_id, name: editingNameValue.trim() }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) throw new Error(data.error || "Error")
      toast.success("Nume actualizat")
      setMembers(prev => prev.map(m => m.user_id === member.user_id ? { ...m, name: editingNameValue.trim() } : m))
      setEditingName(null)
      setEditingNameValue("")
    } catch (error: any) {
      toast.error(error.message)
    } finally {
      setSavingName(false)
    }
  }

  async function handleDeleteMember() {
    if (!memberToDelete) return
    setDeleting(true)
    try {
      const res = await fetch("/api/admin/members", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId: memberToDelete.user_id }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) throw new Error(data.error || "Error")
      toast.success("Membru șters")
      setMembers(prev => prev.filter(m => m.user_id !== memberToDelete.user_id))
      setDeleteDialogOpen(false)
      setMemberToDelete(null)
    } catch (error: any) {
      toast.error(error.message)
    } finally {
      setDeleting(false)
    }
  }

  async function toggleMemberExpanded(userId: string) {
    if (expandedMember === userId) {
      setExpandedMember(null)
    } else {
      setExpandedMember(userId)
      // IMPORTANT: Reîncarcă permisiunile de fiecare dată când se expandează membru
      // pentru a asigura că checkbox-urile sunt bifate corect cu permisiunile actuale din DB
      await loadMemberPermissions(userId)
    }
  }

  function togglePermission(userId: string, pipelineId: string) {
    setMemberPermissions(prev => {
      const current = prev[userId] || []
      // IMPORTANT: Compară ca string-uri pentru a fi consistent cu MemberRow
      const pipelineIdStr = String(pipelineId)
      const hasPermission = current.some(permId => String(permId) === pipelineIdStr)
      
      const newPerms = hasPermission
        ? current.filter(id => String(id) !== pipelineIdStr) // Elimină permisiunea
        : [...current, pipelineIdStr] // ✅ ADaugă ca string pentru consistență
      
      console.log(`[togglePermission] User: ${userId}, Pipeline: ${pipelineId}, Current:`, current, 'Has permission:', hasPermission, 'New:', newPerms)
      
      return {
        ...prev,
        [userId]: newPerms
      }
    })
  }

  async function saveMemberPermissions(userId: string) {
    setSavingPermissions(true)
    try {
      const newPerms = memberPermissions[userId] || []
      console.log('[saveMemberPermissions] Permisiuni noi din state:', newPerms)
      
      const { data: currentData, error: fetchError } = await supabase
        .from('user_pipeline_permissions')
        .select('pipeline_id')
        .eq('user_id', userId)
      
      if (fetchError) {
        console.error('[saveMemberPermissions] Eroare la citire permisiuni curente:', fetchError)
        throw fetchError
      }
      
      // ✅ CONVERTEȘTE TOATE LA STRING PENTRU COMPARARE CONSISTENTĂ
      const currentPerms = (currentData || []).map((p: any) => String(p.pipeline_id))
      const newPermsStr = newPerms.map(id => String(id))
      
      console.log('[saveMemberPermissions] Permisiuni curente din DB:', currentPerms)
      console.log('[saveMemberPermissions] Permisiuni noi (string):', newPermsStr)
      
      const toAdd = newPermsStr.filter(id => !currentPerms.includes(id))
      const toRemove = currentPerms.filter(id => !newPermsStr.includes(id))
      
      console.log('[saveMemberPermissions] Permisiuni de adăugat:', toAdd)
      console.log('[saveMemberPermissions] Permisiuni de eliminat:', toRemove)
      
      for (const pipelineId of toAdd) {
        await grantPipelineAccess(userId, pipelineId)
        console.log(`[saveMemberPermissions] Adăugat permisiune pentru pipeline ${pipelineId}`)
      }
      for (const pipelineId of toRemove) {
        await revokePipelineAccess(userId, pipelineId)
        console.log(`[saveMemberPermissions] Eliminat permisiune pentru pipeline ${pipelineId}`)
      }
      
      toast.success('Permisiuni actualizate')
      // IMPORTANT: Reîncarcă toate permisiunile pentru toți membrii pentru a sincroniza state-ul
      // Nu doar pentru user-ul curent, ci pentru toți pentru a evita probleme la refresh
      const allUserIds = members.map(m => m.user_id)
      await loadAllMemberPermissions(allUserIds)
    } catch (error: any) {
      console.error('[saveMemberPermissions] Eroare:', error)
      toast.error(error.message || 'Eroare')
    } finally {
      setSavingPermissions(false)
    }
  }

  const owners = members.filter(m => m.role === "owner")
  const admins = members.filter(m => m.role === "admin")
  const regularMembers = members.filter(m => m.role === "member")

  if (roleLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    )
  }

  if (!isOwner) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Acces restricționat</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">Doar proprietarii pot accesa această pagină.</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  function MemberRow({ member }: { member: AppMember }) {
    const isExpanded = expandedMember === member.user_id
    // IMPORTANT: Folosește permisiunile din state, sau array gol dacă nu sunt încărcate
    // Permisiunile sunt încărcate automat când se expandează membru sau la încărcarea inițială
    const perms = memberPermissions[member.user_id] || []
    // IMPORTANT: Compară ca string-uri pentru consistență
    const permNames = pipelines.filter(p => {
      const pipelineIdStr = String(p.id)
      return perms.some(permId => String(permId) === pipelineIdStr)
    }).map(p => p.name)
    
    // DEBUG: Log pentru diagnosticare când se expandează
    if (isExpanded) {
      console.log(`[MemberRow] Expanded - User: ${member.email} (${member.user_id})`)
      console.log(`[MemberRow] Permisiuni din state:`, perms)
      console.log(`[MemberRow] Pipeline IDs disponibile:`, pipelines.map(p => String(p.id)))
    }

    return (
      <div className="border rounded-lg overflow-hidden group">
        <div className="flex items-center gap-4 p-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => toggleMemberExpanded(member.user_id)}
            className="h-8 w-8 p-0 shrink-0"
          >
            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
          
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate">{member.email || 'N/A'}</div>
            {editingName === member.user_id ? (
              <div className="flex items-center gap-2 mt-1">
                <Input
                  value={editingNameValue}
                  onChange={(e) => setEditingNameValue(e.target.value)}
                  className="h-7 text-xs"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleNameChange(member)
                    if (e.key === 'Escape') {
                      setEditingName(null)
                      setEditingNameValue("")
                    }
                  }}
                />
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleNameChange(member)}
                  disabled={savingName}
                  className="h-7 w-7 p-0"
                >
                  {savingName ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setEditingName(null)
                    setEditingNameValue("")
                  }}
                  className="h-7 w-7 p-0"
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2 mt-1">
                <div className="text-xs text-muted-foreground truncate flex-1">
                  {member.name || 'Fără nume'}
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setEditingName(member.user_id)
                    setEditingNameValue(member.name || "")
                  }}
                  className="h-6 w-6 p-0 shrink-0 opacity-60 hover:opacity-100"
                >
                  <Edit2 className="h-3 w-3" />
                </Button>
              </div>
            )}
            {perms.length > 0 && (
              <div className="text-xs text-muted-foreground mt-1 truncate">
                {permNames.slice(0, 2).join(', ')}{permNames.length > 2 ? ` +${permNames.length - 2}` : ''}
              </div>
            )}
          </div>
          
          <div className="text-xs text-muted-foreground shrink-0 whitespace-nowrap">
            {perms.length} pipeline-uri
          </div>
          
          <div className="flex items-center gap-2 shrink-0">
            {member.role !== "owner" && (
              <Select
                value={member.role}
                onValueChange={(v) => handleRoleChange(member, v as any)}
                disabled={updatingRole === member.user_id}
              >
                <SelectTrigger className="w-[110px] h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="member">member</SelectItem>
                  <SelectItem value="admin">admin</SelectItem>
                  <SelectItem value="owner">owner</SelectItem>
                </SelectContent>
              </Select>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setMemberToDelete(member)
                setDeleteDialogOpen(true)
              }}
              className="h-9"
            >
              Șterge
            </Button>
          </div>
        </div>

        {isExpanded && (
          <div className="px-4 pb-4 pt-0 space-y-4 border-t bg-muted/30">
            <div className="flex items-center gap-2 pt-4">
              <Shield className="h-4 w-4" />
              <span className="text-sm font-medium">Permisiuni Pipeline-uri</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {pipelines.map(pipeline => {
                // IMPORTANT: Folosește perms din useMemo care se actualizează automat
                const pipelineIdStr = String(pipeline.id)
                const hasPermission = perms.some(permId => String(permId) === pipelineIdStr)
                
                // DEBUG: Log pentru fiecare checkbox când se expandează
                if (isExpanded) {
                  console.log(`[MemberRow] Pipeline: ${pipeline.name} (${pipelineIdStr}), Has permission: ${hasPermission}`)
                  console.log(`[MemberRow] Current perms (from useMemo):`, perms)
                  console.log(`[MemberRow] memberPermissions[${member.user_id}]:`, memberPermissions[member.user_id])
                }
                
                return (
                  <div key={pipeline.id} className="flex items-center justify-between gap-2 p-2 rounded-md hover:bg-muted/50">
                    <div className="flex items-center gap-2 flex-1">
                  <Checkbox
                    id={`${member.user_id}-${pipeline.id}`}
                        checked={hasPermission}
                        onCheckedChange={(checked) => {
                          // IMPORTANT: onCheckedChange primește boolean (true = bifat, false = debifat)
                          // Toggle permisiunea: dacă checked este true, adaugă; dacă false, elimină
                          togglePermission(member.user_id, pipeline.id)
                        }}
                  />
                      <Label htmlFor={`${member.user_id}-${pipeline.id}`} className="text-sm cursor-pointer flex-1">
                    {pipeline.name}
                  </Label>
                </div>
                    {hasPermission && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={async () => {
                          // Șterge permisiunea direct din DB
                          try {
                            await revokePipelineAccess(member.user_id, pipeline.id)
                            toast.success(`Permisiune pentru ${pipeline.name} eliminată`)
                            // Reîncarcă permisiunile pentru a actualiza UI
                            await loadMemberPermissions(member.user_id)
                          } catch (error: any) {
                            console.error('[MemberRow] Eroare la ștergere permisiune:', error)
                            toast.error(error.message || 'Eroare la ștergere permisiune')
                          }
                        }}
                        className="h-7 w-7 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                        title={`Elimină permisiunea pentru ${pipeline.name}`}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                )
              })}
            </div>
            <Button
              onClick={() => saveMemberPermissions(member.user_id)}
              disabled={savingPermissions}
              size="sm"
              className="w-full"
            >
              {savingPermissions && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              <Save className="h-4 w-4 mr-2" />
              Salvează Permisiuni
            </Button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="overflow-y-auto max-h-[calc(100vh-6rem)] py-1">
      <div className="container mx-auto py-8 px-4 max-w-4xl">
      {/* Tab Navigation */}
      <div className="flex gap-2 mb-6">
        <Button
          variant={activeTab === 'members' ? 'default' : 'outline'}
          onClick={() => setActiveTab('members')}
          className="flex items-center gap-2"
        >
          <Users className="w-4 h-4" />
          Membri
        </Button>
        <Button
          variant={activeTab === 'backups' ? 'default' : 'outline'}
          onClick={() => setActiveTab('backups')}
          className="flex items-center gap-2"
        >
          <Database className="w-4 h-4" />
          Backup-uri
        </Button>
        <Button
          variant={activeTab === 'trays' ? 'default' : 'outline'}
          onClick={() => setActiveTab('trays')}
          className="flex items-center gap-2"
        >
          <Package className="w-4 h-4" />
          Tăvițe
        </Button>
        <Button
          variant={activeTab === 'tray-finder' ? 'default' : 'outline'}
          onClick={() => setActiveTab('tray-finder')}
          className="flex items-center gap-2"
        >
          <FileSearch className="w-4 h-4" />
          Caută Fișă
        </Button>
        <Button
          variant={activeTab === 'pipeline-items' ? 'default' : 'outline'}
          onClick={() => setActiveTab('pipeline-items')}
          className="flex items-center gap-2"
        >
          <List className="w-4 h-4" />
          Pipeline Items
        </Button>
      </div>

      <Card>
        <CardHeader className="border-b">
          <CardTitle className="text-xl">
            {activeTab === 'members' ? 'ADMINISTRARE ECHIPA' : 
             activeTab === 'backups' ? 'MANAGER BACKUP-URI' : 
             activeTab === 'trays' ? 'ASIGNARE TĂVIȚE ÎN PIPELINE' :
             activeTab === 'tray-finder' ? 'CĂUTARE FIȘĂ DUPĂ ID TĂVIȚĂ' :
             'MANAGEMENT INTRĂRI PIPELINE'}
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          {activeTab === 'members' ? (
            <>
              <div className="space-y-8">
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <UserPlus className="h-5 w-5 text-muted-foreground" />
                  <h2 className="text-lg font-semibold">Adaugă Membru Nou</h2>
                </div>
            
            <form onSubmit={handleAddMember} className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <Input
                type="email"
                placeholder="Email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                className="h-10"
              />
              <Input
                type="text"
                placeholder="Nume"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="h-10"
              />
              <Select value={newRole} onValueChange={(v) => setNewRole(v as any)}>
                <SelectTrigger className="h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="member">member</SelectItem>
                  <SelectItem value="admin">admin</SelectItem>
                  <SelectItem value="owner">owner</SelectItem>
                </SelectContent>
              </Select>
              <Button type="submit" disabled={adding || !newEmail || !newName} className="h-10">
                {adding ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Adaugă
              </Button>
            </form>
            
            <p className="text-sm text-muted-foreground">
              Parola inițială: <span className="font-mono font-medium">{DEFAULT_PASSWORD}</span>
            </p>
          </div>

          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-6">
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Crown className="h-4 w-4 text-yellow-500" />
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">OWNER</h3>
                </div>
                <div className="space-y-2">
                  {owners.map(m => <MemberRow key={m.user_id} member={m} />)}
                  {owners.length === 0 && (
                    <div className="p-6 text-center text-sm text-muted-foreground border rounded-lg">
                      Niciun owner
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-3">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">ADMINI</h3>
                <div className="space-y-2">
                  {admins.map(m => <MemberRow key={m.user_id} member={m} />)}
                  {admins.length === 0 && (
                    <div className="p-6 text-center text-sm text-muted-foreground border rounded-lg">
                      Niciun admin
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-3">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">MEMBRI</h3>
                <div className="space-y-2">
                  {regularMembers.map(m => <MemberRow key={m.user_id} member={m} />)}
                  {regularMembers.length === 0 && (
                    <div className="p-6 text-center text-sm text-muted-foreground border rounded-lg">
                      Niciun membru
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
              </div>
            </>
          ) : activeTab === 'backups' ? (
            <BackupManager />
          ) : activeTab === 'trays' ? (
            <TrayPipelineAssigner />
          ) : activeTab === 'tray-finder' ? (
            <TrayFileFinder />
          ) : (
            <PipelineItemsManager />
          )}
        </CardContent>
      </Card>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Șterge membrul?</AlertDialogTitle>
            <AlertDialogDescription>
              Ești sigur că vrei să ștergi {memberToDelete?.email}? Această acțiune nu poate fi anulată.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Anulează</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteMember} disabled={deleting}>
              {deleting ? "Se șterge..." : "Șterge"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      </div>
    </div>
  )
}