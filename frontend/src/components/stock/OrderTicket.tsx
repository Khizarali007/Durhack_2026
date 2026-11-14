import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import {
  useQuote, usePortfolio, useReservedCash, useOrderQuote, useSession,
  placeOrder, placeOpenOrder, errorDetail, FEE_RATE,
} from '../../api'
import type { Player } from '../../api'
import { Button, SegmentedControl } from '../ui'
import { formatHOOP, formatPrice, formatQty } from '../../utils/format'
import QuoteBox from './ticket/QuoteBox'
import QtyInput from './ticket/QtyInput'
import OrderResult from './ticket/OrderResult'
import CostBreakdown from './ticket/CostBreakdown'
import type { BreakdownLine } from './ticket/CostBreakdown'
import { parseQty, parsePrice } from './ticket/qty'
import { checkTicket } from './ticket/validate'
import type { TicketResult } from './ticket/types'
import styles from './OrderTicket.module.css'

type Side = 'buy' | 'sell'
type Mode = 'market' | 'limit' | 'stop'

const MODES: { value: Mode; label: string }[] = [
  { value: 'market', label: 'Market' },
  { value: 'limit', label: 'Limit' },
  { value: 'stop', label: 'Stop-loss' },
]

const MODE_HINT: Record<Mode, string> = {
  market: 'Fills now at the best available price.',
  limit: 'Waits until the market reaches your price. It never pays more, or sells for less, than your limit.',
  stop: 'A safety net: sells your shares automatically if the bid falls to your stop price.',
}

interface OrderTicketProps {
  player: Player
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
}

function round2(x: number): number { return Math.round(x * 100) / 100 }

