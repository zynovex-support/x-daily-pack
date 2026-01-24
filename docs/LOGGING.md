# Logging and Retention

This project relies on n8n execution data as the primary source of truth for workflow logs.
Key goals:
- Accuracy: errors must fail the node (no "false green" status).
- Consistency: logs should be easy to trace by workflow/run.
- Retention: keep useful history while controlling storage.

## Logging Sources
1) n8n execution logs
   - Use n8n executions as the system-of-record for runs and failures.
   - Each execution captures node-level errors and runtime metadata.

2) Workflow output signals
   - External integrations (Slack/Telegram/X) should throw on failure.
   - When a send fails, the workflow should surface it clearly.

## Retention and Cleanup
Use the pruning script to delete old executions:
```
N8N_API_KEY=... node scripts/prune-n8n-executions.js --days 14 --dry-run
N8N_API_KEY=... node scripts/prune-n8n-executions.js --days 14
```

Optional filters:
```
N8N_API_KEY=... node scripts/prune-n8n-executions.js --days 30 --workflow <workflowId>
```

Recommendation:
- Keep 14 days of executions by default.
- Increase retention for critical workflows (30-90 days).
- Run cleanup daily via cron or a scheduled task.

## Automation (Current Setup)

- Daily cleanup is scheduled via cron.
- Schedule: `0 3 * * *` (local time)
- Retention: 14 days
- Log output: `logs/n8n-prune.log`
- Environment: `N8N_API_KEY` must be present in `.env`

To verify:
```
crontab -l | rg prune-n8n-executions
tail -n 50 logs/n8n-prune.log
```

## Next Steps (Optional Enhancements)
- Add a dedicated log sink (e.g., Slack #ops or a webhook).
- Centralize structured log fields (workflow, executionId, step, error).
- Alert on repeated failures or throttling events.
