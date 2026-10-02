import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));

test('generated template.html defines Archify.threatRisks and its container markup', () => {
  const html = fs.readFileSync(path.join(root, '..', 'assets', 'template.html'), 'utf8');
  assert.ok(html.includes('Archify.threatRisks'));
  assert.ok(html.includes('id="threat-risks-panel"'));
  assert.ok(html.includes('id="threat-risks-toggle"'));
  assert.ok(html.includes('id="threat-risks-drawer"'));
  assert.ok(html.includes('id="threat-risks-list"'));
});

test('generated template.html gives configView a close() method', () => {
  const html = fs.readFileSync(path.join(root, '..', 'assets', 'template.html'), 'utf8');
  assert.match(html, /function close\(\)[\s\S]*?data-config-view-open', 'false'/);
});

test('rankRows flattens every crossing\'s rows and sorts by rating descending', async () => {
  const source = fs.readFileSync(path.join(root, '..', '..', 'viewer', 'threat-risks.js'), 'utf8');
  const match = source.match(/function rankRows\(crossings\) \{[\s\S]*?\n      \}/);
  assert.ok(match, 'expected a rankRows function in threat-risks.js');
  // eslint-disable-next-line no-new-func
  const rankRows = new Function(`${match[0]}; return rankRows;`)();
  const crossings = [
    { id: 'TB-1', label: 'A', rows: [{ category: 'spoofing', status: 'open', rating: 2 }] },
    { id: 'TB-2', label: 'B', rows: [
      { category: 'tampering', status: 'open', rating: 6 },
      { category: 'repudiation', status: 'dash' },
    ] },
  ];
  const ranked = rankRows(crossings);
  assert.equal(ranked.length, 2); // the "dash" row with no rating is excluded
  assert.equal(ranked[0].crossingId, 'TB-2');
  assert.equal(ranked[0].rating, 6);
  assert.equal(ranked[1].crossingId, 'TB-1');
});
