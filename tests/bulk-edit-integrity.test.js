// Regression coverage for the v109 release-readiness review's three Bulk Edit BLOCKERs
// (findings 1-3) plus the related WiH1992 path fix (finding 4) and Library schema gate
// exact-membership fix (finding 5). All three Bulk Edit findings turned out to share one
// root cause - the tab treated rendered DOM inputs as its own data model, with no real
// draft, no correct field-ownership resolution, and no validation before mutating real
// libraryData - so they were fixed together as one real draft-model rewrite, and are
// tested together here for the same reason.
'use strict';

const { test, describe, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const { loadPage, suitePath, wait, closeAllWindows } = require('./helpers');

after(() => closeAllWindows());

async function openBulkEdit(doc) {
  doc.getElementById('tab-bulk').click();
  await wait(300);
}

function findBulkRow(doc, workId, year) {
  return [...doc.querySelectorAll('#bulkTableBody tr')].find(
    (tr) => tr.dataset.workid === workId && tr.querySelector('[data-field="editionIdentifierYear"]').value === year
  );
}

describe('Bulk Edit finding 1: the filter can never discard an unsaved edit (BLOCKER)', () => {
  test('editing a row, then typing in the filter box, keeps the edit and the pending count', async () => {
    const dom = loadPage('tunebooks.html');
    const win = dom.window; win.confirm = () => true;
    await wait(700);
    const doc = win.document;
    await openBulkEdit(doc);

    const shd1936 = findBulkRow(doc, 'w_SHD', '1936');
    const compilerInput = shd1936.querySelector('[data-field="compiler"]');
    compilerInput.value = 'Unsaved Bulk Test';
    compilerInput.dispatchEvent(new win.Event('input', { bubbles: true }));
    await wait(50);
    assert.match(doc.getElementById('bulkPendingCount').textContent, /1 unsaved change/);

    const filterInput = doc.getElementById('bulkFilterInput');
    filterInput.value = 'SHD';
    filterInput.dispatchEvent(new win.Event('input', { bubbles: true }));
    await wait(50);
    assert.match(doc.getElementById('bulkPendingCount').textContent, /1 unsaved change/,
      'The pending count must survive filtering to a value that still shows the edited row');

    filterInput.value = 'ZZZNOMATCH';
    filterInput.dispatchEvent(new win.Event('input', { bubbles: true }));
    await wait(50);
    assert.match(doc.getElementById('bulkPendingCount').textContent, /1 unsaved change/,
      'The pending count must survive filtering to a value that HIDES the edited row entirely');

    filterInput.value = '';
    filterInput.dispatchEvent(new win.Event('input', { bubbles: true }));
    await wait(50);
    const shd1936After = findBulkRow(doc, 'w_SHD', '1936');
    assert.equal(shd1936After.querySelector('[data-field="compiler"]').value, 'Unsaved Bulk Test',
      'The actual typed value must survive a full filter round-trip, not just the pending count');
  });

  test('edit row A, filter it out of view, edit row B, clear the filter, both A and B commit on Save', async () => {
    const dom = loadPage('tunebooks.html');
    const win = dom.window; win.confirm = () => true;
    const store = {};
    Object.defineProperty(win, 'localStorage', {
      value: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => delete store[k] },
      configurable: true,
    });
    await wait(700);
    const doc = win.document;
    await openBulkEdit(doc);

    const shd1936 = findBulkRow(doc, 'w_SHD', '1936');
    shd1936.querySelector('[data-field="compiler"]').value = 'Row A Edit';
    shd1936.querySelector('[data-field="compiler"]').dispatchEvent(new win.Event('input', { bubbles: true }));
    await wait(50);

    const filterInput = doc.getElementById('bulkFilterInput');
    filterInput.value = 'SHD';
    filterInput.dispatchEvent(new win.Event('input', { bubbles: true }));
    await wait(50);
    const shd1960 = findBulkRow(doc, 'w_SHD', '1960');
    shd1960.querySelector('[data-field="compiler"]').value = 'Row B Edit';
    shd1960.querySelector('[data-field="compiler"]').dispatchEvent(new win.Event('input', { bubbles: true }));
    await wait(50);

    filterInput.value = '';
    filterInput.dispatchEvent(new win.Event('input', { bubbles: true }));
    await wait(50);
    assert.equal(findBulkRow(doc, 'w_SHD', '1936').querySelector('[data-field="compiler"]').value, 'Row A Edit');
    assert.equal(findBulkRow(doc, 'w_SHD', '1960').querySelector('[data-field="compiler"]').value, 'Row B Edit');

    doc.getElementById('bulkSaveAllBtn').click();
    await wait(200);
    assert.match(doc.getElementById('bulkSaveStatus').textContent, /2 fields updated/);

    await openBulkEdit(doc);
    assert.equal(findBulkRow(doc, 'w_SHD', '1936').querySelector('[data-field="compiler"]').value, 'Row A Edit');
    assert.equal(findBulkRow(doc, 'w_SHD', '1960').querySelector('[data-field="compiler"]').value, 'Row B Edit');
  });

  test('a real, unsaved edit survives switching away to another tab and back', async () => {
    const dom = loadPage('tunebooks.html');
    const win = dom.window; win.confirm = () => true;
    await wait(700);
    const doc = win.document;
    await openBulkEdit(doc);

    const shd1936 = findBulkRow(doc, 'w_SHD', '1936');
    shd1936.querySelector('[data-field="compiler"]').value = 'Survives Tab Switch';
    shd1936.querySelector('[data-field="compiler"]').dispatchEvent(new win.Event('input', { bubbles: true }));
    await wait(50);

    doc.getElementById('tab-library').click();
    await wait(200);
    await openBulkEdit(doc);
    assert.match(doc.getElementById('bulkPendingCount').textContent, /1 unsaved change/);
    assert.equal(findBulkRow(doc, 'w_SHD', '1936').querySelector('[data-field="compiler"]').value, 'Survives Tab Switch');
  });
});

