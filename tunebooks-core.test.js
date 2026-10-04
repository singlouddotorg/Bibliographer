// Tunebook Editor keeps libraryData as a closure-scoped variable, invisible to a test
// script's own eval/inspection - the same limitation hit repeatedly during this
// project's manual testing. Rather than fight that, this file uses the same disposable
// debug-hook approach used throughout development: a temporary copy of the real file
// with one extra line exposing what's needed for verification, built fresh for each
// test run and never touching the actual shipped file.
'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const { suitePath, wait, stubDownload, suiteAppPath } = require('./helpers');

const TMP_DIR = path.join(__dirname, '.tmp-debug-copy');
const TMP_HTML = path.join(TMP_DIR, 'tunebooks.html');

const openWindows = [];

function loadDebugCopy() {
  const html = fs.readFileSync(TMP_HTML, 'utf8');
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    resources: 'usable',
    pretendToBeVisual: true,
    url: 'file://' + TMP_DIR + '/',
  });
  const win = dom.window;
  win.confirm = () => true;
  win.HTMLElement.prototype.scrollIntoView = function () {};
  openWindows.push(win);
  return dom;
}

describe('Tunebook Editor', () => {
  before(() => {
    fs.mkdirSync(TMP_DIR, { recursive: true });
    // tunebook-library.js is the real load-time dependency (tunebooks.html derives
    // EZ_MINUTES_TUNEBOOKS from the Library at runtime, not from a separate
    // tunebook-index.js file - that file no longer exists in the package at all).
    fs.copyFileSync(suitePath('tunebook-library.js'), path.join(TMP_DIR, 'tunebook-library.js'));
    // shared-utils.js is a real load-time dependency of the page under test — without it
    // copied alongside, the page 404s on it and every script below that tag silently
    // never runs (including the __getBook hook these tests rely on).
    fs.copyFileSync(suitePath('shared-utils.js'), path.join(TMP_DIR, 'shared-utils.js'));
    let html = fs.readFileSync(suiteAppPath('tunebooks.html'), 'utf8');
    html = html.replace(
      'libraryData = loadLibraryWorkingCopy();',
      "libraryData = loadLibraryWorkingCopy(); window.__getEditionByCode = function(code){ return Object.values(libraryData.editions).find(function(e){ return e.editionCode === code; }); };"
    );
    fs.writeFileSync(TMP_HTML, html);
  });

  after(() => {
    while (openWindows.length) {
      const win = openWindows.pop();
      try { win.close(); } catch (e) {}
    }
    fs.rmSync(TMP_DIR, { recursive: true, force: true });
  });

  // Rename-identity tracking (originalEditionCode) was retired along with the whole
  // registry-based Edit Book system it belonged to - the new Work/Edition model doesn't
  // need it at all. editionId is the real, permanent identity now, stable by construction
  // whether or not editionCode is ever regenerated from a renamed workCode, so there's no
  // separate tracking logic left to test; the identity simply doesn't move.

  describe('page-key canonicalization', () => {
    function openEditionInEditor(doc, win, editionCode) {
      doc.getElementById('tab-edit').click();
      const sel = doc.getElementById('edBookQuickSelect');
      const opt = Array.from(sel.options).find((o) => o.textContent.includes(editionCode));
      sel.value = opt.value;
      sel.dispatchEvent(new win.Event('change'));
    }

    test('a page key with whitespace and mixed case is canonicalized on add', async () => {
      const dom = loadDebugCopy();
      await wait(800);
      const doc = dom.window.document;

      openEditionInEditor(doc, dom.window, 'SHM1991');
      doc.getElementById('libNewSongPage').value = ' 999T ';
      doc.getElementById('libNewSongTitle').value = 'Canonicalization Test';
      doc.getElementById('libAddSongBtn').click();

      const edition = dom.window.__getEditionByCode('SHM1991');
      assert.ok(edition.songs['999t'], 'Expected the canonicalized key 999t to exist');
      assert.equal(edition.songs['999t'].title, 'Canonicalization Test');
    });

    test('.1/.2 always canonicalizes to t/b, even establishing a brand new split', async () => {
      const dom = loadDebugCopy();
      await wait(800);
      const doc = dom.window.document;

      openEditionInEditor(doc, dom.window, 'SHM1991');
      doc.getElementById('libNewSongPage').value = '998.1';
      doc.getElementById('libNewSongTitle').value = 'First Split Top';
      doc.getElementById('libAddSongBtn').click();

      const edition = dom.window.__getEditionByCode('SHM1991');
      assert.ok(edition.songs['998t'], 'Expected 998.1 to canonicalize to 998t even with no prior split at 998');
    });

    test('duplicate detection compares canonical keys, not raw input', async () => {
      const dom = loadDebugCopy();
      await wait(800);
      const doc = dom.window.document;

      openEditionInEditor(doc, dom.window, 'SHM1991');
      doc.getElementById('libNewSongPage').value = '997t';
      doc.getElementById('libNewSongTitle').value = 'First';
      doc.getElementById('libAddSongBtn').click();

      doc.getElementById('libNewSongPage').value = ' 997T ';
      doc.getElementById('libNewSongTitle').value = 'Duplicate Attempt';
      doc.getElementById('libAddSongBtn').click();

      assert.match(doc.getElementById('libAddSongStatus').textContent, /already exists/);
    });
  });
});
