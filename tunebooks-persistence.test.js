// Regression coverage for two real Tunebook Editor bugs found in an external
// release-readiness review (R57-03, R57-04). Neither test needs access to libraryData's
// own closure-private state - both verify something genuinely externally observable (the
// real exported file's content, and the real rendered UI after a real reload), matching
// how each bug was actually confirmed and fixed in the first place.
'use strict';

const { test, describe, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const { loadPage, suitePath, wait, closeAllWindows } = require('./helpers');
const EZMinutesShared = require(suitePath('shared-utils.js'));

after(() => { closeAllWindows(); });

describe('Tunebook Library export is genuinely lossless (R57-03)', () => {
  test('exporting with no edits round-trips deep-equal to the bundled file, including fields not on the explicit field-order list', async () => {
    const dom = loadPage('tunebooks.html');
    const win = dom.window;
    await wait(700);
    const doc = win.document;
    doc.getElementById('tab-library').click();
    await wait(300);

    let capturedText = null;
    win.URL.createObjectURL = function () { return 'blob:test'; };
    win.URL.revokeObjectURL = function () {};
    const OrigBlob = win.Blob;
    win.Blob = function (parts, opts) { capturedText = parts[0]; return new OrigBlob(parts, opts); };
    win.HTMLAnchorElement.prototype.click = function () {};

    doc.getElementById('exportLibraryBtn').click();
    await wait(300);

    assert.ok(capturedText, 'Export should have produced real file content');
    const exported = new Function(capturedText + '\nreturn EZ_MINUTES_TUNEBOOK_LIBRARY;')();
    const original = fs.readFileSync(suitePath('tunebook-library.js'), 'utf8');
    const originalObj = new Function(original + '\nreturn EZ_MINUTES_TUNEBOOK_LIBRARY;')();

    assert.deepStrictEqual(exported.works, originalObj.works, 'Works must round-trip with no loss');
    assert.deepStrictEqual(exported.editions, originalObj.editions, 'Editions must round-trip with no loss, including fields like addedIn that are not on the explicit LIB_EDITION_ORDER list');
  });
});

describe('New Tunebook genuinely persists (R57-04)', () => {
  test('a newly added Work and Edition survive a real, separate page reload', async () => {
    const store = {};
    const makeLocalStorage = () => ({
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; },
    });

    const dom1 = loadPage('tunebooks.html');
    Object.defineProperty(dom1.window, 'localStorage', { value: makeLocalStorage() });
    await wait(700);
    const doc1 = dom1.window.document;
    doc1.getElementById('tab-library').click();
    await wait(200);
    doc1.getElementById('nt_workCode').value = 'REGRTEST';
    doc1.getElementById('nt_titleProper').value = 'Regression Test Work';
    doc1.getElementById('nt_includeEdition').checked = true;
    doc1.getElementById('nt_includeEdition').dispatchEvent(new dom1.window.Event('change'));
    doc1.getElementById('nt_editionIdentifierYear').value = '2024';
    doc1.getElementById('nt_editionTitleProper').value = 'Regression Test Edition';
    doc1.getElementById('nt_editionCommonName').value = 'Regr Test';
    doc1.getElementById('newTunebookBtn').click();
    await wait(200);
    assert.match(doc1.getElementById('newTunebookStatus').textContent, /Added/, 'New Tunebook should report success for the combined Work+Edition creation');

    // A genuinely separate page load, sharing only the same persistent storage - the real
    // test of "does this survive a reload," not just "was saveLibraryWorkingCopy() called."
    const dom2 = loadPage('tunebooks.html');
    Object.defineProperty(dom2.window, 'localStorage', { value: makeLocalStorage() });
    await wait(700);
    const doc2 = dom2.window.document;
    doc2.getElementById('tab-library').click();
    await wait(300);

    const browseText = doc2.getElementById('libraryBrowse').textContent;
    assert.ok(browseText.includes('Regression Test Work'), 'The new Work must survive a real reload');
    assert.ok(browseText.includes('REGRTEST2024'), 'The new Edition must survive a real reload');
  });
});

describe('Work Code rename cascades child Edition Codes transactionally (v68 review R68-06)', () => {
  test('renaming a Work Code regenerates every child Edition Code together', async () => {
    const dom = loadPage('tunebooks.html');
    const win = dom.window; win.confirm = () => true;
    await wait(700);
    const doc = win.document;
    doc.getElementById('tab-library').click();
    await wait(200);
    doc.getElementById('nt_workCode').value = 'CASCADETEST';
    doc.getElementById('nt_titleProper').value = 'Cascade Test Work';
    doc.getElementById('nt_includeEdition').checked = true;
    doc.getElementById('nt_includeEdition').dispatchEvent(new win.Event('change'));
    doc.getElementById('nt_editionIdentifierYear').value = '2020';
    doc.getElementById('newTunebookBtn').click();
    await wait(200);

    const workBtn = [...doc.querySelectorAll('.lib-edit-work-btn')].find((b) => b.closest('.lib-work-row').textContent.includes('CASCADETEST'));
    workBtn.click();
    await wait(200);
    doc.getElementById('lef_workCode').value = 'RENAMEDCODE';
    doc.getElementById('libraryEditSaveBtn').click();
    await wait(200);

    assert.ok(doc.getElementById('libraryBrowse').textContent.includes('RENAMEDCODE2020'),
      'The child Edition Code must be regenerated from the new Work Code, not left stale');
    assert.ok(!doc.getElementById('libraryBrowse').textContent.includes('CASCADETEST2020'),
      'The old, now-invalid Edition Code must not still be showing anywhere');

    doc.getElementById('validateLibraryBtn').click();
    await wait(200);
    assert.doesNotMatch(doc.getElementById('libraryValidationReport').textContent, /error/,
      'The real Library validator must report zero errors immediately after the rename - not require a separate fix-up pass');
  });

  test('a rename that would collide with an existing Edition Code is rejected transactionally - nothing is partially changed', async () => {
    const dom = loadPage('tunebooks.html');
    const win = dom.window; win.confirm = () => true;
    await wait(700);
    const doc = win.document;
    doc.getElementById('tab-library').click();
    await wait(200);

    doc.getElementById('nt_workCode').value = 'RENTEST';
    doc.getElementById('nt_titleProper').value = 'To Be Renamed';
    doc.getElementById('nt_includeEdition').checked = true;
    doc.getElementById('nt_includeEdition').dispatchEvent(new win.Event('change'));
    doc.getElementById('nt_editionIdentifierYear').value = '2020';
    doc.getElementById('newTunebookBtn').click();
    await wait(150);

    doc.getElementById('nt_workCode').value = 'BLOCKER';
    doc.getElementById('nt_titleProper').value = 'Collision Target';
    doc.getElementById('nt_includeEdition').checked = true;
    doc.getElementById('nt_includeEdition').dispatchEvent(new win.Event('change'));
    doc.getElementById('nt_editionIdentifierYear').value = '2020';
    doc.getElementById('newTunebookBtn').click();
    await wait(150);

    const workBtn = [...doc.querySelectorAll('.lib-edit-work-btn')].find((b) => b.closest('.lib-work-row').textContent.includes('RENTEST'));
    workBtn.click();
    await wait(200);
    doc.getElementById('lef_workCode').value = 'BLOCKER';
    doc.getElementById('libraryEditSaveBtn').click();
    await wait(200);

    assert.match(doc.getElementById('libraryEditStatus').textContent, /collide/,
      'A rename that would produce a duplicate Edition Code must be rejected with a clear reason');
    // V81 review, finding 3: this now goes through the same general libValidateEdit()
    // gate every field edit does, which leaves the attempted value visible for correction
    // rather than silently reverting it - consistent with how every other validation
    // error in this app already behaves (tfValidate(), for instance, never reverts a
    // field either). The old, one-off "revert just this one field" behavior only ever
    // existed for this single case; it's gone now in favor of that consistency.
    assert.equal(doc.getElementById('lef_workCode').value, 'BLOCKER', 'The attempted value stays visible so the person can see and correct it, matching every other validation error in this app');

    doc.getElementById('validateLibraryBtn').click();
    await wait(200);
    assert.doesNotMatch(doc.getElementById('libraryValidationReport').textContent, /error/,
      'A rejected rename must leave the Library in a genuinely valid state - not partially applied');
  });
});

