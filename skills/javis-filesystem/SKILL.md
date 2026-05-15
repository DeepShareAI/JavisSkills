---
name: javis-filesystem
description: Use whenever the user wants to read, write, list, glob, or stat local files, parse spreadsheets, or work with a paper-project layout (sections, assembly, pandoc render). Pairs with the javis_mcp connector — use this skill for files, use javis_mcp for transcripts/sessions/summaries.
---

# JavisFilesystem

Local filesystem and paper-project operations, ported from the Workspace-MCP stdio server. No MCP server required — operations use Claude's built-in tools plus the helper scripts in `scripts/`.

## When to use

- Reading or writing files in the user's working directory
- Listing or globbing directories
- Reading `.xlsx` spreadsheets
- Working with a paper-project layout: list sections, assemble paper, render pandoc

## When NOT to use

- Voice sessions, transcripts, groups, summaries → use the **`javis_mcp` connector** tools (`list_sessions_tool`, `get_transcript_tool`, `search_transcripts_tool`, etc.).
- File deletion → this skill does not delete. Tell the user to use their shell.

## Working root

Operations resolve paths relative to a single working root:
- `JAVIS_FS_ROOT` env var if set
- Otherwise the user's current working directory

Path traversal outside the root is rejected. See `safety.md` for the full rules.

## Operation map

| What the user asks for | What you do |
|---|---|
| Read a text file, PDF, image | Use Claude's built-in `Read` tool — it already handles text/image/PDF. |
| List a directory | `Bash`: `ls -la <path>` |
| Stat a file | `Bash`: `stat -f '%Sm %z %N' <path>` (macOS) or `stat -c '%y %s %n' <path>` (Linux) |
| Glob | `Bash`: shell glob or `find <root> -name '<pattern>'` |
| Parse an .xlsx | `Bash`: `python3 scripts/read_xlsx.py <path> [--sheet NAME] [--range A1:D20]` |
| Write a text file | `Bash` (piped stdin): `printf '<content>' \| python3 scripts/safe_write.py <path> [--create-parents]` |
| Make a directory | `Bash`: `mkdir -p <path>` |
| List paper sections | `Bash`: `python3 scripts/list_sections.py [<subpath>]` |
| Assemble a paper | `Bash`: `python3 scripts/assemble_paper.py [<subpath>] [--output out/paper.md] [--separator <sep>]` |
| Render pandoc | `Bash`: `python3 scripts/render_pandoc.py [<subpath>] [--input ...] [--output out/paper.tex] [--extra-arg --toc] ...` |

## Rules

1. **Always use `safe_write.py` for durable writes.** Claude's `Write` is acceptable only for ad-hoc temporary files; use `safe_write.py` for anything you want atomic + allowlisted. See `safety.md`.
2. **Extension allowlist:** writes are restricted to `.md .txt .tex .yaml .yml .json .bib .csv .html`. Anything else is read-only.
3. **No deletes.** If the user asks to remove a file, tell them to use their shell.
4. **Check exit codes.** All helper scripts emit JSON to stdout on success (exit 0) and JSON `{"error": "..."}` to stderr on failure (non-zero exit). After every `Bash` call to a script, check the exit code and parse stderr if non-zero.

## Script discovery

When invoking helper scripts, use the absolute path resolved from this SKILL.md's location: scripts live at `<this-skill-dir>/scripts/`. Concretely, the personal-plugin runtime exposes the plugin root as an env var or via the skill's resolved path — pick whichever is available and prefix script invocations with that path. If neither is available, fall back to a `find` for the script under the user's plugins directory.

## Setup (one time per machine)

Only `read_xlsx.py` needs an external library (`openpyxl`). If it fails with `ModuleNotFoundError`, install once using whichever path matches the user's Python.

**Preferred — isolated install (works everywhere, no system conflicts):**
```bash
python3 -m venv ~/.javis-filesystem-venv
~/.javis-filesystem-venv/bin/pip install -r <plugin-root>/skills/javis-filesystem/scripts/requirements.txt
# then invoke scripts with the venv's python:
JAVIS_FS_ROOT=... ~/.javis-filesystem-venv/bin/python3 <plugin-root>/skills/javis-filesystem/scripts/read_xlsx.py ...
```

**Or — user-site install (simpler, but PEP 668 on newer Homebrew/Debian Pythons rejects it):**
```bash
pip3 install --user -r <plugin-root>/skills/javis-filesystem/scripts/requirements.txt
# If you see "error: externally-managed-environment":
pip3 install --user --break-system-packages -r <plugin-root>/skills/javis-filesystem/scripts/requirements.txt
```

State the prerequisite to the user and pick the venv path first; only fall back to `--user [--break-system-packages]` if the user prefers a non-venv install.

## Detail

- Safety rules: `safety.md`
- Helper scripts: `scripts/`
