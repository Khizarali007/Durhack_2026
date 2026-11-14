# Running the backend

How to start, check and stop the HoopStreet backend (FastAPI, the market, trading and Solana). Run every command **from the repository root**. This guide is adapted for the
`integration/person1-person2` branch; see [integration details](backend-integration.md).

The live prototype uses all 580 historical players and resets accounts and market
state together on restart. Performance payouts are enabled; shorts and leverage remain disabled. Solana
is off by default. Equity history and the local leaderboard are enabled.

## What "the server" is

One process that runs everything:
- the historical LiveMarket engine
- accounts and trading
- Solana receipts and on-chain portfolios
- live WebSocket updates

It runs in a terminal and keeps going until you stop it. Nothing runs on its own, so **start it whenever you need the backend**: trying endpoints, while the frontend is being built against it, or for the demo.

## First time only: set up

```bash
cd /path/to/Durhack_2026
```

```bash
python3 -m venv .venv
```

```bash
source .venv/bin/activate
```

```bash
pip install -r backend/requirements-trading.txt
```

The Solana fee-payer wallet (`.solana/fee-payer-keypair.json`) is created on first use. It's git-ignored and must never be committed. To check it's funded:

```bash
python backend/trading/chain/setup_wallet.py
```

## Start the local prototype

Open a terminal and run these one after another:

```bash
cd /path/to/Durhack_2026
```

```bash
source .venv/bin/activate
```

```bash
SOLANA_RECEIPTS=off MARKET_DAY_SECONDS=60 uvicorn main:app --app-dir backend
```

For optional Solana receipts and portfolio syncing (requires a funded devnet fee
payer and a deployed program), explicitly set both:

```bash
SOLANA_RECEIPTS=on SOLANA_PORTFOLIO_PROGRAM_ID=9FRpF58Q1rJFUFVAqrPWxQC54iFYunHsXj927vDrHBFp uvicorn main:app --app-dir backend
```

- It's up when it prints `Uvicorn running on http://127.0.0.1:8000`.
- Open **http://127.0.0.1:8000/docs** to try every endpoint. Use **Authorize** to paste a session token.
- `--reload` restarts the server when you save a code file. Leave it off for the demo.
- **Stop it with Ctrl+C** in that terminal.

### About the `export` line

