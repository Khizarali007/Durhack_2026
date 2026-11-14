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
let onboardingDone = false, accountLoading = false;
let timelineState = null,
  seeking = false,
  dragging = false,
  historyLoaded = false;
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
    if (r.status === 401) {
      if (token === usedToken) resetAccount();
      throw Object.assign(Error("Session reset"), {sessionReset: true});
    }
    throw Error(
      typeof data.detail === "string"
        ? data.detail
        : JSON.stringify(data.detail),
    );
  }
  if (usedToken && usedToken !== token)
    throw Object.assign(Error("Session changed"), {sessionReset: true});
  return data;
}
function error(e) {
  if (e.sessionReset) return;
  $("error").textContent = e.message || String(e);
}
function controls() {
  for (const id of ["buy", "sell"])
    $(id).disabled = !token || busy || seeking || finished;
  $("start").hidden = !!token;
  $("start").disabled = busy || seeking;
  $("first-buy").disabled = busy || seeking || finished || !players.length || !timelineState;
  $("first-buy").textContent = busy ? "Buying…" : "Buy my first shares";
  $("welcome").hidden = onboardingDone;
  $("market-screen").hidden = !onboardingDone;
}
function resetAccount() {
  token = null;
  portfolio = null;
  onboardingDone = false;
  $("error").textContent = "";
  sessionStorage.removeItem("hoop-demo-started");
  $("payment-notice").hidden = true;
  $("payments").textContent = "No payments yet.";
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
  loadHistory().catch(error);
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
  loadHistory().catch(error);
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
    ["Available cash", portfolio?.available_cash, "Ready to spend", "spendable"],
    ["Shares value", portfolio?.positions_value, "Current market value", ""],
    ["Total wealth", portfolio?.equity, "Cash + shares + pending payouts", ""],
    ["Payouts earned", portfolio?.payouts_received, "Already included in your cash", ""],
  ].map(([k,v,h,c]) => `<span class="${c}">${k}<b>${money(v)}</b><small>${h}</small></span>`).join("");
  $("wallet-detail").textContent = `Pending payouts: ${money(portfolio?.pending_payouts)} (not spendable yet) · Cash reserved: ${money(portfolio?.reserved_cash)} · Profit / loss: ${money(portfolio?.total_pnl)}`;
}
function announcePayment(text) {
  $("payment-notice").textContent = text;
  $("payment-notice").hidden = false;
}
async function loadAccount() {
  if (!token || accountLoading) return;
  accountLoading = true;
  try {
    const previous = portfolio?.payouts_received;
    const [next, payments] = await Promise.all([api("/trading/portfolio"), api("/trading/payouts?limit=1000")]);
    portfolio = next;
    if (previous != null && next.payouts_received > previous + .005) {
      announcePayment(`PAYOUTS RECEIVED · +${money(next.payouts_received - previous)} credited to your wallet. See each payment below.`);
      $("payments").parentElement.open = true;
    }
    $("payments").innerHTML = payments.length ? payments.map(p =>
      `<div class="payment-row"><span>${esc(p.symbol)} · ${new Date(p.t*1000).toISOString().slice(0,16).replace("T"," ")} UTC<br>${p.qty_held} shares × ${rate(p.hoop_per_share)} / share</span><b>+${money(p.amount)}</b></div>`
    ).join("") : "No payments yet. Hold shares at noon UTC to qualify; payment arrives at day close after a game.";
    if (next.positions.length || sessionStorage.getItem("hoop-demo-started") === token) onboardingDone = true;
    renderAccount();
    controls();
  } finally { accountLoading = false; }
}
function firstEstimate() {
  const p = match($("first-player").value), qty = Number($("first-qty").value);
  const q = p && quotes[p.symbol];
  $("first-cost").textContent = q && qty > 0 ? `${p.name} · ${money(q.ask)} / share · approximately ${money(q.ask * qty)} + fees. Starting wallet: $100,000.` : "Choose a player and a positive whole number of shares.";
}
$("first-player").oninput = firstEstimate;
$("first-qty").oninput = firstEstimate;
$("first-buy").onclick = async () => {
  if (busy || seeking || !$("first-qty").reportValidity()) return;
  const p = match($("first-player").value);
  if (!p) return error("Choose a player from the suggestions.");
  busy = true; controls();
  try {
    if (!token) {
      const r = await api("/trading/guest", "POST");
      token = r.token; sessionStorage.setItem("hoop-demo-token", token);
    }
    selected = p.symbol;
    comparisons = comparisons.filter(s => s !== selected);
    $("search").value = p.name;
    const r = await api("/trading/orders", "POST", {symbol:selected, side:"buy", qty:Number($("first-qty").value), leverage:1});
    if (!r.filled_qty) throw Error(r.reason || "No shares filled. Choose another player or quantity.");
    onboardingDone = true;
    sessionStorage.setItem("hoop-demo-started", token);
    await loadAccount();
    announcePayment(`PURCHASE COMPLETE · ${money(r.average_price * r.filled_qty + r.total_fee)} paid from your wallet (including ${money(r.total_fee)} fees). You bought ${r.filled_qty} ${selected} shares.`);
    $("result").textContent = `First purchase complete: ${r.filled_qty}/${r.requested_qty} shares. Press Play to watch the market and receive payouts.`;
    $("error").textContent = "";
    await Promise.all([valuation(), loadHistory()]);
    ingest(await api("/market/quotes"));
  } catch(e) { error(e); }
  finally { busy = false; controls(); }
};

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
  if (busy || seeking || !token || finished) return;
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
    if (r.filled_qty) announcePayment(`${side === "buy" ? "PURCHASE" : "SALE"} COMPLETE · ${money(r.average_price * r.filled_qty + (side === "buy" ? r.total_fee : -r.total_fee))} ${side === "buy" ? "paid from" : "added to"} your wallet (including ${money(r.total_fee)} fees). ${r.filled_qty} ${r.symbol} shares ${side === "buy" ? "bought" : "sold"}.`);
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
  if (seeking || (timelineState && r.t < timelineState.t)) return;
  quotes = r.quotes;
  firstEstimate();
  $("clock").textContent =
    new Date(r.t * 1000).toISOString().replace("T", " ").slice(0, 16) + " UTC";
  if (Date.now() - lastDraw < 950) return;
  lastDraw = Date.now();
  for (const [s, q] of Object.entries(quotes)) {
    const rows = (history[s] ??= []);
    rows.push({ t: r.t, last: q.last, fair: q.fair_value });
    if (rows.length > 2000) {
      const compact = rows.filter((_, i) => i % 2 === 0);
      history[s] = compact;
    }
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
    const previousSeek = seeking;
    timelineState = await api("/market/timeline");
    seeking = timelineState.busy;
    renderTimeline();
    if (seeking) {
      controls();
      return;
    }
    const s = await api("/market/status");
    if (session && session !== s.session_id) {
      history = {};
      historyLoaded = false;
      resetAccount();
      $("result").textContent = "Market reset. Start a fresh session.";
    }
    session = s.session_id;
    finished = s.finished;
    controls();
    if (previousSeek || !historyLoaded) {
      await loadHistory();
      ingest(await api("/market/quotes"));
      historyLoaded = true;
    }
    $("note").textContent =
      `${s.finished ? "Replay finished. Drag the timeline back to start again." : `${timelineState.paused ? "Paused" : "Live replay"} · 1 day / ${(s.real_seconds_per_historical_day / timelineState.rate).toFixed(1)} seconds at target speed (actual speed depends on replay work)`} · Hold at noon UTC for day-close payouts. Rewinding resets accounts; forward jumps settle games and payouts in order.`;
    if (s.last_error) error("Market paused: " + s.last_error);
    ingest(await api("/market/quotes"));
    await Promise.all([valuation(), loadAccount()]);
  } catch (e) {
    error(e);
  } finally {
    refreshing = false;
  }
}
function renderTimeline() {
  if (!timelineState) return;
  const s = timelineState;
  $("timeline").max = Math.round((s.end_t - s.start_t) / 86400);
  if (!dragging) {
    $("timeline").value = Math.floor((s.t - s.start_t) / 86400);
    $("timeline-date").textContent = new Date(s.t * 1000)
      .toISOString()
      .slice(0, 10);
  }
  $("pause").textContent = s.paused ? "Play" : "Pause";
  $("speed").value = String(s.rate);
  for (const id of ["pause", "timeline", "speed"]) $(id).disabled = seeking;
  $("timeline-status").textContent =
    s.error ||
    (seeking
      ? "Moving market… " + new Date(s.t * 1000).toISOString().slice(0, 10)
      : "Drag to any day. Rewinding resets all accounts. Jumps pause at the selected day.");
}
async function loadHistory() {
  const symbols = [selected, ...comparisons];
  const r = await api(
    "/market/history?symbols=" + encodeURIComponent(symbols.join(",")),
  );
  if (seeking || (session && r.session_id !== session)) return;
  for (const [s, rows] of Object.entries(r.history)) {
    const merged = new Map(rows.map((p) => [p.t, p]));
    for (const point of history[s] || []) merged.set(point.t, point);
    history[s] = [...merged.values()].sort((a, b) => a.t - b.t);
  }
  draw();
}
async function control(body) {
  try {
    if (body.target_t !== undefined) {
      seeking = true;
      controls();
    }
    timelineState = await api("/market/timeline", "POST", body);
    seeking = timelineState.busy;
    renderTimeline();
    $("error").textContent = "";
    await refresh();
  } catch (e) {
    seeking = false;
    error(e);
  }
  controls();
}
$("timeline").oninput = () => {
  dragging = true;
  if (timelineState)
    $("timeline-date").textContent = new Date(
      (timelineState.start_t + Number($("timeline").value) * 86400) * 1000,
    )
      .toISOString()
      .slice(0, 10);
};
$("timeline").onchange = () => {
  dragging = false;
  if (timelineState)
    control({
      target_t: timelineState.start_t + Number($("timeline").value) * 86400,
    });
};
$("pause").onclick = () =>
  timelineState && control({ paused: !timelineState.paused });
$("speed").onchange = () => control({ rate: Number($("speed").value) });
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
