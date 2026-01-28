from __future__ import annotations

import hashlib
import os
from pathlib import Path
from typing import Dict, Iterable, List, Tuple

from _env import load_env
from _n8n_api import build_client


ROOT = Path(__file__).resolve().parents[1]


# Keep this mapping aligned with deploy_daily_pack.py so drift checks cover
# the exact code nodes we intend to manage from the repo.
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

    nodes_by_name = {node.get("name"): node for node in nodes}

    expected_cron = _expected_cron()
    live_cron = None
    for node in nodes:
        if node.get("type") != "n8n-nodes-base.scheduleTrigger":
            continue
        interval = (
            node.get("parameters", {})
            .get("rule", {})
            .get("interval", [{"field": "cronExpression", "expression": None}])
        )
        if interval:
            live_cron = interval[0].get("expression")
        break

    missing_nodes: List[str] = []
    missing_sources: List[str] = []
    code_mismatches: List[Tuple[str, str, str]] = []
    code_checked = 0

    for name, source_path in CODE_NODE_SOURCES.items():
        node = nodes_by_name.get(name)
        if not node:
            missing_nodes.append(name)
            continue
        if node.get("type") != "n8n-nodes-base.code":
            missing_nodes.append(name)
            continue
        if not source_path.exists():
            missing_sources.append(name)
            continue

        local_code = source_path.read_text(encoding="utf-8")
        live_code = (node.get("parameters") or {}).get("jsCode", "")
        code_checked += 1
        if local_code != live_code:
            code_mismatches.append((name, _hash(local_code), _hash(live_code)))

    print(
        "[drift-check] workflow_id:",
        workflow_id,
        "expected_cron:",
        expected_cron,
        "live_cron:",
        live_cron,
    )
    print("[drift-check] code_nodes_checked:", code_checked)

    drift_detected = False

    if live_cron != expected_cron:
        drift_detected = True
        print(
            "[drift-check] CRON_MISMATCH:",
            f"expected={expected_cron}",
            f"live={live_cron}",
        )

    if missing_nodes:
        drift_detected = True
        print("[drift-check] MISSING_NODES:", ", ".join(sorted(missing_nodes)))

    if missing_sources:
        drift_detected = True
        print("[drift-check] MISSING_SOURCES:", ", ".join(sorted(missing_sources)))

    if code_mismatches:
        drift_detected = True
        print("[drift-check] CODE_MISMATCHES:")
        for name, local_hash, live_hash in code_mismatches:
            print(f"  - {name}: local={local_hash} live={live_hash}")

    if drift_detected:
        print("[drift-check] DRIFT_DETECTED")
        return 2

    print("[drift-check] OK: no drift detected")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

