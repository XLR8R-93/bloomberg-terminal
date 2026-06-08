'use client'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTerminalStore } from '@/lib/store'
import type { EstimatesData, EstimateRow, PriceTarget } from '@/app/api/estimates/route'

type Period = 'currentQuarter' | 'nextQuarter' | 'currentYear' | 'nextYear'
const PERIODS: { key: Period; label: string }[] = [
  { key: 'currentQuarter', label: '0Q' },
  { key: 'nextQuarter',    label: '+1Q' },
  { key: 'currentYear',    label: '0Y' },
  { key: 'nextYear',       label: '+1Y' },
]

function fmtNum(v: number | null, isRevenue = false): string {
  if (v == null) return '—'
  if (isRevenue) {
    if (Math.abs(v) >= 1e12) return `$${(v / 1e12).toFixed(2)}T`
    if (Math.abs(v) >= 1e9)  return `$${(v / 1e9).toFixed(2)}B`
    if (Math.abs(v) >= 1e6)  return `$${(v / 1e6).toFixed(1)}M`
    return `$${v.toFixed(0)}`
  }
  return v.toFixed(2)
}

function fmtPct(v: number | null): string {
  if (v == null) return '—'
  return `${v >= 0 ? '+' : ''}${(v * 100).toFixed(1)}%`
}

// The Bloomberg-style distribution bar: a track with a dot marking consensus position
function DistBar({ low, consensus, high }: { low: number | null; consensus: number | null; high: number | null }) {
  if (low == null || consensus == null || high == null || high === low) {
    return <div style={{ width: 80, height: 16 }} />
  }
  const pct = Math.max(0, Math.min(1, (consensus - low) / (high - low))) * 100

  return (
    <div style={{ width: 80, display: 'flex', alignItems: 'center', position: 'relative', height: 16, flexShrink: 0 }}>
      {/* Track */}
      <div style={{ position: 'absolute', left: 0, right: 0, height: 2, background: '#1f1f1f' }} />
      {/* Filled portion up to consensus */}
      <div style={{ position: 'absolute', left: 0, height: 2, width: `${pct}%`, background: '#2a4a2a' }} />
      {/* Consensus dot */}
      <div style={{
        position: 'absolute',
        left: `${pct}%`,
        transform: 'translateX(-50%)',
        width: 6, height: 6,
        borderRadius: '50%',
        background: '#ffa028',
        border: '1px solid #000',
      }} />
    </div>
  )
}

