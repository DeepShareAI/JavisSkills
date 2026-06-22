#!/usr/bin/env node
/**
 * javis-contract.js — THE canonical openclaw -> javis-server -> iOS contract spine.
 *
 * This file is VENDORED VERBATIM into every generated HiJavis skill (copied to
 * <slug>/scripts/javis-contract.js). Its bytes are the single source of truth for
 * the server boundary: auth, the two write paths, the read path, the naive-local
 * timezone invariant, and cron-arg construction. The entry script of a generated
 * skill MUST NOT build auth headers, format timestamps, construct server URLs, or
 * assemble cron args itself — it only calls into this module. That is what makes
 * the contract statically enforceable.
 *
 * Dependency-free: only Node built-ins (global fetch, Intl). Node 18+.
 *
 * --- The fixed contract (consumed, never changed here) --------------------
 *  Auth:   the skill runs inside a per-user openclaw container. It authenticates
 *          back to javis-server with Authorization: Bearer <OPENCLAW_GATEWAY_TOKEN>
 *          (platform-injected env var; get_gateway_user resolves it to the Clerk
 *          user). The token is NEVER hardcoded and NEVER passed as an arg.
 *  Base:   there is no JAVIS_SERVER_URL env in production; it defaults to
 *          http://javis-server:8000. The env override exists ONLY so the local
 *          mock-server dry-run can repoint the base URL — it is the testability hook.
 *  Write:  POST /api/skill/data  { skill, type, merge, window?, items[] }
 *            each item: { dedup_key, payload, status in {pending,confirmed},
 *                         start_at, end_at, source_ref? }
 *          POST /api/agent/push  { skill, content (MARKDOWN), session_id?, dedup_key? }
 *            session routing precedence (server): explicit session_id ->
 *            derived from (skill, dedup_key) -> most-recent session -> fresh.
 *            Pass dedup_key (the card's skill_data key) to land the push in that
 *            card's own Agent Chat session.
 *  Read:   GET  /api/transcripts/recent  (gateway-token auth)
 *  TZ invariant: start_at/end_at written to skill_data MUST be NAIVE LOCAL
 *          wall-clock 'YYYY-MM-DDTHH:MM:SS' with NO trailing Z and NO +HH:MM
 *          offset. iOS (ServerDate) parses them in the device timezone; a zoned
 *          instant would shift by the offset (the 9pm -> 4am-next-day bug).
 *  Push is markdown-only: native cards (EventList/EventCard/ActionButtons/
 *          SuccessCard) render ONLY on live SSE agent turns (interactive archetype).
 *          The cron/push path delivers `content` as markdown.
 *  Cron:   openclaw cron add --cron/--every/--at, plus --tz --channel --to
 *          --session --message. '--schedule' and '--command' are NOT valid flags.
 */
'use strict';

// Single source of truth for the server base URL. The `|| default` is required:
// production has no JAVIS_SERVER_URL, but the mock-server dry-run sets it to
// repoint every call at http://127.0.0.1:<port>. Do not remove the env read.
const JAVIS_BASE = process.env.JAVIS_SERVER_URL || 'http://javis-server:8000';

// Stamped into every vendored copy. Phase-3 validation compares this against the
// canonical module to catch drift, and the success report prints it. Bump on any
// change to the contract surface below.
const CONTRACT_VERSION = '1.1.0';

// ---- auth ----------------------------------------------------------------
// Build the Bearer headers for every server call. The token is platform-injected
// into the container; we fail loud (rather than send an empty Bearer) if it is
// missing, since every endpoint here is gateway-token authenticated.
function authHeaders() {
  const token = process.env.OPENCLAW_GATEWAY_TOKEN;
  if (!token || !String(token).trim()) {
    throw new Error(
      'OPENCLAW_GATEWAY_TOKEN is required (platform-injected inside the openclaw container). ' +
      'It is never hardcoded or passed as an argument.'
    );
  }
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

// ---- naive-local wall-clock for skill_data -------------------------------
// iOS reads calendar start_at/end_at as NAIVE LOCAL wall-clock in the device
// timezone — a zoneless string is interpreted in TimeZone.current. So we store
// the wall-clock of the instant in `tz` WITHOUT a zone designator (no Z); a UTC
// `Z` instant would be re-read as device-local and shift by the tz offset.
//   2026-06-06T04:00:00.000Z @ America/Los_Angeles -> "2026-06-05T21:00:00".
function toNaiveLocal(iso, tz) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(d).reduce((o, x) => ((o[x.type] = x.value), o), {});
  let { year, month, day, hour } = p;
  // Node/V8 emits "00" at local midnight, but some ICU builds emit "24:00",
  // meaning the END of this calendar day (= start of the next). Normalize to
  // "00" AND roll the date forward a day, else the result is off by a full day.
  if (hour === '24') {
    hour = '00';
    const next = new Date(Date.UTC(+year, +month - 1, +day) + 86400000);
    year = String(next.getUTCFullYear()).padStart(4, '0');
    month = String(next.getUTCMonth() + 1).padStart(2, '0');
    day = String(next.getUTCDate()).padStart(2, '0');
  }
  return `${year}-${month}-${day}T${hour}:${p.minute}:${p.second}`;
}

