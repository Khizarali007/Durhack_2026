"""Command-line entry point for the shared NBA market replay."""
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
from market.core import *  # Re-export for existing scripts and model checks.

if __name__ == "__main__":
    main()
