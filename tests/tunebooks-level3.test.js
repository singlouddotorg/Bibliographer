// Regression coverage for turning Tunebooks from a "Level 3 inspector" into a real Level 3
// editor (v61 review #2), and for the architectural fix a follow-up external review (v68)
// found was still missing: R68-01, two independently editable copies of the same tunebook
// data (Library vs. Level 3 file), which could leave Minutes silently using a stale value
// after a real, successfully-saved Level 3 edit. Confirmed live before fixing - this is not
// a hypothetical concern. The fix: shared fields (identity, publication, page titles) are
// now owned by libraryData alone: Level 3 editor writes to the same object the Library's own
// generic editor does, not a second copy. R68-02 (wrong Sources schema) and R68-03 (typed
// values silently becoming strings) were fixed in the same pass, since both lived in the
// same code this rewrite touched.
'use strict';

const { test, describe, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const { loadPage, suitePath, wait, closeAllWindows, suiteAppPath } = require('./helpers');

after(() => { closeAllWindows(); });

async function openScH1855Editor() {
  const dom = loadPage('tunebooks.html');
  const win = dom.window; win.confirm = () => true;
  await wait(700);
  const doc = win.document;
  const originalText = fs.readFileSync(suitePath('tunebook-files/ScH1855.json'), 'utf8');
  win.fetch = async () => ({ ok: true, json: async () => JSON.parse(originalText) });

  doc.getElementById('tab-library').click();
  await wait(300);
  const editBtn = [...doc.querySelectorAll('.lib-edit-edition-btn')].find(
    (b) => b.closest('.lib-edition-row').textContent.includes('ScH1855')
  );
  editBtn.click();
  await wait(300);
  doc.getElementById('loadTunebookFileBtn').click();
  await wait(300);
  return { dom, win, doc, originalText };
}

describe('Level 3 Tunebook editor (v61 review #2)', () => {
  test('opening a real Level 3 file shows a real editor, not just a summary', async () => {
    const { doc } = await openScH1855Editor();
    assert.equal(doc.getElementById('tunebookFileEditor').style.display, 'block');
    assert.equal(doc.querySelectorAll('.tf-section-btn').length, 7, 'All seven review-requested sections should be present');
    assert.match(doc.getElementById('tfCompletenessNote').textContent, /core complete|core incomplete/);
  });

  test('Contents / Index supports editing an existing song and adding a canonicalized new page', async () => {
    const { doc, win, originalText } = await openScH1855Editor();
    const original = JSON.parse(originalText);
    const firstPage = Object.keys(original.songs).sort((a, b) => parseInt(a, 10) - parseInt(b, 10))[0];

    const contentsBtn = [...doc.querySelectorAll('.tf-section-btn')].find((b) => b.dataset.section === 'contents');
    contentsBtn.click();
    await wait(200);

    const titleInput = doc.querySelector(`.tf-song-title-input[data-page="${firstPage}"]`);
    assert.ok(titleInput, 'The real first song should have an editable title input');
    titleInput.value = original.songs[firstPage].title + ' (edited)';
    titleInput.dispatchEvent(new win.Event('change', { bubbles: true }));
    await wait(100);

    doc.getElementById('tfNewSongPage').value = '999.1';
    doc.getElementById('tfNewSongTitle').value = 'Brand New Test Song';
    doc.getElementById('tfAddSongBtn').click();
    await wait(150);
    assert.ok(doc.querySelector('.tf-song-title-input[data-page="999t"]'), '999.1 should canonicalize to 999t, matching the same rule used elsewhere');
  });
});

describe('Library / Level 3 single authority (v68 review R68-01, R68-02, R68-03)', () => {
  test('editing Common Name and a page title through the Level 3 editor genuinely updates the Library, the same record Minutes reads - the review\u2019s own required test', async () => {
    const { doc, win, originalText } = await openScH1855Editor();
    const original = JSON.parse(originalText);
    const firstPage = Object.keys(original.songs).sort((a, b) => parseInt(a, 10) - parseInt(b, 10))[0];

    // Common Name now lives only in the Level 3 editor's own Identity tab for a real
    // Level 3 Edition like this one - Kevin's own report and own stated principle
    // ("there shouldn't be two ways to edit one element") means the generic top form's
    // lef_commonName field no longer exists for it at all, so this can no longer verify
    // "the edit reached the shared record" by checking a second display of the same
    // field. The Library browse row's own text is a genuinely independent, real
    // verification instead - it reads commonName directly off the same libraryData
    // object, just via a different, read-only rendering path.
    const commonNameField = doc.getElementById('tf_library_commonName');
    assert.equal(commonNameField.value, 'Social Harp', 'Sanity check: real starting value');
    commonNameField.value = 'EDITED VIA LEVEL 3 EDITOR';
    commonNameField.dispatchEvent(new win.Event('change', { bubbles: true }));
    await wait(100);

    const contentsBtn = [...doc.querySelectorAll('.tf-section-btn')].find((b) => b.dataset.section === 'contents');
    contentsBtn.click();
    await wait(150);
    const titleInput = doc.querySelector(`.tf-song-title-input[data-page="${firstPage}"]`);
    titleInput.value = 'EDITED PAGE TITLE';
    titleInput.dispatchEvent(new win.Event('change', { bubbles: true }));
    await wait(100);

    // Navigate fully away and re-open fresh - the real test of whether this is genuine
    // state on the one shared record, not just a DOM value a re-render would discard.
    doc.getElementById('tab-library').click();
    await wait(200);
    const browseRow = [...doc.querySelectorAll('.lib-edition-row')].find((r) => r.textContent.includes('ScH1855'));
    assert.ok(browseRow.textContent.includes('EDITED VIA LEVEL 3 EDITOR'),
      'Common Name must survive a full re-open, proving it lives on the real Library record - the same libraryData object Minutes\u2019 own projection is built from, not a separate copy');
    const editBtn2 = browseRow.querySelector('.lib-edit-edition-btn');
    editBtn2.click();
    await wait(500);
    assert.equal(doc.getElementById('tf_library_commonName').value, 'EDITED VIA LEVEL 3 EDITOR',
      'A fresh re-open of the Level 3 editor itself must also show the persisted edit');
  });

  test('the Level 3 source editor reflects and edits the real canonical source schema, not a hand-invented one', async () => {
    const { doc, win } = await openScH1855Editor();
    const sourcesBtn = [...doc.querySelectorAll('.tf-section-btn')].find((b) => b.dataset.section === 'sources');
    sourcesBtn.click();
    await wait(150);
    const allBtn = [...doc.querySelectorAll('.tf-view-btn')].find((b) => b.dataset.view === 'all');
    allBtn.click();
    await wait(150);

    const citationInputs = [...doc.querySelectorAll('.tf-array-item-input[data-key="citation"]')];
    assert.ok(citationInputs.length > 0, 'Real existing sources should show their real citation values');
    const sourceIdInputs = [...doc.querySelectorAll('.tf-array-item-input[data-key="sourceId"]')];
    assert.ok(sourceIdInputs.length > 0, 'Real existing sources should expose sourceId, the actual canonical field - not a hand-invented "type"/"note" pair');
    assert.equal(doc.querySelectorAll('.tf-array-item-input[data-key="type"]').length, 0, 'The old, wrong "type" field should not appear anywhere');
    assert.equal(doc.querySelectorAll('.tf-array-item-input[data-key="note"]').length, 0, 'The old, wrong "note" field should not appear anywhere (real field is "notes")');
  });

  test('editing verseCount preserves it as a real number, not a string', async () => {
    const { doc, win } = await openScH1855Editor();
    const contentsBtn = [...doc.querySelectorAll('.tf-section-btn')].find((b) => b.dataset.section === 'contents');
    contentsBtn.click();
    await wait(150);
    const allBtn = [...doc.querySelectorAll('.tf-view-btn')].find((b) => b.dataset.view === 'all');
    allBtn.click();
    await wait(150);
    // V79-05: enriched fields are collapsed per-song by default now, so a real song must
    // be expanded before its field inputs exist in the DOM at all. Only the first song
    // needs expanding here - clicking every expand button in a loop (hundreds of full
    // re-renders for a real 221-song book) is real, measured-out-the-hard-way slow, not
    // just theoretically so, and this test only needs one real verseCount input to edit.
    const firstExpandBtn = doc.querySelector('.tf-song-expand-btn');
    assert.ok(firstExpandBtn, 'At least one song should have a real expand control in All view');
    firstExpandBtn.click();
    await wait(150);

    const verseCountInputs = [...doc.querySelectorAll('.tf-song-field-input[data-key="verseCount"]')];
    assert.ok(verseCountInputs.length > 0, 'At least one real song should have a verseCount field to edit');
    const numericInputs = verseCountInputs.filter((el) => el.type === 'number');
    assert.equal(numericInputs.length, verseCountInputs.length, 'verseCount fields should render as real number inputs, not generic text');

    const target = verseCountInputs[0];
    const page = target.dataset.page;
    target.value = '4';
    target.dispatchEvent(new win.Event('change', { bubbles: true }));
    await wait(100);

    let capturedText = null;
    win.URL.createObjectURL = function () { return 'blob:test'; };
    win.URL.revokeObjectURL = function () {};
    const OrigBlob = win.Blob;
    win.Blob = function (parts, opts) { capturedText = parts[0]; return new OrigBlob(parts, opts); };
    win.HTMLAnchorElement.prototype.click = function () {};
    doc.getElementById('tfSaveBtn').click();
    await wait(200);

    const saved = JSON.parse(capturedText);
    assert.equal(typeof saved.songs[page].verseCount, 'number', 'verseCount must round-trip as a real number');
    assert.equal(saved.songs[page].verseCount, 4);
  });

  test('saving downloads a genuinely complete, standalone document - current Library values merged with Level 3 enrichment, not a stale or partial copy', async () => {
    const { doc, win, originalText } = await openScH1855Editor();
    const original = JSON.parse(originalText);
    const firstPage = Object.keys(original.songs).sort((a, b) => parseInt(a, 10) - parseInt(b, 10))[0];

    const commonNameField = doc.getElementById('tf_library_commonName');
    commonNameField.value = 'Assembled Document Test';
    commonNameField.dispatchEvent(new win.Event('change', { bubbles: true }));
    await wait(100);

    const contentsBtn = [...doc.querySelectorAll('.tf-section-btn')].find((b) => b.dataset.section === 'contents');
    contentsBtn.click();
    await wait(150);
    const titleInput = doc.querySelector(`.tf-song-title-input[data-page="${firstPage}"]`);
    titleInput.value = original.songs[firstPage].title + ' (edited)';
    titleInput.dispatchEvent(new win.Event('change', { bubbles: true }));
    await wait(100);

    let capturedText = null;
    win.URL.createObjectURL = function () { return 'blob:test'; };
    win.URL.revokeObjectURL = function () {};
    const OrigBlob = win.Blob;
    win.Blob = function (parts, opts) { capturedText = parts[0]; return new OrigBlob(parts, opts); };
    win.HTMLAnchorElement.prototype.click = function () {};
    doc.getElementById('tfSaveBtn').click();
    await wait(200);

    const saved = JSON.parse(capturedText);
    assert.equal(saved.book.commonName, 'Assembled Document Test',
      'The downloaded document must reflect the current Library value, not a stale copy frozen at load time');
    assert.equal(saved.songs[firstPage].title, original.songs[firstPage].title + ' (edited)');
    assert.deepStrictEqual(saved.scholarlyRecord, original.scholarlyRecord,
      'Untouched Level 3 enrichment (scholarlyRecord) must still be present in the assembled document');
  });
});

describe('Exhaustive Level 3 fixture round-trip - every bundled file, not just one (v76 follow-up review, Release Gate critical item)', () => {
  const fixtureCodes = ['CSH1934', 'NSH1884', 'ScH1855', 'ShH2012', 'SoH1854', 'VPH2024'];

  fixtureCodes.forEach((code) => {
    test(`${code}: loading then saving with zero edits preserves every real field the original had, losslessly`, async () => {
      const dom = loadPage('tunebooks.html');
      const win = dom.window; win.confirm = () => true;
      await wait(700);
      const doc = win.document;
      const originalText = fs.readFileSync(suitePath(`tunebook-files/${code}.json`), 'utf8');
      const original = JSON.parse(originalText);
      win.fetch = async () => ({ ok: true, json: async () => JSON.parse(originalText) });

      doc.getElementById('tab-library').click();
      await wait(300);
      const editBtn = [...doc.querySelectorAll('.lib-edit-edition-btn')].find(
        (b) => b.closest('.lib-edition-row').textContent.includes(code)
      );
      assert.ok(editBtn, `A real Edit button for ${code} should exist in the Library browse list`);
      editBtn.click();
      await wait(300);
      doc.getElementById('loadTunebookFileBtn').click();
      await wait(300);
      assert.equal(doc.getElementById('tunebookFileEditor').style.display, 'block', `${code} should load into a working editor`);

      let capturedText = null;
      win.URL.createObjectURL = function () { return 'blob:test'; };
      win.URL.revokeObjectURL = function () {};
      const OrigBlob = win.Blob;
      win.Blob = function (parts, opts) { capturedText = parts[0]; return new OrigBlob(parts, opts); };
      win.HTMLAnchorElement.prototype.click = function () {};
      doc.getElementById('tfSaveBtn').click();
      await wait(200);
      assert.ok(capturedText, `${code} should save successfully with zero edits (a real bundled fixture must already pass its own validation)`);
      const saved = JSON.parse(capturedText);

      // Every real top-level key the original had must still be present with an
      // equivalent value - not a byte-identical dump (Save legitimately assembles book.*
      // fresh from the Library rather than passing the raw object through), but nothing
      // real should be silently dropped.
      Object.keys(original).forEach((key) => {
        assert.ok(key in saved, `Original key "${key}" must still be present in ${code}'s saved output`);
      });
      assert.deepStrictEqual(saved.songs, original.songs, `${code}'s full song index (titles plus every enrichment field) must round-trip exactly with zero edits`);
      assert.deepStrictEqual(saved.scholarlyRecord, original.scholarlyRecord, `${code}'s scholarlyRecord must round-trip exactly`);
      assert.deepStrictEqual(saved.sources, original.sources, `${code}'s sources must round-trip exactly`);
      assert.deepStrictEqual(saved.relationships, original.relationships, `${code}'s relationships must round-trip exactly`);
      assert.deepStrictEqual(saved.states, original.states, `${code}'s states array must round-trip exactly even with no editing policy of its own`);
      assert.equal(saved.book.titleProper, original.book.titleProper);
      assert.equal(saved.book.compiler, original.book.compiler);
    });
  });
});

describe('Incomplete Fields shows genuinely incomplete array items, not just non-empty arrays wholesale (v76 follow-up review, Release Gate checklist)', () => {
  test('an array with one incomplete entry among otherwise-complete ones shows only the incomplete entry in Incomplete view, and Remove still targets the real underlying item', async () => {
    const { doc, win } = await openScH1855Editor();
    const sourcesBtn = [...doc.querySelectorAll('.tf-section-btn')].find((b) => b.dataset.section === 'sources');
    sourcesBtn.click();
    await wait(150);
    const allBtn = [...doc.querySelectorAll('.tf-view-btn')].find((b) => b.dataset.view === 'all');
    allBtn.click();
    await wait(150);

    const sourceUrls = [...doc.querySelectorAll('.tf-array-item-input[data-key="url"]')].filter((el) => el.dataset.arrayPath === 'sources');
    assert.ok(sourceUrls.length >= 2, 'Real ScH1855 data should have at least two sources to test with');
    sourceUrls[0].value = '';
    sourceUrls[0].dispatchEvent(new win.Event('change', { bubbles: true }));
    await wait(100);

    const incompleteBtn = [...doc.querySelectorAll('.tf-view-btn')].find((b) => b.dataset.view === 'incomplete');
    incompleteBtn.click();
    await wait(150);

    const visibleCitations = [...doc.querySelectorAll('.tf-array-item-input[data-key="citation"]')].filter((el) => el.dataset.arrayPath === 'sources');
    assert.equal(visibleCitations.length, 1, 'Only the genuinely incomplete source should show, not the whole array (all-or-nothing) and not all sources');

    const removeBtn = doc.querySelector('.tf-array-remove-btn[data-array-path="sources"]');
    removeBtn.click();
    await wait(100);
    const allBtn2 = [...doc.querySelectorAll('.tf-view-btn')].find((b) => b.dataset.view === 'all');
    allBtn2.click();
    await wait(150);
    const remaining = [...doc.querySelectorAll('.tf-array-item-input[data-key="citation"]')].filter((el) => el.dataset.arrayPath === 'sources');
    assert.equal(remaining.length, sourceUrls.length - 1, 'Remove must target the real underlying array item, not a filtered display index');
  });
});

describe('Level 3 save validation gate (v68 review R68-04)', () => {
  async function attemptSaveAndCapture(doc, win) {
    let capturedText = null;
    win.URL.createObjectURL = function () { return 'blob:test'; };
    win.URL.revokeObjectURL = function () {};
    const OrigBlob = win.Blob;
    win.Blob = function (parts, opts) { capturedText = parts[0]; return new OrigBlob(parts, opts); };
    win.HTMLAnchorElement.prototype.click = function () {};
    doc.getElementById('tfSaveBtn').click();
    await wait(100);
    return capturedText;
  }

  test('a blank Title Proper blocks Save with a clear message, rather than downloading an invalid file', async () => {
    const { doc, win } = await openScH1855Editor();
    doc.getElementById('tf_library_titleProper').value = '';
    doc.getElementById('tf_library_titleProper').dispatchEvent(new win.Event('change', { bubbles: true }));
    await wait(100);
    const captured = await attemptSaveAndCapture(doc, win);
    assert.equal(captured, null, 'Save must not produce a file when a required field is blank');
    assert.match(doc.getElementById('tfSaveStatus').textContent, /Title Proper is required/);
  });

  test('a blank page title blocks Save', async () => {
    const { doc, win } = await openScH1855Editor();
    const contentsBtn = [...doc.querySelectorAll('.tf-section-btn')].find((b) => b.dataset.section === 'contents');
    contentsBtn.click();
    await wait(150);
    const titleInput = doc.querySelector('.tf-song-title-input');
    titleInput.value = '';
    titleInput.dispatchEvent(new win.Event('change', { bubbles: true }));
    await wait(100);
    const captured = await attemptSaveAndCapture(doc, win);
    assert.equal(captured, null);
    assert.match(doc.getElementById('tfSaveStatus').textContent, /have no title/);
  });

  test('a Source entry missing a Citation blocks Save; a Bibliography entry missing a Citation also blocks Save', async () => {
    const { doc, win } = await openScH1855Editor();
    const sourcesBtn = [...doc.querySelectorAll('.tf-section-btn')].find((b) => b.dataset.section === 'sources');
    sourcesBtn.click();
    await wait(150);
    const allBtn = [...doc.querySelectorAll('.tf-view-btn')].find((b) => b.dataset.view === 'all');
    allBtn.click();
    await wait(150);

    const sourceCitation = [...doc.querySelectorAll('.tf-array-item-input[data-key="citation"]')].find((el) => el.dataset.arrayPath === 'sources');
    sourceCitation.value = '';
    sourceCitation.dispatchEvent(new win.Event('change', { bubbles: true }));
    await wait(100);
    let captured = await attemptSaveAndCapture(doc, win);
    assert.equal(captured, null, 'A Source missing its Citation must block Save');
    assert.match(doc.getElementById('tfSaveStatus').textContent, /Source #1 is missing a Citation/);

    sourceCitation.value = 'Restored';
    sourceCitation.dispatchEvent(new win.Event('change', { bubbles: true }));
    await wait(100);
    const bibCitation = [...doc.querySelectorAll('.tf-array-item-input[data-key="citation"]')].find((el) => el.dataset.arrayPath === 'scholarlyRecord.bibliography');
    bibCitation.value = '';
    bibCitation.dispatchEvent(new win.Event('change', { bubbles: true }));
    await wait(100);
    captured = await attemptSaveAndCapture(doc, win);
    assert.equal(captured, null, 'A Bibliography entry missing its Citation must also block Save');
    assert.match(doc.getElementById('tfSaveStatus').textContent, /Bibliography entry #1 is missing a Citation/);
  });

  test('a genuinely valid record saves successfully', async () => {
    const { doc, win } = await openScH1855Editor();
    const captured = await attemptSaveAndCapture(doc, win);
    assert.ok(captured, 'A real, unmodified, valid Level 3 file should save without any blocking error');
    assert.match(doc.getElementById('tfSaveStatus').textContent, /Downloaded/);
  });
});

describe('Full Title is genuinely derived from Title Proper + Subtitle (v68 review R68-13)', () => {
  // This test used to load minutes.html as well, asserting that BOTH apps' full titles
  // include the subtitle. That was a genuine cross-app contract - and the one test in this
  // file that stopped Tunebooks from being able to run its own suite once the two apps
  // stopped sharing a repo. The contract itself is really about buildFullTitle() in
  // shared-utils.js, which both sides call, so it is now asserted from each side
  // separately: the Minutes projection in minutes-full-title.test.js, the Tunebooks export
  // here. Neither repo has to carry the other's application file to check its own half.
  test('the Tunebooks contribution export produces a genuinely full title, not just Title Proper', async () => {
    const dom2 = loadPage('tunebooks.html');
    const win2 = dom2.window; win2.confirm = () => true;
    await wait(700);
    const doc2 = win2.document;
    doc2.getElementById('tab-export').click();
    await wait(300);
    const sel = doc2.getElementById('exportBookSelect');
    const soHOpt = [...sel.options].find((o) => o.textContent.includes('SoH1854'));
    sel.value = soHOpt.value;
    sel.dispatchEvent(new win2.Event('change'));
    await wait(200);

    let capturedText = null;
    win2.URL.createObjectURL = function () { return 'blob:test'; };
    win2.URL.revokeObjectURL = function () {};
    const OrigBlob = win2.Blob;
    win2.Blob = function (parts, opts) { capturedText = parts[0]; return new OrigBlob(parts, opts); };
    win2.HTMLAnchorElement.prototype.click = function () {};
    doc2.getElementById('exportContributionBtn').click();
    await wait(200);
    const payload = JSON.parse(capturedText);
    assert.match(payload.book.fullTitle, /New Edition, Thoroughly Revised/,
      'The Tunebooks contribution export must also produce a genuinely full title, not just titleProper');
  });
});

describe('Library edit form labels are humanized, not raw property names (v68 review R68-09)', () => {
  test('every generic field label is real, readable text - no raw camelCase JS property name is shown to a person', async () => {
    const dom = loadPage('tunebooks.html');
    const win = dom.window; win.confirm = () => true;
    await wait(700);
    const doc = win.document;
    doc.getElementById('tab-library').click();
    await wait(300);
    // SHD1936, not ScH1855 - a Level 1 Edition (no Tunebook File), so Common Name still
    // shows here. For a real Level 3 Edition like ScH1855, Common Name now lives only in
    // the Level 3 editor's own Identity tab (Kevin's own report, see the describe block
    // above this one) - the label-humanization behavior this test checks is a property
    // of the generic form in general, not specific to which fields happen to still
    // appear in it for any one particular book.
    const editBtn = [...doc.querySelectorAll('.lib-edit-edition-btn')].find(
      (b) => b.closest('.lib-edition-row').textContent.includes('SHD1936')
    );
    editBtn.click();
    await wait(300);

    const labels = [...doc.querySelectorAll('#libraryEditFields label')].map((l) => l.textContent);
    assert.ok(labels.length > 0, 'Real editable fields should be present to check');
    labels.forEach((label) => {
      assert.doesNotMatch(label, /^[a-z][a-zA-Z]*$/, `"${label}" looks like a raw camelCase property name, not a real label`);
    });
    assert.ok(labels.includes('Common Name'));
    assert.ok(labels.includes('SHMHA Code'), 'Acronym fields need an explicit override, not a naive word-split');
  });
});

describe('Contribution export includes Level 3 edits when available, and states clearly when it doesn\u2019t (v68 review R68-12)', () => {
  test('exporting a DIFFERENT edition while a mismatched Level 3 file is loaded never merges that stale data in - Release Gate critical item', async () => {
    const dom = loadPage('tunebooks.html');
    const win = dom.window; win.confirm = () => true;
    await wait(700);
    const doc = win.document;
    win.fetch = async (path) => {
      const filename = path.split('/').pop();
      return { ok: true, json: async () => JSON.parse(fs.readFileSync(suitePath('tunebook-files/' + filename), 'utf8')) };
    };

    doc.getElementById('tab-library').click();
    await wait(300);
    const editBtn = [...doc.querySelectorAll('.lib-edit-edition-btn')].find(
      (b) => b.closest('.lib-edition-row').textContent.includes('ScH1855')
    );
    editBtn.click();
    await wait(300);
    doc.getElementById('loadTunebookFileBtn').click();
    await wait(300);

    doc.getElementById('tab-export').click();
    await wait(300);
    const sel = doc.getElementById('exportBookSelect');
    const soHOpt = [...sel.options].find((o) => o.textContent.includes('SoH1854'));
    sel.value = soHOpt.value;
    sel.dispatchEvent(new win.Event('change'));
    await wait(200);

    let capturedText = null;
    win.URL.createObjectURL = function () { return 'blob:test'; };
    win.URL.revokeObjectURL = function () {};
    const OrigBlob = win.Blob;
    win.Blob = function (parts, opts) { capturedText = parts[0]; return new OrigBlob(parts, opts); };
    win.HTMLAnchorElement.prototype.click = function () {};
    doc.getElementById('exportContributionBtn').click();
    await wait(200);

    const payload = JSON.parse(capturedText);
    assert.equal(payload.editionCode, 'SoH1854');
    assert.equal(payload.includesLevel3Record, false, 'ScH1855\u2019s loaded scholarly data must not be attributed to SoH1854 just because it happens to be in memory');
    assert.ok(!('scholarlyRecord' in payload.book), 'No cross-edition scholarlyRecord should leak into an unrelated export');
  });

  test('exporting a Level 3 edition whose file is NOT currently open in this session clearly says so, and includes no scholarlyRecord', async () => {
    const dom = loadPage('tunebooks.html');
    const win = dom.window; win.confirm = () => true;
    await wait(700);
    const doc = win.document;

    doc.getElementById('tab-export').click();
    await wait(300);
    const sel = doc.getElementById('exportBookSelect');
    const schOpt = [...sel.options].find((o) => o.textContent.includes('ScH1855'));
    sel.value = schOpt.value;
    sel.dispatchEvent(new win.Event('change'));
    await wait(200);

    assert.match(doc.getElementById('exportDetails').textContent, /hasn.t been opened in this session/);

    let capturedText = null;
    win.URL.createObjectURL = function () { return 'blob:test'; };
    win.URL.revokeObjectURL = function () {};
    const OrigBlob = win.Blob;
    win.Blob = function (parts, opts) { capturedText = parts[0]; return new OrigBlob(parts, opts); };
    win.HTMLAnchorElement.prototype.click = function () {};
    doc.getElementById('exportContributionBtn').click();
    await wait(200);

    const payload = JSON.parse(capturedText);
    assert.equal(payload.includesLevel3Record, false);
    assert.ok(!('scholarlyRecord' in payload.book), 'No scholarlyRecord should be present when the Level 3 file was never opened');
  });

  test('exporting a Level 3 edition whose file IS open in this session includes the real scholarly record and per-song enrichment', async () => {
    const dom = loadPage('tunebooks.html');
    const win = dom.window; win.confirm = () => true;
    await wait(700);
    const doc = win.document;
    win.fetch = async () => ({ ok: true, json: async () => JSON.parse(fs.readFileSync(suitePath('tunebook-files/ScH1855.json'), 'utf8')) });

    doc.getElementById('tab-library').click();
    await wait(200);
    const editBtn = [...doc.querySelectorAll('.lib-edit-edition-btn')].find(
      (b) => b.closest('.lib-edition-row').textContent.includes('ScH1855')
    );
    editBtn.click();
    await wait(200);
    doc.getElementById('loadTunebookFileBtn').click();
    await wait(300);

    doc.getElementById('tab-export').click();
    await wait(300);
    const sel = doc.getElementById('exportBookSelect');
    const schOpt = [...sel.options].find((o) => o.textContent.includes('ScH1855'));
    sel.value = schOpt.value;
    sel.dispatchEvent(new win.Event('change'));
    await wait(200);
    assert.match(doc.getElementById('exportDetails').textContent, /is open in this session/);

    let capturedText = null;
    win.URL.createObjectURL = function () { return 'blob:test'; };
    win.URL.revokeObjectURL = function () {};
    const OrigBlob = win.Blob;
    win.Blob = function (parts, opts) { capturedText = parts[0]; return new OrigBlob(parts, opts); };
    win.HTMLAnchorElement.prototype.click = function () {};
    doc.getElementById('exportContributionBtn').click();
    await wait(200);

    const payload = JSON.parse(capturedText);
    assert.equal(payload.includesLevel3Record, true);
    assert.ok(payload.book.sources && payload.book.sources.length > 0, 'Real sources must be included');
    assert.equal(payload.book.songs['17'].title, 'Old Hundred', 'Title stays the current Library value');
    assert.equal(payload.book.songs['17'].meter, '8.8.8.8', 'Real per-song enrichment must be merged in from the loaded Level 3 file');
  });
});

describe('Contribution export includes book.notes and every field the same assembly Save uses (v79 ground-up review V79-04)', () => {
  test('editing book.notes and exporting a contribution genuinely includes the edit, and the contribution\u2019s book equals the same document Save would produce', async () => {
    const dom = loadPage('tunebooks.html');
    const win = dom.window; win.confirm = () => true;
    await wait(700);
    const doc = win.document;
    win.fetch = async () => ({ ok: true, json: async () => JSON.parse(fs.readFileSync(suitePath('tunebook-files/ScH1855.json'), 'utf8')) });

    doc.getElementById('tab-library').click();
    await wait(300);
    const editBtn = [...doc.querySelectorAll('.lib-edit-edition-btn')].find(
      (b) => b.closest('.lib-edition-row').textContent.includes('ScH1855')
    );
    editBtn.click();
    await wait(300);
    doc.getElementById('loadTunebookFileBtn').click();
    await wait(300);

    const sourcesBtn = [...doc.querySelectorAll('.tf-section-btn')].find((b) => b.dataset.section === 'sources');
    sourcesBtn.click();
    await wait(150);
    const allBtn = [...doc.querySelectorAll('.tf-view-btn')].find((b) => b.dataset.view === 'all');
    allBtn.click();
    await wait(150);
    const notesField = doc.getElementById('tf_level3_book_notes');
    assert.ok(notesField, 'book.notes must have a real editable field');
    notesField.value = 'A real, edited note for the contribution export test.';
    notesField.dispatchEvent(new win.Event('change', { bubbles: true }));
    await wait(100);

    // Capture what Save itself would produce, for the direct equality check below.
    let savedText = null;
    win.URL.createObjectURL = function () { return 'blob:test'; };
    win.URL.revokeObjectURL = function () {};
    win.HTMLAnchorElement.prototype.click = function () {};
    const OrigBlob = win.Blob;
    win.Blob = function (parts, opts) { savedText = parts[0]; return new OrigBlob(parts, opts); };
    doc.getElementById('tfSaveBtn').click();
    await wait(200);
    const savedDoc = JSON.parse(savedText);

    doc.getElementById('tab-export').click();
    await wait(300);
    const sel = doc.getElementById('exportBookSelect');
    const schOpt = [...sel.options].find((o) => o.textContent.includes('ScH1855'));
    sel.value = schOpt.value;
    sel.dispatchEvent(new win.Event('change'));
    await wait(200);

    let capturedText = null;
    win.Blob = function (parts, opts) { capturedText = parts[0]; return new OrigBlob(parts, opts); };
    doc.getElementById('exportContributionBtn').click();
    await wait(200);
    const payload = JSON.parse(capturedText);

    assert.equal(payload.book.notes, 'A real, edited note for the contribution export test.',
      'book.notes must genuinely be present in the contribution, not silently dropped');
    assert.equal(payload.book.publicationYear, savedDoc.book.publicationYear);

    // The review's own required test: the contribution's Level 3 payload should be
    // derived from the same canonical assembled document Save uses, not a second,
    // separately-maintained field list that can drift from it.
    assert.deepStrictEqual(payload.book.scholarlyRecord, savedDoc.scholarlyRecord);
    assert.deepStrictEqual(payload.book.sources, savedDoc.sources);
    assert.deepStrictEqual(payload.book.relationships, savedDoc.relationships);
    assert.deepStrictEqual(payload.book.states, savedDoc.states);
    assert.equal(payload.book.publicationStatus, savedDoc.publicationStatus);
    assert.equal(payload.book.internalNote, savedDoc.internalNote);
    assert.equal(payload.book.notes, savedDoc.book.notes);
  });
});

describe('Contribution export cannot bypass Level 3 validation (v89 release-readiness review, finding 1)', () => {
  test('an invalid Level 3 state that blocks Save also blocks Export, in the same session, with no reload needed', async () => {
    const dom = loadPage('tunebooks.html');
    const win = dom.window; win.confirm = () => true;
    await wait(700);
    const doc = win.document;
    win.fetch = async () => ({ ok: true, json: async () => JSON.parse(fs.readFileSync(suitePath('tunebook-files/ScH1855.json'), 'utf8')) });

    doc.getElementById('tab-library').click();
    await wait(300);
    const row = [...doc.querySelectorAll('.lib-edition-row')].find((r) => r.textContent.includes('ScH1855'));
    row.querySelector('.lib-edit-edition-btn').click();
    await wait(300);
    doc.getElementById('loadTunebookFileBtn').click();
    await wait(300);

    // A real Source entry through the real UI, deliberately left incomplete - this is
    // the review's own "Source missing Citation" reproduction category.
    const sourcesBtn = [...doc.querySelectorAll('.tf-section-btn')].find((b) => b.dataset.section === 'sources');
    sourcesBtn.click();
    await wait(150);
    const allBtn = [...doc.querySelectorAll('.tf-view-btn')].find((b) => b.dataset.view === 'all');
    if (allBtn) { allBtn.click(); await wait(150); }
    const addBtn = [...doc.querySelectorAll('.tf-array-add-btn')].find((b) => b.dataset.arrayPath === 'sources');
    addBtn.click();
    await wait(150);

    doc.getElementById('tfSaveBtn').click();
    await wait(200);
    assert.match(doc.getElementById('tfSaveStatus').textContent, /Can.t save yet/,
      'Sanity check: this invalid state must genuinely block canonical Level 3 Save, or this test proves nothing');

    doc.getElementById('tab-export').click();
    await wait(300);
    const sel = doc.getElementById('exportBookSelect');
    const opt = [...sel.options].find((o) => o.textContent.includes('ScH1855'));
    sel.value = opt.value;
    sel.dispatchEvent(new win.Event('change'));
    await wait(200);

    assert.ok(doc.getElementById('exportContributionBtn').disabled,
      'The same data Save just refused must also disable the Export button, not just show a warning');
    assert.match(doc.getElementById('exportDetails').textContent, /missing a Citation/,
      'The Export panel must show the real Level 3 validation error, not a generic or absent message');

    // Defense in depth: even a direct click while invalid must not produce a download.
    let downloadTriggered = false;
    win.URL.createObjectURL = function () { downloadTriggered = true; return 'blob:test'; };
    doc.getElementById('exportContributionBtn').click();
    await wait(100);
    assert.ok(!downloadTriggered, 'Clicking a disabled-for-good-reason export button must not produce a download regardless');
  });

  test('a genuinely valid Level 3 state is unaffected - no false positive from the combined validator', async () => {
    const dom = loadPage('tunebooks.html');
    const win = dom.window; win.confirm = () => true;
    await wait(700);
    const doc = win.document;
    win.fetch = async () => ({ ok: true, json: async () => JSON.parse(fs.readFileSync(suitePath('tunebook-files/ScH1855.json'), 'utf8')) });

    doc.getElementById('tab-library').click();
    await wait(300);
    const row = [...doc.querySelectorAll('.lib-edition-row')].find((r) => r.textContent.includes('ScH1855'));
    row.querySelector('.lib-edit-edition-btn').click();
    await wait(300);
    doc.getElementById('loadTunebookFileBtn').click();
    await wait(300);

    doc.getElementById('tab-export').click();
    await wait(300);
    const sel = doc.getElementById('exportBookSelect');
    const opt = [...sel.options].find((o) => o.textContent.includes('ScH1855'));
    sel.value = opt.value;
    sel.dispatchEvent(new win.Event('change'));
    await wait(200);

    assert.ok(!doc.getElementById('exportContributionBtn').disabled, 'A genuinely valid Level 3 state must remain exportable');
    assert.match(doc.getElementById('exportDetails').textContent, /No issues found/);

    let capturedText = null;
    win.URL.createObjectURL = function () { return 'blob:test'; };
    win.URL.revokeObjectURL = function () {};
    win.HTMLAnchorElement.prototype.click = function () {};
    win.Blob = function (parts) { capturedText = parts[0]; return {}; };
    doc.getElementById('exportContributionBtn').click();
    await wait(200);
    assert.ok(capturedText, 'A genuinely valid export must still actually succeed, not just report itself as valid');
  });
});

describe('Edit Tunebook Close cannot bypass the Level 3 dirty-session guard (v89 release-readiness review, finding 2)', () => {
  test('a dirty Level 3 session requires a real decision before Close proceeds', async () => {
    const dom = loadPage('tunebooks.html');
    const win = dom.window;
    await wait(700);
    const doc = win.document;
    win.fetch = async () => ({ ok: true, json: async () => JSON.parse(fs.readFileSync(suitePath('tunebook-files/ScH1855.json'), 'utf8')) });

    doc.getElementById('tab-library').click();
    await wait(300);
    const row = [...doc.querySelectorAll('.lib-edition-row')].find((r) => r.textContent.includes('ScH1855'));
    row.querySelector('.lib-edit-edition-btn').click();
    await wait(300);
    doc.getElementById('loadTunebookFileBtn').click();
    await wait(300);
    const sourcesBtn = [...doc.querySelectorAll('.tf-section-btn')].find((b) => b.dataset.section === 'sources');
    sourcesBtn.click();
    await wait(150);
    const allBtn = [...doc.querySelectorAll('.tf-view-btn')].find((b) => b.dataset.view === 'all');
    if (allBtn) { allBtn.click(); await wait(150); }
    const notesField = doc.getElementById('tf_level3_scholarlyRecord_historicalNotes');
    notesField.value = 'An unsaved test edit.';
    notesField.dispatchEvent(new win.Event('change', { bubbles: true }));
    await wait(100);

    let confirmCalled = false;
    win.confirm = () => { confirmCalled = true; return false; }; // Cancel
    doc.getElementById('libraryEditCloseBtn').click();
    await wait(200);

    assert.ok(confirmCalled, 'A dirty Close must actually prompt, not silently discard');
    assert.notEqual(doc.getElementById('libraryEditPanel').style.display, 'none',
      'Canceling the prompt must genuinely keep the editor open, not close it anyway');
    assert.equal(doc.getElementById('tf_level3_scholarlyRecord_historicalNotes').value, 'An unsaved test edit.',
      'The unsaved edit must still be sitting there, untouched, after Cancel');
  });

  test('a clean Close (no unsaved edits) requires no prompt and fully resets Level 3 session state', async () => {
    const dom = loadPage('tunebooks.html');
    const win = dom.window;
    await wait(700);
    const doc = win.document;
    win.fetch = async () => ({ ok: true, json: async () => JSON.parse(fs.readFileSync(suitePath('tunebook-files/ScH1855.json'), 'utf8')) });

    doc.getElementById('tab-library').click();
    await wait(300);
    const row = [...doc.querySelectorAll('.lib-edition-row')].find((r) => r.textContent.includes('ScH1855'));
    row.querySelector('.lib-edit-edition-btn').click();
    await wait(300);
    doc.getElementById('loadTunebookFileBtn').click();
    await wait(300);

    win.confirm = () => { throw new Error('confirm() must not be called for a genuinely clean close'); };
    doc.getElementById('libraryEditCloseBtn').click();
    await wait(150);

    assert.equal(doc.getElementById('libraryEditPanel').style.display, 'none', 'A clean close must actually close');
    assert.notEqual(doc.getElementById('tunebookFileEditor').style.display, 'block',
      'The Level 3 editor must be hidden - full session reset, not just the outer panel');
  });

  test('closing edition A (discarding an unsaved edit) then opening edition B never leaks A own Level 3 state into B', async () => {
    const dom = loadPage('tunebooks.html');
    const win = dom.window; win.confirm = () => true; // discard when prompted
    await wait(700);
    const doc = win.document;
    win.fetch = async (path) => {
      const filename = path.split('/').pop();
      return { ok: true, json: async () => JSON.parse(fs.readFileSync(suitePath('tunebook-files/' + filename), 'utf8')) };
    };

    // A: load, make an unsaved edit, Close (discarding)
    doc.getElementById('tab-library').click();
    await wait(300);
    const rowA = [...doc.querySelectorAll('.lib-edition-row')].find((r) => r.textContent.includes('ScH1855'));
    rowA.querySelector('.lib-edit-edition-btn').click();
    await wait(300);
    doc.getElementById('loadTunebookFileBtn').click();
    await wait(300);
    const sourcesBtnA = [...doc.querySelectorAll('.tf-section-btn')].find((b) => b.dataset.section === 'sources');
    sourcesBtnA.click();
    await wait(150);
    let allBtn = [...doc.querySelectorAll('.tf-view-btn')].find((b) => b.dataset.view === 'all');
    if (allBtn) { allBtn.click(); await wait(150); }
    doc.getElementById('tf_level3_scholarlyRecord_historicalNotes').value = 'A own stale, unsaved value.';
    doc.getElementById('tf_level3_scholarlyRecord_historicalNotes').dispatchEvent(new win.Event('change', { bubbles: true }));
    await wait(100);
    doc.getElementById('libraryEditCloseBtn').click();
    await wait(200);

    // B: a genuinely different edition, with its own real Level 3 file loaded
    doc.getElementById('tab-library').click();
    await wait(200);
    const rowB = [...doc.querySelectorAll('.lib-edition-row')].find((r) => r.textContent.includes('SoH1854'));
    rowB.querySelector('.lib-edit-edition-btn').click();
    await wait(300);
    doc.getElementById('loadTunebookFileBtn').click();
    await wait(300);
    const sourcesBtnB = [...doc.querySelectorAll('.tf-section-btn')].find((b) => b.dataset.section === 'sources');
    sourcesBtnB.click();
    await wait(150);
    allBtn = [...doc.querySelectorAll('.tf-view-btn')].find((b) => b.dataset.view === 'all');
    if (allBtn) { allBtn.click(); await wait(150); }

    const bField = doc.getElementById('tf_level3_scholarlyRecord_historicalNotes');
    assert.notEqual(bField.value, 'A own stale, unsaved value.',
      'B own field must never show A own stale, discarded text - no visible editor may have two different record owners at once');
    assert.ok(bField.value.length > 0, 'B own field must show B own real, genuine data, not just an absence of A data');
  });
});

describe('Discard genuinely rolls back Library-owned fields edited through the Level 3 editor, not just the Level 3 file half (v91 release-readiness review, finding 1)', () => {
  test('a shared scalar field (Common Name) reverts on Discard, confirmed via the real Library browse row - an independent, read-only display of the same field, not the Level 3 form asking itself', async () => {
    const dom = loadPage('tunebooks.html');
    const win = dom.window; win.confirm = () => true;
    await wait(700);
    const doc = win.document;
    win.fetch = async () => ({ ok: true, json: async () => JSON.parse(fs.readFileSync(suitePath('tunebook-files/ScH1855.json'), 'utf8')) });

    doc.getElementById('tab-library').click();
    await wait(300);
    let row = [...doc.querySelectorAll('.lib-edition-row')].find((r) => r.textContent.includes('ScH1855'));
    // Common Name now lives only in the Level 3 editor's own Identity tab for a real
    // Level 3 Edition like this one (Kevin's own report and stated principle - no two
    // places to edit one field) - the generic top form no longer has a findable Common
    // Name input for it at all, so this can't verify "the revert reached the shared
    // record" that way any more. The Library browse row's own text is a genuinely
    // independent, real verification instead - it reads commonName directly off the
    // same libraryData object, just via a completely different, read-only render path.
    const original = row.textContent;
    row.querySelector('.lib-edit-edition-btn').click();
    await wait(300);
    const identityBtn = [...doc.querySelectorAll('.tf-section-btn')].find((b) => b.dataset.section === 'identity');
    identityBtn.click();
    await wait(150);
    const allBtn = [...doc.querySelectorAll('.tf-view-btn')].find((b) => b.dataset.view === 'all');
    if (allBtn) { allBtn.click(); await wait(150); }
    const commonNameField = doc.getElementById('tf_library_commonName');
    commonNameField.value = 'CORRUPTED';
    commonNameField.dispatchEvent(new win.Event('change', { bubbles: true }));
    await wait(100);
    doc.getElementById('libraryEditCloseBtn').click();
    await wait(200);

    doc.getElementById('tab-library').click();
    await wait(200);
    row = [...doc.querySelectorAll('.lib-edition-row')].find((r) => r.textContent.includes('ScH1855'));
    assert.equal(row.textContent, original, 'The real libraryData record, read through the independent browse-row display, must show the original value after Discard');
    assert.ok(!row.textContent.includes('CORRUPTED'));
  });

  test('a shared page-title edit reverts on Discard', async () => {
    const dom = loadPage('tunebooks.html');
    const win = dom.window; win.confirm = () => true;
    await wait(700);
    const doc = win.document;
    win.fetch = async () => ({ ok: true, json: async () => JSON.parse(fs.readFileSync(suitePath('tunebook-files/ScH1855.json'), 'utf8')) });

    doc.getElementById('tab-library').click();
    await wait(300);
    let row = [...doc.querySelectorAll('.lib-edition-row')].find((r) => r.textContent.includes('ScH1855'));
    row.querySelector('.lib-edit-edition-btn').click();
    await wait(300);
    doc.getElementById('loadTunebookFileBtn').click();
    await wait(300);
    const contentsBtn = [...doc.querySelectorAll('.tf-section-btn')].find((b) => b.dataset.section === 'contents');
    contentsBtn.click();
    await wait(150);
    const allBtn = [...doc.querySelectorAll('.tf-view-btn')].find((b) => b.dataset.view === 'all');
    if (allBtn) { allBtn.click(); await wait(150); }
    const titleInput = doc.querySelector('.tf-song-title-input');
    const page = titleInput.dataset.page;
    const originalTitle = titleInput.value;
    titleInput.value = 'CORRUPTED TITLE';
    titleInput.dispatchEvent(new win.Event('change', { bubbles: true }));
    await wait(100);
    doc.getElementById('libraryEditCloseBtn').click();
    await wait(200);

    doc.getElementById('tab-library').click();
    await wait(200);
    row = [...doc.querySelectorAll('.lib-edition-row')].find((r) => r.textContent.includes('ScH1855'));
    row.querySelector('.lib-edit-edition-btn').click();
    await wait(300);
    doc.getElementById('loadTunebookFileBtn').click();
    await wait(300);
    const contentsBtn2 = [...doc.querySelectorAll('.tf-section-btn')].find((b) => b.dataset.section === 'contents');
    contentsBtn2.click();
    await wait(150);
    const allBtn2 = [...doc.querySelectorAll('.tf-view-btn')].find((b) => b.dataset.view === 'all');
    if (allBtn2) { allBtn2.click(); await wait(150); }
    const titleAfter = [...doc.querySelectorAll('.tf-song-title-input')].find((el) => el.dataset.page === page);
    assert.equal(titleAfter.value, originalTitle);
  });

  test('a discarded shared-field edit cannot be resurrected by a later, unrelated Library save', async () => {
    const dom = loadPage('tunebooks.html');
    const win = dom.window; win.confirm = () => true;
    const store = {};
    Object.defineProperty(win, 'localStorage', {
      value: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => delete store[k] },
      configurable: true,
    });
    await wait(700);
    const doc = win.document;
    win.fetch = async () => ({ ok: true, json: async () => JSON.parse(fs.readFileSync(suitePath('tunebook-files/ScH1855.json'), 'utf8')) });

    doc.getElementById('tab-library').click();
    await wait(300);
    let row = [...doc.querySelectorAll('.lib-edition-row')].find((r) => r.textContent.includes('ScH1855'));
    row.querySelector('.lib-edit-edition-btn').click();
    await wait(300);
    doc.getElementById('loadTunebookFileBtn').click();
    await wait(300);
    const identityBtn = [...doc.querySelectorAll('.tf-section-btn')].find((b) => b.dataset.section === 'identity');
    identityBtn.click();
    await wait(150);
    const allBtn = [...doc.querySelectorAll('.tf-view-btn')].find((b) => b.dataset.view === 'all');
    if (allBtn) { allBtn.click(); await wait(150); }
    const commonNameField = doc.getElementById('tf_library_commonName');
    commonNameField.value = 'DISCARDED';
    commonNameField.dispatchEvent(new win.Event('change', { bubbles: true }));
    await wait(100);
    doc.getElementById('libraryEditCloseBtn').click();
    await wait(200);

    doc.getElementById('tab-library').click();
    await wait(200);
    doc.getElementById('newTunebookToggleBtn').click();
    await wait(100);
    doc.getElementById('nt_workCode').value = 'UNRELATEDF1';
    doc.getElementById('nt_titleProper').value = 'Unrelated New Book';
    doc.getElementById('newTunebookBtn').click();
    await wait(200);
    win.close();

    const dom2 = loadPage('tunebooks.html');
    const win2 = dom2.window; win2.confirm = () => true;
    Object.defineProperty(win2, 'localStorage', {
      value: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => delete store[k] },
      configurable: true,
    });
    await wait(700);
    const doc2 = win2.document;
    doc2.getElementById('tab-library').click();
    await wait(200);
    const row2 = [...doc2.querySelectorAll('.lib-edition-row')].find((r) => r.textContent.includes('ScH1855'));
    // Same reason as the test above: Common Name no longer has a findable input in the
    // generic editor for a real Level 3 book - the independent browse-row text is the
    // real verification now.
    assert.ok(!row2.textContent.includes('DISCARDED'), 'A later, unrelated save must never resurrect a value that was genuinely discarded earlier');
  });

  test('a successful Save establishes a new rollback baseline - a later Discard returns to the last Save, not the original file-load state', async () => {
    const dom = loadPage('tunebooks.html');
    const win = dom.window; win.confirm = () => true;
    const store = {};
    Object.defineProperty(win, 'localStorage', {
      value: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => delete store[k] },
      configurable: true,
    });
    await wait(700);
    const doc = win.document;
    win.fetch = async () => ({ ok: true, json: async () => JSON.parse(fs.readFileSync(suitePath('tunebook-files/ScH1855.json'), 'utf8')) });

    doc.getElementById('tab-library').click();
    await wait(300);
    let row = [...doc.querySelectorAll('.lib-edition-row')].find((r) => r.textContent.includes('ScH1855'));
    row.querySelector('.lib-edit-edition-btn').click();
    await wait(300);
    doc.getElementById('loadTunebookFileBtn').click();
    await wait(300);
    const identityBtn = [...doc.querySelectorAll('.tf-section-btn')].find((b) => b.dataset.section === 'identity');
    identityBtn.click();
    await wait(150);
    const allBtn = [...doc.querySelectorAll('.tf-view-btn')].find((b) => b.dataset.view === 'all');
    if (allBtn) { allBtn.click(); await wait(150); }
    const commonNameField = doc.getElementById('tf_library_commonName');

    commonNameField.value = 'SAVED VALUE';
    commonNameField.dispatchEvent(new win.Event('change', { bubbles: true }));
    await wait(100);
    win.URL.createObjectURL = function () { return 'blob:test'; };
    win.URL.revokeObjectURL = function () {};
    win.HTMLAnchorElement.prototype.click = function () {};
    win.Blob = function () { return {}; };
    doc.getElementById('tfSaveBtn').click();
    await wait(200);

    commonNameField.value = 'DISCARDED VALUE';
    commonNameField.dispatchEvent(new win.Event('change', { bubbles: true }));
    await wait(100);
    doc.getElementById('libraryEditCloseBtn').click();
    await wait(200);

    doc.getElementById('tab-library').click();
    await wait(200);
    row = [...doc.querySelectorAll('.lib-edition-row')].find((r) => r.textContent.includes('ScH1855'));
    assert.ok(row.textContent.includes('SAVED VALUE'), 'Discard must roll back to the last successful Save, not all the way back to the original file-load state');
    assert.ok(!row.textContent.includes('DISCARDED VALUE'));
  });
});