describe('Work list sorting is article-insensitive (v61 review #4)', () => {
  test('titles beginning with An interleave correctly among titles beginning with The, by real title rather than clustering by leading article', async () => {
    const dom = loadPage('tunebooks.html');
    const win = dom.window; win.confirm = () => true;
    await wait(700);
    const doc = win.document;
    doc.getElementById('tab-library').click();
    await wait(300);

    const rows = [...doc.querySelectorAll('.lib-work-row')];
    const titlesInOrder = rows.map((r) => r.textContent.trim());
    const idx = (needle) => titlesInOrder.findIndex((t) => t.includes(needle));

    // "The American Harmony" (the fourth anchor this test used to use) was merged
    // 2026-09-07 into "American Harmony: Inspired Choral Miniatures" - it was a duplicate
    // provisional record for the same book Kevin confirmed AHI already covers, so that
    // exact title no longer exists as its own row. "American or Union Harmonist" is a
    // real, stable title that still sorts correctly after "The American Harmonist" by
    // real title, so it stands in as the fourth anchor.
    const positions = [
      idx('An American Christmas Harp'),
      idx('The American Church Harp'),
      idx('The American Harmonist'),
      idx('American or Union Harmonist'),
    ];
    assert.ok(positions.every((p) => p > -1), 'All four real reference titles should be present in the Library');
    const sortedPositions = positions.slice().sort((a, b) => a - b);
    assert.deepStrictEqual(positions, sortedPositions,
      'These four titles should appear in real-title alphabetical order (Christmas, Church, Harmonist, or Union Harmonist), not clustered by their leading An/The');
  });
});

describe('Generic Work/Edition Save validates before persisting, matching New Tunebook (v81 review, finding 3)', () => {
  test('renaming a Work Code to a real, existing duplicate is blocked outright, not caught only by a later separate validation run', async () => {
    const dom = loadPage('tunebooks.html');
    const win = dom.window; win.confirm = () => true;
    await wait(700);
    const doc = win.document;
    doc.getElementById('tab-library').click();
    await wait(300);
    // SHM and SHW are both real Works in the bundled Library, with no Edition Code
    // collision between their real children - exactly the review's own reproduction,
    // which the old, Edition-Code-only collision check could not catch.
    const shmBtn = [...doc.querySelectorAll('.lib-edit-work-btn')].find((b) => b.closest('.lib-work-row').textContent.includes('SHM'));
    shmBtn.click();
    await wait(200);
    doc.getElementById('lef_workCode').value = 'SHW';
    doc.getElementById('libraryEditSaveBtn').click();
    await wait(200);
    assert.match(doc.getElementById('libraryEditStatus').textContent, /already exists/);

    doc.getElementById('validateLibraryBtn').click();
    await wait(200);
    assert.doesNotMatch(doc.getElementById('libraryValidationReport').textContent, /Duplicate workCode/,
      'The Library must never actually contain the duplicate - blocked before persistence, not fixed up after');
  });

  test('changing an Edition Identifier Year to produce a real, existing duplicate Edition Code is blocked', async () => {
    const dom = loadPage('tunebooks.html');
    const win = dom.window; win.confirm = () => true;
    await wait(700);
    const doc = win.document;
    doc.getElementById('tab-library').click();
    await wait(300);
    const edBtn = [...doc.querySelectorAll('.lib-edit-edition-btn')].find((b) => b.closest('.lib-edition-row').textContent.includes('SHM2025'));
    edBtn.click();
    await wait(200);
    doc.getElementById('lef_editionIdentifierYear').value = '1991';
    doc.getElementById('libraryEditSaveBtn').click();
    await wait(200);
    assert.match(doc.getElementById('libraryEditStatus').textContent, /already exists/);
  });

  test('a blank Work Code is blocked, rather than silently deleting the field', async () => {
    const dom = loadPage('tunebooks.html');
    const win = dom.window; win.confirm = () => true;
    await wait(700);
    const doc = win.document;
    doc.getElementById('tab-library').click();
    await wait(300);
    const shmBtn = [...doc.querySelectorAll('.lib-edit-work-btn')].find((b) => b.closest('.lib-work-row').textContent.includes('SHM'));
    shmBtn.click();
    await wait(200);
    doc.getElementById('lef_workCode').value = '';
    doc.getElementById('libraryEditSaveBtn').click();
    await wait(200);
    assert.match(doc.getElementById('libraryEditStatus').textContent, /Work Code is required/);
  });

  test('a malformed Edition Identifier Year is blocked on the ordinary Edit Edition path, not just on New Tunebook', async () => {
    const dom = loadPage('tunebooks.html');
    const win = dom.window; win.confirm = () => true;
    await wait(700);
    const doc = win.document;
    doc.getElementById('tab-library').click();
    await wait(300);
    const edBtn = [...doc.querySelectorAll('.lib-edit-edition-btn')].find((b) => b.closest('.lib-edition-row').textContent.includes('SHM2025'));
    edBtn.click();
    await wait(200);
    doc.getElementById('lef_editionIdentifierYear').value = 'bad';
    doc.getElementById('libraryEditSaveBtn').click();
    await wait(200);
    assert.match(doc.getElementById('libraryEditStatus').textContent, /must be exactly 4 characters/);
  });

  test('a genuinely valid edit still saves cleanly, and the canonical export gate blocks nothing on a valid Library', async () => {
    const dom = loadPage('tunebooks.html');
    const win = dom.window; win.confirm = () => true;
    await wait(700);
    const doc = win.document;
    doc.getElementById('tab-library').click();
    await wait(300);
    const edBtn = [...doc.querySelectorAll('.lib-edit-edition-btn')].find((b) => b.closest('.lib-edition-row').textContent.includes('SHM2025'));
    edBtn.click();
    await wait(200);
    doc.getElementById('lef_shmhaCode').value = 'ZZTEST';
    doc.getElementById('libraryEditSaveBtn').click();
    await wait(200);
    assert.match(doc.getElementById('libraryEditStatus').textContent, /^Saved/);

    let capturedText = null;
    win.URL.createObjectURL = function () { return 'blob:test'; };
    win.URL.revokeObjectURL = function () {};
    win.HTMLAnchorElement.prototype.click = function () {};
    const OrigBlob = win.Blob;
    win.Blob = function (parts, opts) { capturedText = parts[0]; return new OrigBlob(parts, opts); };
    doc.getElementById('exportLibraryBtn').click();
    await wait(200);
    assert.ok(capturedText, 'A valid Library must still export successfully');
  });
});

