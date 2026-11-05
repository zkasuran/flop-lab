// SPDX-License-Identifier: Apache-2.0
import stats from '../tests/fixtures/stats.json';
import settlements from '../tests/fixtures/settlements.json';
import models from '../tests/fixtures/models.json';
import { MCP_URL, MODELS_URL, observationCache, parseMcp, parseMiners, parseSettlements, parseStats, readPublic, type Snapshot } from './devnet';

const readStats = observationCache(async () => parseStats(parseMcp(await readPublic(MCP_URL, 'flop_get_stats'))), `${MCP_URL} / flop_get_stats`, { value: parseStats(parseMcp(stats.raw)), measuredAt: stats.measuredAt });
const readSettlements = observationCache(async () => parseSettlements(parseMcp(await readPublic(MCP_URL, 'flop_list_settlements'))), `${MCP_URL} / flop_list_settlements?limit=5`, { value: parseSettlements(parseMcp(settlements.raw)), measuredAt: settlements.measuredAt });
const readMiners = observationCache(async () => parseMiners(JSON.parse(await readPublic(MODELS_URL))), MODELS_URL, { value: parseMiners(JSON.parse(models.raw)), measuredAt: models.measuredAt });

/** Read independent dated observations. Example: const snapshot = await getSnapshot(). */
export async function getSnapshot(): Promise<Snapshot> {
  const [stats, settlements, miners] = await Promise.all([readStats(), readSettlements(), readMiners()]);
  return { stats, settlements, miners, renderedAt: new Date().toISOString() };
}
