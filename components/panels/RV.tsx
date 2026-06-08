'use client'
import { useQuery } from '@tanstack/react-query'
import { useTerminalStore } from '@/lib/store'
import { usePaneTicker } from '@/lib/pane-context'

interface Quote { c: number; d: number; dp: number }
interface Metrics { metric: Record<string, number | null> }
interface Profile { marketCapitalization: number; finnhubIndustry: string }

function fmt(v: number | null | undefined, dec = 1) {
  if (v == null || isNaN(v as number)) return '—'
  return v.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec })
}

function fmtMktCap(n: number | null | undefined) {
  if (!n) return '—'
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}T`
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}B`
  return `${n.toFixed(0)}M`
}

function PeerRow({ symbol, isActive }: { symbol: string; isActive: boolean }) {
  const { setActiveTicker } = useTerminalStore()

  const { data: quote } = useQuery<Quote>({
    queryKey: ['quote', symbol],
    queryFn: () => fetch(`/api/finnhub/quote?symbol=${symbol}`).then((r) => r.json()),
    refetchInterval: 30_000,
  })

  const { data: metrics } = useQuery<Metrics>({
    queryKey: ['metrics', symbol],
    queryFn: () => fetch(`/api/finnhub/metrics?symbol=${symbol}`).then((r) => r.json()),
    staleTime: 60 * 60_000,
  })

  const { data: profile } = useQuery<Profile>({
    queryKey: ['profile', symbol],
    queryFn: () => fetch(`/api/finnhub/profile?symbol=${symbol}`).then((r) => r.json()),
    staleTime: 24 * 60 * 60_000,
  })

  const m = metrics?.metric || {}
  const up = quote ? quote.d >= 0 : null

  return (
    <tr
      onClick={() => setActiveTicker(symbol)}
      style={{ background: isActive ? '#0a1a0a' : 'transparent', cursor: 'pointer' }}
    >
      <td style={{ color: '#4d9fff', fontWeight: isActive ? 'bold' : 'normal' }}>{symbol}</td>
      <td style={{ textAlign: 'right', color: '#e8e8e8' }}>{quote ? fmt(quote.c) : '—'}</td>
      <td style={{ textAlign: 'right', color: up === null ? '#666' : up ? 'var(--green)' : 'var(--red)' }}>
        {quote ? `${up ? '+' : ''}${fmt(quote.dp)}%` : '—'}
      </td>
      <td style={{ textAlign: 'right', color: '#d8d8d8' }}>{fmtMktCap(profile?.marketCapitalization)}</td>
      <td style={{ textAlign: 'right', color: '#d8d8d8' }}>{fmt(m['peBasicExclExtraTTM'])}</td>
      <td style={{ textAlign: 'right', color: '#d8d8d8' }}>{fmt(m['psTTM'])}</td>
      <td style={{ textAlign: 'right', color: '#d8d8d8' }}>{fmt(m['evToEbitda'])}</td>
      <td style={{ textAlign: 'right', color: '#d8d8d8' }}>{m['grossMarginTTM'] != null ? `${m['grossMarginTTM']!.toFixed(1)}%` : '—'}</td>
      <td style={{ textAlign: 'right', color: '#d8d8d8' }}>{m['52WeekPriceReturnDaily'] != null ? `${m['52WeekPriceReturnDaily']!.toFixed(1)}%` : '—'}</td>
    </tr>
  )
}

export function RV() {
  const { activeTicker: _globalTicker } = useTerminalStore()
  const activeTicker = usePaneTicker(_globalTicker)

  const { data: peersRaw, isLoading } = useQuery<string[]>({
    queryKey: ['peers', activeTicker],
    queryFn: () => fetch(`/api/finnhub/peers?symbol=${activeTicker}`).then((r) => r.json()),
    staleTime: 24 * 60 * 60_000,
  })

  const peers = Array.isArray(peersRaw) ? peersRaw : []
  const symbols = [activeTicker, ...peers.filter((p) => p !== activeTicker)].slice(0, 10)

  return (
    <div className="panel" style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div className="panel-header">
        <span className="panel-mnemonic">RV — RELATIVE VALUE / PEERS</span>
        <span className="panel-ticker">{activeTicker}</span>
      </div>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {isLoading ? (
          <div style={{ padding: 8 }}>
            {[...Array(5)].map((_, i) => <div key={i} className="skeleton" style={{ height: 14, marginBottom: 3 }} />)}
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Symbol</th>
                <th style={{ textAlign: 'right' }}>Price</th>
                <th style={{ textAlign: 'right' }}>Chg%</th>
                <th style={{ textAlign: 'right' }}>Mkt Cap</th>
                <th style={{ textAlign: 'right' }}>P/E</th>
                <th style={{ textAlign: 'right' }}>P/S</th>
                <th style={{ textAlign: 'right' }}>EV/EBITDA</th>
                <th style={{ textAlign: 'right' }}>GM%</th>
                <th style={{ textAlign: 'right' }}>52W Ret</th>
              </tr>
            </thead>
            <tbody>
              {symbols.map((s) => <PeerRow key={s} symbol={s} isActive={s === activeTicker} />)}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
