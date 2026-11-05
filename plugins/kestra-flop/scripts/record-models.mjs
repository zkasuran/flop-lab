// SPDX-License-Identifier: Apache-2.0
import { writeFile } from 'node:fs/promises';
const source = 'https://api.flop.network/v1/models';
const response = await fetch(source, { headers: { 'User-Agent': 'flop-lab-kestra/0.1' }, signal: AbortSignal.timeout(30000) });
if (!response.ok) throw new Error(`HTTP ${response.status}`);
const raw = await response.text();
JSON.parse(raw);
const measuredAt = new Date().toISOString();
await writeFile(new URL('../src/test/resources/fixtures/models.json', import.meta.url), raw);
await writeFile(new URL('../src/test/resources/fixtures/models.metadata.json', import.meta.url), JSON.stringify({ source, measuredAt, requestCount: 1 }, null, 2) + '\n');
console.log(JSON.stringify({ source, measuredAt, bytes: Buffer.byteLength(raw), requestCount: 1 }));
