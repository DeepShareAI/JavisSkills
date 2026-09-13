#!/usr/bin/env node
/**
 * check-manifests.mjs — JavisSkills dual-ecosystem manifest validator.
 *
 * Implements the eight checks of section 6 of
 * docs/superpowers/specs/2026-09-12-codex-dual-ecosystem-design.md, plus a ninth
 * check that the Codex marketplace manifest survives the sparse checkout README.md
 * documents for the Codex install.
 *
 * Zero dependencies (node: builtins only). Run from anywhere:
 *
 *     node scripts/check-manifests.mjs
 *
 * Exits 0 when every check passes, 1 after printing every failure found.
 *
 * Soundness rule: every check validates the tree the hosts actually install.
 * Plugin directories come from the marketplace manifests, never from a hardcoded
 * literal, so a marketplace repointed at a new directory drags every check
 * onto that directory instead of leaving a stale one to pass in its place.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

// Repo root is derived from this file's own location, never from process.cwd(),
// so the validator behaves identically no matter where it is invoked from.
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(SCRIPT_DIR, '..');

const PLUGIN_NAME = 'javis-skills';
// Fallback only — used when no marketplace resolves to a local directory.
const DEFAULT_PLUGIN_DIR = join(ROOT, 'plugins', PLUGIN_NAME);

const CLAUDE_PLUGIN_REL = join('.claude-plugin', 'plugin.json');
const CODEX_PLUGIN_REL = join('.codex-plugin', 'plugin.json');

const MARKETPLACES = {
  claudeMarketplace: join(ROOT, '.claude-plugin', 'marketplace.json'),
  codexMarketplace: join(ROOT, '.agents', 'plugins', 'marketplace.json'),
};

const README_PATH = join(ROOT, 'README.md');
// Repo-relative, forward-slash spelling — this is what a sparse checkout matches against.
const CODEX_MARKETPLACE_SPARSE_TARGET = '.agents/plugins/marketplace.json';

const MAX_DEFAULT_PROMPTS = 3;
const MAX_DEFAULT_PROMPT_LENGTH = 128;

/**
 * Marketplace `source` object forms that name something off-disk. Anything else —
 * `local`, `relative`, or no type at all — is a local source and MUST carry a
 * usable `path`; misfiling it as remote would silently skip the resolution check.
 */
const REMOTE_SOURCE_TYPES = new Set([
  'github',
  'git',
  'git-subdir',
  'url',
  'npm',
  'archive',
  'command',
]);

/** Object `source` types Codex accepts for an on-disk plugin. */
const LOCAL_SOURCE_TYPES = new Set(['local', 'relative']);

// ---------------------------------------------------------------------------
// small helpers
// ---------------------------------------------------------------------------

const rel = (p) => {
  const r = relative(ROOT, p);
  return !r || r.startsWith('..') || isAbsolute(r) ? p : r;
};

/** Repo-relative path in forward-slash spelling, for sparse-checkout matching. */
const posixRel = (p) => rel(p).split('\\').join('/');

const isPlainObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);

function statKind(p) {
  try {
    const s = statSync(p);
    if (s.isDirectory()) return 'dir';
    if (s.isFile()) return 'file';
    return 'other';
  } catch {
    return 'missing';
  }
}

function readJson(path) {
  let text;
  try {
    text = readFileSync(path, 'utf8');
  } catch (err) {
    return { ok: false, error: err.code === 'ENOENT' ? 'file does not exist' : err.message };
  }
  try {
    return { ok: true, data: JSON.parse(text) };
  } catch (err) {
    return { ok: false, error: `invalid JSON — ${err.message}` };
  }
}

/**
 * Minimal YAML-frontmatter parser: enough for the flat `key: value` blocks the
 * SKILL.md files actually use, plus quoted scalars and indented continuations.
 * Deliberately not a YAML implementation — anything richer is a parse failure,
 * which is the honest answer for a frontmatter block these hosts must read.
 */
