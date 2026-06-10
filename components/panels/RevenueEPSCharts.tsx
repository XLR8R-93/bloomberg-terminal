'use client'
import { useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTerminalStore } from '@/lib/store'
import {
  createChart, HistogramSeries, LineSeries,
  ColorType, type IChartApi, type UTCTimestamp,
} from 'lightweight-charts'
import type { AnnualBar } from '@/app/api/financials/history/route'

function fmtB(v: number | null | undefined) {
  if (v == null) return '—'
  const b = v / 1e9
  return `$${Math.abs(b).toFixed(1)}B`
}

function fmtPct(a: number | null, b: number | null) {
  if (a == null || b == null || b === 0) return null
  return ((a - b) / Math.abs(b)) * 100
}

function pctColor(v: number | null) {
  if (v == null) return '#555'
  return v >= 0 ? '#33ff66' : '#ff3b3b'
}

// Converts a fiscal year-end date string to a UTC timestamp for the chart
function dateToTs(date: string): UTCTimestamp {
  return (new Date(date).getTime() / 1000) as UTCTimestamp
}

const CHART_OPTS = {
  layout: { background: { type: ColorType.Solid, color: '#050505' }, textColor: '#666' },
  grid: { vertLines: { color: '#0d0d0d' }, horzLines: { color: '#0d0d0d' } },
  rightPriceScale: { borderColor: '#1a1a1a', textColor: '#555' },
  timeScale: { borderColor: '#1a1a1a', timeVisible: false, fixLeftEdge: true, fixRightEdge: true },
  crosshair: { vertLine: { color: '#888' }, horzLine: { color: '#888' } },
  handleScroll: false,
  handleScale: false,
}

function BarChart({
  bars,
  valueKey,
  trendKey,
  color,
  title,
  formatVal,
}: {
  bars: AnnualBar[]
  valueKey: keyof AnnualBar
  trendKey?: keyof AnnualBar
  color: string
  title: string
  formatVal: (v: number) => string
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)

  useEffect(() => {
    if (!containerRef.current || bars.length === 0) return

    if (chartRef.current) {
      chartRef.current.remove()
      chartRef.current = null
    }

    const chart = createChart(containerRef.current, {
      ...CHART_OPTS,
      width: containerRef.current.clientWidth,
      height: containerRef.current.clientHeight,
    })
    chartRef.current = chart

    const hist = chart.addSeries(HistogramSeries, {
      color,
      priceFormat: { type: 'custom', formatter: formatVal },
    })

    const histData = bars
      .filter((b) => b[valueKey] != null)
      .map((b) => ({
        time: dateToTs(b.date),
        value: b[valueKey] as number,
        color: b[valueKey] != null && bars.indexOf(b) > 0 && bars[bars.indexOf(b) - 1][valueKey] != null
          ? (b[valueKey] as number) >= (bars[bars.indexOf(b) - 1][valueKey] as number) ? color : '#ff3b3b44'
          : color,
      }))

    hist.setData(histData)

    // Trend line (EPS or net income as a line overlay)
    if (trendKey) {
      const line = chart.addSeries(LineSeries, {
        color: '#ffa028',
        lineWidth: 1,
        priceScaleId: 'right',
        priceFormat: { type: 'custom', formatter: formatVal },
      })
      const lineData = bars
        .filter((b) => b[trendKey] != null)
        .map((b) => ({ time: dateToTs(b.date), value: b[trendKey] as number }))
      line.setData(lineData)
    }

    chart.timeScale().fitContent()

    const ro = new ResizeObserver(() => {
      if (containerRef.current) {
        chart.applyOptions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        })
      }
    })
    ro.observe(containerRef.current)
    return () => { ro.disconnect(); chart.remove(); chartRef.current = null }
  }, [bars, valueKey, trendKey, color, formatVal])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
      <div style={{ color: '#ffa028', fontSize: 10, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        {title}
      </div>
      <div ref={containerRef} style={{ flex: 1, minHeight: 0 }} />
    </div>
  )
}

