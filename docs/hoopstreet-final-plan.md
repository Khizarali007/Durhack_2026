# HoopStreet: NBA player stock exchange (DurHack 2026), final plan

This is the team's final decisions, merged from HoopStreet v2 and the grilling design (see `hoopstreet-plan-v3.md` for the history). Who works on what is deliberately left out for now.

- Written Sat 14 Nov 2026.
- Submission deadline: ________ (everything is timed as H+hours from now).
- Items marked **⚠️ Proposed** resolve a clash between two decisions. Confirm or change them.

---

## 0. TL;DR

- Every NBA player is a "stock": **30 teams × their top 10 players = 300 stocks**, priced in HOOP play money.
- Prices come from three things:
  1. **Real performance:** real 2024-25 game logs
  2. **Scripted fake events:** injuries, hot streaks, each with an early warning
  3. **Demand:** an order book with market makers and bots
- We scrape **two real months** of data:
  - Month 1 is shown as past price history.
  - Month 2 is replayed as if it's happening right now.
- You start with 100,000 HOOP. Six guided missions teach investing first and day trading second. **Short selling and 3x leverage are a final "danger zone" mission.**
- Every trade leaves a receipt on Solana devnet.
- **Pitch line:**

  > "Football Index used real money and collapsed. Sorare sells collectible NFTs. Fantasy leagues are about picking a lineup. HoopStreet is a **flight simulator for investing**: no real money, every price is explained, and you're graded on *how* you invest, not just what you made. *Cloudy with a chance of margin calls.*"

## 1. Prize map

| Prize | What we show | Must-have |
|---|---|---|
| **SGX-FX Challenge 2 (main sponsor)** | A game that teaches trading: bid/ask, spread, slippage, fees, limit and stop-loss orders, diversification, plus short and margin as danger-zone missions. Silly: sirens, a shouting trader | Missions + "Why did it move?" + margin call |
| **SGX-FX Challenge 1 (borrowed)** | Spot danger, alert early, understand exposure, profit from the storm | Storm Radar with early warnings + Composition panel + shorting |
| **Main track (theme: Composition)** | **Portfolio Composition:** what's in your basket and how balanced it is. Each price is also *composed* of performance, events and hype | Composition panel + grade. Say "Composition" in the pitch |
| **Best Use of Solana** | Trade receipts on-chain with confirmation time and an explorer link; leaderboard read from the chain | Level 0 minimum, Level 1 target (§7) |
| Gemini | Coach Hoops | After Gate 2 |
| Vultr / Tiger Data / ElevenLabs | Only if they help | §8 |

Main-track judging: Creativity & Innovation, Technical Competence & Execution, Research & Learning, Polish & Completion.

**First hour:**
- Ask SGX-FX whether a Challenge 2 game with Challenge 1 features is judged under one challenge or both.
- Ask the organisers where to submit, the deadline and the demo slot length.

## 2. Data: two real months

- **Source:** real 2024-25 NBA player game logs, scraped **once** into a JSON or SQLite file, so the demo never depends on a live API.
  - Likely tool: the `nba_api` Python package (league-wide player game logs for a date range in one call). Confirm at H+0–1.
  - Scrape early: stats.nba.com sometimes blocks requests.
- **⚠️ Proposed window:** chosen so both big storms land in the right months.

  | | Dates | What happens |
  |---|---|---|
  | **Month 1, shown as history** | ~19 Jan – 18 Feb 2025 | Includes the **Luka Dončić trade to the Lakers** (2 Feb). It ends in the All-Star break |
  | **Month 2, replayed as "live"** | ~19 Feb – 20 Mar 2025 | **Victor Wembanyama is ruled out for the season** (20 Feb), on day 2 of the live replay |

  Verify these dates when scraping.
- **Players:**
  - The top 10 players per team by **minutes played in month 1**: 300 stocks.
  - Team = the team at the **start of month 2**. This matters because the Luka, Anthony Davis and De'Aaron Fox trades happened in month 1.
  - Use 2024-25 rosters throughout. **v2's 18-player 2026-27 list is replaced.**
- **Starting price ("HOOP accordingly"):** each player's opening price comes from their **month-1 average Game Score**. Game Score is a one-number box-score rating: points plus weighted rebounds, assists, steals and blocks, minus misses, turnovers and fouls. Stars start expensive, bench players start cheap. Exact scaling is decided at build time, e.g. `price = 5 × avg Game Score`, with a floor.
- **History candles:**
  - The daily trend in month 1 is real (fair value from rolling Game Score).
  - Minute-by-minute candles *within* each day are generated around it by `generate_history.py`, seeded so everyone gets identical data.

