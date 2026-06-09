# Periodic-Push Archetype — Generated-File Templates

This document defines the **literal text** of every file the creator generates for a
**periodic-push** skill. Substitution markers use `{{snake_case}}`; conditional blocks use
`{{#if FLAG}}…{{/if}}` / `{{#if !FLAG}}…{{/if}}` (same convention as the old
`references/periodic-push-template.md`).

The periodic-push archetype generalizes `calendar-extractor`: a cron fires, the skill **fetches**
recent transcripts, an agent extracts structured items, and the skill **pushes** — writing the
items to `skill_data` (status `pending`) and delivering a markdown digest to iOS. Every server
call goes through the **vendored** `scripts/javis-contract.js` (copied byte-identical from
`references/javis-contract.js`). The entry script NEVER builds auth headers, formats timestamps,
constructs server URLs, or assembles cron args itself — that is what makes the contract
statically enforceable.

> **Vendoring rule (load-bearing):** the creator copies `references/javis-contract.js`
> **verbatim (byte-identical)** into the generated skill's `scripts/javis-contract.js`. Do not
> re-author, re-indent, or template it. Phase-3 validation compares the vendored copy against the
> canonical module (`CONTRACT_VERSION` + content) and fails on any drift.

---

## Substitution markers

Markers reused from the old `periodic-push-template.md` are kept; new markers introduced by this
archetype are flagged **(new)**.

| Marker | Source | Example |
|---|---|---|
| `{{slug}}` | Q1 | `daily-news-digest` |
| `{{slug_base}}` | derived from slug | `daily-news-digest` (used for `scripts/<slug_base>.js`) |
| `{{TitleCaseSlug}}` | derived | `Daily News Digest` |
| `{{description}}` | Q2 | one-line ≤200 chars |
| `{{tagline_from_description}}` | first sentence of Q2 | — |
| `{{trigger_words_csv}}` | Q3 | `每日新闻, daily news, news digest` |
| `{{trigger_words_bullets}}` | Q3 reformatted | `- "每日新闻"\n- "daily news"\n- "news digest"` |
| `{{trigger_words_json_array}}` | Q3 reformatted | `"每日新闻", "daily news", "news digest"` (JSON-array contents incl. surrounding quotes per item; the `[ ]` are already in the package.json template) |
| `{{cron_crontab}}` | Q4 translated | `0 8 * * *` |
| `{{cron_tz}}` | follow-up to Q4 | `Asia/Shanghai` |
| `{{example_trigger_phrase}}` | Q4 + Q6 example | `每天8点推送新闻到telegram` |
| `{{channels_csv}}` | Q6 | `telegram, discord, slack, feishu` |
| `{{channels_pipe}}` | Q6 for shell help | `telegram\|discord\|slack\|feishu` |
| `{{skill_data_type}}` **(new)** | Q5 / kind of item extracted (singular noun) | `event`, `headline`, `task` |
| `{{item_extraction_guidance}}` **(new)** | LLM-authored from Q1/Q2/Q5 | one paragraph telling the agent what fields to extract per item and how to map them to `payload` + `start_at`/`end_at` |
| `{{digest_heading}}` **(new)** | LLM-authored from Q1/Q2 | the markdown H2 heading for the push digest, e.g. `## 📅 Calendar — new meetings` |
| `{{readme_hook}}` | LLM-authored from Q1/Q2 | 1–2 warm sentences (README only) |
| `{{readme_scenarios_bullets}}` | LLM-authored from Q1/Q2/Q5 | 3–5 "Picture this" bullets (README only) |
| `{{readme_what_it_does}}` | LLM-authored from Q2/Q5 | 1–2 plain-language paragraphs (README only) |
| `{{readme_value_bullets}}` | LLM-authored | 2–4 benefit bullets (README only) |

## Conditional block flags

| Flag | True when |
|---|---|
| `has_cron` | Q4 is non-blank (periodic-push almost always true) |
| `needs_register` | Q7 = yes |
| `writes_skill_data` **(new)** | the skill produces structured rows iOS renders (default **true** for periodic-push; false only for a pure markdown-digest skill with no per-item rows) |
| `has_temporal_items` **(new)** | extracted items carry a start/end time (drives the `start_at`/`end_at` + `toNaiveLocal` path); false for timeless items (headlines/links) |

