# Agent Invariants

**Change the model, prompt, memory, or tools — without silently changing what your agent is allowed to do.**

[![Release](https://img.shields.io/github/v/release/christian140903-sudo/agent-invariants?display_name=tag)](https://github.com/christian140903-sudo/agent-invariants/releases/latest)
[![CI](https://github.com/christian140903-sudo/agent-invariants/actions/workflows/ci.yml/badge.svg)](https://github.com/christian140903-sudo/agent-invariants/actions/workflows/ci.yml)
[![license](https://img.shields.io/badge/license-MIT-53e6a7.svg)](LICENSE)
[![Node](https://img.shields.io/badge/Node.js-20%2B-53e6a7.svg)](package.json)

Agent Invariants checks recorded agent runs against an explicit operating contract and compares a known baseline run with a changed candidate. It is for people who change the model, prompt, memory, or tools under an existing agent and want a local, deterministic CI check that the operating rules still hold. It does not grade prose, inspect chain-of-thought, ask another model for a score, or block a live action.

It catches regressions such as:

- a payment tool called without approval;
- work continuing after a stop or revocation event;
- a new shell or admin capability appearing in the candidate;
- identical tool calls looping beyond a declared retry limit;
- a tool call with no corresponding result;
- “done” claimed without a prior independently observed outcome;
- tool-call or failure budgets quietly expanding.

## Try it in two minutes

Agent Invariants is not on npm. The commands below use the package attached to the [v0.1.0 GitHub release](https://github.com/christian140903-sudo/agent-invariants/releases/tag/v0.1.0). Requires Node.js 20 or newer.

**Claude Code** (stdio MCP server):

```bash
claude mcp add agent-invariants -- npx -y https://github.com/christian140903-sudo/agent-invariants/releases/download/v0.1.0/agent-invariants-0.1.0.tgz serve
```

This adds four stateless tools (validate a contract, check a trace, compare two traces, summarize a trace) and one prompt, `protect-behavior-change`, for planning a model, prompt, memory, or tool change.

**Any MCP client:**

```json
{
  "mcpServers": {
    "agent-invariants": {
      "command": "npx",
      "args": [
        "-y",
        "https://github.com/christian140903-sudo/agent-invariants/releases/download/v0.1.0/agent-invariants-0.1.0.tgz",
        "serve"
      ]
    }
  }
}
```

**CLI** — generate a passing example, then break it on purpose:

```bash
TGZ=https://github.com/christian140903-sudo/agent-invariants/releases/download/v0.1.0/agent-invariants-0.1.0.tgz
mkdir invariants-demo && cd invariants-demo

npx -y "$TGZ" init      # writes agent-invariants.json and agent-trace.jsonl
npx -y "$TGZ" check --contract agent-invariants.json --trace agent-trace.jsonl
# PASS  support-agent-operating-contract

# The same run without the approval, and with a self-attested outcome:
grep -v approval.granted agent-trace.jsonl | sed 's/externally_observed/self_attestation/' > candidate.jsonl
npx -y "$TGZ" compare --contract agent-invariants.json \
  --baseline agent-trace.jsonl --candidate candidate.jsonl
# REGRESSION  support-agent-operating-contract
# ✗ new_rule_failure: Rule newly fails in candidate: payments-need-approval.
# ✗ new_rule_failure: Rule newly fails in candidate: prove-before-done.
```

The process exits `0` when the check is compatible, `1` for a behavior violation or regression, and `2` for invalid input or usage.

To use it in a project, install the same tarball as a dev dependency:

```bash
npm install --save-dev https://github.com/christian140903-sudo/agent-invariants/releases/download/v0.1.0/agent-invariants-0.1.0.tgz
npx agent-invariants check --contract agent-invariants.json --trace run.jsonl
```

## Why it exists

Swapping a model or rewriting a prompt can make the answers look better while the agent quietly stops asking for approval, keeps working after a stop, or says “done” before anything was verified. Answer-quality evals are not built to catch that, and an exact trajectory match fails on every harmless change of path. Agent Invariants covers a narrower layer: **operating behavior that must remain true across implementation changes**.

| Layer | Typical question | Agent Invariants |
|---|---|---|
| Response eval | Was the answer useful or correct? | Not its job |
| Exact trajectory match | Did the agent take the expected path? | Can express order constraints without requiring an identical path |
| Policy engine | May this action run right now? | Not an enforcement point |
| Behavior compatibility | Did the candidate preserve approval, stop, scope, recovery, and completion rules? | Core job |
| Outcome verification | Did the intended world state actually exist? | Consumes observed outcome events; pair with [Postcondition](https://github.com/christian140903-sudo/postcondition-mcp) |

LangSmith's open AgentEvals, for example, supports exact, unordered, subset, superset, and model-judged trajectory evaluation. Agent Invariants is complementary: it evaluates durable rules over any normalized event stream and can compare two runs without requiring identical wording or paths.

### When to use this vs. behaviorlock

The two projects overlap: both are deterministic, both read runs you already recorded, and both compare a baseline with a candidate. Use **Agent Invariants** when you can write rules that must hold in every single run — approval before payments, nothing after a stop, no completion claim without observed outcome evidence. It checks one trace on its own and needs no baseline; `compare` adds cross-run regressions. Use [behaviorlock](https://github.com/christian140903-sudo/behaviorlock) when there is no absolute rule, only “behave as before”: it compares a candidate with a recorded baseline per assertion (sequences, sets, ranks, bounded metrics) and reports compatible, drifted, or unknown.

## How it works

### A behavior contract

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

### A normalized trace

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

### Rules in v1

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

### Compatibility comparison

`compare` runs the full contract against both traces and then detects cross-run changes:

- rules that passed in the baseline but fail in the candidate;
- tools that only appear in the candidate;
- a configured percentage increase in tool calls;
- a worse final observed outcome.

This is not a model benchmark. It is a compatibility decision for two concrete runs under one concrete contract.

### CI output

Human-readable output is the default. JSON, JUnit, and SARIF are built in:

```bash
npx agent-invariants check --contract agent-invariants.json --trace run.jsonl --format json
npx agent-invariants check --contract agent-invariants.json --trace run.jsonl --format junit --output report.xml
npx agent-invariants check --contract agent-invariants.json --trace run.jsonl --format sarif --output report.sarif
```

A complete GitHub Actions example lives at [examples/github-actions.yml](examples/github-actions.yml).

### MCP tools

| Tool | Purpose |
|---|---|
| `agent_invariants_validate_contract` | Validate a v1 contract and unique rule IDs |
| `agent_invariants_check_trace` | Check one in-memory trace |
| `agent_invariants_compare_traces` | Compare baseline and candidate traces |
| `agent_invariants_summarize_trace` | Count tools, approvals, failures, completion claims, and outcomes |

The MCP server is stateless and does not read files. The CLI reads only paths explicitly supplied by the caller.

### TypeScript SDK

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

### Outcome events from Postcondition

[Postcondition](https://github.com/christian140903-sudo/postcondition-mcp) verifies world state after an action and uses the same verdicts (`satisfied`, `violated`, `unknown`) and evidence classes. There is no adapter and no integration test between the two packages: you write its result into the trace yourself (its `evidenceClass` becomes `evidence_class` here).

```json
{
  "seq": 12,
  "type": "outcome.observed",
  "outcome_id": "package-published",
  "verdict": "satisfied",
  "evidence_class": "externally_observed"
}
```

With `completion_requires_outcome`, Agent Invariants then fails any run that claims completion before such an observation.

## Verify it yourself

```bash
git clone https://github.com/christian140903-sudo/agent-invariants.git && cd agent-invariants
npm ci && npm test        # expected: 36 passing (last verified 2026-10-08, Node 22, fresh clone)
```

The 36 tests cover all twelve rule kinds and the comparison policies, contract validation and the JSON/JSONL parser, all four report formats, CLI exit codes `0`/`1`/`2`, and one real MCP exchange over stdio (SDK client against `serve`). They do not cover traces from real agent frameworks (all fixtures are synthetic) or operating systems other than Linux (CI runs on ubuntu-latest with Node 20, 22, and 24). The packed release is checked separately:

```bash
npm run smoke:pack      # packs the tarball, installs it into a temporary project, runs --version
npm run test:coverage
```

## What it does not do

- It is not on npm; installation is from the GitHub release tarball or from source.
- It does not stop a live action; put a policy-enforcement point before dangerous tools.
- It cannot detect an event that the trace producer omitted or falsified.
- It ships no adapters for specific agent frameworks; you produce the normalized trace yourself ([event format](docs/event-format.md)).
- One passing trace does not prove universal behavior across all prompts or environments.
- It does not determine whether your contract is ethical, complete, or legally sufficient.
- Its reports are not signed attestations and provide no non-repudiation.
- Outcome events are only as trustworthy as their producer. Prefer externally observed or configured verifier evidence.

Read the [security model](docs/security-model.md) and [limitations](docs/limitations.md) before using it for consequential systems.

## How this was built

Most of the code was written by AI coding agents under my direction. I wrote the specification, set the constraints, decided what to test, reviewed the result and rejected what did not hold. Release decisions and every claim in this README are mine.

The public history is short: the release commit (17 July 2026) and one follow-up pull request from a Codex branch ([#1](https://github.com/christian140903-sudo/agent-invariants/pull/1)) that removed npm install claims the package could not yet satisfy. The agent sessions themselves are not published.

The rules come from mechanisms in my private agent system — permission rings, stop boundaries, prediction/outcome tracking, recovery limits, and the rule that completion must be independently testable. This package is a new implementation of those ideas and contains none of the private data, conversations, paths, or credentials. It is meant to complement existing evaluation tools, not to be the first or only one in this area. See [origins and design choices](docs/origins.md).

## Status

`0.1.0` · GitHub release (July 2026), not on npm · experimental · single maintainer · no known external users · last verified 2026-10-08

Issues and focused pull requests are welcome; see [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE) © 2026 Christian Bucher
