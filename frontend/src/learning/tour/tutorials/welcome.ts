import type { Tutorial } from '../types'

export const welcome: Tutorial = {
  id: 'welcome',
  number: 1,
  title: 'Welcome tour',
  summary: 'Your cash, your score, the market clock, and how to open a player.',
  minutes: 2,
  teaches: ['HOOP', 'Cash', 'Equity', 'Stock'],
  recap: [
    'Found your cash and equity in the header',
    'Learned how fast the market clock runs',
    'Opened a player from the top movers',
  ],
  steps: [
    {
      route: '/',
      title: 'Welcome to HoopStreet',
      body: 'Every NBA player here is a stock. You start with 100,000 HOOP of play money. This tour takes about two minutes.',
      complete: { type: 'next' },
    },
    {
      route: '/',
      target: 'header-cash',
      title: 'Your cash',
      body: "HOOP you haven't spent yet. Buying uses it up, selling brings it back.",
      complete: { type: 'next' },
    },
    {
      route: '/',
      target: 'header-equity',
      title: 'Your equity',
      body: 'Cash plus what your shares are worth right now. This is your real score.',
      complete: { type: 'next' },
    },
    {
      route: '/',
      target: 'header-clock',
      title: 'The market clock',
      body: 'The market runs 12 times faster than real life: one market minute every 5 seconds. Prices tick twice a second.',
      complete: { type: 'next' },
    },
    {
      route: '/',
      target: 'nav',
      title: 'The menu',
      body: 'Home, the full market, your portfolio, the leaderboard, and Learn, where these tutorials live.',
      complete: { type: 'next' },
    },
    {
      route: '/',
      target: 'home-movers',
      title: 'Top movers',
      body: 'The ten players moving most since the opening bell. Green climbed, red slid.',
      complete: { type: 'next' },
    },
    {
      route: '/',
      target: 'home-movers',
      title: 'Open a player',
      body: 'Click any player card to open their trading screen.',
      complete: { type: 'navigate', path: '/stock/', prefix: true },
    },
    {
      target: 'stock-price',
      title: 'A trading screen',
      body: 'Price, chart and the order ticket, all on one screen. The next tutorial walks you through your first trade.',
      complete: { type: 'next' },
    },
  ],
}
