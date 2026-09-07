# Tunebook Library Changelog

Tracks what's included in the suite's tunebook data and when it was added. This file is documentation only — updating the data itself means editing `tunebook-library.js` (directly, or through Tunebooks' own Library tab). This changelog exists so anyone (including future us) can tell what's in a given copy of that file without diffing it by hand.

`tunebook-library.js` is a separate, bundled file — not fetched, not auto-updated, not version-checked by the app. Whatever copy is sitting next to `minutes.html` is simply what's used. Replacing it with a newer version (more books, corrected pages) is a manual, deliberate act — nothing here happens automatically.

Each tunebook entry carries four identifiers, since these vary independently and any of them might be what someone's looking for:
- **Full title** — the book's complete published name
- **Common name** — a short, familiar way of referring to it
- **SingLoud Work Code** — SingLoud.org's short code for the book, where a confident one exists
- **SHMHA Code** — the Sacred Harp Musical Heritage Association's *Minutes Book* abbreviation, where a confirmed one exists

Song entries currently carry a page number (with `t`/`b` suffix when the book splits that page between two songs) and the title as printed. The format is intentionally left open to carry more per-song data later — composer, meter, first line, etc. — without another breaking change.

---

## Index v1.0.0 — initial release

All seven books Minutes originally shipped with, migrated into the external file format from what was previously embedded directly in `capture.html`.

| Code | Full Title | Common Name | SingLoud | SHMHA | Songs |
|---|---|---|---|---|---|
| `ShH2012` | The Shenandoah Harmony | Shenandoah Harmony | ShH | ShH | 469 |
| `VPH2024` | The Valley Pocket Harmonist | Valley Pocket | VPH | *(none confirmed)* | 386 |
| `SHM2025` | The Sacred Harp: 2025 Edition | Sacred Harp '25 | SHM | *(none confirmed)* | 590 |
| `SHM1991` | The Sacred Harp: 1991 Edition | Sacred Harp '91 | SHM | *(none confirmed)* | 554 |
| `SHC2012` | The B. F. White Sacred Harp (Cooper Book) | Cooper '12 | SHC | CB | 613 |
| `CHM2010` | The Christian Harmony | Christian Harmony | *(intentionally none — see note)* | *(none confirmed)* | 672 |
| `ACH2009` | American Christmas Harp | Christmas Harp | ACH | ACH | 96 |

**Note on `CHM2010`:** SingLoud's own master key currently only has a code (`CHI`) for Ingalls' 1805 *Christian Harmony* — a different book from the Walker-tradition *Christian Harmony* this index ships. Auto-assigning `CHI` here would be a genuine tunebook misattribution, not a convenience, so it's deliberately left blank. If SingLoud adds a distinct code for the Walker-tradition book, update this entry.

**Note on `SHM2025`/`SHM1991`/`VPH2024` SHMHA codes:** no confirmed SHMHA *Minutes Book* abbreviation for these has been verified yet. Compile will prompt for these on the Song List tab rather than guess.

---

## Index v1.1.0

**Added:** `GeH2012` — The Georgian Harmony (Second Edition, 2012). Work Code `GeH`, SHMHA code `GH`. 177 songs, digitized from a compiler-supplied source list. SingLoud's own book page lists this title simply as "GeH · 2010" without an edition-year suffix in the code — the `2012` in our Edition Code identifies the specific edition this index was built from (the Second Edition), matching how Minutes already suffixes other books by edition year (e.g. `ShH2012`, `SHC2012`). If a different edition's index is ever added, it should get its own distinct code rather than overwrite this one.

**Known gap in `GeH2012`:** page 24 doesn't resolve to any title. It appeared in a real historical minutes transcription (the Western Massachusetts Convention, 1999 sample), logged there as an honest "Other" entry with a note rather than a guessed title.

**Corrected in `ACH2009`:** pages 46 ("Sherburne," a two-page setting continuing to page 47) and 48 ("Shiloh") were missing from the original digitization — likely lost to a formatting quirk that wasn't caught at the time — and were briefly transcribed as "Other" entries in the Christmas Harp Singing (2018) sample before the correct titles were confirmed and added here. Page 47 has no separate entry by design: it's the continuation of page 46's setting, not a distinct song.

**Note — possible version mismatch worth checking:** SingLoud's book page lists The Shenandoah Harmony as `ShH2013`, but this index (and the rest of the suite) uses `ShH2012`. Not changed here since it's unclear whether this is a real edition difference or a typo on one side — worth confirming against the actual book before touching the existing index or its 469 songs.

---

## Index v1.4.0

**Moved, not added:** two hardcoded Sacred Harp special cases in `compile.html` (string comparisons against `"SHM1991"`/`"SHM2025"`) — preferring the Sacred Harp as a singing's default book even when another book was used more, and never giving it its own SHMHA code — are downstream of one underlying fact about a book, not two independent ones, so they're now driven by a single `isSacredHarpDefault: true` flag on `SHM2025` and `SHM1991` instead. Also consolidated the SingLoud→SHMHA code table: five entries there duplicated what these two books' (and `ACH2009`/`SHC2012`/`GeH2012`/`NbH2003`'s) own `shmhaCode` field already said, a second source of the same fact that had to be kept in sync by hand. The lookup now checks indexed books first and only falls back to the (now smaller) hardcoded table for books not yet indexed.

---

## Index v1.3.0

**Moved, not added:** book badge colors (`badgeColor` / `badgeTextColor`) — previously seven hardcoded CSS classes in `capture.html`, one per book, growing by one every time a book was added. Migrated the exact existing colors for all seven (no visual change for any of them) and made Capture apply them dynamically from this file instead. This also surfaced a real, silent gap: `GeH2012` and `NbH2003` had no color rule at all when they were added, so their badges were rendering unstyled with no background or text color set. Both now fall back to the same neutral gray Capture already used for an "Other" source, rather than nothing — a real cover color for each can be added here whenever it's known.

---

## Index v1.2.0

**Added:** `NbH2003` — The Norumbega Harmony. Work Code `NbH`, SHMHA code `NbH` (both already anticipated in the "Forthcoming" table below and in `compile.html`'s `WORKCODE_TO_SHMHA` map before this addition — no code changes needed there). 136 songs, digitized from a compiler-supplied source list (page, title pairs; gold-on-black lettering per the compiler's own note, unrelated to the data itself). No split top/bottom pages in this book — every song has its own page. The `2003` in the Edition Code marks the edition this index was built from, matching how other books are suffixed by edition year; if a different edition's index is ever added, it should get its own distinct code rather than overwrite this one.

