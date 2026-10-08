import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { checkTrace, compareTraces, summarizeTrace } from './evaluator.js';
import { agentEventSchema, invariantContractSchema } from './schemas.js';

export const AGENT_INVARIANTS_VERSION = '0.1.1';

function jsonResult(payload: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }] };
}

export function createAgentInvariantsServer(): McpServer {
  const server = new McpServer(
    { name: 'agent-invariants', version: AGENT_INVARIANTS_VERSION },
    {
      instructions:
        'Agent Invariants checks normalized agent events against deterministic behavior contracts. ' +
        'It does not inspect hidden reasoning and does not decide whether a policy is ethically sufficient. ' +
        'Use agent_invariants_check_trace before accepting an agent change and agent_invariants_compare_traces to detect regressions across versions.',
    },
  );

  server.registerTool(
    'agent_invariants_validate_contract',
    {
      title: 'Validate Behavior Contract',
      description: 'Validate a version 1 Agent Invariants contract, including unique rule IDs and bounded matchers.',
      inputSchema: z.object({ contract: invariantContractSchema }),
    },
    async ({ contract }) => jsonResult({ valid: true, contract: invariantContractSchema.parse(contract) }),
  );

  server.registerTool(
    'agent_invariants_check_trace',
    {
      title: 'Check Agent Trace',
      description: 'Evaluate a normalized agent event trace against deterministic permission, stop, completion, retry, scope, and ordering rules.',
      inputSchema: z.object({ contract: invariantContractSchema, events: z.array(agentEventSchema).max(100_000) }),
    },
    async ({ contract, events }) => jsonResult(checkTrace(contract, events)),
  );

  server.registerTool(
    'agent_invariants_compare_traces',
    {
      title: 'Compare Agent Traces',
      description: 'Compare baseline and candidate traces and report newly broken rules, new tools, call inflation, or outcome regression.',
      inputSchema: z.object({
        contract: invariantContractSchema,
        baseline: z.array(agentEventSchema).max(100_000),
        candidate: z.array(agentEventSchema).max(100_000),
      }),
    },
    async ({ contract, baseline, candidate }) => jsonResult(compareTraces(contract, baseline, candidate)),
  );

  server.registerTool(
    'agent_invariants_summarize_trace',
    {
      title: 'Summarize Agent Trace',
      description: 'Return deterministic counts for tools, approvals, failures, completion claims, and observed outcomes.',
      inputSchema: z.object({ events: z.array(agentEventSchema).max(100_000) }),
    },
    async ({ events }) => jsonResult(summarizeTrace(events)),
  );

  server.registerPrompt(
    'protect-behavior-change',
    { description: 'Plan a model, prompt, memory, or tool change without silently changing agent behavior' },
    async () => ({
      messages: [{
        role: 'user' as const,
        content: {
          type: 'text' as const,
          text:
            'Before changing this agent, identify observable behavior that must survive the change: approval boundaries, forbidden tools, stop semantics, retry limits, and evidence required before completion. ' +
            'Encode those as an Agent Invariants v1 contract. Capture a baseline normalized trace, run the candidate under the same scenario, and call agent_invariants_compare_traces. ' +
            'Treat a compatible report as evidence only for the covered trace and rules, not proof of universal safety.',
        },
      }],
    }),
  );

  return server;
}
