# Event format

Agent Invariants consumes observable, normalized events. A trace is either a JSON array or newline-delimited JSON. Events remain in their original order and `seq` must be a strictly increasing non-negative integer.

## Common fields

| Field | Type | Meaning |
|---|---|---|
| `seq` | integer | Required monotonic position in the run |
| `type` | string | Required event type |
| `time` | ISO 8601 string | Optional timestamp with timezone offset |
| `run_id` | string | Optional run identifier |
| `actor` | string | Optional observable actor identifier |
| `data` | object | Optional adapter-specific metadata |

Unknown fields and event types are preserved by validation so adapters can extend the format. Reports do not copy the complete trace.

## Tool events

```jsonl
{"seq":10,"type":"tool.call","tool":"payments.refund","call_id":"c-1","call_signature":"refund:order-42","approval_id":"ap-1","risk":"high"}
{"seq":11,"type":"tool.result","tool":"payments.refund","call_id":"c-1","ok":true}
```

- `tool` is the stable capability name used by globs.
- `call_id` connects a call with its result.
- `call_signature` groups semantically identical attempts for retry limits. Adapters should hash or canonicalize arguments rather than exposing secrets.
- `risk` is descriptive in v1 and is not interpreted by the evaluator.

## Approval events

```jsonl
{"seq":8,"type":"approval.requested","approval_id":"ap-1","approval_scope":"payments.refund"}
{"seq":9,"type":"approval.granted","approval_id":"ap-1","approval_scope":"payments.refund","approved":true}
```

`require_approval` accepts a prior `approval.granted` event only when `approved` is not false. If the tool call carries `approval_id`, the IDs must match. Otherwise a configured scope glob is matched against `approval_scope`.

An approval is evidence that the trace says approval occurred. It is not cryptographic proof of the approver's identity.

## Stop events

```json
{"seq":20,"type":"control.stop"}
```

`stop_is_final` treats `control.stop` as the default stop type. By default, only `run.completed`, `run.failed`, and `telemetry.*` may follow it. A contract may replace that allowlist.

## Outcome events

```json
{
  "seq": 30,
  "type": "outcome.observed",
  "outcome_id": "refund-visible",
  "verdict": "satisfied",
  "evidence_class": "externally_observed"
}
```

Verdicts:

- `satisfied`
- `violated`
- `unknown`
- `retracted`

Evidence classes:

- `externally_observed` — observed from an external system or world-state interface;
- `configured_verifier` — produced by a declared deterministic verifier;
- `manual_attestation` — asserted by a human reviewer;
- `self_attestation` — asserted by the acting agent itself.

Completion rules default to accepting only `externally_observed` and `configured_verifier`. A contract can explicitly choose other classes, but the label is never upgraded.

## Completion claims

```json
{"seq":31,"type":"agent.message","claims_completion":true,"confidence":0.96}
```

`claims_completion` is a normalized adapter judgment that the observable message claims completion. Agent Invariants does not parse raw prose itself. `confidence` is optional and bounded from `0` to `1`.

`run.completed` is treated as a completion event by default, even without `claims_completion`.

## Privacy guidance

Do not put prompts, raw user messages, tool arguments, credentials, or full model output into the normalized trace unless they are essential and safe to retain. Stable names, hashes, booleans, verdicts, and bounded identifiers are usually sufficient for behavior contracts.
