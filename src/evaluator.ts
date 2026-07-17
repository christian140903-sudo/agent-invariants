import { invariantContractSchema, traceSchema } from './schemas.js';
import { globMatch } from './glob.js';
import type {
  AgentEvent,
  CheckReport,
  CompatibilityRegression,
  CompatibilityReport,
  EventMatcher,
  InvariantContract,
  InvariantRule,
  RuleResult,
  Severity,
  TraceSummary,
  Violation,
} from './types.js';

function matches(event: AgentEvent, matcher: EventMatcher): boolean {
  if (matcher.type !== undefined && !globMatch(matcher.type, event.type)) return false;
  if (matcher.tool !== undefined && !globMatch(matcher.tool, event.tool)) return false;
  if (matcher.ok !== undefined && matcher.ok !== event.ok) return false;
  if (matcher.outcome_id !== undefined && !globMatch(matcher.outcome_id, event.outcome_id)) return false;
  if (matcher.verdict !== undefined && matcher.verdict !== event.verdict) return false;
  if (matcher.claims_completion !== undefined && matcher.claims_completion !== event.claims_completion) return false;
  return true;
}

function severity(rule: InvariantRule): Severity {
  return rule.severity ?? 'error';
}

function findLastBefore(events: AgentEvent[], end: number, predicate: (event: AgentEvent) => boolean): AgentEvent | undefined {
  for (let index = end - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event && predicate(event)) return event;
  }
  return undefined;
}

function violation(rule: InvariantRule, message: string, event?: AgentEvent, eventIndex?: number, evidence?: Record<string, unknown>): Violation {
  return {
    rule_id: rule.id,
    rule_kind: rule.kind,
    severity: severity(rule),
    message,
    ...(event ? { event_seq: event.seq } : {}),
    ...(eventIndex !== undefined ? { event_index: eventIndex } : {}),
    ...(evidence ? { evidence } : {}),
  };
}

function outcomeSatisfies(rule: Extract<InvariantRule, { kind: 'completion_requires_outcome' | 'confidence_requires_outcome' }>, event: AgentEvent): boolean {
  if (event.type !== 'outcome.observed' || event.verdict !== 'satisfied') return false;
  if (rule.kind === 'completion_requires_outcome' && rule.outcome_id && !globMatch(rule.outcome_id, event.outcome_id)) return false;
  const allowed = rule.evidence_classes ?? ['externally_observed', 'configured_verifier'];
  return event.evidence_class !== undefined && allowed.includes(event.evidence_class);
}

