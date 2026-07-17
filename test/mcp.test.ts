import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const entry = fileURLToPath(new URL('../src/index.js', import.meta.url));

function cleanEnv(): Record<string, string> {
  return Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
}

function payload(result: unknown): any {
  const content = (result as { content: Array<{ type: string; text?: string }> }).content[0];
  if (!content || content.type !== 'text' || typeof content.text !== 'string') throw new Error('Expected a text tool result.');
  return JSON.parse(content.text);
}

test('MCP server exposes deterministic validation, check, compare, and summary tools', async () => {
  const transport = new StdioClientTransport({ command: process.execPath, args: [entry, 'serve'], env: cleanEnv() });
  const client = new Client({ name: 'agent-invariants-tests', version: '1.0.0' });
  const contract = { version: 1, name: 'mcp', rules: [{ id: 'no-shell', kind: 'deny_tool', tool: 'shell.*' }] };
  try {
    await client.connect(transport);
    const tools = await client.listTools();
    assert.deepEqual(tools.tools.map((tool) => tool.name).sort(), [
      'agent_invariants_check_trace',
      'agent_invariants_compare_traces',
      'agent_invariants_summarize_trace',
      'agent_invariants_validate_contract',
    ]);
    const prompts = await client.listPrompts();
    assert.equal(prompts.prompts[0]?.name, 'protect-behavior-change');

    const valid = payload(await client.callTool({ name: 'agent_invariants_validate_contract', arguments: { contract } }));
    assert.equal(valid.valid, true);
    const checked = payload(await client.callTool({
      name: 'agent_invariants_check_trace',
      arguments: { contract, events: [{ seq: 1, type: 'tool.call', tool: 'shell.delete' }] },
    }));
    assert.equal(checked.passed, false);
    const comparison = payload(await client.callTool({
      name: 'agent_invariants_compare_traces',
      arguments: {
        contract,
        baseline: [{ seq: 1, type: 'run.start' }],
        candidate: [{ seq: 1, type: 'tool.call', tool: 'shell.delete' }],
      },
    }));
    assert.equal(comparison.compatible, false);
    const summary = payload(await client.callTool({
      name: 'agent_invariants_summarize_trace',
      arguments: { events: [{ seq: 1, type: 'tool.call', tool: 'mail.send' }] },
    }));
    assert.deepEqual(summary.tools, ['mail.send']);
  } finally {
    await client.close();
  }
});
