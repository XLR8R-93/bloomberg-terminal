'use client'
import { useQuery } from '@tanstack/react-query'
import { useTerminalStore } from '@/lib/store'
import { usePaneTicker } from '@/lib/pane-context'
import { useState } from 'react'

type Statement = 'income' | 'balance' | 'cash'
type Period = 'annual' | 'quarterly'

interface FAData {
  income?: Record<string, unknown>[]
  balance?: Record<string, unknown>[]
  cash?: Record<string, unknown>[]
  error?: string
}

function toNum(v: unknown): number | null {
  if (v == null || v === '') return null
  const n = Number(v)
  return isNaN(n) ? null : n
}

function fmtNum(v: unknown): string {
  const n = toNum(v)
  if (n == null) return '—'
  const abs = Math.abs(n)
  let s = abs >= 1e9 ? `${(abs / 1e9).toFixed(1)}B`
         : abs >= 1e6 ? `${(abs / 1e6).toFixed(1)}M`
         : abs.toLocaleString('en-US', { maximumFractionDigits: 0 })
  return n < 0 ? `(${s})` : s
}

function fmtYoY(curr: unknown, prev: unknown): { str: string; color: string } | null {
  const c = toNum(curr)
  const p = toNum(prev)
  if (c == null || p == null || p === 0) return null
  const pct = ((c - p) / Math.abs(p)) * 100
  const str = `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`
  const color = pct >= 0 ? '#33ff66' : '#ff3b3b'
  return { str, color }
}

interface FieldDef { key: string; label: string; bold?: boolean; indent?: boolean; separator?: boolean }

const INCOME_FIELDS: FieldDef[] = [
  { key: 'revenue',           label: 'Revenue',            bold: true },
  { key: 'costOfRevenue',     label: 'Cost of Revenue',    indent: true },
  { key: 'grossProfit',       label: 'Gross Profit',       bold: true, separator: true },
  { key: 'operatingExpenses', label: 'Operating Expenses', indent: true },
  { key: 'operatingIncome',   label: 'Operating Income',   bold: true, separator: true },
  { key: 'netIncome',         label: 'Net Income',         bold: true, separator: true },
  { key: 'eps',               label: 'EPS (Basic)' },
  { key: 'epsdiluted',        label: 'EPS (Diluted)' },
]

const BALANCE_FIELDS: FieldDef[] = [
  { key: 'cashAndCashEquivalents',  label: 'Cash & Equivalents' },
  { key: 'totalCurrentAssets',      label: 'Total Current Assets',       bold: true },
  { key: 'totalAssets',             label: 'Total Assets',               bold: true, separator: true },
  { key: 'totalCurrentLiabilities', label: 'Total Current Liabilities',  bold: true },
  { key: 'totalDebt',               label: 'Total Debt' },
  { key: 'totalLiabilities',        label: 'Total Liabilities',          bold: true, separator: true },
  { key: 'totalStockholdersEquity', label: 'Total Equity',               bold: true },
]

const CASH_FIELDS: FieldDef[] = [
  { key: 'operatingCashFlow',                       label: 'Operating CF',  bold: true },
  { key: 'capitalExpenditure',                      label: 'Capex',         indent: true },
  { key: 'freeCashFlow',                            label: 'Free Cash Flow',bold: true, separator: true },
  { key: 'dividendsPaid',                           label: 'Dividends Paid' },
  { key: 'netCashProvidedByFinancingActivities',    label: 'Financing CF' },
]

function TabBtn({ id, label, active, onClick }: { id: string; label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? '#111' : 'transparent',
        border: 'none',
        borderRight: '1px solid #1a1a1a',
        borderBottom: `2px solid ${active ? '#ffa028' : 'transparent'}`,
        color: active ? '#ffa028' : '#555',
        padding: '0 10px',
        cursor: 'pointer',
        font: 'inherit',
        fontSize: 10,
        letterSpacing: '0.05em',
        height: '100%',
      }}
    >
      {label}
    </button>
  )
}

