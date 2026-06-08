'use client'
import { useQuery } from '@tanstack/react-query'
import { useTerminalStore } from '@/lib/store'
import type { CommodityRow } from '@/app/api/commodities/route'

function fmt(v: number | null, dec = 2): string {
  if (v == null || isNaN(v)) return '—'
  return v.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec })
}

function RangeBar({ low, high, price, label = '' }: { low: number | null; high: number | null; price: number | null; label?: string }) {
  if (low == null || high == null || price == null || high === low) {
    return <div style={{ width: 80, height: 4, background: '#111', borderRadius: 2 }} />
  }
  const pct = Math.max(0, Math.min(100, ((price - low) / (high - low)) * 100))
  return (
    <div title={`${label}${low.toFixed(2)} – ${high.toFixed(2)}`}
      style={{ position: 'relative', width: 80, height: 4, background: '#1a1a1a', borderRadius: 2, cursor: 'default' }}>
      <div style={{
        position: 'absolute', left: 0, top: 0, height: '100%',
        width: `${pct}%`, background: '#333', borderRadius: 2,
      }} />
      <div style={{
        position: 'absolute', top: -2, left: `${pct}%`, transform: 'translateX(-50%)',
        width: 2, height: 8, background: '#ffa028', borderRadius: 1,
      }} />
    </div>
  )
}

function CommoditySection({
  title,
  rows,
  onSelect,
  activeTicker,
}: {
  title: string
  rows: CommodityRow[]
  onSelect: (symbol: string) => void
  activeTicker: string
}) {
  if (!rows.length) return null
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{
        color: '#ffa028', fontSize: 10, fontWeight: 'bold',
        letterSpacing: '0.1em', marginBottom: 4,
        borderBottom: '1px solid #1a1a1a', paddingBottom: 4,
      }}>
        {title.toUpperCase()}
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
        <colgroup>
          <col style={{ width: '22%' }} />  {/* Commodity */}
          <col style={{ width: '10%' }} />  {/* Last */}
          <col style={{ width: '10%' }} />  {/* Chg */}
          <col style={{ width: '10%' }} />  {/* %Chg */}
          <col style={{ width: '10%' }} />  {/* Unit */}
          <col style={{ width: '18%' }} />  {/* Range */}
          <col style={{ width: '10%' }} />  {/* Symbol */}
        </colgroup>
        <thead>
          <tr style={{ borderBottom: '1px solid #111' }}>
            <th style={{ color: '#333', fontSize: 9, fontWeight: 'normal', padding: '3px 8px', textAlign: 'left',   letterSpacing: '0.05em' }}>Commodity</th>
            <th style={{ color: '#333', fontSize: 9, fontWeight: 'normal', padding: '3px 8px', textAlign: 'right',  letterSpacing: '0.05em' }}>Last</th>
            <th style={{ color: '#333', fontSize: 9, fontWeight: 'normal', padding: '3px 8px', textAlign: 'right',  letterSpacing: '0.05em' }}>Chg</th>
            <th style={{ color: '#333', fontSize: 9, fontWeight: 'normal', padding: '3px 8px', textAlign: 'right',  letterSpacing: '0.05em' }}>%Chg</th>
            <th style={{ color: '#333', fontSize: 9, fontWeight: 'normal', padding: '3px 8px', textAlign: 'right',  letterSpacing: '0.05em' }}>Unit</th>
            <th style={{ color: '#333', fontSize: 9, fontWeight: 'normal', padding: '3px 8px', textAlign: 'center', letterSpacing: '0.05em' }}>52W Range</th>
            <th style={{ color: '#333', fontSize: 9, fontWeight: 'normal', padding: '3px 8px', textAlign: 'right',  letterSpacing: '0.05em' }}>Symbol</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const isActive = activeTicker === row.symbol
            const up = row.change != null ? row.change >= 0 : null
            const chgColor = up == null ? '#555' : up ? '#33ff66' : '#ff3b3b'
            return (
              <tr
                key={row.symbol}
                onClick={() => onSelect(row.symbol)}
                style={{ borderBottom: '1px solid #0a0a0a', cursor: 'pointer', background: isActive ? '#0a120a' : 'transparent' }}
              >
                <td style={{ padding: '5px 8px', color: isActive ? '#ffa028' : '#cccccc', fontSize: 11, fontWeight: isActive ? 'bold' : 'normal', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {row.name}
                </td>
                <td style={{ padding: '5px 8px', color: '#eeeeee', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontSize: 11, fontWeight: 'bold' }}>
                  {fmt(row.price)}
                </td>
                <td style={{ padding: '5px 8px', color: chgColor, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontSize: 11 }}>
                  {row.change != null ? `${row.change >= 0 ? '+' : ''}${fmt(row.change)}` : '—'}
                </td>
                <td style={{ padding: '5px 8px', color: chgColor, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontSize: 11 }}>
                  {row.changePct != null ? `${row.changePct >= 0 ? '+' : ''}${row.changePct.toFixed(2)}%` : '—'}
                </td>
                <td style={{ padding: '5px 8px', color: '#444', textAlign: 'right', fontSize: 9 }}>
                  {row.unit}
                </td>
                <td style={{ padding: '5px 8px', textAlign: 'center' }}>
                  <div style={{ display: 'flex', justifyContent: 'center' }}>
                    <RangeBar low={row.low52} high={row.high52} price={row.price} label="52W: " />
                  </div>
                </td>
                <td style={{ padding: '5px 8px', color: '#333', textAlign: 'right', fontSize: 9, fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {row.symbol}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export function GLCO() {
  const { activeTicker, openTab } = useTerminalStore()

  const { data, isLoading, error } = useQuery<{ rows: CommodityRow[] }>({
    queryKey: ['commodities'],
    queryFn: () => fetch('/api/commodities').then((r) => r.json()),
    staleTime: 3 * 60_000,
    refetchInterval: 3 * 60_000,
  })

  const handleSelect = (symbol: string) => {
    openTab(symbol, 'GIP')
  }

  const rows = Array.isArray(data?.rows) ? data!.rows : []
  const energy = rows.filter((r) => r.group === 'Energy')
  const metals = rows.filter((r) => r.group === 'Metals')
  const agri = rows.filter((r) => r.group === 'Agriculture')

  return (
    <div className="panel" style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div className="panel-header" style={{ justifyContent: 'space-between' }}>
        <span className="panel-mnemonic">GLCO — GLOBAL COMMODITY PRICES</span>
        <span style={{ color: '#333', fontSize: 10 }}>Click row to chart · refreshes every 3 min</span>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
        {isLoading && (
          <div>
            {[...Array(10)].map((_, i) => (
              <div key={i} className="skeleton" style={{ height: 13, marginBottom: 5, width: `${50 + (i * 11) % 40}%` }} />
            ))}
          </div>
        )}

        {error && <div style={{ color: '#ff3b3b', fontSize: 11 }}>Failed to load commodity data</div>}

        {rows.length > 0 && (
          <>
            <CommoditySection title="Energy"      rows={energy} onSelect={handleSelect} activeTicker={activeTicker} />
            <CommoditySection title="Metals"      rows={metals} onSelect={handleSelect} activeTicker={activeTicker} />
            <CommoditySection title="Agriculture" rows={agri}   onSelect={handleSelect} activeTicker={activeTicker} />
          </>
        )}
      </div>
    </div>
  )
}
