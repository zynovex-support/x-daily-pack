from __future__ import annotations

import datetime as dt
import json
import os
import urllib.parse
import urllib.request
from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple

from _env import load_env
from _n8n_api import build_client
from _n8n_db import (
    connect,
    execution_result,
    load_execution_data,
    node_last_json,
    recent_executions,
    summarize_nodes,
)


KEY_NODES = [
    "RSS Fetch All",
    "Multi News API",
    "X Keyword Search",
    "X Account Search",
    "Cross-Day Dedupe",
    "Semantic Dedupe",
    "Event Clustering",
    "LLM Rank",
    "Generate Tweets",
    "Send to Slack",
    "Send to Telegram",
]


@dataclass
class ProbeResult:
    workflow_id: str
    expected_cron: str
    actual_cron: Optional[str]
    schedule_drift: bool
    executions_count: int
    success_count: int
    error_count: int
    success_rate: float
    last_success_started_at: Optional[str]
    last_success_age_hours: Optional[float]
    slack_last_success_ok: Optional[bool]
    slack_message_ts: Optional[str]
    issues: List[str]
    warnings: List[str]


def _expected_cron() -> str:
    return os.environ.get("EXPECTED_DAILY_PACK_CRON", "0 0,12 * * *")


def _parse_iso(value: Optional[str]) -> Optional[dt.datetime]:
    if not value:
        return None
    try:
        parsed = dt.datetime.fromisoformat(value.replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=dt.timezone.utc)
        return parsed.astimezone(dt.timezone.utc)
    except ValueError:
        return None


def _slack_get(method: str, params: Dict[str, str]) -> Dict:
    token = os.environ.get("SLACK_BOT_TOKEN")
    if not token:
        raise RuntimeError("SLACK_BOT_TOKEN is not set")
    qs = urllib.parse.urlencode(params)
    url = f"https://slack.com/api/{method}?{qs}"
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.load(resp)
    if not data.get("ok"):
        raise RuntimeError(f"Slack API {method} failed: {data.get('error')}")
    return data


def _slack_message_exists(channel: str, message_ts: str) -> bool:
    window = 90
    oldest = str(max(0.0, float(message_ts) - window))
    data = _slack_get(
        "conversations.history",
        {
            "channel": channel,
            "latest": message_ts,
            "oldest": oldest,
            "inclusive": "true",
            "limit": "5",
        },
    )
    return any(m.get("ts") == message_ts for m in data.get("messages", []))


def _find_pack_messages(channel: str, limit: int = 50) -> List[Tuple[str, dt.datetime]]:
    data = _slack_get("conversations.history", {"channel": channel, "limit": str(limit)})
    messages = []
    for msg in data.get("messages", []):
        text = msg.get("text") or ""
        if "Today's X Daily Pack" not in text:
            blocks = msg.get("blocks") or []
            for block in blocks:
                if block.get("type") == "header":
                    header_text = (block.get("text") or {}).get("text") or ""
                    if "Today's X Daily Pack" in header_text:
                        text = header_text
                        break
        if "Today's X Daily Pack" in text and msg.get("ts"):
            ts = float(msg["ts"])
            messages.append((msg["ts"], dt.datetime.fromtimestamp(ts, tz=dt.timezone.utc)))
    return messages


