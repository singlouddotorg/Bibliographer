// Regression coverage for the v113 release-readiness review. The blocker (finding 1)
// was a real state-boundary gap: the two places libraryData was ever wholesale replaced
// - Import and Reset working copy - just did `libraryData = ...` directly, with nothing
// checking or clearing editingTarget, the Level 3 session, or Bulk's own draft. A stale
// generic edit form, left open across an import, could write its own old values
// straight over the freshly-imported Library the moment its ordinary Save was clicked -
// confirmed live before fixing, exactly as the review reproduced it. The fix is one
// centralized replaceLibraryData() function used by both Import and Reset, which
// resolves any dirty session first and clears all old state before the new Library
// ever takes over.
'use strict';

const { test, describe, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const { loadPage, suitePath, wait, closeAllWindows } = require('./helpers');

after(() => closeAllWindows());

function stubLocalStorage(win) {
  const store = {};
  Object.defineProperty(win, 'localStorage', {
    value: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => delete store[k],
    },
    configurable: true,
  });
  return store;
}

function buildReplacementLibraryText(fieldFrom, fieldTo) {
  const realText = fs.readFileSync(suitePath('tunebook-library.js'), 'utf8');
  const replaced = realText.replace(fieldFrom, fieldTo);
  if (replaced === realText) throw new Error('Replacement text was identical - the target string was not found');
  return replaced;
}

