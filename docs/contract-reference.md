# Contract reference

## Root object

```json
{
  "version": 1,
  "name": "my-agent",
  "description": "optional",
  "rules": [],
  "compare": {}
}
```

- `version` must be `1`.
- `name` is required.
- `rules` must contain at least one rule and every `id` must be unique.
- `compare` configures cross-run checks.
- Unknown contract and rule fields are rejected so misspellings fail closed.

Every rule supports optional `severity: "error" | "warning"` and `description`. The default severity is `error`.

## Glob semantics

Fields documented as globs accept `*` for any number of characters and `?` for one character. All other punctuation is literal. Patterns are anchored to the complete value.

Examples:

- `payments.*` matches `payments.refund`;
- `admin.?` matches `admin.x` but not `admin.xy`;
- `*` matches every defined value.

## `deny_tool`

```json
{"id":"no-shell","kind":"deny_tool","tool":"shell.*"}
```

Fails for every matching `tool.call`.

## `allow_tools`

```json
{"id":"scope","kind":"allow_tools","tools":["crm.read","payments.refund"]}
```

Fails every `tool.call` that matches none of the declared patterns.

## `require_approval`

```json
{
  "id":"approval",
  "kind":"require_approval",
  "tool":"payments.*",
  "scope":"payments.*",
  "within_events":20
}
```

Every matching tool call needs a prior granted approval. `within_events` bounds how far back the evaluator searches. If a call contains `approval_id`, the ID takes precedence over scope matching.

## `stop_is_final`

```json
{
  "id":"stop",
  "kind":"stop_is_final",
  "stop_type":"control.stop",
  "allowed_after":["run.completed","telemetry.*"]
}
```

After each stop event, all later event types must match `allowed_after`. Defaults: stop type `control.stop`; allowed `run.completed`, `run.failed`, and `telemetry.*`.

## `completion_requires_outcome`

```json
{
  "id":"prove-done",
  "kind":"completion_requires_outcome",
  "completion_types":["run.completed"],
  "outcome_id":"deploy-*",
  "evidence_classes":["externally_observed","configured_verifier"]
}
```

Every matching completion event, and every event with `claims_completion: true`, needs a prior satisfied matching outcome from an allowed evidence class. Defaults accept external and configured-verifier evidence only.

## `confidence_requires_outcome`

```json
{"id":"calibration","kind":"confidence_requires_outcome","threshold":0.9}
```

Checks completion claims at or above the threshold. It does not infer confidence from prose.

## `retry_limit`

```json
{"id":"retries","kind":"retry_limit","tool":"http.*","max_attempts":2,"group_by":"call_signature"}
```

Groups calls by `call_signature` by default, falling back to the tool name when a signature is absent. `group_by: "tool"` counts every call to the same tool together.

## `event_budget`

```json
{"id":"budget","kind":"event_budget","max_events":100,"max_tool_calls":12,"max_tool_failures":2}
```

At least one bound is required. Tool failures are `tool.result` events with `ok: false`.

## `require_order`

```json
{
  "id":"policy-first",
  "kind":"require_order",
  "before":{"type":"policy.checked"},
  "after":{"type":"tool.call","tool":"admin.*"}
}
```

Every matching `after` event needs at least one matching earlier `before` event.

## `require_event`

```json
{"id":"one-start","kind":"require_event","match":{"type":"run.start"},"min":1,"max":1}
```

The default minimum is one and the default maximum is unbounded.

## `deny_event`

```json
{"id":"no-secret-read","kind":"deny_event","match":{"type":"secret.read"}}
```

Fails every matching event.

## `tool_result_required`

```json
{"id":"closed-calls","kind":"tool_result_required","tool":"*"}
```

Every matching call must contain `call_id` and have a later `tool.result` with the same ID.

## Event matchers

Matchers support:

- `type` glob;
- `tool` glob;
- exact `ok` boolean;
- `outcome_id` glob;
- exact `verdict`;
- exact `claims_completion` boolean.

At least one matcher field is required.

## Comparison policy

```json
{
  "fail_on_new_tools": true,
  "fail_on_new_violations": true,
  "max_tool_call_increase_percent": 25,
  "require_same_outcome_or_better": true
}
```

Defaults are `true` for new tools, new violations, and same-or-better final outcome. Tool-call increase is checked only when configured. A candidate that still violates an error-level contract rule is incompatible even when the same rule already failed in the baseline; `fail_on_new_violations` controls the relative-regression classification, not whether the contract itself is enforced.

Outcome comparison order is `satisfied` > `unknown` > `retracted` > `violated` > no outcome. This ordering is a narrow compatibility heuristic, not a general statement about incident severity.
