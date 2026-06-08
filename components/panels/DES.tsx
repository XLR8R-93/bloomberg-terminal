'use client'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useTerminalStore } from '@/lib/store'
import type { Executive } from '@/app/api/finnhub/executive/route'
import { RevenueEPSCharts } from './RevenueEPSCharts'
import { RatiosTab } from './RatiosTab'

interface Profile {
  name: string; ticker: string; exchange: string; finnhubIndustry: string
  ipo: string; marketCapitalization: number; shareOutstanding: number
  weburl: string; logo: string; country: string; currency: string
  description?: string; employeeTotal?: number | null
  city?: string; state?: string; address?: string; phone?: string
  ggroup?: string; gind?: string; gsector?: string
}

interface Metrics { metric: Record<string, number | null> }

function fmt(v: number | null | undefined, d = 2) {
  if (v == null || isNaN(v as number)) return '—'
  return (v as number).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })
}

function fmtMktCap(n: number | null | undefined) {
  if (!n) return '—'
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}T`
  if (n >= 1e3) return `$${(n / 1e3).toFixed(2)}B`
  return `$${n.toFixed(0)}M`
}

function fmtShares(n: number | null | undefined) {
  if (!n) return '—'
  const shares = n * 1e6
  if (shares >= 1e9) return `${(shares / 1e9).toFixed(2)}B`
  return `${(shares / 1e6).toFixed(1)}M`
}

const TABS = ['Profile', 'Issue Info', 'Ratios', 'Revenue & EPS', 'ESG'] as const
type Tab = typeof TABS[number]

function DataRow({ label, value, valueColor }: { label: string; value?: string | null; valueColor?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '1px 0', borderBottom: '1px solid #0d0d0d' }}>
      <span style={{ color: '#555', fontSize: 11, flexShrink: 0, paddingRight: 8 }}>{label}</span>
      <span style={{ color: valueColor || '#cccccc', fontSize: 11, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
        {value || '—'}
      </span>
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      color: '#ffa028', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em',
      borderBottom: '1px solid #1f1f1f', paddingBottom: 2, marginBottom: 4, marginTop: 10,
    }}>
      {children}
    </div>
  )
}

function ProfileTab({ profile, metrics, executives }: {
  profile: Profile
  metrics: Metrics
  executives: Executive[]
}) {
  const [descExpanded, setDescExpanded] = useState(false)
  const m = metrics.metric

  const desc = profile.description || ''
  const descShort = desc.length > 320 ? desc.slice(0, 320) + '…' : desc

  const location = [profile.city, profile.state, profile.country].filter(Boolean).join(', ')

  const topExecs = (Array.isArray(executives) ? executives : [])
    .filter(e => e.name && e.position)
    .slice(0, 8)

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0 16px', height: '100%' }}>

      {/* LEFT: Price stats + description */}
      <div>
        {/* Description */}
        <div style={{ color: '#ffa028', fontSize: 11, fontWeight: 'bold', marginBottom: 4 }}>
          {profile.name}
        </div>
        <div style={{ color: '#999', fontSize: 10, lineHeight: 1.5, marginBottom: 8 }}>
          {descExpanded ? desc : descShort}
          {desc.length > 320 && (
            <span
              onClick={() => setDescExpanded(v => !v)}
              style={{ color: '#4d9fff', cursor: 'pointer', marginLeft: 4 }}
            >
              {descExpanded ? 'Less' : 'More'}
            </span>
          )}
        </div>

        <SectionLabel>Price &amp; Size</SectionLabel>
        <DataRow label="52 Wk H" value={fmt(m['52WeekHigh'])} valueColor="var(--green)" />
        <DataRow label="52 Wk L" value={fmt(m['52WeekLow'])} valueColor="var(--red)" />
        <DataRow label="YTD Chg%" value={m['yearToDatePriceReturnDaily'] != null ? `${fmt(m['yearToDatePriceReturnDaily'])}%` : '—'}
          valueColor={m['yearToDatePriceReturnDaily'] != null ? (m['yearToDatePriceReturnDaily']! >= 0 ? 'var(--green)' : 'var(--red)') : undefined}
        />
        <DataRow label="Mkt Cap" value={fmtMktCap(profile.marketCapitalization)} />
        <DataRow label="Shrs Out" value={fmtShares(profile.shareOutstanding)} />
        <DataRow label="Beta" value={fmt(m['beta'])} />
        <DataRow label="10D Avg Vol" value={m['10DayAverageTradingVolume'] != null ? `${fmt(m['10DayAverageTradingVolume'], 1)}M` : '—'} />
      </div>

      {/* MIDDLE: Estimates + Dividends */}
      <div>
        <SectionLabel>Estimates</SectionLabel>
        <DataRow label="P/E (TTM)" value={fmt(m['peBasicExclExtraTTM'])} />
        <DataRow label="P/E (Fwd)" value={fmt(m['forwardPE'])} />
        <DataRow label="EPS (TTM)" value={`$${fmt(m['epsTTM'])}`} />
        <DataRow label="EPS (Fwd)" value={m['forwardEPS'] != null ? `$${fmt(m['forwardEPS'])}` : '—'} />
        <DataRow label="PEG (TTM)" value={fmt(m['pegTTM'])} />
        <DataRow label="P/S (TTM)" value={fmt(m['psTTM'])} />
        <DataRow label="EV/EBITDA" value={fmt(m['evEbitdaTTM'])} />

        <SectionLabel>Dividend</SectionLabel>
        <DataRow label="Ind Gross Yield" value={m['dividendYieldIndicatedAnnual'] != null ? `${fmt(m['dividendYieldIndicatedAnnual'], 2)}%` : '—'} />
        <DataRow label="Div/Share (Ann)" value={m['dividendPerShareAnnual'] != null ? `$${fmt(m['dividendPerShareAnnual'])}` : '—'} />
        <DataRow label="Payout Ratio" value={m['payoutRatioAnnual'] != null ? `${fmt(m['payoutRatioAnnual'], 1)}%` : '—'} />
        <DataRow label="5Y Div Growth" value={m['dividendGrowthRate5Y'] != null ? `${fmt(m['dividendGrowthRate5Y'], 2)}%` : '—'} />

        <SectionLabel>Profitability</SectionLabel>
        <DataRow label="Gross Margin" value={m['grossMarginTTM'] != null ? `${fmt(m['grossMarginTTM'], 1)}%` : '—'} valueColor="var(--green)" />
        <DataRow label="Net Margin" value={m['netProfitMarginTTM'] != null ? `${fmt(m['netProfitMarginTTM'], 1)}%` : '—'} valueColor="var(--green)" />
        <DataRow label="ROE" value={m['roeTTM'] != null ? `${fmt(m['roeTTM'], 1)}%` : '—'} valueColor="var(--green)" />
        <DataRow label="ROA" value={m['roaRfy'] != null ? `${fmt(m['roaRfy'], 1)}%` : '—'} valueColor="var(--green)" />
      </div>

      {/* RIGHT: Corporate Info + Management */}
      <div>
        <SectionLabel>Corporate Info</SectionLabel>
        {profile.weburl && (
          <div style={{ padding: '1px 0', borderBottom: '1px solid #0d0d0d' }}>
            <a
              href={profile.weburl}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: '#4d9fff', fontSize: 11, textDecoration: 'none' }}
            >
              {profile.weburl.replace(/^https?:\/\//, '')}
            </a>
          </div>
        )}
        {location && <DataRow label="Location" value={location} />}
        {profile.employeeTotal && (
          <DataRow label="Employees" value={profile.employeeTotal.toLocaleString()} />
        )}
        <DataRow label="Sector" value={profile.gsector || profile.finnhubIndustry} />
        <DataRow label="Industry" value={profile.gind || profile.finnhubIndustry} />
        <DataRow label="Exchange" value={profile.exchange} />
        <DataRow label="Currency" value={profile.currency} />
        <DataRow label="IPO Date" value={profile.ipo} />

        {topExecs.length > 0 && (
          <>
            <SectionLabel>Management</SectionLabel>
            {topExecs.map((exec, i) => (
              <div key={i} style={{ borderBottom: '1px solid #0d0d0d', padding: '2px 0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 4 }}>
                  <span style={{ color: '#cccccc', fontSize: 11, fontWeight: 500 }}>{exec.name}</span>
                  {exec.positionCode && (
                    <span style={{ color: '#ffa028', fontSize: 9, flexShrink: 0 }}>{exec.positionCode}</span>
                  )}
                </div>
                <div style={{ color: '#555', fontSize: 10 }}>{exec.position}</div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  )
}

function IssueInfoTab({ profile, metrics }: { profile: Profile; metrics: Metrics }) {
  const m = metrics.metric
  return (
    <div style={{ maxWidth: 400 }}>
      <SectionLabel>Issue Details</SectionLabel>
      <DataRow label="Ticker" value={profile.ticker} />
      <DataRow label="Exchange" value={profile.exchange} />
      <DataRow label="Currency" value={profile.currency} />
      <DataRow label="Country" value={profile.country} />
      <DataRow label="IPO Date" value={profile.ipo} />
      <DataRow label="Shares Out" value={fmtShares(profile.shareOutstanding)} />
      <DataRow label="Mkt Cap" value={fmtMktCap(profile.marketCapitalization)} />
      <SectionLabel>Float &amp; Short Interest</SectionLabel>
      <DataRow label="Short Ratio" value={fmt(m['shortRatio'])} />
      <DataRow label="Short % Float" value={m['shortInterestPercentOfFloat'] != null ? `${fmt(m['shortInterestPercentOfFloat'])}%` : '—'} />
    </div>
  )
}


function RevenueEPSTab({ metrics }: { metrics: Metrics }) {
  const m = metrics.metric
  return (
    <div style={{ maxWidth: 400 }}>
      <SectionLabel>Revenue &amp; Earnings</SectionLabel>
      <DataRow label="Rev Gr (TTM YoY)" value={m['revenueGrowthTTMYoy'] != null ? `${fmt(m['revenueGrowthTTMYoy'])}%` : '—'}
        valueColor={m['revenueGrowthTTMYoy'] != null ? (m['revenueGrowthTTMYoy']! >= 0 ? 'var(--green)' : 'var(--red)') : undefined} />
      <DataRow label="Rev Gr (Qtr YoY)" value={m['revenueGrowthQuarterlyYoy'] != null ? `${fmt(m['revenueGrowthQuarterlyYoy'])}%` : '—'}
        valueColor={m['revenueGrowthQuarterlyYoy'] != null ? (m['revenueGrowthQuarterlyYoy']! >= 0 ? 'var(--green)' : 'var(--red)') : undefined} />
      <DataRow label="Rev Gr 5Y CAGR" value={m['revenueGrowth5Y'] != null ? `${fmt(m['revenueGrowth5Y'])}%` : '—'} />
      <DataRow label="EPS (TTM)" value={m['epsTTM'] != null ? `$${fmt(m['epsTTM'])}` : '—'} />
      <DataRow label="EPS Gr (TTM YoY)" value={m['epsGrowthTTMYoy'] != null ? `${fmt(m['epsGrowthTTMYoy'])}%` : '—'}
        valueColor={m['epsGrowthTTMYoy'] != null ? (m['epsGrowthTTMYoy']! >= 0 ? 'var(--green)' : 'var(--red)') : undefined} />
      <DataRow label="EPS Gr 5Y CAGR" value={m['epsGrowth5Y'] != null ? `${fmt(m['epsGrowth5Y'])}%` : '—'} />
      <DataRow label="EBITDA CAGR 5Y" value={m['ebitdaCagr5Y'] != null ? `${fmt(m['ebitdaCagr5Y'])}%` : '—'} />
    </div>
  )
}

export function DES() {
  const { activeTicker } = useTerminalStore()
  const [activeTab, setActiveTab] = useState<Tab>('Profile')

  const { data: profile, isLoading: profileLoading } = useQuery<Profile>({
    queryKey: ['profile', activeTicker],
    queryFn: () => fetch(`/api/finnhub/profile?symbol=${activeTicker}`).then((r) => r.json()),
    staleTime: 24 * 60 * 60_000,
  })

  const { data: metrics } = useQuery<Metrics>({
    queryKey: ['metrics', activeTicker],
    queryFn: () => fetch(`/api/finnhub/metrics?symbol=${activeTicker}`).then((r) => r.json()),
    staleTime: 60 * 60_000,
  })

  const { data: executives } = useQuery<Executive[]>({
    queryKey: ['executive', activeTicker],
    queryFn: () => fetch(`/api/finnhub/executive?symbol=${activeTicker}`).then((r) => r.json()),
    staleTime: 24 * 60 * 60_000,
  })

  const isLoading = profileLoading && !profile

  return (
    <div className="panel" style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div className="panel-header">
        <span className="panel-mnemonic">DES — SECURITY DESCRIPTION</span>
        <span className="panel-ticker">{activeTicker}</span>
      </div>

      {/* Company name bar */}
      {profile?.name && (
        <div style={{
          background: '#070707', borderBottom: '1px solid #1f1f1f',
          padding: '3px 8px', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
        }}>
          {profile.logo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={profile.logo} alt="" style={{ width: 16, height: 16, objectFit: 'contain', opacity: 0.8 }} />
          )}
          <span style={{ color: '#ffa028', fontSize: 12, fontWeight: 'bold' }}>{profile.name}</span>
          <span style={{ color: '#333', fontSize: 10 }}>|</span>
          <span style={{ color: '#4d9fff', fontSize: 10 }}>{activeTicker} {profile.exchange} Equity</span>
          {profile.gsector && (
            <>
              <span style={{ color: '#333', fontSize: 10 }}>|</span>
              <span style={{ color: '#555', fontSize: 10 }}>Classification: {profile.gsector}</span>
            </>
          )}
        </div>
      )}

      {/* Tab strip */}
      <div style={{
        display: 'flex', gap: 0, background: '#050505',
        borderBottom: '1px solid #1f1f1f', flexShrink: 0,
      }}>
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              background: activeTab === tab ? '#111' : 'transparent',
              border: 'none',
              borderRight: '1px solid #1a1a1a',
              borderBottom: activeTab === tab ? '2px solid #ffa028' : '2px solid transparent',
              color: activeTab === tab ? '#ffa028' : '#555',
              cursor: 'pointer',
              fontFamily: 'inherit',
              fontSize: 10,
              padding: '5px 12px',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              transition: 'color 0.15s',
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 10 }}>
        {isLoading ? (
          <div>
            {[...Array(12)].map((_, i) => (
              <div key={i} className="skeleton" style={{ height: 13, marginBottom: 4, width: `${50 + (i * 17) % 40}%` }} />
            ))}
          </div>
        ) : !profile?.name ? (
          <div style={{ color: '#ff3b3b', fontSize: 11 }}>Data unavailable — check FINNHUB_API_KEY</div>
        ) : (
          <>
            {activeTab === 'Profile' && (
              <ProfileTab
                profile={profile}
                metrics={metrics || { metric: {} }}
                executives={executives || []}
              />
            )}
            {activeTab === 'Issue Info' && (
              <IssueInfoTab profile={profile} metrics={metrics || { metric: {} }} />
            )}
            {activeTab === 'Ratios' && (
              <RatiosTab metrics={metrics || { metric: {} }} />
            )}

            {activeTab === 'Revenue & EPS' && (
              <RevenueEPSCharts />
            )}
            {activeTab === 'ESG' && (
              <div style={{ color: '#555', fontSize: 11, paddingTop: 20 }}>
                ESG data not available on free tier.
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
