import { Tooltip } from '../components/ui'
import styles from './HelpTip.module.css'

export interface HelpTipProps {
  /** What the "?" explains, e.g. "Score". Read out with the text. */
  label: string
  text: string
}

/** A focusable "?" that shows a Person 3 Tooltip on hover and on keyboard focus. */
export function HelpTip({ label, text }: HelpTipProps) {
  return (
    <span className={styles.help}>
      <Tooltip content={text}>
        <button type="button" className={styles.trigger} aria-label={`${label}: ${text}`}>
          ?
        </button>
      </Tooltip>
    </span>
  )
}
