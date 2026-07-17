export type Severity = 'warning' | 'error';

export type EvidenceClass =
  | 'externally_observed'
  | 'configured_verifier'
  | 'manual_attestation'
  | 'self_attestation';

export interface AgentEvent {
  seq: number;
  type: string;
  time?: string;
  run_id?: string;
  actor?: string;
  tool?: string;
  call_id?: string;
  call_signature?: string;
  risk?: string;
  approval_id?: string;
  approval_scope?: string;
  approved?: boolean;
  ok?: boolean;
  outcome_id?: string;
  verdict?: 'satisfied' | 'violated' | 'unknown' | 'retracted';
  evidence_class?: EvidenceClass;
  claims_completion?: boolean;
  confidence?: number;
  data?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface EventMatcher {
  type?: string;
  tool?: string;
  ok?: boolean;
  outcome_id?: string;
  verdict?: AgentEvent['verdict'];
  claims_completion?: boolean;
}

export interface RuleBase {
  id: string;
  severity?: Severity;
  description?: string;
}

export type InvariantRule =
  | (RuleBase & { kind: 'deny_tool'; tool: string })
  | (RuleBase & { kind: 'allow_tools'; tools: string[] })
  | (RuleBase & {
      kind: 'require_approval';
      tool: string;
      scope?: string;
      within_events?: number;
    })
  | (RuleBase & {
      kind: 'stop_is_final';
      stop_type?: string;
      allowed_after?: string[];
    })
  | (RuleBase & {
      kind: 'completion_requires_outcome';
      completion_types?: string[];
      outcome_id?: string;
      evidence_classes?: EvidenceClass[];
    })
  | (RuleBase & {
      kind: 'retry_limit';
      tool?: string;
      max_attempts: number;
      group_by?: 'tool' | 'call_signature';
    })
  | (RuleBase & {
      kind: 'event_budget';
      max_events?: number;
      max_tool_calls?: number;
      max_tool_failures?: number;
    })
  | (RuleBase & { kind: 'require_order'; before: EventMatcher; after: EventMatcher })
  | (RuleBase & { kind: 'require_event'; match: EventMatcher; min?: number; max?: number })
  | (RuleBase & { kind: 'deny_event'; match: EventMatcher })
  | (RuleBase & { kind: 'tool_result_required'; tool?: string })
  | (RuleBase & {
      kind: 'confidence_requires_outcome';
      threshold: number;
      evidence_classes?: EvidenceClass[];
    });

export interface ComparePolicy {
  fail_on_new_tools?: boolean;
  fail_on_new_violations?: boolean;
  max_tool_call_increase_percent?: number;
  require_same_outcome_or_better?: boolean;
}

export interface InvariantContract {
  version: 1;
  name: string;
  description?: string;
  rules: InvariantRule[];
  compare?: ComparePolicy;
}

export interface Violation {
  rule_id: string;
  rule_kind: InvariantRule['kind'];
  severity: Severity;
  message: string;
  event_seq?: number;
  event_index?: number;
  evidence?: Record<string, unknown>;
}

export interface RuleResult {
  rule_id: string;
  rule_kind: InvariantRule['kind'];
  passed: boolean;
  severity: Severity;
  checked: number;
  violations: Violation[];
}

export interface TraceSummary {
  events: number;
  tool_calls: number;
  tool_failures: number;
  tools: string[];
  approvals_granted: number;
  outcomes_satisfied: number;
  outcomes_violated: number;
  completion_claims: number;
  final_outcome: AgentEvent['verdict'] | null;
}

export interface CheckReport {
  schema: 'agent-invariants/check/v1';
  contract: { name: string; version: 1 };
  passed: boolean;
  error_count: number;
  warning_count: number;
  summary: TraceSummary;
  results: RuleResult[];
  violations: Violation[];
}

export interface CompatibilityRegression {
  kind: 'new_rule_failure' | 'contract_violation' | 'new_tool' | 'tool_call_increase' | 'outcome_regression';
  severity: Severity;
  message: string;
  evidence: Record<string, unknown>;
}

export interface CompatibilityReport {
  schema: 'agent-invariants/compare/v1';
  contract: { name: string; version: 1 };
  compatible: boolean;
  baseline: CheckReport;
  candidate: CheckReport;
  regressions: CompatibilityRegression[];
}
