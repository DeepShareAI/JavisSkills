# JavisFilesystem Skill — Design Spec

**Date:** 2026-05-14
**Author:** Samuel (via Claude)
**Status:** Draft — pending approval
**Target environment:** Claude Desktop App / claude.ai (personal plugins), and any Claude Code-compatible harness that loads JavisSkills plugin

---

## 1. Purpose

Re-package the existing `mcp_server/Workspace-MCP` (a stdio MCP server exposing local filesystem + paper-project helpers) as a **skill bundle** named **`javis-filesystem`** inside the `JavisSkills` plugin.

Goal: a user who has the `javis_mcp` remote connector installed (for transcripts, sessions, summaries) can install the same `JavisSkills` plugin once and additionally get **workspace/filesystem operations** — without standing up the separate stdio MCP server.

The existing `Workspace-MCP` repo is not deleted by this work — it stays as a usable stdio server. This spec adds a second delivery path: skill bundle inside `JavisSkills`.

## 2. Scope

**In scope:**
- A new skill `skills/javis-filesystem/` inside `JavisSkills`.
- A `SKILL.md` that instructs Claude how to perform the operations currently exposed by `Workspace-MCP`, using built-in `Read` / `Write` / `Bash` tools plus helper scripts.
- Helper scripts in `scripts/` for the operations that need real code (xlsx parsing, safe atomic writes, paper assembly, pandoc render).
- A safety reference (`safety.md`) describing the atomic-write, extension-allowlist, and path-traversal rules the skill must follow.
- Updating the plugin manifest (`.claude-plugin/plugin.json`) so the `JavisSkills` plugin advertises both `content-brainstorming` and `javis-filesystem`.

**Out of scope (separate work):**
- Deleting or modifying `mcp_server/Workspace-MCP`. It coexists.
- Any changes to `javis-server/javis_mcp` or the remote MCP endpoint.
- A test suite at the skill level. Helper scripts in `scripts/` get unit tests; the skill itself is exercised by manual use.
- Cross-platform shell scripting beyond macOS/Linux (no Windows-specific paths).

## 3. Coexistence Model

