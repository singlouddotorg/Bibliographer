// Regression coverage for the v109 release-readiness review, which found Bulk Edit's
// architecture unsafe in three independent ways (findings 1-3, all Blocker), plus a
// broken Level 3 file path (finding 4) and an approximate rather than exact schema-
// version gate (finding 5). All three Bulk Edit fixes share one real root cause worth
// naming here: the tab used to treat whatever was currently rendered in the DOM as its
// own data model, so anything that re-rendered the table (typing in the filter) could
// silently discard unsaved input, and Save read straight from the DOM without validating
// a real candidate first. The fix is a genuine draft model (bulkDraft, keyed by row,
// written to directly by every input event and never reset by a re-render) plus a real
// validate-then-commit step (bulkValidateRow) mirroring the ownership rules and
// invariants the ordinary Edit Work/Edition editor already enforces.
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

describe('v109 review, finding 1 (BLOCKER): Bulk Edit filtering must never discard an unsaved edit', () => {
  test('editing a row, then typing in the filter, preserves the edit - both while filtered and after clearing the filter', async () => {
    const dom = loadPage('tunebooks.html');
    const win = dom.window; win.confirm = () => true;
    await wait(700);
    const doc = win.document;

    doc.getElementById('tab-bulk').click();
    await wait(300);
    const rows = [...doc.querySelectorAll('#bulkTableBody tr')];
    const shdRow = rows.find((r) => r.dataset.workid === 'w_SHD' && r.querySelector('[data-field="editionIdentifierYear"]').value === '1936');
    const compilerInput = shdRow.querySelector('[data-field="compiler"]');
    compilerInput.value = 'Unsaved Bulk Test';
    compilerInput.dispatchEvent(new win.Event('input', { bubbles: true }));
    await wait(50);
    assert.match(doc.getElementById('bulkPendingCount').textContent, /1 unsaved change/);

    const filterInput = doc.getElementById('bulkFilterInput');
    filterInput.value = 'SHD';
    filterInput.dispatchEvent(new win.Event('input', { bubbles: true }));
    await wait(100);
    assert.match(doc.getElementById('bulkPendingCount').textContent, /1 unsaved change/, 'The pending count must survive a filter change');
    const filteredRow = [...doc.querySelectorAll('#bulkTableBody tr')].find((r) => r.dataset.workid === 'w_SHD' && r.querySelector('[data-field="editionIdentifierYear"]').value === '1936');
    assert.equal(filteredRow.querySelector('[data-field="compiler"]').value, 'Unsaved Bulk Test');

    filterInput.value = '';
    filterInput.dispatchEvent(new win.Event('input', { bubbles: true }));
    await wait(100);
    const clearedRow = [...doc.querySelectorAll('#bulkTableBody tr')].find((r) => r.dataset.workid === 'w_SHD' && r.querySelector('[data-field="editionIdentifierYear"]').value === '1936');
    assert.equal(clearedRow.querySelector('[data-field="compiler"]').value, 'Unsaved Bulk Test', 'The edit must still be there after the filter is cleared');
  });

  test('editing row A, filtering it out, editing row B, then clearing the filter and saving commits both', async () => {
    const dom = loadPage('tunebooks.html');
    const win = dom.window; win.confirm = () => true;
    stubLocalStorage(win);
    await wait(700);
    const doc = win.document;

    doc.getElementById('tab-bulk').click();
    await wait(300);
    let rows = [...doc.querySelectorAll('#bulkTableBody tr')];
    const rowA = rows.find((r) => r.dataset.workid === 'w_SHD' && r.querySelector('[data-field="editionIdentifierYear"]').value === '1936');
    rowA.querySelector('[data-field="compiler"]').value = 'Row A Edit';
    rowA.querySelector('[data-field="compiler"]').dispatchEvent(new win.Event('input', { bubbles: true }));
    await wait(50);

    const filterInput = doc.getElementById('bulkFilterInput');
    filterInput.value = 'ACH';
    filterInput.dispatchEvent(new win.Event('input', { bubbles: true }));
    await wait(100);
    const rowB = [...doc.querySelectorAll('#bulkTableBody tr')].find((r) => r.querySelector('td').textContent === 'ACH');
    rowB.querySelector('[data-field="publisher"]').value = 'Row B Edit';
    rowB.querySelector('[data-field="publisher"]').dispatchEvent(new win.Event('input', { bubbles: true }));
    await wait(50);

    filterInput.value = '';
    filterInput.dispatchEvent(new win.Event('input', { bubbles: true }));
    await wait(100);
    doc.getElementById('bulkSaveAllBtn').click();
    await wait(200);
    assert.match(doc.getElementById('bulkSaveStatus').textContent, /2 fields updated/);
  });
});

