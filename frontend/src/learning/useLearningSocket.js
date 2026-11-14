// One hook for the /learning/ws WebSocket, with automatic reconnect.
// Components that use the same URL share a single connection.

import { useEffect, useMemo, useRef, useState } from 'react';
import { learningWsUrl } from './api.js';

const MIN_RETRY_MS = 500;
const MAX_RETRY_MS = 5000;
const IDLE_CLOSE_MS = 250; // survives React StrictMode's mount/unmount/mount

const pool = new Map();

class SharedSocket {
  constructor(url) {
    this.url = url;
    this.listeners = new Set();
    this.statusListeners = new Set();
    this.status = 'connecting';
    this.retries = 0;
    this.ws = null;
    this.reconnectTimer = null;
    this.closeTimer = null;
    this.disposed = false;
    this.connect();
  }

  setStatus(status) {
    this.status = status;
    this.statusListeners.forEach((fn) => fn(status));
  }

  connect() {
    this.setStatus(this.retries ? 'reconnecting' : 'connecting');
    let ws;
    try {
      ws = new WebSocket(this.url);
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;
    ws.onopen = () => {
      this.retries = 0;
      this.setStatus('open');
    };
    ws.onmessage = (event) => {
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }
      this.listeners.forEach((fn) => fn(msg));
    };
    ws.onerror = () => ws.close();
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      if (!this.disposed) this.scheduleReconnect();
    };
  }

  scheduleReconnect() {
    this.setStatus('reconnecting');
    const delay = Math.min(MAX_RETRY_MS, MIN_RETRY_MS * 2 ** this.retries++);
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  add(listener, statusListener) {
    clearTimeout(this.closeTimer);
    this.listeners.add(listener);
    this.statusListeners.add(statusListener);
  }

  remove(listener, statusListener) {
    this.listeners.delete(listener);
    this.statusListeners.delete(statusListener);
    if (this.listeners.size === 0) {
      this.closeTimer = setTimeout(() => this.dispose(), IDLE_CLOSE_MS);
    }
  }

  dispose() {
    this.disposed = true;
    clearTimeout(this.reconnectTimer);
    pool.delete(this.url);
    if (this.ws) {
      const ws = this.ws;
      this.ws = null;
      ws.close();
    }
  }
}

function acquire(url) {
  let sock = pool.get(url);
  if (!sock) {
    sock = new SharedSocket(url);
    pool.set(url, sock);
  }
  return sock;
}

/**
 * useLearningSocket({ apiBase, userId, symbols, onMessage, enabled })
 * - onMessage(msg) gets every parsed message: {type:"mission", ...} or {type:"tick", ...}
 * - returns { status: "connecting" | "open" | "reconnecting", connected }
 */
export function useLearningSocket({ apiBase, userId, symbols, onMessage, enabled = true }) {
  const [status, setStatus] = useState('connecting');
  const handler = useRef(onMessage);
  useEffect(() => {
    handler.current = onMessage;
  });

  const symbolsKey = symbols && symbols.length ? symbols.join(',') : '';
  const url = useMemo(
    () => (enabled && userId ? learningWsUrl(apiBase, userId, symbolsKey ? symbolsKey.split(',') : null) : null),
    [apiBase, userId, symbolsKey, enabled],
  );

  useEffect(() => {
    if (!url) return undefined;
    const sock = acquire(url);
    const listener = (msg) => handler.current && handler.current(msg);
    sock.add(listener, setStatus);
    setStatus(sock.status);
    return () => sock.remove(listener, setStatus);
  }, [url]);

  return { status, connected: status === 'open' };
}
