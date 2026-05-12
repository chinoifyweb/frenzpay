'use client'

/**
 * useMe — authenticated-user context for the dashboard.
 *
 * Mount <MeProvider> in apps/web/src/app/dashboard/layout.tsx and consume
 * `useMe()` from any client component below it. Fetches /api/auth/me once
 * on mount + exposes a refresh() for updates (after profile edits etc).
 *
 * Shape matches what /api/auth/me returns — keep in sync with that route.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

export interface Me {
  id: string
  email: string
  firstName: string | null
  lastName: string | null
  displayName: string | null
  avatarUrl: string | null
  kycTier: 'T0' | 'T1' | 'T2' | 'T3'
  kycStatus: string
  emailVerified: boolean
  phoneVerified: boolean
  mfaRequired: boolean
  status: string
  createdAt: string
  frenzTag: { tag: string; isVerified: boolean } | null
}

interface MeContextValue {
  me: Me | null
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
}

const MeContext = createContext<MeContextValue | undefined>(undefined)

export function MeProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchMe = useCallback(async () => {
    setError(null)
    try {
      const res = await fetch('/api/auth/me', { cache: 'no-store' })
      if (res.status === 401) {
        // Middleware normally redirects, but fall back here just in case.
        setMe(null)
        return
      }
      // Guard against non-JSON responses (proxy error pages on 5xx/timeouts).
      // JSON.parse on an HTML body throws "Unexpected token '<'" which would
      // bubble up as a useless error string in setError. Translate instead.
      const contentType = res.headers.get('content-type') ?? ''
      const isJson = contentType.includes('application/json')
      if (!isJson) {
        if (res.status === 0 || res.status >= 500 || res.status === 408 || res.status === 504) {
          throw new Error('Server is slow or unreachable, please try again.')
        }
        throw new Error(`Unexpected error (HTTP ${res.status}).`)
      }
      if (!res.ok) throw new Error(`Failed to load profile (${res.status})`)
      const json = ((await res.json().catch(() => null)) ?? {}) as { user?: Me } | Me
      // /api/auth/me wraps the user in { user: {...} }; accept either shape so
      // a future flattening of that endpoint doesn't break this hook.
      const user: Me | null =
        json && typeof json === 'object' && 'user' in json && json.user
          ? json.user
          : ((json as Me).email ? (json as Me) : null)
      setMe(user)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load profile')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchMe()
  }, [fetchMe])

  const value = useMemo(
    () => ({ me, loading, error, refresh: fetchMe }),
    [me, loading, error, fetchMe],
  )

  return <MeContext.Provider value={value}>{children}</MeContext.Provider>
}

/**
 * Consume the authenticated user. Throws if used outside <MeProvider> so
 * a missing provider shows up at render time, not silently as null data.
 */
export function useMe(): MeContextValue {
  const ctx = useContext(MeContext)
  if (!ctx) {
    throw new Error('useMe() called outside <MeProvider>')
  }
  return ctx
}

/** Utility: a friendly display name falling back to email local-part. */
export function formatDisplayName(me: Me | null): string {
  if (!me) return ''
  if (me.displayName) return me.displayName
  const first = me.firstName ?? ''
  const last = me.lastName ?? ''
  const joined = `${first} ${last}`.trim()
  if (joined) return joined
  return me.email.split('@')[0] ?? me.email
}

/** Utility: safe initials for avatar fallback. */
export function formatInitials(me: Me | null): string {
  if (!me) return '?'
  const first = (me.firstName ?? '').trim()[0] ?? ''
  const last = (me.lastName ?? '').trim()[0] ?? ''
  const initials = (first + last).toUpperCase()
  if (initials) return initials
  const email = me.email.trim()
  return (email[0] ?? '?').toUpperCase()
}
