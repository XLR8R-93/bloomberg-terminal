'use client'
import { useMemo } from 'react'
import { useQueries } from '@tanstack/react-query'
import { useTerminalStore } from '@/lib/store'
import type { HistoryPoint } from '@/app/api/history/route'

// ── Maths ─────────────────────────────────────────────────────────────────────
function logReturns(closes: number[]): number[] {
  const r: number[] = []
  for (let i = 1; i < closes.length; i++) {
    if (closes[i - 1] > 0 && closes[i] > 0)
      r.push(Math.log(closes[i] / closes[i - 1]))
  }
  return r
}

function pearson(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length)
  if (n < 5) return NaN
  let sumA = 0, sumB = 0, sumAB = 0, sumA2 = 0, sumB2 = 0
  for (let i = 0; i < n; i++) {
    sumA  += a[i]; sumB  += b[i]
    sumAB += a[i] * b[i]
    sumA2 += a[i] * a[i]; sumB2 += b[i] * b[i]
  }
  const num  = n * sumAB - sumA * sumB
  const den  = Math.sqrt((n * sumA2 - sumA ** 2) * (n * sumB2 - sumB ** 2))
  return den === 0 ? NaN : num / den
}

// Align two series by date → returns arrays of closes in same date order
function alignSeries(
  a: HistoryPoint[], b: HistoryPoint[]
): [number[], number[]] {
  const mapB = new Map(b.map(p => [p.t, p.c]))
  const ca: number[] = [], cb: number[] = []
  for (const p of a) {
    const bv = mapB.get(p.t)
    if (bv !== undefined) { ca.push(p.c); cb.push(bv) }
  }
  return [ca, cb]
}

// ── Colour scale ──────────────────────────────────────────────────────────────
function corrColor(r: number): string {
  if (isNaN(r)) return '#1a1a1a'
  // r in [-1, 1] → interpolate red–grey–green
  if (r >= 0) {
    const t = r  // 0=grey, 1=green
    const g = Math.round(20 + t * 80)
    const rb = Math.round(20 * (1 - t))
    return `rgb(${rb},${g},${rb})`
  } else {
    const t = -r // 0=grey, 1=red
    const r2 = Math.round(20 + t * 80)
    const gb = Math.round(20 * (1 - t))
    return `rgb(${r2},${gb},${gb})`
  }
}

function corrTextColor(r: number): string {
  if (isNaN(r)) return '#333'
  return Math.abs(r) > 0.3 ? '#e8e8e8' : '#666'
}

// ── Diversification score ─────────────────────────────────────────────────────
// Average off-diagonal correlation — lower = more diversified
function divScore(matrix: (number | null)[][], n: number): number | null {
  if (n < 2) return null
  let sum = 0, count = 0
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++)
      if (i !== j && matrix[i][j] != null && !isNaN(matrix[i][j]!)) {
        sum += matrix[i][j]!; count++
      }
  return count > 0 ? sum / count : null
}

// ── Main panel ────────────────────────────────────────────────────────────────
const RANGE_OPTS = ['3mo', '6mo', '1y'] as const
type Range = typeof RANGE_OPTS[number]

