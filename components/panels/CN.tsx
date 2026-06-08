'use client'
import { useQuery } from '@tanstack/react-query'
import { useTerminalStore } from '@/lib/store'
import { useState, useMemo } from 'react'
import { ExternalLink } from 'lucide-react'

interface NewsItem {
  id: number; headline: string; summary: string; source: string
  datetime: number; url: string; sentiment?: string; category?: string
}

function timeAgo(ts: number): string {
  const diff = Math.floor((Date.now() - ts * 1000) / 1000)
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

function sentimentColor(s?: string) {
  if (!s) return '#333'
  if (s === 'positive') return '#33ff6644'
  if (s === 'negative') return '#ff3b3b33'
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

function NewsRow({ item, expanded, onToggle }: {
  item: NewsItem
  expanded: boolean
  onToggle: () => void
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
            <div style={{ color: '#888', fontSize: 10, marginTop: 4, lineHeight: 1.5, borderTop: '1px solid #111', paddingTop: 4 }}>
              {item.summary}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export function CN() {
  const { activeTicker } = useTerminalStore()
  const [tab, setTab] = useState<'company' | 'market'>('company')
  const [filter, setFilter] = useState('')
  const [expandedId, setExpandedId] = useState<number | null>(null)

  const { data: companyNews, isLoading: loadingCompany } = useQuery<NewsItem[]>({
    queryKey: ['news', activeTicker],
    queryFn: () => fetch(`/api/finnhub/news?symbol=${activeTicker}`).then((r) => r.json()),
    staleTime: 5 * 60_000,
  })

  const { data: marketNews, isLoading: loadingMarket } = useQuery<NewsItem[]>({
    queryKey: ['news', 'general'],
    queryFn: () => fetch('/api/finnhub/news').then((r) => r.json()),
    staleTime: 5 * 60_000,
    enabled: tab === 'market',
  })

  const rawItems = tab === 'company' ? companyNews : marketNews
  const loading = tab === 'company' ? loadingCompany : loadingMarket

  const items = useMemo(() => {
    if (!Array.isArray(rawItems)) return []
    if (!filter.trim()) return rawItems
    const q = filter.toLowerCase()
    return rawItems.filter(
      (n) => n.headline?.toLowerCase().includes(q) || n.source?.toLowerCase().includes(q)
    )
  }, [rawItems, filter])

  const TabBtn = ({ id, label }: { id: typeof tab; label: string }) => (
    <button
      onClick={() => { setTab(id); setFilter(''); setExpandedId(null) }}
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
        <TabBtn id="company" label={`${activeTicker} News`} />
        <TabBtn id="market" label="Market" />
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', padding: '0 8px', gap: 6 }}>
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter headlines..."
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
        <span style={{ color: '#2a2a2a', fontSize: 9, padding: '0 8px', alignSelf: 'center' }}>
          {Array.isArray(items) ? items.length : 0} STORIES · 30D
        </span>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {loading && (
          <div style={{ padding: 8 }}>
            {[...Array(6)].map((_, i) => (
              <div key={i} className="skeleton" style={{ height: 44, marginBottom: 4 }} />
            ))}
          </div>
        )}
        {!loading && items.length === 0 && (
          <div style={{ padding: 8, color: '#555', fontSize: 11 }}>
            {filter ? 'No matching stories' : 'No news available'}
          </div>
        )}
        {!loading && items.map((item) => (
          <NewsRow
            key={item.id}
            item={item}
            expanded={expandedId === item.id}
            onToggle={() => setExpandedId(expandedId === item.id ? null : item.id)}
          />
        ))}
      </div>
    </div>
  )
}
