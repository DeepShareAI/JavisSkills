# HiJavis Loop Reference (for javis-skill-creator)

This document is the source of truth for the values Claude must use when generating a HiJavis-deployable periodic-push skill. Treat it as authoritative — do not infer endpoint paths or env var names from memory.

## Container environment

Skills run inside a per-user openclaw Docker container (`openclaw-user-<sha256(user_id)[:12]>`). The container has these env vars set by `javis-server`'s `gateway_config_factory.write_user_config`:

| Env var | Value | Use |
|---|---|---|
| `OPENCLAW_GATEWAY_TOKEN` | Per-user bearer token | Authorization header for callbacks to javis-server |
| `OPENAI_API_KEY` | OpenAI key (if user enabled) | Direct LLM calls bypassing openclaw's model gateway. (Parent process holds it as `OPENCLAW_OPENAI_API_KEY`; rewritten to the canonical name at container start by `_provider_env_overrides`.) |
| `ANTHROPIC_API_KEY` | Anthropic key (if user enabled) | Same translation: parent has `OPENCLAW_ANTHROPIC_API_KEY`. |

**Reaching javis-server from inside the container:** there is NO `JAVIS_SERVER_URL` env var in production. All per-user containers join the `openclaw-user-net` Docker network where `javis-server` resolves as a DNS name on port 8000, so the base URL defaults to `http://javis-server:8000`.

Generated skill code must NOT hardcode this URL directly. Instead it resolves the base via the canonical contract module (see below), which reads `process.env.JAVIS_SERVER_URL || 'http://javis-server:8000'`. The `JAVIS_SERVER_URL` env override is the **testability hook**: production never sets it (so the default applies), but the local mock-server dry-run sets it to `http://127.0.0.1:<port>` to repoint every server call. Do not strip the env read — it is what makes the Phase-3 dry-run possible without a real javis-server.

**Canonical contract module — `javis-contract.js`:** `references/javis-contract.js` (CONTRACT_VERSION `1.1.0`) is the single source of truth for how a skill talks to javis-server. It is **vendored verbatim** (byte-identical) into every generated skill at `scripts/javis-contract.js`. The entry script never builds auth headers, formats timestamps, constructs server URLs, or assembles cron args itself — it only calls into this module. Exposed API:

| Export | Purpose |
|---|---|
| `JAVIS_BASE` | `process.env.JAVIS_SERVER_URL \|\| 'http://javis-server:8000'` — the base URL with the override hook |
| `CONTRACT_VERSION` | `'1.1.0'` — stamped; used by the drift check and printed in the success report |
| `authHeaders()` | `{ Authorization: 'Bearer ' + OPENCLAW_GATEWAY_TOKEN, 'Content-Type': 'application/json' }`; **throws** if the token is unset/blank |
| `postAgentPush({ skill, content, sessionId, dedupKey })` | `POST /api/agent/push`; `content` is non-empty **markdown**; optional `dedupKey` routes into the card's per-card session |
| `postSkillData({ skill, type, merge, window, items })` | `POST /api/skill/data`; runs `assertNaiveLocal` on each `start_at`/`end_at`, requires non-empty `dedup_key`, validates `status` |
| `toNaiveLocal(iso, tz)` / `localAnchor(iso, tz)` | naive-local wall-clock helpers (handle ICU 24:00 rollover) |
| `assertNaiveLocal(s)` | **throws** on a trailing `Z` or `+HH:MM`/`-HH:MM` offset |
| `getRecentTranscripts({ since, limit, sessionId, kbdInput })` | `GET /api/transcripts/recent` (gateway-token auth) |
| `buildCronAdd({ name, cron, every, at, tz, channel, to, session, message })` | the only constructor for `openclaw cron add` argv; **throws** on `--schedule`/`--command` or if no schedule is given |

Workspace root inside container: `/home/node/.openclaw/workspace/`
Skill bundles live under: `/home/node/.openclaw/workspace/skills/<slug>/`
Per-user data convention: `<skill>/data/users/<userId>.json`

## Server callback — `POST /api/agent/push`

The push endpoint javis-server exposes for skills to deliver content into a user's iOS chat. Auth via gateway bearer (also accepts Clerk JWT). Generated skills call this through `javis-contract.js`'s `postAgentPush({ skill, content, sessionId, dedupKey })` rather than building the request by hand.

