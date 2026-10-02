import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveCrossingAttributes } from '../renderers/architecture/threat-model.mjs';

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
