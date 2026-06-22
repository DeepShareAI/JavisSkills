# feat(skill-creator): adapt periodic-push skills to javis-server per-card Agent Chat sessions

## Summary

javis-server now derives a dedicated Agent Chat session for each skill_data card. When a
push to `POST /api/agent/push` omits an explicit `session_id` but carries a `dedup_key`, the
server routes that push into the card's own session (routing precedence: explicit
`session_id` → derived from `(skill, dedup_key)` → most-recent session → fresh).

This PR teaches the `javis-skill-creator` skill — and every periodic-push skill it generates —
to use that mechanism. The vendored contract module (`postAgentPush`) gains an optional
`dedupKey` argument that maps to the `dedup_key` wire field. The periodic-push entry-script
template now sends **one push per card** carrying that card's `dedup_key`, so each Confirm/Discard
card opens in its own iOS Agent Chat thread instead of all cards collapsing into a single chat.
The aggregate-digest path (skills that do not write skill_data) is unchanged: it sends a single
push with no `dedup_key`.

The change is purely additive on the contract surface, so `CONTRACT_VERSION` moves `1.0.1 → 1.1.0`
and every doc that names the version moves with it.

## Server change this tracks

javis-server **PR #84** — `dedup_key` on `POST /api/agent/push`. The server accepts the optional
wire field `dedup_key`; when present and no explicit `session_id` is given, the push lands in the
card's derived per-card session. This skill-side change makes generated skills pass that field so
they light up the new server behavior.

## Changes

- **`references/javis-contract.js`** (and its byte-identical vendored twin
  `references/archetypes/interactive-credentials/scripts/javis-contract.js`)
  - `postAgentPush({ skill, content, sessionId, dedupKey })` — new optional `dedupKey` arg; sent on
    the wire as `dedup_key` only when non-blank. `session_id` is likewise sent only when set, so a
    no-arg/`dedupKey`-less call produces the exact same body as before (history-reuse).
  - `CONTRACT_VERSION` bumped `1.0.1 → 1.1.0`.
  - Header doc block documents the new `dedup_key` field and the server's session-routing precedence.

- **`references/archetypes/periodic-push/periodic-push-template.md`**
  - New `formatCardPush(it, tz)` helper builds a single card's markdown (markdown only).
  - `doPush` now branches on `writes_skill_data`: when true, it loops `items` and calls
    `postAgentPush({ skill, content: formatCardPush(it, tz), dedupKey: it.dedup_key })` once per card;
    when false, it sends one aggregate `postAgentPush({ skill, content: formatDigest(items, tz) })`.
  - Exports updated to include `formatCardPush` alongside `formatDigest`.
  - Behavior notes + CLI/usage comments updated to describe per-card pushes; version reference 1.0.1 → 1.1.0.

- **`references/mock-server/mock-javis-server.js`**
  - The `/api/agent/push` handler records `dedup_key` in the `/__calls` log so the dry-run can assert
    per-card routing. `dedup_key` stays **optional** — its absence does not fail the call (aggregate path).
  - Header comment lists `optional per-card dedup_key` among the asserted/recorded invariants.

- **`SKILL.md`**
  - Loop-conformance + gap-#5 notes describe the per-card `postAgentPush({…, dedupKey})` path.
  - Archetype description for `periodic-push` mentions one push per card carrying its `dedup_key`.
  - Tier 2 push assertion rewritten: for a `writes_skill_data` skill, **every** push must carry a
    non-empty `dedup_key` (fails otherwise); aggregate-only skills are allowed a single push with none.
  - Contract version reference 1.0.1 → 1.1.0.

- **`references/contract-reference.md`** and **`references/hijavis-loop-reference.md`**
  - Document the optional `dedup_key` body field, the `dedupKey` ↔ `dedup_key` arg/wire mapping, and the
    session-routing precedence. Both contract-version references 1.0.1 → 1.1.0.

## Backward compatibility

- **Additive only.** The new `dedupKey` is an optional argument; the new `dedup_key` is an optional
  wire field. Callers that pass neither produce a byte-identical request body to before.
- **No-arg / aggregate callers unchanged.** Skills that do not write skill_data still send a single
  aggregate digest with no `dedup_key` (history-reuse routing) — exactly as in 1.0.1.
- **`CONTRACT_VERSION` 1.1.0** marks the additive surface change; the drift check and success report
  print it.
- **Both contract copies kept byte-identical.** `references/javis-contract.js` and the vendored
  `references/archetypes/interactive-credentials/scripts/javis-contract.js` were edited identically;
  `cmp -s` reports them identical (T1.4 drift gate passes).

## Testing

All Tier 1, Tier 2, and end-to-end gates from the plan pass.

**Tier 1 (static / contract integrity)**
- Contract-copy drift check:
  ```
  cmp -s references/javis-contract.js \
         references/archetypes/interactive-credentials/scripts/javis-contract.js
  → copies identical
  ```
- T1.1 mock-server unit test (`__t1.js`): a push **with** `dedup_key` → 200 and the field is recorded;
  a push **without** `dedup_key` → still 200 (aggregate path):
  ```
  T1 PASS
  ```
- Generated-skill static checks (Task 5):
  ```
  T1.2 ok        (no unresolved {{...}} markers)
  T1.3 done      (node --check clean on every scripts/*.js)
  T1.4 ok v1.1.0 (vendored contract byte-identical; version 1.1.0)
  ```

**Tier 2 (contract dry-run against the mock server)**
- `__t2.js`: `postAgentPush` with `dedupKey` sends `dedup_key` on the wire; without `dedupKey` sends none;
  `node --check` is clean:
  ```
  T2 PASS
  ```
- Periodic-push push driver against the booted mock — every per-card push carries its `dedup_key`:
  ```
  T2 ok: skill_data + <N> per-card push(es), all auth'd, naive-local & routed by dedup_key
  ```
  (Aggregate-only skills instead report `T2 ok: aggregate push only (no skill_data rows)`.)

**End-to-end (Task 5 — generate a sample periodic-push skill, then run Tier 1 + Tier 2)**
- Generate a sample bundle, run the static gates above, boot the mock, run fetch + push:
  ```
  E2E ok: <N> per-card pushes, all carry dedup_key
  ```
  where `N` equals the number of fixture events.

## Out of scope

- The **read-side** `session_id` on `GET /api/skill/data` is **iOS-only** — generated skills never read
  skill_data, so nothing here touches the read path.
- No javis-server change is included here (the server work lands in PR #84) and no openclaw change is
  needed — this is entirely the skill-side adaptation.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
