'use client'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { MacroSeries } from '@/app/api/macro/route'

// ── Sparkline ─────────────────────────────────────────────────────────────────
function Sparkline({ series, color }: { series: { value: number }[]; color: string }) {
  if (series.length < 2) return <div style={{ width: 64, height: 24 }} />
  const vals = series.map(p => p.value)
  const min  = Math.min(...vals)
  const max  = Math.max(...vals)
  const range = max - min || 1
  const W = 64, H = 24, pad = 2
  const pts = vals.map((v, i) => {
    const x = pad + (i / (vals.length - 1)) * (W - pad * 2)
    const y = H - pad - ((v - min) / range) * (H - pad * 2)
    return `${x},${y}`
  }).join(' ')
  return (
    <svg width={W} height={H} style={{ display: 'block' }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.2} opacity={0.8} />
      {/* Last point dot */}
      {(() => {
        const last = pts.split(' ').pop()!.split(',')
        return <circle cx={last[0]} cy={last[1]} r={1.5} fill={color} />
      })()}
    </svg>
  )
}

// ── Indicator card ────────────────────────────────────────────────────────────
function MacroCard({ ind, selected, onClick }: {
  ind: MacroSeries; selected: boolean; onClick: () => void
}) {
  const change = ind.latest != null && ind.previous != null ? ind.latest - ind.previous : null
  const isGood = change == null ? null
    : ind.higherIsBetter === true  ? change >= 0
    : ind.higherIsBetter === false ? change <= 0
    : null

  const changeColor = isGood === true ? '#33ff66' : isGood === false ? '#ff3b3b' : '#ffa028'
  const valColor    = selected ? '#ffa028' : '#e8e8e8'

  const fmtVal = (v: number | null) => {
    if (v == null) return '—'
    const abs = Math.abs(v)
    const s   = abs >= 1000 ? v.toFixed(0) : abs >= 100 ? v.toFixed(1) : v.toFixed(2)
    return ind.unit === '%' ? `${s}%` : ind.unit ? `${s}${ind.unit}` : s
  }

  return (
    <div
      onClick={onClick}
      style={{
        background: selected ? '#0a150a' : '#080808',
        border: `1px solid ${selected ? '#ffa02866' : '#151515'}`,
        padding: '10px 12px',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        transition: 'border-color 0.1s',
      }}
    >
      {/* Category + label */}
      <div style={{ color: '#444', fontSize: 8, letterSpacing: '0.08em' }}>{ind.category}</div>
      <div style={{ color: '#b0b0b0', fontSize: 9, letterSpacing: '0.04em', lineHeight: 1.2 }}>{ind.label}</div>

      {/* Main value */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 2 }}>
        <span style={{ color: valColor, fontSize: 18, fontWeight: 'bold', letterSpacing: '-0.02em' }}>
          {fmtVal(ind.latest)}
        </span>
        {change != null && (
          <span style={{ color: changeColor, fontSize: 10 }}>
            {change >= 0 ? '+' : ''}{fmtVal(change)}
          </span>
        )}
      </div>

      {/* Prev + date */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ color: '#333', fontSize: 8 }}>
          {ind.previous != null ? `prev ${fmtVal(ind.previous)}` : ''}
          {ind.estimate != null && ind.latest == null
            ? ` est ${fmtVal(ind.estimate)}` : ''}
        </span>
        <span style={{ color: '#2a2a2a', fontSize: 8 }}>
          {ind.latestDate ? ind.latestDate.slice(0, 7) : ''}
        </span>
      </div>

      {/* Sparkline */}
      <Sparkline series={ind.series} color={
        ind.series.length < 2 ? '#333' :
        isGood === true  ? '#1a8a3a' :
        isGood === false ? '#8a1a1a' : '#555'
      } />
    </div>
  )
}