export function CORR() {
  const { positions, watchlist, activeTicker } = useTerminalStore()
  const [range, setRange] = React.useState<Range>('1y')
  const [source, setSource] = React.useState<'portfolio' | 'watchlist'>('portfolio')

  // Determine tickers to correlate
  const tickers = useMemo(() => {
    const base = source === 'portfolio'
      ? positions.map(p => p.ticker)
      : watchlist
    // Deduplicate, max 12
    return [...new Set(base.map(t => t.toUpperCase()))].slice(0, 12)
  }, [source, positions, watchlist])

  // Fetch history for all tickers in parallel
  const queries = useQueries({
    queries: tickers.map(ticker => ({
      queryKey: ['history', ticker, range],
      queryFn:  () => fetch(`/api/history?symbol=${ticker}&range=${range}`)
        .then(r => r.json()) as Promise<HistoryPoint[]>,
      staleTime: 60 * 60_000,
    })),
  })

  const loading = queries.some(q => q.isLoading)
  const seriesMap = useMemo(() => {
    const m = new Map<string, HistoryPoint[]>()
    tickers.forEach((t, i) => {
      const d = queries[i]?.data
      if (Array.isArray(d) && d.length > 0) m.set(t, d)
    })
    return m
  }, [queries, tickers])

  const readyTickers = tickers.filter(t => seriesMap.has(t))
  const n = readyTickers.length

  // Compute returns for each ticker
  const returnsMap = useMemo(() => {
    const m = new Map<string, number[]>()
    for (const [t, series] of seriesMap)
      m.set(t, logReturns(series.map(p => p.c)))
    return m
  }, [seriesMap])

  // Compute correlation matrix
  const matrix: (number | null)[][] = useMemo(() => {
    return readyTickers.map((ti, i) => {
      return readyTickers.map((tj, j) => {
        if (i === j) return 1
        const [ca, cb] = alignSeries(seriesMap.get(ti)!, seriesMap.get(tj)!)
        const ra = logReturns(ca), rb = logReturns(cb)
        const r = pearson(ra, rb)
        return isNaN(r) ? null : parseFloat(r.toFixed(3))
      })
    })
  }, [readyTickers, seriesMap])

  const avgCorr = divScore(matrix, n)

  const empty = source === 'portfolio' ? positions.length === 0 : watchlist.length === 0

  return (
    <div className="panel" style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* Header */}
      <div className="panel-header" style={{ justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="panel-mnemonic">CORR</span>
          <span style={{ color: '#444', fontSize: 10 }}>CORRELATION MATRIX</span>
        </div>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          {/* Source */}
          {(['portfolio', 'watchlist'] as const).map(s => (
            <button key={s} onClick={() => setSource(s)} style={{
              background: source === s ? '#0a1a0a' : 'none',
              border: `1px solid ${source === s ? '#ffa028' : '#222'}`,
              color: source === s ? '#ffa028' : '#444',
              fontFamily: 'inherit', fontSize: 8, padding: '1px 7px', cursor: 'pointer',
              letterSpacing: '0.04em', textTransform: 'uppercase',
            }}>{s}</button>
          ))}
          <div style={{ width: 1, background: '#222', height: 10 }} />
          {/* Range */}
          {RANGE_OPTS.map(r => (
            <button key={r} onClick={() => setRange(r)} style={{
              background: range === r ? '#0a1a0a' : 'none',
              border: `1px solid ${range === r ? '#ffa028' : '#222'}`,
              color: range === r ? '#ffa028' : '#444',
              fontFamily: 'inherit', fontSize: 8, padding: '1px 7px', cursor: 'pointer',
            }}>{r}</button>
          ))}
        </div>
      </div>

      {empty && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 8 }}>
          <div style={{ color: '#444', fontSize: 11 }}>No {source} holdings</div>
          <div style={{ color: '#2a2a2a', fontSize: 9 }}>
            {source === 'portfolio' ? 'Add positions in PORT' : 'Add tickers to watchlist with WL ADD <TICKER>'}
          </div>
        </div>
      )}

      {!empty && loading && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#444' }}>
          Loading price history for {tickers.length} tickers…
        </div>
      )}

      {!empty && !loading && n < 2 && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#444', fontSize: 11 }}>
          Need at least 2 tickers with available price history
        </div>
      )}

      {!empty && !loading && n >= 2 && (
        <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>

          {/* Summary bar */}
          <div style={{ display: 'flex', gap: 24, padding: '8px 14px', borderBottom: '1px solid #111', flexShrink: 0 }}>
            <div>
              <div style={{ color: '#333', fontSize: 8, letterSpacing: '0.06em' }}>TICKERS</div>
              <div style={{ color: '#b0b0b0', fontSize: 14, fontWeight: 'bold' }}>{n}</div>
            </div>
            <div>
              <div style={{ color: '#333', fontSize: 8, letterSpacing: '0.06em' }}>AVG CORRELATION</div>
              <div style={{
                fontSize: 14, fontWeight: 'bold',
                color: avgCorr == null ? '#555'
                  : avgCorr < 0.3 ? '#33ff66'
                  : avgCorr < 0.6 ? '#ffa028'
                  : '#ff3b3b',
              }}>
                {avgCorr != null ? avgCorr.toFixed(2) : '—'}
              </div>
            </div>
            <div>
              <div style={{ color: '#333', fontSize: 8, letterSpacing: '0.06em' }}>DIVERSIFICATION</div>
              <div style={{
                fontSize: 14, fontWeight: 'bold',
                color: avgCorr == null ? '#555'
                  : avgCorr < 0.3 ? '#33ff66'
                  : avgCorr < 0.6 ? '#ffa028'
                  : '#ff3b3b',
              }}>
                {avgCorr == null ? '—'
                  : avgCorr < 0.25 ? 'EXCELLENT'
                  : avgCorr < 0.45 ? 'GOOD'
                  : avgCorr < 0.65 ? 'MODERATE'
                  : 'CONCENTRATED'}
              </div>
            </div>
            <div style={{ marginLeft: 'auto', alignSelf: 'center' }}>
              <div style={{ color: '#222', fontSize: 8 }}>{range} daily log-returns · Pearson r</div>
            </div>
          </div>

          {/* Matrix */}
          <div style={{ flex: 1, overflow: 'auto', padding: '12px 14px' }}>
            <table style={{ borderCollapse: 'collapse', tableLayout: 'fixed' }}>
              <thead>
                <tr>
                  <th style={{ width: 56 }} />
                  {readyTickers.map(t => (
                    <th key={t} style={{
                      color: '#666', fontSize: 8, fontWeight: 'normal', letterSpacing: '0.06em',
                      padding: '0 2px 6px', textAlign: 'center', width: 52,
                    }}>
                      <div style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', height: 44, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {t}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {readyTickers.map((ti, i) => (
                  <tr key={ti}>
                    <td style={{ color: '#666', fontSize: 9, padding: '2px 8px 2px 0', textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {ti}
                    </td>
                    {readyTickers.map((tj, j) => {
                      const r = matrix[i][j]
                      const isDiag = i === j
                      return (
                        <td key={tj} style={{
                          width: 52, height: 40, padding: 1,
                          background: isDiag ? '#111' : corrColor(r ?? NaN),
                          textAlign: 'center', verticalAlign: 'middle',
                        }}>
                          <span style={{ color: isDiag ? '#ffa028' : corrTextColor(r ?? NaN), fontSize: isDiag ? 10 : 9, fontWeight: isDiag ? 'bold' : 'normal' }}>
                            {isDiag ? '1.00' : r != null ? r.toFixed(2) : '—'}
                          </span>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Legend */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 16 }}>
              <span style={{ color: '#333', fontSize: 8 }}>CORRELATION:</span>
              {[[-1,'#501010'],[-0.5,'#381818'],[0,'#141414'],[0.5,'#183818'],[1,'#105010']].map(([v, bg]) => (
                <div key={v} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                  <div style={{ width: 12, height: 12, background: bg as string }} />
                  <span style={{ color: '#333', fontSize: 8 }}>{v}</span>
                </div>
              ))}
              <span style={{ color: '#1a1a1a', fontSize: 8, marginLeft: 8 }}>
                {tickers.length > n ? ` · ${tickers.length - n} ticker(s) missing history` : ''}
              </span>
            </div>
          </div>
        </div>
      )}

      <div style={{ flexShrink: 0, borderTop: '1px solid #0d0d0d', padding: '3px 10px', background: '#020202' }}>
        <span style={{ color: '#222', fontSize: 8 }}>
          Max 12 tickers · Source: Yahoo Finance · {source === 'portfolio' ? 'Add positions in PORT to populate' : 'Based on watchlist'}
        </span>
      </div>
    </div>
  )
}

// React is needed for useState
import React from 'react'
