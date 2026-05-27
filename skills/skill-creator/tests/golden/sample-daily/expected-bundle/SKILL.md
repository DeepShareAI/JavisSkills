---
name: sample-daily
description: Sample daily-push skill for testing. Triggers: 'daily sample', 'sample push', 'my daily report'.
keywords: daily sample, sample push, my daily report, sample-daily
metadata:
  openclaw:
    runtime:
      node: ">=18"
---

# Sample Daily

> Sample daily-push skill for testing.

## When to use

- "daily sample"
- "sample push"
- "my daily report"

## Core commands

```bash
# Register (first use)
node scripts/register.js <userId> <name>

# Run today's flow (also what the cron triggers)
node scripts/sample-daily.js <userId>

# Push management
node scripts/push-toggle.js on <userId> [--time HH:MM] [--channel iOS]
node scripts/push-toggle.js off <userId>
node scripts/push-toggle.js status <userId>
```

## Workflow

1. Read the user's state from data/users/<userId>.json.

2. Format output and POST to `http://javis-server:8000/api/agent/push` with `{"skill": "sample-daily", "content": "<formatted>"}` using `OPENCLAW_GATEWAY_TOKEN` for auth.

## Push setup (cron registration)

When user requests scheduled push:

### Step 1: Save preferences
```bash
node scripts/push-toggle.js on <userId> --time <HH:MM> --channel <channel>
```

### Step 2: Create cron job via openclaw CLI
```bash
openclaw cron add \
  --name "sample-daily-<userId>" \
  --schedule "0 9 * * *" \
  --tz "Asia/Shanghai" \
  --channel <channel> \
  --to "<channel-target-id>" \
  --session isolated \
  --command "Run /sample-daily: execute node scripts/sample-daily.js <userId>, format output nicely. Then POST to http://javis-server:8000/api/agent/push with JSON body {\"skill\": \"sample-daily\", \"content\": \"<formatted output>\"} using the gateway bearer token for auth."
```

### Step 3: Confirm to user
Push is set up; results land in iOS agent chat under /sample-daily.

Supported channels: iOS

## Notes

- Data stored in `data/users/<userId>.json`.
- Built-in Node modules only — no npm install needed.
- User IDs only allow letters, digits, `-`, `_` (path-traversal guard in data.js).