describe('Bulk Edit finding 2: an Edition row\u2019s shared-field edit writes to that Edition, never the parent Work (BLOCKER)', () => {
  test('SHW2007 SHMHA Code, SHW1911 unaffected, matching the review\u2019s own reproduction', async () => {
    const dom = loadPage('tunebooks.html');
    const win = dom.window; win.confirm = () => true;
    const store = {};
    Object.defineProperty(win, 'localStorage', {
      value: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => delete store[k] },
      configurable: true,
    });
    await wait(700);
    const doc = win.document;
    await openBulkEdit(doc);

    const shw2007 = findBulkRow(doc, 'w_SHW', '2007');
    const shw1911 = findBulkRow(doc, 'w_SHW', '1911');
    const originalShw1911 = shw1911.querySelector('[data-field="shmhaCode"]').value;

    shw2007.querySelector('[data-field="shmhaCode"]').value = 'ZZ';
    shw2007.querySelector('[data-field="shmhaCode"]').dispatchEvent(new win.Event('input', { bubbles: true }));
    await wait(50);
    doc.getElementById('bulkSaveAllBtn').click();
    await wait(200);

    await openBulkEdit(doc);
    assert.equal(findBulkRow(doc, 'w_SHW', '2007').querySelector('[data-field="shmhaCode"]').value, 'ZZ',
      'The row actually edited must change');
    assert.equal(findBulkRow(doc, 'w_SHW', '1911').querySelector('[data-field="shmhaCode"]').value, originalShw1911,
      'A sibling Edition sharing the same Work must be completely unaffected');
  });

  test('same ownership rule for Title Proper', async () => {
    const dom = loadPage('tunebooks.html');
    const win = dom.window; win.confirm = () => true;
    const store = {};
    Object.defineProperty(win, 'localStorage', {
      value: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => delete store[k] },
      configurable: true,
    });
    await wait(700);
    const doc = win.document;
    await openBulkEdit(doc);

    const shw2007 = findBulkRow(doc, 'w_SHW', '2007');
    const shw1911 = findBulkRow(doc, 'w_SHW', '1911');
    const originalTitle1911 = shw1911.querySelector('[data-field="titleProper"]').value;

    shw2007.querySelector('[data-field="titleProper"]').value = 'Edition-Only Title Change';
    shw2007.querySelector('[data-field="titleProper"]').dispatchEvent(new win.Event('input', { bubbles: true }));
    await wait(50);
    doc.getElementById('bulkSaveAllBtn').click();
    await wait(200);

    await openBulkEdit(doc);
    assert.equal(findBulkRow(doc, 'w_SHW', '2007').querySelector('[data-field="titleProper"]').value, 'Edition-Only Title Change');
    assert.equal(findBulkRow(doc, 'w_SHW', '1911').querySelector('[data-field="titleProper"]').value, originalTitle1911);
  });

  test('same ownership rule for Shape System', async () => {
    const dom = loadPage('tunebooks.html');
    const win = dom.window; win.confirm = () => true;
    const store = {};
    Object.defineProperty(win, 'localStorage', {
      value: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => delete store[k] },
      configurable: true,
    });
    await wait(700);
    const doc = win.document;
    await openBulkEdit(doc);

    const shw2007 = findBulkRow(doc, 'w_SHW', '2007');
    const shw1911 = findBulkRow(doc, 'w_SHW', '1911');
    const originalShape1911 = shw1911.querySelector('[data-field="shapeSystem"]').value;

    const select = shw2007.querySelector('[data-field="shapeSystem"]');
    select.value = 'mixed-shape';
    select.dispatchEvent(new win.Event('input', { bubbles: true }));
    await wait(50);
    doc.getElementById('bulkSaveAllBtn').click();
    await wait(200);

    await openBulkEdit(doc);
    assert.equal(findBulkRow(doc, 'w_SHW', '2007').querySelector('[data-field="shapeSystem"]').value, 'mixed-shape');
    assert.equal(findBulkRow(doc, 'w_SHW', '1911').querySelector('[data-field="shapeSystem"]').value, originalShape1911);
  });

  test('a bare-Work row (no existing Edition) still correctly writes shared fields to the Work itself', async () => {
    const dom = loadPage('tunebooks.html');
    const win = dom.window; win.confirm = () => true;
    const store = {};
    Object.defineProperty(win, 'localStorage', {
      value: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => delete store[k] },
      configurable: true,
    });
    await wait(700);
    const doc = win.document;
    await openBulkEdit(doc);

    const rows = [...doc.querySelectorAll('#bulkTableBody tr')];
    const bareRow = rows.find((r) => r.querySelector('.bulk-status-cell').textContent.trim() === 'Work only');
    const workCode = bareRow.querySelector('td').textContent;
    bareRow.querySelector('[data-field="shmhaCode"]').value = 'BARETEST';
    bareRow.querySelector('[data-field="shmhaCode"]').dispatchEvent(new win.Event('input', { bubbles: true }));
    await wait(50);
    doc.getElementById('bulkSaveAllBtn').click();
    await wait(200);
    assert.match(doc.getElementById('bulkSaveStatus').textContent, /1 field updated/);

    doc.getElementById('tab-library').click();
    await wait(200);
    const libRow = [...doc.querySelectorAll('.lib-work-row')].find((r) => r.textContent.includes(workCode));
    assert.ok(libRow, 'The Work itself must show the change - this is the one case where writing to the Work is correct');
  });
});

