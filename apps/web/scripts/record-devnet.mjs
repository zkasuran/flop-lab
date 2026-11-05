// SPDX-License-Identifier: Apache-2.0
import { mkdir, writeFile } from 'node:fs/promises';

const destination = new URL('../tests/fixtures/', import.meta.url);
await mkdir(destination, { recursive: true });
const requests = [
  ['stats', 'https://mcp.flop.network/mcp', 'flop_get_stats', {}],
  ['settlements', 'https://mcp.flop.network/mcp', 'flop_list_settlements', { limit: 5 }],
  ['models', 'https://api.flop.network/v1/models'],
];
for (const [name, url, tool, args] of requests) {
  const started = performance.now();
  const response = await fetch(url, {
    signal: AbortSignal.timeout(10000),
    ...(tool ? { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: tool, arguments: args } }) } : {}),
  });
  const raw = await response.text();
  if (!response.ok || Buffer.byteLength(raw) > 200000) throw new Error(`Recording refused: ${name}, HTTP ${response.status}`);
  const record = { measuredAt: new Date().toISOString(), source: url, tool: tool ?? null, arguments: args ?? null, status: response.status, contentType: response.headers.get('content-type'), elapsedMs: Math.round(performance.now() - started), raw };
  await writeFile(new URL(`${name}.json`, destination), `${JSON.stringify(record, null, 2)}\n`);
  console.log(`${name}: ${record.measuredAt}, ${record.elapsedMs} ms, ${Buffer.byteLength(raw)} bytes, one request`);
}
