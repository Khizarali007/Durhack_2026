"""Validate every scenario JSON file against the schema and our content rules.

Usage (from the repo root, venv active):
    python scenarios/check_scenarios.py            # all scenarios/*.json
    python scenarios/check_scenarios.py path.json  # specific files

Exit code 0 if everything passes, 1 otherwise.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from learning.scenario import check_file, scenario_files  # noqa: E402


def main(argv: list[str]) -> int:
    paths = [Path(a) for a in argv] if argv else scenario_files()
    if not paths:
        print("no scenario files found")
        return 1
    failed = 0
    for path in paths:
        problems = check_file(path)
        if problems:
            failed += 1
            print(f"FAIL {path.name}")
            for p in problems:
                print(f"  - {p}")
        else:
            print(f"ok   {path.name}")
    print(f"\n{len(paths) - failed}/{len(paths)} scenario(s) passed")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
