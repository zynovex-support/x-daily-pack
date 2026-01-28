# Operations Runbook

This runbook turns the previous session's guidance into repeatable, API/log-based operations.

All commands assume you are in the repo root: `/home/henry/x`.

## Standard Operations (Use These First)

1. Deploy workflow code and schedule to n8n:

```bash
npm run deploy
```

2. Detect drift between repo and live n8n (cron + code nodes):

```bash
npm run drift-check
```

3. Run the health probe (schedule, recency, Slack verification):

```bash
npm run probe
```

4. Trigger and verify end-to-end via webhook:

```bash
npm run trigger:webhook
```

## Scheduled Probe With Notifications

We added a notify wrapper around the probe:

- Dry run (shows what would be sent):

```bash
npm run probe:notify
```

- Send notifications on issues and warnings:

```bash
npm run probe:notify:send
```

The notify script deduplicates alerts by signature with a cooldown window.

Key environment knobs:

- `PROBE_NOTIFY_COOLDOWN_MINUTES` (default: `120`)
- `PROBE_NOTIFY_SLACK_ENABLED` (default: `true`)
- `PROBE_NOTIFY_TELEGRAM_ENABLED` (default: respects `TELEGRAM_ENABLED`)
- `PROBE_MAX_SUCCESS_AGE_HOURS` (default: `18`)
- `PROBE_MIN_SUCCESS_RATE` (default: `0.7`)

Suggested cron (every 15 minutes):

```bash
*/15 * * * * cd /home/henry/x && npm run probe:notify:send >> logs/probe-notify.log 2>&1
```

## Key Rotation (High Priority)

Because `WEBHOOK_SECRET` was previously exposed in a failed command output, rotate it.
It is also reasonable to rotate `N8N_API_KEY` at the same time.

Recommended steps:

1. Generate new secrets (examples):

```bash
openssl rand -hex 32
```

2. Update `.env`:

- Set `WEBHOOK_SECRET=<new value>`
- Set `N8N_API_KEY=<new value>` (optional but recommended)

3. Restart services to apply `.env`:

```bash
docker compose up -d --force-recreate n8n config-server
```

4. Re-deploy code nodes and schedule:

```bash
npm run deploy
```

5. Validate with API/log evidence:

```bash
npm run drift-check
npm run probe
npm run trigger:webhook
```

Important note: the webhook header auth credential is stored inside n8n (not in the workflow JSON).
After rotating `WEBHOOK_SECRET`, update the corresponding n8n credential ("Webhook Header Auth") to match.

## Success Rate Still Low (What To Expect)

The probe may warn that the success rate is still below the target.
This is often historical debt rather than a current outage.

Use this sequence to assess "is it healthy now?":

1. `npm run probe`
2. `npm run trigger:webhook`
3. `npm run probe`

If the last two probes show recent success and Slack verification is true, the system is likely healthy now.

## Strong Degradation Controls (Multi News API)

We added two safety rails to the Multi News API code node:

- `NEWS_API_MAX_APIS_PER_RUN` limits the number of APIs per run.
- `NEWS_API_OVERALL_BUDGET_MS` caps the overall time budget.

These are optional controls you can set in `.env` if you need to trade coverage for reliability.

