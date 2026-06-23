#!/usr/bin/env node
/**
 * mock-javis-server.js — a tiny stand-in for javis-server used by the Phase-3
 * Tier-2 dry-run. It boots on an ephemeral port (port 0), mirrors the real
 * endpoint shapes, asserts the contract invariants (bearer auth, naive-local
 * timestamps, dedup_key, status enum, markdown content, optional per-card dedup_key), and records a call log
 * a dry-run can introspect. For POST /api/skill/data it also records a per-item
 * { dedup_key, status } summary so a dry-run can assert an edit upsert (the
 * in-thread card-edit path) carried a specific dedup_key with status:"confirmed".
 *
 * It is INTENTIONALLY a contract MIRROR, not a real server: if javis-server's
 * shape changes, this file and references/javis-contract.js are the one place to
 * update them together.
 *
 * Two ways to use it:
 *   - CLI:        node mock-javis-server.js
 *                   -> prints "MOCK_LISTENING <url>" to stdout, runs until SIGINT.
 *   - requireable: const { start } = require('./mock-javis-server')
 *                   const srv = await start()  // { url, port, close, calls }
 *
 * Only Node built-ins (http). Node 18+.
 */
'use strict';

const http = require('http');

// Regex for the naive-local invariant: 'YYYY-MM-DDTHH:MM:SS' with NO trailing Z
// and NO +HH:MM/-HH:MM offset. Any zone designator is a contract violation.
const NAIVE_LOCAL = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/;
const HAS_ZONE = /[Zz]$|[+-]\d{2}:?\d{2}$/;

function hasBearer(req) {
  const auth = req.headers['authorization'] || '';
  return /^Bearer\s+\S+/.test(auth);
}

function readBody(req) {
  return new Promise((resolve) => {
    let buf = '';
    req.on('data', (c) => { buf += c; });
    req.on('end', () => {
      if (!buf) return resolve({});
      try { resolve(JSON.parse(buf)); } catch (_) { resolve({ __parse_error: true, __raw: buf }); }
    });
  });
}

function send(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(body);
}

// Start the mock. Resolves to { url, port, close, calls }. `opts.authenticated`
// (or env MOCK_AUTHENTICATED=1) flips the interactive-archetype credential stub.
function start(opts = {}) {
  const calls = []; // recorded call log; { method, path, status, ok, reason?, body? }
  const credAuthenticated =
    opts.authenticated === true || process.env.MOCK_AUTHENTICATED === '1';

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const pathname = url.pathname;
    const method = req.method;
    const record = (status, extra = {}) => {
      calls.push({ method, path: pathname, status, ok: status >= 200 && status < 300, ...extra });
    };

    // ---- call-log dump (no auth; debug/inspection only) ----
    if (method === 'GET' && pathname === '/__calls') {
      return send(res, 200, { calls });
    }

    // ---- POST /api/skill/data ----
    if (method === 'POST' && pathname === '/api/skill/data') {
      if (!hasBearer(req)) { record(401, { reason: 'missing bearer' }); return send(res, 401, { error: 'missing bearer' }); }
      const body = await readBody(req);
      if (body.__parse_error) { record(400, { reason: 'bad json' }); return send(res, 400, { error: 'bad json' }); }
      if (!body.skill) { record(422, { reason: 'skill missing' }); return send(res, 422, { error: 'skill missing' }); }
      const items = Array.isArray(body.items) ? body.items : null;
      if (!items) { record(422, { reason: 'items not array' }); return send(res, 422, { error: 'items must be an array' }); }
      for (let i = 0; i < items.length; i++) {
        const it = items[i] || {};
        for (const field of ['start_at', 'end_at']) {
          const v = it[field];
          if (v == null || v === '') continue; // absent bound is allowed
          if (HAS_ZONE.test(v) || !NAIVE_LOCAL.test(v)) {
            const reason = `items[${i}].${field} not naive-local: ${JSON.stringify(v)}`;
            record(422, { reason });
            return send(res, 422, { error: 'naive-local violation', reason });
          }
        }
        if (!it.dedup_key || !String(it.dedup_key).trim()) {
          const reason = `items[${i}].dedup_key empty`;
          record(422, { reason });
          return send(res, 422, { error: 'dedup_key required', reason });
        }
        if (it.status !== 'pending' && it.status !== 'confirmed') {
          const reason = `items[${i}].status invalid: ${JSON.stringify(it.status)}`;
          record(422, { reason });
          return send(res, 422, { error: 'status must be pending|confirmed', reason });
        }
      }
      record(200, {
        skill: body.skill,
        type: body.type,
        count: items.length,
        // Per-item summary so a dry-run can assert an edit upsert carried a specific
        // dedup_key with status:"confirmed" (the in-thread card-edit path).
        items: items.map((it) => ({ dedup_key: it.dedup_key, status: it.status })),
      });
      return send(res, 200, { upserted: items.length });
    }

    // ---- POST /api/agent/push ----
    if (method === 'POST' && pathname === '/api/agent/push') {
      if (!hasBearer(req)) { record(401, { reason: 'missing bearer' }); return send(res, 401, { error: 'missing bearer' }); }
      const body = await readBody(req);
      if (body.__parse_error) { record(400, { reason: 'bad json' }); return send(res, 400, { error: 'bad json' }); }
      if (!body.skill) { record(422, { reason: 'skill missing' }); return send(res, 422, { error: 'skill missing' }); }
      if (typeof body.content !== 'string' || !body.content.trim()) {
        record(422, { reason: 'content not non-empty string' });
        return send(res, 422, { error: 'content must be a non-empty string' });
      }
      record(200, { skill: body.skill, contentLen: body.content.length, dedup_key: body.dedup_key });
      return send(res, 200, { task_id: 1 });
    }

    // ---- GET /api/transcripts/recent ----
    if (method === 'GET' && pathname === '/api/transcripts/recent') {
      if (!hasBearer(req)) { record(401, { reason: 'missing bearer' }); return send(res, 401, { error: 'missing bearer' }); }
      record(200, { query: url.search });
      return send(res, 200, {
        tz: 'America/Los_Angeles',
        sessions: [
          {
            session_id: 'sess-canned-1',
            source: 'audio',
            started_at: '2026-06-08T16:00:00.000Z',
            transcript: 'Lunch with Dana tomorrow at noon, and a dentist appointment Friday 3pm.',
          },
        ],
      });
    }

    // ---- credential status stub (interactive archetype) ----
    // Supports GET and POST; query/env can flip authenticated.
    if (pathname === '/api/skill-credentials/status' && (method === 'GET' || method === 'POST')) {
      if (!hasBearer(req)) { record(401, { reason: 'missing bearer' }); return send(res, 401, { error: 'missing bearer' }); }
      const flip = url.searchParams.get('authenticated') === '1' || credAuthenticated;
      record(200, { authenticated: flip });
      return send(res, 200, { authenticated: flip });
    }

    record(404, { reason: 'no route' });
    return send(res, 404, { error: 'not found' });
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      const url = `http://127.0.0.1:${port}`;
      resolve({
        url,
        port,
        calls,
        close: () => new Promise((r) => server.close(r)),
      });
    });
  });
}

module.exports = { start };

// CLI mode: boot, print a parseable line, run until SIGINT.
if (require.main === module) {
  start().then((srv) => {
    process.stdout.write(`MOCK_LISTENING ${srv.url}\n`);
    const shutdown = () => srv.close().then(() => process.exit(0));
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  });
}
