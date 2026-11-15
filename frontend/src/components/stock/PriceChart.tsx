import { useEffect, useMemo, useRef, useState } from 'react'
import { ColorType, createChart, createSeriesMarkers, LineSeries, LineStyle, PriceScaleMode } from 'lightweight-charts'
import type { IChartApi, ISeriesApi, ISeriesMarkersPluginApi, SeriesMarker, Time, UTCTimestamp } from 'lightweight-charts'
import {
  getHistory,
  getLatestT,
  getOfficialEvents,
  subscribeEvents,
  subscribeMarketReset,
  subscribeSymbol,
  usePlayers,
} from '../../api'
import type { HistoryPoint, MarketEvent, OfficialEvent } from '../../api'
import { useThemeContext } from '../../context/useThemeContext'
import { readChartColors } from '../../utils/chartTheme'
import styles from './PriceChart.module.css'

const DAY = 86400
const MAX_COMPARE = 3
type Range = '1M' | '3M' | 'season'
const RANGES: { value: Range; label: string; days: number | null }[] = [
  { value: '1M', label: '1M', days: 30 },
  { value: '3M', label: '3M', days: 90 },
  { value: 'season', label: 'Season', days: null },
]

/**
 * One point per day: every time maps to the end of its day, the same timestamp the
 * day-close history point uses. A live quote during the day just moves today's point.
 */
function dayKey(t: number): UTCTimestamp {
  return (Math.ceil(t / DAY) * DAY) as UTCTimestamp
}

type Line = ISeriesApi<'Line'>

function toLine(points: HistoryPoint[], pick: (p: HistoryPoint) => number | null) {
  const byDay = new Map<number, number | null>()
  for (const p of points) byDay.set(dayKey(p.t), pick(p))
  return [...byDay.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([time, value]) => (value == null ? { time: time as UTCTimestamp } : { time: time as UTCTimestamp, value }))
}

function markerFor(ev: OfficialEvent | MarketEvent, colors: ReturnType<typeof readChartColors>): SeriesMarker<UTCTimestamp> | null {
  if (ev.kind === 'early_warning') {
    return { time: dayKey(ev.t), position: 'aboveBar', shape: 'circle', color: colors.warn, text: 'Warning' }
  }
  if (ev.kind === 'injury') {
    return { time: dayKey(ev.t), position: 'aboveBar', shape: 'arrowDown', color: colors.down, text: 'Storm' }
  }
  return null
}

/**
 * The stock chart: quoted midpoint as the main line, the analyst estimate dashed, up to three
 * compare players (shown as % change), and early-warning / storm markers. History is loaded once
 * per selection; live quotes only update today's point.
 */
