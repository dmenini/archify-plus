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