describe('Change summary correctly attributes book.notes and excludes Library-owned titles from the Level 3 diff (v89 release-readiness review, finding 4)', () => {
  test('a book.notes-only edit is reported as a real Level 3 change, not "No changes"', async () => {
    const dom = loadPage('tunebooks.html');
    const win = dom.window; win.confirm = () => true;
    await wait(700);
    const doc = win.document;
    win.fetch = async () => ({ ok: true, json: async () => JSON.parse(fs.readFileSync(suitePath('tunebook-files/ScH1855.json'), 'utf8')) });

    doc.getElementById('tab-library').click();
    await wait(300);
    const row = [...doc.querySelectorAll('.lib-edition-row')].find((r) => r.textContent.includes('ScH1855'));
    row.querySelector('.lib-edit-edition-btn').click();
    await wait(300);
    doc.getElementById('loadTunebookFileBtn').click();
    await wait(300);
    const sourcesBtn = [...doc.querySelectorAll('.tf-section-btn')].find((b) => b.dataset.section === 'sources');
    sourcesBtn.click();
    await wait(150);
    const allBtn = [...doc.querySelectorAll('.tf-view-btn')].find((b) => b.dataset.view === 'all');
    if (allBtn) { allBtn.click(); await wait(150); }
    const bookNotesField = doc.getElementById('tf_level3_book_notes');
    bookNotesField.value = 'A real, deliberate edit to Book Notes only.';
    bookNotesField.dispatchEvent(new win.Event('change', { bubbles: true }));
    await wait(100);

    doc.getElementById('tab-export').click();
    await wait(300);
    const sel = doc.getElementById('exportBookSelect');
    const opt = [...sel.options].find((o) => o.textContent.includes('ScH1855'));
    sel.value = opt.value;
    sel.dispatchEvent(new win.Event('change'));
    await wait(200);

    const summaryText = doc.getElementById('exportDetails').textContent;
    assert.ok(!summaryText.includes('No changes from the bundled edition'),
      'A real book.notes edit must not be reported as no changes at all');
    assert.match(summaryText, /book\.notes/, 'The change summary must name book.notes specifically as what changed');
  });

  test('a Library-owned page-title-only change is not mislabeled as Level 3 per-song enrichment', async () => {
    const dom = loadPage('tunebooks.html');
    const win = dom.window; win.confirm = () => true;
    await wait(700);
    const doc = win.document;
    win.fetch = async () => ({ ok: true, json: async () => JSON.parse(fs.readFileSync(suitePath('tunebook-files/ScH1855.json'), 'utf8')) });

    doc.getElementById('tab-library').click();
    await wait(300);
    const row = [...doc.querySelectorAll('.lib-edition-row')].find((r) => r.textContent.includes('ScH1855'));
    row.querySelector('.lib-edit-edition-btn').click();
    await wait(300);
    doc.getElementById('loadTunebookFileBtn').click();
    await wait(300);
    const contentsBtn = [...doc.querySelectorAll('.tf-section-btn')].find((b) => b.dataset.section === 'contents');
    contentsBtn.click();
    await wait(150);
    const allBtn = [...doc.querySelectorAll('.tf-view-btn')].find((b) => b.dataset.view === 'all');
    if (allBtn) { allBtn.click(); await wait(150); }
    const titleInput = doc.querySelector('.tf-song-title-input');
    titleInput.value = titleInput.value + ' (edited)';
    titleInput.dispatchEvent(new win.Event('change', { bubbles: true }));
    await wait(100);

    doc.getElementById('tab-export').click();
    await wait(300);
    const sel = doc.getElementById('exportBookSelect');
    const opt = [...sel.options].find((o) => o.textContent.includes('ScH1855'));
    sel.value = opt.value;
    sel.dispatchEvent(new win.Event('change'));
    await wait(200);

    const changeSummaryOnly = doc.getElementById('exportDetails').textContent.match(/Change summary([\s\S]*?)Validation/)[1];
    assert.ok(!changeSummaryOnly.includes('per-song enrichment'),
      'A title-only change (Library-owned) must not be reported as a Level 3 enrichment change');
    assert.match(changeSummaryOnly, /title changed/, 'The real title change must still be reported, correctly, as a Library field');
  });

  test('a real per-song enrichment edit (genuinely Level 3-owned) is still correctly detected', async () => {
    const dom = loadPage('tunebooks.html');
    const win = dom.window; win.confirm = () => true;
    await wait(700);
    const doc = win.document;
    win.fetch = async () => ({ ok: true, json: async () => JSON.parse(fs.readFileSync(suitePath('tunebook-files/ScH1855.json'), 'utf8')) });

    doc.getElementById('tab-library').click();
    await wait(300);
    const row = [...doc.querySelectorAll('.lib-edition-row')].find((r) => r.textContent.includes('ScH1855'));
    row.querySelector('.lib-edit-edition-btn').click();
    await wait(300);
    doc.getElementById('loadTunebookFileBtn').click();
    await wait(300);
    const contentsBtn = [...doc.querySelectorAll('.tf-section-btn')].find((b) => b.dataset.section === 'contents');
    contentsBtn.click();
    await wait(150);
    const allBtn = [...doc.querySelectorAll('.tf-view-btn')].find((b) => b.dataset.view === 'all');
    if (allBtn) { allBtn.click(); await wait(150); }
    const expandBtn = doc.querySelector('.tf-song-expand-btn');
    if (expandBtn) { expandBtn.click(); await wait(100); }
    const meterInput = doc.querySelector('.tf-song-field-input[data-key="meter"]');
    meterInput.value = meterInput.value + ' (edited)';
    meterInput.dispatchEvent(new win.Event('change', { bubbles: true }));
    await wait(100);

    doc.getElementById('tab-export').click();
    await wait(300);
    const sel = doc.getElementById('exportBookSelect');
    const opt = [...sel.options].find((o) => o.textContent.includes('ScH1855'));
    sel.value = opt.value;
    sel.dispatchEvent(new win.Event('change'));
    await wait(200);

    const changeSummaryOnly = doc.getElementById('exportDetails').textContent.match(/Change summary([\s\S]*?)Validation/)[1];
    assert.ok(changeSummaryOnly.includes('per-song enrichment') || changeSummaryOnly.includes('metadata changed'),
      'A real Level 3-owned per-song field edit must still be detected and reported');
  });
});

