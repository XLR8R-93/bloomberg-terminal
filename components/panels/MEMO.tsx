'use client'
import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useTerminalStore } from '@/lib/store'
import { usePaneTicker } from '@/lib/pane-context'
import type { MemoData, FinancialRow, PriceVolumePoint, RiskItem, ThesisRow, KeyMetrics, DCFOutput, ScoreCard, PeerRow } from '@/app/api/memo/route'

// ── Brand tokens ──────────────────────────────────────────────────────────────
const OAK = {
  darkGreen:  '#1a3a27',
  brandGreen: '#2d6a4f',
  mint:       '#edf5f0',
  gold:       '#c9a84c',
  white:      '#ffffff',
  textDark:   '#1a1a1a',
  textMid:    '#3a3a3a',
  textLight:  '#6a6a6a',
  border:     '#c8ddd0',
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtM(n: number | null): string {
  if (n == null) return '—'
  const m = n / 1_000_000
  const abs = Math.abs(m)
  const s = abs >= 1000 ? `$${(abs / 1000).toFixed(2)}b` : `$${abs.toFixed(2)}m`
  return m < 0 ? `(${s})` : s
}

function fmt(n: number | null, decimals = 1, suffix = ''): string {
  if (n == null) return '—'
  return `${n.toFixed(decimals)}${suffix}`
}

function recBg(rec: string) {
  if (rec === 'BUY')   return '#2d6a4f'
  if (rec === 'HOLD')  return '#b08a2e'
  if (rec === 'SELL' || rec === 'AVOID') return '#7a1f1f'
  return '#555'
}

function convictionBg(c: string) {
  if (c === 'HIGH')   return '#1a3a27'
  if (c === 'MEDIUM') return '#6b5a1e'
  return '#3a3a3a'
}

// ── Section header ────────────────────────────────────────────────────────────
function SecHeader({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontFamily: 'Georgia, serif',
      fontSize: 12,
      color: OAK.brandGreen,
      fontWeight: 400,
      marginBottom: 7,
      paddingBottom: 4,
      borderBottom: `1px solid ${OAK.border}`,
      letterSpacing: '0.01em',
    }}>
      {children}
    </div>
  )
}

