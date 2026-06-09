# javis-skill-creator

A JavisSkills component. Scaffolds new HiJavis-deployable (openclaw) skills that run in the user's per-user openclaw container and talk back to javis-server / iOS. Every generated skill is built on the vendored `javis-contract.js` spine (auth, the two write paths, the naive-local timezone invariant, cron-arg construction) in one of two archetypes:

- **periodic-push** — fires on a cron (or on demand), fetches recent transcripts, an agent extracts structured items, the skill writes them to `skill_data` (rendered as Confirm/Discard rows) via `POST /api/skill/data` and delivers a **markdown** digest via `POST /api/agent/push` → Socket.IO → iOS chat. Generalizes `calendar-extractor`.
- **interactive-credentials** — runs inside a live SSE agent turn: gates on `skill_credentials_status(provider)`, requests external auth if needed, then calls a third-party provider (Luma, etc.) and answers inline. Generalizes `luma-event-manager`.

## Invoke

In Claude Code (Code mode), say one of:
- "Create a HiJavis skill"
- "Scaffold a new openclaw skill"
- "Use javis-skill-creator to make a daily news digest skill"
- "/javis-skill-creator"

Claude loads `SKILL.md`, runs the Phase 0 feasibility gate, then asks Q0 (archetype) followed by the archetype-relevant subset of Q1-Q7 / Q6′ — one at a time — and writes the generated bundle to `${JAVIS_SKILL_BASE_DIR:-$HOME}/ClawSkills/<slug>/` — that is, your personal ClawSkills registry parent directory (set `JAVIS_SKILL_BASE_DIR` in your shell rc; defaults to `$HOME`). Overwrites if the slug folder already exists.

> Example: with `export JAVIS_SKILL_BASE_DIR=/Users/samuelwei/GoogleDrive/LLM` in `~/.zshrc`, a slug `daily-news` lands at `/Users/samuelwei/GoogleDrive/LLM/ClawSkills/daily-news/`. Without the env var set, it lands at `~/ClawSkills/daily-news/`.

## Feasibility gate (Phase 0)

Before any questions, javis-skill-creator asks what you want the skill to do and checks it
against the HiJavis architecture (`references/architecture-capabilities.md`). If a
requirement isn't supported — e.g. inbound webhooks, video/media push, or alerts while
the iOS app is closed — it tells you why (citing the loop), suggests a workaround, and
offers to build the supported version. Every generated skill is guaranteed to conform
to the loop and to the vendored contract spine.

## Running on Claude Desktop vs Claude Code

In Claude Code (shell available) the full flow runs, including the Tier-1 static checks
and the Tier-2 mock-server dry-run. On the Claude desktop app (no shell) javis-skill-creator
still runs the feasibility gate, asks the questions, writes the bundle, and performs the
Tier-1 checks by inspection, but skips the shell-backed verification and the entire Tier-2
dry-run, telling you the exact commands to run later in a terminal.

## What it generates

The bundle differs by archetype. `scripts/javis-contract.js` is **always present**, copied
**verbatim (byte-identical)** from `references/javis-contract.js` — it is the contract spine
every entry script imports.

**periodic-push:**

```
${JAVIS_SKILL_BASE_DIR:-$HOME}/ClawSkills/<slug>/
├── SKILL.md             # ready for HiJavis (openclaw) to load; markdown-only push section
├── README.md
├── package.json
└── scripts/
    ├── javis-contract.js  # vendored verbatim — auth, write paths, naive-local, cron args
    ├── <slug>.js          # main entry — also what cron triggers; imports javis-contract + data
    ├── data.js            # resolveUserId + DEFAULT_USER_ID='self' + atomic .tmp+rename writes
    ├── push-toggle.js     # on/off/status; cron argv built only via buildCronAdd; prefs carry tz
    └── register.js        # only if you said per-user state is needed
```

**interactive-credentials:** no `push-toggle.js` / `register.js` / `data.js` (no cron, no
per-user state file). Just `SKILL.md`, `README.md`, `package.json`, `scripts/javis-contract.js`,
and `scripts/<slug>.js` (reads provider cookies from env, calls the provider API).

After generation, the skill runs Phase 3 validation (Tier 1 + Tier 2, see Tests below) and
reports the exact `clawhub publish` command to push your new skill to your private registry.
The skill becomes available in HiJavis as soon as you type one of your chosen trigger words
in the agent chat.

## The questions

Q0 (archetype) is asked first and decides which later questions apply. Q1-Q3 are common to
both archetypes; the rest are per-archetype.

| # | Question | periodic-push | interactive-credentials |
|---|---|---|---|
| Q0 | Archetype (periodic-push / interactive-credentials) | ✅ | ✅ |
| Q1 | Slug (kebab-case, `^[a-z][a-z0-9-]{1,40}$`) | ✅ | ✅ |
| Q2 | One-line description (≤200 chars; mention a trigger word) | ✅ | ✅ |
| Q3 | Trigger words (CSV; Chinese + English encouraged) | ✅ | ✅ |
| Q4 | Cron schedule + timezone | ✅ | — skip (no cron) |
| Q5 | Data sources (transcripts / external-http / local state / user-typed) | ✅ | — skip |
| Q6 | Push channels (iOS always; + Telegram / Discord / Slack / Feishu) | ✅ | — Q6′ instead |
| Q6′ | Provider name (+ verb / example command) | — | ✅ |
| Q7 | Per-user state needed? | ✅ | — skip |

## Out of scope

- Editing existing skills (manual re-run for now)
- Auto-publishing to clawhub (you run `clawhub publish` after generation)

Both archetypes (periodic-push and interactive-credentials) ship today as first-class
options chosen by Q0.

## Tests

No automated regression tests are bundled with this skill yet. Validate changes by running
the skill in a fresh Claude Code session (`Use javis-skill-creator to make a <slug> skill`)
and inspecting the generated `${JAVIS_SKILL_BASE_DIR:-$HOME}/ClawSkills/<slug>/` against
expectations. The skill's own Phase 3 validation runs on every invocation:

- **Tier-1 static checks** — frontmatter, no-unfilled-`{{…}}`-markers, `node --check`,
  `javis-contract.js` byte-identical drift (incl. `CONTRACT_VERSION`), entry-imports-contract,
  no-hardcoded-token, no invalid `--schedule` / `--command` cron flags, and (periodic-push)
  markdown-only push.
- **Tier-2 mock-server dry-run** — boots `references/mock-server/mock-javis-server.js` (a
  local contract mirror, no network) and drives the entry script against it, asserting bearer
  auth, naive-local timestamps, `dedup_key`, the status enum, and non-empty markdown content.

## See also

- Spec: `docs/superpowers/specs/2026-06-08-javis-skill-creator-contract-unification-design.md` (local-only)
- HiJavis loop reference: `references/hijavis-loop-reference.md`
- Contract reference (prose): `references/contract-reference.md`
- Contract module (vendored verbatim into generated skills): `references/javis-contract.js`
- Templates: `references/archetypes/periodic-push/periodic-push-template.md` and `references/archetypes/interactive-credentials/`
- Mock server / dry-run: `references/mock-server/`
- Exemplars: `references/examples/`
