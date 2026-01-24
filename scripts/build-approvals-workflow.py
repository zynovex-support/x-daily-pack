#!/usr/bin/env python3
import json

print("Reading node code files...")

with open("/home/henry/x/scripts/slack-approval-node.js", "r") as f:
    approval_code = f.read()

print("Building workflow structure...")

workflow = {
    "name": "Slack Approvals - X Daily Pack",
    "nodes": [
        {
            "parameters": {},
            "name": "Manual Trigger",
            "type": "n8n-nodes-base.manualTrigger",
            "typeVersion": 1,
            "position": [200, 300],
            "id": "manual-trigger",
        },
        {
            "parameters": {
                "rule": {
                    "interval": [
                        {"field": "cronExpression", "expression": "*/1 * * * *"}
                    ]
                }
            },
            "name": "Every Minute",
            "type": "n8n-nodes-base.scheduleTrigger",
            "typeVersion": 1.1,
            "position": [200, 460],
            "id": "schedule-trigger",
        },
        {
            "parameters": {"jsCode": approval_code},
            "name": "Process Slack Commands",
            "type": "n8n-nodes-base.code",
            "typeVersion": 2,
            "position": [520, 380],
            "id": "process",
        },
    ],
    "connections": {
        "Manual Trigger": {"main": [[{"node": "Process Slack Commands", "type": "main", "index": 0}]]},
        "Every Minute": {"main": [[{"node": "Process Slack Commands", "type": "main", "index": 0}]]},
    },
    "settings": {"executionOrder": "v1", "timezone": "Asia/Shanghai"},
    "staticData": None,
    "tags": [],
    "triggerCount": 2,
}

print("Writing workflow to file...")
with open("/home/henry/x/workflows/slack-approvals.json", "w") as f:
    json.dump(workflow, f, indent=2)

print("✅ Workflow created: workflows/slack-approvals.json")

