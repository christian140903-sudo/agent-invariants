# README after the npm release (prepared, not applied)

Prepared on 2026-10-08 for version 0.1.1. Nothing here is live: `README.md`
keeps the release-tarball instructions until `agent-invariants` is actually on
npm (`npm view agent-invariants` returned 404 on 2026-10-08).

## How it is applied

npmjs.com shows the README that is inside the published package, and the
package also ships `examples/github-actions.yml` and `CHANGELOG.md`. So the
swap happens in the publish checkout, before `npm publish`:

```bash
git apply docs/README-nach-npm-release.patch
```

After a successful publish, the same patch is committed to the repository,
together with the release date in `CHANGELOG.md`. If `git apply` refuses, one
of the three files changed after the patch was made: nothing is applied,
nothing is published; regenerate the patch from the blocks below.

This file and the patch are excluded from the npm package (`files` in
`package.json`).

## Lines that change

| File, place | Today | After the release |
|---|---|---|
| README, badges | GitHub release badge (`releases/latest`) | npm version badge |
| README, *Try it in two minutes*, first paragraph | "Agent Invariants is not on npm. The commands below use the package attached to the v0.1.0 GitHub release." | "Requires Node.js 20 or newer." only |
| README, Claude Code command | `npx -y https://github.com/…/agent-invariants-0.1.0.tgz serve` | `npx -y agent-invariants serve` |
| README, any MCP client, `args` | tarball URL | `"agent-invariants"` |
| README, CLI block | `TGZ=<tarball URL>` and `npx -y "$TGZ" …` (3x) | no variable, `npx -y agent-invariants …` (3x) |
| README, dev dependency | "install the same tarball as a dev dependency", `npm install --save-dev <tarball URL>` | "install it as a dev dependency", `npm install --save-dev agent-invariants` |
| README, *What it does not do* | "It is not on npm; installation is from the GitHub release tarball or from source." | line removed |
| README, *Status* | "`0.1.0` · GitHub release (July 2026), not on npm" | "`0.1.1` on npm (first release: 0.1.0 as a GitHub release, July 2026)" |
| `examples/github-actions.yml` | `npx --yes <tarball URL> compare` | `npx --yes agent-invariants@0.1.1 compare` (pinned, so a CI gate does not change under you) |
| `CHANGELOG.md`, 0.1.1 | "The GitHub Actions example installs from the release tarball, because the package is not on npm." | "The GitHub Actions example installs `agent-invariants@0.1.1` from npm. In 0.1.0 it named `agent-invariants@0.1.0`, which was never on npm." |

## Prepared block: Try it in two minutes

````markdown
## Try it in two minutes

Requires Node.js 20 or newer.

**Claude Code** (stdio MCP server):

```bash
claude mcp add agent-invariants -- npx -y agent-invariants serve
```

This adds four stateless tools (validate a contract, check a trace, compare two traces, summarize a trace) and one prompt, `protect-behavior-change`, for planning a model, prompt, memory, or tool change.

**Any MCP client:**

```json
{
  "mcpServers": {
    "agent-invariants": {
      "command": "npx",
      "args": ["-y", "agent-invariants", "serve"]
    }
  }
}
```

**CLI** — generate a passing example, then break it on purpose:

```bash
mkdir invariants-demo && cd invariants-demo

npx -y agent-invariants init      # writes agent-invariants.json and agent-trace.jsonl
npx -y agent-invariants check --contract agent-invariants.json --trace agent-trace.jsonl
# PASS  support-agent-operating-contract

# The same run without the approval, and with a self-attested outcome:
grep -v approval.granted agent-trace.jsonl | sed 's/externally_observed/self_attestation/' > candidate.jsonl
npx -y agent-invariants compare --contract agent-invariants.json \
  --baseline agent-trace.jsonl --candidate candidate.jsonl
# REGRESSION  support-agent-operating-contract
# ✗ new_rule_failure: Rule newly fails in candidate: payments-need-approval.
# ✗ new_rule_failure: Rule newly fails in candidate: prove-before-done.
```

The process exits `0` when the check is compatible, `1` for a behavior violation or regression, and `2` for invalid input or usage.

To use it in a project, install it as a dev dependency:

```bash
npm install --save-dev agent-invariants
npx agent-invariants check --contract agent-invariants.json --trace run.jsonl
```
````

(The patch keeps the existing one-entry-per-line layout of `args`; the block
above is the same content.)

## Outside this repository's files

- `CHANGELOG.md`: `## 0.1.1 — unreleased` becomes the publish date (the
  publish commands set it in the publish checkout).
- Profile README (`christian140903-sudo/christian140903-sudo`): status and
  table can say "on npm" for agent-invariants once
  `npm view agent-invariants version` prints `0.1.1`.
- Optional, separate decision: a `v0.1.1` tag and GitHub release on the
  published commit (the release badge is replaced by the npm badge, so
  nothing on the page depends on it); listing in the MCP Registry
  (`server.json` and `mcpName` are ready for it).