export default function PriceChart({ symbol }: { symbol: string; events?: MarketEvent[] }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const { players, bySymbol } = usePlayers()
  const { theme, projector } = useThemeContext()
  const [compare, setCompare] = useState<string[]>([])
  const [range, setRange] = useState<Range>('season')
  const [load, setLoad] = useState<{ key: string; status: 'ready' | 'empty' | 'error' } | null>(null)
  const linesRef = useRef<Map<string, Line>>(new Map())
  const fairRef = useRef<Line | null>(null)
  const markersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null)

  const selection = useMemo(
    () => [symbol, ...compare.filter((s) => s !== symbol && bySymbol.has(s))].slice(0, MAX_COMPARE + 1),
    [symbol, compare, bySymbol],
  )
  const selectionKey = selection.join(',')
  const status = load !== null && load.key === selectionKey ? load.status : 'loading'

  // The chart object lives as long as the component; only series change with the selection.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const c = readChartColors()
    const chart = createChart(el, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: c.text,
        fontFamily: c.fontFamily,
        fontSize: c.fontSize,
        attributionLogo: false,
      },
      grid: { vertLines: { color: c.grid }, horzLines: { color: c.grid } },
      rightPriceScale: { borderColor: c.border },
      timeScale: { borderColor: c.border, timeVisible: false },
      crosshair: { vertLine: { color: c.border }, horzLine: { color: c.border } },
    })
    chartRef.current = chart
    return () => {
      chartRef.current = null
      linesRef.current = new Map()
      fairRef.current = null
      markersRef.current = null
      chart.remove()
    }
  }, [])

  // Series for the current selection: load history once, then follow live quotes.
  useEffect(() => {
    const current = chartRef.current
    if (!current) return
    const chart: IChartApi = current
    const symbols = selectionKey.split(',')
    const comparing = symbols.length > 1
    const c = readChartColors()
    let alive = true
    let lastHistoryDay = 0
    let reloadTimer: ReturnType<typeof setTimeout> | null = null
    let firstLoad = true
    let session = ''

    const lines = new Map<string, Line>()
    symbols.forEach((s, i) => {
      lines.set(
        s,
        chart.addSeries(LineSeries, {
          color: c.series[i] || c.accent,
          lineWidth: i === 0 ? 3 : 2,
          title: s,
          priceLineVisible: false,
          lastValueVisible: true,
        }),
      )
    })
    const fair = chart.addSeries(LineSeries, {
      color: c.text,
      lineStyle: LineStyle.Dashed,
      lineWidth: 1,
      title: 'Analyst estimate',
      priceLineVisible: false,
      visible: !comparing,
    })
    linesRef.current = lines
    fairRef.current = fair
    const main = lines.get(symbols[0])!
    const markers = createSeriesMarkers(main, [])
    markersRef.current = markers
    chart.priceScale('right').applyOptions({ mode: comparing ? PriceScaleMode.Percentage : PriceScaleMode.Normal })

    const officialEvents: (OfficialEvent | MarketEvent)[] = []
    const drawMarkers = () => {
      const colors = readChartColors()
      const list = officialEvents
        .filter((e) => e.symbol === symbols[0])
        .map((e) => markerFor(e, colors))
        .filter((m): m is SeriesMarker<UTCTimestamp> => m !== null)
        .sort((a, b) => a.time - b.time)
      markers.setMarkers(list)
    }

    async function loadHistory() {
      try {
        const data = await getHistory(symbols)
        if (!alive) return
        let points = 0
        for (const s of symbols) {
          const history = data.history[s] ?? []
          const line = toLine(history, (p) => p.mid)
          lines.get(s)?.setData(line)
          points = Math.max(points, line.filter((p) => 'value' in p).length)
          if (s === symbols[0]) {
            fair.setData(toLine(history, (p) => p.fair))
            lastHistoryDay = line.length ? line[line.length - 1].time : 0
          }
        }
        drawMarkers()
        setLoad({ key: selectionKey, status: points < 2 ? 'empty' : 'ready' })
        if (firstLoad || data.session_id !== session) {
          chart.timeScale().fitContent()
          firstLoad = false
          session = data.session_id
        }
      } catch {
        if (alive) setLoad({ key: selectionKey, status: 'error' })
      }
    }

    const scheduleReload = () => {
      if (reloadTimer !== null) return
      reloadTimer = setTimeout(() => {
        reloadTimer = null
        void loadHistory()
      }, 1500)
    }

    void loadHistory()
    getOfficialEvents()
      .then((evs) => {
        if (!alive) return
        officialEvents.push(...evs)
        drawMarkers()
      })
      .catch(() => {
        // Markers are a bonus; the chart works without them.
      })

    const unsubs = symbols.map((s) =>
      subscribeSymbol(s, (q) => {
        const key = dayKey(getLatestT())
        if (key < lastHistoryDay) return
        // A jump of several days: fetch the real closes instead of drawing one stretched line.
        if (lastHistoryDay && key > lastHistoryDay + 2 * DAY) {
          scheduleReload()
          return
        }
        const value = q.quoted_price ?? null
        lines.get(s)?.update(value == null ? { time: key } : { time: key, value })
        if (s === symbols[0]) {
          fair.update({ time: key, value: q.fair_value })
          lastHistoryDay = Math.max(lastHistoryDay, key)
        }
      }),
    )
    unsubs.push(
      subscribeEvents((ev) => {
        officialEvents.push(ev)
        drawMarkers()
      }),
    )
    unsubs.push(subscribeMarketReset(() => scheduleReload()))

    return () => {
      alive = false
      if (reloadTimer !== null) clearTimeout(reloadTimer)
      unsubs.forEach((u) => u())
      if (chartRef.current === chart) {
        markers.detach()
        for (const line of lines.values()) chart.removeSeries(line)
        chart.removeSeries(fair)
      }
    }
  }, [selectionKey])

  // Theme or projector mode: re-colour in place, never rebuild the chart.
  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return
    const c = readChartColors()
    chart.applyOptions({
      layout: { textColor: c.text, fontFamily: c.fontFamily, fontSize: c.fontSize },
      grid: { vertLines: { color: c.grid }, horzLines: { color: c.grid } },
      rightPriceScale: { borderColor: c.border },
      timeScale: { borderColor: c.border },
      crosshair: { vertLine: { color: c.border }, horzLine: { color: c.border } },
    })
    selection.forEach((s, i) => linesRef.current.get(s)?.applyOptions({ color: c.series[i] || c.accent }))
    fairRef.current?.applyOptions({ color: c.text })
  }, [theme, projector, selection])

  function applyRange(next: Range) {
    setRange(next)
    const chart = chartRef.current
    if (!chart) return
    const days = RANGES.find((r) => r.value === next)?.days ?? null
    if (days === null) {
      chart.timeScale().fitContent()
      return
    }
    const to = dayKey(getLatestT())
    chart.timeScale().setVisibleRange({ from: (to - days * DAY) as UTCTimestamp, to })
  }

  const colors = readChartColors()
  const options = players.filter((p) => p.symbol !== symbol && !compare.includes(p.symbol))

  return (
    <section className={styles.panel} aria-label={`${symbol} price chart`} data-tour="stock-chart">
      <div className={styles.toolbar}>
        <div className={styles.timeframes} role="group" aria-label="Chart range">
          {RANGES.map((r) => (
            <button
              key={r.value}
              type="button"
              className={`${styles.tf} ${range === r.value ? styles.tfActive : ''}`}
              aria-pressed={range === r.value}
              onClick={() => applyRange(r.value)}
            >
              {r.label}
            </button>
          ))}
          <button type="button" className={styles.tf} onClick={() => applyRange('season')} title="Show the whole season so far">
            Fit
          </button>
        </div>

        <ul className={styles.legendList} aria-label="Legend">
          {selection.map((s, i) => (
            <li key={s} className={styles.legendItem}>
              <span className={styles.swatch} style={{ background: colors.series[i] || colors.accent }} aria-hidden="true" />
              <span>{bySymbol.get(s)?.name ?? s}</span>
              {i > 0 && (
                <button
                  type="button"
                  className={styles.remove}
                  aria-label={`Stop comparing ${bySymbol.get(s)?.name ?? s}`}
                  onClick={() => setCompare((old) => old.filter((x) => x !== s))}
                >
                  ×
                </button>
              )}
            </li>
          ))}
          {selection.length === 1 && (
            <li className={styles.legendItem}>
              <span className={`${styles.swatch} ${styles.dashed}`} aria-hidden="true" />
              <span>Analyst estimate</span>
            </li>
          )}
        </ul>

        {compare.length < MAX_COMPARE && (
          <select
            className={styles.compare}
            aria-label="Compare another player"
            value=""
            onChange={(e) => {
              const pick = e.target.value
              if (pick) setCompare((old) => [...old.filter((x) => x !== pick), pick].slice(-MAX_COMPARE))
            }}
          >
            <option value="">Compare player…</option>
            {options.map((p) => (
              <option key={p.symbol} value={p.symbol}>
                {p.name}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className={styles.chartArea}>
        <div ref={containerRef} className={styles.chart} />
        {status !== 'ready' && (
          <div className={styles.overlay} role="status">
            {status === 'loading' && 'Loading the season so far…'}
            {status === 'empty' && 'The season has just started: the line fills in as days are played. Press Next day.'}
            {status === 'error' && 'Price history is unavailable right now. Retrying when the market reconnects.'}
          </div>
        )}
      </div>

      <p className={styles.footnote}>
        {selection.length > 1
          ? 'Comparing: lines show % change from the first visible day.'
          : 'Bid/ask midpoint, not an executable price. Gaps mean no two-sided quote.'}{' '}
        <span className={styles.markerKey}>● Warning = listed questionable/doubtful · ▼ Storm = ruled out.</span> Scroll to
        zoom, drag to pan.{' '}
        <a className={styles.credit} href="https://www.tradingview.com/lightweight-charts/" target="_blank" rel="noreferrer">
          Charts: TradingView Lightweight Charts™
        </a>
      </p>
    </section>
  )
}
