import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type PanelView = 'DES' | 'GIP' | 'FA' | 'KS' | 'CN' | 'EE' | 'EST' | 'RV' | 'WL' | 'TOP' | 'TV' | 'WB' | 'GLCO' | 'PORT' | 'HELP'

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

  positions: Position[]
  addPosition: (p: Omit<Position, 'id' | 'addedAt'>) => void
  updatePosition: (id: string, p: Partial<Omit<Position, 'id' | 'addedAt'>>) => void
  removePosition: (id: string) => void

  alerts: PriceAlert[]
  addAlert: (a: Omit<PriceAlert, 'id' | 'createdAt'>) => void
  removeAlert: (id: string) => void
}

const DEFAULT_TAB: TerminalTab = { id: 'default', ticker: 'AAPL', view: 'GIP', label: 'GIP AAPL Equity' }

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

      setActiveTicker: (ticker) => {
        const t = ticker.toUpperCase()
        set((s) => ({
          activeTicker: t,
          tabs: s.tabs.map((tab) =>
            tab.id === s.activeTabId ? { ...tab, ticker: t, label: makeLabel(t, tab.view) } : tab
          ),
        }))
      },

      setActiveView: (view) =>
        set((s) => ({
          activeView: view,
          tabs: s.tabs.map((tab) =>
            tab.id === s.activeTabId ? { ...tab, view, label: makeLabel(tab.ticker, view) } : tab
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

      alerts: [],
      addAlert: (a) => set((s) => ({ alerts: [...s.alerts, { ...a, id: makeId(), createdAt: Date.now() }] })),
      removeAlert: (id) => set((s) => ({ alerts: s.alerts.filter(a => a.id !== id) })),
    }),
    { name: 'bbg-terminal', skipHydration: true }
  )
)
