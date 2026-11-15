import type { RadarState } from '../../api'

/** Icon, word and colour for each Storm Radar state. Always show the word or a tooltip with the icon. */
export const RADAR_INFO: Record<RadarState, { glyph: string; label: string; color: string; hint: string }> = {
  calm:   { glyph: '☀', label: 'Calm',   color: 'var(--hs-color-up)',   hint: 'Calm: no news moving this player' },
  cloudy: { glyph: '⛅', label: 'Cloudy', color: 'var(--hs-color-warn)', hint: 'Cloudy: news is brewing, the price may jump' },
  storm:  { glyph: '⛈', label: 'Storm',  color: 'var(--hs-color-down)', hint: 'Storm: big news just hit, expect a rough ride' },
}
