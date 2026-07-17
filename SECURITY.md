# Security policy

## Supported versions

The latest published minor release receives security fixes.

## Report a vulnerability

Please use GitHub's private vulnerability reporting for this repository. Do not open a public issue containing an exploit, private trace data, tokens, credentials, or customer information.

Include the affected version, impact, minimum reproduction, and whether the issue involves the CLI, SDK, parser, report renderer, or MCP transport.

## Operational guidance

- Treat traces as potentially sensitive. Redact arguments, user content, secrets, and raw model output before storage or CI upload.
- Pin the package version in consequential CI workflows.
- Keep behavior contracts under code review; weakening the contract can make an unsafe candidate appear compatible.
- Do not use a passing report as authorization for a live high-risk action.
- Do not treat unsigned JSON/JUnit/SARIF output as non-repudiable evidence.

The complete threat model is in [docs/security-model.md](docs/security-model.md).
