'use client'
import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTerminalStore } from '@/lib/store'
import { usePaneTicker } from '@/lib/pane-context'
import type { OptionsChain, OptionContract } from '@/app/api/options/route'

// ── Helpers ──────────────────────────────────────────────────────────────────
function fmt(n: number | undefined, dec = 2) {
  if (n == null || isNaN(n)) return '—'
  return n.toFixed(dec)
}
function fmtPct(n: number | undefined) {
  if (n == null || isNaN(n)) return '—'
  return (n * 100).toFixed(1) + '%'
}
function fmtVol(n: number) {
  if (!n) return '—'
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M'
  if (n >= 1e3) return (n / 1e3).toFixed(0) + 'K'
  return String(n)
}
function fmtExpiry(ts: number) {
  const d = new Date(ts * 1000)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })
}
function daysTo(ts: number) {
  return Math.max(0, Math.round((ts * 1000 - Date.now()) / 86_400_000))
}

// ── Single option row ─────────────────────────────────────────────────────────
function OptionRow({ opt, isCall, spotPrice, isATM }: {
  opt: OptionContract
  isCall: boolean
  spotPrice: number
  isATM: boolean
}) {
  const itm   = opt.inTheMoney
  const bg    = isATM ? '#0d1a0d' : itm ? (isCall ? '#0a140a' : '#140a0a') : 'transparent'
  const dimClr = '#555'

  const mid   = opt.bid > 0 && opt.ask > 0 ? (opt.bid + opt.ask) / 2 : opt.lastPrice
  const spread = opt.bid > 0 && opt.ask > 0 ? opt.ask - opt.bid : 0

  return (
    <tr style={{ background: bg, borderBottom: '1px solid #0d0d0d' }}>
      {/* For calls: left-to-right. For puts: right-to-left (mirrored). */}
      {isCall ? (
        <>
          <td style={{ padding: '2px 6px', color: itm ? '#33ff66' : dimClr, fontSize: 9, textAlign: 'right' }}>
            {itm ? 'ITM' : 'OTM'}
          </td>
          <td style={{ padding: '2px 6px', color: '#e8e8e8', fontSize: 10, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmt(opt.delta)}</td>
          <td style={{ padding: '2px 6px', color: '#c0c0c0', fontSize: 10, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmt(opt.impliedVol * 100, 1)}%</td>
          <td style={{ padding: '2px 6px', color: '#777', fontSize: 10, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtVol(opt.openInterest)}</td>
          <td style={{ padding: '2px 6px', color: '#777', fontSize: 10, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtVol(opt.volume)}</td>
          <td style={{ padding: '2px 6px', color: '#d8d8d8', fontSize: 10, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmt(opt.bid)}</td>
          <td style={{ padding: '2px 6px', color: '#d8d8d8', fontSize: 10, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmt(opt.ask)}</td>
          <td style={{ padding: '2px 6px', color: '#e8e8e8', fontSize: 10, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmt(mid)}</td>
          {/* Strike — shared centre column */}
          <td style={{
            padding: '2px 8px', fontWeight: 'bold', fontSize: 11, textAlign: 'center',
            background: isATM ? '#1a2a1a' : '#080808',
            color: isATM ? '#ffa028' : '#ccc',
            borderLeft: '1px solid #111', borderRight: '1px solid #111',
          }}>
            {fmt(opt.strike, opt.strike % 1 === 0 ? 0 : 2)}
          </td>
        </>
      ) : (
        <>
          {/* Strike already rendered in call row for same strike; here it's blank */}
          <td style={{
            padding: '2px 8px', fontWeight: 'bold', fontSize: 11, textAlign: 'center',
            background: isATM ? '#1a1a2a' : '#080808',
            color: isATM ? '#ffa028' : '#ccc',
            borderLeft: '1px solid #111', borderRight: '1px solid #111',
          }}>
            {fmt(opt.strike, opt.strike % 1 === 0 ? 0 : 2)}
          </td>
          <td style={{ padding: '2px 6px', color: '#e8e8e8', fontSize: 10, textAlign: 'left', fontVariantNumeric: 'tabular-nums' }}>{fmt(mid)}</td>
          <td style={{ padding: '2px 6px', color: '#d8d8d8', fontSize: 10, textAlign: 'left', fontVariantNumeric: 'tabular-nums' }}>{fmt(opt.bid)}</td>
          <td style={{ padding: '2px 6px', color: '#d8d8d8', fontSize: 10, textAlign: 'left', fontVariantNumeric: 'tabular-nums' }}>{fmt(opt.ask)}</td>
          <td style={{ padding: '2px 6px', color: '#777', fontSize: 10, textAlign: 'left', fontVariantNumeric: 'tabular-nums' }}>{fmtVol(opt.volume)}</td>
          <td style={{ padding: '2px 6px', color: '#777', fontSize: 10, textAlign: 'left', fontVariantNumeric: 'tabular-nums' }}>{fmtVol(opt.openInterest)}</td>
          <td style={{ padding: '2px 6px', color: '#c0c0c0', fontSize: 10, textAlign: 'left', fontVariantNumeric: 'tabular-nums' }}>{fmt(opt.impliedVol * 100, 1)}%</td>
          <td style={{ padding: '2px 6px', color: '#e8e8e8', fontSize: 10, textAlign: 'left', fontVariantNumeric: 'tabular-nums' }}>{fmt(opt.delta)}</td>
          <td style={{ padding: '2px 6px', color: itm ? '#ff3b3b' : dimClr, fontSize: 9, textAlign: 'left' }}>
            {itm ? 'ITM' : 'OTM'}
          </td>
        </>
      )}
    </tr>
  )
}

// ── Main panel ────────────────────────────────────────────────────────────────
export function OPT() {
  const { activeTicker: _globalTicker } = useTerminalStore()
  const activeTicker = usePaneTicker(_globalTicker)
  const [selectedDate, setSelectedDate] = useState<number | null>(null)
  const [strikeRange, setStrikeRange]   = useState<'all' | '10%' | '20%'>('20%')

  // Fetch chain (first expiry or selected)
  const dateQuery = selectedDate ? `&date=${selectedDate}` : ''
  const { data: chain, isLoading, error } = useQuery<OptionsChain>({
    queryKey: ['options', activeTicker, selectedDate],
    queryFn:  () => fetch(`/api/options?symbol=${activeTicker}${dateQuery}`).then(r => r.json()),
    staleTime: 5 * 60_000,
    enabled: !!activeTicker,
  })

  // Set default expiry once loaded — guard against error response shape
  const chainOk = chain && Array.isArray(chain.expirations)
  const expirations = chainOk ? chain.expirations : []
  const activeExpiry = selectedDate ?? expirations[0] ?? null

  // Filter strikes by range
  const S = chainOk ? (chain.price ?? 0) : 0
  const { filteredCalls, filteredPuts, allStrikes } = useMemo(() => {
    if (!chain) return { filteredCalls: [], filteredPuts: [], allStrikes: [] }
    const calls = chain.calls ?? []
    const puts  = chain.puts  ?? []
    const mult = strikeRange === 'all' ? Infinity : strikeRange === '20%' ? 0.20 : 0.10
    const lo = S * (1 - mult), hi = S * (1 + mult)
    const filter = (opts: OptionContract[]) =>
      strikeRange === 'all' ? opts : opts.filter(o => o.strike >= lo && o.strike <= hi)
    const fc = filter(calls)
    const fp = filter(puts)
    const strikes = Array.from(new Set([...fc.map(c => c.strike), ...fp.map(p => p.strike)])).sort((a, b) => a - b)
    return { filteredCalls: fc, filteredPuts: fp, allStrikes: strikes }
  }, [chain, S, strikeRange])

  // Build merged rows by strike
  const rows = useMemo(() => allStrikes.map(strike => ({
    strike,
    call: filteredCalls.find(c => c.strike === strike) ?? null,
    put:  filteredPuts.find(p  => p.strike === strike) ?? null,
  })), [allStrikes, filteredCalls, filteredPuts])

  // ATM strike
  const atmStrike = allStrikes.reduce((best, s) =>
    Math.abs(s - S) < Math.abs(best - S) ? s : best, allStrikes[0] ?? 0)

  const hdr = (label: string, align: 'left' | 'right' | 'center' = 'right') => (
    <th style={{ color: '#444', fontSize: 9, padding: '2px 6px', textAlign: align, fontWeight: 'normal', letterSpacing: '0.06em', borderBottom: '1px solid #111', whiteSpace: 'nowrap' }}>
      {label}
    </th>
  )

  if (!activeTicker) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#333' }}>
      Enter a ticker in the command bar
    </div>
  )

  return (
    <div className="panel" style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* Header */}
      <div className="panel-header" style={{ justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="panel-mnemonic">OPT</span>
          <span className="panel-ticker">{activeTicker}</span>
          {S > 0 && <span style={{ color: '#e8e8e8', fontSize: 11 }}>${fmt(S)}</span>}
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          {chainOk && (
            <>
              <span style={{ color: '#444', fontSize: 9 }}>P/C RATIO:</span>
              <span style={{ color: (chain.pcRatio ?? 0) > 1 ? '#ff3b3b' : '#33ff66', fontSize: 10 }}>
                {(chain.pcRatio ?? 0).toFixed(2)}
              </span>
              <span style={{ color: '#444', fontSize: 9 }}>ATM IV:</span>
              <span style={{ color: '#ffa028', fontSize: 10 }}>{fmtPct(chain.atmIV)}</span>
            </>
          )}
          <span style={{ color: '#444', fontSize: 9 }}>RANGE:</span>
          {(['10%', '20%', 'all'] as const).map(r => (
            <button key={r} onClick={() => setStrikeRange(r)} style={{
              background: strikeRange === r ? '#0d1a0d' : 'none',
              border: 'none', borderBottom: `2px solid ${strikeRange === r ? '#ffa028' : 'transparent'}`,
              color: strikeRange === r ? '#ffa028' : '#555',
              fontFamily: 'inherit', fontSize: 9, padding: '0 4px', cursor: 'pointer',
            }}>{r.toUpperCase()}</button>
          ))}
        </div>
      </div>

      {/* Expiry tabs */}
      <div style={{
        display: 'flex', overflowX: 'auto', flexShrink: 0,
        borderBottom: '1px solid #111', background: '#020202',
        scrollbarWidth: 'none',
      }}>
        {expirations.slice(0, 16).map(ts => {
          const active = ts === (activeExpiry)
          const days   = daysTo(ts)
          const isWeekly = days <= 7
          return (
            <button key={ts} onClick={() => setSelectedDate(ts)} style={{
              flexShrink: 0, background: active ? '#0d1a0d' : 'none',
              border: 'none', borderBottom: `2px solid ${active ? '#ffa028' : 'transparent'}`,
              borderRight: '1px solid #111',
              color: active ? '#ffa028' : isWeekly ? '#33ff66' : '#555',
              fontFamily: 'inherit', fontSize: 9, padding: '4px 10px', cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}>
              {fmtExpiry(ts)}
              <span style={{ color: '#333', marginLeft: 4 }}>{days}d</span>
            </button>
          )
        })}
      </div>

      {/* Loading / error */}
      {isLoading && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#444' }}>
          Loading option chain…
        </div>
      )}
      {error && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ff3b3b', fontSize: 11 }}>
          Failed to load options — {String(error)}
        </div>
      )}

      {/* Chain table */}
      {!isLoading && !chainOk && !error && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#555', fontSize: 11 }}>
          No option chain available for {activeTicker} — options may not trade on this symbol
        </div>
      )}
      {!isLoading && chainOk && (
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
            <thead style={{ position: 'sticky', top: 0, background: '#020202', zIndex: 1 }}>
              <tr>
                {/* CALLS headers */}
                {hdr('', 'left')}
                {hdr('DELTA')}
                {hdr('IV')}
                {hdr('OI')}
                {hdr('VOL')}
                {hdr('BID')}
                {hdr('ASK')}
                {hdr('MID')}
                {/* STRIKE */}
                <th style={{ color: '#ffa028', fontSize: 9, padding: '2px 8px', textAlign: 'center', borderLeft: '1px solid #111', borderRight: '1px solid #111', background: '#050505', letterSpacing: '0.08em', borderBottom: '1px solid #111' }}>
                  STRIKE
                </th>
                {/* PUTS headers */}
                {hdr('MID', 'left')}
                {hdr('BID', 'left')}
                {hdr('ASK', 'left')}
                {hdr('VOL', 'left')}
                {hdr('OI', 'left')}
                {hdr('IV', 'left')}
                {hdr('DELTA', 'left')}
                {hdr('', 'left')}
              </tr>
              {/* Sub-header: CALLS / PUTS labels */}
              <tr>
                <td colSpan={8} style={{ textAlign: 'center', color: '#33ff66', fontSize: 9, padding: '1px 0', background: '#020202', letterSpacing: '0.1em', borderBottom: '1px solid #0d0d0d' }}>
                  CALLS
                </td>
                <td style={{ background: '#050505', borderLeft: '1px solid #111', borderRight: '1px solid #111', borderBottom: '1px solid #0d0d0d' }} />
                <td colSpan={8} style={{ textAlign: 'center', color: '#ff3b3b', fontSize: 9, padding: '1px 0', background: '#020202', letterSpacing: '0.1em', borderBottom: '1px solid #0d0d0d' }}>
                  PUTS
                </td>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ strike, call, put }) => {
                const isATM = strike === atmStrike
                return (
                  <tr key={strike} style={{ background: isATM ? '#0d160d' : 'transparent', borderBottom: '1px solid #0a0a0a' }}>
                    {/* CALL side */}
                    <td style={{ padding: '2px 6px', color: call?.inTheMoney ? '#33ff66' : '#444', fontSize: 9, textAlign: 'right' }}>
                      {call ? (call.inTheMoney ? 'ITM' : 'OTM') : ''}
                    </td>
                    <td style={{ padding: '2px 6px', color: '#e8e8e8', fontSize: 10, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{call ? fmt(call.delta) : '—'}</td>
                    <td style={{ padding: '2px 6px', color: '#c0c0c0', fontSize: 10, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{call ? fmt(call.impliedVol * 100, 1) + '%' : '—'}</td>
                    <td style={{ padding: '2px 6px', color: '#666', fontSize: 10, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{call ? fmtVol(call.openInterest) : '—'}</td>
                    <td style={{ padding: '2px 6px', color: '#666', fontSize: 10, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{call ? fmtVol(call.volume) : '—'}</td>
                    <td style={{ padding: '2px 6px', color: '#d8d8d8', fontSize: 10, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{call ? fmt(call.bid) : '—'}</td>
                    <td style={{ padding: '2px 6px', color: '#d8d8d8', fontSize: 10, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{call ? fmt(call.ask) : '—'}</td>
                    <td style={{ padding: '2px 6px', color: '#ddd', fontSize: 10, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 'bold' }}>
                      {call && call.bid > 0 && call.ask > 0 ? fmt((call.bid + call.ask) / 2) : call ? fmt(call.lastPrice) : '—'}
                    </td>

                    {/* STRIKE — centre spine */}
                    <td style={{
                      padding: '2px 10px', fontWeight: 'bold', fontSize: 11, textAlign: 'center',
                      background: isATM ? '#1a2a1a' : '#080808',
                      color: isATM ? '#ffa028' : '#aaa',
                      borderLeft: '1px solid #1a1a1a', borderRight: '1px solid #1a1a1a',
                    }}>
                      {strike % 1 === 0 ? strike : strike.toFixed(2)}
                      {isATM && <span style={{ display: 'block', fontSize: 7, color: '#ffa028', letterSpacing: '0.1em' }}>ATM</span>}
                    </td>

                    {/* PUT side */}
                    <td style={{ padding: '2px 6px', color: '#ddd', fontSize: 10, textAlign: 'left', fontVariantNumeric: 'tabular-nums', fontWeight: 'bold' }}>
                      {put && put.bid > 0 && put.ask > 0 ? fmt((put.bid + put.ask) / 2) : put ? fmt(put.lastPrice) : '—'}
                    </td>
                    <td style={{ padding: '2px 6px', color: '#d8d8d8', fontSize: 10, textAlign: 'left', fontVariantNumeric: 'tabular-nums' }}>{put ? fmt(put.bid) : '—'}</td>
                    <td style={{ padding: '2px 6px', color: '#d8d8d8', fontSize: 10, textAlign: 'left', fontVariantNumeric: 'tabular-nums' }}>{put ? fmt(put.ask) : '—'}</td>
                    <td style={{ padding: '2px 6px', color: '#666', fontSize: 10, textAlign: 'left', fontVariantNumeric: 'tabular-nums' }}>{put ? fmtVol(put.volume) : '—'}</td>
                    <td style={{ padding: '2px 6px', color: '#666', fontSize: 10, textAlign: 'left', fontVariantNumeric: 'tabular-nums' }}>{put ? fmtVol(put.openInterest) : '—'}</td>
                    <td style={{ padding: '2px 6px', color: '#c0c0c0', fontSize: 10, textAlign: 'left', fontVariantNumeric: 'tabular-nums' }}>{put ? fmt(put.impliedVol * 100, 1) + '%' : '—'}</td>
                    <td style={{ padding: '2px 6px', color: '#e8e8e8', fontSize: 10, textAlign: 'left', fontVariantNumeric: 'tabular-nums' }}>{put ? fmt(put.delta) : '—'}</td>
                    <td style={{ padding: '2px 6px', color: put?.inTheMoney ? '#ff3b3b' : '#444', fontSize: 9, textAlign: 'left' }}>
                      {put ? (put.inTheMoney ? 'ITM' : 'OTM') : ''}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          {rows.length === 0 && !isLoading && (
            <div style={{ padding: 20, color: '#333', textAlign: 'center', fontSize: 11 }}>
              No options data for this expiry
            </div>
          )}
        </div>
      )}

      {/* Footer: Greeks legend */}
      {chainOk && (
        <div style={{ flexShrink: 0, borderTop: '1px solid #0d0d0d', padding: '3px 10px', display: 'flex', gap: 16, background: '#020202' }}>
          {[
            ['DELTA', 'Price sensitivity to $1 move in underlying'],
            ['IV', 'Implied Volatility (annualised)'],
            ['OI', 'Open Interest — total outstanding contracts'],
            ['VOL', 'Volume traded today'],
            ['MID', 'Mid-point of bid/ask spread'],
          ].map(([k, v]) => (
            <span key={k} style={{ fontSize: 8, color: '#333' }}>
              <span style={{ color: '#555' }}>{k}</span> {v}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
