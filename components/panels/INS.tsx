'use client'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTerminalStore } from '@/lib/store'
import { usePaneTicker } from '@/lib/pane-context'
import type { InsiderData, InsiderTransaction } from '@/app/api/insider/route'
import type { InsiderFlow, FlowTransaction } from '@/app/api/insider/flow/route'
import { TX_CODE } from '@/lib/insider-codes'

// ── Shared helpers ─────────────────────────────────────────────────────────────
function fmtValue(v: number) {
  const abs = Math.abs(v)
  return abs >= 1e9 ? `$${(abs / 1e9).toFixed(1)}B`
       : abs >= 1e6 ? `$${(abs / 1e6).toFixed(1)}M`
       : abs >= 1e3 ? `$${(abs / 1e3).toFixed(0)}K`
       : `$${abs.toFixed(0)}`
}

function fmtShares(n: number) {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`
  return n.toLocaleString()
}

// ── Tab: Ticker-specific view ──────────────────────────────────────────────────

function SentimentBar({ buyCount, sellCount, netValue }: {
  buyCount: number; sellCount: number; netValue: number
}) {
  const total  = buyCount + sellCount
  const buyPct = total > 0 ? (buyCount / total) * 100 : 50
  const bullish = netValue >= 0

  return (
    <div style={{ padding: '10px 14px', borderBottom: '1px solid #111', flexShrink: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ color: '#444', fontSize: 9, letterSpacing: '0.06em' }}>90-DAY INSIDER SENTIMENT</span>
        <span style={{ color: bullish ? '#33ff66' : '#ff3b3b', fontSize: 9, fontWeight: 'bold' }}>
          {bullish ? '▲ BULLISH' : '▼ BEARISH'} · {(netValue >= 0 ? '+' : '') + fmtValue(netValue)} net
        </span>
      </div>
      <div style={{ display: 'flex', height: 6, borderRadius: 2, overflow: 'hidden', background: '#111' }}>
        <div style={{ width: `${buyPct}%`, background: '#1a6a2a', transition: 'width 0.4s' }} />
        <div style={{ flex: 1, background: '#6a1a1a' }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
        <span style={{ color: '#33ff66', fontSize: 8 }}>▲ {buyCount} PURCHASE{buyCount !== 1 ? 'S' : ''}</span>
        <span style={{ color: '#ff3b3b', fontSize: 8 }}>{sellCount} SALE{sellCount !== 1 ? 'S' : ''} ▼</span>
      </div>
      {total === 0 && (
        <div style={{ color: '#333', fontSize: 9, marginTop: 4, textAlign: 'center' }}>
          No open-market transactions in the last 90 days
        </div>
      )}
    </div>
  )
}

function TxRow({ tx }: { tx: InsiderTransaction }) {
  const isBuy  = tx.transactionCode === 'P'
  const isSell = tx.transactionCode === 'S'
  const value  = tx.share * (tx.transactionPrice ?? 0)

  return (
    <tr style={{ background: isBuy ? '#003a08' : isSell ? '#3a0008' : 'transparent', borderBottom: '1px solid #0a0a0a' }}>
      <td style={{ padding: '3px 8px', color: '#555', fontSize: 8 }}>{tx.transactionDate.slice(0, 10)}</td>
      <td style={{ padding: '3px 8px', color: '#b0b0b0', fontSize: 8, maxWidth: 120 }}>
        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tx.name || '—'}</div>
      </td>
      <td style={{ padding: '3px 8px' }}>
        <span style={{ color: isBuy ? '#33ff66' : isSell ? '#ff3b3b' : '#888', fontSize: 8, fontWeight: isBuy || isSell ? 'bold' : 'normal' }}>
          {TX_CODE[tx.transactionCode] ?? tx.transactionCode}
        </span>
      </td>
      <td style={{ padding: '3px 8px', color: '#c0c0c0', fontSize: 9, textAlign: 'right' }}>{fmtShares(tx.share)}</td>
      <td style={{ padding: '3px 8px', color: '#666', fontSize: 9, textAlign: 'right' }}>
        {tx.transactionPrice != null ? `$${tx.transactionPrice.toFixed(2)}` : '—'}
      </td>
      <td style={{ padding: '3px 8px', color: '#555', fontSize: 9, textAlign: 'right' }}>{value > 0 ? fmtValue(value) : '—'}</td>
      <td style={{ padding: '3px 8px', color: '#333', fontSize: 8, textAlign: 'right' }}>{tx.filingDate.slice(0, 10)}</td>
    </tr>
  )
}

function TickerTab({ ticker }: { ticker: string }) {
  const { data, isLoading, error } = useQuery<InsiderData>({
    queryKey: ['insider', ticker],
    queryFn:  () => fetch(`/api/insider?symbol=${ticker}`).then(r => r.json()),
    staleTime: 55 * 60_000,
    enabled: !!ticker,
  })

  const hasData  = data && !('error' in data)
  const apiError = data && 'error' in data ? (data as { error: string }).error : null

  if (isLoading) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#444' }}>
      Loading insider data…
    </div>
  )
  if (error || apiError) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ff3b3b', fontSize: 11 }}>
      {String(error ?? apiError)}
    </div>
  )
  if (!hasData) return null

  return (
    <>
      <SentimentBar buyCount={data!.buyCount} sellCount={data!.sellCount} netValue={data!.netValue} />
      <div style={{ flex: 1, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead style={{ position: 'sticky', top: 0, background: '#030303', zIndex: 1 }}>
            <tr>
              {[['TXN DATE','left'],['INSIDER','left'],['TYPE','left'],
                ['SHARES','right'],['PRICE','right'],['VALUE','right'],['FILED','right']].map(([h, align]) => (
                <th key={h} style={{ color: '#333', fontSize: 8, textAlign: align as 'left'|'right',
                  padding: '3px 8px', fontWeight: 'normal', letterSpacing: '0.06em', borderBottom: '1px solid #111' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data!.transactions.length === 0 && (
              <tr><td colSpan={7} style={{ padding: 20, color: '#333', fontSize: 11, textAlign: 'center' }}>
                No recent insider transactions
              </td></tr>
            )}
            {data!.transactions.map((tx, i) => <TxRow key={i} tx={tx} />)}
          </tbody>
        </table>
      </div>
      <div style={{ flexShrink: 0, borderTop: '1px solid #0d0d0d', padding: '3px 10px', background: '#020202' }}>
        <span style={{ color: '#222', fontSize: 8 }}>
          Form 4 SEC filings · {data!.transactions.length} transactions · Source: Finnhub
        </span>
      </div>
    </>
  )
}

// ── Tab: Market-wide flow view ─────────────────────────────────────────────────

function FlowRow({ tx, rank, side, onClickTicker }: {
  tx: FlowTransaction; rank: number; side: 'buy' | 'sell'; onClickTicker: (s: string) => void
}) {
  const isBuy = side === 'buy'
  return (
    <tr style={{ borderBottom: '1px solid #0a0a0a', background: isBuy ? '#001a06' : '#1a0006' }}>
      <td style={{ padding: '3px 6px', color: '#333', fontSize: 8, textAlign: 'right', width: 20 }}>{rank}</td>
      <td style={{ padding: '3px 8px' }}>
        <button onClick={() => onClickTicker(tx.symbol)} style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: '#ffa028', fontFamily: 'inherit', fontSize: 10, fontWeight: 'bold', padding: 0,
        }}>{tx.symbol}</button>
        <span style={{ color: '#333', fontSize: 7, marginLeft: 4 }}>{tx.exchange}</span>
      </td>
      <td style={{ padding: '3px 8px', color: '#666', fontSize: 8, maxWidth: 130 }}>
        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tx.name}</div>
      </td>
      <td style={{ padding: '3px 8px', color: isBuy ? '#33ff66' : '#ff3b3b', fontSize: 10, fontWeight: 'bold', textAlign: 'right' }}>
        {fmtValue(tx.value)}
      </td>
      <td style={{ padding: '3px 8px', color: '#555', fontSize: 9, textAlign: 'right' }}>{fmtShares(tx.share)}</td>
      <td style={{ padding: '3px 8px', color: '#444', fontSize: 9, textAlign: 'right' }}>
        {tx.transactionPrice != null ? `$${tx.transactionPrice.toFixed(2)}` : '—'}
      </td>
      <td style={{ padding: '3px 8px', color: '#333', fontSize: 8, textAlign: 'right' }}>{tx.transactionDate.slice(0, 10)}</td>
    </tr>
  )
}

function FlowTable({ txns, side, onClickTicker }: {
  txns: FlowTransaction[]; side: 'buy' | 'sell'; onClickTicker: (s: string) => void
}) {
  const isBuy = side === 'buy'
  return (
    <div style={{ flex: 1, overflow: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead style={{ position: 'sticky', top: 0, background: '#030303', zIndex: 1 }}>
          <tr>
            <th style={{ color: '#333', fontSize: 8, padding: '3px 6px', fontWeight: 'normal', textAlign: 'right', width: 20 }}>#</th>
            {[['SYMBOL','left'],['INSIDER','left'],['VALUE','right'],
              ['SHARES','right'],['PRICE','right'],['DATE','right']].map(([h,align]) => (
              <th key={h} style={{ color: '#333', fontSize: 8, textAlign: align as 'left'|'right',
                padding: '3px 8px', fontWeight: 'normal', letterSpacing: '0.06em', borderBottom: '1px solid #111' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {txns.length === 0 && (
            <tr><td colSpan={7} style={{ padding: 20, color: '#333', fontSize: 11, textAlign: 'center' }}>
              No {isBuy ? 'purchase' : 'sale'} transactions found in this period
            </td></tr>
          )}
          {txns.map((tx, i) => (
            <FlowRow key={`${tx.symbol}-${i}`} tx={tx} rank={i + 1} side={side} onClickTicker={onClickTicker} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function FlowTab({ onClickTicker }: { onClickTicker: (s: string) => void }) {
  const [days, setDays] = useState<30 | 60 | 90>(30)
  const [side, setSide] = useState<'buy' | 'sell'>('buy')

  const { data, isLoading, error } = useQuery<InsiderFlow>({
    queryKey: ['insider-flow', days],
    queryFn:  () => fetch(`/api/insider/flow?days=${days}`).then(r => r.json()),
    staleTime: 3.5 * 60 * 60_000,
    // Note: first load will be slow (~60s) due to batch fetching — this is cached 4h server-side
  })

  const hasData  = data && !('error' in data)
  const apiError = data && 'error' in data ? (data as { error: string }).error : null

  return (
    <>
      {/* Sub-controls */}
      <div style={{ display: 'flex', gap: 8, padding: '5px 10px', borderBottom: '1px solid #111', flexShrink: 0, alignItems: 'center' }}>
        <span style={{ color: '#333', fontSize: 9 }}>WINDOW:</span>
        {([30, 60, 90] as const).map(d => (
          <button key={d} onClick={() => setDays(d)} style={{
            background: days === d ? '#0a1a0a' : 'none',
            border: `1px solid ${days === d ? '#ffa028' : '#222'}`,
            color: days === d ? '#ffa028' : '#444',
            fontFamily: 'inherit', fontSize: 8, padding: '1px 8px', cursor: 'pointer',
          }}>{d}D</button>
        ))}
        <div style={{ width: 1, background: '#222', height: 12 }} />
        <span style={{ color: '#333', fontSize: 9 }}>SHOW:</span>
        {(['buy', 'sell'] as const).map(s => (
          <button key={s} onClick={() => setSide(s)} style={{
            background: side === s ? (s === 'buy' ? '#001a06' : '#1a0006') : 'none',
            border: `1px solid ${side === s ? (s === 'buy' ? '#33ff66' : '#ff3b3b') : '#222'}`,
            color: side === s ? (s === 'buy' ? '#33ff66' : '#ff3b3b') : '#444',
            fontFamily: 'inherit', fontSize: 8, padding: '1px 8px', cursor: 'pointer',
          }}>{s === 'buy' ? '▲ BUYS' : '▼ SELLS'}</button>
        ))}
        <span style={{ marginLeft: 'auto', color: '#222', fontSize: 8 }}>
          S&P 500 + ASX universe · ranked by $ value
        </span>
      </div>

      {isLoading && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <div style={{ color: '#444', fontSize: 11 }}>Loading market-wide insider flow…</div>
          <div style={{ color: '#2a2a2a', fontSize: 9 }}>First load fetches ~60 stocks — may take 30–60s</div>
        </div>
      )}
      {!isLoading && (error || apiError) && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ff3b3b', fontSize: 11 }}>
          {String(error ?? apiError)}
        </div>
      )}

      {!isLoading && hasData && (
        <>
          <FlowTable
            txns={side === 'buy' ? data!.topBuys : data!.topSells}
            side={side}
            onClickTicker={onClickTicker}
          />
          <div style={{ flexShrink: 0, borderTop: '1px solid #0d0d0d', padding: '3px 10px', background: '#020202' }}>
            <span style={{ color: '#222', fontSize: 8 }}>
              {side === 'buy' ? data!.topBuys.length : data!.topSells.length} transactions · open-market P/S only ·
              cached 4h · Source: Finnhub
            </span>
          </div>
        </>
      )}
    </>
  )
}

// ── Main panel ────────────────────────────────────────────────────────────────
export function INS() {
  const { activeTicker: _globalTicker, openTab } = useTerminalStore()
  const activeTicker = usePaneTicker(_globalTicker)
  const [tab, setTab] = useState<'TICKER' | 'FLOW'>('TICKER')

  const handleTicker = (ticker: string) => openTab(ticker, 'GIP')

  return (
    <div className="panel" style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* Header */}
      <div className="panel-header" style={{ justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="panel-mnemonic">INS</span>
          {tab === 'TICKER' && (
            <span style={{ color: '#b0b0b0', fontSize: 10 }}>{activeTicker}</span>
          )}
          <span style={{ color: '#444', fontSize: 10 }}>INSIDER TRANSACTIONS</span>
        </div>
        {/* Tab switcher */}
        <div style={{ display: 'flex', gap: 2 }}>
          {([
            { id: 'TICKER', label: `${activeTicker} DETAIL` },
            { id: 'FLOW',   label: 'MARKET FLOW' },
          ] as const).map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              background: tab === t.id ? '#0a1a0a' : 'none',
              border: `1px solid ${tab === t.id ? '#ffa028' : '#222'}`,
              color: tab === t.id ? '#ffa028' : '#444',
              fontFamily: 'inherit', fontSize: 8, padding: '1px 8px', cursor: 'pointer',
              letterSpacing: '0.04em',
            }}>{t.label}</button>
          ))}
        </div>
      </div>

      {tab === 'TICKER' && <TickerTab ticker={activeTicker} />}
      {tab === 'FLOW'   && <FlowTab onClickTicker={handleTicker} />}
    </div>
  )
}
