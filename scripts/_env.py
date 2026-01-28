from __future__ import annotations

import os
from pathlib import Path
from typing import Dict


def _parse_env_file(path: Path) -> Dict[str, str]:
    values: Dict[str, str] = {}
    if not path.exists():
        return values
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip()
    return values


def load_env() -> Dict[str, str]:
    """Load .env from repo root into os.environ (non-destructive)."""
    root = Path(__file__).resolve().parents[1]
    env_path = root / ".env"
    file_values = _parse_env_file(env_path)
    for key, value in file_values.items():
        os.environ.setdefault(key, value)
    return file_values

