import styles from './SegmentedControl.module.css'

export interface SegmentOption {
  label: string
  value: string
  color?: 'buy' | 'sell' | 'default'
}

export interface SegmentedControlProps {
  options: [SegmentOption, SegmentOption]
  value: string
  onChange: (value: string) => void
}

export function SegmentedControl({ options, value, onChange }: SegmentedControlProps) {
  return (
    <div className={styles.root}>
      {options.map((opt) => {
        const isActive = opt.value === value
        const colorClass =
          opt.color === 'buy'
            ? styles.colorBuy
            : opt.color === 'sell'
              ? styles.colorSell
              : styles.colorDefault

        const cls = [styles.option, isActive ? styles.active : '', isActive ? colorClass : '']
          .filter(Boolean)
          .join(' ')

        return (
          <button key={opt.value} type="button" className={cls} onClick={() => onChange(opt.value)}>
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
