# Tunebooks

The curation app for the shape-note tunebook data the Sing Loud Suite runs on: every Work
and Edition the suite knows, their page and title indexes, the Level 3 scholarly files, and
the packaging that gets a contribution ready to publish.

**Most people recording a singing never need this app.** It is for the person maintaining
the data itself.

## Part of the Sing Loud Suite

| App | What it does |
|---|---|
| [**Minutes**](https://github.com/singlouddotorg/minutes) | Log a singing as it happens, then turn that log into publishable minutes. |
| [**Tunebooks**](https://github.com/singlouddotorg/tunebooks) | Curate the shared tunebook data — editions, page indexes, Level 3 scholarly files. |
| [**Simple Minutes**](https://github.com/singlouddotorg/simple-minutes) | A phone-sized logger: page numbers only, no names. Its files import straight into Minutes. |
| [**Tunebook Registry**](https://github.com/singlouddotorg/tunebook-registry) | The published tunebook data the others read. |

Tunebooks is the *editor* for data the Tunebook Registry *publishes*. The direction matters
and is worth stating plainly, because it is the thing most likely to get muddled later:

```
edit here  →  export tunebook-library.js  →  publish to the Registry  →  the other apps read it
```

The copy of `tunebook-library.js` in this repository is a working input. The Registry's copy
is the published truth.

## Getting started

No installation, no build step, no server. Download the files, keep them in one folder, and
open `index.html` in any modern browser. Everything runs locally in the page.

| File | What it's for |
|---|---|
| `index.html` | **The app.** Open this file directly. |
| `tunebook-library.js` | The library being edited. **Required.** |
| `tunebook-files/` | Level 3 scholarly data, one file per Level 3 edition. |
| `shared-utils.js` | Utilities shared with Minutes (CSV parsing, page sorting, title building). |
| `TUNEBOOK-CHANGELOG.md` | What has been added to the library, and when. |
| `tunebook-page-extraction-guide.md` | What to look for when transcribing a tunebook page into structured data — useful on its own, even outside this suite. |

## What it does

- **Library** — browse every Work and Edition, validate the whole library against its own
  invariants, and export a fresh `tunebook-library.js`.
- **Bulk Edit** — a spreadsheet-style grid over every Edition at once, for the fields that
  are worth editing in bulk: title, subtitle, common name, compiler, publisher, place, year,
  shape system, SHMHA code, and badge colours. Rows validate and save independently, so one
  bad row never blocks the good ones beside it, and a rejected row keeps its draft exactly
  as typed so it can be corrected and retried.
- **Edit Tunebook** — the single-record editor, including the Level 3 editor for books with
  full per-song data (meter, key, attribution, and the rest).
- **Export** — regenerate the library file, or package a contribution. A round trip (load,
  then export with no edits) is lossless.

### Badge colours

An Edition's badge colour and text colour are edited in **Bulk Edit**, alongside its Common
Name — the three fields that are a matter of judgment rather than a fact off a title page.
Each colour cell pairs a swatch picker with its text value, and the row's Work Code cell
renders the **real badge**, recoloured live as you pick, so colour is chosen by eye rather
than typed as hex.

The text value stays authoritative on purpose: `<input type="color">` accepts only 6-digit
hex and silently normalizes anything else just by rendering, and real editions in the
library carry `#000` shorthand. A grid must never edit the data it is merely displaying.

## Levels

An Edition is at one of three levels, and the level is about how much is known, not how
important the book is:

- **Level 1** — bare bibliographic record. A book that exists, with no page index yet. Most
  of the library is this, legitimately.
- **Level 2** — a complete page-and-title index, held in `tunebook-library.js` itself.
- **Level 3** — full per-song metadata in its own file under `tunebook-files/`.

## Tests

```bash
cd tests && npm install && node --test
node --test live/t9-tunebooks-layout.js   # needs playwright
```

185 tests covering library invariants, Level 3 file integrity, Bulk Edit's transactional
save, and the persistence model, plus a live browser check of the layout.
