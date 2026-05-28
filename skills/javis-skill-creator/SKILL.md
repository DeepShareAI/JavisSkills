---
name: javis-skill-creator
description: Use when the user wants to create a new HiJavis (openclaw) skill that fires on a cron and pushes results back to their iOS chat. Walks through 7 questions, generates a periodic-push skill bundle under ${JAVIS_SKILL_BASE_DIR:-$HOME}/ClawSkills/<slug>/, validates with lint + dry-run, and reports the exact clawhub publish commands. Triggers — "create a HiJavis skill", "scaffold a skill", "new openclaw skill", "javis-skill-creator".
keywords: hijavis, openclaw, skill, scaffold, generator, periodic-push, cron, javis, clawhub
---

# HiJavis Skill Creator

When the user asks to create a new HiJavis skill (one that runs in their per-user openclaw container, optionally on a cron, and pushes content to their iOS chat), follow this skill exactly.

**Hard rule — loop conformance.** Every skill this generator produces, whether invoked from the Claude desktop app or Claude Code, MUST conform to the HiJavis loop (iOS ↔ javis-server ↔ per-user openclaw container ↔ workspace skills ↔ cron ↔ channels + push → iOS Socket.IO). The Phase 0 feasibility gate below is mandatory and runs BEFORE the 7 questions — never skip it.

## Pre-flight (do BEFORE asking any question)

1. **Detect the runtime.** Try to run a trivial Bash command (e.g. `echo ok`). If it succeeds, set `has_shell = true` (Claude Code / terminal-enabled). If no Bash tool is available (e.g. Claude desktop app), set `has_shell = false`. `has_shell` controls Phase 3 validation and Phase 4 wording.

2. **Resolve the output directory.**
   - If `has_shell`: run
     ```bash
     OUTPUT_BASE="${JAVIS_SKILL_BASE_DIR:-$HOME}"
     OUTPUT_DIR="$OUTPUT_BASE/ClawSkills/<slug>"
     echo "Will write to: $OUTPUT_DIR"
     ```
   - If NOT `has_shell`: you cannot expand env vars. Default `OUTPUT_BASE` to `$HOME`'s ClawSkills parent, state the assumed path explicitly, and ask the user to confirm or supply an absolute output path before writing.

   - If `JAVIS_SKILL_BASE_DIR` is set in the user's shell, that's their personal skill-registry parent (e.g., the maintainer uses `/Users/samuelwei/GoogleDrive/LLM`). Otherwise it falls back to `$HOME`.
   - If `$OUTPUT_BASE/ClawSkills/` does not exist, tell the user (they may want to `mkdir -p` it, or set `JAVIS_SKILL_BASE_DIR` first to point at a different location).
   - If `$OUTPUT_DIR` itself already exists, ask once before overwriting.

   Use the resolved `$OUTPUT_DIR` (or its literal expansion) for all subsequent file writes and validation commands in Phases 2-4.
3. Load `references/hijavis-loop-reference.md` into context. Source of truth for env vars and endpoints — do NOT skip.
4. Load `references/architecture-capabilities.md` into context. The authoritative SUPPORTED / NOT-SUPPORTED matrix the Phase 0 gate consults — do NOT skip.
5. Load `references/periodic-push-template.md` into context. Literal templates + substitution-marker table.

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

## Phase 1 — Ask the 7 questions (one at a time, use AskUserQuestion where multi-choice fits)

Ask in this order; do NOT batch:

### Q1: Slug
Free-text. Validate against `^[a-z][a-z0-9-]{1,40}$`. If invalid, explain and re-ask.

### Q2: One-line description (≤200 chars)
Free-text. Must mention at least one trigger keyword (iOS `HomeSkillsViewModel.parseDescription` displays this string in the Skills tab). If user input doesn't, suggest a tweaked version and confirm.

### Q3: Trigger words (comma-separated; Chinese + English encouraged)
Free-text or AskUserQuestion with suggested defaults derived from the slug.

### Q4: Cron schedule
Free-text natural language ("every morning at 8am") OR "manual only" / blank.
If set: translate to crontab (e.g., `0 8 * * *`), then ask the timezone follow-up (default "Asia/Shanghai", offer "America/Los_Angeles" and "Other" via AskUserQuestion).
If blank: set `has_cron = false`. The generated skill will have no `push-toggle.js` and no cron section in SKILL.md.

### Q5: Data sources (multi-select via AskUserQuestion)
Options: `transcripts`, `external-http`, `pure-local-state`, `user-typed-text`. Default `pure-local-state`.

### Q6: Push channels (multi-select via AskUserQuestion)
Options: iOS / Telegram / Discord / Slack / Feishu. iOS is always implied; ask which additional channels.