describe('Save / Export nomenclature correctly distinguishes the canonical Library from a derived contribution (v81 review, finding 9)', () => {
  test('the canonical Library operation is labeled Save; Export is reserved for the derived Contribution format', async () => {
    const dom = loadPage('tunebooks.html');
    const win = dom.window; win.confirm = () => true;
    await wait(700);
    const doc = win.document;

    assert.equal(doc.getElementById('exportLibraryBtn').textContent, 'Save tunebook-library.js',
      'The canonical, primary artifact - the Library itself, serialized - is a Save, not an Export');

    doc.getElementById('tab-export').click();
    await wait(300);
    assert.equal(doc.getElementById('exportContributionBtn').textContent, 'Export Contribution',
      'A derived, special-purpose output for a different party remains an Export');
  });

  test('a genuinely valid Save still succeeds and produces the real tunebook-library.js text', async () => {
    const dom = loadPage('tunebooks.html');
    const win = dom.window; win.confirm = () => true;
    await wait(700);
    const doc = win.document;

    let capturedText = null;
    win.URL.createObjectURL = function () { return 'blob:test'; };
    win.URL.revokeObjectURL = function () {};
    win.HTMLAnchorElement.prototype.click = function () {};
    const OrigBlob = win.Blob;
    win.Blob = function (parts, opts) { capturedText = parts[0]; return new OrigBlob(parts, opts); };
    doc.getElementById('exportLibraryBtn').click();
    await wait(200);

    assert.ok(capturedText && capturedText.includes('EZ_MINUTES_TUNEBOOK_LIBRARY'),
      'The rename must not have broken the underlying save mechanism');
    assert.match(doc.getElementById('exportLibraryStatus').textContent, /Downloaded/);
  });
});