// Build the relative-date anchor handed to the LLM. The instant `iso` is the real
// "now"; what the LLM needs is the LOCAL wall-clock in `tz`, because a UTC `Z`
// instant's date can already be the NEXT day in the evening west of UTC
// (9:11 PM PDT on Jun 4 == 2026-06-05T04:11Z). Anchoring "today" on that Z string
// makes the model resolve every event one day late. So we hand it the zoneless
// local wall-clock plus the explicit local date and weekday, keeping the raw
// instant under reference_time_utc for transparency.
function localAnchor(iso, tz) {
  const local = toNaiveLocal(iso, tz); // "2026-06-04T21:11:00" — no zone
  const d = new Date(iso);
  const valid = !isNaN(d.getTime());
  const weekday = valid
    ? new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'long' }).format(d)
    : null;
  return {
    reference_time: local,                              // local wall-clock; the LLM's "now"
    reference_date: local ? local.slice(0, 10) : null,  // "today" == this date in tz
    reference_weekday: weekday,                          // anchors "Saturday"/"next Thursday"
    reference_time_utc: valid ? d.toISOString() : iso,   // the true instant, for reference
    tz,
  };
}

// Defense-in-depth guard. A correctly-built naive-local string has no zone
// designator. This THROWS on any trailing `Z` or `+HH:MM`/`-HH:MM` offset, so a
// zoned instant fails fast at the boundary instead of silently shifting a day on
// iOS. Only validates non-empty strings — null/undefined/'' (a legitimately
// absent end_at) pass through untouched.
function assertNaiveLocal(s) {
  if (s == null || s === '') return;
  if (typeof s !== 'string') {
    throw new Error(`skill_data datetime must be a string, got ${typeof s}`);
  }
  if (/[Zz]$|[+-]\d{2}:?\d{2}$/.test(s)) {
    throw new Error(
      `skill_data start_at/end_at must be NAIVE LOCAL wall-clock ` +
      `'YYYY-MM-DDTHH:MM:SS' (no Z, no offset); got "${s}". ` +
      `Use toNaiveLocal(iso, tz) before posting. A zoned instant shifts the day on iOS.`
    );
  }
}

// ---- write paths ---------------------------------------------------------
// POST /api/agent/push — deliver a MARKDOWN digest to the user's iOS chat.
// `content` is markdown (the cron/push path renders no native cards). Throws on
// any non-2xx so a generated skill never silently swallows a failed delivery.
async function postAgentPush({ skill, content, sessionId, dedupKey } = {}) {
  if (!skill || !String(skill).trim()) {
    throw new Error('postAgentPush: `skill` is required.');
  }
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('postAgentPush: `content` must be a non-empty markdown string.');
  }
  // session routing: an explicit sessionId wins; otherwise a dedup_key lets the
  // server derive the card's own per-card session. Send each field only when set,
  // so the no-arg call behaves exactly as before (history-reuse).
  const body = { skill, content };
  if (sessionId !== undefined && sessionId !== null && String(sessionId).trim()) {
    body.session_id = sessionId;
  }
  if (dedupKey !== undefined && dedupKey !== null && String(dedupKey).trim()) {
    body.dedup_key = dedupKey;
  }
  const res = await fetch(`${JAVIS_BASE}/api/agent/push`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await safeText(res);
    throw new Error(`POST /api/agent/push -> HTTP ${res.status}${detail ? ` ${detail}` : ''}`);
  }
  return safeJson(res);
}

// POST /api/skill/data — upsert structured rows the iOS app renders (e.g. the
// calendar table with Confirm/Discard on pending rows). EVERY item's start_at and
// end_at (when present) are run through assertNaiveLocal, and status is validated,
// BEFORE the request leaves the process — runtime enforcement of the tz invariant
// and the status enum. Throws on non-2xx.
async function postSkillData({ skill, type, merge = 'upsert', window, items } = {}) {
  if (!skill || !String(skill).trim()) {
    throw new Error('postSkillData: `skill` is required.');
  }
  if (!type || !String(type).trim()) {
    throw new Error('postSkillData: `type` is required.');
  }
  if (!Array.isArray(items)) {
    throw new Error('postSkillData: `items` must be an array.');
  }
  for (let i = 0; i < items.length; i++) {
    const it = items[i] || {};
    if (!it.dedup_key || !String(it.dedup_key).trim()) {
      throw new Error(`postSkillData: items[${i}].dedup_key is required (non-empty).`);
    }
    if (it.status !== 'pending' && it.status !== 'confirmed') {
      throw new Error(
        `postSkillData: items[${i}].status must be 'pending' or 'confirmed', got ${JSON.stringify(it.status)}.`
      );
    }
    // Enforce the naive-local invariant on both bounds when present.
    try { assertNaiveLocal(it.start_at); } catch (e) { throw new Error(`items[${i}].start_at: ${e.message}`); }
    try { assertNaiveLocal(it.end_at); } catch (e) { throw new Error(`items[${i}].end_at: ${e.message}`); }
  }
  const body = { skill, type, merge, items };
  if (window !== undefined) body.window = window;
  const res = await fetch(`${JAVIS_BASE}/api/skill/data`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await safeText(res);
    throw new Error(`POST /api/skill/data -> HTTP ${res.status}${detail ? ` ${detail}` : ''}`);
  }
  return safeJson(res);
}

