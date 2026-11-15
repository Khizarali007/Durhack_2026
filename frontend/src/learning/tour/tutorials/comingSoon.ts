import type { Tutorial } from '../types'

// These need screens that aren't built yet. They show as "Coming soon" cards.

export const composePortfolio: Tutorial = {
  id: 'compose-your-portfolio',
  number: 6,
  title: 'Compose your portfolio',
  summary: 'Spread your HOOP across teams and get graded A to F.',
  minutes: 3,
  teaches: ['Diversification', 'Equity'],
  missionNumber: 3,
  comingSoon: 'Needs the Composition panel (team mix and an A to F grade) on the Portfolio page.',
  recap: [],
  steps: [],
}

export const dangerZone: Tutorial = {
  id: 'danger-zone',
  number: 7,
  title: 'Danger zone',
  summary: 'Shorting and 3x leverage, and why they wipe out beginners.',
  minutes: 4,
  teaches: ['Short', 'Leverage', 'Margin call'],
  missionNumber: 6,
  comingSoon: 'Needs Short, Cover and 3x leverage on the order ticket.',
  recap: [],
  steps: [],
}
