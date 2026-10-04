// Regression coverage for the v114 release-readiness review. The blocker (finding 1)
// was that the ordinary Edit Tunebook form - unlike Level 3 and Bulk Edit, both of
// which already had real dirty-session models - had none at all. Its inputs were
// DOM-only until Save; a record switch, Close, Import, Reset, or a real browser unload
// could all silently discard unsaved text with no warning. Confirmed live before
// fixing, exactly as the review reproduced it: typing into SHMHA Code, switching to a
// different Edition and back without saving, and the typed value was already gone with
// no prompt at all. The fix follows the same pattern already established for Level 3
// (a snapshot taken on open, a dirty comparison against it) and folds into the same
// shared leaveEditingSession() guard every other consumer already uses, so record
// switch/Close/Import/Reset all inherit the protection without being wired separately.
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

describe('v114 review, finding 1 (BLOCKER): the ordinary Edit Tunebook form must have real dirty-session protection', () => {
  test('record switch: Cancel keeps the edit and the original record active', async () => {
    const dom = loadPage('tunebooks.html');
    const win = dom.window; win.confirm = () => false;
    await wait(700);
    const doc = win.document;

    doc.getElementById('tab-library').click();
    await wait(300);
    const row = [...doc.querySelectorAll('.lib-edition-row')].find((r) => r.textContent.includes('SHW2007'));
    row.querySelector('.lib-edit-edition-btn').click();
    await wait(300);
    assert.equal(doc.getElementById('lef_shmhaCode').value, 'WB');
    doc.getElementById('lef_shmhaCode').value = 'UNSAVED-X';
    doc.getElementById('lef_shmhaCode').dispatchEvent(new win.Event('input', { bubbles: true }));

    const row1911 = [...doc.querySelectorAll('.lib-edition-row')].find((r) => r.textContent.includes('SHW1911'));
    row1911.querySelector('.lib-edit-edition-btn').click();
    await wait(200);
    assert.equal(doc.getElementById('libraryEditTitle').textContent, 'Edition: SHW2007', 'Cancel must keep the original record open');
    assert.equal(doc.getElementById('lef_shmhaCode').value, 'UNSAVED-X', 'Cancel must not have discarded the edit');
  });

  test('record switch: Discard proceeds to the new record, abandoning the unsaved edit', async () => {
    const dom = loadPage('tunebooks.html');
    const win = dom.window; win.confirm = () => true;
    await wait(700);
    const doc = win.document;

    doc.getElementById('tab-library').click();
    await wait(300);
    const row = [...doc.querySelectorAll('.lib-edition-row')].find((r) => r.textContent.includes('SHW2007'));
    row.querySelector('.lib-edit-edition-btn').click();
    await wait(300);
    doc.getElementById('lef_shmhaCode').value = 'UNSAVED-X';
    doc.getElementById('lef_shmhaCode').dispatchEvent(new win.Event('input', { bubbles: true }));

    const row1911 = [...doc.querySelectorAll('.lib-edition-row')].find((r) => r.textContent.includes('SHW1911'));
    row1911.querySelector('.lib-edit-edition-btn').click();
    await wait(200);
    assert.equal(doc.getElementById('libraryEditTitle').textContent, 'Edition: SHW1911', 'Discard must let the switch proceed');
  });

  test('Close prompts for a dirty form the same way', async () => {
    const dom = loadPage('tunebooks.html');
    const win = dom.window;
    let promptCount = 0;
    win.confirm = () => { promptCount++; return true; };
    await wait(700);
    const doc = win.document;

    doc.getElementById('tab-library').click();
    await wait(300);
    const row = [...doc.querySelectorAll('.lib-edition-row')].find((r) => r.textContent.includes('SHW2007'));
    row.querySelector('.lib-edit-edition-btn').click();
    await wait(300);
    doc.getElementById('lef_shmhaCode').value = 'UNSAVED-X';
    doc.getElementById('lef_shmhaCode').dispatchEvent(new win.Event('input', { bubbles: true }));
    doc.getElementById('libraryEditCloseBtn').click();
    await wait(100);
    assert.equal(promptCount, 1, 'Close on a dirty form must prompt before closing');
  });

  test('Library Import requires explicit resolution of a dirty generic form before it proceeds', async () => {
    const dom = loadPage('tunebooks.html');
    const win = dom.window;
    stubLocalStorage(win);
    await wait(700);
    const doc = win.document;

    doc.getElementById('tab-library').click();
    await wait(300);
    const row = [...doc.querySelectorAll('.lib-edition-row')].find((r) => r.textContent.includes('SHW2007'));
    row.querySelector('.lib-edit-edition-btn').click();
    await wait(300);
    doc.getElementById('lef_shmhaCode').value = 'UNSAVED-X';
    doc.getElementById('lef_shmhaCode').dispatchEvent(new win.Event('input', { bubbles: true }));

    const realLibText = fs.readFileSync(suitePath('tunebook-library.js'), 'utf8');
    win.confirm = () => false;
    const file1 = new win.File([realLibText], 'tunebook-library.js', { type: 'text/javascript' });
    const input1 = doc.getElementById('libraryFileInput');
    Object.defineProperty(input1, 'files', { value: [file1], configurable: true });
    input1.dispatchEvent(new win.Event('change'));
    await wait(300);
    assert.match(doc.getElementById('libraryStatus').textContent, /cancelled/);
    assert.equal(doc.getElementById('lef_shmhaCode').value, 'UNSAVED-X', 'A cancelled import must not have discarded the edit');

    win.confirm = () => true;
    const file2 = new win.File([realLibText], 'tunebook-library.js', { type: 'text/javascript' });
    const input2 = doc.getElementById('libraryFileInput');
    Object.defineProperty(input2, 'files', { value: [file2], configurable: true });
    input2.dispatchEvent(new win.Event('change'));
    await wait(300);
    assert.match(doc.getElementById('libraryStatus').textContent, /Loaded \d+ Work/);
    assert.equal(doc.getElementById('libraryEditPanel').style.display, 'none', 'Import must close the stale form once approved');
  });

  test('browser unload is now protected for the generic form', async () => {
    const dom = loadPage('tunebooks.html');
    const win = dom.window; win.confirm = () => true;
    await wait(700);
    const doc = win.document;

    doc.getElementById('tab-library').click();
    await wait(300);
    const row = [...doc.querySelectorAll('.lib-edition-row')].find((r) => r.textContent.includes('SHW2007'));
    row.querySelector('.lib-edit-edition-btn').click();
    await wait(300);
    doc.getElementById('lef_shmhaCode').value = 'UNSAVED-X';
    doc.getElementById('lef_shmhaCode').dispatchEvent(new win.Event('input', { bubbles: true }));

    const event = new win.Event('beforeunload', { cancelable: true });
    win.dispatchEvent(event);
    assert.equal(event.defaultPrevented, true);
  });

  test('a clean form (no edits) does not trigger the unload guard or a Close prompt', async () => {
    const dom = loadPage('tunebooks.html');
    const win = dom.window;
    let promptCount = 0;
    win.confirm = () => { promptCount++; return true; };
    await wait(700);
    const doc = win.document;

    doc.getElementById('tab-library').click();
    await wait(300);
    const row = [...doc.querySelectorAll('.lib-edition-row')].find((r) => r.textContent.includes('SHW2007'));
    row.querySelector('.lib-edit-edition-btn').click();
    await wait(300);

    const event = new win.Event('beforeunload', { cancelable: true });
    win.dispatchEvent(event);
    assert.equal(event.defaultPrevented, false, 'Merely opening the form with no edits must not count as dirty');

    doc.getElementById('libraryEditCloseBtn').click();
    await wait(100);
    assert.equal(promptCount, 0, 'Close on a clean form must not prompt at all');
  });

  test('a successful Save establishes a new clean baseline - no phantom dirty state afterward', async () => {
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
    doc.getElementById('lef_shmhaCode').value = 'REALLY-SAVED';
    doc.getElementById('lef_shmhaCode').dispatchEvent(new win.Event('input', { bubbles: true }));
    doc.getElementById('libraryEditSaveBtn').click();
    await wait(100);

    const event = new win.Event('beforeunload', { cancelable: true });
    win.dispatchEvent(event);
    assert.equal(event.defaultPrevented, false, 'A just-saved value must not still register as unsaved');
  });
});

