import test from 'node:test';
import assert from 'node:assert/strict';
import { architecture } from '../renderers/shared/generated-validators.mjs';

function baseArchitecture({ crossings, engineeringProfile } = {}) {
  return {
    schema_version: 1,
    diagram_type: 'architecture',
    meta: {
      title: 'Threat Model Schema Test',
      output: 'out.html',
      ...(engineeringProfile ? { engineering_profile: engineeringProfile } : {}),
    },
    components: [
      { id: 'browser', type: 'external', label: 'Browser' },
      { id: 'alb', type: 'cloud', label: 'ALB' },
    ],
    connections: [{ from: 'browser', to: 'alb', label: 'HTTPS' }],
    ...(crossings ? { crossings } : {}),
  };
}

function oneCrossing(overrides = {}) {
  return [{
    id: 'TB-1',
    label: 'Internet -> ALB',
    members: { edges: [['browser', 'alb']] },
    rows: [{ category: 'spoofing', status: 'open', severity: 'medium', rating: 4.0 }],
    ...overrides,
  }];
}

test('a well-formed crossings array is accepted', () => {
  const data = baseArchitecture({ crossings: oneCrossing(), engineeringProfile: 'threat-model' });
  const isValid = architecture(data);
  assert.ok(isValid, `Expected validation to pass, but got errors: ${JSON.stringify(architecture.errors)}`);
  assert.equal(architecture.errors, null);
});

test('"threat-model" is a valid engineering_profile value', () => {
  const data = baseArchitecture({ engineeringProfile: 'threat-model' });
  const isValid = architecture(data);
  assert.ok(isValid, JSON.stringify(architecture.errors));
});

test('a diagram with no crossings at all is still accepted (backward compatible)', () => {
  const data = baseArchitecture();
  const isValid = architecture(data);
  assert.ok(isValid, JSON.stringify(architecture.errors));
});

test('a crossing missing "members" is rejected', () => {
  const data = baseArchitecture({ crossings: [{ id: 'TB-1', label: 'x', rows: [{ category: 'spoofing', status: 'open' }] }] });
  assert.ok(!architecture(data));
});

test('a crossing missing "rows" is rejected', () => {
  const data = baseArchitecture({ crossings: [{ id: 'TB-1', label: 'x', members: { edges: [['browser', 'alb']] } }] });
  assert.ok(!architecture(data));
});

test('a row with an invalid STRIDE category is rejected', () => {
  const data = baseArchitecture({ crossings: oneCrossing({ rows: [{ category: 'phishing', status: 'open' }] }) });
  assert.ok(!architecture(data));
});

test('a row with an invalid status is rejected', () => {
  const data = baseArchitecture({ crossings: oneCrossing({ rows: [{ category: 'spoofing', status: 'maybe' }] }) });
  assert.ok(!architecture(data));
});

test('a row with an invalid severity is rejected', () => {
  const data = baseArchitecture({ crossings: oneCrossing({ rows: [{ category: 'spoofing', status: 'open', severity: 'critical' }] }) });
  assert.ok(!architecture(data));
});

test('members.edges rejects a malformed (non-pair) entry', () => {
  const data = baseArchitecture({ crossings: oneCrossing({ members: { edges: [['browser']] } }) });
  assert.ok(!architecture(data));
});

test('a crossing may target nodes instead of edges', () => {
  const data = baseArchitecture({ crossings: oneCrossing({ members: { nodes: ['alb'] } }) });
  assert.ok(architecture(data), JSON.stringify(architecture.errors));
});

test('factors accepts arbitrary numeric keys (no hardcoded column set)', () => {
  const data = baseArchitecture({
    crossings: oneCrossing({
      rows: [{ category: 'spoofing', status: 'open', factors: { av: 2, wp: 1, wd: 3, ti: 2, customFactor: 1 } }],
    }),
  });
  assert.ok(architecture(data), JSON.stringify(architecture.errors));
});

test('an unknown property on a crossing is rejected', () => {
  const data = baseArchitecture({ crossings: oneCrossing({ unexpected: true }) });
  assert.ok(!architecture(data));
});
