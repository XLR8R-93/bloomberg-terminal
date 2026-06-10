'use client'
import { useQuery } from '@tanstack/react-query'
import { useTerminalStore } from '@/lib/store'

interface IndexDef { symbol: string; label: string; region: string }

const INDICES: IndexDef[] = [
  { symbol: '^AXJO',  label: 'ASX 200',   region: 'AU' },
  { symbol: '^GSPC',  label: 'S&P 500',   region: 'US' },
  { symbol: '^NDX',   label: 'NDX 100',   region: 'US' },
  { symbol: '^DJI',   label: 'DOW',       region: 'US' },
  { symbol: '^VIX',   label: 'VIX',       region: 'US' },
  { symbol: '^FTSE',  label: 'FTSE 100',  region: 'UK' },
  { symbol: '^GDAXI', label: 'DAX',       region: 'DE' },
  { symbol: '^N225',  label: 'NIKKEI',    region: 'JP' },
  { symbol: '^HSI',   label: 'HANG SENG', region: 'HK' },
]

const SYMBOLS = INDICES.map(i => i.symbol).join(',')

const REGION_COLOR: Record<string, string> = {
  AU: '#ffa028',
  US: '#4d9fff',
  UK: '#a0c0ff',
  DE: '#ffcc44',
  JP: '#ff8888',
  HK: '#ff6666',
}

function fmt(v: number) {
  if (v >= 10000) return v.toLocaleString('en-US', { maximumFractionDigits: 0 })
  if (v >= 1000)  return v.toLocaleString('en-US', { maximumFractionDigits: 1 })
  return v.toFixed(2)
}

export function IndexBar() {
  const { openTab } = useTerminalStore()

  const { data: quotes = {} } = useQuery<Record<string, { c: number; d: number; dp: number }>>({
    queryKey: ['index-bar-quotes'],
    queryFn:  () => fetch(`/api/quotes?symbols=${encodeURIComponent(SYMBOLS)}`).then(r => r.json()),
    refetchInterval: 60_000,
    staleTime: 50_000,
  })

  return (
    <div style={{
      height: 28,
      background: '#030303',
      borderBottom: '1px solid #111',
      flexShrink: 0,
      display: 'flex',
      alignItems: 'stretch',
      overflow: 'hidden',
    }}>
      {INDICES.map((idx, i) => {
        const q  = quotes[idx.symbol]
        const up = q ? q.dp >= 0 : null
        const clr = up === null ? '#aaaaaa' : up ? '#33ff66' : '#ff3b3b'
        const regionClr = REGION_COLOR[idx.region] ?? '#888'

        return (
          <div
            key={idx.symbol}
            onClick={() => openTab(idx.symbol, 'GIP')}
            title={`${idx.label} (${idx.symbol}) — click to open GIP`}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'center',
              borderRight: i < INDICES.length - 1 ? '1px solid #111' : 'none',
              cursor: 'pointer',
              padding: '0 4px',
              gap: 1,
              transition: 'background 0.1s',
              minWidth: 0,
            }}
            onMouseEnter={e => (e.currentTarget.style.background = '#0d0d0d')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            {/* Label */}
            <div style={{
              color: regionClr, fontSize: 8, fontWeight: 'bold',
              letterSpacing: '0.06em', whiteSpace: 'nowrap', opacity: 0.9,
            }}>
              {idx.label}
            </div>

            {/* Value + change */}
            {q ? (
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                <span style={{ color: '#e8e8e8', fontSize: 10, fontVariantNumeric: 'tabular-nums', fontWeight: 'bold' }}>
                  {fmt(q.c)}
                </span>
                <span style={{ color: clr, fontSize: 9, fontVariantNumeric: 'tabular-nums' }}>
                  {up ? '▲' : '▼'}{Math.abs(q.dp).toFixed(2)}%
                </span>
              </div>
            ) : (
              <div style={{ color: '#2a2a2a', fontSize: 9 }}>···</div>
            )}
          </div>
        )
      })}
    </div>
  )
}
