---
name: javis-skill-creator
description: Use when the user wants to create a new HiJavis (openclaw) skill that runs in their per-user openclaw container and talks back to javis-server / iOS. Picks an archetype (periodic-push that fires on a cron and pushes results to iOS chat, or interactive-credentials that authenticates a third-party provider on a live agent turn), generates a skill bundle under ${JAVIS_SKILL_BASE_DIR:-$HOME}/ClawSkills/<slug>/ built on the vendored javis-contract.js spine, validates with static checks + a mock-server dry-run, and reports the exact clawhub publish commands. Triggers — "create a HiJavis skill", "scaffold a skill", "new openclaw skill", "javis-skill-creator".
keywords: hijavis, openclaw, skill, scaffold, generator, periodic-push, interactive-credentials, cron, javis, clawhub, contract
---

# HiJavis Skill Creator

When the user asks to create a new HiJavis skill (one that runs in their per-user openclaw container — optionally on a cron, optionally calling back to javis-server / iOS), follow this skill exactly.

**Hard rule — loop conformance.** Every skill this generator produces, whether invoked from the Claude desktop app or Claude Code, MUST conform to the HiJavis loop (iOS ↔ javis-server ↔ per-user openclaw container ↔ workspace skills ↔ cron ↔ channels + push → iOS Socket.IO) AND to the **vendored contract spine** (`references/javis-contract.js`, CONTRACT_VERSION `1.1.0`). The entry script of every generated skill touches the server boundary ONLY through that module — it never builds auth headers, formats timestamps, constructs server URLs, or assembles cron args itself. The Phase 0 feasibility gate below is mandatory and runs BEFORE the questions — never skip it.

## Pre-flight (do BEFORE asking any question)

1. **Detect the runtime.** Try to run a trivial Bash command (e.g. `echo ok`). If it succeeds, set `has_shell = true` (Claude Code / terminal-enabled). If no Bash tool is available (e.g. Claude desktop app), set `has_shell = false`. `has_shell` controls Phase 3 validation (Tier 2 needs a shell) and Phase 4 wording.

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

3. **Load the contract + loop references into context (do NOT skip):**
   - `references/contract-reference.md` — the openclaw → javis-server → iOS contract in prose (auth, the two write paths, the naive-local timezone invariant, markdown-only push, valid cron flags, the read path). Source of truth for *why* each rule exists.
   - `references/hijavis-loop-reference.md` — corrected env vars, endpoints, and the **valid cron flags** (`--cron` / `--every` / `--at`; never `--schedule` / `--command`).
   - `references/architecture-capabilities.md` — the authoritative SUPPORTED / NOT-SUPPORTED matrix the Phase 0 gate consults.

4. **Load the chosen archetype template AFTER Q0 (see Phase 1).** Once the archetype is selected, load that archetype's template set:
   - `periodic-push` → `references/archetypes/periodic-push/periodic-push-template.md` (literal file bodies + the substitution-marker / conditional-flag tables).
   - `interactive-credentials` → `references/archetypes/interactive-credentials/SKILL.md`, `README.md`, `package.json`, `scripts/{{slug_base}}.js`, and `MARKERS.md` (the marker table).
   - In both cases the canonical `references/javis-contract.js` is **not** templated — it is copied **verbatim (byte-identical)** into the generated skill's `scripts/javis-contract.js`.

## Phase 0 — Intent & Feasibility gate (mandatory, before the questions)

1. **Ask one open question (Q-intent):** "In a sentence or two — what should this skill do? What triggers it, what does it produce, and where should the result go?"

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
   - **revise** → re-ask the open question and re-run this gate.
   - **cancel** → stop the turn; do not scaffold.

5. **Carry forward** the confirmed intent so every Phase 1 answer and the generated bundle stay loop-conformant. Do NOT generate anything that depends on a ⚠️ capability the user did not accept a workaround for.

## Phase 1 — Ask the questions (one at a time, use AskUserQuestion where multi-choice fits)

Ask in this order; do NOT batch. **Q0 (archetype) comes first** and decides which later questions apply.

