import { useRadar } from '../../api'
import { Tooltip } from '../ui'

const RADAR_INFO = {
  calm:   { glyph: '☀', label: 'Calm',   color: 'var(--hs-color-up)' },
  cloudy: { glyph: '⛅', label: 'Cloudy', color: '#D29922' },
  storm:  { glyph: '⛈', label: 'Storm',  color: 'var(--hs-color-down)' },
} as const

interface RadarBadgeProps {
  symbol: string
}

export default function RadarBadge({ symbol }: RadarBadgeProps) {
  const state = useRadar(symbol)
  const { glyph, label, color } = RADAR_INFO[state]

  return (
    <Tooltip content={label}>
      <span
        style={{ color, fontSize: 'var(--hs-font-size-lg)', lineHeight: 1, cursor: 'default' }}
        aria-label={`Radar: ${label}`}
        role="img"
      >
        {glyph}
      </span>
    </Tooltip>
  )
}
