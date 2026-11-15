import { useState } from 'react'
import type { ReactNode } from 'react'
import { useTheme } from '../hooks/useTheme'
import {
  Button,
  SegmentedControl,
  Card,
  Badge,
  Pill,
  Tabs,
  Input,
  Tooltip,
  Table,
} from '../components/ui'
import type { TableColumn } from '../components/ui'

/* ---- Section wrapper ---- */
function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} style={{ marginBottom: 'var(--hs-space-12)' }}>
      <h2
        style={{
          margin: '0 0 var(--hs-space-6)',
          paddingBottom: 'var(--hs-space-3)',
          borderBottom: '1px solid var(--hs-color-border)',
          fontSize: 'var(--hs-font-size-2xl)',
          fontWeight: 600,
          color: 'var(--hs-color-text-primary)',
        }}
      >
        {title}
      </h2>
      {children}
    </section>
  )
}

/* ---- Row helper ---- */
function Row({ gap = 'var(--hs-space-3)', children }: { gap?: string; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap }}>
      {children}
    </div>
  )
}

/* ---- Flash demo box ---- */
function FlashBox({ direction }: { direction: 'up' | 'down' }) {
  const [count, setCount] = useState(0)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--hs-space-3)' }}>
      <div
        key={count}
        className={
          count > 0 ? (direction === 'up' ? 'flash-up' : 'flash-down') : undefined
        }
        style={{
          padding: 'var(--hs-space-5) var(--hs-space-8)',
          borderRadius: 'var(--hs-radius-lg)',
          border: '1px solid var(--hs-color-border)',
          fontVariantNumeric: 'tabular-nums',
          color: direction === 'up' ? 'var(--hs-color-up-text)' : 'var(--hs-color-down-text)',
          fontSize: 'var(--hs-font-size-xl)',
          fontWeight: 500,
          minWidth: '120px',
          textAlign: 'center' as const,
        }}
      >
        {direction === 'up' ? '+2.42%' : '−1.18%'}
      </div>
      <Button variant="ghost" size="sm" onClick={() => setCount((c) => c + 1)}>
        Fire {direction === 'up' ? 'Up' : 'Down'} Flash
      </Button>
    </div>
  )
}

/* ---- Colour swatches ---- */
const SWATCHES = [
  { token: '--hs-color-bg-page', label: 'bg-page' },
  { token: '--hs-color-bg-panel', label: 'bg-panel' },
  { token: '--hs-color-bg-panel-raised', label: 'bg-raised' },
  { token: '--hs-color-bg-hover', label: 'bg-hover' },
  { token: '--hs-color-border', label: 'border' },
  { token: '--hs-color-border-subtle', label: 'border-subtle' },
  { token: '--hs-color-text-primary', label: 'text-primary' },
  { token: '--hs-color-text-secondary', label: 'text-secondary' },
  { token: '--hs-color-text-disabled', label: 'text-disabled' },
  { token: '--hs-color-accent', label: 'accent' },
  { token: '--hs-color-accent-muted', label: 'accent-muted' },
  { token: '--hs-color-up', label: 'up' },
  { token: '--hs-color-up-muted', label: 'up-muted' },
  { token: '--hs-color-down', label: 'down' },
  { token: '--hs-color-down-muted', label: 'down-muted' },
  { token: '--hs-color-neutral-muted', label: 'neutral-muted' },
]

/* ---- Table data ---- */
interface PlayerRow {
  player: string
  price: string
  change: number
}

const TABLE_ROWS: PlayerRow[] = [
  { player: 'Stephen Curry', price: '142.50', change: 3.2 },
  { player: 'LeBron James', price: '118.00', change: -1.8 },
  { player: 'Victor Wembanyama', price: '95.75', change: 0.0 },
  { player: 'Nikola Jokić', price: '134.20', change: 2.1 },
  { player: 'Luka Dončić', price: '128.90', change: -4.3 },
]

const TABLE_COLUMNS: TableColumn<PlayerRow>[] = [
  { key: 'player', header: 'Player' },
  { key: 'price', header: 'Price (HOOP)', numeric: true },
  {
    key: 'change',
    header: '% Change',
    numeric: true,
    render: (val) => {
      const v = val as number
      return (
        <Pill variant={v > 0 ? 'up' : v < 0 ? 'down' : 'neutral'}>
          {v > 0 ? `+${v.toFixed(1)}%` : `${v.toFixed(1)}%`}
        </Pill>
      )
    },
  },
]

