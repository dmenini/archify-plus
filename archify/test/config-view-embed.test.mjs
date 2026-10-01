import test from 'node:test';
import assert from 'node:assert/strict';
import { applyTemplate } from '../renderers/shared/utils.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const template = fs.readFileSync(path.join(root, '..', 'assets/template.html'), 'utf8');

function baseArgs(extra) {
  return {
    title: 'T', subtitle: '', svg: '<g></g>', cards: '', locale: 'en',
    ...extra,
  };
}

test('applyTemplate embeds configView data when provided', () => {
  const html = applyTemplate(template, baseArgs({ configView: { fields: [{ id: 'x', type: 'checkbox', label: 'X' }] } }));
  assert.ok(html.includes('archify-config-view-data'));
  assert.ok(html.includes('"id":"x"') || html.includes('"id": "x"'));
});

test('applyTemplate omits the configView script entirely when not provided (no stray empty tag)', () => {
  const html = applyTemplate(template, baseArgs({}));
  assert.ok(!html.includes('archify-config-view-data'));
});
