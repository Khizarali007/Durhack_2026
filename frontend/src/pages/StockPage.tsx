import { useCallback } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { usePlayers, useSymbolEvents } from '../api'
import Watchlist from '../components/stock/Watchlist'
import PlayerCard from '../components/stock/PlayerCard'
import PriceChart from '../components/stock/PriceChart'
import OrderTicket from '../components/stock/OrderTicket'
import StockActivity from '../components/stock/StockActivity'
import PlayerForecast from '../components/stock/PlayerForecast'
import styles from './StockPage.module.css'

/** The trading terminal: market list, chart and order ticket for one stock. */
export default function StockPage() {
  const { symbol: rawSymbol } = useParams<{ symbol: string }>()
  const symbol = (rawSymbol ?? '').toUpperCase()
  const navigate = useNavigate()
  const { bySymbol, loading } = usePlayers()
  const player = bySymbol.get(symbol)
  const events = useSymbolEvents(symbol)

  // Same route, new param: React Router swaps the symbol without reloading the page
  const select = useCallback((next: string) => navigate(`/stock/${next}`), [navigate])

  return (
    <div className={styles.page}>
      <Watchlist selected={symbol} onSelect={select} />

      {player ? (
        <>
          <div className={styles.centre}>
            <PlayerCard player={player} />
            <PlayerForecast symbol={player.symbol} />
            <PriceChart symbol={player.symbol} events={events} />
            <StockActivity symbol={player.symbol} />
          </div>
          {/* Keyed by symbol so quantity and the last result never carry over to another stock */}
          <OrderTicket key={player.symbol} player={player} />
        </>
      ) : loading ? (
        <>
          <div className={styles.centre} aria-busy="true">
            <div className={`skeleton ${styles.skeletonCard}`} />
            <div className={`skeleton ${styles.skeletonChart}`} />
          </div>
          <div className={styles.skeletonTicket}>
            <div className={`skeleton ${styles.skeletonLine}`} />
            <div className={`skeleton ${styles.skeletonLine}`} />
            <div className={`skeleton ${styles.skeletonLine}`} />
          </div>
        </>
      ) : (
        <div className={styles.missing}>
          <h1>No player trades as “{symbol}”</h1>
          <p>Pick someone from the list on the left, or browse the whole market.</p>
          <Link to="/market" className={styles.link}>Open the market list</Link>
        </div>
      )}
    </div>
  )
}