> `data.js` and `push-toggle.js` are **always** generated for periodic-push (cron state + dedup
> state both live on disk). `register.js` is generated only when `needs_register`.

---

## Generated file: `scripts/javis-contract.js`

**Do not template this file.** Copy `references/javis-contract.js` **verbatim (byte-identical)**
into `scripts/javis-contract.js`. It is `CONTRACT_VERSION` 1.0.1 and exports `JAVIS_BASE`,
`CONTRACT_VERSION`, `authHeaders`, `postAgentPush`, `postSkillData`, `toNaiveLocal`,
`localAnchor`, `assertNaiveLocal`, `getRecentTranscripts`, `buildCronAdd`.

---

## Generated file: `SKILL.md`

````markdown
---
name: {{slug}}
description: {{description}}
keywords: {{trigger_words_csv}}, {{slug}}
metadata:
  openclaw:
    runtime:
      node: ">=18"
---

# {{TitleCaseSlug}}

> {{tagline_from_description}}

## When to use

{{trigger_words_bullets}}

## Core commands

```bash
{{#if needs_register}}
# Register (first use)
node scripts/register.js [userId] <name>
{{/if}}

# Fetch recent transcripts as JSON on stdout (the agent reads this and extracts items)
node scripts/{{slug_base}}.js fetch
node scripts/{{slug_base}}.js [userId] fetch [--since <ISO>] [--limit N]

# Push: read extracted-items JSON on stdin -> write skill_data (pending) + push markdown digest
node scripts/{{slug_base}}.js push  < items.json
node scripts/{{slug_base}}.js [userId] push  < items.json

# Push management (cron toggle)
node scripts/push-toggle.js on  [userId] [--time HH:MM] [--channel {{channels_pipe}}] [--tz <IANA>]
node scripts/push-toggle.js off [userId]
node scripts/push-toggle.js status [userId]
```

## Workflow

This skill is built on the vendored `scripts/javis-contract.js` spine. It never constructs auth
headers, server URLs, timestamps, or cron args itself — it only calls the contract.

1. **Fetch** — `node scripts/{{slug_base}}.js fetch` calls `getRecentTranscripts(...)` and prints
   a JSON envelope to stdout. The envelope includes a `localAnchor(...)` block
   (`reference_time` / `reference_date` / `reference_weekday` / `reference_time_utc` / `tz`) — the
   agent's naive-local **"now"**. The agent MUST resolve every relative date
   ("tomorrow" / "Saturday" / "next week") against this anchor, never its own notion of today.