describe('File:// manual Level 3 fallback preserves identity and canonical filename (v68 review R68-07)', () => {
  test('a manually-selected file for a different edition is rejected outright, not silently accepted', async () => {
    const dom = loadPage('tunebooks.html');
    const win = dom.window; win.confirm = () => true;
    await wait(700);
    const doc = win.document;
    win.fetch = async () => { throw new Error('fetch is not allowed under file://'); };

    doc.getElementById('tab-library').click();
    await wait(300);
    const editBtn = [...doc.querySelectorAll('.lib-edit-edition-btn')].find(
      (b) => b.closest('.lib-edition-row').textContent.includes('ScH1855')
    );
    editBtn.click();
    await wait(300);
    doc.getElementById('loadTunebookFileBtn').click();
    await wait(300);

    const wrongText = fs.readFileSync(suitePath('tunebook-files/SoH1854.json'), 'utf8');
    const manualInput = doc.getElementById('tunebookFileManualInput');
    Object.defineProperty(manualInput, 'files', { value: [new win.File([wrongText], 'SoH1854.json', { type: 'application/json' })], configurable: true });
    manualInput.dispatchEvent(new win.Event('change'));
    await wait(200);

    assert.match(doc.getElementById('tunebookFileStatus').textContent, /different edition/);
    assert.notEqual(doc.getElementById('tunebookFileEditor').style.display, 'block',
      'The editor must not open for a file that doesn\u2019t match the currently-selected edition');
  });

  test('a correctly-matching manually-selected file loads, and Save uses the file\u2019s own real name as the canonical filename - not a display label with extra text baked in', async () => {
    const dom = loadPage('tunebooks.html');
    const win = dom.window; win.confirm = () => true;
    await wait(700);
    const doc = win.document;
    win.fetch = async () => { throw new Error('fetch is not allowed under file://'); };

    doc.getElementById('tab-library').click();
    await wait(300);
    const editBtn = [...doc.querySelectorAll('.lib-edit-edition-btn')].find(
      (b) => b.closest('.lib-edition-row').textContent.includes('ScH1855')
    );
    editBtn.click();
    await wait(300);
    doc.getElementById('loadTunebookFileBtn').click();
    await wait(300);

    const correctText = fs.readFileSync(suitePath('tunebook-files/ScH1855.json'), 'utf8');
    const manualInput = doc.getElementById('tunebookFileManualInput');
    Object.defineProperty(manualInput, 'files', { value: [new win.File([correctText], 'ScH1855.json', { type: 'application/json' })], configurable: true });
    manualInput.dispatchEvent(new win.Event('change'));
    await wait(200);
    assert.equal(doc.getElementById('tunebookFileEditor').style.display, 'block');

    let capturedFilename = null;
    win.URL.createObjectURL = function () { return 'blob:test'; };
    win.URL.revokeObjectURL = function () {};
    const origCreateElement = win.document.createElement.bind(win.document);
    win.document.createElement = function (tag) {
      const el = origCreateElement(tag);
      if (tag === 'a') { el.click = function () { capturedFilename = el.download; }; }
      return el;
    };
    doc.getElementById('tfSaveBtn').click();
    await wait(200);

    assert.equal(capturedFilename, 'ScH1855.json', 'The download filename must be the file\u2019s own real name, not a display label like "ScH1855.json (chosen manually)"');
  });
});

