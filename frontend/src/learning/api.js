// HoopStreet learning layer: tiny REST client for /learning/*.
// apiBase can be absolute ("http://localhost:8001") or relative ("" or "/api")
// when the backend sits behind the same origin / a dev proxy.

export const DEFAULT_API_BASE = 'http://localhost:8001';

export class LearningApiError extends Error {
  constructor(status, detail) {
    super(typeof detail === 'string' ? detail : `HTTP ${status}`);
    this.name = 'LearningApiError';
    this.status = status;
    this.detail = detail;
  }
}

function trimBase(apiBase) {
  return (apiBase ?? DEFAULT_API_BASE).replace(/\/+$/, '');
}

export function learningWsUrl(apiBase, userId, symbols) {
  const base = trimBase(apiBase);
  const qs = new URLSearchParams({ user_id: userId });
  if (symbols && symbols.length) qs.set('symbols', symbols.join(','));
  const path = `/learning/ws?${qs}`;
  if (/^https?:\/\//i.test(base)) return base.replace(/^http/i, 'ws') + path;
  const { protocol, host } = window.location;
  return `${protocol === 'https:' ? 'wss' : 'ws'}://${host}${base}${path}`;
}

export function createLearningApi(apiBase = DEFAULT_API_BASE) {
  const base = trimBase(apiBase);

  async function request(path, { method = 'GET', body, query } = {}) {
    const qs = query ? `?${new URLSearchParams(query)}` : '';
    const res = await fetch(`${base}${path}${qs}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    let data = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    if (!res.ok) throw new LearningApiError(res.status, data?.detail ?? res.statusText);
    return data;
  }

  return {
    base,
    missions: () => request('/learning/missions'),
    glossary: () => request('/learning/glossary'),
    start: (userId, missionId) =>
      request('/learning/missions/start', { method: 'POST', body: { user_id: userId, mission_id: missionId } }),
    stop: (userId) => request('/learning/missions/stop', { method: 'POST', body: { user_id: userId } }),
    status: (userId) => request('/learning/missions/status', { query: { user_id: userId } }),
    result: (userId) => request('/learning/missions/result', { query: { user_id: userId } }),
    wsUrl: (userId, symbols) => learningWsUrl(base, userId, symbols),
    // MOCK ONLY (dev app). Remove at merge: real trading goes through Person 2's API.
    mock: {
      symbols: () => request('/learning/mock/symbols'),
      order: (userId, symbol, side, qty) =>
        request('/learning/mock/order', { method: 'POST', body: { user_id: userId, symbol, side, qty } }),
      portfolio: (userId) => request('/learning/mock/portfolio', { query: { user_id: userId } }),
    },
  };
}
