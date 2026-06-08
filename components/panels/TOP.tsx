'use client'
import { useQuery } from '@tanstack/react-query'
import { useTerminalStore } from '@/lib/store'
import type { MoverQuote } from '@/app/api/movers/route'

interface Quote { c: number | null; d: number | null; dp: number | null }
interface MoversResponse { gainers: MoverQuote[]; losers: MoverQuote[] }

const INDICES = [
  { symbol: 'SPY',  label: 'S&P 500' },
  { symbol: 'QQQ',  label: 'NASDAQ' },
  { symbol: 'DIA',  label: 'DOW' },
  { symbol: 'IWM',  label: 'RUSSELL' },
  { symbol: 'GLD',  label: 'GOLD' },
  { symbol: 'TLT',  label: '20Y BOND' },
]

function fmt(v: number | null | undefined, decimals = 2) {
  if (v == null || isNaN(v)) return '—'
  return v.toFixed(decimals)
}

function signColor(v: number | null | undefined) {
  if (v == null || isNaN(v as number)) return '#666'
  return (v as number) >= 0 ? 'var(--green)' : 'var(--red)'
}

function signPrefix(v: number | null | undefined) {
  return v != null && !isNaN(v as number) && (v as number) >= 0 ? '+' : ''
}

function IndexRow({ symbol, label }: { symbol: string; label: string }) {
  const { data } = useQuery<Quote>({
    queryKey: ['quote', symbol],
    queryFn: () => fetch(`/api/finnhub/quote?symbol=${symbol}`).then((r) => r.json()),
    refetchInterval: 30_000,
  })

  const color = signColor(data?.d)

  return (
    <tr>
      <td style={{ color: '#ffa028', paddingRight: 8 }}>{label}</td>
      <td style={{ textAlign: 'right', color: '#e8e8e8', paddingRight: 6 }}>{fmt(data?.c)}</td>
      <td style={{ textAlign: 'right', color, paddingRight: 6 }}>
        {data?.d != null && !isNaN(data.d) ? `${signPrefix(data.d)}${fmt(data.d)}` : '—'}
      </td>
      <td style={{ textAlign: 'right', color }}>
        {data?.dp != null && !isNaN(data.dp) ? `${signPrefix(data.dp)}${fmt(data.dp)}%` : '—'}
      </td>
    </tr>
  )
}

function MoverRow({ q, isGainer }: { q: MoverQuote; isGainer: boolean }) {
  const { setActiveTicker } = useTerminalStore()
  const color = isGainer ? 'var(--green)' : 'var(--red)'

  return (
    <tr
      onClick={() => setActiveTicker(q.symbol)}
      style={{ cursor: 'pointer' }}
      title={q.shortName}
    >
      <td style={{ color: '#4d9fff', paddingRight: 6 }}>{q.symbol}</td>
      <td style={{ textAlign: 'right', color: '#e8e8e8', paddingRight: 6 }}>
        {fmt(q.regularMarketPrice)}
      </td>
      <td style={{ textAlign: 'right', color }}>
        {signPrefix(q.regularMarketChangePercent)}{fmt(q.regularMarketChangePercent)}%
      </td>
    </tr>
  )
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      color: '#ffa028', fontSize: 10, marginBottom: 4,
      textTransform: 'uppercase', letterSpacing: '0.08em',
      borderBottom: '1px solid #1f1f1f', paddingBottom: 2,
    }}>
      {children}
    </div>
  )
}

export function TOP() {
  const { data: movers, isLoading: moversLoading } = useQuery<MoversResponse>({
    queryKey: ['movers'],
    queryFn: () => fetch('/api/movers').then((r) => r.json()),
    refetchInterval: 3 * 60_000,
    staleTime: 60_000,
  })

  return (
    <div className="panel" style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div className="panel-header">
        <span className="panel-mnemonic">TOP — MARKET OVERVIEW</span>
        {movers && (
          <span style={{ color: '#333', fontSize: 9 }}>
            REFRESHES EVERY 3 MIN
          </span>
        )}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 8, display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Indices */}
        <div>
          <SectionHeader>Major Indices</SectionHeader>
          <table className="data-table" style={{ width: '100%' }}>
            <thead>
              <tr>
                <th>Index</th>
                <th style={{ textAlign: 'right' }}>Last</th>
                <th style={{ textAlign: 'right' }}>Chg</th>
                <th style={{ textAlign: 'right' }}>Chg%</th>
              </tr>
            </thead>
            <tbody>
              {INDICES.map((idx) => (
                <IndexRow key={idx.symbol} symbol={idx.symbol} label={idx.label} />
              ))}
            </tbody>
          </table>
        </div>

        {/* Movers — two columns */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

          {/* Gainers */}
          <div>
            <SectionHeader>▲ Top Gainers</SectionHeader>
            {moversLoading ? (
              [...Array(8)].map((_, i) => (
                <div key={i} className="skeleton" style={{ height: 11, marginBottom: 3, width: `${55 + (i * 13) % 35}%` }} />
              ))
            ) : movers?.gainers?.length ? (
              <table className="data-table" style={{ width: '100%' }}>
                <thead>
                  <tr>
                    <th>Symbol</th>
                    <th style={{ textAlign: 'right' }}>Last</th>
                    <th style={{ textAlign: 'right' }}>Chg%</th>
                  </tr>
                </thead>
                <tbody>
                  {movers.gainers.slice(0, 10).map((q) => (
                    <MoverRow key={q.symbol} q={q} isGainer />
                  ))}
                </tbody>
              </table>
            ) : (
              <div style={{ color: '#444', fontSize: 11 }}>No data</div>
            )}
          </div>

          {/* Losers */}
          <div>
            <SectionHeader>▼ Top Losers</SectionHeader>
            {moversLoading ? (
              [...Array(8)].map((_, i) => (
                <div key={i} className="skeleton" style={{ height: 11, marginBottom: 3, width: `${55 + (i * 13) % 35}%` }} />
              ))
            ) : movers?.losers?.length ? (
              <table className="data-table" style={{ width: '100%' }}>
                <thead>
                  <tr>
                    <th>Symbol</th>
                    <th style={{ textAlign: 'right' }}>Last</th>
                    <th style={{ textAlign: 'right' }}>Chg%</th>
                  </tr>
                </thead>
                <tbody>
                  {movers.losers.slice(0, 10).map((q) => (
                    <MoverRow key={q.symbol} q={q} isGainer={false} />
                  ))}
                </tbody>
              </table>
            ) : (
              <div style={{ color: '#444', fontSize: 11 }}>No data</div>
            )}
          </div>

        </div>
      </div>
    </div>
  )
}
