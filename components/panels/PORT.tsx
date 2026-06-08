'use client'
import { useState, useMemo, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useQuery, useQueries } from '@tanstack/react-query'
import { useTerminalStore, type Position, type PriceAlert } from '@/lib/store'
import type { HistoryPoint } from '@/app/api/history/route'
import type { ScoutStock } from '@/app/api/scout/route'

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

// â"€â"€ Helpers â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
function fmt(v: number, dec = 2) {
  return v.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec })
}
function fmtVal(n: number, currency = 'USD') {
  const sym = currency === 'AUD' ? 'A$' : currency === 'GBP' ? 'Â£' : currency === 'EUR' ? 'â‚¬'
    : currency === 'JPY' ? 'Â¥' : currency === 'CAD' ? 'C$' : '$'
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

// ── JSON export ───────────────────────────────────────────────────────────────
function exportJSON(positions: Position[], watchlist: string[]) {
  const payload = {
    _type: 'bbg-terminal-portfolio',
    version: 1,
    exportedAt: new Date().toISOString(),
    positions,
    watchlist,
  }
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url
  a.download = `portfolio_${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
}

// ── Import parser ─────────────────────────────────────────────────────────────
interface ImportResult {
  positions: Position[]
  watchlist: string[] | null   // null = not present in file (CSV)
  error?: string
}

function parseImportFile(text: string, filename: string): ImportResult {
  // ── JSON ────────────────────────────────────────────────────────────────────
  if (filename.endsWith('.json')) {
    try {
      const obj = JSON.parse(text)
      if (obj._type !== 'bbg-terminal-portfolio') {
        return { positions: [], watchlist: null, error: 'Not a portfolio export file' }
      }
      const positions: Position[] = (obj.positions ?? []).map((p: Record<string, unknown>) => ({
        id:       String(p.id ?? Math.random().toString(36).slice(2, 8)),
        ticker:   String(p.ticker ?? '').toUpperCase(),
        shares:   Number(p.shares  ?? 0),
        avgCost:  Number(p.avgCost ?? 0),
        currency: String(p.currency ?? 'USD'),
        addedAt:  Number(p.addedAt  ?? Date.now()),
      })).filter((p: Position) => p.ticker && p.shares > 0)
      const watchlist: string[] = Array.isArray(obj.watchlist)
        ? obj.watchlist.map((t: unknown) => String(t).toUpperCase())
        : []
      return { positions, watchlist }
    } catch {
      return { positions: [], watchlist: null, error: 'Invalid JSON' }
    }
  }

  // ── CSV ─────────────────────────────────────────────────────────────────────
  if (filename.endsWith('.csv')) {
    try {
      const lines = text.trim().split('\n').filter(Boolean)
      if (lines.length < 2) return { positions: [], watchlist: null, error: 'CSV has no data rows' }
      const header = lines[0].split(',').map(h => h.trim().toLowerCase())
      const iCol   = (name: string) => header.findIndex(h => h.includes(name))
      const iTicker = Math.max(iCol('ticker'), iCol('symbol'))
      const iShares = iCol('shares')
      const iCost   = Math.max(iCol('avg cost'), iCol('avgcost'), iCol('cost'))
      const iCcy    = iCol('currency')
      if (iTicker < 0 || iShares < 0 || iCost < 0) {
        return { positions: [], watchlist: null, error: 'CSV missing required columns (Ticker, Shares, Avg Cost)' }
      }
      const positions: Position[] = lines.slice(1).map(line => {
        const cols = line.split(',').map(c => c.trim().replace(/^"|"$/g, ''))
        return {
          id:       Math.random().toString(36).slice(2, 8),
          ticker:   cols[iTicker]?.toUpperCase() ?? '',
          shares:   parseFloat(cols[iShares] ?? '0') || 0,
          avgCost:  parseFloat(cols[iCost]   ?? '0') || 0,
          currency: iCcy >= 0 ? (cols[iCcy] ?? 'USD') : currencyFor(cols[iTicker] ?? ''),
          addedAt:  Date.now(),
        }
      }).filter(p => p.ticker && p.shares > 0)
      return { positions, watchlist: null }
    } catch {
      return { positions: [], watchlist: null, error: 'Failed to parse CSV' }
    }
  }

  return { positions: [], watchlist: null, error: 'Unsupported file type (use .json or .csv)' }
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

// â"€â"€ Preset instruments â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
interface Preset { symbol: string; name: string }
const PRESETS: Record<string, Preset[]> = {
  Energy:      [{ symbol:'CL=F',name:'WTI Crude Oil'},{ symbol:'BZ=F',name:'Brent Crude'},{ symbol:'NG=F',name:'Natural Gas'},{ symbol:'RB=F',name:'Gasoline RBOB'}],
  Metals:      [{ symbol:'GC=F',name:'Gold'},{ symbol:'SI=F',name:'Silver'},{ symbol:'HG=F',name:'Copper'},{ symbol:'PL=F',name:'Platinum'},{ symbol:'PA=F',name:'Palladium'}],
  Agriculture: [{ symbol:'ZC=F',name:'Corn'},{ symbol:'ZW=F',name:'Wheat'},{ symbol:'ZS=F',name:'Soybeans'},{ symbol:'KC=F',name:'Coffee'},{ symbol:'SB=F',name:'Sugar #11'},{ symbol:'CC=F',name:'Cocoa'}],
  'Bond ETFs': [{ symbol:'TLT',name:'20Y+ Treasury'},{ symbol:'IEF',name:'7-10Y Treasury'},{ symbol:'SHY',name:'1-3Y Treasury'},{ symbol:'AGG',name:'US Agg Bond'},{ symbol:'LQD',name:'IG Corp Bond'},{ symbol:'HYG',name:'High Yield Corp'},{ symbol:'BNDX',name:'Intl Bond'},{ symbol:'EMB',name:'EM Bond'},{ symbol:'IAF.AX',name:'AU Govt Bond'},{ symbol:'VAF.AX',name:'AU Fixed Int'}],
}

// â"€â"€ Shared types â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
interface Quote { c: number; d: number; dp: number }

// â"€â"€ Bar component (horizontal, terminal style) â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
function Bar({ pct: p, color, height = 6 }: { pct: number; color: string; height?: number }) {
  const w = Math.min(100, Math.max(0, Math.abs(p)))
  return (
    <div style={{ background: '#111', height, width: '100%', position: 'relative' }}>
      <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${w}%`, background: color, opacity: 0.7 }} />
    </div>
  )
}

// â"€â"€ 52-week range gauge â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
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

// â"€â"€ Ticker search component â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
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
                    <span style={{ color: '#e8e8e8', fontSize: 10 }}>{r.description?.slice(0, 38)}</span>
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
              <div style={{ color: '#e8e8e8', fontSize: 9, marginTop: 1 }}>{p.name}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// â"€â"€ Add / Edit position modal â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
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
  const labelStyle: React.CSSProperties = { color: '#e8e8e8', fontSize: 10, letterSpacing: '0.06em', marginBottom: 4, display: 'block' }

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
            {ticker && <div style={{ marginTop: 4, fontSize: 10, color: '#e8e8e8' }}>Selected: <span style={{ color: typeColor }}>{ticker}</span>{unit !== 'share' && <span style={{ color: '#444' }}> · {unit}</span>}</div>}
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
              Total exposure: <span style={{ color: '#d8d8d8' }}>{fmtVal(parseFloat(shares) * parseFloat(avgCost), currency)}</span>
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 22, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ background: 'none', border: '1px solid #333', color: '#d8d8d8', cursor: 'pointer', fontFamily: 'inherit', fontSize: 11, padding: '6px 16px' }}>CANCEL</button>
          <button onClick={() => { if (!valid) return; onSave({ ticker: ticker.trim().toUpperCase(), shares: parseFloat(shares), avgCost: parseFloat(avgCost), currency }); onClose() }}
            disabled={!valid}
            style={{ background: valid ? '#1a3a1a' : '#111', border: `1px solid ${valid ? '#33ff66' : '#333'}`, color: valid ? '#33ff66' : '#444', cursor: valid ? 'pointer' : 'default', fontFamily: 'inherit', fontSize: 11, padding: '6px 16px' }}>SAVE</button>
        </div>
      </div>
    </div>
  )
}

// â"€â"€ Summary strip (always shown) â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
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