describe('Bulk Edit finding 3: Save is transactional and validation-gated (BLOCKER)', () => {
  test('blanking a Work\u2019s Title Proper is blocked, and real libraryData is genuinely unchanged', async () => {
    const dom = loadPage('tunebooks.html');
    const win = dom.window; win.confirm = () => true;
    const store = {};
    Object.defineProperty(win, 'localStorage', {
      value: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => delete store[k] },
      configurable: true,
    });
    await wait(700);
    const doc = win.document;
    await openBulkEdit(doc);

    const rows = [...doc.querySelectorAll('#bulkTableBody tr')];
    const ahRow = rows.find((r) => r.querySelector('td').textContent === 'AH');
    const titleInput = ahRow.querySelector('[data-field="titleProper"]');
    const originalTitle = titleInput.value;
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
    assert.match(doc.getElementById('libraryValidationReport').textContent, /No issues found/,
      'The real Library must still be fully valid - the blocked edit must never have touched it');

    // The Library itself is proven untouched by the validator above, not by what this
    // panel happens to be showing: validateLibrary() checks every Work for a blank
    // titleProper, so "No issues found" after a blocked save is exactly the guarantee this
    // test exists to make.
    //
    // What Bulk Edit SHOWS on reopening is a separate question, and this test used to get
    // it wrong. It asserted the row had snapped back to the saved title - written before
    // Bulk Edit had a draft model at all, when a re-render did re-read from the Library.
    // The dirty-session work that followed made that deliberately untrue: see the comment
    // at BULK_WORK_FIELDS in tunebooks.html - "a row that fails validation is skipped
    // entirely, both halves of it, with its draft left exactly as typed so it can be fixed
    // and retried." Throwing away what someone typed the moment they glance at another tab
    // is the worse behavior, so the code is right and the assertion was stale. This has sat
    // red across several reviews as "one known unrelated failure"; it was neither unrelated
    // nor a real regression, just an expectation nobody had reconciled with the fix that
    // outdated it. Now it asserts the intended behavior instead.
    await openBulkEdit(doc);
    const ahRowAfter = [...doc.querySelectorAll('#bulkTableBody tr')].find((r) => r.querySelector('td').textContent === 'AH');
    assert.equal(ahRowAfter.querySelector('[data-field="titleProper"]').value, '',
      'The rejected edit must still be sitting in the draft, exactly as typed, so it can be corrected and retried');
    assert.ok(originalTitle && originalTitle.trim(),
      'sanity: the row really did start with a real title, so the blank above is the typed edit and not an empty fixture');
  });

  test('a row with new bibliographic detail but no year does not partially commit the Work-field half either', async () => {
    const dom = loadPage('tunebooks.html');
    const win = dom.window; win.confirm = () => true;
    const store = {};
    Object.defineProperty(win, 'localStorage', {
      value: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => delete store[k] },
      configurable: true,
    });
    await wait(700);
    const doc = win.document;
    await openBulkEdit(doc);

    const rows = [...doc.querySelectorAll('#bulkTableBody tr')];
    const bareRow = rows.find((r) => r.querySelector('.bulk-status-cell').textContent.trim() === 'Work only');
    const workCode = bareRow.querySelector('td').textContent;

    // Change a Work-shared field AND add Edition-only content, but leave the year blank.
    bareRow.querySelector('[data-field="shmhaCode"]').value = 'SHOULDNOTCOMMIT';
    bareRow.querySelector('[data-field="shmhaCode"]').dispatchEvent(new win.Event('input', { bubbles: true }));
    bareRow.querySelector('[data-field="compiler"]').value = 'Some Compiler';
    bareRow.querySelector('[data-field="compiler"]').dispatchEvent(new win.Event('input', { bubbles: true }));
    await wait(50);
    doc.getElementById('bulkSaveAllBtn').click();
    await wait(200);
    assert.match(doc.getElementById('bulkSaveStatus').textContent, /Edition Identifier Year/);

    doc.getElementById('tab-library').click();
    await wait(200);
    const libRow = [...doc.querySelectorAll('.lib-work-row')].find((r) => r.textContent.includes(workCode));
    assert.ok(!libRow.textContent.includes('SHOULDNOTCOMMIT'),
      'The Work-field half of a failed row must NOT have committed - the whole row is one transaction, not two');
  });

  test('one invalid row does not block a different, valid row from saving', async () => {
    const dom = loadPage('tunebooks.html');
    const win = dom.window; win.confirm = () => true;
    const store = {};
    Object.defineProperty(win, 'localStorage', {
      value: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => delete store[k] },
      configurable: true,
    });
    await wait(700);
    const doc = win.document;
    await openBulkEdit(doc);

    const rows = [...doc.querySelectorAll('#bulkTableBody tr')];
    const ahRow = rows.find((r) => r.querySelector('td').textContent === 'AH');
    ahRow.querySelector('[data-field="titleProper"]').value = '';
    ahRow.querySelector('[data-field="titleProper"]').dispatchEvent(new win.Event('input', { bubbles: true }));

    const shd1936 = findBulkRow(doc, 'w_SHD', '1936');
    shd1936.querySelector('[data-field="compiler"]').value = 'Valid Row Should Commit';
    shd1936.querySelector('[data-field="compiler"]').dispatchEvent(new win.Event('input', { bubbles: true }));
    await wait(50);

    doc.getElementById('bulkSaveAllBtn').click();
    await wait(200);
    const status = doc.getElementById('bulkSaveStatus').textContent;
    assert.match(status, /1 field updated/, 'The valid row must still commit');
    assert.match(status, /couldn't be saved/, 'The invalid row must still be reported as a real problem');

    await openBulkEdit(doc);
    assert.equal(findBulkRow(doc, 'w_SHD', '1936').querySelector('[data-field="compiler"]').value, 'Valid Row Should Commit');
  });
});

