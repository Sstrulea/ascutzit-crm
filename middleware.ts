/**
 * Authentication middleware.
 *
 * For protected routes: call getSession() to refresh Supabase session cookies
 * before render. Without this, after login redirect, cookies may not be read
 * correctly by client and user remains null → redirect to sign-in.
 *
 * The actual redirect to sign-in is done in app/(crm)/layout.tsx from useAuth().
 */

import { createServerClient } from '@supabase/ssr'
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

export async function middleware(req: NextRequest) {
  if (req.method === "HEAD" || req.method === "OPTIONS") {
    return NextResponse.next()
  }

  const { pathname } = req.nextUrl
  if (pathname.startsWith('/api/') ||
      pathname.startsWith('/_next/') ||
      pathname.startsWith('/auth/') ||
      pathname.includes('.')) {
    return NextResponse.next()
  }

  const res = NextResponse.next()
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseAnonKey) {
    return res
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return req.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          res.cookies.set(name, value, options)
        })
      },
    },
  })

  // Refresh session – update cookies in response.
  // Timeout 3s to avoid blocking response if Supabase is slow.
  await Promise.race([
    supabase.auth.getSession(),
    new Promise((r) => setTimeout(r, 3000)),
  ]).catch(() => {})

  return res
}

// Protect only real app pages (exclude API routes, auth routes, static files)
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - auth (auth routes)
     */
    '/((?!api|_next/static|_next/image|favicon.ico|auth).*)',
  ],
}