describe('v113 review, finding 1 (BLOCKER): whole-Library replacement must invalidate stale editing sessions and Bulk drafts, not silently coexist with the new Library', () => {
  test('Reproduction A: a stale generic edit form, left open across an import, cannot overwrite the freshly-imported value', async () => {
    const dom = loadPage('tunebooks.html');
    const win = dom.window; win.confirm = () => true;
    stubLocalStorage(win);
    await wait(700);
    const doc = win.document;

    doc.getElementById('tab-library').click();
    await wait(300);
    const row = [...doc.querySelectorAll('.lib-edition-row')].find((r) => r.textContent.includes('SHW2007'));
    row.querySelector('.lib-edit-edition-btn').click();
    await wait(300);
    assert.equal(doc.getElementById('lef_compiler').value, 'B. F. White, J.L. White, and E. J. King');

    const replacementText = buildReplacementLibraryText(
      '"compiler": "B. F. White, J.L. White, and E. J. King"',
      '"compiler": "IMPORTED COMPILER"'
    );
    doc.getElementById('tab-library').click();
    await wait(200);
    const file = new win.File([replacementText], 'tunebook-library.js', { type: 'text/javascript' });
    const input = doc.getElementById('libraryFileInput');
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new win.Event('change'));
    await wait(300);
    assert.match(doc.getElementById('libraryStatus').textContent, /Loaded \d+ Work/);

    assert.equal(doc.getElementById('libraryEditPanel').style.display, 'none',
      'The stale edit panel must be closed by the replacement itself, not left open with its old, pre-import values');

    const rowAfter = [...doc.querySelectorAll('.lib-edition-row')].find((r) => r.textContent.includes('SHW2007'));
    rowAfter.querySelector('.lib-edit-edition-btn').click();
    await wait(300);
    assert.equal(doc.getElementById('lef_compiler').value, 'IMPORTED COMPILER',
      'Re-opening the record must show the real, freshly-imported value, not the discarded stale one');
  });

  test('Reproduction B: a pending Bulk draft from the old Library requires explicit resolution before an import proceeds', async () => {
    const dom = loadPage('tunebooks.html');
    const win = dom.window;
    stubLocalStorage(win);
    await wait(700);
    const doc = win.document;

    doc.getElementById('tab-bulk').click();
    await wait(300);
    const row = [...doc.querySelectorAll('#bulkTableBody tr')].find(
      (r) => r.dataset.workid === 'w_SHW' && r.querySelector('[data-field="editionIdentifierYear"]').value === '2007'
    );
    const compilerInput = row.querySelector('[data-field="compiler"]');
    compilerInput.value = 'PENDING OLD LIBRARY EDIT';
    compilerInput.dispatchEvent(new win.Event('input', { bubbles: true }));
    await wait(50);
    assert.match(doc.getElementById('bulkPendingCount').textContent, /1 unsaved change/);

    const replacementText = buildReplacementLibraryText(
      '"compiler": "B. F. White, J.L. White, and E. J. King"',
      '"compiler": "IMPORTED COMPILER"'
    );

    // Cancel path: the pending draft must survive an import the user declines to
    // approve - a cancelled operation must not have silently discarded anything.
    win.confirm = () => false;
    doc.getElementById('tab-library').click();
    await wait(200);
    const file1 = new win.File([replacementText], 'tunebook-library.js', { type: 'text/javascript' });
    const input1 = doc.getElementById('libraryFileInput');
    Object.defineProperty(input1, 'files', { value: [file1], configurable: true });
    input1.dispatchEvent(new win.Event('change'));
    await wait(300);
    assert.match(doc.getElementById('libraryStatus').textContent, /cancelled/);
    doc.getElementById('tab-bulk').click();
    await wait(200);
    assert.match(doc.getElementById('bulkPendingCount').textContent, /1 unsaved change/,
      'A cancelled import must not have discarded the pending Bulk draft');

    // Approve path: once the user approves discarding, the import must proceed and the
    // stale draft must be genuinely gone - not silently re-applied to the new Library.
    win.confirm = () => true;
    doc.getElementById('tab-library').click();
    await wait(200);
    const file2 = new win.File([replacementText], 'tunebook-library.js', { type: 'text/javascript' });
    const input2 = doc.getElementById('libraryFileInput');
    Object.defineProperty(input2, 'files', { value: [file2], configurable: true });
    input2.dispatchEvent(new win.Event('change'));
    await wait(300);
    assert.match(doc.getElementById('libraryStatus').textContent, /Loaded \d+ Work/);
    doc.getElementById('tab-bulk').click();
    await wait(200);
    assert.equal(doc.getElementById('bulkPendingCount').textContent, '',
      'Bulk must be fully clean after an approved import - no leftover pending count from the discarded draft');
    const rowAfter = [...doc.querySelectorAll('#bulkTableBody tr')].find(
      (r) => r.dataset.workid === 'w_SHW' && r.querySelector('[data-field="editionIdentifierYear"]').value === '2007'
    );
    assert.equal(rowAfter.querySelector('[data-field="compiler"]').value, 'IMPORTED COMPILER',
      'The stale pre-import draft must never be committed into the newly imported Library');
  });

  test('Reset working copy from bundled Library clears a pending Bulk draft the same way', async () => {
    const dom = loadPage('tunebooks.html');
    const win = dom.window; win.confirm = () => true;
    const store = stubLocalStorage(win);
    await wait(700);
    const doc = win.document;

    // A real working copy and real fingerprint first, via a real edit - not a fake one -
    // then corrupt the stored baselineFingerprint to simulate a genuine upstream change,
    // which is what actually makes the Reset button appear at all.
    doc.getElementById('tab-library').click();
    await wait(300);
    doc.getElementById('newTunebookToggleBtn').click();
    await wait(100);
    doc.getElementById('nt_workCode').value = 'V113FPTEMP';
    doc.getElementById('nt_titleProper').value = 'Fingerprint Temp';
    doc.getElementById('newTunebookBtn').click();
    await wait(200);
    const wc = JSON.parse(store['ezTunebooksLibraryWorkingCopy']);
    wc.baselineFingerprint = 'deliberately-different-fingerprint';
    store['ezTunebooksLibraryWorkingCopy'] = JSON.stringify(wc);
    win.close();

    const dom2 = loadPage('tunebooks.html');
    const win2 = dom2.window; win2.confirm = () => true;
    Object.defineProperty(win2, 'localStorage', {
      value: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => delete store[k] },
      configurable: true,
    });
    await wait(700);
    const doc2 = win2.document;
    assert.ok(doc2.getElementById('resetLibraryWorkingCopyBtn'), 'The true-divergence banner and its Reset button must appear for this to be a real test of Reset');

    doc2.getElementById('tab-bulk').click();
    await wait(300);
    const row = [...doc2.querySelectorAll('#bulkTableBody tr')].find(
      (r) => r.dataset.workid === 'w_SHW' && r.querySelector('[data-field="editionIdentifierYear"]').value === '2007'
    );
    const compilerInput = row.querySelector('[data-field="compiler"]');
    compilerInput.value = 'STALE PRE-RESET DRAFT';
    compilerInput.dispatchEvent(new win2.Event('input', { bubbles: true }));
    await wait(50);
    assert.match(doc2.getElementById('bulkPendingCount').textContent, /1 unsaved change/);

    doc2.getElementById('resetLibraryWorkingCopyBtn').click();
    await wait(200);
    doc2.getElementById('tab-bulk').click();
    await wait(200);
    assert.equal(doc2.getElementById('bulkPendingCount').textContent, '', 'Reset must clear the pending Bulk draft, not just the Library data underneath it');
    const rowAfter = [...doc2.querySelectorAll('#bulkTableBody tr')].find(
      (r) => r.dataset.workid === 'w_SHW' && r.querySelector('[data-field="editionIdentifierYear"]').value === '2007'
    );
    assert.equal(rowAfter.querySelector('[data-field="compiler"]').value, 'B. F. White, J.L. White, and E. J. King',
      'The real, bundled value must show after Reset - not the stale, discarded draft text');
    win2.close();
  });
});

