import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import {
  useQuote, usePortfolio, useReservedCash, useOrderQuote, useSession, placeOrder, errorDetail,
} from '../../api'
import type { Player } from '../../api'
import { Button, SegmentedControl } from '../ui'
import { formatHOOP, formatPrice, formatQty } from '../../utils/format'
import QuoteBox from './ticket/QuoteBox'
import QtyInput from './ticket/QtyInput'
import OrderResult from './ticket/OrderResult'
import { parseQty } from './ticket/qty'
import type { TicketResult } from './ticket/types'
import styles from './OrderTicket.module.css'

type Side = 'buy' | 'sell'

interface OrderTicketProps {
  player: Player
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
}

/** Right column of the trading screen: a market order for the open stock. */
export default function OrderTicket({ player }: OrderTicketProps) {
  const symbol = player.symbol
  const quote = useQuote(symbol)
  const { session } = useSession({ autoGuest: false })
  const { portfolio } = usePortfolio()
  const reserved = useReservedCash()

  const [side, setSide] = useState<Side>('buy')
  const [qtyText, setQtyText] = useState('10')
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<TicketResult | null>(null)
  const qtyRef = useRef<HTMLInputElement>(null)

  const qty = parseQty(qtyText)
  const estimate = useOrderQuote(symbol, side, qty)
  const est = estimate.quote
  const held = Math.max(0, portfolio?.positions.find(p => p.symbol === symbol)?.qty ?? 0)
  const freeCash = portfolio ? portfolio.cash - reserved : null

  // --- Why the order cannot go through, in plain words (null = good to go) ---
  let blocker: string | null = null
  let note: string | null = null
  if (session === null) {
    blocker = 'Join the game to trade.'
  } else if (portfolio === null) {
    blocker = 'Loading your account…'
  } else if (qty === null) {
    blocker = 'Enter a whole number of shares, from 1 to 10,000.'
  } else if (side === 'sell') {
    if (held === 0) blocker = `You don't hold any ${symbol} to sell.`
    else if (qty > held) blocker = `You hold ${formatQty(held)} ${symbol}: you can't sell ${formatQty(qty)}.`
    else if (quote !== null && quote.bid === null) blocker = 'Nobody is bidding right now. Try again in a moment.'
  } else if (estimate.error !== null) {
    blocker = estimate.error
  } else if (est !== null) {
    if (est.cash_short) {
      blocker = est.fillable_qty > 0
        ? `Not enough cash for ${formatQty(qty)} shares. You can afford about ${formatQty(est.fillable_qty)}.`
        : `Not enough cash: you have ${formatHOOP(freeCash ?? 0)} HOOP free.`
    } else if (est.fillable_qty === 0) {
      blocker = 'No shares for sale right now: the market makers are sold out.'
    } else if (est.makers_short) {
      note = `Only ${formatQty(est.fillable_qty)} shares are for sale right now. The rest of your order will not fill.`
    }
  }
  if (blocker === null && estimate.error !== null) blocker = estimate.error

  const canSubmit = blocker === null && !submitting && qty !== null

  async function submit() {
    if (!canSubmit || qty === null) return
    setSubmitting(true)
    try {
      const out = await placeOrder({ symbol, side, qty })
      setResult({ kind: 'filled', out, estimate: null })
    } catch (err) {
      setResult({ kind: 'error', message: errorDetail(err, 'The order could not be placed. Please try again.') })
    } finally {
      setSubmitting(false)
    }
  }

  // --- Keyboard: B and S switch side anywhere on the page except other text fields ---
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if (isTypingTarget(e.target) && e.target !== qtyRef.current) return
      const k = e.key.toLowerCase()
      if (k === 'b') { e.preventDefault(); setSide('buy') }
      else if (k === 's') { e.preventDefault(); setSide('sell') }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  function onQtyKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      void submit()
    }
  }

  const buying = side === 'buy'

  return (
    <aside className={styles.ticket} aria-label={`Order ticket for ${player.name}`}>
      <div className={styles.head}>
        <span className={styles.title}>Trade {symbol}</span>
        <span className={styles.keys} title="Keyboard: B for buy, S for sell, Enter in the quantity box to confirm">
          <kbd>B</kbd> <kbd>S</kbd> <kbd>Enter</kbd>
        </span>
      </div>

      <SegmentedControl
        options={[
          { label: 'Buy', value: 'buy', color: 'buy' },
          { label: 'Sell', value: 'sell', color: 'sell' },
        ]}
        value={side}
        onChange={v => setSide(v as Side)}
      />

      <div className={styles.orderType}>Market order: fills now at the best available price</div>

      <QtyInput
        value={qtyText}
        onChange={setQtyText}
        inputRef={qtyRef}
        onKeyDown={onQtyKeyDown}
        max={buying ? undefined : held}
        invalid={qty === null}
      />

      <div className={styles.estimate}>
        <span className={styles.estimateLabel}>{buying ? 'Estimated cost' : 'Estimated proceeds'}</span>
        <span className={styles.estimateValue}>
          {est !== null && est.fillable_qty > 0 ? formatHOOP(est.total) : '—'}
          <span className={styles.unit}>HOOP</span>
        </span>
        <span className={styles.estimateSub}>
          {est !== null && est.est_avg_price !== null
            ? `about ${formatPrice(est.est_avg_price)} a share, fee included${estimate.approximate ? ' (rough: slippage not counted)' : ''}`
            : estimate.loading ? 'Working it out…' : ' '}
        </span>
      </div>

      <QuoteBox quote={quote} emphasise={buying ? 'ask' : 'bid'} />

      <dl className={styles.account}>
        <div>
          <dt>Cash free to spend</dt>
          <dd>{freeCash === null ? '—' : formatHOOP(freeCash)}</dd>
        </div>
        <div>
          <dt>You hold</dt>
          <dd>{portfolio === null ? '—' : `${formatQty(held)} ${symbol}`}</dd>
        </div>
      </dl>

      <div className={styles.messages} aria-live="polite">
        {blocker !== null && (
          <p className={`${styles.msg} ${styles.blocker}`}><span aria-hidden="true">⚠</span> {blocker}</p>
        )}
        {blocker === null && note !== null && (
          <p className={`${styles.msg} ${styles.note}`}><span aria-hidden="true">ℹ</span> {note}</p>
        )}
      </div>

      <Button
        variant={buying ? 'buy' : 'sell'}
        size="lg"
        fullWidth
        disabled={!canSubmit}
        onClick={() => void submit()}
      >
        {submitting
          ? 'Sending…'
          : `${buying ? 'Buy' : 'Sell'} ${qty !== null ? formatQty(qty) : ''} ${symbol}`}
      </Button>

      {result !== null && <OrderResult result={result} onDismiss={() => setResult(null)} />}
    </aside>
  )
}
