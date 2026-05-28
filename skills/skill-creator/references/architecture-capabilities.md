# HiJavis Architecture Capabilities (source of truth for the feasibility gate)

This is the authoritative SUPPORTED / NOT-SUPPORTED matrix for the HiJavis loop.
The Phase 0 feasibility gate in `SKILL.md` MUST consult this file — do NOT infer
capabilities from memory. Each "not supported" line ends with a `→ workaround:`.

The loop:

> iOS ↔ javis-server (Clerk-authed) ↔ per-user openclaw container ↔ workspace skills
> (Node scripts) ↔ cron ↔ openclaw channels + javis-server push → back to iOS via
> Socket.IO `AGENT_PUSH`.

`javisdb` = the SQLAlchemy/Alembic schema inside javis-server (no direct DB access
from skills).

## SUPPORTED

- **Push to iOS:** `POST http://javis-server:8000/api/agent/push` with JSON
  `{ "skill": "<slug>", "content": "<text>", "session_id"?: "<uuid>" }`. Auth:
  `Authorization: Bearer $OPENCLAW_GATEWAY_TOKEN` (Clerk JWT also accepted). Persists
  an `AgentTask` row (table `agent_tasks`; `content` is stored in the `agent_response`
  Text column) and emits Socket.IO `AGENT_PUSH` to all of the user's connected iOS
  clients. If `session_id` is omitted, the server auto-resolves it to the most recent
  session for that skill. (javis-server `app/routers/agent.py:846-934`,
  `app/schemas/agent.py:130-148`, `app/models/agent_task.py:6-24`)
- **Content:** plain text / **markdown** — headings, lists, bold/italic, code,
  blockquotes, links. **Hard limit: 50,000 characters** (`AgentPushRequest.content`,
  `app/schemas/agent.py:138-143`). iOS renders block-level markdown (headings,
  lists, blockquotes, code) and inline formatting (bold, italic, code, links) via the
  `MDBlock` parser (javisiosapp `agent/views/MarkdownReaderComponents.swift:70-274`).
- **Structured iOS cards — exactly 4 types** (javisiosapp chatbot block views):
  `EventList`, `EventCard` (image via `cover_url`; also supports start/end times,
  city/address/location, host name, and RSVP count parsed defensively from JSON),
  `ActionButtons` (tap injects text as a user message; primary/secondary style
  variants), `SuccessCard`. (javisiosapp `agent/models/ChatBlock.swift:14-18`,
  block views under `chatbot/views/blocks/`)
- **Scheduling:** `openclaw cron add` with `--name`, `--cron`/`--every` (separate
  options — `--cron` takes a 5- or 6-field expression, `--every` takes a recurring
  duration like `10m`/`1h`), `--at` (one-shot ISO datetime or duration), `--tz`,
  `--channel`, `--to`, `--session`, `--message`. Payload options are mutually
  exclusive: `--system-event` (main session) OR `--message` (isolated `agentTurn`).
  `--session` may be `main`, `isolated`, `current`, or `session:<id>`. Cron triggers
  an isolated agent run; the agent executes the skill's Node scripts via its `exec`
  tool. Delivery mode is `announce` (deliver to channel) or `none`, defaulting to
  `announce` for isolated `agentTurn` jobs. (openclaw
  `src/cli/cron-cli/register.cron-add.ts:81-270`)
- **Per-user state:** workspace files at `<skill>/data/users/<userId>.json`, and/or
  the server-side `skill_data` table (JSON `payload`, `dedup_key`, optional time
  range via nullable `start_at`/`end_at`) via `/api/agent/skill-data`. A composite
  unique constraint on `(user_id, skill, data_type, dedup_key)` enforces idempotent
  per-user writes at the DB layer; writes support a `replace_window` (delete window,
  then insert) or upsert strategy. (javisdb `app/models/skill_data.py:15-38`,
  javis-server `app/routers/skill.py:43-139`)
- **Channels (openclaw):** Telegram, Discord, Slack, Feishu implemented; iOS always
  implied. Delivery is configured on the cron job (`--channel`/`--to`), not invoked
  from skill code. (openclaw `extensions/{telegram,discord,slack,feishu}/`)
