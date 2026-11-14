"use strict";
const $ = (id) => document.getElementById(id),
  esc = (v) =>
    String(v ?? "—").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
const money = (v) =>
    v == null
      ? "—"
      : new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: "USD",
        }).format(v),
  pct = (v) => (v == null ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`),
  num = (v) => (v == null ? "—" : Number(v).toFixed(2)),
  time = (t) =>
    t
      ? new Date(t * 1000).toISOString().replace("T", " ").slice(0, 16) + " UTC"
      : "—";
const rate = (v) =>
  v == null
    ? "—"
    : new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 2,
        maximumFractionDigits: 4,
      }).format(v);
const state = {
  token: sessionStorage.getItem("hoop-demo-token"),
  players: [],
  quotes: {},
  selected: "WEMBY",
  compare: ["WEMBY"],
  history: {},
  tab: "market",
  t: 0,
  events: [],
  session: null,
  finished: false,
  busy: false,
};
const colors = ["#b4f1ca", "#9cbfff", "#f4bf7c", "#e4a1ed"];
let marketSocket,
  userSocket,
  refreshing = false,
  lastRender = 0;
function notice(message, error = false) {
  $("notice").hidden = false;
  $("notice").className = error ? "error" : "";
  $("notice").textContent = message;
}
function table(headers, rows, empty = "Nothing here yet.") {
  return rows.length
    ? `<table><thead><tr>${headers.map((x) => `<th>${esc(x)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((v) => `<td>${v}</td>`).join("")}</tr>`).join("")}</tbody></table>`
    : `<div class="empty">${esc(empty)}</div>`;
}
function metrics(id, items) {
  $(id).innerHTML = items
    .map(
      ([k, v]) =>
        `<div class="metric"><small>${esc(k)}</small><b>${esc(v)}</b></div>`,
    )
    .join("");
}
function stat(k, v) {
  return `<article><small>${esc(k)}</small><b>${esc(v)}</b></article>`;
}
async function api(path, method = "GET", body) {
  const token = state.token;
  const r = await fetch(path, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(12000),
  });
  if (r.status === 204) return null;
  const data = await r.json();
  if (!r.ok) {
    if (r.status === 401 && token && state.token === token) {
      clearAccount();
      notice(
        "Your session expired or the backend restarted. Start a new guest or log in.",
        true,
      );
    }
    throw new Error(
      typeof data.detail === "string"
        ? data.detail
        : JSON.stringify(data.detail ?? data),
    );
  }
  if (token && token !== state.token)
    throw new Error("Account changed; refresh to see the current account.");
  return data;
}
function setTradingEnabled() {
  const disabled = !state.token || state.finished || state.busy;
  for (const id of ["place", "preview"]) $(id).disabled = disabled;
  $("preview").hidden = $("order-type").value !== "market";
}
function clearAccount() {
  state.token = null;
  state.events = [];
  $("events").textContent = "Waiting for events…";
  sessionStorage.removeItem("hoop-demo-token");
  if (userSocket) userSocket.close();
  $("auth").hidden = false;
  $("logout").hidden = true;
  $("account").textContent = "Browse the market or start trading";
  $("summary").innerHTML = [
    "Equity",
    "Available cash",
    "Total return",
    "Paid dividends",
    "Pending rights",
  ]
    .map((k) => stat(k, "—"))
    .join("");
  for (const id of ["holdings", "open-orders", "rights", "payouts", "trades"])
    $(id).innerHTML =
      '<div class="empty">Start a guest session or log in to view your account.</div>';
  $("equity-chart").innerHTML = "";
  $("drawdown").textContent = "";
  $("account-details").innerHTML = "";
  $("estimate").textContent = "";
  $("order-result").textContent = "";
  $("chain-account").textContent = "";
  setTradingEnabled();
}
async function enterAccount(data) {
  state.token = data.token;
  sessionStorage.setItem("hoop-demo-token", data.token);
  $("password").value = "";
  await loadMe();
  connectUser();
  await refresh();
  notice("Account ready. All trades use virtual dollars.");
}
async function loadMe() {
  const me = await api("/trading/me");
  $("auth").hidden = true;
  $("logout").hidden = false;
  $("account").textContent = me.username || `Guest ${me.user_id.slice(-6)}`;
  setTradingEnabled();
}
$("guest").onclick = () =>
  action($("guest"), async () =>
    enterAccount(await api("/trading/guest", "POST")),
  );
$("auth-form").onsubmit = (e) => {
  e.preventDefault();
  const mode = e.submitter.value;
  action(e.submitter, async () =>
    enterAccount(
      await api("/trading/" + mode, "POST", {
        username: $("username").value,
        password: $("password").value,
      }),
    ),
  );
};
$("logout").onclick = () =>
  action($("logout"), async () => {
    await api("/trading/logout", "POST");
    clearAccount();
    notice("Logged out.");
  });
async function action(button, fn) {
  button.disabled = true;
  try {
    await fn();
  } catch (e) {
    notice(e.message, true);
  } finally {
    button.disabled = false;
    setTradingEnabled();
  }
}
function changeTab(tab) {
  state.tab = tab;
  document
    .querySelectorAll(".tab")
    .forEach((e) => (e.hidden = e.id !== "tab-" + tab));
  document
    .querySelectorAll("nav button")
    .forEach((e) => e.classList.toggle("active", e.dataset.tab === tab));
  refresh().catch((e) => notice(e.message, true));
}
document
  .querySelectorAll("nav button")
  .forEach((b) => (b.onclick = () => changeTab(b.dataset.tab)));
function renderPlayers() {
  const term = $("search").value.toLowerCase();
  let list = state.players.filter((p) =>
    `${p.name} ${p.team} ${p.symbol}`.toLowerCase().includes(term),
  );
  const ret = (p) =>
    ((state.quotes[p.symbol]?.last ?? p.start_price) / p.start_price - 1) * 100;
  list.sort((a, b) =>
    $("sort").value === "name"
      ? a.name.localeCompare(b.name)
      : $("sort").value === "gain"
        ? ret(b) - ret(a)
        : $("sort").value === "fall"
          ? ret(a) - ret(b)
          : b.start_price - a.start_price,
  );
  $("count").textContent = `${list.length} / ${state.players.length}`;
  $("players").innerHTML = table(
    ["Player", "Last", "Return"],
    list.map((p) => [
      `<button class="player-name" data-player="${esc(p.symbol)}">${esc(p.name)}<small>${esc(p.symbol)} · ${esc(p.team)}</small></button>`,
      money(state.quotes[p.symbol]?.last),
      `<span class="${ret(p) >= 0 ? "positive" : "negative"}">${pct(ret(p))}</span>`,
    ]),
  );
  $("players")
    .querySelectorAll("[data-player]")
    .forEach((b) => {
      b.closest("tr").classList.toggle(
        "selected",
        b.dataset.player === state.selected,
      );
      b.onclick = () => selectPlayer(b.dataset.player);
    });
}
$("search").oninput = renderPlayers;
$("sort").onchange = renderPlayers;
async function selectPlayer(symbol) {
  state.selected = symbol;
  $("estimate").textContent = "";
  $("order-result").textContent = "";
  if (state.compare.length === 1) state.compare = [symbol];
  else if (!state.compare.includes(symbol))
    state.compare = [symbol, ...state.compare.slice(0, 3)];
  renderQuote();
  renderPlayers();
  drawPrices();
  try {
    await loadValuation();
  } catch (e) {
    notice(e.message, true);
  }
}
function renderQuote() {
  const p = state.players.find((p) => p.symbol === state.selected),
    q = state.quotes[state.selected];
  if (!p || !q) return;
  $("selected-name").textContent = p.name;
  $("selected-team").textContent =
    `${p.symbol} / ${p.team} / OPEN ${money(p.start_price)}`;
  $("quote").innerHTML = [
    ["Last trade", q.last],
    ["Best bid", q.bid],
    ["Best ask", q.ask],
    ["Estimated value", q.fair_value],
  ]
    .map(([k, v]) => stat(k, money(v)))
    .join("");
  $("makers").innerHTML = table(
    ["Maker", "Bid", "Ask", "Shares"],
    q.makers.map((m) => [
      esc(m.maker_id),
      money(m.bid),
      money(m.ask),
      esc(m.shares),
    ]),
  );
}
async function loadValuation() {
  const symbol = state.selected,
    v = await api("/market/valuation/" + encodeURIComponent(symbol));
  if (symbol !== state.selected) return;
  metrics("valuation", [
    ["Underlying ability", num(v.underlying_ability)],
    ["Recent form", num(v.recent_form)],
    ["Next expected score", num(v.next_game_expected_score)],
    ["Next expected payout", money(v.next_game_expected_payout)],
    ["Portfolio mark", money(v.portfolio_mark)],
    ["Paid / share this season", money(v.cumulative_actual_payout_per_share)],
    ["Injury status", v.injury_status || "No restriction"],
    ["Injury severity", v.injury_level || "—"],
  ]);
}
$("compare").onclick = () => {
  const symbol = $("compare-picker").value;
  if (state.compare.includes(symbol)) return;
  if (state.compare.length >= 4) {
    notice("Compare up to four players. Remove one using × in the legend.");
    return;
  }
  state.compare.push(symbol);
  drawPrices();
};
function chart(id, series, format) {
  const svg = $(id),
    valid = series.filter((s) => s.points.length);
  if (!valid.length) {
    svg.innerHTML =
      '<text x="25" y="110" fill="#9ab1bd">Waiting for observations…</text>';
    return;
  }
  const xs = valid.flatMap((s) => s.points.map((p) => p[0])),
    ys = valid.flatMap((s) => s.points.map((p) => p[1]));
  let lo = Math.min(...ys),
    hi = Math.max(...ys),
    start = Math.min(...xs),
    end = Math.max(...xs);
  let pad = Math.max((hi - lo) * 0.12, 0.01);
  lo -= pad;
  hi += pad;
  const x = (t) => 70 + ((t - start) / (end - start || 1)) * 610,
    y = (v) => 190 - ((v - lo) / (hi - lo)) * 165;
  svg.innerHTML =
    [0, 0.5, 1]
      .map((f) => {
        const v = lo + (hi - lo) * f,
          py = y(v);
        return `<line x1="70" x2="680" y1="${py}" y2="${py}" stroke="#283c49"/><text x="5" y="${py + 4}" fill="#9ab1bd" font-size="11">${esc(format(v))}</text>`;
      })
      .join("") +
    valid
      .map(
        (s, i) =>
          `<polyline fill="none" stroke="${s.color || colors[i]}" stroke-width="2" points="${s.points.map((p) => `${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`).join(" ")}"/>`,
      )
      .join("") +
    `<text x="70" y="218" fill="#9ab1bd" font-size="10">${esc(time(start))}</text><text x="680" y="218" text-anchor="end" fill="#9ab1bd" font-size="10">${esc(time(end))}</text>`;
}
function drawPrices() {
  const series = state.compare.map((s) => {
    const points = state.history[s] || [],
      base = points[0]?.[1] || 1;
    return { points: points.map(([t, v]) => [t, (v / base - 1) * 100]) };
  });
  chart("price-chart", series, (v) => v.toFixed(1) + "%");
  $("chart-legend").innerHTML = state.compare
    .map(
      (s, i) =>
        `<span style="color:${colors[i]}">${esc(s)}<button data-remove="${esc(s)}" aria-label="Remove ${esc(s)}">×</button></span>`,
    )
    .join("");
  $("chart-legend")
    .querySelectorAll("button")
    .forEach(
      (b) =>
        (b.onclick = () => {
          state.compare = state.compare.filter((s) => s !== b.dataset.remove);
          drawPrices();
        }),
    );
}
function ingest(data) {
  state.quotes = data.quotes;
  state.t = data.t;
  $("clock").textContent = time(data.t);
  if (Date.now() - lastRender < 900) return;
  lastRender = Date.now();
  for (const [s, q] of Object.entries(data.quotes)) {
    const a = (state.history[s] ??= []);
    a.push([data.t, q.last]);
    if (a.length > 600) a.shift();
  }
  renderQuote();
  if (state.tab === "market") renderPlayers();
  drawPrices();
}
function connectMarket() {
  marketSocket = new WebSocket(
    `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/market/ws`,
  );
  marketSocket.onopen = () => {
    $("connection").textContent = "● Live quotes";
  };
  marketSocket.onmessage = (e) => ingest(JSON.parse(e.data));
  marketSocket.onclose = () => {
    $("connection").textContent = "Reconnecting · using polling";
    setTimeout(connectMarket, 2000);
  };
  marketSocket.onerror = () => marketSocket.close();
}
function connectUser() {
  if (userSocket) userSocket.close();
  if (!state.token) return;
  const token = state.token;
  const ws = new WebSocket(
    `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/trading/ws?token=${encodeURIComponent(token)}`,
  );
  userSocket = ws;
  ws.onmessage = (e) => {
    if (token !== state.token) return;
    const data = JSON.parse(e.data);
    if (data.type === "hello" || data.type === "pong") return;
    state.events.unshift(data);
    state.events = state.events.slice(0, 30);
    $("events").textContent = state.events
      .map((x) => JSON.stringify(x))
      .join("\n");
  };
  ws.onclose = (e) => {
    if (userSocket === ws && token === state.token && e.code !== 4401)
      setTimeout(() => {
        if (token === state.token) connectUser();
      }, 3000);
  };
}
function orderBody() {
  return {
    symbol: state.selected,
    side: $("side").value,
    qty: Number($("qty").value),
    leverage: 1,
  };
}
$("order-type").onchange = () => {
  const kind = $("order-type").value;
  $("price-label").hidden = kind === "market";
  $("order-price").required = kind !== "market";
  $("side").disabled = kind === "stop";
  if (kind === "stop") $("side").value = "sell";
  $("estimate").textContent = "";
  $("order-help").textContent =
    kind === "market"
      ? "Preview current liquidity and fees. The execution price may move after the preview."
      : kind === "limit"
        ? "Buy at or below your limit, or sell at or above it. Open orders reserve cash or shares."
        : "Sell held shares when price falls to the trigger. Execution is at the available market price, not guaranteed at the trigger.";
  setTradingEnabled();
};
for (const id of ["side", "qty", "order-price"])
  $(id).oninput = () => {
    $("estimate").textContent = "";
  };
$("preview").onclick = () =>
  action($("preview"), async () => {
    if (!$("order-form").reportValidity()) return;
    const q = await api("/trading/orders/quote", "POST", orderBody());
    $("estimate").innerHTML =
      `<strong>${q.ok ? "Ready at this quote" : "Check order size"}</strong><br>Fillable: ${esc(q.estimated_fillable_qty)} · Average: ${money(q.estimated_avg_price)} · Fee: ${money(q.estimated_fee)} · ${q.side === "buy" ? "Cost" : "Proceeds"}: ${money(q.estimated_total)}<br>${q.warnings.map(esc).join(" · ")}`;
  });
$("order-form").onsubmit = (e) => {
  e.preventDefault();
  if (state.busy) return;
  state.busy = true;
  setTradingEnabled();
  action($("place"), async () => {
    try {
      let body = orderBody(),
        kind = $("order-type").value;
      if (kind !== "market") {
        body = {
          ...body,
          order_type: kind,
          price: Number($("order-price").value),
        };
        delete body.leverage;
      }
      const r = await api(
        kind === "market" ? "/trading/orders" : "/trading/orders/open",
        "POST",
        body,
      );
      $("order-result").textContent =
        kind === "market"
          ? `${r.status}: ${r.side} ${r.filled_qty}/${r.requested_qty} ${r.symbol} at ${money(r.average_price)}; fees ${money(r.total_fee)}. Receipt: ${r.receipt_status}.${r.reason ? " " + r.reason : ""}`
          : `${r.order_type} order ${r.status}: ${r.qty} ${r.symbol} at ${money(r.price)}.`;
      notice("Order accepted. Portfolio refreshed.");
      await refresh();
    } finally {
      state.busy = false;
    }
  });
};
async function accountOverview() {
  const token = state.token,
    p = await api("/trading/portfolio");
  if (token !== state.token) return;
  $("summary").innerHTML = [
    ["Equity", money(p.equity)],
    ["Available cash", money(p.available_cash)],
    ["Total return", `${money(p.total_pnl)} (${pct(p.total_pnl_pct)})`],
    ["Paid dividends", money(p.payouts_received)],
    ["Pending rights", money(p.pending_payouts)],
  ]
    .map(([k, v]) => stat(k, v))
    .join("");
  $("holdings").innerHTML = table(
    [
      "Player",
      "Shares",
      "Avg cost",
      "Mark",
      "Last",
      "Value",
      "Unrealised",
      "Weight",
    ],
    p.positions.map((x) => [
      esc(x.symbol),
      esc(x.qty),
      money(x.avg_cost),
      money(x.mark_price),
      money(x.last_price),
      money(x.market_value),
      money(x.unrealised_pnl),
      pct(x.weight_pct),
    ]),
    "No holdings. Buy a player in Market & trade.",
  );
  metrics("account-details", [
    ["Cash", money(p.cash)],
    ["Reserved for orders", money(p.reserved_cash)],
    ["Positions value", money(p.positions_value)],
    ["Realised P/L", money(p.realised_pnl)],
    ["Fees paid", money(p.fees_paid)],
    ["Starting balance", money(p.starting_cash)],
  ]);
}
async function loadOrders() {
  const rows = await api("/trading/orders/open?include_closed=true");
  $("open-orders").innerHTML = table(
    [
      "Player",
      "Type",
      "Side",
      "Price",
      "Filled / total",
      "Reserved cash",
      "Status",
      "Action",
    ],
    rows.map((r) => [
      esc(r.symbol),
      esc(r.order_type),
      esc(r.side),
      money(r.price),
      `${r.filled_qty} / ${r.qty}`,
      money(r.reserved_cash),
      esc(r.status) + (r.reason ? `<br>${esc(r.reason)}` : ""),
      r.status === "open"
        ? `<button data-cancel="${esc(r.order_id)}">Cancel</button>`
        : "—",
    ]),
  );
  $("open-orders")
    .querySelectorAll("button")
    .forEach(
      (b) =>
        (b.onclick = () =>
          action(b, async () => {
            await api(
              "/trading/orders/" + encodeURIComponent(b.dataset.cancel),
              "DELETE",
            );
            await refresh();
            notice("Order cancelled; reservation released.");
          })),
    );
}
async function loadEquity() {
  const h = await api("/trading/equity-history?limit=600");
  chart(
    "equity-chart",
    [{ points: h.points.map((x) => [x.t, x.equity]) }],
    money,
  );
  $("drawdown").textContent =
    `Current equity ${money(h.current_equity)} · Max drawdown ${money(h.max_drawdown)} (${num(h.max_drawdown_pct)}%). Latest ${h.points.length} recorded points.`;
}
async function loadPayouts() {
  const [rights, payments] = await Promise.all([
    api("/trading/payout-entitlements?limit=100"),
    api("/trading/payouts?limit=100"),
  ]);
  $("rights").innerHTML = table(
    ["Day", "Player", "Shares at noon", "Expected", "Paid", "Score", "Status"],
    rights.map((r) => [
      esc(r.day),
      esc(r.symbol),
      esc(r.qty_at_cutoff),
      money(r.estimated_amount),
      money(r.paid_amount),
      num(r.game_score),
      esc(r.status),
    ]),
    "No rights recorded yet. Hold shares through the next noon cutoff.",
  );
  $("payouts").innerHTML = table(
    ["Paid at", "Player", "Shares", "Score", "Per share", "Cash credited"],
    payments.map((r) => [
      time(r.t),
      esc(r.symbol),
      esc(r.qty_held),
      num(r.game_score),
      rate(r.hoop_per_share),
      money(r.amount),
    ]),
    "No cash payouts yet. Payments arrive at day close.",
  );
}
function explorer(url, label) {
  return url && /^https:\/\/explorer\.solana\.com\//.test(url)
    ? `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(label)} ↗</a>`
    : esc(label);
}
async function loadTrades() {
  const rows = await api("/trading/trades?limit=100");
  $("trades").innerHTML = table(
    [
      "Time",
      "Player",
      "Side",
      "Shares",
      "Price",
      "Fee",
      "Reason",
      "Maker",
      "Receipt",
    ],
    rows
      .reverse()
      .map((r) => [
        time(r.t),
        esc(r.symbol),
        esc(r.side),
        esc(r.qty),
        money(r.price),
        money(r.fee),
        esc(r.reason),
        esc(r.counterparty),
        explorer(
          r.receipt_explorer_url,
          !state.receiptsEnabled && r.receipt_status === "pending"
            ? "disabled"
            : r.receipt_status,
        ),
      ]),
  );
}
async function loadBundles() {
  const rows = await api("/trading/bot-bundles?limit=20");
  $("bundles").innerHTML = table(
    ["Time", "Trades", "Shares", "Recorded receipt state", "Inspect"],
    rows.map((r) => [
      time(r.minute_t),
      esc(r.trade_count),
      esc(r.total_volume),
      explorer(
        r.receipt_explorer_url,
        !state.receiptsEnabled && r.receipt_status === "pending"
          ? "disabled"
          : r.receipt_status,
      ),
      `<button data-bundle="${esc(r.bundle_id)}">View trades</button>`,
    ]),
  );
  $("bundles")
    .querySelectorAll("button")
    .forEach(
      (b) =>
        (b.onclick = () =>
          action(b, async () => {
            const r = await api(
              "/trading/bot-bundles/" + encodeURIComponent(b.dataset.bundle),
            );
            $("bundle-detail").innerHTML =
              `<h3>Bundle detail</h3><p>Stored hash matches recorded trades: ${r.hash_matches ? "yes" : "NO"}. This is a local integrity check.</p>` +
              table(
                ["Bot", "Player", "Side", "Shares", "Price"],
                r.trades.map((t) => [
                  esc(t.bot_id),
                  esc(t.symbol),
                  esc(t.side),
                  esc(t.qty),
                  money(t.price),
                ]),
              );
          })),
    );
}
async function loadLeaderboard() {
  try {
    const r = await api(
      "/trading/leaderboard?source=" + $("leader-source").value,
    );
    $("leader-info").textContent =
      `${r.total_players} participating accounts · Source: ${r.source}${r.chain_error ? " · " + r.chain_error : ""}`;
    $("leaderboard").innerHTML = table(
      ["Rank", "Name", "Equity", "P/L", "Return", "Orders", "Verified"],
      r.entries.map((x) => [
        esc(x.rank),
        esc(x.name) + (x.user_id === r.you?.user_id ? " (you)" : ""),
        money(x.equity),
        money(x.total_pnl),
        pct(x.return_pct),
        esc(x.orders),
        x.chain_verified ? "Solana" : "Local ledger",
      ]),
      "Accounts appear after their first trade.",
    );
  } catch (e) {
    $("leader-info").textContent = e.message;
    $("leaderboard").innerHTML = "";
  }
}
$("leader-source").onchange = loadLeaderboard;
$("check-chain").onclick = () =>
  action($("check-chain"), async () => {
    $("chain").textContent = "Checking devnet…";
    $("chain").textContent = JSON.stringify(
      await api("/trading/chain/status"),
      null,
      2,
    );
  });
$("chain-portfolio").onclick = () =>
  action($("chain-portfolio"), async () => {
    $("chain-account").textContent = JSON.stringify(
      await api("/trading/chain/portfolio"),
      null,
      2,
    );
  });
async function loadStatus() {
  const r = await api("/market/status");
  if (state.session && r.session_id !== state.session) {
    state.history = {};
    state.events = [];
    clearAccount();
    notice("The backend restarted. Start a fresh account to continue.", true);
  }
  state.session = r.session_id;
  state.finished = r.finished;
  state.receiptsEnabled = r.receipts_enabled;
  state.t = r.t;
  $("clock").textContent = time(r.t);
  $("runtime").textContent = r.finished
    ? "Replay complete. Restart the backend for a fresh season."
    : `${r.players} players · 1 replay day = ${r.real_seconds_per_historical_day} real seconds · Accounts reset on backend restart.`;
  if (r.last_error) notice("Market paused: " + r.last_error, true);
  setTradingEnabled();
  metrics("system", [
    ["Engine", r.engine],
    ["Solana receipts", r.receipts_enabled ? "Enabled" : "Disabled"],
    ["Chain portfolios", r.chain_portfolios_enabled ? "Enabled" : "Disabled"],
    ["Payouts", r.payouts_enabled ? "Enabled" : "Disabled"],
    ["Shorts / leverage", r.advanced_trading_enabled ? "Enabled" : "Disabled"],
    ["Human payouts", money(r.human_payouts)],
    ["Bot / maker payouts", money(r.institutional_payouts)],
    ["Settlement", r.last_error || "Healthy"],
    ["Replay", r.finished ? "Finished" : "Running"],
  ]);
}
async function refresh() {
  if (refreshing) return;
  refreshing = true;
  try {
    await loadStatus();
    if (!marketSocket || marketSocket.readyState !== WebSocket.OPEN)
      ingest(await api("/market/quotes"));
    const jobs = [];
    if (state.tab === "market") jobs.push(loadValuation());
    if (state.token) {
      jobs.push(accountOverview());
      if (state.tab === "portfolio") jobs.push(loadOrders(), loadEquity());
      if (state.tab === "payouts") jobs.push(loadPayouts());
      if (state.tab === "activity") jobs.push(loadTrades());
    }
    if (state.tab === "activity") jobs.push(loadBundles());
    if (state.tab === "leaderboard") jobs.push(loadLeaderboard());
    const results = await Promise.allSettled(jobs);
    const fail = results.find((r) => r.status === "rejected");
    if (fail) throw fail.reason;
  } finally {
    refreshing = false;
  }
}
async function init() {
  const token = state.token;
  if (!token) clearAccount();
  try {
    state.players = await api("/market/players");
    $("compare-picker").innerHTML = [...state.players]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((p) => `<option value="${esc(p.symbol)}">${esc(p.name)}</option>`)
      .join("");
    $("compare-picker").value = "JOKIC";
    if (!state.players.some((p) => p.symbol === state.selected)) {
      state.selected = state.players[0].symbol;
      state.compare = [state.selected];
    }
    ingest(await api("/market/quotes"));
    const model = await api("/market/model");
    $("model-json").textContent = JSON.stringify(model, null, 2);
    metrics("model", [
      ["Ability update", `${model.ability_alpha * 100}%`],
      ["Recent form update", `${model.form_alpha * 100}%`],
      ["Form contribution", `${model.form_weight * 100}%`],
      ["Form decay / game", model.form_decay],
      ["Payout / score point", money(model.dollars_per_score)],
      ["Required annual return", `${model.annual_required_return * 100}%`],
    ]);
    if (token) {
      try {
        await loadMe();
        connectUser();
      } catch (e) {
        notice(e.message, true);
      }
    }
    connectMarket();
    await refresh();
  } catch (e) {
    notice("Could not load demo: " + e.message, true);
  }
  setInterval(
    () => refresh().catch((e) => notice("Refresh failed: " + e.message, true)),
    3000,
  );
}
init();