### Q0: Archetype (REQUIRED, asked first — AskUserQuestion)

Pick the archetype from the Phase 0 intent. Offer exactly two options:

- **`periodic-push`** — *"Runs on a schedule (or on demand) and pushes results to my iOS chat."* A cron fires → the skill fetches recent transcripts → an agent extracts structured items → the skill writes them to `skill_data` (status `pending`, rendered as Confirm/Discard rows) and delivers a **markdown** digest via `postAgentPush`, one push per card carrying its `dedup_key` so each card opens its own Agent Chat session. A pushed card is then **editable in its own thread**: when the user replies inside a card's chat, javis-server injects a `[CURRENT CARD]` block and the entry script's `update` subcommand upserts the corrected row with `status:"confirmed"` (passing the `dedup_key` back verbatim, never recomputed). Generalizes `calendar-extractor`. **This is the default** when the intent is "summarize / digest / remind / extract on a schedule."
- **`interactive-credentials`** — *"User asks for something that needs me to sign into a third-party service (Luma, etc.), then I call that service and answer in the same chat."* Runs inside a **live SSE agent turn**: checks `skill_credentials_status(provider)`, runs `skill_credentials_request_external_auth(provider)` if unauthenticated, then the entry script reads the provider cookies from env and calls the third-party API, returning results inline. Generalizes `luma-event-manager`. Because output is a live turn, it MAY emit native cards.

Set `archetype` to the chosen value. **Now load that archetype's template set** (Pre-flight step 4). The archetype determines which of the remaining questions apply:

| Question | periodic-push | interactive-credentials |
|---|---|---|
| Q1 slug | ✅ | ✅ |
| Q2 description | ✅ | ✅ |
| Q3 trigger words | ✅ | ✅ |
| Q4 cron schedule + tz | ✅ | ❌ skip (no cron) |
| Q5 data sources | ✅ | ❌ skip |
| Q6 push channels | ✅ | ❌ — ask **Q6′ provider name** instead |
| Q7 per-user state | ✅ | ❌ skip (no state file by default) |

### Q1: Slug (both archetypes)
Free-text. Validate against `^[a-z][a-z0-9-]{1,40}$`. If invalid, explain and re-ask.

### Q2: One-line description, ≤200 chars (both archetypes)
Free-text. Must mention at least one trigger keyword (iOS `HomeSkillsViewModel.parseDescription` displays this string in the Skills tab). If user input doesn't, suggest a tweaked version and confirm.

### Q3: Trigger words (both archetypes; comma-separated; Chinese + English encouraged)
Free-text or AskUserQuestion with suggested defaults derived from the slug.

### Q4: Cron schedule — **periodic-push only**
Free-text natural language ("every morning at 8am") OR "manual only" / blank.
If set: translate to crontab (e.g., `0 8 * * *`), then ask the timezone follow-up (default "Asia/Shanghai", offer "America/Los_Angeles" and "Other" via AskUserQuestion). This `tz` is also written into the prefs file so the skill can produce correct naive-local wall-clock.
If blank: set `has_cron = false`. The generated skill still has `push-toggle.js`/`data.js` (they always ship for periodic-push), but SKILL.md omits the "Push setup (cron)" section.
*Skip entirely for `interactive-credentials` — that archetype has no cron.*

