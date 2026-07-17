import test from 'node:test';
import assert from 'node:assert/strict';
import { invariantContractSchema } from '../src/schemas.js';
import { parseTraceText } from '../src/parser.js';
import { globMatch } from '../src/glob.js';

test('contract rejects duplicate rule IDs', () => {
  assert.throws(() => invariantContractSchema.parse({
    version: 1,
    name: 'duplicate',
    rules: [
      { id: 'same', kind: 'deny_tool', tool: 'a' },
      { id: 'same', kind: 'deny_tool', tool: 'b' },
    ],
  }), /Duplicate rule id/);
});

test('event budgets require at least one bound', () => {
  assert.throws(() => invariantContractSchema.parse({ version: 1, name: 'budget', rules: [{ id: 'b', kind: 'event_budget' }] }), /Set at least one budget/);
});

test('require_event rejects min greater than max', () => {
  assert.throws(() => invariantContractSchema.parse({
    version: 1, name: 'range', rules: [{ id: 'r', kind: 'require_event', match: { type: 'x' }, min: 2, max: 1 }],
  }), /min cannot exceed max/);
});

test('parser accepts JSON arrays and JSONL with comments and blank lines', () => {
  const array = parseTraceText(JSON.stringify([{ seq: 1, type: 'run.start' }]));
  const lines = parseTraceText('# trace\n\n{"seq":1,"type":"run.start"}\n{"seq":2,"type":"run.completed"}\n');
  assert.equal(array.length, 1);
  assert.equal(lines.length, 2);
});

test('parser reports a malformed JSONL line', () => {
  assert.throws(() => parseTraceText('{"seq":1,"type":"ok"}\nnot-json'), /line 2/);
});

test('parser rejects duplicate or decreasing sequence numbers', () => {
  assert.throws(() => parseTraceText('{"seq":2,"type":"a"}\n{"seq":1,"type":"b"}'), /strictly increasing/);
});

test('glob matching treats wildcards as wildcards and punctuation literally', () => {
  assert.equal(globMatch('payments.*', 'payments.refund'), true);
  assert.equal(globMatch('tool.?', 'tool.x'), true);
  assert.equal(globMatch('tool.?', 'tool.xy'), false);
  assert.equal(globMatch('a+b', 'a+b'), true);
  assert.equal(globMatch('a+b', 'ab'), false);
});
