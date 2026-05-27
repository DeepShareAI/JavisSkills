---
name: skill-creator
description: Use when the user wants to create a new HiJavis (openclaw) skill that fires on a cron and pushes results back to their iOS chat. Walks through 7 questions, generates a periodic-push skill bundle under /Users/samuelwei/GoogleDrive/LLM/ClawSkills/<slug>/, validates with lint + dry-run, and reports the exact clawhub publish commands. Triggers — "create a HiJavis skill", "scaffold a skill", "new openclaw skill", "skill-creator".
keywords: hijavis, openclaw, skill, scaffold, generator, periodic-push, cron, javis, clawhub
---

# HiJavis Skill Creator

When the user asks to create a new HiJavis skill (one that runs in their per-user openclaw container, optionally on a cron, and pushes content to their iOS chat), follow this skill exactly.

## Pre-flight (do BEFORE asking any question)

1. Confirm the target directory `/Users/samuelwei/GoogleDrive/LLM/ClawSkills/<slug>/` is OK to write into (overwrite if a folder at the slug already exists). If unclear, ask once. Note: this path is hardcoded — to redirect output elsewhere, the user must explicitly say so.
2. Load `references/hijavis-loop-reference.md` into context. This is the source of truth for env vars and endpoints — do NOT skip.
3. Load `references/periodic-push-template.md` into context. This holds the literal templates and the substitution-marker reference table.

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

Write files to `/Users/samuelwei/GoogleDrive/LLM/ClawSkills/<slug>/` via the Write tool. Generated set:

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

Run via Bash in this order; if a step fails, fix and retry once before reporting:

### Check 1: SKILL.md frontmatter present and non-empty

```bash
awk '/^---$/{c++} c==1 && /^name:/{n=1} c==1 && /^description:/{d=1} END{exit (n && d) ? 0 : 1}' \
  /Users/samuelwei/GoogleDrive/LLM/ClawSkills/<slug>/SKILL.md
```

Exit 0 = pass. Non-zero = re-emit SKILL.md and retry.

### Check 1b: No unfilled `{{…}}` markers anywhere

```bash
grep -rn '{{' /Users/samuelwei/GoogleDrive/LLM/ClawSkills/<slug>/ && exit 1 || exit 0
```

Any match = a substitution was missed; identify the leak, fix, regenerate.

### Check 2: `node --check` on every generated script

```bash
find /Users/samuelwei/GoogleDrive/LLM/ClawSkills/<slug>/scripts -name "*.js" -exec node --check {} \;
```

Any failure = syntax error in a template substitution. Fix the offending file.

### Check 3: Entry script `--help` boots without throwing

```bash
node /Users/samuelwei/GoogleDrive/LLM/ClawSkills/<slug>/scripts/<slug_base>.js --help
```

Must exit 0 and print a usage line. Common failure: `require('./data')` when Q7 was no (mismatch in needs_data flag).

## Phase 4 — Report

After all four checks pass, output exactly this message (with placeholders filled):

```
✅ Generated and validated: /Users/samuelwei/GoogleDrive/LLM/ClawSkills/<slug>/

Files created:
  <list each generated file>

Next steps:
  1) cd /Users/samuelwei/GoogleDrive/LLM/ClawSkills/<slug>
  2) clawhub publish              # publishes to your private ClawHub registry
  3) On HiJavis iOS, in the agent chat, type one of: <trigger_words_csv>
     The skill appears in the Skills tab; tap to enable.

If you want to install directly without publishing (testing only):
  4) On HiJavis: type "install skill from local <slug>" — javis-server's
     /api/agent/workspace-skills/install path runs `npx clawhub install <slug>`
     against your private registry once published there.
```

Do not run `clawhub publish` yourself — leave that to the user (it's a stateful registry action).

## What to do if the user message does NOT request a new skill

Reply: "I'm the HiJavis skill-creator — I only generate new skills. If you want to *use* an existing skill, talk to your HiJavis agent chat instead." Stop the turn.