**Added:** `CSH1934` — The Colored Sacred Harp, compiled by J. Jackson (Ozark, Alabama, 1934). Work Code `CSH`, SHMHA code `CSH`. 77 songs. This one arrived already digitized against the extraction guide's full rich schema (meter, time signature, attributions, verse counts, etc.) rather than a bare page/title list, and a matching edition index (`edition-indexes/CSH1934.json`) was added alongside the base entry. Two things needed correcting before either could be used: (1) the source data's page-position notation ("upper-right", "lower half", etc.) was normalized to `t`/`b` — but only for the 8 pages that genuinely have two different songs sharing a page; 25 other rows carried a position descriptor despite being the *only* song on that page, and correctly resolved to a bare page number rather than a stray, unnecessary suffix; (2) a "36424" value appearing in nearly every row's `catalogCode` field was discarded as an erroneous printer's plate number picked up during extraction, not a real per-song catalog reference — the same plate number recurring identically across almost every page is a strong signal it's a printing artifact, not tunebook-specific metadata (see the extraction guide's own updated caution about this exact pattern). `meter`, `key`, `sourceCitedAbbr`/`sourcePage`, and `copyrightNotice` are all blank across every one of the 77 songs, confirmed directly rather than assumed — this book genuinely doesn't carry any of these, unlike the Denson-lineage books this suite otherwise indexes. What looked like a uniform-zero pattern worth double-checking (the same shape the erroneous "36424" catalog code had, before it turned out to be a printing artifact) turned out this time to be a real, confirmed fact about the book itself rather than a gap in extraction.

