'use client'
import { useQuery } from '@tanstack/react-query'
import { useTerminalStore } from '@/lib/store'
import { useState } from 'react'
import { X, Plus } from 'lucide-react'

interface Quote { c: number; d: number; dp: number }

function WatchRow({ symbol }: { symbol: string }) {
  const { activeTicker, setActiveTicker, removeFromWatchlist } = useTerminalStore()
  const isActive = activeTicker === symbol

  const { data } = useQuery<Quote>({
    queryKey: ['quote', symbol],
    queryFn: () => fetch(`/api/finnhub/quote?symbol=${symbol}`).then((r) => r.json()),
    refetchInterval: 30_000,
  })

  const up = data ? data.d >= 0 : null
  const color = up === null ? '#666' : up ? 'var(--green)' : 'var(--red)'

  return (
    <div
      onClick={() => setActiveTicker(symbol)}
      style={{
        display: 'flex',
        alignItems: 'center',
        padding: '2px 6px',
        cursor: 'pointer',
        background: isActive ? '#0a1a0a' : 'transparent',
        borderBottom: '1px solid #0d0d0d',
        gap: 4,
      }}
    >
      <span style={{ color: '#4d9fff', fontSize: 11, width: 48, flexShrink: 0 }}>{symbol}</span>
      <span style={{ flex: 1, color: '#ccc', fontSize: 11, textAlign: 'right' }}>
        {data ? data.c.toFixed(2) : <span className="skeleton" style={{ display: 'inline-block', width: 40, height: 10 }} />}
      </span>
      <span style={{ color, fontSize: 10, width: 40, textAlign: 'right', flexShrink: 0 }}>
        {data ? `${up ? '+' : ''}${data.dp.toFixed(1)}%` : ''}
      </span>
      <button
        onClick={(e) => { e.stopPropagation(); removeFromWatchlist(symbol) }}
        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: '#333', marginLeft: 2 }}
      >
        <X size={10} />
      </button>
    </div>
  )
}

export function Watchlist() {
  const { watchlist, addToWatchlist } = useTerminalStore()
  const [adding, setAdding] = useState('')
  const [err, setErr] = useState('')

  const handleAdd = () => {
    const sym = adding.trim().toUpperCase()
    // Only accept plain US-style tickers (1-5 alphanumeric chars)
    if (!sym) return
    if (!/^[A-Z0-9]{1,5}$/.test(sym)) {
      setErr('US tickers only (e.g. AAPL)')
      setTimeout(() => setErr(''), 2500)
      return
    }
    addToWatchlist(sym)
    setAdding('')
    setErr('')
  }

  return (
    <div className="panel" style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div className="panel-header">
        <span className="panel-mnemonic">WL</span>
        <span style={{ color: '#555', fontSize: 10 }}>{watchlist.length} symbols</span>
      </div>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {watchlist.map((sym) => <WatchRow key={sym} symbol={sym} />)}
      </div>
      <div style={{ borderTop: '1px solid #1f1f1f', padding: '3px 6px', display: 'flex', flexDirection: 'column', gap: 3 }}>
        <div style={{ display: 'flex', gap: 4 }}>
          <input
            value={adding}
            onChange={(e) => setAdding(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            placeholder="Add ticker..."
            maxLength={5}
            style={{
              flex: 1, background: 'transparent', border: `1px solid ${err ? '#ff3b3b' : '#222'}`,
              color: '#ffa028', font: 'inherit', fontSize: 11, padding: '2px 4px', outline: 'none',
            }}
          />
          <button
            onClick={handleAdd}
            style={{ background: 'none', border: '1px solid #333', cursor: 'pointer', color: '#ffa028', padding: '2px 4px' }}
          >
            <Plus size={10} />
          </button>
        </div>
        {err && <div style={{ color: '#ff3b3b', fontSize: 9 }}>{err}</div>}
      </div>
    </div>
  )
}
