import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const entry = fileURLToPath(new URL('../src/index.js', import.meta.url));

function run(args: string[]) {
  return spawnSync(process.execPath, [entry, ...args], { encoding: 'utf8', timeout: 10_000 });
}

test('CLI reports help and version', () => {
  const help = run(['help']);
  const version = run(['--version']);
  assert.equal(help.status, 0);
  assert.match(help.stdout, /deterministic behavior contracts/);
  assert.equal(version.stdout.trim(), '0.1.0');
});

test('CLI init creates a passing runnable example without overwriting', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'agent-invariants-init-'));
  const initialized = run(['init', dir]);
  assert.equal(initialized.status, 0, initialized.stderr);
  const checked = run(['check', '--contract', join(dir, 'agent-invariants.json'), '--trace', join(dir, 'agent-trace.jsonl'), '--format', 'json']);
  assert.equal(checked.status, 0, checked.stderr);
  assert.equal(JSON.parse(checked.stdout).passed, true);
  const second = run(['init', dir]);
  assert.equal(second.status, 2);
  assert.match(second.stderr, /Refusing to overwrite/);
});

test('CLI returns exit 1 for a behavior violation and writes JUnit', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'agent-invariants-cli-'));
  const contractPath = join(dir, 'contract.json');
  const tracePath = join(dir, 'trace.jsonl');
  const outputPath = join(dir, 'report.xml');
  await writeFile(contractPath, JSON.stringify({ version: 1, name: 'cli', rules: [{ id: 'no-shell', kind: 'deny_tool', tool: 'shell.*' }] }));
  await writeFile(tracePath, '{"seq":1,"type":"tool.call","tool":"shell.delete"}\n');
  const checked = run(['check', '--contract', contractPath, '--trace', tracePath, '--format', 'junit', '--output', outputPath]);
  assert.equal(checked.status, 1, checked.stderr);
  assert.match(await readFile(outputPath, 'utf8'), /failure/);
});

test('CLI compare identifies a newly introduced tool', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'agent-invariants-compare-'));
  const contractPath = join(dir, 'contract.json');
  const baseline = join(dir, 'baseline.jsonl');
  const candidate = join(dir, 'candidate.jsonl');
  await writeFile(contractPath, JSON.stringify({ version: 1, name: 'compare', rules: [{ id: 'start', kind: 'require_event', match: { type: 'run.start' } }] }));
  await writeFile(baseline, '{"seq":1,"type":"run.start"}\n');
  await writeFile(candidate, '{"seq":1,"type":"run.start"}\n{"seq":2,"type":"tool.call","tool":"new.tool"}\n');
  const result = run(['compare', '--contract', contractPath, '--baseline', baseline, '--candidate', candidate]);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /Candidate introduced tool/);
});

test('CLI rejects unknown commands and unsupported formats', () => {
  assert.equal(run(['does-not-exist']).status, 2);
  const result = run(['check', '--format', 'html']);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /--format/);
});
