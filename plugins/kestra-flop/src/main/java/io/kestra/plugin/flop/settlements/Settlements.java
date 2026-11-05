// SPDX-License-Identifier: Apache-2.0
package io.kestra.plugin.flop.settlements;

import com.fasterxml.jackson.databind.JsonNode;
import io.kestra.plugin.flop.FlopClient;
import io.kestra.plugin.flop.Json;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.Map;

/** Bounded tape pagination. Example: {@code Settlements.collect(client, Map.of(), 100, 0)}. */
public final class Settlements {
    private Settlements() { }

    /** Collect rows with their own receipt time. Example: {@code collect(client, Map.of("miner", address), 100, 0)}. */
    public static Batch collect(FlopClient client, Map<String, Object> filters, int max, int offset) throws Exception {
        if (max < 1 || max > 10_000 || offset < 0) throw new IllegalArgumentException("maxResults must be 1 to 10000 and offset must be nonnegative");
        var rows = new ArrayList<Map<String, Object>>();
        var seen = new HashSet<String>();
        long total;
        boolean more;
        Instant measuredAt;
        String source;
        do {
            int limit = Math.min(100, max - rows.size());
            Map<String, Object> args = new LinkedHashMap<>(filters);
            args.put("limit", limit);
            args.put("offset", offset);
            var observation = client.call("flop_list_settlements", args, 0);
            measuredAt = observation.measuredAt();
            source = observation.source();
            var data = Json.array(observation.value().get("data"), "settlements.data");
            var pagination = Json.object(observation.value().get("pagination"), "pagination");
            total = Json.count(pagination, "total");
            more = Json.bool(pagination, "hasMore");
            if (Json.count(pagination, "offset") != offset || Json.count(pagination, "limit") != limit || data.size() > limit || more && data.isEmpty()) {
                throw Json.invalid("settlement pagination did not advance as requested");
            }
            for (JsonNode row : data) {
                validate(row);
                if (!seen.add(eventKey(row))) throw Json.invalid("settlement tape changed or repeated a page; retry the snapshot");
                Map<String, Object> stamped = new LinkedHashMap<>(Json.map(row));
                stamped.put("measuredAt", measuredAt.toString());
                stamped.put("source", source);
                rows.add(stamped);
            }
            offset = Math.addExact(offset, data.size());
        } while (more && rows.size() < max);
        return new Batch(java.util.List.copyOf(rows), total, more, offset, measuredAt, source);
    }

    private static void validate(JsonNode row) {
        Json.text(row, "channelId"); Json.text(row, "agent"); Json.text(row, "miner");
        Json.count(row, "settledBlock"); Json.count(row, "settledAt");
        for (String key : java.util.List.of("escrow", "minerPaid", "unusedEscrow", "burned")) Json.amount(row, key);
    }

    /** Stable event key for overlapping polls. Example: {@code Settlements.eventKey(row)}. */
    public static String eventKey(JsonNode row) {
        return Json.text(row, "channelId") + ":" + Json.count(row, "settledBlock") + ":" + row.path("eventIndex").asText("");
    }

    /** A bounded snapshot. Example: {@code batch.truncated()} means more rows exist. */
    public record Batch(java.util.List<Map<String, Object>> rows, long total, boolean truncated, int nextOffset, Instant measuredAt, String source) { }
}
