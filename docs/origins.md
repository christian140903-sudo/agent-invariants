# Origins and design choices

Agent Invariants was created from a repeated problem inside Christian Bucher's Miguel/Soul work: changing a model or architecture could improve visible output while quietly weakening permission boundaries, recovery behavior, truthfulness, or the evidence required before saying “done.”

Several private mechanisms converged into this public, identity-free kernel:

- **Ring permissions** separated autonomous work, approval-required actions, and owner-only actions.
- **Drift checks** compared observed behavior with a stable operating fingerprint.
- **Prediction/outcome tracking** separated expectation from what happened.
- **Anti-performance audits** required impressive system language to have a real mechanism behind it.
- **Acceptance probes** were declared before build waves and independently rechecked.
- **State writers** re-verified evidence instead of trusting a conductor's success claim.
- **Theater suspicion** treated an absence of disagreement or failed checks as a warning, not automatic success.
- **Postcondition** turned completion into independently observable world state.

The public package is a new implementation of those ideas, not a dump of the private system. It contains no personal memory, conversations, identity prompts, local paths, credentials, or private model traces.

## External positioning

Mature evaluation projects already cover answer scoring, datasets, trajectory matching, and model judges. Supply-chain systems cover signed build steps and artifact integrity. Runtime policy engines cover authorization before tool use.

Agent Invariants chooses a narrow seam between them: deterministic behavior compatibility over normalized observable agent events. It is intended to compose with those systems rather than replace them.

No novelty superlative is part of the product claim. The defensible claim is simpler: the repository ships a working, tested implementation of this specific contract format, evaluator, comparison policy, CLI, SDK, MCP server, and CI output pipeline.
