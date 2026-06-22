# The openclaw → javis-server → iOS contract

This is the single prose description of the server boundary that
`references/javis-contract.js` (CONTRACT_VERSION `1.1.0`) encodes in code. Every
HiJavis skill a user runs crosses this boundary; the vendored module exists so no
generated skill has to re-derive it. When the two disagree, **the module wins** —
this doc explains *why* each rule exists; the module enforces it.

The flow: a skill runs inside the user's openclaw container, calls back to
javis-server over HTTP, javis-server persists/forwards, and the iOS HiJavis app
renders the result. Three properties have to be right end-to-end: who the call is
authenticated as, the exact JSON shape, and the timezone encoding.

---

## 1. Auth model — the gateway token

Each user has their own openclaw container. javis-server injects
`OPENCLAW_GATEWAY_TOKEN` into that container as an environment variable. Every call
back to the server carries it:

```
Authorization: Bearer ${OPENCLAW_GATEWAY_TOKEN}
```

On the server, `get_gateway_user` resolves that token to the owning Clerk user, so
the token *is* the identity — there is no separate user-id argument. Rules:

- **Never hardcode the token** and **never pass it as a CLI argument.** It is
  read only from the environment, only inside `authHeaders()`.
- `authHeaders()` **throws** if `OPENCLAW_GATEWAY_TOKEN` is unset or blank, rather
  than sending an empty `Bearer` — every endpoint below is gateway-token
  authenticated, so a missing token is a hard failure, not a silent 401.

### Base URL and the testability hook

Production has **no** `JAVIS_SERVER_URL` env var; the base URL defaults to
`http://javis-server:8000` (in-cluster DNS). But the module reads it as:

```js
const JAVIS_BASE = process.env.JAVIS_SERVER_URL || 'http://javis-server:8000';
```

The env read is **required, not optional**: the Phase-3 mock-server dry-run sets
`JAVIS_SERVER_URL=http://127.0.0.1:<port>` to repoint every call at the local mock.
Removing the override would make the contract untestable. It is the only reason the
env var is consulted.

---

## 2. The two write paths

### `POST /api/skill/data` — structured rows

Upserts structured rows the iOS app renders as native UI (e.g. the calendar table
with Confirm / Discard buttons on `pending` rows). Server emits SSE
`skill_data_updated`; iOS re-GETs and re-renders.

```jsonc
POST /api/skill/data
Authorization: Bearer <token>
Content-Type: application/json
{
  "skill": "calendar-extractor",     // required
  "type":  "calendar_event",         // required, the row type
  "merge": "upsert",                 // default "upsert"
  "window": { ... },                 // OPTIONAL — sent only when defined
  "items": [
    {
      "dedup_key":  "2026-06-09|lunch with dana|...",  // required, non-empty
      "status":     "pending",          // required, one of {pending, confirmed}
      "start_at":   "2026-06-09T12:00:00",  // naive-local — see §3
      "end_at":     "2026-06-09T13:00:00",  // naive-local; may be absent
      "payload":    { ... },            // the row body iOS renders
      "source_ref": "sess-canned-1"     // optional provenance (e.g. session id)
    }
  ]
}
```

`postSkillData` validates **before the request leaves the process**:
- `skill`, `type` required; `items` must be an array.
- each item's `dedup_key` non-empty;
- `status` strictly `pending` or `confirmed`;
- `start_at` and `end_at`, **when present**, pass `assertNaiveLocal` (§3);
- `window` is included in the body only when defined.
- Non-2xx **throws** — a generated skill never silently swallows a failed write.

`dedup_key` is what makes the upsert idempotent across cron runs. Derive it
deterministically from stable fields (e.g. `localdate|title|start`), as
calendar-extractor's `dedupKey` does, so the same event re-extracted tomorrow lands
on the same row instead of duplicating.

### `POST /api/agent/push` — markdown digest

Delivers a chat message to the user's iOS session. Server emits SSE `agent_push`;
iOS marks the session unread and renders the message.

```jsonc
POST /api/agent/push
Authorization: Bearer <token>
Content-Type: application/json
{
  "skill":      "calendar-extractor",   // required
  "content":    "## 2 new events\n- Lunch with Dana ...",  // required MARKDOWN
  "session_id": "sess-...",             // optional; omit for default session
  "dedup_key":  "2026-06-09|lunch with dana|..."  // optional; routes into the card's per-card session
}
```

`postAgentPush` requires a non-empty `content` **string** and a `skill`; non-2xx
throws. Note the wire field is `session_id`; the JS arg is `sessionId`.

The JS arg is `dedupKey`; the wire field is `dedup_key`. Pass the card's
`skill_data` `dedup_key` to land the push in that card's own Agent Chat session.
Session routing precedence is explicit `session_id` → derived `(skill, dedup_key)`
→ most-recent → fresh. (The read-side `session_id` on `GET /api/skill/data` is
**iOS-only** — generated skills do not read skill_data.)

---

## 3. The naive-local timezone invariant (and *why*)

> `start_at` / `end_at` written to `skill_data` **MUST** be naive-local wall-clock
> `'YYYY-MM-DDTHH:MM:SS'` with **no trailing `Z`** and **no `+HH:MM` / `-HH:MM`
> offset.**

