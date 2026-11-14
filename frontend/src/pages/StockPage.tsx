import { useParams } from 'react-router-dom'

export default function StockPage() {
  const { symbol } = useParams<{ symbol: string }>()

  return (
    <div style={{ padding: 'var(--hs-space-6)', overflowY: 'auto', flex: 1 }}>
      <h1 style={{ color: 'var(--hs-color-text-primary)', marginTop: 0 }}>
        {symbol ?? 'Stock'}
      </h1>
      <p style={{ color: 'var(--hs-color-text-secondary)' }}>
        Chart, player card, and order ticket coming in G1.
      </p>
    </div>
  )
}
