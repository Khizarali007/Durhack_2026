import { formatHOOP, formatPrice } from '../utils/format'
import { useState } from 'react'
import { useQuote, useMarketTime, useRadar, useSession, placeOrder } from '../api'
import type { OrderOut } from '../api'

const SYMBOLS = ['SGA', 'JOKIC', 'TATUM', 'WEMBY', 'ANT']

function QuoteRow({ symbol }: { symbol: string }) {
  const quote = useQuote(symbol)
  const radar = useRadar(symbol)
  if (!quote) return <tr><td>{symbol}</td><td colSpan={5}>waiting…</td></tr>
  return (
    <tr>
      <td style={{ fontFamily: 'monospace' }}>{symbol}</td>
      <td style={{ fontVariantNumeric: 'tabular-nums' }}>{formatPrice(quote.last)}</td>
      <td style={{ fontVariantNumeric: 'tabular-nums' }}>{formatPrice(quote.fair_value)}</td>
      <td style={{ fontVariantNumeric: 'tabular-nums' }}>{quote.bid !== null ? formatPrice(quote.bid) : '—'}</td>
      <td style={{ fontVariantNumeric: 'tabular-nums' }}>{quote.ask !== null ? formatPrice(quote.ask) : '—'}</td>
      <td>{radar}</td>
    </tr>
  )
}

function formatMarketTime(t: number): string {
  const d = new Date(t * 1000)
  return d.toUTCString()
}

export default function DebugPage() {
  const { session, loading } = useSession()
  const marketT = useMarketTime()
  const [lastOrder, setLastOrder] = useState<OrderOut | null>(null)
  const [orderError, setOrderError] = useState<string | null>(null)

  async function handleBuy() {
    setOrderError(null)
    try {
      const result = await placeOrder({ symbol: 'SGA', side: 'buy', qty: 10 })
      setLastOrder(result)
    } catch (err) {
      setOrderError(String(err))
    }
  }

  return (
    <div style={{ padding: '24px', fontFamily: 'system-ui', maxWidth: '900px' }}>
      <h1>HoopStreet Debug</h1><p>Prices use H$. Raw JSON below uses API accounting units (1,000 = H$1).</p>

      <section>
        <h2>Session</h2>
        {loading && <p>Bootstrapping session…</p>}
        {session && (
          <p>
            user_id: <code>{session.user_id}</code> &nbsp;|&nbsp;
            cash: <strong>{formatHOOP(session.cash)}</strong>
          </p>
        )}
      </section>

      <section>
        <h2>Market clock</h2>
        <p style={{ fontVariantNumeric: 'tabular-nums' }}>{formatMarketTime(marketT)}</p>
      </section>

      <section>
        <h2>Live quotes</h2>
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left' }}>Symbol</th>
              <th>Last</th>
              <th>Fair value</th>
              <th>Bid</th>
              <th>Ask</th>
              <th>Radar</th>
            </tr>
          </thead>
          <tbody>
            {SYMBOLS.map(s => <QuoteRow key={s} symbol={s} />)}
          </tbody>
        </table>
      </section>

      <section>
        <h2>Orders</h2>
        <button
          onClick={handleBuy}
          disabled={loading || session === null}
          style={{ padding: '8px 16px', fontSize: '14px' }}
        >
          {loading ? 'Loading…' : 'Buy 10 SGA'}
        </button>
        {orderError && <p style={{ color: 'red' }}>{orderError}</p>}
        {lastOrder && (
          <pre style={{ background: '#111', color: '#eee', padding: '12px', marginTop: '8px', overflowX: 'auto' }}>
            {JSON.stringify(lastOrder, null, 2)}
          </pre>
        )}
      </section>
    </div>
  )
}
