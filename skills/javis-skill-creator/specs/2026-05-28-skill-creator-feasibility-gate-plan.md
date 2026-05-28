# skill-creator: Loop-Conformance & Feasibility Gate — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a mandatory loop-conformance rule and a Phase 0 feasibility gate to the HiJavis `skill-creator` skill, plus a no-shell (Claude Desktop) fallback.

**Architecture:** Add one authoritative reference file (`architecture-capabilities.md`) holding the SUPPORTED/NOT-SUPPORTED matrix; insert a Phase 0 gate in `SKILL.md` that classifies the user's intent against it and warns + suggests + offers a degraded build before the existing 7 questions; add Bash-detection in pre-flight so generation works without a shell while clearly flagging skipped validation.

**Tech Stack:** Markdown skill (`SKILL.md` + `references/*.md`); verification via Bash (`grep`, `awk`, `node --check`).

**Spec:** `skills/skill-creator/specs/2026-05-28-skill-creator-feasibility-gate-design.md`

**Verification note:** This skill has no unit-test harness. "Tests" here are concrete `grep`/`awk`/`node` checks against the edited files with expected output. Run all commands from the repo root `/Users/samuelwei/GoogleDrive/LLM/JavisSkills`.

---

### Task 1: Add the architecture capabilities reference

**Files:**
- Create: `skills/skill-creator/references/architecture-capabilities.md`

- [ ] **Step 1: Write the reference file**

Create `skills/skill-creator/references/architecture-capabilities.md` with exactly this content:

````markdown
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
  an `AgentTask` row and emits Socket.IO `AGENT_PUSH` to all of the user's connected
  iOS clients. (javis-server `app/routers/agent.py`)
- **Content:** plain text / **markdown** — headings, lists, bold/italic, code,
  blockquotes, links. **Hard limit: 50,000 characters** (`AgentPushRequest.content`).
- **Structured iOS cards — exactly 4 types** (javisiosapp chatbot block views):
  `EventList`, `EventCard` (image only via `cover_url`), `ActionButtons` (tap injects
  text as a user message), `SuccessCard`.
- **Scheduling:** `openclaw cron add --name --schedule/--cron/--every --tz
  --channel --to --session --message`. Cron triggers an isolated agent run; the agent
  executes the skill's Node scripts via its `exec` tool. (openclaw
  `src/cli/cron-cli/register.cron-add.ts`)
- **Per-user state:** workspace files at `<skill>/data/users/<userId>.json`, and/or
  the server-side `skill_data` table (JSON `payload`, `dedup_key`, optional time
  range) via `/api/agent/skill-data`. (javisdb `app/models/skill_data.py`)
- **Channels (openclaw):** Telegram, Discord, Slack, Feishu implemented; iOS always
  implied. Delivery is configured on the cron job, not invoked from skill code.
- **Container env:** `OPENCLAW_GATEWAY_TOKEN` always; `OPENAI_API_KEY` /
  `ANTHROPIC_API_KEY` if the user enabled them. Reach javis-server via Docker DNS
  `javis-server:8000` on the `openclaw-user-net` network. Node >= 18 (openclaw
  runtime is Node >= 22). Workspace root: `/home/node/.openclaw/workspace/`.

## NOT SUPPORTED

- **Inbound webhooks / open ports into the container.** → workaround: poll the source
  on a cron instead.
- **Long-running daemons / background processes.** Containers are cron-driven and idle
  ones are reaped (~10 min). → workaround: structure as repeated cron runs.
- **Direct channel push from skill code.** → workaround: configure delivery via
  `openclaw cron add --channel <ch> --to <target>`.
- **Binary/media push, video, audio, embedded HTML, custom iOS UI.** iOS renders
  markdown + the 4 card types only. → workaround: push a link; for an image use an
  `EventCard` `cover_url`; otherwise summarize in markdown.
- **Push notification when the iOS app is backgrounded or killed.** Delivery is
  WebSocket-only and is lost if the app is not foregrounded; there is no APNs path
  from a skill. → workaround: for mission-critical delivery add an openclaw channel
  (e.g. Telegram) as backup and warn in the skill's docs.
- **Direct PostgreSQL access from the container.** → workaround: use javis-server HTTP
  endpoints (`/api/agent/push`, `/api/agent/skill-data`).