/** Right column of the trading screen. Starts as a simple market order; the rest sits behind tabs. */
export default function OrderTicket({ player }: OrderTicketProps) {
  const symbol = player.symbol
  const quote = useQuote(symbol)
  const { session } = useSession({ autoGuest: false })
  const { portfolio } = usePortfolio()
  const reserved = useReservedCash()

  const [side, setSide] = useState<Side>('buy')
  const [mode, setMode] = useState<Mode>('market')
  const [qtyText, setQtyText] = useState('10')
  const [priceText, setPriceText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<TicketResult | null>(null)
  const qtyRef = useRef<HTMLInputElement>(null)

  const qty = parseQty(qtyText)
  const price = parsePrice(priceText)
  const estimate = useOrderQuote(symbol, side, mode === 'market' ? qty : null)
  const est = mode === 'market' ? estimate.quote : null

  const positionQty = portfolio?.positions.find(p => p.symbol === symbol)?.qty ?? 0
  const held = Math.max(0, positionQty)
  const shortQty = Math.max(0, -positionQty)
  const freeCash = portfolio ? portfolio.cash - reserved : null
  const buying = side === 'buy'

  const { blocker, note } = checkTicket({
    signedIn: session !== null,
    accountLoaded: portfolio !== null,
    mode, side, symbol, qty, price, held, shortQty, freeCash, quote,
    estimate: est,
    estimateError: mode === 'market' ? estimate.error : null,
  })
  const canSubmit = blocker === null && !submitting && qty !== null

  // --- What it will cost, per order type ---
  let headline: number | null
  let headlineLabel: string
  let headlineSub = ' '
  let lines: BreakdownLine[]
  let totalLabel: string
  let footnote: string | undefined

  if (mode === 'market') {
    const ok = est !== null && est.fillable_qty > 0
    headline = ok ? est.total : null
    headlineLabel = buying ? 'Estimated cost' : 'Estimated proceeds'
    if (est !== null && est.est_avg_price !== null) {
      headlineSub = `about ${formatPrice(est.est_avg_price)} a share, fee included${estimate.approximate ? ' (rough: slippage not counted)' : ''}`
    } else if (estimate.loading) {
      headlineSub = 'Working it out…'
    }
    lines = [
      { label: 'Spread', value: ok ? est.spread_cost : null },
      { label: 'Slippage', value: ok ? est.slippage : null },
      { label: 'Fee (0.10%)', value: ok ? est.fee : null },
    ]
    totalLabel = buying ? 'Total cost' : 'You receive'
    footnote = 'Spread and slippage are already inside the price you pay. The fee is added on top.'
  } else {
    const notional = qty !== null && price !== null ? qty * price : null
    const fee = notional === null ? null : round2(notional * FEE_RATE)
    const selling = mode === 'stop' || !buying
    headline = notional === null || fee === null ? null : selling ? notional - fee : notional + fee
    headlineLabel = mode === 'stop'
      ? 'Proceeds if it sells at your stop'
      : buying ? 'Cost if it fills at your limit' : 'Proceeds if it fills at your limit'
    headlineSub = mode === 'stop' ? 'nothing happens until the bid falls that far' : 'nothing happens until the price gets there'
    lines = [
      { label: mode === 'stop' ? 'Shares × stop price' : 'Shares × limit price', value: notional },
      { label: 'Fee (0.10%)', value: fee },
    ]
    totalLabel = selling ? 'You receive' : 'Cash set aside'
    footnote = mode === 'stop'
      ? 'A stop sells at the market once it triggers, so a sudden drop can fill below your stop.'
      : 'A limit order has no slippage: it fills at your price or better, or not at all.'
  }

  function selectMode(next: Mode) {
    setMode(next)
    if (next === 'stop') {
      setSide('sell')
      // A stop 5% under the bid is a sensible starting point
      setPriceText(quote?.bid != null ? round2(quote.bid * 0.95).toFixed(2) : '')
    } else if (next === 'limit') {
      const ref = side === 'buy' ? quote?.ask : quote?.bid
      setPriceText(ref != null ? ref.toFixed(2) : '')
    }
  }

  function selectSide(next: Side) {
    setSide(next)
    // A stop-loss is always a sell, so choosing Buy leaves that tab
    if (next === 'buy' && mode === 'stop') setMode('market')
  }

  async function submit() {
    if (!canSubmit || qty === null) return
    setSubmitting(true)
    try {
      if (mode === 'market') {
        const before = est
        const out = await placeOrder({ symbol, side, qty })
        setResult({ kind: 'filled', out, estimate: before })
      } else if (price !== null) {
        const order = await placeOpenOrder({ symbol, side: mode === 'stop' ? 'sell' : side, qty, type: mode, price })
        setResult({ kind: 'placed', order })
      }
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
      if (k === 'b') {
        e.preventDefault()
        setSide('buy')
        setMode(m => (m === 'stop' ? 'market' : m))
      } else if (k === 's') {
        e.preventDefault()
        setSide('sell')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  function onEnter(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      void submit()
    }
  }

  const confirmLabel = submitting
    ? 'Sending…'
    : mode === 'market'
      ? `${buying ? 'Buy' : 'Sell'} ${qty !== null ? formatQty(qty) : ''} ${symbol}`
      : mode === 'limit'
        ? `Place limit ${buying ? 'buy' : 'sell'}`
        : 'Place stop-loss'

  return (
    <aside className={styles.ticket} aria-label={`Order ticket for ${player.name}`} data-tour="ticket">
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
        onChange={v => selectSide(v as Side)}
      />

      <div className={styles.tabs} role="tablist" aria-label="Order type" data-tour="ticket-order-type">
        {MODES.map(m => (
          <button
            key={m.value}
            type="button"
            role="tab"
            aria-selected={mode === m.value}
            className={`${styles.tab} ${mode === m.value ? styles.tabActive : ''}`}
            data-tour={`ticket-tab-${m.value}`}
            onClick={() => selectMode(m.value)}
          >
            {m.label}
          </button>
        ))}
      </div>
      <p className={styles.tabHint}>{MODE_HINT[mode]}</p>

      <QtyInput
        value={qtyText}
        onChange={setQtyText}
        inputRef={qtyRef}
        onKeyDown={onEnter}
        max={buying ? undefined : held}
        invalid={qty === null}
      />

      {mode !== 'market' && (
        <div className={styles.field} data-tour="ticket-price">
          <label className={styles.fieldLabel} htmlFor="ticket-price">
            {mode === 'limit' ? 'Limit price' : 'Stop price'}
          </label>
          <div className={`${styles.priceRow} ${price === null ? styles.priceInvalid : ''}`}>
            <input
              id="ticket-price"
              className={styles.priceInput}
              inputMode="decimal"
              autoComplete="off"
              placeholder="0.00"
              value={priceText}
              onChange={e => setPriceText(e.target.value.replace(/[^\d.]/g, '').slice(0, 9))}
              onKeyDown={onEnter}
              aria-invalid={price === null || undefined}
            />
            {mode === 'limit' ? (
              <>
                <button type="button" className={styles.priceFill} onClick={() => quote?.bid != null && setPriceText(quote.bid.toFixed(2))}>Bid</button>
                <button type="button" className={styles.priceFill} onClick={() => quote?.ask != null && setPriceText(quote.ask.toFixed(2))}>Ask</button>
              </>
            ) : (
              <>
                <button type="button" className={styles.priceFill} onClick={() => quote?.bid != null && setPriceText(round2(quote.bid * 0.97).toFixed(2))}>−3%</button>
                <button type="button" className={styles.priceFill} onClick={() => quote?.bid != null && setPriceText(round2(quote.bid * 0.9).toFixed(2))}>−10%</button>
              </>
            )}
            <span className={styles.priceUnit}>HOOP</span>
          </div>
        </div>
      )}

      <div className={styles.estimate} data-tour="ticket-estimate">
        <span className={styles.estimateLabel}>{headlineLabel}</span>
        <span className={styles.estimateValue}>
          {headline !== null ? formatHOOP(headline) : '—'}
          <span className={styles.unit}>HOOP</span>
        </span>
        <span className={styles.estimateSub}>{headlineSub}</span>
      </div>

      <QuoteBox quote={quote} emphasise={buying ? 'ask' : 'bid'} />

      <CostBreakdown lines={lines} totalLabel={totalLabel} total={headline} footnote={footnote} />

      <dl className={styles.account} data-tour="ticket-account">
        <div>
          <dt>Cash free to spend</dt>
          <dd>{freeCash === null ? '—' : formatHOOP(freeCash)}</dd>
        </div>
        <div>
          <dt>Tied up in open orders</dt>
          <dd>{portfolio === null ? '—' : formatHOOP(reserved)}</dd>
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
        {confirmLabel}
      </Button>

      {result !== null && <OrderResult result={result} onDismiss={() => setResult(null)} />}
    </aside>
  )
}