describe('Full Library validation enforces the same identity invariants as normal editing (v89 release-readiness review, finding 6)', () => {
  async function realBundledFingerprint() {
    const dom = loadPage('tunebooks.html');
    const win = dom.window; win.confirm = () => true;
    const store = {};
    Object.defineProperty(win, 'localStorage', {
      value: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => delete store[k] },
      configurable: true,
    });
    await wait(700);
    const doc = win.document;
    doc.getElementById('newTunebookToggleBtn').click();
    await wait(100);
    doc.getElementById('nt_workCode').value = 'F6TEMP';
    doc.getElementById('nt_titleProper').value = 'Finding 6 Temp';
    doc.getElementById('newTunebookBtn').click();
    await wait(200);
    const fingerprint = JSON.parse(store['ezTunebooksLibraryWorkingCopy']).baselineFingerprint;
    win.close();
    return fingerprint;
  }

  async function validateCorrupted(realFingerprint, corruptFn) {
    const lib = new Function(fs.readFileSync(suitePath('tunebook-library.js'), 'utf8') + '\nreturn EZ_MINUTES_TUNEBOOK_LIBRARY;')();
    const corrupt = JSON.parse(JSON.stringify(lib));
    corruptFn(corrupt);
    const store = { ezTunebooksLibraryWorkingCopy: JSON.stringify({ data: corrupt, baselineFingerprint: realFingerprint, workingFingerprint: realFingerprint }) };
    const dom = loadPage('tunebooks.html');
    const win = dom.window; win.confirm = () => true;
    Object.defineProperty(win, 'localStorage', {
      value: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => delete store[k] },
      configurable: true,
    });
    await wait(700);
    const doc = win.document;
    doc.getElementById('tab-library').click();
    await wait(300);
    doc.getElementById('validateLibraryBtn').click();
    await wait(200);
    const report = doc.getElementById('libraryValidationReport').textContent;
    win.close();
    return report;
  }

  test('a blank Work Code, which the normal editor already rejects, now also fails full validation', async () => {
    const fp = await realBundledFingerprint();
    const report = await validateCorrupted(fp, (c) => { c.works[Object.keys(c.works)[0]].workCode = ''; });
    assert.match(report, /missing a Work Code/);
  });

  test('a malformed Work Code (non-alphanumeric), which the normal editor already rejects, now also fails full validation', async () => {
    const fp = await realBundledFingerprint();
    const report = await validateCorrupted(fp, (c) => { c.works[Object.keys(c.works)[0]].workCode = 'BAD-CODE!'; });
    assert.match(report, /must contain only letters and digits/);
  });

  test('a Work object-key / workId mismatch now fails full validation', async () => {
    const fp = await realBundledFingerprint();
    const report = await validateCorrupted(fp, (c) => { c.works[Object.keys(c.works)[0]].workId = 'w_totally_different'; });
    assert.match(report, /mismatched workId/);
  });

  test('an Edition object-key / editionId mismatch now fails full validation', async () => {
    const fp = await realBundledFingerprint();
    const report = await validateCorrupted(fp, (c) => { c.editions[Object.keys(c.editions)[0]].editionId = 'e_totally_different'; });
    assert.match(report, /mismatched editionId/);
  });

  test('a genuinely valid, unmodified Library still passes cleanly - no false positives from the new checks', async () => {
    const fp = await realBundledFingerprint();
    const report = await validateCorrupted(fp, () => {});
    assert.match(report, /No issues found/);
  });

  test('an Edition missing editionId entirely (v91 release-readiness review, finding 4) now also fails full validation and blocks Save', async () => {
    const fp = await realBundledFingerprint();
    const lib = new Function(fs.readFileSync(suitePath('tunebook-library.js'), 'utf8') + '\nreturn EZ_MINUTES_TUNEBOOK_LIBRARY;')();
    const corrupt = JSON.parse(JSON.stringify(lib));
    const key = Object.keys(corrupt.editions)[0];
    delete corrupt.editions[key].editionId;
    const store = { ezTunebooksLibraryWorkingCopy: JSON.stringify({ data: corrupt, baselineFingerprint: fp, workingFingerprint: fp }) };
    const dom = loadPage('tunebooks.html');
    const win = dom.window; win.confirm = () => true;
    Object.defineProperty(win, 'localStorage', {
      value: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => delete store[k] },
      configurable: true,
    });
    await wait(700);
    const doc = win.document;
    doc.getElementById('tab-library').click();
    await wait(300);
    doc.getElementById('validateLibraryBtn').click();
    await wait(200);
    assert.match(doc.getElementById('libraryValidationReport').textContent, /missing editionId entirely/);

    let downloadTriggered = false;
    win.URL.createObjectURL = function () { downloadTriggered = true; return 'blob:test'; };
    doc.getElementById('exportLibraryBtn').click();
    await wait(200);
    assert.ok(!downloadTriggered, 'Canonical Save must be blocked, not just Validate showing a warning');
  });
});

describe('Canonical Library validation catches current-schema invariants the ordinary editor already enforces (v96 release-readiness review, finding 2)', () => {
  async function realBundledFingerprint2() {
    const dom = loadPage('tunebooks.html');
    const win = dom.window; win.confirm = () => true;
    const store = {};
    Object.defineProperty(win, 'localStorage', {
      value: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => delete store[k] },
      configurable: true,
    });
    await wait(700);
    const doc = win.document;
    doc.getElementById('newTunebookToggleBtn').click();
    await wait(100);
    doc.getElementById('nt_workCode').value = 'F296TEMP';
    doc.getElementById('nt_titleProper').value = 'Finding 2 v96 Temp';
    doc.getElementById('newTunebookBtn').click();
    await wait(200);
    const fingerprint = JSON.parse(store['ezTunebooksLibraryWorkingCopy']).baselineFingerprint;
    win.close();
    return fingerprint;
  }

  async function validateCorrupted2(realFingerprint, corruptFn) {
    const lib = new Function(fs.readFileSync(suitePath('tunebook-library.js'), 'utf8') + '\nreturn EZ_MINUTES_TUNEBOOK_LIBRARY;')();
    const corrupt = JSON.parse(JSON.stringify(lib));
    corruptFn(corrupt);
    const store = { ezTunebooksLibraryWorkingCopy: JSON.stringify({ data: corrupt, baselineFingerprint: realFingerprint, workingFingerprint: realFingerprint }) };
    const dom = loadPage('tunebooks.html');
    const win = dom.window; win.confirm = () => true;
    Object.defineProperty(win, 'localStorage', {
      value: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => delete store[k] },
      configurable: true,
    });
    await wait(700);
    const doc = win.document;
    doc.getElementById('tab-library').click();
    await wait(300);
    doc.getElementById('validateLibraryBtn').click();
    await wait(200);
    const report = doc.getElementById('libraryValidationReport').textContent;
    win.close();
    return report;
  }

  test('a complete Edition with a blank page title fails canonical validation', async () => {
    const fp = await realBundledFingerprint2();
    const report = await validateCorrupted2(fp, (c) => {
      const e = Object.values(c.editions).find((e) => e.editionCode === 'ScH1855');
      const firstPage = Object.keys(e.songs)[0];
      e.songs[firstPage].title = '';
    });
    assert.match(report, /blank or missing title/);
  });

  test('an invalid Index Status fails canonical validation', async () => {
    const fp = await realBundledFingerprint2();
    const report = await validateCorrupted2(fp, (c) => {
      const e = Object.values(c.editions).find((e) => e.indexStatus === 'none' && !e.tunebookFile);
      e.indexStatus = 'bogus';
    });
    assert.match(report, /Index Status "bogus"/);
  });

  test('an invalid Minutes Visibility fails canonical validation', async () => {
    const fp = await realBundledFingerprint2();
    const report = await validateCorrupted2(fp, (c) => {
      const e = Object.values(c.editions).find((e) => e.editionCode === 'ScH1855');
      e.ezMinutesVisibility = 'bogus';
    });
    assert.match(report, /Minutes Visibility "bogus"/);
  });

  test('a genuinely valid, unmodified Library still passes cleanly - no false positives from any of the three new checks', async () => {
    const fp = await realBundledFingerprint2();
    const report = await validateCorrupted2(fp, () => {});
    assert.match(report, /No issues found/);
  });
});