```
POST http://javis-server:8000/api/agent/push
Authorization: Bearer <OPENCLAW_GATEWAY_TOKEN>
Content-Type: application/json

{
  "skill": "<slug>",            // required; routes to user's /<slug> agent chat thread
  "content": "<formatted text>", // required; markdown
  "session_id": "<uuid>",        // optional; if omitted, server uses most recent session for this skill
  "dedup_key": "<card-key>"      // optional; routes into the card's derived per-card session
}
```

Session routing precedence (server): explicit `session_id` → derived from `(skill, dedup_key)` → most-recent session → fresh. Pass the card's `dedup_key` (the same string written to that `skill_data` row) so the push lands in that card's own Agent Chat session.

Server saves an `AgentTask` row (status=success, skill=<slug>) and broadcasts Socket.IO `AGENT_PUSH` to all of the user's connected iOS clients. The message appears in the iOS agent chat under the skill's name.

**Push is markdown-only.** The cron/push path delivers `content` as **markdown**. Native cards (EventList / EventCard / ActionButtons / SuccessCard) render ONLY on live SSE agent turns (the interactive archetype) — never from a cron-triggered push. Do not emit card payloads on this path.

## Server callback — `POST /api/skill/data`

For structured rows the iOS app renders directly (e.g. the Calendar table with Confirm / Discard on pending items), skills upsert to `/api/skill/data` instead of pushing markdown. Generated skills call this through `javis-contract.js`'s `postSkillData(...)`, which enforces the timezone and status invariants before the request leaves the process. Auth via the same gateway bearer.

```
POST http://javis-server:8000/api/skill/data
Authorization: Bearer <OPENCLAW_GATEWAY_TOKEN>
Content-Type: application/json

{
  "skill": "<slug>",            // required
  "type": "<row-type>",         // required; e.g. "calendar"
  "merge": "upsert",            // upsert by dedup_key (default)
  "window": { ... },            // optional; only sent when provided
  "items": [
    {
      "dedup_key": "<stable-id>",   // required, non-empty; identity for upsert/dedup
      "payload": { ... },           // the row contents the iOS app renders
      "status": "pending",          // required; one of "pending" | "confirmed"
      "start_at": "2026-06-05T21:00:00",  // NAIVE LOCAL wall-clock — no Z, no offset
      "end_at":   "2026-06-05T22:00:00",  // NAIVE LOCAL wall-clock — no Z, no offset
      "source_ref": "<optional ref>"      // optional; e.g. originating transcript id
    }
  ]
}
```

Server upserts the rows (matching on `dedup_key`), emits SSE `skill_data_updated`, and iOS re-GETs and re-renders.

**Timezone invariant (critical).** `start_at` and `end_at` MUST be **naive local wall-clock** strings of the form `YYYY-MM-DDTHH:MM:SS` with **NO trailing `Z`** and **NO `+HH:MM`/`-HH:MM` offset**. iOS (`ServerDate.parse`) reads them in the device timezone; a zoned instant shifts by the offset (the 9pm → 4am-next-day bug). Use `javis-contract.js`'s `toNaiveLocal(iso, tz)` to convert a UTC instant before posting; `postSkillData` additionally runs `assertNaiveLocal` on every `start_at`/`end_at` and **throws** on a zoned value, so a violation fails fast at the boundary instead of silently shifting a day on iOS. `status` is validated against `{pending, confirmed}` and `dedup_key` must be non-empty.

## Openclaw cron registration

To create a recurring trigger:

```bash
openclaw cron add \
  --name "<slug>-<userId>" \
  --cron "<crontab>" \
  --tz "<IANA-tz>" \
  --channel <telegram|discord|slack|feishu> \
  --to "<channel-target-id>" \
  --session isolated \
  --message "<natural-language message the agent will act on at trigger time>"
```

Flags (from openclaw `src/cli/cron-cli/register.cron-add.ts`): use `--cron "<5/6-field expr>"` for a crontab schedule (or `--every <duration>` like `10m`/`1h`, or `--at <when>` for one-shot). The agent payload is `--message` (isolated `agentTurn`) or `--system-event` (main session) — these two are mutually exclusive. There is no `--schedule` or `--command` flag.

Generated skills construct this argv through `javis-contract.js`'s `buildCronAdd({ name, cron, every, at, tz, channel, to, session, message })` — the only sanctioned constructor. It returns a validated argv array and **throws** if a `--schedule`/`--command` flag is smuggled in or if none of `--cron`/`--every`/`--at` is provided, making that class of bug structurally impossible.

The `--message` value is fed to openclaw's agent at trigger time. Pattern for a push skill:

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
