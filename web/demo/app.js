"use strict";
const $ = (id) => document.getElementById(id);
const esc = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const money = (v) =>
  v == null
    ? "—"
    : new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
      }).format(v);
const rate = (v) => (v == null ? "—" : "$" + v.toFixed(3));
const colors = ["#5ce0aa", "#f9ad67", "#8aa6ff", "#f48fb1"];
let players = [],
  quotes = {},
  selected = "WEMBY",
  comparisons = ["JOKIC", "SGA"],
  history = {},
  token = sessionStorage.getItem("hoop-demo-token"),
  portfolio = null,
  session = null,
  finished = false,
  busy = false,
  refreshing = false,
  socket,
  lastDraw = 0;
async function api(path, method = "GET", body) {
  const usedToken = token;
  const r = await fetch(path, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(10000),
  });
  const data = await r.json();
  if (!r.ok) {
    if (r.status === 401 && token === usedToken) resetAccount();
    throw Error(
      typeof data.detail === "string"
        ? data.detail
        : JSON.stringify(data.detail),
    );
  }
  if (usedToken && usedToken !== token)
    throw Error("Session changed. Please try again.");
  return data;
}
function error(e) {
  $("error").textContent = e.message || String(e);
}
function controls() {
  for (const id of ["buy", "sell"]) $(id).disabled = !token || busy || finished;
  $("start").hidden = !!token;
  $("start").disabled = busy;
}
function resetAccount() {
  token = null;
  portfolio = null;
  sessionStorage.removeItem("hoop-demo-token");
  renderAccount();
  controls();
}
function match(text) {
  const q = text.trim().toLowerCase();
  return (
    players.find(
      (p) => p.name.toLowerCase() === q || p.symbol.toLowerCase() === q,
    ) || players.find((p) => q && p.name.toLowerCase().includes(q))
  );
}
function choose() {
  const p = match($("search").value);
  if (!p) {
    error("Choose a player from the search suggestions.");
    return;
  }
  selected = p.symbol;
  comparisons = comparisons.filter((s) => s !== selected);
  $("search").value = p.name;
  $("error").textContent = "";
  $("result").textContent =
    "Buy at the ask; sell at the bid. Fees are included in the execution result.";
  draw();
  renderAccount();
  valuation().catch(error);
}
$("search").onchange = choose;
$("search").onkeydown = (e) => {
  if (e.key === "Enter") choose();
};
$("add").onclick = () => {
  const p = match($("compare-search").value);
  if (!p) {
    error("Choose a comparison player.");
    return;
  }
  if (p.symbol !== selected && !comparisons.includes(p.symbol)) {
    if (comparisons.length >= 3) {
      error("Remove a comparison first; the chart supports four players.");
      return;
    }
    comparisons.push(p.symbol);
  }
  $("compare-search").value = "";
  draw();
};
$("compare-search").onkeydown = (e) => {
  if (e.key === "Enter") $("add").click();
};
$("scale").onchange = draw;
function renderAccount() {
  const held = portfolio?.positions.find((p) => p.symbol === selected);
  $("held").textContent = `You own ${held?.qty ?? 0} shares`;
  $("balance").innerHTML = [
    ["Cash", portfolio?.available_cash],
    ["Portfolio", portfolio?.equity],
    ["Payouts received", portfolio?.payouts_received],
    ["Pending payouts", portfolio?.pending_payouts],
  ]
    .map(([k, v]) => `<span>${k} <b>${money(v)}</b></span>`)
    .join("");
}
async function loadAccount() {
  if (!token) return;
  portfolio = await api("/trading/portfolio");
  renderAccount();
}
$("start").onclick = async () => {
  busy = true;
  controls();
  try {
    const r = await api("/trading/guest", "POST");
    token = r.token;
    sessionStorage.setItem("hoop-demo-token", token);
    await loadAccount();
    $("result").textContent = "Ready. Choose a player and buy shares.";
    $("error").textContent = "";
  } catch (e) {
    error(e);
  } finally {
    busy = false;
    controls();
  }
};
async function trade(side) {
  if (busy || !token || finished) return;
  if (!$("qty").reportValidity()) return;
  busy = true;
  controls();
  $("error").textContent = "";
  try {
    const r = await api("/trading/orders", "POST", {
      symbol: selected,
      side,
      qty: Number($("qty").value),
      leverage: 1,
    });
    $("result").textContent =
      `${side === "buy" ? "Bought" : "Sold"} ${r.filled_qty}/${r.requested_qty} ${r.symbol} at ${money(r.average_price)} per share · fees ${money(r.total_fee)}${r.reason ? " · " + r.reason : ""}`;
    await loadAccount();
  } catch (e) {
    error(e);
  } finally {
    busy = false;
    controls();
  }
}
$("buy").onclick = () => trade("buy");
$("sell").onclick = () => trade("sell");
async function valuation() {
  const symbol = selected,
    v = await api("/market/valuation/" + encodeURIComponent(symbol));
  if (symbol !== selected) return;
  $("fair").textContent = money(v.fair_value);
  $("ability").textContent = v.underlying_ability.toFixed(2);
  $("form").textContent = v.recent_form.toFixed(2);
  $("expected").textContent = rate(v.next_game_expected_payout);
  $("team").textContent =
    (players.find((p) => p.symbol === selected)?.team || "") +
    " · Player share" +
    (v.injury_status
      ? ` · ${v.injury_status}${v.injury_level ? " (" + v.injury_level + ")" : ""}`
      : "");
}
function draw() {
  const p = players.find((p) => p.symbol === selected),
    q = quotes[selected];
  if (!p || !q) return;
  const change = 100 * (q.last / p.start_price - 1);
  $("player").textContent = p.name;
  $("symbol").textContent = p.symbol;
  $("price").textContent = money(q.last);
  $("change").textContent =
    `${change >= 0 ? "+" : ""}${change.toFixed(2)}% since opening`;
  $("change").className = "change " + (change >= 0 ? "up" : "down");
  $("spread").textContent = `Buy ${money(q.ask)} / Sell ${money(q.bid)}`;
  const symbols = [selected, ...comparisons],
    percent = $("scale").value === "return";
  const series = symbols.map((s) => {
    const base = players.find((p) => p.symbol === s)?.start_price || 1;
    return {
      symbol: s,
      points: (history[s] || []).map((r) => [
        r.t,
        percent ? 100 * (r.last / base - 1) : r.last,
      ]),
      base,
    };
  });
  const main = history[selected] || [];
  const fair = main.map((r) => [
    r.t,
    percent ? 100 * (r.fair / p.start_price - 1) : r.fair,
  ]);
  const values = [
    ...series.flatMap((s) => s.points.map((r) => r[1])),
    ...fair.map((r) => r[1]),
  ];
  if (!values.length) return;
  let low = Math.min(...values),
    high = Math.max(...values),
    pad = Math.max((high - low) * 0.1, percent ? 0.1 : 0.5);
  low -= pad;
  high += pad;
  const times = series.flatMap((s) => s.points.map((r) => r[0])),
    start = Math.min(...times),
    end = Math.max(...times),
    x = (t) => 70 + ((t - start) / (end - start || 1)) * 910,
    y = (v) => 25 + ((high - v) / (high - low)) * 290;
  const path = (points) =>
    points
      .map(
        ([t, v], i) => `${i ? "L" : "M"}${x(t).toFixed(1)},${y(v).toFixed(1)}`,
      )
      .join(" ");
  const date = (t) =>
    new Date(t * 1000).toISOString().slice(5, 16).replace("T", " ");
  $("chart").innerHTML =
    `<defs><linearGradient id="area" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#5ce0aa" stop-opacity=".22"/><stop offset="1" stop-color="#5ce0aa" stop-opacity="0"/></linearGradient></defs>` +
    [0, 0.25, 0.5, 0.75, 1]
      .map((f) => {
        const v = high - (high - low) * f,
          yy = y(v);
        return `<line class="grid" x1="70" x2="980" y1="${yy}" y2="${yy}"/><text class="axis" x="3" y="${yy + 4}">${v.toFixed(1)}${percent ? "%" : ""}</text>`;
      })
      .join("") +
    `<text class="axis" x="70" y="350">${date(start)} UTC</text><text class="axis" x="980" y="350" text-anchor="end">${date(end)} UTC</text>` +
    (series[0].points.length
      ? `<path d="${path(series[0].points)} L${x(series[0].points.at(-1)[0])},315 L${x(series[0].points[0][0])},315 Z" fill="url(#area)"/>`
      : "") +
    series
      .map(
        (s, i) =>
          `<path d="${path(s.points)}" fill="none" stroke="${colors[i]}" stroke-width="${i ? 2 : 3}"/>`,
      )
      .join("") +
    `<path d="${path(fair)}" fill="none" stroke="#dae5f5" stroke-width="2" stroke-dasharray="6 6"/>`;
  $("legend").innerHTML =
    symbols
      .map(
        (s, i) =>
          `<button data-symbol="${esc(s)}" ${i ? "" : "disabled"}><span class="swatch" style="background:${colors[i]}"></span>${esc(players.find((p) => p.symbol === s)?.name || s)} · ${money(quotes[s]?.last)}${i ? " ×" : ""}</button>`,
      )
      .join("") + "<span>┄ Formula value (main player)</span>";
  $("legend")
    .querySelectorAll("button:not(:disabled)")
    .forEach(
      (b) =>
        (b.onclick = () => {
          comparisons = comparisons.filter((s) => s !== b.dataset.symbol);
          draw();
        }),
    );
}
function ingest(r) {
  quotes = r.quotes;
  $("clock").textContent =
    new Date(r.t * 1000).toISOString().replace("T", " ").slice(0, 16) + " UTC";
  if (Date.now() - lastDraw < 950) return;
  lastDraw = Date.now();
  for (const [s, q] of Object.entries(quotes)) {
    const rows = (history[s] ??= []);
    rows.push({ t: r.t, last: q.last, fair: q.fair_value });
    if (rows.length > 600) rows.shift();
  }
  draw();
}
function connect() {
  socket = new WebSocket(
    `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/market/ws`,
  );
  socket.onmessage = (e) => ingest(JSON.parse(e.data));
  socket.onclose = () => setTimeout(connect, 2000);
  socket.onerror = () => socket.close();
}
async function refresh() {
  if (refreshing) return;
  refreshing = true;
  try {
    const s = await api("/market/status");
    if (session && session !== s.session_id) {
      history = {};
      resetAccount();
      $("result").textContent = "Backend restarted. Start a fresh session.";
    }
    session = s.session_id;
    finished = s.finished;
    controls();
    $("note").textContent =
      `${s.finished ? "Replay finished. Restart the backend for a new season." : `Live replay · 1 day / ${s.real_seconds_per_historical_day} seconds`} · Hold at noon UTC for day-close payouts. Chart shows the latest 600 observations collected on this page.`;
    if (s.last_error) error("Market paused: " + s.last_error);
    if (!socket || socket.readyState !== WebSocket.OPEN)
      ingest(await api("/market/quotes"));
    await Promise.all([valuation(), loadAccount()]);
  } catch (e) {
    error(e);
  } finally {
    refreshing = false;
  }
}
(async () => {
  controls();
  try {
    players = await api("/market/players");
    if (!players.some((p) => p.symbol === selected))
      selected = players[0].symbol;
    comparisons = comparisons.filter((s) =>
      players.some((p) => p.symbol === s),
    );
    $("player-list").innerHTML = players
      .map((p) => `<option value="${esc(p.name)}">${esc(p.symbol)}</option>`)
      .join("");
    $("search").value = players.find((p) => p.symbol === selected).name;
    ingest(await api("/market/quotes"));
    connect();
    await refresh();
  } catch (e) {
    error(e);
  }
  setInterval(refresh, 3000);
})();