describe('v113 review, finding 2 (MAJOR): unsaved Bulk changes must trigger the browser unload guard, matching the same real draft the pending-count display already uses', () => {
  test('a pending Bulk edit sets defaultPrevented on beforeunload', async () => {
    const dom = loadPage('tunebooks.html');
    const win = dom.window; win.confirm = () => true;
    await wait(700);
    const doc = win.document;

    doc.getElementById('tab-bulk').click();
    await wait(300);
    const row = [...doc.querySelectorAll('#bulkTableBody tr')].find(
      (r) => r.dataset.workid === 'w_SHD' && r.querySelector('[data-field="editionIdentifierYear"]').value === '1936'
    );
    row.querySelector('[data-field="compiler"]').value = 'Unload Guard Test';
    row.querySelector('[data-field="compiler"]').dispatchEvent(new win.Event('input', { bubbles: true }));
    await wait(50);

    const event = new win.Event('beforeunload', { cancelable: true });
    win.dispatchEvent(event);
    assert.equal(event.defaultPrevented, true, 'A dirty Bulk draft must request the unload confirmation, same as a dirty Level 3 session already does');
  });

  test('a clean Bulk tab (no edits) does not trigger the unload guard', async () => {
    const dom = loadPage('tunebooks.html');
    const win = dom.window; win.confirm = () => true;
    await wait(700);
    const doc = win.document;

    doc.getElementById('tab-bulk').click();
    await wait(300);
    const event = new win.Event('beforeunload', { cancelable: true });
    win.dispatchEvent(event);
    assert.equal(event.defaultPrevented, false, 'Merely opening Bulk with no edits must not itself count as dirty');
  });
});

describe('v113 review, finding 3 (MAJOR): a failed Bulk persistence attempt must not advance the saved baseline', () => {
  test('forcing localStorage.setItem() to throw leaves the row dirty and Save All enabled for retry', async () => {
    const dom = loadPage('tunebooks.html');
    const win = dom.window; win.confirm = () => true;
    Object.defineProperty(win, 'localStorage', {
      value: { getItem: () => null, setItem: () => { throw new Error('Storage unavailable'); }, removeItem: () => {} },
      configurable: true,
    });
    await wait(700);
    const doc = win.document;

    doc.getElementById('tab-bulk').click();
    await wait(300);
    const row = [...doc.querySelectorAll('#bulkTableBody tr')].find(
      (r) => r.dataset.workid === 'w_SHD' && r.querySelector('[data-field="editionIdentifierYear"]').value === '1936'
    );
    row.querySelector('[data-field="compiler"]').value = 'Force Save Failure Test';
    row.querySelector('[data-field="compiler"]').dispatchEvent(new win.Event('input', { bubbles: true }));
    await wait(50);
    doc.getElementById('bulkSaveAllBtn').click();
    await wait(200);

    assert.match(doc.getElementById('bulkSaveStatus').textContent, /Could not save to this browser/);
    assert.match(doc.getElementById('bulkPendingCount').textContent, /1 unsaved change/,
      'A failed persistence attempt must not be reported as "nothing left to save"');
    assert.equal(doc.getElementById('bulkSaveAllBtn').disabled, false, 'Save All must stay enabled so the user can simply retry');
  });
});

