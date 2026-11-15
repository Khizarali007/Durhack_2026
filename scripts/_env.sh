# Shared by scripts/*: repo root, .env and the demo defaults.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
if [ -f .env ]; then set -a; . ./.env; set +a; fi
export MARKET_DAY_SECONDS="${MARKET_DAY_SECONDS:-60}"
export MARKET_BOT_COUNT="${MARKET_BOT_COUNT:-300}"
export MARKET_BOT_FUNDING="${MARKET_BOT_FUNDING:-fixed}"
export MARKET_START_PAUSED="${MARKET_START_PAUSED:-1}"
export SOLANA_RECEIPTS="${SOLANA_RECEIPTS:-auto}"
export PORT="${PORT:-8000}"
PY="$ROOT/.venv/bin/python"
if [ ! -x "$PY" ]; then echo "No .venv yet. Run scripts/setup first." >&2; exit 1; fi
