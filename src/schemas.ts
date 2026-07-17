import { z } from 'zod';

export const severitySchema = z.enum(['warning', 'error']);
export const evidenceClassSchema = z.enum([
  'externally_observed',
  'configured_verifier',
  'manual_attestation',
  'self_attestation',
]);
export const verdictSchema = z.enum(['satisfied', 'violated', 'unknown', 'retracted']);

export const agentEventSchema = z.object({
  seq: z.number().int().nonnegative(),
  type: z.string().trim().min(1).max(200),
  time: z.string().datetime({ offset: true }).optional(),
  run_id: z.string().min(1).max(500).optional(),
  actor: z.string().min(1).max(500).optional(),
  tool: z.string().min(1).max(500).optional(),
  call_id: z.string().min(1).max(500).optional(),
  call_signature: z.string().min(1).max(2_000).optional(),
  risk: z.string().min(1).max(200).optional(),
  approval_id: z.string().min(1).max(500).optional(),
  approval_scope: z.string().min(1).max(500).optional(),
  approved: z.boolean().optional(),
  ok: z.boolean().optional(),
  outcome_id: z.string().min(1).max(500).optional(),
  verdict: verdictSchema.optional(),
  evidence_class: evidenceClassSchema.optional(),
  claims_completion: z.boolean().optional(),
  confidence: z.number().min(0).max(1).optional(),
  data: z.record(z.unknown()).optional(),
}).passthrough();

export const eventMatcherSchema = z.object({
  type: z.string().min(1).max(200).optional(),
  tool: z.string().min(1).max(500).optional(),
  ok: z.boolean().optional(),
  outcome_id: z.string().min(1).max(500).optional(),
  verdict: verdictSchema.optional(),
  claims_completion: z.boolean().optional(),
}).strict().refine((value) => Object.keys(value).length > 0, 'A matcher needs at least one field.');

const ruleBase = {
  id: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/),
  severity: severitySchema.optional(),
  description: z.string().trim().min(1).max(2_000).optional(),
};

const glob = z.string().trim().min(1).max(500);

export const invariantRuleSchema = z.discriminatedUnion('kind', [
  z.object({ ...ruleBase, kind: z.literal('deny_tool'), tool: glob }).strict(),
  z.object({ ...ruleBase, kind: z.literal('allow_tools'), tools: z.array(glob).min(1).max(1_000) }).strict(),
  z.object({
    ...ruleBase,
    kind: z.literal('require_approval'),
    tool: glob,
    scope: glob.optional(),
    within_events: z.number().int().positive().max(100_000).optional(),
  }).strict(),
  z.object({
    ...ruleBase,
    kind: z.literal('stop_is_final'),
    stop_type: glob.optional(),
    allowed_after: z.array(glob).max(100).optional(),
  }).strict(),
  z.object({
    ...ruleBase,
    kind: z.literal('completion_requires_outcome'),
    completion_types: z.array(glob).min(1).max(100).optional(),
    outcome_id: glob.optional(),
    evidence_classes: z.array(evidenceClassSchema).min(1).max(4).optional(),
  }).strict(),
  z.object({
    ...ruleBase,
    kind: z.literal('retry_limit'),
    tool: glob.optional(),
    max_attempts: z.number().int().min(1).max(10_000),
    group_by: z.enum(['tool', 'call_signature']).optional(),
  }).strict(),
  z.object({
    ...ruleBase,
    kind: z.literal('event_budget'),
    max_events: z.number().int().nonnegative().max(1_000_000).optional(),
    max_tool_calls: z.number().int().nonnegative().max(1_000_000).optional(),
    max_tool_failures: z.number().int().nonnegative().max(1_000_000).optional(),
  }).strict(),
  z.object({ ...ruleBase, kind: z.literal('require_order'), before: eventMatcherSchema, after: eventMatcherSchema }).strict(),
  z.object({
    ...ruleBase,
    kind: z.literal('require_event'),
    match: eventMatcherSchema,
    min: z.number().int().nonnegative().max(1_000_000).optional(),
    max: z.number().int().nonnegative().max(1_000_000).optional(),
  }).strict(),
  z.object({ ...ruleBase, kind: z.literal('deny_event'), match: eventMatcherSchema }).strict(),
  z.object({ ...ruleBase, kind: z.literal('tool_result_required'), tool: glob.optional() }).strict(),
  z.object({
    ...ruleBase,
    kind: z.literal('confidence_requires_outcome'),
    threshold: z.number().min(0).max(1),
    evidence_classes: z.array(evidenceClassSchema).min(1).max(4).optional(),
  }).strict(),
]);

export const invariantContractSchema = z.object({
  version: z.literal(1),
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(5_000).optional(),
  rules: z.array(invariantRuleSchema).min(1).max(10_000),
  compare: z.object({
    fail_on_new_tools: z.boolean().optional(),
    fail_on_new_violations: z.boolean().optional(),
    max_tool_call_increase_percent: z.number().nonnegative().max(100_000).optional(),
    require_same_outcome_or_better: z.boolean().optional(),
  }).strict().optional(),
}).strict().superRefine((contract, context) => {
  const ids = new Set<string>();
  contract.rules.forEach((rule, index) => {
    if (ids.has(rule.id)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['rules', index, 'id'], message: `Duplicate rule id: ${rule.id}` });
    }
    ids.add(rule.id);
    if (rule.kind === 'event_budget' && rule.max_events === undefined && rule.max_tool_calls === undefined && rule.max_tool_failures === undefined) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['rules', index], message: 'Set at least one budget.' });
    }
    if (rule.kind === 'require_event' && (rule.min ?? 1) > (rule.max ?? Number.MAX_SAFE_INTEGER)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['rules', index], message: 'min cannot exceed max.' });
    }
  });
});

export const traceSchema = z.array(agentEventSchema).max(1_000_000);
