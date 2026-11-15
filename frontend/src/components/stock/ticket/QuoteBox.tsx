import type { ReactNode } from 'react'
import type { Quote } from '../../../api'
import { formatPrice, formatQty } from '../../../utils/format'
import styles from './QuoteBox.module.css'

interface QuoteBoxProps {
  quote: Quote | null
  /** Which price this order trades at: buys pay the ask, sells get the bid. */
  emphasise: 'bid' | 'ask'
  /** Optional "?" help next to each label (Person 4's tooltip content). */
  bidHelp?: ReactNode
  askHelp?: ReactNode
  makersHelp?: ReactNode
}

/** Best bid and ask side by side, with the three market makers' own quotes underneath. */
export default function QuoteBox({ quote, emphasise, bidHelp, askHelp, makersHelp }: QuoteBoxProps) {
  const makers = quote?.makers ?? []

  return (
    <div className={styles.box} data-tour="ticket-quote">
      <div className={styles.best} data-tour="ticket-best">
        <div className={`${styles.side} ${emphasise === 'bid' ? styles.sideActive : ''}`}>
          <span className={styles.label}>Best bid {bidHelp}</span>
          <span className={styles.price}>{formatPrice(quote?.bid)}</span>
          <span className={styles.hint}>you sell at</span>
        </div>
        <div className={`${styles.side} ${emphasise === 'ask' ? styles.sideActive : ''}`}>
          <span className={styles.label}>Best ask {askHelp}</span>
          <span className={styles.price}>{formatPrice(quote?.ask)}</span>
          <span className={styles.hint}>you buy at</span>
        </div>
      </div>

      <table className={styles.makers} data-tour="ticket-makers">
        <caption className={styles.caption}>Market makers {makersHelp}</caption>
        <thead>
          <tr>
            <th scope="col">Maker</th>
            <th scope="col">Bid</th>
            <th scope="col">Ask</th>
            <th scope="col">Shares</th>
          </tr>
        </thead>
        <tbody>
          {makers.length === 0 && (
            <tr><td colSpan={4} className={styles.waiting}>Waiting for quotes…</td></tr>
          )}
          {makers.map(m => {
            const depleted = m.shares <= 0 || m.ask === null
            return (
              <tr key={m.maker_id} className={depleted ? styles.depleted : undefined}>
                <th scope="row">{m.maker_id}</th>
                <td>{formatPrice(m.bid)}</td>
                <td>{formatPrice(m.ask)}</td>
                <td>{depleted ? <span className={styles.soldOut}>sold out</span> : formatQty(m.shares)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