## 3. Clock and replay

- **1 market minute = 5 real seconds.** The UI updates every 0.5 s and a new 1-minute candle forms every 5 s.
- **⚠️ Proposed fix for a clash between decisions 1 and 3:**
  - **The clash:** at 1 minute per 5 s, one real day of month 2 would take two real hours. Real game results would never land during a demo.
  - **The fix:** compress each month-2 day into a **trading session of 12 market minutes** (1 real minute). At the end of each session the **final whistle** sounds: that date's real box scores land, fair values update, and the ticker shows real lines ("SGA 38 pts, 7 ast").
  - **Result:** all of month 2 replays in about 30 real minutes. A 3-minute demo covers about 3 game days.
- The scenario director can **start the replay on any day**. The demo starts the day before the Wembanyama news.
- The UI presents month 2 as live: the last history candle reads "now".

## 4. Price model

The price has two layers.

### 4a. Fair value (fundamentals)
- A rolling average of the player's real Game Score. It updates at each final whistle.
- Good games push it up, slumps pull it down, and missed games (rest, injury) make it decay.
- **Fake events** (scripted, see §5) temporarily shift fair value and start a volatility "storm".

### 4b. Market price: order book plus formula ("some combination")
- **There's a real order book.** Every trade, human or bot, is matched against resting orders. **The price is the last trade.** Humans place market orders at best bid/ask, and from the SHOULD list, limit and stop-loss orders.
- **3 market makers** keep the order book full. Each quotes buy and sell prices around the v2 formula's target:

  `target = fair_value × (1 + pressure)`, and each quote drifts with `κ·(target − quote)·dt + σ·storm·noise`.

  - Each market maker uses a slightly different spread and noise level, so there are 3 competing quotes and a visible best bid and best ask (SGX-FX's "best price from many banks" idea).
  - `pressure` rises with recent net buying (`λ·∑qty`) and fades over time, so buying pushes prices up and pumping fades.
- **Bots** trade against the market makers and against humans:
  - **Hype chaser:** buys what's rising. Creates bubbles.
  - **Panic seller:** dumps players on injuries, slumps and early warnings. Creates storms.
  - **About 20 noise traders:** random, momentum and contrarian. They keep the tape moving with only 1–2 humans playing.
- **Build order:**
  1. Order book + market makers
  2. Hype chaser + panic seller
  3. Noise traders

## 5. Events: real plus scripted, with early warnings

- **Real events** come from the data:
  - Games played and stats, which move fair value at the final whistle
  - Real absences (DNPs)
  - The Luka trade (in the history)
  - **Wembanyama ruled out for the season** (live)
- **Fake events** come from the **scenario director's** scripted JSON timeline, plus a random mode for free play:
  - `{"day": 2, "minute": 6, "symbol": "WEMB", "kind": "injury", "impact": -0.25, "storm": 5, "headline": "..."}`
  - Event kinds: injury, hot streak, rest day, trade rumour.
- **Every injury gets an early warning 20–40 seconds earlier** ("listed questionable", "minutes dropping"). The Storm Radar turns cloudy. That's the SGX "early warning" story.
- **Wembanyama storm (the demo's centrepiece):**
  1. A scripted early warning
  2. Then the real ruling-out
  3. Price gaps down, Spurs holders get hit, and the panic seller dumps
  4. Headline: "Wembanyama ruled out for the season". **Keep it factual and leave out medical detail.**
- Fake headlines about real people stay mild: soreness, rest day, hot streak. No off-court or legal events. No NBA logos or headshots: use initials and team colours.

## 6. The learning layer

### Six guided missions
Each mission is a 30–60 second scenario with a goal, a hint and a debrief.

1. **Buy low, sell high.** A hot streak.
2. **Read the spread.** Market vs limit order: compare the fills against the 3 market makers.
3. **Compose your portfolio.** You hold three Spurs. Rebalance before the storm and watch your Composition grade change. *(Main-track mission.)*
4. **Hype vs fundamentals.** A player is pumped far above fair value. Chase it or wait? Watch the price drift back to fair value.
5. **Survive the storm.** An early warning appears. Set a stop-loss and cut exposure.
6. **Danger zone.** Short the injured player to profit from the storm, then get margin-called at 3x. Debrief: "this is why leverage wipes out beginners".

### Always on
- **Price vs fair value** on every player card ("Price 42 · Fair value 35 · +20% hype").
- **"Why did it move?"** chip, showing the latest final whistle, event or buying pressure.
- **Portfolio Composition panel:** % by team and by player, and a grade from A to F.
- **Storm Radar:** a weather icon per player.
- **"?" tooltips** on every jargon term, plus a glossary drawer.
- **Report card** after each mission and each session, with four grades:
  1. Composition
  2. Storm handling
  3. Hype discipline
  4. Return, max drawdown, win rate, best/worst trade, and "your biggest mistake"
- **Coach Hoops (Gemini):** one button returns 3 friendly bullets about your portfolio.
- Silliness is part of the score: sirens, trading-floor shouting, weather-forecast copy.

## 7. Solana

How we use it, in three levels. Each level works even if the next one fails.

- **Level 0 (receipts):**
  - After each trade, the backend writes a short note onto Solana: who traded what, how much, and at what price.
  - The app shows "confirmed on Solana in 0.6 s" with a link to a public page where anyone can see it.
  - Takes a couple of hours and needs no Rust.
- **Level 1 (real portfolios):**
  - A small Solana program holds each player's cash and holdings as an on-chain account.
  - The leaderboard reads from the chain rather than from our database.
- **Level 2 (stretch):**
  - Each player gets their own mini-market on-chain, so buying genuinely moves the price there.
  - Only attempted if Level 1 is done by about H+12.

**Setup:**
- Solana's devnet is a free test network where the coins are worthless.
- Players never touch real money, and with "Play as guest" they don't even need a wallet.

**What it gets us:**
- **The Solana prize.** This is the main reason. "Best Use of Solana" needs real on-chain activity, and Level 0 alone counts.
- **Proof.** A judge can trade on their phone and click through to see their own trade on a public explorer. That's a much stronger demo moment than a progress bar.
- **A leaderboard nobody can fake.** At Level 1, even we can't edit it.
- **A realistic feel.** Trades have receipts and confirmation times, like a real exchange.

**Rules:**
- **Human trades:** one receipt each.
- **Bot trades:** bundled into **one receipt per market minute**, about 12 a minute.
  - With 300 stocks, a minute's bot trades won't fit in one transaction.
  - The bundle stores the **count, total volume and a hash of the trade list**. The full list stays in our database and can be matched against the hash.
- The backend key signs and pays fees. **Claim devnet SOL at H+0–1**, because the faucet limits how much you can claim.
- **Trades never wait for Solana.** They complete instantly and show "⏳ settling", then "✓ confirmed". A background queue retries failures, and the database is the source of truth.
- Pitch honestly: "prices come from our engine; the trades, balances and leaderboard are real devnet state."

## 8. Stack and tools

| Tool | Verdict |
|---|---|
| **Python + FastAPI** backend, WebSocket at 2 Hz | Core |
| **React + lightweight-charts** frontend | Core |
| **SQLite** | Core database. It holds the game logs, candles, events, orders, accounts and trades |
| **Gemini** | Added: Coach Hoops and optional headline copy. Call it from the server, cache results, and fall back to templates |
| **Vultr** | Optional: a public https/wss URL so judges can join by QR code. Alternatives: a Cloudflare tunnel or Render/Fly. Always keep a localhost fallback |
| **Tiger Data** | Optional. Keep all database access in one module so swapping is quick |
| **ElevenLabs** | Lowest priority. The browser's built-in `speechSynthesis` covers it |

**Accounts:**
- Username and password, with passwords hashed.
- "Play as guest" for judges.
- Each account gets a devnet keypair that the server holds keys for.

**Architecture:**
```
nba_api scrape (once) -> SQLite (game logs) -> fair values + month-1 history candles -> /candles API --+
Scenario director (real final whistles + scripted events) --+                                          |
Bots + 3 market makers -------------------------------------+--> ORDER BOOK + PRICE ENGINE (2 Hz) -WS-> React UI
Human orders (REST) ----------------------------------------^       |
                                                                    +--> new 1m candles -> SQLite
                                                                    +--> Solana devnet queue (receipts / portfolios)
```

## 9. Scope

### MUST (Gate 1, H+4)
- Scraped data in SQLite: 300 players and starting prices
- Chart showing month-1 history plus the live candle
- Order book with 3 market makers
- Market buy/sell with 100,000 HOOP
- Portfolio screen
- Price vs fair value on cards
- Search and filter by team (300 stocks need it)
- "Why did it move?"
- Mission 1

### SHOULD
- **Gate 2 (H+8):**
  - Solana Level 0
  - Accounts and guest mode
  - Final-whistle sessions
  - Scenario director with early warnings
  - Hype chaser and panic seller
  - Limit and stop-loss orders
  - Fees, spread and slippage shown
  - Composition panel
- **Gate 3 (H+14):**
  - Missions 2–6, including the danger zone (short + 3x margin call)
  - Storm Radar
  - Report card
  - Noise traders
  - Leaderboard
  - Solana Level 1

### STRETCH, in order
1. Coach Hoops
2. QR join for judges (Vultr or a tunnel)
3. Sirens and voice
4. Trading halts after a 20% move
5. Solana Level 2
6. Tiger Data
7. ElevenLabs

### OUT
- Phantom wallets
- Real money
- Live (2026-27) data

## 10. Timeline

| When | Goal |
|---|---|
| H+0–1 | Repo; **scrape the two months**; claim devnet SOL; Solana Playground wallet; the §1 questions |
| **Gate 1: H+4** | MUST list working end-to-end. If not, cut everything else |
| **Gate 2: H+8** | Solana Level 0, events, accounts, order types, Composition |
| Sleep in shifts | No planned work 02:00–07:00 |
| **Gate 3: H+14** | All 6 missions, Radar, report card, Level 1 if it's going well |
| Deadline −6h | Feature freeze. Deploy or confirm the localhost fallback, backup demo video, Devpost text |
| Deadline −2h | Submit. Stop touching code |

## 11. Three-minute demo script ("Storm Night")

| Time | What happens |
|---|---|
| **0:00** | Hook: *"Cloudy with a chance of margin calls."* 100k HOOP, 300 players, a month of history on the chart |
| **0:20** | **Market:** the live candle is forming. A card shows price vs fair value. A judge joins (QR code or guest) and buys, and the price moves. Their receipt shows "confirmed on Solana in 0.6 s" with an Explorer link |
| **0:50** | **Composition:** our portfolio is 60% Spurs and the panel shows a D. *"Composition: what's in your basket matters."* |
| **1:10** | **Storm:** an early warning for Wembanyama and the Radar goes cloudy. Then the final whistle and "Wembanyama ruled out for the season". Siren, the price gaps down, and the panic seller dumps. The stop-loss holder survives, the 3x trader is margin-called, the short makes money, and the all-Spurs portfolio gets hit hardest |
| **1:50** | **Real performance:** the final whistle lands real box scores, and a big night pushes another player's fair value and price up. *"Prices follow real games."* Leaderboard read from the chain |
| **2:20** | **Learning:** mission debrief and report card (composition, storm handling, hype discipline, return), plus Coach Hoops. Close: *"Point the scraper at tonight's games and it's live."* |

## 12. Risks and fallbacks

| Risk | Fallback |
|---|---|
| The scrape is blocked or slow | Scrape at H+0–1 and save the file in the repo. As a last resort, use a Kaggle CSV for 2024-25 game logs |
| Devnet slow or down | Optimistic UI and a queue of pending confirmations. Level 0 still works |
| Venue wifi dies | Run everything on one laptop on localhost, plus a backup video |
| Judge asks "is this live?" | "It's a replay of real February 2025 games presented as live, with scripted events on top. Point the scraper at tonight's games and it is live." Answer honestly. Pretending it's real-time and being caught out costs more than it gains |
| 300 stocks clutter the UI | Team filter, search, and a "Top movers" view as the default screen |
| Rust blocks Level 1 | Stay on Level 0 |
| Judges think shorting and leverage teach gambling habits | It's the last mission, and its debrief is *why not to* |
| Scope creep | Gates. After Gate 1, everything is optional |

## 13. Still to check

- [ ] SGX-FX Challenge 2 wording (it wasn't in the opening-deck text).
- [ ] Exact dates: Luka trade, Wembanyama ruling, 2025 All-Star break. Adjust the window to fit.
- [ ] That `nba_api` returns league-wide game logs for a date range (otherwise loop per team).
- [ ] Submission platform, deadline, demo slot length.
- [ ] Confirm the two ⚠️ Proposed items: the window (§2) and 12-market-minute sessions (§3).

**Primers:** v2's NBA, trading and blockchain primers still apply. Its 18-stock list is replaced by the 300-player list from the scrape.