- **Arbitrary secrets in the container** beyond injected env vars + the
  `skill_credentials` system. → workaround: use the skill-credentials (OTP) flow.
- **Cross-user data access.** Workspaces are per-user isolated. → workaround: none;
  never reachable by design.
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
````

- [ ] **Step 2: Verify the file exists and has both matrix sections**

Run:
```bash
grep -c '^## SUPPORTED$\|^## NOT SUPPORTED$' skills/skill-creator/references/architecture-capabilities.md
```
Expected: `2`

- [ ] **Step 3: Verify every NOT-SUPPORTED bullet carries a workaround**

Run (counts NOT-SUPPORTED bullets missing the `→ workaround:` marker; cross-user line is the only intentional "none"):
```bash
awk '/^## NOT SUPPORTED$/{f=1;next} /^## /{f=0} f && /^- \*\*/ && !/→ workaround:/{print}' \
  skills/skill-creator/references/architecture-capabilities.md
```
Expected: prints nothing (every bullet line that starts a constraint includes `→ workaround:`).

- [ ] **Step 4: Commit**

```bash
git add skills/skill-creator/references/architecture-capabilities.md
git commit -m "feat(skill-creator): add architecture capabilities reference matrix"
```

---

### Task 2: Pre-flight — load the new reference, add the loop-conformance rule, detect Bash

**Files:**
- Modify: `skills/skill-creator/SKILL.md` (the intro paragraph + Pre-flight section, lines ~9-28)

- [ ] **Step 1: Add the loop-conformance rule to the intro**

Replace the intro paragraph (currently the single sentence beginning "When the user asks to create a new HiJavis skill") with:

```markdown
When the user asks to create a new HiJavis skill (one that runs in their per-user openclaw container, optionally on a cron, and pushes content to their iOS chat), follow this skill exactly.

**Hard rule — loop conformance.** Every skill this generator produces, whether invoked from the Claude desktop app or Claude Code, MUST conform to the HiJavis loop (iOS ↔ javis-server ↔ per-user openclaw container ↔ workspace skills ↔ cron ↔ channels + push → iOS Socket.IO). The Phase 0 feasibility gate below is mandatory and runs BEFORE the 7 questions — never skip it.
```

- [ ] **Step 2: Add Bash detection + reference load to Pre-flight**

In the "## Pre-flight" section, replace pre-flight step 1's opening ("1. **Resolve the output directory.** Run this in Bash to compute the absolute target path:") so the section now begins with a shell-detection step. Insert this as the new step 1, and renumber the existing steps:

```markdown
1. **Detect the runtime.** Try to run a trivial Bash command (e.g. `echo ok`). If it succeeds, set `has_shell = true` (Claude Code / terminal-enabled). If no Bash tool is available (e.g. Claude desktop app), set `has_shell = false`. `has_shell` controls Phase 3 validation and Phase 4 wording.

2. **Resolve the output directory.**
   - If `has_shell`: run
     ```bash
     OUTPUT_BASE="${JAVIS_SKILL_BASE_DIR:-$HOME}"
     OUTPUT_DIR="$OUTPUT_BASE/ClawSkills/<slug>"
     echo "Will write to: $OUTPUT_DIR"
     ```
   - If NOT `has_shell`: you cannot expand env vars. Default `OUTPUT_BASE` to `$HOME`'s ClawSkills parent, state the assumed path explicitly, and ask the user to confirm or supply an absolute output path before writing.
```

Then keep the existing sub-bullets about `JAVIS_SKILL_BASE_DIR`, missing `ClawSkills/`, and overwrite confirmation under the resolved step.

- [ ] **Step 3: Add the new reference to the load list**

Replace the two reference-loading pre-flight steps (currently "2. Load `references/hijavis-loop-reference.md`..." and "3. Load `references/periodic-push-template.md`...") with three steps, renumbered to follow the steps above:

```markdown
3. Load `references/hijavis-loop-reference.md` into context. Source of truth for env vars and endpoints — do NOT skip.
4. Load `references/architecture-capabilities.md` into context. The authoritative SUPPORTED / NOT-SUPPORTED matrix the Phase 0 gate consults — do NOT skip.
5. Load `references/periodic-push-template.md` into context. Literal templates + substitution-marker table.
```

- [ ] **Step 4: Verify the edits landed**

