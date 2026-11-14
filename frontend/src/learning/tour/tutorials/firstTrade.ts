import type { Tutorial } from '../types'
import { heldQty, p, summariseTrades } from '../summary'
import { TICKET_CONFIRM, TICKET_SIDE } from './selectors'

const STOCK = '/stock/SGA'

export const firstTrade: Tutorial = {
  id: 'first-trade',
  number: 2,
  title: 'Your first trade',
  summary: 'Buy 5 shares of SGA, catch a hot streak, and sell for a profit.',
  minutes: 5,
  teaches: ['Ask', 'Bid', 'Market order', 'Fee', 'Fair value', 'Hot streak', 'Realised profit', 'Unrealised profit'],
  missionNumber: 1,
  recap: [
    'Found SGA in the market list',
    'Read his price, fair value and chart',
    'Bought 5 shares at the ask',
    'Rode a hot streak, then sold at the bid',
  ],
  steps: [
    {
      route: '/',
      target: 'nav-market',
      title: 'Find the market',
      body: 'All 300 players live on the Market page. Click Market in the menu.',
      complete: { type: 'navigate', path: '/market' },
    },
    {
      route: '/market',
      target: 'market-search',
      title: 'Search for a player',
      body: "Type SGA in the filter box. That's Shai Gilgeous-Alexander's ticker.",
      complete: { type: 'input', value: 'sga' },
    },
    {
      route: '/market',
      target: 'market-row-SGA',
      title: 'Open SGA',
      body: 'Click his row to open the trading screen.',
      complete: { type: 'navigate', path: STOCK },
    },
    {
      route: STOCK,
      target: 'stock-price',
      title: 'The price',
      body: (c) => `SGA last traded at ${p(c.quote('SGA')?.last)} HOOP. The price is simply the last trade, and it updates twice a second.`,
      complete: { type: 'next' },
    },
    {
      route: STOCK,
      target: 'stock-value-line',
      title: 'Price vs fair value',
      body: (c) =>
        `Fair value (${p(c.quote('SGA')?.fair_value)}) is what his games say he's worth. When the price sits above it, the gap is hype.`,
      complete: { type: 'next' },
    },
    {
      route: STOCK,
      target: 'stock-chart',
      title: 'The chart',
      body: 'Each candle is one stretch of trading: green closed higher than it opened, red lower. The last one is live, marked "now".',
      complete: { type: 'next' },
    },
    {
      route: STOCK,
      target: 'ticket',
      title: 'The order ticket',
      body: 'Everything you need to trade lives here, always on screen. It starts as a simple market order.',
      complete: { type: 'next' },
    },
    {
      route: STOCK,
      selector: TICKET_SIDE,
      title: 'Buy or sell',
      body: 'Buy is selected. Tip: B and S on your keyboard switch sides.',
      complete: { type: 'next' },
    },
    {
      route: STOCK,
      target: 'ticket-qty',
      title: 'How many shares',
      body: 'Type 5 in the quantity box. Small trades are perfect for learning.',
      complete: { type: 'input', value: '5' },
    },
    {
      route: STOCK,
      target: 'ticket-quote',
      title: 'Bid and ask',
      body: (c) => {
        const q = c.quote('SGA')
        return `You buy at the ask (${p(q?.ask)}) and sell at the bid (${p(q?.bid)}). The gap between them is the spread.`
      },
      complete: { type: 'next' },
    },
    {
      route: STOCK,
      selector: TICKET_CONFIRM,
      title: 'Buy 5 SGA',
      body: 'Press the green button. A market order fills straight away at the best price on offer.',
      complete: { type: 'order_filled', side: 'buy', symbol: 'SGA' },
      after: (c) =>
        c.trade
          ? `You bought ${c.trade.qty} SGA at ${p(c.trade.price)}: you paid the ask. The fee was ${p(c.trade.fee)} HOOP, and your cash in the header just dropped.`
          : 'Filled! Your cash in the header just dropped.',
    },
    {
      route: STOCK,
      target: 'ticket-result',
      title: 'What filled',
      body: 'The result shows the average price, the fee, and the estimate next to what actually happened.',
      complete: { type: 'next' },
    },
    {
      route: STOCK,
      target: 'stock-activity',
      title: 'Your position',
      body: 'Under the chart: your SGA shares, what you paid on average, and your profit or loss, live.',
      complete: { type: 'next' },
    },
    {
      route: STOCK,
      target: 'stock-tab-history',
      title: 'Your receipt',
      body: 'Click History to see the trade and its receipt.',
      complete: { type: 'click' },
      after: 'Every trade gets a Solana receipt: "settling" for a moment, then "confirmed". Trades never wait for it.',
    },
    {
      route: STOCK,
      target: 'nav-portfolio',
      title: 'Check your portfolio',
      body: 'Click Portfolio to see everything you own.',
      complete: { type: 'navigate', path: '/portfolio' },
    },
    {
      route: '/portfolio',
      target: 'portfolio-holdings',
      title: 'Your holdings',
      body: 'SGA is in your holdings now, priced live. Unrealised profit is profit on paper: it can still vanish.',
      complete: { type: 'next' },
    },
    {
      route: STOCK,
      target: 'stock-why-moved',
      title: 'Weather report',
      body: 'Something is brewing for SGA. Keep an eye on the "Why did it move?" line.',
      complete: {
        type: 'event',
        kind: 'hot_streak',
        symbol: 'SGA',
        moment: 'tutorial_sga_heat',
        fallback:
          'In the live market, hot streaks happen on their own. Watch this line for a hot streak headline, then carry on.',
      },
      after: (c) =>
        c.event
          ? `"${c.event.headline}" A hot streak lifts fair value, and the price follows it up.`
          : 'A hot streak lifts fair value, and the price follows it up.',
    },
    {
      route: STOCK,
      target: 'stock-price',
      title: 'Paper profit',
      body: (c) => {
        const s = summariseTrades(c.trades)
        return `SGA is at ${p(c.quote('SGA')?.last)} and you paid ${p(s.avgBuy)}. That profit only becomes real when you sell.`
      },
      complete: { type: 'next' },
    },
    {
      route: STOCK,
      selector: TICKET_SIDE,
      title: 'Switch to Sell',
      body: 'Click Sell (or press S).',
      complete: { type: 'click' },
    },
    {
      route: STOCK,
      target: 'ticket-qty',
      title: 'Sell everything',
      body: (c) => `Press Max, or type ${heldQty(c)}: that's every share you bought.`,
      complete: { type: 'input', value: (c) => heldQty(c) },
    },
    {
      route: STOCK,
      selector: TICKET_CONFIRM,
      title: 'Lock it in',
      body: 'Press the red button. A sell fills at the bid, the best price a buyer will pay.',
      complete: { type: 'order_filled', side: 'sell', symbol: 'SGA' },
      after: (c) => (c.trade ? `Sold ${c.trade.qty} SGA at ${p(c.trade.price)}, the bid.` : 'Sold!'),
    },
    {
      title: 'Closing bell',
      body: "That's the whole game: buy, wait for the move, sell before the hype cools.",
      complete: { type: 'next' },
    },
  ],
}