// ── Key metrics strip ─────────────────────────────────────────────────────────
function MetricsStrip({ km }: { km: KeyMetrics }) {
  const chips: { label: string; value: string; highlight?: boolean }[] = [
    { label: 'PRICE',      value: km.price      != null ? `$${km.price.toFixed(2)}` : '—' },
    { label: 'P/E (TTM)',  value: fmt(km.pe, 1, 'x') },
    { label: 'EV/EBITDA',  value: fmt(km.evEbitda, 1, 'x') },
    { label: 'ROE',        value: fmt(km.roe, 1, '%'), highlight: km.roe != null && km.roe > 15 },
    { label: '52W HIGH',   value: km.week52High != null ? `$${km.week52High.toFixed(2)}` : '—' },
    { label: '52W LOW',    value: km.week52Low  != null ? `$${km.week52Low.toFixed(2)}`  : '—' },
    {
      label: 'NET POSITION',
      value: km.netDebt == null ? '—'
        : km.netDebt < 0  ? `Cash $${Math.abs(km.netDebt).toFixed(0)}m`
        : km.netDebt === 0 ? 'Neutral'
        : `Debt $${km.netDebt.toFixed(0)}m`,
      highlight: km.netDebt != null && km.netDebt < 0,
    },
  ]

  return (
    <div style={{
      display: 'flex',
      borderTop: `1px solid rgba(255,255,255,0.12)`,
      borderBottom: `2px solid ${OAK.gold}`,
      background: '#152e1e',
    }}>
      {chips.map((c, i) => (
        <div key={i} style={{
          flex: 1,
          padding: '5px 10px',
          borderRight: i < chips.length - 1 ? '1px solid rgba(255,255,255,0.08)' : 'none',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: 7, color: '#7aaa8a', letterSpacing: '0.08em', marginBottom: 2 }}>
            {c.label}
          </div>
          <div style={{
            fontSize: 11,
            fontWeight: 600,
            fontFamily: 'Georgia, serif',
            color: c.highlight ? OAK.gold : OAK.white,
            letterSpacing: '0.02em',
          }}>
            {c.value}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Price / Volume SVG chart ──────────────────────────────────────────────────
function PriceVolumeChart({ data }: { data: PriceVolumePoint[] }) {
  if (!data || data.length === 0) {
    return (
      <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', color: OAK.textLight, fontSize: 10 }}>
        No price data available
      </div>
    )
  }

  const W = 420, H = 158
  const PAD = { top: 6, right: 40, bottom: 36, left: 8 }
  const chartW = W - PAD.left - PAD.right
  const chartH = H - PAD.top - PAD.bottom

  const prices  = data.map(d => d.c)
  const volumes = data.map(d => d.v)
  const minP = Math.min(...prices), maxP = Math.max(...prices)
  const maxV = Math.max(...volumes, 1)

  const VFRAC  = 0.28
  const priceH = chartH * (1 - VFRAC)
  const volH   = chartH * VFRAC

  const xOf      = (i: number) => PAD.left + (i / (data.length - 1)) * chartW
  const yOfPrice = (p: number) => PAD.top + priceH - ((p - minP) / (maxP - minP || 1)) * priceH

  const linePoints = data.map((d, i) => `${xOf(i).toFixed(1)},${yOfPrice(d.c).toFixed(1)}`).join(' ')

  const ticks = [0, Math.floor(data.length / 2), data.length - 1]
  function fmtLabel(t: string) {
    return new Date(t).toLocaleDateString('en-AU', { month: 'short', year: '2-digit' })
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }}>
      {/* Volume bars */}
      {data.map((d, i) => {
        const barH = (d.v / maxV) * volH
        const barW = Math.max(1, chartW / data.length - 0.4)
        return (
          <rect key={i}
            x={xOf(i) - barW / 2}
            y={PAD.top + priceH + (volH - barH)}
            width={barW} height={barH}
            fill="#e07b39" opacity={0.65}
          />
        )
      })}

      {/* Price / volume divider */}
      <line x1={PAD.left} y1={PAD.top + priceH} x2={PAD.left + chartW} y2={PAD.top + priceH}
        stroke={OAK.border} strokeWidth={0.5} />

      {/* Price line */}
      <polyline points={linePoints} fill="none" stroke="#1a2744" strokeWidth={1.6} strokeLinejoin="round" />

      {/* X-axis date labels */}
      {ticks.map(i => (
        <text key={i} x={xOf(i)} y={H - 24}
          textAnchor={i === 0 ? 'start' : i === data.length - 1 ? 'end' : 'middle'}
          fontSize={7} fill={OAK.textLight}>
          {fmtLabel(data[i].t)}
        </text>
      ))}

      {/* Price range (right axis) */}
      <text x={W - 2} y={PAD.top + 6}      textAnchor="end" fontSize={7} fill={OAK.textLight}>{maxP.toFixed(2)}</text>
      <text x={W - 2} y={PAD.top + priceH - 2} textAnchor="end" fontSize={7} fill={OAK.textLight}>{minP.toFixed(2)}</text>

      {/* Legend — below date labels */}
      <rect x={PAD.left}      y={H - 13} width={8} height={6} fill="#e07b39" opacity={0.7} />
      <text x={PAD.left + 10} y={H - 7}  fontSize={7} fill={OAK.textLight}>Volume</text>
      <line x1={PAD.left + 46} y1={H - 10} x2={PAD.left + 58} y2={H - 10} stroke="#1a2744" strokeWidth={1.5} />
      <text x={PAD.left + 60} y={H - 7}  fontSize={7} fill={OAK.textLight}>Adj Close</text>
    </svg>
  )
}

// ── Financials table ──────────────────────────────────────────────────────────
function FinancialsTable({ rows }: { rows: FinancialRow[] }) {
  const th: React.CSSProperties = {
    background: OAK.darkGreen, color: OAK.white,
    fontSize: 9, padding: '4px 8px', textAlign: 'center',
    fontWeight: 600, border: `1px solid ${OAK.brandGreen}`,
    fontFamily: 'Arial, sans-serif',
  }
  const td: React.CSSProperties = {
    fontSize: 9, padding: '4px 8px', textAlign: 'center',
    border: `1px solid ${OAK.border}`, color: OAK.textDark,
    fontFamily: 'Arial, sans-serif',
  }
  const tdY: React.CSSProperties = {
    ...td, fontWeight: 700,
    background: OAK.darkGreen, color: OAK.white,
    border: `1px solid ${OAK.brandGreen}`,
  }

  if (rows.length === 0) return (
    <div style={{ fontSize: 9, color: OAK.textLight, fontStyle: 'italic' }}>
      Financial history not available for this security
    </div>
  )

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr>
          <th style={th}>Year</th>
          <th style={th}>Revenue</th>
          <th style={th}>EBIT</th>
          <th style={th}>NPAT</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} style={{ background: i % 2 === 0 ? OAK.white : '#f3f8f5' }}>
            <td style={tdY}>{r.year}</td>
            <td style={td}>{fmtM(r.revenue)}</td>
            <td style={{ ...td, color: r.ebit != null && r.ebit < 0 ? '#7a1f1f' : OAK.textDark }}>{fmtM(r.ebit)}</td>
            <td style={{ ...td, color: r.npat != null && r.npat < 0 ? '#7a1f1f' : OAK.textDark }}>{fmtM(r.npat)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// ── Company statistics ────────────────────────────────────────────────────────
function StatRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null
  return (
    <div style={{ marginBottom: 4, fontSize: 9, color: OAK.textDark, lineHeight: 1.45, display: 'flex', gap: 4 }}>
      <span style={{ color: OAK.brandGreen, flexShrink: 0 }}>—</span>
      <span><strong>{label}:</strong> {value}</span>
    </div>
  )
}

// ── Investment thesis table ───────────────────────────────────────────────────
function ThesisTable({ rows }: { rows: ThesisRow[] }) {
  const colHdr: React.CSSProperties = {
    fontFamily: 'Georgia, serif', fontSize: 9, color: OAK.brandGreen,
    padding: '5px 8px', borderBottom: `1px solid ${OAK.border}`,
    textAlign: 'center', fontWeight: 600, letterSpacing: '0.02em',
  }
  const labelCell: React.CSSProperties = {
    fontFamily: 'Georgia, serif', fontSize: 9, color: OAK.brandGreen,
    fontWeight: 600, padding: '6px 8px', verticalAlign: 'top',
    borderBottom: `1px solid ${OAK.border}`, width: '20%', lineHeight: 1.4,
  }
  const bodyCell: React.CSSProperties = {
    fontFamily: 'Arial, sans-serif', fontSize: 9, color: OAK.textMid,
    padding: '6px 8px', verticalAlign: 'top',
    borderBottom: `1px solid ${OAK.border}`, lineHeight: 1.5,
    borderLeft: `1px solid ${OAK.border}`,
  }

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr>
          <th style={{ ...colHdr, textAlign: 'left', width: '20%' }} />
          <th style={colHdr}>Oakwood View</th>
          <th style={{ ...colHdr, borderLeft: `1px solid ${OAK.border}` }}>Valuation Implications</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} style={{ background: i % 2 === 0 ? OAK.white : OAK.mint }}>
            <td style={labelCell}>{r.label}</td>
            <td style={bodyCell}>{r.oakwoodView}</td>
            <td style={bodyCell}>{r.valuationImplications}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// ── Risks list ────────────────────────────────────────────────────────────────
function RisksList({ risks }: { risks: RiskItem[] }) {
  return (
    <ol style={{ paddingLeft: 14, margin: 0 }}>
      {risks.map((r, i) => (
        <li key={i} style={{ marginBottom: 7, fontSize: 9, color: OAK.textMid, lineHeight: 1.5 }}>
          <strong style={{ color: OAK.textDark }}>{r.title}:</strong> {r.description}
        </li>
      ))}
    </ol>
  )
}

// ── DCF section ───────────────────────────────────────────────────────────────
function DCFSection({ dcf }: { dcf: DCFOutput | null }) {
  if (!dcf) return (
    <div style={{ fontSize: 8, color: OAK.textLight, fontStyle: 'italic' }}>DCF not available</div>
  )

  const asmRow: React.CSSProperties = {
    display: 'flex', justifyContent: 'space-between', fontSize: 8,
    color: OAK.textMid, padding: '2px 0', borderBottom: `1px dotted ${OAK.border}`,
  }
  const isUpside = dcf.updownside.startsWith('+')

  return (
    <div>
      <div style={asmRow}><span style={{ color: OAK.textLight }}>Revenue Growth</span><strong>{dcf.revenueGrowthRate}</strong></div>
      <div style={asmRow}><span style={{ color: OAK.textLight }}>NPAT Margin</span><strong>{dcf.npatMargin}</strong></div>
      <div style={asmRow}><span style={{ color: OAK.textLight }}>WACC</span><strong>{dcf.wacc}</strong></div>
      <div style={asmRow}><span style={{ color: OAK.textLight }}>Terminal Growth</span><strong>{dcf.terminalGrowthRate}</strong></div>
      <div style={{ marginTop: 6, padding: '5px 7px', background: OAK.darkGreen, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 8, color: '#9dbfaa' }}>Implied Value</span>
        <span style={{ fontFamily: 'Georgia, serif', fontSize: 11, color: OAK.gold, fontWeight: 700 }}>{dcf.impliedValue}</span>
      </div>
      <div style={{ marginTop: 3, textAlign: 'right' }}>
        <span style={{
          fontSize: 9, fontWeight: 700, fontFamily: 'Georgia, serif',
          color: isUpside ? '#2d6a4f' : '#7a1f1f',
        }}>{dcf.updownside}</span>
      </div>
      <div style={{ marginTop: 5, fontSize: 7, color: OAK.textLight, fontStyle: 'italic', lineHeight: 1.45 }}>
        {dcf.commentary}
      </div>
    </div>
  )
}

// ── Peer trading comps table ──────────────────────────────────────────────────
function PeerCompsTable({ subject, km, peers, subjectMcap }: { subject: string; km: KeyMetrics; peers: PeerRow[]; subjectMcap?: string | null }) {
  function fmtX(n: number | null, dp = 1) { return n != null ? `${n.toFixed(dp)}x` : '—' }
  function fmtPct(n: number | null)       { return n != null ? `${n.toFixed(1)}%`  : '—' }
  function fmtMcap(s: string | null)      { return s ?? '—' }

  const thS: React.CSSProperties = {
    background: OAK.darkGreen, color: OAK.white, fontSize: 7,
    padding: '3px 5px', border: `1px solid ${OAK.brandGreen}`,
    fontWeight: 600, textAlign: 'right', whiteSpace: 'nowrap',
  }
  const thL: React.CSSProperties = { ...thS, textAlign: 'left' }

  function Row({ ticker, name, pe, evEbitda, evRevenue, pb, divYield, mcap, isSubject }: {
    ticker: string; name: string
    pe: number|null; evEbitda: number|null; evRevenue: number|null
    pb: number|null; divYield: number|null; mcap: string|null
    isSubject: boolean
  }) {
    const bg  = isSubject ? '#e8f0eb' : OAK.white
    const fw  = isSubject ? 700 : 400
    const col = isSubject ? OAK.darkGreen : OAK.textMid
    const td: React.CSSProperties = {
      fontSize: 7, padding: '3px 5px', border: `1px solid ${OAK.border}`,
      background: bg, color: col, fontWeight: fw, textAlign: 'right',
      whiteSpace: 'nowrap',
    }
    return (
      <tr>
        <td style={{ ...td, textAlign: 'left', maxWidth: 60, overflow: 'hidden', textOverflow: 'ellipsis' }}
            title={name}>
          {isSubject ? `★ ${ticker}` : ticker}
        </td>
        <td style={td}>{fmtX(pe)}</td>
        <td style={td}>{fmtX(evEbitda)}</td>
        <td style={td}>{fmtX(evRevenue)}</td>
        <td style={td}>{fmtX(pb)}</td>
        <td style={td}>{fmtPct(divYield)}</td>
        <td style={td}>{fmtMcap(mcap)}</td>
      </tr>
    )
  }

  if (peers.length === 0) {
    return (
      <div style={{ fontSize: 7.5, color: OAK.textLight, fontStyle: 'italic' }}>
        No peer data available
      </div>
    )
  }

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr>
          <th style={thL}>Ticker</th>
          <th style={thS}>P/E</th>
          <th style={thS}>EV/EBITDA</th>
          <th style={thS}>EV/Rev</th>
          <th style={thS}>P/B</th>
          <th style={thS}>Div%</th>
          <th style={thS}>Mkt Cap</th>
        </tr>
      </thead>
      <tbody>
        {/* Subject company first, highlighted */}
        <Row
          ticker={subject} name={subject}
          pe={km.pe} evEbitda={km.evEbitda} evRevenue={km.evRevenue}
          pb={km.pb} divYield={km.divYield}
          mcap={subjectMcap ?? null}
          isSubject
        />
        {peers.map((p, i) => (
          <Row key={i}
            ticker={p.ticker} name={p.name}
            pe={p.pe} evEbitda={p.evEbitda} evRevenue={p.evRevenue}
            pb={p.pb} divYield={p.divYield} mcap={p.marketCap}
            isSubject={false}
          />
        ))}
      </tbody>
    </table>
  )
}

// ── Methodology appendix (page 2 in print) ───────────────────────────────────
function MethodologyAppendix({ scoreCard, memo }: { scoreCard: ScoreCard | null; memo: MemoData }) {
  const hdr: React.CSSProperties = {
    fontFamily: 'Georgia, serif', fontSize: 10, color: OAK.brandGreen,
    fontWeight: 600, letterSpacing: '0.04em', marginBottom: 6,
    paddingBottom: 3, borderBottom: `1px solid ${OAK.border}`,
  }
  const body: React.CSSProperties = { fontSize: 8.5, color: OAK.textMid, lineHeight: 1.65 }
  const th: React.CSSProperties = {
    background: OAK.darkGreen, color: OAK.white, fontSize: 8,
    padding: '4px 8px', textAlign: 'left', border: `1px solid ${OAK.brandGreen}`,
    fontWeight: 600,
  }
  const td: React.CSSProperties = {
    fontSize: 8, padding: '4px 8px', border: `1px solid ${OAK.border}`,
    color: OAK.textMid, verticalAlign: 'top', lineHeight: 1.5,
  }
  const tdC: React.CSSProperties = { ...td, textAlign: 'center', fontWeight: 600, color: OAK.textDark }

  function Bar({ score, max }: { score: number; max: number }) {
    const pct = Math.max(0, Math.min(100, (score / max) * 100))
    const col = pct >= 75 ? '#2d6a4f' : pct >= 40 ? '#b08a2e' : '#7a1f1f'
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <div style={{ flex: 1, height: 6, background: '#e0e8e4', borderRadius: 3, overflow: 'hidden' }}>
          <div style={{ width: `${pct}%`, height: '100%', background: col, borderRadius: 3 }} />
        </div>
        <span style={{ fontSize: 8, fontWeight: 700, color: col, width: 28, textAlign: 'right' }}>
          {score.toFixed(1)}/{max}
        </span>
      </div>
    )
  }

  return (
    <div id="oakwood-appendix" style={{
      background: OAK.white, fontFamily: 'Arial, sans-serif',
      pageBreakBefore: 'always', breakBefore: 'page',
      padding: '16px 20px',
    }}>

      {/* Appendix header */}
      <div style={{ background: OAK.darkGreen, padding: '8px 16px', marginBottom: 0 }}>
        <div style={{ display: 'table', width: '100%' }}>
          <div style={{ display: 'table-cell', verticalAlign: 'middle' }}>
            <div style={{ fontFamily: 'Georgia, serif', fontSize: 12, color: OAK.white, letterSpacing: '0.02em' }}>
              Oakwood Capital — Analytical Methodology
            </div>
          </div>
          <div style={{ display: 'table-cell', verticalAlign: 'middle', textAlign: 'right' }}>
            <div style={{ fontSize: 7, color: '#9dbfaa', letterSpacing: '0.1em' }}>APPENDIX A</div>
            <div style={{ fontSize: 7, color: '#9dbfaa' }}>{memo.companyName} ({memo.ticker})</div>
          </div>
        </div>
      </div>
      <div style={{ height: 2, background: OAK.gold, marginBottom: 14 }} />

      {/* Two-column layout */}
      <div style={{ display: 'table', width: '100%', tableLayout: 'fixed', borderSpacing: '14px 0' }}>
        <div style={{ display: 'table-cell', width: '50%', verticalAlign: 'top' }}>

          {/* ── Section 1: Target Price Methodology ── */}
          <div style={hdr}>1. Target Price — Discounted Cash Flow (DCF)</div>
          <p style={body}>
            Oakwood Capital derives its target price using a five-year Discounted Cash Flow model
            anchored to each company&apos;s verified historical financials. The model projects Net Profit
            After Tax (NPAT) forward using the three-year historical Revenue CAGR and average NPAT
            margin, then applies an exit P/E multiple for the terminal value — anchored to the company&apos;s
            current P/E (de-rated 20% for conservatism, capped between 12× and 30×). This exit multiple
            approach is preferred over the Gordon Growth Model for quality franchises, which it chronically
            undervalues by implying a terminal P/E of ~13× regardless of the company&apos;s actual trading multiple.
          </p>

          <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: 8, fontWeight: 700, color: OAK.textDark, marginBottom: 4 }}>
              Formula Summary
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 8 }}>
              <tbody>
                {[
                  ['Projected Revenue (Year n)', 'LTM Revenue × (1 + CAGR)ⁿ  (up to 5yr history)'],
                  ['NPAT Margin (blended)',       '60% LTM margin + 40% historical avg (profitable years only)'],
                  ['Projected NPAT (Year n)',     'Projected Revenue × Blended NPAT Margin'],
                  ['Exit P/E Multiple',           'Current P/E × 0.80, capped [12×, 30×]'],
                  ['Terminal Value (Year 5)',      'NPAT₅ × Exit P/E Multiple'],
                  ['Equity Value',                '∑ PV(NPAT₁…₅) + PV(Terminal Value) − Net Debt'],
                  ['Implied Share Price',          'Equity Value ÷ Shares Outstanding'],
                ].map(([label, formula], i) => (
                  <tr key={i} style={{ background: i % 2 === 0 ? OAK.white : OAK.mint }}>
                    <td style={{ ...td, fontWeight: 600, color: OAK.textDark, width: '45%' }}>{label}</td>
                    <td style={{ ...td, fontFamily: 'Georgia, serif', color: OAK.brandGreen }}>{formula}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ marginTop: 6 }}>
            <div style={{ fontSize: 8, fontWeight: 700, color: OAK.textDark, marginBottom: 4 }}>
              WACC Assumptions by Country
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 8 }}>
              <thead>
                <tr>
                  <th style={th}>Country</th>
                  <th style={{ ...th, textAlign: 'right' }}>WACC Applied</th>
                  <th style={{ ...th, textAlign: 'left' }}>Rationale</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ['Australia (AU)',     '9.5%',  'RBA cash rate + equity risk premium + size premium'],
                  ['United States (US)', '8.5%', 'Fed funds + S&P 500 ERP (lower systematic risk)'],
                  ['United Kingdom (GB)', '9.0%', 'BoE base rate + UK ERP'],
                  ['Canada (CA)',        '9.0%', 'BoC policy rate + TSX-adjusted ERP'],
                  ['Other / Default',   '10.0%', 'Additional country-risk premium applied'],
                ].map(([c, w, r], i) => (
                  <tr key={i} style={{ background: i % 2 === 0 ? OAK.white : OAK.mint }}>
                    <td style={td}>{c}</td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: OAK.brandGreen }}>{w}</td>
                    <td style={td}>{r}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p style={{ ...body, marginTop: 6, fontSize: 7.5, fontStyle: 'italic', color: OAK.textLight }}>
            CAGR is capped at [−20%, +40%] and NPAT margin at [−5%, +50%] to prevent
            projection distortion from single-period outliers. Shares outstanding are derived
            from market capitalisation ÷ current price (Finnhub data).
          </p>

        </div>

        <div style={{ display: 'table-cell', width: '50%', verticalAlign: 'top' }}>

          {/* ── Section 2: Conviction Scoring ── */}
          <div style={hdr}>2. Conviction Scoring — Rules-Based Framework</div>
          <p style={body}>
            The conviction rating (HIGH / MEDIUM / LOW) is computed by scoring six independent
            criteria, each worth 0–2 points, for a maximum of 12 points. No analyst discretion
            is applied to the score — it is entirely formula-driven from verified market data.
          </p>

          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 8, marginBottom: 8 }}>
            <thead>
              <tr>
                <th style={th}>Criterion</th>
                <th style={{ ...th, textAlign: 'center' }}>Max</th>
                <th style={{ ...th, textAlign: 'left' }}>Scoring Thresholds</th>
              </tr>
            </thead>
            <tbody>
              {[
                ['Revenue Growth', '2', 'CAGR ≥15%=2 · ≥8%=1.5 · ≥3%=1 · ≥0%=0.5 · <0%=0'],
                ['Earnings Quality', '2', 'NPAT CAGR ≥15%=2 · ≥8%=1.5 · ≥3%=1 · ≥0%=0.5 · loss=0'],
                ['Profitability', '2', 'Avg NPAT margin ≥20%=2 · ≥12%=1.5 · ≥6%=1 · ≥0%=0.5 · neg=0'],
                ['Return on Equity', '2', 'ROE ≥20%=2 · ≥15%=1.5 · ≥10%=1 · ≥5%=0.5 · <5%=0'],
                ['Balance Sheet', '2', 'Net cash=2 · ND/MC<10%=1.5 · <30%=1 · <50%=0.5 · ≥50%=0'],
                ['DCF Valuation', '2', 'Upside ≥40%=2 · ≥20%=1.5 · ≥5%=1 · ±5%=0.5 · downside=0'],
              ].map(([name, max, thresholds], i) => (
                <tr key={i} style={{ background: i % 2 === 0 ? OAK.white : OAK.mint }}>
                  <td style={{ ...td, fontWeight: 600, color: OAK.textDark }}>{name}</td>
                  <td style={tdC}>{max}</td>
                  <td style={{ ...td, fontSize: 7.5 }}>{thresholds}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ marginTop: 6 }}>
            <div style={{ fontSize: 8, fontWeight: 700, color: OAK.textDark, marginBottom: 4 }}>
              Conviction Bands &amp; Recommendation Matrix
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 8 }}>
              <thead>
                <tr>
                  <th style={th}>Score Range</th>
                  <th style={{ ...th, textAlign: 'center' }}>Conviction</th>
                  <th style={th}>Recommendation Rule</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ['≥ 8.0 / 12', 'HIGH',   'BUY if DCF upside ≥10% · else HOLD'],
                  ['4.5 – 7.9',  'MEDIUM', 'BUY if DCF upside ≥20% · else HOLD'],
                  ['< 4.5',      'LOW',    'AVOID if downside ≥15% or loss-making with downside · else HOLD'],
                ].map(([range, conv, rule], i) => (
                  <tr key={i} style={{ background: i % 2 === 0 ? OAK.white : OAK.mint }}>
                    <td style={{ ...td, fontWeight: 700, color: OAK.brandGreen }}>{range}</td>
                    <td style={{ ...tdC, color: conv === 'HIGH' ? '#2d6a4f' : conv === 'MEDIUM' ? '#b08a2e' : '#7a1f1f' }}>{conv}</td>
                    <td style={{ ...td, fontSize: 7.5 }}>{rule}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ── Scorecard for this memo ── */}
          {scoreCard && (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 8, fontWeight: 700, color: OAK.textDark, marginBottom: 6 }}>
                Scorecard — {memo.companyName} ({memo.ticker})
              </div>
              {scoreCard.criteria.map((c, i) => (
                <div key={i} style={{ marginBottom: 7 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                    <span style={{ fontSize: 8, fontWeight: 600, color: OAK.textDark }}>{c.name}</span>
                    <span style={{ fontSize: 7, color: OAK.textLight }}>{c.note}</span>
                  </div>
                  <Bar score={c.score} max={c.maxScore} />
                </div>
              ))}
              <div style={{ marginTop: 8, padding: '6px 10px', background: OAK.darkGreen, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 8, color: '#9dbfaa' }}>Total Conviction Score</span>
                <span style={{ fontFamily: 'Georgia, serif', fontSize: 12, color: OAK.gold, fontWeight: 700 }}>
                  {scoreCard.totalScore.toFixed(1)} / {scoreCard.maxScore}
                </span>
              </div>
            </div>
          )}

        </div>
      </div>

      {/* ── Section 3: Limitations ── */}
      <div style={{ marginTop: 14, borderTop: `1px solid ${OAK.border}`, paddingTop: 10 }}>
        <div style={hdr}>3. Model Limitations &amp; Assumptions</div>
        <div style={{ display: 'table', width: '100%', tableLayout: 'fixed', borderSpacing: '14px 0' }}>
          <div style={{ display: 'table-cell', verticalAlign: 'top', width: '50%' }}>
            <p style={{ ...body, fontSize: 7.5 }}>
              The DCF model assumes constant revenue growth and margin profiles, which may not
              reflect cyclical, commodity-price, or event-driven dynamics. Capital expenditure,
              working capital movements, and depreciation are not explicitly modelled; NPAT is
              used as a proxy for free cash flow. This introduces upward bias for capital-intensive
              businesses (mining, infrastructure, utilities) where reinvestment requirements are
              material. For such companies, DCF-implied values should be treated as indicative only.
            </p>
          </div>
          <div style={{ display: 'table-cell', verticalAlign: 'top', width: '50%' }}>
            <p style={{ ...body, fontSize: 7.5 }}>
              Financial data sourced from Finnhub (market data, metrics) and SEC EDGAR / Yahoo
              Finance (historical income statements). Data quality may vary for non-US and
              international listings. The conviction scoring system applies equal weighting to
              all six criteria and does not account for sector-specific benchmarks. Results
              should be considered alongside qualitative analysis, sector knowledge, and
              independent due diligence before any investment decision is made.
            </p>
          </div>
        </div>
      </div>

    </div>
  )
}

