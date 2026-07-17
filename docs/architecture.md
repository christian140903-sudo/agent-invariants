# Architecture

Agent Invariants has one dependency-light deterministic kernel exposed through three surfaces.

```text
JSON / JSONL traces      In-memory events
         │                     │
         ├──── CLI/parser ─────┤
         │                     │
         └────────────── MCP tools
                               │
                    contract + event validation
                               │
              ┌────────────────┴────────────────┐
              │ deterministic rule evaluators  │
              │ trace summary + comparison     │
              └────────────────┬────────────────┘
                               │
                pretty / JSON / JUnit / SARIF
```

## Design decisions

### Observable behavior only

The kernel consumes explicit events, not hidden chain-of-thought. This keeps behavior contracts portable across model providers and agent frameworks.

### Contract and trace are separate

The trace says what was observed. The contract says what must remain true. Keeping them separate makes policy weakening visible in code review.

### One-run and cross-run checks are distinct

`checkTrace` evaluates absolute rules. `compareTraces` evaluates the same rules on both traces and then detects relative changes such as new tools or a worse final outcome.

### Deterministic kernel

No network request, embedding model, probabilistic grader, or vendor service participates in a decision. The same validated input produces the same report.

### Framework-neutral adapter boundary

Agent runtimes differ dramatically. Adapters normalize their observable events into a small common vocabulary. Extra event fields survive validation, but the kernel interprets only documented fields.

### Outcome evidence stays labelled

Manual and self-attested outcomes never become external evidence through evaluation. A contract must explicitly allow them if desired.

## Public API

- `checkTrace(contract, events)`
- `compareTraces(contract, baseline, candidate)`
- `summarizeTrace(events)`
- `parseTraceText(text)`
- `readTrace(path)`
- report renderers and Zod schemas

All report objects carry a stable v1 schema identifier.
