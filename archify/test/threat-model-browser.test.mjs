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
      //
      // Deliberately NOT `edge.dispatchEvent(new MouseEvent(...))` on the
      // semantic edge directly: dispatchEvent fires as if the event
      // originated at that exact node, bubbling through ITS ancestors,
      // regardless of what a real mouse click would actually hit at those
      // screen coordinates. Focus's own Direct Relationship Pin feature
      // (viewer/focus.js) overlays an invisible, wider hit-target clone on
      // top of every edge and calls stopPropagation() on click — a real
      // click lands on that clone, not the semantic edge underneath it. An
      // earlier version of this test used direct dispatchEvent and passed
      // while the real interaction was broken in every actual browser
      // session. Use elementFromPoint at the edge's own visual center to
      // find whatever a real click would actually hit, and click that.
      const clickedThroughRealHitTest = await evaluate(browser.cdp, sessionId, `(() => {
        const edge = document.querySelector('[data-edge-from="browser"][data-edge-to="alb"]');
        const rect = edge.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const target = document.elementFromPoint(cx, cy);
        if (!target) return 'no-element-at-point';
        target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: cx, clientY: cy }));
        return target === edge ? 'hit-real-edge' : (target.hasAttribute('data-crossing-id') ? 'hit-overlay-with-crossing-id' : 'hit-something-else');
      })()`);
      assert.notEqual(clickedThroughRealHitTest, 'no-element-at-point', 'the edge should be visible and hittable at its own bounding-box center');
      // Confirm this actually exercised the regression scenario (clicking
      // through Focus's overlapping hit-target clone), not a coincidental
      // hit on the real edge — otherwise this test would prove nothing
      // about the capture-phase fix.
      assert.equal(clickedThroughRealHitTest, 'hit-overlay-with-crossing-id',
        `expected the real click to land on Focus's hit-target overlay (which still carries data-crossing-id), got: ${clickedThroughRealHitTest}`);
      await new Promise((resolve) => setTimeout(resolve, 100));
      const passportOpen = await evaluate(browser.cdp, sessionId,
        '!document.getElementById("threat-passport-panel").hidden');
      assert.equal(passportOpen, true, 'Threat Passport should open after clicking a crossing-tagged edge');
      const passportText = await evaluate(browser.cdp, sessionId,
        'document.getElementById("threat-passport-body").textContent');
      assert.ok(passportText.includes('TB-1') || passportText.includes('Internet'), 'Threat Passport should show TB-1 content');

      // Closing while the close button still has real DOM focus (as it does
      // right after a real click activates it) must not set aria-hidden on
      // an ancestor of the focused element — Chrome's console flags exactly
      // this as an accessibility violation ("Blocked aria-hidden on an
      // element because its descendant retained focus"). `hidden` alone
      // already removes the panel from the accessibility tree; an explicit
      // aria-hidden on top of it is redundant and is specifically what
      // triggers the warning.
      await evaluate(browser.cdp, sessionId, 'document.getElementById("threat-passport-close").focus()');
      await evaluate(browser.cdp, sessionId, 'document.getElementById("threat-passport-close").click()');
      await new Promise((resolve) => setTimeout(resolve, 100));
      const passportAriaHiddenAfterClose = await evaluate(browser.cdp, sessionId,
        'document.getElementById("threat-passport-panel").hasAttribute("aria-hidden")');
      assert.equal(passportAriaHiddenAfterClose, false,
        'closing the Threat Passport must not set aria-hidden on the panel while its close button retains focus');

      // 2. Open the Top Risks drawer, click its top row, and check Focus + the Passport respond.
      await evaluate(browser.cdp, sessionId, 'document.getElementById("threat-risks-toggle").click()');
      await new Promise((resolve) => setTimeout(resolve, 100));
      const risksOpen = await evaluate(browser.cdp, sessionId, 'document.getElementById("threat-risks-toggle").getAttribute("aria-expanded")');
      assert.equal(risksOpen, 'true');
      // The row's prominent text must be the per-row STRIDE category, not the
      // crossing label — rows commonly share one crossing (the checkout
      // fixture's TB-1 alone has multiple scored categories), and the whole
      // point of a ranked list is to tell rows apart at a glance. Catches the
      // regression where every row looked identical because the bold text
      // was the (often-shared) crossing label instead.
      const categoryTexts = await evaluate(browser.cdp, sessionId,
        'Array.from(document.querySelectorAll(".threat-risks-category")).map((el) => el.textContent)');
      assert.ok(categoryTexts.length >= 2, 'expected at least two ranked rows in the Top Risks drawer');
      assert.ok(new Set(categoryTexts).size > 1,
        `expected distinct category text across ranked rows, got: ${JSON.stringify(categoryTexts)}`);
      await evaluate(browser.cdp, sessionId, 'document.querySelector(".threat-risks-item").click()');
      await new Promise((resolve) => setTimeout(resolve, 100));
      const focusActive = await evaluate(browser.cdp, sessionId, 'document.querySelector("svg[data-focus-active]") !== null');
      assert.equal(focusActive, true, 'clicking a Top Risks row should drive Focus onto the real diagram');

      // A crossing can carry several ranked rows (TB-2 in this fixture has
      // two: Information Disclosure and Elevation Of Privilege). Clicking
      // different rows that belong to the SAME crossing must highlight a
      // different row inside the passport each time — otherwise every entry
      // point into a shared crossing looks identical, which is the exact bug
      // report this regression test exists for.
      const firstHighlight = await evaluate(browser.cdp, sessionId, `(() => {
        const items = Array.from(document.querySelectorAll('.threat-risks-item'));
        const target = items.find((item) => item.textContent.includes('Information Disclosure'));
        if (!target) return 'not-found';
        target.click();
        return 'clicked';
      })()`);
      assert.equal(firstHighlight, 'clicked', 'expected an Information Disclosure row in the Top Risks drawer');
      await new Promise((resolve) => setTimeout(resolve, 100));
      const firstHighlighted = await evaluate(browser.cdp, sessionId, `(() => {
        const el = document.querySelector('.threat-passport-row--highlighted');
        return el ? { crossing: el.closest('[data-crossing-id]').getAttribute('data-crossing-id'), rowIndex: el.getAttribute('data-row-index') } : null;
      })()`);
      assert.ok(firstHighlighted, 'expected a highlighted row after clicking the Information Disclosure Top Risks row');
      assert.equal(firstHighlighted.crossing, 'TB-2');

      const secondHighlight = await evaluate(browser.cdp, sessionId, `(() => {
        // The drawer is still open from the previous click (nothing in
        // focusCrossing closes it) — click a different row directly.
        const items = Array.from(document.querySelectorAll('.threat-risks-item'));
        const target = items.find((item) => item.textContent.includes('Elevation Of Privilege'));
        if (!target) return 'not-found';
        target.click();
        return 'clicked';
      })()`);
      assert.equal(secondHighlight, 'clicked', 'expected an Elevation Of Privilege row in the Top Risks drawer');
      await new Promise((resolve) => setTimeout(resolve, 100));
      const secondHighlighted = await evaluate(browser.cdp, sessionId, `(() => {
        const highlighted = document.querySelectorAll('.threat-passport-row--highlighted');
        const el = highlighted[0];
        return { count: highlighted.length, crossing: el ? el.closest('[data-crossing-id]').getAttribute('data-crossing-id') : null, rowIndex: el ? el.getAttribute('data-row-index') : null };
      })()`);
      assert.equal(secondHighlighted.count, 1, 'exactly one row should be highlighted at a time, not an accumulating set');
      assert.equal(secondHighlighted.crossing, 'TB-2');
      assert.notEqual(secondHighlighted.rowIndex, firstHighlighted.rowIndex,
        'clicking a different row in the same crossing must highlight a different row, not always the same one');

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