// ── Detail panel ──────────────────────────────────────────────────────────────
function MacroDetail({ ind }: { ind: MacroSeries }) {
  const fmtVal = (v: number | null) => {
    if (v == null) return '—'
    const s = Math.abs(v) >= 1000 ? v.toFixed(0) : Math.abs(v) >= 100 ? v.toFixed(1) : v.toFixed(2)
    return ind.unit === '%' ? `${s}%` : ind.unit ? `${s}${ind.unit}` : s
  }

  const histSorted = [...ind.series].reverse()  // most recent first

  return (
    <div style={{ padding: '12px 16px', borderLeft: '1px solid #111', height: '100%', overflow: 'auto' }}>
      <div style={{ color: '#555', fontSize: 8, letterSpacing: '0.08em', marginBottom: 4 }}>{ind.category}</div>
      <div style={{ color: '#e8e8e8', fontSize: 13, fontWeight: 'bold', marginBottom: 2 }}>{ind.label}</div>
      <div style={{ color: '#444', fontSize: 9, marginBottom: 16 }}>{ind.description}</div>

      {/* Current value large */}
      <div style={{ color: '#ffa028', fontSize: 28, fontWeight: 'bold', marginBottom: 4 }}>
        {fmtVal(ind.latest)}
      </div>
      {ind.estimate != null && ind.latest == null && (
        <div style={{ color: '#555', fontSize: 10, marginBottom: 8 }}>
          Est: {fmtVal(ind.estimate)}
        </div>
      )}

      {/* History table */}
      <div style={{ marginTop: 16 }}>
        <div style={{ color: '#333', fontSize: 9, letterSpacing: '0.06em', marginBottom: 6 }}>
          HISTORY
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {['DATE','ACTUAL','PREV','CHANGE'].map(h => (
                <th key={h} style={{ color: '#333', fontSize: 8, textAlign: h === 'DATE' ? 'left' : 'right',
                  padding: '2px 6px', fontWeight: 'normal', letterSpacing: '0.06em', borderBottom: '1px solid #111' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {histSorted.map((pt, i) => {
              const prev  = histSorted[i + 1]?.value ?? null
              const delta = prev != null ? pt.value - prev : null
              const dColor = delta == null ? '#555'
                : ind.higherIsBetter === true  ? (delta >= 0 ? '#33ff66' : '#ff3b3b')
                : ind.higherIsBetter === false ? (delta <= 0 ? '#33ff66' : '#ff3b3b')
                : '#aaa'
              return (
                <tr key={pt.date} style={{ borderBottom: '1px solid #0a0a0a' }}>
                  <td style={{ color: '#555', fontSize: 9, padding: '3px 6px' }}>{pt.date.slice(0, 7)}</td>
                  <td style={{ color: '#e8e8e8', fontSize: 9, padding: '3px 6px', textAlign: 'right' }}>{fmtVal(pt.value)}</td>
                  <td style={{ color: '#444', fontSize: 9, padding: '3px 6px', textAlign: 'right' }}>{prev != null ? fmtVal(prev) : '—'}</td>
                  <td style={{ color: dColor, fontSize: 9, padding: '3px 6px', textAlign: 'right' }}>
                    {delta != null ? `${delta >= 0 ? '+' : ''}${fmtVal(delta)}` : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Main panel ────────────────────────────────────────────────────────────────
const CATEGORIES = ['ALL', 'MONETARY', 'INFLATION', 'EMPLOYMENT', 'GROWTH', 'CONSUMER', 'BUSINESS', 'HOUSING']

export function MACRO() {
  const [catFilter,    setCatFilter]    = useState('ALL')
  const [countryFilter, setCountryFilter] = useState<'ALL' | 'US' | 'AU'>('ALL')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const { data = [], isLoading, error } = useQuery<MacroSeries[]>({
    queryKey: ['macro'],
    queryFn:  () => fetch('/api/macro').then(r => r.json()),
    staleTime: 55 * 60_000,
    refetchInterval: 60 * 60_000,
  })

  const indicators = Array.isArray(data) ? data : []
  const filtered   = indicators.filter(i =>
    (catFilter === 'ALL' || i.category === catFilter) &&
    (countryFilter === 'ALL' || i.countryCode === countryFilter)
  )
  const selected   = selectedId ? indicators.find(i => i.id === selectedId) ?? null : null

  return (
    <div className="panel" style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* Header */}
      <div className="panel-header" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="panel-mnemonic">MACRO</span>
          <span style={{ color: '#444', fontSize: 10 }}>MACROECONOMIC DASHBOARD</span>
          {/* Country toggle */}
          <div style={{ display: 'flex', gap: 2, marginLeft: 8 }}>
            {(['ALL', 'US', 'AU'] as const).map(c => (
              <button key={c} onClick={() => setCountryFilter(c)} style={{
                background: countryFilter === c ? '#1a0a00' : 'none',
                border: `1px solid ${countryFilter === c ? '#ffa028' : '#222'}`,
                color: countryFilter === c ? '#ffa028' : '#555',
                fontFamily: 'inherit', fontSize: 8, padding: '1px 6px', cursor: 'pointer',
                letterSpacing: '0.05em',
              }}>{c}</button>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {CATEGORIES.map(c => (
            <button key={c} onClick={() => setCatFilter(c)} style={{
              background: catFilter === c ? '#0a1a0a' : 'none',
              border: `1px solid ${catFilter === c ? '#ffa028' : '#222'}`,
              color: catFilter === c ? '#ffa028' : '#444',
              fontFamily: 'inherit', fontSize: 8, padding: '1px 7px', cursor: 'pointer',
              letterSpacing: '0.05em',
            }}>{c}</button>
          ))}
        </div>
      </div>

      {isLoading && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#444' }}>
          Loading macro indicators…
        </div>
      )}
      {!isLoading && error && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ff3b3b', fontSize: 11 }}>
          {String(error)}
        </div>
      )}

      {!isLoading && !error && (
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>

          {/* Card grid */}
          <div style={{
            flex: selected ? '0 0 65%' : 1,
            overflowY: 'auto',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
            gap: 1,
            background: '#0d0d0d',
            alignContent: 'start',
          }}>
            {filtered.map(ind => (
              <MacroCard
                key={ind.id}
                ind={ind}
                selected={ind.id === selectedId}
                onClick={() => setSelectedId(prev => prev === ind.id ? null : ind.id)}
              />
            ))}
            {filtered.length === 0 && (
              <div style={{ padding: 20, color: '#333', fontSize: 11, gridColumn: '1/-1' }}>
                No data available for this category yet
              </div>
            )}
          </div>

          {/* Detail panel */}
          {selected && (
            <div style={{ flex: '0 0 35%', overflow: 'auto' }}>
              <MacroDetail ind={selected} />
            </div>
          )}
        </div>
      )}

      <div style={{ flexShrink: 0, borderTop: '1px solid #0d0d0d', padding: '3px 10px', background: '#020202' }}>
        <span style={{ color: '#222', fontSize: 8 }}>
          US &amp; AU indicators · Source: Finnhub · Click card to expand history · Data may lag official release
        </span>
      </div>
    </div>
  )
}