describe('Finding 4: WiH1992\u2019s Level 3 file reference resolves to the real, shipped path', () => {
  test('tunebookFile points at tunebook-files/WiH1992.json, and that file genuinely exists', () => {
    const lib = new Function(fs.readFileSync(suitePath('tunebook-library.js'), 'utf8') + '\nreturn EZ_MINUTES_TUNEBOOK_LIBRARY;')();
    const ed = Object.values(lib.editions).find((e) => e.editionCode === 'WiH1992');
    assert.equal(ed.tunebookFile, 'tunebook-files/WiH1992.json');
    assert.ok(fs.existsSync(suitePath(ed.tunebookFile)), 'The referenced file must actually exist at that exact relative path');
  });

  test('the Library tab correctly loads WiH1992 as Level 3 through the real path', async () => {
    const dom = loadPage('tunebooks.html');
    const win = dom.window; win.confirm = () => true;
    win.fetch = async (path) => {
      const filename = path.split('/').pop();
      return { ok: true, json: async () => JSON.parse(fs.readFileSync(suitePath('tunebook-files/' + filename), 'utf8')) };
    };
    await wait(700);
    const doc = win.document;
    doc.getElementById('tab-library').click();
    await wait(300);
    const row = [...doc.querySelectorAll('.lib-edition-row')].find((r) => r.textContent.includes('WiH1992'));
    row.querySelector('.lib-edit-edition-btn').click();
    await wait(300);
    doc.getElementById('loadTunebookFileBtn').click();
    await wait(300);
    assert.match(doc.getElementById('tfCompletenessNote').textContent, /Level 3/);
  });
});

