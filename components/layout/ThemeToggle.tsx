'use client'

import { useTheme } from 'next-themes'
import { useUserPreferences } from '@/hooks/useUserPreferences'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Moon, Sun, Monitor } from 'lucide-react'
import { useEffect, useState } from 'react'

type ThemeValue = 'light' | 'dark' | 'system'

export function ThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useTheme()
  const { updatePreferences } = useUserPreferences()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const handleChange = (value: ThemeValue) => {
    setTheme(value)
    updatePreferences({ theme: value })
  }

  if (!mounted) {
    return (
      <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Temă">
        <Sun className="h-4 w-4" />
      </Button>
    )
  }

  const currentTheme = (theme ?? 'system') as ThemeValue

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Alege tema (clar / întunecat / sistem)">
          {resolvedTheme === 'dark' ? (
            <Moon className="h-4 w-4" />
          ) : (
            <Sun className="h-4 w-4" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => handleChange('light')}>
          <Sun className="mr-2 h-4 w-4" />
          <span>Clar</span>
          {currentTheme === 'light' && <span className="ml-2 text-xs text-muted-foreground">✓</span>}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleChange('dark')}>
          <Moon className="mr-2 h-4 w-4" />
          <span>Întunecat</span>
          {currentTheme === 'dark' && <span className="ml-2 text-xs text-muted-foreground">✓</span>}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleChange('system')}>
          <Monitor className="mr-2 h-4 w-4" />
          <span>Sistem</span>
          {currentTheme === 'system' && <span className="ml-2 text-xs text-muted-foreground">✓</span>}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