**Added:** `NSH1884` — The New Sacred Harp: A Collection of Hymn-Tunes, Anthems, and Popular Songs, for the Choir, Class, Convention and Home Circle. Compiled by B. F. White and J. L. White, published by J. L. White (Atlanta, Georgia, 1884). Work Code `NSH`, SHMHA uncoded. 208 songs, the first seven-shape book in this suite — added the `shapeSystem` field to the schema specifically for this ("4-shape" or "7-shape"), plus a small black-circle quick-identify badge shown alongside the color pill in Browse and Edit Book. Assembled from many small batches of real page images over an extended session, cross-checked at the end against the book's own printed alphabetical index — which caught a real, serious problem before anything shipped: 43 pages had two different songs sharing one bare page key with no `t`/`b` split, inherited from the very first batch of this book's data. Building the edition index the ordinary way silently dropped the second song at every one of those 43 pages (208 rows in, 165 songs out) — caught by checking the output count against the input count rather than assuming they'd match, and none of it was published until the actual splits were confirmed against the real pages one by one. Also caught and fixed while resolving this: a defaced index entry ("We Must Say") had been misread as page 15 when it's actually page 115 — still an open gap, not yet resolved — and an initial attempt to key "Absent Friends" as "15b" was itself a mistake, caught and corrected: the top half of page 15 is only an unlabeled continuation of "Fairy Moonlight" from page 14, not a second real song, so "Absent Friends" is the only genuine song on that page and correctly gets the bare page number `15`, matching the same rule this suite already applies elsewhere (a continuation fragment never counts as one of a page's divisions). A spelling slip in the source data ("New Brittian") was also corrected to "New Britain" at page 57b, matching the book's own printed index — applied to the actual data at the time but never previously written down here; recorded now so the fix has an actual paper trail instead of just having happened. A later, more careful pass through the book's own index caught two further open spelling questions the same way "New Brittain" first surfaced, both now confirmed directly against the actual pages: "Braidy" (page 58) was recorded as "Braidi" and has been corrected to match what's actually printed; "Warwick" (page 50b) needed no change at all — the data already matched the page, and it was the index's own "Warnick" that was off, not this dataset. Separately, "Zuar" (page 70t) was briefly and wrongly flagged as a missing song — it was never actually missing, only mis-transcribed as belonging to page 79 during the original index read-through; confirmed directly against the page that it was correctly in place at 70t the whole time, and the false alarm was corrected rather than left standing. Badge set to dark brown on medium tan, matching the request rather than the earlier placeholder colors chosen without input. Full Title split into `fullTitle` ("The New Sacred Harp") and a new `subtitle` field (the "A Collection of Hymn-Tunes..." phrase), the first book in this suite to actually use the new field. The Shape System input changed from free text to a set of three radio buttons (Four-shape / Seven-shape / Unknown) and repositioned to sit after the badge section rather than before it; the quick-identify mark itself changed from a CSS-drawn circle to the actual Unicode dingbat circled-digit characters (❹ / ❼), simpler to maintain than an equivalent shape built from spans and border-radius.

**Added:** `NHC2001`, `HaS2008`, `SHW2007`, `MoH2005` — four books added together from supplied page/title lists (no rich edition-index data with these, page and title only, matching the original scope this file was built for). All four closed out long-standing rows in the "Forthcoming" table below.

- **`NHC2001`** — The New Harp of Columbia, compiled by M. L. Swan and W. H. Swan, University of Tennessee Press (Knoxville, 2001 reprint). Work Code `NHC`, SHMHA code `NHC`. 260 songs, seven-shape.
- **`HaS2008`** — The Harmonia Sacra, compiled by Joseph Funk and Sons, Harmonia Sacra Publishing Company (Goshen, IN, 2008). Work Code `HaS`, SHMHA code `HS` — matching the code already in `compile.html`'s existing SHMHA table, resolving the reconciliation the forthcoming-table note had been flagging as outstanding. 470 songs, seven-shape.
- **`SHW2007`** — The Sacred Harp (Fourth Edition, with Supplement), compiled by B. F. White, J. L. White, and E. J. King, "The J. L. White Sacred Harp" (Loganville, GA, 2007). Work Code `SHW`, SHMHA code `WB`. 602 songs, four-shape — the largest book in this suite so far.
- **`MoH2005`** — The Missouri Harmony, compiled by Wings of Song, Missouri Historical Society Press (2005). Work Code `MoH`, SHMHA code `MH`. 180 songs, four-shape. The `compiler` field ("Wings of Song") was initially held back on suspicion of being a copy-paste error, since it's word-for-word identical to one of the book's own song titles (song 121) — confirmed since to be correct rather than an error: it's the actual name of the singing group who produced this edition, not a mistake. Restored to the data.

All four passed structural validation with no duplicate page keys, no malformed keys, and no empty titles — checked directly before insertion, not assumed clean because they arrived as a complete list rather than built page-by-page. Shape System values arrived as "Four-shape"/"Seven-shape" and were normalized to this suite's actual stored format ("4-shape"/"7-shape") before insertion.

**Corrected in `SHW2007`:** `fullTitle` was bare "The Sacred Harp," identical to `SHM1991` and `SHM2025`'s own titles before those two bake their edition year directly in ("The Sacred Harp: 1991 Edition," etc.) — meaning `SHW2007` was the one book of the three left genuinely ambiguous in any dropdown, which uses `fullTitle` for its display text. Set to "The Sacred Harp (White Book, 2007)," matching the same in-`fullTitle` disambiguation pattern its siblings already use rather than inventing a new one. `commonName` updated to match for consistency, since a checklist elsewhere in Capture reads that field instead of `fullTitle` for the same book.

---

## Index v1.7.1

**Book-level field correction pass.** The book-level field audit that produced `tunebook-book-level-fields.csv` (see the "Book-level field audit" note under Index v1.7.0's working history) came back to Kevin for review; he returned an updated copy of that CSV as the source of truth, and this release brings all 15 books' book-level fields into line with it. 11 of the 15 books had at least one field touched; 4 (`HaS2008`, `MoH2005`, `NHC2001`, `NSH1884`) were already fully in sync. No `songs` data changed in any book — song counts were checked against the CSV's own `songCount` column for all 15 and all matched exactly before anything was written.

What changed, by book:
- **`ACH2009`** — `shapeSystem` added (`4-shape`), previously blank.
- **`CHM2010`** — `subtitle` and `compiler` (`William Walker`) added, previously blank; `workCode` set to `CHM` (previously deliberately blank per the Index v1.0.0 note about the SingLoud `CHI` mismatch — Kevin's updated data supersedes that caution and assigns `CHM` directly).
- **`CSH1934`** — `shapeSystem` added (`4-shape`), previously blank.
- **`GeH2012`** — `subtitle`, `compiler`, `publisher`, `placePublished`, `publicationYear`, `shapeSystem`, `badgeColor`, and `badgeTextColor` all added, previously blank (this book had no badge colors set at all until now — it was one of the two books flagged as unstyled back in Index v1.3.0's badge-color migration and never got real colors until this pass).
- **`NbH2003`** — `subtitle`, `compiler`, `publisher`, `placePublished`, `publicationYear`, `shapeSystem`, `badgeColor`, and `badgeTextColor` all added (same unstyled-badge gap as `GeH2012`, also from Index v1.3.0); `commonName` changed from "Norumbega" to "Norumbega Harmony".
- **`SHC2012`** — `subtitle` ("Revised Cooper Edition"), `compiler`, `publisher`, `placePublished`, `publicationYear`, and `shapeSystem` added; `fullTitle` changed from "The B. F. White Sacred Harp (Cooper Book)" to bare "The Sacred Harp" (edition now carried in `subtitle` instead); `commonName` changed from "Cooper '12" to "Cooper Book '12".
- **`SHM1991`** — `subtitle` ("1991 Edition"), `compiler`, and `shapeSystem` added; `fullTitle` changed from "The Sacred Harp: 1991 Edition" to bare "The Sacred Harp" (edition now carried in `subtitle` instead).
- **`SHM2025`** — same shape of change as `SHM1991`: `subtitle` ("2025 Edition"), `compiler`, and `shapeSystem` added; `fullTitle` changed from "The Sacred Harp: 2025 Edition" to bare "The Sacred Harp". (The supplied CSV had a trailing space on this book's `fullTitle` value — silently trimmed as an obvious data-entry artifact, not a real difference to preserve.)
- **`SHW2007`** — `fullTitle` changed from "The Sacred Harp (White Book, 2007)" to bare "The Sacred Harp" (edition already lived in `subtitle`, which was untouched); `commonName` changed from "The Sacred Harp (White Book, 2007)" to "Sacred Harp (White Book, 2007)" (leading "The" dropped).
- **`ShH2012`** — `subtitle`, `compiler`, `publisher`, `placePublished`, and `publicationYear` added; `shapeSystem` added (`4-shape`, previously blank); `commonName` changed from "Shenandoah" to "Shenandoah Harmony".
- **`VPH2024`** — `subtitle`, `compiler`, `publisher`, `placePublished`, `publicationYear`, and `shapeSystem` added; `commonName` changed from "Valley Pocket" to "Valley Pocket Harmonist".

**Worth flagging, not resolved here:** this release directly reverses the "Corrected in `SHW2007`" fix from Index v1.7.0, which had deliberately baked "(White Book, 2007)" into that book's `fullTitle` specifically because `SHM1991`/`SHM2025`/`SHW2007` otherwise shared an identical bare "The Sacred Harp" `fullTitle` and were indistinguishable in any UI that displays `fullTitle` alone. With this pass, `SHM1991`, `SHM2025`, `SHC2012`, and `SHW2007` now *all four* share the bare `fullTitle` "The Sacred Harp" again, disambiguated only by `subtitle` — and `subtitle` is not currently rendered in every picker that shows `fullTitle`. Confirmed two real UI spots where this now shows up as four indistinguishable entries: Capture's live book-logging dropdown (now embedded in `minutes.html`, `BOOKS` array built from `b.fullTitle`) and Tunebooks' Browse-tab tunebook picker (now `tunebooks.html`, line ~786 at the time this was found \u2014 Browse itself has since been retired in favor of the unified Library tab, so this specific line reference is stale regardless of the rename; worth re-locating if this pending item is ever picked back up). Both are still disambiguated by their underlying edition code internally — nothing is actually broken or mis-attributable — but a person skimming either dropdown by title alone can no longer tell the four books apart at a glance. Left as-is pending Kevin's call on whether to concatenate `subtitle` (or just the edition year) into those two specific display strings, since that's a UI decision beyond what this correction pass was asked to do.

---

## Index v1.7.2

**Corrected in `CHM2010`:** `shapeSystem` was `4-shape`, which is wrong — Walker's *Christian Harmony* tradition is seven-shape. This was an error inherited directly from the `tunebook-book-level-fields.csv` sync in Index v1.7.1 (that CSV's `CHM2010` row read `4-shape`), caught by Kevin reviewing the Tunebook Registry's rendered badges rather than caught during the v1.7.1 sync itself — the CSV was trusted as-is for that field at the time. Corrected to `7-shape` here. Worth a general note for next time a book-level CSV like that one comes back for another round: `shapeSystem` in particular is easy to eyeball-miss in a spreadsheet review since it doesn't visibly clash with anything else in the row, unlike a wrong title or code.

---

## Index v1.7.3

**Corrected in `NHC2001`:** page `a184` was a single combined entry titled "Rounds," standing in for five distinct songs printed together on that page. Split into five individual entries — `a184.1` through `a184.5` — each with its own real title, per Kevin's direct transcription from the book:

| Key | Title |
|---|---|
| `a184.1` | Down Derry (Round, in three parts) |
| `a184.2` | The Church Bell (Round, in three parts) |
| `a184.3` | Morning Bell (Round, in two parts) |
| `a184.4` | Welcome (Round, in two parts) |
| `a184.5` | Sabbath (Round, in three parts) |

The original entry's `musicAttribution` ("Swan," 1848) was carried forward onto all five, since it was recorded once for the whole page and nothing suggests it varies per round — worth a correction if that's wrong for any individual one. `.1`-`.5` suffixes here mean "position on this page," not the suite's separate `.1`/`.2` top-bottom shorthand (which only ever applies to a bare numeric page and tops out at 2) — confirmed no collision: both `canonPage()` implementations in the suite (now embedded in `minutes.html`, and in `tunebooks.html`) only match that shorthand against a page key that's *purely* digits before the dot, so a lettered key like `a184.1` was never at risk of being reinterpreted as "top half of a184." NHC2001's song count moves from 260 to 264 as a result (net +4 from the 5-for-1 split).

---

## Index v1.7.4

**Filled in `CHM2010`'s `shmhaCode`:** blank since Index v1.0.0, which explicitly deferred it because SingLoud's own key only had a code (`CHI`) for the *Ingalls* 1805 Christian Harmony, a different book from the Walker-tradition Christian Harmony this index actually ships — assigning SHMHA's generic `CH` to the wrong book would have been a real misattribution, not a convenience. Resolved by Kevin cross-referencing the SHMHA codes actually printed across several real Minutes Books, which gave `CH` (bare "Christian Harmony") and `ICH` (Ingalls' Christian Harmony) as two clearly separate codes — `CH` is CHM2010's.

**A third "Christian Harmony" surfaced during the same reconciliation, worth recording precisely so it never gets conflated with the other two:** SHMHA also codes `CHa` for the *Alabama* Christian Harmony — a third, unrelated book that happens to share the same generic name. So there are now three distinct SHMHA codes for three distinct "Christian Harmony" books: `CH` (Walker's, indexed here as `CHM2010`), `ICH` (Ingalls', not yet indexed), and `CHa` (Alabama, not yet indexed). None of the three should ever be treated as interchangeable just because the title matches.

**Six more codes identified but not yet indexed** — The American Harmony (`AH`), American Vocalist (`AV`), Lloyd's Hymnal (`LD`), Alabama Christian Harmony (`CHa`, see above), The Good Old Songs (`GOS`), and Oberlin Harmony (`OH`) — added to the Forthcoming table below. None of these had been named anywhere in this suite before; SingLoud work codes for all six are still unknown.

**Everything else cross-checked and confirmed already correct**, no changes needed: `ACH`, `CB`, `GH`, `HS`, `MH`, `NHC`, `NbH`, `ShH`, `WB` all matched their already-indexed book's `shmhaCode` exactly; `EH1`, `EH2`, `ICH`, `JB`, `KH`, `KsH`, `NH`, `ScH`, `SoH` all matched what was already in `compile.html`'s `WORKCODE_TO_SHMHA` fallback table or the Forthcoming table below; and `OSH` (Old School Hymnal) confirmed the reasoning behind an existing note in `compile.html` explaining why SingLoud's Ohio Sacred Harp code was deliberately changed to `OhS` to avoid colliding with it.

---

## Index v1.7.5

**Added:** `EH11999` — *An Eclectic Harmony*, compiled by the Eclectic Harmony Music Committee (Liz Bryant, chair; Judy Mincey, Lee Rogers, Laura Akerman, John Plunkett, Don Bowen, Sharon Kellam; historical notes by Berkley Moore), Atlanta, GA, 1999. Work Code `EH1`, SHMHA code `EH1`. 100 songs, four-shape. This is a compilation book — every song is drawn from one of nine other named sources (Missouri Harmony, The Southern Harmony, The Social Harp, Cooper Revision, White Revision, English West Gallery tunes, Northern Harmony, An American Christmas Harp, plus five originals/arrangements contributed directly for this book by the Lee family and three other living composers) — and each song's `historicalNote` records which.

**Added:** `EH22001` — *An Eclectic Harmony II*, compiled by the Eclectic Harmony II Music Committee (Sharon Kellam & Berkley Moore, co-chairs; Larry Beveridge, Liz Bryant, Dan Huger, Willie Israel, Regina Marshall, Judy Mincey, John Plunkett, Lee Rogers), Boone, NC, 2001. Work Code `EH2`, SHMHA code `EH2`. 69 songs, seven-shape — this suite's first seven-shape *compilation* book, distinct from `NHC2001`/`HaS2008`/`NSH1884`'s seven-shape but single-source content. Drawn from Harmonia Sacra, New Harp of Columbia, Christian Harmony (NC), Christian Harmony (AL), Alto Attitude, and an original "New Songs & Arrangements" section — same `historicalNote`-per-song convention as `EH11999`.

**Both books currently carry page/title/source only** — no `meter`, `key`, `timeSignature`, `firstLine`, or attribution data yet, since none of that is legible from an index or table of contents. Real tune-page scans for both are expected in a future batch; this base entry is deliberately the minimum the schema actually requires, not a placeholder standing in for something more complete.

**Two real title corrections, caught by cross-checking each book's own Contents against its own Title Index** (not tune pages, since neither was available yet — flagged rather than silently resolved, and since confirmed directly by Kevin):
- `EH22001` page 20: Contents printed "Erwin"; the Title Index and Kevin's direct confirmation agree it's actually **"Erin."**
- `EH22001` page 39: Contents printed "The Dying Penitent"; the Title Index instead had "The Dying Penitant" (a misprint in that one index, not the tune's real title) — confirmed as **"The Dying Penitent,"** matching the Contents.

**Split-page top/bottom order for both books was inferred from each book's own Contents listing order**, not yet visually confirmed against an actual tune page — `EH11999`: `21`, `22`, `28`, `29`, `45`, `55`, `72`, `74`; `EH22001`: `5`, `26`, `29`, `31`, `33`, `35`, `38`, `40`. Kevin confirmed all of `EH22001`'s splits are correct as inferred; `EH11999`'s page 29 was caught and reversed (Peterborough is `t`, Dunlap's Creek is `b` — the opposite of the initial TOC-order guess) before anything shipped.

**Badge colors** (`#f5f0e6` cream background for both, matching the cream already used by `ACH2009`/`SHW2007`) with `#155D13` green text for `EH11999` (matching `SHM2025`'s established green) and `#800020` burgundy text for `EH22001` (matching `SHM1991`'s established burgundy) — reusing exact hex values already in the suite's palette rather than introducing new ones, per Kevin's request for a green/cream and burgundy/cream pairing respectively.

**Open at the time, since resolved:** how `EH22001`'s own "Christian Harmony (NC)" and "Christian Harmony (AL)" source-book labels relate to this suite's existing `CH` (`CHM2010`), `CHa`, and `CHW` was TBD per Kevin when this entry was written. `CHa` and `CHW` are now both indexed in their own right (see `e_CHW2015`/`e_CHa1958` below) as the Carolina and Alabama books respectively; `CHM2010` remains a separate, modern harmonization drawing on both, not a stand-in for either one.

---

## Index v1.7.6

**Enriched `EH22001`** with data from its own First Line Index and Composer & Arranger Index — both were transcribed alongside the Contents in the batch that added the book (Index v1.7.5) but held back at the time, since attribution really needs the tune page's own credit line to assign a role correctly, and first lines can't be reliably assigned to a specific song on a split page from an index alone.

- **`firstLine` added to 53 of 69 songs** — every non-split-page song where the First Line Index cited exactly one page. Not applied to any of the 8 split pages (`5`, `26`, `29`, `31`, `33`, `35`, `38`, `40`), since the index cites two first lines for each of those bare page numbers with no way to tell which belongs to which of the two songs sharing it — see the open item on this below.
- **`musicAttribution.credit` added to 38 of 69 songs** — every non-split-page song where the Composer & Arranger Index cited exactly one name for that page. Not applied where a page had multiple names cited (`26`, `32`, `33`, `35`, `43`, `64`, `76`) since the index doesn't distinguish composer from arranger from harmonizer, and two names on one song's page most likely means two different roles that need the actual credit line to sort out correctly, not two candidate assignments to guess between. Also not applied to page `4` (Piety) — the scan's own rendering of "Clark, Thomas... 30, 4" is ambiguous enough that the trailing "4" might not be a real page reference at all; left this one out rather than risk a wrong attribution on a legible-looking but actually uncertain source.

**Open, not resolved here:**
- The 8 split pages above still have no `firstLine`, and their `musicAttribution` situation varies — some pages have one name cited (ambiguous which of the two songs it belongs to: `5`, `29`, `31`, `38`, `40`), some have two names that likely correspond one-to-one with the two songs (`26`, `33`, `35`), and both would need the actual tune page to assign correctly.
- Page `43` (Oliphant) and page `64` (Pilgrim) and page `76` (The Angels' Song) each have two composer/arranger names cited despite being single, non-split songs — most likely a composer and a separate arranger (or text author and tune composer) credited together, but which name did which job isn't recoverable from an index alone.
- ~~A likely missing song at page 67~~ — resolved: the "I will rise and go to Jesus... 67" line is mid-song (a chorus line), not a first line for a separate, uncaptured song. No song is actually missing at page 67; nothing to add.

---

## Index v1.7.7

**`EH22001` pages 43 ("Oliphant"), 64 ("Pilgrim"), and 76 ("The Angels' Song") — composer/arranger roles resolved.** Each had two names cited in the Composer & Arranger Index with no way to tell which did what; Kevin confirmed all three directly:
- Page 43: de Sales Baillot, Pierre Marie Francois (composer) / Mason, Lowell (arranger)
- Page 64: Jones, L. J. (composer) / Steel, D.W. (arranger)
- Page 76: Lowry, Robert (composer) / Tucker, T.R. (arranger)

Composer credit went to `musicAttribution`, arranger credit to `harmonizationAttribution` — the schema's existing field for a second credit distinct from the tune's original composer, same pattern already used elsewhere in this suite for a harmonizer credited separately from a composer.

Still open from Index v1.7.6, unaffected by this: the 8 split pages' `firstLine`/attribution ambiguity, and pages `5`, `26`, `29`, `31`, `33`, `35`, `38`, `40`'s composer/arranger assignments — none of those were part of what Kevin resolved here.

---

## Index v1.7.8

**Corrected `SHW2007`'s `commonName`:** shortened from "Sacred Harp (White Book, 2007)" to "Sacred Harp (White, 2007)," per Kevin's direct correction. `fullTitle` and `subtitle` untouched.

---

## Index v1.7.9

**Corrected in `GeH2012`:** page 118 ("Wilkinson") was missing entirely — not a typo in the source that transcribed it, but a real gap in this index. Surfaced when a sample singing's minutes cited page 118 and it failed to resolve against the indexed data; the natural assumption at the time was a typo in the minutes (nearest real pages were 116, 119, 120, 122), so a nearby page was substituted for that sample rather than adding 118 outright. Kevin confirmed directly against the book: 116 is "Liberty Hill," 117 is genuinely a continuation of 116 (correctly un-indexed, matching this suite's standing rule that a continuation never gets its own entry), and 118 is "Wilkinson" — a real, distinct song this index had simply never captured. Song count moves from 177 to 178.

Worth remembering for next time a cited page doesn't resolve: "doesn't exist in the index" and "doesn't exist in the book" are two different claims, and only the book itself can settle which one is true — this index not having an entry isn't proof the entry shouldn't exist.

---

## Index v1.7.10

**Corrected in `GeH2012`:** page 253 ("Durham") was also missing — confirmed by Kevin directly against the book, the second real gap surfaced by the same sample singing that caught page 118 (Index v1.7.9). Song count moves from 178 to 179.

**Gap audit fully resolved as of this note.** Of the original 76 candidate gaps: 11 were real missing songs, now added — `118` (Wilkinson), `253` (Durham), and the 9-song run at `240`–`252` (Golden Isle, Vision, Styles, Mercer, Solemn Call, A Round in 7's, Alford, Meeting Place, Arabi). The remaining 65 — `211`–`213` (a single piece, "Wilson's Chapel," genuinely spanning those pages) and every other candidate on the list, including `239`/`241`/`243`/`245`/`247` and the 58 scattered single-page gaps outside the 239–252 block — were confirmed by Kevin directly against the book as legitimate continuation pages, not missing content. `GeH2012` now stands at 188 songs.

---

## Index v1.7.12

**Added `ScH1855` — The Social Harp**, promoted from the Forthcoming list to a full Level 3 entry: 221 songs, all with a first line, most with music attribution, built from a Hymnary.org-sourced CSV (`https://hymnary.org/hymnal/SH1855`) that Kevin provided directly, cross-checked against Wikipedia's own article on the book. Compiled by John G. McCurry (Hart County, Georgia), first published 1855, reprinted unchanged in 1859 and 1868; the University of Georgia Press's 1973 facsimile (edited by Daniel W. Patterson and John F. Garst) is what both Hymnary's page numbering and this CSV actually follow, though the book is indexed here under its original 1855 date to match Hymnary's own hymnal code and the book's real publication history. The original 1855 printer/publisher couldn't be pinned down from available sources, so `publisher`/`placePublished` are left unset rather than guessed. Independently confirmed by cross-referencing: Hymnary's own page listing skips the exact same page numbers this CSV does, meaning those gaps are genuine non-song pages in the real book, not indexing errors — the same category of ambiguity that took real back-and-forth to resolve for `GeH2012` came pre-resolved here by having a second independent source to check against. Corresponding Level 2 record removed from `master-tunebook-list.js` and the Forthcoming table below.

---

## e_SHW1911 added

Real Level 1 Edition record added under the existing `w_SHW` Work: the actual 1911 J. L.
White printing, distinct from `e_SHW2007` (the 2007 retypesetting). Kevin's correction,
prompted by real transcribed singing-minutes data (the J.L. White and Eclectic Harmony Book
Singing series, 2001–2010) citing "WB" for years before the 2007 edition existed: "anything
prior to 2007 should be SHW1911." Deliberately Level 1 only — no page index, no `shmhaCode`,
no detailed publication fields — since pagination relative to `e_SHW2007` is unconfirmed and
none of those fields were verified for this specific printing. Verified against the real
Tunebook Editor validator (zero issues) before use.

---

## e_WiH1992 added

**Added `WiH1992` — Wisconsin Harmony Tunebooklet**, a real Level 3 Edition under the
existing `w_WiH` Work: 24 songs (pages 19–46), all with a title, most with meter, time
signature, key, text/music attribution, and source citation, built from
`wisconsin_harmony_extraction_1.csv`, a real per-song extraction Kevin provided directly.
Compiled by James Philip Page — the fuller name used here comes from the source data's
own repeated copyright notices, rather than the existing Work record's shorter "James
Page." Edition year (1992) confirmed by Kevin, matching the existing Work record's
`firstEditionYear`, even though the individual songs' own copyright notices in the
source data range 1988–1991 — ordinary for a compilation, not a discrepancy: its songs
are necessarily written before the book itself was published. `publisher`/`placePublished`
are left unset, since the source data doesn't state them for this printing. Work still
carries `catalogingStatus: "unreviewed"` from its original Master Code List import,
unrelated to this Edition's own, separately-verified Level 3 data. Verified against the
real Tunebook Editor's canonical validator (zero issues) and against the actual bundled
`tunebook-files/WiH1992.json` file before use.

---

## e_NoH1980 / e_NoH1985 / e_NoH1990 / e_NoH1995 / e_NoH1998 / e_NoH2012 added

**Six real Level 1 Editions added under the existing `w_NoH` Work — Northern Harmony**,
removed from the Forthcoming table below accordingly. Bibliographic data (title,
subtitle, compiler, publisher/place published where stated, publication year, shape
system) from singloud.org/books/northern-harmony-1980/, added at Kevin's own request.
Three items from that page's own timeline were explicitly excluded per Kevin's
instruction: the 1988 Preview Tunebooklet, the 1992 [Second Printing, Second Edition?]
printing, and the 199(2?) Second Edition Digital release. Compiler attribution differs
by edition, matching what the source article actually describes: Carole Moody and Tony
Barrand for 1980/1985 (before Larry Gordon joined in 1987); all three for 1990/1995,
since the article states Moody's name stayed on the cover through the third edition;
just Gordon and Barrand for 1998/2012, since her name was removed from the cover
starting with the fourth edition. The 1985 "Revised Tunebooklet" carries a real caveat
in its own record: the source article's author states they have never personally
examined a copy of it, its existence known only second-hand via a note in the 1990
edition — included since Kevin didn't exclude it, but genuinely less certain than the
other five. Deliberately Level 1 only for all six — no page index, since none was
provided or requested. Verified against the real Tunebook Editor's canonical validator
(zero issues) before use.

---

## e_UHS1909 promoted to Level 3 — Union Harp and History of Songs

**224 songs, full Level 3.** Built from `union_harp_1909_index.csv`, Kevin's own
real per-song extraction covering pages 1-220, following the
`tunebook-page-extraction-guide.md` workflow, then completed with a second batch
covering pages 87-95 from Kevin's own scanned pages (the only real gap the first batch
left). Compiler J. S. James, published 1909, Douglasville, Georgia; publisher left
unset rather than guessed, since a careful page-by-page review found no publisher
separately named — the compiler holds the book's own copyright directly, suggesting
self-publication. Front matter (title page and introductory essays) carried no song
data of its own; its substantive content — commissioning by the United Sacred Harp
Musical Association in 1907, the Endorsement of Committee, and the book's own "History
of the Name of Harp" essay — is recorded in the file's own `book.notes` field rather
than a new, unrequested schema field.

A real, separate data-quality issue was found and fixed before building the file:
seven page numbers (115, 116, 120, 130, 137, 153, 168) each covered two genuinely
different songs with no `t`/`b` suffix distinguishing them in the source CSV — assigned
based on the CSV's own row order, flagged as an assumption rather than presented as
confirmed. The file was independently cross-checked three times afterward against the
book's own printed indexes (Index of Tunes and Composers; Index to First Lines and
Composers; Metrical Index; Index to Tunes Without Metres; Index to Composers and Their
Tunes) — this caught and corrected several page-number typos in the book's own
printed indexes (not this file's data), confirmed dozens of blank `meter` fields as
genuinely intentional rather than data gaps, filled a handful of real ones in from the
Metrical Index where confirmed, and — notably — caught a direct contradiction between
two of the book's own indexes over three tunes' meters (Home In Heaven, Looking This
Way, Praise His Name for Evermore), which were left blank rather than kept on
contested authority. One title disagreement remains open and unresolved: the book's
own index lists "City of God" at page 203, credited to Chastain, where the actual tune
page (this file's authoritative source) reads "City of Gold." All of this detail lives
in the file's own `internalNote`, not just here.

---

## e_CHW2015 and e_CHa1958 added — the two remaining Christian Harmony editions

**Level 2 (page + title only) for both, added at Kevin's request.** `CHW2015` — the
Christian Harmony "Carolina book" (1873 facsimile, 2015 Folk Heritage reprint), 539
songs — and `CHa1958` — Christian Harmony "Alabama book" (Deason-Parris 1958
revision), 463 songs, added as a brand-new Edition under the pre-existing `w_shmha_CHa`
Work (which had carried a provisional SHMHA-derived work code with no edition of its
own until now). Both indexes extracted directly from christianharmony.org's own
published page indexes — page numbers and short tune titles only, the same kind of
factual, table-of-contents-level metadata already used throughout this file, not
lyrics or music. Both independently re-parsed from the raw source table
programmatically (not hand-transcribed) specifically to rule out transcription error
at this scale, and both came back byte-for-byte confirmed against the target record
once the CHW2015 addition landed. `CHW2015`'s own rudiments section required one real
extension to the established `t`/`b` split-page convention: front-matter page `xix`
carries four distinct short pieces, not two, so it uses a `xixA`/`xixB`/`xixC`/`xixD`
lettered scheme instead — Kevin's own convention, applied here for the first time.
This closes out both remaining rows in the Forthcoming table below.

---

## e_KtH1818 added

**Added `KtH1818` — The Kentucky Harmonist**, a real Level 3 Edition under the existing
`w_KtH` Work: 138 songs (pages 18–125; pages 1–17 are the book's own front matter — rules
and principles of composition — with no song data), all with a title, all with a first
line (added in a follow-up upload after the initial extraction), most with meter and music
attribution, built from `kentucky_harmonist_1818_tunes.csv`, a real per-song extraction
Kevin provided directly. Compiler Samuel L. Metcalf; published for the author (Cincinnati),
printed by Morgan, Lodge and Co. — confirmed directly from this edition's own title and
copyright pages. **Open discrepancy, not resolved here:** the existing Work record's
`firstEditionYear` says 1817, one year earlier than this edition's own, directly-confirmed
1818 date. Left as-is since it's unclear whether 1817 refers to a real, separate earlier
edition or was simply an incorrect guess from the original Master Code List import — worth
confirming before changing either value. No index cross-check against this book's own
printed index has been done yet, unlike the multi-round verification `UHS1909` received;
this is a first-pass build from the extraction CSV alone. Verified against the real
Tunebook Editor's canonical validator (zero issues) and against the actual bundled file
before use.

---

## e_WeL1835 added

**Added `WeL1835` — The Western Lyre**, a real Level 3 Edition under the existing `w_WeL`
Work: 224 songs, all with a title, most with meter and attribution, built from Kevin's own
per-song extraction CSV. Compilers William B. Snyder and W. L. Chappell (Work-level); this
1835 printing's own title page credits W. L. Chappell specifically and calls itself the
"New Edition," so this Edition's own `compiler` field names Chappell alone, distinct from
the Work-level `responsibilityStatement` naming both — different scopes, not a
contradiction. Published by W. L. Chappell and Corey and Fairbank (Cincinnati); original
publication 1831, this edition 1835 — both confirmed directly from the book's own title and
copyright pages. Full title, subtitle, publisher, and place published were added in a
follow-up session after the initial song data landed, once directly confirmed against the
physical book. Verified against the real Tunebook Editor's canonical validator (zero
issues) before use.

---

## e_SHD1971 upgraded to Level 3

**`SHD1971` — Original Sacred Harp, Denson Revision, 1971 Edition — upgraded from a bare
Level 1 entry to a real Level 3 Edition**: 541 songs, pages 23–573, built from Kevin's own
per-song extraction CSV (`Original_Sacred_Harp_1971_cumulative_extraction.csv`). This is
the first of the previously-deferred SHD editions to get a full build ("I'll get to it
when I get to it" — noted in an earlier session). Compiler: the 1971 Music Committee (Hugh
McGraw, Chairman; Mrs. Ruth Denson Edwards, Secretary; Palmer Godsey; Foy Frederick; Elder
Elmer Kitchens; Walter A. Parker) — recorded on this Edition specifically, distinct from
the Work's own `responsibilityStatement` (Paine Denson, Thomas J. Denson), which names the
original 1936 revision committee, not this one. Also recorded: consultants (Dr. William J.
Reynolds, Dr. Emory S. Bucke); publisher Sacred Harp Publishing Company, Inc. (Cullman,
Alabama); printer Kingsport Press (Kingsport, Tennessee); and a full 15-entry
`meterAbbreviationKey` reference table, all new fields on the Library with no prior
precedent, added under the exact names Kevin gave them. This edition's own `commonName`
and badge colors, already set from an earlier session, were left untouched — only the new
bibliographic facts and the Level 3 file itself were added. 68 page numbers within the
range have no song entry — real front matter, section dividers, and blank pages, not
extraction gaps; 57 songs have no recorded meter and 67 no recorded key, reflecting real
variation in the book's own printing, not omissions. No index cross-check has been done
against this book's own printed index yet; this is a first-pass build from the extraction
CSV alone. Verified against the real Tunebook Editor's canonical validator (zero issues)
before use.

---

## e_UnH1829 added

**Added `UnH1829` — Union Harmony; or, Music Made Easy**, a real Level 3 Edition under the
existing `w_UnH` Work (a bare Work record with no prior Edition, from the original Master
Code List audit import): 143 songs, pages 17–142, built from Kevin's own per-song
extraction CSV (`union_harmony_final.csv`). Compiler John Cole; publisher William & Joseph
Neal, and John Cole (Baltimore) — both confirmed directly from this edition's own title
page. The title page also names J. Robinson as printer; recorded in this Edition's own
`printer` field, not folded into `publisher`, per Kevin's own instruction. **Publication
year deliberately left blank** — the copyright/deposit page gives only "the fifty-third
year of the Independence of the United States of America," not a printed Gregorian year;
per the extraction guide, this isn't converted into a year and asserted as printed
evidence. The existing Work record's own `firstEditionYear` ("1829") appears to already be
this same calculation, from an earlier, less careful import. Confirmed directly with Kevin
before building: the Edition Code (`UnH1829`) reuses that year strictly as a practical
identifier, not as a re-assertion that 1829 is a confirmed fact — `publicationYear` itself
stays unset on both the Edition record and the Level 3 file's own `book` block. Three
similarly-titled but unrelated "Union Harmony" Works already exist in the Library
(Caldwell's `w_UHF`, Hendrickson's `w_UoH`); `commonName` is set to "Union Harmony (Cole)"
to keep this one unambiguous from the other two without asserting an unconfirmed year.
Five page numbers within the range (125, 130, 131, 139, 140) have no song entry — real
pages with nothing to extract, not a gap in the work. No index cross-check has been done
against this book's own printed index yet; this is a first-pass build from the extraction
CSV alone. Verified against the real Tunebook Editor's canonical validator (zero issues)
before use.

---

## e_EaI1802, e_SHB1844, e_UCH1839, and e_WRS1820 added — four books processed in one batch

**`EaI1802` — The Easy Instructor**, second-generation 4-shape notation pioneer by William
Little and William Smith, added under the existing bare Work `w_EaI`: 105 songs, pages
17–99. Caught a real 2-row discrepancy against the extraction's own record before building
anything (it claimed 107 rows; the actual CSV had 105) — both turned out to be
continuation fragments, not missing tunes, confirmed directly against Kevin's own page
photos: page 30 is bare "Russia" (Calvary's own continuation from 29.3, which also prints
a "Lyric Poems" label, now noted on Calvary's own record rather than misfiled as a text
attribution or invented as a separate tune), and page 68 is bare "Sunday" (Still-Water's
own continuation from 67b). `publicationYear` is recorded as a confirmed fact (1802), per
Kevin's own direct correction after an initial build mistakenly left it unset.

**`SHB1844` — The Sacred Harp**, the original 1844 first edition by B. F. White and E. J.
King, added under the existing bare Work `w_SHB`: 242 songs, pages 27–260. A clean
extraction from the start — row count matched exactly, zero structural issues. Full
imprint recorded (T. K. & P. G. Collins, Philadelphia, for the proprietors); the one real
editorial note preserved from the extraction is the index/tune-page title mismatch at page
240 ("Christian's Song" vs. the tune-page's own "Christian Song" — the tune-page heading
governs).

**`UCH1839` — Die Union Choral Harmonie / The Union Choral Harmony**, Henry C. Eyer's
bilingual German/English tenth edition, added under the existing bare Work `w_UCH`: 271
songs, pages 1–192. The uploaded extraction-state snapshot itself claimed the book
incomplete at page 170 (`bookComplete: false`); the actual supplied CSV went to page 192
with 271 songs, confirmed by Kevin directly as the book's true, complete state before this
was built — the snapshot was simply stale, not a sign of missing content. Real printed
numbering irregularities (duplicate catalog numbers, a skipped number, out-of-sequence
numbers) are preserved as printed, documented in the Level 3 file's own internal note
rather than corrected. No publisher statement is printed anywhere in the book, only the
stereotyper (John Fagan, Philadelphia); `publisher` stays unset.

**`WRS1820` — Wyeth's Repository of Sacred Music, Part Second (2d. Edition)**, John
Wyeth's own compilation, printed by him in Harrisburgh, Pennsylvania: 149 songs, pages
18–131. Required a genuine cataloging decision, caught and resolved with Kevin directly
rather than guessed: two existing Work records both looked plausible (`w_WyR`, matching
the compiler and title but representing Part *First*, 1810; `w_WR2`, matching "Part II" in
name but credited to "Lowens, Irving, ed." rather than Wyeth himself, apparently a modern
scholarly catalog entry rather than the original compilation). Neither was correct —
`w_WRS` is a new Work record, created directly with Kevin during this build, specifically
for this original, Wyeth-compiled Part Second lineage, distinct from both. The extraction's
own index audit found and preserved a real discrepancy: the book's printed title index
lists "Minister's Farewell" on page 112, but the actual page contains "Providence" (112t)
and "Hallelujah" (112b), with "Providence" omitted from the index entirely — the tune-page
evidence was kept over the index's own claim.

All four verified against the real Tunebook Editor's canonical validator (zero issues) and
cross-checked against several of their own extraction's specific batch notes (visual page
ordering, out-of-sequence catalog numbers, split-page contents) directly against the built
data, not just structurally, before use.

---


**As of Workstream B (Master Tunebook List, draft v1), this table is superseded by `master-tunebook-list.js`** — the same ten books below now exist as real, structured Level 2 records there (per `MASTER-TUNEBOOK-LIST-SCHEMA.md`), rather than living only as changelog prose. This table is kept here for historical reference and because it's still the easier place to *read* the list. (`master-tunebook-list.js` itself was later superseded in turn by the unified `tunebook-library.js` — see the Tunebook Library and File Architecture work below — and has since been removed from the suite entirely.)

SingLoud's book listing (singloud.org/books) names several tunebooks Minutes doesn't have song data for yet. Rather than add placeholder entries with no songs to `tunebook-index.js` — which risks a book appearing "supported" in the Capture checkbox list while silently having nothing behind it — they're recorded here instead, with whatever identifiers are already known, so adding the real data later is just a matter of filling in the `songs` object.

| Full Title | Common Name | SingLoud | SHMHA |
|---|---|---|---|
| The Southern Harmony | Southern Harmony | SoH *(1993 reprint)* | SoH |
| The American Harmony | American Harmony | *(unknown)* | AH |
| American Vocalist | American Vocalist | *(unknown)* | AV |
| Lloyd's Hymnal | Lloyd's Hymnal | *(unknown)* | LD |
| The Good Old Songs | Good Old Songs | *(unknown)* | GOS |
| Oberlin Harmony | Oberlin Harmony | *(unknown)* | OH |

SHMHA codes above are carried over from the existing `SINGLOUD_TO_SHMHA` table already in `compile.html`, not independently re-verified against SHMHA's own materials for this changelog entry, **except** the last six rows (American Harmony, American Vocalist, Lloyd's Hymnal, Alabama Christian Harmony, Good Old Songs, Oberlin Harmony), which came directly from Kevin cross-referencing several real Minutes Books' SHMHA code keys — see Index v1.7.4 below for the full reconciliation.

1. In Tunebooks, use the Edit Tunebook tab (Level 1 or 2 — book details, and a page index if you have one) or the Library tab (for the full Work/Edition/State model, including a Level 3 Tunebook File if you have one) to add or complete the book's record, then export the updated `tunebook-library.js` and drop it in over the bundled copy.
2. Add a row to this changelog (or a new dated section, for a later data version) recording the addition.
3. `EZ_MINUTES_TUNEBOOK_LIBRARY_VERSION` at the top of `tunebook-library.js` is the schema version (it's written into `schemaVersion` on the Library object itself), not a content/data version — Tunebooks' importer only accepts an exact match against its own known schema list, and rejects anything else outright as an unsupported file. **Do not bump it for an ordinary catalog update** (new books, corrected fields, a completed index) — doing so would make Tunebooks refuse to load a file that's actually perfectly fine, just newer content on the same schema. Leave it unchanged and add a new, dated section here instead. It only changes when the Library's own data *structure* changes in a way that genuinely requires new reader-compatibility logic — a real schema migration, not a data refresh.

No code changes to `minutes.html` are needed to add a book — it derives its book lists, title lookups, split-page detection, code mappings, and badge colors from whatever's in `tunebook-library.js` at load time.
