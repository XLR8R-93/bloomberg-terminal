'use client'
import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { EarningsEvent } from '@/app/api/ecal/route'
import { useTerminalStore } from '@/lib/store'

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtEPS(v: number | null) {
  if (v == null) return '—'
  return (v >= 0 ? '' : '-') + '$' + Math.abs(v).toFixed(2)
}

function fmtRev(v: number | null) {
  if (v == null) return '—'
  if (Math.abs(v) >= 1e9) return `$${(v / 1e9).toFixed(1)}B`
  if (Math.abs(v) >= 1e6) return `$${(v / 1e6).toFixed(0)}M`
  return `$${v.toFixed(0)}`
}

function fmtSurprise(v: number | null) {
  if (v == null) return null
  return `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`
}

function hourLabel(hour: string) {
  if (hour === 'bmo') return 'BMO'
  if (hour === 'amc') return 'AMC'
  if (hour === 'dmh') return 'DMH'
  return '?'
}

function surpriseColor(v: number | null): string {
  if (v == null) return '#555'
  if (v > 5)   return '#33ff66'
  if (v > 0)   return '#1a8a3a'
  if (v < -5)  return '#ff3b3b'
  if (v < 0)   return '#8a1a1a'
  return '#555'
}

function isToday(dateStr: string): boolean {
  return dateStr === new Date().toISOString().slice(0, 10)
}

function isFuture(dateStr: string): boolean {
  return dateStr > new Date().toISOString().slice(0, 10)
}

// ── Row ───────────────────────────────────────────────────────────────────────
function ECalRow({ ev, onClickTicker }: { ev: EarningsEvent; onClickTicker: (t: string) => void  }) {
  const today   = isToday(ev.date)
  const future  = isFuture(ev.date)
  const pending = future || ev.epsActual == null

  const surprEps = fmtSurprise(ev.epsSurprise)
  const surprRev = fmtSurprise(ev.revSurprise)

  return (
    <tr style={{
      borderBottom: '1px solid #0d0d0d',
      background: today ? '#0a140a' : 'transparent',
    }}>
      <td style={{ padding: '4px 8px' }}>
        <button
          onClick={() => onClickTicker(ev.symbol)}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: '#ffa028', fontFamily: 'inherit', fontSize: 10, fontWeight: 'bold',
            padding: 0, textAlign: 'left',
          }}
        >
          {ev.symbol}
        </button>
      </td>
      <td style={{ padding: '4px 8px' }}>
        <span style={{
          fontSize: 8, padding: '1px 4px',
          background: ev.hour === 'bmo' ? '#0a1a2a' : ev.hour === 'amc' ? '#1a0a2a' : '#1a1a0a',
          color: ev.hour === 'bmo' ? '#3a88cc' : ev.hour === 'amc' ? '#aa44cc' : '#888',
          border: '1px solid #222',
        }}>
          {hourLabel(ev.hour)}
        </span>
      </td>
      <td style={{ padding: '4px 8px', color: '#b0b0b0', fontSize: 9, textAlign: 'right' }}>
        {fmtEPS(ev.epsEstimate)}
      </td>
      <td style={{ padding: '4px 8px', color: pending ? '#888' : '#ccc', fontSize: 9, textAlign: 'right' }}>
        {pending ? '—' : fmtEPS(ev.epsActual)}
      </td>
      <td style={{ padding: '4px 8px', fontSize: 9, textAlign: 'right', color: surpriseColor(pending ? null : ev.epsSurprise) }}>
        {pending ? '—' : (surprEps ?? '—')}
      </td>
      <td style={{ padding: '4px 8px', color: '#b0b0b0', fontSize: 9, textAlign: 'right' }}>
        {fmtRev(ev.revenueEstimate)}
      </td>
      <td style={{ padding: '4px 8px', color: pending ? '#888' : '#ccc', fontSize: 9, textAlign: 'right' }}>
        {pending ? '—' : fmtRev(ev.revenueActual)}
      </td>
      <td style={{ padding: '4px 8px', fontSize: 9, textAlign: 'right', color: surpriseColor(pending ? null : ev.revSurprise) }}>
        {pending ? '—' : (surprRev ?? '—')}
      </td>
      <td style={{ padding: '4px 8px', color: '#888', fontSize: 8, textAlign: 'right' }}>
        Q{ev.quarter}'{String(ev.year).slice(2)}
      </td>
    </tr>
  )
}

