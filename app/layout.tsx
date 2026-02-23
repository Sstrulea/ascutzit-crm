import type React from "react"
import type { Metadata } from "next"
import { GeistSans } from "geist/font/sans"
import { GeistMono } from "geist/font/mono"
import { Analytics } from "@vercel/analytics/next"
import { Suspense } from "react"
import { QueryProvider } from '@/lib/providers/query-provider'
import { AuthProvider } from '@/lib/contexts/AuthContext'
import { TrackingProvider } from '@/components/tracking/TrackingProvider'
import "./globals.css"

export const metadata: Metadata = {
  title: "CRM - Ascutzit.ro",
  description: "CRM system for managing leads and sales pipeline",
  generator: "v0.app",
  icons: {
    icon: '/logo.png',
    apple: '/logo.png',
  },
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <head>
        {supabaseUrl ? (
          <>
            <link rel="preconnect" href={supabaseUrl} />
            <link rel="dns-prefetch" href={supabaseUrl} />
          </>
        ) : null}
      </head>
      <body className={`font-sans ${GeistSans.variable} ${GeistMono.variable}`}>
<AuthProvider>
        <QueryProvider>
            <TrackingProvider sendToApi="/api/tracking" />
            <Suspense fallback={null}>{children}</Suspense>
            <Analytics />
          </QueryProvider>
        </AuthProvider>
      </body>
    </html>
  )
}