describe('v114 review, finding 2 (MAJOR): a successful Library import must be persisted as the browser working copy and enter the real sync-state model', () => {
  test('an import that differs from the bundled Library is saved immediately, shows the dirty banner, and survives a reload', async () => {
    const dom = loadPage('tunebooks.html');
    const win = dom.window; win.confirm = () => true;
    const store = stubLocalStorage(win);
    await wait(700);
    const doc = win.document;

    const realLibText = fs.readFileSync(suitePath('tunebook-library.js'), 'utf8');
    const changedText = realLibText.replace(
      '"compiler": "B. F. White, J.L. White, and E. J. King"',
      '"compiler": "CHANGED IMPORT VALUE"'
    );

    doc.getElementById('tab-library').click();
    await wait(300);
    const file = new win.File([changedText], 'tunebook-library.js', { type: 'text/javascript' });
    const input = doc.getElementById('libraryFileInput');
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new win.Event('change'));
    await wait(300);
    assert.match(doc.getElementById('libraryStatus').textContent, /Saved as this browser.s working copy/);
    assert.ok(store['ezTunebooksLibraryWorkingCopy'], 'The import must actually be persisted to storage');
    assert.ok(doc.getElementById('libraryDirtyBanner'), 'A changed import must show the dirty banner');
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
    await wait(300);
    const row = [...doc2.querySelectorAll('.lib-edition-row')].find((r) => r.textContent.includes('SHW2007'));
    row.querySelector('.lib-edit-edition-btn').click();
    await wait(300);
    assert.equal(doc2.getElementById('lef_compiler').value, 'CHANGED IMPORT VALUE', 'The imported Library must survive a reload');
    assert.ok(doc2.getElementById('libraryDirtyBanner'), 'The dirty banner must still be present after reload');
    win2.close();
  });

  test('importing a Library identical to the bundled one stays synced, with no false dirty banner', async () => {
    const dom = loadPage('tunebooks.html');
    const win = dom.window; win.confirm = () => true;
    stubLocalStorage(win);
    await wait(700);
    const doc = win.document;

    const realLibText = fs.readFileSync(suitePath('tunebook-library.js'), 'utf8');
    doc.getElementById('tab-library').click();
    await wait(300);
    const file = new win.File([realLibText], 'tunebook-library.js', { type: 'text/javascript' });
    const input = doc.getElementById('libraryFileInput');
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new win.Event('change'));
    await wait(300);
    assert.ok(!doc.getElementById('libraryDirtyBanner'), 'An import identical to the bundled file must not show a false dirty banner');
  });
});