// ---- read path -----------------------------------------------------------
// GET /api/transcripts/recent — gateway-token authenticated. Returns the parsed
// JSON envelope (server shape: { sessions: [...] } or similar). All args are
// optional query params; only those provided are sent.
async function getRecentTranscripts({ since, limit, sessionId, kbdInput } = {}) {
  const qs = new URLSearchParams();
  if (since !== undefined && since !== null && String(since).trim()) qs.set('since', String(since));
  if (limit !== undefined && limit !== null && String(limit).trim()) qs.set('limit', String(limit));
  if (sessionId !== undefined && sessionId !== null && String(sessionId).trim()) qs.set('session_id', String(sessionId));
  if (kbdInput !== undefined && kbdInput !== null && String(kbdInput).trim()) qs.set('kbd_input', String(kbdInput));
  const query = qs.toString();
  const url = `${JAVIS_BASE}/api/transcripts/recent${query ? `?${query}` : ''}`;
  const res = await fetch(url, { headers: authHeaders() });
  if (!res.ok) {
    const detail = await safeText(res);
    throw new Error(`GET /api/transcripts/recent -> HTTP ${res.status}${detail ? ` ${detail}` : ''}`);
  }
  return safeJson(res);
}

// ---- cron ----------------------------------------------------------------
// THE only constructor for `openclaw cron add` argv. Returns a validated argv
// ARRAY (not a shell string), so the caller can spawn it without quoting bugs.
// Structurally prevents the '--schedule'/'--command' class of bug:
//   - THROWS if none of cron/every/at is provided (a schedule is mandatory).
//   - THROWS if any caller passes a schedule/command-style key.
// It NEVER emits --schedule or --command.
function buildCronAdd({ name, cron, every, at, tz, channel, to, session = 'isolated', message } = {}) {
  // Reject the invalid-flag class up front, regardless of how it was smuggled in.
  // (Guards both the legacy `schedule:`/`command:` option names and anyone trying
  //  to pass the literal flag strings.)
  for (const bad of [name, channel, to, session, message, cron, every, at]) {
    if (typeof bad === 'string' && /(^|\s)--(schedule|command)\b/.test(bad)) {
      throw new Error("buildCronAdd: '--schedule'/'--command' are not valid openclaw cron flags.");
    }
  }
  // eslint-disable-next-line no-prototype-builtins
  for (const key of ['schedule', 'command']) {
    // Catch a caller passing { schedule, command } via arguments object misuse.
    if (Object.prototype.hasOwnProperty.call(arguments[0] || {}, key)) {
      throw new Error(`buildCronAdd: '${key}' is not a valid option; use --cron/--every/--at and --message.`);
    }
  }
  if (!name || !String(name).trim()) {
    throw new Error('buildCronAdd: `name` is required.');
  }
  const schedules = [cron, every, at].filter((v) => v !== undefined && v !== null && String(v).trim() !== '');
  if (schedules.length === 0) {
    throw new Error('buildCronAdd: one of --cron / --every / --at is required.');
  }

  const argv = ['cron', 'add', '--name', String(name)];
  if (cron) argv.push('--cron', String(cron));
  if (every) argv.push('--every', String(every));
  if (at) argv.push('--at', String(at));
  if (tz) argv.push('--tz', String(tz));
  if (channel) argv.push('--channel', String(channel));
  if (to) argv.push('--to', String(to));
  if (session) argv.push('--session', String(session));
  if (message) argv.push('--message', String(message));
  return argv;
}

// ---- internal helpers ----------------------------------------------------
async function safeText(res) {
  try { return (await res.text()).slice(0, 500); } catch (_) { return ''; }
}
async function safeJson(res) {
  try { return await res.json(); } catch (_) { return null; }
}

module.exports = {
  JAVIS_BASE,
  CONTRACT_VERSION,
  authHeaders,
  postAgentPush,
  postSkillData,
  toNaiveLocal,
  localAnchor,
  assertNaiveLocal,
  getRecentTranscripts,
  buildCronAdd,
};