// ── One-pager memo view ───────────────────────────────────────────────────────
// Uses display:table for two-column rows — renders identically on screen and in print.
function MemoView({ memo, onPrint }: { memo: MemoData; onPrint: () => void }) {
  const today = new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })
  const s = memo.companyStats

  // Table-based two-column row — print-safe, no flex gaps
  function TwoCol({ left, right, leftBg, rightBg }: {
    left: React.ReactNode; right: React.ReactNode
    leftBg: string; rightBg: string
  }) {
    return (
      <div style={{ display: 'table', width: '100%', borderTop: `1px solid ${OAK.border}`, tableLayout: 'fixed', borderSpacing: 0, margin: 0, padding: 0 }}>
        <div style={{ display: 'table-cell', width: '50%', background: leftBg, padding: '9px 13px', verticalAlign: 'top' }}>
          {left}
        </div>
        <div style={{ display: 'table-cell', width: '50%', background: rightBg, padding: '9px 13px', verticalAlign: 'top', borderLeft: `1px solid ${OAK.border}` }}>
          {right}
        </div>
      </div>
    )
  }

  // Table-based three-column row
  function ThreeCol({ a, b, c, aBg, bBg, cBg, aW, bW, cW }: {
    a: React.ReactNode; b: React.ReactNode; c: React.ReactNode
    aBg: string; bBg: string; cBg: string
    aW: string; bW: string; cW: string
  }) {
    return (
      <div style={{ display: 'table', width: '100%', borderTop: `1px solid ${OAK.border}`, tableLayout: 'fixed', borderSpacing: 0, margin: 0, padding: 0 }}>
        <div style={{ display: 'table-cell', width: aW, background: aBg, padding: '9px 11px', verticalAlign: 'top' }}>{a}</div>
        <div style={{ display: 'table-cell', width: bW, background: bBg, padding: '9px 11px', verticalAlign: 'top', borderLeft: `1px solid ${OAK.border}` }}>{b}</div>
        <div style={{ display: 'table-cell', width: cW, background: cBg, padding: '9px 11px', verticalAlign: 'top', borderLeft: `1px solid ${OAK.border}` }}>{c}</div>
      </div>
    )
  }

  return (
    <div id="oakwood-memo" style={{
      background: OAK.white, fontFamily: 'Arial, sans-serif',
      fontSize: 10, color: OAK.textDark, width: '100%',
    }}>

      {/* ── Oakwood header ──────────────────────────────────── */}
      <div style={{ display: 'table', width: '100%', background: OAK.darkGreen, padding: '7px 16px' }}>
        <div style={{ display: 'table-cell', verticalAlign: 'middle' }}>
          <div style={{ fontFamily: 'Georgia, serif', fontSize: 14, color: OAK.white, fontWeight: 400, letterSpacing: '0.02em' }}>
            Oakwood Capital
          </div>
        </div>
        <div style={{ display: 'table-cell', verticalAlign: 'middle', textAlign: 'right' }}>
          <div style={{ fontSize: 7, color: '#9dbfaa', letterSpacing: '0.1em' }}>CONFIDENTIAL</div>
          <div style={{ fontSize: 7, color: '#9dbfaa', marginTop: 1 }}>{today}</div>
        </div>
      </div>

      {/* ── Gold rule ───────────────────────────────────────── */}
      <div style={{ height: 2, background: OAK.gold }} />

      {/* ── Company banner ──────────────────────────────────── */}
      <div style={{ background: OAK.darkGreen, padding: '7px 16px 10px' }}>
        <div style={{ fontFamily: 'Georgia, serif', fontSize: 18, color: OAK.white, fontWeight: 400, marginBottom: 2 }}>
          {memo.companyName}
        </div>
        <div style={{ fontSize: 8, color: '#9dbfaa', marginBottom: 5 }}>Ticker: {memo.ticker}</div>
        <div style={{ display: 'table', width: '100%' }}>
          <div style={{ display: 'table-cell', verticalAlign: 'middle' }}>
            <span style={{ fontSize: 8, color: '#9dbfaa', marginRight: 6 }}>Recommendation:</span>
            <span style={{
              background: recBg(memo.recommendation), color: OAK.white,
              fontFamily: 'Georgia, serif', fontSize: 11, fontWeight: 700,
              padding: '1px 10px', letterSpacing: '0.06em',
            }}>
              {memo.recommendation}
            </span>
            <span style={{
              background: convictionBg(memo.conviction), color: OAK.gold,
              fontSize: 7, fontWeight: 700, padding: '2px 7px', marginLeft: 6,
              letterSpacing: '0.08em', border: `1px solid ${OAK.gold}44`,
            }}>
              {memo.conviction} CONVICTION
            </span>
            {memo.targetPrice && memo.targetPrice !== 'N/A' && (
              <span style={{ fontSize: 8, color: '#9dbfaa', marginLeft: 8 }}>
                Target: <strong style={{ color: OAK.gold }}>{memo.targetPrice}</strong>
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── Key metrics strip ───────────────────────────────── */}
      <MetricsStrip km={memo.keyMetrics} />

      {/* ── Row 1: Company Overview | Company Financials ────── */}
      <TwoCol
        leftBg={OAK.mint}
        rightBg={OAK.white}
        left={<>
          <SecHeader>Company Overview</SecHeader>
          <p style={{ fontSize: 9, lineHeight: 1.6, color: OAK.textMid, margin: 0 }}>
            {memo.companyOverview}
          </p>
        </>}
        right={<>
          <SecHeader>Company Financials</SecHeader>
          <FinancialsTable rows={memo.financials} />
        </>}
      />

      {/* ── Row 2: Company Statistics | Price Volume LTM ─────── */}
      <TwoCol
        leftBg={OAK.white}
        rightBg={OAK.mint}
        left={<>
          <SecHeader>Company Statistics</SecHeader>
          <StatRow label="Founded"               value={s.founded} />
          <StatRow label="Industry"              value={s.industry} />
          <StatRow label="Market Capitalisation" value={s.marketCap} />
          <StatRow label="Employees"             value={s.employees} />
          <StatRow label="Country"               value={s.country} />
          {(s.ltmRevenue || s.ltmNpat) && (
            <div style={{ marginBottom: 4, fontSize: 9, color: OAK.textDark, lineHeight: 1.45 }}>
              <span style={{ color: OAK.brandGreen }}>— </span>
              <strong>LTM Financials:</strong> Revenue {s.ltmRevenue ?? '—'} · NPAT {s.ltmNpat ?? '—'}
            </div>
          )}
          <StatRow label="Net Position"          value={s.netCashDebt} />
          <StatRow label="Sectors Serviced"      value={s.sectorsServiced} />
          <StatRow label="Product Categories"    value={s.productCategories} />
        </>}
        right={<>
          <SecHeader>Price Volume LTM</SecHeader>
          <PriceVolumeChart data={memo.priceVolume} />
        </>}
      />

      {/* ── Row 3: Investment Thesis | Risks | Valuations ─── */}
      <ThreeCol
        aW="38%" bW="27%" cW="35%"
        aBg={OAK.mint} bBg={OAK.white} cBg={OAK.mint}
        a={<>
          <SecHeader>Investment Thesis</SecHeader>
          <ThesisTable rows={memo.thesisRows} />
        </>}
        b={<>
          <SecHeader>Risks and Considerations</SecHeader>
          <RisksList risks={memo.keyRisks} />
        </>}
        c={<>
          <SecHeader>Valuations</SecHeader>
          <div style={{ fontFamily: 'Georgia, serif', fontSize: 8, color: OAK.brandGreen, marginBottom: 4, letterSpacing: '0.04em' }}>
            DCF — Key Assumptions
          </div>
          <DCFSection dcf={memo.dcf} />
          <div style={{ marginTop: 8, fontFamily: 'Georgia, serif', fontSize: 8, color: OAK.brandGreen, marginBottom: 4, letterSpacing: '0.04em' }}>
            Trading Comps — Peer Set
          </div>
          <PeerCompsTable subject={memo.ticker} km={memo.keyMetrics} peers={memo.peers ?? []} subjectMcap={memo.companyStats.marketCap} />
        </>}
      />

      {/* ── Analyst notes (inline, above footer) ──────────── */}
      {memo.analystNotes && (
        <div style={{ borderTop: `1px solid ${OAK.border}`, background: OAK.mint, padding: '6px 16px' }}>
          <span style={{ fontSize: 7.5, fontStyle: 'italic', color: OAK.textLight }}>
            <strong style={{ color: OAK.brandGreen, fontStyle: 'normal' }}>Analyst Notes: </strong>
            {memo.analystNotes}
          </span>
        </div>
      )}

      {/* ── Footer ──────────────────────────────────────────── */}
      <div style={{ display: 'table', width: '100%', borderTop: `2px solid ${OAK.darkGreen}`, background: '#f8faf9', padding: '6px 16px' }}>
        <div style={{ display: 'table-cell', verticalAlign: 'top', paddingRight: 20 }}>
          <div style={{ fontSize: 6, color: OAK.textLight, lineHeight: 1.5, fontStyle: 'italic' }}>
            This memorandum has been prepared by Oakwood Capital Pty Ltd for informational purposes only. It does not constitute financial advice, a recommendation to buy or sell any security, or an offer or solicitation of any kind. Past performance is not indicative of future results. Recipients should seek independent financial advice and conduct their own due diligence before making any investment decisions. Oakwood Capital Pty Ltd is not licensed to provide financial product advice under the Corporations Act 2001 (Cth).
          </div>
        </div>
        <div style={{ display: 'table-cell', verticalAlign: 'middle', textAlign: 'right', whiteSpace: 'nowrap', width: 180 }}>
          <div style={{ fontSize: 8, color: OAK.textMid, fontFamily: 'Georgia, serif' }}>Oakwood Capital Research</div>
          <div style={{ fontSize: 7, color: OAK.textLight, marginTop: 1 }}>Mark Elakawi · {today}</div>
          <button
            onClick={onPrint}
            style={{
              marginTop: 4, background: OAK.darkGreen, color: OAK.gold,
              border: 'none', padding: '3px 10px', fontFamily: 'Georgia, serif',
              fontSize: 8, letterSpacing: '0.06em', cursor: 'pointer',
            }}
          >
            EXPORT PDF
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Panel wrapper ─────────────────────────────────────────────────────────────
export function MEMO() {
  const { activeTicker } = useTerminalStore()
  const ticker   = usePaneTicker(activeTicker)
  const [memo, setMemo]       = useState<MemoData | null>(null)
  const [error, setError]     = useState<string | null>(null)
  const [lastTick, setLastTick] = useState<string | null>(null)

  const { mutate: generate, isPending } = useMutation({
    mutationFn: async (sym: string) => {
      const res = await fetch('/api/memo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: sym }),
      })
      if (!res.ok) throw new Error(await res.text())
      return res.json() as Promise<MemoData>
    },
    onSuccess: (data, sym) => { setMemo(data); setError(null); setLastTick(sym) },
    onError:   (e) => setError(String(e)),
  })

  const handleGenerate = () => { setError(null); generate(ticker) }

  const handlePrint = () => {
    const memoEl = document.getElementById('oakwood-memo')
    const appendixEl = document.getElementById('oakwood-appendix')
    if (!memoEl) return
    const win = window.open('', '_blank', 'width=850,height=1200')
    if (!win) return
    const appendixHtml = appendixEl ? appendixEl.outerHTML : ''
    win.document.write(`<!DOCTYPE html><html><head>
      <title>Oakwood Capital — ${lastTick ?? 'Investment Memo'}</title>
      <style>
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html { zoom: 0.84; }
        body { font-family: Arial, sans-serif; background: #fff; }
        * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; }
        @page { size: A4 portrait; margin: 6mm; }
        @media print { button { display: none !important; } }
      </style>
    </head><body>${memoEl.outerHTML}${appendixHtml}</body></html>`)
    win.document.close()
    win.focus()
    setTimeout(() => { win.print(); win.close() }, 700)
  }

  return (
    <div className="panel" style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#000' }}>

      <div className="panel-header" style={{ justifyContent: 'space-between', background: '#050505', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="panel-mnemonic">MEMO</span>
          <span style={{ color: '#aaaaaa', fontSize: 10 }}>INVESTMENT MEMORANDUM</span>
          {lastTick && (
            <span style={{ color: OAK.gold, fontSize: 10, border: `1px solid ${OAK.gold}44`, padding: '1px 6px' }}>
              {lastTick}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {isPending && <span style={{ color: OAK.gold, fontSize: 9 }}>GENERATING…</span>}
          <button
            onClick={handleGenerate}
            disabled={isPending}
            style={{
              background: isPending ? '#111' : OAK.darkGreen,
              border: `1px solid ${OAK.gold}`,
              color: isPending ? '#888' : OAK.gold,
              fontFamily: 'inherit', fontSize: 9, padding: '2px 10px',
              cursor: isPending ? 'not-allowed' : 'pointer', letterSpacing: '0.06em',
            }}
          >
            {isPending ? 'PLEASE WAIT' : `GENERATE MEMO — ${ticker}`}
          </button>
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto' }}>
        {error && (
          <div style={{ padding: 16, color: '#ff3b3b', fontSize: 11, background: '#0a0000' }}>
            Error: {error}
          </div>
        )}

        {!memo && !isPending && !error && (
          <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, padding: 40 }}>
            <div style={{ fontFamily: 'Georgia, serif', fontSize: 20, color: OAK.gold, letterSpacing: '0.1em' }}>
              Oakwood Capital
            </div>
            <div style={{ width: 48, height: 1, background: OAK.gold }} />
            <p style={{ color: '#888', fontSize: 11, lineHeight: 1.7, textAlign: 'center', maxWidth: 340 }}>
              Generate an institutional-quality investment memorandum for{' '}
              <strong style={{ color: OAK.gold }}>{ticker}</strong>
            </p>
            <button
              onClick={handleGenerate}
              style={{
                background: OAK.darkGreen, border: `1px solid ${OAK.gold}`,
                color: OAK.gold, fontFamily: 'Georgia, serif', fontSize: 12,
                padding: '8px 24px', cursor: 'pointer', letterSpacing: '0.06em',
              }}
            >
              GENERATE MEMORANDUM
            </button>
          </div>
        )}

        {isPending && (
          <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14 }}>
            <div style={{ fontFamily: 'Georgia, serif', fontSize: 14, color: OAK.gold }}>Oakwood Capital</div>
            <div style={{ color: '#888', fontSize: 11 }}>Fetching financials &amp; generating memo for {ticker}…</div>
            <div style={{ display: 'flex', gap: 6 }}>
              {[0, 1, 2].map(i => (
                <div key={i} style={{
                  width: 7, height: 7, borderRadius: '50%', background: OAK.gold,
                  animation: `pulse ${0.5 + i * 0.2}s ease-in-out infinite alternate`,
                }} />
              ))}
            </div>
          </div>
        )}

        {memo && !isPending && (
          <>
            <MemoView memo={memo} onPrint={handlePrint} />
            <MethodologyAppendix scoreCard={memo.scoreCard} memo={memo} />
          </>
        )}
      </div>

      <style>{`@keyframes pulse { 0% { opacity: 0.3; } 100% { opacity: 1; } }`}</style>
    </div>
  )
}
