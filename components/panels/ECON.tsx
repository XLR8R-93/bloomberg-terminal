'use client'
import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { EconEvent } from '@/app/api/econ/route'

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtVal(n: number | null, unit: string) {
  if (n == null) return '—'
  const s = Math.abs(n) >= 100 ? n.toFixed(1) : Math.abs(n) >= 10 ? n.toFixed(2) : n.toFixed(3)
  const trimmed = s.replace(/\.?0+$/, '')
  return unit ? `${trimmed}${unit}` : trimmed
}

function fmtTime(timeStr: string) {
  if (!timeStr) return ''
  // timeStr: "YYYY-MM-DD HH:MM:SS"
  const d = new Date(timeStr.replace(' ', 'T') + 'Z')
  if (isNaN(d.getTime())) return ''
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/New_York' }) + ' ET'
}

function parseDateKey(timeStr: string) {
  return timeStr.slice(0, 10)  // "YYYY-MM-DD"
}

function formatDateHeader(dateKey: string) {
  const d = new Date(dateKey + 'T12:00:00Z')
  const today    = new Date().toISOString().slice(0, 10)
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)
  const prefix = dateKey === today ? 'TODAY · ' : dateKey === tomorrow ? 'TOMORROW · ' : ''
  return prefix + d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).toUpperCase()
}

function isToday(dateKey: string) {
  return dateKey === new Date().toISOString().slice(0, 10)
}

const IMPACT_COLOR: Record<string, string> = {
  high:   '#ff3b3b',
  medium: '#ffa028',
  low:    '#b0b0b0',
  '':     '#888',
}

const IMPACT_LABEL: Record<string, string> = {
  high:   '●●●',
  medium: '●●○',
  low:    '●○○',
  '':     '○○○',
}

const FLAG: Record<string, string> = {
  US: '🇺🇸', EU: '🇪🇺', GB: '🇬🇧', JP: '🇯🇵', CA: '🇨🇦', AU: '🇦🇺',
  CN: '🇨🇳', DE: '🇩🇪', FR: '🇫🇷', IT: '🇮🇹', CH: '🇨🇭', NZ: '🇳🇿',
  KR: '🇰🇷', IN: '🇮🇳', BR: '🇧🇷', MX: '🇲🇽', ZA: '🇿🇦', SG: '🇸🇬',
}

// ── Surprise bar ──────────────────────────────────────────────────────────────
function SurpriseBar({ actual, estimate }: { actual: number; estimate: number }) {
  const surprise = actual - estimate
  const pct = estimate !== 0 ? (surprise / Math.abs(estimate)) * 100 : 0
  const clamped = Math.max(-100, Math.min(100, pct))
  const beat = surprise >= 0
  const barW = Math.abs(clamped)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 80 }}>
      <div style={{ flex: 1, height: 4, background: '#111', position: 'relative', borderRadius: 2 }}>
        {beat ? (
          <div style={{ position: 'absolute', left: '50%', width: `${barW / 2}%`, height: '100%', background: '#33ff66', borderRadius: 2 }} />
        ) : (
          <div style={{ position: 'absolute', right: '50%', width: `${barW / 2}%`, height: '100%', background: '#ff3b3b', borderRadius: 2 }} />
        )}
        <div style={{ position: 'absolute', left: '50%', top: -1, width: 1, height: 6, background: '#888888' }} />
      </div>
      <span style={{ color: beat ? '#33ff66' : '#ff3b3b', fontSize: 9, minWidth: 36, textAlign: 'right' }}>
        {beat ? '+' : ''}{pct.toFixed(1)}%
      </span>
    </div>
  )
}

