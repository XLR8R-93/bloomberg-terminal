'use client'
import { useQuery, useQueries } from '@tanstack/react-query'
import { useTerminalStore } from '@/lib/store'
import { usePaneTicker } from '@/lib/pane-context'
import { useState, useMemo } from 'react'
import { ExternalLink } from 'lucide-react'

interface NewsItem {
  id: number; headline: string; summary: string; source: string
  datetime: number; url: string; sentiment?: string; category?: string
}

interface TaggedNewsItem extends NewsItem {
  tickers: string[]
}

function timeAgo(ts: number): string {
  const diff = Math.floor((Date.now() - ts * 1000) / 1000)
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

function sentimentColor(s?: string) {
  if (!s) return 'transparent'
  if (s === 'positive') return '#33ff6608'
  if (s === 'negative') return '#ff3b3b08'
  return 'transparent'
}

function sentimentBadge(s?: string) {
  if (!s || s === 'neutral') return null
  return (
    <span style={{
      fontSize: 8, padding: '1px 4px', marginLeft: 4,
      color: s === 'positive' ? '#33ff66' : '#ff3b3b',
      border: `1px solid ${s === 'positive' ? '#33ff6644' : '#ff3b3b44'}`,
      verticalAlign: 'middle', letterSpacing: '0.06em',
    }}>
      {s.toUpperCase()}
    </span>
  )
}

function TickerBadge({ ticker }: { ticker: string }) {
  return (
    <span style={{
      fontSize: 8, padding: '1px 5px', marginRight: 3,
      color: '#ffa028', border: '1px solid #ffa02833',
      background: '#0a0800', letterSpacing: '0.04em',
      verticalAlign: 'middle',
    }}>
      {ticker}
    </span>
  )
}

function NewsRow({ item, expanded, onToggle, showTickers }: {
  item: TaggedNewsItem
  expanded: boolean
  onToggle: () => void
  showTickers?: boolean
}) {
  const date = new Date(item.datetime * 1000)
  const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const timeStr = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })

  return (
    <div
      style={{
        borderBottom: '1px solid #0d0d0d',
        background: sentimentColor(item.sentiment),
        cursor: 'pointer',
      }}
      onClick={onToggle}
    >
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '5px 8px' }}>
        <div style={{ flexShrink: 0, textAlign: 'right', width: 54 }}>
          <div style={{ color: '#444', fontSize: 9 }}>{dateStr}</div>
          <div style={{ color: '#333', fontSize: 9 }}>{timeStr}</div>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Ticker badges for watchlist/portfolio tab */}
          {showTickers && item.tickers.length > 0 && (
            <div style={{ marginBottom: 3 }}>
              {item.tickers.slice(0, 5).map(t => <TickerBadge key={t} ticker={t} />)}
              {item.tickers.length > 5 && (
                <span style={{ color: '#333', fontSize: 8 }}>+{item.tickers.length - 5}</span>
              )}
            </div>
          )}
          <div style={{ color: expanded ? '#ffa028' : '#cccccc', fontSize: 11, lineHeight: 1.35 }}>
            {item.headline}
            {sentimentBadge(item.sentiment)}
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              style={{ marginLeft: 5, color: '#4d9fff', verticalAlign: 'middle', display: 'inline-flex' }}
            >
              <ExternalLink size={9} />
            </a>
          </div>
          <div style={{ color: '#444', fontSize: 9, marginTop: 1 }}>{item.source} · {timeAgo(item.datetime)}</div>
          {expanded && item.summary && (
            <div style={{ color: '#d8d8d8', fontSize: 10, marginTop: 4, lineHeight: 1.5, borderTop: '1px solid #111', paddingTop: 4 }}>
              {item.summary}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Watchlist/Portfolio news tab ───────────────────────────────────────────────
function WatchNews({ tickers, filter, expandedId, onToggle }: {
  tickers: string[]
  filter: string
  expandedId: number | null
  onToggle: (id: number) => void
}) {
  const queries = useQueries({
    queries: tickers.map(ticker => ({
      queryKey: ['news', ticker],
      queryFn:  () => fetch(`/api/finnhub/news?symbol=${ticker}`)
        .then(r => r.json()) as Promise<NewsItem[]>,
      staleTime: 5 * 60_000,
    })),
  })

  const loading = queries.some(q => q.isLoading)

  // Merge: deduplicate by headline+datetime (IDs vary per ticker), tag tickers
  const merged = useMemo<TaggedNewsItem[]>(() => {
    const map = new Map<string, TaggedNewsItem>()
    tickers.forEach((ticker, i) => {
      const items = queries[i]?.data
      if (!Array.isArray(items)) return
      for (const item of items) {
        const key = `${item.datetime}-${item.headline.slice(0, 40)}`
        if (map.has(key)) {
          const existing = map.get(key)!
          if (!existing.tickers.includes(ticker)) existing.tickers.push(ticker)
        } else {
          map.set(key, { ...item, tickers: [ticker] })
        }
      }
    })
    return [...map.values()].sort((a, b) => b.datetime - a.datetime)
  }, [queries, tickers])

  const items = useMemo(() => {
    if (!filter.trim()) return merged
    const q = filter.toLowerCase()
    return merged.filter(n =>
      n.headline?.toLowerCase().includes(q) ||
      n.source?.toLowerCase().includes(q) ||
      n.tickers.some(t => t.toLowerCase().includes(q))
    )
  }, [merged, filter])

  if (tickers.length === 0) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 6 }}>
      <div style={{ color: '#444', fontSize: 11 }}>No tickers in watchlist / portfolio</div>
      <div style={{ color: '#2a2a2a', fontSize: 9 }}>Add stocks to your watchlist or PORT positions</div>
    </div>
  )

  if (loading) return (
    <div style={{ flex: 1, padding: 8 }}>
      {[...Array(8)].map((_, i) => (
        <div key={i} className="skeleton" style={{ height: 44, marginBottom: 4 }} />
      ))}
    </div>
  )

  return (
    <div style={{ flex: 1, overflowY: 'auto' }}>
      {items.length === 0 && (
        <div style={{ padding: 8, color: '#555', fontSize: 11 }}>
          {filter ? 'No matching stories' : 'No recent news for your holdings'}
        </div>
      )}
      {items.map(item => (
        <NewsRow
          key={`${item.datetime}-${item.id}`}
          item={item}
          expanded={expandedId === item.id}
          onToggle={() => onToggle(item.id)}
          showTickers
        />
      ))}
    </div>
  )
}