// â"€â"€ HOLDINGS view â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
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
                      {triggered.length > 0 && <span title={`Alert triggered: ${triggered.map(a => `${a.type} ${fmtVal(a.price, c)}`).join(', ')}`} style={{ fontSize: 9, cursor: 'help' }}>{triggered[0].type === 'TARGET' ? 'ðŸŽ¯' : 'ðŸ›‘'}</span>}
                      {pending.length > 0 && triggered.length === 0 && <span title={`${pending.length} alert${pending.length > 1 ? 's' : ''} pending`} style={{ fontSize: 8, color: '#ffa028', border: '1px solid #ffa028', padding: '0 2px' }}>●</span>}
                    </div>
                  </td>
                  <td style={{ ...cell, color: '#d8d8d8', textAlign: 'right' }}>{fmt(pos.shares, pos.shares % 1 === 0 ? 0 : 2)}</td>
                  <td style={{ ...cell, color: '#e8e8e8', textAlign: 'right' }}>{fmtVal(pos.avgCost, c)}</td>
                  <td style={{ ...cell, color: '#eee', textAlign: 'right', fontWeight: 'bold' }}>{price != null ? fmtVal(price, c) : <span style={{ color: '#333' }}>…</span>}</td>
                  <td style={{ ...cell, color: '#e8e8e8', textAlign: 'right' }}>{mv != null ? fmtVal(mv, c) : '—'}</td>
                  <td style={{ ...cell, color: dpnl != null ? clr(dpnl) : '#333', textAlign: 'right' }}>{dpnl != null ? `${sign(dpnl)}${fmtVal(Math.abs(dpnl), c)}` : '—'}</td>
                  <td style={{ ...cell, color: q?.dp != null ? clr(q.dp) : '#333', textAlign: 'right' }}>{q?.dp != null ? pct(q.dp) : '—'}</td>
                  <td style={{ ...cell, color: tpnl != null ? clr(tpnl) : '#333', textAlign: 'right' }}>{tpnl != null ? `${sign(tpnl)}${fmtVal(Math.abs(tpnl), c)}` : '—'}</td>
                  <td style={{ ...cell, color: tret != null ? clr(tret) : '#333', textAlign: 'right' }}>{tret != null ? pct(tret) : '—'}</td>
                  <td style={{ ...cell, color: '#e8e8e8', textAlign: 'right' }}>{wt > 0 ? `${fmt(wt, 1)}%` : '—'}</td>
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

// â"€â"€ PERFORMANCE view â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
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
      <span style={{ color: '#e8e8e8', fontSize: 11 }}>{label}</span>
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
            <span style={{ color: '#e8e8e8', fontSize: 10 }}>Alpha vs S&P 500: </span>
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

// â"€â"€ RISK view â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
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
      <span style={{ color: '#e8e8e8', fontSize: 11 }}>{label}</span>
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
        <div style={{ marginTop: 10, padding: '8px', background: '#080808', border: '1px solid #1a1a1a', fontSize: 10, color: '#e8e8e8', lineHeight: 1.6 }}>
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
        <div style={{ marginTop: 10, padding: '8px', background: '#080808', border: '1px solid #1a1a1a', fontSize: 10, color: '#e8e8e8', lineHeight: 1.6 }}>
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
        <div style={{ marginTop: 10, padding: '8px', background: '#080808', border: '1px solid #1a1a1a', fontSize: 10, color: '#e8e8e8', lineHeight: 1.6 }}>
          {sharpe == null ? 'Sharpe ratio requires â‰¥2 positions with return data.' :
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
                  {a.level === 'HIGH' ? 'âš ' : a.level === 'WARN' ? '!' : 'i'}
                </span>
                <span style={{ color: '#d8d8d8', fontSize: 10, lineHeight: 1.5 }}>{a.msg}</span>
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
                  <td style={{ padding: '5px 8px', color: '#d8d8d8', fontSize: 11, textAlign: 'right' }}>{fmt(wt, 1)}%</td>
                  <td style={{ padding: '5px 8px', fontSize: 11, textAlign: 'right', color: m?.beta != null ? (m.beta > 1.2 ? '#ffa028' : m.beta < 0.5 ? '#4d9fff' : '#eee') : '#333' }}>
                    {m?.beta != null ? fmt(m.beta) : '—'}
                  </td>
                  <td style={{ padding: '5px 8px', color: '#e8e8e8', fontSize: 10, textAlign: 'right' }}>{m?.week52Low  != null ? fmt(m.week52Low)  : '—'}</td>
                  <td style={{ padding: '5px 8px', color: '#eee',  fontSize: 11, textAlign: 'right', fontWeight: 'bold' }}>{fmt(price)}</td>
                  <td style={{ padding: '5px 8px', color: '#e8e8e8', fontSize: 10, textAlign: 'right' }}>{m?.week52High != null ? fmt(m.week52High) : '—'}</td>
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

// â"€â"€ ALLOCATION placeholder â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
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
                <span style={{ color: '#d8d8d8', fontSize: 11, fontVariantNumeric: 'tabular-nums' }}>{fmt(w, 1)}%  <span style={{ color: '#444' }}>{fmtVal(mv)}</span></span>
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

// â"€â"€ BLOTTER â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
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
          style={{ background: '#0a0a0a', border: '1px solid #222', color: '#d8d8d8', fontFamily: 'inherit', fontSize: 10, padding: '3px 8px' }}>
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
                    <td style={{ ...cell, color: '#e8e8e8' }}>
                      {new Date(p.addedAt).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: '2-digit' })}
                    </td>
                    <td style={{ ...cell, color: '#4d9fff', fontWeight: 'bold' }}>{p.ticker}</td>
                    <td style={{ ...cell, color: '#d8d8d8', textAlign: 'right' }}>{fmt(p.shares, p.shares % 1 === 0 ? 0 : 2)}</td>
                    <td style={{ ...cell, color: '#e8e8e8', textAlign: 'right' }}>{fmtVal(p.avgCost, p.currency)}</td>
                    <td style={{ ...cell, color: '#eee', textAlign: 'right', fontWeight: 'bold' }}>{last != null ? fmtVal(last, p.currency) : '…'}</td>
                    <td style={{ ...cell, color: '#d8d8d8', textAlign: 'right' }}>{fmtVal(cost, baseCcy)}</td>
                    <td style={{ ...cell, color: '#e8e8e8', textAlign: 'right' }}>{mv != null ? fmtVal(mv, baseCcy) : '—'}</td>
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

// â"€â"€ HISTORY (P&L chart) view â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
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

// â"€â"€ Squarified Treemap â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
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

// â"€â"€ HEAT MAP view â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
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
          <span style={{ color: '#e8e8e8', fontSize: 9 }}>–3% → +3%</span>
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
                    <span key={`l-${label}`} style={{ color: '#e8e8e8', fontSize: 10 }}>{label}</span>
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

// â"€â"€ Alert Manager (used inside PositionDetail) â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
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
                  {triggered && <span style={{ marginLeft: 6, fontSize: 9 }}>{a.type === 'TARGET' ? 'ðŸŽ¯' : 'ðŸ›‘'}</span>}
                  {a.note && <div style={{ color: '#e8e8e8', fontSize: 9, marginTop: 1 }}>{a.note}</div>}
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

// â"€â"€ Position Detail Drawer â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
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
      <span style={{ color: '#e8e8e8', fontSize: 11 }}>{label}</span>
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
          {profile?.name && <div style={{ color: '#e8e8e8', fontSize: 10 }}>{profile.name}</div>}
          {profile?.finnhubIndustry && <div style={{ color: '#444', fontSize: 9, marginTop: 1 }}>{profile.finnhubIndustry}</div>}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button onClick={() => onEdit(pos)} style={{ background: 'none', border: '1px solid #333', color: '#4d9fff', fontFamily: 'inherit', fontSize: 9, padding: '3px 8px', cursor: 'pointer' }}>EDIT</button>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#e8e8e8', fontSize: 16, cursor: 'pointer', lineHeight: 1 }}>×</button>
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
          <div style={{ display: 'flex', gap: 12, marginTop: 6, fontSize: 10, color: '#e8e8e8' }}>
            <span>O: <span style={{ color: '#d8d8d8' }}>{fmtVal(quote.o, pos.currency)}</span></span>
            <span>H: <span style={{ color: '#33ff66' }}>{fmtVal(quote.h, pos.currency)}</span></span>
            <span>L: <span style={{ color: '#ff3b3b' }}>{fmtVal(quote.l, pos.currency)}</span></span>
            <span>Prev: <span style={{ color: '#d8d8d8' }}>{fmtVal(quote.pc, pos.currency)}</span></span>
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

