from __future__ import annotations

import os
import urllib.error
import urllib.request

from _env import load_env


def main() -> int:
    load_env()
    host = os.environ.get("N8N_HOST", "localhost")
    port = os.environ.get("N8N_PORT", "5678")
    secret = os.environ.get("WEBHOOK_SECRET")
    if not secret:
        raise SystemExit("WEBHOOK_SECRET is not set")

    header_name = os.environ.get("WEBHOOK_HEADER_NAME", "X-Webhook-Secret")
    path = os.environ.get("DAILY_PACK_WEBHOOK_PATH", "x-daily-pack-trigger")
    url = f"http://{host}:{port}/webhook/{path}"

    req = urllib.request.Request(url, headers={header_name: secret})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            status = resp.getcode()
        print(f"[webhook] status={status} path={path}")
        return 0 if status < 400 else 2
    except urllib.error.HTTPError as exc:
        print(f"[webhook] error_status={exc.code}")
        return 3


if __name__ == "__main__":
    raise SystemExit(main())