describe('Importing a Library file never executes it as code (v91 release-readiness review, finding 2)', () => {
  test('an unrelated JavaScript statement in an imported file is never executed', async () => {
    const dom = loadPage('tunebooks.html');
    const win = dom.window; win.confirm = () => true;
    await wait(700);
    const doc = win.document;

    let sideEffectRan = false;
    win.__SIDE_EFFECT_PROOF__ = () => { sideEffectRan = true; };
    const maliciousContent = '\n__SIDE_EFFECT_PROOF__();\nconst EZ_MINUTES_TUNEBOOK_LIBRARY = { "works": {}, "editions": {} };\n';

    doc.getElementById('tab-library').click();
    await wait(200);
    const file = new win.File([maliciousContent], 'tunebook-library.js', { type: 'text/javascript' });
    const input = doc.getElementById('libraryFileInput');
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new win.Event('change'));
    await wait(300);

    assert.equal(sideEffectRan, false, 'A statement placed anywhere in an imported file must never execute');
  });

  test('a real, genuine, full tunebook-library.js export still imports successfully through the safe parser', async () => {
    const dom = loadPage('tunebooks.html');
    const win = dom.window; win.confirm = () => true;
    await wait(700);
    const doc = win.document;

    doc.getElementById('tab-library').click();
    await wait(200);
    const realLibraryText = fs.readFileSync(suitePath('tunebook-library.js'), 'utf8');
    const file = new win.File([realLibraryText], 'tunebook-library.js', { type: 'text/javascript' });
    const input = doc.getElementById('libraryFileInput');
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new win.Event('change'));
    await wait(300);

    assert.match(doc.getElementById('libraryStatus').textContent, /Loaded \d+ Work\(s\) and \d+ Edition\(s\)/,
      'The real, actual shipped Library file must still parse and load successfully as data, not just be rejected for safety');
    doc.getElementById('validateLibraryBtn').click();
    await wait(200);
    assert.match(doc.getElementById('libraryValidationReport').textContent, /No issues found/);
  });

  test('a genuinely malformed file is rejected with a clear error, not executed and not crashing the page', async () => {
    const dom = loadPage('tunebooks.html');
    const win = dom.window; win.confirm = () => true;
    await wait(700);
    const doc = win.document;

    doc.getElementById('tab-library').click();
    await wait(200);
    const badContent = 'const EZ_MINUTES_TUNEBOOK_LIBRARY = { this is not valid data at all };';
    const file = new win.File([badContent], 'tunebook-library.js', { type: 'text/javascript' });
    const input = doc.getElementById('libraryFileInput');
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new win.Event('change'));
    await wait(300);

    assert.match(doc.getElementById('libraryStatus').textContent, /couldn.t parse it as data/i);
  });
});

describe('Generic Library page editor uses the real shared page sorter, not a second reimplementation (v91 release-readiness review, finding 3)', () => {
  test('a real split page (5t/5b) sorts correctly in the generic editor, not alphabetically', async () => {
    const dom = loadPage('tunebooks.html');
    const win = dom.window; win.confirm = () => true;
    await wait(700);
    const doc = win.document;

    doc.getElementById('tab-library').click();
    await wait(300);
    // CHM2010, not ScH1855 - CHM2010 is genuinely Level 2 (no Tunebook File), so its
    // generic page editor is the one still shown for it. ScH1855 is real Level 3, and
    // per Kevin's own later correction, the generic editor is now correctly hidden once
    // a Level 3 file exists - this test's own subject had to move with that change.
    const row = [...doc.querySelectorAll('.lib-edition-row')].find((r) => r.textContent.includes('CHM2010'));
    row.querySelector('.lib-edit-edition-btn').click();
    await wait(300);

    const pages = [...doc.querySelectorAll('.lib-song-row')].map((r) => r.dataset.page);
    const idx5t = pages.indexOf('5t');
    const idx5b = pages.indexOf('5b');
    assert.ok(idx5t !== -1 && idx5b !== -1, 'CHM2010 has real 5t/5b split pages to test against');
    assert.ok(idx5t < idx5b, '5t must sort before 5b, matching the canonical shared sorter, not a naive numeric-then-alphabetic fallback');
  });

  test('the Level 3 Contents editor, on a real Level 3 edition, also uses the same real shared sorter - independently confirmed, since the two editors are now mutually exclusive per-Edition', async () => {
    const dom = loadPage('tunebooks.html');
    const win = dom.window; win.confirm = () => true;
    await wait(700);
    const doc = win.document;
    win.fetch = async () => ({ ok: true, json: async () => JSON.parse(fs.readFileSync(suitePath('tunebook-files/ScH1855.json'), 'utf8')) });

    doc.getElementById('tab-library').click();
    await wait(300);
    const row = [...doc.querySelectorAll('.lib-edition-row')].find((r) => r.textContent.includes('ScH1855'));
    row.querySelector('.lib-edit-edition-btn').click();
    // ScH1855 has a real Tunebook File, so the Level 3 file now auto-loads on opening
    // this Edition - no click on "Open Tunebook File" needed any more.
    await wait(500);
    const contentsBtn = [...doc.querySelectorAll('.tf-section-btn')].find((b) => b.dataset.section === 'contents');
    contentsBtn.click();
    await wait(200);
    const level3Pages = [...doc.querySelectorAll('.tf-song-row')].map((r) => r.querySelector('.tf-song-title-input').dataset.page);

    const l3 = JSON.parse(fs.readFileSync(suitePath('tunebook-files/ScH1855.json'), 'utf8'));
    const expectedOrder = EZMinutesShared.sortPages(Object.keys(l3.songs));
    assert.deepStrictEqual(level3Pages, expectedOrder, 'The Level 3 Contents editor must use the exact same shared sortPages() order, not a second, separately-maintained sort');
  });
});

