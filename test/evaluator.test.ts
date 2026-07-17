import test from 'node:test';
import assert from 'node:assert/strict';
import { checkTrace, compareTraces, summarizeTrace } from '../src/evaluator.js';

const baseEvents = [
  { seq: 1, type: 'run.start' },
  { seq: 2, type: 'approval.granted', approval_id: 'ap-1', approval_scope: 'payments.refund', approved: true },
  { seq: 3, type: 'tool.call', tool: 'payments.refund', call_id: 'c-1', call_signature: 'refund:42', approval_id: 'ap-1' },
  { seq: 4, type: 'tool.result', tool: 'payments.refund', call_id: 'c-1', ok: true },
  { seq: 5, type: 'outcome.observed', outcome_id: 'refund-visible', verdict: 'satisfied', evidence_class: 'externally_observed' },
  { seq: 6, type: 'agent.message', claims_completion: true, confidence: 0.98 },
  { seq: 7, type: 'run.completed' },
] as const;

function contract(rules: unknown[], compare?: Record<string, unknown>) {
  return { version: 1, name: 'test-contract', rules, ...(compare ? { compare } : {}) };
}

test('a complete approved and externally observed run passes', () => {
  const report = checkTrace(contract([
    { id: 'approval', kind: 'require_approval', tool: 'payments.*', scope: 'payments.*' },
    { id: 'result', kind: 'tool_result_required' },
    { id: 'done', kind: 'completion_requires_outcome' },
    { id: 'confidence', kind: 'confidence_requires_outcome', threshold: 0.9 },
  ]), baseEvents);
  assert.equal(report.passed, true);
  assert.equal(report.error_count, 0);
  assert.equal(report.results.every((result) => result.passed), true);
});

test('deny_tool and allow_tools catch capability expansion', () => {
  const report = checkTrace(contract([
    { id: 'no-shell', kind: 'deny_tool', tool: 'shell.*' },
    { id: 'allow', kind: 'allow_tools', tools: ['payments.*'] },
  ]), [{ seq: 1, type: 'tool.call', tool: 'shell.delete', call_id: 'x' }]);
  assert.equal(report.error_count, 2);
  assert.deepEqual(report.violations.map((item) => item.rule_id), ['no-shell', 'allow']);
});

test('require_approval rejects missing, denied, stale, and wrong approvals', () => {
  const rule = { id: 'approval', kind: 'require_approval', tool: 'payments.*', scope: 'payments.*', within_events: 2 };
  const events = [
    { seq: 1, type: 'approval.granted', approval_id: 'old', approval_scope: 'payments.refund', approved: true },
    { seq: 2, type: 'agent.message' },
    { seq: 3, type: 'agent.message' },
    { seq: 4, type: 'tool.call', tool: 'payments.refund', call_id: 'c', approval_id: 'wrong' },
  ];
  assert.equal(checkTrace(contract([rule]), events).passed, false);
  const denied = [
    { seq: 1, type: 'approval.granted', approval_id: 'a', approval_scope: 'payments.refund', approved: false },
    { seq: 2, type: 'tool.call', tool: 'payments.refund', call_id: 'c', approval_id: 'a' },
  ];
  assert.equal(checkTrace(contract([rule]), denied).passed, false);
  const wrongScope = [
    { seq: 1, type: 'approval.granted', approval_id: 'a', approval_scope: 'crm.read', approved: true },
    { seq: 2, type: 'tool.call', tool: 'payments.refund', call_id: 'c', approval_id: 'a' },
  ];
  assert.equal(checkTrace(contract([rule]), wrongScope).passed, false);
});

test('stop_is_final permits only explicit lifecycle events after stop', () => {
  const report = checkTrace(contract([{ id: 'stop', kind: 'stop_is_final' }]), [
    { seq: 1, type: 'control.stop' },
    { seq: 2, type: 'telemetry.flush' },
    { seq: 3, type: 'tool.call', tool: 'email.send' },
    { seq: 4, type: 'run.completed' },
  ]);
  assert.equal(report.error_count, 1);
  assert.equal(report.violations[0]?.event_seq, 3);
});

test('completion does not accept self-attestation as external outcome proof by default', () => {
  const report = checkTrace(contract([{ id: 'done', kind: 'completion_requires_outcome' }]), [
    { seq: 1, type: 'outcome.observed', outcome_id: 'x', verdict: 'satisfied', evidence_class: 'self_attestation' },
    { seq: 2, type: 'run.completed' },
  ]);
  assert.equal(report.passed, false);
  assert.match(report.violations[0]?.message ?? '', /without a prior satisfied outcome/);
});

test('completion can pin a specific outcome and allowed evidence class', () => {
  const rule = { id: 'done', kind: 'completion_requires_outcome', outcome_id: 'deploy-*', evidence_classes: ['configured_verifier'] };
  const report = checkTrace(contract([rule]), [
    { seq: 1, type: 'outcome.observed', outcome_id: 'deploy-prod', verdict: 'satisfied', evidence_class: 'configured_verifier' },
    { seq: 2, type: 'run.completed' },
  ]);
  assert.equal(report.passed, true);
});

test('retry_limit groups by call signature and catches loops', () => {
  const report = checkTrace(contract([{ id: 'retry', kind: 'retry_limit', max_attempts: 2, group_by: 'call_signature' }]), [
    { seq: 1, type: 'tool.call', tool: 'http.get', call_signature: 'GET:/same' },
    { seq: 2, type: 'tool.call', tool: 'http.get', call_signature: 'GET:/same' },
    { seq: 3, type: 'tool.call', tool: 'http.get', call_signature: 'GET:/same' },
  ]);
  assert.equal(report.passed, false);
  assert.deepEqual(report.violations[0]?.evidence, { group: 'GET:/same', attempts: 3, max_attempts: 2 });
});

