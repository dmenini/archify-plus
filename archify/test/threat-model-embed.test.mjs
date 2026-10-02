import test from 'node:test';
import assert from 'node:assert/strict';
import { applyTemplate } from '../renderers/shared/utils.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const template = fs.readFileSync(path.join(root, '..', 'assets/template.html'), 'utf8');

function baseArgs(extra) {
  return { title: 'T', subtitle: '', svg: '<g></g>', cards: '', locale: 'en', ...extra };
}

test('applyTemplate embeds crossings data when provided', () => {
  const html = applyTemplate(template, baseArgs({ crossings: [{ id: 'TB-1', label: 'x', members: {}, rows: [] }] }));
  assert.ok(html.includes('archify-crossings-data'));
  assert.ok(html.includes('"id":"TB-1"') || html.includes('"id": "TB-1"'));
});

test('applyTemplate omits the crossings script entirely when not provided', () => {
  const html = applyTemplate(template, baseArgs({}));
  assert.ok(!html.includes('<script id="archify-crossings-data"'));
});
