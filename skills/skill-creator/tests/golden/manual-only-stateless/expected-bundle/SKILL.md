---
name: manual-only-stateless
description: Minimum stateless skill for testing — no cron, no state. Triggers: 'manual sample', 'one-shot test'.
keywords: manual sample, one-shot test, manual-only-stateless
metadata:
  openclaw:
    runtime:
      node: ">=18"
---

# Manual Only Stateless

> Minimum stateless skill for testing — no cron, no state.

## When to use

- "manual sample"
- "one-shot test"

## Core commands

```bash
# Run today's flow (also what the cron triggers)
node scripts/manual-only-stateless.js <userId>
```

## Workflow

1. Process the user-typed text passed in argv after <userId>.
2. Format output and POST to `http://javis-server:8000/api/agent/push` with `{"skill": "manual-only-stateless", "content": "<formatted>"}` using `OPENCLAW_GATEWAY_TOKEN` for auth.

## Notes

- Built-in Node modules only — no npm install needed.
