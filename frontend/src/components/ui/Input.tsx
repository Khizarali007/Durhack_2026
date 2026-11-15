import { useId } from 'react'
import type { ChangeEventHandler } from 'react'
import styles from './Input.module.css'

export interface InputProps {
  label: string
  value: string | number
  onChange: ChangeEventHandler<HTMLInputElement>
  type?: 'text' | 'number'
  unit?: string
  error?: string
  placeholder?: string
  disabled?: boolean
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
        />
        {unit && <span className={styles.unit}>{unit}</span>}
      </div>
      {error && <span className={styles.error}>{error}</span>}
    </div>
  )
}
