import { constants } from 'node:fs';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { checkTrace, compareTraces, summarizeTrace } from './evaluator.js';
import { EXAMPLE_CONTRACT, EXAMPLE_TRACE } from './examples.js';
import { readTrace } from './parser.js';
import { renderCheckReport, renderCompatibilityReport, type ReportFormat } from './reports.js';
import { invariantContractSchema } from './schemas.js';
import { AGENT_INVARIANTS_VERSION } from './server.js';

const HELP = `Agent Invariants ${AGENT_INVARIANTS_VERSION} — deterministic behavior contracts for AI agents

Usage:
  agent-invariants init [directory]
  agent-invariants validate --contract agent-invariants.json
  agent-invariants summary --trace run.jsonl
  agent-invariants check --contract agent-invariants.json --trace run.jsonl [--format pretty|json|junit|sarif] [--output report]
  agent-invariants compare --contract agent-invariants.json --baseline old.jsonl --candidate new.jsonl [--format pretty|json|junit|sarif] [--output report]
  agent-invariants serve

Exit codes: 0 compatible/pass, 1 behavior violation/regression, 2 invalid input or usage.
Traces may be a JSON array or newline-delimited JSON. Evaluation is local and deterministic.
`;

async function loadContract(path: string): Promise<unknown> {
  return invariantContractSchema.parse(JSON.parse(await readFile(path, 'utf8')));
}

function reportOptions(args: string[]) {
  const { values } = parseArgs({
    args,
    options: {
      contract: { type: 'string' }, trace: { type: 'string' }, baseline: { type: 'string' }, candidate: { type: 'string' },
      format: { type: 'string', default: 'pretty' }, output: { type: 'string' },
    },
    strict: true,
  });
  if (!['pretty', 'json', 'junit', 'sarif'].includes(values.format ?? '')) throw new Error('--format must be pretty, json, junit, or sarif.');
  return values as typeof values & { format: ReportFormat };
}

async function emit(text: string, output?: string): Promise<void> {
  if (output) await writeFile(output, text, { encoding: 'utf8', flag: 'w' });
  else process.stdout.write(text);
}

async function init(directory: string): Promise<void> {
  const target = resolve(directory);
  await mkdir(target, { recursive: true });
  const contractPath = resolve(target, 'agent-invariants.json');
  const tracePath = resolve(target, 'agent-trace.jsonl');
  for (const path of [contractPath, tracePath]) {
    try {
      await access(path, constants.F_OK);
      throw new Error(`Refusing to overwrite existing file: ${path}`);
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('Refusing')) throw error;
    }
  }
  await writeFile(contractPath, `${JSON.stringify(EXAMPLE_CONTRACT, null, 2)}\n`, { flag: 'wx' });
  await writeFile(tracePath, `${EXAMPLE_TRACE.map((event) => JSON.stringify(event)).join('\n')}\n`, { flag: 'wx' });
  process.stdout.write(`Created ${contractPath}\nCreated ${tracePath}\n`);
}

export async function runCli(argv: string[]): Promise<number> {
  const command = argv[0] ?? 'help';
  if (['help', '--help', '-h'].includes(command)) {
    process.stdout.write(HELP);
    return 0;
  }
  if (['--version', '-v', 'version'].includes(command)) {
    process.stdout.write(`${AGENT_INVARIANTS_VERSION}\n`);
    return 0;
  }

  switch (command) {
    case 'init':
      await init(argv[1] ?? '.');
      return 0;
    case 'validate': {
      const options = reportOptions(argv.slice(1));
      if (!options.contract) throw new Error('--contract is required.');
      const contract = await loadContract(options.contract);
      process.stdout.write(`${JSON.stringify({ valid: true, contract }, null, 2)}\n`);
      return 0;
    }
    case 'summary': {
      const options = reportOptions(argv.slice(1));
      if (!options.trace) throw new Error('--trace is required.');
      process.stdout.write(`${JSON.stringify(summarizeTrace(await readTrace(options.trace)), null, 2)}\n`);
      return 0;
    }
    case 'check': {
      const options = reportOptions(argv.slice(1));
      if (!options.contract || !options.trace) throw new Error('--contract and --trace are required.');
      const report = checkTrace(await loadContract(options.contract), await readTrace(options.trace));
      await emit(renderCheckReport(report, options.format, options.trace), options.output);
      return report.passed ? 0 : 1;
    }
    case 'compare': {
      const options = reportOptions(argv.slice(1));
      if (!options.contract || !options.baseline || !options.candidate) throw new Error('--contract, --baseline, and --candidate are required.');
      const report = compareTraces(await loadContract(options.contract), await readTrace(options.baseline), await readTrace(options.candidate));
      await emit(renderCompatibilityReport(report, options.format), options.output);
      return report.compatible ? 0 : 1;
    }
    default:
      throw new Error(`Unknown command: ${command}\n\n${HELP}`);
  }
}
