"use client"

import { useEffect, useState } from "react"
import { useRole, useAuthContext } from "@/lib/contexts/AuthContext"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Loader2, Users, Database, Package, FileSearch, List, UserPlus, RefreshCw } from "lucide-react"
import { toast } from "sonner"
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
import { supabaseBrowser } from "@/lib/supabase/supabaseClient"

// Import existing admin components
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

// Import new components
const OverviewDashboard = dynamic(() => import('@/components/admin/OverviewDashboard').then(mod => mod.default), {
  ssr: false,
  loading: () => <Loader2 className="h-8 w-8 animate-spin" />
})

const MemberTable = dynamic(() => import('@/components/admin/MemberTable').then(mod => mod.default), {
  ssr: false,
  loading: () => <Loader2 className="h-8 w-8 animate-spin" />
})

const MemberDetailsModal = dynamic(() => import('@/components/admin/MemberDetailsModal').then(mod => mod.default), {
  ssr: false,
  loading: () => <Loader2 className="h-8 w-8 animate-spin" />
})

const supabase = supabaseBrowser()
const DEFAULT_PASSWORD = "Welcome123"

type MemberRole = "owner" | "admin" | "member" | "vanzator" | "receptie" | "tehnician"

interface AppMember {
  id: string
  user_id: string
  role: MemberRole
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

export default function AdminsPage() {
  const { isOwner, loading: roleLoading, role, user } = useRole()
  
  // Debug: Log auth state
  useEffect(() => {
    console.log('[AdminsPage] Auth state:', {
      isOwner,
      role,
      roleLoading,
      userId: user?.id,
      userEmail: user?.email
    })
  }, [isOwner, role, roleLoading, user])
  const [activeTab, setActiveTab] = useState<'dashboard' | 'members' | 'backups' | 'trays' | 'tray-finder' | 'pipeline-items'>('dashboard')
  const [members, setMembers] = useState<ExtendedMember[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [newEmail, setNewEmail] = useState("")
  const [newName, setNewName] = useState("")
  const [newRole, setNewRole] = useState<MemberRole>("admin")
  const [adding, setAdding] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [memberToDelete, setMemberToDelete] = useState<ExtendedMember | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [pipelines, setPipelines] = useState<Array<{ id: string; name: string }>>([])
  const [memberPermissions, setMemberPermissions] = useState<{ [userId: string]: string[] }>({})
  const [selectedMember, setSelectedMember] = useState<ExtendedMember | null>(null)
  const [memberModalOpen, setMemberModalOpen] = useState(false)

  useEffect(() => {
    loadMembers()
    loadPipelines()
  }, [])

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
      console.log('[AdminsPage] Loading members...')
      const res = await fetch("/api/admin/members")
      const data = await res.json()
      
      console.log('[AdminsPage] Response:', data)
      
      if (!res.ok || !data.ok) throw new Error(data.error || "Error")
      const loadedMembers = data.members || []
      
      console.log('[AdminsPage] Loaded members count:', loadedMembers.length)
      
      // Add extended data to members
      const extendedMembers = await Promise.all(loadedMembers.map(async (member: AppMember) => {
        const [permissions, stats, lastLogin] = await Promise.all([
          getMemberPermissions(member.user_id),
          getMemberStats(member.user_id),
          getLastLogin(member.user_id)
        ])
        
        return {
          ...member,
          ...permissions,
          ...stats,
          ...lastLogin,
          status: 'active' as const // Default to active for now
        }
      }))
      
      console.log('[AdminsPage] Extended members count:', extendedMembers.length)
      console.log('[AdminsPage] First member:', extendedMembers[0])
      
      setMembers(extendedMembers)
      
      // Load all member permissions
      const userIds = extendedMembers.map(m => m.user_id)
      const allPermissions = await getAllMemberPermissions(userIds)
      setMemberPermissions(allPermissions)
    } catch (error: any) {
      console.error('[AdminsPage] Error loading members:', error)
      toast.error(error.message || "Eroare la încărcare")
    } finally {
      setLoading(false)
    }
  }

  async function getMemberPermissions(userId: string): Promise<{ permissions: string[], permissions_count: number }> {
    try {
      const { data } = await supabase
        .from('user_pipeline_permissions')
        .select('pipeline_id')
        .eq('user_id', userId)
      
      const permissions = (data || []).map((p: any) => String(p.pipeline_id))
      return {
        permissions,
        permissions_count: permissions.length
      }
    } catch (error) {
      console.error('[getMemberPermissions] Error:', error)
      return { permissions: [], permissions_count: 0 }
    }
  }

