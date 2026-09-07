// V79-03 (v79 ground-up review): the Library sync-state tracking needs a genuine on-disk
// file replacement to test properly - a single dirty bit compared against one "fingerprint
// at last save" cannot tell "downloaded but not installed" apart from "correctly installed"
// apart from "a real, separate upstream change" without actually replacing the real file
// and reloading against it, the same way a real user's browser would. This uses the same
// disposable temp-directory pattern established in tunebooks-core.test.js - real files
// copied into a scratch directory, genuinely overwritten between loads - rather than string
// substitution tricks that can't be trusted to represent what a real replace does.
'use strict';

const { test, describe, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const { suitePath, wait, suiteAppPath } = require('./helpers');

const TMP_DIR = path.join(__dirname, '.tmp-library-sync');
const openWindows = [];

function makeStore() {
  const store = {};
  return {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
  };
}

async function loadFromTmpDir(storage) {
  const html = fs.readFileSync(path.join(TMP_DIR, 'tunebooks.html'), 'utf8');
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    resources: 'usable',
    pretendToBeVisual: true,
    url: 'file://' + TMP_DIR + '/',
  });
  const win = dom.window;
  win.confirm = () => true;
  Object.defineProperty(win, 'localStorage', { value: storage, configurable: true });
  await wait(700);
  openWindows.push(win);
  return { dom, win, doc: win.document };
}

