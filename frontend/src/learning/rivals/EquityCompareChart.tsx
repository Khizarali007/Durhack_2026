import { useEffect, useRef } from 'react'
import { ColorType, createChart, LineSeries, PriceScaleMode } from 'lightweight-charts'
import type { IChartApi, ISeriesApi, UTCTimestamp } from 'lightweight-charts'
import { useThemeContext } from '../../context/useThemeContext'
import { readChartColors } from '../../utils/chartTheme'
import styles from './rivals.module.css'

interface Point {
  t: number
  equity: number
}

/** Rival vs you as % change from each start, so different account sizes compare fairly. */
export default function EquityCompareChart({ rival, you, rivalName }: { rival: Point[]; you: Point[]; rivalName: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const seriesRef = useRef<{ rival: ISeriesApi<'Line'>; you: ISeriesApi<'Line'> } | null>(null)
  const { theme, projector } = useThemeContext()

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const c = readChartColors()
    const chart = createChart(el, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: c.text, fontFamily: c.fontFamily, attributionLogo: false },
      grid: { vertLines: { color: c.grid }, horzLines: { color: c.grid } },
      rightPriceScale: { borderColor: c.border, mode: PriceScaleMode.Percentage },
      timeScale: { borderColor: c.border },
    })
    seriesRef.current = {
      rival: chart.addSeries(LineSeries, { color: c.series[1], lineWidth: 2, title: rivalName, priceLineVisible: false }),
      you: chart.addSeries(LineSeries, { color: c.series[0], lineWidth: 3, title: 'You', priceLineVisible: false }),
    }
    chartRef.current = chart
    return () => {
      chartRef.current = null
      seriesRef.current = null
      chart.remove()
    }
  }, [rivalName])

  useEffect(() => {
    const s = seriesRef.current
    if (!s) return
    const line = (points: Point[]) =>
      [...new Map(points.map((p) => [p.t, p.equity])).entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([t, equity]) => ({ time: t as UTCTimestamp, value: equity }))
    s.rival.setData(line(rival))
    s.you.setData(line(you))
    chartRef.current?.timeScale().fitContent()
  }, [rival, you])

  useEffect(() => {
    const chart = chartRef.current
    const s = seriesRef.current
    if (!chart || !s) return
    const c = readChartColors()
    chart.applyOptions({ layout: { textColor: c.text }, grid: { vertLines: { color: c.grid }, horzLines: { color: c.grid } } })
    s.rival.applyOptions({ color: c.series[1] })
    s.you.applyOptions({ color: c.series[0] })
  }, [theme, projector])

  return <div ref={ref} className={styles.equityChart} aria-label={`Equity, ${rivalName} vs you`} role="img" />
}