describe('Bulk Edit (Level 1) correctly isolates rows sharing a Work, and correctly promotes a bare Work to a real Edition', () => {
  test('zero false-positive dirty state on initial load', async () => {
    const dom = loadPage('tunebooks.html');
    const win = dom.window; win.confirm = () => true;
    await wait(700);
    const doc = win.document;
    doc.getElementById('tab-bulk').click();
    await wait(300);
    assert.equal(doc.getElementById('bulkPendingCount').textContent, '');
    assert.ok(doc.getElementById('bulkSaveAllBtn').disabled);
  });

  test('a Work with multiple real Level 1 Editions (SHD) renders each as its own distinct, correctly-valued row', async () => {
    const dom = loadPage('tunebooks.html');
    const win = dom.window; win.confirm = () => true;
    await wait(700);
    const doc = win.document;
    doc.getElementById('tab-bulk').click();
    await wait(300);
    const shdRows = [...doc.querySelectorAll('tr[data-workid="w_SHD"]')];
    assert.equal(shdRows.length, 5, 'SHD has five real Level 1 Editions - each must get its own row');
    const years = shdRows.map((tr) => tr.querySelector('[data-field="editionIdentifierYear"]').value).sort();
    assert.deepStrictEqual(years, ['1936', '1960', '1966', '1971', '1987']);
    const commonNames = new Set(shdRows.map((tr) => tr.querySelector('[data-field="commonName"]').value));
    assert.equal(commonNames.size, 5, 'Each row must show its own distinct commonName, not one value repeated across all five');
  });

  test('editing one Edition among several sharing a Work does not affect its siblings (the real bug this fixed)', async () => {
    const dom = loadPage('tunebooks.html');
    const win = dom.window; win.confirm = () => true;
    const store = {};
    Object.defineProperty(win, 'localStorage', {
      value: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => delete store[k] },
      configurable: true,
    });
    await wait(700);
    const doc = win.document;
    doc.getElementById('tab-bulk').click();
    await wait(300);
    let rows = [...doc.querySelectorAll('tr[data-workid="w_SHD"]')];
    const shd1960 = rows.find((tr) => tr.querySelector('[data-field="editionIdentifierYear"]').value === '1960');
    shd1960.querySelector('[data-field="compiler"]').value = 'A Real Test Compiler';
    shd1960.querySelector('[data-field="compiler"]').dispatchEvent(new win.Event('input', { bubbles: true }));
    await wait(50);
    doc.getElementById('bulkSaveAllBtn').click();
    await wait(200);

    doc.getElementById('tab-bulk').click();
    await wait(200);
    rows = [...doc.querySelectorAll('tr[data-workid="w_SHD"]')];
    const shd1936After = rows.find((tr) => tr.querySelector('[data-field="editionIdentifierYear"]').value === '1936');
    const shd1960After = rows.find((tr) => tr.querySelector('[data-field="editionIdentifierYear"]').value === '1960');
    assert.equal(shd1936After.querySelector('[data-field="compiler"]').value, '', 'A sibling Edition sharing the same Work must be completely unaffected');
    assert.equal(shd1960After.querySelector('[data-field="compiler"]').value, 'A Real Test Compiler');
  });

  test('a shared field (SHMHA Code) edited on a bare-Work row updates the Work directly, with no Edition created', async () => {
    const dom = loadPage('tunebooks.html');
    const win = dom.window; win.confirm = () => true;
    const store = {};
    Object.defineProperty(win, 'localStorage', {
      value: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => delete store[k] },
      configurable: true,
    });
    await wait(700);
    const doc = win.document;
    doc.getElementById('tab-bulk').click();
    await wait(300);
    const rows = [...doc.querySelectorAll('#bulkTableBody tr')];
    const bareRow = rows.find((r) => r.querySelector('.bulk-status-cell').textContent.trim() === 'Work only');
    bareRow.querySelector('[data-field="shmhaCode"]').value = 'TESTCODE1';
    bareRow.querySelector('[data-field="shmhaCode"]').dispatchEvent(new win.Event('input', { bubbles: true }));
    await wait(50);
    doc.getElementById('bulkSaveAllBtn').click();
    await wait(200);
    assert.match(doc.getElementById('bulkSaveStatus').textContent, /1 field updated/);
  });

  test('an Edition-only field filled in without a year is blocked with a clear, specific message, and creates nothing', async () => {
    const dom = loadPage('tunebooks.html');
    const win = dom.window; win.confirm = () => true;
    const store = {};
    Object.defineProperty(win, 'localStorage', {
      value: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => delete store[k] },
      configurable: true,
    });
    await wait(700);
    const doc = win.document;
    doc.getElementById('tab-bulk').click();
    await wait(300);
    const rows = [...doc.querySelectorAll('#bulkTableBody tr')];
    const bareRow = rows.find((r) => r.querySelector('.bulk-status-cell').textContent.trim() === 'Work only');
    bareRow.querySelector('[data-field="compiler"]').value = 'Test Compiler';
    bareRow.querySelector('[data-field="compiler"]').dispatchEvent(new win.Event('input', { bubbles: true }));
    await wait(50);
    assert.equal(bareRow.querySelector('.bulk-status-cell').textContent.trim(), 'needs a year');
    doc.getElementById('bulkSaveAllBtn').click();
    await wait(200);
    assert.match(doc.getElementById('bulkSaveStatus').textContent, /Edition Identifier Year/);
  });

  test('an Edition-only field plus a real year creates a genuine new Level 1 Edition, visible afterward in the Library tab', async () => {
    const dom = loadPage('tunebooks.html');
    const win = dom.window; win.confirm = () => true;
    const store = {};
    Object.defineProperty(win, 'localStorage', {
      value: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => delete store[k] },
      configurable: true,
    });
    await wait(700);
    const doc = win.document;
    doc.getElementById('tab-bulk').click();
    await wait(300);
    const rows = [...doc.querySelectorAll('#bulkTableBody tr')];
    const bareRow = rows.find((r) => r.querySelector('.bulk-status-cell').textContent.trim() === 'Work only');
    const workCode = bareRow.querySelector('td').textContent;
    bareRow.querySelector('[data-field="editionIdentifierYear"]').value = '1955';
    bareRow.querySelector('[data-field="editionIdentifierYear"]').dispatchEvent(new win.Event('input', { bubbles: true }));
    // Publisher was removed from this grid's column set - commonName is another real,
    // still-present edition-only field, exercising the same "fills in an edition-only
    // field on a bare-Work row" path this test is actually about.
    bareRow.querySelector('[data-field="commonName"]').value = 'Test Common Name';
    bareRow.querySelector('[data-field="commonName"]').dispatchEvent(new win.Event('input', { bubbles: true }));
    await wait(50);
    assert.equal(bareRow.querySelector('.bulk-status-cell').textContent.trim(), 'will create Edition');
    doc.getElementById('bulkSaveAllBtn').click();
    await wait(200);
    assert.match(doc.getElementById('bulkSaveStatus').textContent, /1 new Level 1 Edition created/);

    doc.getElementById('tab-library').click();
    await wait(300);
    const newEditionRow = [...doc.querySelectorAll('.lib-edition-row')].find((r) => r.textContent.includes(workCode + '1955'));
    assert.ok(newEditionRow, 'The newly created Edition must genuinely exist in the real Library, not just show a success message');
  });
});

