'use client'
import { useState, useRef, useEffect, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTerminalStore } from '@/lib/store'
import type { MmapStock } from '@/app/api/mmap/route'

// ── Colour scale ──────────────────────────────────────────────────────────────
// Maps day-change% to a terminal green/red colour
function changeColor(pct: number | null): string {
  if (pct == null) return '#1a1a1a'
  const v = Math.max(-5, Math.min(5, pct))
  if (v >= 0) {
    const t = v / 5
    const g = Math.round(20 + t * 130)
    return `rgb(0,${g},0)`
  } else {
    const t = (-v) / 5
    const r = Math.round(20 + t * 150)
    return `rgb(${r},0,0)`
  }
}

function textColor(pct: number | null): string {
  if (pct == null) return '#555'
  const abs = Math.abs(pct)
  if (abs >= 2) return '#ffffff'
  if (abs >= 0.8) return '#dddddd'
  return '#aaaaaa'
}

// ── Squarified treemap ────────────────────────────────────────────────────────
interface TileRect {
  x: number; y: number; w: number; h: number
  stock: MmapStock
}

function squarify(
  items: MmapStock[],
  x: number, y: number, w: number, h: number,
): TileRect[] {
  if (items.length === 0 || w <= 0 || h <= 0) return []
  if (items.length === 1) return [{ x, y, w, h, stock: items[0] }]

  const total = items.reduce((s, i) => s + i.mktCapB, 0)

  // Determine which axis to split on
  const horizontal = w >= h

  // Find the optimal row: keep adding items while aspect ratio improves
  let row: MmapStock[] = []
  let rowVal = 0
  let bestWorstRatio = Infinity

  for (const item of items) {
    row.push(item)
    rowVal += item.mktCapB

    const rowFrac  = rowVal / total
    const rowDepth = horizontal ? w * rowFrac : h * rowFrac
    const rowLen   = horizontal ? h           : w

    let worstRatio = 0
    for (const it of row) {
      const tileLen = (it.mktCapB / rowVal) * rowLen
      if (tileLen <= 0) continue
      const r = Math.max(rowDepth / tileLen, tileLen / rowDepth)
      worstRatio = Math.max(worstRatio, r)
    }

    if (worstRatio > bestWorstRatio && row.length > 1) {
      // This item made things worse — back it out
      row.pop()
      rowVal -= item.mktCapB
      break
    }
    bestWorstRatio = worstRatio
  }

  // Lay out the current row
  const rowFrac  = rowVal / total
  const rowDepth = horizontal ? w * rowFrac : h * rowFrac
  const rowLen   = horizontal ? h           : w

  const tiles: TileRect[] = []
  let offset = 0
  for (const item of row) {
    const tileLen = (item.mktCapB / rowVal) * rowLen
    tiles.push(
      horizontal
        ? { x, y: y + offset, w: rowDepth, h: tileLen, stock: item }
        : { x: x + offset, y, w: tileLen, h: rowDepth, stock: item }
    )
    offset += tileLen
  }

  // Recurse on remaining items in the leftover rectangle
  const rest = items.slice(row.length)
  if (rest.length > 0) {
    tiles.push(
      ...squarify(
        rest,
        horizontal ? x + rowDepth : x,
        horizontal ? y            : y + rowDepth,
        horizontal ? w - rowDepth : w,
        horizontal ? h            : h - rowDepth,
      )
    )
  }

  return tiles
}

// ── Sector colours (subtle border tint) ──────────────────────────────────────
const SECTOR_COLOR: Record<string, string> = {
  'Technology':             '#1a3a5a',
  'Communication Services': '#1a2a4a',
  'Consumer Discretionary': '#3a2a0a',
  'Consumer Staples':       '#2a3a1a',
  'Healthcare':             '#1a3a3a',
  'Financials':             '#3a1a3a',
  'Industrials':            '#3a2a1a',
  'Energy':                 '#2a1a0a',
  'Materials':              '#1a2a1a',
  'Real Estate':            '#2a1a2a',
  'Utilities':              '#1a2a2a',
}

// ── Tooltip ───────────────────────────────────────────────────────────────────
interface TooltipData {
  stock: MmapStock
  x: number
  y: number
}

// ── Main component ────────────────────────────────────────────────────────────
type IndexKey = 'S&P 500' | 'ASX 200' | 'NDX 100'
const INDICES: IndexKey[] = ['S&P 500', 'ASX 200', 'NDX 100']

