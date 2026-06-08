'use client'
import { useEffect, useState } from 'react'

const VIDEO_ID = 'iEpJwprxDdk'

function Clock() {
  const [time, setTime] = useState('')
  useEffect(() => {
    const tick = () => {
      const now = new Date()
      const ny = now.toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
      const lon = now.toLocaleTimeString('en-US', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', hour12: false })
      const tok = now.toLocaleTimeString('en-US', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit', hour12: false })
      setTime(`NEW YORK ${ny}   LONDON ${lon}   TOKYO ${tok}`)
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])
  return <span style={{ color: '#d8d8d8', fontSize: 10, fontVariantNumeric: 'tabular-nums' }}>{time}</span>
}

export function TV() {
  return (
    <div className="panel" style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div className="panel-header" style={{ justifyContent: 'space-between' }}>
        <span className="panel-mnemonic">TV — BLOOMBERG TELEVISION LIVE</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Clock />
          <button
            onClick={() => window.open(`https://www.youtube.com/watch?v=${VIDEO_ID}`, 'bloomberg-tv', 'width=1280,height=720,menubar=no,toolbar=no,location=no')}
            style={{
              background: 'none', border: '1px solid #2a2a2a', color: '#d8d8d8',
              fontFamily: 'inherit', fontSize: 9, padding: '2px 7px',
              cursor: 'pointer', letterSpacing: '0.06em',
            }}
          >
            ↗ POP OUT
          </button>
        </div>
      </div>
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <iframe
          src={`https://www.youtube.com/embed/${VIDEO_ID}?autoplay=1&mute=0`}
          style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
    </div>
  )
}
