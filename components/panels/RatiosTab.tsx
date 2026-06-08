'use client'
import { useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTerminalStore } from '@/lib/store'
import {
  createChart, HistogramSeries, ColorType,
  type IChartApi, type UTCTimestamp,
} from 'lightweight-charts'
import type { AnnualBar } from '@/app/api/financials/history/route'

interface Metrics { metric: Record<string, number | null> }

function fmt(v: number | null | undefined, d = 2) {
  if (v == null || isNaN(v as number)) return '—'
  return (v as number).toFixed(d)
}

function fmtPct(v: number | null | undefined) {
  if (v == null || isNaN(v as number)) return '—'
  return `${(v as number).toFixed(1)}%`
}

function signColor(v: number | null | undefined) {
  if (v == null) return '#cccccc'
  return (v as number) >= 0 ? 'var(--green)' : 'var(--red)'
}

function DataRow({ label, value, valueColor, indent }: {
  label: string; value: string; valueColor?: string; indent?: boolean
}) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '1px 0', borderBottom: '1px solid #0d0d0d' }}>
      <span style={{ color: '#555', fontSize: 11, paddingRight: 8, paddingLeft: indent ? 10 : 0 }}>{label}</span>
      <span style={{ color: valueColor || '#cccccc', fontSize: 11, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </span>
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      color: '#ffa028', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em',
      borderBottom: '1px solid #1f1f1f', paddingBottom: 2, marginBottom: 3, marginTop: 10,
    }}>
      {children}
    </div>
  )
}

