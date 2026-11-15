import { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { getPlayers, getCachedQuote, getInitPrice, getRadarState } from '../api'
import type { Player } from '../api'
import MoverCard from '../components/market/MoverCard'
import MarketRow from '../components/market/MarketRow'
import styles from './MarketPage.module.css'

const ROW_HEIGHT = 48
const OVERSCAN = 5

type SortKey = 'symbol' | 'price' | 'change' | 'radar'
type SortDir = 'asc' | 'desc'

function computeChange(symbol: string): number {
  const q = getCachedQuote(symbol)
  const init = getInitPrice(symbol)
  if (q == null || init == null) return 0
  return ((q.quoted_price ?? q.last) - init) / init * 100
}

const RADAR_SCORE = { calm: 0, cloudy: 1, storm: 2 } as const

/** `_tick` only exists so a re-rank can be requested while the inputs are unchanged. */
function sortPlayers(list: Player[], key: SortKey, dir: SortDir, _tick: number): Player[] {
  void _tick
  const copy = [...list]
  copy.sort((a, b) => {
    let va: number | string
    let vb: number | string
    switch (key) {
      case 'symbol':
        va = a.name; vb = b.name
        break
      case 'price':
        va = getCachedQuote(a.symbol)?.quoted_price ?? 0
        vb = getCachedQuote(b.symbol)?.quoted_price ?? 0
        break
      case 'change':
        va = computeChange(a.symbol)
        vb = computeChange(b.symbol)
        break
      case 'radar':
        va = RADAR_SCORE[getRadarState(a.symbol)]
        vb = RADAR_SCORE[getRadarState(b.symbol)]
        break
    }
    const cmp = va < vb ? -1 : va > vb ? 1 : 0
    return dir === 'asc' ? cmp : -cmp
  })
  return copy
}

export default function MarketPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const [players, setPlayers] = useState<Player[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState(searchParams.get('q') ?? '')
  const [teamFilter, setTeamFilter] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('symbol')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [sortTick, setSortTick] = useState(0)
  const [movers, setMovers] = useState<{ top5: Player[]; bot5: Player[] }>({ top5: [], bot5: [] })
  const [highlightedIdx, setHighlightedIdx] = useState(-1)
  const [scrollTop, setScrollTop] = useState(0)
  const [containerHeight, setContainerHeight] = useState(800)

  const tableRef = useRef<HTMLDivElement>(null)
  const filterRef = useRef<HTMLInputElement>(null)

  // Load player roster once
  useEffect(() => {
    getPlayers()
      .then(ps => { setPlayers(ps); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  // Ctrl+K: focus the local filter (runs after Header's listener, winning focus)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        filterRef.current?.focus()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // Measure virtual table height; re-run after players load so the ref is set
  useEffect(() => {
    const el = tableRef.current
    if (!el) return
    setContainerHeight(el.clientHeight)
    const ro = new ResizeObserver(() => setContainerHeight(el.clientHeight))
    ro.observe(el)
    return () => ro.disconnect()
  }, [loading])

  // Unique teams (stable after load)
  const allTeams = useMemo(
    () => Array.from(new Set(players.map(p => p.team))).sort(),
    [players]
  )

  // Filtered list
  const filteredPlayers = useMemo(() => {
    let result = players
    if (teamFilter) result = result.filter(p => p.team === teamFilter)
    if (query) {
      const q = query.toLowerCase()
      result = result.filter(
        p => p.name.toLowerCase().includes(q) ||
             p.symbol.toLowerCase().includes(q) ||
             p.team.toLowerCase().includes(q)
      )
    }
    return result
  }, [players, query, teamFilter])

  // Live sorts (price, change, radar) re-rank once a second, not on every tick
  useEffect(() => {
    if (sortKey === 'symbol') return
    const id = setInterval(() => setSortTick(n => n + 1), 1000)
    return () => clearInterval(id)
  }, [sortKey])

  const sortedPlayers = useMemo(
    () => sortPlayers(filteredPlayers, sortKey, sortDir, sortTick),
    [filteredPlayers, sortKey, sortDir, sortTick],
  )

  // Top movers at 1 Hz
  useEffect(() => {
    if (players.length === 0) return
    const compute = () => {
      const ranked = [...players].sort((a, b) => computeChange(b.symbol) - computeChange(a.symbol))
      setMovers({ top5: ranked.slice(0, 5), bot5: ranked.slice(-5).reverse() })
    }
    compute()
    const id = setInterval(compute, 1000)
    return () => clearInterval(id)
  }, [players])

  function scrollToRow(idx: number) {
    const el = tableRef.current
    if (!el) return
    const top = idx * ROW_HEIGHT
    const bot = top + ROW_HEIGHT
    if (top < el.scrollTop) el.scrollTop = top
    else if (bot > el.scrollTop + el.clientHeight) el.scrollTop = bot - el.clientHeight
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
    setHighlightedIdx(-1)
  }

  // Virtualisation window
  const startIdx = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN)
  const endIdx = Math.min(sortedPlayers.length, Math.ceil((scrollTop + containerHeight) / ROW_HEIGHT) + OVERSCAN)
  const totalHeight = sortedPlayers.length * ROW_HEIGHT

  function sortArrow(key: SortKey) {
    return sortKey === key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''
  }

  if (loading) {
    return (
      <div className={styles.loadingState}>
        {Array.from({ length: 8 }, (_, i) => (
          <div
            key={i}
            className={styles.loadingPulse}
            style={{ animationDelay: `${i * 0.07}s`, width: i % 3 === 1 ? '90%' : '100%' }}
          />
        ))}
      </div>
    )
  }

  return (
    <div className={styles.page}>

      {/* Top movers strip */}
      <div className={styles.moversBar} aria-label="Top movers">
        <span className={styles.moversLabel}>▲ Gainers</span>
        {movers.top5.map(p => <MoverCard key={p.symbol} player={p} />)}
        <div className={styles.moversDivider} role="separator" />
        <span className={styles.moversLabel}>▼ Fallers</span>
        {movers.bot5.map(p => <MoverCard key={p.symbol} player={p} />)}
      </div>

      {/* Controls */}
      <div className={styles.controls}>
        <input
          ref={filterRef}
          className={styles.filterInput}
          type="search"
          placeholder="Search players or teams…"
          data-tour="market-search"
          value={query}
          onChange={e => { setQuery(e.target.value); setHighlightedIdx(-1) }}
          aria-label="Filter players"
        />
        <select
          className={styles.teamSelect}
          value={teamFilter}
          onChange={e => { setTeamFilter(e.target.value); setHighlightedIdx(-1) }}
          aria-label="Filter by team"
          data-tour="market-team"
        >
          <option value="">All 30 teams</option>
          {allTeams.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <span className={styles.rowCount}>
          {sortedPlayers.length} / {players.length}
        </span>
      </div>

      {/* Table */}
      <div className={styles.tableWrapper} data-tour="market-table">

        {/* Column header row */}
        <div className={styles.tableHeader} role="row">
          <div className={styles.colHeader} />
          <button
            className={`${styles.colHeader} ${styles.colName}${sortKey === 'symbol' ? ` ${styles.sorted}` : ''}`}
            onClick={() => toggleSort('symbol')}
            type="button"
          >
            Player{sortArrow('symbol')}
          </button>
          <div className={`${styles.colHeader} ${styles.colTeam}`}>Team</div>
          <button
            className={`${styles.colHeader}${sortKey === 'price' ? ` ${styles.sorted}` : ''}`}
            onClick={() => toggleSort('price')}
            type="button"
          >
            Price{sortArrow('price')}
          </button>
          <button
            className={`${styles.colHeader}${sortKey === 'change' ? ` ${styles.sorted}` : ''}`}
            onClick={() => toggleSort('change')}
            type="button"
          >
            Change{sortArrow('change')}
          </button>
          <div className={styles.colHeader}>Bid</div>
          <div className={styles.colHeader}>Ask</div>
          <div className={`${styles.colHeader} ${styles.colSpark}`}>Trend</div>
          <button
            className={`${styles.colHeader} ${styles.colRadar}${sortKey === 'radar' ? ` ${styles.sorted}` : ''}`}
            onClick={() => toggleSort('radar')}
            type="button"
          >
            Radar{sortArrow('radar')}
          </button>
        </div>

        {/* Virtual body */}
        <div
          ref={tableRef}
          className={styles.tableBody}
          onScroll={e => setScrollTop(e.currentTarget.scrollTop)}
          onKeyDown={e => {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              const next = Math.min(highlightedIdx + 1, sortedPlayers.length - 1)
              setHighlightedIdx(next)
              scrollToRow(next)
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              const next = Math.max(highlightedIdx - 1, 0)
              setHighlightedIdx(next)
              scrollToRow(next)
            } else if (e.key === 'Enter' && highlightedIdx >= 0) {
              navigate(`/stock/${sortedPlayers[highlightedIdx].symbol}`)
            }
          }}
          tabIndex={0}
          role="grid"
          aria-label="Player list"
          aria-rowcount={sortedPlayers.length}
        >
          {sortedPlayers.length === 0
            ? (
              <div className={styles.emptyState}>
                No players match your filters — try clearing the team or search filter.
              </div>
            )
            : (
              <div style={{ height: totalHeight, position: 'relative' }}>
                {sortedPlayers.slice(startIdx, endIdx).map((player, i) => {
                  const idx = startIdx + i
                  return (
                    <div
                      key={player.symbol}
                      style={{
                        position: 'absolute',
                        top: idx * ROW_HEIGHT,
                        left: 0,
                        right: 0,
                        height: ROW_HEIGHT,
                      }}
                      onClick={() => navigate(`/stock/${player.symbol}`)}
                      onMouseEnter={() => setHighlightedIdx(idx)}
                      aria-rowindex={idx + 1}
                      data-tour={`market-row-${player.symbol}`}
                    >
                      <MarketRow player={player} isHighlighted={idx === highlightedIdx} />
                    </div>
                  )
                })}
              </div>
            )}
        </div>
      </div>
    </div>
  )
}