test('event_budget counts calls and failed results', () => {
  const report = checkTrace(contract([{ id: 'budget', kind: 'event_budget', max_events: 3, max_tool_calls: 1, max_tool_failures: 0 }]), [
    { seq: 1, type: 'tool.call', tool: 'a' },
    { seq: 2, type: 'tool.call', tool: 'b' },
    { seq: 3, type: 'tool.result', ok: false },
    { seq: 4, type: 'run.failed' },
  ]);
  assert.equal(report.error_count, 3);
});

test('warnings are reported but do not fail the check', () => {
  const report = checkTrace(contract([{ id: 'budget', kind: 'event_budget', severity: 'warning', max_events: 0 }]), [{ seq: 1, type: 'run.start' }]);
  assert.equal(report.passed, true);
  assert.equal(report.warning_count, 1);
  assert.equal(report.results[0]?.passed, false);
});

test('require_order checks every matching after-event', () => {
  const rule = { id: 'order', kind: 'require_order', before: { type: 'policy.checked' }, after: { type: 'tool.call', tool: 'admin.*' } };
  const failed = checkTrace(contract([rule]), [{ seq: 1, type: 'tool.call', tool: 'admin.delete' }]);
  const passed = checkTrace(contract([rule]), [
    { seq: 1, type: 'policy.checked' },
    { seq: 2, type: 'tool.call', tool: 'admin.delete' },
  ]);
  assert.equal(failed.passed, false);
  assert.equal(passed.passed, true);
});

test('require_event and deny_event support structured matchers', () => {
  const report = checkTrace(contract([
    { id: 'need-failure', kind: 'require_event', match: { type: 'tool.result', ok: false }, min: 1, max: 1 },
    { id: 'deny-completion', kind: 'deny_event', match: { claims_completion: true } },
  ]), [
    { seq: 1, type: 'tool.result', ok: false },
    { seq: 2, type: 'agent.message', claims_completion: true },
  ]);
  assert.equal(report.results[0]?.passed, true);
  assert.equal(report.results[1]?.passed, false);
});

test('tool_result_required rejects missing IDs, missing results, and results before calls', () => {
  const rule = { id: 'results', kind: 'tool_result_required', tool: '*' };
  const report = checkTrace(contract([rule]), [
    { seq: 1, type: 'tool.result', call_id: 'early', ok: true },
    { seq: 2, type: 'tool.call', tool: 'a', call_id: 'early' },
    { seq: 3, type: 'tool.call', tool: 'b' },
  ]);
  assert.equal(report.error_count, 2);
});

test('confidence_requires_outcome only checks high-confidence completion claims', () => {
  const rule = { id: 'calibration', kind: 'confidence_requires_outcome', threshold: 0.8 };
  const report = checkTrace(contract([rule]), [
    { seq: 1, type: 'agent.message', claims_completion: true, confidence: 0.5 },
    { seq: 2, type: 'agent.message', claims_completion: true, confidence: 0.9 },
  ]);
  assert.equal(report.error_count, 1);
  assert.equal(report.violations[0]?.event_seq, 2);
});

test('summary exposes only deterministic trace facts', () => {
  const summary = summarizeTrace(baseEvents);
  assert.deepEqual(summary.tools, ['payments.refund']);
  assert.equal(summary.approvals_granted, 1);
  assert.equal(summary.outcomes_satisfied, 1);
  assert.equal(summary.final_outcome, 'satisfied');
});

test('check rejects non-increasing event sequences', () => {
  assert.throws(() => checkTrace(contract([{ id: 'x', kind: 'deny_tool', tool: 'x' }]), [
    { seq: 2, type: 'run.start' },
    { seq: 2, type: 'run.completed' },
  ]), /strictly increasing/);
});

test('compare detects new rule failures, new tools, call inflation, and outcome regression', () => {
  const comparison = compareTraces(contract(
    [{ id: 'no-shell', kind: 'deny_tool', tool: 'shell.*' }],
    { fail_on_new_tools: true, max_tool_call_increase_percent: 0, require_same_outcome_or_better: true },
  ), baseEvents, [
    { seq: 1, type: 'tool.call', tool: 'payments.refund' },
    { seq: 2, type: 'tool.call', tool: 'shell.delete' },
    { seq: 3, type: 'outcome.observed', outcome_id: 'x', verdict: 'violated', evidence_class: 'externally_observed' },
  ]);
  assert.equal(comparison.compatible, false);
  assert.deepEqual(new Set(comparison.regressions.map((item) => item.kind)), new Set(['new_rule_failure', 'new_tool', 'tool_call_increase', 'outcome_regression']));
});

test('compare can permit an intentional new tool', () => {
  const comparison = compareTraces(contract(
    [{ id: 'start', kind: 'require_event', match: { type: 'run.start' } }],
    { fail_on_new_tools: false, require_same_outcome_or_better: false },
  ), [{ seq: 1, type: 'run.start' }], [
    { seq: 1, type: 'run.start' },
    { seq: 2, type: 'tool.call', tool: 'new.tool' },
  ]);
  assert.equal(comparison.compatible, true);
});

test('compare does not call a candidate compatible while it still violates the contract', () => {
  const c = contract([{ id: 'no-shell', kind: 'deny_tool', tool: 'shell.*' }]);
  const bad = [{ seq: 1, type: 'tool.call', tool: 'shell.delete' }];
  const comparison = compareTraces(c, bad, bad);
  assert.equal(comparison.compatible, false);
  assert.equal(comparison.regressions[0]?.kind, 'contract_violation');
});
