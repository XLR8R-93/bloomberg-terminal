'use client'
import { useEffect, useState, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CommandBar } from '@/components/terminal/CommandBar'
import { AlertMonitor } from '@/components/terminal/AlertMonitor'
import { StatusBar } from '@/components/terminal/StatusBar'
import { TickerTape } from '@/components/terminal/TickerTape'
import { QuoteHeader } from '@/components/panels/QuoteHeader'
import { Watchlist } from '@/components/panels/Watchlist'
import { PanelRouter } from '@/components/panels/PanelRouter'
import { MenuOverlay } from '@/components/panels/MenuOverlay'
import { useTerminalStore, type LayoutMode, type Pane } from '@/lib/store'
import { PaneContext } from '@/lib/pane-context'
import { IndexBar } from '@/components/terminal/IndexBar'
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

// ── Layout selector ───────────────────────────────────────────────────────────
const LAYOUT_OPTS: { mode: LayoutMode; icon: string; title: string }[] = [
  { mode: '1x1', icon: '▪',  title: 'Single pane' },
  { mode: '2h',  icon: '◫',  title: 'Two panes side by side' },
  { mode: '2v',  icon: '⬒',  title: 'Two panes stacked' },
  { mode: '2x2', icon: '⊞',  title: 'Four panes (2×2)' },
]

function LayoutBtn({ opt }: { opt: typeof LAYOUT_OPTS[0] }) {
  const { layoutMode, setLayoutMode } = useTerminalStore()
  const active = layoutMode === opt.mode
  return (
    <button
      onClick={() => setLayoutMode(opt.mode)}
      title={opt.title}
      style={{
        background: active ? '#0a1a0a' : 'transparent',
        border: 'none',
        borderRight: '1px solid #1f1f1f',
        borderBottom: active ? '2px solid #ffa028' : '2px solid transparent',
        color: active ? '#ffa028' : '#aaaaaa',
        padding: '0 9px',
        cursor: 'pointer',
        font: 'inherit',
        fontSize: 13,
        height: '100%',
      }}
    >
      {opt.icon}
    </button>
  )
}

// ── Multi-pane layout ─────────────────────────────────────────────────────────
function PaneContainer({ pane, focused, onFocus }: { pane: Pane; focused: boolean; onFocus: () => void }) {
  const { setActiveTicker, setActiveView } = useTerminalStore()

  const handleFocus = () => {
    onFocus()
    // sync global state to this pane's ticker/view so QuoteHeader + nav strip stay in sync
    setActiveTicker(pane.ticker)
    setActiveView(pane.view)
  }

  return (
    <div
      onClick={handleFocus}
      style={{
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        outline: focused ? '1px solid #ffa02855' : '1px solid #111',
        cursor: 'default',
        minHeight: 0,   // allow grid item to shrink below content height
        minWidth: 0,    // allow grid item to shrink below content width
      }}
    >
      {/* Focused indicator bar */}
      {focused && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0,
          height: 2, background: '#ffa028', zIndex: 20,
        }} />
      )}
      <PaneContext.Provider value={{ ticker: pane.ticker, view: pane.view }}>
        <PanelRouter />
      </PaneContext.Provider>
    </div>
  )
}

function MultiPaneLayout() {
  const { layoutMode, panes, focusedPaneId, focusPane } = useTerminalStore()

  const gridStyle: React.CSSProperties =
    layoutMode === '2h'  ? { gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr' } :
    layoutMode === '2v'  ? { gridTemplateColumns: '1fr',     gridTemplateRows: '1fr 1fr' } :
    layoutMode === '2x2' ? { gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr' } :
                           { gridTemplateColumns: '1fr',     gridTemplateRows: '1fr' }

  return (
    <div style={{ flex: 1, minHeight: 0, minWidth: 0, display: 'grid', overflow: 'hidden', gap: 0, ...gridStyle }}>
      {panes.map(pane => (
        <PaneContainer
          key={pane.id}
          pane={pane}
          focused={pane.id === focusedPaneId}
          onFocus={() => focusPane(pane.id)}
        />
      ))}
    </div>
  )
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
        color: isActive ? '#ffa028' : '#c0c0c0',
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

function useFullscreen() {
  const [isFullscreen, setIsFullscreen] = useState(false)

  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  const toggle = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {})
    } else {
      document.exitFullscreen().catch(() => {})
    }
  }, [])

  return { isFullscreen, toggle }
}

export function TerminalApp() {
  const { tabs, activeTabId, setActiveTab, closeTab, newTab, menuOpen, activeTicker, activeView } = useTerminalStore()
  const { isFullscreen, toggle: toggleFullscreen } = useFullscreen()

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
                color: isActive ? '#ffa028' : '#c0c0c0',
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
            cursor: 'pointer', color: '#888', padding: '0 10px',
            display: 'flex', alignItems: 'center',
          }}
        >
          <Plus size={10} />
        </button>
      </div>

      <CommandBar />
      <AlertMonitor />
      <QuoteHeader />
      <IndexBar />
      <TickerTape />

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
        {(['GIP', 'DES', 'KS', 'FA', 'CN', 'EE', 'EST', 'RV', 'OPT', 'ECON', 'MACRO', 'ECAL', 'INS', 'MMAP', 'TOP', 'WB', 'GLCO', 'PORT', 'SCRN', 'TV', 'WL', 'MEMO', 'HELP'] as const).map((code) => (
          <NavBtn key={code} code={code} />
        ))}
        {/* Spacer */}
        <div style={{ flex: 1 }} />
        {/* Layout selector */}
        <div style={{ display: 'flex', borderLeft: '1px solid #1f1f1f', height: '100%' }}>
          {LAYOUT_OPTS.map(opt => <LayoutBtn key={opt.mode} opt={opt} />)}
        </div>
        {/* Fullscreen toggle */}
        <button
          onClick={toggleFullscreen}
          title={isFullscreen ? 'Exit fullscreen (Esc)' : 'Enter fullscreen'}
          style={{
            background: isFullscreen ? '#0a1a0a' : 'transparent',
            border: 'none',
            borderLeft: '1px solid #1f1f1f',
            borderBottom: isFullscreen ? '2px solid #ffa028' : '2px solid transparent',
            color: isFullscreen ? '#ffa028' : '#aaaaaa',
            padding: '0 10px',
            cursor: 'pointer',
            font: 'inherit',
            fontSize: 11,
            height: '100%',
          }}
        >
          {isFullscreen ? '✕FS' : 'FS'}
        </button>
      </div>

      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '180px 1fr', overflow: 'hidden' }}>
        <div style={{ borderRight: '1px solid #1f1f1f', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <Watchlist />
        </div>
        <div style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column', position: 'relative' }}>
          {menuOpen && <MenuOverlay />}
          <MultiPaneLayout />
        </div>
      </div>

      <StatusBar />
    </div>
  )
}
