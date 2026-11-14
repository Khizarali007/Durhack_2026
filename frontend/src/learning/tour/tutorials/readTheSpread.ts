import type { Tutorial } from '../types'
import { p } from '../summary'

const STOCK = '/stock/SGA'

export const readTheSpread: Tutorial = {
  id: 'read-the-spread',
  number: 3,
  title: 'Read the spread',
  summary: 'Bid, ask, the three market makers, and what a trade really costs.',
  minutes: 4,
  teaches: ['Bid', 'Ask', 'Spread', 'Market maker', 'Slippage', 'Fee', 'Limit order'],
  missionNumber: 2,
  recap: [
    'Compared the best bid and best ask',
    'Met the three market makers',
    'Opened the cost breakdown on a bigger order',
    'Saw how a limit order names its own price',
  ],
  steps: [
    {
      route: STOCK,
      target: 'ticket-best',
      title: 'Two prices, not one',
      body: (c) => {
        const q = c.quote('SGA')
        return `Best bid ${p(q?.bid)}: the most anyone will pay you. Best ask ${p(q?.ask)}: the cheapest anyone will sell to you.`
      },
      complete: { type: 'next' },
    },
    {
      route: STOCK,
      target: 'ticket-best',
      title: 'The spread',
      body: (c) => {
        const q = c.quote('SGA')
        if (q?.bid == null || q.ask == null) return 'The gap between bid and ask is the spread. You pay it every time you buy and then sell.'
        const gap = q.ask - q.bid
        return `The gap is ${p(gap)} HOOP a share (${((gap / q.ask) * 100).toFixed(1)}%). You pay it every time you buy and then sell.`
      },
      complete: { type: 'next' },
    },
    {
      route: STOCK,
      target: 'ticket-makers',
      title: 'Market makers',
      body: 'Three market makers quote both sides. Each one holds a limited pile of shares, so a big order eats through them.',
      complete: { type: 'next' },
    },
    {
      route: STOCK,
      target: 'ticket-qty',
      title: 'Try a bigger order',
      body: 'Type 100 in the quantity box. Nothing is bought until you confirm.',
      complete: { type: 'input', value: '100' },
    },
    {
      route: STOCK,
      target: 'ticket-breakdown',
      title: 'Cost breakdown',
      body: 'Click "Cost breakdown" to open it.',
      complete: { type: 'click' },
      after: 'Spread, slippage and fee: the three costs hiding inside every market order.',
    },
    {
      route: STOCK,
      target: 'ticket-breakdown',
      title: 'Slippage and fee',
      body: "Slippage appears when your order is bigger than the best maker's pile: the rest fills at worse prices. The 0.10% fee comes on top.",
      complete: { type: 'next' },
    },
    {
      route: STOCK,
      target: 'ticket-tab-limit',
      title: 'Limit orders',
      body: 'Click the Limit tab.',
      complete: { type: 'click' },
      after: 'A limit order names your price. It waits for the market to come to you, and never pays more than your limit.',
    },
    {
      route: STOCK,
      target: 'ticket-price',
      title: 'Aim lower',
      body: 'The price starts at the ask. Press "Bid" to aim lower: you only buy if the price dips to you.',
      complete: { type: 'next' },
    },
    {
      route: STOCK,
      target: 'ticket-breakdown',
      title: 'No slippage',
      body: 'A limit fills at your price or better, or not at all. The trade-off: it might never fill. We won\'t place it today.',
      complete: { type: 'next' },
    },
    {
      title: 'Forecast: clearer costs',
      body: 'Check the spread before you click. In a hurry? Market order. Patient? Limit order.',
      complete: { type: 'next' },
    },
  ],
}
