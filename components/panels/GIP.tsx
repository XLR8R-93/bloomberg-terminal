'use client'
import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTerminalStore } from '@/lib/store'
import { usePaneTicker } from '@/lib/pane-context'
import {
  createChart, CandlestickSeries, HistogramSeries, LineSeries,
  type IChartApi, type ISeriesApi, type UTCTimestamp,
  ColorType, CrosshairMode, LineStyle,
} from 'lightweight-charts'

type Range = '1D' | '5D' | '1M' | '6M' | 'YTD' | '1Y' | '5Y'
const RANGES: Range[] = ['1D', '5D', '1M', '6M', 'YTD', '1Y', '5Y']

interface Bar { time: number; open: number; high: number; low: number; close: number; volume?: number }

// ── Technical indicator computations ─────────────────────────────────────────

function computeSMA(bars: Bar[], period: number) {
  const out: { time: number; value: number }[] = []
  for (let i = period - 1; i < bars.length; i++) {
    const avg = bars.slice(i - period + 1, i + 1).reduce((s, b) => s + b.close, 0) / period
    out.push({ time: bars[i].time, value: avg })
  }
  return out
}

function computeEMA(bars: Bar[], period: number): { time: number; value: number }[] {
  if (bars.length < period) return []
  const k = 2 / (period + 1)
  let ema = bars.slice(0, period).reduce((s, b) => s + b.close, 0) / period
  const out: { time: number; value: number }[] = [{ time: bars[period - 1].time, value: ema }]
  for (let i = period; i < bars.length; i++) {
    ema = bars[i].close * k + ema * (1 - k)
    out.push({ time: bars[i].time, value: ema })
  }
  return out
}

function computeBB(bars: Bar[], period = 20, mult = 2) {
  const upper: { time: number; value: number }[] = []
  const lower: { time: number; value: number }[] = []
  for (let i = period - 1; i < bars.length; i++) {
    const slice = bars.slice(i - period + 1, i + 1)
    const avg = slice.reduce((s, b) => s + b.close, 0) / period
    const std = Math.sqrt(slice.reduce((s, b) => s + (b.close - avg) ** 2, 0) / period)
    upper.push({ time: bars[i].time, value: avg + mult * std })
    lower.push({ time: bars[i].time, value: avg - mult * std })
  }
  return { upper, lower }
}

function computeRSI(bars: Bar[], period = 14): { time: number; value: number }[] {
  if (bars.length < period + 2) return []
  const out: { time: number; value: number }[] = []
  const gains: number[] = [], losses: number[] = []
  for (let i = 1; i < bars.length; i++) {
    const d = bars[i].close - bars[i - 1].close
    gains.push(Math.max(0, d))
    losses.push(Math.max(0, -d))
  }
  let ag = gains.slice(0, period).reduce((s, v) => s + v, 0) / period
  let al = losses.slice(0, period).reduce((s, v) => s + v, 0) / period
  out.push({ time: bars[period].time, value: al === 0 ? 100 : 100 - 100 / (1 + ag / al) })
  for (let i = period; i < gains.length; i++) {
    ag = (ag * (period - 1) + gains[i]) / period
    al = (al * (period - 1) + losses[i]) / period
    out.push({ time: bars[i + 1].time, value: al === 0 ? 100 : 100 - 100 / (1 + ag / al) })
  }
  return out
}

function computeMACD(bars: Bar[], fast = 12, slow = 26, signal = 9) {
  const e12 = computeEMA(bars, fast)
  const e26 = computeEMA(bars, slow)
  const e26m = new Map(e26.map(p => [p.time, p.value]))
  const macdLine = e12
    .filter(p => e26m.has(p.time))
    .map(p => ({ time: p.time, value: p.value - e26m.get(p.time)! }))

  // EMA of MACD line — feed as synthetic bars
  const mb = macdLine.map(p => ({ time: p.time, open: p.value, high: p.value, low: p.value, close: p.value }))
  const signalLine = computeEMA(mb as Bar[], signal)
  const sigm = new Map(signalLine.map(p => [p.time, p.value]))
  const histogram = macdLine
    .filter(p => sigm.has(p.time))
    .map(p => {
      const h = p.value - sigm.get(p.time)!
      return { time: p.time, value: h, color: h >= 0 ? 'rgba(51,255,102,0.55)' : 'rgba(255,59,59,0.55)' }
    })
  return { macdLine, signalLine, histogram }
}