### Q5: Data sources — **periodic-push only** (multi-select via AskUserQuestion)
Options: `transcripts`, `external-http`, `pure-local-state`, `user-typed-text`. Default `transcripts` (the archetype's fetch step reads recent transcripts via `getRecentTranscripts`). Drives `{{skill_data_type}}`, `{{item_extraction_guidance}}`, and the `has_temporal_items` flag.
*Skip for `interactive-credentials`.*

### Q6: Push channels — **periodic-push only** (multi-select via AskUserQuestion)
Options: iOS / Telegram / Discord / Slack / Feishu. iOS is always implied; ask which additional channels.
*Skip for `interactive-credentials`.*

### Q6′: Provider name — **interactive-credentials only**
Free-text. The lowercase provider name passed to `skill_credentials_*({"provider": …})` and used in the control tokens `<{{provider}}-connected>` / `<{{provider}}-cancelled>` / `<{{provider}}-save-failed>` (e.g. `luma`). Validate against `^[a-z][a-z0-9-]{1,40}$`. Derive `{{PROVIDER_UPPER}}` (upper-cased, for the env-var names the gateway injects), and ask one short follow-up for `{{verb}}` (the primary provider action / entry-script command, e.g. `search`) and `{{provider_command_example}}` (one example command line, e.g. `luma my events`).
*Asked instead of Q6; Q4/Q5/Q7 are skipped for this archetype.*

### Q7: Per-user state required? — **periodic-push only** (yes/no via AskUserQuestion)
Default yes. If yes: also generate `register.js`. (`data.js` ships for periodic-push regardless, since cron prefs + dedup state both live on disk.)
*Skip for `interactive-credentials` — no per-user state file or `register.js` by default.*

## Phase 2 — Generate the bundle

**First, always vendor the contract.** Copy `references/javis-contract.js` **verbatim (byte-identical)** into `$OUTPUT_DIR/scripts/javis-contract.js`. Do not re-author, re-indent, or template it. This is the spine every generated entry script imports; Phase-3 Tier-1 check #4 fails on any drift (including a changed `CONTRACT_VERSION`).

Then generate the archetype-specific files.

### If `archetype == periodic-push`

Compute conditional flags from answers:
- `has_cron` = Q4 non-blank
- `needs_register` = Q7 yes
- `writes_skill_data` = the skill produces structured rows iOS renders (default **true**; false only for a pure markdown-digest skill with no per-item rows)
- `has_temporal_items` = extracted items carry a start/end time (drives the `start_at`/`end_at` + `toNaiveLocal` path; false for timeless items like headlines/links)

Resolve every substitution marker per the table at the top of `references/archetypes/periodic-push/periodic-push-template.md`. Use that doc's literal file bodies. Generated set:

| File | When | Notes |
|---|---|---|
| `scripts/javis-contract.js` | always | **vendored verbatim** (above) |
| `SKILL.md` | always | includes the "markdown-only push (no native cards)" section |
| `README.md` | always | user-facing; `{{readme_*}}` markers are LLM-authored prose |
| `package.json` | always | no `dependencies` block (Node 18+ `fetch`/`fs`/`path`) |
| `scripts/<slug_base>.js` | always | entry script; imports `./javis-contract.js` + `./data` only |
| `scripts/data.js` | always | `resolveUserId` + `DEFAULT_USER_ID='self'` + atomic `.tmp`+rename writes |
| `scripts/push-toggle.js` | always | prefs include `tz`; cron argv built via `buildCronAdd` only |
| `scripts/register.js` | only if `needs_register` | |

**The 6 gaps are closed by construction** (they live in the template, not in prose you must remember): (1) cron argv only via `buildCronAdd` (no `--schedule`); (2) `data.js` has `resolveUserId` + `DEFAULT_USER_ID='self'`; (3) `push-toggle.js` prefs carry `tz`; (4) atomic writes; (5) markdown-only push, routed per-card via `postAgentPush({…, dedupKey})`; (6) `postSkillData`/`toNaiveLocal` give the canonical `skill_data` schema + naive-local timestamps. When `writes_skill_data`, the template also wires the **in-thread edit/confirm path**: a card a skill pushes is editable in its own thread — the agent reads the server-injected `[CURRENT CARD]` block and runs the entry script's `update` subcommand, which upserts the corrected row with `status:"confirmed"` (`pending → confirmed`) passing the `dedup_key` back **verbatim** (never recomputed, or a duplicate row appears).

### If `archetype == interactive-credentials`

Resolve the markers per `references/archetypes/interactive-credentials/MARKERS.md`. Generated set:

| File | When | Notes |
|---|---|---|
| `scripts/javis-contract.js` | always | **vendored verbatim** (above) |
| `SKILL.md` | always | from the archetype template; keeps the auth-first flow + "MAY emit native cards" section |
| `README.md` | always | from the archetype template |
| `package.json` | always | `engines.node >= 18`; no runtime deps |
| `scripts/<slug>.js` | always | entry script (template file is `scripts/{{slug_base}}.js`, renamed to `<slug>.js`); imports `./javis-contract.js`, reads provider cookies from `process.env`, calls the provider API |

**No cron, no per-user state file, no `register.js`** for this archetype. The entry script imports `./javis-contract.js` only for OPTIONAL `postSkillData`/`postAgentPush` reporting; the provider call reads creds from env and never hardcodes a token.

Do NOT scaffold a `data/` directory in either archetype — periodic-push scripts create it on first run; interactive-credentials has no state dir.

## Phase 3 — Validate (two tiers)

**Tier 1 (static checks) runs whenever you can write files; it needs no shell beyond the checks below.** If `has_shell` is true, run Tier 1's bash. If `has_shell` is false (e.g. Claude desktop app), you cannot run bash — perform the Tier-1 checks by inspection of what you generated and note that the shell-backed verification (and all of Tier 2) was skipped (see Phase 4 wording).

**Tier 2 (mock dry-run) requires a shell. If `has_shell` is false, SKIP Tier 2 entirely** and tell the user verbatim:

> ⚠️ Skipped the mock-server dry-run (no shell in this environment). Before publishing, run these in Claude Code or a terminal from the skill folder: the Tier-1 static checks below, then boot `references/mock-server/mock-javis-server.js` and run the entry script against it (Tier 2).

If a check fails, fix and retry once before reporting. Throughout, `$OUTPUT_DIR` is the resolved `${JAVIS_SKILL_BASE_DIR:-$HOME}/ClawSkills/<slug>` and `<entry>` is `<slug_base>.js` (periodic-push) or `<slug>.js` (interactive-credentials).

### Tier 1 — static checks

**T1.1 — Frontmatter has `name:` + `description:`.**
```bash
awk '/^---$/{c++} c==1 && /^name:/{n=1} c==1 && /^description:/{d=1} END{exit (n && d) ? 0 : 1}' \
  "$OUTPUT_DIR/SKILL.md" && echo "T1.1 ok" || { echo "T1.1 FAIL: re-emit SKILL.md frontmatter"; exit 1; }
```

**T1.2 — No unfilled `{{…}}` placeholders anywhere.**
```bash
grep -rn '{{' "$OUTPUT_DIR/" && { echo "T1.2 FAIL: unfilled marker(s) above"; exit 1; } || echo "T1.2 ok"
```

**T1.3 — `node --check` on every generated script.**
```bash
fail=0; for f in "$OUTPUT_DIR"/scripts/*.js; do node --check "$f" || { echo "T1.3 FAIL: $f"; fail=1; }; done
[ $fail -eq 0 ] && echo "T1.3 ok" || exit 1
```

**T1.4 — `javis-contract.js` present and byte-identical to the canonical module (content + CONTRACT_VERSION).**
```bash
CANON="$(cd "$(dirname "${BASH_SOURCE:-$0}")" 2>/dev/null; pwd)"   # not relied on; use the literal creator path below
CONTRACT_REF="<absolute path to skills/javis-skill-creator/references/javis-contract.js>"
cmp -s "$CONTRACT_REF" "$OUTPUT_DIR/scripts/javis-contract.js" \
  && echo "T1.4 ok ($(node -e "console.log(require('$OUTPUT_DIR/scripts/javis-contract.js').CONTRACT_VERSION)"))" \
  || { echo "T1.4 FAIL: vendored javis-contract.js drifted from canonical — re-copy verbatim"; exit 1; }
```
`cmp -s` is the byte-identical check; it covers `CONTRACT_VERSION` too (it's a line in the file). Use the absolute path to the creator's `references/javis-contract.js` for `$CONTRACT_REF`.

**T1.5 — Entry script imports `./javis-contract.js`; it never builds the javis-server boundary (auth header, raw fetch/URL to javis-server, or cron flags) itself.** The check targets the **entry script only** — the contract module legitimately contains `Authorization`/`fetch(`/`http://`/cron construction; that's the point.

```bash
ENTRY="$OUTPUT_DIR/scripts/<entry>"
grep -q "require('./javis-contract" "$ENTRY" && echo "T1.5a ok: imports contract" \
  || { echo "T1.5a FAIL: entry script must import ./javis-contract.js"; exit 1; }
```

**T1.5b — no raw javis-server boundary construction in the entry script.** Scope the grep by archetype, because the interactive-credentials entry script *legitimately* calls the **third-party provider** with a raw `fetch(`/`https://` (that is NOT the javis-server boundary). What is forbidden in **both** archetypes: a hand-built `Authorization`/`Bearer` header, any javis-server URL (`/api/skill/data`, `/api/agent/push`, `/api/transcripts`, or `javis-server`), and any cron-flag / `cron add` construction.

**Strip comments first** — the templates mention `Bearer`/`javis-server` in explanatory comments, and those are not violations. `CODE` below is the entry script with `//` line-comments and `/* */` block-comments removed, so the checks see only executable code:
```bash
CODE="$(node -e '
  const fs=require("fs"); let s=fs.readFileSync(process.argv[1],"utf8");
  s=s.replace(/\/\*[\s\S]*?\*\//g,"").replace(/^\s*\/\/.*$/gm,"").replace(/([^:"\x27])\/\/.*$/gm,"$1");
  process.stdout.write(s);
' "$ENTRY")"
```

For **periodic-push** (entry never legitimately calls any third party): forbid all raw boundary tokens.
```bash
printf '%s' "$CODE" | grep -nE "Authorization|Bearer|fetch\(|https?://|--cron|--every|--at|--name|--message|cron[[:space:]'\"]*add" \
  && { echo "T1.5b FAIL: periodic-push entry touches the boundary directly — route it through javis-contract.js"; exit 1; } \
  || echo "T1.5b ok"
```
For **interactive-credentials** (entry's raw `fetch`/`https://` is the provider call, allowed): forbid only javis-server targets, hand-built auth, and cron flags — never the provider fetch.
```bash
printf '%s' "$CODE" | grep -nE "Bearer [A-Za-z0-9._-]|api/skill/data|api/agent/push|api/transcripts|javis-server|--cron|--every|--at|--name|--message|cron[[:space:]'\"]*add" \
  && { echo "T1.5b FAIL: interactive entry hand-builds the javis-server boundary or cron flags — route those through javis-contract.js"; exit 1; } \
  || echo "T1.5b ok (provider fetch is allowed; no javis-server/cron construction)"
```

**T1.6 — No hardcoded token anywhere (the token is read only inside the contract's `authHeaders()`).**
```bash
grep -rnE "OPENCLAW_GATEWAY_TOKEN\s*=|Bearer [A-Za-z0-9._-]{8,}|sk-[A-Za-z0-9]{8,}" "$OUTPUT_DIR/scripts" \
  | grep -v "javis-contract.js" \
  && { echo "T1.6 FAIL: hardcoded token / assignment outside the contract"; exit 1; } || echo "T1.6 ok"
```

**T1.7 — No `--schedule` / `--command` (invalid openclaw cron flags) actually emitted by the bundle.** The vendored `scripts/javis-contract.js` (verified byte-identical by T1.4) and the templates' SKILL.md/push-toggle.js legitimately **name** these flags in comments and prose only to forbid them — that is not a violation. So scan executable code with comments stripped, and exclude the vendored contract (T1.4 already pins it). Strip `# …` from SKILL.md / `// …` and `/* */` from scripts so only real `--schedule`/`--command` flag *usage* trips the check:
```bash
viol=0
for f in $(find "$OUTPUT_DIR" -type f \( -name '*.js' -o -name '*.md' -o -name '*.json' \) ! -name 'javis-contract.js'); do
  STRIPPED="$(node -e '
    const fs=require("fs"); const p=process.argv[1]; let s=fs.readFileSync(p,"utf8");
    if (p.endsWith(".js")) {
      s=s.replace(/\/\*[\s\S]*?\*\//g,"").replace(/^\s*\/\/.*$/gm,"").replace(/([^:"\x27])\/\/.*$/gm,"$1");
    } else if (p.endsWith(".md")) {
      // drop markdown prose lines that merely mention the flags as forbidden;
      // keep fenced code so a real --schedule/--command in an example is still caught.
      let inFence=false;
      s=s.split("\n").filter(l=>{ if(/^```/.test(l)){inFence=!inFence;return true;} return inFence; }).join("\n");
    }
    process.stdout.write(s);
  ' "$f")"
  if printf '%s' "$STRIPPED" | grep -qE -- "--schedule\b|--command\b"; then
    echo "T1.7 FAIL: invalid cron flag emitted in $f — schedule via --cron/--every/--at and --message only"; viol=1;
  fi
