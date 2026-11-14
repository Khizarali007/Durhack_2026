// THROWAWAY TEST SCAFFOLDING: plays Mission 1 against the dev backend
// (backend/learning/dev_app.py on :8001) using the reusable components.
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_API_BASE,
  MissionDebrief,
  MissionPanel,
  createLearningApi,
  useLearningSocket,
  useMission,
} from '@learning/index.js';
import '@learning/learning.css';
import './sandbox.css';

const API_BASE = import.meta.env.VITE_LEARNING_API || DEFAULT_API_BASE;
const START_CASH = 100_000;
const HISTORY = 120; // 60 s of 2 Hz ticks
const PLAYER = { symbol: 'SGA', name: 'Shai Gilgeous-Alexander', team: 'OKC', initials: 'SG', colour: '#007AC1', trim: '#EF3B24' };

const money = (x) => Number(x).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const signed = (x) => `${x > 0 ? '+' : x < 0 ? '−' : ''}${money(Math.abs(x))}`;

function Sparkline({ ticks }) {
  const w = 320;
  const h = 84;
  if (ticks.length < 2) return <div className="sbx-spark sbx-spark--empty">Waiting for ticks…</div>;
  const prices = ticks.map((t) => t.price);
  const lo = Math.min(...prices);
  const hi = Math.max(...prices);
  const span = hi - lo || 1;
  const pts = prices.map((p, i) => [(i / (prices.length - 1)) * w, h - 6 - ((p - lo) / span) * (h - 12)]);
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const [lx, ly] = pts[pts.length - 1];
  const up = prices[prices.length - 1] >= prices[0];
  return (
    <svg className={`sbx-spark ${up ? 'is-up' : 'is-down'}`} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" role="img" aria-label="Price over the last minute">
      <path className="sbx-spark__area" d={`${line} L${lx.toFixed(1)},${h} L0,${h} Z`} />
      <path className="sbx-spark__line" d={line} />
      <circle className="sbx-spark__dot" cx={lx} cy={ly} r="4" />
    </svg>
  );
}