function MetricTable({ bars }: { bars: AnnualBar[] }) {
  const rows = [
    { label: 'Revenue',      key: 'revenue' as keyof AnnualBar,         fmt: fmtB },
    { label: 'Gross Profit', key: 'grossProfit' as keyof AnnualBar,     fmt: fmtB },
    { label: 'Oper. Income', key: 'operatingIncome' as keyof AnnualBar, fmt: fmtB },
    { label: 'Net Income',   key: 'netIncome' as keyof AnnualBar,       fmt: fmtB },
    { label: 'EPS (Basic)',  key: 'eps' as keyof AnnualBar,             fmt: (v: number) => `$${v.toFixed(2)}` },
    { label: 'EPS (Dilut.)', key: 'epsDiluted' as keyof AnnualBar,      fmt: (v: number) => `$${v.toFixed(2)}` },
  ]

  const displayed = [...bars].reverse().slice(0, 6).reverse()

  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ color: '#ffa028', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', borderBottom: '1px solid #1f1f1f', paddingBottom: 2, marginBottom: 4 }}>
        Annual Financials (USD)
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
          <thead>
            <tr>
              <th style={{ color: '#aaaaaa', textAlign: 'left', padding: '1px 6px 1px 0', fontWeight: 'normal', whiteSpace: 'nowrap' }}>
                FY
              </th>
              {displayed.map((b) => (
                <th key={b.date} style={{ color: '#ffa028', textAlign: 'right', padding: '1px 6px', fontWeight: 'normal', whiteSpace: 'nowrap' }}>
                  {b.year}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ label, key, fmt }) => {
              const isBold = label === 'Revenue' || label === 'Net Income'
              return (
                <tr key={label}>
                  <td style={{ color: '#e8e8e8', padding: '1px 6px 1px 0', whiteSpace: 'nowrap', fontWeight: isBold ? 'bold' : 'normal', borderBottom: '1px solid #0d0d0d' }}>
                    {label}
                  </td>
                  {displayed.map((b, i) => {
                    const v = b[key] as number | null
                    const prev = i > 0 ? displayed[i - 1][key] as number | null : null
                    const yoy = fmtPct(v, prev)
                    return (
                      <td key={b.date} style={{ textAlign: 'right', padding: '1px 6px', borderBottom: '1px solid #0d0d0d', whiteSpace: 'nowrap' }}>
                        <span style={{ color: '#e8e8e8', fontVariantNumeric: 'tabular-nums', fontWeight: isBold ? 'bold' : 'normal' }}>
                          {v != null ? fmt(v) : '—'}
                        </span>
                        {yoy != null && (
                          <span style={{ color: pctColor(yoy), fontSize: 9, marginLeft: 4 }}>
                            {yoy >= 0 ? '+' : ''}{yoy.toFixed(1)}%
                          </span>
                        )}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export function RevenueEPSCharts() {
  const { activeTicker } = useTerminalStore()

  const { data: bars, isLoading, error } = useQuery<AnnualBar[]>({
    queryKey: ['fin-history', activeTicker],
    queryFn: () => fetch(`/api/financials/history?symbol=${activeTicker}`).then((r) => r.json()),
    staleTime: 24 * 60 * 60_000,
  })

  if (isLoading) {
    return (
      <div>
        {[...Array(6)].map((_, i) => (
          <div key={i} className="skeleton" style={{ height: 13, marginBottom: 4, width: `${50 + (i * 17) % 40}%` }} />
        ))}
      </div>
    )
  }

  if (error || !bars || !Array.isArray(bars) || bars.length === 0) {
    return <div style={{ color: '#e8e8e8', fontSize: 11 }}>Historical data unavailable for {activeTicker}</div>
  }

  const fmtRevLabel = (v: number) => `$${(v / 1e9).toFixed(0)}B`
  const fmtEpsLabel = (v: number) => `$${v.toFixed(2)}`

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 8 }}>
      {/* Two charts side by side */}
      <div style={{ display: 'flex', gap: 12, height: 180, flexShrink: 0 }}>
        <BarChart
          bars={bars}
          valueKey="revenue"
          trendKey="grossProfit"
          color="#1a4a1a"
          title={`Comparable Revenue | ${activeTicker}`}
          formatVal={fmtRevLabel}
        />
        <BarChart
          bars={bars}
          valueKey="epsDiluted"
          trendKey="eps"
          color="#1a3a4a"
          title={`Comparable EPS (Diluted) | ${activeTicker}`}
          formatVal={fmtEpsLabel}
        />
      </div>

      {/* Year labels below charts */}
      <div style={{ display: 'flex', paddingLeft: 0, flexShrink: 0 }}>
        <div style={{ flex: 1, display: 'flex', justifyContent: 'space-around' }}>
          {bars.map((b) => (
            <span key={b.date} style={{ color: '#aaaaaa', fontSize: 9 }}>{b.year}</span>
          ))}
        </div>
        <div style={{ flex: 1, display: 'flex', justifyContent: 'space-around' }}>
          {bars.map((b) => (
            <span key={b.date} style={{ color: '#aaaaaa', fontSize: 9 }}>{b.year}</span>
          ))}
        </div>
      </div>

      {/* Data table */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <MetricTable bars={bars} />
      </div>
    </div>
  )
}