done
[ $viol -eq 0 ] && echo "T1.7 ok" || exit 1
```

**T1.8 — periodic-push push path uses markdown, not card emitters.** *(periodic-push only — skip for interactive-credentials, which MAY emit cards.)* Exclude the vendored `scripts/javis-contract.js`: its header comment names the card types only to document that they render ONLY on interactive turns (it is byte-identical by T1.4, so its internals are not a per-skill violation). The check targets the archetype's own scripts.
```bash
grep -rnE "chat_emit_|EventList|EventCard|ActionButtons|SuccessCard" "$OUTPUT_DIR/scripts" \
  | grep -v "javis-contract.js" \
  && { echo "T1.8 FAIL: card/chat_emit in a periodic-push push path (markdown-only)"; exit 1; } \
  || echo "T1.8 ok"
```

### Tier 2 — mock-server dry-run (`references/mock-server/mock-javis-server.js`)

Self-contained: a local Node process, no real javis-server, no network. The mock asserts bearer auth, the naive-local regex, non-empty `dedup_key`, the status enum, and non-empty markdown `content`, and records a call log at `GET /__calls`. For `POST /api/skill/data` the log also carries a per-item `{ dedup_key, status }` summary, so the edit sub-test can assert an in-thread edit upserted a specific `dedup_key` with `status:"confirmed"`.

**Boot the mock and export the env hooks** (`JAVIS_SERVER_URL` repoints every contract call at the mock; the fake `OPENCLAW_GATEWAY_TOKEN` satisfies `authHeaders()`):
```bash
MOCK="<absolute path to skills/javis-skill-creator/references/mock-server/mock-javis-server.js>"
FIX="<absolute path to skills/javis-skill-creator/references/mock-server/fixture-events.json>"
node "$MOCK" > /tmp/javis-mock.out 2>&1 &
MOCK_PID=$!
# Wait for the parseable listening line, then capture the URL.
for i in $(seq 1 50); do grep -q '^MOCK_LISTENING ' /tmp/javis-mock.out && break; sleep 0.1; done
export JAVIS_SERVER_URL="$(awk '/^MOCK_LISTENING /{print $2; exit}' /tmp/javis-mock.out)"
export OPENCLAW_GATEWAY_TOKEN="dryrun-fake-token"
echo "mock at $JAVIS_SERVER_URL"
```

**T2 (periodic-push):** drive `fetch` then `push` against the mock with the fixture. The agent step (transcript → items) is simulated by mapping the fixture into the entry script's item shape — each item carries a stable `dedup_key`, `start_iso`/`end_iso` ISO instants, the `tz`, and a `payload`. The entry script's `toNaiveLocal` converts the instants; `postSkillData`'s `assertNaiveLocal` then guards them.
```bash
ENTRY="$OUTPUT_DIR/scripts/<entry>"
# 1) fetch: GET /api/transcripts/recent through the contract (proves auth + read path).
node "$ENTRY" fetch > /tmp/javis-fetch.out 2>&1 \
  && echo "T2 fetch ok" || { echo "T2 fetch FAIL"; cat /tmp/javis-fetch.out; }
