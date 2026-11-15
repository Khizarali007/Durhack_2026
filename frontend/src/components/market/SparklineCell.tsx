interface SparklineCellProps {
  prices: number[]
}

const W = 60
const H = 20

export default function SparklineCell({ prices }: SparklineCellProps) {
  if (prices.length < 2) {
    return <span style={{ display: 'inline-block', width: W, height: H }} />
  }

  const min = Math.min(...prices)
  const max = Math.max(...prices)
  const range = max - min || 1

  const pts = prices
    .map((p, i) => {
      const x = (i / (prices.length - 1)) * W
      const y = (H - 2) - ((p - min) / range) * (H - 2) + 1
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')

  const up = prices[prices.length - 1] >= prices[0]

  return (
    <svg width={W} height={H} style={{ display: 'block' }} aria-hidden="true">
      <polyline
        points={pts}
        fill="none"
        stroke={up ? 'var(--hs-color-up)' : 'var(--hs-color-down)'}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  )
}