// Sector layout: group stocks by sector, run squarify per sector,
// then lay out sectors as their own treemap
function buildLayout(stocks: MmapStock[], W: number, H: number): TileRect[] {
  if (stocks.length === 0) return []

  // Group by sector
  const sectorMap = new Map<string, MmapStock[]>()
  for (const s of stocks) {
    if (!sectorMap.has(s.sector)) sectorMap.set(s.sector, [])
    sectorMap.get(s.sector)!.push(s)
  }

  // Build a pseudo-stock per sector (value = sum of mktCapB) for outer treemap
  const sectorItems = Array.from(sectorMap.entries()).map(([sector, items]) => ({
    symbol: sector,
    name: sector,
    sector,
    mktCapB: items.reduce((s, i) => s + i.mktCapB, 0),
    price: null, change: null, changePct: null,
  })).sort((a, b) => b.mktCapB - a.mktCapB)

  const sectorRects = squarify(sectorItems, 0, 0, W, H)

  // For each sector rect, run squarify on its constituent stocks
  const allTiles: TileRect[] = []
  const PAD = 18  // space for sector label at top

  for (const sr of sectorRects) {
    const items = sectorMap.get(sr.stock.sector) ?? []
    const sorted = [...items].sort((a, b) => b.mktCapB - a.mktCapB)
    const innerY = sr.y + PAD
    const innerH = sr.h - PAD
    if (innerH <= 0) continue
    const tiles = squarify(sorted, sr.x + 1, innerY + 1, sr.w - 2, innerH - 2)
    allTiles.push(...tiles)
  }

  return allTiles
}

function buildSectorRects(stocks: MmapStock[], W: number, H: number) {
  if (stocks.length === 0) return []
  const sectorMap = new Map<string, MmapStock[]>()
  for (const s of stocks) {
    if (!sectorMap.has(s.sector)) sectorMap.set(s.sector, [])
    sectorMap.get(s.sector)!.push(s)
  }
  const sectorItems = Array.from(sectorMap.entries()).map(([sector, items]) => ({
    symbol: sector,
    name: sector,
    sector,
    mktCapB: items.reduce((s, i) => s + i.mktCapB, 0),
    price: null, change: null, changePct: null,
  })).sort((a, b) => b.mktCapB - a.mktCapB)
  return squarify(sectorItems, 0, 0, W, H)
}

