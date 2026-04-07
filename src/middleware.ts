import { NextResponse, type NextRequest } from 'next/server'
import { getSessionFromRequest } from '@/lib/auth'

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname
  const session = await getSessionFromRequest(request)

  // Redirect unauthenticated users from protected routes
  if (!session && (path.startsWith('/dashboard') || path.startsWith('/admin'))) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('redirect', path)
    return NextResponse.redirect(url)
  }

  // Redirect authenticated users away from auth pages
  if (session && (path === '/login' || path === '/signup')) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  // Admin route protection
  if (path.startsWith('/admin') && session && session.role !== 'admin') {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/dashboard/:path*', '/admin/:path*', '/login', '/signup'],
}