```
┌─────────────────────────────────────────────────────────────────┐
│  User's Claude (Desktop or claude.ai)                            │
│                                                                   │
│  ┌────────────────────────┐   ┌────────────────────────────────┐ │
│  │ Connector: javis_mcp    │   │ Personal plugin: JavisSkills    │ │
│  │ (remote, OAuth)         │   │ (local skill bundle)            │ │
│  │ → list_sessions_tool    │   │ → content-brainstorming skill   │ │
│  │ → get_transcript_tool   │   │ → javis-filesystem skill ← NEW  │ │
│  │ → search_transcripts_…  │   │                                 │ │
│  └────────────────────────┘   └────────────────────────────────┘ │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

`javis-filesystem` uses **Claude's built-in tools** (`Read`, `Write`, `Bash`) and a small set of helper scripts. It does not require a running MCP server.

## 4. Repository Layout

```
JavisSkills/
├── .claude-plugin/
│   └── plugin.json                  # Manifest — lists both skills
├── skills/
│   ├── content-brainstorming/        # Existing
│   │   └── …
│   └── javis-filesystem/             # NEW
│       ├── SKILL.md                  # Activation + workflow + tool-mapping
│       ├── safety.md                 # Atomic write / allowlist / traversal rules
│       └── scripts/
│           ├── safe_write.py         # Atomic write with extension allowlist
│           ├── read_xlsx.py          # .xlsx → JSON (replaces MCP read_xlsx)
│           ├── list_sections.py      # Numeric-prefix-ordered section listing
│           ├── assemble_paper.py     # Concatenate sections to out/paper.md
│           └── render_pandoc.sh      # Pandoc invocation, skips if missing
├── docs/
│   └── specs/
│       └── 2026-05-14-javisfilesystem-design.md   # This file
└── README.md                          # Updated: install + javis-filesystem usage
```

## 5. Tool-Surface Mapping

Each `Workspace-MCP` tool maps to either (a) a direct use of a Claude built-in tool guided by `SKILL.md`, or (b) a helper script invoked via `Bash`.

| Workspace-MCP tool | New implementation | Notes |
|---|---|---|
| `list_roots` | N/A — drop | Skill operates relative to the user's cwd; "roots" are unnecessary in the skill model. |
| `list_dir(root, path)` | `Bash` (`ls -la <path>`) | SKILL.md documents the pattern. |
| `stat(root, path)` | `Bash` (`stat -f '%Sm %z %N' <path>` on macOS, `stat -c …` on Linux) | One-liner in SKILL.md. |
| `glob(root, pattern)` | `Bash` (`find` or shell glob) | SKILL.md gives both. |
| `read_text(root, path)` | Claude's `Read` tool | Direct. |
| `read_file(root, path)` | Claude's `Read` tool | `Read` already handles text/image/PDF. |
| `read_xlsx(root, path, sheet?, range?)` | `scripts/read_xlsx.py` via `Bash` | Reuses the openpyxl logic ported from Workspace-MCP. |
| `write_file(root, path, content, …)` | `scripts/safe_write.py` via `Bash` | Preserves atomic write + extension allowlist. SKILL.md mandates using this script, not `Write` directly, for any path the user wants safety on. |
| `mkdir(root, path, parents?)` | `Bash` (`mkdir -p <path>`) | Direct. |
| `load_paper_project(root, subpath?)` | `scripts/list_sections.py` + Claude reading manifests | The "one-call summary" splits into: list sections (script) + read `manifest.yaml` / `meta.json` / `refs.bib` directly (Read). SKILL.md describes the sequence. |
| `list_sections(root, subpath?)` | `scripts/list_sections.py` | Ported from paper helpers. |
| `assemble_paper(root, subpath?, output_path?, separator?)` | `scripts/assemble_paper.py` | Ported. Uses `safe_write.py` internally. |
| `render_pandoc(…)` | `scripts/render_pandoc.sh` | Ported. Exits cleanly if `pandoc` is not on PATH. |

## 6. Safety Reference (`safety.md`)

The skill loses the MCP server's process-level enforcement of three guarantees. They move into a single reference doc the skill must follow and into `safe_write.py`.

### Atomic writes
`safe_write.py`:
1. Resolves the target path; refuses if it sits outside the working directory.
2. Writes to a `<target>.tmp.<pid>.<rand>` sibling.
3. `os.replace()` to the final name.
4. Returns `{path, bytes_written, atomic: true}`.

`SKILL.md` requires `safe_write.py` for all writes Claude doesn't trivially own. Claude's built-in `Write` is reserved for ad-hoc throwaway files in obvious locations.

### Extension allowlist
`safe_write.py` enforces an allowlist identical to Workspace-MCP's:
`.md .txt .tex .yaml .yml .json .bib .csv .html`
Anything else is rejected with a clear error. SKILL.md restates the list for Claude's awareness so it doesn't even attempt blocked writes.

### Path traversal
`safe_write.py` and `read_xlsx.py` resolve the path and verify the resolved absolute path begins with the configured working directory. Symlinks are followed before the check.

The working directory defaults to the user's cwd; can be overridden by the env var `JAVIS_FS_ROOT` (set per-invocation via `Bash`). No "named roots" — a single working dir at a time.

## 7. SKILL.md Structure

```markdown
---
name: javis-filesystem
description: Use whenever the user wants to read, write, list, glob, or stat local files, parse spreadsheets, or work with a paper-project layout (sections, assembly, pandoc render). Pairs with the javis_mcp connector — use this skill for files, use javis_mcp for transcripts/sessions/summaries.
---

# JavisFilesystem

## When to use
- Reading or writing local files
- Listing/globbing directories
- Reading .xlsx spreadsheets
- Working with a paper-project: list sections, assemble paper, render pandoc

## When NOT to use
- Anything about voice sessions, transcripts, groups, or summaries → use the javis_mcp connector tools instead.
- Destructive deletions → the skill does not delete. Tell the user to use their shell.

## Workflow

1. Identify the operation type (read / write / list / xlsx / paper).
2. For writes: use scripts/safe_write.py via Bash. Never use Write directly on files you care about being safe.
3. For xlsx: scripts/read_xlsx.py.
4. For paper-project ops: scripts/list_sections.py, scripts/assemble_paper.py, scripts/render_pandoc.sh.
5. Reads and dir listings: use Claude's Read tool and Bash directly.

## Safety
See safety.md for atomic-write, extension-allowlist, and path-traversal rules. These are mandatory.

## Loading detail
- Safety rules: safety.md
- Helper scripts: scripts/
```

## 8. Helper Scripts

All scripts are Python 3.11+ (matching the existing `Workspace-MCP` baseline). They are self-contained — no shared package. Each prints structured JSON to stdout on success and a JSON error object to stderr (exit non-zero) on failure, so the skill can `Bash`-invoke and parse them uniformly.

### `safe_write.py`
```
usage: safe_write.py <path> [--stdin]
       echo "content" | safe_write.py <path>
