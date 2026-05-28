# skill-creator: Loop-Conformance & Feasibility Gate — Design

**Date:** 2026-05-28
**Status:** Approved (design); pending spec review
**Skill:** `skills/skill-creator/`

## Goal

Add two behaviors to the HiJavis `skill-creator` skill:

1. **Loop conformance.** Every skill it generates — whether invoked from the Claude
   desktop app or Claude Code — must obey the current HiJavis loop:

   > iOS ↔ javis-server (Clerk-authed) ↔ per-user openclaw container ↔ workspace
   > skills (Node scripts) ↔ cron ↔ openclaw channels + javis-server push → back to
   > iOS via Socket.IO `AGENT_PUSH`.

2. **Feasibility gate.** If the user's requirement is something the current
   architecture (javisiosapp, javis-server, javisdb, openclaw) does **not** support,
   tell the user clearly *what* is unsupported and *why* (citing the loop), propose
   concrete workarounds, and offer a degraded build of the supported subset before
   proceeding.

## Decisions (locked)

- **Infeasible requirements → "Warn + suggest + offer degraded build."** Explain the
  gap, cite the loop, propose workarounds, then ask whether to proceed with the
  supported subset. Do not silently proceed; do not hard-refuse.
- **Runtime detection → "Detect Bash + graceful fallback."** Claude Code (shell
  available): full flow including validation. Claude Desktop (no shell): run the
  feasibility gate, ask the questions, generate files, but skip Bash-only validation
  with an explicit note to validate later in a terminal.
- **Structure → Approach A:** a dedicated capabilities reference + a Phase 0 gate,
  rather than inline per-question checks (Approach B) or a live re-analysis subagent
  (Approach C).

## Architecture capabilities (source of truth for the gate)

Derived from live analysis of the three indexed/available repos. `javisdb` = the
SQLAlchemy/Alembic schema inside javis-server.

### Supported
- **Push to iOS:** `POST http://javis-server:8000/api/agent/push` with `skill` +
  `content` (+ optional `session_id`). Auth via `OPENCLAW_GATEWAY_TOKEN` bearer (or
  Clerk JWT). Persists an `AgentTask` row; emits Socket.IO `AGENT_PUSH` to all of the
  user's connected iOS clients.
- **Content:** plain text / **markdown** (headings, lists, bold/italic, code,
  blockquotes, links), **max 50,000 characters**.
- **Structured iOS cards (exactly 4):** `EventList`, `EventCard` (cover image via
  `cover_url` only), `ActionButtons` (tap → injects text as a user message),
  `SuccessCard`.
- **Scheduling:** `openclaw cron add` (`--name --schedule/--cron/--every --tz
  --channel --to --session --message/--command`). Cron triggers an isolated agent
  run; the agent executes the skill's Node scripts via its `exec` tool.
- **State:** per-user workspace files (`<skill>/data/users/<userId>.json`) and/or the
  server-side `skill_data` table (JSON payload, dedup key, time range) via the
  `/api/agent/skill-data` endpoints.
- **Channels (openclaw):** Telegram, Discord, Slack, Feishu implemented; iOS always
  implied. Delivery is **cron-config'd**, not invoked from skill code.
- **Env in container:** `OPENCLAW_GATEWAY_TOKEN`, and `OPENAI_API_KEY` /
  `ANTHROPIC_API_KEY` if the user enabled them. Reach javis-server via Docker DNS
  `javis-server:8000` on `openclaw-user-net`.

### NOT supported (each carries a workaround in the reference)
- **Inbound webhooks / open ports into the container** → poll on a cron instead.
- **Long-running daemons** (container is cron-driven; idle containers are reaped
  ~10 min) → structure as repeated cron runs.
- **Direct channel push from skill code** → configure delivery via `openclaw cron add
  --channel/--to`.
- **Binary/media push, video, audio, embedded HTML, custom UI** on iOS → push a link;
  for images use an `EventCard` `cover_url`; otherwise summarize in markdown.