describe('Bulk Edit covers every book regardless of Level, not just Level 1 (Kevin\'s own correction to the tool\'s scope)', () => {
  test('a real Level 2 and a real Level 3 Edition both appear, each showing its own real Level, not a fixed "Level 1 Edition" label', async () => {
    const dom = loadPage('tunebooks.html');
    const win = dom.window; win.confirm = () => true;
    await wait(700);
    const doc = win.document;
    doc.getElementById('tab-bulk').click();
    await wait(300);
    const rows = [...doc.querySelectorAll('#bulkTableBody tr')];
    // Found by data-workid, not by the sticky first cell's text - that cell now shows
    // the row's real Edition Code once it has one ("ScH1855"), not the bare Work Code.
    const level3Row = rows.find((r) => r.dataset.workid === 'w_ScH');
    assert.ok(level3Row, 'ScH (a real Level 3 edition) must appear as a row');
    assert.equal(level3Row.querySelector('.bulk-status-cell').textContent.trim(), 'Level 3 Edition');
    const level2Row = rows.find((r) => r.querySelector('.bulk-status-cell').textContent.trim() === 'Level 2 Edition');
    assert.ok(level2Row, 'At least one real Level 2 edition must also appear as a row');
  });

  test('editing a bibliographic field on a Level 3 Edition saves correctly and never touches its page-related state', async () => {
    const dom = loadPage('tunebooks.html');
    const win = dom.window; win.confirm = () => true;
    const store = {};
    Object.defineProperty(win, 'localStorage', {
      value: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => delete store[k] },
      configurable: true,
    });
    await wait(700);
    const doc = win.document;
    doc.getElementById('tab-bulk').click();
    await wait(300);
    const rows = [...doc.querySelectorAll('#bulkTableBody tr')];
    const schRow = rows.find((r) => r.dataset.workid === 'w_ScH');
    // Place Published was removed from this grid's column set - Compiler is another
    // real, still-present bibliographic field, exercising the same edit-and-save path.
    schRow.querySelector('[data-field="compiler"]').value = 'Test Compiler';
    schRow.querySelector('[data-field="compiler"]').dispatchEvent(new win.Event('input', { bubbles: true }));
    await wait(50);
    doc.getElementById('bulkSaveAllBtn').click();
    await wait(200);
    assert.match(doc.getElementById('bulkSaveStatus').textContent, /1 field updated/);

    doc.getElementById('tab-library').click();
    await wait(300);
    const scRow = [...doc.querySelectorAll('.lib-edition-row')].find((r) => r.textContent.includes('ScH1855'));
    assert.match(scRow.textContent, /L3.*Tunebook File.*core complete/, 'The edition must still be exactly as Level 3 as before - page index and Tunebook File link untouched by a bibliographic-field edit');
  });

  test('the Bulk Edit tab sits in the second position, before Edit Tunebook', async () => {
    const dom = loadPage('tunebooks.html');
    const win = dom.window;
    await wait(700);
    const doc = win.document;
    const order = [...doc.querySelectorAll('.tab-btn')].map((t) => t.dataset.tab);
    assert.deepStrictEqual(order, ['library', 'bulk', 'edit', 'export']);
  });
});

describe('The complete Shape System set (4-shape, 7-shape, Round-note, Mixed, Other) is available everywhere Shape System is editable', () => {
  test('Round-note ("0-shape") appears in New Tunebook, Add Edition, and Bulk Edit dropdowns', async () => {
    const dom = loadPage('tunebooks.html');
    const win = dom.window; win.confirm = () => true;
    await wait(700);
    const doc = win.document;

    const assertHasRoundNote = (select, label) => {
      const opt = [...select.options].find((o) => o.value === '0-shape');
      assert.ok(opt, label + ' must have a 0-shape option');
      assert.equal(opt.textContent, 'Round-note');
    };
    assertHasRoundNote(doc.getElementById('nt_shapeSystem'), 'New Tunebook (Work)');
    assertHasRoundNote(doc.getElementById('nt_editionShapeSystem'), 'New Tunebook (Edition)');
    assertHasRoundNote(doc.getElementById('wae_shapeSystem'), 'Add Edition');

    doc.getElementById('tab-bulk').click();
    await wait(300);
    assertHasRoundNote(doc.querySelector('#bulkTableBody select[data-field="shapeSystem"]'), 'Bulk Edit');
  });

  test('the Level 3 editor renders Shape System as a real, constrained select (not free text), including Round-note, and a selected value actually persists', async () => {
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
    const pubBtn = [...doc.querySelectorAll('.tf-section-btn')].find((b) => b.dataset.section === 'publication');
    pubBtn.click();
    await wait(150);
    const allBtn = [...doc.querySelectorAll('.tf-view-btn')].find((b) => b.dataset.view === 'all');
    if (allBtn) { allBtn.click(); await wait(150); }

    const select = doc.getElementById('tf_library_shapeSystem');
    assert.equal(select.tagName, 'SELECT', 'Shape System must now be a real select, not a free-text input');
    const roundOpt = [...select.options].find((o) => o.value === '0-shape');
    assert.ok(roundOpt && roundOpt.textContent === 'Round-note');

    select.value = '0-shape';
    select.dispatchEvent(new win.Event('change', { bubbles: true }));
    await wait(100);
    assert.equal(select.value, '0-shape', 'The selected value must actually take and be reflected back');
  });

  test('Mixed and Other appear as real options in every Shape System dropdown, and a real book carrying either value renders the correct glyph, not the old digit-based one', async () => {
    const dom = loadPage('tunebooks.html');
    const win = dom.window; win.confirm = () => true;
    await wait(700);
    const doc = win.document;

    const assertHasMixedAndOther = (select, label) => {
      const values = [...select.options].map((o) => o.value);
      assert.ok(values.includes('mixed-shape'), label + ' must have a mixed-shape option');
      assert.ok(values.includes('other-shape'), label + ' must have an other-shape option');
    };
    assertHasMixedAndOther(doc.getElementById('nt_shapeSystem'), 'New Tunebook (Work)');
    assertHasMixedAndOther(doc.getElementById('nt_editionShapeSystem'), 'New Tunebook (Edition)');
    assertHasMixedAndOther(doc.getElementById('wae_shapeSystem'), 'Add Edition');

    doc.getElementById('tab-bulk').click();
    await wait(300);
    assertHasMixedAndOther(doc.querySelector('#bulkTableBody select[data-field="shapeSystem"]'), 'Bulk Edit');

    // A real book, given the new glyph, must show the NEW sans-serif circled digit -
    // not the old serif one this replaced outright, not a leftover from either system.
    doc.getElementById('tab-library').click();
    await wait(300);
    const fourRow = [...doc.querySelectorAll('.lib-edition-row')].find(
      (r) => r.querySelector('.shape-glyph') && r.querySelector('.shape-glyph').textContent === '\u278D'
    );
    assert.ok(fourRow, 'A real 4-shape book must show the new sans-serif \u278D glyph');
    const oldGlyphRow = [...doc.querySelectorAll('.lib-edition-row')].find(
      (r) => r.querySelector('.shape-glyph') && r.querySelector('.shape-glyph').textContent === '\u2779'
    );
    assert.ok(!oldGlyphRow, 'The old serif \u2779 glyph must be completely gone, not left showing anywhere');
  });
});