// â"€â"€ Main PORT panel â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
// ── EFFICIENT FRONTIER view ───────────────────────────────────────────────────
// Pure math helpers
function dot(a: number[], b: number[]) { return a.reduce((s, v, i) => s + v * b[i], 0) }
function matVec(M: number[][], v: number[]): number[] { return M.map(row => dot(row, v)) }
function quadForm(M: number[][], w: number[]): number { return dot(w, matVec(M, w)) }

function computeCovMatrix(returns: number[][]): number[][] {
  const n = returns.length
  const T = returns[0]?.length ?? 0
  if (T < 2) return Array.from({ length: n }, (_, i) => Array.from({ length: n }, (__, j) => i === j ? 0.0001 : 0))
  const means = returns.map(r => r.reduce((s, v) => s + v, 0) / T)
  return returns.map((ri, i) =>
    returns.map((rj, j) => {
      let cov = 0
      for (let t = 0; t < T; t++) cov += (ri[t] - means[i]) * (rj[t] - means[j])
      return cov / (T - 1)
    })
  )
}

function randomPortfolio(n: number): number[] {
  const w = Array.from({ length: n }, () => -Math.log(Math.random()))
  const s = w.reduce((a, v) => a + v, 0)
  return w.map(v => v / s)
}

function EfficientFrontierView({ positions, fx, baseCcy }: {
  positions: Position[]; fx: FXRates; baseCcy: string
}) {
  const [range, setRange] = useState<RangeKey>('1y')
  const [hovered, setHovered] = useState<{ x: number; y: number; sharpe: number; ret: number; vol: number; weights: number[] } | null>(null)

  const tickers = useMemo(() => Array.from(new Set(positions.map(p => p.ticker))), [positions])

  const queries = useQueries({
    queries: tickers.map(ticker => ({
      queryKey: ['history', ticker, range],
      queryFn:  (): Promise<HistoryPoint[]> => fetch(`/api/history?symbol=${ticker}&range=${range}`).then(r => r.json()),
      staleTime: 30 * 60_000,
    })),
  })

  const loading = queries.some(q => q.isLoading)

  const { means, cov, currentWeights, currentRet, currentVol, currentSharpe } = useMemo(() => {
    const empty = { means: [], cov: [], currentWeights: [], currentRet: 0, currentVol: 0, currentSharpe: 0 }
    if (loading || tickers.length < 2) return empty

    const dateSets = queries.map(q => new Map((q.data as HistoryPoint[] ?? []).map(pt => [pt.t, pt.c])))
    const allDates = Array.from(new Set(queries.flatMap(q => (q.data as HistoryPoint[] ?? []).map(pt => pt.t)))).sort()
    const commonDates = allDates.filter(d => dateSets.every(ds => ds.has(d)))
    if (commonDates.length < 20) return empty

    const dailyReturns: number[][] = tickers.map((_, i) => {
      const prices = commonDates.map(d => dateSets[i].get(d) ?? 0)
      return prices.slice(1).map((p, t) => prices[t] > 0 ? Math.log(p / prices[t]) : 0)
    })

    const T = dailyReturns[0].length
    const means = dailyReturns.map(r => (r.reduce((s, v) => s + v, 0) / T) * 252)
    const covAnn = computeCovMatrix(dailyReturns).map(row => row.map(v => v * 252))

    // Current weights by latest market value
    const mvs = tickers.map((t, i) => {
      const lastPrice = dateSets[i].get(commonDates[commonDates.length - 1]) ?? 0
      return positions.filter(p => p.ticker === t).reduce((s, p) => s + Math.abs(p.shares) * lastPrice, 0)
    })
    const totalMV = mvs.reduce((s, v) => s + v, 0)
    const currentWeights = totalMV > 0 ? mvs.map(v => v / totalMV) : tickers.map(() => 1 / tickers.length)
    const currentRet = dot(currentWeights, means)
    const currentVol = Math.sqrt(Math.max(0, quadForm(covAnn, currentWeights)))
    const currentSharpe = currentVol > 0 ? (currentRet - 0.045) / currentVol : 0

    return { means, cov: covAnn, currentWeights, currentRet, currentVol, currentSharpe }
  }, [loading, tickers, queries, positions])

  const portfolios = useMemo(() => {
    if (means.length < 2 || cov.length < 2) return []
    return Array.from({ length: 4000 }, () => {
      const w = randomPortfolio(means.length)
      const ret = dot(w, means)
      const vol = Math.sqrt(Math.max(0, quadForm(cov, w)))
      return { ret, vol, sharpe: vol > 0 ? (ret - 0.045) / vol : 0, weights: w }
    })
  }, [means, cov])

  const maxSharpePort = useMemo(() => portfolios.length ? portfolios.reduce((b, p) => p.sharpe > b.sharpe ? p : b) : null, [portfolios])
  const minVolPort    = useMemo(() => portfolios.length ? portfolios.reduce((b, p) => p.vol    < b.vol    ? p : b) : null, [portfolios])

  const W = 640, H = 360, PAD = { top: 20, right: 20, bottom: 48, left: 58 }
  const innerW = W - PAD.left - PAD.right
  const innerH = H - PAD.top  - PAD.bottom

  const allVols = portfolios.map(p => p.vol)
  const allRets = portfolios.map(p => p.ret)
  const minVol = (Math.min(...allVols, currentVol) || 0) * 0.9
  const maxVol = (Math.max(...allVols, currentVol) || 1) * 1.1
  const minRet = Math.min(...allRets, currentRet) < 0
    ? Math.min(...allRets, currentRet) * 1.1
    : (Math.min(...allRets, currentRet) || 0) * 0.9
  const maxRet = (Math.max(...allRets, currentRet) || 1) * 1.1

  function toSVG(vol: number, ret: number) {
    return {
      x: PAD.left + ((vol - minVol) / ((maxVol - minVol) || 1)) * innerW,
      y: PAD.top  + (1 - (ret - minRet) / ((maxRet - minRet) || 1)) * innerH,
    }
  }

  const sharpeValues = portfolios.map(p => p.sharpe)
  const maxSharpe = Math.max(...sharpeValues, 0.01)
  const minSharpe = Math.min(...sharpeValues)
  function sharpeColor(s: number) {
    const t = Math.max(0, Math.min(1, (s - minSharpe) / ((maxSharpe - minSharpe) || 1)))
    if (t < 0.5) return `rgb(${Math.round(255 * t * 2)},${Math.round(80 + 60 * t * 2)},20)`
    return `rgb(${Math.round(255 * (1 - (t - 0.5) * 2))},${Math.round(200 + 55 * (t - 0.5) * 2)},20)`
  }
  function fmtPct(v: number) { return (v * 100).toFixed(1) + '%' }

  if (tickers.length < 2) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#333', fontSize: 12 }}>
      Add at least 2 positions to compute efficient frontier
    </div>
  )
  if (loading) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#444', fontSize: 12 }}>
      Loading historical data…
    </div>
  )
  if (!portfolios.length) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#333', fontSize: 12 }}>
      Insufficient data for frontier calculation
    </div>
  )

  const curSVG       = toSVG(currentVol, currentRet)
  const maxSharpeSVG = maxSharpePort ? toSVG(maxSharpePort.vol, maxSharpePort.ret) : curSVG
  const minVolSVG    = minVolPort    ? toSVG(minVolPort.vol,    minVolPort.ret)    : curSVG

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 10px', borderBottom: '1px solid #111', flexShrink: 0 }}>
        <span style={{ color: '#444', fontSize: 10 }}>RANGE:</span>
        {(['1mo','3mo','6mo','1y','2y','5y'] as RangeKey[]).map(r => (
          <button key={r} onClick={() => setRange(r)} style={{
            background: range === r ? '#0d1a0d' : 'none',
            border: 'none', borderBottom: `2px solid ${range === r ? '#ffa028' : 'transparent'}`,
            color: range === r ? '#ffa028' : '#555',
            fontFamily: 'inherit', fontSize: 10, padding: '0 6px', cursor: 'pointer',
          }}>{r.toUpperCase()}</button>
        ))}
        <span style={{ color: '#333', fontSize: 9, marginLeft: 'auto' }}>4,000 Monte Carlo simulations · rf = 4.5%</span>
      </div>

      {/* Chart + stats */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* SVG */}
        <div style={{ position: 'relative', flexShrink: 0, overflowX: 'auto' }}>
          <svg width={W} height={H} style={{ display: 'block' }}
            onMouseLeave={() => setHovered(null)}
            onMouseMove={e => {
              const rect = e.currentTarget.getBoundingClientRect()
              const mx = e.clientX - rect.left
              const my = e.clientY - rect.top
              let best: typeof portfolios[0] | null = null, bestD = 900
              for (const p of portfolios) {
                const sv = toSVG(p.vol, p.ret)
                const dx = sv.x - mx, dy = sv.y - my
                const d = dx * dx + dy * dy
                if (d < bestD) { bestD = d; best = p }
              }
              if (best) {
                const sv = toSVG(best.vol, best.ret)
                setHovered({ x: sv.x, y: sv.y, sharpe: best.sharpe, ret: best.ret, vol: best.vol, weights: best.weights })
              }
            }}
          >
            {/* Grid lines + labels */}
            {[0, 0.25, 0.5, 0.75, 1].map(t => {
              const y = PAD.top + t * innerH
              const x = PAD.left + t * innerW
              const retVal = maxRet - t * (maxRet - minRet)
              const volVal = minVol + t * (maxVol - minVol)
              return (
                <g key={t}>
                  <line x1={PAD.left} y1={y} x2={PAD.left + innerW} y2={y} stroke="#111" />
                  <line x1={x} y1={PAD.top} x2={x} y2={PAD.top + innerH} stroke="#111" />
                  <text x={PAD.left - 4} y={y + 4} textAnchor="end" fill="#333" fontSize={9}>{fmtPct(retVal)}</text>
                  <text x={x} y={PAD.top + innerH + 14} textAnchor="middle" fill="#333" fontSize={9}>{fmtPct(volVal)}</text>
                </g>
              )
            })}
            {/* Axes */}
            <line x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={PAD.top + innerH} stroke="#222" />
            <line x1={PAD.left} y1={PAD.top + innerH} x2={PAD.left + innerW} y2={PAD.top + innerH} stroke="#222" />
            <text x={PAD.left + innerW / 2} y={H - 6} textAnchor="middle" fill="#444" fontSize={10}>Annualised Volatility</text>
            <text x={12} y={PAD.top + innerH / 2} textAnchor="middle" fill="#444" fontSize={10}
              transform={`rotate(-90, 12, ${PAD.top + innerH / 2})`}>Expected Return</text>

            {/* Scatter */}
            {portfolios.map((p, i) => {
              const { x, y } = toSVG(p.vol, p.ret)
              return <circle key={i} cx={x} cy={y} r={2} fill={sharpeColor(p.sharpe)} opacity={0.55} />
            })}

            {/* Min vol ring */}
            <circle cx={minVolSVG.x} cy={minVolSVG.y} r={7} fill="none" stroke="#4d9fff" strokeWidth={1.5} />
            <text x={minVolSVG.x + 10} y={minVolSVG.y + 4} fill="#4d9fff" fontSize={9} fontWeight="bold">MIN VOL</text>

            {/* Max Sharpe triangle */}
            <polygon
              points={`${maxSharpeSVG.x},${maxSharpeSVG.y - 8} ${maxSharpeSVG.x + 7},${maxSharpeSVG.y + 5} ${maxSharpeSVG.x - 7},${maxSharpeSVG.y + 5}`}
              fill="#ffa028"
            />
            <text x={maxSharpeSVG.x + 12} y={maxSharpeSVG.y + 4} fill="#ffa028" fontSize={9} fontWeight="bold">MAX SHARPE</text>

            {/* Current portfolio */}
            <circle cx={curSVG.x} cy={curSVG.y} r={6}  fill="#33ff66" />
            <circle cx={curSVG.x} cy={curSVG.y} r={10} fill="none" stroke="#33ff66" strokeWidth={1} opacity={0.4} />
            <text x={curSVG.x + 14} y={curSVG.y + 4} fill="#33ff66" fontSize={9} fontWeight="bold">CURRENT</text>

            {/* Crosshair */}
            {hovered && (
              <>
                <line x1={hovered.x} y1={PAD.top} x2={hovered.x} y2={PAD.top + innerH} stroke="#ffa028" strokeWidth={0.5} opacity={0.3} strokeDasharray="3,3" />
                <line x1={PAD.left}  y1={hovered.y} x2={PAD.left + innerW} y2={hovered.y} stroke="#ffa028" strokeWidth={0.5} opacity={0.3} strokeDasharray="3,3" />
                <circle cx={hovered.x} cy={hovered.y} r={4} fill="none" stroke="#ffa028" strokeWidth={1} />
              </>
            )}
          </svg>

          {/* Tooltip */}
          {hovered && (
            <div style={{
              position: 'absolute',
              left: Math.min(hovered.x + 14, W - 160),
              top: Math.max(hovered.y - 70, PAD.top),
              background: '#080808', border: '1px solid #2a2a2a',
              padding: '6px 10px', fontSize: 10, pointerEvents: 'none',
              lineHeight: 1.8,
            }}>
              <div style={{ color: '#ffa028', fontWeight: 'bold', marginBottom: 2 }}>Portfolio</div>
              <div><span style={{ color: '#555' }}>Return: </span><span style={{ color: '#33ff66' }}>{fmtPct(hovered.ret)}</span></div>
              <div><span style={{ color: '#555' }}>Volatility: </span><span style={{ color: '#4d9fff' }}>{fmtPct(hovered.vol)}</span></div>
              <div><span style={{ color: '#555' }}>Sharpe: </span><span style={{ color: hovered.sharpe >= 0 ? '#33ff66' : '#ff3b3b' }}>{hovered.sharpe.toFixed(2)}</span></div>
            </div>
          )}
        </div>

        {/* Right stats panel */}
        <div style={{ flex: 1, padding: '10px 14px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {[
            { label: '◉ CURRENT', color: '#33ff66', port: { ret: currentRet, vol: currentVol, sharpe: currentSharpe, weights: currentWeights } },
            { label: '▲ MAX SHARPE', color: '#ffa028', port: maxSharpePort },
            { label: '◎ MIN VOLATILITY', color: '#4d9fff', port: minVolPort },
          ].map(({ label, color, port }) => port ? (
            <div key={label}>
              <div style={{ color, fontSize: 10, fontWeight: 'bold', letterSpacing: '0.08em', marginBottom: 6 }}>{label}</div>
              {[['Return', fmtPct(port.ret)], ['Volatility', fmtPct(port.vol)], ['Sharpe', port.sharpe.toFixed(2)]].map(([k, v]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, padding: '1px 0', borderBottom: '1px solid #0d0d0d' }}>
                  <span style={{ color: '#555' }}>{k}</span><span style={{ color: '#e8e8e8' }}>{v}</span>
                </div>
              ))}
              <div style={{ marginTop: 6 }}>
                {tickers.map((t, i) => (
                  <div key={t} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, padding: '1px 0' }}>
                    <span style={{ color: '#4d9fff' }}>{t.replace('.AX', '')}</span>
                    <span style={{ color: '#c0c0c0' }}>{fmtPct(port.weights?.[i] ?? 0)}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null)}

          {/* Colour scale legend */}
          <div style={{ marginTop: 'auto' }}>
            <div style={{ fontSize: 9, color: '#333', marginBottom: 4 }}>COLOUR = SHARPE RATIO</div>
            <svg width={140} height={14}>
              <defs>
                <linearGradient id="sharpe-grad" x1="0" x2="1" y1="0" y2="0">
                  <stop offset="0%"   stopColor="rgb(0,80,20)" />
                  <stop offset="50%"  stopColor="rgb(255,140,20)" />
                  <stop offset="100%" stopColor="rgb(0,255,20)" />
                </linearGradient>
              </defs>
              <rect x={0} y={0} width={140} height={12} fill="url(#sharpe-grad)" rx={2} />
            </svg>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 8, color: '#333', marginTop: 2 }}>
              <span>Low</span><span>High Sharpe</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── SCOUT view ────────────────────────────────────────────────────────────────