**Why.** iOS parses these strings with `ServerDate.parse`, which interprets a
**zoneless** string in `TimeZone.current` — the device's local zone. So the string
must already *be* the local wall-clock the user should see. If a skill instead sends
a UTC instant with a `Z`, iOS re-reads that UTC clock-time as if it were local and
shifts it by the zone offset.

**The 9pm → 4am bug.** A 9:00 PM Pacific event is `2026-06-06T04:00:00Z` in UTC.
Send that `Z` string and iOS displays **4:00 AM the next day** (UTC clock-time read
as local). The fix is to send the wall-clock without a zone:
`2026-06-05T21:00:00`. iOS reads `21:00` as 9 PM local — correct.

**How to comply.** Convert the true instant to wall-clock before posting:

```js
const { toNaiveLocal, localAnchor } = require('./javis-contract');
toNaiveLocal('2026-06-06T04:00:00.000Z', 'America/Los_Angeles')
// -> '2026-06-05T21:00:00'   (no Z, no offset)
```

- `toNaiveLocal(iso, tz)` returns the wall-clock in `tz`, handles the ICU
  `24:00`-at-midnight rollover, and returns `null` on invalid/empty input.
- `localAnchor(iso, tz)` builds the relative-date anchor handed to the extracting
  LLM (`reference_time`, `reference_date`, `reference_weekday`,
  `reference_time_utc`, `tz`). It exists because a UTC instant's *date* can already
  be the next day in the evening west of UTC (9:11 PM PDT Jun 4 == `...T04:11Z` on
  Jun 5); anchoring "today" on the `Z` string makes the model resolve every event a
  day late.
- `assertNaiveLocal(s)` is the defense-in-depth guard: it **throws** on any trailing
  `Z` or `±HH:MM` offset, so a zoned instant fails fast at the boundary instead of
  silently shifting a day on the device. `null` / `''` / a zoneless string pass.
  `postSkillData` runs it on every `start_at`/`end_at`.

The `tz` itself comes from the user's prefs (e.g.
`data/users/<id>.prefs.json` → `"tz": "America/Los_Angeles"`). The prefs `tz` field
is mandatory for this to work — a skill that omits it cannot produce correct
wall-clock strings.

---

## 4. Markdown-only push vs. live-turn native cards

There are two rendering surfaces, and they are **not** interchangeable:

- **The push path (`/api/agent/push`)** — used by cron-fired skills — delivers
  `content` as **markdown only**. Headings, lists, bold, and links render; nothing
  more.
- **Native cards** (`EventList`, `EventCard`, `ActionButtons`, `SuccessCard`) render
  **only during a live SSE agent turn** — i.e. the interactive archetype, where the
  skill's output is streamed back into an in-progress conversation.

So a periodic-push skill **must not** emit card components in its push content; they
would be delivered as inert markdown at best. Rich, interactive results
(Confirm/Discard buttons, structured cards) come from writing rows via
`/api/skill/data` (iOS renders the card from the row) — **not** from the push
content. Use push for the human-readable digest; use `skill/data` for the
actionable structured rows.

---

## 5. Valid cron flags

Skills are scheduled with `openclaw cron add`. The **only** valid flags are:

| Flag | Meaning |
|------|---------|
| `--cron` / `--every` / `--at` | the schedule (exactly one required) |
| `--name` | cron job name |
| `--tz` | schedule timezone |
| `--channel` | delivery channel (e.g. `iOS`) |
| `--to` | recipient |
| `--session` | session mode (default `isolated`) |
| `--message` | the prompt/message the cron fires |

**`--schedule` and `--command` are NOT valid flags** and must never appear in any
generated skill, SKILL.md, or doc. `buildCronAdd(...)` is the **only** sanctioned
constructor for the argv: it **throws** if none of `--cron`/`--every`/`--at` is
given, **throws** if anyone tries to smuggle in a `--schedule`/`--command` flag or a
`schedule`/`command` option key, and never emits those flags. It returns a validated
argv **array** (not a shell string) so callers spawn it without quoting bugs.

---

## 6. Read path

`GET /api/transcripts/recent` — gateway-token authenticated — is how a skill pulls
the user's recent transcripts/sessions to extract from. `getRecentTranscripts({
since, limit, sessionId, kbdInput })` sends only the query params actually provided
(`since`, `limit`, `session_id`, `kbd_input`) and returns the parsed JSON envelope
(server shape: `{ tz, sessions: [...] }`).

---

## 7. Maintenance contract

**If javis-server changes any shape above** — an endpoint path, a field name, the
status enum, the timezone encoding, or the cron flags — there is exactly **one place
to update it**:

1. `references/javis-contract.js` — the canonical module.
2. `references/mock-server/mock-javis-server.js` — the contract mirror that the
   Phase-3 dry-run asserts against.

Update both **together** (the mock exists precisely to catch drift between this
module and server reality), and **bump `CONTRACT_VERSION`** in `javis-contract.js`.
Phase-3 validation compares each generated skill's vendored copy against the
canonical module by version + content, and the success report prints the version, so
a bump propagates the change to newly generated skills and flags stale ones.

Do **not** patch the contract per-skill in an entry script. Generated skills vendor
`javis-contract.js` **byte-identical**; the whole design depends on that single
source of truth.
