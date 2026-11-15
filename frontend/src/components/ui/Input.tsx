import { useId } from 'react'
import type { ChangeEventHandler } from 'react'
import styles from './Input.module.css'

export interface InputProps {
  label: string
  value: string | number
  onChange: ChangeEventHandler<HTMLInputElement>
  type?: 'text' | 'number' | 'password'
  unit?: string
  error?: string
  placeholder?: string
  disabled?: boolean
  /** Browser autofill hint, e.g. "username", "current-password", "new-password". */
  autoComplete?: string
  name?: string
}

export function Input({
  label,
  value,
  onChange,
  type = 'text',
  unit,
  error,
  placeholder,
  disabled = false,
  autoComplete,
  name,
}: InputProps) {
  const id = useId()

  return (
    <div className={styles.wrapper}>
      <label className={styles.label} htmlFor={id}>
        {label}
      </label>
      <div className={`${styles.inputRow} ${error ? styles.hasError : ''}`}>
        <input
          id={id}
          type={type}
          className={styles.input}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          disabled={disabled}
          autoComplete={autoComplete}
          name={name}
          aria-invalid={error ? true : undefined}
        />
        {unit && <span className={styles.unit}>{unit}</span>}
      </div>
      {error && <span className={styles.error}>{error}</span>}
    </div>
  )
}
