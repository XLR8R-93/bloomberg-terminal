'use client'
import { useEffect, useRef, useCallback, useState } from 'react'

export type TickDirection = 'up' | 'down' | null

export interface LiveTick {
  price: number
  volume: number
  timestamp: number
  direction: TickDirection
}

interface WsTradeData { s: string; p: number; t: number; v: number }

// Singleton WebSocket shared across hook instances
let globalWs: WebSocket | null = null
let globalToken: string | null = null
let subscribers = new Map<string, Set<(tick: WsTradeData) => void>>()
let currentSymbol: string | null = null
let reconnectTimer: ReturnType<typeof setTimeout> | null = null

async function getToken(): Promise<string> {
  if (globalToken) return globalToken
  const res = await fetch('/api/ws-token')
  const json = await res.json()
  if (!json.token) throw new Error('No WS token')
  globalToken = json.token
  return globalToken!
}

function subscribe(symbol: string, cb: (t: WsTradeData) => void) {
  if (!subscribers.has(symbol)) subscribers.set(symbol, new Set())
  subscribers.get(symbol)!.add(cb)
}

function unsubscribe(symbol: string, cb: (t: WsTradeData) => void) {
  subscribers.get(symbol)?.delete(cb)
  if (subscribers.get(symbol)?.size === 0) subscribers.delete(symbol)
}

function sendWs(msg: object) {
  if (globalWs?.readyState === WebSocket.OPEN) {
    globalWs.send(JSON.stringify(msg))
  }
}

function connectWebSocket(token: string, symbol: string) {
  if (globalWs && globalWs.readyState !== WebSocket.CLOSED) {
    // Already open — just change subscription
    if (currentSymbol && currentSymbol !== symbol) {
      sendWs({ type: 'unsubscribe', symbol: currentSymbol })
    }
    sendWs({ type: 'subscribe', symbol })
    currentSymbol = symbol
    return
  }

  globalWs = new WebSocket(`wss://ws.finnhub.io?token=${token}`)

  globalWs.onopen = () => {
    sendWs({ type: 'subscribe', symbol })
    currentSymbol = symbol
  }

  globalWs.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data)
      if (msg.type !== 'trade' || !msg.data) return
      for (const trade of msg.data as WsTradeData[]) {
        subscribers.get(trade.s)?.forEach((cb) => cb(trade))
      }
    } catch (_) {}
  }

  globalWs.onclose = () => {
    globalWs = null
    // Reconnect after 3s if there are still subscribers
    if (subscribers.size > 0) {
      reconnectTimer = setTimeout(() => {
        if (globalToken && currentSymbol) {
          connectWebSocket(globalToken, currentSymbol)
        }
      }, 3000)
    }
  }

  globalWs.onerror = () => {
    globalWs?.close()
  }
}

export function useQuoteWebSocket(symbol: string): LiveTick | null {
  const [tick, setTick] = useState<LiveTick | null>(null)
  const lastPrice = useRef<number | null>(null)
  const callbackRef = useRef<((t: WsTradeData) => void) | null>(null)

  const handleTrade = useCallback((trade: WsTradeData) => {
    setTick((prev) => {
      const direction: TickDirection =
        lastPrice.current === null ? null
          : trade.p > lastPrice.current ? 'up'
          : trade.p < lastPrice.current ? 'down'
          : prev?.direction ?? null
      lastPrice.current = trade.p
      return { price: trade.p, volume: trade.v, timestamp: trade.t, direction }
    })
  }, [])

  useEffect(() => {
    let cancelled = false

    const setup = async () => {
      try {
        const token = await getToken()
        if (cancelled) return
        subscribe(symbol, handleTrade)
        callbackRef.current = handleTrade
        connectWebSocket(token, symbol)
      } catch (_) {
        // WebSocket unavailable — polling fallback already in place
      }
    }

    setup()

    return () => {
      cancelled = true
      if (callbackRef.current) {
        unsubscribe(symbol, callbackRef.current)
      }
      // Unsubscribe the symbol from Finnhub if no more listeners
      if (!subscribers.has(symbol)) {
        sendWs({ type: 'unsubscribe', symbol })
      }
      if (reconnectTimer) clearTimeout(reconnectTimer)
    }
  }, [symbol, handleTrade])

  return tick
}
