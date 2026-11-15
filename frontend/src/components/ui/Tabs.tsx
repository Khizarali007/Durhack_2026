import styles from './Tabs.module.css'

export interface TabItem {
  label: string
  value: string
}

export interface TabsProps {
  tabs: TabItem[]
  value: string
  onChange: (value: string) => void
}

export function Tabs({ tabs, value, onChange }: TabsProps) {
  return (
    <div className={styles.tabList} role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.value}
          type="button"
          role="tab"
          aria-selected={tab.value === value}
          className={`${styles.tab} ${tab.value === value ? styles.active : ''}`}
          onClick={() => onChange(tab.value)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}
