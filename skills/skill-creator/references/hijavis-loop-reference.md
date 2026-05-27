# HiJavis Loop Reference (for skill-creator)

This document is the source of truth for the values Claude must use when generating a HiJavis-deployable periodic-push skill. Treat it as authoritative — do not infer endpoint paths or env var names from memory.

## Container environment

Skills run inside a per-user openclaw Docker container (`openclaw-user-<sha256(user_id)[:12]>`). The container has these env vars set by `javis-server`'s `gateway_config_factory.write_user_config`:

| Env var | Value | Use |
|---|---|---|
| `OPENCLAW_GATEWAY_TOKEN` | Per-user bearer token | Authorization header for callbacks to javis-server |
| `OPENAI_API_KEY` | OpenAI key (if user enabled) | Direct LLM calls bypassing openclaw's model gateway. (Parent process holds it as `OPENCLAW_OPENAI_API_KEY`; rewritten to the canonical name at container start by `_provider_env_overrides`.) |
| `ANTHROPIC_API_KEY` | Anthropic key (if user enabled) | Same translation: parent has `OPENCLAW_ANTHROPIC_API_KEY`. |

**Reaching javis-server from inside the container:** there is currently NO `JAVIS_SERVER_URL` env var. All per-user containers join the `openclaw-user-net` Docker network where `javis-server` resolves as a DNS name on port 8000. Generated skill code should hardcode `http://javis-server:8000` for callbacks.

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

## Per-user data convention (pattern for generated skill code)

Each skill that holds per-user state writes to `<skill>/data/users/<userId>.json`. The path-safety helpers below are the **canonical pattern** generated skills should include (typically in `scripts/data.js`). They do not exist in openclaw upstream — they're skill-author code, copied into each new skill:

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