### Q7: Per-user state required? (yes/no via AskUserQuestion)
Default yes. If yes: generates `register.js` + `data.js` + `data/users/` layout. If no: stateless entry script only.

## Phase 2 — Generate the bundle

Compute conditional flags from answers:
- `has_cron` = Q4 is non-blank
- `needs_register` = Q7 yes
- `needs_data` = Q7 yes OR Q5 includes `pure-local-state` OR `has_cron` (push-toggle.js requires data.js helpers)
- `has_external_http` = Q5 includes `external-http`
- `pure_node_builtins` = NOT `has_external_http`
- `has_multi_data_source` = Q5 has 2 or more selected sources

Resolve every substitution marker (see the table at the top of `periodic-push-template.md`). For `{{step_1_*}}`, pick from the data-source step map: first selected source from Q5. When Q5 has 2+ sources, set `has_multi_data_source = true`, fill `{{step_2_*}}` from the second source, and any 3rd+ sources go into the SKILL.md "Notes" bullet. When Q5 has exactly 1 source, leave `{{step_2_*}}` unused (the template skips it via the conditional).

Write files to `${JAVIS_SKILL_BASE_DIR:-$HOME}/ClawSkills/<slug>/` via the Write tool. Generated set:

| File | When |
|---|---|
| `SKILL.md` | always |
| `package.json` | always |
| `scripts/<slug_base>.js` | always |
| `scripts/push-toggle.js` | only if `has_cron` |
| `scripts/register.js` | only if `needs_register` |
| `scripts/data.js` | only if `needs_data` |

Do NOT scaffold a `data/` directory — the generated scripts create it on first run.

## Phase 3 — Validate

**If `has_shell` is false (e.g. Claude desktop app): SKIP all of Phase 3.** You cannot run shell validation. Instead, after generating, tell the user verbatim:

> ⚠️ Skipped validation (no shell in this environment). Before publishing, run these in Claude Code or a terminal from the skill folder:
> `node --check scripts/*.js` and `node scripts/<slug_base>.js --help`

**If `has_shell` is true:** run the checks below via Bash in order; if a step fails, fix and retry once before reporting.

### Check 1: SKILL.md frontmatter present and non-empty

```bash
awk '/^---$/{c++} c==1 && /^name:/{n=1} c==1 && /^description:/{d=1} END{exit (n && d) ? 0 : 1}' \
  ${JAVIS_SKILL_BASE_DIR:-$HOME}/ClawSkills/<slug>/SKILL.md
```

Exit 0 = pass. Non-zero = re-emit SKILL.md and retry.

### Check 1b: No unfilled `{{…}}` markers anywhere

```bash
grep -rn '{{' ${JAVIS_SKILL_BASE_DIR:-$HOME}/ClawSkills/<slug>/ && exit 1 || exit 0
```

Any match = a substitution was missed; identify the leak, fix, regenerate.

### Check 2: `node --check` on every generated script

```bash
find ${JAVIS_SKILL_BASE_DIR:-$HOME}/ClawSkills/<slug>/scripts -name "*.js" -exec node --check {} \;
```

Any failure = syntax error in a template substitution. Fix the offending file.

### Check 3: Entry script `--help` boots without throwing

```bash
node ${JAVIS_SKILL_BASE_DIR:-$HOME}/ClawSkills/<slug>/scripts/<slug_base>.js --help
```

Must exit 0 and print a usage line. Common failure: `require('./data')` when Q7 was no (mismatch in needs_data flag).

## Phase 4 — Report

After all four checks pass, output exactly this message (with placeholders filled):

```
✅ Generated and validated: ${JAVIS_SKILL_BASE_DIR:-$HOME}/ClawSkills/<slug>/

Files created:
  <list each generated file>

Next steps:
  1) cd ${JAVIS_SKILL_BASE_DIR:-$HOME}/ClawSkills/<slug>
  2) clawhub publish              # publishes to your private ClawHub registry
  3) On HiJavis iOS, in the agent chat, type one of: <trigger_words_csv>
     The skill appears in the Skills tab; tap to enable.

If you want to install directly without publishing (testing only):
  4) On HiJavis: type "install skill from local <slug>" — javis-server's
     /api/agent/workspace-skills/install path runs `npx clawhub install <slug>`
     against your private registry once published there.
```

Do not run `clawhub publish` yourself — leave that to the user (it's a stateful registry action).

When `has_shell` was false, prefix the report with the skipped-validation warning from Phase 3, and change the first line from "✅ Generated and validated:" to "✅ Generated (validation skipped — see warning above):".

## What to do if the user message does NOT request a new skill

Reply: "I'm the HiJavis skill-creator — I only generate new skills. If you want to *use* an existing skill, talk to your HiJavis agent chat instead." Stop the turn.