const SECTOR_COLOR: Record<string, string> = {
  Technology:             '#4a9eff',
  'Communication Services':'#a64aff',
  Healthcare:             '#33ff99',
  Financials:             '#ffa028',
  'Consumer Discretionary':'#ff6b6b',
  'Consumer Staples':     '#66d9e8',
  Energy:                 '#ffcc44',
  Industrials:            '#aaa',
  Materials:              '#c8a96e',
  Utilities:              '#5ad45a',
  'Real Estate':          '#f099ff',
  Other:                  '#555',
}

const CATEGORY_COLOR: Record<string, string> = {
  GROWTH:    '#4a9eff',
  INCOME:    '#ffa028',
  VALUE:     '#33ff99',
  DEFENSIVE: '#a64aff',
}

const CATEGORY_ICON: Record<string, string> = {
  GROWTH:    '▲',
  INCOME:    '$',
  VALUE:     '◆',
  DEFENSIVE: '■',
}

function ScoreBar({ score, color }: { score: number; color: string }) {
  return (
    <div style={{ height: 3, background: '#111', borderRadius: 2, overflow: 'hidden', marginTop: 4 }}>
      <div style={{ height: '100%', width: `${score}%`, background: color, opacity: 0.8, borderRadius: 2 }} />
    </div>
  )
}