# 2) push: feed agent-shaped items derived from the fixture on stdin.
node -e '
  const tz = "America/Los_Angeles";
  const ev = require(process.argv[1]);
  process.stdout.write(JSON.stringify(ev.map((e,i) => ({
    dedup_key: e.start_at + "|" + e.title,
    start_iso: e.start_at, end_iso: e.end_at, tz,
    source_ref: e.source_ref,
    payload: { title: e.title, location: e.location, notes: e.notes },
  }))));
' "$FIX" | node "$ENTRY" push > /tmp/javis-push.out 2>&1 \
  && echo "T2 push ok" || { echo "T2 push FAIL"; cat /tmp/javis-push.out; }
```

**Edit sub-test — only when `writes_skill_data`** (a `writes_skill_data=false` skill has no cards, no `update` subcommand: skip this and the `EDIT_KEY` assertion below). Simulate the user editing a pushed card *in its own thread*: feed `update` ONE corrected item that reuses a `dedup_key` written in the push step (here, a changed `start_iso`). The `dedup_key` is passed back **verbatim** — never recomputed — so the row is overwritten in place and flipped `pending → confirmed`:
```bash
# Reuse the first fixture event's dedup_key (the same string the push step wrote),
# bump its start by an hour, and confirm it via the in-thread edit path.
EDIT_KEY="$(node -e '
  const ev = require(process.argv[1]);
  const e = ev[0];
  process.stdout.write(e.start_at + "|" + e.title);