/* ---- Page ---- */
export default function StyleguidePage() {
  const { theme, toggleTheme } = useTheme()

  const [buySell, setBuySell] = useState('buy')
  const [segDefault, setSegDefault] = useState('a')
  const [activeTab, setActiveTab] = useState('positions')
  const [inputText, setInputText] = useState('')
  const [inputQty, setInputQty] = useState('')
  const [inputErr, setInputErr] = useState('')

  return (
    <div
      style={{
        maxWidth: '960px',
        margin: '0 auto',
        padding: '0 var(--hs-space-8) var(--hs-space-12)',
      }}
    >
      {/* Sticky top bar */}
      <div
        style={{
          position: 'sticky',
          top: 0,
          background: 'var(--hs-color-bg-page)',
          borderBottom: '1px solid var(--hs-color-border)',
          padding: 'var(--hs-space-4) 0',
          marginBottom: 'var(--hs-space-8)',
          zIndex: 10,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <span
          style={{
            fontSize: 'var(--hs-font-size-xl)',
            fontWeight: 600,
            color: 'var(--hs-color-text-primary)',
          }}
        >
          HoopStreet Styleguide
        </span>
        <Button variant="ghost" size="sm" onClick={toggleTheme}>
          {theme === 'dark' ? '☀ Light' : '☾ Dark'}
        </Button>
      </div>

      {/* 1. Colours */}
      <Section id="colours" title="Colours">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--hs-space-4)' }}>
          {SWATCHES.map(({ token, label }) => (
            <div key={token} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--hs-space-1)' }}>
              <div
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: 'var(--hs-radius-lg)',
                  border: '1px solid var(--hs-color-border)',
                  background: `var(${token})`,
                }}
              />
              <code
                style={{
                  fontSize: 'var(--hs-font-size-xs)',
                  color: 'var(--hs-color-text-secondary)',
                  textAlign: 'center' as const,
                  maxWidth: 80,
                  wordBreak: 'break-all' as const,
                }}
              >
                {label}
              </code>
            </div>
          ))}
        </div>
      </Section>

      {/* 2. Typography */}
      <Section id="typography" title="Typography">
        {(
          [
            { size: 'xs', px: '11px' },
            { size: 'sm', px: '12px' },
            { size: 'md', px: '14px' },
            { size: 'lg', px: '16px' },
            { size: 'xl', px: '20px' },
            { size: '2xl', px: '24px' },
            { size: '3xl', px: '32px' },
          ] as const
        ).map(({ size, px }) => (
          <div
            key={size}
            style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: 'var(--hs-space-4)',
              marginBottom: 'var(--hs-space-3)',
              borderBottom: '1px solid var(--hs-color-border-subtle)',
              paddingBottom: 'var(--hs-space-3)',
            }}
          >
            <span
              style={{
                width: 60,
                flexShrink: 0,
                fontSize: 'var(--hs-font-size-xs)',
                color: 'var(--hs-color-text-secondary)',
                textTransform: 'uppercase' as const,
                letterSpacing: 'var(--hs-letter-spacing-label)',
              }}
            >
              {size} · {px}
            </span>
            <span
              className="num"
              style={{
                fontSize: `var(--hs-font-size-${size})`,
                color: 'var(--hs-color-text-primary)',
              }}
            >
              The quick brown fox · 142.50 +3.2%
            </span>
          </div>
        ))}
      </Section>

      {/* 3. Spacing & Radii */}
      <Section id="spacing" title="Spacing &amp; Radii">
        <Row>
          {[1, 2, 3, 4, 5, 6, 8, 10, 12].map((n) => (
            <div key={n} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <div
                style={{
                  width: `var(--hs-space-${n})`,
                  height: `var(--hs-space-${n})`,
                  background: 'var(--hs-color-accent)',
                  borderRadius: 2,
                }}
              />
              <span style={{ fontSize: 'var(--hs-font-size-xs)', color: 'var(--hs-color-text-secondary)' }}>
                {n}
              </span>
            </div>
          ))}
        </Row>
        <Row gap="var(--hs-space-4)" >
          {(['sm', 'md', 'lg', 'xl', 'pill'] as const).map((r) => (
            <div key={r} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, marginTop: 'var(--hs-space-4)' }}>
              <div
                style={{
                  width: 56,
                  height: 32,
                  background: 'var(--hs-color-accent-muted)',
                  border: '1px solid var(--hs-color-accent)',
                  borderRadius: `var(--hs-radius-${r})`,
                }}
              />
              <span style={{ fontSize: 'var(--hs-font-size-xs)', color: 'var(--hs-color-text-secondary)' }}>
                {r}
              </span>
            </div>
          ))}
        </Row>
      </Section>

      {/* 4. Button */}
      <Section id="button" title="Button">
        {(['primary', 'ghost', 'buy', 'sell'] as const).map((variant) => (
          <div key={variant} style={{ marginBottom: 'var(--hs-space-4)' }}>
            <div style={{ fontSize: 'var(--hs-font-size-xs)', color: 'var(--hs-color-text-secondary)', marginBottom: 'var(--hs-space-2)', textTransform: 'uppercase' as const, letterSpacing: 'var(--hs-letter-spacing-label)' }}>
              {variant}
            </div>
            <Row>
              <Button variant={variant} size="sm">{variant} sm</Button>
              <Button variant={variant} size="md">{variant} md</Button>
              <Button variant={variant} size="lg">{variant} lg</Button>
              <Button variant={variant} disabled>disabled</Button>
            </Row>
          </div>
        ))}
        <div style={{ marginTop: 'var(--hs-space-4)', maxWidth: 320 }}>
          <Button variant="primary" fullWidth>Full Width</Button>
        </div>
        <div style={{ marginTop: 'var(--hs-space-3)', maxWidth: 320 }}>
          <Button variant="buy" size="lg" fullWidth>Confirm Buy · 142.50 HOOP</Button>
        </div>
      </Section>

      {/* 5. SegmentedControl */}
      <Section id="segmented" title="SegmentedControl">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--hs-space-5)', maxWidth: 320 }}>
          <SegmentedControl
            options={[
              { label: 'Buy', value: 'buy', color: 'buy' },
              { label: 'Sell', value: 'sell', color: 'sell' },
            ]}
            value={buySell}
            onChange={setBuySell}
          />
          <SegmentedControl
            options={[
              { label: 'Option A', value: 'a' },
              { label: 'Option B', value: 'b' },
            ]}
            value={segDefault}
            onChange={setSegDefault}
          />
        </div>
      </Section>

      {/* 6. Card */}
      <Section id="card" title="Card">
        <Row gap="var(--hs-space-4)">
          <Card style={{ flex: '1 1 240px' }}>
            <p style={{ margin: 0, color: 'var(--hs-color-text-primary)' }}>Default card with medium padding.</p>
          </Card>
          <Card raised style={{ flex: '1 1 240px' }}>
            <p style={{ margin: 0, color: 'var(--hs-color-text-primary)' }}>Raised card — one step lighter background.</p>
          </Card>
          <Card padding="lg" style={{ flex: '1 1 240px' }}>
            <p style={{ margin: 0, color: 'var(--hs-color-text-primary)' }}>Large padding card.</p>
          </Card>
          <Card padding="none" style={{ flex: '1 1 240px' }}>
            <p style={{ margin: 0, padding: 'var(--hs-space-4)', color: 'var(--hs-color-text-secondary)', fontSize: 'var(--hs-font-size-sm)' }}>No padding — content controls its own inset.</p>
          </Card>
        </Row>
      </Section>

      {/* 7. Badge */}
      <Section id="badge" title="Badge">
        <Row gap="var(--hs-space-5)">
          {[
            { initials: 'SC', color: '#FDB927', label: 'GSW' },
            { initials: 'LBJ', color: '#552583', label: 'LAL' },
            { initials: 'VW', color: '#C4CED4', label: 'SAS' },
            { initials: 'NJ', color: '#1D428A', label: 'DEN' },
          ].map(({ initials, color, label }) => (
            <div key={initials} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--hs-space-2)' }}>
              <Row gap="var(--hs-space-2)">
                <Badge initials={initials} color={color} size="sm" />
                <Badge initials={initials} color={color} size="md" />
                <Badge initials={initials} color={color} size="lg" />
              </Row>
              <span style={{ fontSize: 'var(--hs-font-size-xs)', color: 'var(--hs-color-text-secondary)' }}>
                {label} · {color}
              </span>
            </div>
          ))}
        </Row>
      </Section>

      {/* 8. Pill */}
      <Section id="pill" title="Pill">
        <Row>
          <Pill variant="up">+3.2%</Pill>
          <Pill variant="down">−1.8%</Pill>
          <Pill variant="neutral">0.0%</Pill>
          <Pill variant="accent">Live</Pill>
          <Pill variant="up">+142.50 HOOP</Pill>
          <Pill variant="down">−18.00 HOOP</Pill>
        </Row>
      </Section>

      {/* 9. Tabs */}
      <Section id="tabs" title="Tabs">
        <Tabs
          tabs={[
            { label: 'Positions', value: 'positions' },
            { label: 'Open Orders', value: 'orders' },
            { label: 'History', value: 'history' },
            { label: 'Receipts', value: 'receipts' },
          ]}
          value={activeTab}
          onChange={setActiveTab}
        />
        <div
          style={{
            padding: 'var(--hs-space-4)',
            color: 'var(--hs-color-text-secondary)',
            fontSize: 'var(--hs-font-size-sm)',
          }}
        >
          Active tab: <strong style={{ color: 'var(--hs-color-text-primary)' }}>{activeTab}</strong>
        </div>
        <div style={{ marginTop: 'var(--hs-space-4)' }}>
          <Tabs
            tabs={[
              { label: 'Market', value: 'market' },
              { label: 'Limit', value: 'limit' },
              { label: 'Stop-loss', value: 'stop' },
            ]}
            value="market"
            onChange={() => undefined}
          />
        </div>
      </Section>

      {/* 10. Input */}
      <Section id="input" title="Input">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--hs-space-5)', maxWidth: 320 }}>
          <Input
            label="Player search"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="e.g. Curry"
          />
          <Input
            label="Quantity"
            type="number"
            value={inputQty}
            onChange={(e) => setInputQty(e.target.value)}
            unit="HOOP"
            placeholder="0"
          />
          <Input
            label="Stop-loss price"
            type="number"
            value={inputErr}
            onChange={(e) => setInputErr(e.target.value)}
            unit="HOOP"
            error="Price must be below current market price"
            placeholder="0"
          />
          <Input
            label="Disabled"
            value="Read-only value"
            onChange={() => undefined}
            disabled
          />
        </div>
      </Section>

      {/* 11. Tooltip */}
      <Section id="tooltip" title="Tooltip">
        <Row gap="var(--hs-space-8)">
          <Tooltip content="The difference between the best buy and sell price. Higher spread = more cost to trade.">
            <span style={{ color: 'var(--hs-color-accent)', cursor: 'default', fontWeight: 500 }}>
              Spread ?
            </span>
          </Tooltip>
          <Tooltip content="Your order will execute at the best available price right now.">
            <Button variant="ghost" size="sm">Market order ?</Button>
          </Tooltip>
          <Tooltip content="+3.2% today">
            <Pill variant="up">+3.2%</Pill>
          </Tooltip>
          <Tooltip content="Slippage is the difference between expected and actual fill price, caused by order size and thin markets.">
            <span style={{ color: 'var(--hs-color-text-secondary)', cursor: 'default' }}>
              Slippage ?
            </span>
          </Tooltip>
        </Row>
      </Section>

      {/* 12. Table */}
      <Section id="table" title="Table">
        <Card padding="none">
          <Table<PlayerRow>
            columns={TABLE_COLUMNS}
            rows={TABLE_ROWS}
            keyField="player"
          />
        </Card>
      </Section>

      {/* 13. Flash animation */}
      <Section id="flash" title="Flash Animation">
        <Row gap="var(--hs-space-8)">
          <FlashBox direction="up" />
          <FlashBox direction="down" />
        </Row>
        <p style={{ color: 'var(--hs-color-text-secondary)', fontSize: 'var(--hs-font-size-sm)', marginTop: 'var(--hs-space-4)' }}>
          Clicking the button re-mounts the div with the flash class applied. Duration is{' '}
          <code style={{ color: 'var(--hs-color-text-primary)' }}>--hs-duration-flash</code> (200ms).
        </p>
      </Section>
    </div>
  )
}
