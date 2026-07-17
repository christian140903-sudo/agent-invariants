import { readFile } from 'node:fs/promises';
import { agentEventSchema, traceSchema } from './schemas.js';
import type { AgentEvent } from './types.js';

const MAX_TRACE_BYTES = 100 * 1024 * 1024;
const MAX_LINE_BYTES = 1024 * 1024;

export function parseTraceText(text: string): AgentEvent[] {
  if (Buffer.byteLength(text, 'utf8') > MAX_TRACE_BYTES) throw new Error('Trace exceeds the 100 MiB input limit.');
  const trimmed = text.trim();
  if (!trimmed) return [];

  let events: AgentEvent[];
  if (trimmed.startsWith('[')) {
    events = traceSchema.parse(JSON.parse(trimmed)) as AgentEvent[];
  } else {
    const lines = text.split(/\r?\n/);
    events = [];
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index]?.trim();
      if (!line || line.startsWith('#')) continue;
      if (Buffer.byteLength(line, 'utf8') > MAX_LINE_BYTES) throw new Error(`Trace line ${index + 1} exceeds 1 MiB.`);
      try {
        events.push(agentEventSchema.parse(JSON.parse(line)) as AgentEvent);
      } catch (error) {
        throw new Error(`Invalid trace event on line ${index + 1}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  let previous = -1;
  for (const event of events) {
    if (event.seq <= previous) throw new Error(`Trace sequence must be strictly increasing; found ${event.seq} after ${previous}.`);
    previous = event.seq;
  }
  return events;
}

export async function readTrace(path: string): Promise<AgentEvent[]> {
  return parseTraceText(await readFile(path, 'utf8'));
}