Run:
```bash
grep -c "Hard rule — loop conformance\|has_shell\|architecture-capabilities.md" skills/skill-creator/SKILL.md
```
Expected: `4` or more (rule heading once, `has_shell` 3+ times, reference once).

- [ ] **Step 5: Commit**

```bash
git add skills/skill-creator/SKILL.md
git commit -m "feat(skill-creator): loop-conformance rule + Bash detection + load capabilities ref"
```

---

### Task 3: Insert Phase 0 — Intent & Feasibility gate

**Files:**
- Modify: `skills/skill-creator/SKILL.md` (insert a new section between "## Pre-flight" and "## Phase 1 — Ask the 7 questions")

- [ ] **Step 1: Add the Phase 0 section**

Immediately before the `## Phase 1 — Ask the 7 questions ...` heading, insert:

```markdown
## Phase 0 — Intent & Feasibility gate (mandatory, before any of the 7 questions)

1. **Ask one open question (Q0):** "In a sentence or two — what should this skill do? What triggers it, what does it produce, and where should the result go?"

2. **Classify the requirements** against `references/architecture-capabilities.md`. For each thing the user wants, find the matching SUPPORTED or NOT-SUPPORTED line.

3. **Emit a Loop Conformance Check** in this exact shape:

   ```
   Loop Conformance Check
   ✅ Supported:
     - <requirement> → <how the loop does it>
   ⚠️ Not supported by the current architecture:
     - <requirement> — <reason, citing the loop> → workaround: <from the capabilities ref>
   ```

   If everything is ✅, say so and continue to Phase 1.

4. **If any ⚠️:** propose the degraded build — the supported subset plus the chosen workarounds — and ask: "Proceed with this supported version? (yes / revise / cancel)".
   - **yes** → carry the degraded intent into Phase 1.
   - **revise** → re-ask Q0 and re-run this gate.
   - **cancel** → stop the turn; do not scaffold.

5. **Carry forward** the confirmed intent so every Phase 1 answer and the generated bundle stay loop-conformant. Do NOT generate anything that depends on a ⚠️ capability the user did not accept a workaround for.
```

- [ ] **Step 2: Verify Phase 0 sits before Phase 1**

Run:
```bash
grep -n '^## Phase 0\|^## Phase 1' skills/skill-creator/SKILL.md
```
Expected: the `## Phase 0` line number is smaller than the `## Phase 1` line number.

- [ ] **Step 3: Verify the gate references the capabilities file and the three outcomes**

Run:
```bash
grep -c "Loop Conformance Check\|architecture-capabilities.md\|yes / revise / cancel" skills/skill-creator/SKILL.md
```
Expected: `3` or more.

- [ ] **Step 4: Commit**

```bash
git add skills/skill-creator/SKILL.md
git commit -m "feat(skill-creator): add Phase 0 intent & feasibility gate"
```

---

### Task 4: No-shell fallback in Phase 3 (Validate) and Phase 4 (Report)

**Files:**
- Modify: `skills/skill-creator/SKILL.md` (Phase 3 intro + Phase 4 report block)

- [ ] **Step 1: Gate Phase 3 on `has_shell`**

Replace the Phase 3 intro line ("Run via Bash in this order; if a step fails, fix and retry once before reporting:") with:

