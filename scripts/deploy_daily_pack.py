from __future__ import annotations

import hashlib
import os
from pathlib import Path
from typing import Dict, Iterable

from _env import load_env
from _n8n_api import build_client


ROOT = Path(__file__).resolve().parents[1]


CODE_NODE_SOURCES: Dict[str, Path] = {
    "RSS Fetch All": ROOT / "scripts" / "rss-fetch-node.js",
    "X Keyword Search": ROOT / "scripts" / "x-keyword-search-node.js",
    "X Account Search": ROOT / "scripts" / "x-account-search-node.js",
    "Cross-Day Dedupe": ROOT / "scripts" / "cross-day-dedupe-node.js",
    "Semantic Dedupe": ROOT / "scripts" / "semantic-dedupe-node.js",
    "Event Clustering": ROOT / "scripts" / "event-clustering-node.js",
    "LLM Rank": ROOT / "scripts" / "llm-rank-node.js",
    "Generate Tweets": ROOT / "scripts" / "tweet-gen-node.js",
    "Send to Slack": ROOT / "scripts" / "slack-output-node.js",
    "Send to Telegram": ROOT / "scripts" / "telegram-output-node.js",
    "Multi News API": ROOT / "scripts" / "multi-news-api-node.js",
}


def _hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:12]


def _workflow_nodes(workflow: Dict) -> Iterable[Dict]:
    return workflow.get("nodes") or workflow.get("data", {}).get("nodes") or []


def _expected_cron() -> str:
    return os.environ.get("EXPECTED_DAILY_PACK_CRON", "0 0,12 * * *")


def main() -> int:
    load_env()
    client = build_client()

    daily = client.find_workflow(lambda w: "Daily Pack" in (w.get("name") or ""))
    if not daily:
        raise SystemExit("Daily Pack workflow not found")

    workflow_id = daily["id"]
    workflow = client.get_workflow(workflow_id)
    nodes = list(_workflow_nodes(workflow))
    if not nodes:
        raise SystemExit(f"Workflow {workflow_id} has no nodes in API response")

    expected_cron = _expected_cron()

    schedule_updates = 0
    code_updates = 0

    for node in nodes:
        node_type = node.get("type")
        name = node.get("name")
        params = node.setdefault("parameters", {})

        if node_type == "n8n-nodes-base.scheduleTrigger":
            rule = params.setdefault("rule", {})
            interval = rule.setdefault("interval", [{"field": "cronExpression", "expression": expected_cron}])
            if interval and interval[0].get("expression") != expected_cron:
                interval[0]["expression"] = expected_cron
                schedule_updates += 1

        if node_type == "n8n-nodes-base.code" and name in CODE_NODE_SOURCES:
            source_path = CODE_NODE_SOURCES[name]
            if not source_path.exists():
                raise SystemExit(f"Missing source file for node {name}: {source_path}")
            source_code = source_path.read_text(encoding="utf-8")
            if params.get("jsCode") != source_code:
                params["jsCode"] = source_code
                code_updates += 1

    print(f"[deploy] workflow_id={workflow_id} schedule_updates={schedule_updates} code_updates={code_updates}")

    # n8n update endpoint is strict about allowed top-level properties
    allowed_keys = ("name", "nodes", "connections", "settings")
    payload = {key: workflow.get(key) for key in allowed_keys if key in workflow}
    client.update_workflow(workflow_id, payload)

    # Verify after update
    updated = client.get_workflow(workflow_id)
    updated_nodes = list(_workflow_nodes(updated))

    actual_cron = None
    for node in updated_nodes:
        if node.get("type") == "n8n-nodes-base.scheduleTrigger":
            rule = node.get("parameters", {}).get("rule", {})
            interval = rule.get("interval", [])
            if interval:
                actual_cron = interval[0].get("expression")
            break

    print(f"[deploy] expected_cron={expected_cron} actual_cron={actual_cron}")

    # Verify code nodes by hash (no secrets printed)
    mismatches = []
    for node in updated_nodes:
        if node.get("type") != "n8n-nodes-base.code":
            continue
        name = node.get("name")
        if name not in CODE_NODE_SOURCES:
            continue
        live_code = node.get("parameters", {}).get("jsCode", "")
        src_code = CODE_NODE_SOURCES[name].read_text(encoding="utf-8")
        if live_code != src_code:
            mismatches.append((name, _hash(src_code), _hash(live_code)))

    if mismatches:
        print("[deploy] code_mismatches_detected:")
        for name, src_hash, live_hash in mismatches:
            print(f"  - {name}: src={src_hash} live={live_hash}")
        return 2

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