It switches on **Level 1** (each player's portfolio stored on Solana, and the leaderboard read back from the chain, P2-18).
- **It only lasts for that terminal window.** In a new terminal, run it again before `uvicorn`.
- Without it the server still works fine. The leaderboard just stays off-chain (`"source": "off-chain"`).
- The program id is public, so it's safe to share. It's the program deployed on devnet from Solana Playground (see `backend/trading/chain/program/README.md`).

Shortcut, all on one line (nothing to remember for the next terminal):

```bash
SOLANA_RECEIPTS=on SOLANA_PORTFOLIO_PROGRAM_ID=9FRpF58Q1rJFUFVAqrPWxQC54iFYunHsXj927vDrHBFp uvicorn main:app --app-dir backend --reload
```

## Other ways to start it

**Without Solana at all** (offline, on a train, or devnet is down). Trades work, and order responses report receipts as `disabled` (stored receipt records remain pending):

```bash
SOLANA_RECEIPTS=off uvicorn main:app --app-dir backend --reload
```

**On another port** (if 8000 is taken):

```bash
uvicorn main:app --app-dir backend --reload --port 8001
```

**Reachable from phones on the same Wi-Fi** (judges joining). Then use `http://<your laptop's IP>:8000`:

```bash
uvicorn main:app --app-dir backend --host 0.0.0.0
```

**With a throwaway database** (a clean slate that doesn't touch `data/trading.sqlite`):

```bash
TRADING_DB_PATH=:memory: uvicorn main:app --app-dir backend --reload
```

## Check it's working

| Check | How | Expect |
|---|---|---|
| Server up | open http://127.0.0.1:8000/trading/health | `"status": "ok"`, market time ticking |
| Solana ready | open http://127.0.0.1:8000/trading/chain/status | `"reachable": true, "ready": true` |
| Level 1 on | make a guest (`POST /trading/guest`), trade (`POST /trading/orders`), then `GET /trading/chain/portfolio` with its token | `"enabled": true`, then `"in_sync": true` a few seconds later |
| Leaderboard from the chain | `GET /trading/leaderboard` once someone has traded | `"source": "chain"`, rows with `"chain_verified": true` |

If the leaderboard says `"source": "off-chain"`, its `chain_error` says why: Level 1 isn't on, nothing has synced yet, or devnet didn't answer.

## Run the tests

```bash
PYTHONPATH=backend python -m pytest backend/market/tests backend/trading/tests tests
```

The tests never touch real devnet. To also check against real devnet (sends a few transactions, which cost worthless devnet SOL):

```bash
HOOP_DEVNET_TESTS=1 SOLANA_PORTFOLIO_PROGRAM_ID=9FRpF58Q1rJFUFVAqrPWxQC54iFYunHsXj927vDrHBFp python -m pytest backend/trading -k devnet
```

## Settings (environment variables)

All optional. Set them before `uvicorn` with `export NAME=value`, or put them in front of the command.

| Variable | Default | What it does |
|---|---|---|
| `SOLANA_PORTFOLIO_PROGRAM_ID` | unset (Level 1 off) | The deployed portfolio program. Switches on on-chain portfolios and the chain leaderboard |
| `SOLANA_RECEIPTS` | `off` for LiveMarket | `off` runs without Solana (no receipts, no Level 1) |
| `SOLANA_RPC_URL` | `https://api.devnet.solana.com` | A faster dedicated devnet RPC (e.g. Helius) for the demo |
| `SOLANA_STATUS_INTERVAL_S` | `2` | How often receipts are checked. Lower it (e.g. `0.5`) with a dedicated RPC for faster "confirmed" |
| `SOLANA_PORTFOLIO_SYNC_S` | `3` | How often changed portfolios are pushed on-chain |
| `SOLANA_FEE_PAYER_KEYPAIR` | `.solana/fee-payer-keypair.json` | Which wallet signs and pays |
| `TRADING_DB_PATH` | ignored by LiveMarket | LiveMarket always uses an in-memory account DB; other engines can use this setting |

## Common problems

| Problem | Fix |
|---|---|
| `address already in use` | Something is already on port 8000: another server you left running, or Person 4's dev app. Stop it (Ctrl+C in its terminal) or add `--port 8001` |
| `ModuleNotFoundError` (fastapi, solana…) | The virtual environment isn't active. Run `source .venv/bin/activate` |
| Can't import `main` | You're not in the repo root, or forgot `--app-dir backend` |
| Receipts stuck on `pending` | Devnet is slow or rate-limiting. Check `/trading/chain/status`. For the demo, use a dedicated RPC (`SOLANA_RPC_URL`) |
| Fee payer running low | `python backend/trading/chain/setup_wallet.py` shows the balance. Top up at https://faucet.solana.com (`solana airdrop` no longer works on devnet) |
| Leaderboard never says `chain` | Check `SOLANA_PORTFOLIO_PROGRAM_ID` was exported **in the same terminal** as `uvicorn`, and that receipts aren't `off` |

## On-chain format and verification limits

The current program holds at most 16 positions and symbols of at most 8 bytes.
Some LiveMarket tickers exceed that limit. Such portfolios are not partially
synced: local standings remain the complete source, and automatic leaderboard
selection falls back with an explicit reason. `source=chain` returns 503 when
current portfolios cannot be represented. Existing chain snapshots can lag.

Person 2 reports the program above deployed on devnet; this merge was validated
with mocked chain tests, not a fresh deployment or live transaction. The program
stores backend-written portfolio snapshots, not independently executed on-chain
trades. Prices for ranking still come from the backend market.

At the default accelerated replay speed, a tick advances 12 historical minutes.
Equity recording and leaderboard updates therefore occur on each available tick,
not every intervening historical minute. No missing observations are fabricated.