```markdown
**If `has_shell` is false (e.g. Claude desktop app): SKIP all of Phase 3.** You cannot run shell validation. Instead, after generating, tell the user verbatim:

> ⚠️ Skipped validation (no shell in this environment). Before publishing, run these in Claude Code or a terminal from the skill folder:
> `node --check scripts/*.js` and `node scripts/<slug_base>.js --help`

**If `has_shell` is true:** run the checks below via Bash in order; if a step fails, fix and retry once before reporting.
```

- [ ] **Step 2: Add a no-shell branch to the Phase 4 report**

At the end of the "## Phase 4 — Report" section (after the existing fenced report block and the "Do not run `clawhub publish` yourself" line), append:

```markdown
When `has_shell` was false, prefix the report with the skipped-validation warning from Phase 3, and change the first line from "✅ Generated and validated:" to "✅ Generated (validation skipped — see warning above):".
```

- [ ] **Step 3: Verify both branches exist**

Run:
```bash
grep -c "SKIP all of Phase 3\|validation skipped — see warning above\|has_shell is true" skills/skill-creator/SKILL.md
```
Expected: `3` or more.

- [ ] **Step 4: Commit**

```bash
git add skills/skill-creator/SKILL.md
git commit -m "feat(skill-creator): no-shell fallback for Phase 3 validation and Phase 4 report"
```

---

### Task 5: Update README to document the new behaviors

**Files:**
- Modify: `skills/skill-creator/README.md`

- [ ] **Step 1: Document the gate and desktop support**

After the "## Invoke" section's paragraph, add:

```markdown
## Feasibility gate (Phase 0)

Before the 7 questions, skill-creator asks what you want the skill to do and checks it
against the HiJavis architecture (`references/architecture-capabilities.md`). If a
requirement isn't supported — e.g. inbound webhooks, video/media push, or alerts while
the iOS app is closed — it tells you why (citing the loop), suggests a workaround, and
offers to build the supported version. Every generated skill is guaranteed to conform
to the loop.

## Running on Claude Desktop vs Claude Code

In Claude Code (shell available) the full flow runs, including `node --check` and
`--help` validation. On the Claude desktop app (no shell) skill-creator still runs the
feasibility gate, asks the questions, and writes the bundle, but skips the Bash-only
validation and tells you the exact commands to run later in a terminal.
```

- [ ] **Step 2: Verify the README additions**

Run:
```bash
grep -c "Feasibility gate (Phase 0)\|Claude Desktop vs Claude Code" skills/skill-creator/README.md
```
Expected: `2`

- [ ] **Step 3: Commit**

```bash
git add skills/skill-creator/README.md
git commit -m "docs(skill-creator): document feasibility gate and desktop fallback"
```

---

### Task 6: End-to-end verification

**Files:** none (verification only)

- [ ] **Step 1: Confirm the existing templates still pass validation (regression guard)**

Run `node --check` against the shipped example script to confirm the unchanged template path is healthy:
```bash
node --check skills/skill-creator/references/examples/english-daily-daily-push.js && echo "example OK"
```
Expected: `example OK`

- [ ] **Step 2: Confirm no `{{…}}` markers leaked into the new/edited skill files**

Run:
```bash
grep -rn '{{' skills/skill-creator/SKILL.md skills/skill-creator/references/architecture-capabilities.md && echo "LEAK" || echo "clean"
```
Expected: `clean`

- [ ] **Step 3: Dry-run the gate logic against a feasible request (manual read-through)**

Read Phase 0 in `SKILL.md` and trace the request "every morning push me 3 English vocab words". Expected outcome: all ✅, proceeds straight to Phase 1. Confirm the section supports this with no ⚠️ path triggered.

- [ ] **Step 4: Dry-run the gate logic against an infeasible request (manual read-through)**

Trace the request "stream live video to my phone and alert me even when the app is closed". Expected outcome: ⚠️ on video push (iOS renders text + 4 cards only) and on background alert (WebSocket-only, no APNs from a skill), each with the workaround from `architecture-capabilities.md`, then the degraded-build prompt. Confirm `SKILL.md` + the capabilities ref together produce this.

- [ ] **Step 5: Final commit (if Step 3/4 read-through surfaced wording fixes)**

```bash
git add -A skills/skill-creator
git commit -m "test(skill-creator): verify feasibility gate against feasible and infeasible requests"
```

---

## Self-Review

**Spec coverage:**
- Behavior #1 (loop conformance) → Task 2 Step 1 (hard rule) + Task 3 (gate carries intent forward).
- Behavior #2 (feasibility gate, warn+suggest+degraded) → Task 1 (matrix) + Task 3 (gate).
- Desktop fallback (detect Bash) → Task 2 Step 2 + Task 4.
- Capabilities reference → Task 1.
- SKILL.md wording + load reference → Task 2.
- README → Task 5. Regression (templates unchanged) → Task 6 Step 1.
All spec sections covered.

**Placeholder scan:** No TBD/TODO; every edit shows literal content and every check shows expected output.

**Type/name consistency:** `has_shell` used identically in Tasks 2, 4. Reference filename `architecture-capabilities.md` consistent across Tasks 1, 2, 3, 5, 6. "Loop Conformance Check" label consistent in Task 1 ref and Task 3 gate. Phase numbering (0→1→3→4) consistent with existing SKILL.md.