function parseFrontmatter(text) {
  const normalized = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const lines = normalized.split('\n');
  if (lines[0].trim() !== '---') {
    return { ok: false, error: 'no YAML frontmatter block (file does not start with ---)' };
  }

  let end = -1;
  for (let i = 1; i < lines.length; i += 1) {
    const t = lines[i].trim();
    if (t === '---' || t === '...') {
      end = i;
      break;
    }
  }
  if (end === -1) return { ok: false, error: 'frontmatter block is never closed by ---' };

  const data = {};
  let lastKey = null;

  for (let i = 1; i < end; i += 1) {
    const raw = lines[i];
    const trimmed = raw.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;

    // Indented line with no key: a folded continuation of the previous value.
    const match = /^([A-Za-z0-9_.-]+)\s*:\s?(.*)$/.exec(raw);
    if (!match || /^\s/.test(raw)) {
      if (/^\s/.test(raw) && lastKey !== null && typeof data[lastKey] === 'string') {
        data[lastKey] = `${data[lastKey]} ${trimmed}`.trim();
        continue;
      }
      return {
        ok: false,
        error: `line ${i + 1} is not a simple "key: value" pair: ${JSON.stringify(trimmed.slice(0, 60))}`,
      };
    }

    const key = match[1];
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    ) {
      value = value.slice(1, -1);
    }
    data[key] = value;
    lastKey = key;
  }

  return { ok: true, data };
}

/** Manifest path values are relative and begin with "./" (design §2). */
function hasRelativePrefix(v) {
  return typeof v === 'string' && (v.startsWith('./') || v.startsWith('../'));
}

/** A value that names something off-disk: an absolute URL or a non-path URI scheme. */
function isUriValue(v) {
  return typeof v === 'string' && (v.includes('://') || /^(?:data|mailto|tel|urn):/i.test(v));
}

/**
 * Keys inside `interface` whose value is a file shipped with the plugin. Matched by
 * suffix so an unseen sibling (`darkLogo`, `heroImage`, `cardBanner`) is covered too.
 */
function isAssetKey(key) {
  return /(icon|logo|image|asset|screenshot|banner|thumbnail|artwork|graphic|cover|wordmark|avatar|badge|illustration)s?$/i.test(
    key,
  );
}

/**
 * A string shaped like a file reference: "./a/b.svg", "../x.png", or "assets/logo.svg".
 * Prose ("Javis Skills", "Developer Tools") and colors ("#0F766E") do not match.
 */
