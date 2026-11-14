# Person 2 ↔ Person 1: what's confirmed and what's still a guess

Person 2 builds against a fake market until Person 1's engine has a live API:
- `backend/trading/market_contract.py`: the interface
- `backend/trading/fake_market.py`: the fake
- `backend/trading/market_provider.py`: the switch

The fake now copies Person 1's prototype (`scripts/simulate_market.py` on `person-1-tasks`). For each **question**, reply with an answer or "✅ as guessed".

## Confirmed by Person 1's prototype (copied into the fake)
- Integer cents internally. Opening price `max(10, 5 × expected Game Score)` HOOP.
- 3 market makers per player, each with 100,000 HOOP and 150 shares.
- Quotes centred on fair value, skewed by maker inventory, with maker offsets −0.7 / 0 / +0.7% and spreads 2.0 / 2.5 / 3.0%.
- A maker can't quote a side it can't afford (no cash → no bid, no shares → no ask).
- **The price is the last executed trade.** Results and injury reports move fair value, never the price directly.
- Fair value = 5 HOOP × projected Game Score × injury factor.
- Bots with value, momentum, casual, risk-averse, news and contrarian styles.
- No persistent limit-order book. So **limit and stop orders are Person 2's job** (Person 2 watches ticks and sends market orders).

## Also following Person 4's conventions (docs/person4-interfaces.md)
- Market time `t` is epoch seconds (float), running 12× real time.
- Prices cross between people as floats in HOOP. Players are addressed by `symbol` (str).

## Questions for Person 1
1. **Tickers.** You key players by ESPN `player_id`. Person 4 and the frontend use symbols like `SGA`, `WEMBY`. Can you add a `symbol` per player? Person 2's `Player` carries `player_id`, `symbol`, `name`, `team` and `start_price`.
2. **Human orders.** `Market.trade(trader, side, qty)` takes a bot-style `Trader` with cash and holdings. Person 2 guessed a wrapper instead: `submit_order(account_id, symbol, side, qty) -> OrderResult` (fills with `order_id, symbol, side, qty, price, counterparty, t`; status `filled | partially_filled | rejected`; `remaining_qty`; `reason`). Person 2 tracks the human's cash and holdings, so the engine doesn't need to. Does that work for you?
3. **Big orders.** `trade()` fills everything at one maker's price, capped by that maker's shares. Person 2's fake fills in 10-share chunks, re-quoting between chunks and moving to the next maker, so a big order gets gradual slippage. Can your wrapper do the same, or should Person 2 loop in chunks?
4. **Shorting.** Can a human sell shares they don't hold? To the engine it's just a sell (the maker buys with cash). Person 2 tracks the negative position and collateral.
5. **Maker inventory.** 150 shares × 3 makers = 450 shares per player. One judge buying 500 shares empties the asks, and the fake then returns `partially_filled`. Is that intended for the demo, or should makers restock?
6. **Live clock and events.** The prototype is a daily batch. For the live game, Person 2 expects:
   - `MarketTick(t, quotes)` every 0.5 s with all quotes (bid, ask, last, fair value, each maker's bid/ask/shares)
   - `BotTradeSummary(minute_t, count, total_volume, trades)` once per market minute, for the Solana bundle receipt
   - delivered through `subscribe() -> asyncio.Queue`, with the engine running as `await engine.run()`

   Does that shape work? When will the 12-market-minute sessions and the final whistle land?
7. **Demo resets.** If the market restarts or "starts on day N", should users' portfolios reset too?
8. **Shared backend.** Person 2 started `backend/main.py` (FastAPI) and owns `backend/trading/`. Is it OK for your engine to be its own package in `backend/` and for us to share `main.py`?
9. **Performance payouts.** Your target design says holders earn HOOP from future performances. Person 2 credits and records them, so needs to know:
   - **When** a payout happens: each revealed box score, each final whistle, or once a day.
   - **How much:** e.g. a fixed HOOP per Game Score point per share, and whether bad games (low or negative Game Score) pay zero or take money away.
   - **How the engine announces it.** Person 2's guess is an event `PerformancePayout(t, symbol, hoop_per_share, game_score, reason)` on the same `subscribe()` queue. Person 2 then pays every human holder. Your bots and makers would get theirs inside the engine.
   - **Short sellers:** should they pay the payout, like dividends on a real stock? Person 2 plans to do that.
   - **Prices:** should a payout affect fair value (the price drops by about the payout after it's paid, as with real dividends)?
