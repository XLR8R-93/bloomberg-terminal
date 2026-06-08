'use client'
import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTerminalStore } from '@/lib/store'
import {
  createChart, CandlestickSeries, HistogramSeries, LineSeries,
  type IChartApi, type ISeriesApi, type UTCTimestamp, ColorType, CrosshairMode,
} from 'lightweight-charts'

type Range = '1D' | '5D' | '1M' | '6M' | 'YTD' | '1Y' | '5Y'
const RANGES: Range[] = ['1D', '5D', '1M', '6M', 'YTD', '1Y', '5Y']

interface Bar { time: number; open: number; high: number; low: number; close: number; volume?: number }

function computeSMA(bars: Bar[], period: number): { time: number; value: number }[] {
  const out: { time: number; value: number }[] = []
  for (let i = period - 1; i < bars.length; i++) {
    const slice = bars.slice(i - period + 1, i + 1)
    const avg = slice.reduce((s, b) => s + b.close, 0) / period
    out.push({ time: bars[i].time, value: avg })
  }
  return out
}

export function GIP() {
  const { activeTicker } = useTerminalStore()
  const [range, setRange] = useState<Range>('1M')
  const [showSMA20, setShowSMA20] = useState(true)
  const [showSMA50, setShowSMA50] = useState(false)
  const [showSMA200, setShowSMA200] = useState(false)

  const chartContainerRef = useRef<HTMLDivElement>(null)
  const volContainerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const volChartRef = useRef<IChartApi | null>(null)
  const candleRef = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const volRef = useRef<ISeriesApi<'Histogram'> | null>(null)
  const sma20Ref = useRef<ISeriesApi<'Line'> | null>(null)
  const sma50Ref = useRef<ISeriesApi<'Line'> | null>(null)
  const sma200Ref = useRef<ISeriesApi<'Line'> | null>(null)

  const { data, isLoading, error } = useQuery<{ bars: Bar[] }>({
    queryKey: ['chart', activeTicker, range],
    queryFn: () => fetch(`/api/chart?symbol=${activeTicker}&range=${range}`).then((r) => r.json()),
    staleTime: range === '1D' ? 60_000 : 300_000,
  })

  const chartOpts = {
    layout: { background: { type: ColorType.Solid, color: '#050505' }, textColor: '#666' },
    grid: { vertLines: { color: '#111' }, horzLines: { color: '#111' } },
    crosshair: { mode: CrosshairMode.Normal },
    rightPriceScale: { borderColor: '#1f1f1f', textColor: '#666' },
    timeScale: { borderColor: '#1f1f1f', timeVisible: true, secondsVisible: false },
    handleScroll: true,
    handleScale: true,
  }

  useEffect(() => {
    if (!chartContainerRef.current || !volContainerRef.current) return

    chartRef.current = createChart(chartContainerRef.current, {
      ...chartOpts, width: chartContainerRef.current.clientWidth, height: chartContainerRef.current.clientHeight,
    })
    volChartRef.current = createChart(volContainerRef.current, {
      ...chartOpts, width: volContainerRef.current.clientWidth, height: volContainerRef.current.clientHeight,
      rightPriceScale: { borderColor: '#1f1f1f', textColor: '#444', scaleMargins: { top: 0.1, bottom: 0 } },
    })

    candleRef.current = chartRef.current.addSeries(CandlestickSeries, {
      upColor: '#33ff66', downColor: '#ff3b3b', borderVisible: false,
      wickUpColor: '#33ff66', wickDownColor: '#ff3b3b',
    })

    volRef.current = volChartRef.current.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: 'left',
    })

    sma20Ref.current = chartRef.current.addSeries(LineSeries, {
      color: '#ffa028', lineWidth: 1, priceLineVisible: false, lastValueVisible: false,
    })
    sma50Ref.current = chartRef.current.addSeries(LineSeries, {
      color: '#4d9fff', lineWidth: 1, priceLineVisible: false, lastValueVisible: false,
    })
    sma200Ref.current = chartRef.current.addSeries(LineSeries, {
      color: '#aa66ff', lineWidth: 1, priceLineVisible: false, lastValueVisible: false,
    })

    // sync timescales
    const mainTS = chartRef.current.timeScale()
    const volTS = volChartRef.current.timeScale()
    mainTS.subscribeVisibleLogicalRangeChange((r) => { if (r) volTS.setVisibleLogicalRange(r) })
    volTS.subscribeVisibleLogicalRangeChange((r) => { if (r) mainTS.setVisibleLogicalRange(r) })

    const ro = new ResizeObserver(() => {
      if (chartContainerRef.current && chartRef.current)
        chartRef.current.applyOptions({ width: chartContainerRef.current.clientWidth, height: chartContainerRef.current.clientHeight })
      if (volContainerRef.current && volChartRef.current)
        volChartRef.current.applyOptions({ width: volContainerRef.current.clientWidth, height: volContainerRef.current.clientHeight })
    })
    ro.observe(chartContainerRef.current)
    ro.observe(volContainerRef.current)

    return () => {
      ro.disconnect()
      chartRef.current?.remove()
      volChartRef.current?.remove()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!data?.bars?.length) return
    const bars = data.bars.filter(
      (b) => b && b.time && isFinite(b.time) && isFinite(b.open) && isFinite(b.close)
    )
    if (!bars.length) return

    const candles = bars.map((b) => ({ time: b.time as UTCTimestamp, open: b.open, high: b.high, low: b.low, close: b.close }))
    const volumes = bars.map((b) => ({
      time: b.time as UTCTimestamp,
      value: b.volume || 0,
      color: b.close >= b.open ? 'rgba(51,255,102,0.4)' : 'rgba(255,59,59,0.4)',
    }))

    candleRef.current?.setData(candles)
    volRef.current?.setData(volumes)

    const sma20 = computeSMA(bars, 20).map((p) => ({ time: p.time as UTCTimestamp, value: p.value }))
    const sma50 = computeSMA(bars, 50).map((p) => ({ time: p.time as UTCTimestamp, value: p.value }))
    const sma200 = computeSMA(bars, 200).map((p) => ({ time: p.time as UTCTimestamp, value: p.value }))

    sma20Ref.current?.setData(showSMA20 ? sma20 : [])
    sma50Ref.current?.setData(showSMA50 ? sma50 : [])
    sma200Ref.current?.setData(showSMA200 ? sma200 : [])

    chartRef.current?.timeScale().fitContent()
    volChartRef.current?.timeScale().fitContent()
  }, [data, showSMA20, showSMA50, showSMA200])

  const Btn = ({ v, active, onClick, color }: { v: string; active: boolean; onClick: () => void; color?: string }) => (
    <button
      onClick={onClick}
      style={{
        background: active ? '#0a1a0a' : 'transparent',
        border: `1px solid ${active ? (color || '#ffa028') : '#222'}`,
        color: active ? (color || '#ffa028') : '#555',
        padding: '1px 5px',
        cursor: 'pointer',
        font: 'inherit',
        fontSize: 10,
      }}
    >
      {v}
    </button>
  )

  return (
    <div className="panel" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className="panel-header" style={{ gap: 8 }}>
        <span className="panel-mnemonic">GIP — PRICE CHART</span>
        <div style={{ display: 'flex', gap: 3, alignItems: 'center', flex: 1, justifyContent: 'center' }}>
          {RANGES.map((r) => (
            <Btn key={r} v={r} active={range === r} onClick={() => setRange(r)} />
          ))}
        </div>
        <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
          <Btn v="SMA20" active={showSMA20} onClick={() => setShowSMA20((x) => !x)} color="#ffa028" />
          <Btn v="SMA50" active={showSMA50} onClick={() => setShowSMA50((x) => !x)} color="#4d9fff" />
          <Btn v="SMA200" active={showSMA200} onClick={() => setShowSMA200((x) => !x)} color="#aa66ff" />
        </div>
        <span className="panel-ticker">{activeTicker}</span>
      </div>

      {isLoading && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#555' }}>
          <span className="skeleton" style={{ width: 200, height: 16, display: 'inline-block' }} />
        </div>
      )}

      {error && !isLoading && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ff3b3b', fontSize: 11 }}>
          Chart data unavailable — set TWELVE_DATA_API_KEY or ALPHA_VANTAGE_API_KEY
        </div>
      )}

      <div style={{ flex: 1, display: isLoading ? 'none' : 'block' }} ref={chartContainerRef} />
      <div style={{ height: 80, display: isLoading ? 'none' : 'block', borderTop: '1px solid #111' }} ref={volContainerRef} />
    </div>
  )
}