export function FA() {
  const { activeTicker: _globalTicker } = useTerminalStore()
  const activeTicker = usePaneTicker(_globalTicker)
  const [statement, setStatement] = useState<Statement>('income')
  const [period, setPeriod] = useState<Period>('annual')

  const { data, isLoading, error } = useQuery<FAData>({
    queryKey: ['fa', activeTicker, period],
    queryFn: () => fetch(`/api/fmp?symbol=${activeTicker}&period=${period}`).then((r) => r.json()),
    staleTime: 24 * 60 * 60_000,
  })

  const fields = statement === 'income' ? INCOME_FIELDS
    : statement === 'balance' ? BALANCE_FIELDS
    : CASH_FIELDS

  const rawData = statement === 'income' ? data?.income
    : statement === 'balance' ? data?.balance
    : data?.cash

  // Show up to 5 periods, oldest first
  const dataSlice = (rawData || []).slice(0, 5).reverse()
  const periods = dataSlice.map((d) => {
    const raw = String(d.date || d.period || '')
    // For quarterly show "Q1 2024" style if possible
    return raw.slice(0, 10)
  })

  return (
    <div className="panel" style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header with tabs inline */}
      <div style={{ display: 'flex', alignItems: 'stretch', borderBottom: '1px solid #1f1f1f', background: '#050505', flexShrink: 0, height: 28 }}>
        <span style={{ color: '#ffa028', fontSize: 10, padding: '0 8px', alignSelf: 'center', letterSpacing: '0.08em', flexShrink: 0 }}>FA</span>
        <div style={{ width: 1, background: '#1f1f1f' }} />
        <TabBtn id="income"  label="Income Stmt"  active={statement === 'income'}  onClick={() => setStatement('income')} />
        <TabBtn id="balance" label="Balance Sheet" active={statement === 'balance'} onClick={() => setStatement('balance')} />
        <TabBtn id="cash"    label="Cash Flow"     active={statement === 'cash'}    onClick={() => setStatement('cash')} />
        <div style={{ width: 1, background: '#1f1f1f', margin: '4px 4px' }} />
        <TabBtn id="annual"    label="Annual"    active={period === 'annual'}    onClick={() => setPeriod('annual')} />
        <TabBtn id="quarterly" label="Quarterly" active={period === 'quarterly'} onClick={() => setPeriod('quarterly')} />
        <div style={{ flex: 1 }} />
        <span style={{ color: '#888', fontSize: 10, padding: '0 8px', alignSelf: 'center' }}>{activeTicker}</span>
      </div>

      <div style={{ flex: 1, overflowX: 'auto', overflowY: 'auto' }}>
        {isLoading && (
          <div style={{ padding: 8 }}>
            {[...Array(8)].map((_, i) => <div key={i} className="skeleton" style={{ height: 14, marginBottom: 3 }} />)}
          </div>
        )}
        {(error || data?.error) && !isLoading && (
          <div style={{ padding: 8, color: '#ff3b3b', fontSize: 11 }}>
            Financial data unavailable
            <div style={{ color: '#e8e8e8', marginTop: 4, fontSize: 10 }}>{data?.error}</div>
          </div>
        )}
        {!isLoading && !error && dataSlice.length > 0 && (
          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 11 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #1f1f1f' }}>
                <th style={{ color: '#aaaaaa', textAlign: 'left', padding: '4px 8px', fontWeight: 'normal', fontSize: 10, width: 160, position: 'sticky', left: 0, background: '#050505' }}>
                  {period === 'annual' ? 'FY' : 'QTR'} (USD)
                </th>
                {periods.map((p, i) => (
                  <th key={i} style={{ color: '#ffa028', textAlign: 'right', padding: '4px 10px', fontWeight: 'normal', fontSize: 10, whiteSpace: 'nowrap' }}>
                    {p}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {fields.map(({ key, label, bold, indent, separator }) => {
                const vals = dataSlice.map((d) => d[key])
                return (
                  <tr
                    key={key}
                    style={{
                      borderTop: separator ? '1px solid #1a1a1a' : undefined,
                      borderBottom: '1px solid #0a0a0a',
                      background: bold ? '#070707' : 'transparent',
                    }}
                  >
                    <td style={{
                      color: bold ? '#cccccc' : '#666',
                      padding: `${bold ? 4 : 2}px 8px`,
                      fontWeight: bold ? 'bold' : 'normal',
                      paddingLeft: indent ? 20 : 8,
                      whiteSpace: 'nowrap',
                      fontSize: 11,
                      position: 'sticky', left: 0,
                      background: bold ? '#070707' : '#050505',
                    }}>
                      {label}
                    </td>
                    {vals.map((v, i) => {
                      const n = toNum(v)
                      const isNeg = n != null && n < 0
                      const yoy = i > 0 ? fmtYoY(v, vals[i - 1]) : null
                      return (
                        <td key={i} style={{ textAlign: 'right', padding: `${bold ? 4 : 2}px 10px`, verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                          <span style={{
                            color: isNeg ? '#ff3b3b' : bold ? '#eeeeee' : '#cccccc',
                            fontVariantNumeric: 'tabular-nums',
                            fontWeight: bold ? 'bold' : 'normal',
                          }}>
                            {fmtNum(v)}
                          </span>
                          {yoy && (
                            <span style={{ color: yoy.color, fontSize: 9, marginLeft: 5 }}>
                              {yoy.str}
                            </span>
                          )}
                        </td>
                      )
                    })}
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