2. **Extract** — the agent reads the transcript text and produces a JSON array of items.
   {{item_extraction_guidance}}
   {{#if has_temporal_items}}For each item, compute `start_at`/`end_at` as **naive-local
   wall-clock** strings — the entry script does this for you via `toNaiveLocal(iso, tz)`; pass ISO
   instants and the resolved `tz` and let the contract format them.{{/if}}
3. **Push** — pipe the items JSON into `node scripts/{{slug_base}}.js push`. The script:
   - dedups items against per-user local state (`data/users/<userId>.json`, atomic writes),
   {{#if writes_skill_data}}- calls `postSkillData({ skill, type: '{{skill_data_type}}', merge: 'upsert', items })` with every
     item `status: 'pending'` — the iOS app renders these rows with Confirm/Discard,{{/if}}
   - calls `postAgentPush({ skill, content })` with a **markdown** digest of the new items.

> `postSkillData` runs `assertNaiveLocal` on every `start_at`/`end_at` before the request leaves
> the process: a zoned instant (`…Z` or `…+HH:MM`) throws here rather than silently shifting a day
> on iOS. Always feed it strings produced by `toNaiveLocal`.

## markdown-only push (no native cards)

The cron/push path delivers `content` as **markdown only**. Native cards
(EventList / EventCard / ActionButtons / SuccessCard) render **only** on live SSE agent turns (the
interactive archetype). Do NOT emit card directives from this skill — format the digest as
markdown and pass it to `postAgentPush`. The structured `skill_data` rows (not cards) are what give
iOS its rich Confirm/Discard rendering on the push path.

{{#if has_cron}}
## Push setup (cron)

When the user asks for scheduled delivery:

### Step 1 — save preferences
```bash
node scripts/push-toggle.js on [userId] --time <HH:MM> --channel <channel> --tz "{{cron_tz}}"
```

### Step 2 — register the cron via openclaw
The cron argv is built by the contract's `buildCronAdd` (the ONLY allowed constructor). It uses
`--cron` / `--every` / `--at` (plus `--tz --channel --to --session --message`). `--schedule` and
`--command` are NOT valid openclaw flags and must never appear.

```bash
openclaw cron add \
  --name "{{slug}}-<userId>" \
  --cron "{{cron_crontab}}" \
  --tz "{{cron_tz}}" \
  --channel <channel> \
  --to "<channel-target-id>" \
  --session isolated \
  --message "Run /{{slug}}: node scripts/{{slug_base}}.js fetch, extract {{skill_data_type}} items, then node scripts/{{slug_base}}.js push to write skill_data (pending) and deliver a markdown digest."
```

`push-toggle.js on` prints this exact `openclaw cron add` line for the saved prefs — copy it from
there rather than hand-editing flags.

### Step 3 — confirm
Push is set up; results land in the iOS agent chat under /{{slug}}.

Supported channels: {{channels_csv}}
{{/if}}

## Notes

- State (dedup + prefs) lives in `data/users/<userId>.json` and `data/users/<userId>.prefs.json`,
  written atomically (`.tmp` + rename).
- `userId` is optional everywhere — it defaults to `self` (`DEFAULT_USER_ID`) so the skill runs
  zero-config. It is only a local state filename; server calls authenticate via
  `OPENCLAW_GATEWAY_TOKEN`, never this value.
- Built-in Node modules only (global `fetch`, `fs`, `path`) — no `npm install` needed.
- User IDs allow letters/digits/`-`/`_` only (path-traversal guard in `data.js`).
````

---

## Generated file: `scripts/{{slug_base}}.js` (entry script)

This is the only archetype-specific script. It imports `./javis-contract.js` and `./data`, and
exposes `fetch` and `push` subcommands. It builds output **only** through contract calls
(`getRecentTranscripts`, `localAnchor`, `toNaiveLocal`, `postSkillData`, `postAgentPush`) — it
constructs no `Authorization` header, no `http(s)://…` URL, and no cron args.

```js
#!/usr/bin/env node
/**
 * {{slug}} — generated by JavisSkills/javis-skill-creator (periodic-push archetype).
 *
 * AUTO-RUN by an openclaw cron, OR run by the LLM on user-typed commands.
 * The entry script touches the server boundary ONLY through ./javis-contract.js —
 * it never builds auth headers, server URLs, timestamps, or cron args itself.
 *
 * Two subcommands:
 *   fetch  GET recent transcripts via the contract and print them as JSON on stdout
 *          (with a naive-local localAnchor block). The agent reads this and extracts
 *          a JSON array of {{skill_data_type}} items.
 *   push   read the extracted-items JSON array on stdin, dedup it against per-user
 *          local state, write it to skill_data tagged status:"pending", and push a
 *          MARKDOWN digest of the NEW items to the user's iOS chat.
 *
 * Usage:
 *   node {{slug_base}}.js fetch [--since <ISO>] [--limit N]
 *   node {{slug_base}}.js [userId] fetch [--since <ISO>] [--limit N]
 *   node {{slug_base}}.js push  < items.json
 *   node {{slug_base}}.js [userId] push  < items.json
 *   node {{slug_base}}.js --help
 *
 * Env (all injected/handled by the platform + contract):
 *   OPENCLAW_GATEWAY_TOKEN  required — Bearer auth (read only inside javis-contract.js)
 *   JAVIS_SERVER_URL        optional — repointed by the mock-server dry-run only
 *   TZ                      optional — IANA zone used when the fetch payload has none
 */
'use strict';

const {
  getRecentTranscripts,
  postSkillData,
  postAgentPush,
  localAnchor,
  toNaiveLocal,
} = require('./javis-contract');
const { resolveUserId, safeUserPath, readJson, writeJson } = require('./data');
const fs = require('fs');

const SLUG = '{{slug}}';
const SKILL_DATA_TYPE = '{{skill_data_type}}';
const SUBCOMMANDS = ['fetch', 'push'];

// argv is parsed lazily so require()-ing this module from a test is side-effect-free.
// `rest` defaults to [] so doFetch/doPush can be called directly (with injected deps)
// before parseArgv() has run — getFlag then simply returns its default.
let userId, subcommand, rest = [];

function parseArgv() {
  if (process.argv.includes('--help')) {
    console.log([
      'Usage:',
      '  node {{slug_base}}.js fetch [--since <ISO>] [--limit N]',
      '  node {{slug_base}}.js [userId] fetch [--since <ISO>] [--limit N]',
      '  node {{slug_base}}.js push  < items.json',
      '',
      'fetch  GET recent transcripts via the contract -> JSON (+localAnchor) on stdout',
      'push   read extracted-items JSON on stdin -> skill_data (pending) + markdown digest to iOS',
    ].join('\n'));
    process.exit(0);
  }
  // userId is optional: a bare subcommand (`{{slug_base}}.js fetch`) must not be
  // mistaken for the userId.
  const a2 = process.argv[2];
  if (SUBCOMMANDS.includes(a2)) {
    userId = resolveUserId(null);
    subcommand = a2;
    rest = process.argv.slice(3);
  } else {
    userId = resolveUserId(a2);
    subcommand = process.argv[3] || 'fetch';
    rest = process.argv.slice(4);
  }
}

function getFlag(name, dflt) {
  const i = rest.indexOf(`--${name}`);
  return i >= 0 && i + 1 < rest.length ? rest[i + 1] : dflt;
}

// tz resolution: fetch-payload tz -> TZ env -> system zone -> UTC.
function resolveTz(payloadTz) {
  if (payloadTz && String(payloadTz).trim()) return String(payloadTz).trim();
  if (process.env.TZ && process.env.TZ.trim()) return process.env.TZ.trim();
  try {
    const z = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (z) return z;
  } catch (_) { /* fall through */ }
  return 'UTC';
}

function loadState() {
  const p = safeUserPath(userId);
  if (!fs.existsSync(p)) return { userId };
  try { return readJson(p); }
  catch (e) {
    // A truncated/corrupt state file must not brick every future run. `seen` is
    // best-effort dedup state, so start fresh.
    console.error(`⚠️ state file unreadable, starting fresh: ${e.message}`);
    return { userId };
  }
}
function saveState(state) { writeJson(safeUserPath(userId), state); }

// ---- fetch ---------------------------------------------------------------
// Pull recent transcripts via the contract and print them with a naive-local
// anchor. The agent resolves all relative dates against the anchor, never "today".
async function doFetch(deps = {}) {
  const since = getFlag('since', undefined);
  const limit = getFlag('limit', undefined);
  const data = deps.transcripts || await getRecentTranscripts({ since, limit });

  const isEnvelope = data && typeof data === 'object' && !Array.isArray(data);
  const sessions = isEnvelope
    ? (Array.isArray(data.sessions) ? data.sessions : [])
    : (Array.isArray(data) ? data : []);
  const tz = resolveTz(isEnvelope ? data.tz : undefined);
  const nowIso = deps.now ? deps.now() : new Date().toISOString();

  const out = { ...localAnchor(nowIso, tz), tz, sessions };
  if (deps.emit) deps.emit(out);
  else console.log(JSON.stringify(out, null, 2));
  return out;
}

// ---- push ----------------------------------------------------------------
// Read the agent-extracted items, dedup, write skill_data (pending), push markdown.
// Each raw item carries a stable `dedup_key` and a `payload` object. {{#if has_temporal_items}}Temporal items also carry ISO `start_iso`/`end_iso` instants and an optional `tz`, converted to naive-local here.{{/if}}
async function readStdinItems() {
  let input = '';
  for await (const chunk of process.stdin) input += chunk;
  input = input.trim();
  if (!input) throw new Error('push expects a JSON array of items on stdin (got empty input).');
  let parsed;
  try { parsed = JSON.parse(input); }
  catch (e) { throw new Error(`stdin is not valid JSON: ${e.message}`); }
  return Array.isArray(parsed) ? parsed : (Array.isArray(parsed.items) ? parsed.items : []);
}

// Build the markdown digest. Markdown ONLY — never card directives (the push path
// renders no native cards).
function formatDigest(items, tz) {
  const lines = ['{{digest_heading}}', ''];
  for (const it of items) {
    const p = it.payload || {};
    const title = p.title || it.dedup_key || '(untitled)';
    lines.push(`- **${title}**`);
    if (it.start_at) {
      let when = it.start_at.replace('T', ' ');
      if (it.end_at) when += ` – ${it.end_at.replace('T', ' ')}`;
      lines.push(`  - 🕘 ${when}`);
    }
    // TODO: add the {{skill_data_type}}-specific payload fields you want shown.
  }
  return lines.join('\n');
}

// Convert a raw agent item into a contract-shaped skill_data item. Timestamps are
// formatted to naive-local HERE so postSkillData's assertNaiveLocal never trips.
function toSkillDataItem(raw, tz) {
  const item = {
    dedup_key: raw.dedup_key,
    payload: raw.payload || {},
    status: 'pending',
  };
  {{#if has_temporal_items}}
  if (raw.start_iso) item.start_at = toNaiveLocal(raw.start_iso, raw.tz || tz);
  if (raw.end_iso) item.end_at = toNaiveLocal(raw.end_iso, raw.tz || tz);
  {{/if}}
  if (raw.source_ref) item.source_ref = raw.source_ref;
  return item;
}

async function doPush(deps = {}) {
  const load = deps.load || loadState;
  const save = deps.save || saveState;
  const tz = deps.tz || resolveTz(null);
  const nowIso = deps.now ? deps.now() : new Date().toISOString();
  const rawItems = deps.items || await readStdinItems();

  const state = load();
  const seen = state.seen || {};

  // Item-level dedup against local state.
  const fresh = rawItems.filter((it) => it.dedup_key && !seen[it.dedup_key]);
  if (!fresh.length) {
    state.seen = seen; state.lastRunAt = nowIso; save(state);
    console.log('No new items to push.');
    return;
  }

  // Shape items into contract form (status:"pending", naive-local timestamps).
  const items = fresh.map((raw) => toSkillDataItem(raw, tz));

  {{#if writes_skill_data}}
  // Write structured rows the iOS app renders (status:"pending" => Confirm/Discard).
  // postSkillData enforces the naive-local invariant + status enum before sending.
  await postSkillData({ skill: SLUG, type: SKILL_DATA_TYPE, merge: 'upsert', items });
  {{/if}}

  // Deliver the markdown digest (markdown only — no native cards on the push path).
  const content = formatDigest(items, tz);
  await postAgentPush({ skill: SLUG, content });

  for (const it of fresh) seen[it.dedup_key] = nowIso;
  state.seen = seen; state.lastRunAt = nowIso; save(state);
  console.log(`Pushed ${fresh.length} new ${SKILL_DATA_TYPE}(s) to iOS.`);
}

async function main() {
  parseArgv();
  if (subcommand === 'fetch') return doFetch();
  if (subcommand === 'push') return doPush();
  throw new Error(`Unknown subcommand '${subcommand}'. Use 'fetch' or 'push' (see --help).`);
}

module.exports = { doFetch, doPush, resolveTz, formatDigest, toSkillDataItem };

if (require.main === module) {
  main().catch((err) => { console.error('❌', err.message); process.exit(1); });
}
```

---

## Generated file: `scripts/data.js`

Modeled on the gold `calendar-extractor/scripts/data.js`. MUST include `sanitizeId`,
`safeUserPath`, `readJson`, `writeJson`, **`resolveUserId`**, **`DEFAULT_USER_ID = 'self'`**, and
**atomic writes** (`.tmp` + `fs.renameSync`).

```js
#!/usr/bin/env node
/**
 * {{slug}} — shared data helpers
 * Generated by JavisSkills/javis-skill-creator. Boilerplate; path safety lives here.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const USERS_DIR = path.join(__dirname, '../data/users');

// Each HiJavis user runs in their own openclaw container with its own gateway
// token and data volume, so a per-container constant gives correct isolation.
// The userId is only a local dedup-state filename — server calls authenticate
// via OPENCLAW_GATEWAY_TOKEN, not this value.
const DEFAULT_USER_ID = 'self';

function sanitizeId(value) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(value)) {
    console.error('❌ Invalid userId: letters/digits/-/_ only, length 1-128');
    process.exit(1);
  }
  return value;
}

function safeUserPath(userId) {
  const resolved = path.resolve(USERS_DIR, `${userId}.json`);
  if (!resolved.startsWith(path.resolve(USERS_DIR) + path.sep)) {
    console.error('❌ Illegal path');
    process.exit(1);
  }
  return resolved;
}

// Resolve a userId from an optional CLI arg. Falls back to OPENCLAW_USER_ID
// (forward-compat — unset today) and finally the DEFAULT_USER_ID constant, so
// the skill runs zero-config when invoked without an explicit ID.
function resolveUserId(rawArg) {
  const candidate = (rawArg && String(rawArg).trim())
    || process.env.OPENCLAW_USER_ID
    || DEFAULT_USER_ID;
  return sanitizeId(candidate);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

// Atomic write: serialize to a sibling .tmp file then rename over the target.
// rename(2) is atomic on the same filesystem, so a kill mid-write can never
// leave a half-written (and thus unparseable) state file behind.
function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, filePath);
}

module.exports = { sanitizeId, safeUserPath, readJson, writeJson, resolveUserId, DEFAULT_USER_ID };
```

---

## Generated file: `scripts/push-toggle.js`

Cron push toggle. The saved prefs object MUST include a **`tz`** field (modeled on the gold
`self.prefs.json`: `{ time, channel, tz, enabledAt }`). The `on` command builds the
`openclaw cron add` line via the contract's `buildCronAdd` — the only allowed constructor — so
`--schedule`/`--command` can never leak in.

```js
#!/usr/bin/env node
/**
 * {{slug}} — cron push toggle
 * Generated by JavisSkills/javis-skill-creator. Boilerplate; do not edit unless you
 * understand how openclaw cron jobs are listed/removed.
 *
 * Prefs ({time, channel, tz, enabledAt}) persist under data/users/<userId>.prefs.json
 * (atomic writes). The cron argv is built by javis-contract.buildCronAdd, never by
 * hand — so --schedule/--command (invalid openclaw flags) are structurally impossible.
 */
'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');
const { resolveUserId, safeUserPath, readJson, writeJson } = require('./data');
const { buildCronAdd } = require('./javis-contract');

const SLUG = '{{slug}}';
const SLUG_BASE = '{{slug_base}}';
const DEFAULT_CRON = '{{cron_crontab}}';
const DEFAULT_TZ = '{{cron_tz}}';

const cmd = process.argv[2];
const userId = resolveUserId(process.argv[3]);
const args = process.argv.slice(4);

function getFlag(name, dflt) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : dflt;
}

const prefsPath = safeUserPath(userId).replace(/\.json$/, '.prefs.json');
function loadPrefs() { return fs.existsSync(prefsPath) ? readJson(prefsPath) : {}; }
function savePrefs(p) { writeJson(prefsPath, p); }

const cronName = `${SLUG}-${userId}`;

if (cmd === 'on') {
  const time = getFlag('time', '08:00');
  const channel = getFlag('channel', 'iOS');
  const tz = getFlag('tz', DEFAULT_TZ);
  // Prefs MUST carry tz — naive-local correctness on iOS depends on it.
  const prefs = { time, channel, tz, enabledAt: new Date().toISOString() };
  savePrefs(prefs);

  // Build the cron argv via the contract (the ONLY allowed constructor). It uses
  // --cron/--every/--at; --schedule/--command can never appear.
  const message = `Run /${SLUG}: node scripts/${SLUG_BASE}.js fetch, extract items, ` +
    `then node scripts/${SLUG_BASE}.js push to write skill_data (pending) and deliver a markdown digest.`;
  const argv = buildCronAdd({
    name: cronName,
    cron: DEFAULT_CRON,
    tz,
    channel,
    to: '<channel-target-id>',
    session: 'isolated',
    message,
  });

  console.log(`✅ ${SLUG} push enabled: ${time} (${tz}) via ${channel}`);
  console.log('Register the cron with:');
  console.log(`  openclaw ${argv.map((a) => (/\s/.test(a) ? JSON.stringify(a) : a)).join(' ')}`);
  console.log('(replace <channel-target-id> with the real channel target before running)');
} else if (cmd === 'off') {
  if (fs.existsSync(prefsPath)) fs.unlinkSync(prefsPath);
  try { execFileSync('openclaw', ['cron', 'remove', '--name', cronName]); } catch (_) { /* best effort */ }
  console.log(`✅ ${SLUG} push disabled`);
} else if (cmd === 'status') {
  const prefs = loadPrefs();
  if (!Object.keys(prefs).length) {
    console.log(`❌ ${SLUG} push not enabled for ${userId}`);
  } else {
    console.log(`✅ ${SLUG} push: ${prefs.time} (${prefs.tz}) via ${prefs.channel} (since ${prefs.enabledAt})`);
  }
} else {
  console.error(`Usage: node push-toggle.js [on|off|status] [userId] [--time HH:MM] [--channel {{channels_pipe}}] [--tz <IANA>]`);
  process.exit(1);
}
```

---

## Generated file: `scripts/register.js` (only when `needs_register`)

```js
#!/usr/bin/env node
/**
 * {{slug}} — register a new user profile
 * Generated by JavisSkills/javis-skill-creator.
 */
'use strict';

const { resolveUserId, safeUserPath, writeJson } = require('./data');

if (process.argv.includes('--help')) {
  console.log('Usage: node register.js [userId] <name>');
  process.exit(0);
}

const userId = resolveUserId(process.argv[2]);
const name = process.argv[3] || '';

const profile = { userId, name, createdAt: new Date().toISOString() };
writeJson(safeUserPath(userId), profile);
console.log(`✅ Registered ${userId} (${name})`);
```

---

## Generated file: `package.json`

```json
{
  "name": "{{slug}}",
  "version": "0.1.0",
  "description": "{{description}}",
  "keywords": [{{trigger_words_json_array}}],
  "license": "MIT",
  "scripts": {
    {{#if needs_register}}"register": "node scripts/register.js",{{/if}}
    "fetch": "node scripts/{{slug_base}}.js fetch",
    "push": "node scripts/{{slug_base}}.js push",
    "push-on": "node scripts/push-toggle.js on",
    "push-off": "node scripts/push-toggle.js off",
    "push-status": "node scripts/push-toggle.js status"
  }
}
```

Note: no `dependencies` block — Node 18+ provides `fetch`, `fs`, `path` natively, and the
vendored `scripts/javis-contract.js` is dependency-free.

---

## Generated file: `README.md`

The **user-facing** doc — what a person reads before enabling the skill. openclaw does NOT load it
into the agent's runtime context, so the install notice lives here (not in `SKILL.md`).

**Tone & authoring rules (do not emit a bare skeleton):**
- Write for a non-technical end user. NO endpoints, env vars, flags, `node` commands, or file paths.
- Warm, plain, second person. The calendar-extractor README is the gold model: a "Picture this"
  hook list, a plain "What it does", "How to use it", "What makes it handy", a "Good to know" caveat.
- The `{{readme_*}}` markers are **LLM-authored prose** specific to THIS skill — not generic filler.
- Keep the literal parts verbatim: the install notice, the trigger-word list, and the "Good to
  know" app-open caveat (every periodic-push skill delivers over WebSocket, so the keep-app-open
  note always applies).

```markdown
# {{TitleCaseSlug}}

> ⚠️ **Requires the HiJavis iPhone app.** This skill runs inside HiJavis — install the app first, then it's ready to use.
> 📲 https://apps.apple.com/us/app/hijavis/id6745134765

{{readme_hook}}

## Picture this

{{readme_scenarios_bullets}}

If any of those sound like you, this one's for you.

## What it does

{{readme_what_it_does}}

## How to use it

### Just ask

Open your HiJavis chat and ask. Any of these works:

{{trigger_words_bullets}}

HiJavis runs it and replies in seconds. Nothing to set up first.

### Get it on a schedule

Want it to come to you automatically? Ask HiJavis to send it on a schedule — for
example, "send me {{slug}} every morning at 7." It'll start arriving on its own.

## What makes it handy

{{readme_value_bullets}}

## Good to know

For scheduled updates to arrive on time, keep the HiJavis app open and running. If
it's fully closed, an update may wait until you reopen the app. Asking on the spot
works anytime.
```
