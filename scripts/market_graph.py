"""Serve the simulated NBA market as a local animated replay graph."""

from __future__ import annotations

import argparse
import csv
import json
from collections import defaultdict
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

ROOT = Path(__file__).resolve().parents[1]


def load_prices(path: Path) -> tuple[list[dict], dict[str, list[dict]]]:
    by_player: dict[str, list[dict]] = defaultdict(list)
    players = {}
    with path.open(newline="", encoding="utf-8") as file:
        for row in csv.DictReader(file):
            player_id = row["player_id"]
            players[player_id] = {
                "id": player_id,
                "name": row["player_name"],
                "team": row["team"],
            }
            by_player[player_id].append({
                "date": row["date"],
                "open": float(row["open"]),
                "high": float(row["high"]),
                "low": float(row["low"]),
                "close": float(row["close"]),
                "fair": float(row["fair_value"]),
                "volume": int(row["volume"]),
                "trades": int(row["trades"]),
                "gameScore": float(row["game_score"]) if row["game_score"] else None,
                "news": row["news"],
            })
    if not by_player:
        raise ValueError(f"No market prices found in {path}")
    return sorted(players.values(), key=lambda p: p["name"]), by_player


def handler_for(players: list[dict], prices: dict[str, list[dict]], values: list[dict]):
    html = (ROOT / "web" / "market_graph.html").read_bytes()
    values_html = (ROOT / "web" / "starting_values.html").read_bytes()

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            request = urlparse(self.path)
            if request.path == "/":
                body, content_type, status = html, "text/html; charset=utf-8", 200
            elif request.path == "/values":
                body, content_type, status = values_html, "text/html; charset=utf-8", 200
            elif request.path == "/api/players":
                body = json.dumps(players).encode()
                content_type, status = "application/json", 200
            elif request.path == "/api/values":
                body = json.dumps(values).encode()
                content_type, status = "application/json", 200
            elif request.path == "/api/prices":
                player_id = parse_qs(request.query).get("player_id", [""])[0]
                if player_id not in prices:
                    body, status = b'{"error":"Unknown player"}', 404
                else:
                    body, status = json.dumps(prices[player_id]).encode(), 200
                content_type = "application/json"
            else:
                body, content_type, status = b"Not found", "text/plain", 404
            self.send_response(status)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

    return Handler


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--prices", type=Path, default=ROOT / "data/market_daily_prices.csv")
    parser.add_argument("--values", type=Path, default=ROOT / "data/starting_values_2024_25.csv")
    parser.add_argument("--port", type=int, default=8765)
    args = parser.parse_args()
    players, prices = load_prices(args.prices)
    with args.values.open(newline="", encoding="utf-8") as file:
        values = list(csv.DictReader(file))
    server = ThreadingHTTPServer(("127.0.0.1", args.port), handler_for(players, prices, values))
    print(f"Market replay: http://127.0.0.1:{args.port} ({len(players)} players)", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
