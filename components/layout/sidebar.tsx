"use client"

import { useState, useCallback, useEffect } from "react"
import Link from "next/link"
import Image from "next/image"
import { usePathname, useRouter } from "next/navigation"
import { 
  Plus, LayoutDashboard, Trash2, ShoppingCart, Scissors, Wrench, Building, 
  Target, Briefcase, Phone, Package, Sparkles, Shield, Settings, UserCircle, 
  LogOut, Check, PanelLeftClose, PanelLeftOpen, ChevronDown, ChevronRight,
  Home, BarChart3, Handshake
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { usePipelinesCache } from "@/hooks/usePipelinesCache"
import { invalidatePipelineOptionsCache } from "@/lib/supabase/leadOperations"
import { invalidateStageIdsCache } from "@/lib/supabase/tehnicianDashboardStageIdsCache"
import { clearDashboardFullCache } from "@/lib/supabase/tehnicianDashboard"
import { supabaseBrowser } from "@/lib/supabase/supabaseClient"
import { useRole, useAuth, useAuthContext } from "@/lib/contexts/AuthContext"
import { useSidebar } from "@/lib/contexts/SidebarContext"
import { toast } from "sonner"

interface SidebarProps {
  canManagePipelines?: boolean
}

const toSlug = (s: string) => String(s).toLowerCase().replace(/\s+/g, "-")

// functie pentru a returna iconita potrivita pentru fiecare pipeline
const getPipelineIcon = (pipelineName: string) => {
  const name = pipelineName.toLowerCase()
  
  if (name.includes('receptie') || name.includes('reception')) {
    return <Phone className="h-4 w-4" />
  } else if (name.includes('quality')) {
    return <Check className="h-4 w-4" />
  } else if (name.includes('frizeri') || name.includes('frizerie') || name.includes('barber')) {
    return <Scissors className="h-4 w-4" />
  } else if (name.includes('saloane') || name.includes('salon')) {
    return <Sparkles className="h-4 w-4" />
  } else if (name.includes('vanzari') || name.includes('sales')) {
    return <ShoppingCart className="h-4 w-4" />
  } else if (name.includes('reparati') || name.includes('service')) {
    return <Wrench className="h-4 w-4" />
  } else if (name.includes('horeca') || name.includes('corporate') || name.includes('business')) {
    return <Building className="h-4 w-4" />
  } else if (name.includes('marketing') || name.includes('campanii')) {
    return <Target className="h-4 w-4" />
  } else if (name.includes('parteneri')) {
    return <Handshake className="h-4 w-4" />
  } else {
    return <Briefcase className="h-4 w-4" />
  }
}

interface SectionProps {
  title: string
  icon: React.ReactNode
  children: React.ReactNode
  defaultCollapsed?: boolean
}

function SidebarSection({ title, icon, children, defaultCollapsed = false }: SectionProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed)

  return (
    <div className="mb-4">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center justify-between w-full px-2 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors"
      >
        <div className="flex items-center gap-2">
          {icon}
          <span>{title}</span>
        </div>
        {collapsed ? (
          <ChevronRight className="h-3 w-3" />
        ) : (
          <ChevronDown className="h-3 w-3" />
        )}
      </button>
      
      {!collapsed && (
        <div className="mt-1 space-y-1">
          {children}
        </div>
      )}
    </div>
  )
}

