import { useEffect, useMemo, useRef, useState } from 'react'
import { createChart, createSeriesMarkers, LineSeries, ColorType, LineStyle } from 'lightweight-charts'
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
import { readChartColors } from '../../utils/chartTheme'
import { useThemeContext } from '../../context/useThemeContext'
import { toDisplayCurrency, DISPLAY_PRICE_DECIMALS, DISPLAY_PRICE_TICK } from '../../utils/currency'
import styles from './PriceChart.module.css'

// Jonathan's chart design (labels, palette, toolbar, H$ display units) with Person 4's data flow:
// history loads once per selection and season session, live quotes only move today's point,
// zoom is kept until "Fit history", and missing compare players are ignored safely.

const COLORS = ['#45d6a5', '#6ba4ff', '#ffc770', '#d49bff']
const DAY = 86400
const PRICE_FORMAT = { type: 'price' as const, precision: DISPLAY_PRICE_DECIMALS, minMove: DISPLAY_PRICE_TICK }

/** One point per day: a time maps to the end of its day, the same stamp the day-close history uses. */
function dayKey(t: number): UTCTimestamp {
  return (Math.ceil(t / DAY) * DAY) as UTCTimestamp
}

function toLine(points: HistoryPoint[], pick: (p: HistoryPoint) => number | null) {
  const byDay = new Map<number, number | null>()
  for (const p of points) byDay.set(dayKey(p.t), pick(p))
  return [...byDay.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([time, value]) =>
      value == null ? { time: time as UTCTimestamp } : { time: time as UTCTimestamp, value: toDisplayCurrency(value) },
    )
}

function marker(ev: OfficialEvent | MarketEvent): SeriesMarker<Time> | null {
  const c = readChartColors()
  if (ev.kind === 'early_warning') return { time: dayKey(ev.t), position: 'aboveBar', shape: 'circle', color: c.warn, text: 'Injury watch' }
  if (ev.kind === 'injury') return { time: dayKey(ev.t), position: 'aboveBar', shape: 'arrowDown', color: c.down, text: 'Out' }
  return null
}

type Line = ISeriesApi<'Line'>

