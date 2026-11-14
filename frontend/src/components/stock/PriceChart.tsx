import { useEffect, useRef, useState } from 'react'
import {
  createChart, createSeriesMarkers, CandlestickSeries, ColorType, CrosshairMode,
} from 'lightweight-charts'
import type {
  IChartApi, ISeriesApi, ISeriesMarkersPluginApi, MouseEventParams, SeriesMarker, Time, UTCTimestamp,
} from 'lightweight-charts'
import {
  getCandles, subscribeSymbol, subscribeMarketReset, getLatestT, candleBucket,
} from '../../api'
import type { CandleData, MarketEvent, MarketEventKind, Timeframe } from '../../api'
import { useThemeContext } from '../../context/useThemeContext'
import { readChartColors } from '../../utils/chartTheme'
import type { ChartColors } from '../../utils/chartTheme'
import { formatClock, formatPrice } from '../../utils/format'
import styles from './PriceChart.module.css'

const TIMEFRAMES: Timeframe[] = ['1m', '5m', '1h', '1d']
const TIMEFRAME_HINT: Record<Timeframe, string> = {
  '1m': 'One candle per market minute (5 real seconds)',
  '5m': 'One candle per 5 market minutes',
  '1h': 'One candle per market hour',
  '1d': 'One candle per market day',
}
/** Bars shown when a chart first opens. The rest of the month is a scroll away. */
const INITIAL_BARS = 90

const EVENT_STYLE: Record<MarketEventKind, { text: string; label: string; position: 'aboveBar' | 'belowBar'; shape: 'circle' | 'square' | 'arrowUp' | 'arrowDown'; color: keyof ChartColors }> = {
  early_warning: { text: 'Warning', label: 'Early warning', position: 'aboveBar', shape: 'circle', color: 'warn' },
  injury:        { text: 'Out', label: 'Ruled out', position: 'aboveBar', shape: 'arrowDown', color: 'down' },
  hot_streak:    { text: 'Hot', label: 'Hot streak', position: 'belowBar', shape: 'arrowUp', color: 'up' },
  rest_day:      { text: 'Rest', label: 'Rest day', position: 'aboveBar', shape: 'square', color: 'text' },
  trade_rumour:  { text: 'Rumour', label: 'Trade rumour', position: 'belowBar', shape: 'circle', color: 'accent' },
}

interface PriceChartProps {
  symbol: string
  /** Events for this stock, newest first. Each one becomes a marker on its candle. */
  events?: MarketEvent[]
}

interface MarkerTip { x: number; y: number; event: MarketEvent; pinned: boolean }

const NO_EVENTS: MarketEvent[] = []

/** Keeps only candles that are well-formed and strictly later than the one before. */
function cleanCandles(raw: CandleData[]): CandleData[] {
  const out: CandleData[] = []
  for (const c of raw) {
    if (c === null || typeof c !== 'object') continue
    const time = Math.floor(c.time)
    if (![time, c.open, c.high, c.low, c.close].every(Number.isFinite)) continue
    if (out.length > 0 && time <= out[out.length - 1].time) continue
    out.push({ time, open: c.open, high: c.high, low: c.low, close: c.close })
  }
  return out
}

function toBar(c: CandleData) {
  return { time: c.time as UTCTimestamp, open: c.open, high: c.high, low: c.low, close: c.close }
}

/**
 * Candlestick chart: a month of history plus the candle that is still forming.
 * History is loaded once per stock and timeframe; after that only the live
 * candle is touched, with `series.update()`.
 */
