# Tunebook Page Extraction Guide

Instructions for an AI processing a batch of scanned or photographed pages from a shape-note tunebook — realistically 1–5 pages at a time, drawn from anywhere in the book: cover, title page, preface, indexes, the "Elementary Department" or rudiments section, individual tune pages, advertisements, blank pages. There is no guarantee of what a given batch contains or what order it arrives in. Two schemas: **book-level** (collected once per tunebook, usually from a title page or front matter) and **page-level** (collected per song, from an individual tune page).

Work from what's actually printed on the page. If a field isn't present, leave it blank — do not infer, guess, or carry a value over from a different song on the assumption it's "probably the same." A blank field is honest; a wrong guess is not.

Output goes into a running CSV that grows across every batch in the conversation, and a page with genuinely uncertain information gets a question asked about it rather than a guess — see Part 3 for exactly how this should work across a whole conversation, not just one batch.

**Most pages in a real batch will not be tune pages, and that's expected — not a failure to find something.** A title page, a preface, an index, or an advertisement legitimately has no song to extract. But every page should still be reviewed rather than skipped past, since a page with no *song* data can still carry real book-level facts (a compiler's name on a title page, a meter-abbreviation key in the rudiments section) or something worth flagging even without an obvious field to put it in (a historical note in a preface, a name in a dedication). **Report explicitly when a page has nothing extractable**, rather than silently omitting it from the output — "reviewed, nothing to extract" and "not yet looked at" need to be distinguishable to whoever reads the batch results afterward.

---

## Part 0: What kind of page is this?

Before extracting anything, classify each page in the batch. This determines which schema (if either) applies.

