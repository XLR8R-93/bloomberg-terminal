'use client'
import { useEffect, useState } from 'react'

function isMarketOpen(): boolean {
  const now = new Date()
  const ny = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }))
  const day = ny.getDay()
  const h = ny.getHours()
  const m = ny.getMinutes()
  const mins = h * 60 + m
  return day >= 1 && day <= 5 && mins >= 570 && mins < 960 // 9:30–16:00 ET
}

export function StatusBar() {
  const [time, setTime] = useState('')
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const tick = () => {
      const now = new Date()
      setTime(now.toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour12: false }) + ' ET')
      setOpen(isMarketOpen())
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
      <span>
        MKT:{' '}
        <span style={{ color: open ? '#33ff66' : '#ff3b3b' }}>
          {open ? 'OPEN' : 'CLOSED'}
        </span>
      </span>
      <span style={{ flex: 1 }} />
      <span>BLOOMBERG TERMINAL v1.0</span>
      <span>FINNHUB · TWELVE DATA · STOOQ · FMP · EDGAR</span>
    </div>
  )
}