describe('Library import/export is genuinely lossless at the top level, and rejects a newer schema (v96 release-readiness review, finding 1)', () => {
  test('an unknown top-level field survives a zero-edit import/export/re-import round trip', async () => {
    const dom = loadPage('tunebooks.html');
    const win = dom.window; win.confirm = () => true;
    await wait(700);
    const doc = win.document;

    const importedContent = '\nconst EZ_MINUTES_TUNEBOOK_LIBRARY_VERSION = "1";\nconst EZ_MINUTES_TUNEBOOK_LIBRARY = {\n  "schemaVersion": "1",\n  "migrationIssues": [],\n  "works": {},\n  "editions": {},\n  "futureMetadata": {"x": 1}\n};\n';
    doc.getElementById('tab-library').click();
    await wait(200);
    const file = new win.File([importedContent], 'tunebook-library.js', { type: 'text/javascript' });
    const input = doc.getElementById('libraryFileInput');
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new win.Event('change'));
    await wait(300);
    assert.match(doc.getElementById('libraryStatus').textContent, /Loaded/);

    let capturedText = null;
    win.URL.createObjectURL = function () { return 'blob:test'; };
    win.URL.revokeObjectURL = function () {};
    win.HTMLAnchorElement.prototype.click = function () {};
    win.Blob = function (parts) { capturedText = parts[0]; return {}; };
    doc.getElementById('exportLibraryBtn').click();
    await wait(200);
    assert.ok(capturedText.includes('futureMetadata'), 'An unknown top-level field must survive a zero-edit export, not be silently dropped');

    const file2 = new win.File([capturedText], 'tunebook-library.js', { type: 'text/javascript' });
    Object.defineProperty(input, 'files', { value: [file2], configurable: true });
    input.dispatchEvent(new win.Event('change'));
    await wait(300);
    assert.match(doc.getElementById('libraryStatus').textContent, /Loaded/, 'The re-exported file must itself still be valid, importable data');
  });

  test('the real, complete bundled Library deep-equals itself after a zero-edit import/export round trip', async () => {
    const dom = loadPage('tunebooks.html');
    const win = dom.window; win.confirm = () => true;
    await wait(700);
    const doc = win.document;

    const realLibraryText = fs.readFileSync(suitePath('tunebook-library.js'), 'utf8');
    const originalParsed = new Function(realLibraryText + '\nreturn EZ_MINUTES_TUNEBOOK_LIBRARY;')();

    doc.getElementById('tab-library').click();
    await wait(200);
    const file = new win.File([realLibraryText], 'tunebook-library.js', { type: 'text/javascript' });
    const input = doc.getElementById('libraryFileInput');
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new win.Event('change'));
    await wait(300);

    let capturedText = null;
    win.URL.createObjectURL = function () { return 'blob:test'; };
    win.URL.revokeObjectURL = function () {};
    win.HTMLAnchorElement.prototype.click = function () {};
    win.Blob = function (parts) { capturedText = parts[0]; return {}; };
    doc.getElementById('exportLibraryBtn').click();
    await wait(200);

    const roundTripped = new Function(capturedText + '\nreturn EZ_MINUTES_TUNEBOOK_LIBRARY;')();
    assert.deepStrictEqual(roundTripped, originalParsed, 'The complete Library object - not just Works/Editions - must be semantically identical after a zero-edit round trip');
  });

  test('a newer, unsupported Library schema version is blocked from import entirely', async () => {
    const dom = loadPage('tunebooks.html');
    const win = dom.window; win.confirm = () => true;
    await wait(700);
    const doc = win.document;

    const newerSchemaContent = '\nconst EZ_MINUTES_TUNEBOOK_LIBRARY_VERSION = "2";\nconst EZ_MINUTES_TUNEBOOK_LIBRARY = {\n  "schemaVersion": "2",\n  "migrationIssues": [],\n  "works": {},\n  "editions": {}\n};\n';
    doc.getElementById('tab-library').click();
    await wait(200);
    const file = new win.File([newerSchemaContent], 'tunebook-library.js', { type: 'text/javascript' });
    const input = doc.getElementById('libraryFileInput');
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new win.Event('change'));
    await wait(300);

    assert.match(doc.getElementById('libraryStatus').textContent, /schema 2.*schema 1/,
      'A newer schema must be blocked with a clear, specific message naming both versions');
    doc.getElementById('tab-library').click();
    await wait(100);
    const browseText = doc.getElementById('libraryBrowse').textContent;
    assert.ok(browseText.length > 0 && !browseText.includes('No records'),
      'The real, existing Library data must genuinely be untouched - the rejected import must never have replaced it, not even with an empty works/editions object');
  });
});
