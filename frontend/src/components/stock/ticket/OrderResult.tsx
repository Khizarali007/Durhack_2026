import type { OrderSide } from '../../../api'
import { formatHOOP, formatPrice, formatQty } from '../../../utils/format'
import type { TicketResult } from './types'
import styles from './OrderResult.module.css'

const VERB: Record<OrderSide, string> = { buy: 'Bought', sell: 'Sold', short: 'Shorted', cover: 'Covered' }

function sentence(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

interface OrderResultProps {
  result: TicketResult
  onDismiss: () => void
}

/** The outcome of the last order: what filled, at what price, or why it did not. */
export default function OrderResult({ result, onDismiss }: OrderResultProps) {
  if (result.kind === 'error') {
    return (
      <div className={`${styles.result} ${styles.error}`} role="alert">
        <div className={styles.head}>
          <span className={styles.title}><span aria-hidden="true">✕</span> Order not placed</span>
          <button type="button" className={styles.dismiss} onClick={onDismiss} aria-label="Dismiss">×</button>
        </div>
        <p className={styles.message}>{result.message}</p>
      </div>
    )
  }

  if (result.kind === 'placed') {
    const o = result.order
    const what = o.type === 'limit' ? 'Limit' : 'Stop-loss'
    const done = o.status === 'filled'
    return (
      <div className={`${styles.result} ${done ? styles.ok : styles.pending}`} role="status">
        <div className={styles.head}>
          <span className={styles.title}>
            <span aria-hidden="true">{done ? '✓' : '◷'}</span>{' '}
            {done ? `${what} order filled straight away` : `${what} order placed`}
          </span>
          <button type="button" className={styles.dismiss} onClick={onDismiss} aria-label="Dismiss">×</button>
        </div>
        <p className={styles.message}>
          {o.side === 'buy' ? 'Buy' : 'Sell'} {formatQty(o.qty)} {o.symbol}{' '}
          {o.type === 'limit' ? 'at' : 'if the bid falls to'} {formatPrice(o.price)}.
          {!done && ' It waits in Open orders until the price gets there.'}
        </p>
      </div>
    )
  }

  const { out, estimate } = result
  const partial = out.status === 'partially_filled'
  const buying = out.side === 'buy' || out.side === 'cover'
  const notional = out.average_price * out.filled_qty
  const total = buying ? notional + out.total_fee : notional - out.total_fee
  // Slippage actually paid: how far the average fill landed from the best price when you pressed confirm
  const actualSlippage = estimate !== null && estimate.best_price !== null
    ? Math.abs(out.average_price - estimate.best_price) * out.filled_qty
    : null

  return (
    <div className={`${styles.result} ${partial ? styles.pending : styles.ok}`} role="status">
      <div className={styles.head}>
        <span className={styles.title}>
          <span aria-hidden="true">{partial ? '◐' : '✓'}</span>{' '}
          {partial
            ? `Partly filled: ${formatQty(out.filled_qty)} of ${formatQty(out.requested_qty)} ${out.symbol}`
            : `${VERB[out.side]} ${formatQty(out.filled_qty)} ${out.symbol}`}
        </span>
        <button type="button" className={styles.dismiss} onClick={onDismiss} aria-label="Dismiss">×</button>
      </div>

      {partial && out.reason && <p className={styles.message}>{sentence(out.reason)}. The rest was not filled.</p>}

      <table className={styles.table}>
        {estimate !== null && (
          <thead>
            <tr><th /><th scope="col">Estimate</th><th scope="col">Actual</th></tr>
          </thead>
        )}
        <tbody>
          <tr>
            <th scope="row">Average price</th>
            {estimate !== null && <td>{formatPrice(estimate.est_avg_price)}</td>}
            <td>{formatPrice(out.average_price)}</td>
          </tr>
          {estimate !== null && (
            <tr>
              <th scope="row">Slippage</th>
              <td>{formatHOOP(estimate.slippage)}</td>
              <td>{actualSlippage === null ? '—' : formatHOOP(actualSlippage)}</td>
            </tr>
          )}
          <tr>
            <th scope="row">Fee</th>
            {estimate !== null && <td>{formatHOOP(estimate.fee)}</td>}
            <td>{formatHOOP(out.total_fee)}</td>
          </tr>
          <tr>
            <th scope="row">{buying ? 'Total cost' : 'You received'}</th>
            {estimate !== null && <td>{formatHOOP(estimate.total)}</td>}
            <td className={styles.strong}>{formatHOOP(total)}</td>
          </tr>
        </tbody>
      </table>

      <details className={styles.fills}>
        <summary>{out.fills.length} {out.fills.length === 1 ? 'fill' : 'fills'}, in chunks of up to 10 shares</summary>
        <ul>
          {out.fills.map(f => (
            <li key={f.trade_id}>
              <span>{formatQty(f.qty)} @ {formatPrice(f.price)}</span>
              <span>{f.counterparty}</span>
            </li>
          ))}
        </ul>
      </details>
    </div>
  )
}
