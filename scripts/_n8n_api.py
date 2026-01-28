from __future__ import annotations

import json
import os
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from typing import Any, Callable, Dict, Iterable, Optional


@dataclass
class N8NClient:
    base_url: str
    api_key: str

    @property
    def _headers(self) -> Dict[str, str]:
        return {
            "X-N8N-API-KEY": self.api_key,
            "Content-Type": "application/json",
        }

    def request(self, method: str, path: str, body: Optional[Dict[str, Any]] = None) -> Any:
        data = None
        if body is not None:
            data = json.dumps(body).encode("utf-8")
        req = urllib.request.Request(
            f"{self.base_url}{path}",
            headers=self._headers,
            data=data,
            method=method,
        )
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                return json.load(resp)
        except urllib.error.HTTPError as exc:
            payload = exc.read().decode("utf-8", "ignore")
            raise RuntimeError(f"n8n API {method} {path} failed: {exc.code} {payload}") from exc

    def list_workflows(self) -> Iterable[Dict[str, Any]]:
        data = self.request("GET", "/workflows")
        return data.get("data", data)

    def find_workflow(self, predicate: Callable[[Dict[str, Any]], bool]) -> Optional[Dict[str, Any]]:
        for workflow in self.list_workflows():
            if predicate(workflow):
                return workflow
        return None

    def get_workflow(self, workflow_id: str) -> Dict[str, Any]:
        return self.request("GET", f"/workflows/{workflow_id}")

    def update_workflow(self, workflow_id: str, workflow: Dict[str, Any]) -> Dict[str, Any]:
        return self.request("PUT", f"/workflows/{workflow_id}", workflow)


def build_client() -> N8NClient:
    host = os.environ.get("N8N_HOST", "localhost")
    port = os.environ.get("N8N_PORT", "5678")
    api_key = os.environ.get("N8N_API_KEY")
    if not api_key:
        raise RuntimeError("N8N_API_KEY is not set")
    base_url = f"http://{host}:{port}/api/v1"
    return N8NClient(base_url=base_url, api_key=api_key)

