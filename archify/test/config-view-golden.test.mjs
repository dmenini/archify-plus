import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function renderFixture() {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'archify-configview-golden-'));
  const outPath = path.join(outDir, 'out.html');
  const input = path.join(root, 'examples', 'config-view-demo.architecture.json');
  const result = spawnSync('node', [path.join(root, 'renderers', 'architecture', 'render-architecture.mjs'), input, outPath], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return fs.readFileSync(outPath, 'utf8');
}

test('the golden fixture embeds configView data exactly once', () => {
  const html = renderFixture();
  // The bundled viewer module (viewer/config-view.js, compiled into every
  // page's chrome) always contains the literal string
  // "archify-config-view-data" as part of its own
  // document.getElementById('archify-config-view-data') lookup, regardless
  // of whether this diagram carries configView data — see the same gotcha
  // documented in test/config-view-embed.test.mjs. So a plain substring
  // count is always >= 1 even without a data script. What this test must
  // assert is that the actual data <script> tag appears exactly once (not
  // duplicated by a double-embed bug).
  const count = (html.match(/<script id="archify-config-view-data"/g) || []).length;
  assert.equal(count, 1);
});

test('the golden fixture render includes the compiled config-view viewer module', () => {
  const html = renderFixture();
  assert.ok(html.includes('Archify.configView'));
});

test('re-rendering the same fixture produces byte-identical output (idempotent)', () => {
  const first = renderFixture();
  const second = renderFixture();
  assert.equal(first, second);
});