export default function PriceChart({ symbol, events = NO_EVENTS }: PriceChartProps) {
  const { theme, projector } = useThemeContext()
  const [timeframe, setTimeframe] = useState<Timeframe>('1m')
  const [epoch, setEpoch] = useState(0)
  const [loadedKey, setLoadedKey] = useState('')
  const [failedKey, setFailedKey] = useState('')
  const [liveTime, setLiveTime] = useState<number | null>(null)
  const [tip, setTip] = useState<MarkerTip | null>(null)

  const containerRef = useRef<HTMLDivElement>(null)
  const legendRef = useRef<HTMLSpanElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const markersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null)
  const firstTimeRef = useRef<number | null>(null)
  const liveRef = useRef<CandleData | null>(null)
  const hoverRef = useRef(false)
  const eventsByIdRef = useRef(new Map<string, MarketEvent>())
  const pinnedRef = useRef(false)

  const key = `${symbol}|${timeframe}|${epoch}`
  const loading = loadedKey !== key && failedKey !== key
  const failed = failedKey === key

  // --- Create the chart once ---
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const chart = createChart(el, {
      width: el.clientWidth,
      height: el.clientHeight,
      layout: { background: { type: ColorType.Solid, color: 'transparent' }, attributionLogo: false },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { scaleMargins: { top: 0.18, bottom: 0.12 } },
      timeScale: { rightOffset: 4, secondsVisible: false },
    })
    const series = chart.addSeries(CandlestickSeries, {
      priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
    })
    const markers = createSeriesMarkers<Time>(series, [])
    chartRef.current = chart
    seriesRef.current = series
    markersRef.current = markers

    const showLegend = (c: { open: number; high: number; low: number; close: number } | null) => {
      const node = legendRef.current
      if (!node) return
      node.textContent = c === null
        ? ''
        : `O ${formatPrice(c.open)}  H ${formatPrice(c.high)}  L ${formatPrice(c.low)}  C ${formatPrice(c.close)}`
    }

    const onMove = (param: MouseEventParams<Time>) => {
      const bar = param.seriesData.get(series) as { open: number; high: number; low: number; close: number } | undefined
      hoverRef.current = bar !== undefined
      showLegend(bar ?? liveRef.current)

      if (pinnedRef.current) return
      const hovered = typeof param.hoveredObjectId === 'string' ? eventsByIdRef.current.get(param.hoveredObjectId) : undefined
      if (hovered && param.point) {
        const { x, y } = param.point
        setTip(prev => (prev !== null && prev.event === hovered ? prev : { x, y, event: hovered, pinned: false }))
      } else {
        setTip(prev => (prev === null ? prev : null))
      }
    }
    const onClick = (param: MouseEventParams<Time>) => {
      const clicked = typeof param.hoveredObjectId === 'string' ? eventsByIdRef.current.get(param.hoveredObjectId) : undefined
      if (clicked && param.point) {
        pinnedRef.current = true
        setTip({ x: param.point.x, y: param.point.y, event: clicked, pinned: true })
      } else {
        pinnedRef.current = false
        setTip(null)
      }
    }
    chart.subscribeCrosshairMove(onMove)
    chart.subscribeClick(onClick)

    const ro = new ResizeObserver(() => {
      if (el.clientWidth > 0 && el.clientHeight > 0) chart.resize(el.clientWidth, el.clientHeight)
    })
    ro.observe(el)

    return () => {
      ro.disconnect()
      chart.unsubscribeCrosshairMove(onMove)
      chart.unsubscribeClick(onClick)
      chart.remove()
      chartRef.current = null
      seriesRef.current = null
      markersRef.current = null
    }
  }, [])

  // --- Colours come from the theme tokens, re-read when the theme or projector mode flips ---
  useEffect(() => {
    const chart = chartRef.current
    const series = seriesRef.current
    if (!chart || !series) return
    const c = readChartColors()
    chart.applyOptions({
      layout: { textColor: c.text, fontFamily: c.fontFamily, fontSize: c.fontSize },
      grid: { vertLines: { color: c.grid }, horzLines: { color: c.grid } },
      rightPriceScale: { borderColor: c.border },
      timeScale: { borderColor: c.border },
      crosshair: {
        vertLine: { color: c.text, labelBackgroundColor: c.border },
        horzLine: { color: c.text, labelBackgroundColor: c.border },
      },
    })
    series.applyOptions({
      upColor: c.up, borderUpColor: c.up, wickUpColor: c.up,
      downColor: c.down, borderDownColor: c.down, wickDownColor: c.down,
    })
  }, [theme, projector])

  // --- The director rewound the market: history has to be read again ---
  useEffect(() => subscribeMarketReset(() => setEpoch(e => e + 1)), [])

  // --- History once, then the live candle only ---
  useEffect(() => {
    const chart = chartRef.current
    const series = seriesRef.current
    if (!chart || !series) return
    const loadKey = `${symbol}|${timeframe}|${epoch}`
    let cancelled = false
    let ready = false

    liveRef.current = null
    firstTimeRef.current = null
    pinnedRef.current = false
    series.setData([])
    markersRef.current?.setMarkers([])
    chart.applyOptions({ timeScale: { timeVisible: timeframe !== '1d' } })

    const start = (candles: CandleData[]) => {
      if (cancelled) return
      series.setData(candles.map(toBar))
      const last = candles[candles.length - 1]
      liveRef.current = last ? { ...last } : null
      firstTimeRef.current = candles.length > 0 ? candles[0].time : null
      setLiveTime(last ? last.time : null)
      setTip(null)
      const n = candles.length
      if (n > 0) chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, n - INITIAL_BARS), to: n + 4 })
      ready = true
    }

    getCandles(symbol, timeframe)
      .then(raw => {
        start(cleanCandles(raw))
        if (!cancelled) setLoadedKey(loadKey)
      })
      .catch(() => {
        // No history: still draw live candles from the stream
        start([])
        if (!cancelled) setFailedKey(loadKey)
      })

    const off = subscribeSymbol(symbol, quote => {
      if (!ready || cancelled) return
      const bucket = candleBucket(getLatestT(), timeframe)
      const live = liveRef.current
      if (live !== null && bucket < live.time) return  // an old tick: never rewrite history

      let next: CandleData
      if (live !== null && bucket === live.time) {
        next = { ...live, high: Math.max(live.high, quote.last), low: Math.min(live.low, quote.last), close: quote.last }
      } else {
        const open = live !== null ? live.close : quote.last
        next = { time: bucket, open, high: Math.max(open, quote.last), low: Math.min(open, quote.last), close: quote.last }
        if (firstTimeRef.current === null) firstTimeRef.current = bucket
        setLiveTime(bucket)
      }
      liveRef.current = next
      try { series.update(toBar(next)) } catch { /* one bad tick must not take the chart down */ }
      if (!hoverRef.current && legendRef.current) {
        legendRef.current.textContent =
          `O ${formatPrice(next.open)}  H ${formatPrice(next.high)}  L ${formatPrice(next.low)}  C ${formatPrice(next.close)}`
      }
    })

    return () => {
      cancelled = true
      off()
    }
  }, [symbol, timeframe, epoch])

  // --- Markers: one per event, plus "now" on the candle that is still forming ---
  useEffect(() => {
    const plugin = markersRef.current
    if (!plugin) return
    const c = readChartColors()
    const byId = new Map<string, MarketEvent>()
    const markers: SeriesMarker<Time>[] = []
    const first = firstTimeRef.current

    if (liveTime !== null && first !== null) {
      events.forEach((ev, i) => {
        const time = candleBucket(ev.t, timeframe)
        if (time < first || time > liveTime) return
        const style = EVENT_STYLE[ev.kind]
        if (!style) return
        const id = `event-${ev.t}-${i}`
        byId.set(id, ev)
        markers.push({
          time: time as UTCTimestamp, position: style.position, shape: style.shape,
          color: String(c[style.color]), text: style.text, id,
        })
      })
    }
    if (liveTime !== null) {
      markers.push({
        time: liveTime as UTCTimestamp, position: 'aboveBar', shape: 'arrowDown',
        color: c.accent, text: 'now', id: 'now',
      })
    }
    markers.sort((a, b) => (a.time as number) - (b.time as number))
    eventsByIdRef.current = byId
    plugin.setMarkers(markers)
  }, [events, timeframe, liveTime, loadedKey, theme, projector])

  return (
    <section className={styles.panel} aria-label={`${symbol} price chart`} data-tour="stock-chart">
      <div className={styles.toolbar}>
        <div className={styles.timeframes} role="group" aria-label="Candle size">
          {TIMEFRAMES.map(tf => (
            <button
              key={tf}
              type="button"
              className={`${styles.tf} ${tf === timeframe ? styles.tfActive : ''}`}
              aria-pressed={tf === timeframe}
              title={TIMEFRAME_HINT[tf]}
              onClick={() => setTimeframe(tf)}
            >
              {tf}
            </button>
          ))}
        </div>
        <span ref={legendRef} className={styles.legend} />
        <span className={styles.status}>
          {loading ? 'Loading history…' : failed ? 'History unavailable: live candles only' : 'Month 1 history · live candle marked “now”'}
        </span>
      </div>

      <div className={styles.chartWrap}>
        <div ref={containerRef} className={styles.chart} />
        {tip !== null && (
          <div
            className={styles.tip}
            style={{ left: tip.x, top: tip.y }}
            role="status"
          >
            <div className={styles.tipKind}>
              {EVENT_STYLE[tip.event.kind]?.label ?? 'News'} · {formatClock(tip.event.t)}
            </div>
            <div className={styles.tipText}>{tip.event.headline}</div>
            {tip.pinned && <div className={styles.tipHint}>Click the chart to close</div>}
          </div>
        )}
      </div>

      <a
        className={styles.credit}
        href="https://www.tradingview.com/lightweight-charts/"
        target="_blank"
        rel="noreferrer"
      >
        Charts: TradingView Lightweight Charts™
      </a>
    </section>
  )
}