describe('Library sync-state correctly distinguishes not-installed, installed, and true divergence (v79 ground-up review V79-03)', () => {
  beforeEach(() => {
    fs.mkdirSync(TMP_DIR, { recursive: true });
    fs.copyFileSync(suiteAppPath('tunebooks.html'), path.join(TMP_DIR, 'tunebooks.html'));
    fs.copyFileSync(suitePath('tunebook-library.js'), path.join(TMP_DIR, 'tunebook-library.js'));
    fs.copyFileSync(suitePath('shared-utils.js'), path.join(TMP_DIR, 'shared-utils.js'));
  });

  after(() => {
    openWindows.forEach((w) => { try { w.close(); } catch (e) { /* already closed */ } });
    fs.rmSync(TMP_DIR, { recursive: true, force: true });
  });

  test('a zero-edit export still produces the same fingerprint as the original bundled file, despite reordering keys alphabetically', async () => {
    // This is the actual root cause this fix addresses: buildLibraryExportText() writes
    // Works/Editions in sorted order, which differs from the original file's own order,
    // even with no real data change - a naive, order-sensitive fingerprint would treat
    // that alone as "content changed."
    const store = makeStore();
    const { win, doc } = await loadFromTmpDir(store);

    let capturedText = null;
    win.URL.createObjectURL = function () { return 'blob:test'; };
    win.URL.revokeObjectURL = function () {};
    win.HTMLAnchorElement.prototype.click = function () {};
    win.Blob = function (parts) { capturedText = parts[0]; return {}; };
    doc.getElementById('exportLibraryBtn').click();
    await wait(100);

    assert.ok(capturedText, 'Export should produce real text even with zero edits');
    fs.writeFileSync(path.join(TMP_DIR, 'tunebook-library.js'), capturedText);

    const { doc: doc2 } = await loadFromTmpDir(store);
    assert.ok(!doc2.getElementById('libraryDirtyBanner'),
      'A zero-edit export, genuinely reinstalled, must be recognized as synced - not flagged as changed purely due to key reordering');
  });

  test('Scenario A: edit, export, do NOT replace the file, reload - banner correctly stays as local-not-installed, not cleared by the export click alone', async () => {
    const store = makeStore();
    const { win, doc } = await loadFromTmpDir(store);

    doc.getElementById('newTunebookToggleBtn').click();
    await wait(100);
    doc.getElementById('nt_workCode').value = 'SYNCTESTA';
    doc.getElementById('nt_titleProper').value = 'Sync Test A';
    doc.getElementById('newTunebookBtn').click();
    await wait(200);
    assert.ok(doc.getElementById('libraryDirtyBanner'), 'A real edit should show the banner');

    win.URL.createObjectURL = function () { return 'blob:test'; };
    win.URL.revokeObjectURL = function () {};
    win.HTMLAnchorElement.prototype.click = function () {};
    win.Blob = function (parts) { return {}; };
    doc.getElementById('exportLibraryBtn').click();
    await wait(100);
    assert.ok(doc.getElementById('libraryDirtyBanner'),
      'Downloading is not proof of installation - the banner must not clear just because Export was clicked');
    assert.match(doc.getElementById('exportLibraryStatus').textContent, /can't confirm that actually happened/);

    // Deliberately do NOT replace the file - reload against the unchanged original.
    const { doc: doc2 } = await loadFromTmpDir(store);
    assert.ok(doc2.getElementById('libraryDirtyBanner'), 'The banner must still show local-not-installed after a reload without replacing the file');
    assert.match(doc2.getElementById('libraryDirtyBanner').textContent, /unsaved changes/);
  });

  test('Scenario B: edit, export, genuinely replace the file on disk, reload - banner correctly clears, no false divergence warning', async () => {
    const store = makeStore();
    const { win, doc } = await loadFromTmpDir(store);

    doc.getElementById('newTunebookToggleBtn').click();
    await wait(100);
    doc.getElementById('nt_workCode').value = 'SYNCTESTB';
    doc.getElementById('nt_titleProper').value = 'Sync Test B';
    doc.getElementById('newTunebookBtn').click();
    await wait(200);

    let capturedText = null;
    win.URL.createObjectURL = function () { return 'blob:test'; };
    win.URL.revokeObjectURL = function () {};
    win.HTMLAnchorElement.prototype.click = function () {};
    win.Blob = function (parts) { capturedText = parts[0]; return {}; };
    doc.getElementById('exportLibraryBtn').click();
    await wait(100);

    // Genuinely replace the real file, exactly like a real user's "replace the file next
    // to minutes.html and tunebooks.html" instruction.
    fs.writeFileSync(path.join(TMP_DIR, 'tunebook-library.js'), capturedText);

    const { doc: doc2 } = await loadFromTmpDir(store);
    assert.ok(!doc2.getElementById('libraryDirtyBanner'),
      'A genuinely, correctly installed export must be recognized as synced - the review\u2019s own "false upstream-divergence warning" failure mode');
  });

  test('Scenario C: a genuinely different upstream file (true divergence) is correctly distinguished from the user\u2019s own installed export', async () => {
    const store = makeStore();
    const { win, doc } = await loadFromTmpDir(store);

    doc.getElementById('newTunebookToggleBtn').click();
    await wait(100);
    doc.getElementById('nt_workCode').value = 'SYNCTESTC';
    doc.getElementById('nt_titleProper').value = 'Sync Test C';
    doc.getElementById('newTunebookBtn').click();
    await wait(200);
    win.close();

    // A real, separate upstream change - not the user's own edit, not the original baseline.
    const differentLib = fs.readFileSync(path.join(TMP_DIR, 'tunebook-library.js'), 'utf8')
      .replace('"e_SoH1854"', '"e_SoH1854_GENUINELY_DIFFERENT_UPSTREAM"');
    fs.writeFileSync(path.join(TMP_DIR, 'tunebook-library.js'), differentLib);

    const { doc: doc2 } = await loadFromTmpDir(store);
    assert.ok(doc2.getElementById('libraryDirtyBanner'), 'A genuine upstream divergence should show a banner');
    assert.match(doc2.getElementById('libraryDirtyBanner').textContent, /older tunebook-library\.js/,
      'This must be the true-divergence message (an older/different bundled file), not the local-not-installed message');
    assert.ok(doc2.getElementById('resetLibraryWorkingCopyBtn'), 'True divergence must offer the reset action');
  });

  test('resetting the working copy from the bundled file also resets the baseline, so a subsequent edit is correctly tracked from the new starting point', async () => {
    const store = makeStore();
    const { win, doc } = await loadFromTmpDir(store);

    doc.getElementById('newTunebookToggleBtn').click();
    await wait(100);
    doc.getElementById('nt_workCode').value = 'SYNCTESTRESET';
    doc.getElementById('nt_titleProper').value = 'Sync Test Reset';
    doc.getElementById('newTunebookBtn').click();
    await wait(200);
    win.close();

    const differentLib = fs.readFileSync(path.join(TMP_DIR, 'tunebook-library.js'), 'utf8')
      .replace('"e_SoH1854"', '"e_SoH1854_GENUINELY_DIFFERENT_UPSTREAM"');
    fs.writeFileSync(path.join(TMP_DIR, 'tunebook-library.js'), differentLib);

    const { doc: doc2 } = await loadFromTmpDir(store);
    assert.ok(doc2.getElementById('libraryDirtyBanner'), 'Sanity check: true divergence before reset');
    doc2.getElementById('resetLibraryWorkingCopyBtn').click();
    await wait(100);
    assert.ok(!doc2.getElementById('libraryDirtyBanner'), 'A reset must clear the banner immediately');
    assert.ok(!doc2.getElementById('libraryBrowse').textContent.includes('SYNCTESTRESET'),
      'The reset must genuinely discard the prior local edit, not just hide the banner');
  });

  test('v81 review finding 1: a SECOND real edit after a successful full sync cycle is correctly classified as local-not-installed, not a false true-divergence', async () => {
    const store = makeStore();

    // Cycle 1: edit, export, genuinely replace the file, reload - this should end synced.
    let { win, doc } = await loadFromTmpDir(store);
    doc.getElementById('newTunebookToggleBtn').click();
    await wait(100);
    doc.getElementById('nt_workCode').value = 'CYCLE1';
    doc.getElementById('nt_titleProper').value = 'Cycle One Test';
    doc.getElementById('newTunebookBtn').click();
    await wait(200);

    let capturedText = null;
    win.URL.createObjectURL = function () { return 'blob:test'; };
    win.URL.revokeObjectURL = function () {};
    win.HTMLAnchorElement.prototype.click = function () {};
    win.Blob = function (parts) { capturedText = parts[0]; return {}; };
    doc.getElementById('exportLibraryBtn').click();
    await wait(100);
    win.close();

    fs.writeFileSync(path.join(TMP_DIR, 'tunebook-library.js'), capturedText);

    ({ win, doc } = await loadFromTmpDir(store));
    assert.ok(!doc.getElementById('libraryDirtyBanner'), 'Sanity check: cycle 1 should end genuinely synced');

    // Cycle 2: a real, SECOND edit - deliberately NOT exported or replaced this time.
    // Before this fix, the stored baseline never advanced past cycle 1's own starting
    // point, so this second edit would be classified against a stale baseline that no
    // longer matched what's actually on disk - producing a false true-divergence warning
    // (with its own "discard your edits and reset" action) for an entirely ordinary edit.
    doc.getElementById('newTunebookToggleBtn').click();
    await wait(100);
    doc.getElementById('nt_workCode').value = 'CYCLE2';
    doc.getElementById('nt_titleProper').value = 'Cycle Two Test';
    doc.getElementById('newTunebookBtn').click();
    await wait(200);
    win.close();

    const { doc: doc2 } = await loadFromTmpDir(store);
    const banner = doc2.getElementById('libraryDirtyBanner');
    assert.ok(banner, 'The second edit should show a banner');
    assert.match(banner.textContent, /unsaved changes/,
      'This must be the correct local-not-installed message, not the true-divergence one');
    assert.ok(!doc2.getElementById('resetLibraryWorkingCopyBtn'),
      'A correct local-not-installed state must not offer the destructive reset action, which would discard the real, unexported edit');
  });

  test('v81 review finding 11 (updated for v89 finding 5): a schema version change is detected as a real difference, and - since it comes with no local edits - is now correctly auto-adopted rather than shown as a conflict', async () => {
    const store = makeStore();

    // A real edit is required first, so a real working copy actually gets persisted to
    // compare against - with zero edits, exportLibraryBtn never calls
    // saveLibraryWorkingCopy() at all, so there would be nothing on record for the
    // bundled file's schema version to be compared against on the next load.
    let { win, doc } = await loadFromTmpDir(store);
    doc.getElementById('newTunebookToggleBtn').click();
    await wait(100);
    doc.getElementById('nt_workCode').value = 'SCHEMATEST';
    doc.getElementById('nt_titleProper').value = 'Schema Version Test';
    doc.getElementById('newTunebookBtn').click();
    await wait(200);

    let capturedText = null;
    win.URL.createObjectURL = function () { return 'blob:test'; };
    win.URL.revokeObjectURL = function () {};
    win.HTMLAnchorElement.prototype.click = function () {};
    win.Blob = function (parts) { capturedText = parts[0]; return {}; };
    doc.getElementById('exportLibraryBtn').click();
    await wait(100);
    win.close();

    // Sanity check: a real edit, genuinely installed, must still end synced, unaffected
    // by this fix - confirms schemaVersion inclusion isn't itself a source of false
    // divergence, the exact failure mode two earlier fixes (V79-03, V81-01) both had to
    // correct in this same fingerprint function.
    fs.writeFileSync(path.join(TMP_DIR, 'tunebook-library.js'), capturedText);
    ({ doc } = await loadFromTmpDir(store));
    assert.ok(!doc.getElementById('libraryDirtyBanner'), 'A real edit, genuinely installed, must still end synced');

    // Now simulate a real schema bump with no other content change and no local edits -
    // the scenario this finding was actually about. Before the original v81 fix, the
    // fingerprint would have been identical (works/editions unchanged) even though the
    // schema itself moved - genuinely invisible. That part of the fix still matters and
    // is still verified below. What changed is what happens once it's detected: this is
    // exactly what v89's own finding 5 calls "upstream-only" (working still matches
    // baseline; only bundled moved) - real, no-local-edit suite upgrades should adopt
    // automatically rather than surface as a conflict needing a decision, so the correct
    // outcome now is no banner at all, with the new schema version actually in effect.
    const bumped = capturedText.replace(
      'const EZ_MINUTES_TUNEBOOK_LIBRARY_VERSION = "1";',
      'const EZ_MINUTES_TUNEBOOK_LIBRARY_VERSION = "2";'
    );
    assert.notEqual(bumped, capturedText, 'Sanity check: the version-bump replacement must have actually found and changed the real constant');
    fs.writeFileSync(path.join(TMP_DIR, 'tunebook-library.js'), bumped);

    const { doc: doc2, win: win2 } = await loadFromTmpDir(store);
    assert.ok(!doc2.getElementById('libraryDirtyBanner'),
      'A schema-only change with no local edits is an upstream-only update, and must be auto-adopted rather than shown as a conflict');
    const newVersion = win2.eval('typeof EZ_MINUTES_TUNEBOOK_LIBRARY_VERSION !== "undefined" ? EZ_MINUTES_TUNEBOOK_LIBRARY_VERSION : null');
    assert.equal(newVersion, '2',
      'The bumped schema version must genuinely be detected and adopted, not silently invisible - the real point of the original v81 fix, still true here even though the outcome (auto-adopt vs. banner) has changed');
  });
});

describe('An upstream-only Library update (no local edits) is auto-adopted, not treated as a conflict (v89 release-readiness review, finding 5)', () => {
  beforeEach(() => {
    fs.mkdirSync(TMP_DIR, { recursive: true });
    fs.copyFileSync(suiteAppPath('tunebooks.html'), path.join(TMP_DIR, 'tunebooks.html'));
    fs.copyFileSync(suitePath('tunebook-library.js'), path.join(TMP_DIR, 'tunebook-library.js'));
    fs.copyFileSync(suitePath('shared-utils.js'), path.join(TMP_DIR, 'shared-utils.js'));
  });

  after(() => {
    openWindows.forEach((w) => { try { w.close(); } catch (e) { /* already closed */ } });
    fs.rmSync(TMP_DIR, { recursive: true, force: true });
  });

  test('working copy exactly matching baseline, with only the bundled file having changed, adopts the new bundled data with no banner', async () => {
    const store = makeStore();

    // Establish a real, known baseline fingerprint for B0 the same way the app itself
    // would - a genuine edit-and-save, whose recorded baseline reflects B0 exactly, since
    // baseline only ever moves on an explicit reset or a confirmed-synced reload.
    let { win, doc } = await loadFromTmpDir(store);
    let capturedB0Text = null;
    win.URL.createObjectURL = function () { return 'blob:test'; };
    win.URL.revokeObjectURL = function () {};
    win.HTMLAnchorElement.prototype.click = function () {};
    win.Blob = function (parts) { capturedB0Text = parts[0]; return {}; };
    doc.getElementById('exportLibraryBtn').click();
    await wait(100);
    win.close();
    const b0Data = new Function(capturedB0Text + '\nreturn EZ_MINUTES_TUNEBOOK_LIBRARY;')();

    const store2 = makeStore();
    ({ win, doc } = await loadFromTmpDir(store2));
    doc.getElementById('newTunebookToggleBtn').click();
    await wait(100);
    doc.getElementById('nt_workCode').value = 'F5TEMP';
    doc.getElementById('nt_titleProper').value = 'Finding 5 Temp';
    doc.getElementById('newTunebookBtn').click();
    await wait(200);
    const b0Fingerprint = JSON.parse(store2.getItem('ezTunebooksLibraryWorkingCopy')).baselineFingerprint;
    win.close();

    // Now build the real scenario: a working copy that exactly matches baseline (zero
    // local edits), while the bundled file on disk is about to change out from under it -
    // a normal suite upgrade, not a conflict.
    const store3 = makeStore();
    store3.setItem('ezTunebooksLibraryWorkingCopy', JSON.stringify({
      data: b0Data, baselineFingerprint: b0Fingerprint, workingFingerprint: b0Fingerprint
    }));

    const originalLibText = fs.readFileSync(path.join(TMP_DIR, 'tunebook-library.js'), 'utf8');
    fs.writeFileSync(path.join(TMP_DIR, 'tunebook-library.js'), originalLibText.replace(
      'const EZ_MINUTES_TUNEBOOK_LIBRARY_VERSION = "1";',
      'const EZ_MINUTES_TUNEBOOK_LIBRARY_VERSION = "2";'
    ));

    ({ doc } = await loadFromTmpDir(store3));
    assert.ok(!doc.getElementById('libraryDirtyBanner'),
      'An upstream-only change (no local edits) must be adopted automatically, not shown as a conflict needing a decision');

    // A second reload must stay synced - confirms the adoption genuinely persisted
    // (baseline advanced to match), not just resolved once in memory for this one load.
    const { doc: doc2 } = await loadFromTmpDir(store3);
    assert.ok(!doc2.getElementById('libraryDirtyBanner'),
      'The adoption must persist - a second reload with nothing further changed must still show no banner');
  });
});

describe('Shared projections carry workTitleProper and publicationYear, needed for the Registry to sort same-Work Editions by year (Kevin\u2019s own correction to Full-Title-only sorting)', () => {
  const EZMinutesShared = require(suitePath('shared-utils.js'));

  test('buildTunebookIndexFromLibrary() (Level 2/3 projection) includes workTitleProper, distinct from the Edition\u2019s own fullTitle', () => {
    const library = {
      works: { w_TST: { workId: 'w_TST', workCode: 'TST', titleProper: 'Test Work' } },
      editions: {
        e_TST2000: {
          editionId: 'e_TST2000', workId: 'w_TST', editionCode: 'TST2000',
          titleProper: 'Test Work', subtitle: 'Second Edition', publicationYear: '2000',
          indexStatus: 'complete', songs: { '1': { title: 'A Song' } },
        },
      },
    };
    const { books } = EZMinutesShared.buildTunebookIndexFromLibrary(library);
    const rec = books['TST2000'];
    assert.equal(rec.workTitleProper, 'Test Work');
    assert.equal(rec.fullTitle, 'Test Work: Second Edition');
    assert.equal(rec.publicationYear, '2000');
  });

  test('buildMasterListFromLibrary() (Level 1 projection) includes both workTitleProper and publicationYear, neither present before this fix', () => {
    const library = {
      works: { w_TST: { workId: 'w_TST', workCode: 'TST', titleProper: 'Test Work' } },
      editions: {
        e_TST1980: {
          editionId: 'e_TST1980', workId: 'w_TST', editionCode: 'TST1980',
          titleProper: 'Test Work', subtitle: 'First Edition', publicationYear: '1980',
          indexStatus: 'none',
        },
        e_TST1990: {
          editionId: 'e_TST1990', workId: 'w_TST', editionCode: 'TST1990',
          titleProper: 'Test Work', subtitle: 'Second Edition', publicationYear: '1990',
          indexStatus: 'none',
        },
      },
    };
    const { books } = EZMinutesShared.buildMasterListFromLibrary(library);
    assert.equal(books['TST1980'].workTitleProper, 'Test Work');
    assert.equal(books['TST1980'].publicationYear, '1980');
    assert.equal(books['TST1990'].workTitleProper, 'Test Work');
    assert.equal(books['TST1990'].publicationYear, '1990');
    // The whole point: both share the same workTitleProper (so a sort can group them),
    // while their own publicationYear differs (so a sort can order them within that group) -
    // information a title-only sort could never have used, since both fullTitle values
    // differ only in an ordinal word with no inherent chronological meaning.
    assert.equal(books['TST1980'].workTitleProper, books['TST1990'].workTitleProper);
    assert.notEqual(books['TST1980'].publicationYear, books['TST1990'].publicationYear);
  });

  test('a bare Work with no Edition at all still gets workTitleProper, with no publicationYear to offer', () => {
    const library = {
      works: { w_BAR: { workId: 'w_BAR', workCode: 'BAR', titleProper: 'Bare Work Only' } },
      editions: {},
    };
    const { books } = EZMinutesShared.buildMasterListFromLibrary(library);
    assert.equal(books['BAR'].workTitleProper, 'Bare Work Only');
    assert.equal(books['BAR'].publicationYear, undefined);
  });
});
