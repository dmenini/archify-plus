import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { threatModelDiagnostics, validateEngineeringProfile } from '../renderers/shared/engineering-profiles.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const skillRoot = path.resolve(__dirname, '..');
const cli = path.join(skillRoot, 'bin', 'archify.mjs');

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function baseDiagram() {
  return {
    schema_version: 1,
    diagram_type: 'architecture',
    meta: { title: 'TM', output: 'out.html', engineering_profile: 'threat-model' },
    components: [
      { id: 'browser', type: 'external', label: 'Browser' },
      { id: 'alb', type: 'cloud', label: 'ALB' },
    ],
    connections: [{ from: 'browser', to: 'alb', label: 'HTTPS' }],
    crossings: [{
      id: 'TB-1',
      label: 'Internet -> ALB',
      members: { edges: [['browser', 'alb']] },
      rows: [{ category: 'spoofing', status: 'open', severity: 'medium', rating: 4.0 }],
    }],
  };
}

test('a well-formed threat-model diagram has no diagnostics and does not throw', () => {
  const diagram = baseDiagram();
  assert.deepEqual(threatModelDiagnostics(diagram), []);
  assert.doesNotThrow(() => validateEngineeringProfile('architecture', diagram));
});

test('threat-model profile requires at least one crossing', () => {
  const diagram = baseDiagram();
  diagram.crossings = [];
  const diagnostics = threatModelDiagnostics(diagram);
  assert.ok(diagnostics.some((entry) => entry.code === 'engineering/threat-model-no-crossings'));
});

test('threat-model profile rejects a duplicate crossing id', () => {
  const diagram = baseDiagram();
  diagram.components.push({ id: 'db', type: 'database', label: 'DB' });
  diagram.connections.push({ from: 'alb', to: 'db', label: 'SQL' });
  diagram.crossings.push({
    id: 'TB-1',
    label: 'duplicate',
    members: { edges: [['alb', 'db']] },
    rows: [{ category: 'tampering', status: 'open' }],
  });
  const diagnostics = threatModelDiagnostics(diagram);
  assert.ok(diagnostics.some((entry) => entry.code === 'engineering/threat-model-duplicate-id'
    && entry.subject.index === 1));
});

test('threat-model profile rejects an unresolvable node/edge reference', () => {
  const diagram = baseDiagram();
  diagram.crossings[0].members = { nodes: ['does_not_exist'], edges: [['browser', 'nope']] };
  const diagnostics = threatModelDiagnostics(diagram);
  const entry = diagnostics.find((d) => d.code === 'engineering/threat-model-unknown-member');
  assert.ok(entry);
  assert.deepEqual(entry.evidence.unknownNodes, ['does_not_exist']);
  assert.deepEqual(entry.evidence.unknownEdges, ['browser>nope']);
});

test('a diagram with crossings but no threat-model profile is never checked (visual-only use)', () => {
  const diagram = baseDiagram();
  delete diagram.meta.engineering_profile;
  diagram.crossings[0].members = { nodes: ['does_not_exist'] };
  assert.doesNotThrow(() => validateEngineeringProfile('architecture', diagram));
});

test('other diagram modes reject the architecture-only threat-model profile', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'archify-threat-model-schema-'));
  try {
    const candidate = JSON.parse(fs.readFileSync(path.join(skillRoot, 'examples', 'agent-tool-call.workflow.json'), 'utf8'));
    candidate.meta.engineering_profile = 'threat-model';
    const input = path.join(tmp, 'workflow.json');
    fs.writeFileSync(input, JSON.stringify(candidate));
    const result = spawnSync(process.execPath, [cli, 'validate', 'workflow', input, '--json'], { cwd: tmp, encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    const receipt = JSON.parse(result.stdout);
    assert.ok(receipt.diagnostics.some((diagnostic) => diagnostic.code === 'schema/additionalProperties'));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('validate surfaces an unresolvable crossing member as a real failure, not a silent pass', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'archify-threat-model-validate-'));
  try {
    const diagram = baseDiagram();
    diagram.crossings[0].members = { edges: [['browser', 'does_not_exist']] };
    const input = path.join(tmp, 'bad.architecture.json');
    fs.writeFileSync(input, JSON.stringify(diagram));
    const result = spawnSync(process.execPath, [cli, 'validate', 'architecture', input, '--json'], { cwd: tmp, encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    const receipt = JSON.parse(result.stdout);
    assert.ok(receipt.diagnostics.some((d) => d.code === 'engineering/threat-model-unknown-member'));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
