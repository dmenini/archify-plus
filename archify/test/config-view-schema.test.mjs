import test from 'node:test';
import assert from 'node:assert/strict';
import { architecture } from '../renderers/shared/generated-validators.mjs';

function baseArchitecture(configView) {
  return {
    schema_version: 1,
    diagram_type: 'architecture',
    meta: { title: 'Config View Schema Test', output: 'out.html', ...(configView ? { configView } : {}) },
    components: [{ id: 'a', type: 'backend', label: 'A' }],
    connections: [],
  };
}

test('a well-formed configView is accepted', () => {
  const data = baseArchitecture({
    fields: [{ id: 'flag', type: 'checkbox', label: 'Flag', default: false }],
    rules: [{ when: '!flag', hide: { nodes: ['a'] } }],
  });
  const isValid = architecture(data);
  assert.ok(isValid, `Expected validation to pass, but got errors: ${JSON.stringify(architecture.errors)}`);
  assert.equal(architecture.errors, null);
});

test('a field id that is not a valid identifier is rejected', () => {
  const data = baseArchitecture({
    fields: [{ id: 'not a valid id', type: 'checkbox', label: 'Flag' }],
  });
  const isValid = architecture(data);
  assert.ok(!isValid && architecture.errors && architecture.errors.length > 0);
});

test('a field missing "label" is rejected', () => {
  const data = baseArchitecture({
    fields: [{ id: 'flag', type: 'checkbox' }],
  });
  const isValid = architecture(data);
  assert.ok(!isValid && architecture.errors && architecture.errors.length > 0);
});

test('an edge entry with the wrong shape (not a two-item array) is rejected', () => {
  const data = baseArchitecture({
    fields: [{ id: 'flag', type: 'checkbox', label: 'Flag' }],
    rules: [{ when: 'flag', hide: { edges: [['a']] } }],
  });
  const isValid = architecture(data);
  assert.ok(!isValid && architecture.errors && architecture.errors.length > 0);
});

test('a select field with no "options" key is rejected', () => {
  const data = baseArchitecture({
    fields: [{ id: 'mode', type: 'select', label: 'Mode' }],
  });
  const isValid = architecture(data);
  assert.ok(!isValid && architecture.errors && architecture.errors.length > 0);
});

test('a select field with an empty "options" array is rejected', () => {
  const data = baseArchitecture({
    fields: [{ id: 'mode', type: 'select', label: 'Mode', options: [] }],
  });
  const isValid = architecture(data);
  assert.ok(!isValid && architecture.errors && architecture.errors.length > 0);
});

test('"radio" is no longer a valid field type', () => {
  const data = baseArchitecture({
    fields: [{ id: 'mode', type: 'radio', label: 'Mode', options: [{ value: 'a', label: 'A' }] }],
  });
  const isValid = architecture(data);
  assert.ok(!isValid && architecture.errors && architecture.errors.length > 0);
});

test('a diagram with no configView at all is still accepted (backward compatible)', () => {
  const data = baseArchitecture(null);
  const isValid = architecture(data);
  assert.ok(isValid, `Expected validation to pass for backward compatibility, but got errors: ${JSON.stringify(architecture.errors)}`);
  assert.equal(architecture.errors, null);
});