```
Refuses writes whose extension is not in the allowlist. Refuses paths outside `JAVIS_FS_ROOT` (or cwd). Atomic-rename pattern.

### `read_xlsx.py`
```
usage: read_xlsx.py <path> [--sheet NAME] [--range A1:D20]
```
Outputs `{sheet_name: [[row], …]}` if no sheet specified; outputs `[[row], …]` for one sheet. Range is A1-notation.

### `list_sections.py`
```
usage: list_sections.py [<subpath>]
```
Lists `<subpath>/out/sections/NN-*.md` ordered by the numeric `NN` prefix.

### `assemble_paper.py`
```
usage: assemble_paper.py [<subpath>] [--output out/paper.md] [--separator "\n\n"]
```
Concatenates sections, writes via `safe_write` semantics.

### `render_pandoc.sh`
```
usage: render_pandoc.sh <subpath> [pandoc-args…]
```
Checks `command -v pandoc`; if absent, prints `{"skipped": true, "reason": "pandoc not found"}` and exits 0.

## 9. Plugin Manifest (`.claude-plugin/plugin.json`)

```json
{
  "name": "javis-skills",
  "version": "0.2.0",
  "description": "Javis-flavored personal-plugin skills: content brainstorming and local filesystem operations",
  "author": "Samuel Wei",
  "skills": [
    "skills/content-brainstorming",
    "skills/javis-filesystem"
  ]
}
```

Version bumps from `0.1.0` → `0.2.0` to mark the added skill. If `content-brainstorming` has not yet shipped at `0.1.0` when this skill lands, the two ship together at `0.1.0` and the bump is skipped.

## 10. Success Criteria

- A user with the `JavisSkills` plugin installed and the `javis_mcp` connector configured can, in a single Claude session: search a transcript via the connector, read a local PDF via `javis-filesystem`, parse an `.xlsx` via `javis-filesystem`, and write a markdown summary via `safe_write.py` — all without standing up `Workspace-MCP`.
- `javis-filesystem` activates on filesystem-shaped intents and does not collide with `javis_mcp` tool calls for transcript intents.
- Writes through the skill remain atomic and respect the extension allowlist.
- Symlink-based path traversal attempts are rejected by `safe_write.py` and `read_xlsx.py`.
- `mcp_server/Workspace-MCP` continues to work standalone for users who prefer the stdio MCP path.

## 11. Non-Goals

- Replacing or deprecating `Workspace-MCP`.
- Multi-root configuration in the skill (single root via cwd or `JAVIS_FS_ROOT`).
- File deletion or rename operations (the original MCP intentionally didn't expose these).
- Windows path handling.

## 12. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Claude bypasses `safe_write.py` and uses `Write` for a sensitive file, losing atomic-write guarantee. | SKILL.md gives a clear rule + a one-line check ("if it matters, use `safe_write.py`"). Allowlist enforcement still applies because `safe_write.py` is the only path with allowlist code. |
| User runs the skill in a directory where they didn't intend writes. | `JAVIS_FS_ROOT` env var override is documented; otherwise cwd is the boundary. Path-traversal check rejects writes outside that. |
| Helper script JSON output is mis-parsed by Claude on a Bash error. | Scripts emit JSON to both stdout (success) and stderr (failure) with exit codes; SKILL.md instructs Claude to check exit code first. |
| Pandoc missing on user's machine breaks paper render. | `render_pandoc.sh` emits `{"skipped": true, …}` and exits 0 — same behavior as the MCP tool. |

## 13. Migration Path

For users currently running `Workspace-MCP` as a stdio MCP server:
- Continue working unchanged. No deprecation.
- If they install `JavisSkills` and want to retire the MCP server, they remove the `claude_desktop_config.json` entry; the skill takes over via `Bash` + scripts.

For new users:
- Install `JavisSkills` plugin → `javis-filesystem` skill available immediately.
- Configure the `javis_mcp` remote connector separately for transcript access.

## 14. Open Questions (resolved before implementation)

- **Helper-script discovery.** Scripts live at `<plugin-root>/skills/javis-filesystem/scripts/`. The skill resolves their absolute path at activation time. Implementation plan will verify which discovery mechanism is supported by the target runtime (an env var like `CLAUDE_PLUGIN_ROOT` if available, otherwise deriving the path from the SKILL.md location). Whichever is chosen, `Bash` invocations must not depend on cwd.
- **Python availability.** Scripts target Python 3.11+, invoked via `python3` on PATH. If absent, `safe_write.py` errors clearly; SKILL.md notes the prerequisite.
- **`openpyxl` dependency for `read_xlsx.py`.** Scripts ship a `requirements.txt`; SKILL.md instructs Claude to `pip install --user -r requirements.txt` once when xlsx is first used, or to use `uv run` if available. Alternative considered (and rejected for simplicity): bundle openpyxl. Status: use `pip install --user` on first use.