  async function getAllMemberPermissions(userIds: string[]): Promise<{ [userId: string]: string[] }> {
    try {
      const { data, error } = await supabase
        .from('user_pipeline_permissions')
        .select('user_id, pipeline_id')
        .in('user_id', userIds)
      
      if (error) throw error
      
      const permsMap: { [userId: string]: string[] } = {}
      userIds.forEach(id => { permsMap[id] = [] })
      
      if (data) {
        data.forEach((p: any) => {
          const userId = String(p.user_id)
          const pipelineId = String(p.pipeline_id)
          if (!permsMap[userId]) {
            permsMap[userId] = []
          }
          permsMap[userId].push(pipelineId)
        })
      }
      
      return permsMap
    } catch (error) {
      console.error('[getAllMemberPermissions] Error:', error)
      return {}
    }
  }

  async function getMemberStats(userId: string): Promise<{ leads_count: number, sales_count: number, pipelines_count: number }> {
    try {
      // Get leads count
      const { count: leadsCount } = await supabase
        .from('leads')
        .select('*', { count: 'exact', head: true })
        .eq('created_by', userId)
      
      // Get sales count (service files)
      const { count: salesCount } = await supabase
        .from('service_files')
        .select('*', { count: 'exact', head: true })
        .eq('created_by', userId)
      
      // Get pipelines count from permissions
      const { count: pipelinesCount } = await supabase
        .from('user_pipeline_permissions')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
      
      return {
        leads_count: leadsCount || 0,
        sales_count: salesCount || 0,
        pipelines_count: pipelinesCount || 0
      }
    } catch (error) {
      console.error('[getMemberStats] Error:', error)
      return { leads_count: 0, sales_count: 0, pipelines_count: 0 }
    }
  }

