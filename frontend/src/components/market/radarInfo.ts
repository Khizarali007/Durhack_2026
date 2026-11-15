import type { RadarState } from '../../api'

/** Icon, word and colour for each Storm Radar state. Always show the word or a tooltip with the icon. */
export const RADAR_INFO: Record<RadarState, { glyph: string; label: string; color: string; hint: string }> = {
  calm:   { glyph: '☀', label: 'Calm',   color: 'var(--hs-color-up)',   hint: 'Calm: not listed on the official injury report' },
  cloudy: { glyph: '⛅', label: 'Cloudy', color: 'var(--hs-color-warn)', hint: 'Early warning: listed questionable or doubtful. Check your exposure before the storm' },
  storm:  { glyph: '⛈', label: 'Storm',  color: 'var(--hs-color-down)', hint: 'Storm: ruled out on the official report, so expected payouts drop' },
}