describe('Work Toward Level 3 (v68 review R68-05)', () => {
  test('a real Level 2 edition can progress all the way to Level 3 entirely through the app, with no manual JSON authoring', async () => {
    const dom = loadPage('tunebooks.html');
    const win = dom.window; win.confirm = () => true;
    await wait(700);
    const doc = win.document;

    doc.getElementById('tab-library').click();
    await wait(300);
    const editBtn = [...doc.querySelectorAll('.lib-edit-edition-btn')].find(
      (b) => b.closest('.lib-edition-row').textContent.includes('CHM2010')
    );
    editBtn.click();
    await wait(300);

    assert.equal(doc.getElementById('workTowardLevel3Section').style.display, 'block',
      'A real Level 2 edition (complete index, no Tunebook File yet) should offer this action');
    assert.equal(doc.getElementById('tunebookFileSection').style.display, 'none');

    doc.getElementById('workTowardLevel3Btn').click();
    await wait(200);
    assert.equal(doc.getElementById('tunebookFileEditor').style.display, 'block');
    assert.equal(doc.getElementById('tf_library_commonName').value, 'Christian Harmony',
      'The draft must be prepopulated from the real, existing Library data, not started blank');

    // Not yet saved - must not prematurely claim Level 3.
    doc.getElementById('tab-library').click();
    await wait(200);
    const preSaveRow = [...doc.querySelectorAll('.lib-edition-row')].find((r) => r.textContent.includes('CHM2010'));
    assert.ok(preSaveRow && preSaveRow.querySelector('.level-badge').textContent === 'L2',
      'Clicking Work Toward Level 3 must not itself change the edition\u2019s level - only an actual successful save should');

    const editBtn2 = [...doc.querySelectorAll('.lib-edit-edition-btn')].find(
      (b) => b.closest('.lib-edition-row').textContent.includes('CHM2010')
    );
    editBtn2.click();
    await wait(200);
    doc.getElementById('workTowardLevel3Btn').click();
    await wait(200);

    let capturedText = null;
    win.URL.createObjectURL = function () { return 'blob:test'; };
    win.URL.revokeObjectURL = function () {};
    const OrigBlob = win.Blob;
    win.Blob = function (parts, opts) { capturedText = parts[0]; return new OrigBlob(parts, opts); };
    win.HTMLAnchorElement.prototype.click = function () {};
    doc.getElementById('tfSaveBtn').click();
    await wait(200);

    assert.match(doc.getElementById('tfSaveStatus').textContent, /now Level 3/);
    const saved = JSON.parse(capturedText);
    assert.equal(saved.book.commonName, 'Christian Harmony');
    assert.ok(Object.keys(saved.songs).length > 0, 'The real, existing page index must carry over into the new Level 3 file, not be lost or started empty');

    doc.getElementById('tab-library').click();
    await wait(200);
    const postSaveRow = [...doc.querySelectorAll('.lib-edition-row')].find((r) => r.textContent.includes('CHM2010'));
    assert.ok(postSaveRow && postSaveRow.querySelector('.level-badge').textContent === 'L3',
      'After a real successful save, the edition must now show as Level 3');
  });
});

