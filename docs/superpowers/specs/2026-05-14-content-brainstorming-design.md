# Content-Brainstorming Skill — Design Spec

**Date:** 2026-05-14
**Author:** Samuel (via Claude)
**Status:** Draft — pending approval
**Target environment:** Claude Desktop App (and any Claude Code-compatible harness that supports plugins/skills)

---

## 1. Purpose

A single, format-agnostic brainstorming skill for **writing tasks** — reports, articles, news pieces, blog posts, and similar. The skill clarifies the user's intent through structured questions and inventories the source materials needed to draft.

The skill **does not draft**. Its output is a brief that a separate downstream step (drafting skill / direct prompt) consumes.

This mirrors the structure and discipline of `superpowers/skills/brainstorming/` but is tuned for content creation instead of software design.

## 2. Scope

**In scope:**
- One skill that handles any writing format via a format-branching question bank.
- Integration with Javis MCP tools (`list_sessions`, `get_transcript`, `search_transcripts`, `list_summaries`, etc.) to pull recorded conversations as source material.
- Accepting user-provided source files: images, video references, PDFs, links, plain notes.
- Producing a structured markdown brief saved to a predictable location.
- Packaging as a plugin loadable in Claude Desktop App.

**Out of scope (separate work):**
- Actually drafting the report/article/news piece from the brief.
- Image/video understanding beyond cataloguing what the user supplied.
- Publishing or distribution of finished content.
- A second skill for "drafting" — that is a follow-on project.

## 3. Repository Layout

```
JavisSkills/
├── .claude-plugin/
│   └── plugin.json              # Plugin manifest (name, version, skills list)
├── skills/
│   └── content-brainstorming/
│       ├── SKILL.md             # Main workflow (process flow, hard gate, output contract)
│       ├── format-guides.md     # Per-format question banks + outline shapes
│       └── source-collection.md # How to pull javis_mcp + accept user files
├── docs/
│   └── specs/
│       └── 2026-05-14-content-brainstorming-design.md   # This file
└── README.md                    # Install instructions + usage examples
```

Single skill, single workflow. The three companion files keep `SKILL.md` short and let the skill load detail only when needed.

## 4. Skill Workflow

The skill follows this fixed sequence. Each step is a discrete unit with one job.

### Step 1 — Identify format
First message: ask which format the user is writing (report / article / news / blog / other). Other → user describes it freely. This selection determines which question set the skill loads from `format-guides.md`.

### Step 2 — Clarify intent (one question at a time)
Pull the question bank for the chosen format from `format-guides.md` and ask questions one at a time. Prefer multiple-choice. Cover:
- **Audience** — who reads this and what do they already know?
- **Purpose** — what should the reader do, decide, or believe after reading?
- **Key takeaway** — if they remember one sentence, what is it?
- **Format-specific** — see §6.

### Step 3 — Collect source materials
Move from intent to inputs. The skill asks the user what sources exist and helps collect them:

- **Javis transcripts** — invoke `mcp__claude_ai_javis_mcp__list_sessions_tool` / `search_transcripts_tool` to find candidate recordings, confirm with user, then `get_transcript_tool` to fetch full text.
- **Javis summaries** — `list_summaries_tool` for already-condensed material.
- **User-provided files** — the skill prompts the user to drop in images, video references, PDFs, links, or plain text. It catalogues each one with a short description (it does not re-process them).

Detail in `source-collection.md`.

### Step 4 — Extract relevant facts
For each collected source, pull out:
- Direct quotes worth using
- Data points / numbers
- Key moments or scenes (for video/audio)
- Image captions / what they show

This becomes a "materials inventory" section in the brief.

### Step 5 — Propose 2–3 angles
With intent + materials in hand, propose 2–3 framings/angles for the piece. Each option states the angle, the strongest supporting materials, and the tradeoff. Recommend one.

### Step 6 — Build outline
Once an angle is picked, draft an outline sized to the format (see §6). Each outline section lists which materials feed it.

### Step 7 — Save brief
Write the brief to `briefs/YYYY-MM-DD-<slug>-brief.md` in the user's current working directory. Brief structure in §5. The skill ends here. It does **not** draft.

## 5. Brief File Structure

```markdown
# <Working title>

**Format:** report | article | news | blog | other
**Date:** YYYY-MM-DD
**Status:** Brief — ready for drafting

## Intent
- Audience:
- Purpose:
- Key takeaway:
- Tone/voice:

## Angle
<the chosen framing in 1–2 sentences>

## Materials Inventory

### Javis transcripts
- session_id: <id> — <one-line description> — <relevant excerpts/quotes>

### User-supplied sources
- <file/link/image> — <description> — <relevance>

### Extracted highlights
- Quote: "..." — source: <id>
- Data: <number/fact> — source: <id>
- Scene: <description> — source: <id>

## Outline
1. <Section title> — purpose — materials feeding it
2. ...

## Open questions
- <anything the user still needs to decide / sources still to gather>
```