describe('v109 review, finding 2 (BLOCKER): a shared-field edit on an existing Edition row must write to that Edition, never to its parent Work', () => {
  test('editing SHW2007\u2019s SHMHA Code changes SHW2007 only - SHW1911, its sibling Edition, is untouched', async () => {
    const dom = loadPage('tunebooks.html');
    const win = dom.window; win.confirm = () => true;
    stubLocalStorage(win);
    await wait(700);
    const doc = win.document;

    doc.getElementById('tab-bulk').click();
    await wait(300);
    const rows = [...doc.querySelectorAll('#bulkTableBody tr')];
    const shw2007 = rows.find((r) => r.dataset.workid === 'w_SHW' && r.querySelector('[data-field="editionIdentifierYear"]').value === '2007');
    assert.equal(shw2007.querySelector('[data-field="shmhaCode"]').value, 'WB', 'Confirms the real, known starting state before editing');
    const shmhaInput = shw2007.querySelector('[data-field="shmhaCode"]');
    shmhaInput.value = 'ZZ';
    shmhaInput.dispatchEvent(new win.Event('input', { bubbles: true }));
    await wait(50);
    doc.getElementById('bulkSaveAllBtn').click();
    await wait(200);
    assert.match(doc.getElementById('bulkSaveStatus').textContent, /1 field updated/);

    doc.getElementById('tab-bulk').click();
    await wait(200);
    const rowsAfter = [...doc.querySelectorAll('#bulkTableBody tr')];
    const shw1911After = rowsAfter.find((r) => r.dataset.workid === 'w_SHW' && r.querySelector('[data-field="editionIdentifierYear"]').value === '1911');
    const shw2007After = rowsAfter.find((r) => r.dataset.workid === 'w_SHW' && r.querySelector('[data-field="editionIdentifierYear"]').value === '2007');
    assert.equal(shw2007After.querySelector('[data-field="shmhaCode"]').value, 'ZZ', 'The edited Edition must show the new value');
    assert.equal(shw1911After.querySelector('[data-field="shmhaCode"]').value, '', 'The sibling Edition must be completely unaffected - it must not have inherited the change via the parent Work');
  });
});

describe('v109 review, finding 3 (BLOCKER): Bulk Save must validate a complete candidate before touching real data, and never commit half of a failing row', () => {
  test('a Work edit that would leave Title Proper blank is blocked, and full Library validation confirms nothing was persisted', async () => {
    const dom = loadPage('tunebooks.html');
    const win = dom.window; win.confirm = () => true;
    stubLocalStorage(win);
    await wait(700);
    const doc = win.document;

    doc.getElementById('tab-bulk').click();
    await wait(300);
    const ahRow = [...doc.querySelectorAll('#bulkTableBody tr')].find((r) => r.querySelector('td').textContent === 'AH');
    const titleInput = ahRow.querySelector('[data-field="titleProper"]');
    titleInput.value = '';
    titleInput.dispatchEvent(new win.Event('input', { bubbles: true }));
    await wait(50);
    doc.getElementById('bulkSaveAllBtn').click();
    await wait(200);
    assert.match(doc.getElementById('bulkSaveStatus').textContent, /Title Proper is required/);

    doc.getElementById('tab-library').click();
    await wait(200);
    doc.getElementById('validateLibraryBtn').click();
    await wait(200);
    assert.match(doc.getElementById('libraryValidationReport').textContent, /No issues found/, 'The blocked row must never have touched the real, canonical libraryData at all');
  });

  test('a bare-Work row with new bibliographic content but no year is blocked in full - the shared-field half is not partially committed', async () => {
    const dom = loadPage('tunebooks.html');
    const win = dom.window; win.confirm = () => true;
    stubLocalStorage(win);
    await wait(700);
    const doc = win.document;

    doc.getElementById('tab-bulk').click();
    await wait(300);
    const bareRows = [...doc.querySelectorAll('#bulkTableBody tr')].filter((r) => r.querySelector('.bulk-status-cell').textContent.trim() === 'Work only');
    const target = bareRows[5];
    const workCode = target.querySelector('td').textContent;

    target.querySelector('[data-field="shmhaCode"]').value = 'CLEANTEST';
    target.querySelector('[data-field="shmhaCode"]').dispatchEvent(new win.Event('input', { bubbles: true }));
    target.querySelector('[data-field="compiler"]').value = 'Real Compiler Name';
    target.querySelector('[data-field="compiler"]').dispatchEvent(new win.Event('input', { bubbles: true }));
    // Edition Identifier Year deliberately left blank
    await wait(50);
    doc.getElementById('bulkSaveAllBtn').click();
    await wait(200);
    assert.match(doc.getElementById('bulkSaveStatus').textContent, /Edition Identifier Year/);

    doc.getElementById('tab-bulk').click();
    await wait(200);
    const targetAfter = [...doc.querySelectorAll('#bulkTableBody tr')].find((r) => r.querySelector('td').textContent === workCode);
    assert.equal(targetAfter.querySelector('[data-field="shmhaCode"]').value, 'CLEANTEST', 'The typed value must still be sitting in the draft, unsaved - not silently committed to the Work while the Edition half failed');
    assert.equal(targetAfter.querySelector('.bulk-status-cell').textContent.trim(), 'needs a year');
  });
});