' "$FIX")"
node -e '
  const ev = require(process.argv[1]);
  const e = ev[0];
  const bumped = new Date(new Date(e.start_at).getTime() + 3600e3).toISOString();
  process.stdout.write(JSON.stringify({
    dedup_key: e.start_at + "|" + e.title,   // VERBATIM — identical to the pushed key
    start_iso: bumped, end_iso: e.end_at, tz: "America/Los_Angeles",
    payload: { title: e.title, location: "Zoom", notes: e.notes },
  }));
' "$FIX" | node "$ENTRY" update > /tmp/javis-update.out 2>&1 \
  && echo "T2 update ok" || { echo "T2 update FAIL"; cat /tmp/javis-update.out; }
```

**Assert via the mock's call log** — every server call must be a well-formed 2xx (a 401 means auth wasn't wired; a 422 means a naive-local / dedup_key / status / content violation):
```bash
CALLS="$(curl -s "$JAVIS_SERVER_URL/__calls")"
# EDIT_KEY is set above only when writes_skill_data (the edit sub-test ran); empty otherwise.
EDIT_KEY="${EDIT_KEY:-}" node -e '
  let s=""; process.stdin.on("data",d=>s+=d).on("end",()=>{
    const { calls } = JSON.parse(s);
    const editKey = process.env.EDIT_KEY || "";
    const bad = calls.filter(c => !c.ok);
    const dataCalls = calls.filter(c => c.path === "/api/skill/data" && c.ok);
    const hitData = dataCalls.length > 0;
    const pushes  = calls.filter(c => c.path === "/api/agent/push" && c.ok);
    const hitRead = calls.some(c => c.path === "/api/transcripts/recent" && c.ok);
    console.log("CALL LOG:\n" + calls.map(c=>`  ${c.method} ${c.path} -> ${c.status}${c.dedup_key?" ["+c.dedup_key+"]":""}${c.items?" "+JSON.stringify(c.items):""}${c.reason?" ("+c.reason+")":""}`).join("\n"));
    if (bad.length) { console.error("T2 FAIL: non-2xx call(s): " + bad.map(c=>c.path+" "+c.status+" "+(c.reason||"")).join("; ")); process.exit(1); }
    if (!hitRead) { console.error("T2 FAIL: never hit /api/transcripts/recent"); process.exit(1); }
    if (!pushes.length) { console.error("T2 FAIL: never pushed markdown to /api/agent/push"); process.exit(1); }
    // For a writes_skill_data skill (the default), every push must carry the card dedup_key
    // so it routes into that card own Agent Chat session.
    if (hitData) {
      const missing = pushes.filter(p => !p.dedup_key);
      if (missing.length) { console.error("T2 FAIL: " + missing.length + " push(es) missing dedup_key (per-card routing broken)"); process.exit(1); }
      // Edit sub-test (writes_skill_data only): a /api/skill/data upsert must have recorded the SAME
      // dedup_key with status:"confirmed" — proving the in-thread edit confirmed the card in place.
      if (editKey) {
        const editUpsert = dataCalls.some(c => Array.isArray(c.items) &&
          c.items.some(it => it.dedup_key === editKey && it.status === "confirmed"));
        if (!editUpsert) { console.error("T2 FAIL: no skill_data upsert recorded dedup_key " + JSON.stringify(editKey) + " with status:\"confirmed\" (in-thread edit path broken)"); process.exit(1); }
        console.log("T2 ok: skill_data + " + pushes.length + " per-card push(es) + in-thread edit confirmed " + JSON.stringify(editKey) + ", all auth\x27d, naive-local & routed by dedup_key");
      } else {
        console.log("T2 ok: skill_data + " + pushes.length + " per-card push(es), all auth\x27d, naive-local & routed by dedup_key");
      }
    } else {
      console.log("T2 ok: aggregate push only (no skill_data rows)");
    }
  });
