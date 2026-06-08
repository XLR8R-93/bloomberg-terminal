'use client'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { useTerminalStore } from '@/lib/store'
import { useQuoteWebSocket } from '@/lib/hooks/useQuoteWebSocket'

interface Quote { c: number; d: number; dp: number; h: number; l: number; o: number; pc: number }
interface Metrics { metric: Record<string, number | null> }
interface Profile { marketCapitalization: number; name: string }

function fmt(n: number | undefined | null, decimals = 2) {
  if (n == null || isNaN(n)) return '—'
  return n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

function fmtMktCap(n: number | null | undefined) {
  if (!n) return '—'
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}T`
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}B`
  return `$${n.toFixed(0)}M`
}

function fmtVol(n: number | null | undefined) {
  if (!n) return '—'
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`
  return String(Math.round(n))
}

function Divider() {
  return <div style={{ width: 1, height: 28, background: '#1f1f1f', flexShrink: 0 }} />
}

function Cell({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ flexShrink: 0 }}>
      <div style={{ color: '#444', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
      <div style={{ color: color || '#cccccc', fontSize: 11, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
    </div>
  )
}

// Flashes background briefly on price change
function LivePrice({ price, direction }: { price: number; direction: 'up' | 'down' | null }) {
  const [flash, setFlash] = useState(false)
  const prevPrice = useRef(price)

  useEffect(() => {
    if (price !== prevPrice.current) {
      prevPrice.current = price
      setFlash(true)
      const t = setTimeout(() => setFlash(false), 400)
      return () => clearTimeout(t)
    }
  }, [price])

  const flashColor = direction === 'up' ? 'rgba(51,255,102,0.15)' : direction === 'down' ? 'rgba(255,59,59,0.15)' : 'transparent'

  return (
    <div style={{
      fontSize: 17, fontWeight: 'bold', color: '#eeeeee',
      flexShrink: 0, fontVariantNumeric: 'tabular-nums',
      background: flash ? flashColor : 'transparent',
      padding: '0 4px',
      transition: 'background 0.4s ease',
    }}>
      {fmt(price)}
    </div>
  )
}

export function QuoteHeader() {
  const { activeTicker, setActiveView } = useTerminalStore()

  // Polling fallback (also populates React Query cache on load)
  const { data: quote, isLoading } = useQuery<Quote>({
    queryKey: ['quote', activeTicker],
    queryFn: () => fetch(`/api/finnhub/quote?symbol=${activeTicker}`).then((r) => r.json()),
    refetchInterval: 20_000,
  })

  // Live WebSocket tick for active ticker
  const tick = useQuoteWebSocket(activeTicker)

  const { data: metrics } = useQuery<Metrics>({
    queryKey: ['metrics', activeTicker],
    queryFn: () => fetch(`/api/finnhub/metrics?symbol=${activeTicker}`).then((r) => r.json()),
    staleTime: 60 * 60_000,
  })

  const { data: profile } = useQuery<Profile>({
    queryKey: ['profile', activeTicker],
    queryFn: () => fetch(`/api/finnhub/profile?symbol=${activeTicker}`).then((r) => r.json()),
    staleTime: 24 * 60 * 60_000,
  })

  const m = metrics?.metric || {}

  // Use WebSocket price if available, else fall back to polled quote
  const livePrice = tick?.price ?? quote?.c
  const liveDir = tick?.direction ?? null

  // Change is always relative to REST quote (prev close)
  const change = livePrice && quote?.pc ? livePrice - quote.pc : quote?.d
  const changePct = livePrice && quote?.pc && quote.pc !== 0 ? ((livePrice - quote.pc) / quote.pc) * 100 : quote?.dp
  const up = change != null ? change >= 0 : null
  const changeColor = up === null ? '#555' : up ? 'var(--green)' : 'var(--red)'

  const vol10dNum = m['10DayAverageTradingVolume'] ? m['10DayAverageTradingVolume']! * 1e6 : null

  return (
    <div style={{
      background: '#050505',
      borderBottom: '1px solid #1f1f1f',
      padding: '0 8px',
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      height: 44,
      flexShrink: 0,
      overflow: 'hidden',
    }}>
      <button
        onClick={() => setActiveView('DES')}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: '#4d9fff', fontSize: 15, fontWeight: 'bold',
          fontFamily: 'inherit', padding: 0, flexShrink: 0, minWidth: 52,
        }}
      >
        {activeTicker}
      </button>

      {isLoading && !livePrice ? (
        <div className="skeleton" style={{ width: 280, height: 18, borderRadius: 0 }} />
      ) : livePrice ? (
        <>
          <LivePrice price={livePrice} direction={liveDir} />

          <div style={{ display: 'flex', flexDirection: 'column', fontSize: 11, flexShrink: 0 }}>
            <span style={{ color: changeColor }}>
              {up ? '+' : ''}{fmt(change)}
            </span>
            <span style={{ color: changeColor }}>
              {up ? '+' : ''}{fmt(changePct)}%
            </span>
          </div>

          {/* WS live indicator */}
          {tick && (
            <div title="Live WebSocket feed" style={{
              width: 6, height: 6, borderRadius: '50%',
              background: 'var(--green)', flexShrink: 0,
              boxShadow: '0 0 4px var(--green)',
            }} />
          )}

          <Divider />
          <Cell label="Open"   value={fmt(quote?.o)} />
          <Cell label="Prev"   value={fmt(quote?.pc)} />
          <Cell label="Hi"     value={fmt(quote?.h)} color="var(--green)" />
          <Cell label="Lo"     value={fmt(quote?.l)} color="var(--red)" />

          <Divider />
          <Cell label="52W Hi" value={fmt(m['52WeekHigh'])} color="#33ff66" />
          <Cell label="52W Lo" value={fmt(m['52WeekLow'])} color="#ff3b3b" />

          <Divider />
          <Cell label="Mkt Cap" value={fmtMktCap(profile?.marketCapitalization)} />
          <Cell label="10D Vol" value={fmtVol(vol10dNum)} />
          <Cell label="Beta"    value={fmt(m['beta'])} />

          <div style={{ flex: 1 }} />
          {profile?.name && (
            <div style={{ color: '#2a2a2a', fontSize: 10, textAlign: 'right', flexShrink: 0, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {profile.name}
            </div>
          )}
        </>
      ) : (
        <span style={{ color: '#e8e8e8', fontSize: 11 }}>No quote — set FINNHUB_API_KEY in .env.local</span>
      )}
    </div>
  )
}