def run_probe() -> ProbeResult:
    load_env()
    expected_cron = _expected_cron()
    max_success_age_hours = float(os.environ.get("PROBE_MAX_SUCCESS_AGE_HOURS", "18"))
    min_success_rate = float(os.environ.get("PROBE_MIN_SUCCESS_RATE", "0.7"))

    client = build_client()
    daily = client.find_workflow(lambda w: "Daily Pack" in (w.get("name") or ""))
    if not daily:
        raise SystemExit("Daily Pack workflow not found")
    workflow_id = daily["id"]

    workflow = client.get_workflow(workflow_id)
    nodes = workflow.get("nodes", [])

    actual_cron = None
    for node in nodes:
        if node.get("type") == "n8n-nodes-base.scheduleTrigger":
            rule = node.get("parameters", {}).get("rule", {})
            interval = rule.get("interval", [])
            if interval:
                actual_cron = interval[0].get("expression")
            break

    schedule_drift = actual_cron != expected_cron

    conn = connect()
    executions = list(recent_executions(conn, workflow_id, limit=30))
    success_execs = [e for e in executions if e["status"] == "success"]
    error_execs = [e for e in executions if e["status"] == "error"]
    success_rate = (len(success_execs) / len(executions)) if executions else 0.0

    last_success = success_execs[0] if success_execs else None
    last_success_dt = _parse_iso(last_success["startedAt"]) if last_success else None
    now = dt.datetime.now(tz=dt.timezone.utc)
    success_age_hours = ((now - last_success_dt).total_seconds() / 3600.0) if last_success_dt else None

    issues: List[str] = []
    warnings: List[str] = []

    if schedule_drift:
        issues.append(f"Schedule drift: expected '{expected_cron}' but live is '{actual_cron}'")

    if success_age_hours is None or success_age_hours > max_success_age_hours:
        issues.append(
            f"Last success too old: age_hours={success_age_hours} threshold={max_success_age_hours}"
        )

    if success_rate < min_success_rate:
        warnings.append(
            f"Success rate below target: success_rate={success_rate:.2f} target={min_success_rate:.2f}"
        )

    slack_channel = os.environ.get("SLACK_CHANNEL_ID")
    slack_ok = None
    slack_message_ts = None

    if last_success:
        payload = load_execution_data(conn, int(last_success["id"]))
        if payload:
            _, run_data, top_error = execution_result(payload)
            node_summary = summarize_nodes(run_data, KEY_NODES)
            slack_runs = run_data.get("Send to Slack") or []
            slack_json = node_last_json(slack_runs)
            slack_ok = bool(slack_json.get("success"))
            slack_message_ts = slack_json.get("message_ts")

            if top_error:
                warnings.append(f"Top-level error present on last success: {top_error}")

            for node, status, items, message in node_summary:
                if status == "ERROR":
                    warnings.append(f"Node error on last success: {node} msg={message}")
                if items == 0 and node in {"LLM Rank", "Generate Tweets", "Send to Slack"}:
                    warnings.append(f"Node produced zero items: {node}")

    if slack_channel and slack_message_ts:
        try:
            slack_exists = _slack_message_exists(slack_channel, slack_message_ts)
            if not slack_exists:
                issues.append(
                    f"Slack message_ts not found in channel history: ts={slack_message_ts}"
                )
        except Exception as exc:  # pragma: no cover - network variability
            warnings.append(f"Slack verification failed: {exc}")
    elif slack_channel:
        try:
            pack_messages = _find_pack_messages(slack_channel, limit=50)
            if not pack_messages:
                issues.append("No pack messages found in last 50 Slack messages")
        except Exception as exc:  # pragma: no cover - network variability
            warnings.append(f"Slack history probe failed: {exc}")

    return ProbeResult(
        workflow_id=workflow_id,
        expected_cron=expected_cron,
        actual_cron=actual_cron,
        schedule_drift=schedule_drift,
        executions_count=len(executions),
        success_count=len(success_execs),
        error_count=len(error_execs),
        success_rate=success_rate,
        last_success_started_at=last_success["startedAt"] if last_success else None,
        last_success_age_hours=success_age_hours,
        slack_last_success_ok=slack_ok,
        slack_message_ts=slack_message_ts,
        issues=issues,
        warnings=warnings,
    )


def main() -> int:
    result = run_probe()

    print("[probe] workflow_id:", result.workflow_id)
    print("[probe] schedule expected:", result.expected_cron, "live:", result.actual_cron)
    print(
        "[probe] executions:",
        result.executions_count,
        "success:",
        result.success_count,
        "error:",
        result.error_count,
        "success_rate:",
        f"{result.success_rate:.2f}",
    )
    print("[probe] last_success_startedAt:", result.last_success_started_at)
    print(
        "[probe] last_success_age_hours:",
        (
            f"{result.last_success_age_hours:.2f}"
            if result.last_success_age_hours is not None
            else None
        ),
    )
    print("[probe] slack_last_success_ok:", result.slack_last_success_ok, "message_ts:", result.slack_message_ts)

    if result.issues:
        print("[probe] ISSUES:")
        for issue in result.issues:
            print("  -", issue)
    if result.warnings:
        print("[probe] WARNINGS:")
        for warning in result.warnings:
            print("  -", warning)

    return 1 if result.issues else 0


if __name__ == "__main__":
    raise SystemExit(main())