export function MMAP() {
  const [activeIndex, setActiveIndex] = useState<IndexKey>('S&P 500')
  const [tooltip, setTooltip] = useState<TooltipData | null>(null)
  const { openTab } = useTerminalStore()
  const containerRef = useRef<HTMLDivElement>(null)
  const [dims, setDims] = useState({ w: 900, h: 500 })

  // Measure container
  useEffect(() => {
    if (!containerRef.current) return
    const obs = new ResizeObserver(entries => {
      const e = entries[0]
      if (e) setDims({ w: e.contentRect.width, h: e.contentRect.height })
    })
    obs.observe(containerRef.current)
    return () => obs.disconnect()
  }, [])

  const { data, isLoading, isError, dataUpdatedAt } = useQuery<{ stocks: MmapStock[] }>({
    queryKey: ['mmap', activeIndex],
    queryFn: () => fetch(`/api/mmap?index=${encodeURIComponent(activeIndex)}`).then(r => r.json()),
    staleTime: 4 * 60_000,
    refetchInterval: 5 * 60_000,
  })

  const stocks = data?.stocks ?? []

  const { W, H } = { W: dims.w, H: dims.h }
  const tiles       = buildLayout(stocks, W, H)
  const sectorRects = buildSectorRects(stocks, W, H)

  // Summary bar
  const withData  = stocks.filter(s => s.changePct != null)
  const advancing = withData.filter(s => (s.changePct ?? 0) > 0).length
  const declining = withData.filter(s => (s.changePct ?? 0) < 0).length
  const avgChange = withData.length > 0
    ? withData.reduce((s, st) => s + (st.changePct ?? 0), 0) / withData.length
    : null

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGElement>) => {
    if (!tooltip) return
    setTooltip(t => t ? { ...t, x: e.clientX, y: e.clientY } : null)
  }, [tooltip])

  const updatedStr = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })
    : ''

  return (
    <div className="panel" style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* Header */}
      <div className="panel-header" style={{ justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="panel-mnemonic">MMAP</span>
          <span style={{ color: '#444', fontSize: 10 }}>MARKET MAP</span>
          {/* Index selector */}
          <div style={{ display: 'flex', gap: 2, marginLeft: 8 }}>
            {INDICES.map(idx => (
              <button key={idx} onClick={() => setActiveIndex(idx)} style={{
                background: activeIndex === idx ? '#1a0a00' : 'none',
                border: `1px solid ${activeIndex === idx ? '#ffa028' : '#222'}`,
                color:  activeIndex === idx ? '#ffa028' : '#555',
                fontFamily: 'inherit', fontSize: 9, padding: '1px 8px',
                cursor: 'pointer', letterSpacing: '0.05em',
              }}>{idx}</button>
            ))}
          </div>
        </div>

        {/* Summary */}
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          {avgChange != null && (
            <span style={{ color: avgChange >= 0 ? '#33ff66' : '#ff3b3b', fontSize: 10, fontWeight: 'bold' }}>
              {avgChange >= 0 ? '+' : ''}{avgChange.toFixed(2)}% avg
            </span>
          )}
          <span style={{ color: '#33ff66', fontSize: 10 }}>▲ {advancing}</span>
          <span style={{ color: '#ff3b3b', fontSize: 10 }}>▼ {declining}</span>
          {updatedStr && <span style={{ color: '#2a2a2a', fontSize: 9 }}>as of {updatedStr}</span>}
        </div>
      </div>

      {/* Map area */}
      <div ref={containerRef} style={{ flex: 1, overflow: 'hidden', position: 'relative', background: '#050505' }}>
        {isLoading && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ color: '#333', fontSize: 11, letterSpacing: '0.1em' }}>
              LOADING {activeIndex} DATA…
            </div>
          </div>
        )}
        {isError && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ color: '#ff3b3b', fontSize: 11 }}>Failed to load market data</div>
          </div>
        )}

        {!isLoading && stocks.length > 0 && W > 0 && H > 0 && (
          <svg
            width={W} height={H}
            style={{ display: 'block', cursor: 'crosshair' }}
            onMouseMove={handleMouseMove}
            onMouseLeave={() => setTooltip(null)}
          >
            {/* Sector backgrounds + labels */}
            {sectorRects.map(sr => (
              <g key={sr.stock.sector}>
                <rect
                  x={sr.x} y={sr.y} width={sr.w} height={sr.h}
                  fill={SECTOR_COLOR[sr.stock.sector] ?? '#111'}
                  stroke="#000" strokeWidth={2}
                />
                {/* Sector label */}
                {sr.w > 60 && (
                  <text
                    x={sr.x + 5} y={sr.y + 13}
                    fill="#999" fontSize={10}
                    fontFamily="monospace"
                    style={{ pointerEvents: 'none', userSelect: 'none', letterSpacing: '0.06em' }}
                  >
                    {sr.stock.sector.toUpperCase()}
                  </text>
                )}
              </g>
            ))}

            {/* Stock tiles */}
            {tiles.map(tile => {
              const { x, y, w, h, stock } = tile
              if (w < 2 || h < 2) return null
              const bg     = changeColor(stock.changePct)
              const tc     = textColor(stock.changePct)
              const pctStr = stock.changePct != null
                ? `${stock.changePct >= 0 ? '+' : ''}${stock.changePct.toFixed(2)}%`
                : ''
              const showTicker = w >= 28 && h >= 14
              const showPct    = w >= 36 && h >= 26
              const showName   = w >= 60 && h >= 40
              const showPrice  = w >= 60 && h >= 54

              return (
                <g key={stock.symbol}
                  onClick={() => openTab(stock.symbol, 'GIP')}
                  onMouseEnter={e => setTooltip({ stock, x: e.clientX, y: e.clientY })}
                  onMouseLeave={() => setTooltip(null)}
                  style={{ cursor: 'pointer' }}
                >
                  <rect
                    x={x + 0.5} y={y + 0.5}
                    width={Math.max(0, w - 1)} height={Math.max(0, h - 1)}
                    fill={bg} stroke="#000" strokeWidth={0.5}
                  />
                  {/* Hover highlight overlay */}
                  <rect
                    x={x + 0.5} y={y + 0.5}
                    width={Math.max(0, w - 1)} height={Math.max(0, h - 1)}
                    fill="transparent"
                    stroke="transparent"
                    className="tile-hover"
                    style={{ transition: 'fill 0.1s' }}
                  />

                  {showTicker && (
                    <text
                      x={x + w / 2} y={y + (showPct ? h / 2 - (showName ? 12 : 4) : h / 2 + 4)}
                      textAnchor="middle"
                      fill={tc}
                      fontSize={Math.min(13, Math.max(8, w / 5))}
                      fontFamily="monospace"
                      fontWeight="bold"
                      style={{ pointerEvents: 'none', userSelect: 'none' }}
                    >
                      {stock.symbol.replace('.AX', '')}
                    </text>
                  )}

                  {showPct && (
                    <text
                      x={x + w / 2}
                      y={y + (showName ? h / 2 + 8 : h / 2 + 14)}
                      textAnchor="middle"
                      fill={tc}
                      fontSize={Math.min(11, Math.max(7, w / 6))}
                      fontFamily="monospace"
                      style={{ pointerEvents: 'none', userSelect: 'none' }}
                    >
                      {pctStr}
                    </text>
                  )}

                  {showName && (
                    <text
                      x={x + w / 2} y={y + h / 2 + 22}
                      textAnchor="middle"
                      fill="#666"
                      fontSize={Math.min(9, Math.max(7, w / 8))}
                      fontFamily="monospace"
                      style={{ pointerEvents: 'none', userSelect: 'none' }}
                    >
                      {stock.name.length > Math.floor(w / 6) ? stock.name.slice(0, Math.floor(w / 6)) + '…' : stock.name}
                    </text>
                  )}

                  {showPrice && stock.price != null && (
                    <text
                      x={x + w / 2} y={y + h / 2 + 34}
                      textAnchor="middle"
                      fill="#555"
                      fontSize={Math.min(9, Math.max(7, w / 8))}
                      fontFamily="monospace"
                      style={{ pointerEvents: 'none', userSelect: 'none' }}
                    >
                      {stock.price < 1
                        ? stock.price.toFixed(3)
                        : stock.price < 100
                        ? stock.price.toFixed(2)
                        : stock.price.toFixed(1)}
                    </text>
                  )}
                </g>
              )
            })}
          </svg>
        )}

        {/* Floating tooltip */}
        {tooltip && (
          <div style={{
            position: 'fixed',
            left: tooltip.x + 14,
            top:  tooltip.y - 10,
            background: '#0d0d0d',
            border: '1px solid #2a2a2a',
            padding: '6px 10px',
            pointerEvents: 'none',
            zIndex: 9999,
            minWidth: 140,
          }}>
            <div style={{ color: '#ffa028', fontSize: 11, fontWeight: 'bold', fontFamily: 'monospace' }}>
              {tooltip.stock.symbol}
            </div>
            <div style={{ color: '#aaa', fontSize: 10, marginTop: 2 }}>{tooltip.stock.name}</div>
            <div style={{ color: '#555', fontSize: 9, marginTop: 1 }}>{tooltip.stock.sector}</div>
            <div style={{ marginTop: 5, display: 'flex', gap: 12 }}>
              {tooltip.stock.price != null && (
                <span style={{ color: '#e8e8e8', fontSize: 11, fontFamily: 'monospace' }}>
                  {tooltip.stock.price.toFixed(2)}
                </span>
              )}
              {tooltip.stock.changePct != null && (
                <span style={{
                  fontSize: 11,
                  fontFamily: 'monospace',
                  color: tooltip.stock.changePct >= 0 ? '#33ff66' : '#ff3b3b',
                  fontWeight: 'bold',
                }}>
                  {tooltip.stock.changePct >= 0 ? '+' : ''}{tooltip.stock.changePct.toFixed(2)}%
                </span>
              )}
            </div>
            <div style={{ color: '#333', fontSize: 8, marginTop: 4 }}>Click to open GIP</div>
          </div>
        )}
      </div>

      {/* Colour legend */}
      <div style={{
        flexShrink: 0, borderTop: '1px solid #0d0d0d',
        padding: '4px 12px', background: '#020202',
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <span style={{ color: '#222', fontSize: 8, letterSpacing: '0.06em' }}>DAY CHANGE:</span>
        {([-5,-3,-1,0,1,3,5] as number[]).map(v => (
          <div key={v} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            <div style={{ width: 10, height: 10, background: changeColor(v), border: '1px solid #111' }} />
            <span style={{ color: '#333', fontSize: 8 }}>{v > 0 ? '+' : ''}{v}%</span>
          </div>
        ))}
        <span style={{ color: '#1a1a1a', fontSize: 8, marginLeft: 4 }}>· Tile size = market cap · Click tile → GIP</span>
      </div>
    </div>
  )
}