function looksLikePath(v) {
  if (typeof v !== 'string' || v.trim() === '') return false;
  if (/^\.{1,2}\//.test(v)) return true;
  return /^[^\s:]+\/[^\s:]*\.[A-Za-z0-9]{1,8}$/.test(v);
}

function resolveFrom(baseDir, value) {
  return resolve(baseDir, value.replace(/\/+$/, '') || '.');
}

/**
 * Marketplace `source` is a bare string in Claude and an object in Codex. Normalize.
 *
 * A source is 'remote' ONLY when its declared type is genuinely off-disk. A local
 * or untyped object whose `path` is missing or misspelled is 'unknown', never
 * 'remote' — callers skip remote sources, so misfiling one turns the resolution
 * check into a silent pass on a broken manifest.
 */
function readSourcePath(source) {
  if (typeof source === 'string') return { kind: 'path', path: source, form: 'string' };
  if (isPlainObject(source)) {
    const type = source.source ?? source.type;
    if (typeof type === 'string' && REMOTE_SOURCE_TYPES.has(type)) {
      return { kind: 'remote', type, form: 'object' };
    }
    if (typeof source.path === 'string') return { kind: 'path', path: source.path, type, form: 'object' };
    return { kind: 'unknown', type, form: 'object' };
  }
  return { kind: 'unknown', form: source === undefined ? 'undefined' : typeof source };
}

function pluginEntries(doc) {
  return Array.isArray(doc?.plugins) ? doc.plugins : [];
}

// ---------------------------------------------------------------------------
// check harness
// ---------------------------------------------------------------------------

const results = [];

function check(title, fn) {
  const failures = [];
  const fail = (file, reason) => failures.push({ file, reason });
  try {
    fn(fail);
  } catch (err) {
    failures.push({ file: 'scripts/check-manifests.mjs', reason: `check threw — ${err.message}` });
  }
  results.push({ title, failures });
}

// ---------------------------------------------------------------------------
// pre-pass — resolve the plugin directories the marketplaces actually point at.
//
// This runs before check 1 so that every later check reads the shipped tree.
// Its findings are reported, unchanged and in order, as check 3.
// ---------------------------------------------------------------------------

/** Plugin directories discovered from the marketplaces (insertion-ordered). */
const discoveredPluginDirs = new Set();

/** Failures found while resolving the marketplaces; reported by check 3. */
const marketplaceIssues = [];

function resolveMarketplaces() {
  const issue = (file, reason) => marketplaceIssues.push({ file, reason });

  const hosts = [
    {
      key: 'claudeMarketplace',
      host: 'Claude',
      manifestRel: CLAUDE_PLUGIN_REL,
      /**
       * Claude Code's marketplace `source` is a discriminated union. Its only
       * path-bearing arm is a bare STRING constrained to start with "./" — there is
       * no {source:"local", path} arm. An unparseable source becomes
       * {source:"unsupported"} and every install of the plugin then fails, so a
       * Codex-shaped object here must be a hard failure, not a pass.
       */
      acceptsLocalObject: false,
    },
    {
      key: 'codexMarketplace',
      host: 'Codex',
      manifestRel: CODEX_PLUGIN_REL,
      acceptsLocalObject: true,
    },
  ];

  for (const { key, host, manifestRel, acceptsLocalObject } of hosts) {
    const path = MARKETPLACES[key];
    const r = readJson(path);
    if (!r.ok || !isPlainObject(r.data)) {
      issue(rel(path), 'cannot be checked — it did not parse (see check 1)');
      continue;
    }

    const entries = pluginEntries(r.data);
    if (entries.length === 0) {
      issue(rel(path), 'declares no plugins[] entries to resolve');
      continue;
    }

    entries.forEach((entry, i) => {
      const at = `plugins[${i}]`;
      const entryName = typeof entry?.name === 'string' ? entry.name : null;
      const src = readSourcePath(entry?.source);

      if (src.kind === 'remote') {
        // A genuinely remote source (github/git/url/npm/...) has nothing on disk.
        return;
      }

      if (!acceptsLocalObject && src.form === 'object') {
        issue(
          rel(path),
          `${at}.source is an object — ${host} accepts only a string path starting with "./" or a remote source form (${[...REMOTE_SOURCE_TYPES].join('/')}); an object source parses as "unsupported" and every install fails`,
        );
        return;
      }

      if (src.kind !== 'path') {
        issue(
          rel(path),
          `${at}.source is missing or not a usable path (${
            acceptsLocalObject
              ? 'a string, or an object with "source":"local" and a string "path"'
              : 'a string starting with "./"'
          })${src.type !== undefined ? ` — saw type ${JSON.stringify(src.type)} with no string "path"` : ''}`,
        );
        return;
      }

      if (src.form === 'object' && src.type !== undefined && !LOCAL_SOURCE_TYPES.has(src.type)) {
        issue(rel(path), `${at}.source.source is ${JSON.stringify(src.type)} — expected "local"`);
      }

      if (!hasRelativePrefix(src.path)) {
        issue(
          rel(path),
          `${at}.source path ${JSON.stringify(src.path)} does not begin with "./" — ${host} requires a repo-relative path spelled "./…"`,
        );
      }

      const dir = resolveFrom(ROOT, src.path);
      const kind = statKind(dir);
      if (kind !== 'dir') {
        issue(rel(path), `${at}.source path ${JSON.stringify(src.path)} → ${rel(dir)} is not a directory (${kind})`);
        return;
      }
      discoveredPluginDirs.add(dir);

      const manifestPath = join(dir, manifestRel);
      const m = readJson(manifestPath);
      if (!m.ok) {
        issue(rel(path), `${at}.source → ${rel(manifestPath)} (${host} plugin manifest) ${m.error}`);
        return;
      }
      if (entryName && m.data?.name !== entryName) {
        issue(
          rel(path),
          `${at}.name is ${JSON.stringify(entryName)} but ${rel(manifestPath)} declares ${JSON.stringify(m.data?.name)}`,
        );
      }
    });
  }
}

resolveMarketplaces();

/** The plugin directories every later check validates. */
const PLUGIN_DIRS =
  discoveredPluginDirs.size > 0 ? [...discoveredPluginDirs] : [DEFAULT_PLUGIN_DIR];

// ---------------------------------------------------------------------------
// manifest inventory — two marketplaces plus both plugin manifests per directory.
// ---------------------------------------------------------------------------

const claudePluginKey = (dir) => `claudePlugin@${rel(dir)}`;
const codexPluginKey = (dir) => `codexPlugin@${rel(dir)}`;

/** key → absolute path for every manifest this run validates. */
const manifestPaths = new Map([
  ['claudeMarketplace', MARKETPLACES.claudeMarketplace],
  ['codexMarketplace', MARKETPLACES.codexMarketplace],
]);

for (const dir of PLUGIN_DIRS) {
  manifestPaths.set(claudePluginKey(dir), join(dir, CLAUDE_PLUGIN_REL));
  manifestPaths.set(codexPluginKey(dir), join(dir, CODEX_PLUGIN_REL));
}

const pluginManifestKeys = PLUGIN_DIRS.flatMap((dir) => [claudePluginKey(dir), codexPluginKey(dir)]);
const allManifestKeys = ['claudeMarketplace', 'codexMarketplace', ...pluginManifestKeys];

// ---------------------------------------------------------------------------
// Check 1 — every marketplace and plugin manifest parses as JSON.
// ---------------------------------------------------------------------------

const docs = {};

check('1. every marketplace and plugin manifest parses as JSON', (fail) => {
  for (const key of allManifestKeys) {
    const path = manifestPaths.get(key);
    const r = readJson(path);
    if (!r.ok) {
      fail(rel(path), r.error);
      continue;
    }
    if (!isPlainObject(r.data)) {
      fail(rel(path), 'top-level value is not a JSON object');
      continue;
    }
    docs[key] = r.data;
  }
});

const have = (key) => Object.prototype.hasOwnProperty.call(docs, key);
const unavailable = (fail, ...keys) => {
  let missing = false;
  for (const key of keys) {
    if (!have(key)) {
      fail(rel(manifestPaths.get(key) ?? key), 'cannot be checked — it did not parse (see check 1)');
      missing = true;
    }
  }
  return missing;
};

// ---------------------------------------------------------------------------
// Check 2 — name and version agree across every manifest.
// ---------------------------------------------------------------------------

check('2. name and version agree across every manifest', (fail) => {
  if (unavailable(fail, ...allManifestKeys)) return;

  const names = [];
  const versions = [];

  const note = (bucket, path, where, value) => bucket.push({ file: rel(path), where, value });
  const isNonEmptyString = (v) => typeof v === 'string' && v.trim() !== '';

  for (const key of allManifestKeys) {
    const doc = docs[key];
    const path = manifestPaths.get(key);
    if (isNonEmptyString(doc.name)) note(names, path, 'name', doc.name);
    else fail(rel(path), 'missing a top-level string "name"');

    // A declared version must be a real version. An empty string is not one.
    if (doc.version !== undefined && !isNonEmptyString(doc.version)) {
      fail(rel(path), `"version" is ${JSON.stringify(doc.version)} — expected a non-empty string`);
    } else if (isNonEmptyString(doc.version)) {
      note(versions, path, 'version', doc.version);
    }
  }

  // Plugin manifests must declare their own version; marketplace entries may.
  for (const key of pluginManifestKeys) {
    const doc = docs[key];
    if (doc && !isNonEmptyString(doc.version)) {
      fail(rel(manifestPaths.get(key)), 'missing a top-level non-empty string "version"');
    }
  }

  for (const key of ['claudeMarketplace', 'codexMarketplace']) {
    const path = manifestPaths.get(key);
    const entries = pluginEntries(docs[key]);
    if (entries.length === 0) {
      fail(rel(path), 'declares no plugins[] entries');
      continue;
    }
    entries.forEach((entry, i) => {
      const at = `plugins[${i}]`;
      if (isNonEmptyString(entry?.name)) note(names, path, `${at}.name`, entry.name);
      else fail(rel(path), `${at} is missing a string "name"`);

      if (entry?.version !== undefined && !isNonEmptyString(entry.version)) {
        fail(rel(path), `${at}.version is ${JSON.stringify(entry.version)} — expected a non-empty string`);
      } else if (isNonEmptyString(entry?.version)) {
        note(versions, path, `${at}.version`, entry.version);
      }
    });
  }

  const disagree = (bucket, label) => {
    const distinct = [...new Set(bucket.map((o) => o.value))];
    if (distinct.length > 1) {
      const detail = bucket.map((o) => `${o.file}:${o.where} = ${JSON.stringify(o.value)}`).join('; ');
      fail('(across manifests)', `${label} disagree — ${detail}`);
    }
  };

  disagree(names, 'plugin names');
  disagree(versions, 'plugin versions');

  if (versions.length === 0) fail('(across manifests)', 'no manifest declares a version');
});

// ---------------------------------------------------------------------------
// Check 3 — marketplace source/path resolves to a dir holding the matching manifest.
//           (resolved in the pre-pass above, so checks 1/2/6/7/8 can use the result)
// ---------------------------------------------------------------------------

check('3. each marketplace source/path resolves to a plugin directory', (fail) => {
  for (const { file, reason } of marketplaceIssues) fail(file, reason);
});

// ---------------------------------------------------------------------------
// Check 4 — every skills/*/ has a SKILL.md with name + description frontmatter.
// ---------------------------------------------------------------------------

check('4. every skills/*/ has a SKILL.md with name + description frontmatter', (fail) => {
  for (const dir of PLUGIN_DIRS) {
    const skillsDir = join(dir, 'skills');
    if (statKind(skillsDir) !== 'dir') {
      fail(rel(skillsDir), 'skills directory does not exist');
      continue;
    }

    let subdirs;
    try {
      subdirs = readdirSync(skillsDir, { withFileTypes: true })
        .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
        .map((e) => e.name)
        .sort();
    } catch (err) {
      fail(rel(skillsDir), `cannot be read — ${err.message}`);
      continue;
    }

    if (subdirs.length === 0) fail(rel(skillsDir), 'holds no skill directories');

    for (const name of subdirs) {
      const skillMd = join(skillsDir, name, 'SKILL.md');
      let text;
      try {
        text = readFileSync(skillMd, 'utf8');
      } catch (err) {
        fail(rel(skillMd), err.code === 'ENOENT' ? 'file does not exist' : err.message);
        continue;
      }

      const fm = parseFrontmatter(text);
      if (!fm.ok) {
        fail(rel(skillMd), `frontmatter does not parse — ${fm.error}`);
        continue;
      }
      for (const field of ['name', 'description']) {
        const value = fm.data[field];
        if (typeof value !== 'string' || value.trim() === '') {
          fail(rel(skillMd), `frontmatter is missing a non-empty "${field}"`);
        }
      }
      if (typeof fm.data.name === 'string' && fm.data.name.trim() !== '' && fm.data.name.trim() !== name) {
        fail(rel(skillMd), `frontmatter name ${JSON.stringify(fm.data.name.trim())} does not match directory ${JSON.stringify(name)}`);
      }
    }
  }
});

// ---------------------------------------------------------------------------
// Check 5 — Codex marketplace entries carry policy + category.
// ---------------------------------------------------------------------------

check('5. Codex marketplace entries carry policy.installation, policy.authentication, category', (fail) => {
  if (unavailable(fail, 'codexMarketplace')) return;

  const path = manifestPaths.get('codexMarketplace');
  const doc = docs.codexMarketplace;
  const entries = pluginEntries(doc);
  if (entries.length === 0) {
    fail(rel(path), 'declares no plugins[] entries');
    return;
  }

  entries.forEach((entry, i) => {
    const at = `plugins[${i}]`;
    if (!isPlainObject(entry)) {
      fail(rel(path), `${at} is not an object`);
      return;
    }

    const policy = entry.policy;
    if (!isPlainObject(policy)) {
      fail(rel(path), `${at}.policy is missing`);
    } else {
      for (const field of ['installation', 'authentication']) {
        if (typeof policy[field] !== 'string' || policy[field] === '') {
          fail(rel(path), `${at}.policy.${field} is missing`);
        }
      }
    }

    if (typeof entry.category !== 'string' || entry.category === '') {
      fail(rel(path), `${at}.category is missing`);
    }

    if (entry.displayName !== undefined || isPlainObject(entry.interface)) {
      fail(rel(path), `${at} carries displayName/interface — displayName belongs to the marketplace-level "interface"`);
    }
  });

  if (!isPlainObject(doc.interface) || typeof doc.interface.displayName !== 'string' || doc.interface.displayName === '') {
    fail(rel(path), 'marketplace-level "interface" is missing a string "displayName"');
  }
});

// ---------------------------------------------------------------------------
// Check 6 — interface metadata and defaultPrompt limits, per plugin directory.
// ---------------------------------------------------------------------------

check('6. interface carries displayName, shortDescription, category, capabilities; defaultPrompt within limits', (fail) => {
  for (const dir of PLUGIN_DIRS) {
    const key = codexPluginKey(dir);
    if (unavailable(fail, key)) continue;

    const path = manifestPaths.get(key);
    const iface = docs[key].interface;
    if (!isPlainObject(iface)) {
      fail(rel(path), '"interface" block is missing');
      continue;
    }

    for (const field of ['displayName', 'shortDescription', 'category']) {
      if (typeof iface[field] !== 'string' || iface[field].trim() === '') {
        fail(rel(path), `interface.${field} is missing or not a non-empty string`);
      }
    }

    if (!Array.isArray(iface.capabilities) || iface.capabilities.length === 0) {
      fail(rel(path), 'interface.capabilities is missing or not a non-empty array');
    } else {
      iface.capabilities.forEach((c, i) => {
        if (typeof c !== 'string' || c.trim() === '') {
          fail(rel(path), `interface.capabilities[${i}] is not a non-empty string`);
        }
      });
    }

    if (iface.defaultPrompt !== undefined) {
      if (!Array.isArray(iface.defaultPrompt)) {
        fail(rel(path), 'interface.defaultPrompt is not an array');
      } else {
        if (iface.defaultPrompt.length > MAX_DEFAULT_PROMPTS) {
          fail(
            rel(path),
            `interface.defaultPrompt holds ${iface.defaultPrompt.length} entries — at most ${MAX_DEFAULT_PROMPTS} are kept`,
          );
        }
        iface.defaultPrompt.forEach((p, i) => {
          if (typeof p !== 'string') {
            fail(rel(path), `interface.defaultPrompt[${i}] is not a string`);
          } else if (p.length > MAX_DEFAULT_PROMPT_LENGTH) {
            fail(
              rel(path),
              `interface.defaultPrompt[${i}] is ${p.length} characters — at most ${MAX_DEFAULT_PROMPT_LENGTH} are kept`,
            );
          }
        });
      }
    }
  }
});

// ---------------------------------------------------------------------------
// Check 7 — every asset path referenced by interface exists on disk.
//
// An asset reference is any interface value that names a file: a known asset key
// (logo, composerIcon, …) or a path-shaped string. Collecting only values that
// already start with "./" would let a bare "assets/logo.svg" — which no host
// resolves — skip the check entirely and the whole check pass with zero paths
// inspected, so both the prefix and the file are asserted here.
// ---------------------------------------------------------------------------

check('7. every asset path referenced by interface exists on disk', (fail) => {
  for (const dir of PLUGIN_DIRS) {
    const key = codexPluginKey(dir);
    if (unavailable(fail, key)) continue;

    const path = manifestPaths.get(key);
    const pluginDir = dir; // assets resolve relative to the plugin root
    const iface = docs[key].interface;
    if (!isPlainObject(iface)) {
      fail(rel(path), '"interface" block is missing — its asset paths cannot be checked');
      continue;
    }

    const refs = [];
    const consider = (where, k, v) => {
      if (typeof v !== 'string' || v.trim() === '') return;
      if (isUriValue(v)) return; // an absolute URL is not a shipped file
      if (!isAssetKey(k) && !looksLikePath(v)) return;
      refs.push({ where, value: v });
    };

    for (const [k, value] of Object.entries(iface)) {
      if (Array.isArray(value)) {
        value.forEach((v, i) => consider(`interface.${k}[${i}]`, k, v));
      } else {
        consider(`interface.${k}`, k, value);
      }
    }

    for (const { where, value } of refs) {
      if (!hasRelativePrefix(value)) {
        fail(
          rel(path),
          `${where} is ${JSON.stringify(value)} — an asset path must begin with "./" to resolve against the plugin root`,
        );
      }
      const assetPath = resolveFrom(pluginDir, value);
      const kind = statKind(assetPath);
      if (kind !== 'file') {
        fail(rel(path), `${where} → ${rel(assetPath)} is not a file (${kind})`);
      }
    }
  }
});

// ---------------------------------------------------------------------------
// Check 8 — mcpServers and skills paths resolve.
// ---------------------------------------------------------------------------

check('8. mcpServers and skills paths resolve', (fail) => {
  for (const dir of PLUGIN_DIRS) {
    const targets = [
      { key: codexPluginKey(dir), required: true },
      { key: claudePluginKey(dir), required: false },
    ];

    for (const { key, required } of targets) {
      if (!have(key)) {
        fail(rel(manifestPaths.get(key)), 'cannot be checked — it did not parse (see check 1)');
        continue;
      }
      const path = manifestPaths.get(key);
      const doc = docs[key];
      const pluginDir = dir;

      // skills
      if (doc.skills === undefined) {
        if (required) fail(rel(path), '"skills" path is missing');
      } else if (typeof doc.skills !== 'string') {
        fail(rel(path), '"skills" is not a path string');
      } else {
        if (!hasRelativePrefix(doc.skills)) {
          fail(rel(path), `"skills": ${JSON.stringify(doc.skills)} does not begin with "./" — plugin paths are relative and spelled "./…"`);
        }
        const skillsDir = resolveFrom(pluginDir, doc.skills);
        const kind = statKind(skillsDir);
        if (kind !== 'dir') fail(rel(path), `"skills": ${JSON.stringify(doc.skills)} → ${rel(skillsDir)} is not a directory (${kind})`);
      }

      // mcpServers — a path string in Codex, an inline object where hosts allow it.
      if (doc.mcpServers === undefined) {
        if (required) fail(rel(path), '"mcpServers" path is missing');
      } else if (isPlainObject(doc.mcpServers)) {
        if (Object.keys(doc.mcpServers).length === 0) {
          fail(rel(path), '"mcpServers" is an empty inline object');
        }
      } else if (typeof doc.mcpServers !== 'string') {
        fail(rel(path), '"mcpServers" is neither a path string nor an object');
      } else {
        if (!hasRelativePrefix(doc.mcpServers)) {
          fail(rel(path), `"mcpServers": ${JSON.stringify(doc.mcpServers)} does not begin with "./" — plugin paths are relative and spelled "./…"`);
        }
        const mcpPath = resolveFrom(pluginDir, doc.mcpServers);
        const r = readJson(mcpPath);
        if (!r.ok) {
          fail(rel(path), `"mcpServers": ${JSON.stringify(doc.mcpServers)} → ${rel(mcpPath)} ${r.error}`);
        } else if (!isPlainObject(r.data?.mcpServers) || Object.keys(r.data.mcpServers).length === 0) {
          fail(rel(mcpPath), 'does not declare a non-empty "mcpServers" object');
        }
      }
    }

    // Claude resolves the plugin's MCP servers from an implicit ./.mcp.json.
    const implicit = join(dir, '.mcp.json');
    const kind = statKind(implicit);
    if (kind !== 'file') {
      fail(rel(implicit), `is not a file (${kind}) — Claude loads the plugin's MCP servers from this path`);
      continue;
    }
    const r = readJson(implicit);
    if (!r.ok) fail(rel(implicit), r.error);
    else if (!isPlainObject(r.data?.mcpServers) || Object.keys(r.data.mcpServers).length === 0) {
      fail(rel(implicit), 'does not declare a non-empty "mcpServers" object');
    }
  }
});

// ---------------------------------------------------------------------------
// Check 9 — the Codex marketplace manifest survives the documented sparse checkout.
//
// Codex installs from a sparse checkout of this repo. If README.md documents a
// sparse path set that does not include .agents/plugins/marketplace.json, the
// checkout Codex makes contains no marketplace at all and the install cannot
// start — a tree that is green here but uninstallable there.
// ---------------------------------------------------------------------------

/** Strip backticks/quotes/whitespace and normalize a sparse path for matching. */
function normalizeSparsePath(raw) {
  let p = String(raw).trim();
  p = p.replace(/^[`'"]+/, '').replace(/[`'"]+$/, '').trim();
  p = p.replace(/^\.\//, '').replace(/^\/+/, '').replace(/\/+$/, '');
  return p;
}

/** Does a sparse-checkout pattern include `target` (a repo-relative file path)? */
function sparseCovers(pattern, target) {
  const p = normalizeSparsePath(pattern);
  if (p === '' || p === '.' || p === '*' || p === '**') return true;
  if (p.includes('*')) {
    const body = p
      .split('/')
      .map((seg) =>
        seg === '**'
          ? '.*'
          : seg.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*'),
      )
      .join('/');
    return new RegExp(`^${body}(?:/.*)?$`).test(target);
  }
  return target === p || target.startsWith(`${p}/`);
}

/** Sections of README.md whose heading names Codex. */
function codexSections(text) {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const sections = [];
  for (let i = 0; i < lines.length; i += 1) {
    const h = /^(#{1,6})\s+(.*)$/.exec(lines[i]);
    if (!h || !/codex/i.test(h[2])) continue;
    const level = h[1].length;
    let end = lines.length;
    for (let j = i + 1; j < lines.length; j += 1) {
      const h2 = /^(#{1,6})\s+/.exec(lines[j]);
      if (h2 && h2[1].length <= level) {
        end = j;
        break;
      }
    }
    sections.push({ heading: h[2].trim(), lines: lines.slice(i, end) });
  }
  return sections;
}

/**
 * Turn one sparse-path VALUE (a table cell, or the text after "Sparse paths:")
 * into a declaration. A value that says "empty"/"none" means a full checkout.
 */
function parseSparseValue(where, value) {
  const ticks = [...value.matchAll(/`([^`]+)`/g)].map((m) => m[1]);
  const tokens = ticks.length > 0 ? ticks : value.split(/[,;]/);
  const paths = [];
  for (const token of tokens) {
    for (const piece of token.split(/\s+/)) {
      const p = normalizeSparsePath(piece);
      if (p && !paths.includes(p)) paths.push(p);
    }
  }
  if (paths.length === 0 || /\b(empty|none|blank|unset|omit(?:ted)?|n\/a)\b/i.test(value)) {
    return { where, paths: [], full: true };
  }
  return { where, paths, full: false };
}

/**
 * Sparse-path declarations inside a README section. Only structured forms count —
 * a `--sparse` flag, a `git sparse-checkout set`, a table row labelled "Sparse
 * paths", or a "Sparse paths: …" line. Prose that merely mentions a path in
 * backticks is not a declaration; reading it as one would let an explanation of
 * the very bug this check exists to catch satisfy the check.
 */
function extractSparseDeclarations(lines) {
  const decls = [];
  for (const raw of lines) {
    const line = raw.trim();

    const flags = [...raw.matchAll(/--sparse(?:-paths?)?[=\s]+("[^"]+"|'[^']+'|[^\s\\]+)/g)];
    if (flags.length > 0) {
      const paths = flags.map((m) => normalizeSparsePath(m[1])).filter(Boolean);
      decls.push({ where: line, paths, full: paths.length === 0 });
      continue;
    }

    const gitSet = /sparse-checkout\s+(?:set|add)\s+(.+)$/i.exec(raw);
    if (gitSet) {
      decls.push(parseSparseValue(line, gitSet[1].replace(/\\$/, '')));
      continue;
    }

    if (/^\|.*\|$/.test(line)) {
      const cells = line.slice(1, -1).split('|').map((c) => c.trim());
      if (cells.length >= 2 && /^[*_`\s]*sparse[\s-]*paths?[*_`\s]*$/i.test(cells[0])) {
        decls.push(parseSparseValue(line, cells.slice(1).join(' ')));
      }
      continue;
    }

    const kv = /^(?:[-*+]\s+)?[*_`]*\s*sparse[\s-]*paths?\s*[*_`]*\s*(?::|=|—|–)\s*(.+)$/i.exec(line);
    if (kv) decls.push(parseSparseValue(line, kv[1]));
  }
  return decls;
}

check('9. README documents a Codex sparse checkout that includes the Codex marketplace manifest', (fail) => {
  let text;
  try {
    text = readFileSync(README_PATH, 'utf8');
  } catch (err) {
    fail(rel(README_PATH), err.code === 'ENOENT' ? 'file does not exist' : err.message);
    return;
  }

  const sections = codexSections(text);
  if (sections.length === 0) {
    fail(rel(README_PATH), 'has no Codex install section — the Codex sparse checkout cannot be verified');
    return;
  }

  const decls = sections.flatMap((section) => extractSparseDeclarations(section.lines));

  // No sparse paths documented at all — Codex clones the whole repo, everything ships.
  if (decls.length === 0) return;

  const target = CODEX_MARKETPLACE_SPARSE_TARGET;
  // Every documented narrowing is an install route a reader will follow, so each
  // one must carry both the marketplace manifest and the plugin body it points at.
  const probes = [
    { what: `the Codex marketplace manifest ${JSON.stringify(target)}`, path: target },
    ...PLUGIN_DIRS.map((dir) => ({
      what: `the plugin body ${JSON.stringify(`${posixRel(dir)}/`)} that ${target} points at`,
      path: `${posixRel(dir)}/.codex-plugin/plugin.json`,
    })),
  ];

  for (const decl of decls) {
    if (decl.full) continue; // an empty sparse-path field means a full checkout
    if (decl.paths.length === 0) {
      fail(rel(README_PATH), `Codex install step "${decl.where}" names a sparse-path field but declares no path values`);
      continue;
    }
    const listed = decl.paths.map((p) => JSON.stringify(p)).join(', ');
    for (const probe of probes) {
      if (decl.paths.some((p) => sparseCovers(p, probe.path))) continue;
      fail(
        rel(README_PATH),
        `Codex install step "${decl.where}" narrows the checkout to [${listed}], which does not include ${probe.what} — that checkout cannot be installed`,
      );
    }
  }
});

// ---------------------------------------------------------------------------
// report
// ---------------------------------------------------------------------------

console.log(`JavisSkills manifest check — ${ROOT}\n`);

let totalFailures = 0;
let failedChecks = 0;

for (const { title, failures } of results) {
  if (failures.length === 0) {
    console.log(`  ✓ ${title}`);
    continue;
  }
  failedChecks += 1;
  totalFailures += failures.length;
  console.log(`  ✗ ${title}`);
  for (const { file, reason } of failures) {
    console.log(`      ${file}: ${reason}`);
  }
}

const passed = results.length - failedChecks;
console.log('');
if (totalFailures === 0) {
  console.log(`${passed}/${results.length} checks passed.`);
  process.exit(0);
}
console.log(
  `${passed}/${results.length} checks passed, ${failedChecks} failed — ${totalFailures} failure${totalFailures === 1 ? '' : 's'} total.`,
);
process.exit(1);