// ── Main panel ────────────────────────────────────────────────────────────────
type Tab = 'company' | 'market' | 'watchlist'

export function CN() {
  const { activeTicker: _globalTicker, watchlist, positions } = useTerminalStore()
  const activeTicker = usePaneTicker(_globalTicker)
  const [tab, setTab] = useState<Tab>('company')
  const [filter, setFilter] = useState('')
  const [expandedId, setExpandedId] = useState<number | null>(null)

  // Combined tickers for watchlist tab (watchlist ∪ portfolio, max 15)
  const watchTickers = useMemo(() => {
    const positionTickers = positions.map(p => p.ticker.toUpperCase())
    return [...new Set([...watchlist.map(t => t.toUpperCase()), ...positionTickers])].slice(0, 15)
  }, [watchlist, positions])

  const { data: companyNews, isLoading: loadingCompany } = useQuery<NewsItem[]>({
    queryKey: ['news', activeTicker],
    queryFn: () => fetch(`/api/finnhub/news?symbol=${activeTicker}`).then(r => r.json()),
    staleTime: 5 * 60_000,
  })

  const { data: marketNews, isLoading: loadingMarket } = useQuery<NewsItem[]>({
    queryKey: ['news', 'general'],
    queryFn: () => fetch('/api/finnhub/news').then(r => r.json()),
    staleTime: 5 * 60_000,
    enabled: tab === 'market',
  })

  const rawItems = tab === 'company' ? companyNews : tab === 'market' ? marketNews : []
  const loading  = tab === 'company' ? loadingCompany : tab === 'market' ? loadingMarket : false

  const taggedItems: TaggedNewsItem[] = useMemo(() =>
    (Array.isArray(rawItems) ? rawItems : []).map(n => ({ ...n, tickers: [] })),
    [rawItems]
  )

  const items = useMemo(() => {
    if (!filter.trim()) return taggedItems
    const q = filter.toLowerCase()
    return taggedItems.filter(n =>
      n.headline?.toLowerCase().includes(q) || n.source?.toLowerCase().includes(q)
    )
  }, [taggedItems, filter])

  const switchTab = (t: Tab) => { setTab(t); setFilter(''); setExpandedId(null) }

  const TabBtn = ({ id, label }: { id: Tab; label: string }) => (
    <button
      onClick={() => switchTab(id)}
      style={{
        background: tab === id ? '#0a1a0a' : 'transparent',
        border: 'none',
        borderRight: '1px solid #1a1a1a',
        borderBottom: `2px solid ${tab === id ? '#ffa028' : 'transparent'}`,
        color: tab === id ? '#ffa028' : '#555',
        padding: '4px 12px',
        cursor: 'pointer',
        font: 'inherit',
        fontSize: 10,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </button>
  )

  return (
    <div className="panel" style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div className="panel-header">
        <span className="panel-mnemonic">CN — COMPANY NEWS</span>
        <span className="panel-ticker">{activeTicker}</span>
      </div>

      {/* Tab strip + filter */}
      <div style={{ display: 'flex', alignItems: 'stretch', borderBottom: '1px solid #1f1f1f', background: '#050505', flexShrink: 0 }}>
        <TabBtn id="company"   label={`${activeTicker}`} />
        <TabBtn id="market"    label="Market" />
        <TabBtn id="watchlist" label={`Watchlist (${watchTickers.length})`} />
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', padding: '0 8px', gap: 6 }}>
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter headlines…"
            style={{
              background: 'transparent', border: 'none', borderBottom: '1px solid #222',
              color: '#ffa028', font: 'inherit', fontSize: 10, outline: 'none',
              width: '100%', padding: '2px 0',
            }}
          />
          {filter && (
            <button onClick={() => setFilter('')} style={{ background: 'none', border: 'none', color: '#444', cursor: 'pointer', fontSize: 10, padding: 0 }}>✕</button>
          )}
        </div>
        {tab !== 'watchlist' && (
          <span style={{ color: '#2a2a2a', fontSize: 9, padding: '0 8px', alignSelf: 'center', whiteSpace: 'nowrap' }}>
            {items.length} STORIES
          </span>
        )}
      </div>

      {/* Company / Market tabs */}
      {tab !== 'watchlist' && (
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loading && (
            <div style={{ padding: 8 }}>
              {[...Array(6)].map((_, i) => (
                <div key={i} className="skeleton" style={{ height: 44, marginBottom: 4 }} />
              ))}
            </div>
          )}
          {!loading && items.length === 0 && (
            <div style={{ padding: 8, color: '#e8e8e8', fontSize: 11 }}>
              {filter ? 'No matching stories' : 'No news available'}
            </div>
          )}
          {!loading && items.map(item => (
            <NewsRow
              key={item.id}
              item={item}
              expanded={expandedId === item.id}
              onToggle={() => setExpandedId(expandedId === item.id ? null : item.id)}
            />
          ))}
        </div>
      )}

      {/* Watchlist / Portfolio tab */}
      {tab === 'watchlist' && (
        <WatchNews
          tickers={watchTickers}
          filter={filter}
          expandedId={expandedId}
          onToggle={id => setExpandedId(expandedId === id ? null : id)}
        />
      )}
    </div>
  )
}
