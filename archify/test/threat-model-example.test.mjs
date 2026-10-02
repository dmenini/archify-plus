import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const skillRoot = path.resolve(__dirname, '..');
const cli = path.join(skillRoot, 'bin', 'archify.mjs');
const examplePath = path.join(skillRoot, 'examples', 'threat-model-checkout.architecture.json');

test('the threat-model example diagram exists and declares the profile', () => {
  const example = JSON.parse(fs.readFileSync(examplePath, 'utf8'));
  assert.equal(example.meta.engineering_profile, 'threat-model');
  assert.ok(Array.isArray(example.crossings) && example.crossings.length >= 2);
});

test('the threat-model example passes finalize at showcase quality', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'archify-threat-model-example-'));
  try {
    const output = path.join(tmp, 'threat-model-checkout.html');
    const result = spawnSync(process.execPath, [
      cli, 'finalize', 'architecture', examplePath, output, '--quality', 'showcase', '--json',
    ], { cwd: tmp, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const receipt = JSON.parse(result.stdout);
    assert.equal(receipt.ok, true);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
