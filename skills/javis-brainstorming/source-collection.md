# Source Collection

How to pull source materials into a brief — from Javis MCP tools (voice data and the wiki), user-provided files, and links. Load this only when you reach **Phase 2 — Source collection** in `SKILL.md`.

## Three streams

The brief draws material from three streams:

1. **Javis voice data** — sessions, transcripts, group transcripts, summaries — via the `mcp__claude_ai_javis_mcp__*` tool family (provided by the bundled `javis-mcp` connector).
2. **User-provided files / links** — anything the user drops in: images, PDFs, video references, web links, plain notes.
3. **Javis wiki → linked resources** — a wiki page and the source files it links, read one at a time — via the `wiki_*` tools in the same `mcp__claude_ai_javis_mcp__*` family. This stream is **primary for the CLARIFY branch** (start here) and an **optional research input for the WRITE branch** (use only when a wiki page genuinely backs the piece).

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

## Javis wiki → linked resources (read one at a time)

The third stream reads a Javis wiki page, then walks the source files that page links — **one resource at a time, never batched**. It is the **primary** source stream for the CLARIFY branch and an **optional research input** for the WRITE branch. It runs on the `wiki_*` tools of the bundled `javis-mcp` connector, each reachable as `mcp__claude_ai_javis_mcp__<tool>`.

| Tool | When to use | Key fields to extract |
|---|---|---|
| `wiki_search_tool` | The user names a topic that may have a wiki page — full-text find the page | candidate slug(s), title, snippet |
| `wiki_list_index_tool` | Browse the wiki index when the user has no specific page in mind | slug, title |
| `wiki_get_page_tool` | Read a resolved page (or a linked wiki-backed source) by slug | page body, list of linked source slugs/ids |
| `get_transcript_tool` | Read a linked source that is transcript-backed rather than a wiki page | `session_id`, full transcript body |

Procedure:

1. **Locate the page.** If the user names a topic that may have a wiki page, resolve it to a page slug with `wiki_search_tool` (topic named) or `wiki_list_index_tool` (browsing). If more than one candidate matches, **confirm the slug with the user before reading** — don't guess.
2. **Read the page.** Call `wiki_get_page_tool` on the resolved slug. Extract its list of linked source files / resources (the slugs or ids it points to).
3. **Read each linked source one by one.** Loop the linked slugs. For each, call `wiki_get_page_tool` (wiki-backed source) or `get_transcript_tool` (transcript-backed source). After each read, emit a one-line progress marker before moving to the next:

   > `Source N read: <one-line summary>`

   No parallel reads. No batching. One source, one summary line, then the next.
4. **Privacy gate.** The privacy rule above still holds: **confirm before pulling any Javis transcript the user did not explicitly name.** A wiki page linking a transcript is not itself the user naming that transcript — surface the candidate and confirm before calling `get_transcript_tool` on it.
5. **Feed the highlight pass.** Route the extracted page + linked-source material into **Extracted highlights** exactly like the other two streams — same inventory line shape, same highlight pass.

Record the page and each linked source in the brief's **Materials Inventory** — in the shape the destination brief type calls for:

- **WRITE branch (writing brief).** Use the standard flat one-line shape (below): `wiki:` as the id prefix for the page and wiki-backed sources, and `session_id:` for transcript-backed ones.
- **CLARIFY branch (clarification brief).** The wiki page and its linked sources go into that brief's own subsectioned inventory — a `### Javis wiki` block written as `- page: <slug> — <one-line description>`, plus a `### Linked sources (read one by one)` block — exactly as defined in the concept-clarification section of `format-guides.md` (mirrored in `SKILL.md`). Do **not** force the flat `wiki:` shape onto the clarification brief; the subsectioned `page:` form is authoritative there.

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
- wiki: heyjavis-concept — wiki — wiki page for the HeyJavis concept — primary page whose linked sources seed the clarification
- wiki: heyjavis-scope-notes — wiki — linked source read from the page above — defines what HeyJavis is NOT
```

Stable, scannable, one line each. Long descriptions or quotes go in **Extracted highlights**, not the inventory line.

The flat shape above (including the two `wiki:` example lines) is the **WRITE-branch** writing-brief form. When the destination is the **CLARIFY-branch** clarification brief, the wiki page and its linked sources instead take the subsectioned `### Javis wiki` / `- page: <slug> …` + `### Linked sources` form from `format-guides.md` — see the branch note under "Javis wiki → linked resources" above.

## Extracted highlights

As you read each source, pull out its **specifically usable** bits — this happens while cataloguing, not as a separate downstream pass:

- **Quotes**: verbatim, ≤2 sentences. Attribute by `session_id` or person.
- **Data points**: numbers, dates, named percentages. Attribute by source.
- **Scenes / moments**: a 1-line description of a memorable moment from audio/video.
- **Image content**: what the image shows that's worth referencing.

The highlights are the raw material the drafting step will lean on. If a source produced no usable highlights, leave it in inventory but note it — it's still context, just not quotable.

## When you have nothing

If the user can't supply sources for a section the outline needs, flag it in the brief's **Open questions**:

> "Outline section 3 ('Reactions') has no on-record sources yet. Either pull from session `<id>` or skip the section."

Don't fabricate. Don't draft prose to fill the gap — that's a hard-gate violation.
