import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateSpec, defaultFieldValues, validateConfigView } from '../renderers/architecture/config-view.mjs';

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

test('evaluateSpec hides nodes/edges when the rule fires', () => {
  const result = evaluateSpec(SPEC, defaultFieldValues(SPEC));
  assert.ok(result.hiddenNodes.has('ui_task'));
  assert.ok(result.hiddenEdges.has('alb>ui_task'));
});

test('evaluateSpec handles a string-literal comparison without a false unknown-identifier error', () => {
  const result = evaluateSpec(SPEC, { oidcEnabled: false, modelProvider: 'saip' });
  assert.equal(result.warnings.length, 1);
});

test('validateConfigView throws on an unknown node id', () => {
  const bad = { ...SPEC, rules: [{ when: 'noAuth', hide: { nodes: ['does_not_exist'] } }] };
  assert.throws(
    () => validateConfigView(bad, new Set(['alb', 'ui_task']), new Set(['alb>ui_task'])),
    /does_not_exist/
  );
});

test('validateConfigView throws on an unknown edge', () => {
  const bad = { ...SPEC, rules: [{ when: 'noAuth', hide: { edges: [['alb', 'nowhere']] } }] };
  assert.throws(
    () => validateConfigView(bad, new Set(['alb', 'ui_task']), new Set(['alb>ui_task'])),
    /alb.*nowhere|nowhere.*alb/
  );
});

test('validateConfigView throws on an undeclared identifier in a rule "when"', () => {
  const bad = { ...SPEC, rules: [{ when: 'typoField', hide: { nodes: ['ui_task'] } }] };
  assert.throws(
    () => validateConfigView(bad, new Set(['alb', 'ui_task']), new Set(['alb>ui_task'])),
    /typoField/
  );
});

test('validateConfigView passes for the well-formed SPEC', () => {
  assert.doesNotThrow(() => validateConfigView(SPEC, new Set(['alb', 'ui_task']), new Set(['alb>ui_task'])));
});
