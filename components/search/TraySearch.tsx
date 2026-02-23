'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Search, Loader2, Package, FileText, User, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { TraySearchResult } from '@/lib/supabase/traySearchOperations'
import type { UnifiedSearchResult } from '@/lib/supabase/unifiedSearchServer'

const CACHE_TTL_MS = 0  // Disabled - cauzează probleme cu rezultatele
const TYPING_INDICATOR_DELAY = 0  // Disabled - cauzează flickering

interface TraySearchProps {
  onSelectTray?: (result: TraySearchResult | UnifiedSearchResult) => void
  placeholder?: string
  className?: string
  /** Mod controlat: când sunt setate, input-ul folosește value și onValueChange în loc de state intern */
  value?: string
  onValueChange?: (value: string) => void
}

export function TraySearch({ onSelectTray, placeholder, className, value: controlledValue, onValueChange }: TraySearchProps) {
  const [internalQuery, setInternalQuery] = useState('')
  const isControlled = controlledValue !== undefined && onValueChange !== undefined
  const query = isControlled ? (controlledValue ?? '') : internalQuery
  const setQuery = isControlled ? onValueChange : setInternalQuery

  const [results, setResults] = useState<UnifiedSearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const resultsRef = useRef<UnifiedSearchResult[]>([])

  // Update ref când results se schimbă
  useEffect(() => {
    resultsRef.current = results
  }, [results])

  const performSearch = useCallback(async (searchQuery: string) => {
    if (!searchQuery || searchQuery.trim().length < 2) {
      setResults([])
      setError(null)
      return
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    abortControllerRef.current = new AbortController()
    const signal = abortControllerRef.current.signal

    setLoading(true)
    setError(null)

    try {
      const response = await fetch(
        `/api/search/unified?q=${encodeURIComponent(searchQuery.trim())}`,
        { signal }
      )
      
      if (!response.ok) {
        const text = await response.text()
        throw new Error(`HTTP ${response.status}: ${text.slice(0, 100)}`)
      }

      const data = await response.json()

      if (signal.aborted) return

      if (!data.success) {
        setError(data.error || 'Eroare la căutare')
        setResults([])
      } else {
        const raw = data.data
        const results = Array.isArray(raw) ? raw : []
        setResults(results)
        setSelectedIndex(results.length > 0 ? 0 : -1)
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') return
      const errorMsg = err?.message || 'Eroare la conectare'
      setError(errorMsg)
      setResults([])
    } finally {
      if (!signal.aborted) setLoading(false)
    }
  }, [setError, setResults, setLoading])

  const handleInputChange = useCallback((value: string) => {
    setQuery(value)
    setIsOpen(true)
    setSelectedIndex(-1)
    performSearch(value)
  }, [performSearch, setQuery])

  const handleSelectResult = useCallback((result: UnifiedSearchResult) => {
    setQuery('')
    setResults([])
    setIsOpen(false)
    setSelectedIndex(-1)
    onSelectTray?.(result)
  }, [onSelectTray, setQuery])

  // Click outside handler
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen || resultsRef.current.length === 0) return
      
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex(prev => (prev + 1) % resultsRef.current.length)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex(prev => prev <= 0 ? resultsRef.current.length - 1 : prev - 1)
      } else if (e.key === 'Enter' && selectedIndex >= 0) {
        e.preventDefault()
        const result = resultsRef.current[selectedIndex]
        if (result) handleSelectResult(result)
      } else if (e.key === 'Escape') {
        setIsOpen(false)
        setSelectedIndex(-1)
      }
    }
    
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, selectedIndex, handleSelectResult])

  // Cleanup pentru abort controller
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, [])

  const handleClear = () => {
    setQuery('')
    setResults([])
    setError(null)
    setSelectedIndex(-1)
    inputRef.current?.focus()
  }

  return (
    <div ref={containerRef} className={cn('relative w-full', className)}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          ref={inputRef}
          type="text"
          placeholder={placeholder || 'Caută tăviță (număr, serial, brand)...'}
          value={query}
          onChange={(e) => handleInputChange(e.target.value)}
          onFocus={() => query && setIsOpen(true)}
          className="pl-10 pr-10"
          onKeyDown={(e) => {
            // Previne cursor movement când navigăm rezultatele
            if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && isOpen) {
              e.preventDefault()
            }
          }}
        />
        {loading && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-blue-500" />
        )}
        {query && !loading && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            ✕
          </button>
        )}
      </div>

      {/* Dropdown rezultate */}
      {isOpen && (query.length > 0) && (
        <Card className="absolute top-full left-0 right-0 mt-2 z-50 max-h-96 overflow-y-auto shadow-xl">
          <CardContent className="p-0">
            {loading && (
              <div className="p-8 text-center">
                <Loader2 className="h-5 w-5 animate-spin mx-auto text-blue-500" />
                <p className="text-sm text-muted-foreground mt-2">Se caută...</p>
              </div>
            )}

            {error && (
              <div className="p-4 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/20">
                {error}
              </div>
            )}

            {!loading && !error && results.length === 0 && query.length >= 2 && (
              <div className="p-8 text-center">
                <Package className="h-10 w-10 mx-auto text-muted-foreground opacity-50" />
                <p className="text-sm text-muted-foreground mt-2">Nu s-a găsit nimic</p>
              </div>
            )}

            {!loading && results.length > 0 && (
              <div className="divide-y divide-border">
                {results.map((result, index) => (
                  <button
                    key={`${result.type}:${result.id}`}
                    type="button"
                    onClick={() => handleSelectResult(result)}
                    onMouseEnter={() => setSelectedIndex(index)}
                    className={cn(
                      'w-full text-left p-3 transition-colors flex items-center gap-3',
                      selectedIndex === index ? 'bg-accent' : 'hover:bg-accent/50'
                    )}
                  >
                    <div className={cn(
                      'flex-shrink-0 h-9 w-9 rounded-lg flex items-center justify-center',
                      result.type === 'lead' && 'bg-green-100 dark:bg-green-900/30',
                      result.type === 'service_file' && 'bg-amber-100 dark:bg-amber-900/30',
                      result.type === 'tray' && 'bg-blue-100 dark:bg-blue-900/30'
                    )}>
                      {result.type === 'lead' && <User className="h-4 w-4 text-green-600 dark:text-green-400" />}
                      {result.type === 'service_file' && <FileText className="h-4 w-4 text-amber-600 dark:text-amber-400" />}
                      {result.type === 'tray' && <Package className="h-4 w-4 text-blue-600 dark:text-blue-400" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{result.title}</p>
                      {result.subtitle && (
                        <p className="text-xs text-muted-foreground truncate mt-0.5">{result.subtitle}</p>
                      )}
                      {(result.pipelineName || result.stageName) && (
                        <p className="text-[11px] text-muted-foreground/90 truncate mt-0.5">
                          {[result.pipelineName, result.stageName].filter(Boolean).join(' · ')}
                        </p>
                      )}
                    </div>
                    <span className={cn(
                      'flex-shrink-0 text-[10px] font-medium px-2 py-1 rounded-md',
                      result.type === 'lead' && 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
                      result.type === 'service_file' && 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
                      result.type === 'tray' && 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                    )}>
                      {result.type === 'lead' && 'Lead'}
                      {result.type === 'service_file' && 'Fișă'}
                      {result.type === 'tray' && 'Tăviță'}
                    </span>
                    <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  </button>
                  ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
