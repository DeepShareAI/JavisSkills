---
name: multi-channel
description: Multi-channel test skill — pushes to iOS, Telegram, and Discord. Triggers: 'multi push', 'broadcast test'.
keywords: multi push, broadcast test, multi-channel
metadata:
  openclaw:
    runtime:
      node: ">=18"
---

# Multi Channel

> Multi-channel test skill — pushes to iOS, Telegram, and Discord.

## When to use

- "multi push"
- "broadcast test"

## Core commands

```bash
# Run today's flow (also what the cron triggers)
node scripts/multi-channel.js <userId>

# Push management
node scripts/push-toggle.js on <userId> [--time HH:MM] [--channel iOS|Telegram|Discord]
node scripts/push-toggle.js off <userId>
node scripts/push-toggle.js status <userId>
```

## Workflow

1. Read the user's state from data/users/<userId>.json.

2. Format output and POST to `http://javis-server:8000/api/agent/push` with `{"skill": "multi-channel", "content": "<formatted>"}` using `OPENCLAW_GATEWAY_TOKEN` for auth.

## Push setup (cron registration)

When user requests scheduled push:

### Step 1: Save preferences
```bash
node scripts/push-toggle.js on <userId> --time <HH:MM> --channel <channel>
```

### Step 2: Create cron job via openclaw CLI
```bash
openclaw cron add \
  --name "multi-channel-<userId>" \
  --schedule "30 7 * * 1" \
  --tz "America/Los_Angeles" \
  --channel <channel> \
  --to "<channel-target-id>" \
  --session isolated \
  --command "Run /multi-channel: execute node scripts/multi-channel.js <userId>, format output nicely. Then POST to http://javis-server:8000/api/agent/push with JSON body {\"skill\": \"multi-channel\", \"content\": \"<formatted output>\"} using the gateway bearer token for auth."
```

### Step 3: Confirm to user
Push is set up; results land in iOS agent chat under /multi-channel.

Supported channels: iOS, Telegram, Discord

## Notes

- Data stored in `data/users/<userId>.json`.
- Built-in Node modules only — no npm install needed.
- User IDs only allow letters, digits, `-`, `_` (path-traversal guard in data.js).