describe('v114 review, finding 4 (MODERATE): the New Tunebook draft is included in unsaved-work protection', () => {
  test('a non-blank New Tunebook draft triggers the unload guard', async () => {
    const dom = loadPage('tunebooks.html');
    const win = dom.window; win.confirm = () => true;
    await wait(700);
    const doc = win.document;

    doc.getElementById('tab-library').click();
    await wait(300);
    doc.getElementById('newTunebookToggleBtn').click();
    await wait(100);
    doc.getElementById('nt_workCode').value = 'DRAFTTEST';
    doc.getElementById('nt_workCode').dispatchEvent(new win.Event('input', { bubbles: true }));

    const event = new win.Event('beforeunload', { cancelable: true });
    win.dispatchEvent(event);
    assert.equal(event.defaultPrevented, true);
  });

  test('an Import with a dirty New Tunebook draft requires explicit resolution', async () => {
    const dom = loadPage('tunebooks.html');
    const win = dom.window;
    stubLocalStorage(win);
    await wait(700);
    const doc = win.document;

    doc.getElementById('tab-library').click();
    await wait(300);
    doc.getElementById('newTunebookToggleBtn').click();
    await wait(100);
    doc.getElementById('nt_workCode').value = 'DRAFTTEST';
    doc.getElementById('nt_workCode').dispatchEvent(new win.Event('input', { bubbles: true }));

    const realLibText = fs.readFileSync(suitePath('tunebook-library.js'), 'utf8');
    win.confirm = () => false;
    const file1 = new win.File([realLibText], 'tunebook-library.js', { type: 'text/javascript' });
    const input1 = doc.getElementById('libraryFileInput');
    Object.defineProperty(input1, 'files', { value: [file1], configurable: true });
    input1.dispatchEvent(new win.Event('change'));
    await wait(300);
    assert.match(doc.getElementById('libraryStatus').textContent, /cancelled/);
    assert.equal(doc.getElementById('nt_workCode').value, 'DRAFTTEST', 'A cancelled import must not discard the draft');

    win.confirm = () => true;
    const file2 = new win.File([realLibText], 'tunebook-library.js', { type: 'text/javascript' });
    const input2 = doc.getElementById('libraryFileInput');
    Object.defineProperty(input2, 'files', { value: [file2], configurable: true });
    input2.dispatchEvent(new win.Event('change'));
    await wait(300);
    assert.match(doc.getElementById('libraryStatus').textContent, /Loaded \d+ Work/);
    assert.equal(doc.getElementById('nt_workCode').value, '', 'An approved import must clear the discarded draft');
  });
});
