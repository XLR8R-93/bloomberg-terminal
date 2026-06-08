'use client'
import { useEffect, useRef, useState, useCallback } from 'react'
import { useTerminalStore, type PriceAlert } from '@/lib/store'

const POLL_MS = 30_000  // check every 30 seconds

interface Toast {
  id: string
  alert: PriceAlert
  price: number
  triggered: 'TARGET' | 'STOP'
}

// ── In-app toast strip ─────────────────────────────────────────────────────────
function AlertToast({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const isTarget = toast.triggered === 'TARGET'
  const color    = isTarget ? '#33ff66' : '#ff3b3b'

  // Auto-dismiss after 8 seconds
  useEffect(() => {
    const t = setTimeout(onDismiss, 8000)
    return () => clearTimeout(t)
  }, [onDismiss])

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '6px 14px',
      background: isTarget ? '#071a07' : '#1a0707',
      borderBottom: `1px solid ${color}44`,
      animation: 'fadeInDown 0.2s ease',
    }}>
      <span style={{ color, fontSize: 10, fontWeight: 'bold', letterSpacing: '0.06em' }}>
        {isTarget ? '▲ TARGET HIT' : '▼ STOP HIT'}
      </span>
      <span style={{ color: '#e8e8e8', fontSize: 11, fontWeight: 'bold' }}>
        {toast.alert.ticker}
      </span>
      <span style={{ color: '#c0c0c0', fontSize: 10 }}>
        {isTarget ? 'reached' : 'crossed below'} target{' '}
        <span style={{ color }}>${toast.alert.price.toFixed(2)}</span>
        {' '}· last {' '}
        <span style={{ color: '#e8e8e8' }}>${toast.price.toFixed(2)}</span>
      </span>
      {toast.alert.note && (
        <span style={{ color: '#555', fontSize: 9 }}>· {toast.alert.note}</span>
      )}
      <span style={{ flex: 1 }} />
      <button
        onClick={onDismiss}
        style={{
          background: 'none', border: 'none', color: '#444',
          cursor: 'pointer', fontSize: 10, padding: '0 4px',
          fontFamily: 'inherit',
        }}
      >✕</button>
    </div>
  )
}

// ── Monitor (mounts silently in TerminalApp) ──────────────────────────────────
export function AlertMonitor() {
  const { alerts, removeAlert } = useTerminalStore()
  const [toasts, setToasts] = useState<Toast[]>([])
  const [permStatus, setPermStatus] = useState<NotificationPermission>('default')
  const [showPermBanner, setShowPermBanner] = useState(false)
  const firedRef = useRef<Set<string>>(new Set())  // prevent duplicate fires

  // Check notification permission on mount
  useEffect(() => {
    if (typeof Notification === 'undefined') return
    setPermStatus(Notification.permission)
    // Show permission banner if alerts exist and permission not yet granted
    if (alerts.length > 0 && Notification.permission === 'default') {
      setShowPermBanner(true)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Show banner when first alert is added and permission not yet granted
  useEffect(() => {
    if (alerts.length > 0 && permStatus === 'default') {
      setShowPermBanner(true)
    }
  }, [alerts.length, permStatus])

  const requestPermission = useCallback(async () => {
    if (typeof Notification === 'undefined') return
    const result = await Notification.requestPermission()
    setPermStatus(result)
    setShowPermBanner(false)
  }, [])

  const dismissToast = useCallback((id: string) => {
    setToasts(ts => ts.filter(t => t.id !== id))
  }, [])

  // ── Price polling ────────────────────────────────────────────────────────────
  const checkAlerts = useCallback(async () => {
    if (!alerts.length) return
    const tickers = [...new Set(alerts.map(a => a.ticker))]
    try {
      const res    = await fetch(`/api/quotes?symbols=${encodeURIComponent(tickers.join(','))}`)
      const quotes = await res.json() as Record<string, { c: number }>

      for (const alert of alerts) {
        const price = quotes[alert.ticker]?.c
        if (price == null) continue

        const fireKey  = `${alert.id}:${alert.type}`
        if (firedRef.current.has(fireKey)) continue

        const triggered =
          alert.type === 'TARGET' && price >= alert.price ? 'TARGET' :
          alert.type === 'STOP'   && price <= alert.price ? 'STOP'   :
          null

        if (!triggered) continue

        firedRef.current.add(fireKey)

        // In-app toast
        const toast: Toast = { id: `${alert.id}-${Date.now()}`, alert, price, triggered }
        setToasts(ts => [toast, ...ts].slice(0, 5))  // max 5 toasts

        // Browser notification
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          new Notification(
            `${triggered === 'TARGET' ? '▲ Target Hit' : '▼ Stop Hit'} · ${alert.ticker}`,
            {
              body: `${alert.ticker} ${triggered === 'TARGET' ? 'reached' : 'dropped to'} $${price.toFixed(2)} (alert: $${alert.price.toFixed(2)})${alert.note ? '\n' + alert.note : ''}`,
              tag: alert.id,
              icon: '/favicon.ico',
            }
          )
        }

        // Remove the triggered alert
        removeAlert(alert.id)
      }
    } catch { /* silently ignore fetch errors in background monitor */ }
  }, [alerts, removeAlert])

  // Poll on mount + interval
  useEffect(() => {
    checkAlerts()
    const id = setInterval(checkAlerts, POLL_MS)
    return () => clearInterval(id)
  }, [checkAlerts])

  if (toasts.length === 0 && !showPermBanner) return null

  return (
    <div style={{ flexShrink: 0 }}>
      {/* Notification permission banner */}
      {showPermBanner && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '5px 14px',
          background: '#0d0d00', borderBottom: '1px solid #ffa02844',
        }}>
          <span style={{ color: '#ffa028', fontSize: 9 }}>🔔</span>
          <span style={{ color: '#b0b0b0', fontSize: 10 }}>
            Enable browser notifications to receive price alerts even when the terminal is in the background
          </span>
          <button
            onClick={requestPermission}
            style={{
              background: '#1a1200', border: '1px solid #ffa028', color: '#ffa028',
              fontFamily: 'inherit', fontSize: 9, padding: '2px 10px', cursor: 'pointer',
              letterSpacing: '0.06em',
            }}
          >
            ENABLE
          </button>
          <button
            onClick={() => setShowPermBanner(false)}
            style={{
              background: 'none', border: 'none', color: '#444',
              cursor: 'pointer', fontFamily: 'inherit', fontSize: 10,
            }}
          >✕</button>
        </div>
      )}

      {/* Active toasts */}
      {toasts.map(t => (
        <AlertToast key={t.id} toast={t} onDismiss={() => dismissToast(t.id)} />
      ))}
    </div>
  )
}