- **Container env:** `OPENCLAW_GATEWAY_TOKEN` always; `OPENAI_API_KEY` /
  `ANTHROPIC_API_KEY` if the user enabled them. Reach javis-server via Docker DNS
  `javis-server:8000` on the `openclaw-user-net` network. Node runtime is **Node 24**
  (`node:24-bookworm-slim`); container runs as non-root `node` user (UID 1000) under
  the `tini` init, with built-in `/healthz` and `/readyz` health checks. Workspace
  root: `/home/node/.openclaw/workspace/`. (openclaw `docker-compose.yml:17-20`,
  `Dockerfile:138,279,295`; javis-server `app/services/gateway_manager.py:42-54,114,557`)

## NOT SUPPORTED

- **Inbound webhooks / open ports into the container.** Only the gateway ports
  (18789/18790) are exposed; the container is cron-driven, not webhook-triggered.
  → workaround: poll the source on a cron instead. (openclaw
  `docker-compose.yml:59-61`)
- **Long-running daemons / background processes.** Containers are cron-driven and idle
  ones are reaped (~10 min; `IDLE_TIMEOUT_SECONDS` defaults to 600). → workaround:
  structure as repeated cron runs. (javis-server
  `app/services/gateway_manager.py:116`)
- **Direct channel push from skill code.** Delivery is cron-configured only; no
  agent-side channel-send API is exposed. → workaround: configure delivery via
  `openclaw cron add --channel <ch> --to <target>`. (openclaw
  `src/cli/cron-cli/register.cron-add.ts:263-270`)
- **Binary/media push, video, audio, embedded HTML, custom iOS UI.** iOS renders
  markdown + the 4 card types only. → workaround: push a link; for an image use an
  `EventCard` `cover_url`; otherwise summarize in markdown.
- **Push notification when the iOS app is backgrounded or killed.** Delivery is
  WebSocket-only (`URLSessionWebSocketTask`) and is lost if the app is not
  foregrounded; there is no APNs path from a skill (no `UNUserNotificationCenter` /
  remote-notification registration in the app). → workaround: for mission-critical
  delivery add an openclaw channel (e.g. Telegram) as backup and warn in the skill's
  docs. (javisiosapp `agent/services/AgentWebSocketService.swift:10`,
  `JavisAppApp.swift`)
- **Direct PostgreSQL access from the container.** No DB credentials or `DATABASE_URL`
  are injected into containers; all access is server-side behind HTTP endpoints
  (Bearer-token authed). → workaround: use javis-server HTTP endpoints
  (`/api/agent/push`, `/api/agent/skill-data`). (javis-server
  `app/services/gateway_config_factory.py:54-80`)
- **Arbitrary secrets in the container** beyond injected env vars + the
  `skill_credentials` system. → workaround: use the skill-credentials (OTP) flow.
- **Cross-user data access.** Workspaces are per-user isolated; every query is scoped
  by a `user_id` foreign key (`AgentTask`, `SkillData`, `SkillInvocationLock` all FK
  to `users.id`), making cross-user reads impossible at the DB layer. → workaround:
  none; never reachable by design. (javisdb `app/models/agent_task.py:14`,
  `app/models/skill_data.py:19,44`; javis-server `app/routers/skill.py`,
  `app/routers/agent.py`)
- **Real-time streaming to iOS.** → workaround: push discrete `AGENT_PUSH` messages.
- **Payloads larger than 50,000 characters.** → workaround: chunk across multiple
  pushes or summarize.

## How the gate uses this file

1. Read the user's Phase 0 intent.
2. For each requirement, find the matching SUPPORTED or NOT-SUPPORTED line.
3. Emit a Loop Conformance Check: ✅ for supported, ⚠️ for each unsupported item with
   its reason + the `→ workaround:` from this file.
4. If any ⚠️, propose the degraded build (supported subset + chosen workarounds) and
   wait for explicit user confirmation before continuing to the 7 questions.
