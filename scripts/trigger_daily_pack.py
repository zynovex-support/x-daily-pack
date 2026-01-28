from __future__ import annotations

import argparse
import json
import os
import subprocess
import urllib.error
import urllib.parse
import urllib.request
from typing import Dict, List

from _env import load_env
from _n8n_api import build_client
from _n8n_db import (
    connect,
    execution_result,
    latest_execution_id,
    load_execution_data,
    node_last_json,
    summarize_nodes,
    wait_for_new_execution,
    wait_until_finished,
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
    oldest = str(max(0.0, float(message_ts) - 90))
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


def _run_docker_execute(workflow_id: str) -> None:
    cmd = [
        "docker",
        "exec",
        "n8n-local",
        "n8n",
        "execute",
        f"--id={workflow_id}",
    ]
    print("[trigger] running:", " ".join(cmd))
    subprocess.run(cmd, check=True)


def _run_ui_execute(workflow_id: str) -> None:
    cmd = ["node", "scripts/trigger_daily_pack_ui.mjs"]
    env = os.environ.copy()
    env["N8N_WORKFLOW_ID"] = workflow_id
    print("[trigger] running:", " ".join(cmd))
    subprocess.run(cmd, check=True, env=env)


def _run_webhook_execute() -> None:
    host = os.environ.get("N8N_HOST", "localhost")
    port = os.environ.get("N8N_PORT", "5678")
    secret = os.environ.get("WEBHOOK_SECRET")
    if not secret:
        raise RuntimeError("WEBHOOK_SECRET is not set")
    header_name = os.environ.get("WEBHOOK_HEADER_NAME", "X-Webhook-Secret")
    path = os.environ.get("DAILY_PACK_WEBHOOK_PATH", "x-daily-pack-trigger")
    url = f"http://{host}:{port}/webhook/{path}"
    req = urllib.request.Request(url, headers={header_name: secret})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            status = resp.getcode()
        print(f"[trigger] webhook_status={status} path={path}")
        if status >= 400:
            raise RuntimeError(f"Webhook returned status {status}")
    except urllib.error.HTTPError as exc:
        raise RuntimeError(f"Webhook failed with status {exc.code}") from exc


def main() -> int:
    parser = argparse.ArgumentParser(description="Trigger and verify Daily Pack workflow")
    parser.add_argument(
        "--trigger",
        choices=("webhook", "ui", "docker", "none"),
        default="webhook",
        help="How to trigger the workflow before verification",
    )
    parser.add_argument(
        "--after-id",
        type=int,
        default=None,
        help="Execution ID watermark to wait after (avoids race conditions)",
    )
    args = parser.parse_args()

    load_env()
    client = build_client()
    conn = connect()

    daily = client.find_workflow(lambda w: "Daily Pack" in (w.get("name") or ""))
    if not daily:
        raise SystemExit("Daily Pack workflow not found")
    workflow_id = daily["id"]

    before_id = args.after_id if args.after_id is not None else (latest_execution_id(conn, workflow_id) or 0)
    print(f"[trigger] workflow_id={workflow_id} before_execution_id={before_id}")

    if args.trigger == "docker":
        _run_docker_execute(workflow_id)
    elif args.trigger == "webhook":
        _run_webhook_execute()
    elif args.trigger == "ui":
        _run_ui_execute(workflow_id)
    else:
        print("[trigger] skipping trigger step (trigger=none)")

    new_id = wait_for_new_execution(conn, workflow_id, before_id, timeout_seconds=600)
    if not new_id:
        print("[trigger] ERROR: no new execution detected within timeout")
        return 2
    print(f"[trigger] new_execution_id={new_id}")

    finished_row = wait_until_finished(conn, new_id, timeout_seconds=900)
    if not finished_row:
        print("[trigger] ERROR: execution did not finish within timeout")
        return 3

    status = finished_row["status"]
    print("[trigger] finished_status:", status)

    payload = load_execution_data(conn, new_id)
    if not payload:
        print("[trigger] ERROR: execution_data missing")
        return 4

    result, run_data, top_error = execution_result(payload)
    if top_error:
        print("[trigger] top_error:", top_error)

    node_summary = summarize_nodes(run_data, KEY_NODES)
    error_nodes: List[str] = []
    print("[trigger] node_summary:")
    for node, node_status, items, message in node_summary:
        line = f"  - {node}: {node_status} items={items}"
        if message:
            line += f" msg={message[:160]}"
        print(line)
        if node_status == "ERROR":
            error_nodes.append(node)

    slack_channel = os.environ.get("SLACK_CHANNEL_ID")
    slack_runs = run_data.get("Send to Slack") or []
    slack_json = node_last_json(slack_runs)
    slack_success = bool(slack_json.get("success"))
    slack_ts = slack_json.get("message_ts")
    print("[trigger] slack_success:", slack_success, "message_ts:", slack_ts)

    slack_exists = None
    if slack_channel and slack_ts:
        try:
            slack_exists = _slack_message_exists(slack_channel, slack_ts)
            print("[trigger] slack_message_exists:", slack_exists)
        except Exception as exc:  # pragma: no cover - network variability
            print("[trigger] slack_verify_error:", exc)

    if status != "success":
        return 5
    if error_nodes:
        return 6
    if slack_channel and slack_ts and slack_exists is False:
        return 7
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