// ── Group header ──────────────────────────────────────────────────────────────
function DateHeader({ dateStr }: { dateStr: string }) {
  const today   = isToday(dateStr)
  const future  = isFuture(dateStr)
  const d       = new Date(dateStr + 'T00:00:00')
  const label   = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  return (
    <tr>
      <td colSpan={9} style={{
        padding: '6px 8px 2px',
        borderTop: '1px solid #181818',
        background: '#050505',
      }}>
        <span style={{
          fontSize: 9, letterSpacing: '0.06em',
          color: today ? '#ffa028' : future ? '#b0b0b0' : '#888',
          fontWeight: today ? 'bold' : 'normal',
        }}>
          {label.toUpperCase()}
          {today && <span style={{ marginLeft: 8, color: '#ffa028', fontSize: 8 }}>● TODAY</span>}
        </span>
      </td>
    </tr>
  )
}

// ── Main panel ────────────────────────────────────────────────────────────────
export function ECAL() {
  const { openTab } = useTerminalStore()
  const [filter, setFilter] = useState<'ALL' | 'UPCOMING' | 'RECENT'>('ALL')
  const [search, setSearch] = useState('')

  const { data = [], isLoading, error } = useQuery<EarningsEvent[]>({
    queryKey: ['ecal'],
    queryFn:  () => fetch('/api/ecal').then(r => r.json()),
    staleTime: 25 * 60_000,
    refetchInterval: 30 * 60_000,
  })

  const events = Array.isArray(data) ? data : []
  const today  = new Date().toISOString().slice(0, 10)

  const filtered = useMemo(() => {
    let list = events
    if (filter === 'UPCOMING') list = list.filter(e => e.date >= today)
    if (filter === 'RECENT')   list = list.filter(e => e.date < today)
    if (search) {
      const q = search.toUpperCase()
      list = list.filter(e => e.symbol.includes(q))
    }
    return list
  }, [events, filter, search, today])

  // Group by date
  const grouped = useMemo(() => {
    const map = new Map<string, EarningsEvent[]>()
    for (const ev of filtered) {
      if (!map.has(ev.date)) map.set(ev.date, [])
      map.get(ev.date)!.push(ev)
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [filtered])

  const handleTicker = (ticker: string) => {
    openTab(ticker, 'GIP')
  }

  return (
    <div className="panel" style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* Header */}
      <div className="panel-header" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="panel-mnemonic">ECAL</span>
          <span style={{ color: '#aaaaaa', fontSize: 10 }}>EARNINGS CALENDAR</span>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {(['ALL', 'UPCOMING', 'RECENT'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)} style={{
              background: filter === f ? '#0a1a0a' : 'none',
              border: `1px solid ${filter === f ? '#ffa028' : '#222'}`,
              color: filter === f ? '#ffa028' : '#aaaaaa',
              fontFamily: 'inherit', fontSize: 8, padding: '1px 7px', cursor: 'pointer',
              letterSpacing: '0.05em',
            }}>{f}</button>
          ))}
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="FILTER SYMBOL…"
            style={{
              background: '#060606', border: '1px solid #1a1a1a', color: '#c0c0c0',
              fontFamily: 'inherit', fontSize: 9, padding: '2px 6px', width: 100,
              outline: 'none',
            }}
          />
        </div>
      </div>

      {isLoading && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#aaaaaa' }}>
          Loading earnings calendar…
        </div>
      )}
      {!isLoading && error && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ff3b3b', fontSize: 11 }}>
          {String(error)}
        </div>
      )}

      {!isLoading && !error && (
        <div style={{ flex: 1, overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ position: 'sticky', top: 0, background: '#030303', zIndex: 1 }}>
              <tr>
                {[
                  ['SYMBOL', 'left'], ['TIME', 'left'],
                  ['EPS EST', 'right'], ['EPS ACT', 'right'], ['EPS SURP', 'right'],
                  ['REV EST', 'right'], ['REV ACT', 'right'], ['REV SURP', 'right'],
                  ['QTR', 'right'],
                ].map(([h, align]) => (
                  <th key={h} style={{
                    color: '#888', fontSize: 8, textAlign: align as 'left' | 'right',
                    padding: '3px 8px', fontWeight: 'normal', letterSpacing: '0.06em',
                    borderBottom: '1px solid #111',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grouped.length === 0 && (
                <tr><td colSpan={9} style={{ padding: 20, color: '#888', fontSize: 11, textAlign: 'center' }}>
                  No earnings events found
                </td></tr>
              )}
              {grouped.map(([dateStr, evs]) => (
                <>
                  <DateHeader key={`hdr-${dateStr}`} dateStr={dateStr} />
                  {evs.map(ev => (
                    <ECalRow key={`${ev.symbol}-${ev.date}`} ev={ev} onClickTicker={handleTicker} />
                  ))}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ flexShrink: 0, borderTop: '1px solid #0d0d0d', padding: '3px 10px', background: '#020202' }}>
        <span style={{ color: '#222', fontSize: 8 }}>
          Curated universe · BMO = Before Market Open · AMC = After Market Close · Source: Finnhub
        </span>
      </div>
    </div>
  )
}