export function Sidebar({ canManagePipelines }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const { isOwner, role: userRole, isAdmin } = useRole()
  const { user } = useAuth()
  const { hasAccess, isMember, isVanzator, isReceptie, isTehnician } = useAuthContext()
  const { getPipelines, invalidateCache } = usePipelinesCache()
  const supabase = supabaseBrowser()

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut()
      router.replace('/auth/sign-in')
      toast.success('Te-ai deconectat cu succes')
    } catch (error: any) {
      console.error('Error signing out:', error)
      toast.error('Eroare la deconectare')
    }
  }

  const [pipeNames, setPipeNames] = useState<string[]>([])

  // create pipeline dialog state
  const [createOpen, setCreateOpen] = useState(false)
  const [pipelineName, setPipelineName] = useState("")
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  // delete pipeline dialog state
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteTargetName, setDeleteTarget] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  const canManage = (typeof canManagePipelines === "boolean") ? canManagePipelines : isOwner

  const { collapsed: sidebarCollapsed, setCollapsed: setSidebarCollapsed } = useSidebar()

  const reloadPipes = useCallback(async () => {
    const data = await getPipelines()
    if (data?.length) {
      let allPipelines = data.map((p: any) => ({ id: p.id, name: p.name }))
      
      // Owner / admin: toate. Receptie: toate. Member / tehnician: doar cu permisiune. Vanzator: doar pipeline-ul Vanzari (cu permisiune).
      if (isOwner || isAdmin || isReceptie()) {
        // toate
      } else if (isVanzator()) {
        allPipelines = allPipelines.filter(p => hasAccess(p.id) && (p.name || '').toLowerCase().includes('vanzari'))
      } else {
        allPipelines = allPipelines.filter(p => hasAccess(p.id))
      }
      
      setPipeNames(allPipelines.map(p => p.name))
    }
  }, [getPipelines, hasAccess, isMember, isVanzator, isReceptie, isTehnician, isOwner, isAdmin])

  // Single unified effect: mount/route-change + custom event from editor/sidebar actions
  useEffect(() => {
    reloadPipes()

    const handler = () => { reloadPipes() }
    window.addEventListener("pipelines:updated", handler)
    return () => window.removeEventListener("pipelines:updated", handler)
  }, [pathname, reloadPipes])

  async function handleCreatePipeline(e: React.FormEvent) {
    e.preventDefault()
    setCreating(true)
    setCreateError(null)
    try {
      const res = await fetch("/api/pipelines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: pipelineName.trim() }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Failed to create pipeline")

      setCreateOpen(false)
      setPipelineName("")

      invalidateCache()
      invalidatePipelineOptionsCache()
      invalidateStageIdsCache()
      clearDashboardFullCache()
      await reloadPipes()
      window.dispatchEvent(new Event("pipelines:updated"))
    } catch (err: any) {
      setCreateError(err.message || "Failed")
    } finally {
      setCreating(false)
    }
  }

  function openDelete(p: string, e?: React.MouseEvent) {
    e?.preventDefault()
    e?.stopPropagation()
    setDeleteTarget(p)
    setDeleteOpen(true)
  }

  async function handleConfirmDelete() {
    if (!deleteTargetName) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/pipelines?name=${encodeURIComponent(deleteTargetName)}`, { method: "DELETE" })
      const ct = res.headers.get("content-type") || ""
      const payload = ct.includes("application/json") ? await res.json() : { error: await res.text() }
      if (!res.ok) throw new Error(payload?.error || `HTTP ${res.status}`)

      setDeleteOpen(false)
      const removed = deleteTargetName
      setDeleteTarget(null)

      invalidateCache()
      invalidatePipelineOptionsCache()
      invalidateStageIdsCache()
      clearDashboardFullCache()
      await reloadPipes()
      window.dispatchEvent(new Event("pipelines:updated"))

      // If currently on the removed pipeline, bounce to dashboard
      const removedPath = `/leads/${toSlug(removed)}`
      if (pathname === removedPath) {
        router.push("/dashboard")
      }
    } catch (e: any) {
      setDeleting(false)
      alert(e.message ?? "Delete failed")
      return
    }
    setDeleting(false)
  }

  return (
    <aside
      className={cn(
        "bg-sidebar border-r border-sidebar-border h-full flex flex-col transition-[width] duration-200 overflow-hidden",
        sidebarCollapsed ? "w-14" : "w-64"
      )}
    >
      <div className={cn("flex flex-col h-full min-h-0 scrollbar-sidebar-hide", sidebarCollapsed ? "p-2" : "p-4")}>
        {/* Header */}
        <div className={cn(
          "flex items-center gap-3 mb-6 pb-4 border-b border-sidebar-border",
          sidebarCollapsed && "justify-center"
        )}>
          {!sidebarCollapsed && (
            <>
              <Image src="/logo.png" alt="Logo" width={32} height={32} className="shrink-0 rounded-sm" />
              <div className="flex-1 min-w-0">
                <h2 className="font-semibold text-sidebar-foreground truncate">CRM Ascutzit</h2>
                <p className="text-xs text-muted-foreground truncate">Management & Productivitate</p>
              </div>
            </>
          )}
          {sidebarCollapsed && (
            <Image src="/logo.png" alt="CRM" width={32} height={32} className="shrink-0 rounded-sm" aria-hidden />
          )}
          
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="shrink-0 text-sidebar-foreground hover:bg-sidebar-accent"
            onClick={() => setSidebarCollapsed((c) => !c)}
            title={sidebarCollapsed ? "Largire sidebar" : "Restrângere sidebar"}
            aria-label={sidebarCollapsed ? "Largire sidebar" : "Restrângere sidebar"}
          >
            {sidebarCollapsed ? (
              <PanelLeftOpen className="h-4 w-4" />
            ) : (
              <PanelLeftClose className="h-4 w-4" />
            )}
          </Button>
        </div>

        {/* Main Navigation */}
        <nav className="flex-1 overflow-y-auto">
          {/* Sectiunea Principala */}
          {!sidebarCollapsed && (
            <SidebarSection title="Principal" icon={<Home className="h-3 w-3" />}>
              {(isOwner || isAdmin || isReceptie()) && (
                <Link
                  href="/dashboard"
                  prefetch={false}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-sidebar-accent transition-colors",
                    pathname === "/dashboard" && "bg-blue-800 dark:bg-blue-900 text-white"
                  )}
                >
                  <LayoutDashboard className="h-4 w-4" />
                  <span>Dashboard</span>
                </Link>
              )}
              
              <Link
                href="/profile"
                prefetch={false}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-sidebar-accent transition-colors",
                    pathname === "/profile" && "bg-blue-800 dark:bg-blue-900 text-white"
                )}
              >
                <UserCircle className="h-4 w-4" />
                <span>Profil</span>
              </Link>
            </SidebarSection>
          )}

          {/* Sectiunea Dashboard-uri */}
          {!sidebarCollapsed && (
            <SidebarSection title="Dashboard-uri" icon={<BarChart3 className="h-3 w-3" />} defaultCollapsed={true}>
              {/* Statistici Apeluri: Vanzator sau cine are acces la pipeline Vanzari */}
              {(isVanzator() || pipeNames.some((n) => n.toLowerCase().includes('vanzari'))) && (
                <Link
                  href="/dashboard/statistici-apeluri"
                  prefetch={false}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-sidebar-accent transition-colors",
                    pathname === "/dashboard/statistici-apeluri" && "bg-blue-800 dark:bg-blue-900 text-white"
                  )}
                >
                  <BarChart3 className="h-4 w-4" />
                  <span>Statistici Apeluri</span>
                </Link>
              )}
              
              {/* Dashboard Tehnician: rol tehnician sau pipeline-uri de tip tehnician */}
              {(isTehnician() || pipeNames.some((n) => {
                const low = n.toLowerCase()
                return low.includes('saloane') || low.includes('frizerii') || low.includes('horeca') || low.includes('reparatii')
              })) && (
                <Link
                  href="/dashboard/tehnician"
                  prefetch={false}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-sidebar-accent transition-colors",
                    pathname === "/dashboard/tehnician" && "bg-blue-800 dark:bg-blue-900 text-white"
                  )}
                >
                  <Package className="h-4 w-4" />
                  <span>Tehnician</span>
                </Link>
              )}
            </SidebarSection>
          )}

          {/* Sectiunea Pipelines */}
          {!sidebarCollapsed && (
            <SidebarSection title="Pipelines" icon={<Briefcase className="h-3 w-3" />}>
              <div className="space-y-1">
                {pipeNames.map((p) => {
                  const slug = toSlug(p)
                  const href = `/leads/${slug}`
                  const active = pathname === href
                  return (
                    <div key={slug} className="group">
                      <Link
                        href={href}
                        className={cn(
                          "flex items-center justify-between px-3 py-2 rounded-lg hover:bg-sidebar-accent transition-colors",
                          active && "bg-blue-800 dark:bg-blue-900 text-white"
                        )}
                      >
                        <div className="flex items-center gap-3">
                          {active ? (
                            <div className="text-white">
                              {getPipelineIcon(p)}
                            </div>
                          ) : (
                            getPipelineIcon(p)
                          )}
                          <span className="truncate">{p}</span>
                        </div>
                        
                        {canManage && (
                          <button
                            type="button"
                            onClick={(e) => openDelete(p, e)}
                            className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-background/20 transition-opacity"
                            aria-label={`Delete ${p}`}
                            title="Delete pipeline"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        )}
                      </Link>
                    </div>
                  )
                })}
                
                {canManage && (
                  <button
                    onClick={() => setCreateOpen(true)}
                    className="flex items-center gap-3 px-3 py-2 w-full text-sm text-muted-foreground hover:text-foreground hover:bg-sidebar-accent rounded-lg transition-colors"
                  >
                    <Plus className="h-4 w-4" />
                    <span>Adaugă pipeline</span>
                  </button>
                )}
              </div>
            </SidebarSection>
          )}

          {/* Sectiunea Administrare */}
          {!sidebarCollapsed && (isOwner || isAdmin) && (
            <SidebarSection title="Administrare" icon={<Shield className="h-3 w-3" />} defaultCollapsed={true}>
              {isOwner && (
                <Link
                  href="/admins"
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-sidebar-accent transition-colors",
                    pathname === "/admins" && "bg-blue-800 dark:bg-blue-900 text-white"
                  )}
                >
                  <Shield className="h-4 w-4" />
                  <span>Admins</span>
                </Link>
              )}
              
              {(isOwner || isAdmin) && (
                <Link
                  href="/configurari/catalog"
                  prefetch={false}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-sidebar-accent transition-colors",
                    pathname === "/configurari/catalog" &&