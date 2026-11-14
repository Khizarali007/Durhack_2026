import { useMemo, useState } from 'react'
import { usePortfolio, useOpenOrders, useTrades, useQuote } from '../../api'
import type { PositionOut } from '../../api'
import OpenOrdersTable from '../orders/OpenOrdersTable'
import TradesTable from '../orders/TradesTable'
import { formatHOOP, formatPct, formatPnl, formatPrice, formatQty, trendArrow } from '../../utils/format'
import styles from './StockActivity.module.css'

type Tab = 'position' | 'orders' | 'history'

interface StockActivityProps {
  symbol: string
}

/** Your position in this stock, priced off the live quote rather than the last account refresh. */
function PositionPanel({ symbol, position }: { symbol: string; position: PositionOut | undefined }) {
  const quote = useQuote(symbol)

  if (!position || position.qty === 0) {
    return (
      <p className={styles.empty}>
        You don't hold any {symbol} yet. Use the ticket on the right to buy some: 10 shares is a fine first trade.
      </p>
    )
  }

  const last = quote?.last ?? position.last_price
  const shares = Math.abs(position.qty)
  const short = position.qty < 0
  const value = shares * last
  const cost = shares * position.avg_cost
  const pnl = short ? cost - value : value - cost
  const pnlPct = cost > 0 ? pnl / cost * 100 : 0
  const leverage = position.leverage ?? 1

  return (
    <dl className={styles.stats}>
      <div>
        <dt>Shares</dt>
        <dd>
          {formatQty(shares)}
          {short && <span className={styles.badgeShort}>⤓ Short</span>}
          {leverage > 1.05 && <span className={styles.badgeLev}>{leverage.toFixed(0)}x</span>}
        </dd>
      </div>
      <div>
        <dt>Average cost</dt>
        <dd>{formatPrice(position.avg_cost)}</dd>
      </div>
      <div>
        <dt>Price now</dt>
        <dd>{formatPrice(last)}</dd>
      </div>
      <div>
        <dt>{short ? 'Owed at market' : 'Market value'}</dt>
        <dd>{formatHOOP(value)}</dd>
      </div>
      <div>
        <dt>Profit / loss</dt>
        <dd className={pnl >= 0 ? 'trend-up' : 'trend-down'}>
          {trendArrow(pnl)} {formatPnl(pnl)} <span className={styles.pct}>({formatPct(pnlPct)})</span>
        </dd>
      </div>
    </dl>
  )
}

/** Tab strip under the chart: position, open orders and fills for the stock on screen. */
export default function StockActivity({ symbol }: StockActivityProps) {
  const [tab, setTab] = useState<Tab>('position')
  const { portfolio } = usePortfolio()
  const orders = useOpenOrders(symbol)
  const allTrades = useTrades()
  const trades = useMemo(() => allTrades.filter(t => t.symbol === symbol), [allTrades, symbol])
  const position = portfolio?.positions.find(p => p.symbol === symbol)

  const tabs: { value: Tab; label: string }[] = [
    { value: 'position', label: 'Your position' },
    { value: 'orders', label: `Open orders${orders.length > 0 ? ` (${orders.length})` : ''}` },
    { value: 'history', label: `History${trades.length > 0 ? ` (${trades.length})` : ''}` },
  ]

  return (
    <section className={styles.panel} aria-label={`Your activity in ${symbol}`} data-tour="stock-activity">
      <div className={styles.tabs} role="tablist">
        {tabs.map(t => (
          <button
            key={t.value}
            type="button"
            role="tab"
            aria-selected={tab === t.value}
            className={`${styles.tab} ${tab === t.value ? styles.tabActive : ''}`}
            data-tour={`stock-tab-${t.value}`}
            onClick={() => setTab(t.value)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className={styles.body} role="tabpanel">
        {tab === 'position' && <PositionPanel symbol={symbol} position={position} />}
        {tab === 'orders' && (
          <OpenOrdersTable
            orders={orders}
            symbol={symbol}
            empty={<>No open orders on {symbol}. Limit and stop-loss orders from the ticket wait here until their price is reached.</>}
          />
        )}
        {tab === 'history' && (
          <TradesTable trades={trades} empty={<>No trades in {symbol} yet.</>} />
        )}
      </div>
    </section>
  )
}