// ── Row ───────────────────────────────────────────────────────────────────────
function EventRow({ ev, dimPast }: { ev: EconEvent; dimPast: boolean }) {
  const impactClr = IMPACT_COLOR[ev.impact] ?? '#888'
  const hasResult = ev.actual != null
  const hasBoth   = hasResult && ev.estimate != null
  const beat      = hasBoth && ev.actual! >= ev.estimate!
  const cellBase  = { padding: '3px 8px', fontSize: 10, verticalAlign: 'middle' as const }

  return (
    <tr style={{ borderBottom: '1px solid #0a0a0a', opacity: dimPast ? 0.45 : 1 }}>
      {/* Time */}
      <td style={{ ...cellBase, color: '#aaaaaa', whiteSpace: 'nowrap', width: 60 }}>
        {fmtTime(ev.time)}
      </td>
      {/* Country flag */}
      <td style={{ ...cellBase, textAlign: 'center', width: 28, fontSize: 13 }}>
        {FLAG[ev.country] ?? <span style={{ color: '#888', fontSize: 9 }}>{ev.country}</span>}
      </td>
      {/* Impact */}
      <td style={{ ...cellBase, color: impactClr, fontSize: 9, letterSpacing: 1, width: 36 }}>
        {IMPACT_LABEL[ev.impact]}
      </td>
      {/* Event name */}
      <td style={{ ...cellBase, color: '#e8e8e8', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {ev.event}
      </td>
      {/* Actual */}
      <td style={{ ...cellBase, textAlign: 'right', fontVariantNumeric: 'tabular-nums', width: 72,
        color: hasResult ? (hasBoth ? (beat ? '#33ff66' : '#ff3b3b') : '#ccc') : '#888888' }}>
        {hasResult ? fmtVal(ev.actual, ev.unit) : <span style={{ color: '#222' }}>—</span>}
      </td>
      {/* Estimate */}
      <td style={{ ...cellBase, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#b0b0b0', width: 72 }}>
        {ev.estimate != null ? fmtVal(ev.estimate, ev.unit) : '—'}
      </td>
      {/* Previous */}
      <td style={{ ...cellBase, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#aaaaaa', width: 72 }}>
        {ev.prev != null ? fmtVal(ev.prev, ev.unit) : '—'}
      </td>
      {/* Surprise bar */}
      <td style={{ ...cellBase, width: 120 }}>
        {hasBoth && hasResult
          ? <SurpriseBar actual={ev.actual!} estimate={ev.estimate!} />
          : <span style={{ color: '#1a1a1a', fontSize: 9 }}>{ev.estimate != null ? 'est. pending' : ''}</span>}
      </td>
    </tr>
  )
}

// ── Main panel ────────────────────────────────────────────────────────────────
const COUNTRIES = ['All', 'US', 'EU', 'GB', 'JP', 'CA', 'AU', 'CN', 'DE']
const IMPACTS   = ['All', 'high', 'medium', 'low']

export function ECON() {
  const [country, setCountry] = useState('All')
  const [impact,  setImpact]  = useState('All')
  const [showPast, setShowPast] = useState(false)

  const { data: events = [], isLoading, error } = useQuery<EconEvent[]>({
    queryKey: ['econ-calendar'],
    queryFn:  () => fetch('/api/econ').then(r => r.json()),
    staleTime: 30 * 60_000,
    refetchInterval: 60 * 60_000,
  })

  const todayKey = new Date().toISOString().slice(0, 10)
  const nowUtc   = Date.now()

  const filtered = useMemo(() => {
    if (!Array.isArray(events)) return []
    return events.filter(ev => {
      if (country !== 'All' && ev.country !== country) return false
      if (impact  !== 'All' && ev.impact  !== impact)  return false
      if (!showPast) {
        const evDate = parseDateKey(ev.time)
        if (evDate < todayKey) return false
      }
      return true
    })
  }, [events, country, impact, showPast, todayKey])

  // Group by date
  const grouped = useMemo(() => {
    const map = new Map<string, EconEvent[]>()
    for (const ev of filtered) {
      const key = parseDateKey(ev.time)
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(ev)
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b))
  }, [filtered])

  // Summary counts
  const highCount = Array.isArray(events) ? events.filter(e => e.impact === 'high' && parseDateKey(e.time) >= todayKey).length : 0

  const selStyle = {
    background: '#050505', border: '1px solid #222', color: '#e8e8e8',
    fontFamily: 'inherit', fontSize: 10, padding: '2px 6px', cursor: 'pointer', outline: 'none',
  }

  return (
    <div className="panel" style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* Header */}
      <div className="panel-header" style={{ justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="panel-mnemonic">ECON</span>
          <span style={{ color: '#aaaaaa', fontSize: 10 }}>ECONOMIC CALENDAR</span>
          {highCount > 0 && (
            <span style={{ color: '#ff3b3b', fontSize: 9, border: '1px solid #ff3b3b44', padding: '1px 6px' }}>
              {highCount} HIGH IMPACT UPCOMING
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ color: '#aaaaaa', fontSize: 9 }}>COUNTRY:</span>
          <select value={country} onChange={e => setCountry(e.target.value)} style={selStyle}>
            {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <span style={{ color: '#aaaaaa', fontSize: 9 }}>IMPACT:</span>
          <select value={impact} onChange={e => setImpact(e.target.value)} style={selStyle}>
            {IMPACTS.map(i => <option key={i} value={i}>{i.toUpperCase()}</option>)}
          </select>
          <button onClick={() => setShowPast(p => !p)} style={{
            background: showPast ? '#1a0a0a' : 'none',
            border: '1px solid #222', color: showPast ? '#ffa028' : '#aaaaaa',
            fontFamily: 'inherit', fontSize: 9, padding: '2px 8px', cursor: 'pointer',
          }}>
            {showPast ? 'HIDE PAST' : 'SHOW PAST'}
          </button>
        </div>
      </div>

      {/* Loading */}
      {isLoading && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#aaaaaa' }}>
          Loading calendar…
        </div>
      )}

      {/* Error */}
      {!isLoading && error && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ff3b3b', fontSize: 11 }}>
          {String(error)}
        </div>
      )}

      {/* Calendar */}
      {!isLoading && !error && (
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {grouped.length === 0 && (
            <div style={{ padding: 20, color: '#888', textAlign: 'center', fontSize: 11 }}>
              No events match current filters
            </div>
          )}
          {grouped.map(([dateKey, dayEvents]) => {
            const today = isToday(dateKey)
            return (
              <div key={dateKey}>
                {/* Date header */}
                <div style={{
                  padding: '5px 10px',
                  background: today ? '#0d1a0d' : '#060606',
                  borderTop: '1px solid #111',
                  borderBottom: '1px solid #111',
                  display: 'flex', alignItems: 'center', gap: 10,
                  position: 'sticky', top: 0, zIndex: 1,
                }}>
                  <span style={{
                    color: today ? '#ffa028' : '#aaaaaa',
                    fontSize: 10, fontWeight: 'bold', letterSpacing: '0.08em',
                  }}>
                    {formatDateHeader(dateKey)}
                  </span>
                  <span style={{ color: '#222', fontSize: 9 }}>
                    {dayEvents.filter(e => e.impact === 'high').length > 0 &&
                      <span style={{ color: '#ff3b3b' }}>{dayEvents.filter(e => e.impact === 'high').length} HIGH</span>}
                    {'  '}
                    {dayEvents.length} events
                  </span>
                </div>

                {/* Column headers — only once per day group */}
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#030303' }}>
                      {[['TIME (ET)', 60], ['', 28], ['', 36], ['EVENT', null], ['ACTUAL', 72], ['EST.', 72], ['PREV.', 72], ['SURPRISE', 120]].map(([label, w], i) => (
                        <th key={i} style={{
                          color: '#888', fontSize: 9, padding: '2px 8px', textAlign: i >= 4 ? 'right' : 'left',
                          fontWeight: 'normal', letterSpacing: '0.06em', borderBottom: '1px solid #0d0d0d',
                          width: w ? w : undefined,
                        }}>
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {dayEvents
                      .sort((a, b) => a.time.localeCompare(b.time))
                      .map((ev, i) => {
                        // Dim events that already happened today
                        const evTs = new Date(ev.time.replace(' ', 'T') + 'Z').getTime()
                        const dimPast = today && ev.actual != null && evTs < nowUtc
                        return <EventRow key={i} ev={ev} dimPast={dimPast} />
                      })}
                  </tbody>
                </table>
              </div>
            )
          })}
        </div>
      )}

      {/* Footer legend */}
      <div style={{ flexShrink: 0, borderTop: '1px solid #0d0d0d', padding: '3px 10px', display: 'flex', gap: 16, background: '#020202' }}>
        {[
          ['●●●', '#ff3b3b', 'High Impact'],
          ['●●○', '#ffa028', 'Medium Impact'],
          ['●○○', '#555',    'Low Impact'],
        ].map(([sym, clr, label]) => (
          <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ color: clr, fontSize: 9, letterSpacing: 1 }}>{sym}</span>
            <span style={{ color: '#888', fontSize: 9 }}>{label}</span>
          </span>
        ))}
        <span style={{ color: '#222', fontSize: 9, marginLeft: 'auto' }}>All times Eastern · Source: Finnhub</span>
      </div>
    </div>
  )
}
