'use client'
import { useQuery } from '@tanstack/react-query'
import { useTerminalStore } from '@/lib/store'

interface MetricsResponse { metric: Record<string, number | null> }

function fmt(v: number | null | undefined, decimals = 2, suffix = '') {
  if (v == null || isNaN(v as number)) return '—'
  return v.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) + suffix
}

function fmtPct(v: number | null | undefined) {
  if (v == null || isNaN(v as number)) return '—'
  return (v as number).toFixed(2) + '%'
}

function colSign(v: number | null | undefined): 'pos' | 'neg' | undefined {
  if (v == null) return undefined
  return (v as number) >= 0 ? 'pos' : 'neg'
}

function MetricRow({ label, value, highlight }: { label: string; value: string; highlight?: 'pos' | 'neg' }) {
  const color = highlight === 'pos' ? 'var(--green)' : highlight === 'neg' ? 'var(--red)' : 'var(--text)'
  return (
    <tr>
      <td style={{ color: '#555', fontSize: 11, padding: '1px 6px 1px 0', whiteSpace: 'nowrap' }}>{label}</td>
      <td style={{ color, fontSize: 11, textAlign: 'right', fontVariantNumeric: 'tabular-nums', paddingLeft: 8 }}>{value}</td>
    </tr>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ color: '#ffa028', fontSize: 10, borderBottom: '1px solid #1f1f1f', paddingBottom: 2, marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        {title}
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <tbody>{children}</tbody>
      </table>
    </div>
  )
}

