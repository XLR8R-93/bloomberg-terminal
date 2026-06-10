import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type PanelView = 'DES' | 'GIP' | 'FA' | 'KS' | 'CN' | 'EE' | 'EST' | 'RV' | 'WL' | 'TOP' | 'TV' | 'WB' | 'GLCO' | 'PORT' | 'SCRN' | 'OPT' | 'ECON' | 'MACRO' | 'ECAL' | 'INS' | 'MMAP' | 'CORR' | 'MEMO' | 'HELP'

export type LayoutMode = '1x1' | '2h' | '2v' | '2x2'

export interface Pane {
  id:     string
  ticker: string
  view:   PanelView
}

export interface Position {
  id: string
  ticker: string
  shares: number
  avgCost: number
  currency: string
  addedAt: number
}

export interface PriceAlert {
  id: string
  ticker: string
  type: 'TARGET' | 'STOP'
  price: number
  note?: string
  createdAt: number
}

export interface TerminalTab {
  id: string
  ticker: string
  view: PanelView
  label: string
}

function makeId() {
  return Math.random().toString(36).slice(2, 8)
}

function securitySuffix(ticker: string): string {
  if (ticker.endsWith('=F'))  return 'Comdty'
  if (ticker.endsWith('=X'))  return 'Curncy'
  if (ticker.startsWith('^')) return 'Index'
  if (ticker.includes('.'))   return 'Equity'
  return 'Equity'
}

function makeLabel(ticker: string, view: PanelView) {
  return `${view} ${ticker} ${securitySuffix(ticker)}`
}

interface TerminalState {
  activeTicker: string
  activeView: PanelView
  tabs: TerminalTab[]
  activeTabId: string
  menuOpen: boolean
  watchlist: string[]
  commandHistory: string[]
  historyIndex: number
  commandInput: string

  // Multi-pane layout
  layoutMode:     LayoutMode
  panes:          Pane[]
  focusedPaneId:  string

  setActiveTicker: (ticker: string) => void
  setActiveView: (view: PanelView) => void
  setMenuOpen: (open: boolean) => void
  openTab: (ticker: string, view: PanelView) => void
  newTab: () => void
  closeTab: (id: string) => void
  setActiveTab: (id: string) => void
  updateTabLabel: (id: string, companyName: string) => void
  addToWatchlist: (ticker: string) => void
  removeFromWatchlist: (ticker: string) => void
  pushCommand: (cmd: string) => void
  setHistoryIndex: (i: number) => void
  setCommandInput: (s: string) => void

  setLayoutMode: (mode: LayoutMode) => void
  focusPane: (id: string) => void

  positions: Position[]
  addPosition: (p: Omit<Position, 'id' | 'addedAt'>) => void
  updatePosition: (id: string, p: Partial<Omit<Position, 'id' | 'addedAt'>>) => void
  removePosition: (id: string) => void
  loadPortfolio: (positions: Position[], watchlist?: string[]) => void

  alerts: PriceAlert[]
  addAlert: (a: Omit<PriceAlert, 'id' | 'createdAt'>) => void
  removeAlert: (id: string) => void
}

const DEFAULT_TAB: TerminalTab = { id: 'default', ticker: 'AAPL', view: 'GIP', label: 'GIP AAPL Equity' }

const DEFAULT_PANES: Pane[] = [
  { id: 'p1', ticker: 'AAPL',  view: 'GIP' },
  { id: 'p2', ticker: 'MSFT',  view: 'GIP' },
  { id: 'p3', ticker: 'AAPL',  view: 'DES' },
  { id: 'p4', ticker: 'AAPL',  view: 'FA'  },
]

