import { useId } from 'react'
import type { KeyboardEvent, RefObject } from 'react'
import { MAX_QTY, parseQty } from './qty'
import styles from './QtyInput.module.css'

const PRESETS = [10, 50, 100]

interface QtyInputProps {
  value: string
  onChange: (value: string) => void
  inputRef?: RefObject<HTMLInputElement | null>
  onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void
  /** Adds a "Max" preset, e.g. everything you hold when selling. */
  max?: number
  invalid?: boolean
}

/** Large quantity field with a stepper and one-tap presets. */
export default function QtyInput({ value, onChange, inputRef, onKeyDown, max, invalid }: QtyInputProps) {
  const id = useId()
  const current = parseQty(value)

  function step(delta: number) {
    const next = Math.min(MAX_QTY, Math.max(1, (current ?? 0) + delta))
    onChange(String(next))
  }

  return (
    <div className={styles.wrap} data-tour="ticket-qty">
      <label className={styles.label} htmlFor={id}>Quantity (shares)</label>
      <div className={`${styles.row} ${invalid ? styles.invalid : ''}`}>
        <button type="button" className={styles.step} onClick={() => step(-1)} aria-label="One share fewer">−</button>
        <input
          id={id}
          ref={inputRef}
          className={styles.input}
          inputMode="numeric"
          autoComplete="off"
          value={value}
          onChange={e => onChange(e.target.value.replace(/[^\d]/g, '').slice(0, 5))}
          onKeyDown={onKeyDown}
          aria-invalid={invalid || undefined}
        />
        <button type="button" className={styles.step} onClick={() => step(1)} aria-label="One share more">+</button>
      </div>
      <div className={styles.presets}>
        {PRESETS.map(n => (
          <button
            key={n}
            type="button"
            className={`${styles.preset} ${current === n ? styles.presetActive : ''}`}
            onClick={() => onChange(String(n))}
          >
            {n}
          </button>
        ))}
        {max !== undefined && max > 0 && (
          <button
            type="button"
            className={`${styles.preset} ${current === max ? styles.presetActive : ''}`}
            onClick={() => onChange(String(Math.min(max, MAX_QTY)))}
          >
            Max
          </button>
        )}
      </div>
    </div>
  )
}
