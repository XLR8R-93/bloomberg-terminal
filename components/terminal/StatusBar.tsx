'use client'
import { useEffect, useState } from 'react'

interface MarketStatus {
  label: string
  open: boolean
  session: string  // e.g. "09:30–16:00 ET" or "10:00–16:00 AEST"
}

function getMarketStatuses(): MarketStatus[] {
  const now = new Date()

  // ── S&P 500 / NYSE (New York) ────────────────────────────────────────────
  const ny   = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }))
  const nyDay  = ny.getDay()
  const nyMins = ny.getHours() * 60 + ny.getMinutes()
  const spOpen = nyDay >= 1 && nyDay <= 5 && nyMins >= 570 && nyMins < 960

  // ── ASX (Sydney) ──────────────────────────────────────────────────────────
  const sy   = new Date(now.toLocaleString('en-US', { timeZone: 'Australia/Sydney' }))
  const syDay  = sy.getDay()
  const syMins = sy.getHours() * 60 + sy.getMinutes()
  const asxOpen = syDay >= 1 && syDay <= 5 && syMins >= 600 && syMins < 960  // 10:00–16:00 AEST

  return [
    { label: 'S&P', open: spOpen,  session: '09:30–16:00 ET'   },
    { label: 'ASX', open: asxOpen, session: '10:00–16:00 AEST' },
  ]
}

export function StatusBar() {
  const [time, setTime]       = useState('')
  const [statuses, setStatuses] = useState<MarketStatus[]>([])

  useEffect(() => {
    const tick = () => {
      const now = new Date()
      setTime(now.toLocaleTimeString('en-AU', { timeZone: 'Australia/Sydney', hour12: false }) + ' AEST')
      setStatuses(getMarketStatuses())
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <div style={{
      height: 20,
      background: '#050505',
      borderTop: '1px solid #1f1f1f',
      display: 'flex',
      alignItems: 'center',
      padding: '0 8px',
      gap: 16,
      fontSize: 10,
      color: '#e8e8e8',
      flexShrink: 0,
    }}>
      <span style={{ color: '#ffa028' }}>{time}</span>

      {statuses.map(s => (
        <span key={s.label} title={s.session}>
          <span style={{ color: '#e8e8e8' }}>{s.label}: </span>
          <span style={{ color: s.open ? '#33ff66' : '#ff3b3b', fontWeight: 'bold' }}>
            {s.open ? '● OPEN' : '○ CLOSED'}
          </span>
        </span>
      ))}

      <span style={{ flex: 1 }} />
      <span style={{ color: '#e8e8e8' }}>BLOOMBERG TERMINAL v1.0 — OAKWOOD CAPITAL</span>
    </div>
  )
}