## 6. Format Guides (`format-guides.md`)

One section per format. Each contains: clarifying questions, recommended outline shape, what sources matter most.

### Report
- **Questions:** What decision does this inform? Who are the stakeholders? What's the timeframe being analyzed? Is this recurring or one-off?
- **Outline shape:** Executive summary → Context → Findings → Analysis → Recommendations → Appendix
- **Sources matter most:** data, meeting transcripts, prior reports

### Article (long-form / blog)
- **Questions:** What is your thesis in one sentence? What's the hook? Who is the implied "you" reading this? What's the personal angle?
- **Outline shape:** Hook → Thesis → Evidence arc (3–5 beats) → Counterpoint → Resolution → Call to reflect/act
- **Sources matter most:** anecdotes, quotes, research, personal observations

### News
- **Questions:** What happened? When? Who is affected? What's the lede? Are there opposing views? How time-sensitive is this?
- **Outline shape:** Lede (the most important sentence) → Nut graf (why it matters) → Background → Key facts → Reactions/quotes → What's next
- **Sources matter most:** primary sources, dated events, on-record quotes, opposing views

### Blog (informal / opinion)
- **Questions:** What's the one idea? What sparked this? Is this a take, a tutorial, or a journal entry?
- **Outline shape:** Hook → One idea → Why it matters → One example → Close
- **Sources matter most:** personal stories, one anchoring example, optional links

### Other
- The skill asks the user to describe the format in their own words, then proposes a question set drawing from the closest match above. User can override.

## 7. Source Collection Guide (`source-collection.md`)

Covers:
- How to invoke each `mcp__claude_ai_javis_mcp__*` tool and what fields to extract.
- How to ask the user for file uploads (path or drag-drop in desktop app).
- How to record each source in the materials inventory consistently (id, type, one-line description, relevance).
- What to do when a source is large (summarize first, link back to id).
- Privacy note: confirm with user before pulling unfamiliar sessions/transcripts.

## 8. Plugin Manifest (`.claude-plugin/plugin.json`)

```json
{
  "name": "javis-skills",
  "version": "0.1.0",
  "description": "Brainstorming skills for content creation, tuned for Javis workflows",
  "author": "Samuel Wei",
  "skills": ["skills/content-brainstorming"]
}
```

Loadable in Claude Desktop App via the standard plugin install flow.

## 9. SKILL.md Structure

```markdown
---
name: content-brainstorming
description: Use before writing any report, article, news piece, blog post, or similar long-form content. Clarifies intent, inventories source materials (Javis transcripts, files, images), and produces a structured brief.
---

# Content Brainstorming

<HARD-GATE>
Do NOT draft content until a brief has been written and the user has approved it.
</HARD-GATE>

## Checklist
1. Identify format
2. Clarify intent (one question at a time)
3. Collect source materials (load source-collection.md for tool calls)
4. Extract relevant facts
5. Propose 2-3 angles
6. Build outline
7. Save brief to briefs/YYYY-MM-DD-<slug>-brief.md

## Process Flow
[graphviz diagram, similar to superpowers brainstorming]

## Key Principles
- One question at a time
- Multiple choice preferred
- The brief is the output. Do not draft.
- Always inventory sources before angle proposal.

## Loading detail
- Per-format questions and outline shapes: see format-guides.md
- How to collect from javis_mcp and user files: see source-collection.md
```

## 10. Success Criteria

- A user can invoke the skill in Claude Desktop App and complete a brainstorm end-to-end without leaving the conversation.
- The skill produces a brief file at the documented location that captures intent, materials, and outline.
- The skill correctly branches questions by format.
- The skill calls `mcp__claude_ai_javis_mcp__*` tools when transcripts are needed.
- A second person reading only the brief can write a competent first draft.

## 11. Non-Goals

- Generating prose
- Replacing human editorial judgment
- Real-time collaboration features
- Versioning briefs (git is fine for that)

## 12. Open Questions (resolved before implementation)

- **Brief save location.** Default: `briefs/` in the user's current working directory. If absent, create it. The skill states the path before writing.
- **Format list extensibility.** New formats added by appending to `format-guides.md`; no code change.
- **Material privacy.** Skill asks before fetching any transcript the user did not explicitly name.
