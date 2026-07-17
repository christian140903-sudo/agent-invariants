import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createAgentInvariantsServer } from './server.js';

export async function startServer(): Promise<void> {
  const server = createAgentInvariantsServer();
  const transport = new StdioServerTransport();
  try {
    await server.connect(transport);
  } catch (error) {
    console.error('[agent-invariants] MCP server failed:', error);
    process.exitCode = 1;
  }
}