describe('Level vs. completeness are separate concepts, with a real core/full tier (v76 follow-up review R68-10 / R68-11)', () => {
  test('a real Level 3 edition with Common Name, Title Proper, and Compiler filled in shows a core-complete badge in Browse', async () => {
    const dom = loadPage('tunebooks.html');
    const win = dom.window; win.confirm = () => true;
    await wait(700);
    const doc = win.document;
    doc.getElementById('tab-library').click();
    await wait(300);
    const row = [...doc.querySelectorAll('.lib-edition-row')].find((r) => r.textContent.includes('ScH1855'));
    assert.ok(row, 'The real ScH1855 edition row should exist');
    assert.match(row.textContent, /core complete/);
  });

  test('a freshly-drafted Level 3 record missing Compiler shows core-incomplete, both in Browse and in the editor\u2019s own completeness note', async () => {
    const dom = loadPage('tunebooks.html');
    const win = dom.window; win.confirm = () => true;
    await wait(700);
    const doc = win.document;
    doc.getElementById('tab-library').click();
    await wait(300);

    // A real Work-only creation with no compiler, then a manual Edition + tunebookFile
    // link to force it into Level 3 without ever supplying a compiler - the actual
    // scenario a core-incomplete badge exists to flag.
    doc.getElementById('newTunebookToggleBtn').click();
    await wait(100);
    doc.getElementById('nt_workCode').value = 'COREINCOMPLETE';
    doc.getElementById('nt_titleProper').value = 'Core Incomplete Test';
    doc.getElementById('nt_includeEdition').checked = true;
    doc.getElementById('nt_includeEdition').dispatchEvent(new win.Event('change'));
    doc.getElementById('nt_editionIdentifierYear').value = '2024';
    doc.getElementById('newTunebookBtn').click();
    await wait(200);

    const editBtn = [...doc.querySelectorAll('.lib-edit-edition-btn')].find(
      (b) => b.closest('.lib-edition-row').textContent.includes('COREINCOMPLETE2024')
    );
    editBtn.click();
    await wait(200);
    doc.getElementById('workTowardLevel3Btn').click();
    await wait(200);
    assert.match(doc.getElementById('tfCompletenessNote').textContent, /core incomplete/);
    assert.match(doc.getElementById('tfCompletenessNote').textContent, /Compiler/);
  });

  test('Publication Year is a real, separate, editable field that round-trips into the saved document (R68-11 / NEW-04)', async () => {
    const dom = loadPage('tunebooks.html');
    const win = dom.window; win.confirm = () => true;
    await wait(700);
    const doc = win.document;
    win.fetch = async () => ({ ok: true, json: async () => JSON.parse(fs.readFileSync(suitePath('tunebook-files/ScH1855.json'), 'utf8')) });

    doc.getElementById('tab-library').click();
    await wait(300);
    const editBtn = [...doc.querySelectorAll('.lib-edit-edition-btn')].find(
      (b) => b.closest('.lib-edition-row').textContent.includes('ScH1855')
    );
    editBtn.click();
    await wait(300);
    doc.getElementById('loadTunebookFileBtn').click();
    await wait(300);

    const pubBtn = [...doc.querySelectorAll('.tf-section-btn')].find((b) => b.dataset.section === 'publication');
    pubBtn.click();
    await wait(150);
    const allBtn = [...doc.querySelectorAll('.tf-view-btn')].find((b) => b.dataset.view === 'all');
    allBtn.click();
    await wait(150);
    const pubYearField = doc.getElementById('tf_library_publicationYear');
    assert.ok(pubYearField, 'Publication Year must be a real field in the Publication section');
    pubYearField.value = '1855';
    pubYearField.dispatchEvent(new win.Event('change', { bubbles: true }));
    await wait(100);

    let capturedText = null;
    win.URL.createObjectURL = function () { return 'blob:test'; };
    win.URL.revokeObjectURL = function () {};
    const OrigBlob = win.Blob;
    win.Blob = function (parts, opts) { capturedText = parts[0]; return new OrigBlob(parts, opts); };
    win.HTMLAnchorElement.prototype.click = function () {};
    doc.getElementById('tfSaveBtn').click();
    await wait(200);

    const saved = JSON.parse(capturedText);
    assert.equal(saved.book.publicationYear, '1855', 'Publication Year must genuinely round-trip into the saved, assembled document');
  });

  test('book.notes is a real, editable field, not just silently preserved', async () => {
    const dom = loadPage('tunebooks.html');
    const win = dom.window; win.confirm = () => true;
    await wait(700);
    const doc = win.document;
    win.fetch = async () => ({ ok: true, json: async () => JSON.parse(fs.readFileSync(suitePath('tunebook-files/ScH1855.json'), 'utf8')) });

    doc.getElementById('tab-library').click();
    await wait(300);
    const editBtn = [...doc.querySelectorAll('.lib-edit-edition-btn')].find(
      (b) => b.closest('.lib-edition-row').textContent.includes('ScH1855')
    );
    editBtn.click();
    await wait(300);
    doc.getElementById('loadTunebookFileBtn').click();
    await wait(300);

    const sourcesBtn = [...doc.querySelectorAll('.tf-section-btn')].find((b) => b.dataset.section === 'sources');
    sourcesBtn.click();
    await wait(150);
    const allBtn = [...doc.querySelectorAll('.tf-view-btn')].find((b) => b.dataset.view === 'all');
    allBtn.click();
    await wait(150);
    assert.ok(doc.getElementById('tf_level3_book_notes'), 'book.notes must have a real editable field, not just be preserved invisibly');
  });
});

describe('Library dirty-tracking makes the Tunebooks/Minutes handoff gap visible (v76 follow-up review NEW-03; superseded by V79-03, see tunebooks-library-sync.test.js)', () => {
  test('a real edit marks the Library dirty and shows a banner; the state survives a reload', async () => {
    const store = {};
    const sharedLocalStorage = {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; },
    };

    const dom1 = loadPage('tunebooks.html', { localStorage: sharedLocalStorage });
    const win1 = dom1.window;
    await wait(700);
    const doc1 = win1.document;
    assert.ok(!doc1.getElementById('libraryDirtyBanner'), 'No banner on a clean start');

    doc1.getElementById('newTunebookToggleBtn').click();
    await wait(100);
    doc1.getElementById('nt_workCode').value = 'DIRTYTEST';
    doc1.getElementById('nt_titleProper').value = 'Dirty Test';
    doc1.getElementById('newTunebookBtn').click();
    await wait(200);
    assert.ok(doc1.getElementById('libraryDirtyBanner'), 'A real edit must show the unsaved-changes banner');
    assert.match(doc1.getElementById('libraryDirtyBanner').textContent, /unsaved changes/);

    const dom2 = loadPage('tunebooks.html', { localStorage: sharedLocalStorage });
    const win2 = dom2.window;
    await wait(700);
    const doc2 = win2.document;
    assert.ok(doc2.getElementById('libraryDirtyBanner'), 'The dirty state must survive a real reload');
    // NEW-03's own "export immediately clears dirty" behavior was exactly the V79-03
    // "false clean state" bug (Failure Mode A) - export no longer clears anything on its
    // own; see tunebooks-library-sync.test.js for the real, on-disk-verified behavior.
  });
});