function EstimateTable({ rows, label }: { rows: EstimateRow[]; label: string }) {
  if (!rows.length) return null
  const isRev = (row: EstimateRow) => row.metric === 'Revenue'

  return (
    <div style={{ marginBottom: 0 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #1f1f1f' }}>
            <th style={{ color: '#ffa028', fontSize: 10, textAlign: 'left', padding: '3px 6px 3px 0', fontWeight: 'normal', textTransform: 'uppercase', letterSpacing: '0.06em', width: '22%' }}>
              Metric
            </th>
            <th style={{ color: '#555', fontSize: 10, textAlign: 'right', padding: '3px 6px', fontWeight: 'normal' }}>Consensus</th>
            <th style={{ color: '#555', fontSize: 10, textAlign: 'right', padding: '3px 6px', fontWeight: 'normal' }}>Low</th>
            <th style={{ color: '#555', fontSize: 10, textAlign: 'center', padding: '3px 6px', fontWeight: 'normal', width: 96 }}>Distribution</th>
            <th style={{ color: '#555', fontSize: 10, textAlign: 'right', padding: '3px 6px', fontWeight: 'normal' }}>High</th>
            <th style={{ color: '#555', fontSize: 10, textAlign: 'right', padding: '3px 6px', fontWeight: 'normal' }}>Analysts</th>
            <th style={{ color: '#555', fontSize: 10, textAlign: 'right', padding: '3px 6px', fontWeight: 'normal' }}>YoY Gr%</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const rev = isRev(row)
            const growthColor = row.growth == null ? '#555' : row.growth >= 0 ? '#33ff66' : '#ff3b3b'
            return (
              <tr key={i} style={{ borderBottom: '1px solid #0d0d0d' }}>
                <td style={{ color: '#cccccc', fontSize: 11, padding: '4px 6px 4px 0', fontWeight: 'bold' }}>
                  {row.metric}
                </td>
                <td style={{ color: '#ffa028', fontSize: 11, textAlign: 'right', padding: '4px 6px', fontVariantNumeric: 'tabular-nums' }}>
                  {fmtNum(row.consensus, rev)}
                </td>
                <td style={{ color: '#555', fontSize: 10, textAlign: 'right', padding: '4px 6px', fontVariantNumeric: 'tabular-nums' }}>
                  {fmtNum(row.low, rev)}
                </td>
                <td style={{ padding: '4px 6px', textAlign: 'center' }}>
                  <div style={{ display: 'flex', justifyContent: 'center' }}>
                    <DistBar low={row.low} consensus={row.consensus} high={row.high} />
                  </div>
                </td>
                <td style={{ color: '#555', fontSize: 10, textAlign: 'right', padding: '4px 6px', fontVariantNumeric: 'tabular-nums' }}>
                  {fmtNum(row.high, rev)}
                </td>
                <td style={{ color: '#666', fontSize: 10, textAlign: 'right', padding: '4px 6px' }}>
                  {row.count ?? '—'}
                </td>
                <td style={{ color: growthColor, fontSize: 10, textAlign: 'right', padding: '4px 6px', fontVariantNumeric: 'tabular-nums' }}>
                  {fmtPct(row.growth)}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function PriceTargetRow({ pt, currentPrice }: { pt: PriceTarget; currentPrice?: number | null }) {
  const recColor: Record<string, string> = {
    buy: '#33ff66', 'strong_buy': '#33ff66',
    hold: '#ffa028', neutral: '#ffa028',
    sell: '#ff3b3b', 'strong_sell': '#ff3b3b',
    underperform: '#ff3b3b',
  }
  const rec = pt.recommendation?.toLowerCase() || ''
  const color = recColor[rec] || '#888'

  return (
    <div style={{ borderBottom: '1px solid #1f1f1f', paddingBottom: 8, marginBottom: 12 }}>
      <div style={{ color: '#ffa028', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
        Price Target  {pt.count != null && <span style={{ color: '#444', fontWeight: 'normal' }}>({pt.count} analysts)</span>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        {/* Visual range bar */}
        <div style={{ flex: 1, position: 'relative', height: 24 }}>
          {pt.low != null && pt.high != null && (
            <>
              {/* Range track */}
              <div style={{ position: 'absolute', top: 10, left: 0, right: 0, height: 2, background: '#1a1a1a' }} />
              {/* Filled range */}
              <div style={{ position: 'absolute', top: 10, left: 0, right: 0, height: 2, background: '#1f3a1f' }} />

              {/* Low marker */}
              <div style={{ position: 'absolute', left: 0, top: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                <span style={{ color: '#ff3b3b', fontSize: 9 }}>{fmtNum(pt.low)}</span>
                <div style={{ width: 1, height: 8, background: '#ff3b3b44' }} />
                <span style={{ color: '#444', fontSize: 8 }}>LOW</span>
              </div>

              {/* Mean marker */}
              {pt.mean != null && pt.high !== pt.low && (
                <div style={{
                  position: 'absolute',
                  left: `${Math.max(5, Math.min(90, ((pt.mean - pt.low) / (pt.high - pt.low)) * 100))}%`,
                  top: 0,
                  transform: 'translateX(-50%)',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                }}>
                  <span style={{ color: '#ffa028', fontSize: 10, fontWeight: 'bold' }}>{fmtNum(pt.mean)}</span>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#ffa028', border: '1px solid #000' }} />
                  <span style={{ color: '#444', fontSize: 8 }}>MEAN</span>
                </div>
              )}

              {/* High marker */}
              <div style={{ position: 'absolute', right: 0, top: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                <span style={{ color: '#33ff66', fontSize: 9 }}>{fmtNum(pt.high)}</span>
                <div style={{ width: 1, height: 8, background: '#33ff6644' }} />
                <span style={{ color: '#444', fontSize: 8 }}>HIGH</span>
              </div>

              {/* Current price marker */}
              {currentPrice != null && currentPrice >= pt.low && currentPrice <= pt.high && (
                <div style={{
                  position: 'absolute',
                  left: `${((currentPrice - pt.low) / (pt.high - pt.low)) * 100}%`,
                  top: 6,
                  transform: 'translateX(-50%)',
                  width: 2, height: 10,
                  background: '#4d9fff',
                }} title={`Current: ${fmtNum(currentPrice)}`} />
              )}
            </>
          )}
        </div>

        {/* Recommendation badge */}
        {rec && (
          <div style={{ border: `1px solid ${color}`, color, fontSize: 11, padding: '2px 8px', letterSpacing: '0.1em', textTransform: 'uppercase', flexShrink: 0 }}>
            {rec.replace('_', ' ')}
          </div>
        )}
      </div>
    </div>
  )
}

export function EST() {
  const { activeTicker } = useTerminalStore()
  const [period, setPeriod] = useState<Period>('currentYear')

  const { data, isLoading, error } = useQuery<EstimatesData>({
    queryKey: ['estimates', activeTicker],
    queryFn: () => fetch(`/api/estimates?symbol=${activeTicker}`).then((r) => r.json()),
    staleTime: 60 * 60_000,
  })

  const { data: quote } = useQuery<{ c: number }>({
    queryKey: ['quote', activeTicker],
    queryFn: () => fetch(`/api/finnhub/quote?symbol=${activeTicker}`).then((r) => r.json()),
  })

  const rows = Array.isArray(data?.[period]) ? data![period] : []

  return (
    <div className="panel" style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div className="panel-header">
        <span className="panel-mnemonic">EST — ANALYST ESTIMATES</span>
        <span className="panel-ticker">{activeTicker}</span>
      </div>

      {/* Period selector */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid #1f1f1f', background: '#050505', flexShrink: 0 }}>
        {PERIODS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setPeriod(key)}
            style={{
              background: period === key ? '#111' : 'transparent',
              border: 'none',
              borderRight: '1px solid #1a1a1a',
              borderBottom: period === key ? '2px solid #ffa028' : '2px solid transparent',
              color: period === key ? '#ffa028' : '#555',
              cursor: 'pointer',
              fontFamily: 'inherit',
              fontSize: 10,
              padding: '4px 14px',
              letterSpacing: '0.06em',
            }}
          >
            {label}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <span style={{ color: '#333', fontSize: 9, padding: '0 8px', alignSelf: 'center' }}>
          0Q=CUR QTR  +1Q=NEXT QTR  0Y=CUR YEAR  +1Y=NEXT YEAR
        </span>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 10 }}>
        {isLoading ? (
          [...Array(6)].map((_, i) => (
            <div key={i} className="skeleton" style={{ height: 13, marginBottom: 4, width: `${50 + (i * 17) % 40}%` }} />
          ))
        ) : error || !data ? (
          <div style={{ color: '#ff3b3b', fontSize: 11 }}>Estimates unavailable</div>
        ) : (
          <>
            <PriceTargetRow pt={data.priceTarget} currentPrice={quote?.c} />
            <EstimateTable rows={rows} label={period} />
          </>
        )}
      </div>
    </div>
  )
}
