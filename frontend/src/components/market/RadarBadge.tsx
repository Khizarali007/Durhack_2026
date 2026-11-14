import { useRadar } from '../../api'
import { Tooltip } from '../ui'
import { RADAR_INFO } from './radarInfo'

interface RadarBadgeProps {
  symbol: string
  /** Show the word next to the icon, so the state never relies on colour alone. */
  showLabel?: boolean
}

export default function RadarBadge({ symbol, showLabel = false }: RadarBadgeProps) {
  const state = useRadar(symbol)
  const { glyph, label, color, hint } = RADAR_INFO[state]

  return (
    <Tooltip content={hint}>
      <span
        style={{ color, display: 'inline-flex', alignItems: 'center', gap: 'var(--hs-space-1)', cursor: 'default' }}
        aria-label={`Storm Radar: ${label}`}
        role="img"
      >
        <span style={{ fontSize: 'var(--hs-font-size-lg)', lineHeight: 1 }}>{glyph}</span>
        {showLabel && (
          <span style={{ fontSize: 'var(--hs-font-size-xs)', fontWeight: 'var(--hs-font-weight-medium)' }}>{label}</span>
        )}
      </span>
    </Tooltip>
  )
}