describe('Finding 5: Library schema import requires exact membership, not numeric ordering', () => {
  async function tryImportSchema(schemaVal) {
    const dom = loadPage('tunebooks.html');
    const win = dom.window; win.confirm = () => true;
    await wait(700);
    const doc = win.document;
    const schemaLine = schemaVal === undefined ? '' : ('"schemaVersion": ' + JSON.stringify(schemaVal) + ',');
    const content = '\nconst EZ_MINUTES_TUNEBOOK_LIBRARY_VERSION = "1";\nconst EZ_MINUTES_TUNEBOOK_LIBRARY = {\n  ' + schemaLine + '\n  "migrationIssues": [],\n  "works": {},\n  "editions": {}\n};\n';
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

  test('missing schemaVersion is rejected', async () => {
    assert.match(await tryImportSchema(undefined), /isn.t one this build recognizes/);
  });
  test('"bogus" is rejected', async () => {
    assert.match(await tryImportSchema('bogus'), /isn.t one this build recognizes/);
  });
  test('"1.5" is rejected', async () => {
    assert.match(await tryImportSchema('1.5'), /isn.t one this build recognizes/);
  });
  test('an object schemaVersion is rejected', async () => {
    assert.match(await tryImportSchema({}), /isn.t one this build recognizes/);
  });
  test('"2" is rejected as newer, with a distinct message from "unrecognized"', async () => {
    assert.match(await tryImportSchema('2'), /uses schema 2, but this build understands schema 1/);
  });
  test('the real, current schema "1" is accepted', async () => {
    assert.match(await tryImportSchema('1'), /^Loaded/);
  });

  test('the canonical validator also catches an already-corrupted schemaVersion sitting in the working copy', async () => {
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
      doc.getElementById('nt_workCode').value = 'F109TEMP';
      doc.getElementById('nt_titleProper').value = 'Finding 5 Temp';
      doc.getElementById('newTunebookBtn').click();
      await wait(200);
      const fp = JSON.parse(store['ezTunebooksLibraryWorkingCopy']).baselineFingerprint;
      win.close();
      return fp;
    }

    const fp = await realBundledFingerprint();
    const lib = new Function(fs.readFileSync(suitePath('tunebook-library.js'), 'utf8') + '\nreturn EZ_MINUTES_TUNEBOOK_LIBRARY;')();
    const corrupt = JSON.parse(JSON.stringify(lib));
    corrupt.schemaVersion = 'corrupted-somehow';
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
    assert.match(doc.getElementById('libraryValidationReport').textContent, /schemaVersion "corrupted-somehow"/);
  });

  test('the real, unmodified bundled Library still validates cleanly - no false positive from this new check', async () => {
    const dom = loadPage('tunebooks.html');
    const win = dom.window; win.confirm = () => true;
    await wait(700);
    const doc = win.document;
    doc.getElementById('tab-library').click();
    await wait(300);
    doc.getElementById('validateLibraryBtn').click();
    await wait(200);
    assert.match(doc.getElementById('libraryValidationReport').textContent, /No issues found/);
  });
});
