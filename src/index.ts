#!/usr/bin/env node
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { runCli } from './cli.js';
import { startServer } from './serve.js';

export { checkTrace, compareTraces, summarizeTrace } from './evaluator.js';
export { parseTraceText, readTrace } from './parser.js';
export { renderCheckReport, renderCompatibilityReport } from './reports.js';
export { invariantContractSchema, invariantRuleSchema, agentEventSchema } from './schemas.js';
export { createAgentInvariantsServer, AGENT_INVARIANTS_VERSION } from './server.js';
export type * from './types.js';

const entry = process.argv[1];
if (entry && realpathSync(entry) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args[0] === 'serve') {
    await startServer();
  } else {
    try {
      process.exitCode = await runCli(args);
    } catch (error) {
      process.stderr.write(`agent-invariants: ${error instanceof Error ? error.message : String(error)}\n`);
      process.exitCode = 2;
    }
  }
}
