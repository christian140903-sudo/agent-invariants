# Contributing

Issues and focused pull requests are welcome.

Before proposing a new rule kind, show an observable failure mode that cannot be expressed with the existing matcher, order, budget, approval, stop, retry, result, or outcome rules. Rules must remain deterministic; model-judged scoring belongs in an adapter or a different layer.

Run before submitting:

```bash
npm install
npm test
npm run smoke:pack
```

Contributions must not include private traces, credentials, proprietary prompts, hidden chain-of-thought, or personal Miguel/Soul material. Use synthetic fixtures.
