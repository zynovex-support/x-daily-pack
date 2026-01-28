from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Dict, Optional

from _env import load_env
from probe_daily_pack import ProbeResult, run_probe


ROOT = Path(__file__).resolve().parents[1]


def _utc_now_iso() -> str:
    return dt.datetime.now(tz=dt.timezone.utc).isoformat(timespec="seconds")


def _severity(result: ProbeResult) -> str:
    if result.issues:
        return "ISSUES"
    if result.warnings:
        return "WARNINGS"
    return "OK"


def _signature(result: ProbeResult) -> str:
    payload = {
        "severity": _severity(result),
        "issues": result.issues,
        "warnings": result.warnings,
        "actual_cron": result.actual_cron,
        "success_rate": round(result.success_rate, 4),
        "last_success_started_at": result.last_success_started_at,
    }
    raw = json.dumps(payload, sort_keys=True, ensure_ascii=True)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:16]


def _state_path() -> Path:
    override = os.environ.get("PROBE_NOTIFY_STATE_PATH")
    return Path(override) if override else ROOT / "logs" / "probe-notify-state.json"


def _load_state(path: Path) -> Dict[str, str]:
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}


def _save_state(path: Path, state: Dict[str, str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(state, indent=2, sort_keys=True), encoding="utf-8")


def _cooldown_minutes() -> int:
    raw = os.environ.get("PROBE_NOTIFY_COOLDOWN_MINUTES", "120")
    try:
        return max(1, int(raw))
    except ValueError:
        return 120


def _within_cooldown(last_ts: Optional[str], minutes: int) -> bool:
    if not last_ts:
        return False
    try:
        last = dt.datetime.fromisoformat(last_ts)
    except ValueError:
        return False
    if last.tzinfo is None:
        last = last.replace(tzinfo=dt.timezone.utc)
    now = dt.datetime.now(tz=dt.timezone.utc)
    delta = now - last.astimezone(dt.timezone.utc)
    return delta.total_seconds() < minutes * 60


def _build_message(result: ProbeResult, signature: str) -> str:
    sev = _severity(result)
    lines = [
        f"[Probe:{sev}] X Daily Pack health check",
        f"time_utc: {_utc_now_iso()}",
        f"workflow_id: {result.workflow_id}",
        f"cron: expected='{result.expected_cron}' live='{result.actual_cron}'",
        (
            "success_rate: "
            f"{result.success_rate:.2f} ({result.success_count}/{result.executions_count})"
        ),
        f"last_success_startedAt: {result.last_success_started_at}",
        (
            "last_success_age_hours: "
            + (
                f"{result.last_success_age_hours:.2f}"
                if result.last_success_age_hours is not None
                else "None"
            )
        ),
        f"slack_last_success_ok: {result.slack_last_success_ok} message_ts: {result.slack_message_ts}",
        f"signature: {signature}",
    ]

    if result.issues:
        lines.append("issues:")
        lines.extend(f"- {issue}" for issue in result.issues[:8])
    if result.warnings:
        lines.append("warnings:")
        lines.extend(f"- {warning}" for warning in result.warnings[:8])

    lines.append("runbook:")
    lines.append("- npm run deploy")
    lines.append("- npm run drift-check")
    lines.append("- npm run probe")
    lines.append("- npm run trigger:webhook")

    return "\n".join(lines)


def _slack_enabled() -> bool:
    raw = os.environ.get("PROBE_NOTIFY_SLACK_ENABLED", "true").strip().lower()
    return raw not in {"0", "false", "no", "off"}


def _telegram_enabled() -> bool:
    # Respect TELEGRAM_ENABLED unless explicitly overridden.
    override = os.environ.get("PROBE_NOTIFY_TELEGRAM_ENABLED")
    if override is not None:
        return override.strip().lower() not in {"0", "false", "no", "off"}
    return os.environ.get("TELEGRAM_ENABLED", "").strip().lower() == "true"


def _slack_post(text: str) -> str:
    token = os.environ.get("SLACK_BOT_TOKEN")
    channel = os.environ.get("SLACK_CHANNEL_ID")
    if not token or not channel:
        raise RuntimeError("SLACK_BOT_TOKEN or SLACK_CHANNEL_ID is not set")

    body = json.dumps({"channel": channel, "text": text}).encode("utf-8")
    req = urllib.request.Request(
        "https://slack.com/api/chat.postMessage",
        data=body,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json; charset=utf-8",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.load(resp)
    if not data.get("ok"):
        raise RuntimeError(f"Slack API chat.postMessage failed: {data.get('error')}")
    return str(data.get("ts"))


def _telegram_post(text: str) -> None:
    token = os.environ.get("TELEGRAM_DAILY_BOT_TOKEN")
    chat_id = os.environ.get("TELEGRAM_DAILY_CHAT_ID")
    if not token or not chat_id:
        raise RuntimeError("TELEGRAM_DAILY_BOT_TOKEN or TELEGRAM_DAILY_CHAT_ID is not set")

    url = f"https://api.telegram.org/bot{token}/sendMessage"
    payload = urllib.parse.urlencode({"chat_id": chat_id, "text": text}).encode("utf-8")
    req = urllib.request.Request(url, data=payload, method="POST")
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.load(resp)
    if not data.get("ok"):
        raise RuntimeError(f"Telegram sendMessage failed: {data}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Run probe and send notifications on issues/warnings")
    parser.add_argument(
        "--send",
        action="store_true",
        help="Actually send notifications (default is dry-run)",
    )
    parser.add_argument(
        "--notify-on-warnings",
        action="store_true",
        help="Send notifications when only warnings are present",
    )
    args = parser.parse_args()

    load_env()
    result = run_probe()
    sev = _severity(result)
    sig = _signature(result)
    message = _build_message(result, sig)

    print("[probe-notify] severity:", sev, "signature:", sig)
    print("[probe-notify] send_enabled:", args.send)

    should_notify = bool(result.issues) or (args.notify_on_warnings and bool(result.warnings))
    if not should_notify:
        print("[probe-notify] no issues (and warnings not configured to notify)")
        return 0

    state_path = _state_path()
    state = _load_state(state_path)
    cooldown = _cooldown_minutes()
    last_sig = state.get("last_signature")
    last_ts = state.get("last_sent_at")

    if last_sig == sig and _within_cooldown(last_ts, cooldown):
        print(
            "[probe-notify] duplicate signature within cooldown:",
            f"cooldown_minutes={cooldown}",
            f"last_sent_at={last_ts}",
        )
        return 2 if result.issues else 1

    if not args.send:
        print("[probe-notify] DRY_RUN message:\n")
        print(message)
        return 2 if result.issues else 1

    slack_ts = None
    if _slack_enabled():
        try:
            slack_ts = _slack_post(message)
            print("[probe-notify] slack_sent_ts:", slack_ts)
        except Exception as exc:  # pragma: no cover - network variability
            print("[probe-notify] slack_send_error:", exc)
    else:
        print("[probe-notify] slack_disabled")

    if _telegram_enabled():
        try:
            _telegram_post(message)
            print("[probe-notify] telegram_sent: True")
        except Exception as exc:  # pragma: no cover - network variability
            print("[probe-notify] telegram_send_error:", exc)
    else:
        print("[probe-notify] telegram_disabled")

    state.update(
        {
            "last_signature": sig,
            "last_sent_at": _utc_now_iso(),
            "last_severity": sev,
            "last_slack_ts": slack_ts or "",
        }
    )
    _save_state(state_path, state)

    return 2 if result.issues else 1


if __name__ == "__main__":
    raise SystemExit(main())
