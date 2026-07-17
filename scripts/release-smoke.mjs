import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const project = resolve(fileURLToPath(new URL('..', import.meta.url)));
const scratch = mkdtempSync(join(tmpdir(), 'agent-invariants-pack-'));
try {
  const packed = execFileSync('npm', ['pack', '--json'], { cwd: project, encoding: 'utf8' });
  const pack = JSON.parse(packed)[0];
  assert.equal(pack.name, 'agent-invariants');
  assert.ok(pack.files.some((file) => file.path === 'dist/src/index.js'));
  assert.ok(pack.files.some((file) => file.path === 'README.md'));
  assert.equal(pack.files.some((file) => file.path.includes('test/')), false);
  const tarball = join(project, pack.filename);
  execFileSync('npm', ['init', '-y'], { cwd: scratch, stdio: 'ignore' });
  execFileSync('npm', ['install', '--ignore-scripts', tarball], { cwd: scratch, stdio: 'ignore' });
  const cli = join(scratch, 'node_modules', '.bin', 'agent-invariants');
  const version = spawnSync(cli, ['--version'], { cwd: scratch, encoding: 'utf8', timeout: 10_000 });
  assert.equal(version.status, 0, version.stderr);
  assert.equal(version.stdout.trim(), '0.1.0');
  rmSync(tarball);
  process.stdout.write(`Package smoke passed: ${pack.entryCount} files, ${pack.unpackedSize} bytes unpacked.\n`);
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
