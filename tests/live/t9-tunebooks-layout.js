// Tunebooks' own responsive-layout check.
//
// This used to be half of t4, which swept both applications at once - fine in a single
// working tree, impossible in a repo that holds only one of them. Each app now checks its
// own layout in its own repo, which is also where a failure would need fixing.
const { chromium } = require('playwright');
const P = require('./paths');

const results = [];
function check(name, ok, detail){
  results.push(ok);
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (detail ? '\n        ' + String(detail).replace(/\n/g, '\n        ') : ''));
}

(async () => {
  const app = P.tunebooksApp();
  if (!app){
    console.log('tunebooks.html is not present here — nothing for this check to run against.');
    process.exit(0);
  }
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('dialog', d => d.accept());

  for (const w of [390, 768, 1024, 1280, 1440]){
    await page.setViewportSize({ width: w, height: 900 });
    await page.goto('file://' + app);
    await page.waitForTimeout(1400);
    const overflow = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check('tunebooks.html @ ' + w + 'px: no horizontal overflow', overflow <= 0, 'overflow ' + overflow + 'px');
  }

  // Bulk Edit is the widest thing in the app and the most likely to push the document out.
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('file://' + app);
  await page.waitForTimeout(1600);
  await page.click('#tab-bulk');
  await page.waitForTimeout(600);
  const lb = await page.$('#bulkLoadBtn');
  if (lb){ await lb.click(); await page.waitForTimeout(900); }
  const bulk = await page.evaluate(() => ({
    docOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    // the table is allowed - and expected - to scroll inside its own wrapper
    wrapScrolls: (() => { const w = document.getElementById('bulkTableWrap');
      return !!w && w.scrollWidth > w.clientWidth; })(),
    badges: document.querySelectorAll('#bulkTableBody .bulk-badge').length
  }));
  check('Bulk Edit does not push the document sideways', bulk.docOverflow <= 0, 'overflow ' + bulk.docOverflow);
  check('the wide table scrolls inside its own wrapper instead', bulk.wrapScrolls === true, String(bulk.wrapScrolls));
  check('badge colours render in the Work Code column', bulk.badges > 0, bulk.badges + ' badges');
  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));

  await browser.close();
  const failed = results.filter(r => !r).length;
  console.log('\n' + results.length + ' checks, ' + failed + ' failed');
  process.exit(failed);
})();