export default function App() {
  const [userId] = useState(() => `guest_${Math.random().toString(36).slice(2, 8)}`);
  const api = useMemo(() => createLearningApi(API_BASE), []);
  const mission = useMission({ apiBase: API_BASE, userId });

  const [ticks, setTicks] = useState([]);
  const { status: wsStatus } = useLearningSocket({
    apiBase: API_BASE,
    userId,
    symbols: [PLAYER.symbol],
    onMessage: (msg) => {
      if (msg.type !== 'tick' || msg.symbol !== PLAYER.symbol) return;
      setTicks((prev) => (prev.length && prev[prev.length - 1].t === msg.t ? prev : [...prev.slice(-(HISTORY - 1)), msg]));
    },
  });
  const tick = ticks[ticks.length - 1];
  const first = ticks[0];

  const [portfolio, setPortfolio] = useState(null);
  const loadPortfolio = useCallback(() => api.mock.portfolio(userId).then(setPortfolio).catch(() => {}), [api, userId]);
  useEffect(() => {
    loadPortfolio();
    const id = setInterval(loadPortfolio, 1000);
    return () => clearInterval(id);
  }, [loadPortfolio]);

  const [qty, setQty] = useState(100);
  const [note, setNote] = useState(null);
  const order = async (side) => {
    try {
      const fill = await api.mock.order(userId, PLAYER.symbol, side, Number(qty));
      setNote({ ok: true, text: `${side === 'buy' ? 'Bought' : 'Sold'} ${fill.qty} ${fill.symbol} @ ${money(fill.price)} (fee ${money(fill.fee)})` });
    } catch (err) {
      setNote({ ok: false, text: err.message });
    }
    loadPortfolio();
  };

  const pos = portfolio?.positions.find((p) => p.symbol === PLAYER.symbol);
  const unrealised = pos && tick ? pos.qty * (tick.price - pos.avg_cost) : 0;
  const totalPnl = portfolio ? portfolio.equity - START_CASH : 0;
  const change = tick && first ? ((tick.price - first.price) / first.price) * 100 : 0;
  const maxBuy = tick && portfolio ? Math.floor(portfolio.cash / (tick.best_ask * 1.001)) : 0;

  return (
    <div className="sbx">
      <header className="sbx-head">
        <div>
          <p className="sbx-eyebrow">HoopStreet · learning sandbox (test only)</p>
          <h1>Trading floor</h1>
        </div>
        <p className="sbx-user">
          Playing as <strong>{userId}</strong>
          <span className={`sbx-ws sbx-ws--${wsStatus}`}>{wsStatus === 'open' ? 'live' : wsStatus}</span>
        </p>
      </header>

      {mission.error && <p className="sbx-banner">Backend: {mission.error}. Is dev_app.py running on {API_BASE}?</p>}

      <main className="sbx-grid">
        <div className="sbx-col">
          <section className="sbx-card sbx-quote">
            <div className="sbx-player">
              <span className="sbx-badge" style={{ '--team': PLAYER.colour, '--trim': PLAYER.trim }}>
                {PLAYER.initials}
              </span>
              <div>
                <p className="sbx-player__name">{PLAYER.name}</p>
                <p className="sbx-player__team">
                  <span className="sbx-dot" style={{ background: PLAYER.colour, borderColor: PLAYER.trim }} /> {PLAYER.team} · {PLAYER.symbol}
                </p>
              </div>
            </div>
            <div className="sbx-price-row">
              <p className="sbx-price" key={tick?.t}>
                {tick ? money(tick.price) : '--'}
                <span>HOOP</span>
              </p>
              <p className={`sbx-change ${change >= 0 ? 'is-up' : 'is-down'}`}>
                {change >= 0 ? '▲' : '▼'} {Math.abs(change).toFixed(2)}%
              </p>
            </div>
            <Sparkline ticks={ticks} />
            <dl className="sbx-book">
              <div>
                <dt>Bid</dt>
                <dd>{tick ? money(tick.best_bid) : '--'}</dd>
              </div>
              <div>
                <dt>Ask</dt>
                <dd>{tick ? money(tick.best_ask) : '--'}</dd>
              </div>
              <div>
                <dt>Fair value</dt>
                <dd>{tick ? money(tick.fair_value) : '--'}</dd>
              </div>
            </dl>
          </section>

          <section className="sbx-card">
            <h2>Order ticket</h2>
            <label className="sbx-qty">
              Quantity
              <input type="number" min="1" step="1" value={qty} onChange={(e) => setQty(e.target.value)} inputMode="numeric" />
            </label>
            <div className="sbx-trade">
              <button type="button" className="sbx-btn sbx-btn--buy" onClick={() => order('buy')} disabled={!(qty > 0)}>
                Buy
              </button>
              <button type="button" className="sbx-btn sbx-btn--sell" onClick={() => order('sell')} disabled={!(qty > 0) || !pos}>
                Sell
              </button>
            </div>
            <p className="sbx-small">
              Buys fill at the ask, sells at the bid, 0.10% fee. Max buy now: {maxBuy.toLocaleString()}
            </p>
            {note && <p className={`sbx-note ${note.ok ? 'is-ok' : 'is-err'}`}>{note.text}</p>}
          </section>

          <section className="sbx-card">
            <h2>Portfolio</h2>
            <dl className="sbx-stats">
              <div>
                <dt>Cash</dt>
                <dd>{portfolio ? money(portfolio.cash) : '--'}</dd>
              </div>
              <div>
                <dt>{PLAYER.symbol} position</dt>
                <dd>{pos ? `${pos.qty} @ ${money(pos.avg_cost)}` : 'none'}</dd>
              </div>
              <div>
                <dt>Unrealised P&amp;L</dt>
                <dd className={unrealised >= 0 ? 'is-up' : 'is-down'}>{signed(unrealised)}</dd>
              </div>
              <div>
                <dt>Total P&amp;L</dt>
                <dd className={totalPnl >= 0 ? 'is-up' : 'is-down'}>{signed(totalPnl)}</dd>
              </div>
            </dl>
          </section>
        </div>

        <div className="sbx-col">
          <MissionDebrief userId={userId} mission={mission} />
          <MissionPanel userId={userId} mission={mission} />
        </div>
      </main>
    </div>
  );
}
