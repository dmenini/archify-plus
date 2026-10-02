import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));

test('generated template.html defines Archify.threatPassport and its container markup', () => {
  const html = fs.readFileSync(path.join(root, '..', 'assets', 'template.html'), 'utf8');
  assert.ok(html.includes('Archify.threatPassport'));
  assert.ok(html.includes('id="threat-passport-panel"'));
  assert.ok(html.includes('id="threat-passport-body"'));
  assert.ok(html.includes('id="threat-passport-close"'));
});

test('findCrossingsByIds resolves a space-separated id string to the matching crossings, in order', async () => {
  const source = fs.readFileSync(path.join(root, '..', '..', 'viewer', 'threat-passport.js'), 'utf8');
  const match = source.match(/function findCrossingsByIds\(crossings, idString\) \{[\s\S]*?\n      \}/);
  assert.ok(match, 'expected a findCrossingsByIds function in threat-passport.js');
  // eslint-disable-next-line no-new-func
  const findCrossingsByIds = new Function(`${match[0]}; return findCrossingsByIds;`)();
  const crossings = [{ id: 'TB-1', label: 'A' }, { id: 'TB-9', label: 'B' }];
  assert.deepEqual(findCrossingsByIds(crossings, 'TB-9 TB-1'), [crossings[1], crossings[0]]);
  assert.deepEqual(findCrossingsByIds(crossings, 'TB-1'), [crossings[0]]);
  assert.deepEqual(findCrossingsByIds(crossings, 'does-not-exist'), []);
});
