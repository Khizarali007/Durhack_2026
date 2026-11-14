import type { Tutorial } from '../types'
import { heldQty, p, summariseTrades } from '../summary'
import { TICKET_CONFIRM } from './selectors'

const STOCK = '/stock/WEMBY'

export const surviveTheStorm: Tutorial = {
  id: 'survive-the-storm',
  number: 5,
  title: 'Survive the storm',
  summary: 'Spot an early warning, set a stop-loss, and let it sell for you.',
  minutes: 4,
  teaches: ['Early warning', 'Storm Radar', 'Stop-loss', 'Volatility'],
  missionNumber: 5,
  recap: [
    'Bought 5 WEMBY',
    'Spotted the early warning and the cloudy radar',
    'Set a stop-loss before the storm',
    'Let the stop-loss sell for you when the price gapped down',
  ],
  steps: [
    {
      route: STOCK,
      title: 'Storm drill',
      body: "You'll buy a little Wembanyama, then protect it with a stop-loss before the weather turns.",
      complete: { type: 'next' },
    },
    {
      route: STOCK,
      target: 'ticket-qty',
      title: 'Five shares',
      body: 'Type 5 in the quantity box.',
      complete: { type: 'input', value: '5' },
    },
    {
      route: STOCK,
      selector: TICKET_CONFIRM,
      title: 'Buy 5 WEMBY',
      body: 'Press the green button.',
      complete: { type: 'order_filled', side: 'buy', symbol: 'WEMBY' },
      after: (c) => (c.trade ? `You own ${c.trade.qty} WEMBY, bought at ${p(c.trade.price)}.` : 'You own 5 WEMBY.'),
    },
    {
      route: STOCK,
      target: 'stock-why-moved',
      title: 'Early warning',
      body: 'The forecast is changing. Watch this line.',
      complete: {
        type: 'event',
        kind: 'early_warning',
        symbol: 'WEMBY',
        moment: 'wemby_storm',
        fallback:
          'In the live market, early warnings arrive on their own, a few market minutes before a storm. This line is where they show up.',
      },
      after: (c) =>
        c.event
          ? `"${c.event.headline}" An early warning comes before a storm. Time to act, not to panic.`
          : 'An early warning comes before a storm. Time to act, not to panic.',
    },
    {
      route: STOCK,
      target: 'stock-identity',
      title: 'Storm Radar',
      body: 'The radar next to his name turns cloudy on a warning, and stormy when bad news lands.',
      complete: { type: 'next' },
    },
    {
      route: STOCK,
      target: 'ticket-tab-stop',
      title: 'The stop-loss tab',
      body: 'Click Stop-loss.',
      complete: { type: 'click' },
      after: 'A stop-loss sells automatically if the bid falls to your stop price. It starts 5% under the bid.',
    },
    {
      route: STOCK,
      target: 'ticket-qty',
      title: 'Shares to protect',
      body: (c) => `Set the quantity to ${heldQty(c)}: the shares you hold.`,
      complete: { type: 'input', value: (c) => heldQty(c) },
    },
    {
      route: STOCK,
      selector: TICKET_CONFIRM,
      title: 'Set the net',
      body: 'Press "Place stop-loss".',
      complete: { type: 'click' },
      after: 'Your stop-loss now waits in Open orders, watching the bid for you.',
    },
    {
      route: STOCK,
      target: 'stock-why-moved',
      title: 'Here comes the storm',
      body: 'Sit tight. The storm lands in under half a minute.',
      complete: {
        type: 'event',
        kind: 'injury',
        symbol: 'WEMBY',
        fallback: 'In the live market, storms come on their own. If one hits, your stop-loss sells for you.',
      },
      waitSeconds: 45,
      waitNote: 'Still clear? Storms keep their own schedule. Carry on: your stop-loss keeps watching.',
      after: (c) => (c.event ? `"${c.event.headline}" The price gaps down.` : 'The price gaps down.'),
    },
    {
      route: STOCK,
      target: 'stock-activity',
      title: 'Your safety net',
      body: 'Watch Your position: the stop-loss fires when the bid falls to your stop.',
      complete: { type: 'order_filled', side: 'sell', symbol: 'WEMBY', reason: 'stop' },
      waitSeconds: 30,
      waitNote: "Your stop hasn't fired: the bid never fell that far, or the stop went in after the drop. It stays in Open orders until it does.",
      after: (c) => {
        const now = c.quote('WEMBY')?.bid
        const s = summariseTrades(c.trades)
        const sold = c.trade ? `Stop-loss fired: sold ${c.trade.qty} at ${p(c.trade.price)}.` : 'Stop-loss fired.'
        return now != null && s.boughtQty > 0 ? `${sold} The bid is ${p(now)} now: the net caught you on the way down.` : sold
      },
    },
    {
      title: 'Storm survived',
      body: "A small loss you chose beats a big one you didn't. Set the net while the sky is still cloudy.",
      complete: { type: 'next' },
    },
  ],
}
