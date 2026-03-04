'use client'

import * as React from 'react'
import {
  ThemeProvider as NextThemesProvider,
  type ThemeProviderProps,
} from 'next-themes'

const defaultProps: Partial<ThemeProviderProps> = {
  attribute: 'class',
  defaultTheme: 'system',
  enableSystem: true,
  storageKey: 'crm-theme',
}

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return (
    <NextThemesProvider {...defaultProps} {...props}>
      {children}
    </NextThemesProvider>
  )
}