// Small inline bar + text label
function GaugeBar({ value, min, max, good = 'low' }: {
  value: number | null | undefined
  min: number; max: number
  good?: 'low' | 'high'
}) {
  if (value == null || isNaN(value as number)) return <div style={{ width: 80, height: 6 }} />
  const v = value as number
  const pct = Math.max(0, Math.min(1, (v - min) / (max - min)))
  const zone = good === 'low'
    ? pct < 0.4 ? 'CHEAP' : pct < 0.75 ? 'FAIR' : 'RICH'
    : pct > 0.6 ? 'STRONG' : pct > 0.25 ? 'OK' : 'WEAK'
  const color = good === 'low'
    ? pct < 0.4 ? '#33ff66' : pct < 0.75 ? '#ffa028' : '#ff3b3b'
    : pct > 0.6 ? '#33ff66' : pct > 0.25 ? '#ffa028' : '#ff3b3b'

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
      <div style={{ width: 44, height: 5, background: '#111', position: 'relative' }}>
        <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${pct * 100}%`, background: color }} />
      </div>
      <span style={{ color, fontSize: 8, letterSpacing: '0.04em', minWidth: 36 }}>{zone}</span>
    </div>
  )
}

// Mini bar chart matching the Revenue/EPS scheme: dark base color, red when declining
function MiniBarChart({ bars, computeFn, color, title, suffix = '%' }: {
  bars: AnnualBar[]
  computeFn: (b: AnnualBar) => number | null
  color: string
  title: string
  suffix?: string
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)

  const points = bars
    .map((b) => ({ date: b.date, val: computeFn(b) }))
    .filter((p) => p.val != null)

  const latest = points.length ? points[points.length - 1].val : null

  useEffect(() => {
    if (!containerRef.current || points.length === 0) return
    if (chartRef.current) { chartRef.current.remove(); chartRef.current = null }

    const chart = createChart(containerRef.current, {
      layout: { background: { type: ColorType.Solid, color: '#050505' }, textColor: '#555' },
      grid: { vertLines: { color: 'transparent' }, horzLines: { color: '#0d0d0d' } },
      rightPriceScale: { borderColor: '#1a1a1a', textColor: '#555', minimumWidth: 40 },
      leftPriceScale: { visible: false },
      timeScale: { borderColor: 'transparent', visible: false },
      crosshair: { vertLine: { visible: false }, horzLine: { color: '#222' } },
      handleScroll: false,
      handleScale: false,
      width: containerRef.current.clientWidth,
      height: containerRef.current.clientHeight,
    })
    chartRef.current = chart

    const hist = chart.addSeries(HistogramSeries, {
      color,
      priceFormat: { type: 'custom', formatter: (v: number) => `${v.toFixed(1)}${suffix}` },
    })

    hist.setData(points.map((p, i) => ({
      time: (new Date(p.date).getTime() / 1000) as UTCTimestamp,
      value: p.val as number,
      color: i > 0 && (p.val as number) < (points[i - 1].val as number) ? '#ff3b3b44' : color,
    })))

    chart.timeScale().fitContent()

    const ro = new ResizeObserver(() => {
      if (containerRef.current) chart.applyOptions({ width: containerRef.current.clientWidth })
    })
    ro.observe(containerRef.current)
    return () => { ro.disconnect(); chart.remove(); chartRef.current = null }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bars])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 2 }}>
        <span style={{ color: '#555', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{title}</span>
        <span style={{ color: '#cccccc', fontSize: 11, fontVariantNumeric: 'tabular-nums' }}>
          {latest != null ? `${(latest as number).toFixed(1)}${suffix}` : '—'}
        </span>
      </div>
      <div ref={containerRef} style={{ flex: 1, minHeight: 0 }} />
      {/* Year labels */}
      <div style={{ display: 'flex', justifyContent: 'space-around', paddingRight: 44, marginTop: 2 }}>
        {points.map((p) => (
          <span key={p.date} style={{ color: '#444', fontSize: 8 }}>
            {new Date(p.date).getFullYear()}
          </span>
        ))}
      </div>
    </div>
  )
}

export function RatiosTab({ metrics }: { metrics: Metrics }) {
  const { activeTicker } = useTerminalStore()
  const m = metrics.metric

  const { data: bars } = useQuery<AnnualBar[]>({
    queryKey: ['fin-history', activeTicker],
    queryFn: () => fetch(`/api/financials/history?symbol=${activeTicker}`).then((r) => r.json()),
    staleTime: 24 * 60 * 60_000,
  })

  const histBars = Array.isArray(bars) && bars.length > 0 ? bars : []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0, height: '100%' }}>

      {/* Margin trend mini-charts */}
      {histBars.length > 0 && (
        <div style={{ flexShrink: 0 }}>
          <div style={{ color: '#ffa028', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', borderBottom: '1px solid #1f1f1f', paddingBottom: 2, marginBottom: 6 }}>
            Margin Trends ({histBars[0]?.year}–{histBars[histBars.length - 1]?.year})
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, height: 130 }}>
            <MiniBarChart
              bars={histBars}
              computeFn={(b) => b.revenue && b.grossProfit ? (b.grossProfit / b.revenue) * 100 : null}
              color="#1a4a1a"
              title="Gross Margin"
            />
            <MiniBarChart
              bars={histBars}
              computeFn={(b) => b.revenue && b.operatingIncome ? (b.operatingIncome / b.revenue) * 100 : null}
              color="#1a3a4a"
              title="Operating Margin"
            />
            <MiniBarChart
              bars={histBars}
              computeFn={(b) => b.revenue && b.netIncome ? (b.netIncome / b.revenue) * 100 : null}
              color="#3a2a1a"
              title="Net Margin"
            />
          </div>
        </div>
      )}

      {/* Three-column ratio tables */}
      <div style={{ flex: 1, overflowY: 'auto', marginTop: 8 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0 20px' }}>

          {/* Column 1: Valuation */}
          <div>
            <SectionLabel>Valuation</SectionLabel>
            <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
              <span style={{ color: '#33ff66', fontSize: 8 }}>■ CHEAP</span>
              <span style={{ color: '#ffa028', fontSize: 8 }}>■ FAIR</span>
              <span style={{ color: '#ff3b3b', fontSize: 8 }}>■ RICH</span>
            </div>
            {[
              { label: 'P/E (TTM)',    key: 'peBasicExclExtraTTM', min: 5,  max: 60,  good: 'low'  as const },
              { label: 'P/E Fwd',     key: 'forwardPE',           min: 5,  max: 50,  good: 'low'  as const },
              { label: 'P/E Annual',  key: 'peAnnual',            min: 5,  max: 60,  good: 'low'  as const },
              { label: 'P/B',         key: 'pb',                  min: 0,  max: 20,  good: 'low'  as const },
              { label: 'P/S (TTM)',   key: 'psTTM',               min: 0,  max: 20,  good: 'low'  as const },
              { label: 'EV/EBITDA',   key: 'evEbitdaTTM',         min: 5,  max: 40,  good: 'low'  as const },
              { label: 'EV/Revenue',  key: 'evRevenueTTM',        min: 0,  max: 15,  good: 'low'  as const },
              { label: 'EV/FCF',      key: 'currentEv/freeCashFlowAnnual', min: 0, max: 50, good: 'low' as const },
              { label: 'PEG (TTM)',   key: 'pegTTM',              min: 0,  max: 4,   good: 'low'  as const },
              { label: 'P/FCF',       key: 'pfcfShareTTM',        min: 0,  max: 50,  good: 'low'  as const },
            ].map(({ label, key, min, max, good }) => (
              <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1px 0', borderBottom: '1px solid #0d0d0d', gap: 6 }}>
                <span style={{ color: '#555', fontSize: 11, flexShrink: 0 }}>{label}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <GaugeBar value={m[key]} min={min} max={max} good={good} />
                  <span style={{ color: '#cccccc', fontSize: 11, textAlign: 'right', fontVariantNumeric: 'tabular-nums', minWidth: 36 }}>
                    {fmt(m[key])}
                  </span>
                </div>
              </div>
            ))}

            <SectionLabel>Growth</SectionLabel>
            <DataRow label="Rev Gr (TTM YoY)" value={fmtPct(m['revenueGrowthTTMYoy'])} valueColor={signColor(m['revenueGrowthTTMYoy'])} />
            <DataRow label="Rev Gr (Qtr YoY)" value={fmtPct(m['revenueGrowthQuarterlyYoy'])} valueColor={signColor(m['revenueGrowthQuarterlyYoy'])} />
            <DataRow label="Rev Gr 5Y CAGR"   value={fmtPct(m['revenueGrowth5Y'])} valueColor={signColor(m['revenueGrowth5Y'])} />
            <DataRow label="EPS Gr (TTM YoY)" value={fmtPct(m['epsGrowthTTMYoy'])} valueColor={signColor(m['epsGrowthTTMYoy'])} />
            <DataRow label="EPS Gr 5Y CAGR"   value={fmtPct(m['epsGrowth5Y'])} valueColor={signColor(m['epsGrowth5Y'])} />
            <DataRow label="EBITDA CAGR 5Y"   value={fmtPct(m['ebitdaCagr5Y'])} valueColor={signColor(m['ebitdaCagr5Y'])} />
          </div>

          {/* Column 2: Profitability */}
          <div>
            <SectionLabel>Profitability</SectionLabel>
            <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
              <span style={{ color: '#33ff66', fontSize: 8 }}>■ STRONG</span>
              <span style={{ color: '#ffa028', fontSize: 8 }}>■ OK</span>
              <span style={{ color: '#ff3b3b', fontSize: 8 }}>■ WEAK</span>
            </div>
            {[
              { label: 'Gross Margin (TTM)',  key: 'grossMarginTTM',        min: 0, max: 80, good: 'high' as const },
              { label: 'Gross Margin (Ann)',  key: 'grossMarginAnnual',     min: 0, max: 80, good: 'high' as const },
              { label: 'Oper. Margin (TTM)', key: 'operatingMarginTTM',    min: 0, max: 50, good: 'high' as const },
              { label: 'Net Margin (TTM)',    key: 'netProfitMarginTTM',    min: 0, max: 40, good: 'high' as const },
              { label: 'Net Margin (Ann)',    key: 'netProfitMarginAnnual', min: 0, max: 40, good: 'high' as const },
              { label: 'EBITDA Margin',       key: 'ebitdaMargin',          min: 0, max: 60, good: 'high' as const },
            ].map(({ label, key, min, max, good }) => (
              <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1px 0', borderBottom: '1px solid #0d0d0d', gap: 6 }}>
                <span style={{ color: '#555', fontSize: 11, flexShrink: 0 }}>{label}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <GaugeBar value={m[key]} min={min} max={max} good={good} />
                  <span style={{ color: 'var(--green)', fontSize: 11, textAlign: 'right', fontVariantNumeric: 'tabular-nums', minWidth: 40 }}>
                    {m[key] != null ? `${fmt(m[key], 1)}%` : '—'}
                  </span>
                </div>
              </div>
            ))}

            <SectionLabel>Returns</SectionLabel>
            {[
              { label: 'ROE',        key: 'roeRfy',    min: 0, max: 80, good: 'high' as const },
              { label: 'ROE (TTM)',  key: 'roeTTM',    min: 0, max: 80, good: 'high' as const },
              { label: 'ROA',        key: 'roaRfy',    min: 0, max: 30, good: 'high' as const },
              { label: 'ROIC',       key: 'roiAnnual', min: 0, max: 40, good: 'high' as const },
            ].map(({ label, key, min, max, good }) => (
              <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1px 0', borderBottom: '1px solid #0d0d0d', gap: 6 }}>
                <span style={{ color: '#555', fontSize: 11, flexShrink: 0 }}>{label}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <GaugeBar value={m[key]} min={min} max={max} good={good} />
                  <span style={{ color: 'var(--green)', fontSize: 11, textAlign: 'right', fontVariantNumeric: 'tabular-nums', minWidth: 40 }}>
                    {m[key] != null ? `${fmt(m[key], 1)}%` : '—'}
                  </span>
                </div>
              </div>
            ))}

            <SectionLabel>Per Share</SectionLabel>
            <DataRow label="EPS (TTM)"       value={m['epsTTM'] != null ? `$${fmt(m['epsTTM'])}` : '—'} />
            <DataRow label="EPS Fwd"         value={m['forwardEPS'] != null ? `$${fmt(m['forwardEPS'])}` : '—'} />
            <DataRow label="Book Val/Share"  value={m['bookValuePerShareAnnual'] != null ? `$${fmt(m['bookValuePerShareAnnual'])}` : '—'} />
            <DataRow label="FCF/Share (TTM)" value={m['freeCashFlowPerShareTTM'] != null ? `$${fmt(m['freeCashFlowPerShareTTM'])}` : '—'} />
            <DataRow label="Rev/Share (TTM)" value={m['revenuePerShareTTM'] != null ? `$${fmt(m['revenuePerShareTTM'])}` : '—'} />
          </div>

          {/* Column 3: Liquidity / Leverage */}
          <div>
            <SectionLabel>Liquidity</SectionLabel>
            <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
              <span style={{ color: '#33ff66', fontSize: 8 }}>■ STRONG</span>
              <span style={{ color: '#ffa028', fontSize: 8 }}>■ OK</span>
              <span style={{ color: '#ff3b3b', fontSize: 8 }}>■ WEAK</span>
            </div>
            {[
              { label: 'Current Ratio (Ann)', key: 'currentRatioAnnual',   min: 0, max: 4, good: 'high' as const },
              { label: 'Current Ratio (Qtr)', key: 'currentRatioQuarterly',min: 0, max: 4, good: 'high' as const },
              { label: 'Quick Ratio (Ann)',    key: 'quickRatioAnnual',     min: 0, max: 4, good: 'high' as const },
            ].map(({ label, key, min, max, good }) => (
              <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1px 0', borderBottom: '1px solid #0d0d0d', gap: 6 }}>
                <span style={{ color: '#555', fontSize: 11, flexShrink: 0 }}>{label}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <GaugeBar value={m[key]} min={min} max={max} good={good} />
                  <span style={{ color: '#cccccc', fontSize: 11, textAlign: 'right', fontVariantNumeric: 'tabular-nums', minWidth: 36 }}>
                    {fmt(m[key])}
                  </span>
                </div>
              </div>
            ))}

            <SectionLabel>Leverage</SectionLabel>
            <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
              <span style={{ color: '#33ff66', fontSize: 8 }}>■ CHEAP</span>
              <span style={{ color: '#ffa028', fontSize: 8 }}>■ FAIR</span>
              <span style={{ color: '#ff3b3b', fontSize: 8 }}>■ RICH</span>
            </div>
            {[
              { label: 'Debt/Equity (Ann)', key: 'totalDebt/totalEquityAnnual', min: 0, max: 3, good: 'low' as const },
              { label: 'LT Debt/Eq (Ann)',  key: 'longTermDebt/equityAnnual',   min: 0, max: 3, good: 'low' as const },
            ].map(({ label, key, min, max, good }) => (
              <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1px 0', borderBottom: '1px solid #0d0d0d', gap: 6 }}>
                <span style={{ color: '#555', fontSize: 11, flexShrink: 0 }}>{label}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <GaugeBar value={m[key]} min={min} max={max} good={good} />
                  <span style={{ color: '#cccccc', fontSize: 11, textAlign: 'right', fontVariantNumeric: 'tabular-nums', minWidth: 36 }}>
                    {fmt(m[key])}
                  </span>
                </div>
              </div>
            ))}

            <SectionLabel>Dividends</SectionLabel>
            <DataRow label="Div Yield"       value={m['dividendYieldIndicatedAnnual'] != null ? `${fmt(m['dividendYieldIndicatedAnnual'])}%` : '—'} />
            <DataRow label="Div/Share (Ann)" value={m['dividendPerShareAnnual'] != null ? `$${fmt(m['dividendPerShareAnnual'])}` : '—'} />
            <DataRow label="Payout Ratio"    value={m['payoutRatioAnnual'] != null ? `${fmt(m['payoutRatioAnnual'], 1)}%` : '—'} />
            <DataRow label="Div Growth 5Y"   value={m['dividendGrowthRate5Y'] != null ? `${fmt(m['dividendGrowthRate5Y'], 1)}%` : '—'} />

            <SectionLabel>Price Performance</SectionLabel>
            <DataRow label="Beta"       value={fmt(m['beta'])} />
            <DataRow label="5D Return"  value={fmtPct(m['5DayPriceReturnDaily'])}    valueColor={signColor(m['5DayPriceReturnDaily'])} />
            <DataRow label="13W Return" value={fmtPct(m['13WeekPriceReturnDaily'])}  valueColor={signColor(m['13WeekPriceReturnDaily'])} />
            <DataRow label="26W Return" value={fmtPct(m['26WeekPriceReturnDaily'])}  valueColor={signColor(m['26WeekPriceReturnDaily'])} />
            <DataRow label="52W Return" value={fmtPct(m['52WeekPriceReturnDaily'])}  valueColor={signColor(m['52WeekPriceReturnDaily'])} />
            <DataRow label="YTD Return" value={fmtPct(m['yearToDatePriceReturnDaily'])} valueColor={signColor(m['yearToDatePriceReturnDaily'])} />
          </div>
        </div>
      </div>
    </div>
  )
}