- **Push notification when the iOS app is backgrounded/killed** (WebSocket-only; lost
  if not foreground) → for mission-critical delivery, add an openclaw channel
  (Telegram/email) as a backup, and warn in the skill's docs.
- **Direct PostgreSQL access from the container** → use javis-server HTTP endpoints
  (`/api/agent/push`, `/api/agent/skill-data`).
- **Arbitrary secrets in the container** beyond the injected env vars and the
  `skill_credentials` system → use the skill-credentials (OTP) flow.
- **Cross-user data access** → per-user isolated workspace; never reachable.
- **Real-time streaming to iOS** → push discrete `AGENT_PUSH` messages.
- **>50,000-char payloads** → chunk or summarize.

## Changes

### 1. New reference — `references/architecture-capabilities.md`
The authoritative SUPPORTED / NOT-SUPPORTED matrix above, each "not supported" line
ending with `→ workaround:`. This is the single source the Phase 0 gate consults; it
must not be inferred from memory. Includes file/endpoint citations so it can be kept
in sync with the repos.

### 2. New `Phase 0 — Intent & Feasibility gate` (after pre-flight, before the 7 questions)
- **Q0 (open):** "In a sentence or two, what should this skill do — what triggers it,
  what does it produce, and where does the result go?"
- **Classify** each stated requirement against `architecture-capabilities.md`.
- **Emit a Loop Conformance Check:** ✅ supported items; ⚠️ each unsupported item with
  *reason* + *concrete workaround*.
- **If any ⚠️:** present the degraded-build proposal (supported subset + chosen
  workarounds) and **wait for explicit confirmation**. If the user declines, stop the
  turn. (Satisfies behavior #2.)
- **Carry forward** the confirmed/degraded intent so the Phase 1 answers and generated
  bundle stay loop-conformant (supports behavior #1).

### 3. Pre-flight — Bash detection + graceful fallback
- Probe once for a shell; set `has_shell`.
- `has_shell = true` (Claude Code) → unchanged full flow incl. Phase 3 validation.
- `has_shell = false` (Claude Desktop) → run Phase 0, ask the 7 questions, generate
  files via the Write tool, but **skip Phase 3 Bash validation** with an explicit
  note: "⚠️ Skipped validation (no shell). Run `node --check scripts/*.js` and the
  entry `--help` in Claude Code or a terminal before publishing."
- Path resolution that currently uses Bash (`$JAVIS_SKILL_BASE_DIR`) must degrade
  gracefully when no shell exists: fall back to a stated default and ask the user to
  confirm the output path.
- Phase 4 report adapts wording to whether validation ran.

### 4. SKILL.md wording for behavior #1
- Add an explicit rule near the top: every generated skill MUST conform to the loop;
  the feasibility gate is mandatory and runs before any questions.
- Pre-flight step that loads references now also loads
  `references/architecture-capabilities.md`.

## Files touched
- `skills/skill-creator/SKILL.md` — add loop-conformance rule, Bash-detection in
  pre-flight, new Phase 0 gate, Phase 3/4 fallback wording.
- `skills/skill-creator/references/architecture-capabilities.md` — **new.**
- No template changes — `references/periodic-push-template.md` already emits
  loop-conformant bundles.

## Out of scope
- Changing javis-server, javisiosapp, javisdb, or openclaw themselves.
- Changing the existing 7 questions, the generated file set, or the publish flow.
- Live re-analysis of the repos at skill-run time (Approach C).

## Success criteria
- Running skill-creator with a clearly infeasible request (e.g. "push a live video
  stream to my phone and alert me even when the app is closed") produces a Loop
  Conformance Check that names the unsupported parts, cites the loop, proposes
  workarounds, and asks before building a degraded version.
- Running with a feasible request proceeds to the 7 questions unchanged.
- Running in a no-shell environment generates the bundle and clearly flags that
  validation was skipped, with the exact commands to run later.
- Every generated bundle still passes the existing Phase 3 checks when validated.
