import { useMemo, useState } from 'react'
import { usePlayers } from '../../api'
import type { Player } from '../../api'
import { VirtualList } from '../ui/VirtualList'
import MarketRow from '../market/MarketRow'
import styles from './Watchlist.module.css'

const ROW_HEIGHT = 48

interface WatchlistProps {
  /** The stock open in the centre and right columns. */
  selected: string
  onSelect: (symbol: string) => void
}

/** Left column of the trading screen: every stock, searchable, with the open one marked. */
export default function Watchlist({ selected, onSelect }: WatchlistProps) {
  const { players, loading } = usePlayers()
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return players.filter(p => !q ||
      p.name.toLowerCase().includes(q) ||
      p.symbol.toLowerCase().includes(q) ||
      p.team.toLowerCase().includes(q)).sort((a, b) => a.name.localeCompare(b.name))
  }, [players, query])

  const selectedIndex = useMemo(() => filtered.findIndex(p => p.symbol === selected), [filtered, selected])

  return (
    <aside className={styles.watchlist} aria-label="Market list">
      <div className={styles.head}>
        <span className={styles.title}>Market</span>
        <span className={styles.count}>{filtered.length} of {players.length}</span>
      </div>
      <input
        className={styles.search}
        type="search"
        placeholder="Search player or team"
        value={query}
        onChange={e => setQuery(e.target.value)}
        aria-label="Search the market list"
      />

      {loading ? (
        <div className={styles.skeletons} aria-hidden="true">
          {Array.from({ length: 10 }, (_, i) => <div key={i} className={`skeleton ${styles.skeletonRow}`} />)}
        </div>
      ) : filtered.length === 0 ? (
        <p className={styles.empty}>No player matches “{query}”.</p>
      ) : (
        <VirtualList<Player>
          className={styles.list}
          items={filtered}
          itemHeight={ROW_HEIGHT}
          getKey={p => p.symbol}
          scrollToIndex={selectedIndex}
          ariaLabel="Players"
          renderItem={player => (
            <div
              role="button"
              tabIndex={0}
              onClick={() => onSelect(player.symbol)}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onSelect(player.symbol)
                }
              }}
              className={styles.rowButton}
              aria-label={`Open ${player.name}`}
            >
              <MarketRow player={player} compact isHighlighted={false} isSelected={player.symbol === selected} />
            </div>
          )}
        />
      )}
    </aside>
  )
}
