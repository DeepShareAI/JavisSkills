# HiJavis Loop Reference (for skill-creator)

This document is the source of truth for the values Claude must use when generating a HiJavis-deployable periodic-push skill. Treat it as authoritative — do not infer endpoint paths or env var names from memory.

## Container environment

Skills run inside a per-user openclaw Docker container (`openclaw-user-<sha256(user_id)[:12]>`). The container has these env vars set by `javis-server`'s `gateway_config_factory.write_user_config`:

| Env var | Value | Use |
|---|---|---|
| `OPENCLAW_GATEWAY_TOKEN` | Per-user bearer token | Authorization header for callbacks to javis-server |
| `JAVIS_SERVER_URL` | `http://javis-server:8000` | Base URL for all server endpoints (Docker DNS, internal network `openclaw-user-net`) |
| `OPENAI_API_KEY` | OpenAI key (if user enabled) | Direct LLM calls bypassing openclaw's model gateway |
| `ANTHROPIC_API_KEY` | Anthropic key (if user enabled) | Same |

Workspace root inside container: `/home/node/.openclaw/workspace/`
Skill bundles live under: `/home/node/.openclaw/workspace/skills/<slug>/`
Per-user data convention: `<skill>/data/users/<userId>.json`

## Server callback — `POST /api/agent/push`

The push endpoint javis-server exposes for skills to deliver content into a user's iOS chat. Auth via gateway bearer (also accepts Clerk JWT).

```
POST http://javis-server:8000/api/agent/push
Authorization: Bearer <OPENCLAW_GATEWAY_TOKEN>
Content-Type: application/json

{
  "skill": "<slug>",            // required; routes to user's /<slug> agent chat thread
  "content": "<formatted text>", // required; markdown ok
  "session_id": "<uuid>"         // optional; if omitted, server uses most recent session for this skill
}
```

Server saves an `AgentTask` row (status=success, skill=<slug>) and broadcasts Socket.IO `AGENT_PUSH` to all of the user's connected iOS clients. The message appears in the iOS agent chat under the skill's name.

## Openclaw cron registration

To create a recurring trigger:

```bash
openclaw cron add \
  --name "<slug>-<userId>" \
  --schedule "<crontab>" \
  --tz "<IANA-tz>" \
  --channel <telegram|discord|slack|feishu> \
  --to "<channel-target-id>" \
  --session isolated \
  --command "<natural-language command the LLM will execute on trigger>"
```

The `--command` value is fed to openclaw's LLM at trigger time. Pattern for a push skill:

```
Run /<slug>: execute node scripts/<entry>.js <userId>, format output nicely. Then POST to
http://javis-server:8000/api/agent/push with JSON body
{"skill": "<slug>", "content": "<formatted output>"}
using the gateway bearer token for auth.
```

## SKILL.md frontmatter spec

Required keys in the YAML frontmatter at the top of every SKILL.md:

```yaml
---
name: <slug>                    # kebab-case, matches folder name
description: <one-line>         # <=200 chars; iOS HomeSkillsViewModel.parseDescription shows it
keywords: <csv>                 # trigger words, Chinese + English encouraged
metadata:                       # optional but recommended
  openclaw:
    runtime:
      node: ">=18"
---
```

The description must mention at least one trigger word; users browsing the Skills tab see this single line.

## Per-user data convention

Each skill that holds per-user state writes to `<skill>/data/users/<userId>.json`. Path safety is mandatory (untrusted `userId`):

```js
function sanitizeId(value) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(value)) {
    console.error('❌ Invalid userId: letters/digits/-/_ only, length 1-128');
    process.exit(1);
  }
  return value;
}

function safeUserPath(userId) {
  const USERS_DIR = path.join(__dirname, '../data/users');
  const resolved = path.resolve(USERS_DIR, `${userId}.json`);
  if (!resolved.startsWith(path.resolve(USERS_DIR) + path.sep)) {
    console.error('❌ Illegal path');
    process.exit(1);
  }
  return resolved;
}
```

## Don't do

- Don't write outside the workspace root.
- Don't hardcode a Clerk user_id in any generated script.
- Don't add `dependencies` to `package.json` unless the user's data sources strictly require them (Node 18+ has built-in `fetch`, no `node-fetch` needed).
- Don't use `npm install` in install instructions unless dependencies are actually declared.
- Don't reuse `OPENCLAW_GATEWAY_TOKEN` for anything besides javis-server callbacks (it's a per-user secret).