' <<< "$CALLS"
```
Save the printed `CALL LOG` — Phase 4 prints it.

**T2 (interactive-credentials):** there is no cron/fetch/push loop; instead assert the skill checks credentials before calling the provider. Boot the mock with `MOCK_AUTHENTICATED` unset (so the credential-status stub returns `authenticated:false`) and run the entry script with NO provider cookies in env — the entry script must return `status:"auth"` (and must NOT call the provider API), proving it gates on credentials:
```bash
ENTRY="$OUTPUT_DIR/scripts/<slug>.js"
# Provider cookies intentionally absent -> haveCreds() false -> must report auth, not call the API.
unset $(env | grep -oE '^[A-Z0-9_]*_(SESSION|USER_ID|API_BASE|AUTH_SESSION_KEY|DID)=' | sed 's/=.*//') 2>/dev/null
OUT="$(node "$ENTRY" 2>&1)"
echo "$OUT" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const r=JSON.parse(s);if(r.status!=="auth"){console.error("T2 FAIL: entry script did not gate on credentials (expected status:auth, got "+r.status+")");process.exit(1)}console.log("T2 ok: gates on skill_credentials before calling provider")})'
# Any optional postSkillData/postAgentPush the skill makes must still be auth'd & naive-local — same /__calls assertion applies if the call log is non-empty.
```

**Always tear down the mock:**
```bash
kill "$MOCK_PID" 2>/dev/null
```

## Phase 4 — Report

After all checks pass, output exactly this message (placeholders filled). Include the **contract version** and the **dry-run call log** captured in Tier 2:

```
✅ Generated and validated: ${JAVIS_SKILL_BASE_DIR:-$HOME}/ClawSkills/<slug>/
   archetype: <periodic-push|interactive-credentials>   contract: javis-contract.js v<CONTRACT_VERSION>

Files created:
  <list each generated file>

Mock dry-run call log (Tier 2):
  <the saved CALL LOG — each "METHOD /path -> status"; for interactive-credentials, the credential-gate result>

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

When `has_shell` was false, prefix the report with the skipped-dry-run warning from Phase 3, change the first line from "✅ Generated and validated:" to "✅ Generated (mock dry-run skipped — see warning above):", and replace the "Mock dry-run call log" block with a note that Tier 2 was not run. Still print the contract version (`v<CONTRACT_VERSION>` from the vendored module).

## What to do if the user message does NOT request a new skill

Reply: "I'm the HiJavis skill-creator — I only generate new skills. If you want to *use* an existing skill, talk to your HiJavis agent chat instead." Stop the turn.
