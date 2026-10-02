import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { ChromeVisualBrowser, findChrome } from '../bin/visual-check.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function evaluate(cdp, sessionId, expression, awaitPromise = false) {
  const response = await cdp.send('Runtime.evaluate', { expression, awaitPromise, returnByValue: true }, sessionId);
  if (response.exceptionDetails) {
    throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text || 'Runtime.evaluate failed');
  }
  return response.result?.value;
}

async function navigate(browser, sessionId, outPath) {
  const fileUrl = pathToFileURL(outPath).href;
  const loaded = browser.cdp.waitFor('Page.loadEventFired', sessionId);
  loaded.catch(() => {});
  const navigation = await browser.cdp.send('Page.navigate', { url: fileUrl }, sessionId);
  assert(!navigation.errorText, `Navigation failed: ${navigation.errorText}`);
  await loaded;
  await new Promise((resolve) => setTimeout(resolve, 150));
}

test('clicking a crossing-tagged edge opens the Threat Passport with the right rows; the Top Risks drawer and configView stay mutually exclusive', {
  skip: !process.env.ARCHIFY_CHROME && 'ARCHIFY_CHROME not set',
}, async () => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'archify-threat-model-browser-'));
  const outPath = path.join(outDir, 'out.html');
  const input = path.join(root, 'examples', 'threat-model-checkout.architecture.json');

  // Mutual exclusion between the Top Risks drawer and the configView drawer is
  // only observable on a page where both panels actually wire up: configView
  // only attaches its toggle's click listener when the document has an
  // authored `meta.configView`. The checked-in `threat-model-checkout`
  // fixture intentionally has none, so build a temporary combined fixture
  // (same crossings content, plus a minimal valid `meta.configView`) just for
  // steps 3-4, instead of modifying the already-reviewed example file.
  const baseDoc = JSON.parse(fs.readFileSync(input, 'utf8'));
  const combinedDoc = {
    ...baseDoc,
    meta: {
      ...baseDoc.meta,
      configView: { fields: [{ id: 'exampleToggle', type: 'checkbox', label: 'Example toggle', default: false }] },
    },
  };
  const combinedInput = path.join(outDir, 'combined.architecture.json');
  const combinedOutPath = path.join(outDir, 'combined.html');
  fs.writeFileSync(combinedInput, JSON.stringify(combinedDoc, null, 2));

  try {
    const rendered = spawnSync(process.execPath, [path.join(root, 'bin', 'archify.mjs'), 'render', 'architecture', input, outPath], { encoding: 'utf8' });
    assert.equal(rendered.status, 0, rendered.stderr);
    const renderedCombined = spawnSync(process.execPath, [path.join(root, 'bin', 'archify.mjs'), 'render', 'architecture', combinedInput, combinedOutPath], { encoding: 'utf8' });
    assert.equal(renderedCombined.status, 0, renderedCombined.stderr);

    const chromePath = process.env.ARCHIFY_CHROME;
    const browser = new ChromeVisualBrowser(chromePath);
    try {
      const sessionId = await browser.sessionPromise;
      await navigate(browser, sessionId, outPath);

      // 1. Click a crossing-tagged edge and check the Threat Passport opens with its rows.
      await evaluate(browser.cdp, sessionId,
        'document.querySelector("[data-edge-from=\\"browser\\"][data-edge-to=\\"alb\\"]").dispatchEvent(new MouseEvent("click", {bubbles:true}))');
      await new Promise((resolve) => setTimeout(resolve, 100));
      const passportOpen = await evaluate(browser.cdp, sessionId,
        '!document.getElementById("threat-passport-panel").hidden');
      assert.equal(passportOpen, true, 'Threat Passport should open after clicking a crossing-tagged edge');
      const passportText = await evaluate(browser.cdp, sessionId,
        'document.getElementById("threat-passport-body").textContent');
      assert.ok(passportText.includes('TB-1') || passportText.includes('Internet'), 'Threat Passport should show TB-1 content');

      // 2. Open the Top Risks drawer, click its top row, and check Focus + the Passport respond.
      await evaluate(browser.cdp, sessionId, 'document.getElementById("threat-risks-toggle").click()');
      await new Promise((resolve) => setTimeout(resolve, 100));
      const risksOpen = await evaluate(browser.cdp, sessionId, 'document.getElementById("threat-risks-toggle").getAttribute("aria-expanded")');
      assert.equal(risksOpen, 'true');
      await evaluate(browser.cdp, sessionId, 'document.querySelector(".threat-risks-item").click()');
      await new Promise((resolve) => setTimeout(resolve, 100));
      const focusActive = await evaluate(browser.cdp, sessionId, 'document.querySelector("svg[data-focus-active]") !== null');
      assert.equal(focusActive, true, 'clicking a Top Risks row should drive Focus onto the real diagram');

      // 3-4. configView and Top Risks stay mutually exclusive. This needs a page
      // where configView is actually wired up (a real meta.configView), so
      // switch to the combined fixture for the rest of this test.
      await navigate(browser, sessionId, combinedOutPath);

      // 3. configView and Top Risks stay mutually exclusive.
      await evaluate(browser.cdp, sessionId, 'document.getElementById("threat-risks-toggle").click()');
      await new Promise((resolve) => setTimeout(resolve, 100));
      const risksOpenFirst = await evaluate(browser.cdp, sessionId, 'document.getElementById("threat-risks-toggle").getAttribute("aria-expanded")');
      assert.equal(risksOpenFirst, 'true');
      await evaluate(browser.cdp, sessionId, 'document.getElementById("config-view-toggle").click()');
      await new Promise((resolve) => setTimeout(resolve, 100));
      const risksClosedAfterConfigOpen = await evaluate(browser.cdp, sessionId,
        'document.getElementById("threat-risks-toggle").getAttribute("aria-expanded")');
      assert.equal(risksClosedAfterConfigOpen, 'false', 'opening configView should close the Top Risks drawer');
      const configOpen = await evaluate(browser.cdp, sessionId, 'document.getElementById("config-view-toggle").getAttribute("aria-expanded")');
      assert.equal(configOpen, 'true');

      // 4. And the reverse order: opening Top Risks while configView is open closes configView.
      await evaluate(browser.cdp, sessionId, 'document.getElementById("threat-risks-toggle").click()');
      await new Promise((resolve) => setTimeout(resolve, 100));
      const configClosedAfterRisksOpen = await evaluate(browser.cdp, sessionId,
        'document.getElementById("config-view-toggle").getAttribute("aria-expanded")');
      assert.equal(configClosedAfterRisksOpen, 'false', 'opening Top Risks should close configView');
      const risksOpenAgain = await evaluate(browser.cdp, sessionId, 'document.getElementById("threat-risks-toggle").getAttribute("aria-expanded")');
      assert.equal(risksOpenAgain, 'true');
    } finally {
      await browser.close();
    }
  } finally {
    fs.rmSync(outDir, { recursive: true, force: true });
  }
});
