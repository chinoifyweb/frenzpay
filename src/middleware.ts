import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  // If env vars missing, let the request through
  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.next()
  }

  let supabaseResponse = NextResponse.next({ request })

  try {
    const supabase = createServerClient(supabaseUrl, supabaseKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    })

    const {
      data: { user },
    } = await supabase.auth.getUser()

    const path = request.nextUrl.pathname

    // Redirect unauthenticated users from protected routes
    if (!user && (path.startsWith('/dashboard') || path.startsWith('/admin'))) {
      const url = request.nextUrl.clone()
      url.pathname = '/login'
      url.searchParams.set('redirect', path)
      return NextResponse.redirect(url)
    }

    // Redirect authenticated users away from auth pages
    if (user && (path === '/login' || path === '/signup')) {
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }

    // Admin route protection
    if (path.startsWith('/admin') && user) {
      try {
        const { data: profile, error } = await supabase
          .from('frenz_users')
          .select('role')
          .eq('id', user.id)
          .single()

        if (error || !profile || profile.role !== 'admin') {
          return NextResponse.redirect(new URL('/dashboard', request.url))
        }
      } catch {
        // If DB query fails, redirect to dashboard instead of crashing
        return NextResponse.redirect(new URL('/dashboard', request.url))
      }
    }

    return supabaseResponse
  } catch {
    // If anything fails, let the request through rather than crashing
    return NextResponse.next()
  }
}

export const config = {
  matcher: ['/dashboard/:path*', '/admin/:path*', '/login', '/signup'],
}
