import type { ReactNode } from 'react'
import { formatHOOP } from '../../../utils/format'
import styles from '../OrderTicket.module.css'

export interface BreakdownLine {
  label: string
  /** HOOP amount, or null to show a dash. */
  value: number | null
  help?: ReactNode
}

interface CostBreakdownProps {
  lines: BreakdownLine[]
  totalLabel: string
  total: number | null
  footnote?: string
}

/** Spread, slippage and fee before you confirm. Collapsed by default: one line until you ask for more. */
export default function CostBreakdown({ lines, totalLabel, total, footnote }: CostBreakdownProps) {
  return (
    <details className={styles.breakdown} data-tour="ticket-breakdown">
      <summary>
        <span>Cost breakdown</span>
        <span className={styles.breakdownTotal}>{total === null ? '—' : formatHOOP(total)}</span>
      </summary>
      <dl className={styles.breakdownList}>
        {lines.map(line => (
          <div key={line.label}>
            <dt>{line.label} {line.help}</dt>
            <dd>{line.value === null ? '—' : formatHOOP(line.value)}</dd>
          </div>
        ))}
        <div className={styles.breakdownSum}>
          <dt>{totalLabel}</dt>
          <dd>{total === null ? '—' : formatHOOP(total)}</dd>
        </div>
      </dl>
      {footnote && <p className={styles.breakdownNote}>{footnote}</p>}
    </details>
  )
}
