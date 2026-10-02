import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveCrossingAttributes } from '../renderers/architecture/threat-model.mjs';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const skillRoot = path.resolve(__dirname, '..');
const cli = path.join(skillRoot, 'bin', 'archify.mjs');

const connections = [
  { from: 'browser', to: 'alb' },
  { from: 'alb', to: 'api' },
  { from: 'api', to: 'db' },
];

test('an edge matched by one crossing gets that crossing id and severity', () => {
  const crossings = [{
    id: 'TB-1',
    members: { edges: [['browser', 'alb']] },
    rows: [{ category: 'spoofing', status: 'open', severity: 'medium' }],
  }];
  const resolved = resolveCrossingAttributes(crossings, connections);
  assert.deepEqual(resolved.get('browser>alb'), { ids: ['TB-1'], severity: 'medium' });
});

test('an edge not referenced by any crossing has no entry', () => {
  const crossings = [{
    id: 'TB-1',
    members: { edges: [['browser', 'alb']] },
    rows: [{ category: 'spoofing', status: 'open', severity: 'medium' }],
  }];
  const resolved = resolveCrossingAttributes(crossings, connections);
  assert.equal(resolved.has('api>db'), false);
});

test('an edge matched by two crossings takes the worst severity and lists both ids', () => {
  const crossings = [
    { id: 'TB-1', members: { edges: [['alb', 'api']] }, rows: [{ category: 'spoofing', status: 'open', severity: 'low' }] },
    { id: 'TB-9', members: { edges: [['alb', 'api']] }, rows: [{ category: 'tampering', status: 'open', severity: 'high' }] },
  ];
  const resolved = resolveCrossingAttributes(crossings, connections);
  const entry = resolved.get('alb>api');
  assert.deepEqual(entry.ids.sort(), ['TB-1', 'TB-9']);
  assert.equal(entry.severity, 'high');
});

test('a row with status "dash" and no severity does not crash and does not count toward severity', () => {
  const crossings = [{
    id: 'TB-1',
    members: { edges: [['browser', 'alb']] },
    rows: [
      { category: 'spoofing', status: 'dash' },
      { category: 'tampering', status: 'open', severity: 'low' },
    ],
  }];
  const resolved = resolveCrossingAttributes(crossings, connections);
  assert.equal(resolved.get('browser>alb').severity, 'low');
});

test('a crossing with only node members produces no edge entries', () => {
  const crossings = [{
    id: 'TB-14',
    members: { nodes: ['api'] },
    rows: [{ category: 'denial-of-service', status: 'open', severity: 'high' }],
  }];
  const resolved = resolveCrossingAttributes(crossings, connections);
  assert.equal(resolved.size, 0);
});

test('no crossings and/or no connections resolves to an empty map without throwing', () => {
  assert.equal(resolveCrossingAttributes(undefined, connections).size, 0);
  assert.equal(resolveCrossingAttributes([], undefined).size, 0);
});

// Components below carry explicit pos/size. Omitting them routes through the
// automatic grid-layout path, which throws (TypeError in labelPoint via
// geometry.mjs) for small unpositioned component sets — a pre-existing bug
// confirmed present before any threat-model work (reproduces at e413f97c),
// unrelated to crossings. Authored positions sidestep it so these tests
// exercise only the Task 4 contract: data-crossing-* attributes and the
// crossings embed.
test('a rendered edge carries data-crossing-id and data-crossing-severity when part of a crossing', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'archify-threat-model-attrs-'));
  try {
    const candidate = {
      schema_version: 1,
      diagram_type: 'architecture',
      meta: { title: 'TM', output: 'out.html' },
      components: [
        { id: 'browser', type: 'external', label: 'Browser', pos: [40, 40], size: [120, 60] },
        { id: 'alb', type: 'cloud', label: 'ALB', pos: [260, 40], size: [120, 60] },
      ],
      connections: [{ from: 'browser', to: 'alb', label: 'HTTPS' }],
      crossings: [{
        id: 'TB-1',
        label: 'Internet -> ALB',
        members: { edges: [['browser', 'alb']] },
        rows: [{ category: 'spoofing', status: 'open', severity: 'high' }],
      }],
    };
    const input = path.join(tmp, 'tm.architecture.json');
    const output = path.join(tmp, 'tm.html');
    fs.writeFileSync(input, JSON.stringify(candidate));
    const result = spawnSync(process.execPath, [cli, 'render', 'architecture', input, output], { cwd: tmp, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    const html = fs.readFileSync(output, 'utf8');
    assert.match(html, /data-edge-from="browser" data-edge-to="alb"[^>]*data-crossing-id="TB-1" data-crossing-severity="high"/);
    assert.ok(html.includes('archify-crossings-data'));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('a diagram with crossings but no engineering_profile still renders severity coloring (visual-only use)', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'archify-threat-model-visual-only-'));
  try {
    const candidate = {
      schema_version: 1,
      diagram_type: 'architecture',
      meta: { title: 'TM', output: 'out.html' },
      components: [
        { id: 'browser', type: 'external', label: 'Browser', pos: [40, 40], size: [120, 60] },
        { id: 'alb', type: 'cloud', label: 'ALB', pos: [260, 40], size: [120, 60] },
      ],
      connections: [{ from: 'browser', to: 'alb', label: 'HTTPS' }],
      crossings: [{
        id: 'TB-1',
        label: 'Internet -> ALB',
        members: { edges: [['browser', 'alb']] },
        rows: [{ category: 'spoofing', status: 'open', severity: 'medium' }],
      }],
    };
    const input = path.join(tmp, 'tm.architecture.json');
    const output = path.join(tmp, 'tm.html');
    fs.writeFileSync(input, JSON.stringify(candidate));
    const result = spawnSync(process.execPath, [cli, 'render', 'architecture', input, output], { cwd: tmp, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.match(fs.readFileSync(output, 'utf8'), /data-crossing-severity="medium"/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
