---
name: content-brainstorming
description: Use before writing any report, article, news piece, blog post, or similar long-form content. Clarifies intent, inventories source materials (Javis transcripts, files, images), and produces a structured brief saved to briefs/. Does NOT draft prose.
---

# Content Brainstorming

Turn a vague writing request into a structured brief that captures intent, source materials, angle, and outline — ready for a separate drafting step.

<HARD-GATE>
Do NOT draft content (no paragraphs, no headlines, no lede, no prose of any kind) until a brief has been written to disk AND the user has approved it. The brief is the output. Drafting is a separate skill / separate prompt.
</HARD-GATE>

## Anti-Pattern: "I'll just draft a quick version"

Drafting before the brief is approved produces work that misses the audience, misuses sources, or buries the takeaway — and the user has to redo it. Every writing task goes through brief-first, no exceptions. The brief can be short for simple posts, but it MUST exist and be approved before any prose appears.

## Checklist

You MUST create a task for each of these items and complete them in order:

1. **Identify format** — report / article / news / blog / other
2. **Clarify intent** — audience, purpose, key takeaway, tone (one question at a time)
3. **Collect source materials** — Javis transcripts via `mcp__claude_ai_javis_mcp__*` tools + user-provided files (see `source-collection.md`)
4. **Extract relevant facts** — quotes, data, scenes, captions per source
5. **Propose 2–3 angles** — with supporting materials + tradeoffs + a recommendation
6. **Build outline** — sized to the format; each section lists which materials feed it
7. **Save brief** — write to `briefs/YYYY-MM-DD-<slug>-brief.md` in the user's current working directory; state the path before writing
8. **Get user approval** — ask the user to review the brief; revise if requested; only then is the skill done

## Process Flow

```dot
digraph content_brainstorming {
    "Identify format" [shape=box];
    "Format chosen?" [shape=diamond];
    "Load format guide" [shape=box];
    "Ask intent questions\n(one at a time)" [shape=box];
    "Intent clear?" [shape=diamond];
    "Collect sources\n(javis_mcp + user files)" [shape=box];
    "Catalog materials inventory" [shape=box];
    "Extract quotes / data / scenes" [shape=box];
    "Propose 2-3 angles" [shape=box];
    "User picks angle" [shape=diamond];
    "Build outline\n(sized to format)" [shape=box];
    "Save brief to disk" [shape=box];
    "User approves brief?" [shape=diamond];
    "Skill complete\n(hand off to drafting)" [shape=doublecircle];

    "Identify format" -> "Format chosen?";
    "Format chosen?" -> "Identify format" [label="no"];
    "Format chosen?" -> "Load format guide" [label="yes"];
    "Load format guide" -> "Ask intent questions\n(one at a time)";
    "Ask intent questions\n(one at a time)" -> "Intent clear?";
    "Intent clear?" -> "Ask intent questions\n(one at a time)" [label="no"];
    "Intent clear?" -> "Collect sources\n(javis_mcp + user files)" [label="yes"];
    "Collect sources\n(javis_mcp + user files)" -> "Catalog materials inventory";
    "Catalog materials inventory" -> "Extract quotes / data / scenes";
    "Extract quotes / data / scenes" -> "Propose 2-3 angles";
    "Propose 2-3 angles" -> "User picks angle";
    "User picks angle" -> "Propose 2-3 angles" [label="none fit, revise"];
    "User picks angle" -> "Build outline\n(sized to format)" [label="picked"];
    "Build outline\n(sized to format)" -> "Save brief to disk";
    "Save brief to disk" -> "User approves brief?";
    "User approves brief?" -> "Save brief to disk" [label="revise"];
    "User approves brief?" -> "Skill complete\n(hand off to drafting)" [label="approved"];
}
```

**The terminal state is a saved, approved brief.** The skill does NOT draft prose. The next step (a drafting skill or direct user prompt) consumes the brief.

## Brief File Structure

Save to `briefs/YYYY-MM-DD-<slug>-brief.md` in the user's current working directory. Create `briefs/` if absent. State the full path before writing.

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

## Key Principles

- **One question at a time.** Don't stack questions in a single message.
- **Multiple choice preferred.** Easier to answer than open-ended.
- **The brief is the output.** Do not draft prose. Do not write headlines or ledes "to make it concrete."
- **Inventory before angle.** You can't pick a framing without knowing what materials support it.
- **Privacy.** Confirm before pulling any Javis transcript the user did not explicitly name. See `source-collection.md`.
- **Materials feed sections.** Every outline section names which sources support it. If a section has no material, either find one or cut the section.
- **YAGNI on scope.** If the user wants a 400-word blog post, don't propose a 6-section feature article.

## Loading Detail

- Per-format question banks and outline shapes → `format-guides.md`
- How to pull from `javis_mcp` tools and intake user files → `source-collection.md`

Load these only when you reach the relevant step — keep this SKILL.md short.
