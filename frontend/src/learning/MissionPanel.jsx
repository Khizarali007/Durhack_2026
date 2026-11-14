import { useEffect, useState } from 'react';
import { useMission, useSecondsLeft } from './useMission.js';

// Weather-forecast styling for market headlines.
export const ALERTS = {
  hot_streak: { label: 'Heat advisory', icon: '🔥', tone: 'heat' },
  early_warning: { label: 'Weather watch', icon: '🌥️', tone: 'watch' },
  injury: { label: 'Storm warning', icon: '⛈️', tone: 'storm' },
  rest_day: { label: 'Calm spell', icon: '🌤️', tone: 'calm' },
  trade_rumour: { label: 'Fog advisory', icon: '🌫️', tone: 'fog' },
};

const STATE_LABEL = {
  idle: 'Ready',
  running: 'Live',
  completed: 'Passed',
  failed: 'Not passed',
  stopped: 'Stopped',
};

export function formatClock(seconds) {
  if (seconds == null) return '--:--';
  const s = Math.ceil(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function cx(...parts) {
  return parts.filter(Boolean).join(' ');
}

/**
 * MissionPanel: mission list + the active mission (goal, countdown, hints,
 * live feed, Start/Stop).
 *
 * Props:
 *   userId    (required) player id
 *   apiBase   backend base URL, default http://localhost:8001
 *   mission   optional object from useMission(); pass the same one to
 *             MissionDebrief to share one connection
 *   className extra class for the root
 */
export function MissionPanel({ userId, apiBase, mission: shared, className }) {
  const own = useMission({ apiBase, userId, enabled: !shared });
  const m = shared || own;
  const { missions, status, passedIds, busy, error, connection } = m;
  const [selectedId, setSelectedId] = useState(null);

  const state = status?.state || 'idle';
  const running = state === 'running';

  // Follow the server's active mission; otherwise default to the first available one.
  useEffect(() => {
    if (status?.mission_id) setSelectedId(status.mission_id);
  }, [status?.mission_id]);
  useEffect(() => {
    if (!selectedId && missions.length) setSelectedId((missions.find((x) => x.available) || missions[0]).id);
  }, [missions, selectedId]);

  const selected = missions.find((x) => x.id === selectedId) || null;
  const isActive = selected && status?.mission_id === selected.id;

  return (
    <section className={cx('hs-learn', 'hs-learn-panel', className)} aria-label="Missions">
      <header className="hs-learn-panel__head">
        <span className="hs-learn-eyebrow">Mission control</span>
        <span className={cx('hs-learn-conn', `hs-learn-conn--${connection}`)} title={`Live feed: ${connection}`}>
          <span className="hs-learn-conn__dot" aria-hidden="true" />
          {connection === 'open' ? 'Live' : connection === 'reconnecting' ? 'Reconnecting…' : 'Connecting…'}
        </span>
      </header>

      <MissionList
        missions={missions}
        selectedId={selectedId}
        activeId={status?.mission_id}
        activeState={state}
        passedIds={passedIds}
        disabled={running}
        onSelect={setSelectedId}
      />

      {selected && (
        <ActiveMission
          entry={selected}
          status={isActive ? status : null}
          fetchedAt={m.fetchedAt}
          busy={busy}
          canStart={selected.available && !running}
          onStart={() => m.start(selected.id)}
          onStop={m.stop}
        />
      )}

      {error && (
        <p className="hs-learn-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

export function MissionList({ missions, selectedId, activeId, activeState, passedIds, disabled, onSelect }) {
  if (!missions.length) return <p className="hs-learn-muted">Loading missions…</p>;
  return (
    <ol className="hs-learn-list">
      {missions.map((x) => {
        const locked = !x.available;
        const passed = passedIds?.has(x.id);
        const live = x.id === activeId && activeState === 'running';
        const chip = live ? 'Live' : passed ? 'Passed' : locked ? 'Locked' : 'Ready';
        return (
          <li key={x.id}>
            <button
              type="button"
              className={cx(
                'hs-learn-list__item',
                locked && 'is-locked',
                passed && 'is-passed',
                live && 'is-live',
                x.id === selectedId && 'is-selected',
              )}
              disabled={locked || (disabled && x.id !== activeId)}
              aria-current={x.id === selectedId ? 'true' : undefined}
              onClick={() => onSelect(x.id)}
            >
              <span className="hs-learn-list__num">{x.number}</span>
              <span className="hs-learn-list__title">{x.title}</span>
              <span className={cx('hs-learn-chip', `hs-learn-chip--${chip.toLowerCase()}`)}>
                {locked && <span aria-hidden="true">🔒 </span>}
                {passed && !live && <span aria-hidden="true">✓ </span>}
                {chip}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

function ActiveMission({ entry, status, fetchedAt, busy, canStart, onStart, onStop }) {
  const [hintOpen, setHintOpen] = useState(false);
  const secondsLeft = useSecondsLeft(status, fetchedAt);
  const state = status?.state || 'idle';
  const running = state === 'running';
  const duration = status?.duration_s || null;
  const progress = running && duration ? Math.min(1, 1 - secondsLeft / duration) : state === 'idle' ? 0 : 1;
  const hints = status?.hints || [];
  const feed = [...(status?.messages || [])].filter((msg) => msg.kind !== 'result').reverse();

  useEffect(() => {
    if (running) setHintOpen(false);
  }, [running, entry.id]);

  return (
    <article className={cx('hs-learn-mission', `is-${state}`)}>
      <div className="hs-learn-mission__top">
        <div>
          <p className="hs-learn-eyebrow">
            Mission {entry.number} · {STATE_LABEL[state] || state}
          </p>
          <h2 className="hs-learn-mission__title">{entry.title}</h2>
        </div>
        <div
          className={cx('hs-learn-clock', running && secondsLeft != null && secondsLeft <= 10 && 'is-urgent')}
          role="timer"
          aria-label="Time left"
        >
          {running ? formatClock(secondsLeft) : state === 'idle' ? formatClock(null) : '0:00'}
        </div>
      </div>

      <div className="hs-learn-progress" aria-hidden="true">
        <div className="hs-learn-progress__bar" style={{ transform: `scaleX(${progress})` }} />
      </div>

      <p className="hs-learn-goal">
        <span className="hs-learn-goal__label">Goal</span> {status?.goal || entry.goal}
      </p>

      <div className="hs-learn-actions">
        {running ? (
          <button type="button" className="hs-learn-btn hs-learn-btn--stop" onClick={onStop} disabled={busy}>
            Stop mission
          </button>
        ) : (
          <button type="button" className="hs-learn-btn hs-learn-btn--go" onClick={onStart} disabled={!canStart || busy}>
            {state === 'idle' ? 'Start mission' : 'Play again'}
          </button>
        )}
        {entry.available && entry.hint && entry.hint !== 'TODO' && (
          <button
            type="button"
            className="hs-learn-btn hs-learn-btn--ghost"
            aria-expanded={hintOpen}
            onClick={() => setHintOpen((v) => !v)}
          >
            {hintOpen ? 'Hide hint' : 'Need a hint?'}
          </button>
        )}
      </div>

      {hintOpen && (
        <p className="hs-learn-hint hs-learn-hint--asked">
          <span aria-hidden="true">💡</span> {entry.hint}
        </p>
      )}

      {hints.length > 0 && (
        <div className="hs-learn-hints">
          <p className="hs-learn-eyebrow">Coach&apos;s tips</p>
          <ul>
            {hints.map((h, i) => (
              <li key={`${i}-${h}`} className="hs-learn-hint">
                <span aria-hidden="true">💡</span> {h}
              </li>
            ))}
          </ul>
        </div>
      )}

      {feed.length > 0 && (
        <div className="hs-learn-feed">
          <p className="hs-learn-eyebrow">Trading floor</p>
          <ul aria-live="polite">
            {feed.map((msg) => (
              <FeedItem key={msg.seq} msg={msg} />
            ))}
          </ul>
        </div>
      )}
    </article>
  );
}

export function FeedItem({ msg }) {
  if (msg.kind === 'event') {
    const alert = ALERTS[msg.event_kind] || { label: 'Breaking', icon: '📰', tone: 'fog' };
    return (
      <li className={cx('hs-learn-alert', `hs-learn-alert--${alert.tone}`)}>
        <div className="hs-learn-alert__strip">
          <span>Breaking</span>
          <span>
            {alert.icon} {alert.label}
          </span>
          {msg.symbol && <span className="hs-learn-alert__sym">{msg.symbol}</span>}
        </div>
        <p className="hs-learn-alert__headline">{msg.text}</p>
        <span className="hs-learn-feed__t">{formatClock(msg.t)}</span>
      </li>
    );
  }
  const icon = msg.kind === 'hint' ? '💡' : msg.kind === 'state' ? '🔔' : '📢';
  return (
    <li className={cx('hs-learn-feed__item', `hs-learn-feed__item--${msg.kind}`)}>
      <span aria-hidden="true">{icon}</span>
      <span>{msg.text}</span>
      <span className="hs-learn-feed__t">{formatClock(msg.t)}</span>
    </li>
  );
}

export default MissionPanel;
