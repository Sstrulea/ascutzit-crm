'use client'

import Link from 'next/link'
import { Search, Menu, ShoppingCart, Phone, Package } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
interface MobileBoardHeaderProps {
  pipelineName: string
  pipelines: string[]
  onPipelineChange: (pipeline: string) => void
  /** Căutare clasică: input în header (fără prompt/alert). */
  searchQuery?: string
  onSearchQueryChange?: (value: string) => void
  sidebarContent?: React.ReactNode
}

export function MobileBoardHeader({
  pipelineName,
  pipelines,
  onPipelineChange,
  searchQuery = '',
  onSearchQueryChange,
  sidebarContent,
}: MobileBoardHeaderProps) {
  return (
    <header 
      className="sticky top-0 z-20 bg-background border-b md:hidden"
      style={{ paddingTop: 'env(safe-area-inset-top, 0)' }}
    >
      <div className="flex flex-col gap-3 px-4 py-3.5">
        {/* Rând 1: Pipeline selector + Meniu */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex-1 min-w-0">
            <Select value={pipelineName} onValueChange={onPipelineChange}>
              <SelectTrigger className="w-full min-h-[44px] h-11 rounded-xl text-base touch-manipulation">
                <SelectValue>
                  <span className="font-semibold truncate">{pipelineName}</span>
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {pipelines.map((pipeline) => (
                  <SelectItem key={pipeline} value={pipeline}>
                    {pipeline}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center shrink-0">
            {sidebarContent && (
              <Sheet>
                <SheetTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-11 w-11 min-h-[44px] min-w-[44px] p-0 rounded-xl touch-manipulation"
                    title="Meniu"
                    aria-label="Meniu"
                  >
                    <Menu className="h-5 w-5" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-[min(280px,85vw)] p-0 max-h-screen">
                  <SheetHeader className="sr-only">
                    <SheetTitle className="sr-only">Meniu navigare</SheetTitle>
                  </SheetHeader>
                  {sidebarContent}
                </SheetContent>
              </Sheet>
            )}
          </div>
        </div>

        {/* Acces rapid: Vânzări, Receptie, Tehnician (tăviță) */}
        <div className="flex gap-2 overflow-x-auto pb-0.5 -mx-1 scrollbar-hide">
          {pipelines.some(p => p.toLowerCase().includes('vanzari')) && (
            <Link
              href="/leads/vanzari"
              className={cn(
                'shrink-0 inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors touch-manipulation',
                pipelineName.toLowerCase().includes('vanzari')
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted/70 text-muted-foreground hover:bg-muted'
              )}
            >
              <ShoppingCart className="h-3.5 w-3.5" />
              Vânzări
            </Link>
          )}
          {pipelines.some(p => p.toLowerCase().includes('receptie')) && (
            <Link
              href="/leads/receptie"
              className={cn(
                'shrink-0 inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors touch-manipulation',
                pipelineName.toLowerCase().includes('receptie')
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted/70 text-muted-foreground hover:bg-muted'
              )}
            >
              <Phone className="h-3.5 w-3.5" />
              Receptie
            </Link>
          )}
          <Link
            href="/dashboard/tehnician"
            className="shrink-0 inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium bg-muted/70 text-muted-foreground hover:bg-muted transition-colors touch-manipulation"
          >
            <Package className="h-3.5 w-3.5" />
            Tehnician
          </Link>
        </div>

        {/* Rând 3: Căutare */}
        {onSearchQueryChange && (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              type="search"
              inputMode="search"
              placeholder="Caută nume, email, telefon, tăviță, serial, brand..."
              value={searchQuery}
              onChange={(e) => onSearchQueryChange(e.target.value)}
              className="pl-10 min-h-[44px] h-11 rounded-xl text-base touch-manipulation"
              aria-label="Căutare"
            />
          </div>
        )}
      </div>
    </header>
  )
}
