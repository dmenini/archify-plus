import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateSpec as nodeEvaluateSpec } from '../renderers/architecture/config-view.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const viewerSource = fs.readFileSync(path.join(root, '..', '..', 'viewer', 'config-view.js'), 'utf8');

function loadBrowserEvaluateSpec() {
  // viewer/config-view.js is a classic-script IIFE assigning `Archify.configView`;
  // evaluate it in a minimal sandbox exposing just enough globals to run the
  // pure evaluator function it contains, without a real DOM.
  const sandbox = { document: { getElementById: () => null, querySelectorAll: () => [] }, Archify: {} };
  const fn = new Function('document', 'Archify', `${viewerSource}\nreturn Archify.configView.__evaluateSpecForTests;`);
  return fn(sandbox.document, sandbox.Archify);
}

const SPEC = {
  fields: [
    { id: 'oidcEnabled', type: 'checkbox', label: 'OIDC', default: false },
    { id: 'modelProvider', type: 'select', label: 'Model', default: 'bedrock',
      options: [{ value: 'bedrock', label: 'Bedrock' }, { value: 'saip', label: 'SAIP' }] },
  ],
  derived: [{ id: 'noAuth', expr: '!oidcEnabled' }],
  rules: [{ when: 'noAuth', hide: { nodes: ['ui_task'], edges: [['alb', 'ui_task']] } }],
  warnings: [{ level: 'warn', when: "modelProvider=='saip'", text: 'no guardrail path' }],
};
const FIXTURE_STATES = [
  { oidcEnabled: false, modelProvider: 'bedrock' },
  { oidcEnabled: true, modelProvider: 'bedrock' },
  { oidcEnabled: false, modelProvider: 'saip' },
];

test('the ES5 viewer evaluator and the ESM renderer evaluator agree on every fixture state', () => {
  const browserEvaluateSpec = loadBrowserEvaluateSpec();
  for (const state of FIXTURE_STATES) {
    const nodeResult = nodeEvaluateSpec(SPEC, state);
    const browserResult = browserEvaluateSpec(SPEC, state);
    assert.deepEqual([...nodeResult.hiddenNodes].sort(), [...browserResult.hiddenNodes].sort());
    assert.deepEqual([...nodeResult.hiddenEdges].sort(), [...browserResult.hiddenEdges].sort());
    assert.deepEqual([...nodeResult.attnNodes].sort(), [...browserResult.attnNodes].sort());
    assert.equal(nodeResult.warnings.length, browserResult.warnings.length);
  }
});

// Regression coverage for the plain-`{}`-as-a-set bug: viewer/config-view.js's
// internal dedup sets (hiddenNodes/attnNodes/hiddenEdges/attnEdges, the `seen`
// sets, and declaredIds) must be Object.create(null)-based like every sibling
// viewer module (focus.js, export.js, etc.), not plain `{}`. A plain `{}`
// inherits Object.prototype, so a node/field/derived id literally named
// `constructor`, `toString`, `valueOf`, `hasOwnProperty`, or `__proto__`
// resolves truthily via the prototype chain before ever being set, which
// silently defeats the `if (!set[id])` dedup/membership guards used
// throughout this module. The ESM renderer side (Task 2) uses real `Set`s,
// which have no such hazard, so this case only exercises the browser copy —
// but it is run through both evaluators to prove they still agree.
const PROTOTYPE_NAMED_IDS = ['constructor', 'toString', 'valueOf', 'hasOwnProperty', '__proto__'];

test('prototype-named node ids are hidden correctly, not silently dropped by inherited Object.prototype lookups', () => {
  const browserEvaluateSpec = loadBrowserEvaluateSpec();
  const spec = {
    fields: [{ id: 'oidcEnabled', type: 'checkbox', label: 'OIDC', default: false }],
    derived: [],
    rules: [{ when: 'oidcEnabled', hide: { nodes: PROTOTYPE_NAMED_IDS, edges: [] } }],
    warnings: [],
  };
  const state = { oidcEnabled: true };
  const nodeResult = nodeEvaluateSpec(spec, state);
  const browserResult = browserEvaluateSpec(spec, state);
  const expected = [...PROTOTYPE_NAMED_IDS].sort();
  // Before the fix, the ES5 side's `hiddenNodes`/`hiddenNodesList` dedup set
  // was a plain `{}`: `addNode`'s `if (!set[id])` guard saw every one of
  // these ids as "already present" via Object.prototype (or, for
  // `__proto__`, via its special accessor) and never pushed them onto the
  // list — hiddenNodesList would have come back empty instead of containing
  // all five ids.
  assert.deepEqual([...nodeResult.hiddenNodes].sort(), expected);
  assert.deepEqual([...browserResult.hiddenNodes].sort(), expected);
});

test('an undeclared prototype-named identifier is rejected by both evaluators, not silently treated as known', () => {
  const browserEvaluateSpec = loadBrowserEvaluateSpec();
  const spec = {
    fields: [{ id: 'oidcEnabled', type: 'checkbox', label: 'OIDC', default: false }],
    derived: [],
    // `toString` is never declared as a field or derived id, so referencing
    // it in a rule's `when` must be rejected as an unknown identifier by
    // compileExpr's `knownIds` lookup.
    rules: [{ when: 'toString', hide: { nodes: ['x'], edges: [] } }],
    warnings: [],
  };
  const state = { oidcEnabled: true };
  // Before the fix, the ES5 side's `declaredIds` was a plain `{}`:
  // `knownIds['toString']` resolved truthily via inherited
  // Object.prototype.toString even though `toString` was never declared,
  // so `compileExpr` never threw and the undeclared-identifier check was
  // silently defeated for this one identifier name.
  assert.throws(() => nodeEvaluateSpec(spec, state), /Unknown identifier/);
  assert.throws(() => browserEvaluateSpec(spec, state), /Unknown identifier/);
});
