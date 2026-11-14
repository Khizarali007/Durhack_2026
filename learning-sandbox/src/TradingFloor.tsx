// THROWAWAY TEST SCAFFOLDING: plays Mission 1 against the dev backend
// (backend/learning/dev_app.py on :8001) using the real learning components.
import { useCallback, useEffect, useState } from 'react'
import type { TickMessage } from '@/api/learning'
import { MissionDebrief, MissionPanel } from '@/components/learning'
import type { MissionHandle } from '@/components/learning'
import { useLearningSocket } from '@/hooks/useLearningSocket'
import { Badge, Button, Card, Input, Pill, SegmentedControl } from '@/components/ui'
import { FlashValue } from './FlashValue'
import { Sparkline } from './Sparkline'
import { mockOrder, mockPortfolio } from './mockTrading'
import type { Portfolio } from './mockTrading'
import styles from './TradingFloor.module.css'

const START_CASH = 100_000
const HISTORY = 120 // 60 s of 2 Hz ticks
const FEE = 0.001
const PLAYER = { symbol: 'SGA', name: 'Shai Gilgeous-Alexander', team: 'OKC', initials: 'SGA', colour: '#007AC1' }

const money = (x: number) => x.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const signed = (x: number) => `${x > 0 ? '+' : x < 0 ? '−' : ''}${money(Math.abs(x))}`
const tone = (x: number) => (x > 0 ? 'up' : x < 0 ? 'down' : 'neutral')

export interface TradingFloorProps {
  apiBase: string
  userId: string
  mission: MissionHandle
}

