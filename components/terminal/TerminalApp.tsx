'use client'
import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CommandBar } from '@/components/terminal/CommandBar'
import { StatusBar } from '@/components/terminal/StatusBar'
import { QuoteHeader } from '@/components/panels/QuoteHeader'
import { Watchlist } from '@/components/panels/Watchlist'
import { PanelRouter } from '@/components/panels/PanelRouter'
import { MenuOverlay } from '@/components/panels/MenuOverlay'
import { useTerminalStore } from '@/lib/store'
import { X, Plus } from 'lucide-react'

// Fetches company name for a tab and updates its label
function TabLabelUpdater({ tabId, ticker }: { tabId: string; ticker: string }) {
  const { updateTabLabel } = useTerminalStore()
  const { data } = useQuery<{ name: string }>({
    queryKey: ['profile', ticker],
    queryFn: () => fetch(`/api/finnhub/profile?symbol=${ticker}`).then((r) => r.json()),
    staleTime: 24 * 60 * 60_000,
  })
  useEffect(() => {
    if (data?.name) updateTabLabel(tabId, data.name)
  }, [data?.name, tabId, updateTabLabel])
  return null
}

function NavBtn({ code }: { code: string }) {
  const { activeView, setActiveView } = useTerminalStore()
  const isActive = activeView === code

  return (
    <button
      onClick={() => setActiveView(code as Parameters<typeof setActiveView>[0])}
      style={{
        background: isActive ? '#0a1a0a' : 'transparent',
        border: 'none',
        borderRight: '1px solid #1f1f1f',
        borderBottom: isActive ? '2px solid #ffa028' : '2px solid transparent',
        color: isActive ? '#ffa028' : '#555',
        padding: '0 10px',
        cursor: 'pointer',
        font: 'inherit',
        fontSize: 11,
        fontWeight: isActive ? 'bold' : 'normal',
        letterSpacing: '0.05em',
        height: '100%',
      }}
    >
      {code}
    </button>
  )
}

export function TerminalApp() {
  const { tabs, activeTabId, setActiveTab, closeTab, newTab, menuOpen, activeTicker, activeView } = useTerminalStore()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#000', overflow: 'hidden' }}>

      {/* Label updaters — silent, one per unique ticker */}
      {tabs.map((tab) => (
        <TabLabelUpdater key={tab.id} tabId={tab.id} ticker={tab.ticker} />
      ))}

      {/* Bloomberg-style tab bar */}
      <div style={{
        display: 'flex',
        alignItems: 'stretch',
        background: '#050505',
        borderBottom: '1px solid #1f1f1f',
        height: 28,
        flexShrink: 0,
        overflowX: 'auto',
        overflowY: 'hidden',
      }}>
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId
          return (
            <div
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '0 10px',
                cursor: 'pointer',
                background: isActive ? '#0d0d0d' : 'transparent',
                borderRight: '1px solid #1a1a1a',
                borderBottom: isActive ? '2px solid #ffa028' : '2px solid transparent',
                flexShrink: 0,
                minWidth: 0,
                maxWidth: 240,
              }}
            >
              <span style={{
                color: isActive ? '#ffa028' : '#555',
                fontSize: 10,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                letterSpacing: '0.04em',
              }}>
                {tab.label}
              </span>
              {tabs.length > 1 && (
                <button
                  onClick={(e) => { e.stopPropagation(); closeTab(tab.id) }}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: isActive ? '#666' : '#2a2a2a',
                    padding: 0, flexShrink: 0, display: 'flex', alignItems: 'center',
                    lineHeight: 1,
                  }}
                >
                  <X size={9} />
                </button>
              )}
            </div>
          )
        })}

        {/* New tab button */}
        <button
          onClick={() => newTab()}
          title="Open new tab  (then type a command to navigate)"
          style={{
            background: 'none', border: 'none', borderRight: '1px solid #1a1a1a',
            cursor: 'pointer', color: '#333', padding: '0 10px',
            display: 'flex', alignItems: 'center',
          }}
        >
          <Plus size={10} />
        </button>
      </div>

      <CommandBar />
      <QuoteHeader />

      {/* Function nav strip */}
      <div style={{
        display: 'flex',
        gap: 0,
        borderBottom: '1px solid #1f1f1f',
        background: '#050505',
        flexShrink: 0,
        height: 22,
        alignItems: 'stretch',
      }}>
        {(['GIP', 'DES', 'KS', 'FA', 'CN', 'EE', 'EST', 'RV', 'TOP', 'WB', 'GLCO', 'PORT', 'TV', 'WL', 'HELP'] as const).map((code) => (
          <NavBtn key={code} code={code} />
        ))}
      </div>

      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '180px 1fr', overflow: 'hidden' }}>
        <div style={{ borderRight: '1px solid #1f1f1f', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <Watchlist />
        </div>
        <div style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column', position: 'relative' }}>
          {menuOpen && <MenuOverlay />}
          <PanelRouter />
        </div>
      </div>

      <StatusBar />
    </div>
  )
}
