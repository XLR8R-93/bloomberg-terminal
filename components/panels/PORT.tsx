'use client'
import { useState, useMemo, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useQuery, useQueries } from '@tanstack/react-query'
import { useTerminalStore, type Position, type PriceAlert } from '@/lib/store'
import type { HistoryPoint } from '@/app/api/history/route'

export type BaseCurrency = 'USD' | 'AUD' | 'GBP' | 'EUR' | 'JPY' | 'CAD'

export interface FXRates {
  USD: number; AUD: number; GBP: number; EUR: number
  JPY: number; CAD: number; HKD: number; SGD: number; NZD: number
  updatedAt: number
}

// Convert amount in fromCurrency to toCurrency via USD
function convertFX(amount: number, from: string, to: string, fx: FXRates): number {
  const fromRate = (fx as unknown as Record<string, number>)[from] ?? 1
  const toRate   = (fx as unknown as Record<string, number>)[to]   ?? 1
  if (toRate === 0) return amount
  return amount * (fromRate / toRate)
}

export interface SymbolMetrics {
  beta: number | null
  week52High: number | null
  week52Low: number | null
  sector: string | null
  industry: string | null
  marketCap: number | null
  shortName: string | null
  dividendYield: number | null
}

// ── Helpers ───────────────────────────────────────────────────────
function fmt(v: number, dec = 2) {
  return v.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec })
}
function fmtVal(n: number, currency = 'USD') {
  const sym = currency === 'AUD' ? 'A$' : currency === 'GBP' ? '£' : currency === 'EUR' ? '€'
    : currency === 'JPY' ? '¥' : currency === 'CAD' ? 'C$' : '$'
  if (Math.abs(n) >= 1e9) return `${sym}${(n / 1e9).toFixed(2)}B`
  if (Math.abs(n) >= 1e6) return `${sym}${(n / 1e6).toFixed(2)}M`
  if (Math.abs(n) >= 1e3) return `${sym}${(n / 1e3).toFixed(1)}K`
  return `${sym}${fmt(n)}`
}
function clr(n: number) { return n >= 0 ? '#33ff66' : '#ff3b3b' }
function sign(n: number) { return n >= 0 ? '+' : '' }
function pct(n: number) { return `${sign(n)}${fmt(n)}%` }

