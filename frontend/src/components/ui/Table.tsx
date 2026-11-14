import type { ReactNode } from 'react'
import styles from './Table.module.css'

export interface TableColumn<T> {
  key: keyof T & string
  header: string
  numeric?: boolean
  render?: (value: T[keyof T & string], row: T) => ReactNode
}

export interface TableProps<T extends object> {
  columns: TableColumn<T>[]
  rows: T[]
  keyField: keyof T & string
}

export function Table<T extends object>({
  columns,
  rows,
  keyField,
}: TableProps<T>) {
  return (
    <table className={styles.table}>
      <thead>
        <tr>
          {columns.map((col) => (
            <th
              key={col.key}
              className={`${styles.th} ${col.numeric ? styles.numeric : ''}`}
            >
              {col.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={String(row[keyField])} className={styles.row}>
            {columns.map((col) => (
              <td
                key={col.key}
                className={`${styles.td} ${col.numeric ? styles.numeric : ''}`}
              >
                {col.render
                  ? col.render(row[col.key] as T[keyof T & string], row)
                  : String(row[col.key] ?? '')}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
