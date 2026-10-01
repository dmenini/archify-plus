import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { ChromeVisualBrowser, findChrome } from '../bin/visual-check.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Helper function to evaluate expressions in the browser
async function evaluate(cdp, sessionId, expression, awaitPromise = false) {
  const response = await cdp.send('Runtime.evaluate', {
    expression,
    awaitPromise,
    returnByValue: true,
  }, sessionId);
  if (response.exceptionDetails) {
    throw new Error(response.exceptionDetails.exception?.description
      || response.exceptionDetails.text
      || 'Runtime.evaluate failed');
  }
  return response.result?.value;
}

test('toggling the configView checkbox sets data-config-hidden and data-config-attn on the real nodes', {
  skip: !process.env.ARCHIFY_CHROME && 'ARCHIFY_CHROME not set',
}, async () => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'archify-configview-browser-'));
  const outPath = path.join(outDir, 'out.html');
  const input = path.join(root, 'examples', 'config-view-demo.architecture.json');

  try {
    // Render the fixture to HTML
    const rendered = spawnSync('node', [path.join(root, 'renderers', 'architecture', 'render-architecture.mjs'), input, outPath], { encoding: 'utf8' });
    assert.equal(rendered.status, 0, rendered.stderr);

    // Launch Chrome and interact with the page
    const chromePath = process.env.ARCHIFY_CHROME;
    const browser = new ChromeVisualBrowser(chromePath);
    try {
      const sessionId = await browser.sessionPromise;

      // Navigate to the rendered HTML
      const fileUrl = pathToFileURL(outPath).href;
      const loaded = browser.cdp.waitFor('Page.loadEventFired', sessionId);
      loaded.catch(() => {});
      const navigation = await browser.cdp.send('Page.navigate', { url: fileUrl }, sessionId);
      assert(!navigation.errorText, `Navigation failed: ${navigation.errorText}`);
      await loaded;

      // Wait a bit for the page to settle
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Check initial state: otel should be hidden (monitoringEnabled defaults false)
      const initiallyHidden = await evaluate(browser.cdp, sessionId,
        'document.querySelector("[data-node-id=\\"otel\\"]").hasAttribute("data-config-hidden")');
      assert.equal(initiallyHidden, true, 'otel should be hidden by default (monitoringEnabled defaults false)');

      // Click the checkbox
      await evaluate(browser.cdp, sessionId,
        'document.querySelector("[data-config-field=\\"monitoringEnabled\\"]").click()');

      // Wait a bit for the click to be processed
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Check the state after toggling
      const hiddenAfterToggle = await evaluate(browser.cdp, sessionId,
        'document.querySelector("[data-node-id=\\"otel\\"]").hasAttribute("data-config-hidden")');
      const attnAfterToggle = await evaluate(browser.cdp, sessionId,
        'document.querySelector("[data-node-id=\\"otel\\"]").hasAttribute("data-config-attn")');

      assert.equal(hiddenAfterToggle, false, 'otel should no longer be hidden once monitoring is enabled');
      assert.equal(attnAfterToggle, true, 'otel should be flagged attn once monitoring is enabled (per the fixture rule)');
    } finally {
      await browser.close();
    }
  } finally {
    fs.rmSync(outDir, { recursive: true, force: true });
  }
});
