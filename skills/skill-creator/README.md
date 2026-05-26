# skill-creator

A JavisSkills component. Scaffolds new HiJavis-deployable (openclaw) skills that follow the periodic-push loop: cron trigger → Node script → POST `/api/agent/push` → Socket.IO → iOS chat.

## Invoke

In Claude Code (Code mode), say one of:
- "Create a HiJavis skill"
- "Scaffold a new openclaw skill"
- "Use skill-creator to make a daily news digest skill"
- "/skill-creator"

Claude loads `SKILL.md`, asks 7 questions one at a time, and writes the generated bundle to `./generated-skills/<slug>/` in your current working directory.

## What it generates

A periodic-push skill bundle:

```
./generated-skills/<slug>/
├── SKILL.md             # ready for HiJavis (openclaw) to load
├── package.json
└── scripts/
    ├── <slug>.js        # main entry — also what cron triggers
    ├── push-toggle.js   # on/off/status for the cron job (only if you chose a schedule)
    ├── register.js      # only if you said per-user state is needed
    └── data.js          # only if per-user state is needed
```

After generation, the skill runs validation (frontmatter check, `node --check`, `--help` boot check) and reports the exact `clawhub publish` command to push your new skill to your private registry. The skill becomes available in HiJavis as soon as you type one of your chosen trigger words in the agent chat.

## The 7 questions

| # | Question | Notes |
|---|---|---|
| 1 | Slug (kebab-case) | `^[a-z][a-z0-9-]{1,40}$` |
| 2 | One-line description | ≤200 chars; mention a trigger word |
| 3 | Trigger words (CSV) | Chinese + English encouraged |
| 4 | Cron schedule | natural language; or blank for manual-only |
| 5 | Data sources | transcripts / external HTTP / local state / user-typed text |
| 6 | Push channels | iOS always; pick additional from Telegram / Discord / Slack / Feishu |
| 7 | Per-user state needed? | yes/no |

## Out of scope

- Editing existing skills (manual re-run for now)
- Auto-publishing to clawhub (you run `clawhub publish` after generation)
- Other skill templates — only periodic-push for now. Future: interactive-command (luma-style), background-extractor (calendar-style)

## Tests

Golden-fixture regression tests live in `tests/golden/`. To run:

```bash
cd skills/skill-creator/tests/golden
./run-golden.sh sample-daily
./run-golden.sh manual-only-stateless
./run-golden.sh multi-channel
```

Each fixture invokes the skill non-interactively via `claude -p` with the pre-recorded answers, then `diff -r`'s the output against `expected-bundle/`.

## See also

- Spec: `docs/superpowers/specs/2026-05-26-skill-creator-design.md` (local-only)
- HiJavis loop reference: `references/hijavis-loop-reference.md`
- Template strings: `references/periodic-push-template.md`
- Exemplars: `references/examples/`
