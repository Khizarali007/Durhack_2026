import type { Tutorial } from '../types'
import { p } from '../summary'

const STOCK = '/stock/JOKIC'

function hypeLine(last: number | undefined, fair: number | undefined): string {
  if (last === undefined || fair === undefined || fair <= 0) return 'Hype is the gap between the two.'
  const hype = ((last - fair) / fair) * 100
  return `The gap is ${hype >= 0 ? '+' : ''}${hype.toFixed(1)}%: ${Math.abs(hype) < 1 ? 'about fair' : hype > 0 ? 'hype' : 'a discount'}.`
}

export const hypeVsFundamentals: Tutorial = {
  id: 'hype-vs-fundamentals',
  number: 4,
  title: 'Hype vs fundamentals',
  summary: 'Price vs fair value, the hype gap, and why prices move on news.',
  minutes: 3,
  teaches: ['Fair value', 'Hype', 'Hot streak', 'Volatility'],
  missionNumber: 4,
  recap: [
    'Compared price with fair value',
    'Read the hype gap',
    'Watched a headline move the price',
    'Found the news marker on the chart',
  ],
  steps: [
    {
      route: STOCK,
      target: 'stock-value-line',
      title: 'Two numbers',
      body: (c) => {
        const q = c.quote('JOKIC')
        return `Jokic trades at ${p(q?.last)}, but his games say he's worth ${p(q?.fair_value)}. ${hypeLine(q?.last, q?.fair_value)}`
      },
      complete: { type: 'next' },
    },
    {
      route: STOCK,
      target: 'stock-hype',
      title: 'Reading the gap',
      body: 'Above fair value shows in amber as hype. Below shows in blue as a discount. Within 1% reads "about fair".',
      complete: { type: 'next' },
    },
    {
      route: STOCK,
      target: 'stock-why-moved',
      title: 'News moves prices',
      body: 'A headline is about to land. Watch the "Why did it move?" line.',
      complete: {
        type: 'event',
        kind: 'trade_rumour',
        symbol: 'JOKIC',
        moment: 'tutorial_jokic_buzz',
        fallback: 'In the live market, headlines arrive on their own. When one lands, this line tells you what moved the price.',
      },
      after: (c) =>
        c.event
          ? `"${c.event.headline}" That's buzz, not a game: it moves the price on talk alone.`
          : "That's buzz, not a game: it moves the price on talk alone.",
    },
    {
      route: STOCK,
      target: 'stock-chart',
      title: 'News on the chart',
      body: 'Every headline leaves a marker on the chart. Hover one to read it again, or click to pin it.',
      complete: { type: 'next' },
    },
    {
      route: STOCK,
      target: 'stock-value-line',
      title: 'After the buzz',
      body: (c) => {
        const q = c.quote('JOKIC')
        return `Now: price ${p(q?.last)}, fair value ${p(q?.fair_value)}. Rumours fade; fair value comes from real games.`
      },
      complete: { type: 'next' },
    },
    {
      title: 'Forecast: check the gap',
      body: 'Before you buy, compare price with fair value. Buying deep into hype means paying for excitement.',
      complete: { type: 'next' },
    },
  ],
}