| Page type | What to do with it |
|---|---|
| **Cover / title page / half-title** | Extract book-level fields — `fullTitle`, `compiler`, `publisher`, `placePublished`, `publicationYear` (see Part 1) |
| **Preface, dedication, or historical introduction** | No song data, but often carries real history about the book as a whole. There's no dedicated book-level field for this yet — flag anything substantive to a human reviewer rather than dropping it, rather than inventing a new field unprompted |
| **"Elementary Department" / Rudiments / glossary of terms** | Confirms this book's own meter-abbreviation conventions (`meterAbbreviationKey` at book level) — worth cross-checking against the abbreviations actually seen on tune pages in the same book, in case this particular book's conventions differ slightly from the norm |
| **Index (alphabetical title, first line, or meter index)** | No new song data on its own, but should actively be used to **cross-check** titles and page numbers already transcribed from tune pages elsewhere in the batch or book. **On a disagreement, the tune page's own heading wins automatically** — it's the primary printing of that song; the index is a derived compilation someone assembled *from* pages like it, and is the more likely place for a transcription slip (a typo, a page renumbered in a later printing that the index wasn't updated for). This is a **report**, not an **ask** (see Part 3) — mention the disagreement in the reply so it's visible, but don't hold up the batch waiting for an answer |
| **Advertisement, publisher's note, blank page, decorative separator** | Normally nothing to extract. Note it as reviewed with nothing found — don't just omit it from the batch output |
| **An individual tune/song page** | The page-level schema in Part 2 applies |

A single batch of 1–5 pages may mix several of these types at once, and a tune can legitimately span a page break within the batch (see `isContinuation` in Part 2) — don't assume page N and page N+1 in the same batch are unrelated just because they were delivered together.

---

## Part 1: Book-level fields

These usually come from a title page, copyright page, or front matter — not from an individual song page — but a song page can sometimes confirm details (a footer credit line, a "copyright" notice, a compiler's initials matching a known name).

| Field | What it is | Where to look |
|---|---|---|
| `fullTitle` | The complete published title, exactly as printed, including subtitles and edition language (e.g. *"Original Sacred Harp" (1971)*, quotation marks and parenthetical year included if that's how the book itself presents its name) | Title page, spine, cover |
| `commonName` | A short, practical display name a singer would actually say out loud (e.g. "Sacred Harp '91", "Cooper '12") | Not usually printed — inferred from common usage; ask a human if unsure |
| `compiler` | Who compiled/edited the book — a person or a committee | Title page ("Compiled and Edited by…"), preface |
| `publisher` | The publishing body, if named separately from the compiler | Title page, copyright page |
| `placePublished` | City/state of publication | Title page, copyright page |
| `publicationYear` | The year this specific edition/printing was published | Title page, copyright page — distinguish this from a *composer's* year on an individual song, which belongs at the page level, not here |
| `meterAbbreviationKey` | Whether this book's own front matter defines its meter abbreviations (L.M., C.M., S.M., H.M., P.M., 7s, 8&7s, etc.) — most shape-note books do, in an "Elementary Department" or "Rudiments" section | Front matter, usually titled something like "Explanation of Musical Terms" or "Elementary Department" |

---

## Part 2: Page-level fields (per song)

### Identity

| Field | What it is | How to recognize it |
|---|---|---|
| `page` | The page number as printed | Usually top corner. **Watch for split pages**: if two unrelated songs share one page number with no letter suffix, that's a split page. **Use the canonical suffix, never a free-text description** — `t` for the top/first song, `b` for the bottom/second, matching how the actual system already represents a split (`45t`, `45b`). Do not write out a description like "upper half" or "lower-right" as the page key itself; that isn't a usable, parseable value. **The reverse mistake matters just as much**: don't apply a `t`/`b` suffix, or carry forward a source description like "(lower half)", when a song is actually the *only* one on its page — a real extraction produced exactly this error on 25 separate pages, each with a position noted despite there being nothing else on the page to distinguish it from. A suffix only belongs on a page that genuinely has two (or more) different songs sharing that page number; a single song gets the bare page number regardless of what the source material happens to say about where on the page it sits. **If a page has more than two divisions** (three or four tunes squeezed onto one page — an actual, if less common, layout), use numbered suffixes instead: `.1`, `.2`, `.3`, `.4` in the order they appear on the page, top-to-bottom and left-to-right. This is a different situation from the ordinary two-way top/bottom split, and shouldn't be forced into `t`/`b` when there are genuinely more than two. |
| `title` | The tune name as printed, in the title's own capitalization/formatting logic (all-caps title headers are normalized to standard title case, not transcribed as shouting) | Large text at the top of the piece, above the staff |
| `isContinuation` | Not actually a field that produces its own row — a signal to recognize and then produce *no row at all* | Look for **"Concluded"** printed next to a title, which is the explicit version of this. But also recognize it **structurally, without a label**: if a song starts on the lower half of one page, its ending naturally spilling onto the top of the next page is not a new song — it's the tail of the one already underway. **The governing rule: a page reference is only ever recorded for where a song *starts*.** A continuation fragment, labeled or not, never gets a row of its own, and doesn't count as "another thing on the page" when working out whether a page has 2, 3, or 4 real divisions (see `page` above) — it's not one of the divisions being counted at all. |

### Musical facts

| Field | What it is | How to recognize it — and the trap to avoid |
|---|---|---|
| `meter` | The **poetic/metrical** structure of the text — NOT the musical time signature. Printed as a letter abbreviation (C.M., L.M., S.M., H.M., P.M.) or as syllable-count notation (e.g. "11, 8" or "8,7,8,7") | Printed right next to the title, e.g. *"CHRISTIAN SOLDIER. C.M."* or *"NEW SALEM. 11, 8."* |
| `timeSignature` | The actual musical time signature (4/4, 2/4, 6/8, 6/4, etc.) | Read directly off the staff at the start of the music, not from the title line |
| `key` | The musical key, as stated | Usually printed just under the title, e.g. *"Key of A Minor"*, *"F Major"*, *"Key of Ab"* — sometimes combined with a name/date on the same line (see `textAttribution` below); separate the key out from the name |

**Do not confuse meter with time signature.** "C.M." tells you the *poem* has 8-6-8-6 syllables per verse; it says nothing about whether the tune is in 4/4 or 3/4. They are unrelated pieces of information that happen to sit near each other on the page.

### Text and origin

| Field | What it is | How to recognize it |
|---|---|---|
| `firstLine` | The opening line of the lyrics, exactly as printed (useful for cross-checking a title against later reprints where the title itself changed) | First line of sung text under the melody staff |
| `scriptureReference` | A Bible citation printed under the title, in quotation marks with a book/chapter/verse | e.g. *"Watch ye, stand fast in the faith, quit you like men, be strong."—1 Cor. 16:13* |
| `textAttribution` | `{ credit, year }` — the author of the **words**, when stated separately from the tune's composer | e.g. *"Isaac Watts, 1709"*, *"Rev. Richard Burnham, 1783"* — often on the left side of the credit line, opposite the tune composer on the right |
| `musicAttribution` | `{ credit, year, location }` — the composer/arranger of the **tune**, when stated | e.g. *"H. Webster Woods, June 1932"*, *"F. Price, 1882"*, sometimes with a place: *"H. Webster Wood, Dothan, Ala. June 5, 1927"* |
| `harmonizationAttribution` | `{ credit, year }` — whoever wrote the *other voice parts* (alto/bass/treble), when this is a **different person** than the tune's original composer — common in later reprints of older tunes | e.g. *"Bass, alto, treble by J.J."*, *"Alto by S. M. Denson, 1911"* — this is a real, distinct credit from `musicAttribution`; don't merge them into one field or overwrite one with the other |
| `source` | `{ citedAbbr, page }` — the earlier tunebook this tune was drawn or adapted from, if the tune isn't original to this book. **This can be the primary citation for the entire song, not just an incidental note inside someone else's credit line.** A tune's whole origin might simply *be* "from Kentucky Harmonist, 1818" — full stop, with no separate composer named at all — rather than always showing up as a secondary aside tucked inside a `musicAttribution` or `harmonizationAttribution`. Don't assume it needs a prose sentence to hang off of; check for it as its own fact first | e.g. *"Kentucky Harmonist, 1818"* standing alone as the whole tune's origin; or, in a more layered case, *"Kentucky Harmonist, 1818 (alto by Ananias Davisson, 1820)"* — here the source is still the primary fact, and the alto credit nested inside it is a separate `harmonizationAttribution` on top of it, not the other way around |

**These three attribution fields are commonly conflated — keep them apart.** A single tune can legitimately have a text author from 1709, a tune composer from 1882, *and* a harmonizer from 1911, all three different people. Collapsing them into one "composer" field loses real information a compiler may specifically want preserved.

### Supplementary

| Field | What it is | How to recognize it |
|---|---|---|
| `verseCount` | How many verses are printed | Count the numbered verses under the music |
| `historicalNote` | A paragraph of prose about the song's or composer's history, often at the bottom of the page | Distinguishable from lyrics by its prose (non-metrical) format and placement below the last verse |
| `copyrightNotice` | An explicit copyright line, if present | e.g. *"Copyright, 1909, by J. S. James."* — flag this clearly; it may carry real rights implications for reproduction |
| `catalogCode` | A short reference code printed in a page corner, if present. **In at least one real book (VPH), this is not a mystery code — it's the compiler's own compact shorthand for the tune's source**, functioning as an abbreviated version of the same `source` citation given elsewhere on the page (e.g. *"SKH 10"* pairs with a credit reading *"Kentucky Harmonist, 1818…"* — the corner code is citing the same source book, just abbreviated). Check whether a corner code and a source citation on the same page — prose or standalone — are describing the same thing before treating them as two separate facts; if they match, they reinforce one `source` entry rather than requiring a second field. Only fall back to capturing it as an uninterpreted `catalogCode` on its own if no other citation is present to confirm what it refers to. **Watch for printer's plate numbers being mistaken for this field** — a real error caught in an actual extraction, not a hypothetical: a small number at the bottom of a page (something like "36424") that recurs *identically* across nearly every page in the book is a printing-industry artifact (a plate or press number for that print run), not a per-song catalog reference. The tell is that it doesn't vary — a genuine `catalogCode` is specific to that one song; a number that's the same on page after page is describing the printing, not the tune. |
| `structuralMarkings` | Performance directions like D.C. (Da Capo), Fine, repeat signs | Usually near the end of a musical phrase; relevant to performance, not identity — capture only if the registry has a place for it, otherwise it's fine to skip |

---

## Part 3: Output format and multi-batch workflow

A real book comes in many small batches over the course of a conversation, not all at once. This section governs how to produce output across that whole conversation, not just for one batch in isolation.

### Output CSV, not prose

Findings from tune pages go into a CSV with one row per song — not a narrative description. This matches how the rest of this project already works: a flat, row-per-song CSV is exactly what `build_shh_index.py` and `build_vph_index.py` already convert into an edition-index JSON file, so producing this shape means the output can go straight into that same pipeline.

**Column order:**

```
page,title,isContinuation,meter,timeSignature,key,firstLine,textAttributionCredit,textAttributionYear,musicAttributionCredit,musicAttributionYear,harmonizationAttributionCredit,harmonizationAttributionYear,sourceCitedAbbr,sourcePage,scriptureReference,verseCount,historicalNote,copyrightNotice,catalogCode
```

Leave a cell blank when that field isn't present on the page — a mostly-blank row is normal and expected, not a sign of incomplete work. `textAttribution`/`musicAttribution`/`harmonizationAttribution`/`source` are flattened into separate credit/year (or abbreviation/page) columns here since CSV can't hold nested objects directly; they get reassembled into their nested shape later by whatever script builds the edition-index JSON from this CSV.

### Book-level facts go in a separate block, once

Compiler, publisher, place published, publication year, full title, and any other book-level fact (Part 1) are constant across the whole book — they don't belong copied onto every row. Report these once, as a short labeled list, the first time any of them is found (usually from an early batch containing the title page), and only mention them again later if something is being corrected or newly confirmed.

### Batches accumulate — this is one growing document, not several independent ones

Each batch adds rows to the same running CSV; it does not restart it. After processing a batch, show the complete CSV built so far (or, for a very large book, clearly show what's new this batch and confirm the running total), so the person can see the whole document taking shape rather than having to stitch fragments together themselves. Keep going, batch after batch, until told explicitly that the book is finished — a phrase like "that's everything" or "we're done" — at which point deliver the complete, final CSV for the whole book as the actual output of the conversation, not just another incremental update.

### Ask, don't guess, and don't silently defer

When a page has a genuinely ambiguous or unreadable field — the split-page top/bottom problem, illegible attribution text, a meter abbreviation this book doesn't define anywhere, anything covered in "When something is genuinely ambiguous" below — **stop and ask a specific question about it before moving on**, rather than filling the cell with a guess or quietly leaving it blank and continuing to the next page. A blank cell should mean "this book doesn't print that information," not "the AI wasn't sure and didn't want to ask." If several pages in the same batch raise questions, it's fine to batch the questions together in one reply rather than asking one at a time — but don't proceed to finalize those rows until they're actually answered.

### Reporting and asking are two different behaviors — don't conflate them

**Asking** is for genuine ambiguity with no reliable default — a specific question, and the row waits until it's actually answered before being finalized. This is what the paragraph above requires, and it stays required; nothing else in this document loosens it.

**Reporting** is different: it's for something that has a clear, defensible resolution already (like an index disagreeing with a tune page — Part 0 — which resolves in the page's favor automatically) but is still worth the person knowing about. This doesn't block anything or need an answer before continuing — it just needs to actually show up. A plain mention in the normal reply alongside the batch's results is enough ("page 52's index entry said 'Charleston,' but the tune page itself reads 'Charlston' — went with what's on the page") — it should not be silently absorbed into the CSV with no trace that anything was ever inconsistent.

---

## Practical extraction order

0. Go through the whole batch first and classify each page per Part 0 — title page, front matter, index, tune page, or nothing-to-extract. Handle title/front-matter/index pages per Part 0's guidance before doing anything below, which applies only to actual tune pages.
1. For each tune page: identify the title and page number first, and check immediately whether this page (or the top portion of it) is a **continuation** of an earlier tune — either explicitly labeled ("Concluded") or structurally obvious (a tune that started on the lower half of the previous page, its ending spilling onto this page's top before something else begins). If so, that portion isn't a new entry and gets no row of its own — move on to whatever genuinely new song is on the rest of this page, if any. If the song this continues began in an earlier batch rather than this one, there's nothing to reconcile right now; it was already given its one row when it started.
2. If the page number is shared with another, unrelated song on the same page, this is a **split page** — record both songs and note their top/bottom position rather than picking one.
3. Read the meter abbreviation next to the title (poetic meter) and separately read the time signature off the staff (musical meter) — these are two different facts, not one.
4. Read the key.
5. Read the scripture reference, if present.
6. Read the credit line(s) under the scripture reference — carefully separate text author, tune composer, and harmonizer if more than one name appears; note the source tunebook if the tune is credited as borrowed, whether that source citation stands on its own or is nested inside another credit.
7. Read the first line of lyrics and count verses.
8. Check the bottom of the page for a historical note or copyright line.
9. Note any small corner catalog code — check whether it's actually shorthand for the same source tunebook cited elsewhere on the page (as with VPH's own convention) before treating it as a separate, uninterpreted fact.
10. Once every page in the batch has been classified and handled, confirm each one has either extracted data or an explicit "nothing to extract" note — nothing should be left silently unaccounted for.

## When something is genuinely ambiguous

If two songs share a page number and there's no way to tell from the page itself which is top and which is bottom (for instance, no visual layout cues survived a low-quality scan), **ask which is which rather than guessing or leaving it unresolved** — a wrong top/bottom assignment creates bad lookup data that silently misleads anyone using the tune's page number later, and this is exactly the kind of thing Part 3's "ask, don't guess" rule exists for. The same applies to illegible attribution text: report what's legible, ask about the rest, and don't fill the row in until there's an actual answer.

Note that an index disagreeing with a tune page (Part 0) isn't this kind of case — that one has a clear default (the page wins) and only needs a report, not a question, per the report-vs-ask distinction in Part 3. The distinction is whether there's an actual reliable answer available on the page itself: split pages and illegible text genuinely have none, which is why those get a question instead of a default.
