# Format Guides

Reference for **brief and outline shapes** — the structural skeletons the adaptive skill consults when it builds the outline (Phase 5) and writes the brief (Phase 6).

This file is not a question bank. It does **not** script what to ask or in what order — the adaptive Q&A (Phase 3) emerges from what the sources revealed. Consult a section here only to shape the *output*: which sections an outline should carry for a given format, which materials tend to feed each one, and — for CLARIFY — the clarification-brief template.

Load the section matching the piece the user is writing. If the intent is **CLARIFY** (clarifying a concept for themselves) rather than WRITE, skip the format sections and use the **Concept clarification** section at the bottom.

Each format section specifies:

1. The **outline shape** for Phase 5 — the sections a piece of this kind usually needs. Cut any section no material supports.
2. **Sources that matter most** for the format — where to concentrate source collection.

---

## Report

Used for: internal/external reports, analyses, decision memos, post-mortems.

### Outline shape

| # | Section | Purpose |
|---|---|---|
| 1 | Executive summary | The whole report in 5–10 lines, including the recommendation |
| 2 | Context / background | What situation prompted this report; prior state |
| 3 | Findings | What the data / interviews / observations show — neutrally |
| 4 | Analysis | What the findings mean, with reasoning shown |
| 5 | Recommendations | Specific actions tied to findings |
| 6 | Appendix | Supporting data, methodology, raw transcripts |

### Sources matter most
- Numeric data (metrics, KPIs, financials)
- Stakeholder transcripts / interviews
- Prior reports in the same series (for consistency)
- Documents, decisions, or policies being analyzed

---

## Article (long-form / blog)

Used for: long-form essays, opinion pieces, magazine-style features, in-depth blog posts.

### Outline shape

| # | Section | Purpose |
|---|---|---|
| 1 | Hook | A scene, anecdote, or pointed claim that earns 30 more seconds |
| 2 | Thesis | The argument, stated plainly |
| 3 | Evidence arc (3–5 beats) | Each beat advances the case: example, data, story, expert voice |
| 4 | Counterpoint | The strongest version of the opposing view, taken seriously |
| 5 | Resolution | How you reconcile the counterpoint without dismissing it |
| 6 | Call to reflect / act | What changes for the reader after reading this |

### Sources matter most
- Personal anecdotes and observations
- On-record quotes from interviewees
- Research papers, books, and cited claims
- Statistics that ground specific beats

---

## News

Used for: news pieces, breaking-news reports, dispatches, time-sensitive announcements.

### Outline shape

| # | Section | Purpose |
|---|---|---|
| 1 | Lede | The most important sentence; the news in one line |
| 2 | Nut graf | Why this matters, who it affects, what's at stake |
| 3 | Background | Brief context — how we got here |
| 4 | Key facts | Dates, numbers, named parties, on-record statements |
| 5 | Reactions / quotes | What affected parties, experts, opponents say |
| 6 | What's next | Pending decisions, expected next events, deadlines |

### Sources matter most
- Primary sources (official documents, press releases, named witnesses)
- Dated events with verifiable timestamps
- On-record quotes (named source preferred over anonymous)
- Opposing views (essential for credibility)

---

## Blog (informal / opinion / journal)

Used for: short blog posts, personal takes, dev journals, opinion shots, tutorials.

### Outline shape

| # | Section | Purpose |
|---|---|---|
| 1 | Hook | One sentence or short scene — the spark |
| 2 | One idea | State it plainly |
| 3 | Why it matters | Why the reader should care, in one beat |
| 4 | One example | A single concrete example, story, or code block — not three |
| 5 | Close | The takeaway in one line; optionally a question or a small ask |

### Sources matter most
- Personal stories from the user's own week / project
- One anchoring example (concrete is better than abstract)
- Optional outbound links for context (do not list-link-dump)

---

## Other

The piece doesn't match the four formats above (essay collection, newsletter, video script, talk outline, internal memo, social thread, etc.).

Pick the closest of report / article / news / blog and start from its outline shape, adapting section names to fit. If none fit, ask the user for the structural beats they want and use those as the outline shape. The brief structure in `SKILL.md` is unchanged either way.

---

## Concept clarification (CLARIFY branch)

Used for: clarifying a concept **for yourself** — pinning down a definition, deciding a real priority order, resolving a drifting or contested idea before you can act on it. Used when the intent is **CLARIFY**, not WRITE.

The adaptive Q&A surfaces the working definition, the tension or ambiguity, the goal, and the success signal — in whatever order the sources make natural. This section provides the **shape** those answers land in: the clarification-brief template below.

### Brief shape (Phase 5 → Phase 6 output)

The CLARIFY branch produces `briefs/YYYY-MM-DD-<slug>-clarification.md`, **local only — it never writes to the Javis wiki.**

```markdown
# <Concept> — Clarification

**Type:** clarification
**Date:** YYYY-MM-DD
**Goal:** <what the user wants out of clarifying this>
**Success signal:** <how the user will know it's clarified>
**Status:** reviewed — ready

## Working definition
<one-paragraph sharpened definition>

## Why it matters
<why this concept is worth clarifying / where it's used>

## What it is NOT
<explicit boundaries — common misreadings ruled out>

## Sharpened framing
<the decided framing / priority order, per the goal>

## Materials inventory
### Javis wiki
- page: <slug> — <one-line description>
### Linked sources (read one by one)
- <source slug/id> — <one-line summary> — <relevant excerpt/quote>

## Open questions
- <anything still undecided>
```

### Sources matter most
- The Javis **wiki page** for the concept (primary — resolved and read via the wiki → resources loop in `source-collection.md`)
- The wiki page's **linked sources**, read one at a time with a per-source summary line
- The user's own prior notes or files naming the concept
- Transcripts where the concept was discussed (only with the privacy gate — confirm before pulling any transcript the user did not name)
