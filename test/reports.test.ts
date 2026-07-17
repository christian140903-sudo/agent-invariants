import test from 'node:test';
import assert from 'node:assert/strict';
import { checkTrace, compareTraces } from '../src/evaluator.js';
import { renderCheckReport, renderCompatibilityReport } from '../src/reports.js';

const contract = { version: 1, name: 'reports', rules: [{ id: 'no-shell', kind: 'deny_tool', tool: 'shell.*' }] };
const failed = checkTrace(contract, [{ seq: 1, type: 'tool.call', tool: 'shell.delete' }]);

test('pretty report puts the outcome first', () => {
  const text = renderCheckReport(failed, 'pretty');
  assert.match(text, /^FAIL  reports/);
  assert.match(text, /no-shell/);
});

test('JSON report preserves the stable schema identifier', () => {
  const parsed = JSON.parse(renderCheckReport(failed, 'json')) as { schema: string };
  assert.equal(parsed.schema, 'agent-invariants/check/v1');
});

test('JUnit report emits failures for error violations', () => {
  const text = renderCheckReport(failed, 'junit');
  assert.match(text, /testsuite/);
  assert.match(text, /failures="1"/);
  assert.match(text, /shell.delete/);
});

test('SARIF report maps event index to trace line', () => {
  const sarif = JSON.parse(renderCheckReport(failed, 'sarif', 'fixture.jsonl')) as any;
  assert.equal(sarif.version, '2.1.0');
  assert.equal(sarif.runs[0].results[0].locations[0].physicalLocation.region.startLine, 1);
  assert.equal(sarif.runs[0].results[0].locations[0].physicalLocation.artifactLocation.uri, 'fixture.jsonl');
});

test('compatibility reports render in every supported format', () => {
  const report = compareTraces(contract, [{ seq: 1, type: 'run.start' }], [{ seq: 1, type: 'tool.call', tool: 'shell.delete' }]);
  assert.match(renderCompatibilityReport(report, 'pretty'), /^REGRESSION/);
  assert.equal(JSON.parse(renderCompatibilityReport(report, 'json')).schema, 'agent-invariants/compare/v1');
  assert.match(renderCompatibilityReport(report, 'junit'), /failure/);
  assert.equal(JSON.parse(renderCompatibilityReport(report, 'sarif')).version, '2.1.0');
});
