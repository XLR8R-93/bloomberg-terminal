'use client'
import { useQuery } from '@tanstack/react-query'
import { useTerminalStore } from '@/lib/store'
import { usePaneTicker } from '@/lib/pane-context'
import type { EstimatesData } from '@/app/api/estimates/route'

interface EarningsItem {
  actual: number | null; estimate: number | null; period: string
  quarter: number; year: number; surprisePercent?: number | null
}
interface RecommendationItem {
  buy: number; hold: number; period: string; sell: number; strongBuy: number; strongSell: number
}
interface EarningsData { earnings: EarningsItem[]; recommendations: RecommendationItem[] }

function fmt(v: number | null | undefined, d = 2) {
  if (v == null || isNaN(v as number)) return '—'
  return (v as number).toFixed(d)
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      color: '#ffa028', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em',
      borderBottom: '1px solid #1f1f1f', paddingBottom: 2, marginBottom: 6, marginTop: 12,
    }}>
      {children}
    </div>
  )
}

// Surprise bar: shows beat/miss magnitude
function SurpriseBar({ pct }: { pct: number }) {
  const capped = Math.max(-20, Math.min(20, pct))
  const isPos = pct >= 0
  const color = isPos ? '#33ff66' : '#ff3b3b'
  const width = Math.abs(capped) / 20 * 50
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <div style={{ width: 50, height: 6, background: '#111', position: 'relative' }}>
        {isPos
          ? <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${width}%`, background: color }} />
          : <div style={{ position: 'absolute', right: 0, top: 0, height: '100%', width: `${width}%`, background: color }} />
        }
      </div>
      <span style={{ color, fontSize: 10, minWidth: 44, fontVariantNumeric: 'tabular-nums' }}>
        {pct >= 0 ? '+' : ''}{pct.toFixed(1)}%
      </span>
    </div>
  )
}

// Analyst rec stacked bar
function RecBar({ r }: { r: RecommendationItem }) {
  const total = r.strongBuy + r.buy + r.hold + r.sell + r.strongSell || 1
  const pct = (n: number) => `${(n / total * 100).toFixed(0)}%`
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
        <span style={{ color: '#444', fontSize: 10 }}>{r.period}</span>
        <span style={{ color: '#444', fontSize: 10 }}>n={total}</span>
      </div>
      <div style={{ display: 'flex', height: 10, width: '100%', overflow: 'hidden', borderRadius: 1 }}>
        <div style={{ width: pct(r.strongBuy),  background: '#1a5a1a' }} title={`Strong Buy: ${r.strongBuy}`} />
        <div style={{ width: pct(r.buy),         background: '#33ff66' }} />
        <div style={{ width: pct(r.hold),        background: '#555' }} />
        <div style={{ width: pct(r.sell),        background: '#ff3b3b' }} />
        <div style={{ width: pct(r.strongSell), background: '#7a1a1a' }} />
      </div>
      <div style={{ display: 'flex', gap: 10, fontSize: 9, marginTop: 2 }}>
        <span style={{ color: '#33ff66' }}>SB {r.strongBuy} · B {r.buy}</span>
        <span style={{ color: '#e8e8e8' }}>H {r.hold}</span>
        <span style={{ color: '#ff3b3b' }}>S {r.sell} · SS {r.strongSell}</span>
      </div>
    </div>
  )
}

function fmtEstimate(v: number | null, isRev: boolean): string {
  if (v == null) return '—'
  if (isRev) {
    if (Math.abs(v) >= 1e12) return `$${(v / 1e12).toFixed(2)}T`
    if (Math.abs(v) >= 1e9)  return `$${(v / 1e9).toFixed(2)}B`
    if (Math.abs(v) >= 1e6)  return `$${(v / 1e6).toFixed(1)}M`
    return `$${v.toFixed(0)}`
  }
  return `$${v.toFixed(2)}`
}

function DistBar({ low, consensus, high }: { low: number | null; consensus: number | null; high: number | null }) {
  if (low == null || consensus == null || high == null || high === low) {
    return <div style={{ width: 70, height: 14 }} />
  }
  const pct = Math.max(0, Math.min(1, (consensus - low) / (high - low))) * 100
  return (
    <div style={{ width: 70, position: 'relative', height: 14, flexShrink: 0, display: 'flex', alignItems: 'center' }}>
      <div style={{ position: 'absolute', left: 0, right: 0, height: 2, background: '#1f1f1f' }} />
      <div style={{ position: 'absolute', left: 0, height: 2, width: `${pct}%`, background: '#2a4a2a' }} />
      <div style={{
        position: 'absolute', left: `${pct}%`, transform: 'translateX(-50%)',
        width: 6, height: 6, borderRadius: '50%', background: '#ffa028', border: '1px solid #000',
      }} />
    </div>
  )
}

export function EE() {
  const { activeTicker: _globalTicker } = useTerminalStore()
  const activeTicker = usePaneTicker(_globalTicker)

  const { data: earningsData, isLoading } = useQuery<EarningsData>({
    queryKey: ['earnings', activeTicker],
    queryFn: () => fetch(`/api/finnhub/earnings?symbol=${activeTicker}`).then((r) => r.json()),
    staleTime: 60 * 60_000,
  })

  const { data: estimates } = useQuery<EstimatesData>({
    queryKey: ['estimates', activeTicker],
    queryFn: () => fetch(`/api/estimates?symbol=${activeTicker}`).then((r) => r.json()),
    staleTime: 60 * 60_000,
  })

  const earnings = (earningsData?.earnings || []).slice(0, 8).reverse()
  const recs = (earningsData?.recommendations || []).slice(0, 3)

  const fwdPeriods = [
    { label: 'Current Qtr',  rows: Array.isArray(estimates?.currentQuarter) ? estimates!.currentQuarter : [] },
    { label: 'Next Qtr',     rows: Array.isArray(estimates?.nextQuarter)    ? estimates!.nextQuarter    : [] },
    { label: 'Current Year', rows: Array.isArray(estimates?.currentYear)    ? estimates!.currentYear    : [] },
    { label: 'Next Year',    rows: Array.isArray(estimates?.nextYear)       ? estimates!.nextYear       : [] },
  ]

  return (
    <div className="panel" style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div className="panel-header">
        <span className="panel-mnemonic">EE — EARNINGS &amp; ESTIMATES</span>
        <span className="panel-ticker">{activeTicker}</span>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '0 10px 10px' }}>
        {isLoading ? (
          [...Array(8)].map((_, i) => <div key={i} className="skeleton" style={{ height: 14, marginBottom: 3 }} />)
        ) : (
          <>
            {/* Forward estimates from Yahoo */}
            {fwdPeriods.some((p) => p.rows.length > 0) && (
              <>
                <SectionLabel>Forward Estimates</SectionLabel>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #1f1f1f' }}>
                      <th style={{ color: '#e8e8e8', textAlign: 'left',   padding: '2px 6px 2px 0', fontWeight: 'normal', fontSize: 10 }}>Period</th>
                      <th style={{ color: '#e8e8e8', textAlign: 'left',   padding: '2px 6px', fontWeight: 'normal', fontSize: 10 }}>Metric</th>
                      <th style={{ color: '#e8e8e8', textAlign: 'right',  padding: '2px 6px', fontWeight: 'normal', fontSize: 10 }}>Consensus</th>
                      <th style={{ color: '#e8e8e8', textAlign: 'right',  padding: '2px 6px', fontWeight: 'normal', fontSize: 10 }}>Low</th>
                      <th style={{ color: '#e8e8e8', textAlign: 'center', padding: '2px 6px', fontWeight: 'normal', fontSize: 10 }}>Range</th>
                      <th style={{ color: '#e8e8e8', textAlign: 'right',  padding: '2px 6px', fontWeight: 'normal', fontSize: 10 }}>High</th>
                      <th style={{ color: '#e8e8e8', textAlign: 'right',  padding: '2px 6px', fontWeight: 'normal', fontSize: 10 }}>n</th>
                      <th style={{ color: '#e8e8e8', textAlign: 'right',  padding: '2px 6px', fontWeight: 'normal', fontSize: 10 }}>YoY</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fwdPeriods.map(({ label, rows }) =>
                      rows.map((row, ri) => {
                        const isRev = row.metric === 'Revenue'
                        const growthColor = row.growth == null ? '#555' : row.growth >= 0 ? '#33ff66' : '#ff3b3b'
                        return (
                          <tr key={`${label}-${ri}`} style={{ borderBottom: '1px solid #0a0a0a' }}>
                            {ri === 0 && (
                              <td rowSpan={rows.length} style={{ color: '#444', fontSize: 10, padding: '3px 6px 3px 0', verticalAlign: 'top', paddingTop: 5, whiteSpace: 'nowrap' }}>
                                {label}
                              </td>
                            )}
                            <td style={{ color: '#d8d8d8', padding: '3px 6px', whiteSpace: 'nowrap' }}>{row.metric}</td>
                            <td style={{ color: '#ffa028', textAlign: 'right', padding: '3px 6px', fontVariantNumeric: 'tabular-nums' }}>
                              {fmtEstimate(row.consensus, isRev)}
                            </td>
                            <td style={{ color: '#444', textAlign: 'right', padding: '3px 6px', fontSize: 10, fontVariantNumeric: 'tabular-nums' }}>
                              {fmtEstimate(row.low, isRev)}
                            </td>
                            <td style={{ padding: '3px 6px', textAlign: 'center' }}>
                              <div style={{ display: 'flex', justifyContent: 'center' }}>
                                <DistBar low={row.low} consensus={row.consensus} high={row.high} />
                              </div>
                            </td>
                            <td style={{ color: '#444', textAlign: 'right', padding: '3px 6px', fontSize: 10, fontVariantNumeric: 'tabular-nums' }}>
                              {fmtEstimate(row.high, isRev)}
                            </td>
                            <td style={{ color: '#444', textAlign: 'right', padding: '3px 6px', fontSize: 10 }}>{row.count ?? '—'}</td>
                            <td style={{ color: growthColor, textAlign: 'right', padding: '3px 6px', fontSize: 10, fontVariantNumeric: 'tabular-nums' }}>
                              {row.growth != null ? `${row.growth >= 0 ? '+' : ''}${(row.growth * 100).toFixed(1)}%` : '—'}
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </>
            )}

            {/* EPS surprise history */}
            <SectionLabel>EPS Surprise History</SectionLabel>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #1f1f1f' }}>
                  <th style={{ color: '#e8e8e8', textAlign: 'left',  padding: '2px 6px 2px 0', fontWeight: 'normal', fontSize: 10 }}>Period</th>
                  <th style={{ color: '#e8e8e8', textAlign: 'right', padding: '2px 6px', fontWeight: 'normal', fontSize: 10 }}>Estimate</th>
                  <th style={{ color: '#e8e8e8', textAlign: 'right', padding: '2px 6px', fontWeight: 'normal', fontSize: 10 }}>Actual</th>
                  <th style={{ color: '#e8e8e8', textAlign: 'left',  padding: '2px 6px', fontWeight: 'normal', fontSize: 10 }}>Surprise</th>
                </tr>
              </thead>
              <tbody>
                {earnings.map((e, i) => {
                  const beat = e.actual != null && e.estimate != null && e.actual >= e.estimate
                  const surprisePct = e.surprisePercent != null
                    ? e.surprisePercent
                    : (e.actual != null && e.estimate != null && e.estimate !== 0)
                      ? ((e.actual - e.estimate) / Math.abs(e.estimate)) * 100
                      : null
                  return (
                    <tr key={i} style={{ borderBottom: '1px solid #0a0a0a' }}>
                      <td style={{ color: '#e8e8e8', padding: '3px 6px 3px 0' }}>{e.period}</td>
                      <td style={{ textAlign: 'right', color: '#d8d8d8', padding: '3px 6px', fontVariantNumeric: 'tabular-nums' }}>${fmt(e.estimate)}</td>
                      <td style={{ textAlign: 'right', color: beat ? '#33ff66' : '#ff3b3b', padding: '3px 6px', fontWeight: 'bold', fontVariantNumeric: 'tabular-nums' }}>${fmt(e.actual)}</td>
                      <td style={{ padding: '3px 6px' }}>
                        {surprisePct != null ? <SurpriseBar pct={surprisePct} /> : <span style={{ color: '#444' }}>—</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>

            {/* Analyst recommendations */}
            {recs.length > 0 && (
              <>
                <SectionLabel>Analyst Recommendations</SectionLabel>
                {recs.map((r, i) => <RecBar key={i} r={r} />)}
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