describe('Automatic Level 3 fetch validates Edition identity, same as the manual path (v76 follow-up review NEW-02)', () => {
  test('an automatic fetch that returns a different edition\u2019s real file is rejected outright, the editor never opens', async () => {
    const dom = loadPage('tunebooks.html');
    const win = dom.window; win.confirm = () => true;
    await wait(700);
    const doc = win.document;
    win.fetch = async () => ({ ok: true, json: async () => JSON.parse(fs.readFileSync(suitePath('tunebook-files/SoH1854.json'), 'utf8')) });

    doc.getElementById('tab-library').click();
    await wait(300);
    const editBtn = [...doc.querySelectorAll('.lib-edit-edition-btn')].find(
      (b) => b.closest('.lib-edition-row').textContent.includes('ScH1855')
    );
    editBtn.click();
    await wait(300);
    doc.getElementById('loadTunebookFileBtn').click();
    await wait(300);

    assert.match(doc.getElementById('tunebookFileStatus').textContent, /different edition/);
    assert.notEqual(doc.getElementById('tunebookFileEditor').style.display, 'block',
      'The editor must not open when the fetched file doesn\u2019t match the selected Edition');
  });

  test('a correctly-matching automatic fetch still loads and opens normally', async () => {
    const dom = loadPage('tunebooks.html');
    const win = dom.window; win.confirm = () => true;
    await wait(700);
    const doc = win.document;
    win.fetch = async () => ({ ok: true, json: async () => JSON.parse(fs.readFileSync(suitePath('tunebook-files/ScH1855.json'), 'utf8')) });

    doc.getElementById('tab-library').click();
    await wait(300);
    const editBtn = [...doc.querySelectorAll('.lib-edit-edition-btn')].find(
      (b) => b.closest('.lib-edition-row').textContent.includes('ScH1855')
    );
    editBtn.click();
    await wait(300);
    doc.getElementById('loadTunebookFileBtn').click();
    await wait(300);
    assert.equal(doc.getElementById('tunebookFileEditor').style.display, 'block');
  });

  test('switching to a different Edition immediately clears the stale Level 3 editor - even before that new Edition\u2019s own auto-load resolves - and the data that does load is genuinely the new Edition\u2019s own', async () => {
    const dom = loadPage('tunebooks.html');
    const win = dom.window; win.confirm = () => true;
    await wait(700);
    const doc = win.document;
    win.fetch = async (path) => {
      const filename = path.split('/').pop();
      return { ok: true, json: async () => JSON.parse(fs.readFileSync(suitePath('tunebook-files/' + filename), 'utf8')) };
    };

    doc.getElementById('tab-library').click();
    await wait(300);
    const editBtn = [...doc.querySelectorAll('.lib-edit-edition-btn')].find(
      (b) => b.closest('.lib-edition-row').textContent.includes('ScH1855')
    );
    editBtn.click();
    // ScH1855 has a real Tunebook File, so this now auto-loads with no click required.
    await wait(500);
    assert.equal(doc.getElementById('tunebookFileEditor').style.display, 'block');

    // v81-02's real finding: editingTarget used to change immediately with nothing
    // clearing the previously-loaded Level 3 editor, so the screen could keep showing
    // one Edition's fields while Library-owned controls had already started writing to
    // a different one. Auto-load changes WHEN a new Edition's own Level 3 data shows up
    // (immediately, not only after a manual click), but the same real risk this finding
    // was about - the OLD Edition's stale data staying visible even a moment longer than
    // it should - is still worth confirming directly: check right after switching,
    // before the new Edition's own fetch has had any chance to resolve.
    doc.getElementById('tab-library').click();
    await wait(200);
    const editBtn2 = [...doc.querySelectorAll('.lib-edit-edition-btn')].find(
      (b) => b.closest('.lib-edition-row').textContent.includes('SoH1854')
    );
    editBtn2.click();
    assert.equal(doc.getElementById('tunebookFileEditor').style.display, 'none',
      'The stale Level 3 editor must be cleared the instant a genuine record switch happens, not left visible even momentarily under the new Library context');

    // Now let SoH1854's own auto-load actually resolve, and confirm what shows is
    // genuinely SoH1854's own data, not a leftover trace of ScH1855's.
    await wait(500);
    assert.equal(doc.getElementById('tunebookFileEditor').style.display, 'block');
    const commonNameField = doc.getElementById('tf_library_commonName');
    assert.notEqual(commonNameField.value, 'Social Harp', 'Must not still be showing ScH1855\u2019s own real Common Name');
  });
});

describe('Identity-less Level 3 files are rejected outright (v81 review, finding 6)', () => {
  test('a file with neither editionId nor editionCode is rejected, the editor never opens', async () => {
    const dom = loadPage('tunebooks.html');
    const win = dom.window; win.confirm = () => true;
    await wait(700);
    const doc = win.document;
    const identityLessData = JSON.parse(fs.readFileSync(suitePath('tunebook-files/ScH1855.json'), 'utf8'));
    delete identityLessData.editionId;
    delete identityLessData.editionCode;
    win.fetch = async () => ({ ok: true, json: async () => identityLessData });

    doc.getElementById('tab-library').click();
    await wait(300);
    const editBtn = [...doc.querySelectorAll('.lib-edit-edition-btn')].find(
      (b) => b.closest('.lib-edition-row').textContent.includes('SoH1854')
    );
    editBtn.click();
    await wait(300);
    doc.getElementById('loadTunebookFileBtn').click();
    await wait(300);

    assert.notEqual(doc.getElementById('tunebookFileEditor').style.display, 'block',
      'A file that makes no identity claim at all must not be accepted, even if it happens to contain real-looking data');
    assert.match(doc.getElementById('tunebookFileStatus').textContent, /no editionId or editionCode/);
  });

  test('a correctly-identified file still loads normally - this fix should not affect legitimate loads', async () => {
    const dom = loadPage('tunebooks.html');
    const win = dom.window; win.confirm = () => true;
    await wait(700);
    const doc = win.document;
    win.fetch = async () => ({ ok: true, json: async () => JSON.parse(fs.readFileSync(suitePath('tunebook-files/SoH1854.json'), 'utf8')) });

    doc.getElementById('tab-library').click();
    await wait(300);
    const editBtn = [...doc.querySelectorAll('.lib-edit-edition-btn')].find(
      (b) => b.closest('.lib-edition-row').textContent.includes('SoH1854')
    );
    editBtn.click();
    await wait(300);
    doc.getElementById('loadTunebookFileBtn').click();
    await wait(300);
    assert.equal(doc.getElementById('tunebookFileEditor').style.display, 'block');
  });

  test('Work Toward Level 3\u2019s own fresh draft, which carries real identity from the Library, is unaffected', async () => {
    const dom = loadPage('tunebooks.html');
    const win = dom.window; win.confirm = () => true;
    await wait(700);
    const doc = win.document;

    doc.getElementById('tab-library').click();
    await wait(300);
    const editBtn = [...doc.querySelectorAll('.lib-edit-edition-btn')].find(
      (b) => b.closest('.lib-edition-row').textContent.includes('CHM2010')
    );
    editBtn.click();
    await wait(300);
    doc.getElementById('workTowardLevel3Btn').click();
    await wait(200);
    assert.equal(doc.getElementById('tunebookFileEditor').style.display, 'block');
  });
});

describe('First Work Toward Level 3 save persists tunebookFile across a real reload (v76 follow-up review NEW-01)', () => {
  test('the tunebookFile link survives a completely fresh page load sharing only persistent storage - a release-gate test per the review', async () => {
    const store = {};
    const sharedLocalStorage = {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; },
    };

    const dom1 = loadPage('tunebooks.html', { localStorage: sharedLocalStorage });
    const win1 = dom1.window;
    await wait(700);
    const doc1 = win1.document;
    doc1.getElementById('tab-library').click();
    await wait(300);
    const editBtn = [...doc1.querySelectorAll('.lib-edit-edition-btn')].find(
      (b) => b.closest('.lib-edition-row').textContent.includes('CHM2010')
    );
    editBtn.click();
    await wait(300);
    doc1.getElementById('workTowardLevel3Btn').click();
    await wait(200);

    win1.URL.createObjectURL = function () { return 'blob:test'; };
    win1.URL.revokeObjectURL = function () {};
    win1.HTMLAnchorElement.prototype.click = function () {};
    doc1.getElementById('tfSaveBtn').click();
    await wait(200);
    assert.match(doc1.getElementById('tfSaveStatus').textContent, /now Level 3/);

    // A genuinely separate page instance, sharing only the same persistent storage - the
    // real test of "does the link survive," not just "was the save button clicked."
    const dom2 = loadPage('tunebooks.html', { localStorage: sharedLocalStorage });
    const win2 = dom2.window;
    await wait(700);
    const doc2 = win2.document;
    doc2.getElementById('tab-library').click();
    await wait(300);

    const postReloadRow = [...doc2.querySelectorAll('.lib-edition-row')].find((r) => r.textContent.includes('CHM2010'));
    assert.ok(postReloadRow && postReloadRow.querySelector('.level-badge').textContent === 'L3',
      'The edition must still show as Level 3 after a real, fresh reload');

    const editBtn2 = [...doc2.querySelectorAll('.lib-edit-edition-btn')].find(
      (b) => b.closest('.lib-edition-row').textContent.includes('CHM2010')
    );
    editBtn2.click();
    await wait(200);
    assert.equal(doc2.getElementById('workTowardLevel3Section').style.display, 'none',
      'Work Toward Level 3 must no longer be offered - the edition already has a real, persisted Tunebook File link');
    assert.equal(doc2.getElementById('tunebookFileSection').style.display, 'block',
      'Open Tunebook File must now be offered instead');
  });
});

describe('Zero-edit Level 3 save preserves book.publicationYear for every real bundled file (v79 ground-up review V79-01)', () => {
  const files = ['SoH1854', 'CSH1934', 'NSH1884', 'ScH1855', 'ShH2012', 'VPH2024'];
  files.forEach((f) => {
    test(`${f}: a zero-edit save preserves the complete book object exactly, not just publicationYear`, async () => {
      const dom = loadPage('tunebooks.html');
      const win = dom.window; win.confirm = () => true;
      await wait(700);
      const doc = win.document;
      const originalText = fs.readFileSync(suitePath(`tunebook-files/${f}.json`), 'utf8');
      win.fetch = async () => ({ ok: true, json: async () => JSON.parse(originalText) });

      doc.getElementById('tab-library').click();
      await wait(300);
      const editBtn = [...doc.querySelectorAll('.lib-edit-edition-btn')].find(
        (b) => b.closest('.lib-edition-row').textContent.includes(f)
      );
      editBtn.click();
      await wait(300);
      doc.getElementById('loadTunebookFileBtn').click();
      await wait(300);

      let capturedText = null;
      win.URL.createObjectURL = function () { return 'blob:test'; };
      win.URL.revokeObjectURL = function () {};
      win.HTMLAnchorElement.prototype.click = function () {};
      const OrigBlob = win.Blob;
      win.Blob = function (parts, opts) { capturedText = parts[0]; return new OrigBlob(parts, opts); };
      doc.getElementById('tfSaveBtn').click();
      await wait(200);

      assert.ok(capturedText, `Save must succeed for ${f} with zero edits`);
      const original = JSON.parse(originalText);
      const saved = JSON.parse(capturedText);
      // The review's own required test: deep-compare the COMPLETE book object, not just
      // publicationYear in isolation - this is what would have caught the original bug
      // and would catch any other field with the same "Library never had this populated"
      // pattern in the future.
      assert.deepStrictEqual(saved.book, original.book,
        `The complete book object must round-trip exactly for ${f} with zero edits`);
    });
  });

  test('editing Publication Year still works correctly and is not blocked by the defensive no-blank-overwrite rule', async () => {
    const dom = loadPage('tunebooks.html');
    const win = dom.window; win.confirm = () => true;
    await wait(700);
    const doc = win.document;
    win.fetch = async () => ({ ok: true, json: async () => JSON.parse(fs.readFileSync(suitePath('tunebook-files/ScH1855.json'), 'utf8')) });

    doc.getElementById('tab-library').click();
    await wait(300);
    const editBtn = [...doc.querySelectorAll('.lib-edit-edition-btn')].find(
      (b) => b.closest('.lib-edition-row').textContent.includes('ScH1855')
    );
    editBtn.click();
    await wait(300);
    doc.getElementById('loadTunebookFileBtn').click();
    await wait(300);

    const pubBtn = [...doc.querySelectorAll('.tf-section-btn')].find((b) => b.dataset.section === 'publication');
    pubBtn.click();
    await wait(150);
    const allBtn = [...doc.querySelectorAll('.tf-view-btn')].find((b) => b.dataset.view === 'all');
    allBtn.click();
    await wait(150);
    const pubField = doc.getElementById('tf_library_publicationYear');
    pubField.value = '1856';
    pubField.dispatchEvent(new win.Event('change', { bubbles: true }));
    await wait(100);

    let capturedText = null;
    win.URL.createObjectURL = function () { return 'blob:test'; };
    win.URL.revokeObjectURL = function () {};
    win.HTMLAnchorElement.prototype.click = function () {};
    const OrigBlob = win.Blob;
    win.Blob = function (parts, opts) { capturedText = parts[0]; return new OrigBlob(parts, opts); };
    doc.getElementById('tfSaveBtn').click();
    await wait(200);
    const saved = JSON.parse(capturedText);
    assert.equal(saved.book.publicationYear, '1856', 'A real, deliberate edit must still take effect');
  });

  test('buildRegistryBookFromLibraryEdition uses the real publicationYear field, not editionIdentifierYear as a stand-in', async () => {
    const source = fs.readFileSync(suiteAppPath('tunebooks.html'), 'utf8');
    assert.match(source, /publicationYear: e\.publicationYear \|\| e\.editionIdentifierYear \|\| ""/,
      'The contribution/change-summary projection must prefer the real field');
    assert.match(source, /publicationYear: bundledEdition\.publicationYear \|\| bundledEdition\.editionIdentifierYear \|\| ""/,
      'The baseline-comparison projection must use the same preference, or diffs against the bundled file would be systematically wrong');
  });
});