function computeVWAP(bars: Bar[]): { time: number; value: number }[] {
  if (!bars.some(b => b.volume)) return []
  let cumPV = 0, cumV = 0
  return bars.map(b => {
    const tp = (b.high + b.low + b.close) / 3
    cumPV += tp * (b.volume ?? 0)
    cumV  += (b.volume ?? 0)
    return { time: b.time, value: cumV > 0 ? cumPV / cumV : b.close }
  })
}

// ── Shared chart options ───────────────────────────────────────────────────────
const BASE_OPTS = {
  layout: { background: { type: ColorType.Solid, color: '#050505' }, textColor: '#666', attributionLogo: false },
  grid:   { vertLines: { color: '#111' }, horzLines: { color: '#0d0d0d' } },
  crosshair: { mode: CrosshairMode.Normal },
  rightPriceScale: { borderColor: '#1a1a1a', textColor: '#555' },
  timeScale: { borderColor: '#1a1a1a', timeVisible: true, secondsVisible: false },
  handleScroll: true, handleScale: true,
}

// ── Component ─────────────────────────────────────────────────────────────────
export function GIP() {
  const { activeTicker: _globalTicker } = useTerminalStore()
  const activeTicker = usePaneTicker(_globalTicker)
  const [range,     setRange]     = useState<Range>('1M')
  // Overlay toggles
  const [showSMA20,  setShowSMA20]  = useState(true)
  const [showSMA50,  setShowSMA50]  = useState(false)
  const [showSMA200, setShowSMA200] = useState(false)
  const [showEMA21,  setShowEMA21]  = useState(false)
  const [showBB,     setShowBB]     = useState(false)
  const [showVWAP,   setShowVWAP]   = useState(false)
  // Sub-panel toggles
  const [showRSI,    setShowRSI]    = useState(false)
  const [showMACD,   setShowMACD]   = useState(false)

  // DOM refs
  const priceRef   = useRef<HTMLDivElement>(null)
  const rsiRef     = useRef<HTMLDivElement>(null)
  const macdRef    = useRef<HTMLDivElement>(null)
  const volRef     = useRef<HTMLDivElement>(null)

  // Chart instances
  const priceChart = useRef<IChartApi | null>(null)
  const rsiChart   = useRef<IChartApi | null>(null)
  const macdChart  = useRef<IChartApi | null>(null)
  const volChart   = useRef<IChartApi | null>(null)

  // Series refs — price chart overlays
  const candleSer  = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const sma20Ser   = useRef<ISeriesApi<'Line'> | null>(null)
  const sma50Ser   = useRef<ISeriesApi<'Line'> | null>(null)
  const sma200Ser  = useRef<ISeriesApi<'Line'> | null>(null)
  const ema21Ser   = useRef<ISeriesApi<'Line'> | null>(null)
  const bbUpSer    = useRef<ISeriesApi<'Line'> | null>(null)
  const bbLoSer    = useRef<ISeriesApi<'Line'> | null>(null)
  const vwapSer    = useRef<ISeriesApi<'Line'> | null>(null)
  // RSI
  const rsiLineSer = useRef<ISeriesApi<'Line'> | null>(null)
  // MACD
  const macdHistSer = useRef<ISeriesApi<'Histogram'> | null>(null)
  const macdLineSer = useRef<ISeriesApi<'Line'> | null>(null)
  const macdSigSer  = useRef<ISeriesApi<'Line'> | null>(null)
  // Volume
  const volSer     = useRef<ISeriesApi<'Histogram'> | null>(null)

  const { data, isLoading, error } = useQuery<{ bars: Bar[] }>({
    queryKey: ['chart', activeTicker, range],
    queryFn: () => fetch(`/api/chart?symbol=${activeTicker}&range=${range}`).then(r => r.json()),
    staleTime: range === '1D' ? 60_000 : 300_000,
  })

  // ── Init all four chart instances once ──────────────────────────────────────
  useEffect(() => {
    if (!priceRef.current || !rsiRef.current || !macdRef.current || !volRef.current) return

    // Price chart
    priceChart.current = createChart(priceRef.current, {
      ...BASE_OPTS,
      autoSize: true,
    })

    // RSI chart
    rsiChart.current = createChart(rsiRef.current, {
      ...BASE_OPTS,
      autoSize: true,
      rightPriceScale: {
        borderColor: '#1a1a1a', textColor: '#555',
        scaleMargins: { top: 0.05, bottom: 0.05 },
      },
      timeScale: { ...BASE_OPTS.timeScale, visible: false },
    })

    // MACD chart
    macdChart.current = createChart(macdRef.current, {
      ...BASE_OPTS,
      autoSize: true,
      timeScale: { ...BASE_OPTS.timeScale, visible: false },
    })

    // Volume chart
    volChart.current = createChart(volRef.current, {
      ...BASE_OPTS,
      autoSize: true,
      rightPriceScale: {
        borderColor: '#1a1a1a', textColor: '#aaaaaa',
        scaleMargins: { top: 0.1, bottom: 0 },
      },
      timeScale: { ...BASE_OPTS.timeScale, visible: false },
    })

    // ── Create series ──────────────────────────────────────────────────────────
    candleSer.current = priceChart.current.addSeries(CandlestickSeries, {
      upColor: '#33ff66', downColor: '#ff3b3b', borderVisible: false,
      wickUpColor: '#33ff66', wickDownColor: '#ff3b3b',
    })
    sma20Ser.current = priceChart.current.addSeries(LineSeries, {
      color: '#ffa028', lineWidth: 1, priceLineVisible: false, lastValueVisible: false,
    })
    sma50Ser.current = priceChart.current.addSeries(LineSeries, {
      color: '#4d9fff', lineWidth: 1, priceLineVisible: false, lastValueVisible: false,
    })
    sma200Ser.current = priceChart.current.addSeries(LineSeries, {
      color: '#aa66ff', lineWidth: 1, priceLineVisible: false, lastValueVisible: false,
    })
    ema21Ser.current = priceChart.current.addSeries(LineSeries, {
      color: '#ff6ec7', lineWidth: 1, priceLineVisible: false, lastValueVisible: false,
      lineStyle: LineStyle.Dashed,
    })
    bbUpSer.current = priceChart.current.addSeries(LineSeries, {
      color: 'rgba(100,160,255,0.5)', lineWidth: 1, priceLineVisible: false, lastValueVisible: false,
      lineStyle: LineStyle.Dotted,
    })
    bbLoSer.current = priceChart.current.addSeries(LineSeries, {
      color: 'rgba(100,160,255,0.5)', lineWidth: 1, priceLineVisible: false, lastValueVisible: false,
      lineStyle: LineStyle.Dotted,
    })
    vwapSer.current = priceChart.current.addSeries(LineSeries, {
      color: '#00e5ff', lineWidth: 1, priceLineVisible: false, lastValueVisible: true,
    })

    rsiLineSer.current = rsiChart.current.addSeries(LineSeries, {
      color: '#e8e8e8', lineWidth: 1, priceLineVisible: false, lastValueVisible: true,
    })
    // Reference lines: 70, 50, 30
    rsiLineSer.current.createPriceLine({ price: 70, color: '#ff3b3b', lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: 'OB' })
    rsiLineSer.current.createPriceLine({ price: 50, color: '#888',    lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: false, title: '' })
    rsiLineSer.current.createPriceLine({ price: 30, color: '#33ff66', lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: 'OS' })

    macdHistSer.current = macdChart.current.addSeries(HistogramSeries, {
      priceLineVisible: false, lastValueVisible: false,
    })
    macdLineSer.current = macdChart.current.addSeries(LineSeries, {
      color: '#4d9fff', lineWidth: 1, priceLineVisible: false, lastValueVisible: false,
    })
    macdSigSer.current = macdChart.current.addSeries(LineSeries, {
      color: '#ffa028', lineWidth: 1, priceLineVisible: false, lastValueVisible: false,
    })
    macdHistSer.current.createPriceLine({ price: 0, color: '#888', lineWidth: 1, lineStyle: LineStyle.Solid, axisLabelVisible: false, title: '' })

    volSer.current = volChart.current.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' }, priceScaleId: 'left',
    })

    // ── Timescale sync (master = priceChart) ──────────────────────────────────
    const charts = [rsiChart, macdChart, volChart]
    let syncing = false
    const mainTS = priceChart.current.timeScale()
    charts.forEach(c => {
      mainTS.subscribeVisibleLogicalRangeChange(r => {
        if (syncing || !r) return
        syncing = true
        c.current?.timeScale().setVisibleLogicalRange(r)
        syncing = false
      })
      c.current?.timeScale().subscribeVisibleLogicalRangeChange(r => {
        if (syncing || !r) return
        syncing = true
        mainTS.setVisibleLogicalRange(r)
        syncing = false
      })
    })

    // ── Resize observer ────────────────────────────────────────────────────────
    const containers = [
      [priceRef, priceChart],
      [rsiRef,   rsiChart],
      [macdRef,  macdChart],
      [volRef,   volChart],
    ] as const

    return () => {
      priceChart.current?.remove()
      rsiChart.current?.remove()
      macdChart.current?.remove()
      volChart.current?.remove()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Update data whenever bars or toggle states change ─────────────────────
  useEffect(() => {
    if (!data?.bars?.length) return
    const bars = data.bars.filter(b => b && b.time && isFinite(b.open) && isFinite(b.close))
    if (!bars.length) return

    const T = (t: number) => t as UTCTimestamp

    // Candles + volume
    candleSer.current?.setData(bars.map(b => ({ time: T(b.time), open: b.open, high: b.high, low: b.low, close: b.close })))
    volSer.current?.setData(bars.map(b => ({
      time: T(b.time), value: b.volume ?? 0,
      color: b.close >= b.open ? 'rgba(51,255,102,0.35)' : 'rgba(255,59,59,0.35)',
    })))

    // SMA overlays
    const toTS = (p: { time: number; value: number }) => ({ time: T(p.time), value: p.value })
    sma20Ser.current?.setData(showSMA20  ? computeSMA(bars, 20).map(toTS)  : [])
    sma50Ser.current?.setData(showSMA50  ? computeSMA(bars, 50).map(toTS)  : [])
    sma200Ser.current?.setData(showSMA200 ? computeSMA(bars, 200).map(toTS) : [])
    ema21Ser.current?.setData(showEMA21  ? computeEMA(bars, 21).map(toTS)  : [])

    // Bollinger Bands
    if (showBB) {
      const { upper, lower } = computeBB(bars)
      bbUpSer.current?.setData(upper.map(toTS))
      bbLoSer.current?.setData(lower.map(toTS))
    } else {
      bbUpSer.current?.setData([])
      bbLoSer.current?.setData([])
    }

    // VWAP (only meaningful for intraday)
    vwapSer.current?.setData(showVWAP && range === '1D' ? computeVWAP(bars).map(toTS) : [])

    // RSI
    rsiLineSer.current?.setData(computeRSI(bars).map(toTS))

    // MACD
    const { macdLine, signalLine, histogram } = computeMACD(bars)
    macdHistSer.current?.setData(histogram.map(p => ({ time: T(p.time), value: p.value, color: p.color })))
    macdLineSer.current?.setData(macdLine.map(toTS))
    macdSigSer.current?.setData(signalLine.map(toTS))

    // Defer fitContent so autoSize has time to measure the container
    setTimeout(() => {
      priceChart.current?.timeScale().fitContent()
      volChart.current?.timeScale().fitContent()
    }, 50)
  }, [data, showSMA20, showSMA50, showSMA200, showEMA21, showBB, showVWAP, range])

  // ── UI helpers ─────────────────────────────────────────────────────────────
  function TBtn({ label, active, onClick, color = '#ffa028' }: {
    label: string; active: boolean; onClick: () => void; color?: string
  }) {
    return (
      <button onClick={onClick} style={{
        background: active ? `${color}18` : 'transparent',
        border: `1px solid ${active ? color : '#222'}`,
        color: active ? color : '#555',
        padding: '1px 6px', cursor: 'pointer',
        font: 'inherit', fontSize: 10, letterSpacing: '0.03em',
      }}>
        {label}
      </button>
    )
  }

  const SUB_H = 90  // height of RSI / MACD sub-panels

  return (
    <div className="panel" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="panel-header" style={{ flexDirection: 'column', gap: 0, padding: 0, height: 'auto' }}>

        {/* Row 1: mnemonic, ranges, ticker */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 10px', borderBottom: '1px solid #111' }}>
          <span className="panel-mnemonic">GIP</span>
          <div style={{ display: 'flex', gap: 3, flex: 1, justifyContent: 'center' }}>
            {RANGES.map(r => (
              <TBtn key={r} label={r} active={range === r} onClick={() => setRange(r)} />
            ))}
          </div>
          <span className="panel-ticker">{activeTicker}</span>
        </div>

        {/* Row 2: overlay toggles + sub-panel toggles */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 10px' }}>
          <span style={{ color: '#888', fontSize: 9, marginRight: 2, letterSpacing: '0.06em' }}>OVERLAYS</span>
          <TBtn label="SMA20"  active={showSMA20}  onClick={() => setShowSMA20(x  => !x)} color="#ffa028" />
          <TBtn label="SMA50"  active={showSMA50}  onClick={() => setShowSMA50(x  => !x)} color="#4d9fff" />
          <TBtn label="SMA200" active={showSMA200} onClick={() => setShowSMA200(x => !x)} color="#aa66ff" />
          <TBtn label="EMA21"  active={showEMA21}  onClick={() => setShowEMA21(x  => !x)} color="#ff6ec7" />
          <TBtn label="BB"     active={showBB}     onClick={() => setShowBB(x     => !x)} color="#64a0ff" />
          {range === '1D' && (
            <TBtn label="VWAP" active={showVWAP}   onClick={() => setShowVWAP(x   => !x)} color="#00e5ff" />
          )}
          <div style={{ width: 1, height: 12, background: '#222', margin: '0 4px' }} />
          <span style={{ color: '#888', fontSize: 9, marginRight: 2, letterSpacing: '0.06em' }}>INDICATORS</span>
          <TBtn label="RSI"  active={showRSI}  onClick={() => setShowRSI(x  => !x)} color="#e8e8e8" />
          <TBtn label="MACD" active={showMACD} onClick={() => setShowMACD(x => !x)} color="#4d9fff" />
        </div>
      </div>

      {/* ── Loading / error states ─────────────────────────────────────────── */}
      {isLoading && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#e8e8e8' }}>
          <span className="skeleton" style={{ width: 200, height: 16, display: 'inline-block' }} />
        </div>
      )}
      {error && !isLoading && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ff3b3b', fontSize: 11 }}>
          Chart data unavailable
        </div>
      )}

      {/* ── Charts ─────────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: isLoading ? 'none' : 'flex', flexDirection: 'column', minHeight: 0 }}>

        {/* Main price chart */}
        <div style={{ flex: 1, minHeight: 0, position: 'relative' }} ref={priceRef}>
          {/* Legend overlay */}
          <div style={{
            position: 'absolute', top: 6, left: 8, zIndex: 10,
            display: 'flex', gap: 10, pointerEvents: 'none',
          }}>
            {showSMA20  && <span style={{ color: '#ffa028', fontSize: 9 }}>SMA20</span>}
            {showSMA50  && <span style={{ color: '#4d9fff', fontSize: 9 }}>SMA50</span>}
            {showSMA200 && <span style={{ color: '#aa66ff', fontSize: 9 }}>SMA200</span>}
            {showEMA21  && <span style={{ color: '#ff6ec7', fontSize: 9 }}>EMA21</span>}
            {showBB     && <span style={{ color: '#64a0ff', fontSize: 9 }}>BB(20,2)</span>}
            {showVWAP && range === '1D' && <span style={{ color: '#00e5ff', fontSize: 9 }}>VWAP</span>}
          </div>
        </div>

        {/* RSI sub-panel */}
        <div style={{
          height: showRSI ? SUB_H : 0,
          overflow: 'hidden',
          borderTop: showRSI ? '1px solid #111' : 'none',
          transition: 'height 0.15s ease',
          position: 'relative',
          flexShrink: 0,
        }}>
          <div ref={rsiRef} style={{ width: '100%', height: '100%' }} />
          <div style={{ position: 'absolute', top: 4, left: 8, pointerEvents: 'none' }}>
            <span style={{ color: '#b0b0b0', fontSize: 9 }}>RSI(14)</span>
          </div>
        </div>

        {/* MACD sub-panel */}
        <div style={{
          height: showMACD ? SUB_H : 0,
          overflow: 'hidden',
          borderTop: showMACD ? '1px solid #111' : 'none',
          transition: 'height 0.15s ease',
          position: 'relative',
          flexShrink: 0,
        }}>
          <div ref={macdRef} style={{ width: '100%', height: '100%' }} />
          <div style={{ position: 'absolute', top: 4, left: 8, pointerEvents: 'none', display: 'flex', gap: 10 }}>
            <span style={{ color: '#b0b0b0', fontSize: 9 }}>MACD(12,26,9)</span>
            <span style={{ color: '#4d9fff', fontSize: 9 }}>— MACD</span>
            <span style={{ color: '#ffa028', fontSize: 9 }}>— Signal</span>
          </div>
        </div>

        {/* Volume sub-panel */}
        <div style={{ height: 70, borderTop: '1px solid #111', flexShrink: 0, position: 'relative' }}>
          <div ref={volRef} style={{ width: '100%', height: '100%' }} />
          <div style={{ position: 'absolute', top: 4, left: 8, pointerEvents: 'none' }}>
            <span style={{ color: '#888', fontSize: 9 }}>VOL</span>
          </div>
        </div>
      </div>
    </div>
  )
}
