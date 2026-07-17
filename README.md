# Agent Invariants

> Change the model, prompt, memory, or tools — without silently changing what your agent is allowed to do.

[![npm version](https://img.shields.io/npm/v/agent-invariants.svg)](https://www.npmjs.com/package/agent-invariants)
[![CI](https://github.com/christian140903-sudo/agent-invariants/actions/workflows/ci.yml/badge.svg)](https://github.com/christian140903-sudo/agent-invariants/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/agent-invariants.svg)](LICENSE)
[![Node](https://img.shields.io/node/v/agent-invariants.svg)](package.json)

Agent Invariants is a local, deterministic behavior-compatibility layer for AI agents. It checks normalized event traces against explicit operating contracts and compares a known baseline with a changed candidate.

It catches regressions such as:

- a payment tool called without approval;
- work continuing after a stop or revocation event;
- a new shell or admin capability appearing in the candidate;
- identical tool calls looping beyond a declared retry limit;
- a tool call with no corresponding result;
- “done” claimed without a prior independently observed outcome;
- tool-call or failure budgets quietly expanding.

It does not grade prose, inspect chain-of-thought, or ask another model for a vibe-based score.

## Why another agent evaluation tool?

Response grading and trajectory evaluation are valuable. Agent Invariants covers a narrower layer: **operating behavior that must remain true across implementation changes**.

| Layer | Typical question | Agent Invariants |
|---|---|---|
| Response eval | Was the answer useful or correct? | Not its job |
| Exact trajectory match | Did the agent take the expected path? | Can express order constraints without requiring an identical path |
| Policy engine | May this action run right now? | Not an enforcement point |
| Behavior compatibility | Did the candidate preserve approval, stop, scope, recovery, and completion rules? | Core job |
| Outcome verification | Did the intended world state actually exist? | Consumes observed outcome events; pair with [Postcondition](https://github.com/christian140903-sudo/postcondition-mcp) |

LangSmith's open AgentEvals, for example, supports exact, unordered, subset, superset, and model-judged trajectory evaluation. Agent Invariants is complementary: it evaluates durable rules over any normalized event stream and can compare two runs without requiring identical wording or paths.

## Install

```bash
npm install --save-dev agent-invariants
```

Run the MCP server without a global install:

```bash
npx --yes agent-invariants serve
```

Or add it to an MCP client:

```json
{
  "mcpServers": {
    "agent-invariants": {
      "command": "npx",
      "args": ["--yes", "agent-invariants", "serve"]
    }
  }
}
```

## Two-minute start

Generate a working contract and trace:

```bash
npx agent-invariants init
npx agent-invariants check \
  --contract agent-invariants.json \
  --trace agent-trace.jsonl
```

Compare a candidate run with a baseline:

```bash
npx agent-invariants compare \
  --contract agent-invariants.json \
  --baseline baseline.jsonl \
  --candidate candidate.jsonl
```

The process exits `0` when the check is compatible, `1` for a behavior violation or regression, and `2` for invalid input or usage.

## A behavior contract

```json
{
  "version": 1,
  "name": "support-agent-operating-contract",
  "compare": {
    "fail_on_new_tools": true,
    "fail_on_new_violations": true,
    "max_tool_call_increase_percent": 50,
    "require_same_outcome_or_better": true
  },
  "rules": [
    {
      "id": "payments-need-approval",
      "kind": "require_approval",
      "tool": "payments.*",
      "scope": "payments.*",
      "within_events": 20
    },
    {
      "id": "stop-means-stop",
      "kind": "stop_is_final"
    },
    {
      "id": "no-shell",
      "kind": "deny_tool",
      "tool": "shell.*"
    },
    {
      "id": "no-retry-loop",
      "kind": "retry_limit",
      "max_attempts": 2,
      "group_by": "call_signature"
    },
    {
      "id": "prove-before-done",
      "kind": "completion_requires_outcome",
      "evidence_classes": ["externally_observed", "configured_verifier"]
    }
  ]
}
```

Every rule is deterministic. A contract can use glob matchers such as `payments.*`; globs are escaped before compilation and are not arbitrary regular expressions.

## A normalized trace

Traces may be a JSON array or JSONL. Sequence numbers must be strictly increasing.

```jsonl
{"seq":1,"type":"run.start","run_id":"refund-42"}
{"seq":2,"type":"approval.granted","approval_id":"ap-1","approval_scope":"payments.refund","approved":true}
{"seq":3,"type":"tool.call","tool":"payments.refund","call_id":"c-1","call_signature":"refund:order-42","approval_id":"ap-1"}
{"seq":4,"type":"tool.result","tool":"payments.refund","call_id":"c-1","ok":true}
{"seq":5,"type":"outcome.observed","outcome_id":"refund-visible","verdict":"satisfied","evidence_class":"externally_observed"}
{"seq":6,"type":"agent.message","claims_completion":true,"confidence":0.98}
{"seq":7,"type":"run.completed"}
```

Agent Invariants intentionally normalizes only observable events. Adapters can retain extra top-level fields; unknown event types and fields are accepted.

## Rules in v1

| Rule | What it checks |
|---|---|
| `deny_tool` | No matching tool may be called |
| `allow_tools` | Every tool call must match an allowlisted pattern |
| `require_approval` | Matching calls need a prior granted approval, optionally scoped and time-bounded |
| `stop_is_final` | Only explicitly allowed lifecycle/telemetry events may follow a stop |
| `completion_requires_outcome` | Completion needs prior satisfied outcome evidence from allowed evidence classes |
| `confidence_requires_outcome` | High-confidence completion claims need qualifying prior outcome evidence |
| `retry_limit` | Matching call groups cannot exceed an attempt limit |
| `event_budget` | Bounds total events, tool calls, and failed results |
| `require_order` | Every matching “after” event needs a matching predecessor |
| `require_event` | A matcher must occur within a declared count range |
| `deny_event` | A matcher must never occur |
| `tool_result_required` | Every matching call needs a later result with the same `call_id` |

Rules default to severity `error`. A `warning` remains visible but does not fail the process.

See [contract reference](docs/contract-reference.md) and [event format](docs/event-format.md) for the complete fields and semantics.

## Compatibility comparison

`compare` runs the full contract against both traces and then detects cross-run changes:

- rules that passed in the baseline but fail in the candidate;
- tools that only appear in the candidate;
- a configured percentage increase in tool calls;
- a worse final observed outcome.

This is not a model benchmark. It is a compatibility decision for two concrete runs under one concrete contract.

## CI output

Human-readable output is the default. JSON, JUnit, and SARIF are built in:

```bash
agent-invariants check --contract agent-invariants.json --trace run.jsonl --format json
agent-invariants check --contract agent-invariants.json --trace run.jsonl --format junit --output report.xml
agent-invariants check --contract agent-invariants.json --trace run.jsonl --format sarif --output report.sarif
```

A complete GitHub Actions example lives at [examples/github-actions.yml](examples/github-actions.yml).

## MCP tools

| Tool | Purpose |
|---|---|
| `agent_invariants_validate_contract` | Validate a v1 contract and unique rule IDs |
| `agent_invariants_check_trace` | Check one in-memory trace |
| `agent_invariants_compare_traces` | Compare baseline and candidate traces |
| `agent_invariants_summarize_trace` | Count tools, approvals, failures, completion claims, and outcomes |

The MCP server is stateless and does not read files. The CLI reads only paths explicitly supplied by the caller.

## TypeScript SDK

```ts
import { checkTrace, compareTraces } from 'agent-invariants';

const report = checkTrace(contract, events);
if (!report.passed) {
  console.error(report.violations);
}

const compatibility = compareTraces(contract, baseline, candidate);
if (!compatibility.compatible) {
  console.error(compatibility.regressions);
}
```

## Postcondition integration

[Postcondition](https://github.com/christian140903-sudo/postcondition-mcp) verifies world state after an action. Convert its observation into a trace event:

```json
{
  "seq": 12,
  "type": "outcome.observed",
  "outcome_id": "package-published",
  "verdict": "satisfied",
  "evidence_class": "externally_observed"
}
```

Agent Invariants can then enforce that an agent did not claim completion before that observation. This creates a simple trust stack:

```text
Agent Invariants  — did the agent preserve its operating contract?
Postcondition     — did the intended result actually exist in the world?
Soul              — what happened, what was learned, and what must persist?
```

## What it does not prove

- It does not stop a live action; put a policy-enforcement point before dangerous tools.
- It cannot detect an event that the trace producer omitted or falsified.
- One passing trace does not prove universal behavior across all prompts or environments.
- It does not determine whether your contract is ethical, complete, or legally sufficient.
- Its reports are not signed attestations and provide no non-repudiation.
- Outcome events are only as trustworthy as their producer. Prefer externally observed or configured verifier evidence.

Read the [security model](docs/security-model.md) and [limitations](docs/limitations.md) before using it for consequential systems.

## Origin

Agent Invariants is a public extraction and synthesis of recurring mechanisms in Christian Bucher's private Miguel/Soul system: permission rings, stop boundaries, prediction/outcome tracking, drift checks, recovery limits, anti-performance audits, and the rule that completion must be independently testable. The public package contains none of the private identity data, conversations, paths, or credentials from those systems.

The concept was also shaped by an external gap: existing agent evals often focus on answer quality or trajectory similarity, while this project needed a small deterministic layer for operating-contract compatibility. It is presented as a complementary tool, not as a claim to be the first or only system in this area.

See [origins and design choices](docs/origins.md).

## Development

```bash
npm install
npm test
npm run test:coverage
npm run smoke:pack
```

The suite exercises all rule kinds, comparison policies, parsers, output formats, CLI exit behavior, packaging, and an actual MCP stdio client/server exchange on Node 20, 22, and 24 in CI.

## License

[MIT](LICENSE) © 2026 Christian Bucher
