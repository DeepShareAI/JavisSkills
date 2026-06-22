# Source Collection

How to pull source materials into a brief — from Javis MCP tools, user-provided files, and links. Load this only when you reach **Step 3 — Collect source materials** in `SKILL.md`.

## Two streams

The brief draws material from two streams:

1. **Javis voice data** — sessions, transcripts, group transcripts, summaries — via the `mcp__claude_ai_javis_mcp__*` tool family (provided by the bundled `javis-mcp` connector).
2. **User-provided files / links** — anything the user drops in: images, PDFs, video references, web links, plain notes.

Always ask the user which streams are relevant before pulling — don't assume.

## Privacy rule

**Confirm before fetching any transcript the user has not explicitly named.** This applies even if a search clearly identifies a likely session. Phrase it like:

> "I found two sessions that match: `<id-a>` (May 12, 'team standup') and `<id-b>` (May 14, 'launch retro'). Want me to pull the full transcript for one or both?"

The user's confirmation is per-session, not blanket. Re-confirm if your search expands later.

## Javis MCP tools

Use the bundled connector's tools. Each is reachable as `mcp__claude_ai_javis_mcp__<tool>`. The seven available tools:

| Tool | When to use | Key fields to extract |
|---|---|---|
| `list_sessions_tool` | Browse recent recordings when the user doesn't have a specific session in mind | `session_id`, `started_at`, `title`, `duration` |
| `get_session_tool` | Fetch metadata for one session by ID | `session_id`, `title`, `started_at`, `participants` |
| `search_transcripts_tool` | Full-text search across transcripts when the user names a topic, person, or phrase | `session_id`, matched snippet, timestamp |
| `get_transcript_tool` | Fetch the full transcript text for a specific session | `session_id`, full transcript body |
| `list_groups_tool` | Browse conversation groups (multi-session threads) | `group_id`, `name`, `session_count` |
| `get_group_transcript_tool` | Combined transcript for a group | `group_id`, combined transcript |
| `list_summaries_tool` | Pull AI-generated summaries when condensed material is enough | `session_id`, summary text, date |

### Picking the right entry point

- User says "the call I had yesterday with Alex" → `list_sessions_tool` filtered to recent + confirm before pulling.
- User says "anywhere we discussed pricing" → `search_transcripts_tool` with the term, then `get_transcript_tool` on confirmed hits.
- User says "the launch group" → `list_groups_tool`, then `get_group_transcript_tool` on the picked group.
- User wants the gist, not full text → `list_summaries_tool` first; only escalate to full transcript if the summary misses what's needed.

### Handling large transcripts

A full transcript can be long. When pulling one:

1. Skim it once — note the topic flow, named people, decision moments, and any usable quotes.
2. In the brief's **Materials Inventory**, record only `session_id` + 1-line description + the pulled excerpts. Don't paste the entire transcript into the brief.
3. If multiple long transcripts get pulled, summarize each separately before extracting highlights — don't try to hold all of them in working context at once.

## User-provided files and links

Ask the user how they want to supply non-Javis sources:

> "For files outside of Javis — images, PDFs, links, notes — you can either paste/drag them into this conversation, or give me file paths I can read."

For each item the user provides:

- **Text-readable files** (`.md`, `.txt`, `.pdf`): read with the `Read` tool, then extract quotes/data/scenes.
- **Images**: read with the `Read` tool (it supports images). Catalogue what the image shows — don't try to OCR or re-process; just describe usefully.
- **Video references**: the user typically can't paste video. Ask for a short description, timestamps of key moments, and any transcript or notes they already have.
- **Links**: if the link is local file/path, read it. If it's a URL, ask the user whether they want it fetched (use `WebFetch`) — don't fetch silently.
- **Plain notes** the user pastes into the chat: treat as a source; add to inventory with `note:` prefix as the id.

## Materials inventory format

Record every source in the brief's **Materials Inventory** with the same shape, regardless of stream:

```markdown
- <id> — <type> — <one-line description> — <relevance to the piece>
```

Examples:

```markdown
- session_id: 7e1f… — transcript — May 12 team standup, 28 min — covers the rollout timeline + Alex's pushback on the rename
- summary: 9aa3… — summary — May 14 launch retro summary — names the three regressions we should call out
- file: /Users/sw/Desktop/q2-numbers.png — image — bar chart of Q2 active users by region — primary data for "growth" section
- note: pasted — note — user's recollection of the customer call we couldn't record — supports the "missed feedback" beat
- link: https://… — link — competitor blog post on same topic — counterpoint material
```

Stable, scannable, one line each. Long descriptions or quotes go in **Extracted highlights**, not the inventory line.

## Extracted highlights

After cataloguing sources, do one pass to pull out the **specifically usable** bits:

- **Quotes**: verbatim, ≤2 sentences. Attribute by `session_id` or person.
- **Data points**: numbers, dates, named percentages. Attribute by source.
- **Scenes / moments**: a 1-line description of a memorable moment from audio/video.
- **Image content**: what the image shows that's worth referencing.

The highlights are the raw material the drafting step will lean on. If a source produced no usable highlights, leave it in inventory but note it — it's still context, just not quotable.

## When you have nothing

If the user can't supply sources for a section the outline needs, flag it in the brief's **Open questions**:

> "Outline section 3 ('Reactions') has no on-record sources yet. Either pull from session `<id>` or skip the section."

Don't fabricate. Don't draft prose to fill the gap — that's a hard-gate violation.
