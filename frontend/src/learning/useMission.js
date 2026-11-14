// Mission state for one user, kept in sync over REST + the learning WebSocket.
// MissionPanel and MissionDebrief call this themselves, or you call it once
// and pass the returned object to both as `mission` (one fetch stream).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createLearningApi } from './api.js';
import { useLearningSocket } from './useLearningSocket.js';

const FALLBACK_POLL_MS = 2000;

export function useMission({ apiBase, userId, enabled = true }) {
  const api = useMemo(() => createLearningApi(apiBase), [apiBase]);
  const [missions, setMissions] = useState([]);
  const [status, setStatus] = useState(null);
  const [fetchedAt, setFetchedAt] = useState(0);
  const [result, setResult] = useState(null);
  const [passedIds, setPassedIds] = useState(() => new Set());
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);

  const applyStatus = useCallback(
    async (st) => {
      const mine = ++seq.current;
      setStatus(st);
      setFetchedAt(performance.now());
      if (st.result_ready) {
        const r = await api.result(userId);
        if (mine !== seq.current) return;
        setResult(r);
        if (r.passed) setPassedIds((prev) => new Set(prev).add(r.mission_id));
      } else {
        setResult(null);
      }
    },
    [api, userId],
  );

  const refresh = useCallback(async () => {
    if (!enabled || !userId) return;
    try {
      await applyStatus(await api.status(userId));
      setError(null);
    } catch (err) {
      setError(err.message || String(err));
    }
  }, [api, userId, enabled, applyStatus]);

  // Mission catalogue.
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    api
      .missions()
      .then((m) => live && setMissions(m))
      .catch((err) => live && setError(err.message || String(err)));
    return () => {
      live = false;
    };
  }, [api, enabled]);

  // Initial status.
  useEffect(() => {
    refresh();
  }, [refresh]);

  // Live updates: any mission message means "something changed, refetch".
  const socket = useLearningSocket({
    apiBase,
    userId,
    enabled: enabled && Boolean(userId),
    onMessage: (msg) => {
      if (msg.type !== 'mission') return;
      if (msg.kind === 'snapshot' && msg.status) applyStatus(msg.status).catch(() => {});
      else refresh();
    },
  });

  // Fallback poll while running, in case the socket is down.
  const running = status?.state === 'running';
  useEffect(() => {
    if (!running || socket.connected) return undefined;
    const id = setInterval(refresh, FALLBACK_POLL_MS);
    return () => clearInterval(id);
  }, [running, socket.connected, refresh]);

  const run = useCallback(
    async (fn) => {
      setBusy(true);
      try {
        const st = await fn();
        await applyStatus(st);
        setError(null);
      } catch (err) {
        setError(err.message || String(err));
      } finally {
        setBusy(false);
      }
    },
    [applyStatus],
  );

  const start = useCallback((missionId) => run(() => api.start(userId, missionId)), [run, api, userId]);
  const stop = useCallback(() => run(() => api.stop(userId)), [run, api, userId]);

  const activeEntry = missions.find((m) => m.id === status?.mission_id) || null;
  const nextMission = useMemo(() => {
    if (!activeEntry) return missions.find((m) => m.available) || null;
    return missions.find((m) => m.available && m.number > activeEntry.number) || null;
  }, [missions, activeEntry]);

  return {
    api,
    userId,
    missions,
    status,
    fetchedAt,
    result,
    passedIds,
    error,
    busy,
    connection: socket.status,
    activeEntry,
    nextMission,
    start,
    stop,
    retry: () => status?.mission_id && start(status.mission_id),
    refresh,
  };
}

/** Live countdown (seconds, float) derived from the last status fetch. */
export function useSecondsLeft(status, fetchedAt) {
  const running = status?.state === 'running';
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    if (!running) return undefined;
    const id = setInterval(() => setNow(performance.now()), 250);
    return () => clearInterval(id);
  }, [running]);
  if (!status || status.seconds_left == null) return null;
  if (!running) return status.seconds_left;
  return Math.max(0, status.seconds_left - Math.max(0, now - fetchedAt) / 1000);
}