function evaluateRule(rule: InvariantRule, events: AgentEvent[]): RuleResult {
  const violations: Violation[] = [];
  let checked = 0;

  switch (rule.kind) {
    case 'deny_tool':
      events.forEach((event, index) => {
        if (event.type === 'tool.call' && globMatch(rule.tool, event.tool)) {
          checked += 1;
          violations.push(violation(rule, `Denied tool called: ${event.tool ?? 'unknown'}.`, event, index, { tool: event.tool }));
        }
      });
      break;

    case 'allow_tools':
      events.forEach((event, index) => {
        if (event.type !== 'tool.call') return;
        checked += 1;
        if (!rule.tools.some((pattern) => globMatch(pattern, event.tool))) {
          violations.push(violation(rule, `Tool is outside the allowlist: ${event.tool ?? 'unknown'}.`, event, index, { tool: event.tool, allowed: rule.tools }));
        }
      });
      break;

    case 'require_approval':
      events.forEach((event, index) => {
        if (event.type !== 'tool.call' || !globMatch(rule.tool, event.tool)) return;
        checked += 1;
        const start = Math.max(0, index - (rule.within_events ?? index));
        let grant: AgentEvent | undefined;
        for (let grantIndex = index - 1; grantIndex >= start; grantIndex -= 1) {
          const candidate = events[grantIndex];
          if (!candidate) continue;
          if (candidate.type !== 'approval.granted' || candidate.approved === false) continue;
          const idMatches = event.approval_id ? candidate.approval_id === event.approval_id : true;
          const scopeMatches = rule.scope ? globMatch(rule.scope, candidate.approval_scope) : true;
          const candidateMatches = idMatches && scopeMatches;
          if (candidateMatches) {
            grant = candidate;
            break;
          }
        }
        if (!grant) {
          violations.push(violation(rule, `Tool ${event.tool ?? 'unknown'} was called without a matching prior approval.`, event, index, {
            tool: event.tool,
            approval_id: event.approval_id,
            required_scope: rule.scope,
            within_events: rule.within_events,
          }));
        }
      });
      break;

    case 'stop_is_final': {
      const stopType = rule.stop_type ?? 'control.stop';
      const allowed = rule.allowed_after ?? ['run.completed', 'run.failed', 'telemetry.*'];
      events.forEach((event, index) => {
        if (!globMatch(stopType, event.type)) return;
        checked += 1;
        events.slice(index + 1).forEach((later, offset) => {
          if (!allowed.some((pattern) => globMatch(pattern, later.type))) {
            violations.push(violation(rule, `Event ${later.type} occurred after stop event ${event.type}.`, later, index + 1 + offset, {
              stop_seq: event.seq,
              allowed_after: allowed,
            }));
          }
        });
      });
      break;
    }

    case 'completion_requires_outcome': {
      const completionTypes = rule.completion_types ?? ['run.completed'];
      events.forEach((event, index) => {
        const completion = event.claims_completion === true || completionTypes.some((pattern) => globMatch(pattern, event.type));
        if (!completion) return;
        checked += 1;
        const observed = findLastBefore(events, index, (candidate) => outcomeSatisfies(rule, candidate));
        if (!observed) {
          violations.push(violation(rule, 'Completion was claimed without a prior satisfied outcome from an allowed evidence class.', event, index, {
            outcome_id: rule.outcome_id,
            evidence_classes: rule.evidence_classes ?? ['externally_observed', 'configured_verifier'],
          }));
        }
      });
      break;
    }

    case 'retry_limit': {
      const groups = new Map<string, Array<{ event: AgentEvent; index: number }>>();
      events.forEach((event, index) => {
        if (event.type !== 'tool.call' || !globMatch(rule.tool ?? '*', event.tool)) return;
        checked += 1;
        const key = rule.group_by === 'tool' ? (event.tool ?? '<unknown>') : (event.call_signature ?? event.tool ?? '<unknown>');
        const group = groups.get(key) ?? [];
        group.push({ event, index });
        groups.set(key, group);
      });
      for (const [key, group] of groups) {
        if (group.length <= rule.max_attempts) continue;
        const firstExcess = group[rule.max_attempts];
        violations.push(violation(rule, `Retry group ${key} ran ${group.length} times; maximum is ${rule.max_attempts}.`, firstExcess?.event, firstExcess?.index, {
          group: key,
          attempts: group.length,
          max_attempts: rule.max_attempts,
        }));
      }
      break;
    }

    case 'event_budget': {
      const toolCalls = events.filter((event) => event.type === 'tool.call').length;
      const toolFailures = events.filter((event) => event.type === 'tool.result' && event.ok === false).length;
      checked = events.length;
      if (rule.max_events !== undefined && events.length > rule.max_events) {
        violations.push(violation(rule, `Trace has ${events.length} events; maximum is ${rule.max_events}.`, undefined, undefined, { actual: events.length, maximum: rule.max_events, metric: 'events' }));
      }
      if (rule.max_tool_calls !== undefined && toolCalls > rule.max_tool_calls) {
        violations.push(violation(rule, `Trace has ${toolCalls} tool calls; maximum is ${rule.max_tool_calls}.`, undefined, undefined, { actual: toolCalls, maximum: rule.max_tool_calls, metric: 'tool_calls' }));
      }
      if (rule.max_tool_failures !== undefined && toolFailures > rule.max_tool_failures) {
        violations.push(violation(rule, `Trace has ${toolFailures} tool failures; maximum is ${rule.max_tool_failures}.`, undefined, undefined, { actual: toolFailures, maximum: rule.max_tool_failures, metric: 'tool_failures' }));
      }
      break;
    }

    case 'require_order':
      events.forEach((event, index) => {
        if (!matches(event, rule.after)) return;
        checked += 1;
        if (!events.slice(0, index).some((candidate) => matches(candidate, rule.before))) {
          violations.push(violation(rule, `Required predecessor was missing before ${event.type}.`, event, index, { before: rule.before, after: rule.after }));
        }
      });
      break;

    case 'require_event': {
      const found = events.filter((event) => matches(event, rule.match));
      checked = found.length;
      const min = rule.min ?? 1;
      const max = rule.max ?? Number.MAX_SAFE_INTEGER;
      if (found.length < min || found.length > max) {
        violations.push(violation(rule, `Expected ${min}..${max === Number.MAX_SAFE_INTEGER ? '∞' : max} matching events; found ${found.length}.`, found[0], found[0] ? events.indexOf(found[0]) : undefined, { match: rule.match, found: found.length, min, max: max === Number.MAX_SAFE_INTEGER ? null : max }));
      }
      break;
    }

    case 'deny_event':
      events.forEach((event, index) => {
        if (!matches(event, rule.match)) return;
        checked += 1;
        violations.push(violation(rule, `Denied event matched: ${event.type}.`, event, index, { match: rule.match }));
      });
      break;

    case 'tool_result_required': {
      const results = new Map<string, number>();
      events.forEach((event, index) => {
        if (event.type === 'tool.result' && event.call_id) results.set(event.call_id, index);
      });
      events.forEach((event, index) => {
        if (event.type !== 'tool.call' || !globMatch(rule.tool ?? '*', event.tool)) return;
        checked += 1;
        const resultIndex = event.call_id ? results.get(event.call_id) : undefined;
        if (!event.call_id || resultIndex === undefined || resultIndex <= index) {
          violations.push(violation(rule, `Tool call ${event.call_id ?? '<missing call_id>'} has no later matching tool.result.`, event, index, { tool: event.tool, call_id: event.call_id }));
        }
      });
      break;
    }

    case 'confidence_requires_outcome':
      events.forEach((event, index) => {
        if (event.claims_completion !== true || event.confidence === undefined || event.confidence < rule.threshold) return;
        checked += 1;
        const observed = findLastBefore(events, index, (candidate) => outcomeSatisfies(rule, candidate));
        if (!observed) {
          violations.push(violation(rule, `Completion confidence ${event.confidence} met threshold ${rule.threshold} without prior qualifying outcome evidence.`, event, index, {
            confidence: event.confidence,
            threshold: rule.threshold,
            evidence_classes: rule.evidence_classes ?? ['externally_observed', 'configured_verifier'],
          }));
        }
      });
      break;
  }

  return {
    rule_id: rule.id,
    rule_kind: rule.kind,
    passed: violations.length === 0,
    severity: severity(rule),
    checked,
    violations,
  };
}

