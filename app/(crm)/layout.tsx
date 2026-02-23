'use client'

import { Suspense } from 'react'
import { AppSidebar as Sidebar } from '@/components/layout'
import { SidebarProvider } from '@/lib/contexts/SidebarContext'
import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { Toaster } from '@/components/ui/sonner'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Menu, Search } from 'lucide-react'
import { AuthStatus } from '@/components/auth'
import { useAuth } from '@/lib/contexts/AuthContext'
import { usePipelinesCache } from '@/hooks/usePipelinesCache'
import { SmartTraySearch } from '@/components/search/SmartTraySearch'

export default function CrmShell({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const { user, loading: authLoading } = useAuth()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false)
  const { getPipelines } = usePipelinesCache()

  // Redirect la login dacă nu este autentificat (sursă unică: AuthContext, fără getSession/onAuthStateChange aici)
  useEffect(() => {
    if (!authLoading && !user) {
      const signInUrl = pathname ? `/auth/sign-in?next=${encodeURIComponent(pathname)}` : '/auth/sign-in'
      router.replace(signInUrl)
    }
  }, [authLoading, user, router, pathname])

  // Prefetch pipelines la prima încărcare (sidebar-ul le afișează pe toate paginile)
  useEffect(() => {
    if (authLoading || !user) return
    getPipelines().catch(() => {})
  }, [authLoading, user, getPipelines])

  // Închide meniul mobil și căutarea mobil când se schimbă ruta (ex. după selectare rezultat)
  useEffect(() => {
    setMobileMenuOpen(false)
    setMobileSearchOpen(false)
  }, [pathname])

  // [DEV] Contor requesturi Supabase – activează cu NEXT_PUBLIC_DEBUG_SUPABASE_REQUESTS=true
  useEffect(() => {
    if (
      process.env.NODE_ENV === 'development' &&
      process.env.NEXT_PUBLIC_DEBUG_SUPABASE_REQUESTS === 'true'
    ) {
      import('@/lib/supabase/dev-request-counter').then((m) =>
        m.initSupabaseRequestCounter()
      )
    }
  }, [])

  // Așteptăm să se încarce Auth (o singură sursă: AuthContext)
  if (authLoading) return null

  // Neautentificat -> null până la redirect (redirect-ul este în useEffect)
  if (!user) return null

  return (
    <div className="h-screen flex flex-col min-w-0 overflow-hidden w-full max-w-[100vw]">
      {/* Header cu SmartSearch tăviță și notificări - doar pentru desktop */}
      <header className="hidden md:flex items-center justify-between gap-4 px-6 py-3 border-b bg-background shrink-0">
        <div className="shrink-0 w-24 min-w-0" aria-hidden />
        <div className="flex-1 max-w-md min-w-[200px]">
          <Suspense fallback={<div className="h-10 w-full rounded-md border bg-muted/50 animate-pulse" />}>
            <SmartTraySearch className="w-full" />
          </Suspense>
        </div>
        <AuthStatus />
      </header>

      {/* Container principal cu sidebar și content */}
      <SidebarProvider>
      <div className="flex flex-1 min-w-0 overflow-hidden w-full">
        {/* Sidebar pentru desktop */}
        <div className="hidden md:block shrink-0">
          <Sidebar />
        </div>
        
        {/* Meniu mobil - căutare globală + hamburger */}
        <div className="md:hidden fixed top-0 left-0 right-0 z-50 bg-background border-b shadow-sm">
          <div className="flex items-center justify-between gap-2 p-3 h-12">
            <Button
              variant="ghost"
              size="sm"
              className="flex-1 max-w-[280px] justify-start gap-2 text-muted-foreground font-normal h-9"
              onClick={() => setMobileSearchOpen(true)}
            >
              <Search className="h-4 w-4 shrink-0" />
              <span className="truncate">Caută lead, fișă, tăviță...</span>
            </Button>
            <div className="flex items-center gap-1 shrink-0">
              <AuthStatus />
              <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-9 w-9 p-0">
                    <Menu className="h-5 w-5" />
                    <span className="sr-only">Deschide meniu</span>
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-[280px] p-0 bg-sidebar">
                  <div className="h-full overflow-y-auto scrollbar-sidebar-hide">
                    <Sidebar />
                  </div>
                </SheetContent>
              </Sheet>
            </div>
          </div>
        </div>

        {/* Sheet căutare globală pe mobil – la selectare rezultat: redirecționare + deschidere automată */}
        <Sheet open={mobileSearchOpen} onOpenChange={setMobileSearchOpen}>
          <SheetContent side="top" className="h-[85vh] flex flex-col p-0 gap-0">
            <div className="p-3 border-b shrink-0">
              <Suspense fallback={<div className="h-10 w-full rounded-md border bg-muted/50 animate-pulse" />}>
                <SmartTraySearch
                  className="w-full"
                  onAfterSelect={() => setMobileSearchOpen(false)}
                />
              </Suspense>
            </div>
            <p className="px-3 py-2 text-xs text-muted-foreground border-b">
              Caută după nume, email, telefon, nr. tăviță, serial, brand. La selectare ești dus direct la lead/fișă/tăviță.
            </p>
          </SheetContent>
        </Sheet>
        
        {/* Main content - fără scroll global; fiecare pagină gestionează overflow intern (ex. Kanban: scroll per stage) */}
        <main className="flex-1 min-h-0 min-w-0 overflow-hidden pt-12 md:pt-0 flex flex-col">{children}</main>
      </div>
      </SidebarProvider>
      <Toaster />
    </div>
  )
}
