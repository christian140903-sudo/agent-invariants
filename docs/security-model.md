# Security model

## Assets

- behavior contracts that define expected operating boundaries;
- traces that may describe sensitive agent activity;
- CI decisions derived from reports;
- outcome evidence labels and approval associations.

## Trust boundaries

Agent Invariants trusts the caller to provide the intended contract and an honest, complete trace. It validates structure and evaluates semantics; it does not authenticate the trace producer.

The CLI reads only contract and trace paths explicitly supplied by command-line options. The MCP server accepts in-memory objects and is stateless. The evaluator performs no network requests and executes no user commands.

## Input hardening

- JSONL input is capped at 100 MiB and one MiB per non-comment line.
- CLI traces are capped at one million events by schema.
- MCP tool traces are capped at 100,000 events per call.
- Contract strings, rule counts, matcher counts, and numeric budgets are bounded.
- Contracts and rules reject unknown keys.
- Globs are escaped and anchored before compilation; callers cannot supply raw regular expressions.
- Sequence numbers must be strictly increasing.

These bounds reduce accidental resource exhaustion; they are not a substitute for process-level limits around an untrusted public service.

## Sensitive data

The normalized format does not need raw prompts, model output, or arguments. Prefer stable identifiers and hashes. JSON reports contain summaries and violation evidence, not complete traces, but may still expose tool names, rule IDs, call IDs, and configured scopes.

JUnit and SARIF similarly include violation messages and bounded evidence. Review reports before uploading them outside a trusted CI system.

## Integrity limitations

Reports are ordinary unsigned files. A malicious producer can omit events, reorder a trace before sequence assignment, or fabricate approvals and outcomes. For higher assurance:

1. emit events from a trusted runtime boundary rather than the agent itself;
2. make the event log append-only;
3. sign or hash-chain events outside this package;
4. keep contracts under protected review;
5. obtain outcome observations from an independent verifier such as Postcondition.

## Enforcement limitation

The evaluator runs after or beside a trace. It does not intercept tool calls. Consequential tools still need a live authorization layer and least-privilege credentials.
