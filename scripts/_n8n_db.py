from __future__ import annotations

import json
import os
import sqlite3
import time
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple


def _db_path() -> Path:
    override = os.environ.get("N8N_DB_PATH")
    if override:
        return Path(override).expanduser()
    return Path.home() / ".n8n" / "database.sqlite"


def connect() -> sqlite3.Connection:
    path = _db_path()
    if not path.exists():
        raise RuntimeError(f"n8n database not found at {path}")
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    return conn


def latest_execution_id(conn: sqlite3.Connection, workflow_id: str) -> Optional[int]:
    row = conn.execute(
        "select id from execution_entity where workflowId=? order by id desc limit 1",
        (workflow_id,),
    ).fetchone()
    return int(row["id"]) if row else None


def recent_executions(
    conn: sqlite3.Connection, workflow_id: str, limit: int = 20
) -> Iterable[sqlite3.Row]:
    return conn.execute(
        """
        select id, status, finished, startedAt, stoppedAt
        from execution_entity
        where workflowId=?
        order by id desc
        limit ?
        """,
        (workflow_id, limit),
    ).fetchall()


def load_execution_data(conn: sqlite3.Connection, execution_id: int) -> Optional[List[Any]]:
    row = conn.execute(
        "select data from execution_data where executionId=?",
        (execution_id,),
    ).fetchone()
    if not row:
        return None
    return json.loads(row["data"])


def _deref(container: List[Any], value: Any) -> Any:
    if isinstance(value, str) and value.isdigit():
        idx = int(value)
        if 0 <= idx < len(container):
            return container[idx]
    return value


def resolve_refs(container: List[Any], value: Any, depth: int = 0) -> Any:
    if depth > 12:
        return value
    value = _deref(container, value)
    if isinstance(value, dict):
        return {k: resolve_refs(container, v, depth + 1) for k, v in value.items()}
    if isinstance(value, list):
        return [resolve_refs(container, v, depth + 1) for v in value]
    return value


def execution_result(container: List[Any]) -> Tuple[Optional[Dict[str, Any]], Dict[str, Any], Any]:
    if not container:
        return None, {}, None
    meta = container[0]
    result = resolve_refs(container, meta.get("resultData"))
    if not isinstance(result, dict):
        return None, {}, None
    run_data = resolve_refs(container, result.get("runData", {}))
    return result, run_data if isinstance(run_data, dict) else {}, result.get("error")


def node_item_count(node_run: Dict[str, Any]) -> int:
    main = node_run.get("data", {}).get("main")
    if isinstance(main, list) and main and isinstance(main[0], list):
        return len(main[0])
    return 0


def node_last_json(node_runs: List[Dict[str, Any]]) -> Dict[str, Any]:
    if not node_runs:
        return {}
    last = node_runs[-1]
    main = last.get("data", {}).get("main")
    if not (isinstance(main, list) and main and isinstance(main[0], list) and main[0]):
        return {}
    item = main[0][0]
    return item.get("json", {}) if isinstance(item, dict) else {}


def summarize_nodes(
    run_data: Dict[str, Any], key_nodes: Iterable[str]
) -> List[Tuple[str, str, int, Optional[str]]]:
    summary: List[Tuple[str, str, int, Optional[str]]] = []
    for node in key_nodes:
        runs = run_data.get(node)
        if not runs:
            continue
        last = runs[-1]
        err = last.get("error")
        status = "ERROR" if err else "OK"
        message = err.get("message") if isinstance(err, dict) else (str(err) if err else None)
        summary.append((node, status, node_item_count(last), message))
    return summary


def wait_for_new_execution(
    conn: sqlite3.Connection,
    workflow_id: str,
    after_id: int,
    timeout_seconds: int = 600,
    poll_seconds: float = 5.0,
) -> Optional[int]:
    deadline = time.time() + timeout_seconds
    while time.time() < deadline:
        row = conn.execute(
            "select id from execution_entity where workflowId=? and id>? order by id desc limit 1",
            (workflow_id, after_id),
        ).fetchone()
        if row:
            return int(row["id"])
        time.sleep(poll_seconds)
    return None


def wait_until_finished(
    conn: sqlite3.Connection,
    execution_id: int,
    timeout_seconds: int = 900,
    poll_seconds: float = 5.0,
) -> Optional[sqlite3.Row]:
    deadline = time.time() + timeout_seconds
    while time.time() < deadline:
        row = conn.execute(
            "select id, status, finished, startedAt, stoppedAt from execution_entity where id=?",
            (execution_id,),
        ).fetchone()
        if row and int(row["finished"]) == 1:
            return row
        time.sleep(poll_seconds)
    return None