export default function PriceChart({ symbol }: { symbol: string; events?: MarketEvent[] }) {
  const ref = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const { players, bySymbol } = usePlayers()
  const { theme, projector } = useThemeContext()
  const [compare, setCompare] = useState<string[]>([])
  const [load, setLoad] = useState<{ key: string; status: 'ready' | 'empty' | 'error' } | null>(null)
  const name = (s: string) => bySymbol.get(s)?.name ?? s

  // Compare players that aren't in the roster (yet) are skipped instead of breaking the chart.
  const selection = useMemo(
    () => [symbol, ...compare.filter((s) => s !== symbol && bySymbol.has(s))].slice(0, 4),
    [symbol, compare, bySymbol],
  )
  const selectionKey = selection.join(',')
  const status = load !== null && load.key === selectionKey ? load.status : 'loading'

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const c = readChartColors()
    const chart = createChart(el, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: c.text },
      grid: { vertLines: { color: c.grid }, horzLines: { color: c.grid } },
      timeScale: { timeVisible: false },
    })
    chartRef.current = chart
    return () => {
      chartRef.current = null
      chart.remove()
    }
  }, [])

  useEffect(() => {
    const current = chartRef.current
    if (!current) return
    const chart: IChartApi = current
    const symbols = selectionKey.split(',')
    let alive = true
    let lastDay = 0
    let session = ''
    let reloadTimer: ReturnType<typeof setTimeout> | null = null

    const lines: Line[] = symbols.map((s, i) =>
      chart.addSeries(LineSeries, {
        color: COLORS[i],
        lineWidth: 2,
        title: bySymbol.get(s)?.name ?? s,
        priceLineVisible: false,
        priceFormat: PRICE_FORMAT,
      }),
    )
    const fair = chart.addSeries(LineSeries, {
      color: '#97a7bb',
      lineStyle: LineStyle.Dashed,
      lineWidth: 1,
      title: 'Analyst estimate',
      priceLineVisible: false,
      priceFormat: PRICE_FORMAT,
    })
    const markers: ISeriesMarkersPluginApi<Time> = createSeriesMarkers(lines[0], [])
    const events: (OfficialEvent | MarketEvent)[] = []
    const drawMarkers = () =>
      markers.setMarkers(
        events
          .filter((e) => e.symbol === symbols[0])
          .map(marker)
          .filter((m): m is SeriesMarker<Time> => m !== null)
          .sort((a, b) => (a.time as number) - (b.time as number)),
      )

    async function loadHistory() {
      try {
        const data = await getHistory(symbols)
        if (!alive) return
        let points = 0
        symbols.forEach((s, i) => {
          const line = toLine(data.history[s] ?? [], (p) => p.mid)
          lines[i].setData(line)
          points = Math.max(points, line.filter((p) => 'value' in p).length)
          if (i === 0) {
            fair.setData(toLine(data.history[s] ?? [], (p) => p.fair))
            lastDay = line.length ? line[line.length - 1].time : 0
          }
        })
        drawMarkers()
        setLoad({ key: selectionKey, status: points < 2 ? 'empty' : 'ready' })
        if (data.session_id !== session) {
          chart.timeScale().fitContent()
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
      .then((list) => {
        if (!alive) return
        events.push(...list)
        drawMarkers()
      })
      .catch(() => {
        /* Markers are optional. */
      })

    const unsubs = symbols.map((s, i) =>
      subscribeSymbol(s, (q) => {
        const key = dayKey(getLatestT())
        if (key < lastDay) return
        // The season plays continuously; after a jump of several days fetch the real closes.
        if (lastDay && key > lastDay + 2 * DAY) {
          scheduleReload()
          return
        }
        const mid = q.quoted_price ?? null
        lines[i].update(mid == null ? { time: key } : { time: key, value: toDisplayCurrency(mid) })
        if (i === 0) {
          fair.update({ time: key, value: toDisplayCurrency(q.fair_value) })
          lastDay = Math.max(lastDay, key)
        }
      }),
    )
    unsubs.push(
      subscribeEvents((ev) => {
        events.push(ev)
        drawMarkers()
      }),
    )
    unsubs.push(subscribeMarketReset(scheduleReload))

    return () => {
      alive = false
      if (reloadTimer !== null) clearTimeout(reloadTimer)
      unsubs.forEach((u) => u())
      if (chartRef.current === chart) {
        markers.detach()
        lines.forEach((l) => chart.removeSeries(l))
        chart.removeSeries(fair)
      }
    }
    // Names only label series; a roster refresh must not rebuild them (that would reset zoom).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectionKey])

  // Theme/projector: recolour in place, keep zoom.
  useEffect(() => {
    const c = readChartColors()
    chartRef.current?.applyOptions({
      layout: { textColor: c.text },
      grid: { vertLines: { color: c.grid }, horzLines: { color: c.grid } },
    })
  }, [theme, projector])

  return (
    <section className={styles.panel} aria-label={`${name(symbol)} price chart`} data-tour="stock-chart">
      <div className={styles.toolbar}>
        <span>Price · H$ · 1D</span>
        <button onClick={() => chartRef.current?.timeScale().fitContent()}>Fit history</button>
        <select
          aria-label="Compare another player"
          value=""
          onChange={(e) => {
            const pick = e.target.value
            if (pick) setCompare((old) => [...old.filter((x) => x !== pick), pick].slice(-3))
          }}
        >
          <option value="">Compare player…</option>
          {players
            .filter((p) => p.symbol !== symbol && !compare.includes(p.symbol))
            .map((p) => (
              <option key={p.symbol} value={p.symbol}>
                {p.name}
              </option>
            ))}
        </select>
        {compare.map((s) => (
          <button key={s} onClick={() => setCompare((old) => old.filter((x) => x !== s))}>
            {name(s)} ×
          </button>
        ))}
      </div>
      <div className={styles.chartBox}>
        <div ref={ref} className={styles.chart} />
        {status !== 'ready' && (
          <p className={styles.status} role="status">
            {status === 'loading' && 'Loading prices…'}
            {status === 'empty' && 'Prices appear here once the season is underway.'}
            {status === 'error' && 'Price history is unavailable. Reconnecting…'}
          </p>
        )}
      </div>
      <small title="Indicative bid/ask midpoint. Gaps indicate no two-sided quote. Scroll to zoom; drag to pan.">
        Midpoint price · Dashed line: analyst estimate
      </small>
      <a className={styles.credit} href="https://www.tradingview.com/lightweight-charts/" target="_blank" rel="noreferrer">
        Charts: TradingView Lightweight Charts™
      </a>
    </section>
  )
}