describe('Deleting a Library page while its Level 3 file is loaded cannot resurrect it as a ghost page (v79 ground-up review V79-02)', () => {
  test('the Level 3 Contents editor\u2019s own page delete removes the page from both the Library and the loaded Level 3 file at once, so a subsequent save has no ghost page', async () => {
    const dom = loadPage('tunebooks.html');
    const win = dom.window; win.confirm = () => true;
    await wait(700);
    const doc = win.document;
    win.fetch = async () => ({ ok: true, json: async () => JSON.parse(fs.readFileSync(suitePath('tunebook-files/ScH1855.json'), 'utf8')) });

    doc.getElementById('tab-library').click();
    await wait(300);
    const editBtn = [...doc.querySelectorAll('.lib-edit-edition-btn')].find(
      (b) => b.closest('.lib-edition-row').textContent.includes('ScH1855')
    );
    editBtn.click();
    // ScH1855 has a real Tunebook File, so this now auto-loads with no click required -
    // and since it's genuinely Level 3, the generic Library page editor (.lib-song-row)
    // is now correctly hidden for it per Kevin's own later correction; deleting a page
    // for a Level 3 book happens through the Level 3 Contents editor's own delete
    // button instead, which is what this test now exercises.
    await wait(500);
    const contentsBtn = [...doc.querySelectorAll('.tf-section-btn')].find((b) => b.dataset.section === 'contents');
    contentsBtn.click();
    await wait(200);

    const row17 = [...doc.querySelectorAll('.tf-song-row')].find((r) => r.querySelector('.tf-song-title-input').dataset.page === '17');
    assert.ok(row17, 'The real page 17 row should exist in the Level 3 Contents editor');
    row17.querySelector('.tf-song-delete-btn').click();
    await wait(200);

    let capturedText = null;
    win.URL.createObjectURL = function () { return 'blob:test'; };
    win.URL.revokeObjectURL = function () {};
    win.HTMLAnchorElement.prototype.click = function () {};
    const OrigBlob = win.Blob;
    win.Blob = function (parts, opts) { capturedText = parts[0]; return new OrigBlob(parts, opts); };
    doc.getElementById('tfSaveBtn').click();
    await wait(200);

    assert.ok(capturedText, 'Save should succeed cleanly - no orphan should have been created in the first place');
    const saved = JSON.parse(capturedText);
    assert.equal(saved.songs['17'], undefined, 'The deleted page must not be resurrected with a blank title, still carrying its old enrichment');
  });

  test('Save blocks outright when the loaded Level 3 file has genuine enrichment for a page absent from the Library (e.g. a hand-edited file)', async () => {
    const dom = loadPage('tunebooks.html');
    const win = dom.window; win.confirm = () => true;
    await wait(700);
    const doc = win.document;
    const tamperedData = JSON.parse(fs.readFileSync(suitePath('tunebook-files/ScH1855.json'), 'utf8'));
    tamperedData.songs['999t'] = { title: 'Orphan From Hand-Edited File', meter: '8.8.8' };
    win.fetch = async () => ({ ok: true, json: async () => tamperedData });

    doc.getElementById('tab-library').click();
    await wait(300);
    const editBtn = [...doc.querySelectorAll('.lib-edit-edition-btn')].find(
      (b) => b.closest('.lib-edition-row').textContent.includes('ScH1855')
    );
    editBtn.click();
    await wait(300);
    doc.getElementById('loadTunebookFileBtn').click();
    await wait(300);

    let capturedText = null;
    win.URL.createObjectURL = function () { return 'blob:test'; };
    win.URL.revokeObjectURL = function () {};
    win.HTMLAnchorElement.prototype.click = function () {};
    const OrigBlob = win.Blob;
    win.Blob = function (parts, opts) { capturedText = parts[0]; return new OrigBlob(parts, opts); };
    doc.getElementById('tfSaveBtn').click();
    await wait(200);

    assert.equal(capturedText, null, 'Save must not silently discard or silently write back an orphaned page');
    assert.match(doc.getElementById('tfSaveStatus').textContent, /999t/);
    assert.match(doc.getElementById('tfSaveStatus').textContent, /no longer exist in the Library/);
  });
});

describe('Incomplete Fields no longer renders thousands of optional inputs at once (v79 ground-up review V79-05)', () => {
  test('a real 469-song book renders zero enrichment inputs by default in Incomplete view; expanding one song reveals only its own fields', async () => {
    const dom = loadPage('tunebooks.html');
    const win = dom.window; win.confirm = () => true;
    await wait(700);
    const doc = win.document;
    win.fetch = async () => ({ ok: true, json: async () => JSON.parse(fs.readFileSync(suitePath('tunebook-files/ShH2012.json'), 'utf8')) });

    doc.getElementById('tab-library').click();
    await wait(300);
    const editBtn = [...doc.querySelectorAll('.lib-edit-edition-btn')].find(
      (b) => b.closest('.lib-edition-row').textContent.includes('ShH2012')
    );
    editBtn.click();
    await wait(300);
    doc.getElementById('loadTunebookFileBtn').click();
    await wait(300);

    const contentsBtn = [...doc.querySelectorAll('.tf-section-btn')].find((b) => b.dataset.section === 'contents');
    contentsBtn.click();
    await wait(200);
    const incompleteBtn = [...doc.querySelectorAll('.tf-view-btn')].find((b) => b.dataset.view === 'incomplete');
    incompleteBtn.click();
    await wait(300);

    assert.equal(doc.querySelectorAll('.tf-song-field-input').length, 0,
      'Real bundled data previously produced 5,159 rendered inputs here at once - the review\u2019s own confirmed number - now none until a song is explicitly expanded');
    assert.match(doc.getElementById('tfSectionBody').textContent, /song\(s\) have at least one incomplete field/,
      'A real summary count should replace the wall of inputs');

    const expandBtn = doc.querySelector('.tf-song-expand-btn');
    assert.ok(expandBtn, 'A real flagged song should offer an expand control');
    expandBtn.click();
    await wait(150);
    const inputsAfterOneExpand = doc.querySelectorAll('.tf-song-field-input').length;
    assert.ok(inputsAfterOneExpand > 0 && inputsAfterOneExpand < 20,
      'Expanding one song should reveal only that song\u2019s own fields, not the whole book');
  });

  test('editing a field through the expanded view genuinely saves, and Expand All still works for someone who wants the full picture', async () => {
    const dom = loadPage('tunebooks.html');
    const win = dom.window; win.confirm = () => true;
    await wait(700);
    const doc = win.document;
    win.fetch = async () => ({ ok: true, json: async () => JSON.parse(fs.readFileSync(suitePath('tunebook-files/ShH2012.json'), 'utf8')) });

    doc.getElementById('tab-library').click();
    await wait(300);
    const editBtn = [...doc.querySelectorAll('.lib-edit-edition-btn')].find(
      (b) => b.closest('.lib-edition-row').textContent.includes('ShH2012')
    );
    editBtn.click();
    await wait(300);
    doc.getElementById('loadTunebookFileBtn').click();
    await wait(300);
    const contentsBtn = [...doc.querySelectorAll('.tf-section-btn')].find((b) => b.dataset.section === 'contents');
    contentsBtn.click();
    await wait(200);
    const incompleteBtn = [...doc.querySelectorAll('.tf-view-btn')].find((b) => b.dataset.view === 'incomplete');
    incompleteBtn.click();
    await wait(300);

    const expandBtn = doc.querySelector('.tf-song-expand-btn');
    const page = expandBtn.dataset.page;
    expandBtn.click();
    await wait(150);
    const field = doc.querySelector('.tf-song-field-input');
    const key = field.dataset.key;
    field.value = key === 'verseCount' ? '4' : 'Test enrichment value';
    field.dispatchEvent(new win.Event('change', { bubbles: true }));
    await wait(100);

    let capturedText = null;
    win.URL.createObjectURL = function () { return 'blob:test'; };
    win.URL.revokeObjectURL = function () {};
    win.HTMLAnchorElement.prototype.click = function () {};
    const OrigBlob = win.Blob;
    win.Blob = function (parts, opts) { capturedText = parts[0]; return new OrigBlob(parts, opts); };
    doc.getElementById('tfSaveBtn').click();
    await wait(200);
    assert.ok(capturedText, 'Save should succeed');
    const saved = JSON.parse(capturedText);
    assert.equal(String(saved.songs[page][key]), key === 'verseCount' ? '4' : 'Test enrichment value',
      'An edit made through the collapsed/expanded view must genuinely reach the saved document, exactly like before this redesign');

    const expandAllBtn = doc.getElementById('tfExpandAllBtn');
    assert.ok(expandAllBtn, 'Expand All should still be offered for someone who wants to see everything at once');
  });
});

describe('Contents / Index page sorting reuses the real shared sortPages(), not a reimplementation (v81 review, finding 7)', () => {
  test('a real Roman-numeral front-matter page sorts correctly before the numeric pages, not among them', async () => {
    const dom = loadPage('tunebooks.html');
    const win = dom.window; win.confirm = () => true;
    await wait(700);
    const doc = win.document;
    win.fetch = async () => ({ ok: true, json: async () => JSON.parse(fs.readFileSync(suitePath('tunebook-files/ShH2012.json'), 'utf8')) });

    doc.getElementById('tab-library').click();
    await wait(300);
    const editBtn = [...doc.querySelectorAll('.lib-edit-edition-btn')].find(
      (b) => b.closest('.lib-edition-row').textContent.includes('ShH2012')
    );
    editBtn.click();
    await wait(300);
    doc.getElementById('loadTunebookFileBtn').click();
    await wait(300);
    const contentsBtn = [...doc.querySelectorAll('.tf-section-btn')].find((b) => b.dataset.section === 'contents');
    contentsBtn.click();
    await wait(300);

    const pages = [...doc.querySelectorAll('.tf-song-row')].map((r) => r.querySelector('span').textContent);
    assert.equal(pages[0], 'viii',
      'A real Roman-numeral front-matter page must sort first, matching the shared sortPages() convention used everywhere else - the old reimplementation placed it at position 339, among the numeric pages, since it only handled plain numeric-then-string comparison');
    assert.equal(pages[1], '1t', 'Split-page t/b ordering (also handled by the shared sorter, not the old reimplementation) must still be correct too');
    assert.equal(pages[2], '1b');
  });
});

describe('Level 3 editing session cannot leak across a record switch (v81 review, finding 2)', () => {
  test('switching records with no unsaved changes proceeds cleanly with no prompt, and the Level 3 editor resets', async () => {
    const dom = loadPage('tunebooks.html');
    const win = dom.window;
    win.confirm = () => { throw new Error('confirm() should not be called when the session is not dirty'); };
    await wait(700);
    const doc = win.document;
    win.fetch = async (path) => {
      const filename = path.split('/').pop();
      return { ok: true, json: async () => JSON.parse(fs.readFileSync(suitePath('tunebook-files/' + filename), 'utf8')) };
    };

    doc.getElementById('tab-library').click();
    await wait(300);
    const editBtnA = [...doc.querySelectorAll('.lib-edit-edition-btn')].find(
      (b) => b.closest('.lib-edition-row').textContent.includes('ScH1855')
    );
    editBtnA.click();
    await wait(300);
    doc.getElementById('loadTunebookFileBtn').click();
    await wait(300);

    doc.getElementById('tab-library').click();
    await wait(200);
    const editBtnB = [...doc.querySelectorAll('.lib-edit-edition-btn')].find(
      (b) => b.closest('.lib-edition-row').textContent.includes('SoH1854')
    );
    editBtnB.click();
    // Check the reset immediately, before SoH1854's own auto-load (it also has a real
    // Tunebook File) has any chance to resolve and correctly re-open the editor with
    // its own data - that correct re-open is real and expected, just not what this
    // specific assertion is about.
    assert.equal(doc.getElementById('tunebookFileEditor').style.display, 'none', 'A record switch must reset the Level 3 editor');
    // Common Name itself no longer has a findable field in the generic top form for
    // either book here - both ScH1855 and SoH1854 are real Level 3 Editions, so it now
    // lives only in each one's own Level 3 Identity tab. SHMHA Code has no Level 3
    // equivalent at all, so it stays in the generic form regardless of Level, making it
    // the right field to check that the new record's own data is genuinely showing.
    assert.equal(doc.getElementById('lef_shmhaCode').value, 'SoH', 'The generic Library field must correctly show the new record');
  });

  test('a dirty Level 3 session prompts before a record switch; Cancel keeps the original record active and untouched', async () => {
    const dom = loadPage('tunebooks.html');
    const win = dom.window; win.confirm = () => true;
    await wait(700);
    const doc = win.document;
    win.fetch = async (path) => {
      const filename = path.split('/').pop();
      return { ok: true, json: async () => JSON.parse(fs.readFileSync(suitePath('tunebook-files/' + filename), 'utf8')) };
    };

    doc.getElementById('tab-library').click();
    await wait(300);
    const editBtnA = [...doc.querySelectorAll('.lib-edit-edition-btn')].find(
      (b) => b.closest('.lib-edition-row').textContent.includes('ScH1855')
    );
    editBtnA.click();
    await wait(300);
    doc.getElementById('loadTunebookFileBtn').click();
    await wait(300);

    const sourcesBtn = [...doc.querySelectorAll('.tf-section-btn')].find((b) => b.dataset.section === 'sources');
    sourcesBtn.click();
    await wait(150);
    const allBtn = [...doc.querySelectorAll('.tf-view-btn')].find((b) => b.dataset.view === 'all');
    allBtn.click();
    await wait(150);
    doc.getElementById('tf_level3_book_notes').value = 'A real unsaved edit';
    doc.getElementById('tf_level3_book_notes').dispatchEvent(new win.Event('change', { bubbles: true }));
    await wait(100);

    let confirmCalled = false;
    win.confirm = () => { confirmCalled = true; return false; }; // Cancel

    doc.getElementById('tab-library').click();
    await wait(200);
    const editBtnB = [...doc.querySelectorAll('.lib-edit-edition-btn')].find(
      (b) => b.closest('.lib-edition-row').textContent.includes('SoH1854')
    );
    editBtnB.click();
    await wait(200);

    assert.ok(confirmCalled, 'A dirty session must prompt before switching records');
    assert.equal(doc.getElementById('libraryEditTitle').textContent, 'Edition: ScH1855', 'Cancel must keep the original record active');
    assert.equal(doc.getElementById('tf_level3_book_notes').value, 'A real unsaved edit', 'Cancel must not discard the unsaved edit');
  });

  test('a dirty Level 3 session, when discarded, correctly clears the stale editor and lets the new record take over cleanly', async () => {
    const dom = loadPage('tunebooks.html');
    const win = dom.window; win.confirm = () => true;
    await wait(700);
    const doc = win.document;
    win.fetch = async (path) => {
      const filename = path.split('/').pop();
      return { ok: true, json: async () => JSON.parse(fs.readFileSync(suitePath('tunebook-files/' + filename), 'utf8')) };
    };

    doc.getElementById('tab-library').click();
    await wait(300);
    const editBtnA = [...doc.querySelectorAll('.lib-edit-edition-btn')].find(
      (b) => b.closest('.lib-edition-row').textContent.includes('ScH1855')
    );
    editBtnA.click();
    await wait(300);
    doc.getElementById('loadTunebookFileBtn').click();
    await wait(300);

    const sourcesBtn = [...doc.querySelectorAll('.tf-section-btn')].find((b) => b.dataset.section === 'sources');
    sourcesBtn.click();
    await wait(150);
    const allBtn = [...doc.querySelectorAll('.tf-view-btn')].find((b) => b.dataset.view === 'all');
    allBtn.click();
    await wait(150);
    doc.getElementById('tf_level3_book_notes').value = 'A real unsaved edit that will be discarded';
    doc.getElementById('tf_level3_book_notes').dispatchEvent(new win.Event('change', { bubbles: true }));
    await wait(100);

    win.confirm = () => true; // Discard
    doc.getElementById('tab-library').click();
    await wait(200);
    const editBtnB = [...doc.querySelectorAll('.lib-edit-edition-btn')].find(
      (b) => b.closest('.lib-edition-row').textContent.includes('SoH1854')
    );
    editBtnB.click();
    // Checked immediately, before SoH1854's own auto-load (it also has a real Tunebook
    // File) has any chance to resolve and correctly re-open the editor with its own
    // data - that correct re-open is real and expected, just not what this assertion is
    // testing for.
    assert.equal(doc.getElementById('libraryEditTitle').textContent, 'Edition: SoH1854', 'Discard must let the switch proceed');
    assert.equal(doc.getElementById('tunebookFileEditor').style.display, 'none',
      'The stale Level 3 editor must be genuinely cleared, not left visible under the new record');
  });

  test('a save that succeeds resets the dirty baseline, so it does not immediately prompt again on the very next switch', async () => {
    const dom = loadPage('tunebooks.html');
    const win = dom.window; win.confirm = () => true;
    const store = {};
    Object.defineProperty(win, 'localStorage', { value: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; },
    }, configurable: true });
    await wait(700);
    const doc = win.document;
    win.fetch = async (path) => {
      const filename = path.split('/').pop();
      return { ok: true, json: async () => JSON.parse(fs.readFileSync(suitePath('tunebook-files/' + filename), 'utf8')) };
    };

    doc.getElementById('tab-library').click();
    await wait(300);
    const editBtnA = [...doc.querySelectorAll('.lib-edit-edition-btn')].find(
      (b) => b.closest('.lib-edition-row').textContent.includes('ScH1855')
    );
    editBtnA.click();
    await wait(300);
    doc.getElementById('loadTunebookFileBtn').click();
    await wait(300);

    const sourcesBtn = [...doc.querySelectorAll('.tf-section-btn')].find((b) => b.dataset.section === 'sources');
    sourcesBtn.click();
    await wait(150);
    const allBtn = [...doc.querySelectorAll('.tf-view-btn')].find((b) => b.dataset.view === 'all');
    allBtn.click();
    await wait(150);
    doc.getElementById('tf_level3_book_notes').value = 'A real edit that gets saved';
    doc.getElementById('tf_level3_book_notes').dispatchEvent(new win.Event('change', { bubbles: true }));
    await wait(100);

    win.URL.createObjectURL = function () { return 'blob:test'; };
    win.URL.revokeObjectURL = function () {};
    win.HTMLAnchorElement.prototype.click = function () {};
    win.Blob = function (parts) { return {}; };
    doc.getElementById('tfSaveBtn').click();
    await wait(200);

    let confirmCalled = false;
    win.confirm = () => { confirmCalled = true; return true; };
    doc.getElementById('tab-library').click();
    await wait(200);
    const editBtnB = [...doc.querySelectorAll('.lib-edit-edition-btn')].find(
      (b) => b.closest('.lib-edition-row').textContent.includes('SoH1854')
    );
    editBtnB.click();
    await wait(200);

    assert.equal(confirmCalled, false, 'A session that was just successfully saved should not still be considered dirty on the very next switch');
  });
});