  async function getLastLogin(userId: string): Promise<{ last_login?: string }> {
    try {
      // Get last login from auth.users using RPC or API
      // For now, we'll return undefined as this requires admin access to auth schema
      // In a production environment, you would use an RPC function
      // Example: SELECT last_sign_in_at FROM auth.users WHERE id = $1
      return { last_login: undefined }
    } catch (error) {
      console.error('[getLastLogin] Error:', error)
      return { last_login: undefined }
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

  async function handleRoleChange(member: ExtendedMember, newRole: MemberRole) {
    if (member.role === newRole) return
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

  async function handleSaveMember(member: ExtendedMember) {
    try {
      const res = await fetch("/api/admin/members", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          memberId: member.user_id, 
          name: member.name,
          role: member.role,
          status: member.status
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) throw new Error(data.error || "Error")
      toast.success("Membru actualizat")
      setMembers(prev => prev.map(m => m.user_id === member.user_id ? { ...m, ...member } : m))
    } catch (error: any) {
      toast.error(error.message)
      throw error
    }
  }

  async function handleSavePermissions(userId: string, permissions: string[]) {
    try {
      const currentPerms = memberPermissions[userId] || []
      const toAdd = permissions.filter(p => !currentPerms.includes(p))
      const toRemove = currentPerms.filter(p => !permissions.includes(p))

      // Add permissions
      for (const pipelineId of toAdd) {
        await (supabase.from('user_pipeline_permissions') as any).insert({
          user_id: userId,
          pipeline_id: pipelineId
        })
      }

      // Remove permissions
      for (const pipelineId of toRemove) {
        await (supabase
          .from('user_pipeline_permissions') as any)
          .delete()
          .eq('user_id', userId)
          .eq('pipeline_id', pipelineId)
      }

      toast.success('Permisiuni actualizate')
      
      // Update local state
      setMemberPermissions(prev => ({
        ...prev,
        [userId]: permissions
      }))

      // Update member in list
      setMembers(prev => prev.map(m => 
        m.user_id === userId 
          ? { ...m, permissions, permissions_count: permissions.length }
          : m
      ))
    } catch (error: any) {
      toast.error(error.message || 'Eroare la salvare permisiuni')
      throw error
    }
  }

  async function handleResetPassword(userId: string) {
    try {
      const res = await fetch('/api/admin/members/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) throw new Error(data.error || 'Eroare')
      toast.success(
        `Parolă resetată. Parola temporară: ${data.temporaryPassword} — comunică-o utilizatorului.`,
        { duration: 12000 }
      )
    } catch (error: any) {
      toast.error(error.message)
    }
  }

  async function handleToggleStatus(userId: string, status: 'active' | 'inactive') {
    try {
      const res = await fetch('/api/admin/members', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberId: userId, status }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) throw new Error(data.error || 'Eroare')
      setMembers(prev =>
        prev.map(m => (m.user_id === userId ? { ...m, status } : m))
      )
      if (selectedMember?.user_id === userId) {
        setSelectedMember(prev => (prev ? { ...prev, status } : null))
      }
      toast.success(status === 'active' ? 'Membru activat' : 'Membru dezactivat')
    } catch (error: any) {
      toast.error(error.message)
    }
  }

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

  const owners = members.filter(m => m.role === "owner")
  const admins = members.filter(m => m.role === "admin")
  const regularMembers = members.filter(m => m.role === "member")

  // Dashboard stats
  const dashboardData = {
    totalMembers: members.length,
    owners: owners.length,
    admins: admins.length,
    members: regularMembers.length,
    activeMembers: members.length, // Assuming all are active for now
    recentActivity: members.slice(0, 5).map(m => ({
      id: m.user_id,
      userId: m.user_id,
      email: m.email || '',
      name: m.name || '',
      action: 'login',
      timestamp: m.last_login || m.created_at
    }))
  }

  return (
    <div className="overflow-y-auto max-h-[calc(100vh-6rem)] py-1">
      <div className="container mx-auto py-8 px-4 max-w-6xl">
        {/* Tab Navigation */}
        <div className="flex flex-wrap gap-2 mb-6">
          <Button
            variant={activeTab === 'dashboard' ? 'default' : 'outline'}
            onClick={() => setActiveTab('dashboard')}
            className="flex items-center gap-2"
          >
            <Users className="w-4 h-4" />
            Dashboard
          </Button>
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
          <CardHeader className="border-b flex flex-row items-center justify-between">
            <CardTitle className="text-xl">
              {activeTab === 'dashboard' ? 'ADMIN DASHBOARD' :
               activeTab === 'members' ? 'ADMINISTRARE ECHIPA' : 
               activeTab === 'backups' ? 'MANAGER BACKUP-URI' : 
               activeTab === 'trays' ? 'ASIGNARE TĂVIȚE ÎN PIPELINE' :
               activeTab === 'tray-finder' ? 'CĂUTARE FIȘĂ DUPĂ ID TĂVIȚĂ' :
               'MANAGEMENT INTRĂRI PIPELINE'}
            </CardTitle>
            {activeTab === 'members' && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => loadMembers()}
                disabled={loading}
                className="gap-2"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            )}
          </CardHeader>
          <CardContent className="pt-6">
            {activeTab === 'dashboard' ? (
              <OverviewDashboard stats={dashboardData} />
            ) : activeTab === 'members' ? (
              <>
                <div className="space-y-6">
                  {/* Add New Member */}
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
                      <select
                        value={newRole}
                        onChange={(e) => setNewRole(e.target.value as MemberRole)}
                        className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                      >
                        <option value="member">Member</option>
                        <option value="admin">Admin</option>
                        <option value="owner">Owner</option>
                        <option value="vanzator">Vanzator</option>
                        <option value="receptie">Receptie</option>
                        <option value="tehnician">Tehnician</option>
                      </select>
                      <Button type="submit" disabled={adding || !newEmail || !newName} className="h-10">
                        {adding ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                        Adaugă
                      </Button>
                    </form>
                  
                    <p className="text-sm text-muted-foreground">
                      Parola inițială: <span className="font-mono font-medium">{DEFAULT_PASSWORD}</span>
                    </p>
                  </div>

                  {/* Member Table */}
                  {loading ? (
                    <div className="flex justify-center py-12">
                      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    </div>
                  ) : (
                    <MemberTable
                      members={members}
                      onMemberClick={(member) => {
                        setSelectedMember(member)
                        setMemberModalOpen(true)
                      }}
                      onEditMember={(member) => {
                        setSelectedMember(member)
                        setMemberModalOpen(true)
                      }}
                      onDeleteMember={(member) => {
                        setMemberToDelete(member)
                        setDeleteDialogOpen(true)
                      }}
                      onRoleChange={handleRoleChange}
                    />
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

        {/* Member Details Modal */}
        {selectedMember && (
          <MemberDetailsModal
            member={selectedMember}
            pipelines={pipelines}
            open={memberModalOpen}
            onClose={() => {
              setMemberModalOpen(false)
              setSelectedMember(null)
            }}
            onSave={handleSaveMember}
            onDelete={async (member) => {
              setMemberToDelete(member)
              setDeleteDialogOpen(true)
              setMemberModalOpen(false)
            }}
            onResetPassword={handleResetPassword}
            onToggleStatus={handleToggleStatus}
            onSavePermissions={handleSavePermissions}
          />
        )}

        {/* Delete Confirmation Dialog */}
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