// lightweight-charts draws on a canvas, so it cannot read CSS variables itself.
// These helpers read the current theme tokens; call them again whenever the
// theme or projector mode changes.

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

export interface ChartColors {
  text: string; textStrong: string; grid: string; border: string
  up: string; down: string; accent: string; accentMuted: string; warn: string
  /** Distinct series colours: [0] is the main price, the rest are compares. */
  series: string[]
  fontFamily: string; fontSize: number
}

export function readChartColors(): ChartColors {
  return {
    text: cssVar('--hs-color-text-secondary'),
    textStrong: cssVar('--hs-color-text-primary'),
    grid: cssVar('--hs-color-border-subtle'),
    border: cssVar('--hs-color-border'),
    up: cssVar('--hs-color-up'),
    down: cssVar('--hs-color-down'),
    accent: cssVar('--hs-color-accent'),
    accentMuted: cssVar('--hs-color-accent-muted'),
    warn: cssVar('--hs-color-warn'),
    series: [1, 2, 3, 4].map((i) => cssVar(`--hs-color-chart-${i}`)),
    fontFamily: cssVar('--hs-font-family') || 'system-ui, sans-serif',
    fontSize: parseInt(cssVar('--hs-font-size-sm'), 10) || 12,
  }
}