export function TradingFloor({ apiBase, userId, mission }: TradingFloorProps) {
  const [ticks, setTicks] = useState<TickMessage[]>([])
  useLearningSocket({
    apiBase,
    userId,
    symbols: [PLAYER.symbol],
    onMessage: (msg) => {
      if (msg.type !== 'tick' || msg.symbol !== PLAYER.symbol) return
      setTicks((prev) => (prev.length && prev[prev.length - 1].t === msg.t ? prev : [...prev.slice(-(HISTORY - 1)), msg]))
    },
  })
  const tick = ticks.length ? ticks[ticks.length - 1] : null
  const first = ticks.length ? ticks[0] : null

  const [portfolio, setPortfolio] = useState<Portfolio | null>(null)
  const loadPortfolio = useCallback(
    () =>
      mockPortfolio(apiBase, userId)
        .then(setPortfolio)
        .catch(() => {}),
    [apiBase, userId],
  )
  useEffect(() => {
    const id = setInterval(() => void loadPortfolio(), 1000)
    void loadPortfolio()
    return () => clearInterval(id)
  }, [loadPortfolio])

  const [side, setSide] = useState<'buy' | 'sell'>('buy')
  const [qty, setQty] = useState('100')
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null)
  const qtyNum = Number(qty)
  const qtyOk = Number.isFinite(qtyNum) && qtyNum > 0

  const pos = portfolio?.positions.find((p) => p.symbol === PLAYER.symbol) ?? null
  const unrealised = pos && tick ? pos.qty * (tick.price - pos.avg_cost) : 0
  const totalPnl = portfolio ? portfolio.equity - START_CASH : 0
  const change = tick && first ? ((tick.price - first.price) / first.price) * 100 : 0
  const fillPrice = tick ? (side === 'buy' ? tick.best_ask : tick.best_bid) : null
  const estimate = fillPrice && qtyOk ? fillPrice * qtyNum * (side === 'buy' ? 1 + FEE : 1 - FEE) : null
  const shortCash = side === 'buy' && estimate != null && portfolio != null && estimate > portfolio.cash
  const tooMany = side === 'sell' && (!pos || qtyNum > pos.qty)

  const order = async () => {
    try {
      const fill = await mockOrder(apiBase, userId, PLAYER.symbol, side, qtyNum)
      setNote({
        ok: true,
        text: `${side === 'buy' ? 'Bought' : 'Sold'} ${fill.qty} ${fill.symbol} @ ${money(fill.price)} · fee ${money(fill.fee)}`,
      })
    } catch (err) {
      setNote({ ok: false, text: err instanceof Error ? err.message : String(err) })
    }
    void loadPortfolio()
  }

  return (
    <div className={styles.grid}>
      <div className={styles.left}>
        <Card padding="md" className={styles.stack}>
          <div className={styles.player}>
            <Badge initials={PLAYER.initials} color={PLAYER.colour} size="lg" />
            <div>
              <p className={styles.name}>{PLAYER.name}</p>
              <p className={styles.team}>
                {PLAYER.team} · {PLAYER.symbol}
              </p>
            </div>
          </div>
          <div className={styles.priceRow}>
            <FlashValue value={tick?.price} className={styles.priceBox}>
              <span className={`num ${styles.price}`}>{tick ? money(tick.price) : '--'}</span>
              <span className={styles.unit}>HOOP</span>
            </FlashValue>
            <Pill variant={tone(change)}>
              <span className="num">{signed(change)}%</span>
            </Pill>
          </div>
          <Sparkline prices={ticks.map((t) => t.price)} />
          <dl className={styles.book}>
            <div>
              <dt className="label">Bid</dt>
              <dd className="num">{tick ? money(tick.best_bid) : '--'}</dd>
            </div>
            <div>
              <dt className="label">Ask</dt>
              <dd className="num">{tick ? money(tick.best_ask) : '--'}</dd>
            </div>
            <div>
              <dt className="label">Fair value</dt>
              <dd className="num">{tick ? money(tick.fair_value) : '--'}</dd>
            </div>
          </dl>
        </Card>

        <Card padding="md" className={styles.stack}>
          <h2 className={`label ${styles.h}`}>Order ticket</h2>
          <SegmentedControl
            options={[
              { label: 'Buy', value: 'buy', color: 'buy' },
              { label: 'Sell', value: 'sell', color: 'sell' },
            ]}
            value={side}
            onChange={(v) => setSide(v === 'sell' ? 'sell' : 'buy')}
          />
          <Input
            label="Quantity"
            type="number"
            unit="shares"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            error={!qtyOk ? 'Enter a whole number above 0' : shortCash ? 'Not enough cash' : undefined}
          />
          <div className={styles.estimate}>
            <span className="label">Estimated {side === 'buy' ? 'cost' : 'proceeds'}</span>
            <span className={`num ${styles.estimateValue}`}>{estimate != null ? `${money(estimate)} HOOP` : '--'}</span>
            <span className={styles.small}>
              Market order at the {side === 'buy' ? 'ask' : 'bid'}, 0.10% fee included.
            </span>
          </div>
          <Button variant={side} size="lg" fullWidth onClick={() => void order()} disabled={!qtyOk || shortCash || tooMany || !tick}>
            {side === 'buy' ? 'Buy' : 'Sell'} {qtyOk ? qtyNum : ''} {PLAYER.symbol}
          </Button>
          {note && (
            <p className={`${styles.note} ${note.ok ? styles.ok : styles.err}`} role="status">
              {note.text}
            </p>
          )}
        </Card>

        <Card padding="md" className={styles.stack}>
          <h2 className={`label ${styles.h}`}>Portfolio</h2>
          <dl className={`${styles.book} ${styles.stats}`}>
            <div>
              <dt className="label">Cash</dt>
              <dd className="num">{portfolio ? money(portfolio.cash) : '--'}</dd>
            </div>
            <div>
              <dt className="label">{PLAYER.symbol}</dt>
              <dd className="num">{pos ? `${pos.qty} @ ${money(pos.avg_cost)}` : 'none'}</dd>
            </div>
            <div>
              <dt className="label">Unrealised</dt>
              <dd className={`num ${styles[tone(unrealised)] ?? ''}`}>
                <FlashValue value={Math.round(unrealised * 100)}>{signed(unrealised)}</FlashValue>
              </dd>
            </div>
            <div>
              <dt className="label">Total P&amp;L</dt>
              <dd className={`num ${styles[tone(totalPnl)] ?? ''}`}>
                <FlashValue value={Math.round(totalPnl * 100)}>{signed(totalPnl)}</FlashValue>
              </dd>
            </div>
          </dl>
        </Card>
      </div>

      <div className={styles.centre}>
        <MissionPanel userId={userId} mission={mission} />
      </div>

      <div className={styles.right}>
        <MissionDebrief userId={userId} mission={mission} />
        {!mission.result && (
          <Card padding="md">
            <p className={styles.small}>The debrief lands here when the closing bell rings.</p>
          </Card>
        )}
      </div>
    </div>
  )
}