export function KS() {
  const { activeTicker } = useTerminalStore()

  const { data, isLoading, error } = useQuery<MetricsResponse>({
    queryKey: ['metrics', activeTicker],
    queryFn: () => fetch(`/api/finnhub/metrics?symbol=${activeTicker}`).then((r) => r.json()),
    staleTime: 60 * 60_000,
  })

  const m = data?.metric || {}

  if (isLoading) {
    return (
      <div className="panel" style={{ height: '100%' }}>
        <div className="panel-header">
          <span className="panel-mnemonic">KS — KEY STATISTICS</span>
          <span className="panel-ticker">{activeTicker}</span>
        </div>
        <div style={{ padding: 8 }}>
          {[...Array(24)].map((_, i) => (
            <div key={i} className="skeleton" style={{ height: 12, marginBottom: 3, width: `${50 + (i * 17) % 40}%` }} />
          ))}
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="panel" style={{ height: '100%' }}>
        <div className="panel-header">
          <span className="panel-mnemonic">KS — KEY STATISTICS</span>
          <span className="panel-ticker">{activeTicker}</span>
        </div>
        <div style={{ padding: 8, color: '#ff3b3b', fontSize: 11 }}>Data unavailable</div>
      </div>
    )
  }

  return (
    <div className="panel" style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div className="panel-header">
        <span className="panel-mnemonic">KS — KEY STATISTICS</span>
        <span className="panel-ticker">{activeTicker}</span>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 8 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 20px' }}>

          {/* LEFT COLUMN */}
          <div>
            <Section title="Valuation">
              <MetricRow label="P/E (TTM)"        value={fmt(m['peBasicExclExtraTTM'])} />
              <MetricRow label="P/E Fwd"          value={fmt(m['forwardPE'])} />
              <MetricRow label="P/E Annual"       value={fmt(m['peAnnual'])} />
              <MetricRow label="P/B"              value={fmt(m['pb'])} />
              <MetricRow label="P/S (TTM)"        value={fmt(m['psTTM'])} />
              <MetricRow label="EV/EBITDA (TTM)"  value={fmt(m['evEbitdaTTM'])} />
              <MetricRow label="EV/Revenue (TTM)" value={fmt(m['evRevenueTTM'])} />
              <MetricRow label="PEG (TTM)"        value={fmt(m['pegTTM'])} />
              <MetricRow label="Fwd PEG"          value={fmt(m['forwardPEG'])} />
              <MetricRow label="EPS (TTM)"        value={fmt(m['epsTTM'])} />
              <MetricRow label="P/FCF (TTM)"      value={fmt(m['pfcfShareTTM'])} />
            </Section>

            <Section title="Dividends">
              <MetricRow label="Div Yield"        value={fmtPct(m['dividendYieldIndicatedAnnual'])} />
              <MetricRow label="Div/Share (Ann)"  value={fmt(m['dividendPerShareAnnual'])} />
              <MetricRow label="Div/Share (TTM)"  value={fmt(m['dividendPerShareTTM'])} />
              <MetricRow label="Payout Ratio"     value={fmtPct(m['payoutRatioAnnual'])} />
              <MetricRow label="Div Growth 5Y"    value={fmtPct(m['dividendGrowthRate5Y'])} />
            </Section>

            <Section title="Price Returns">
              <MetricRow label="5D Return"   value={fmtPct(m['5DayPriceReturnDaily'])}    highlight={colSign(m['5DayPriceReturnDaily'])} />
              <MetricRow label="13W Return"  value={fmtPct(m['13WeekPriceReturnDaily'])}  highlight={colSign(m['13WeekPriceReturnDaily'])} />
              <MetricRow label="26W Return"  value={fmtPct(m['26WeekPriceReturnDaily'])}  highlight={colSign(m['26WeekPriceReturnDaily'])} />
              <MetricRow label="52W Return"  value={fmtPct(m['52WeekPriceReturnDaily'])}  highlight={colSign(m['52WeekPriceReturnDaily'])} />
              <MetricRow label="YTD Return"  value={fmtPct(m['yearToDatePriceReturnDaily'])} highlight={colSign(m['yearToDatePriceReturnDaily'])} />
              <MetricRow label="52W High"    value={fmt(m['52WeekHigh'])}  highlight="pos" />
              <MetricRow label="52W Low"     value={fmt(m['52WeekLow'])}   highlight="neg" />
              <MetricRow label="Beta"        value={fmt(m['beta'])} />
            </Section>
          </div>

          {/* RIGHT COLUMN */}
          <div>
            <Section title="Profitability">
              <MetricRow label="Gross Margin (TTM)"  value={fmtPct(m['grossMarginTTM'])}      highlight="pos" />
              <MetricRow label="Gross Margin (Ann)"  value={fmtPct(m['grossMarginAnnual'])}   highlight="pos" />
              <MetricRow label="Oper. Margin (TTM)"  value={fmtPct(m['operatingMarginTTM'])}  highlight="pos" />
              <MetricRow label="Net Margin (TTM)"    value={fmtPct(m['netProfitMarginTTM'])}  highlight="pos" />
              <MetricRow label="Net Margin (Ann)"    value={fmtPct(m['netProfitMarginAnnual'])} highlight="pos" />
              <MetricRow label="ROE"                 value={fmtPct(m['roeRfy'])}              highlight="pos" />
              <MetricRow label="ROE (TTM)"           value={fmtPct(m['roeTTM'])}              highlight="pos" />
              <MetricRow label="ROA"                 value={fmtPct(m['roaRfy'])}              highlight="pos" />
              <MetricRow label="ROIC"                value={fmtPct(m['roiAnnual'])}           highlight="pos" />
            </Section>

            <Section title="Liquidity / Leverage">
              <MetricRow label="Current Ratio (Ann)"  value={fmt(m['currentRatioAnnual'])} />
              <MetricRow label="Current Ratio (Qtr)"  value={fmt(m['currentRatioQuarterly'])} />
              <MetricRow label="Quick Ratio (Ann)"    value={fmt(m['quickRatioAnnual'])} />
              <MetricRow label="Debt/Equity (Ann)"    value={fmt(m['totalDebt/totalEquityAnnual'])} />
              <MetricRow label="LT Debt/Eq (Ann)"     value={fmt(m['longTermDebt/equityAnnual'])} />
              <MetricRow label="EV/FCF (Ann)"         value={fmt(m['currentEv/freeCashFlowAnnual'])} />
            </Section>

            <Section title="Growth">
              <MetricRow label="Revenue Gr. (TTM YoY)"  value={fmtPct(m['revenueGrowthTTMYoy'])}     highlight={colSign(m['revenueGrowthTTMYoy'])} />
              <MetricRow label="Revenue Gr. (Qtr YoY)"  value={fmtPct(m['revenueGrowthQuarterlyYoy'])} highlight={colSign(m['revenueGrowthQuarterlyYoy'])} />
              <MetricRow label="Revenue Gr. 5Y"         value={fmtPct(m['revenueGrowth5Y'])}         highlight={colSign(m['revenueGrowth5Y'])} />
              <MetricRow label="EPS Gr. (TTM YoY)"      value={fmtPct(m['epsGrowthTTMYoy'])}         highlight={colSign(m['epsGrowthTTMYoy'])} />
              <MetricRow label="EPS Gr. (Qtr YoY)"      value={fmtPct(m['epsGrowthQuarterlyYoy'])}   highlight={colSign(m['epsGrowthQuarterlyYoy'])} />
              <MetricRow label="EPS Gr. 5Y"             value={fmtPct(m['epsGrowth5Y'])}             highlight={colSign(m['epsGrowth5Y'])} />
              <MetricRow label="EBITDA CAGR 5Y"         value={fmtPct(m['ebitdaCagr5Y'])}            highlight={colSign(m['ebitdaCagr5Y'])} />
            </Section>

            <Section title="Volume">
              <MetricRow label="10D Avg Vol"  value={fmt(m['10DayAverageTradingVolume'], 1)} />
              <MetricRow label="3M Avg Vol"   value={fmt(m['3MonthAverageTradingVolume'], 1)} />
            </Section>
          </div>
        </div>
      </div>
    </div>
  )
}
