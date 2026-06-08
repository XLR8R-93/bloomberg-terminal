'use client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useTerminalStore } from '@/lib/store'
import { ErrorBoundary } from './ErrorBoundary'

function StoreHydrator() {
  useEffect(() => {
    try {
      useTerminalStore.persist.rehydrate()
    } catch (_) {
      // corrupt localStorage — wipe and start fresh
      try { localStorage.removeItem('bbg-terminal') } catch (_2) {}
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