describe('Level 3 page sort reuses the real shared sorter, not a reimplementation (v81 review, finding 7)', () => {
  test('a real Roman-numeral front-matter page sorts correctly before numeric pages', async () => {
    const dom = loadPage('tunebooks.html');
    const win = dom.window; win.confirm = () => true;
    await wait(700);
    const doc = win.document;
    win.fetch = async () => ({ ok: true, json: async () => JSON.parse(fs.readFileSync(suitePath('tunebook-files/ShH2012.json'), 'utf8')) });

    doc.getElementById('tab-library').click();
    await wait(300);
    const editBtn = [...doc.querySelectorAll('.lib-edit-edition-btn')].find(
      (b) => b.closest('.lib-edition-row').textContent.includes('ShH2012')
    );
    editBtn.click();
    await wait(300);
    doc.getElementById('loadTunebookFileBtn').click();
    await wait(300);
    const contentsBtn = [...doc.querySelectorAll('.tf-section-btn')].find((b) => b.dataset.section === 'contents');
    contentsBtn.click();
    await wait(300);

    const pages = [...doc.querySelectorAll('.tf-song-row')].map((r) => r.querySelector('span').textContent);
    assert.ok(pages.includes('viii'), 'The real ShH2012 file has a genuine Roman-numeral front-matter page');
    assert.equal(pages.indexOf('viii'), 0,
      'A simplified, reimplemented sort previously placed this page at position 339, deep among the numeric pages, instead of correctly before them as front matter - the real shared sortPages() handles Roman numerals correctly');
    // A real side benefit of reusing the shared sorter: t/b page-half ordering is also
    // handled correctly now, which the reimplementation never covered either.
    const oneTIndex = pages.indexOf('1t');
    const oneBIndex = pages.indexOf('1b');
    assert.ok(oneTIndex > -1 && oneBIndex > -1 && oneTIndex < oneBIndex,
      'Split page halves (1t before 1b) should also sort correctly, matching the shared sorter used everywhere else');
  });
});

describe('Change summary detects Level-3-only edits, not just Library-side changes (v81 review, finding 5)', () => {
  test('editing only a Level 3 field (Historical Notes) is reflected in the change summary, not silently reported as "No changes"', async () => {
    const dom = loadPage('tunebooks.html');
    const win = dom.window; win.confirm = () => true;
    await wait(700);
    const doc = win.document;
    win.fetch = async () => ({ ok: true, json: async () => JSON.parse(fs.readFileSync(suitePath('tunebook-files/ScH1855.json'), 'utf8')) });

    doc.getElementById('tab-library').click();
    await wait(300);
    const editBtn = [...doc.querySelectorAll('.lib-edit-edition-btn')].find(
      (b) => b.closest('.lib-edition-row').textContent.includes('ScH1855')
    );
    editBtn.click();
    await wait(300);
    doc.getElementById('loadTunebookFileBtn').click();
    await wait(300);

    const sourcesBtn = [...doc.querySelectorAll('.tf-section-btn')].find((b) => b.dataset.section === 'sources');
    sourcesBtn.click();
    await wait(150);
    const allBtn = [...doc.querySelectorAll('.tf-view-btn')].find((b) => b.dataset.view === 'all');
    allBtn.click();
    await wait(150);
    const notesField = [...doc.querySelectorAll('textarea')].find((el) => el.id.includes('historicalNotes'));
    assert.ok(notesField, 'Historical Notes should have a real editable field');
    notesField.value = 'A genuinely new, real historical note that was just added.';
    notesField.dispatchEvent(new win.Event('change', { bubbles: true }));
    await wait(100);

    doc.getElementById('tab-export').click();
    await wait(300);
    const sel = doc.getElementById('exportBookSelect');
    const schOpt = [...sel.options].find((o) => o.textContent.includes('ScH1855'));
    sel.value = schOpt.value;
    sel.dispatchEvent(new win.Event('change'));
    await wait(200);

    const summaryText = doc.getElementById('exportDetails').textContent;
    assert.doesNotMatch(summaryText, /No changes from the bundled edition/,
      'A real, meaningful Level 3 edit must not be reported as no changes at all - the review\u2019s own confirmed finding');
    assert.match(summaryText, /Level 3 content has changed/);
    assert.match(summaryText, /scholarlyRecord/);
  });

  test('a genuinely unedited Level 3 file still correctly reports no changes', async () => {
    const dom = loadPage('tunebooks.html');
    const win = dom.window; win.confirm = () => true;
    await wait(700);
    const doc = win.document;
    win.fetch = async () => ({ ok: true, json: async () => JSON.parse(fs.readFileSync(suitePath('tunebook-files/ScH1855.json'), 'utf8')) });

    doc.getElementById('tab-library').click();
    await wait(300);
    const editBtn = [...doc.querySelectorAll('.lib-edit-edition-btn')].find(
      (b) => b.closest('.lib-edition-row').textContent.includes('ScH1855')
    );
    editBtn.click();
    await wait(300);
    doc.getElementById('loadTunebookFileBtn').click();
    await wait(300);

    doc.getElementById('tab-export').click();
    await wait(300);
    const sel = doc.getElementById('exportBookSelect');
    const schOpt = [...sel.options].find((o) => o.textContent.includes('ScH1855'));
    sel.value = schOpt.value;
    sel.dispatchEvent(new win.Event('change'));
    await wait(200);

    assert.match(doc.getElementById('exportDetails').textContent, /No changes from the bundled edition/,
      'This fix must not produce a false positive for a file that genuinely has no edits');
  });
});

describe('Kevin\u2019s own report: the Edit Tunebook page had two redundant lists, required a manual click to load a linked Level 3 file, and hid rich song data behind an expand button', () => {
  test('the Page index (Level 2) editor is hidden once a real Level 3 file is linked, and still shown for a genuinely Level 1/2 Edition', async () => {
    const dom = loadPage('tunebooks.html');
    const win = dom.window; win.confirm = () => true;
    await wait(700);
    const doc = win.document;
    win.fetch = async (path) => {
      const filename = path.split('/').pop();
      return { ok: true, json: async () => JSON.parse(fs.readFileSync(suitePath('tunebook-files/' + filename), 'utf8')) };
    };

    doc.getElementById('tab-library').click();
    await wait(300);
    const scRow = [...doc.querySelectorAll('.lib-edition-row')].find((r) => r.textContent.includes('ScH1855'));
    scRow.querySelector('.lib-edit-edition-btn').click();
    await wait(500);
    assert.equal(doc.getElementById('librarySongsSection').style.display, 'none',
      'A real Level 3 Edition must not show the redundant Page index editor alongside its own Contents/Index tab');

    doc.getElementById('tab-library').click();
    await wait(200);
    const shdRow = [...doc.querySelectorAll('.lib-edition-row')].find((r) => r.textContent.includes('SHD1936'));
    shdRow.querySelector('.lib-edit-edition-btn').click();
    await wait(300);
    assert.equal(doc.getElementById('librarySongsSection').style.display, 'block',
      'A genuinely Level 1/2 Edition (no Tunebook File yet) still needs this editor - it is the only way to build up its page index at all');
  });

  test('a linked Level 3 file loads automatically on opening the Edition, with no click on "Open Tunebook File" required', async () => {
    const dom = loadPage('tunebooks.html');
    const win = dom.window; win.confirm = () => true;
    await wait(700);
    const doc = win.document;
    win.fetch = async (path) => {
      const filename = path.split('/').pop();
      return { ok: true, json: async () => JSON.parse(fs.readFileSync(suitePath('tunebook-files/' + filename), 'utf8')) };
    };

    doc.getElementById('tab-library').click();
    await wait(300);
    const row = [...doc.querySelectorAll('.lib-edition-row')].find((r) => r.textContent.includes('ScH1855'));
    row.querySelector('.lib-edit-edition-btn').click();
    // Deliberately no click on loadTunebookFileBtn at all.
    await wait(500);
    assert.match(doc.getElementById('tunebookFileStatus').textContent, /^Loaded/, 'The file must load on its own');
    assert.ok(doc.getElementById('tunebookFileSummary').innerHTML.length > 0);
  });

  test('a song row shows its real enrichment as read-only preview text by default, with an explicit Edit toggle - not hidden behind an expand button', async () => {
    const dom = loadPage('tunebooks.html');
    const win = dom.window; win.confirm = () => true;
    await wait(700);
    const doc = win.document;
    win.fetch = async () => ({ ok: true, json: async () => JSON.parse(fs.readFileSync(suitePath('tunebook-files/VPH2024.json'), 'utf8')) });

    doc.getElementById('tab-library').click();
    await wait(300);
    const row = [...doc.querySelectorAll('.lib-edition-row')].find((r) => r.textContent.includes('VPH2024'));
    row.querySelector('.lib-edit-edition-btn').click();
    await wait(500);
    const contentsBtn = [...doc.querySelectorAll('.tf-section-btn')].find((b) => b.dataset.section === 'contents');
    contentsBtn.click();
    await wait(200);
    const allBtn = [...doc.querySelectorAll('.tf-view-btn')].find((b) => b.dataset.view === 'all');
    allBtn.click();
    await wait(200);

    let songRow = [...doc.querySelectorAll('.tf-song-row')].find((r) => r.querySelector('.tf-song-title-input').dataset.page === '2');
    assert.ok(songRow.querySelector('.tf-song-preview'), 'Real enrichment must show as read-only preview text by default');
    assert.match(songRow.querySelector('.tf-song-preview').textContent, /Meter:.*Key:.*Text:/s);
    assert.equal(songRow.querySelector('.tf-song-expand-btn').textContent, 'Edit');
    assert.equal(songRow.querySelectorAll('.tf-song-field-input').length, 0, 'No editable inputs until Edit is actually clicked');

    songRow.querySelector('.tf-song-expand-btn').click();
    await wait(150);
    songRow = [...doc.querySelectorAll('.tf-song-row')].find((r) => r.querySelector('.tf-song-title-input').dataset.page === '2');
    assert.equal(songRow.querySelector('.tf-song-expand-btn').textContent, 'Done');
    assert.ok(!songRow.querySelector('.tf-song-preview'), 'Preview must be replaced by the edit form while editing, not shown alongside it');
    assert.ok(songRow.querySelectorAll('.tf-song-field-input').length > 0);
  });

  test('structured fields (textAttribution, source) get real sub-inputs when edited, never the literal string "[object Object]" - a genuine data-corruption risk the old single-input form had', async () => {
    const dom = loadPage('tunebooks.html');
    const win = dom.window; win.confirm = () => true;
    await wait(700);
    const doc = win.document;
    win.fetch = async () => ({ ok: true, json: async () => JSON.parse(fs.readFileSync(suitePath('tunebook-files/VPH2024.json'), 'utf8')) });

    doc.getElementById('tab-library').click();
    await wait(300);
    const row = [...doc.querySelectorAll('.lib-edition-row')].find((r) => r.textContent.includes('VPH2024'));
    row.querySelector('.lib-edit-edition-btn').click();
    await wait(500);
    const contentsBtn = [...doc.querySelectorAll('.tf-section-btn')].find((b) => b.dataset.section === 'contents');
    contentsBtn.click();
    await wait(200);
    const allBtn = [...doc.querySelectorAll('.tf-view-btn')].find((b) => b.dataset.view === 'all');
    allBtn.click();
    await wait(200);

    let songRow = [...doc.querySelectorAll('.tf-song-row')].find((r) => r.querySelector('.tf-song-title-input').dataset.page === '2');
    songRow.querySelector('.tf-song-expand-btn').click();
    await wait(150);
    songRow = [...doc.querySelectorAll('.tf-song-row')].find((r) => r.querySelector('.tf-song-title-input').dataset.page === '2');

    const creditInput = songRow.querySelector('.tf-song-field-input[data-key="textAttribution"][data-subfield="credit"]');
    const yearInput = songRow.querySelector('.tf-song-field-input[data-key="textAttribution"][data-subfield="year"]');
    assert.ok(creditInput && yearInput, 'textAttribution must render as two real sub-inputs, not one');
    assert.notEqual(creditInput.value, '[object Object]');
    assert.equal(creditInput.value, 'Robert Robinson');
    assert.equal(yearInput.value, '1757');

    creditInput.value = 'Edited Credit';
    creditInput.dispatchEvent(new win.Event('change', { bubbles: true }));
    await wait(50);
    songRow = [...doc.querySelectorAll('.tf-song-row')].find((r) => r.querySelector('.tf-song-title-input').dataset.page === '2');
    const yearAfter = songRow.querySelector('.tf-song-field-input[data-key="textAttribution"][data-subfield="year"]');
    assert.equal(yearAfter.value, '1757', 'Editing one sub-field must never clobber the other');
  });
});
