'use client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useTerminalStore } from '@/lib/store'
import type { Position, PriceAlert } from '@/lib/store'
import { ErrorBoundary } from './ErrorBoundary'

const BACKUP_KEY = 'bbg-portfolio-backup'

// ── Portfolio backup helpers ───────────────────────────────────────────────────
// Independent of Zustand persist — written on every position change,
// read as a last resort if the main store loads empty.

function saveBackup(positions: Position[], watchlist: string[], alerts: PriceAlert[]) {
  try {
    localStorage.setItem(BACKUP_KEY, JSON.stringify({ positions, watchlist, alerts, savedAt: Date.now() }))
  } catch (_) {}
}

function loadBackup(): { positions: Position[]; watchlist: string[]; alerts: PriceAlert[] } | null {
  try {
    const raw = localStorage.getItem(BACKUP_KEY)
    if (!raw) return null
    const b = JSON.parse(raw)
    if (!Array.isArray(b?.positions) || b.positions.length === 0) return null
    return { positions: b.positions, watchlist: b.watchlist ?? [], alerts: b.alerts ?? [] }
  } catch (_) { return null }
}

// ── StoreHydrator ─────────────────────────────────────────────────────────────
// Runs once on mount. Loads persisted state, then cross-checks against
// the independent backup so a Zustand failure never silently empties the portfolio.
function StoreHydrator() {
  useEffect(() => {
    // Step 1: manually read main store key before rehydrate() touches it
    let rescued: { positions?: Position[]; watchlist?: string[]; alerts?: PriceAlert[] } = {}
    try {
      const raw = localStorage.getItem('bbg-terminal')
      if (raw) {
        const s = (JSON.parse(raw)?.state) ?? JSON.parse(raw)
        if (Array.isArray(s?.positions)) rescued.positions = s.positions
        if (Array.isArray(s?.watchlist)) rescued.watchlist = s.watchlist
        if (Array.isArray(s?.alerts))    rescued.alerts    = s.alerts
      }
    } catch (_) {}

    // Step 2: normal Zustand rehydration
    try {
      useTerminalStore.persist.rehydrate()
    } catch (_) {
      if (rescued.positions !== undefined) {
        useTerminalStore.setState({
          positions: rescued.positions,
          ...(rescued.watchlist ? { watchlist: rescued.watchlist } : {}),
          ...(rescued.alerts    ? { alerts:    rescued.alerts    } : {}),
        })
      }
    }

    // Step 3: if store still has no positions, try the independent backup
    // (guards against Zustand internals silently resetting state)
    setTimeout(() => {
      const state = useTerminalStore.getState()
      if (state.positions.length === 0) {
        const backup = loadBackup()
        if (backup && backup.positions.length > 0) {
          useTerminalStore.setState({
            positions: backup.positions,
            watchlist: backup.watchlist.length > 0 ? backup.watchlist : state.watchlist,
            alerts:    backup.alerts,
          })
        }
      }
    }, 100)
  }, [])
  return null
}

// ── PortfolioGuard ────────────────────────────────────────────────────────────
// Watches positions and writes the independent backup on every change.
// Separate from StoreHydrator so it subscribes AFTER hydration.
function PortfolioGuard() {
  const positions = useTerminalStore(s => s.positions)
  const watchlist = useTerminalStore(s => s.watchlist)
  const alerts    = useTerminalStore(s => s.alerts)

  useEffect(() => {
    // Only overwrite backup when positions are non-empty — never with empty array
    if (positions.length > 0) {
      saveBackup(positions, watchlist, alerts)
    }
  }, [positions, watchlist, alerts])

  return null
}

// ── Providers ─────────────────────────────────────────────────────────────────
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
      <PortfolioGuard />
      <ErrorBoundary>{children}</ErrorBoundary>
    </QueryClientProvider>
  )
}