function ScoutCard({
  stock, category, rank, onNavigate,
}: {
  stock: ScoutStock
  category: 'GROWTH' | 'INCOME' | 'VALUE' | 'DEFENSIVE'
  rank: number
  onNavigate: (ticker: string) => void
}) {
  const scoreKey = `${category.toLowerCase()}Score` as keyof ScoutStock
  const score = stock[scoreKey] as number
  const color = CATEGORY_COLOR[category]
  const sectorColor = SECTOR_COLOR[stock.sector] ?? '#555'

  const primaryMetric = category === 'GROWTH'
    ? stock.revenueGrowth != null
      ? `Rev +${(stock.revenueGrowth * 100).toFixed(1)}%`
      : stock.earningsGrowth != null ? `EPS +${(stock.earningsGrowth * 100).toFixed(1)}%` : '—'
    : category === 'INCOME'
    ? stock.dividendYield != null && stock.dividendYield > 0
      ? `Yield ${stock.dividendYield.toFixed(2)}%`
      : 'No Dividend'
    : category === 'VALUE'
    ? stock.trailingPE != null && stock.trailingPE > 0
      ? `P/E ${stock.trailingPE.toFixed(1)}x`
      : stock.priceToBook != null ? `P/B ${stock.priceToBook.toFixed(1)}x` : '—'
    : stock.beta != null
    ? `Beta ${stock.beta.toFixed(2)}`
    : stock.grossMargins != null ? `GM ${(stock.grossMargins * 100).toFixed(0)}%` : '—'

  return (
    <div
      onClick={() => onNavigate(stock.symbol)}
      style={{
        padding: '7px 10px',
        borderBottom: '1px solid #0d0d0d',
        cursor: 'pointer',
        transition: 'background 0.1s',
      }}
      onMouseEnter={e => (e.currentTarget.style.background = '#060f06')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
        <span style={{ color: '#333', fontSize: 9, minWidth: 14 }}>{rank}.</span>
        <span style={{ color: '#e8e8e8', fontSize: 11, fontWeight: 'bold', letterSpacing: '0.04em', flex: 1 }}>
          {stock.symbol.replace('.AX', '')}
        </span>
        <span style={{ color: color, fontSize: 10, fontWeight: 'bold' }}>{score}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
        <span style={{ color: '#555', fontSize: 9, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {stock.name.length > 22 ? stock.name.slice(0, 22) + '…' : stock.name}
        </span>
        <span style={{ color: primaryMetric === 'No Dividend' ? '#333' : '#ccc', fontSize: 9 }}>{primaryMetric}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <span style={{
          color: sectorColor, fontSize: 8, border: `1px solid ${sectorColor}33`,
          padding: '0 4px', letterSpacing: '0.04em',
        }}>
          {stock.sector === 'Communication Services' ? 'COMM' :
           stock.sector === 'Consumer Discretionary' ? 'DISC' :
           stock.sector === 'Consumer Staples' ? 'STAP' :
           stock.sector.slice(0, 6).toUpperCase()}
        </span>
        <div style={{ flex: 1 }}>
          <ScoreBar score={score} color={color} />
        </div>
      </div>
    </div>
  )
}

// Quadrant scatter plot
// ── Quadrant tooltip ──────────────────────────────────────────────────────────
function QuadrantTooltip({ stock, mx, my }: { stock: ScoutStock; mx: number; my: number }) {
  const isGrowth    = stock.growthScore    >= 50
  const isDefensive = stock.defensiveScore >= 50

  const quadrantLabel = isDefensive
    ? (isGrowth ? 'DEFENSIVE GROWTH'    : 'DEFENSIVE VALUE')
    : (isGrowth ? 'AGGRESSIVE GROWTH'   : 'AGGRESSIVE VALUE')

  const quadrantColor = isDefensive
    ? (isGrowth ? '#3a5a3a' : '#3a4a5a')
    : (isGrowth ? '#3a2a4a' : '#4a3a2a')

  const sectorColor = SECTOR_COLOR[stock.sector] ?? '#555'

  // Clamp so tooltip stays on screen
  const tipW = 220, tipH = 310
  const left = Math.min(mx + 14, window.innerWidth  - tipW - 8)
  const top  = Math.min(my - 10, window.innerHeight - tipH - 8)

  // Metric rows: [label, value, highlight?]
  function pct(n: number | null, mul = 1) {
    return n == null ? '—' : `${n * mul >= 0 ? '+' : ''}${(n * mul).toFixed(1)}%`
  }
  function fx(n: number | null, suffix = '') {
    return n == null ? '—' : `${n.toFixed(2)}${suffix}`
  }

  const metrics: Array<{ group: string; color: string; rows: Array<[string, string, boolean]> }> = [
    {
      group: 'GROWTH', color: CATEGORY_COLOR['GROWTH'],
      rows: [
        ['Revenue Gr.',  pct(stock.revenueGrowth),  (stock.revenueGrowth ?? 0) > 0.15],
        ['Earnings Gr.', pct(stock.earningsGrowth),  (stock.earningsGrowth ?? 0) > 0.15],
      ],
    },
    {
      group: 'DEFENSIVE', color: CATEGORY_COLOR['DEFENSIVE'],
      rows: [
        ['Beta',         fx(stock.beta),             stock.beta != null && stock.beta < 0.8],
        ['Gross Margin', stock.grossMargins != null ? `${(stock.grossMargins * 100).toFixed(1)}%` : '—',
                         (stock.grossMargins ?? 0) > 0.4],
        ['ROE',          stock.returnOnEquity != null ? `${(stock.returnOnEquity * 100).toFixed(1)}%` : '—',
                         (stock.returnOnEquity ?? 0) > 0.15],
      ],
    },
    {
      group: 'VALUE', color: CATEGORY_COLOR['VALUE'],
      rows: [
        ['P/E',          stock.trailingPE != null ? `${stock.trailingPE.toFixed(1)}x` : '—',
                         stock.trailingPE != null && stock.trailingPE < 20],
        ['P/B',          stock.priceToBook != null ? `${stock.priceToBook.toFixed(1)}x` : '—',
                         stock.priceToBook != null && stock.priceToBook < 3],
        ['P/S',          stock.priceToSales != null ? `${stock.priceToSales.toFixed(1)}x` : '—',
                         stock.priceToSales != null && stock.priceToSales < 3],
      ],
    },
    {
      group: 'INCOME', color: CATEGORY_COLOR['INCOME'],
      rows: [
        ['Div Yield',    stock.dividendYield != null && stock.dividendYield > 0 ? `${stock.dividendYield.toFixed(2)}%` : 'None',
                         (stock.dividendYield ?? 0) > 2.5],
        ['Payout Ratio', stock.payoutRatio != null ? `${(stock.payoutRatio * 100).toFixed(0)}%` : '—',
                         stock.payoutRatio != null && stock.payoutRatio < 0.6 && (stock.dividendYield ?? 0) > 0],
      ],
    },
  ]

  const scores: Array<[string, number, string]> = [
    ['GRW', stock.growthScore,    CATEGORY_COLOR['GROWTH']],
    ['INC', stock.incomeScore,    CATEGORY_COLOR['INCOME']],
    ['VAL', stock.valueScore,     CATEGORY_COLOR['VALUE']],
    ['DEF', stock.defensiveScore, CATEGORY_COLOR['DEFENSIVE']],
  ]

  return createPortal(
    <div style={{
      position: 'fixed', left, top, zIndex: 9999, width: tipW,
      background: '#080808', border: '1px solid #2a2a2a',
      fontFamily: 'monospace', fontSize: 10, pointerEvents: 'none',
      boxShadow: '0 4px 20px rgba(0,0,0,0.8)',
    }}>
      {/* Header */}
      <div style={{ padding: '8px 10px', borderBottom: '1px solid #1a1a1a', background: '#0a0a0a' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 3 }}>
          <span style={{ color: '#e8e8e8', fontSize: 12, fontWeight: 'bold' }}>
            {stock.symbol.replace('.AX', '')}
          </span>
          <span style={{ color: sectorColor, fontSize: 8, border: `1px solid ${sectorColor}44`, padding: '0 4px' }}>
            {stock.sector === 'Communication Services' ? 'COMM' :
             stock.sector === 'Consumer Discretionary' ? 'DISC' :
             stock.sector === 'Consumer Staples' ? 'STAP' :
             stock.sector.slice(0, 6).toUpperCase()}
          </span>
        </div>
        <div style={{ color: '#555', fontSize: 9, marginBottom: 6 }}>
          {stock.name.length > 28 ? stock.name.slice(0, 28) + '…' : stock.name}
        </div>
        {/* Quadrant pill */}
        <div style={{
          display: 'inline-block', padding: '2px 8px', fontSize: 9,
          color: quadrantColor, border: `1px solid ${quadrantColor}`,
          letterSpacing: '0.08em',
        }}>
          {quadrantLabel}
        </div>
      </div>

      {/* Score bars */}
      <div style={{ padding: '7px 10px', borderBottom: '1px solid #111' }}>
        {scores.map(([label, score, color]) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <span style={{ color: '#444', fontSize: 8, width: 26 }}>{label}</span>
            <div style={{ flex: 1, height: 4, background: '#111', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${score}%`, background: color, opacity: 0.8 }} />
            </div>
            <span style={{ color, fontSize: 9, minWidth: 24, textAlign: 'right' }}>{score}</span>
          </div>
        ))}
      </div>

      {/* Metric groups */}
      {metrics.map(({ group, color, rows }) => (
        <div key={group} style={{ padding: '5px 10px', borderBottom: '1px solid #0d0d0d' }}>
          <div style={{ color, fontSize: 8, letterSpacing: '0.08em', marginBottom: 4 }}>{group}</div>
          {rows.map(([label, value, highlight]) => (
            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
              <span style={{ color: '#444', fontSize: 9 }}>{label}</span>
              <span style={{ color: highlight ? color : '#666', fontSize: 9, fontWeight: highlight ? 'bold' : 'normal' }}>
                {value}
                {highlight && <span style={{ color, marginLeft: 3 }}>▲</span>}
              </span>
            </div>
          ))}
        </div>
      ))}

      <div style={{ padding: '4px 10px', color: '#333', fontSize: 8 }}>
        Click to open in GIP
      </div>
    </div>,
    document.body
  )
}

// ── Style quadrant ─────────────────────────────────────────────────────────────
function StyleQuadrant({ stocks, onNavigate }: { stocks: ScoutStock[]; onNavigate: (t: string) => void }) {
  const [tooltip, setTooltip] = useState<{ stock: ScoutStock; mx: number; my: number } | null>(null)

  // Extra bottom/left padding for axis titles; plot area uses PLOT_* bounds
  const W = 540, H = 340
  const LEFT = 52, RIGHT = 16, TOP = 16, BOTTOM = 28
  const PW = W - LEFT - RIGHT   // plot width
  const PH = H - TOP - BOTTOM   // plot height

  const dots = stocks.map(s => ({
    x: LEFT + (s.growthScore / 100) * PW,
    y: TOP  + (1 - s.defensiveScore / 100) * PH,
    stock: s,
    color: SECTOR_COLOR[s.sector] ?? '#555',
  }))

  return (
    <>
      <svg
        width="100%"
        viewBox={`0 0 ${W} ${H}`}
        style={{ overflow: 'visible', cursor: 'crosshair' }}
        onMouseLeave={() => setTooltip(null)}
      >
        {/* Background quadrants */}
        {([
          [0, 0, '#060a10', 'DEFENSIVE\nVALUE',  '#3a4a5a'],
          [1, 0, '#080b06', 'DEFENSIVE\nGROWTH', '#3a5a3a'],
          [0, 1, '#0e0a06', 'AGGRESSIVE\nVALUE', '#4a3a2a'],
          [1, 1, '#0a060e', 'AGGRESSIVE\nGROWTH','#3a2a4a'],
        ] as const).map(([xi, yi, bg, label, tc], i) => {
          const x = LEFT + xi * PW / 2
          const y = TOP  + yi * PH / 2
          const cx = x + PW / 4
          const cy = y + PH / 4
          const lines = (label as string).split('\n')
          return (
            <g key={i}>
              <rect x={x} y={y} width={PW/2} height={PH/2} fill={bg as string} />
              {lines.map((line, li) => (
                <text key={li} x={cx} y={cy - 5 + li * 11} fill={tc as string} fontSize={9}
                  fontFamily="monospace" letterSpacing="0.1em" textAnchor="middle" opacity={0.6}>
                  {line}
                </text>
              ))}
            </g>
          )
        })}

        {/* Axis lines */}
        <line x1={LEFT + PW/2} y1={TOP}        x2={LEFT + PW/2} y2={TOP + PH}   stroke="#222" strokeWidth={1} />
        <line x1={LEFT}        y1={TOP + PH/2}  x2={LEFT + PW}   y2={TOP + PH/2} stroke="#222" strokeWidth={1} />

        {/* X-axis title */}
        <text x={LEFT + PW/2} y={H - 6} fill="#444" fontSize={8} fontFamily="monospace"
          textAnchor="middle" letterSpacing="0.06em">
          {'← LOWER GROWTH · HIGHER GROWTH →'}
        </text>

        {/* Y-axis title */}
        <text x={0} y={0} fill="#444" fontSize={8} fontFamily="monospace"
          textAnchor="middle" letterSpacing="0.06em"
          transform={`translate(12,${TOP + PH/2}) rotate(-90)`}>
          {'↑ DEFENSIVE · AGGRESSIVE ↓'}
        </text>

        {/* Dots — each is a hit target */}
        {dots.map(({ x, y, stock, color }) => (
          <g
            key={stock.symbol}
            style={{ cursor: 'pointer' }}
            onMouseEnter={e => setTooltip({ stock, mx: e.clientX, my: e.clientY })}
            onMouseMove={e  => setTooltip(t => t?.stock === stock ? { stock, mx: e.clientX, my: e.clientY } : t)}
            onClick={() => onNavigate(stock.symbol)}
          >
            {/* Invisible larger hit area */}
            <circle cx={x} cy={y} r={10} fill="transparent" />
            <circle cx={x} cy={y} r={tooltip?.stock === stock ? 5 : 4}
              fill={color}
              opacity={tooltip?.stock === stock ? 1 : 0.8}
              stroke={tooltip?.stock === stock ? color : 'none'}
              strokeWidth={1.5}
              strokeOpacity={0.4}
            />
            <text x={x + 6} y={y + 3} fill={color} fontSize={7} fontFamily="monospace"
              opacity={tooltip?.stock === stock ? 1 : 0.85}>
              {stock.symbol.replace('.AX', '')}
            </text>
          </g>
        ))}
      </svg>

      {tooltip && <QuadrantTooltip stock={tooltip.stock} mx={tooltip.mx} my={tooltip.my} />}
    </>
  )
}

function ScoutView({ onNavigate }: { onNavigate: (ticker: string) => void }) {
  const [viewMode, setViewMode] = useState<'LISTS' | 'QUADRANT'>('LISTS')

  const { data: stocks = [], isLoading, error } = useQuery<ScoutStock[]>({
    queryKey: ['scout'],
    queryFn: () => fetch('/api/scout').then(r => r.json()),
    staleTime: 5 * 60 * 60_000, // 5h (server caches 6h)
    refetchOnWindowFocus: false,
  })

  const stocksArr = Array.isArray(stocks) ? stocks : []

  const top = (key: keyof ScoutStock, n = 8) =>
    [...stocksArr].sort((a, b) => (b[key] as number) - (a[key] as number)).slice(0, n)

  const categories: Array<{ id: 'GROWTH' | 'INCOME' | 'VALUE' | 'DEFENSIVE'; label: string; key: keyof ScoutStock; desc: string }> = [
    { id: 'GROWTH',    label: 'GROWTH',    key: 'growthScore',    desc: 'High revenue & earnings growth momentum' },
    { id: 'INCOME',    label: 'INCOME',    key: 'incomeScore',    desc: 'Dividend yield + payout sustainability' },
    { id: 'VALUE',     label: 'VALUE',     key: 'valueScore',     desc: 'Low P/E, P/B, P/S relative to peers' },
    { id: 'DEFENSIVE', label: 'DEFENSIVE', key: 'defensiveScore', desc: 'Low beta, high margins, stable ROE' },
  ]

  if (isLoading) return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, color: '#444' }}>
      <div style={{ fontSize: 11 }}>Fetching fundamentals for {48} stocks…</div>
      <div style={{ fontSize: 9, color: '#333' }}>First load may take 5–10 seconds</div>
    </div>
  )

  if (error || !Array.isArray(stocks)) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ff3b3b', fontSize: 11 }}>
      Failed to load scout data
    </div>
  )

  return (
    <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>

      {/* Sub-header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px',
        borderBottom: '1px solid #111', background: '#020202', flexShrink: 0,
      }}>
        <span style={{ color: '#555', fontSize: 9 }}>UNIVERSE: {stocksArr.length} stocks</span>
        <span style={{ color: '#222', fontSize: 9 }}>|</span>
        {/* View mode toggle */}
        {(['LISTS','QUADRANT'] as const).map(m => (
          <button key={m} onClick={() => setViewMode(m)} style={{
            background: viewMode === m ? '#111' : 'none',
            border: `1px solid ${viewMode === m ? '#333' : '#1a1a1a'}`,
            color: viewMode === m ? '#ccc' : '#444',
            fontFamily: 'inherit', fontSize: 9, padding: '1px 8px', cursor: 'pointer', letterSpacing: '0.05em',
          }}>{m}</button>
        ))}
        <span style={{ flex: 1 }} />
        <span style={{ color: '#333', fontSize: 8 }}>Scores ranked within universe · Source: Yahoo Finance</span>
      </div>

      {viewMode === 'QUADRANT' ? (
        <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
          <div style={{ color: '#555', fontSize: 9, marginBottom: 8, letterSpacing: '0.06em' }}>
            Color by sector · Click a stock to open GIP
          </div>
          <StyleQuadrant stocks={stocksArr} onNavigate={onNavigate} />
          {/* Sector legend */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 16 }}>
            {Object.entries(SECTOR_COLOR).filter(([k]) => k !== 'Other').map(([sector, color]) => (
              <span key={sector} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, display: 'inline-block' }} />
                <span style={{ color: '#555', fontSize: 8 }}>{sector}</span>
              </span>
            ))}
          </div>
        </div>
      ) : (
        <div style={{ flex: 1, overflow: 'hidden', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr' }}>
          {categories.map(cat => {
            const ranked = top(cat.key)
            const color  = CATEGORY_COLOR[cat.id]
            return (
              <div key={cat.id} style={{
                display: 'flex', flexDirection: 'column', overflow: 'hidden',
                borderRight: '1px solid #0d0d0d',
              }}>
                {/* Column header */}
                <div style={{
                  padding: '8px 10px',
                  background: '#030303',
                  borderBottom: '1px solid #111',
                  flexShrink: 0,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                    <span style={{ color, fontSize: 11, fontWeight: 'bold', letterSpacing: '0.08em' }}>
                      {CATEGORY_ICON[cat.id]} {cat.label}
                    </span>
                  </div>
                  <div style={{ color: '#444', fontSize: 8, lineHeight: 1.3 }}>{cat.desc}</div>
                </div>
                {/* Cards */}
                <div style={{ flex: 1, overflowY: 'auto' }}>
                  {ranked.map((stock, i) => (
                    <ScoutCard
                      key={stock.symbol}
                      stock={stock}
                      category={cat.id}
                      rank={i + 1}
                      onNavigate={onNavigate}
                    />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── CORRELATION VIEW ──────────────────────────────────────────────────────────
function _logReturns(closes: number[]): number[] {
  const r: number[] = []
  for (let i = 1; i < closes.length; i++)
    if (closes[i - 1] > 0 && closes[i] > 0)
      r.push(Math.log(closes[i] / closes[i - 1]))
  return r
}
function _pearson(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length)
  if (n < 5) return NaN
  let sA = 0, sB = 0, sAB = 0, sA2 = 0, sB2 = 0
  for (let i = 0; i < n; i++) {
    sA += a[i]; sB += b[i]; sAB += a[i] * b[i]; sA2 += a[i] ** 2; sB2 += b[i] ** 2
  }
  const num = n * sAB - sA * sB
  const den = Math.sqrt((n * sA2 - sA ** 2) * (n * sB2 - sB ** 2))
  return den === 0 ? NaN : num / den
}
function _alignClose(a: HistoryPoint[], b: HistoryPoint[]): [number[], number[]] {
  const mb = new Map(b.map(p => [p.t, p.c]))
  const ca: number[] = [], cb: number[] = []
  for (const p of a) { const v = mb.get(p.t); if (v !== undefined) { ca.push(p.c); cb.push(v) } }
  return [ca, cb]
}
function _corrColor(r: number): string {
  if (isNaN(r)) return '#1a1a1a'
  if (r >= 0) { const t = r; return `rgb(${Math.round(20*(1-t))},${Math.round(20+t*80)},${Math.round(20*(1-t))})` }
  const t = -r; return `rgb(${Math.round(20+t*80)},${Math.round(20*(1-t))},${Math.round(20*(1-t))})`
}

type CorrRange = '3mo' | '6mo' | '1y'

function CorrView({ positions }: { positions: Position[] }) {
  const [range, setRange] = useState<CorrRange>('1y')

  const tickers = useMemo(() =>
    [...new Set(positions.map(p => p.ticker.toUpperCase()))].slice(0, 12),
    [positions]
  )

  const histQueries = useQueries({
    queries: tickers.map(ticker => ({
      queryKey: ['history', ticker, range],
      queryFn: () => fetch(`/api/history?symbol=${encodeURIComponent(ticker)}&range=${range}`)
        .then(r => r.json()) as Promise<HistoryPoint[]>,
      staleTime: 60 * 60_000,
    })),
  })

  const loading = histQueries.some(q => q.isLoading)

  const seriesMap = useMemo(() => {
    const m = new Map<string, HistoryPoint[]>()
    tickers.forEach((t, i) => { const d = histQueries[i]?.data; if (Array.isArray(d) && d.length > 0) m.set(t, d) })
    return m
  }, [histQueries, tickers])

  const readyTickers = tickers.filter(t => seriesMap.has(t))
  const n = readyTickers.length

  const matrix: (number | null)[][] = useMemo(() =>
    readyTickers.map((ti, i) => readyTickers.map((tj, j) => {
      if (i === j) return 1
      const [ca, cb] = _alignClose(seriesMap.get(ti)!, seriesMap.get(tj)!)
      const r = _pearson(_logReturns(ca), _logReturns(cb))
      return isNaN(r) ? null : parseFloat(r.toFixed(3))
    })),
    [readyTickers, seriesMap]
  )

  // Average off-diagonal correlation
  const avgCorr = useMemo(() => {
    if (n < 2) return null
    let sum = 0, cnt = 0
    matrix.forEach((row, i) => row.forEach((v, j) => { if (i !== j && v != null) { sum += v; cnt++ } }))
    return cnt > 0 ? sum / cnt : null
  }, [matrix, n])

  if (positions.length === 0) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#444', fontSize: 11 }}>
      No positions — add holdings to view correlation
    </div>
  )

  return (
    <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
      {/* Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', borderBottom: '1px solid #111', flexShrink: 0 }}>
        <span style={{ color: '#333', fontSize: 9, letterSpacing: '0.06em' }}>RANGE:</span>
        {(['3mo','6mo','1y'] as CorrRange[]).map(r => (
          <button key={r} onClick={() => setRange(r)} style={{
            background: range === r ? '#0a1a0a' : 'none',
            border: `1px solid ${range === r ? '#ffa028' : '#222'}`,
            color: range === r ? '#ffa028' : '#444',
            fontFamily: 'inherit', fontSize: 8, padding: '1px 8px', cursor: 'pointer',
          }}>{r}</button>
        ))}
        {avgCorr != null && (
          <>
            <div style={{ width: 1, background: '#222', height: 10, marginLeft: 4 }} />
            <span style={{ color: '#333', fontSize: 9 }}>AVG CORR:</span>
            <span style={{
              fontSize: 11, fontWeight: 'bold',
              color: avgCorr < 0.3 ? '#33ff66' : avgCorr < 0.6 ? '#ffa028' : '#ff3b3b',
            }}>{avgCorr.toFixed(2)}</span>
            <span style={{
              fontSize: 9,
              color: avgCorr < 0.25 ? '#33ff66' : avgCorr < 0.45 ? '#33ff66' : avgCorr < 0.65 ? '#ffa028' : '#ff3b3b',
            }}>
              {avgCorr < 0.25 ? '· EXCELLENT DIVERSIFICATION' : avgCorr < 0.45 ? '· GOOD DIVERSIFICATION' : avgCorr < 0.65 ? '· MODERATE DIVERSIFICATION' : '· CONCENTRATED'}
            </span>
          </>
        )}
        <span style={{ marginLeft: 'auto', color: '#222', fontSize: 8 }}>Pearson r · daily log-returns · max 12 tickers</span>
      </div>

      {loading && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#444' }}>
          Loading price history…
        </div>
      )}

      {!loading && n < 2 && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#444', fontSize: 11 }}>
          Need at least 2 positions with available price history
        </div>
      )}

      {!loading && n >= 2 && (
        <div style={{ padding: '14px 16px', overflow: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', tableLayout: 'fixed' }}>
            <thead>
              <tr>
                <th style={{ width: 60 }} />
                {readyTickers.map(t => (
                  <th key={t} style={{ color: '#555', fontSize: 8, fontWeight: 'normal', padding: '0 2px 8px', textAlign: 'center', width: 54 }}>
                    <div style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', height: 46, overflow: 'hidden', textOverflow: 'ellipsis', letterSpacing: '0.04em' }}>
                      {t}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {readyTickers.map((ti, i) => (
                <tr key={ti}>
                  <td style={{ color: '#555', fontSize: 9, padding: '2px 10px 2px 0', textAlign: 'right', whiteSpace: 'nowrap' }}>{ti}</td>
                  {readyTickers.map((_, j) => {
                    const r = matrix[i][j]
                    const diag = i === j
                    return (
                      <td key={j} style={{ width: 54, height: 42, padding: 1, background: diag ? '#111' : _corrColor(r ?? NaN), textAlign: 'center', verticalAlign: 'middle' }}>
                        <span style={{ color: diag ? '#ffa028' : (Math.abs(r ?? 0) > 0.3 ? '#e8e8e8' : '#555'), fontSize: diag ? 10 : 9, fontWeight: diag ? 'bold' : 'normal' }}>
                          {diag ? '1.00' : r != null ? r.toFixed(2) : '—'}
                        </span>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>

          {/* Legend */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 16 }}>
            <span style={{ color: '#333', fontSize: 8 }}>CORRELATION:</span>
            {([[-1,'#501010'],[-0.5,'#381818'],[0,'#141414'],[0.5,'#183818'],[1,'#105010']] as [number,string][]).map(([v,bg]) => (
              <div key={v} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                <div style={{ width: 12, height: 12, background: bg }} />
                <span style={{ color: '#333', fontSize: 8 }}>{v}</span>
              </div>
            ))}
            {tickers.length > n && (
              <span style={{ color: '#2a2a2a', fontSize: 8, marginLeft: 8 }}>{tickers.length - n} ticker(s) missing history</span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

type SubView = 'HOLDINGS' | 'MAP' | 'HISTORY' | 'EF' | 'PERFORMANCE' | 'RISK' | 'ALLOCATION' | 'BLOTTER' | 'CORR' | 'SCOUT'

export function PORT() {
  const { positions, addPosition, updatePosition, removePosition, loadPortfolio, watchlist, alerts, addAlert, removeAlert, setActiveTicker, setActiveView } = useTerminalStore()
  const [modal,        setModal]      = useState<'add' | Position | null>(null)
  const [subView,      setSubView]    = useState<SubView>('HOLDINGS')
  const [detailPos,    setDetailPos]  = useState<Position | null>(null)
  const [baseCcy,      setBaseCcy]    = useState<BaseCurrency>('USD')
  const [importStatus, setImportStatus] = useState<{ ok: boolean; msg: string } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!fileInputRef.current) return
    fileInputRef.current.value = ''   // reset so same file can be re-imported
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target?.result as string
      const result = parseImportFile(text, file.name.toLowerCase())
      if (result.error) {
        setImportStatus({ ok: false, msg: result.error })
        setTimeout(() => setImportStatus(null), 4000)
        return
      }
      loadPortfolio(result.positions, result.watchlist ?? undefined)
      setImportStatus({ ok: true, msg: `Loaded ${result.positions.length} position${result.positions.length !== 1 ? 's' : ''}${result.watchlist ? ` + ${result.watchlist.length} watchlist items` : ''}` })
      setTimeout(() => setImportStatus(null), 3500)
    }
    reader.readAsText(file)
  }

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

  const SUBVIEWS: SubView[] = ['HOLDINGS', 'MAP', 'HISTORY', 'EF', 'PERFORMANCE', 'RISK', 'ALLOCATION', 'CORR', 'BLOTTER', 'SCOUT']

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
          {/* Hidden file input for import */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,.csv"
            style={{ display: 'none' }}
            onChange={handleImport}
          />
          {/* Import status toast */}
          {importStatus && (
            <span style={{
              fontSize: 9, padding: '2px 8px',
              color: importStatus.ok ? '#33ff66' : '#ff3b3b',
              border: `1px solid ${importStatus.ok ? '#1a4a1a' : '#4a1a1a'}`,
              background: importStatus.ok ? '#0a1a0a' : '#1a0a0a',
            }}>
              {importStatus.ok ? '✓' : '✗'} {importStatus.msg}
            </span>
          )}
          <button onClick={() => exportCSV(positions, quotes, fx, baseCcy)} style={{
            background: 'none', border: '1px solid #2a2a2a', color: '#e8e8e8',
            fontFamily: 'inherit', fontSize: 10, padding: '3px 10px', cursor: 'pointer', letterSpacing: '0.06em',
          }}>↓ CSV</button>
          <button onClick={() => exportJSON(positions, watchlist)} style={{
            background: 'none', border: '1px solid #2a2a2a', color: '#e8e8e8',
            fontFamily: 'inherit', fontSize: 10, padding: '3px 10px', cursor: 'pointer', letterSpacing: '0.06em',
          }}>↓ JSON</button>
          <button onClick={() => fileInputRef.current?.click()} style={{
            background: 'none', border: '1px solid #2a2a2a', color: '#ffa028',
            fontFamily: 'inherit', fontSize: 10, padding: '3px 10px', cursor: 'pointer', letterSpacing: '0.06em',
          }}>↑ IMPORT</button>
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
          {subView === 'HISTORY'     && <HistoryView            positions={positions} fx={fx} baseCcy={baseCcy} />}
          {subView === 'EF'          && <EfficientFrontierView positions={positions} fx={fx} baseCcy={baseCcy} />}
          {subView === 'PERFORMANCE' && <PerformanceView positions={positions} quotes={quotes} fx={fx} baseCcy={baseCcy} />}
          {subView === 'RISK'        && <RiskView        positions={positions} quotes={quotes} fx={fx} baseCcy={baseCcy} />}
          {subView === 'ALLOCATION'  && <AllocationView  positions={positions} quotes={quotes} metrics={metrics} fx={fx} baseCcy={baseCcy} />}
          {subView === 'CORR'        && <CorrView        positions={positions} />}
          {subView === 'BLOTTER'     && <BlotterView     positions={positions} quotes={quotes} fx={fx} baseCcy={baseCcy} onSelect={p => setDetailPos(detailPos?.id === p.id ? null : p)} />}
          {subView === 'SCOUT'      && <ScoutView onNavigate={ticker => { setActiveTicker(ticker); setActiveView('GIP') }} />}
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