export function summarizeTrace(eventsInput: unknown): TraceSummary {
  const events = traceSchema.parse(eventsInput) as AgentEvent[];
  const tools = [...new Set(events.filter((event) => event.type === 'tool.call' && event.tool).map((event) => event.tool as string))].sort();
  const outcomes = events.filter((event) => event.type === 'outcome.observed');
  return {
    events: events.length,
    tool_calls: events.filter((event) => event.type === 'tool.call').length,
    tool_failures: events.filter((event) => event.type === 'tool.result' && event.ok === false).length,
    tools,
    approvals_granted: events.filter((event) => event.type === 'approval.granted' && event.approved !== false).length,
    outcomes_satisfied: outcomes.filter((event) => event.verdict === 'satisfied').length,
    outcomes_violated: outcomes.filter((event) => event.verdict === 'violated').length,
    completion_claims: events.filter((event) => event.claims_completion === true || event.type === 'run.completed').length,
    final_outcome: outcomes.at(-1)?.verdict ?? null,
  };
}

export function checkTrace(contractInput: unknown, eventsInput: unknown): CheckReport {
  const contract = invariantContractSchema.parse(contractInput) as InvariantContract;
  const events = traceSchema.parse(eventsInput) as AgentEvent[];
  let previous = -1;
  for (const event of events) {
    if (event.seq <= previous) throw new Error(`Trace sequence must be strictly increasing; found ${event.seq} after ${previous}.`);
    previous = event.seq;
  }
  const results = contract.rules.map((rule) => evaluateRule(rule, events));
  const violations = results.flatMap((result) => result.violations);
  const errorCount = violations.filter((item) => item.severity === 'error').length;
  const warningCount = violations.filter((item) => item.severity === 'warning').length;
  return {
    schema: 'agent-invariants/check/v1',
    contract: { name: contract.name, version: contract.version },
    passed: errorCount === 0,
    error_count: errorCount,
    warning_count: warningCount,
    summary: summarizeTrace(events),
    results,
    violations,
  };
}

