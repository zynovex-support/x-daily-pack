#!/usr/bin/env python3
"""
Workflow Sync Script - Syncs node code from scripts/ to workflow JSON files
Run: python scripts/sync-workflow.py [--deploy]
"""

import json
import os
import subprocess
from pathlib import Path

BASE_DIR = Path(__file__).parent.parent
SCRIPTS_DIR = BASE_DIR / "scripts"
WORKFLOWS_DIR = BASE_DIR / "workflows"
CONTAINER_NAME = "n8n-local"

# Mapping of workflow node IDs to script files
NODE_SCRIPTS = {
    "rss-fetch": "rss-fetch-node.js",
    "news-api-fetch": "multi-news-api-node.js",
    "x-keyword": "x-keyword-search-node.js",
    "x-account": "x-account-search-node.js",
    "dedupe": "cross-day-dedupe-node.js",
    "semantic-dedupe": "semantic-dedupe-node.js",
    "event-clustering": "event-clustering-node.js",
    "llm-rank": "llm-rank-node.js",
    "tweet-gen": "tweet-gen-node.js",
    "slack-output": "slack-output-node.js",
    "telegram-output": "telegram-output-node.js",
}

def load_script(filename):
    """Load and return script content."""
    script_path = SCRIPTS_DIR / filename
    if script_path.exists():
        return script_path.read_text(encoding="utf-8")
    print(f"Warning: Script not found: {filename}")
    return None

def sync_workflow(workflow_path):
    """Sync node code in a workflow JSON file."""
    print(f"\nProcessing: {workflow_path}")

    with open(workflow_path, "r", encoding="utf-8") as f:
        workflow = json.load(f)

    updated = 0
    for node in workflow.get("nodes", []):
        node_id = node.get("id", "")
        if node_id in NODE_SCRIPTS:
            script_content = load_script(NODE_SCRIPTS[node_id])
            if script_content:
                if "parameters" not in node:
                    node["parameters"] = {}
                old_code = node["parameters"].get("jsCode", "")
                if old_code != script_content:
                    node["parameters"]["jsCode"] = script_content
                    print(f"  Updated: {node_id} ({NODE_SCRIPTS[node_id]})")
                    updated += 1
                else:
                    print(f"  Unchanged: {node_id}")

    if updated > 0:
        # Backup original
        backup_path = workflow_path.with_suffix(".json.bak")
        with open(workflow_path, "r", encoding="utf-8") as f:
            backup_path.write_text(f.read(), encoding="utf-8")
        print(f"  Backup saved: {backup_path}")

        # Write updated workflow
        with open(workflow_path, "w", encoding="utf-8") as f:
            json.dump(workflow, f, indent=2, ensure_ascii=False)
        print(f"  Workflow updated: {updated} nodes")
    else:
        print("  No changes needed")

    return updated

def deploy_workflow(workflow_path):
    """Deploy workflow to n8n using CLI."""
    print(f"\n🚀 Deploying to n8n: {workflow_path.name}")

    # Check container is running
    result = subprocess.run(
        ["docker", "ps", "--format", "{{.Names}}"],
        capture_output=True, text=True
    )
    if CONTAINER_NAME not in result.stdout:
        print(f"❌ Container {CONTAINER_NAME} is not running")
        return False

    # Copy and import
    subprocess.run(["docker", "cp", str(workflow_path), f"{CONTAINER_NAME}:/tmp/workflow.json"], check=True)
    subprocess.run(["docker", "exec", CONTAINER_NAME, "n8n", "import:workflow", "--input=/tmp/workflow.json"], check=True)
    subprocess.run(["docker", "exec", CONTAINER_NAME, "rm", "-f", "/tmp/workflow.json"], check=True)

    print(f"✅ Deployed: {workflow_path.name}")
    return True

def main():
    import sys
    deploy_mode = "--deploy" in sys.argv

    print("=" * 50)
    print("Workflow Sync Script")
    if deploy_mode:
        print("Mode: Sync + Deploy")
    print("=" * 50)

    # Find all workflow JSON files
    workflow_files = list(WORKFLOWS_DIR.glob("*.json"))

    if not workflow_files:
        print("No workflow files found in workflows/")
        return

    total_updated = 0
    updated_files = []
    for wf_path in workflow_files:
        if ".bak" in str(wf_path):
            continue
        count = sync_workflow(wf_path)
        total_updated += count
        if count > 0:
            updated_files.append(wf_path)

    print("\n" + "=" * 50)
    print(f"Done! Total nodes updated: {total_updated}")

    # Auto deploy if --deploy flag
    if deploy_mode and updated_files:
        print("\n" + "=" * 50)
        print("Deploying to n8n...")
        for wf_path in updated_files:
            deploy_workflow(wf_path)
    elif not deploy_mode and total_updated > 0:
        print("\nTo deploy: python scripts/sync-workflow.py --deploy")

if __name__ == "__main__":
    main()
