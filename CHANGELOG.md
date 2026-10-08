# Changelog

All notable changes are documented here.

## 0.1.1 — unreleased

- Raise the `@modelcontextprotocol/sdk` floor to `^1.32.1` and refresh the
  lockfile (SDK 1.29.0 -> 1.32.1 with proxy-addr, ip-address, fast-uri, hono,
  @hono/node-server and qs). `npm audit --omit=dev` on a fresh clone goes from
  7 findings (1 critical, 3 high, 3 moderate; all through the SDK's HTTP and
  OAuth parts, which the stdio server does not use) to 0, so the CI `package`
  job's audit step passes again. Installs from the v0.1.0 release tarball
  already resolve SDK 1.32.1, since the tarball carries no lockfile.
- The GitHub Actions example installs from the release tarball, because the
  package is not on npm.

## 0.1.0 — 2026-07-17

- Initial public release.
- Twelve deterministic behavior rule kinds.
- Baseline/candidate compatibility comparison.
- JSON array and JSONL trace parsing.
- Human, JSON, JUnit, and SARIF reports.
- CLI, TypeScript SDK, and stateless MCP server.
- Honest evidence classes for completion checks.
- Clean-install packaging smoke test and Node 20/22/24 CI.