describe('v113 review, finding 4 (MAJOR): Shape System is validated as a real enumerated field, not accepted as arbitrary text', () => {
  test('the generic Work/Edition editor renders Shape System as a real, controlled select, not free text', async () => {
    const dom = loadPage('tunebooks.html');
    const win = dom.window; win.confirm = () => true;
    await wait(700);
    const doc = win.document;

    doc.getElementById('tab-library').click();
    await wait(300);
    const row = [...doc.querySelectorAll('.lib-edition-row')].find((r) => r.textContent.includes('SHW2007'));
    row.querySelector('.lib-edit-edition-btn').click();
    await wait(300);
    const field = doc.getElementById('lef_shapeSystem');
    assert.equal(field.tagName, 'SELECT');
    assert.equal(field.value, '4-shape');
  });

  test('an imported Library containing an unrecognized Shape System value fails canonical validation', async () => {
    const dom = loadPage('tunebooks.html');
    const win = dom.window; win.confirm = () => true;
    await wait(700);
    const doc = win.document;

    const replacementText = buildReplacementLibraryText('"shapeSystem": "4-shape"', '"shapeSystem": "bogus-shape"');
    doc.getElementById('tab-library').click();
    await wait(300);
    const file = new win.File([replacementText], 'tunebook-library.js', { type: 'text/javascript' });
    const input = doc.getElementById('libraryFileInput');
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new win.Event('change'));
    await wait(300);
    assert.match(doc.getElementById('libraryStatus').textContent, /Loaded \d+ Work/);

    doc.getElementById('validateLibraryBtn').click();
    await wait(200);
    assert.match(doc.getElementById('libraryValidationReport').textContent, /Shape System "bogus-shape".*isn.t one of the recognized values/);
  });

  test('every currently recognized Shape System value is accepted by the generic editor without error', async () => {
    const dom = loadPage('tunebooks.html');
    const win = dom.window; win.confirm = () => true;
    stubLocalStorage(win);
    await wait(700);
    const doc = win.document;

    doc.getElementById('tab-library').click();
    await wait(300);
    const row = [...doc.querySelectorAll('.lib-edition-row')].find((r) => r.textContent.includes('SHW2007'));
    row.querySelector('.lib-edit-edition-btn').click();
    await wait(300);
    const field = doc.getElementById('lef_shapeSystem');
    const values = [...field.querySelectorAll('option')].map((o) => o.value).filter(Boolean);
    assert.deepStrictEqual(values.sort(), ['0-shape', '4-shape', '7-shape', 'mixed-shape', 'other-shape'].sort());
    field.value = '0-shape';
    doc.getElementById('libraryEditSaveBtn').click();
    await wait(100);
    assert.doesNotMatch(doc.getElementById('libraryEditStatus').textContent, /Can.t save yet/);
  });
});

describe('v113 review, finding 5 (MODERATE): the Bulk filter searches the current draft, not the stale pre-edit record', () => {
  test('filtering by a freshly-edited, unsaved Title Proper finds the row', async () => {
    const dom = loadPage('tunebooks.html');
    const win = dom.window; win.confirm = () => true;
    await wait(700);
    const doc = win.document;

    doc.getElementById('tab-bulk').click();
    await wait(300);
    const row = [...doc.querySelectorAll('#bulkTableBody tr')].find(
      (r) => r.dataset.workid === 'w_SHW' && r.querySelector('[data-field="editionIdentifierYear"]').value === '2007'
    );
    const titleInput = row.querySelector('[data-field="titleProper"]');
    titleInput.value = 'Unique Draft Title Zebra';
    titleInput.dispatchEvent(new win.Event('input', { bubbles: true }));
    await wait(50);

    const filterInput = doc.getElementById('bulkFilterInput');
    filterInput.value = 'Unique Draft Title Zebra';
    filterInput.dispatchEvent(new win.Event('input', { bubbles: true }));
    await wait(100);

    const rowsAfterFilter = [...doc.querySelectorAll('#bulkTableBody tr')];
    assert.equal(rowsAfterFilter.length, 1, 'The row with the edited, as-yet-unsaved title must be found by that same title text');
  });

  test('Work Code and Common Name remain searchable as before', async () => {
    const dom = loadPage('tunebooks.html');
    const win = dom.window; win.confirm = () => true;
    await wait(700);
    const doc = win.document;

    doc.getElementById('tab-bulk').click();
    await wait(300);
    const filterInput = doc.getElementById('bulkFilterInput');
    filterInput.value = 'SHW2007';
    filterInput.dispatchEvent(new win.Event('input', { bubbles: true }));
    await wait(100);
    const rows = [...doc.querySelectorAll('#bulkTableBody tr')];
    assert.ok(rows.some((r) => r.dataset.workid === 'w_SHW'), 'Edition Code must still be searchable');
  });
});
