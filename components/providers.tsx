'use client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useTerminalStore } from '@/lib/store'
import type { Position, PriceAlert } from '@/lib/store'
import { ErrorBoundary } from './ErrorBoundary'

function StoreHydrator() {
  useEffect(() => {
    // ── Step 1: Manually rescue critical user data BEFORE rehydrate() runs.
    // If rehydrate() throws, we fall back to what we extracted here instead of
    // wiping localStorage (which destroys holdings irreversibly).
    let rescued: {
      positions?: Position[]
      watchlist?: string[]
      alerts?: PriceAlert[]
    } = {}

    try {
      const raw = localStorage.getItem('bbg-terminal')
      if (raw) {
        const parsed = JSON.parse(raw)
        // Zustand persist wraps state under a "state" key
        const s = parsed?.state ?? parsed
        if (Array.isArray(s?.positions)) rescued.positions = s.positions
        if (Array.isArray(s?.watchlist)) rescued.watchlist = s.watchlist
        if (Array.isArray(s?.alerts))    rescued.alerts    = s.alerts
      }
    } catch (_) {
      // Can't even read localStorage — nothing to rescue
    }

    // ── Step 2: Attempt normal rehydration
    try {
      useTerminalStore.persist.rehydrate()
    } catch (_) {
      // rehydrate() failed — restore rescued data instead of wiping
      // This preserves holdings even if the stored schema is unexpected
      useTerminalStore.setState({
        ...(rescued.positions !== undefined ? { positions: rescued.positions } : {}),
        ...(rescued.watchlist !== undefined ? { watchlist: rescued.watchlist } : {}),
        ...(rescued.alerts    !== undefined ? { alerts:    rescued.alerts    } : {}),
      })
    }
  }, [])
  return null
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 10_000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      })
  )
  return (
    <QueryClientProvider client={client}>
      <StoreHydrator />
      <ErrorBoundary>{children}</ErrorBoundary>
    </QueryClientProvider>
  )
}
