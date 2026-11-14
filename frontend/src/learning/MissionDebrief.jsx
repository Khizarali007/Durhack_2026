import { useState } from 'react';
import { useMission } from './useMission.js';

const HEADLINES = {
  passed_great: { icon: '☀️', title: 'Mission passed!', sub: 'Sunshine all round. You caught the move.' },
  passed_ok: { icon: '⛅', title: 'Mission passed', sub: 'Profit in the bag.' },
  still_holding: { icon: '🌦️', title: 'Not passed yet', sub: 'Still holding at the bell.' },
  sold_at_loss: { icon: '🌧️', title: 'Not passed', sub: 'Sold for less than you paid.' },
  never_bought: { icon: '☁️', title: 'Not passed', sub: 'Your cash stayed on the bench.' },
};

const price = (x) => (x == null ? '-' : Number(x).toFixed(2));
const hoop = (x) =>
  `${x > 0 ? '+' : x < 0 ? '−' : ''}${Math.abs(x).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} HOOP`;

export function tradeSummary(r) {
  const best =
    r.best_entry_price != null && r.best_exit_price != null
      ? `Best possible was ${price(r.best_entry_price)} to ${price(r.best_exit_price)}.`
      : '';
  let you;
  if (r.entry_price == null) you = "You didn't buy.";
  else if (r.exit_price == null) you = `You bought at ${price(r.entry_price)} and were still holding at the bell.`;
  else you = `You bought at ${price(r.entry_price)}, sold at ${price(r.exit_price)}.`;
  return [you, best].filter(Boolean).join(' ');
}

function ScoreRing({ score }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const s = Math.max(0, Math.min(100, score || 0));
  return (
    <div className="hs-learn-score" role="img" aria-label={`Score ${s} out of 100`}>
      <svg viewBox="0 0 120 120" aria-hidden="true">
        <circle className="hs-learn-score__track" cx="60" cy="60" r={r} />
        <circle
          className="hs-learn-score__fill"
          cx="60"
          cy="60"
          r={r}
          strokeDasharray={c}
          strokeDashoffset={c * (1 - s / 100)}
          transform="rotate(-90 60 60)"
        />
      </svg>
      <div className="hs-learn-score__num">
        {s}
        <span>/100</span>
      </div>
    </div>
  );
}

/** Pure view: give it a result object from GET /learning/missions/result. */
export function MissionDebriefView({ result, entry, nextMission, busy, onRetry, onNext, onClose, className }) {
  const head = HEADLINES[result.outcome] || { icon: '📋', title: result.passed ? 'Passed' : 'Not passed', sub: '' };
  const pnl = result.realised_pnl || 0;
  return (
    <section
      className={['hs-learn', 'hs-learn-debrief', result.passed ? 'is-pass' : 'is-fail', className].filter(Boolean).join(' ')}
      aria-label="Mission debrief"
    >
      <header className="hs-learn-debrief__head">
        <span className="hs-learn-debrief__icon" aria-hidden="true">
          {head.icon}
        </span>
        <div>
          <p className="hs-learn-eyebrow">
            Debrief · Mission {result.mission_number}
            {entry ? `: ${entry.title}` : ''}
          </p>
          <h2 className="hs-learn-debrief__verdict">{head.title}</h2>
          <p className="hs-learn-debrief__sub">
            {result.state === 'stopped' ? 'Mission stopped early. ' : ''}
            {head.sub}
          </p>
        </div>
        {onClose && (
          <button type="button" className="hs-learn-close" onClick={onClose} aria-label="Close debrief">
            ×
          </button>
        )}
      </header>

      <div className="hs-learn-debrief__body">
        <ScoreRing score={result.score} />
        <div className="hs-learn-debrief__numbers">
          <p className="hs-learn-debrief__trades">{tradeSummary(result)}</p>
          {result.qty_sold > 0 && (
            <p className={['hs-learn-pnl', pnl >= 0 ? 'is-up' : 'is-down'].join(' ')}>
              Realised profit: {hoop(pnl)}
              {result.return_pct != null && ` (${result.return_pct > 0 ? '+' : ''}${result.return_pct.toFixed(1)}%)`}
            </p>
          )}
        </div>
      </div>

      {result.debrief && <p className="hs-learn-debrief__text">{result.debrief}</p>}

      {result.lesson && (
        <aside className="hs-learn-lesson">
          <span className="hs-learn-eyebrow">Today&apos;s forecast</span>
          <p>{result.lesson}</p>
        </aside>
      )}

      <div className="hs-learn-actions">
        <button type="button" className="hs-learn-btn hs-learn-btn--go" onClick={onRetry} disabled={busy || !onRetry}>
          Retry
        </button>
        <button
          type="button"
          className="hs-learn-btn hs-learn-btn--ghost"
          onClick={onNext}
          disabled={busy || !onNext || !nextMission}
        >
          {nextMission ? `Next: ${nextMission.title}` : 'Next mission coming soon'}
        </button>
      </div>
    </section>
  );
}

/**
 * MissionDebrief: appears when the user's mission ends, hidden otherwise.
 *
 * Props:
 *   userId    (required) player id
 *   apiBase   backend base URL, default http://localhost:8001
 *   mission   optional shared object from useMission()
 *   onRetry(result)       override Retry (default: restart the same mission)
 *   onNext(nextMission)   override Next (default: start the next available mission)
 *   dismissible           show a close button (default true)
 */
export function MissionDebrief({ userId, apiBase, mission: shared, onRetry, onNext, dismissible = true, className }) {
  const own = useMission({ apiBase, userId, enabled: !shared });
  const m = shared || own;
  const [dismissedKey, setDismissedKey] = useState(null);
  const { result, status } = m;

  if (!result || status?.state === 'running') return null;
  const key = `${result.mission_id}:${result.end_t}`;
  if (dismissedKey === key) return null;

  const entry = m.missions.find((x) => x.id === result.mission_id) || null;
  const next = m.missions.find((x) => x.available && entry && x.number > entry.number) || null;

  return (
    <MissionDebriefView
      result={result}
      entry={entry}
      nextMission={next}
      busy={m.busy}
      className={className}
      onRetry={() => (onRetry ? onRetry(result) : m.start(result.mission_id))}
      onNext={next ? () => (onNext ? onNext(next) : m.start(next.id)) : undefined}
      onClose={dismissible ? () => setDismissedKey(key) : undefined}
    />
  );
}

export default MissionDebrief;