describe('v109 review, finding 4 (MAJOR): WiH1992\u2019s Level 3 file reference resolves to its real, shipped path', () => {
  test('tunebookFile points at tunebook-files/WiH1992.json, not the package root', () => {
    const lib = new Function(fs.readFileSync(suitePath('tunebook-library.js'), 'utf8') + '\nreturn EZ_MINUTES_TUNEBOOK_LIBRARY;')();
    const ed = Object.values(lib.editions).find((e) => e.editionCode === 'WiH1992');
    assert.equal(ed.tunebookFile, 'tunebook-files/WiH1992.json');
    assert.ok(fs.existsSync(suitePath('tunebook-files/WiH1992.json')), 'The referenced file must genuinely exist at that path');
  });
});

describe('v109 review, finding 5 (MAJOR): Library schema-version acceptance is exact membership, not approximate numeric ordering', () => {
  async function tryImportSchema(schemaFieldLine) {
    const dom = loadPage('tunebooks.html');
    const win = dom.window; win.confirm = () => true;
    await wait(700);
    const doc = win.document;
    const content = `
const EZ_MINUTES_TUNEBOOK_LIBRARY_VERSION = "1";
const EZ_MINUTES_TUNEBOOK_LIBRARY = {
  ${schemaFieldLine}
  "migrationIssues": [],
  "works": {},
  "editions": {}
};
`;
    doc.getElementById('tab-library').click();
    await wait(200);
    const file = new win.File([content], 'test.js', { type: 'text/javascript' });
    const input = doc.getElementById('libraryFileInput');
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new win.Event('change'));
    await wait(300);
    const status = doc.getElementById('libraryStatus').textContent;
    win.close();
    return status;
  }

  test('schema "1" is accepted', async () => {
    const status = await tryImportSchema('"schemaVersion": "1",');
    assert.match(status, /Loaded/);
  });

  test('a missing schemaVersion key is rejected', async () => {
    const status = await tryImportSchema('');
    assert.match(status, /isn.t one this build recognizes/);
  });

  test('schema "bogus" is rejected', async () => {
    const status = await tryImportSchema('"schemaVersion": "bogus",');
    assert.match(status, /isn.t one this build recognizes/);
  });

  test('schema "1.5" is rejected - not treated as a valid intermediate version', async () => {
    const status = await tryImportSchema('"schemaVersion": "1.5",');
    assert.match(status, /isn.t one this build recognizes/);
  });

  test('schema "2" is rejected in this schema-1 build', async () => {
    const status = await tryImportSchema('"schemaVersion": "2",');
    assert.match(status, /schema 2.*schema 1/);
  });

  test('a schemaVersion that is itself an object is rejected, not coerced', async () => {
    const status = await tryImportSchema('"schemaVersion": {},');
    assert.match(status, /isn.t one this build recognizes/);
  });

  test('full Library validation also flags an unrecognized schemaVersion already sitting in the working copy', async () => {
    // A real, valid working-copy fingerprint first - a fake one causes the app to detect
    // a mismatch and quietly fall back to the clean bundled Library instead of actually
    // using the seeded, corrupted working copy, which would make this test pass for the
    // wrong reason (never really exercising the validator against bad data at all).
    const domForFingerprint = loadPage('tunebooks.html');
    const winFp = domForFingerprint.window; winFp.confirm = () => true;
    const store = stubLocalStorage(winFp);
    await wait(700);
    const docFp = domForFingerprint.window.document;
    docFp.getElementById('newTunebookToggleBtn').click();
    await wait(100);
    docFp.getElementById('nt_workCode').value = 'V109FPTEMP';
    docFp.getElementById('nt_titleProper').value = 'Fingerprint Temp';
    docFp.getElementById('newTunebookBtn').click();
    await wait(200);
    const realFingerprint = JSON.parse(store['ezTunebooksLibraryWorkingCopy']).baselineFingerprint;
    winFp.close();

    const lib = new Function(fs.readFileSync(suitePath('tunebook-library.js'), 'utf8') + '\nreturn EZ_MINUTES_TUNEBOOK_LIBRARY;')();
    const corrupt = JSON.parse(JSON.stringify(lib));
    corrupt.schemaVersion = 'bogus';
    store['ezTunebooksLibraryWorkingCopy'] = JSON.stringify({ data: corrupt, baselineFingerprint: realFingerprint, workingFingerprint: realFingerprint });

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
    doc2.getElementById('validateLibraryBtn').click();
    await wait(200);
    assert.match(doc2.getElementById('libraryValidationReport').textContent, /schemaVersion.*isn.t one this build recognizes/);
    win2.close();
  });
});
