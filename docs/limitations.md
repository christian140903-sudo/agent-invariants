# Limitations

Agent Invariants deliberately makes a smaller claim than “agent safety.”

1. **Trace completeness is assumed.** An omitted event cannot be evaluated.
2. **Trace identity is not authenticated.** Approval IDs and actors are labels unless your runtime signs them.
3. **No live enforcement.** A violation is detected; the package does not prevent the action.
4. **Coverage is scenario-bound.** A compatible candidate passed the declared rules on the supplied traces, not on every possible interaction.
5. **Contracts can be weak.** The kernel cannot decide whether an author forgot an important invariant.
6. **Completion classification is adapter-supplied.** The package does not infer `claims_completion` from natural language.
7. **Retry grouping is only as good as `call_signature`.** Missing signatures fall back to the tool name and may over-group.
8. **Approval reuse is policy-dependent.** v1 checks for a prior matching grant but does not consume single-use approvals.
9. **Outcome ordering is coarse.** Cross-run comparison uses a fixed compatibility ordering, not domain-specific cost or risk.
10. **No cryptographic attestation.** Reports have no signature, transparency log, or non-repudiation.
11. **No semantic response grading.** Use a response evaluator when usefulness, factuality, tone, or nuanced task quality matters.
12. **No exact trajectory equivalence.** Use a trajectory matcher when the complete path itself must be identical.

These are design boundaries, not hidden roadmap promises. Please open a focused issue for a concrete observable failure mode.