const outcomeRank: Record<string, number> = { violated: 0, retracted: 1, unknown: 2, satisfied: 3 };

export function compareTraces(contractInput: unknown, baselineInput: unknown, candidateInput: unknown): CompatibilityReport {
  const contract = invariantContractSchema.parse(contractInput) as InvariantContract;
  const baseline = checkTrace(contract, baselineInput);
  const candidate = checkTrace(contract, candidateInput);
  const policy = {
    fail_on_new_tools: contract.compare?.fail_on_new_tools ?? true,
    fail_on_new_violations: contract.compare?.fail_on_new_violations ?? true,
    require_same_outcome_or_better: contract.compare?.require_same_outcome_or_better ?? true,
    max_tool_call_increase_percent: contract.compare?.max_tool_call_increase_percent,
  };
  const regressions: CompatibilityRegression[] = [];

  const baselineFailures = new Set(baseline.results.filter((result) => !result.passed).map((result) => result.rule_id));
  const candidateFailures = candidate.results.filter((result) => !result.passed && result.severity === 'error');
  if (policy.fail_on_new_violations) {
    candidateFailures.filter((result) => !baselineFailures.has(result.rule_id)).forEach((result) => {
      regressions.push({
        kind: 'new_rule_failure',
        severity: result.severity,
        message: `Rule newly fails in candidate: ${result.rule_id}.`,
        evidence: { rule_id: result.rule_id, rule_kind: result.rule_kind, violations: result.violations.length },
      });
    });
  }
  candidateFailures.filter((result) => baselineFailures.has(result.rule_id) || !policy.fail_on_new_violations).forEach((result) => {
    regressions.push({
      kind: 'contract_violation',
      severity: 'error',
      message: `Candidate still violates contract rule: ${result.rule_id}.`,
      evidence: { rule_id: result.rule_id, rule_kind: result.rule_kind, violations: result.violations.length, baseline_also_failed: baselineFailures.has(result.rule_id) },
    });
  });

  if (policy.fail_on_new_tools) {
    const baselineTools = new Set(baseline.summary.tools);
    candidate.summary.tools.filter((tool) => !baselineTools.has(tool)).forEach((tool) => {
      regressions.push({ kind: 'new_tool', severity: 'error', message: `Candidate introduced tool: ${tool}.`, evidence: { tool } });
    });
  }

  if (policy.max_tool_call_increase_percent !== undefined) {
    const base = baseline.summary.tool_calls;
    const increase = base === 0 ? (candidate.summary.tool_calls === 0 ? 0 : Number.POSITIVE_INFINITY) : ((candidate.summary.tool_calls - base) / base) * 100;
    if (increase > policy.max_tool_call_increase_percent) {
      regressions.push({
        kind: 'tool_call_increase',
        severity: 'error',
        message: `Tool calls increased by ${Number.isFinite(increase) ? increase.toFixed(1) : '∞'}%; allowed ${policy.max_tool_call_increase_percent}%.`,
        evidence: { baseline: base, candidate: candidate.summary.tool_calls, increase_percent: Number.isFinite(increase) ? increase : null },
      });
    }
  }

  if (policy.require_same_outcome_or_better) {
    const baselineRank = baseline.summary.final_outcome ? outcomeRank[baseline.summary.final_outcome] ?? -1 : -1;
    const candidateRank = candidate.summary.final_outcome ? outcomeRank[candidate.summary.final_outcome] ?? -1 : -1;
    if (candidateRank < baselineRank) {
      regressions.push({
        kind: 'outcome_regression',
        severity: 'error',
        message: `Final outcome regressed from ${baseline.summary.final_outcome ?? 'none'} to ${candidate.summary.final_outcome ?? 'none'}.`,
        evidence: { baseline: baseline.summary.final_outcome, candidate: candidate.summary.final_outcome },
      });
    }
  }

  return {
    schema: 'agent-invariants/compare/v1',
    contract: { name: contract.name, version: contract.version },
    compatible: regressions.every((regression) => regression.severity !== 'error'),
    baseline,
    candidate,
    regressions,
  };
}
