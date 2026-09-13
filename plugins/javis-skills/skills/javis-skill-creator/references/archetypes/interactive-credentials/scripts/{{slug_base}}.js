#!/usr/bin/env node
/**
 * {{slug}}.js — interactive-credentials entry script.
 *
 * Archetype: a USER-TRIGGERED skill that runs inside a LIVE SSE agent turn.
 * The agent has already (per SKILL.md) verified credentials via
 * skill_credentials_status({"provider": "{{provider}}"}) and, if needed, run the
 * skill_credentials_request_external_auth flow. By the time this script runs, the
 * "{{provider}}" cookies are present in the environment (injected by javis-server's
 * gateway manager). This script reads them from process.env and calls the
 * third-party "{{provider}}" API, printing a JSON result envelope on stdout that the
 * agent surfaces to the user IN THE SAME LIVE TURN (markdown and/or native cards).
 *
 * It uses ONLY Node built-ins (global fetch, process). Node 18+.
 *
 * The vendored contract module is imported below for OPTIONAL server reporting
 * (postSkillData / postAgentPush). There is NO cron, NO per-user state file, and
 * NO register.js in this archetype — output goes back to the live turn.
 */
'use strict';

// The canonical contract spine, vendored VERBATIM into this skill. Imported here
// only for optional postSkillData/postAgentPush; the provider call itself does not
// need it. Auth headers, timestamp formatting, and URLs for the server boundary
// live in this module — this entry script never builds them itself.
const contract = require('./javis-contract.js');

// ---- provider credentials (read from env; never hardcoded) ----------------
// The "{{provider}}" cookies are injected into this container's environment by
// javis-server's gateway manager after the user signs in through skill_credentials.
// Rename / extend these to match the cookie names your provider actually uses.
const CREDS = {
  // e.g. session token / cookie for {{provider}}
  session: process.env.{{PROVIDER_UPPER}}_SESSION || process.env.{{PROVIDER_UPPER}}_AUTH_SESSION_KEY || '',
  // e.g. the device / user id cookie for {{provider}}
  userId: process.env.{{PROVIDER_UPPER}}_USER_ID || process.env.{{PROVIDER_UPPER}}_DID || '',
};

// Base URL of the third-party "{{provider}}" API. Replace with the real one.
const {{PROVIDER_UPPER}}_API_BASE = process.env.{{PROVIDER_UPPER}}_API_BASE || 'https://api.{{provider}}.example/v1';

function haveCreds() {
  return Boolean(CREDS.session && String(CREDS.session).trim());
}

// Build the Cookie/Authorization headers the provider expects from the stored
// credentials. Adjust to your provider's auth scheme.
function providerHeaders() {
  const cookieParts = [];
  if (CREDS.session) cookieParts.push(`{{provider}}_session=${CREDS.session}`);
  if (CREDS.userId) cookieParts.push(`{{provider}}_user_id=${CREDS.userId}`);
  return {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    Cookie: cookieParts.join('; '),
  };
}

// ---- provider API calls ---------------------------------------------------
// Example read against the third-party API. Replace the path/params with the real
// {{provider}} endpoint. Returns a normalized result envelope.
async function {{verb}}(args) {
  if (!haveCreds()) {
    // Credentials missing — tell the agent to run the configure flow.
    return { status: 'auth', message: '{{provider}} not connected. Run `{{slug}} configure`.' };
  }
  const url = `${{{PROVIDER_UPPER}}_API_BASE}/{{verb}}`;
  let res;
  try {
    res = await fetch(url, { method: 'GET', headers: providerHeaders() });
  } catch (e) {
    return { status: 'unknown', message: `{{provider}} request failed: ${e.message}` };
  }
  if (res.status === 401 || res.status === 403) {
    // Stale cookies. The agent must NOT retry this turn; it should ask the user to
    // reconnect (see SKILL.md Step 3).
    return { status: 'auth', message: '{{provider}} session expired. Run `{{slug}} configure` to reconnect.' };
  }
  if (!res.ok) {
    return { status: 'unknown', message: `{{provider}} API HTTP ${res.status}` };
  }
  let data;
  try { data = await res.json(); } catch (_) { data = null; }
  const items = Array.isArray(data && data.items) ? data.items : (Array.isArray(data) ? data : []);
  return { status: 'ok', count: items.length, items };
}

// ---- optional server reporting (uses the vendored contract) ---------------
// Most interactive-credentials runs simply return the result to the live turn and
// do NOT write to the server. If a particular action should ALSO persist structured
// rows the iOS app renders, call the contract here. Every start_at/end_at MUST be
// naive-local wall-clock; postSkillData enforces it via assertNaiveLocal.
//
//   await contract.postSkillData({
//     skill: '{{slug}}',
//     type: '{{data_type}}',
//     items: results.items.map((it) => ({
//       dedup_key: it.id,
//       status: 'pending',
//       start_at: contract.toNaiveLocal(it.start_at, tz),  // tz from prefs / transcript
//       end_at: contract.toNaiveLocal(it.end_at, tz),
//       payload: it,
//     })),
//   });
//
// Or push a separate markdown digest:
//   await contract.postAgentPush({ skill: '{{slug}}', content: '**{{provider}}**: …' });

// ---- CLI ------------------------------------------------------------------
// Usage: node scripts/{{slug}}.js <command> [args...]
async function main() {
  const [command, ...rest] = process.argv.slice(2);
  let result;
  switch (command) {
    case '{{verb}}':
    case undefined:
      result = await {{verb}}(rest);
      break;
    default:
      result = { status: 'unknown', message: `Unknown command: ${command}` };
  }
  // The agent reads this JSON and renders the result inline to the live turn.
  process.stdout.write(JSON.stringify(result) + '\n');
}

main().catch((e) => {
  process.stdout.write(JSON.stringify({ status: 'unknown', message: e.message }) + '\n');
  process.exit(1);
});