export const useTerminalStore = create<TerminalState>()(
  persist(
    (set, get) => ({
      activeTicker: 'AAPL',
      activeView: 'GIP',
      tabs: [DEFAULT_TAB],
      activeTabId: 'default',
      menuOpen: false,
      watchlist: ['AAPL', 'MSFT', 'NVDA', 'TSLA', 'GOOGL', 'AMZN', 'META'],
      commandHistory: [],
      historyIndex: -1,
      commandInput: '',

      layoutMode:    '1x1',
      panes:         DEFAULT_PANES,
      focusedPaneId: 'p1',

      setActiveTicker: (ticker) => {
        const t = ticker.toUpperCase()
        set((s) => ({
          activeTicker: t,
          tabs: s.tabs.map((tab) =>
            tab.id === s.activeTabId ? { ...tab, ticker: t, label: makeLabel(t, tab.view) } : tab
          ),
          panes: s.panes.map((p) =>
            p.id === s.focusedPaneId ? { ...p, ticker: t } : p
          ),
        }))
      },

      setActiveView: (view) =>
        set((s) => ({
          activeView: view,
          tabs: s.tabs.map((tab) =>
            tab.id === s.activeTabId ? { ...tab, view, label: makeLabel(tab.ticker, view) } : tab
          ),
          panes: s.panes.map((p) =>
            p.id === s.focusedPaneId ? { ...p, view } : p
          ),
        })),

      setMenuOpen: (open) => set({ menuOpen: open }),

      openTab: (ticker, view) => {
        const t = ticker.toUpperCase()
        set((s) => ({
          activeTicker: t,
          activeView: view,
          tabs: s.tabs.map((tab) =>
            tab.id === s.activeTabId ? { ...tab, ticker: t, view, label: makeLabel(t, view) } : tab
          ),
          panes: s.panes.map((p) =>
            p.id === s.focusedPaneId ? { ...p, ticker: t, view } : p
          ),
        }))
      },

      newTab: () => {
        const state = get()
        const id = makeId()
        const tab: TerminalTab = { id, ticker: state.activeTicker, view: state.activeView, label: makeLabel(state.activeTicker, state.activeView) }
        set((s) => ({ tabs: [...s.tabs, tab], activeTabId: id }))
      },

      closeTab: (id) =>
        set((s) => {
          const idx = s.tabs.findIndex((t) => t.id === id)
          if (idx === -1 || s.tabs.length === 1) return {}
          const newTabs = s.tabs.filter((t) => t.id !== id)
          if (s.activeTabId !== id) return { tabs: newTabs }
          const nextTab = newTabs[Math.max(0, idx - 1)]
          return { tabs: newTabs, activeTabId: nextTab.id, activeTicker: nextTab.ticker, activeView: nextTab.view }
        }),

      setActiveTab: (id) =>
        set((s) => {
          const tab = s.tabs.find((t) => t.id === id)
          if (!tab) return {}
          return { activeTabId: id, activeTicker: tab.ticker, activeView: tab.view }
        }),

      updateTabLabel: (id, companyName) =>
        set((s) => ({
          tabs: s.tabs.map((tab) =>
            tab.id === id ? { ...tab, label: `${tab.view} ${companyName} Equity` } : tab
          ),
        })),

      addToWatchlist: (ticker) =>
        set((s) => ({
          watchlist: s.watchlist.includes(ticker.toUpperCase()) ? s.watchlist : [...s.watchlist, ticker.toUpperCase()],
        })),
      removeFromWatchlist: (ticker) =>
        set((s) => ({ watchlist: s.watchlist.filter((t) => t !== ticker.toUpperCase()) })),
      pushCommand: (cmd) =>
        set((s) => ({ commandHistory: [cmd, ...s.commandHistory].slice(0, 100), historyIndex: -1 })),
      setHistoryIndex: (i) => set({ historyIndex: i }),
      setCommandInput: (s) => set({ commandInput: s }),

      positions: [],
      addPosition: (p) => set((s) => ({ positions: [...s.positions, { ...p, id: makeId(), addedAt: Date.now() }] })),
      updatePosition: (id, p) => set((s) => ({ positions: s.positions.map((pos) => pos.id === id ? { ...pos, ...p } : pos) })),
      removePosition: (id) => set((s) => ({ positions: s.positions.filter((pos) => pos.id !== id) })),

      loadPortfolio: (positions, watchlist) =>
        set((s) => ({
          positions,
          ...(watchlist ? { watchlist } : {}),
        })),

      alerts: [],
      addAlert: (a) => set((s) => ({ alerts: [...s.alerts, { ...a, id: makeId(), createdAt: Date.now() }] })),
      removeAlert: (id) => set((s) => ({ alerts: s.alerts.filter(a => a.id !== id) })),

      setLayoutMode: (mode) =>
        set((s) => {
          // Determine how many panes the new layout needs
          const count = mode === '2h' || mode === '2v' ? 2 : mode === '2x2' ? 4 : 1
          // Grow panes array if needed (clone existing, add defaults for new slots)
          const panes = Array.from({ length: count }, (_, i) =>
            s.panes[i] ?? { id: `p${i + 1}`, ticker: s.activeTicker, view: 'GIP' as PanelView }
          )
          return { layoutMode: mode, panes, focusedPaneId: panes[0].id }
        }),

      focusPane: (id) =>
        set((s) => {
          const pane = s.panes.find(p => p.id === id)
          if (!pane) return {}
          return {
            focusedPaneId: id,
            activeTicker:  pane.ticker,
            activeView:    pane.view,
          }
        }),
    }),
    {
      name: 'bbg-terminal',
      skipHydration: true,

      // ── Only persist user-owned data ────────────────────────────────────────
      // Explicitly listing fields means adding new store fields never touches
      // what's saved — so schema changes can't accidentally wipe holdings.
      partialize: (state) => ({
        positions:      state.positions,
        alerts:         state.alerts,
        watchlist:      state.watchlist,
        tabs:           state.tabs,
        activeTicker:   state.activeTicker,
        activeView:     state.activeView,
        activeTabId:    state.activeTabId,
        layoutMode:     state.layoutMode,
        panes:          state.panes,
        commandHistory: state.commandHistory,
      }),

      // ── Versioned migration ─────────────────────────────────────────────────
      // Bumping version triggers migrate(). The function always rescues
      // positions / alerts / watchlist from whatever shape was stored before,
      // so a schema bump never silently empties the portfolio.
      version: 3,
      migrate: (stored: unknown, fromVersion: number) => {
        const s = (stored ?? {}) as Record<string, unknown>
        // Unconditionally forward the three critical user-data arrays.
        // Everything else can fall back to initial state safely.
        return {
          ...(s as object),
          positions: Array.isArray(s.positions) ? s.positions : [],
          alerts:    Array.isArray(s.alerts)    ? s.alerts    : [],
          watchlist: Array.isArray(s.watchlist) ? s.watchlist
            : ['AAPL', 'MSFT', 'NVDA', 'TSLA', 'GOOGL', 'AMZN', 'META'],
        }
      },
    }
  )
)
