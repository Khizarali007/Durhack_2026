# HoopStreet portfolio program (Level 1, P2-18)

`lib.rs` is a small Anchor program. It holds one `Portfolio` account per player on Solana devnet: cash, up to 16 holdings, trade count and equity.
- Only the backend's fee-payer key can write to it.
- Every update carries a sequence number that must go up.

The backend syncs each player's real account to it every few seconds when something changed, and the leaderboard can read it back (`GET /trading/leaderboard`, `chain_verified` rows).

**Deployed on devnet:** program id `9FRpF58Q1rJFUFVAqrPWxQC54iFYunHsXj927vDrHBFp`
([Explorer](https://explorer.solana.com/address/9FRpF58Q1rJFUFVAqrPWxQC54iFYunHsXj927vDrHBFp?cluster=devnet)).
Redeploy only if `lib.rs` changes.

## Deploy it (about 5 minutes, in the browser)

1. Open **https://beta.solpg.io** and create a new project. Choose **Anchor (Rust)**.
2. Replace the contents of `src/lib.rs` with this folder's `lib.rs`.
3. Bottom left, click **Not connected** to create the Playground wallet. Check the cluster says **devnet**.
4. Get devnet SOL for that wallet. Deploying needs about 2–3 SOL of rent, which is worthless test money.
   - Devnet's built-in airdrop is closed, so `solana airdrop` fails ("The RPC faucet is closed").
   - Paste the wallet address into https://faucet.solana.com, or send SOL from the backend's fee payer.
   - The first deploy was funded with 3 SOL from the fee payer.
5. Click **Build**. Playground fills in `declare_id!` with the new program id.
6. Click **Deploy** and wait for "Deployment successful".
7. Copy the **program id** (Build & Deploy tab, or `declare_id!` in `lib.rs`).

The Playground wallet only pays for the deploy. It doesn't need to be the backend's fee payer: the program trusts whichever key creates each portfolio, and that's always the backend.

## Switch it on in the backend

```bash
export SOLANA_PORTFOLIO_PROGRAM_ID=9FRpF58Q1rJFUFVAqrPWxQC54iFYunHsXj927vDrHBFp
uvicorn main:app --app-dir backend --reload
```

The `export` only lasts for that terminal window. The full run guide is `docs/running-the-backend.md`.

Receipts must be on (the default). The syncer shares their devnet connection. Check it with:

```bash
HOOP_DEVNET_TESTS=1 SOLANA_PORTFOLIO_PROGRAM_ID=9FRpF58Q1rJFUFVAqrPWxQC54iFYunHsXj927vDrHBFp python -m pytest backend/trading/tests/test_chain_portfolios.py -k devnet
```

## Costs

| What | Cost (devnet SOL, worthless) |
|---|---|
| Creating a player's portfolio | about 0.0034 rent + 0.000005 fee, once per player |
| Each update | 0.000005 |

At most one update per player every 3 seconds, so even a busy demo costs a few hundredths of a SOL.