function exportCSV(positions: Position[], quotes: Record<string, Quote>, fx: FXRates, baseCcy: string) {
  const rows = [
    ['Ticker','Shares','Avg Cost','Currency','Last Price','Market Value ('+baseCcy+')','Cost Basis ('+baseCcy+')','Unrealised P&L ('+baseCcy+')','Return %','Day Change %','Added'],
    ...positions.map(p => {
      const q    = quotes[p.ticker]
      const last = q?.c ?? ''
      const cost = convertFX(p.shares * p.avgCost, p.currency, baseCcy, fx)
      const mv   = q?.c ? convertFX(p.shares * q.c, p.currency, baseCcy, fx) : ''
      const upnl = mv !== '' ? (mv as number) - cost : ''
      const ret  = upnl !== '' && cost > 0 ? (((upnl as number) / cost) * 100).toFixed(2) + '%' : ''
      return [
        p.ticker, p.shares, p.avgCost, p.currency, last,
        mv !== '' ? (mv as number).toFixed(2) : '',
        cost.toFixed(2),
        upnl !== '' ? (upnl as number).toFixed(2) : '',
        ret,
        q?.dp != null ? q.dp.toFixed(2) + '%' : '',
        new Date(p.addedAt).toLocaleDateString('en-AU'),
      ]
    }),
  ]
  const csv = rows.map(r => r.join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url; a.download = `portfolio_${new Date().toISOString().slice(0,10)}.csv`
  a.click(); URL.revokeObjectURL(url)
}

function currencyFor(ticker: string): string {
  if (ticker.endsWith('=F') || ticker.endsWith('=X')) return 'USD'
  if (ticker.startsWith('^')) return 'USD'
  if (ticker.endsWith('.AX')) return 'AUD'
  if (ticker.endsWith('.L'))  return 'GBP'
  if (ticker.endsWith('.PA') || ticker.endsWith('.DE') || ticker.endsWith('.AS') || ticker.endsWith('.MI')) return 'EUR'
  if (ticker.endsWith('.T'))  return 'JPY'
  if (ticker.endsWith('.TO')) return 'CAD'
  if (ticker.endsWith('.HK')) return 'HKD'
  return 'USD'
}
function unitLabel(ticker: string): string {
  if (ticker.endsWith('=F')) {
    if (ticker.startsWith('GC') || ticker.startsWith('SI') || ticker.startsWith('PL') || ticker.startsWith('PA')) return 'oz'
    if (ticker.startsWith('CL') || ticker.startsWith('BZ')) return 'bbl'
    if (ticker.startsWith('NG')) return 'MMBtu'
    if (ticker.startsWith('HG')) return 'lb'
    if (ticker.startsWith('ZC') || ticker.startsWith('ZW') || ticker.startsWith('ZS')) return 'bu'
    return 'unit'
  }
  return 'share'
}
function assetType(ticker: string): 'equity' | 'commodity' | 'bond' | 'fx' | 'index' {
  if (ticker.endsWith('=F'))  return 'commodity'
  if (ticker.endsWith('=X'))  return 'fx'
  if (ticker.startsWith('^')) return 'index'
  if (['TLT','IEF','SHY','AGG','BND','LQD','HYG','JNK','MUB','VCIT','VCSH','BNDX',
       'EMB','IGLT.L','IAF.AX','VAF.AX','BOND'].includes(ticker)) return 'bond'
  return 'equity'
}

// ── Preset instruments ────────────────────────────────────────────
interface Preset { symbol: string; name: string }
const PRESETS: Record<string, Preset[]> = {
  Energy:      [{ symbol:'CL=F',name:'WTI Crude Oil'},{ symbol:'BZ=F',name:'Brent Crude'},{ symbol:'NG=F',name:'Natural Gas'},{ symbol:'RB=F',name:'Gasoline RBOB'}],
  Metals:      [{ symbol:'GC=F',name:'Gold'},{ symbol:'SI=F',name:'Silver'},{ symbol:'HG=F',name:'Copper'},{ symbol:'PL=F',name:'Platinum'},{ symbol:'PA=F',name:'Palladium'}],
  Agriculture: [{ symbol:'ZC=F',name:'Corn'},{ symbol:'ZW=F',name:'Wheat'},{ symbol:'ZS=F',name:'Soybeans'},{ symbol:'KC=F',name:'Coffee'},{ symbol:'SB=F',name:'Sugar #11'},{ symbol:'CC=F',name:'Cocoa'}],
  'Bond ETFs': [{ symbol:'TLT',name:'20Y+ Treasury'},{ symbol:'IEF',name:'7-10Y Treasury'},{ symbol:'SHY',name:'1-3Y Treasury'},{ symbol:'AGG',name:'US Agg Bond'},{ symbol:'LQD',name:'IG Corp Bond'},{ symbol:'HYG',name:'High Yield Corp'},{ symbol:'BNDX',name:'Intl Bond'},{ symbol:'EMB',name:'EM Bond'},{ symbol:'IAF.AX',name:'AU Govt Bond'},{ symbol:'VAF.AX',name:'AU Fixed Int'}],
}

// ── Shared types ──────────────────────────────────────────────────
interface Quote { c: number; d: number; dp: number }

// ── Bar component (horizontal, terminal style) ────────────────────
function Bar({ pct: p, color, height = 6 }: { pct: number; color: string; height?: number }) {
  const w = Math.min(100, Math.max(0, Math.abs(p)))
  return (
    <div style={{ background: '#111', height, width: '100%', position: 'relative' }}>
      <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${w}%`, background: color, opacity: 0.7 }} />
    </div>
  )
}

// ── 52-week range gauge ───────────────────────────────────────────
function RangeGauge({ low, high, current }: { low: number; high: number; current: number }) {
  const range = high - low
  const pos = range > 0 ? Math.min(100, Math.max(0, ((current - low) / range) * 100)) : 50
  return (
    <div style={{ position: 'relative', height: 6, background: '#1a1a1a', width: '100%' }}>
      <div style={{ position: 'absolute', left: 0, top: 0, width: `${pos}%`, height: '100%', background: pos > 66 ? '#33ff66' : pos > 33 ? '#ffa028' : '#ff3b3b' }} />
      <div style={{ position: 'absolute', left: `${pos}%`, top: -2, width: 2, height: 10, background: '#fff', transform: 'translateX(-50%)' }} />
    </div>
  )
}

// ── Ticker search component ───────────────────────────────────────
interface SearchResult { symbol: string; description: string; type: string }

function TickerSearch({ value, onChange, onSelect, activeTab, onTabChange }: {
  value: string; onChange: (v: string) => void
  onSelect: (symbol: string, name: string) => void
  activeTab: string; onTabChange: (t: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [dropPos, setDropPos] = useState<{ top: number; left: number; width: number } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const dropRef  = useRef<HTMLDivElement>(null)

  const { data } = useQuery<{ result: SearchResult[] }>({
    queryKey: ['search', value],
    queryFn: () => fetch(`/api/search?q=${encodeURIComponent(value)}`).then(r => r.json()),
    enabled: value.length >= 1 && activeTab === 'Equity',
    staleTime: 30_000,
  })

  const results   = data?.result?.slice(0, 8) ?? []
  const showDrop  = open && results.length > 0 && value.length > 0

  useEffect(() => {
    if (!inputRef.current) return
    const rect = inputRef.current.getBoundingClientRect()
    setDropPos({ top: rect.bottom + window.scrollY, left: rect.left + window.scrollX, width: rect.width })
  }, [showDrop, value])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const t = e.target as Node
      if (!inputRef.current?.contains(t) && !dropRef.current?.contains(t)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const tabs = ['Equity', ...Object.keys(PRESETS)]
  const presetRows = activeTab !== 'Equity' ? (PRESETS[activeTab] ?? []) : []

  return (
    <div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 8, flexWrap: 'wrap' }}>
        {tabs.map(t => (
          <button key={t} onClick={() => onTabChange(t)} style={{
            background: activeTab === t ? '#1a2a1a' : '#141414',
            border: `1px solid ${activeTab === t ? '#33ff66' : '#3a3a3a'}`,
            color: activeTab === t ? '#33ff66' : '#aaa',
            fontFamily: 'inherit', fontSize: 10, padding: '3px 10px', cursor: 'pointer', letterSpacing: '0.05em',
          }}>{t.toUpperCase()}</button>
        ))}
      </div>

      {activeTab === 'Equity' && (
        <>
          <input ref={inputRef} value={value}
            onChange={e => { onChange(e.target.value.toUpperCase()); setOpen(true) }}
            onFocus={() => setOpen(true)}
            placeholder="Search ticker or company name…" autoFocus autoComplete="off"
            style={{ background: '#0a0a0a', border: '1px solid #2a2a2a', color: '#eee', fontFamily: 'inherit', fontSize: 12, padding: '5px 8px', width: '100%', boxSizing: 'border-box' }}
          />
          {showDrop && dropPos && createPortal(
            <div ref={dropRef} style={{ position: 'absolute', top: dropPos.top, left: dropPos.left, width: dropPos.width, zIndex: 9999, background: '#0d0d0d', border: '1px solid #2a2a2a', borderTop: 'none', maxHeight: 220, overflowY: 'auto', fontFamily: 'monospace' }}>
              {results.map(r => (
                <div key={r.symbol}
                  onMouseDown={e => { e.preventDefault(); onSelect(r.symbol, r.description); setOpen(false) }}
                  style={{ padding: '7px 10px', cursor: 'pointer', borderBottom: '1px solid #111', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#141414')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <div>
                    <span style={{ color: '#4d9fff', fontSize: 12, fontWeight: 'bold', marginRight: 8 }}>{r.symbol}</span>
                    <span style={{ color: '#666', fontSize: 10 }}>{r.description?.slice(0, 38)}</span>
                  </div>
                  <span style={{ color: '#333', fontSize: 9 }}>{r.type}</span>
                </div>
              ))}
            </div>,
            document.body
          )}
        </>
      )}

      {activeTab !== 'Equity' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
          {presetRows.map(p => (
            <button key={p.symbol} onMouseDown={() => onSelect(p.symbol, p.name)}
              style={{ background: value === p.symbol ? '#1a2a1a' : '#0a0a0a', border: `1px solid ${value === p.symbol ? '#33ff66' : '#1a1a1a'}`, color: value === p.symbol ? '#33ff66' : '#999', fontFamily: 'inherit', fontSize: 10, padding: '5px 8px', cursor: 'pointer', textAlign: 'left' }}
              onMouseEnter={e => { if (value !== p.symbol) e.currentTarget.style.borderColor = '#333' }}
              onMouseLeave={e => { if (value !== p.symbol) e.currentTarget.style.borderColor = '#1a1a1a' }}
            >
              <div style={{ fontWeight: 'bold', fontSize: 11 }}>{p.symbol}</div>
              <div style={{ color: '#555', fontSize: 9, marginTop: 1 }}>{p.name}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Add / Edit position modal ─────────────────────────────────────
function PositionModal({ initial, onSave, onClose }: {
  initial?: Position
  onSave: (p: Omit<Position, 'id' | 'addedAt'>) => void
  onClose: () => void
}) {
  const [ticker,   setTicker]   = useState(initial?.ticker  ?? '')
  const [shares,   setShares]   = useState(initial?.shares  != null ? String(initial.shares)  : '')
  const [avgCost,  setAvgCost]  = useState(initial?.avgCost != null ? String(initial.avgCost) : '')
  const [currency, setCurrency] = useState(initial?.currency ?? 'USD')
  const [loading,  setLoading]  = useState(false)
  const [tab,      setTab]      = useState('Equity')

  const unit  = unitLabel(ticker)
  const type  = assetType(ticker)
  const valid = ticker.trim().length > 0 && parseFloat(shares) > 0 && parseFloat(avgCost) > 0
  const typeColor = type === 'commodity' ? '#ffa028' : type === 'bond' ? '#4d9fff' : '#33ff66'

  const handleSelect = async (symbol: string) => {
    setTicker(symbol); setCurrency(currencyFor(symbol)); setLoading(true)
    try {
      const q = await fetch(`/api/finnhub/quote?symbol=${symbol}`).then(r => r.json())
      if (q?.c && q.c > 0) setAvgCost(String(q.c))
    } catch { /* ignore */ } finally { setLoading(false) }
  }

  const inputStyle: React.CSSProperties = { background: '#0a0a0a', border: '1px solid #2a2a2a', color: '#eee', fontFamily: 'inherit', fontSize: 12, padding: '5px 8px', width: '100%', boxSizing: 'border-box' }
  const labelStyle: React.CSSProperties = { color: '#555', fontSize: 10, letterSpacing: '0.06em', marginBottom: 4, display: 'block' }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.82)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ background: '#060606', border: '1px solid #2a2a2a', width: 480, padding: 24, overflow: 'visible' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <span style={{ color: '#ffa028', fontSize: 11, fontWeight: 'bold', letterSpacing: '0.1em' }}>{initial ? 'EDIT POSITION' : 'ADD POSITION'}</span>
          {ticker && <span style={{ fontSize: 9, padding: '2px 8px', border: `1px solid ${typeColor}`, color: typeColor }}>{type.toUpperCase()}</span>}
        </div>
        <div style={{ display: 'grid', gap: 14, overflow: 'visible' }}>
          <div>
            <label style={labelStyle}>INSTRUMENT</label>
            <TickerSearch value={ticker} onChange={v => { setTicker(v); setCurrency(currencyFor(v)) }} onSelect={handleSelect} activeTab={tab} onTabChange={t => { setTab(t); setTicker('') }} />
            {ticker && <div style={{ marginTop: 4, fontSize: 10, color: '#555' }}>Selected: <span style={{ color: typeColor }}>{ticker}</span>{unit !== 'share' && <span style={{ color: '#444' }}> · {unit}</span>}</div>}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={labelStyle}>{type === 'commodity' ? `QTY (${unit.toUpperCase()})` : 'SHARES / UNITS'}</label>
              <input style={inputStyle} type="number" min="0" step="any" value={shares} onChange={e => setShares(e.target.value)} placeholder="100" />
            </div>
            <div>
              <label style={labelStyle}>{type === 'commodity' ? 'ENTRY PRICE' : 'AVG COST / SHARE'}{loading && <span style={{ color: '#ffa028', marginLeft: 6 }}>FETCHING…</span>}</label>
              <input style={inputStyle} type="number" min="0" step="any" value={avgCost} onChange={e => setAvgCost(e.target.value)} placeholder="0.00" />
            </div>
          </div>
          <div>
            <label style={labelStyle}>CURRENCY</label>
            <select style={inputStyle} value={currency} onChange={e => setCurrency(e.target.value)}>
              {['USD','AUD','GBP','EUR','JPY','CAD','HKD','SGD','NZD'].map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          {parseFloat(shares) > 0 && parseFloat(avgCost) > 0 && (
            <div style={{ color: '#444', fontSize: 10, borderTop: '1px solid #111', paddingTop: 10 }}>
              Total exposure: <span style={{ color: '#888' }}>{fmtVal(parseFloat(shares) * parseFloat(avgCost), currency)}</span>
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 22, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ background: 'none', border: '1px solid #333', color: '#888', cursor: 'pointer', fontFamily: 'inherit', fontSize: 11, padding: '6px 16px' }}>CANCEL</button>
          <button onClick={() => { if (!valid) return; onSave({ ticker: ticker.trim().toUpperCase(), shares: parseFloat(shares), avgCost: parseFloat(avgCost), currency }); onClose() }}
            disabled={!valid}
            style={{ background: valid ? '#1a3a1a' : '#111', border: `1px solid ${valid ? '#33ff66' : '#333'}`, color: valid ? '#33ff66' : '#444', cursor: valid ? 'pointer' : 'default', fontFamily: 'inherit', fontSize: 11, padding: '6px 16px' }}>SAVE</button>
        </div>
      </div>
    </div>
  )
}

// ── Summary strip (always shown) ──────────────────────────────────
function SummaryStrip({ positions, quotes, loaded, fx, baseCcy, metrics }: { positions: Position[]; quotes: Record<string, Quote>; loaded: number; fx: FXRates; baseCcy: string; metrics: Record<string, SymbolMetrics> }) {
  const { totalValue, totalCost, totalDayPnl, totalPnl, annualIncome } = useMemo(() => {
    let totalValue = 0, totalCost = 0, totalDayPnl = 0, annualIncome = 0
    for (const p of positions) {
      const q = quotes[p.ticker]
      const m = metrics[p.ticker]
      totalCost += convertFX(p.shares * p.avgCost, p.currency, baseCcy, fx)
      if (q?.c) {
        totalValue  += convertFX(p.shares * q.c,         p.currency, baseCcy, fx)
        totalDayPnl += convertFX(p.shares * (q.d ?? 0),  p.currency, baseCcy, fx)
        if (m?.dividendYield) {
          annualIncome += convertFX(p.shares * q.c * (m.dividendYield / 100), p.currency, baseCcy, fx)
        }
      }
    }
    return { totalValue, totalCost, totalDayPnl, totalPnl: totalValue - totalCost, annualIncome }
  }, [positions, quotes, metrics, fx, baseCcy])

  const totalPnlPct = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0
  const dayPct = totalValue > 0 ? (totalDayPnl / (totalValue - totalDayPnl)) * 100 : 0

  const stat = (label: string, value: string, color = '#eee') => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ color: '#444', fontSize: 9, letterSpacing: '0.08em' }}>{label}</span>
      <span style={{ color, fontSize: 13, fontWeight: 'bold', fontVariantNumeric: 'tabular-nums' }}>{value}</span>
    </div>
  )

  if (!loaded) return null
  return (
    <div style={{ display: 'flex', gap: 20, padding: '8px 16px', borderBottom: '1px solid #1a1a1a', background: '#040404', flexWrap: 'wrap', flexShrink: 0, alignItems: 'flex-end' }}>
      {stat('PORTFOLIO VALUE', fmtVal(totalValue, baseCcy))}
      {stat('DAY P&L', `${sign(totalDayPnl)}${fmtVal(Math.abs(totalDayPnl), baseCcy)}  (${pct(dayPct)})`, clr(totalDayPnl))}
      {stat('TOTAL P&L', `${sign(totalPnl)}${fmtVal(Math.abs(totalPnl), baseCcy)}  (${pct(totalPnlPct)})`, clr(totalPnl))}
      {stat('COST BASIS', fmtVal(totalCost, baseCcy))}
      {stat('POSITIONS', String(positions.length))}
      {annualIncome > 0 && stat('EST. DIV INCOME / YR', fmtVal(annualIncome, baseCcy), '#ffa028')}
      <div style={{ marginLeft: 'auto', color: '#2a2a2a', fontSize: 9, alignSelf: 'center' }}>
        FX {new Date(fx.updatedAt).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })}
      </div>
    </div>
  )
}

// ── HOLDINGS view ─────────────────────────────────────────────────
function HoldingsView({ positions, quotes, totalValue, fx, baseCcy, alerts, metrics, onEdit, onRemove, onSelect }: {
  positions: Position[]; quotes: Record<string, Quote>; totalValue: number
  fx: FXRates; baseCcy: string; alerts: import('@/lib/store').PriceAlert[]
  metrics: Record<string, SymbolMetrics>
  onEdit: (p: Position) => void; onRemove: (id: string) => void; onSelect: (p: Position) => void
}) {
  const th: React.CSSProperties = { color: '#333', fontSize: 9, fontWeight: 'normal', padding: '4px 8px', textAlign: 'right', letterSpacing: '0.05em', borderBottom: '1px solid #111' }
  const cell: React.CSSProperties = { padding: '5px 8px', fontSize: 11, fontVariantNumeric: 'tabular-nums' }

  const typeColor = (t: string) => {
    const a = assetType(t)
    return a === 'commodity' ? '#ffa028' : a === 'bond' ? '#4d9fff' : a === 'fx' ? '#cc88ff' : 'transparent'
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto' }}>
      {positions.length === 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 12, color: '#333' }}>
          <div style={{ fontSize: 13, letterSpacing: '0.06em' }}>NO POSITIONS</div>
          <div style={{ fontSize: 11 }}>Click <span style={{ color: '#33ff66' }}>+ ADD POSITION</span> to get started</div>
        </div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: '13%' }} /><col style={{ width: '7%' }} /><col style={{ width: '8%' }} />
            <col style={{ width: '9%' }} /><col style={{ width: '9%' }} /><col style={{ width: '8%' }} />
            <col style={{ width: '7%' }} /><col style={{ width: '9%' }} /><col style={{ width: '7%' }} />
            <col style={{ width: '6%' }} /><col style={{ width: '7%' }} /><col style={{ width: '10%' }} />
          </colgroup>
          <thead>
            <tr>
              <th style={{ ...th, textAlign: 'left' }}>Ticker</th>
              <th style={th}>Units</th><th style={th}>Entry</th><th style={th}>Last</th>
              <th style={th}>Value</th><th style={th}>Day P&L</th><th style={th}>Day %</th>
              <th style={th}>Total P&L</th><th style={th}>Return</th><th style={th}>Wt%</th>
              <th style={th}>Div Yld</th>
              <th style={th}></th>
            </tr>
          </thead>
          <tbody>
            {positions.map(pos => {
              const q    = quotes[pos.ticker]
              const m    = metrics[pos.ticker]
              const price = q?.c ?? null
              const cost  = pos.shares * pos.avgCost
              const mv    = price != null ? pos.shares * price : null
              const tpnl  = mv != null ? mv - cost : null
              const tret  = tpnl != null && cost > 0 ? (tpnl / cost) * 100 : null
              const dpnl  = q?.d != null ? pos.shares * q.d : null
              const mvBase = mv != null ? convertFX(mv, pos.currency, baseCcy, fx) : null
              const wt     = totalValue > 0 && mvBase != null ? (mvBase / totalValue) * 100 : 0
              const c      = pos.currency
              const tc    = typeColor(pos.ticker)

              // Price alert badges
              const posAlerts = alerts.filter(a => a.ticker === pos.ticker)
              const triggered = posAlerts.filter(a =>
                price != null && (
                  (a.type === 'TARGET' && price >= a.price) ||
                  (a.type === 'STOP'   && price <= a.price)
                )
              )
              const pending = posAlerts.filter(a =>
                price == null || (
                  (a.type === 'TARGET' && price < a.price) ||
                  (a.type === 'STOP'   && price > a.price)
                )
              )

              const divYield = m?.dividendYield
              const annualIncome = divYield && price ? pos.shares * price * (divYield / 100) : null

              return (
                <tr key={pos.id} onClick={() => onSelect(pos)}
                  style={{ borderBottom: '1px solid #0d0d0d', cursor: 'pointer' }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#080808')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <td style={cell}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                      <span style={{ color: '#4d9fff', fontWeight: 'bold' }}>{pos.ticker}</span>
                      {tc !== 'transparent' && <span style={{ fontSize: 7, color: tc, border: `1px solid ${tc}`, padding: '0 2px', opacity: 0.7 }}>{assetType(pos.ticker).slice(0,4).toUpperCase()}</span>}
                      {triggered.length > 0 && <span title={`Alert triggered: ${triggered.map(a => `${a.type} ${fmtVal(a.price, c)}`).join(', ')}`} style={{ fontSize: 9, cursor: 'help' }}>{triggered[0].type === 'TARGET' ? '🎯' : '🛑'}</span>}
                      {pending.length > 0 && triggered.length === 0 && <span title={`${pending.length} alert${pending.length > 1 ? 's' : ''} pending`} style={{ fontSize: 8, color: '#ffa028', border: '1px solid #ffa028', padding: '0 2px' }}>●</span>}
                    </div>
                  </td>
                  <td style={{ ...cell, color: '#888', textAlign: 'right' }}>{fmt(pos.shares, pos.shares % 1 === 0 ? 0 : 2)}</td>
                  <td style={{ ...cell, color: '#666', textAlign: 'right' }}>{fmtVal(pos.avgCost, c)}</td>
                  <td style={{ ...cell, color: '#eee', textAlign: 'right', fontWeight: 'bold' }}>{price != null ? fmtVal(price, c) : <span style={{ color: '#333' }}>…</span>}</td>
                  <td style={{ ...cell, color: '#ccc', textAlign: 'right' }}>{mv != null ? fmtVal(mv, c) : '—'}</td>
                  <td style={{ ...cell, color: dpnl != null ? clr(dpnl) : '#333', textAlign: 'right' }}>{dpnl != null ? `${sign(dpnl)}${fmtVal(Math.abs(dpnl), c)}` : '—'}</td>
                  <td style={{ ...cell, color: q?.dp != null ? clr(q.dp) : '#333', textAlign: 'right' }}>{q?.dp != null ? pct(q.dp) : '—'}</td>
                  <td style={{ ...cell, color: tpnl != null ? clr(tpnl) : '#333', textAlign: 'right' }}>{tpnl != null ? `${sign(tpnl)}${fmtVal(Math.abs(tpnl), c)}` : '—'}</td>
                  <td style={{ ...cell, color: tret != null ? clr(tret) : '#333', textAlign: 'right' }}>{tret != null ? pct(tret) : '—'}</td>
                  <td style={{ ...cell, color: '#555', textAlign: 'right' }}>{wt > 0 ? `${fmt(wt, 1)}%` : '—'}</td>
                  <td style={{ ...cell, textAlign: 'right' }}>
                    {divYield != null
                      ? <span title={annualIncome != null ? `Est. ${fmtVal(annualIncome, c)}/yr` : ''} style={{ color: '#ffa028', cursor: 'help' }}>{fmt(divYield, 2)}%</span>
                      : <span style={{ color: '#2a2a2a' }}>—</span>}
                  </td>
                  <td style={{ ...cell, textAlign: 'right' }}>
                    <span onClick={e => { e.stopPropagation(); onEdit(pos) }} style={{ color: '#4d9fff', cursor: 'pointer', marginRight: 8, fontSize: 10 }}>EDIT</span>
                    <span onClick={e => { e.stopPropagation(); onRemove(pos.id) }} style={{ color: '#ff3b3b', cursor: 'pointer', fontSize: 10 }}>DEL</span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}

// ── PERFORMANCE view ──────────────────────────────────────────────
function PerformanceView({ positions, quotes, fx, baseCcy }: { positions: Position[]; quotes: Record<string, Quote>; fx: FXRates; baseCcy: string }) {
  // Benchmark: SPY (USD) and ^AXJO (AUD)
  const { data: benchmarks = {} } = useQuery<Record<string, Quote>>({
    queryKey: ['port-bench'],
    queryFn: () => fetch('/api/quotes?symbols=SPY,%5EAXJO,%5EFTSE,%5EGDAXI').then(r => r.json()),
    refetchInterval: 60_000, staleTime: 30_000,
  })

  const positions_with_data = useMemo(() => positions.map(p => {
    const q    = quotes[p.ticker]
    const cost = convertFX(p.shares * p.avgCost, p.currency, baseCcy, fx)
    const mv   = q?.c ? convertFX(p.shares * q.c, p.currency, baseCcy, fx) : 0
    const dpnl = q?.d ? convertFX(p.shares * q.d, p.currency, baseCcy, fx) : 0
    const tpnl = mv - cost
    return { ...p, q, cost, mv, dpnl, tpnl, dayPct: q?.dp ?? 0 }
  }), [positions, quotes, fx, baseCcy])

  const totalMV    = positions_with_data.reduce((s, p) => s + p.mv, 0)
  const totalCost  = positions_with_data.reduce((s, p) => s + p.cost, 0)
  const totalDayPnl = positions_with_data.reduce((s, p) => s + p.dpnl, 0)
  const totalTpnl  = positions_with_data.reduce((s, p) => s + p.tpnl, 0)
  const dayPct     = totalMV > 0 ? (totalDayPnl / (totalMV - totalDayPnl)) * 100 : 0
  const totalRet   = totalCost > 0 ? (totalTpnl / totalCost) * 100 : 0

  // Contribution to day P&L
  const contributors = [...positions_with_data]
    .filter(p => p.mv > 0)
    .sort((a, b) => Math.abs(b.dpnl) - Math.abs(a.dpnl))
    .slice(0, 8)

  const maxAbsDpnl = Math.max(...contributors.map(p => Math.abs(p.dpnl)), 1)

  // Benchmarks
  const spy  = benchmarks['SPY']
  const axjo = benchmarks['^AXJO']
  const ftse = benchmarks['^FTSE']
  const dax  = benchmarks['^GDAXI']

  const sectionLabel: React.CSSProperties = { color: '#ffa028', fontSize: 9, letterSpacing: '0.1em', fontWeight: 'bold', marginBottom: 8, display: 'block' }
  const metricRow = (label: string, value: string, color = '#eee', sub?: string) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '5px 0', borderBottom: '1px solid #0d0d0d' }}>
      <span style={{ color: '#666', fontSize: 11 }}>{label}</span>
      <div style={{ textAlign: 'right' }}>
        <span style={{ color, fontSize: 12, fontVariantNumeric: 'tabular-nums', fontWeight: 'bold' }}>{value}</span>
        {sub && <span style={{ color: '#444', fontSize: 10, marginLeft: 6 }}>{sub}</span>}
      </div>
    </div>
  )

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, alignContent: 'start' }}>

      {/* Portfolio Performance */}
      <div>
        <span style={sectionLabel}>PORTFOLIO PERFORMANCE</span>
        {metricRow("Today's Return", dayPct ? pct(dayPct) : '—', dayPct ? clr(dayPct) : '#555', dayPct ? `${sign(totalDayPnl)}${fmtVal(Math.abs(totalDayPnl), baseCcy)}` : '')}
        {metricRow('Total Return', totalRet ? pct(totalRet) : '—', totalRet ? clr(totalRet) : '#555', totalRet ? `${sign(totalTpnl)}${fmtVal(Math.abs(totalTpnl), baseCcy)}` : '')}
        {metricRow('Portfolio Value', fmtVal(totalMV, baseCcy))}
        {metricRow('Cost Basis', fmtVal(totalCost, baseCcy))}
        {metricRow('Unrealised P&L', `${sign(totalTpnl)}${fmtVal(Math.abs(totalTpnl), baseCcy)}`, clr(totalTpnl))}
      </div>

      {/* Benchmark Comparison */}
      <div>
        <span style={sectionLabel}>VS BENCHMARKS (TODAY)</span>
        <div style={{ marginBottom: 6 }}>
          {metricRow('This Portfolio', dayPct ? pct(dayPct) : '…', dayPct ? clr(dayPct) : '#555')}
          {spy  && metricRow('S&P 500 (SPY)',   pct(spy.dp),  clr(spy.dp))}
          {axjo && metricRow('ASX 200 (^AXJO)', pct(axjo.dp), clr(axjo.dp))}
          {ftse && metricRow('FTSE 100 (^FTSE)', pct(ftse.dp), clr(ftse.dp))}
          {dax  && metricRow('DAX (^GDAXI)',     pct(dax.dp),  clr(dax.dp))}
        </div>
        {spy && dayPct ? (
          <div style={{ marginTop: 8, padding: '6px 10px', background: '#080808', border: '1px solid #1a1a1a' }}>
            <span style={{ color: '#555', fontSize: 10 }}>Alpha vs S&P 500: </span>
            <span style={{ color: clr(dayPct - spy.dp), fontSize: 12, fontWeight: 'bold' }}>{pct(dayPct - spy.dp)}</span>
          </div>
        ) : null}
      </div>

      {/* Day P&L Contribution */}
      <div style={{ gridColumn: '1 / -1' }}>
        <span style={sectionLabel}>P&L CONTRIBUTION — TODAY</span>
        <div style={{ display: 'grid', gap: 4 }}>
          {contributors.length === 0 && <span style={{ color: '#333', fontSize: 11 }}>No data yet</span>}
          {contributors.map(p => {
            const contrib = totalDayPnl !== 0 ? (p.dpnl / Math.abs(totalDayPnl)) * 100 : 0
            return (
              <div key={p.id} style={{ display: 'grid', gridTemplateColumns: '80px 1fr 70px 70px', gap: 8, alignItems: 'center' }}>
                <span style={{ color: '#4d9fff', fontSize: 11, fontWeight: 'bold' }}>{p.ticker}</span>
                <Bar pct={(Math.abs(p.dpnl) / maxAbsDpnl) * 100} color='#ffa028' height={5} />
                <span style={{ color: clr(p.dpnl), fontSize: 11, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                  {sign(p.dpnl)}{fmtVal(Math.abs(p.dpnl), baseCcy)}
                </span>
                <span style={{ color: '#444', fontSize: 10, textAlign: 'right' }}>
                  {sign(contrib)}{fmt(Math.abs(contrib), 1)}% of PnL
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Best & Worst */}
      <div>
        <span style={sectionLabel}>TOP MOVERS TODAY</span>
        {[...positions_with_data].filter(p => p.q).sort((a, b) => b.dayPct - a.dayPct).slice(0, 5).map(p => (
          <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #0d0d0d' }}>
            <span style={{ color: '#4d9fff', fontSize: 11 }}>{p.ticker}</span>
            <span style={{ color: clr(p.dayPct), fontSize: 11, fontVariantNumeric: 'tabular-nums' }}>{pct(p.dayPct)}</span>
          </div>
        ))}
      </div>

      <div>
        <span style={sectionLabel}>WORST MOVERS TODAY</span>
        {[...positions_with_data].filter(p => p.q).sort((a, b) => a.dayPct - b.dayPct).slice(0, 5).map(p => (
          <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #0d0d0d' }}>
            <span style={{ color: '#4d9fff', fontSize: 11 }}>{p.ticker}</span>
            <span style={{ color: clr(p.dayPct), fontSize: 11, fontVariantNumeric: 'tabular-nums' }}>{pct(p.dayPct)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── RISK view ─────────────────────────────────────────────────────
function RiskView({ positions, quotes, fx, baseCcy }: { positions: Position[]; quotes: Record<string, Quote>; fx: FXRates; baseCcy: string }) {
  const symbolsKey = positions.map(p => p.ticker).join(',')

  const { data: metrics = {}, isLoading } = useQuery<Record<string, SymbolMetrics>>({
    queryKey: ['port-metrics', symbolsKey],
    queryFn: () => symbolsKey ? fetch(`/api/portfolio/metrics?symbols=${encodeURIComponent(symbolsKey)}`).then(r => r.json()) : Promise.resolve({}),
    enabled: positions.length > 0,
    staleTime: 60 * 60_000,
  })

  // Portfolio-level calculations
  const enriched = useMemo(() => positions.map(p => {
    const q  = quotes[p.ticker]
    const m  = metrics[p.ticker]
    const mv = q?.c
      ? convertFX(p.shares * q.c,       p.currency, baseCcy, fx)
      : convertFX(p.shares * p.avgCost, p.currency, baseCcy, fx)
    return { ...p, q, m, mv }
  }), [positions, quotes, metrics, fx, baseCcy])

  const totalMV = enriched.reduce((s, p) => s + p.mv, 0)

  // Weighted portfolio beta (equity only, skip commodities/bonds)
  const { portBeta, betaCoverage } = useMemo(() => {
    let wBeta = 0, wTotal = 0
    for (const p of enriched) {
      if (p.m?.beta != null && assetType(p.ticker) === 'equity') {
        wBeta  += p.m.beta * p.mv
        wTotal += p.mv
      }
    }
    return { portBeta: wTotal > 0 ? wBeta / wTotal : null, betaCoverage: wTotal }
  }, [enriched])

  // Concentration
  const sorted = [...enriched].sort((a, b) => b.mv - a.mv)
  const top3Pct = totalMV > 0 ? sorted.slice(0, 3).reduce((s, p) => s + p.mv, 0) / totalMV * 100 : 0
  const top1Pct = totalMV > 0 && sorted[0] ? sorted[0].mv / totalMV * 100 : 0
  const hhi     = totalMV > 0 ? enriched.reduce((s, p) => s + Math.pow((p.mv / totalMV) * 100, 2), 0) : 0 // Herfindahl index

  const concentrationRisk  = hhi > 3000 ? 'HIGH' : hhi > 1500 ? 'MODERATE' : 'LOW'
  const concentrationColor = hhi > 3000 ? '#ff3b3b' : hhi > 1500 ? '#ffa028' : '#33ff66'

  // Equity beta interpretation
  const betaLabel = portBeta == null ? '—' : portBeta > 1.5 ? 'AGGRESSIVE' : portBeta > 1.0 ? 'MODERATE-HIGH' : portBeta > 0.7 ? 'MARKET-LIKE' : portBeta > 0.3 ? 'DEFENSIVE' : 'LOW BETA'
  const betaColor = portBeta == null ? '#555' : portBeta > 1.5 ? '#ff3b3b' : portBeta > 1.0 ? '#ffa028' : '#33ff66'

  // Sharpe ratio (estimated)
  // Using total return since inception vs risk-free rate of 5.25% annualised
  // Volatility estimated from cross-sectional dispersion of position returns (proxy)
  const RISK_FREE_ANNUAL = 5.25
  const { sharpe, portReturnPct, portfolioVol } = useMemo(() => {
    const totalCost = enriched.reduce((s, p) => s + p.shares * p.avgCost, 0)
    const totalMV2  = enriched.reduce((s, p) => s + p.mv, 0)
    if (totalCost === 0 || totalMV2 === 0) return { sharpe: null, portReturnPct: null, portfolioVol: null }

    // Portfolio total return %
    const portReturnPct = ((totalMV2 - totalCost) / totalCost) * 100

    // Estimate holding period in years (from earliest position addedAt)
    const earliest = Math.min(...enriched.map(p => p.addedAt))
    const yearsHeld = Math.max((Date.now() - earliest) / (365.25 * 24 * 3600 * 1000), 1 / 52)

    // Annualise portfolio return
    const annualisedReturn = portReturnPct / yearsHeld

    // Cross-sectional volatility proxy: std dev of individual position returns (weighted)
    const posReturns = enriched
      .filter(p => p.mv > 0 && p.shares * p.avgCost > 0)
      .map(p => ((p.mv - p.shares * p.avgCost) / (p.shares * p.avgCost)) * 100 / yearsHeld)

    if (posReturns.length < 2) return { sharpe: null, portReturnPct, portfolioVol: null }
    const mean = posReturns.reduce((s, r) => s + r, 0) / posReturns.length
    const variance = posReturns.reduce((s, r) => s + Math.pow(r - mean, 2), 0) / (posReturns.length - 1)
    const portfolioVol = Math.sqrt(variance)

    const sharpe = portfolioVol > 0 ? (annualisedReturn - RISK_FREE_ANNUAL) / portfolioVol : null
    return { sharpe, portReturnPct, portfolioVol }
  }, [enriched])

  const sharpeLabel = sharpe == null ? '—' : sharpe > 2 ? 'EXCELLENT' : sharpe > 1 ? 'GOOD' : sharpe > 0 ? 'ACCEPTABLE' : 'POOR'
  const sharpeColor = sharpe == null ? '#555' : sharpe > 2 ? '#33ff66' : sharpe > 1 ? '#33ff66' : sharpe > 0 ? '#ffa028' : '#ff3b3b'

  // Portfolio alerts
  interface Alert { level: 'HIGH' | 'WARN' | 'INFO'; msg: string }
  const alerts: Alert[] = []
  if (top1Pct > 30) alerts.push({ level: 'HIGH', msg: `${sorted[0]?.ticker} is ${fmt(top1Pct, 1)}% of portfolio — single-stock concentration risk` })
  if (top3Pct > 60) alerts.push({ level: 'WARN', msg: `Top 3 positions = ${fmt(top3Pct, 1)}% of portfolio — consider diversifying` })
  if (portBeta != null && portBeta > 1.5) alerts.push({ level: 'WARN', msg: `Portfolio beta ${fmt(portBeta)} — high market sensitivity, elevated drawdown risk` })
  if (sharpe != null && sharpe < 0)  alerts.push({ level: 'HIGH', msg: `Sharpe ratio ${fmt(sharpe)} — portfolio returning below the risk-free rate` })
  enriched.forEach(p => {
    const ret = p.mv > 0 && p.shares * p.avgCost > 0 ? ((p.mv - p.shares * p.avgCost) / (p.shares * p.avgCost)) * 100 : 0
    if (ret < -20) alerts.push({ level: 'HIGH', msg: `${p.ticker} is down ${fmt(Math.abs(ret), 1)}% — consider reviewing stop-loss` })
    else if (ret < -10) alerts.push({ level: 'WARN', msg: `${p.ticker} is down ${fmt(Math.abs(ret), 1)}% from entry` })
  })
  const sectorCounts: Record<string, number> = {}
  enriched.forEach(p => { const s = p.m?.sector ?? 'Unknown'; sectorCounts[s] = (sectorCounts[s] ?? 0) + 1 })
  const uniqueSectors = Object.keys(sectorCounts).length
  if (enriched.length >= 5 && uniqueSectors <= 2) alerts.push({ level: 'INFO', msg: `Portfolio concentrated in ${uniqueSectors} sector${uniqueSectors === 1 ? '' : 's'} — low sector diversification` })

  const sectionLabel: React.CSSProperties = { color: '#ffa028', fontSize: 9, letterSpacing: '0.1em', fontWeight: 'bold', marginBottom: 8, display: 'block' }
  const metricRow = (label: string, value: string, color = '#eee', sub?: string) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '5px 0', borderBottom: '1px solid #0d0d0d' }}>
      <span style={{ color: '#666', fontSize: 11 }}>{label}</span>
      <div style={{ textAlign: 'right' }}>
        <span style={{ color, fontSize: 12, fontVariantNumeric: 'tabular-nums', fontWeight: 'bold' }}>{value}</span>
        {sub && <span style={{ color: '#444', fontSize: 10, marginLeft: 6 }}>{sub}</span>}
      </div>
    </div>
  )

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, alignContent: 'start' }}>

      {/* Portfolio Beta */}
      <div>
        <span style={sectionLabel}>MARKET SENSITIVITY (BETA)</span>
        {metricRow('Portfolio Beta', portBeta != null ? fmt(portBeta) : isLoading ? '…' : '—', betaColor, betaLabel)}
        {metricRow('Beta Coverage', totalMV > 0 ? `${fmt((betaCoverage / totalMV) * 100, 0)}% of portfolio` : '—')}
        {metricRow('Implied Market Move', portBeta != null ? `±${fmt(portBeta)}% per ±1% S&P` : '—', '#888')}
        <div style={{ marginTop: 10, padding: '8px', background: '#080808', border: '1px solid #1a1a1a', fontSize: 10, color: '#555', lineHeight: 1.6 }}>
          {portBeta == null ? 'Beta measures sensitivity to market movements. Equity positions only.' :
           portBeta > 1.2 ? `Portfolio moves ${fmt(portBeta)}x the market. Higher return potential with higher drawdown risk.` :
           portBeta < 0.8 ? `Defensive portfolio. Moves ${fmt(portBeta)}x the market — lower vol, lower upside.` :
           `Closely tracks the market at ${fmt(portBeta)}x.`}
        </div>
      </div>

      {/* Concentration Risk */}
      <div>
        <span style={sectionLabel}>CONCENTRATION RISK</span>
        {metricRow('Risk Level', concentrationRisk, concentrationColor)}
        {metricRow('HHI Score', fmt(hhi, 0), hhi > 3000 ? '#ff3b3b' : hhi > 1500 ? '#ffa028' : '#33ff66', '/ 10,000')}
        {metricRow('Largest Position', top1Pct ? `${fmt(top1Pct, 1)}%` : '—', top1Pct > 30 ? '#ff3b3b' : top1Pct > 20 ? '#ffa028' : '#33ff66', sorted[0]?.ticker)}
        {metricRow('Top 3 Positions', top3Pct ? `${fmt(top3Pct, 1)}%` : '—', top3Pct > 60 ? '#ff3b3b' : top3Pct > 45 ? '#ffa028' : '#33ff66', 'of portfolio')}
        <div style={{ marginTop: 10, padding: '8px', background: '#080808', border: '1px solid #1a1a1a', fontSize: 10, color: '#555', lineHeight: 1.6 }}>
          {hhi > 3000 ? 'Highly concentrated. Consider diversifying across more positions or sectors.' :
           hhi > 1500 ? 'Moderately concentrated. Some single-stock risk present.' :
           'Well diversified across positions.'}
        </div>
      </div>

      {/* Sharpe Ratio */}
      <div>
        <span style={sectionLabel}>RISK-ADJUSTED RETURN</span>
        {metricRow('Sharpe Ratio', sharpe != null ? fmt(sharpe) : '—', sharpeColor, sharpeLabel)}
        {metricRow('Portfolio Return', portReturnPct != null ? pct(portReturnPct) : '—', portReturnPct != null ? clr(portReturnPct) : '#555')}
        {metricRow('Est. Volatility', portfolioVol != null ? `${fmt(portfolioVol, 1)}%` : '—', '#888')}
        {metricRow('Risk-Free Rate', `${fmt(RISK_FREE_ANNUAL)}% (assumed)`, '#444')}
        <div style={{ marginTop: 10, padding: '8px', background: '#080808', border: '1px solid #1a1a1a', fontSize: 10, color: '#555', lineHeight: 1.6 }}>
          {sharpe == null ? 'Sharpe ratio requires ≥2 positions with return data.' :
           sharpe > 2   ? 'Excellent risk-adjusted returns. Portfolio generating strong alpha per unit of risk.' :
           sharpe > 1   ? 'Good risk-adjusted returns. Above-average performance relative to risk taken.' :
           sharpe > 0   ? 'Acceptable but marginal. Returns above risk-free but risk compensation is thin.' :
                          'Poor risk-adjusted returns. Underperforming the risk-free rate after vol adjustment.'}
        </div>
      </div>

      {/* Alerts */}
      <div>
        <span style={sectionLabel}>PORTFOLIO ALERTS {alerts.length > 0 && <span style={{ color: alerts.some(a => a.level === 'HIGH') ? '#ff3b3b' : '#ffa028' }}>({alerts.length})</span>}</span>
        {alerts.length === 0 ? (
          <div style={{ color: '#33ff66', fontSize: 11, padding: '8px 0' }}>✓ No alerts — portfolio looks healthy</div>
        ) : (
          <div style={{ display: 'grid', gap: 6 }}>
            {alerts.map((a, i) => (
              <div key={i} style={{
                padding: '7px 10px',
                background: a.level === 'HIGH' ? '#1a0505' : a.level === 'WARN' ? '#1a1005' : '#050d1a',
                border: `1px solid ${a.level === 'HIGH' ? '#3a1010' : a.level === 'WARN' ? '#3a2a10' : '#10203a'}`,
                display: 'flex', gap: 8, alignItems: 'flex-start',
              }}>
                <span style={{ color: a.level === 'HIGH' ? '#ff3b3b' : a.level === 'WARN' ? '#ffa028' : '#4d9fff', fontSize: 10, flexShrink: 0, fontWeight: 'bold' }}>
                  {a.level === 'HIGH' ? '⚠' : a.level === 'WARN' ? '!' : 'i'}
                </span>
                <span style={{ color: '#888', fontSize: 10, lineHeight: 1.5 }}>{a.msg}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Per-position beta & 52W range */}
      <div style={{ gridColumn: '1 / -1' }}>
        <span style={sectionLabel}>POSITION RISK METRICS</span>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {['Ticker','Weight','Beta','52W Low','Current','52W High','Position in Range','Dist from High'].map(h => (
                <th key={h} style={{ color: '#333', fontSize: 9, fontWeight: 'normal', padding: '3px 8px', textAlign: h === 'Ticker' ? 'left' : 'right', borderBottom: '1px solid #111', letterSpacing: '0.04em' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {enriched.map(p => {
              const m    = p.m
              const price = p.q?.c ?? p.avgCost
              const wt   = totalMV > 0 ? (p.mv / totalMV) * 100 : 0
              const distHigh = m?.week52High && price ? ((price - m.week52High) / m.week52High) * 100 : null
              return (
                <tr key={p.id} style={{ borderBottom: '1px solid #0d0d0d' }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#080808')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <td style={{ padding: '5px 8px', color: '#4d9fff', fontSize: 11, fontWeight: 'bold' }}>{p.ticker}</td>
                  <td style={{ padding: '5px 8px', color: '#888', fontSize: 11, textAlign: 'right' }}>{fmt(wt, 1)}%</td>
                  <td style={{ padding: '5px 8px', fontSize: 11, textAlign: 'right', color: m?.beta != null ? (m.beta > 1.2 ? '#ffa028' : m.beta < 0.5 ? '#4d9fff' : '#eee') : '#333' }}>
                    {m?.beta != null ? fmt(m.beta) : '—'}
                  </td>
                  <td style={{ padding: '5px 8px', color: '#555', fontSize: 10, textAlign: 'right' }}>{m?.week52Low  != null ? fmt(m.week52Low)  : '—'}</td>
                  <td style={{ padding: '5px 8px', color: '#eee',  fontSize: 11, textAlign: 'right', fontWeight: 'bold' }}>{fmt(price)}</td>
                  <td style={{ padding: '5px 8px', color: '#555', fontSize: 10, textAlign: 'right' }}>{m?.week52High != null ? fmt(m.week52High) : '—'}</td>
                  <td style={{ padding: '5px 8px', width: 120 }}>
                    {m?.week52Low != null && m?.week52High != null
                      ? <RangeGauge low={m.week52Low} high={m.week52High} current={price} />
                      : <span style={{ color: '#333', fontSize: 10 }}>—</span>}
                  </td>
                  <td style={{ padding: '5px 8px', fontSize: 11, textAlign: 'right', color: distHigh != null ? clr(distHigh) : '#333' }}>
                    {distHigh != null ? pct(distHigh) : '—'}
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

// ── ALLOCATION placeholder ────────────────────────────────────────
function AllocationView({ positions, quotes, metrics, fx, baseCcy }: { positions: Position[]; quotes: Record<string, Quote>; metrics: Record<string, SymbolMetrics>; fx: FXRates; baseCcy: string }) {
  const enriched = useMemo(() => positions.map(p => {
    const q  = quotes[p.ticker]
    const m  = metrics[p.ticker]
    const mv = q?.c
      ? convertFX(p.shares * q.c,       p.currency, baseCcy, fx)
      : convertFX(p.shares * p.avgCost, p.currency, baseCcy, fx)
    return { ...p, mv, sector: m?.sector ?? 'Unknown', type: assetType(p.ticker) }
  }), [positions, quotes, metrics, fx, baseCcy])

  const totalMV = enriched.reduce((s, p) => s + p.mv, 0)

  // Group helpers
  const groupBy = (key: 'type' | 'sector') => {
    const map: Record<string, number> = {}
    for (const p of enriched) {
      const k = key === 'type' ? p.type : (p.sector || 'Unknown')
      map[k] = (map[k] ?? 0) + p.mv
    }
    return Object.entries(map).sort((a, b) => b[1] - a[1])
  }

  const typeGroups   = groupBy('type')
  const sectorGroups = groupBy('sector')

  const PALETTE = ['#4d9fff','#33ff66','#ffa028','#cc88ff','#ff3b3b','#00dddd','#ffdd44','#ff88aa','#88ff88','#aaaaff']

  const sectionLabel: React.CSSProperties = { color: '#ffa028', fontSize: 9, letterSpacing: '0.1em', fontWeight: 'bold', marginBottom: 8, display: 'block' }

  const BreakdownTable = ({ groups, label }: { groups: [string, number][]; label: string }) => (
    <div>
      <span style={sectionLabel}>{label}</span>
      <div style={{ display: 'grid', gap: 6 }}>
        {groups.map(([name, mv], i) => {
          const w = totalMV > 0 ? (mv / totalMV) * 100 : 0
          return (
            <div key={name}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                <span style={{ color: PALETTE[i % PALETTE.length], fontSize: 11, textTransform: 'capitalize' }}>{name}</span>
                <span style={{ color: '#888', fontSize: 11, fontVariantNumeric: 'tabular-nums' }}>{fmt(w, 1)}%  <span style={{ color: '#444' }}>{fmtVal(mv)}</span></span>
              </div>
              <Bar pct={w} color={PALETTE[i % PALETTE.length]} height={7} />
            </div>
          )
        })}
      </div>
    </div>
  )

  // Geography
  const geoMap: Record<string, number> = {}
  for (const p of enriched) {
    const geo = p.ticker.endsWith('.AX') ? 'Australia' : p.ticker.endsWith('.L') ? 'UK' : p.ticker.endsWith('.T') ? 'Japan'
      : p.ticker.endsWith('.PA') || p.ticker.endsWith('.DE') || p.ticker.endsWith('.AS') || p.ticker.endsWith('.MI') ? 'Europe'
      : p.ticker.endsWith('.HK') ? 'Hong Kong' : p.ticker.endsWith('.TO') ? 'Canada'
      : p.ticker.includes('=') ? 'Global' : 'United States'
    geoMap[geo] = (geoMap[geo] ?? 0) + p.mv
  }
  const geoGroups = Object.entries(geoMap).sort((a, b) => b[1] - a[1])

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, alignContent: 'start' }}>
      <BreakdownTable groups={typeGroups}   label="ASSET CLASS" />
      <BreakdownTable groups={geoGroups}    label="GEOGRAPHY" />
      <div style={{ gridColumn: '1 / -1' }}>
        <BreakdownTable groups={sectorGroups} label="SECTOR (EQUITY)" />
      </div>
    </div>
  )
}

// ── BLOTTER ───────────────────────────────────────────────────────
function BlotterView({ positions, quotes, fx, baseCcy, onSelect }: { positions: Position[]; quotes: Record<string, Quote>; fx: FXRates; baseCcy: string; onSelect: (p: Position) => void }) {
  const [filterTicker, setFilterTicker] = useState('ALL')
  const tickers = ['ALL', ...Array.from(new Set(positions.map(p => p.ticker)))]

  const rows = positions
    .filter(p => filterTicker === 'ALL' || p.ticker === filterTicker)
    .sort((a, b) => b.addedAt - a.addedAt)

  const totalCost  = positions.reduce((s, p) => s + convertFX(p.shares * p.avgCost,                              p.currency, baseCcy, fx), 0)
  const totalValue = positions.reduce((s, p) => s + convertFX(p.shares * (quotes[p.ticker]?.c ?? p.avgCost),     p.currency, baseCcy, fx), 0)
  const totalPnl   = totalValue - totalCost
  const totalPnlPct = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0

  const th: React.CSSProperties   = { color: '#333', fontSize: 9, fontWeight: 'normal', padding: '4px 8px', textAlign: 'left', letterSpacing: '0.05em', borderBottom: '1px solid #111' }
  const cell: React.CSSProperties = { padding: '5px 8px', fontSize: 11, fontVariantNumeric: 'tabular-nums' }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Summary */}
      {positions.length > 0 && (
        <div style={{ display: 'flex', gap: 20, padding: '8px 16px', borderBottom: '1px solid #1a1a1a', background: '#040404', flexShrink: 0, flexWrap: 'wrap' }}>
          {([
            ['POSITIONS', String(positions.length), '#eee'],
            ['TOTAL COST BASIS', fmtVal(totalCost, baseCcy), '#eee'],
            ['CURRENT VALUE', fmtVal(totalValue, baseCcy), '#eee'],
            ['UNREALISED P&L', `${sign(totalPnl)}${fmtVal(Math.abs(totalPnl), baseCcy)}  (${pct(totalPnlPct)})`, clr(totalPnl)],
          ] as [string, string, string][]).map(([label, value, color]) => (
            <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ color: '#444', fontSize: 9, letterSpacing: '0.08em' }}>{label}</span>
              <span style={{ color, fontSize: 13, fontWeight: 'bold' }}>{value}</span>
            </div>
          ))}
        </div>
      )}

      {/* Filter toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', borderBottom: '1px solid #111', flexShrink: 0 }}>
        <span style={{ color: '#444', fontSize: 10 }}>FILTER:</span>
        <select value={filterTicker} onChange={e => setFilterTicker(e.target.value)}
          style={{ background: '#0a0a0a', border: '1px solid #222', color: '#888', fontFamily: 'inherit', fontSize: 10, padding: '3px 8px' }}>
          {tickers.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <span style={{ flex: 1 }} />
        <span style={{ color: '#333', fontSize: 10 }}>{rows.length} entr{rows.length === 1 ? 'y' : 'ies'} · edit via HOLDINGS tab</span>
      </div>

      {/* Table */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {rows.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#333', gap: 10 }}>
            <span style={{ fontSize: 13, letterSpacing: '0.06em' }}>NO POSITIONS</span>
            <span style={{ fontSize: 11 }}>Add positions via the HOLDINGS tab</span>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: '12%' }} /><col style={{ width: '8%' }} /><col style={{ width: '10%' }} />
              <col style={{ width: '10%' }} /><col style={{ width: '10%' }} /><col style={{ width: '10%' }} />
              <col style={{ width: '10%' }} /><col style={{ width: '12%' }} /><col style={{ width: '10%' }} />
              <col style={{ width: '8%' }} />
            </colgroup>
            <thead>
              <tr>
                <th style={th}>Added</th>
                <th style={th}>Ticker</th>
                <th style={{ ...th, textAlign: 'right' }}>Qty</th>
                <th style={{ ...th, textAlign: 'right' }}>Avg Cost</th>
                <th style={{ ...th, textAlign: 'right' }}>Last Price</th>
                <th style={{ ...th, textAlign: 'right' }}>Cost Basis</th>
                <th style={{ ...th, textAlign: 'right' }}>Mkt Value</th>
                <th style={{ ...th, textAlign: 'right' }}>Unreal. P&L</th>
                <th style={{ ...th, textAlign: 'right' }}>Return</th>
                <th style={{ ...th, textAlign: 'right' }}>Currency</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(p => {
                const q      = quotes[p.ticker]
                const last   = q?.c ?? null
                const cost   = convertFX(p.shares * p.avgCost, p.currency, baseCcy, fx)
                const mv     = last != null ? convertFX(p.shares * last, p.currency, baseCcy, fx) : null
                const upnl   = mv != null ? mv - cost : null
                const ret    = upnl != null && cost > 0 ? (upnl / cost) * 100 : null
                return (
                  <tr key={p.id} style={{ borderBottom: '1px solid #0d0d0d', cursor: 'pointer' }}
                    onClick={() => onSelect(p)}
                    onMouseEnter={e => (e.currentTarget.style.background = '#080808')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <td style={{ ...cell, color: '#555' }}>
                      {new Date(p.addedAt).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: '2-digit' })}
                    </td>
                    <td style={{ ...cell, color: '#4d9fff', fontWeight: 'bold' }}>{p.ticker}</td>
                    <td style={{ ...cell, color: '#888', textAlign: 'right' }}>{fmt(p.shares, p.shares % 1 === 0 ? 0 : 2)}</td>
                    <td style={{ ...cell, color: '#666', textAlign: 'right' }}>{fmtVal(p.avgCost, p.currency)}</td>
                    <td style={{ ...cell, color: '#eee', textAlign: 'right', fontWeight: 'bold' }}>{last != null ? fmtVal(last, p.currency) : '…'}</td>
                    <td style={{ ...cell, color: '#888', textAlign: 'right' }}>{fmtVal(cost, baseCcy)}</td>
                    <td style={{ ...cell, color: '#ccc', textAlign: 'right' }}>{mv != null ? fmtVal(mv, baseCcy) : '—'}</td>
                    <td style={{ ...cell, textAlign: 'right', color: upnl != null ? clr(upnl) : '#333', fontWeight: 'bold' }}>
                      {upnl != null ? `${sign(upnl)}${fmtVal(Math.abs(upnl), baseCcy)}` : '—'}
                    </td>
                    <td style={{ ...cell, textAlign: 'right', color: ret != null ? clr(ret) : '#333' }}>
                      {ret != null ? pct(ret) : '—'}
                    </td>
                    <td style={{ ...cell, color: '#444', textAlign: 'right' }}>{p.currency}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

// ── HISTORY (P&L chart) view ──────────────────────────────────────
type RangeKey = '1mo' | '3mo' | '6mo' | '1y' | '2y' | '5y'
const RANGES: RangeKey[] = ['1mo', '3mo', '6mo', '1y', '2y', '5y']

function HistoryView({ positions, fx, baseCcy }: {
  positions: Position[]; fx: FXRates; baseCcy: string
}) {
  const chartRef  = useRef<HTMLDivElement>(null)
  const [range, setRange] = useState<RangeKey>('1y')
  const [showBench, setShowBench] = useState(true)

  // Unique tickers (+ SPY as benchmark)
  const tickers = useMemo(() => Array.from(new Set(positions.map(p => p.ticker))), [positions])

  // Fetch history for all portfolio tickers in parallel
  const histQueries = useQueries({
    queries: tickers.map(ticker => ({
      queryKey: ['history', ticker, range],
      queryFn: () => fetch(`/api/history?symbol=${encodeURIComponent(ticker)}&range=${range}`)
        .then(r => r.json()) as Promise<HistoryPoint[]>,
      staleTime: 30 * 60_000,
      enabled: tickers.length > 0,
    }))
  })

  // SPY benchmark
  const { data: spyHistory = [] } = useQuery<HistoryPoint[]>({
    queryKey: ['history', 'SPY', range],
    queryFn: () => fetch(`/api/history?symbol=SPY&range=${range}`).then(r => r.json()),
    staleTime: 30 * 60_000,
  })

  const isLoading = histQueries.some(q => q.isLoading)

  // Build portfolio value series
  const { portfolioSeries, costSeries, spySeries } = useMemo(() => {
    if (!histQueries.length || histQueries.every(q => !q.data)) return { portfolioSeries: [], costSeries: [], spySeries: [] }

    // Map ticker → history
    const histMap: Record<string, Record<string, number>> = {}
    tickers.forEach((ticker, i) => {
      const pts = histQueries[i]?.data ?? []
      histMap[ticker] = {}
      for (const p of pts) histMap[ticker][p.t] = p.c
    })

    // All dates across all histories, sorted
    const allDates = Array.from(new Set(
      Object.values(histMap).flatMap(h => Object.keys(h))
    )).sort()

    const portfolioSeries: { time: string; value: number }[] = []
    const costSeries:      { time: string; value: number }[] = []

    for (const date of allDates) {
      let totalValue = 0, totalCost = 0, hasAny = false

      for (const pos of positions) {
        // Only include position from its addedAt date
        const addedDate = new Date(pos.addedAt).toISOString().slice(0, 10)
        if (date < addedDate) continue

        const hist = histMap[pos.ticker]
        // Forward-fill: find latest price on or before this date
        const price = hist?.[date] ?? null
        if (price == null) continue

        hasAny = true
        totalValue += convertFX(pos.shares * price,       pos.currency, baseCcy, fx)
        totalCost  += convertFX(pos.shares * pos.avgCost, pos.currency, baseCcy, fx)
      }

      if (hasAny && totalValue > 0) {
        portfolioSeries.push({ time: date, value: Number(totalValue.toFixed(2)) })
        costSeries.push({ time: date, value: Number(totalCost.toFixed(2)) })
      }
    }

    // Normalise SPY to start at first portfolio value (index comparison)
    const spySeries: { time: string; value: number }[] = []
    if (spyHistory.length && portfolioSeries.length) {
      const portStart = portfolioSeries[0].value
      const spyStart  = spyHistory[0].c
      if (spyStart > 0) {
        for (const p of spyHistory) {
          spySeries.push({ time: p.t, value: Number(((p.c / spyStart) * portStart).toFixed(2)) })
        }
      }
    }

    return { portfolioSeries, costSeries, spySeries }
  }, [histQueries, tickers, positions, fx, baseCcy, spyHistory])

  // Render chart with lightweight-charts v5
  useEffect(() => {
    if (!chartRef.current || portfolioSeries.length === 0) return

    let chart: ReturnType<typeof import('lightweight-charts').createChart> | null = null

    ;(async () => {
      const { createChart, AreaSeries, LineSeries } = await import('lightweight-charts')
      const el = chartRef.current
      if (!el) return

      chart = createChart(el, {
        width: el.clientWidth,
        height: el.clientHeight,
        layout:      { background: { color: '#040404' }, textColor: '#555' },
        grid:        { vertLines: { color: '#0d0d0d' }, horzLines: { color: '#0d0d0d' } },
        crosshair:   { vertLine: { color: '#2a2a2a' }, horzLine: { color: '#2a2a2a' } },
        rightPriceScale: { borderColor: '#1a1a1a' },
        timeScale:   { borderColor: '#1a1a1a', timeVisible: true },
      })

      // Portfolio value area
      const portSeries = chart.addSeries(AreaSeries, {
        lineColor:    '#33ff66',
        topColor:     'rgba(51,255,102,0.18)',
        bottomColor:  'rgba(51,255,102,0.0)',
        lineWidth:    2,
        priceFormat:  { type: 'price', precision: 2, minMove: 0.01 },
      })
      portSeries.setData(portfolioSeries)

      // Cost basis dashed line
      const costLine = chart.addSeries(LineSeries, {
        color:       '#ffa028',
        lineWidth:   1,
        lineStyle:   2,   // dashed
        priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
      })
      costLine.setData(costSeries)

      // SPY benchmark (normalised)
      if (showBench && spySeries.length) {
        const benchLine = chart.addSeries(LineSeries, {
          color:     '#4d9fff',
          lineWidth: 1,
          lineStyle: 1,   // dotted
          priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
        })
        benchLine.setData(spySeries)
      }

      chart.timeScale().fitContent()

      const obs = new ResizeObserver(() => {
        if (el && chart) chart.resize(el.clientWidth, el.clientHeight)
      })
      obs.observe(el)

      return () => { obs.disconnect(); chart?.remove() }
    })().then(cleanup => {
      // store cleanup for effect return — handled below
    })

    return () => { chart?.remove() }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [portfolioSeries, costSeries, spySeries, showBench])

  // Summary stats
  const firstVal = portfolioSeries[0]?.value ?? 0
  const lastVal  = portfolioSeries[portfolioSeries.length - 1]?.value ?? 0
  const lastCost = costSeries[costSeries.length - 1]?.value ?? 0
  const totalReturn = firstVal > 0 ? ((lastVal - firstVal) / firstVal) * 100 : 0
  const unrealisedPnl = lastVal - lastCost

  if (positions.length === 0) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#333', fontSize: 13, letterSpacing: '0.06em' }}>
      NO POSITIONS — add holdings to plot P&L history
    </div>
  )

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '6px 16px', borderBottom: '1px solid #111', flexShrink: 0, flexWrap: 'wrap' }}>
        {/* Range selector */}
        <div style={{ display: 'flex', gap: 2 }}>
          {RANGES.map(r => (
            <button key={r} onClick={() => setRange(r)} style={{
              background: range === r ? '#1a1a0a' : 'none',
              border: `1px solid ${range === r ? '#ffa028' : '#1a1a1a'}`,
              color: range === r ? '#ffa028' : '#555',
              fontFamily: 'inherit', fontSize: 10, padding: '2px 8px', cursor: 'pointer',
            }}>{r.toUpperCase()}</button>
          ))}
        </div>

        {/* Legend */}
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginLeft: 8 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: '#33ff66' }}>
            <span style={{ width: 16, height: 2, background: '#33ff66', display: 'inline-block' }} />Portfolio Value
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: '#ffa028' }}>
            <span style={{ width: 16, height: 2, background: '#ffa028', display: 'inline-block', opacity: 0.7 }} />Cost Basis
          </span>
          <button onClick={() => setShowBench(b => !b)} style={{
            display: 'flex', alignItems: 'center', gap: 5, fontSize: 10,
            color: showBench ? '#4d9fff' : '#333', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0,
          }}>
            <span style={{ width: 16, height: 2, background: showBench ? '#4d9fff' : '#333', display: 'inline-block' }} />SPY (normalised)
          </button>
        </div>

        {/* Summary stats */}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 20 }}>
          {[
            ['Range Return', totalReturn ? `${totalReturn >= 0 ? '+' : ''}${totalReturn.toFixed(2)}%` : '—', totalReturn ? clr(totalReturn) : '#555'],
            ['Unrealised P&L', unrealisedPnl ? `${unrealisedPnl >= 0 ? '+' : ''}${fmtVal(Math.abs(unrealisedPnl), baseCcy)}` : '—', unrealisedPnl ? clr(unrealisedPnl) : '#555'],
            ['Current Value', lastVal ? fmtVal(lastVal, baseCcy) : '—', '#eee'],
          ].map(([label, val, col]) => (
            <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <span style={{ color: '#444', fontSize: 9, letterSpacing: '0.07em' }}>{label}</span>
              <span style={{ color: col, fontSize: 12, fontWeight: 'bold', fontVariantNumeric: 'tabular-nums' }}>{val}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Chart */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        {isLoading && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2, color: '#444', fontSize: 11, letterSpacing: '0.08em' }}>
            LOADING HISTORICAL DATA…
          </div>
        )}
        <div ref={chartRef} style={{ width: '100%', height: '100%' }} />
      </div>
    </div>
  )
}

// ── Squarified Treemap ────────────────────────────────────────────
interface TreeNode { id: string; value: number; [key: string]: unknown }
interface Rect { x: number; y: number; w: number; h: number }

function squarify(nodes: TreeNode[], x: number, y: number, w: number, h: number): (TreeNode & Rect)[] {
  if (!nodes.length) return []
  const total = nodes.reduce((s, n) => s + n.value, 0)
  if (total === 0 || w <= 0 || h <= 0) return []

  const result: (TreeNode & Rect)[] = []
  let remaining = [...nodes]
  let rx = x, ry = y, rw = w, rh = h

  while (remaining.length) {
    const area = rw * rh
    const isWide = rw >= rh
    const rowTotal = remaining.reduce((s, n) => s + n.value, 0)

    // Greedy: keep adding to current row while aspect ratio improves
    let rowNodes: TreeNode[] = []
    let rowSum = 0

    for (let i = 0; i < remaining.length; i++) {
      const candidate = [...rowNodes, remaining[i]]
      const candidateSum = rowSum + remaining[i].value
      const stripe = isWide ? rw * (candidateSum / rowTotal) : rh * (candidateSum / rowTotal)

      if (rowNodes.length === 0) {
        rowNodes.push(remaining[i])
        rowSum += remaining[i].value
        continue
      }

      const prevWorst = Math.max(...rowNodes.map(n => {
        const prev_stripe = isWide ? rw * (rowSum / rowTotal) : rh * (rowSum / rowTotal)
        const s = isWide ? rh * (n.value / rowSum) * (area / (rw * rh)) : rw * (n.value / rowSum) * (area / (rw * rh))
        return Math.max(prev_stripe / s, s / prev_stripe)
      }))

      const newStripe = isWide ? rw * (candidateSum / rowTotal) : rh * (candidateSum / rowTotal)
      const newH = isWide ? rh * (remaining[i].value / candidateSum) * (rowTotal / (rowTotal)) : rw * (remaining[i].value / candidateSum) * (rowTotal / rowTotal)

      if (candidate.length > 1 && prevWorst < 2) {
        rowNodes.push(remaining[i])
        rowSum += remaining[i].value
      } else break
    }

    // Lay out row
    const rowFrac = rowSum / rowTotal
    const stripe = isWide ? rw * rowFrac : rh * rowFrac
    let cursor = isWide ? ry : rx

    for (const n of rowNodes) {
      const frac = n.value / rowSum
      const nw = isWide ? stripe : rw * frac
      const nh = isWide ? rh * frac : stripe
      const nx = isWide ? rx : cursor
      const ny = isWide ? cursor : ry
      result.push({ ...n, x: nx, y: ny, w: nw, h: nh })
      cursor += isWide ? nh : nw
    }

    if (isWide) { rx += stripe; rw -= stripe }
    else        { ry += stripe; rh -= stripe }

    remaining = remaining.slice(rowNodes.length)
  }

  return result
}

// ── HEAT MAP view ─────────────────────────────────────────────────
function HeatMapView({ positions, quotes, fx, baseCcy, metrics, onSelect }: {
  positions: Position[]; quotes: Record<string, Quote>; fx: FXRates
  baseCcy: string; metrics: Record<string, SymbolMetrics>; onSelect: (p: Position) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [dims, setDims] = useState({ w: 800, h: 500 })
  const [groupBy, setGroupBy] = useState<'none' | 'sector' | 'type'>('sector')
  const [hovered, setHovered] = useState<string | null>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const obs = new ResizeObserver(([e]) => {
      setDims({ w: e.contentRect.width, h: e.contentRect.height })
    })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  // Build enriched data
  const nodes = useMemo(() => positions.map(p => {
    const q   = quotes[p.ticker]
    const m   = metrics[p.ticker]
    const mv  = q?.c ? convertFX(p.shares * q.c, p.currency, baseCcy, fx) : convertFX(p.shares * p.avgCost, p.currency, baseCcy, fx)
    const dp  = q?.dp ?? null          // day change %
    const ret = q?.c ? ((q.c - p.avgCost) / p.avgCost) * 100 : null   // total return %
    const sector = m?.sector ?? assetType(p.ticker)
    return { id: p.id, ticker: p.ticker, value: Math.max(mv, 0.01), mv, dp, ret, sector, pos: p }
  }).filter(n => n.value > 0), [positions, quotes, fx, baseCcy, metrics])

  const totalMV = nodes.reduce((s, n) => s + n.mv, 0)

  // Colour by day % (-3% → red, 0 → neutral, +3% → green)
  function dpColor(dp: number | null) {
    if (dp == null) return '#1a1a1a'
    const t = Math.max(-1, Math.min(1, dp / 3))   // clamp to [-1,1]
    if (t >= 0) {
      const g = Math.round(80 + t * 175)
      return `rgb(0,${g},30)`
    } else {
      const r = Math.round(80 + Math.abs(t) * 175)
      return `rgb(${r},0,0)`
    }
  }

  // Layout: optionally group by sector/type, then treemap each group
  const layout = useMemo(() => {
    const PAD = 2
    const HEADER = groupBy !== 'none' ? 18 : 0

    if (groupBy === 'none') {
      const sorted = [...nodes].sort((a, b) => b.value - a.value)
      return squarify(sorted, 0, 0, dims.w, dims.h).map(n => ({ ...n, groupLabel: null }))
    }

    // Group
    const groups: Record<string, typeof nodes> = {}
    for (const n of nodes) {
      const key = groupBy === 'sector' ? (n.sector ?? 'Other') : assetType(n.ticker)
      ;(groups[key] = groups[key] ?? []).push(n)
    }

    const groupTotals = Object.entries(groups).map(([k, ns]) => ({
      id: k, value: ns.reduce((s, n) => s + n.value, 0), nodes: ns,
    })).sort((a, b) => b.value - a.value)

    // Lay out groups first
    const groupRects = squarify(groupTotals.map(g => ({ id: g.id, value: g.value })), 0, 0, dims.w, dims.h)

    // Then lay out each group's nodes inside its rect
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any[] = []
    for (const gr of groupRects) {
      const g = groupTotals.find(g => g.id === gr.id)!
      const inner = squarify(
        g.nodes.sort((a, b) => b.value - a.value),
        gr.x + PAD, gr.y + PAD + HEADER,
        gr.w - PAD * 2, gr.h - PAD * 2 - HEADER,
      )
      result.push(...inner.map(n => ({ ...n, groupLabel: null })))
      // Inject group label as sentinel (handled in SVG render)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      result.push({ id: `__label__${gr.id}`, value: 0, ticker: '', mv: 0, dp: 0, ret: null, sector: '', pos: {} as Position, x: gr.x, y: gr.y, w: gr.w, h: HEADER, groupLabel: gr.id } as any)
    }
    return result
  }, [nodes, dims, groupBy])

  if (positions.length === 0) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#333', fontSize: 13, letterSpacing: '0.06em' }}>
      NO POSITIONS — add holdings to see heat map
    </div>
  )

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '6px 16px', borderBottom: '1px solid #111', flexShrink: 0 }}>
        <span style={{ color: '#444', fontSize: 10 }}>GROUP BY:</span>
        {(['none', 'sector', 'type'] as const).map(g => (
          <button key={g} onClick={() => setGroupBy(g)} style={{
            background: groupBy === g ? '#1a1a0a' : 'none',
            border: `1px solid ${groupBy === g ? '#ffa028' : '#2a2a2a'}`,
            color: groupBy === g ? '#ffa028' : '#555',
            fontFamily: 'inherit', fontSize: 10, padding: '2px 10px', cursor: 'pointer',
          }}>{g.toUpperCase()}</button>
        ))}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Legend */}
          <span style={{ color: '#333', fontSize: 9 }}>Day return:</span>
          {[-3,-2,-1,0,1,2,3].map(v => (
            <div key={v} style={{ width: 18, height: 10, background: dpColor(v), border: '1px solid #111' }} title={`${v > 0 ? '+' : ''}${v}%`} />
          ))}
          <span style={{ color: '#555', fontSize: 9 }}>–3% → +3%</span>
        </div>
      </div>

      {/* Heat map canvas */}
      <div ref={containerRef} style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <svg width={dims.w} height={dims.h} style={{ display: 'block' }}>
          {layout.map(n => {
            // Group label bar
            if ((n as unknown as { groupLabel: string | null }).groupLabel) {
              const gl = (n as unknown as { groupLabel: string }).groupLabel
              return (
                <g key={`label-${gl}`}>
                  <rect x={n.x} y={n.y} width={n.w} height={n.h} fill="#0a0a0a" stroke="#1a1a1a" strokeWidth={1} />
                  <text x={n.x + 6} y={n.y + 13} fontSize={10} fill="#ffa028" fontFamily="monospace" style={{ letterSpacing: '0.08em' }}>
                    {gl.toUpperCase()}
                  </text>
                </g>
              )
            }

            const node = n as typeof nodes[0] & Rect
            const isHov = hovered === node.id
            const wt = totalMV > 0 ? (node.mv / totalMV) * 100 : 0
            const bgColor = dpColor(node.dp)
            const textColor = node.dp == null ? '#555' : Math.abs(node.dp) > 1 ? '#fff' : '#ccc'
            const tooSmall = n.w < 40 || n.h < 28

            return (
              <g key={node.id} style={{ cursor: 'pointer' }}
                onClick={() => onSelect(node.pos)}
                onMouseEnter={() => setHovered(node.id)}
                onMouseLeave={() => setHovered(null)}
              >
                <rect
                  x={n.x + 1} y={n.y + 1} width={n.w - 2} height={n.h - 2}
                  fill={bgColor}
                  stroke={isHov ? '#fff' : '#0a0a0a'}
                  strokeWidth={isHov ? 2 : 1}
                  rx={2}
                />
                {!tooSmall && (
                  <>
                    <text x={n.x + 6} y={n.y + 16} fontSize={Math.min(13, n.w / node.ticker.length * 1.4)} fontWeight="bold" fill={textColor} fontFamily="monospace">
                      {node.ticker}
                    </text>
                    {n.h > 44 && (
                      <text x={n.x + 6} y={n.y + 30} fontSize={10} fill={textColor} fontFamily="monospace" opacity={0.85}>
                        {node.dp != null ? `${node.dp >= 0 ? '+' : ''}${node.dp.toFixed(2)}%` : '—'}
                      </text>
                    )}
                    {n.h > 60 && (
                      <text x={n.x + 6} y={n.y + 44} fontSize={9} fill={textColor} fontFamily="monospace" opacity={0.6}>
                        {fmtVal(node.mv, baseCcy)}  ·  {wt.toFixed(1)}%
                      </text>
                    )}
                    {n.h > 76 && node.ret != null && (
                      <text x={n.x + 6} y={n.y + 58} fontSize={9} fill={node.ret >= 0 ? '#66ff99' : '#ff6666'} fontFamily="monospace" opacity={0.7}>
                        {node.ret >= 0 ? '+' : ''}{node.ret.toFixed(1)}% total
                      </text>
                    )}
                  </>
                )}
                {tooSmall && n.w > 16 && n.h > 14 && (
                  <text x={n.x + n.w / 2} y={n.y + n.h / 2 + 4} fontSize={8} fill={textColor} fontFamily="monospace" textAnchor="middle">
                    {node.ticker}
                  </text>
                )}
              </g>
            )
          })}
        </svg>

        {/* Hover tooltip */}
        {hovered && (() => {
          const n = layout.find(n => n.id === hovered) as (typeof nodes[0] & Rect) | undefined
          if (!n || !(n as unknown as { groupLabel: unknown }).groupLabel === undefined) return null
          const wt = totalMV > 0 ? (n.mv / totalMV) * 100 : 0
          const cost = n.pos.shares * n.pos.avgCost
          const mv   = n.mv
          const upnl = mv - convertFX(cost, n.pos.currency, baseCcy, fx)
          return (
            <div style={{
              position: 'absolute', top: 8, right: 8, pointerEvents: 'none',
              background: '#060606', border: '1px solid #2a2a2a', padding: '10px 14px',
              minWidth: 180, zIndex: 10,
            }}>
              <div style={{ color: '#4d9fff', fontSize: 13, fontWeight: 'bold', marginBottom: 6 }}>{n.ticker}</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'auto auto', gap: '3px 16px' }}>
                {[
                  ['Day',    n.dp != null ? `${n.dp >= 0 ? '+' : ''}${n.dp.toFixed(2)}%` : '—',  n.dp != null ? clr(n.dp) : '#555'],
                  ['Total',  n.ret != null ? `${n.ret >= 0 ? '+' : ''}${n.ret.toFixed(2)}%` : '—', n.ret != null ? clr(n.ret) : '#555'],
                  ['Value',  fmtVal(n.mv, baseCcy), '#ccc'],
                  ['P&L',   `${upnl >= 0 ? '+' : ''}${fmtVal(Math.abs(upnl), baseCcy)}`, clr(upnl)],
                  ['Weight', `${wt.toFixed(1)}%`, '#888'],
                ].map(([label, val, col]) => (
                  <>
                    <span key={`l-${label}`} style={{ color: '#555', fontSize: 10 }}>{label}</span>
                    <span key={`v-${label}`} style={{ color: col as string, fontSize: 11, fontWeight: 'bold', fontVariantNumeric: 'tabular-nums', textAlign: 'right' }}>{val}</span>
                  </>
                ))}
              </div>
            </div>
          )
        })()}
      </div>
    </div>
  )
}

// ── Alert Manager (used inside PositionDetail) ───────────────────
function AlertManager({ pos, price, alerts, addAlert, removeAlert }: {
  pos: Position
  price: number | null
  alerts: import('@/lib/store').PriceAlert[]
  addAlert: (a: Omit<import('@/lib/store').PriceAlert, 'id' | 'createdAt'>) => void
  removeAlert: (id: string) => void
}) {
  const [type,  setType]  = useState<'TARGET' | 'STOP'>('TARGET')
  const [value, setValue] = useState('')
  const [note,  setNote]  = useState('')

  const posAlerts = alerts.filter(a => a.ticker === pos.ticker)

  const inputStyle: React.CSSProperties = {
    background: '#0a0a0a', border: '1px solid #2a2a2a', color: '#eee',
    fontFamily: 'inherit', fontSize: 11, padding: '4px 6px',
  }

  const handleAdd = () => {
    const price = parseFloat(value)
    if (!price || price <= 0) return
    addAlert({ ticker: pos.ticker, type, price, note: note.trim() || undefined })
    setValue(''); setNote('')
  }

  return (
    <div>
      {/* Existing alerts */}
      {posAlerts.length > 0 && (
        <div style={{ display: 'grid', gap: 4, marginBottom: 10 }}>
          {posAlerts.map(a => {
            const triggered = price != null && (
              (a.type === 'TARGET' && price >= a.price) ||
              (a.type === 'STOP'   && price <= a.price)
            )
            return (
              <div key={a.id} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '5px 8px',
                background: triggered ? (a.type === 'TARGET' ? '#0a1a0a' : '#1a0505') : '#0a0a0a',
                border: `1px solid ${triggered ? (a.type === 'TARGET' ? '#1a3a1a' : '#3a1010') : '#1a1a1a'}`,
              }}>
                <div>
                  <span style={{ fontSize: 9, color: a.type === 'TARGET' ? '#33ff66' : '#ff3b3b', fontWeight: 'bold', marginRight: 6 }}>{a.type}</span>
                  <span style={{ color: '#eee', fontSize: 11, fontVariantNumeric: 'tabular-nums' }}>{fmtVal(a.price, pos.currency)}</span>
                  {triggered && <span style={{ marginLeft: 6, fontSize: 9 }}>{a.type === 'TARGET' ? '🎯' : '🛑'}</span>}
                  {a.note && <div style={{ color: '#555', fontSize: 9, marginTop: 1 }}>{a.note}</div>}
                </div>
                <button onClick={() => removeAlert(a.id)} style={{ background: 'none', border: 'none', color: '#ff3b3b', cursor: 'pointer', fontSize: 12, padding: '0 4px' }}>×</button>
              </div>
            )
          })}
        </div>
      )}

      {/* Add new alert */}
      <div style={{ display: 'grid', gap: 6 }}>
        <div style={{ display: 'flex', gap: 4 }}>
          {(['TARGET', 'STOP'] as const).map(t => (
            <button key={t} onClick={() => setType(t)} style={{
              flex: 1, ...inputStyle, cursor: 'pointer',
              color: type === t ? (t === 'TARGET' ? '#33ff66' : '#ff3b3b') : '#444',
              border: `1px solid ${type === t ? (t === 'TARGET' ? '#1a3a1a' : '#3a1010') : '#2a2a2a'}`,
              background: type === t ? (t === 'TARGET' ? '#0a1a0a' : '#1a0505') : '#0a0a0a',
            }}>{t}</button>
          ))}
        </div>
        <input style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }}
          type="number" min="0" step="any" placeholder={`Alert price${price ? ` (now ${fmtVal(price, pos.currency)})` : ''}`}
          value={value} onChange={e => setValue(e.target.value)} />
        <input style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }}
          type="text" placeholder="Note (optional)"
          value={note} onChange={e => setNote(e.target.value)} />
        <button onClick={handleAdd} disabled={!parseFloat(value)} style={{
          background: parseFloat(value) ? '#0a1a0a' : '#0a0a0a',
          border: `1px solid ${parseFloat(value) ? '#1a3a1a' : '#2a2a2a'}`,
          color: parseFloat(value) ? '#33ff66' : '#444',
          fontFamily: 'inherit', fontSize: 10, padding: '5px', cursor: parseFloat(value) ? 'pointer' : 'default',
          letterSpacing: '0.06em',
        }}>+ SET ALERT</button>
      </div>
    </div>
  )
}

// ── Position Detail Drawer ────────────────────────────────────────
function PositionDetail({ pos, onClose, onEdit, alerts, addAlert, removeAlert }: {
  pos: Position
  onClose: () => void
  onEdit: (p: Position) => void
  alerts: import('@/lib/store').PriceAlert[]
  addAlert: (a: Omit<import('@/lib/store').PriceAlert, 'id' | 'createdAt'>) => void
  removeAlert: (id: string) => void
}) {
  const { data: quote } = useQuery<{ c: number; d: number; dp: number; h: number; l: number; o: number; pc: number }>({
    queryKey: ['pos-quote', pos.ticker],
    queryFn: () => fetch(`/api/finnhub/quote?symbol=${pos.ticker}`).then(r => r.json()).catch(() => null),
    refetchInterval: 30_000,
  })
  const { data: metrics } = useQuery<SymbolMetrics>({
    queryKey: ['pos-metrics', pos.ticker],
    queryFn: () => fetch(`/api/portfolio/metrics?symbols=${pos.ticker}`).then(r => r.json()).then(d => d[pos.ticker] ?? null).catch(() => null),
    staleTime: 60 * 60_000,
  })
  const { data: profile } = useQuery<{ name: string; exchange: string; finnhubIndustry: string; weburl: string; logo: string } | null>({
    queryKey: ['profile', pos.ticker],
    queryFn: () => fetch(`/api/finnhub/profile?symbol=${pos.ticker}`).then(r => r.json()).catch(() => null),
    staleTime: 24 * 60 * 60_000,
  })

  const price    = quote?.c ?? null
  const cost     = pos.shares * pos.avgCost
  const mv       = price != null ? pos.shares * price : null
  const upnl     = mv != null ? mv - cost : null
  const ret      = upnl != null && cost > 0 ? (upnl / cost) * 100 : null
  const dayPnl   = quote?.d != null ? pos.shares * quote.d : null
  const type     = assetType(pos.ticker)
  const typeColor = type === 'commodity' ? '#ffa028' : type === 'bond' ? '#4d9fff' : '#33ff66'

  const row = (label: string, value: string, color = '#ccc') => (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid #0d0d0d' }}>
      <span style={{ color: '#555', fontSize: 11 }}>{label}</span>
      <span style={{ color, fontSize: 11, fontVariantNumeric: 'tabular-nums', fontWeight: 'bold' }}>{value}</span>
    </div>
  )

  const section = (label: string) => (
    <div style={{ color: '#ffa028', fontSize: 9, letterSpacing: '0.1em', fontWeight: 'bold', marginTop: 16, marginBottom: 6 }}>{label}</div>
  )

  return (
    <div style={{
      width: 320, minWidth: 320, height: '100%',
      background: '#060606', borderLeft: '1px solid #2a2a2a',
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
      flexShrink: 0,
    }}>
      {/* Header */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid #1a1a1a', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexShrink: 0 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
            <span style={{ color: '#4d9fff', fontSize: 16, fontWeight: 'bold' }}>{pos.ticker}</span>
            <span style={{ fontSize: 8, color: typeColor, border: `1px solid ${typeColor}`, padding: '1px 5px' }}>{type.toUpperCase()}</span>
          </div>
          {profile?.name && <div style={{ color: '#666', fontSize: 10 }}>{profile.name}</div>}
          {profile?.finnhubIndustry && <div style={{ color: '#444', fontSize: 9, marginTop: 1 }}>{profile.finnhubIndustry}</div>}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button onClick={() => onEdit(pos)} style={{ background: 'none', border: '1px solid #333', color: '#4d9fff', fontFamily: 'inherit', fontSize: 9, padding: '3px 8px', cursor: 'pointer' }}>EDIT</button>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#555', fontSize: 16, cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>
      </div>

      {/* Price hero */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid #1a1a1a', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <span style={{ color: '#fff', fontSize: 22, fontWeight: 'bold', fontVariantNumeric: 'tabular-nums' }}>
            {price != null ? fmtVal(price, pos.currency) : '…'}
          </span>
          {quote?.d != null && (
            <span style={{ color: clr(quote.d), fontSize: 12 }}>
              {sign(quote.d)}{fmtVal(Math.abs(quote.d), pos.currency)}  ({pct(quote.dp)})
            </span>
          )}
        </div>
        {quote && (
          <div style={{ display: 'flex', gap: 12, marginTop: 6, fontSize: 10, color: '#555' }}>
            <span>O: <span style={{ color: '#888' }}>{fmtVal(quote.o, pos.currency)}</span></span>
            <span>H: <span style={{ color: '#33ff66' }}>{fmtVal(quote.h, pos.currency)}</span></span>
            <span>L: <span style={{ color: '#ff3b3b' }}>{fmtVal(quote.l, pos.currency)}</span></span>
            <span>Prev: <span style={{ color: '#888' }}>{fmtVal(quote.pc, pos.currency)}</span></span>
          </div>
        )}
      </div>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px 16px' }}>

        {section('YOUR POSITION')}
        {row('Shares / Units', fmt(pos.shares, pos.shares % 1 === 0 ? 0 : 3))}
        {row('Avg Cost', fmtVal(pos.avgCost, pos.currency))}
        {row('Cost Basis', fmtVal(cost, pos.currency))}
        {row('Market Value', mv != null ? fmtVal(mv, pos.currency) : '…')}
        {row('Unrealised P&L', upnl != null ? `${sign(upnl)}${fmtVal(Math.abs(upnl), pos.currency)}` : '…', upnl != null ? clr(upnl) : '#555')}
        {row('Total Return', ret != null ? pct(ret) : '…', ret != null ? clr(ret) : '#555')}
        {row('Day P&L', dayPnl != null ? `${sign(dayPnl)}${fmtVal(Math.abs(dayPnl), pos.currency)}` : '…', dayPnl != null ? clr(dayPnl) : '#555')}

        {/* Break-even */}
        {price != null && upnl != null && upnl < 0 && (
          <>
            {section('BREAK-EVEN ANALYSIS')}
            {row('Break-even Price', fmtVal(pos.avgCost, pos.currency))}
            {row('Distance to B/E', pct(((pos.avgCost - price) / price) * 100), '#ffa028')}
            {row('Units to Break-even', fmt(cost / price, 0) + ' @ mkt')}
          </>
        )}

        {/* 52-week range */}
        {(metrics?.week52High != null || metrics?.week52Low != null) && (
          <>
            {section('52-WEEK RANGE')}
            {metrics.week52Low  != null && row('52W Low',  fmtVal(metrics.week52Low,  pos.currency), '#ff3b3b')}
            {price != null              && row('Current',  fmtVal(price, pos.currency), '#fff')}
            {metrics.week52High != null && row('52W High', fmtVal(metrics.week52High, pos.currency), '#33ff66')}
            {metrics.week52High != null && metrics.week52Low != null && price != null && (
              <div style={{ marginTop: 8 }}>
                <RangeGauge low={metrics.week52Low} high={metrics.week52High} current={price} />
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3, fontSize: 9, color: '#444' }}>
                  <span>{fmtVal(metrics.week52Low, pos.currency)}</span>
                  <span>{fmt(((price - metrics.week52Low) / (metrics.week52High - metrics.week52Low)) * 100, 0)}% of range</span>
                  <span>{fmtVal(metrics.week52High, pos.currency)}</span>
                </div>
              </div>
            )}
            {metrics.week52High != null && price != null && row('From 52W High', pct(((price - metrics.week52High) / metrics.week52High) * 100), clr(price - metrics.week52High))}
          </>
        )}

        {/* Fundamentals */}
        {(metrics?.beta != null || metrics?.marketCap != null || metrics?.dividendYield != null) && (
          <>
            {section('FUNDAMENTALS')}
            {metrics.beta        != null && row('Beta',           fmt(metrics.beta))}
            {metrics.marketCap   != null && row('Market Cap',     fmtVal(metrics.marketCap))}
            {metrics.sector      != null && row('Sector',         metrics.sector, '#888')}
            {metrics.industry    != null && row('Industry',       metrics.industry, '#666')}
            {metrics.dividendYield != null && row('Dividend Yield', `${fmt(metrics.dividendYield)}%`, '#ffa028')}
          </>
        )}

        {/* Price Alerts */}
        {section('PRICE ALERTS')}
        <AlertManager pos={pos} price={price} alerts={alerts} addAlert={addAlert} removeAlert={removeAlert} />

        {/* Added info */}
        {section('POSITION INFO')}
        {row('Added', new Date(pos.addedAt).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' }))}
        {row('Currency', pos.currency)}
        {row('Days Held', String(Math.floor((Date.now() - pos.addedAt) / 86_400_000)))}
      </div>
    </div>
  )
}

// ── Main PORT panel ───────────────────────────────────────────────
type SubView = 'HOLDINGS' | 'MAP' | 'HISTORY' | 'PERFORMANCE' | 'RISK' | 'ALLOCATION' | 'BLOTTER'

export function PORT() {
  const { positions, addPosition, updatePosition, removePosition, alerts, addAlert, removeAlert } = useTerminalStore()
  const [modal,      setModal]      = useState<'add' | Position | null>(null)
  const [subView,    setSubView]    = useState<SubView>('HOLDINGS')
  const [detailPos,  setDetailPos]  = useState<Position | null>(null)
  const [baseCcy,    setBaseCcy]    = useState<BaseCurrency>('USD')

  const symbolsKey = positions.map(p => p.ticker).join(',')

  const { data: quotes = {} } = useQuery<Record<string, Quote>>({
    queryKey: ['portfolio-quotes', symbolsKey],
    queryFn: () => symbolsKey ? fetch(`/api/quotes?symbols=${encodeURIComponent(symbolsKey)}`).then(r => r.json()) : Promise.resolve({}),
    enabled: positions.length > 0,
    refetchInterval: 30_000, staleTime: 20_000,
  })

  // Pre-fetch metrics for all views (cached 1h)
  const { data: metrics = {} } = useQuery<Record<string, SymbolMetrics>>({
    queryKey: ['port-metrics', symbolsKey],
    queryFn: () => symbolsKey ? fetch(`/api/portfolio/metrics?symbols=${encodeURIComponent(symbolsKey)}`).then(r => r.json()) : Promise.resolve({}),
    enabled: positions.length > 0,
    staleTime: 60 * 60_000,
  })

  const { data: fx = { USD:1,AUD:0.65,GBP:1.27,EUR:1.08,JPY:0.0067,CAD:0.74,HKD:0.128,SGD:0.74,NZD:0.61,updatedAt:0 } } = useQuery<FXRates>({
    queryKey: ['fx-rates'],
    queryFn: () => fetch('/api/fx').then(r => r.json()),
    refetchInterval: 10 * 60_000,
    staleTime: 5 * 60_000,
  })

  const loaded = Object.keys(quotes).length
  const totalMV = useMemo(() => positions.reduce((s, p) => {
    const price = quotes[p.ticker]?.c
    if (!price) return s
    return s + convertFX(p.shares * price, p.currency, baseCcy, fx)
  }, 0), [positions, quotes, fx, baseCcy])

  const SUBVIEWS: SubView[] = ['HOLDINGS', 'MAP', 'HISTORY', 'PERFORMANCE', 'RISK', 'ALLOCATION', 'BLOTTER']

  return (
    <div className="panel" style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* Header */}
      <div className="panel-header" style={{ justifyContent: 'space-between', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
          <span className="panel-mnemonic" style={{ marginRight: 16 }}>PORT</span>
          {SUBVIEWS.map(v => (
            <button key={v} onClick={() => setSubView(v)} style={{
              background: subView === v ? '#0d1a0d' : 'transparent',
              border: 'none', borderBottom: `2px solid ${subView === v ? '#ffa028' : 'transparent'}`,
              color: subView === v ? '#ffa028' : '#555',
              fontFamily: 'inherit', fontSize: 10, padding: '0 12px', cursor: 'pointer',
              letterSpacing: '0.06em', height: '100%',
            }}>{v}</button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button onClick={() => exportCSV(positions, quotes, fx, baseCcy)} style={{
            background: 'none', border: '1px solid #2a2a2a', color: '#555',
            fontFamily: 'inherit', fontSize: 10, padding: '3px 10px', cursor: 'pointer', letterSpacing: '0.06em',
          }}>↓ CSV</button>
          <span style={{ color: '#444', fontSize: 9 }}>BASE CCY:</span>
          <select value={baseCcy} onChange={e => setBaseCcy(e.target.value as BaseCurrency)}
            style={{ background: '#0a0a0a', border: '1px solid #2a2a2a', color: '#ffa028', fontFamily: 'inherit', fontSize: 10, padding: '2px 6px', cursor: 'pointer' }}>
            {(['USD','AUD','GBP','EUR','JPY','CAD'] as BaseCurrency[]).map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <button onClick={() => setModal('add')} style={{
            background: '#0a1a0a', border: '1px solid #1a3a1a', color: '#33ff66',
            fontFamily: 'inherit', fontSize: 10, padding: '3px 12px', cursor: 'pointer', letterSpacing: '0.06em',
          }}>+ ADD POSITION</button>
        </div>
      </div>

      {/* Summary strip */}
      <SummaryStrip positions={positions} quotes={quotes} loaded={loaded} fx={fx} baseCcy={baseCcy} metrics={metrics} />

      {/* Sub-view content + inline detail panel */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'row' }}>
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {subView === 'HOLDINGS'    && <HoldingsView    positions={positions} quotes={quotes} totalValue={totalMV} fx={fx} baseCcy={baseCcy} alerts={alerts} metrics={metrics} onEdit={p => setModal(p)} onRemove={id => removePosition(id)} onSelect={p => setDetailPos(detailPos?.id === p.id ? null : p)} />}
          {subView === 'MAP'         && <HeatMapView     positions={positions} quotes={quotes} fx={fx} baseCcy={baseCcy} metrics={metrics} onSelect={p => { setDetailPos(detailPos?.id === p.id ? null : p); setSubView('HOLDINGS') }} />}
          {subView === 'HISTORY'     && <HistoryView     positions={positions} fx={fx} baseCcy={baseCcy} />}
          {subView === 'PERFORMANCE' && <PerformanceView positions={positions} quotes={quotes} fx={fx} baseCcy={baseCcy} />}
          {subView === 'RISK'        && <RiskView        positions={positions} quotes={quotes} fx={fx} baseCcy={baseCcy} />}
          {subView === 'ALLOCATION'  && <AllocationView  positions={positions} quotes={quotes} metrics={metrics} fx={fx} baseCcy={baseCcy} />}
          {subView === 'BLOTTER'     && <BlotterView     positions={positions} quotes={quotes} fx={fx} baseCcy={baseCcy} onSelect={p => setDetailPos(detailPos?.id === p.id ? null : p)} />}
        </div>
        {detailPos && (
          <PositionDetail
            pos={detailPos}
            onClose={() => setDetailPos(null)}
            onEdit={p => { setDetailPos(null); setModal(p) }}
            alerts={alerts}
            addAlert={addAlert}
            removeAlert={removeAlert}
          />
        )}
      </div>

      {modal === 'add' && <PositionModal onSave={p => addPosition(p)} onClose={() => setModal(null)} />}
      {modal && modal !== 'add' && (
        <PositionModal initial={modal as Position} onSave={p => updatePosition((modal as Position).id, p)} onClose={() => setModal(null)} />
      )}
    </div>
  )
}
