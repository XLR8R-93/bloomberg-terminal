'use client'
import { useQuery } from '@tanstack/react-query'
import { useTerminalStore } from '@/lib/store'

interface TapeEntry { symbol: string; label: string; exchange: 'SP500' | 'ASX' }

const TAPE: TapeEntry[] = [
  // ── S&P 500 top 10 by market cap ──
  { symbol: 'AAPL',  label: 'APPLE',      exchange: 'SP500' },
  { symbol: 'NVDA',  label: 'NVIDIA',     exchange: 'SP500' },
  { symbol: 'MSFT',  label: 'MICROSOFT',  exchange: 'SP500' },
  { symbol: 'AMZN',  label: 'AMAZON',     exchange: 'SP500' },
  { symbol: 'GOOGL', label: 'ALPHABET',   exchange: 'SP500' },
  { symbol: 'META',  label: 'META',       exchange: 'SP500' },
  { symbol: 'TSLA',  label: 'TESLA',      exchange: 'SP500' },
  { symbol: 'BRK.B', label: 'BERKSHIRE',  exchange: 'SP500' },
  { symbol: 'LLY',   label: 'ELI LILLY', exchange: 'SP500' },
  { symbol: 'AVGO',  label: 'BROADCOM',  exchange: 'SP500' },
  // ── ASX top 10 by market cap ──
  { symbol: 'BHP.AX', label: 'BHP',        exchange: 'ASX' },
  { symbol: 'CBA.AX', label: 'COMMBANK',   exchange: 'ASX' },
  { symbol: 'CSL.AX', label: 'CSL',        exchange: 'ASX' },
  { symbol: 'NAB.AX', label: 'NAB',        exchange: 'ASX' },
  { symbol: 'ANZ.AX', label: 'ANZ',        exchange: 'ASX' },
  { symbol: 'WBC.AX', label: 'WESTPAC',    exchange: 'ASX' },
  { symbol: 'WES.AX', label: 'WESFARMERS', exchange: 'ASX' },
  { symbol: 'MQG.AX', label: 'MACQUARIE',  exchange: 'ASX' },
  { symbol: 'FMG.AX', label: 'FORTESCUE',  exchange: 'ASX' },
  { symbol: 'RIO.AX', label: 'RIO TINTO',  exchange: 'ASX' },
]

const SYMBOLS = TAPE.map(t => t.symbol).join(',')

function TapeItem({ entry, price, change, changePct, onClick }: {
  entry: TapeEntry
  price:     number | undefined
  change:    number | undefined
  changePct: number | undefined
  onClick:   () => void
}) {
  const up  = (changePct ?? 0) >= 0
  const clr = changePct == null ? '#555' : up ? '#33ff66' : '#ff3b3b'
  const exColor = entry.exchange === 'ASX' ? '#ffa028' : '#4d9fff'

  return (
    <span
      onClick={onClick}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        padding: '0 14px', borderRight: '1px solid #111',
        cursor: 'pointer', flexShrink: 0,
      }}
      title={`${entry.label} — click to open`}
    >
      {/* Exchange badge */}
      <span style={{ color: exColor, fontSize: 7, border: `1px solid ${exColor}`, padding: '0 3px', opacity: 0.6, letterSpacing: '0.05em' }}>
        {entry.exchange === 'ASX' ? 'ASX' : 'SPX'}
      </span>

      {/* Ticker */}
      <span style={{ color: '#ddd', fontSize: 10, fontWeight: 'bold', letterSpacing: '0.04em' }}>
        {entry.symbol.replace('.AX', '').replace('.B', '-B')}
      </span>

      {/* Price */}
      {price != null ? (
        <>
          <span style={{ color: '#c0c0c0', fontSize: 10, fontVariantNumeric: 'tabular-nums' }}>
            {price < 10 ? price.toFixed(3) : price < 1000 ? price.toFixed(2) : price.toFixed(0)}
          </span>
          <span style={{ color: clr, fontSize: 10, fontVariantNumeric: 'tabular-nums' }}>
            {up ? '▲' : '▼'}{Math.abs(changePct ?? 0).toFixed(2)}%
          </span>
          {change != null && (
            <span style={{ color: clr, fontSize: 9, fontVariantNumeric: 'tabular-nums', opacity: 0.75 }}>
              ({up ? '+' : ''}{change < 0 ? change.toFixed(2) : change.toFixed(2)})
            </span>
          )}
        </>
      ) : (
        <span style={{ color: '#333', fontSize: 10 }}>···</span>
      )}
    </span>
  )
}

export function TickerTape() {
  const { openTab } = useTerminalStore()

  const { data: quotes = {} } = useQuery<Record<string, { c: number; d: number; dp: number }>>({
    queryKey: ['ticker-tape-quotes'],
    queryFn:  () => fetch(`/api/quotes?symbols=${encodeURIComponent(SYMBOLS)}`).then(r => r.json()),
    refetchInterval: 30_000,
    staleTime: 20_000,
  })

  const items = TAPE.map(t => ({
    entry:     t,
    price:     quotes[t.symbol]?.c,
    change:    quotes[t.symbol]?.d,
    changePct: quotes[t.symbol]?.dp,
  }))

  return (
    <div style={{
      height: 24, overflow: 'hidden',
      background: '#020202', borderBottom: '1px solid #111',
      flexShrink: 0, display: 'flex', alignItems: 'center',
      position: 'relative',
    }}>
      {/* Left fade */}
      <div style={{ position: 'absolute', left: 0, top: 0, width: 32, height: '100%', background: 'linear-gradient(to right, #020202, transparent)', zIndex: 1, pointerEvents: 'none' }} />
      {/* Right fade */}
      <div style={{ position: 'absolute', right: 0, top: 0, width: 32, height: '100%', background: 'linear-gradient(to left, #020202, transparent)', zIndex: 1, pointerEvents: 'none' }} />

      {/* Scrolling track — doubled for seamless loop */}
      <div className="ticker-track" style={{ display: 'flex', whiteSpace: 'nowrap', alignItems: 'center', willChange: 'transform' }}>
        {[...items, ...items].map((item, i) => (
          <TapeItem
            key={i}
            entry={item.entry}
            price={item.price}
            change={item.change}
            changePct={item.changePct}
            onClick={() => openTab(item.entry.symbol, 'GIP')}
          />
        ))}
      </div>
    </div>
  )
}
