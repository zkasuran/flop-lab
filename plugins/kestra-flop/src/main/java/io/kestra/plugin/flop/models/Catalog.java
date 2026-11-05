// SPDX-License-Identifier: Apache-2.0
package io.kestra.plugin.flop.models;

import com.fasterxml.jackson.databind.JsonNode;
import io.kestra.plugin.flop.FlopClient;
import io.kestra.plugin.flop.Json;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.Map;

/** Model feed validation and freshness. Example: {@code Catalog.rows(observation, Instant.now())}. */
public final class Catalog {
    private Catalog() { }

    /** Preserve the raw feed and annotate sources. Example: {@code Catalog.rows(client.models(true), Instant.now())}. */
    public static java.util.List<Map<String, Object>> rows(FlopClient.Observation observation, Instant now) {
        var models = new ArrayList<Map<String, Object>>();
        Json.count(observation.value(), "total_count");
        var links = Json.object(observation.value().get("links"), "links");
        if (!links.has("next") || !(links.get("next").isNull() || links.get("next").isTextual())) throw Json.invalid("links.next must be null or string");
        for (JsonNode model : Json.array(observation.value().get("data"), "models.data")) {
            Json.text(model, "id");
            var copy = new LinkedHashMap<>(Json.map(model));
            var sources = new ArrayList<Map<String, Object>>();
            if (model.has("x-flop")) {
                var extension = Json.object(model.get("x-flop"), "x-flop");
                if (extension.has("price_sources")) {
                    for (JsonNode source : Json.array(extension.get("price_sources"), "price_sources")) {
                        Json.text(source, "miner_address"); Json.text(source, "source");
                        Instant effective = instant(source, "effective_at");
                        Instant expires = instant(source, "expires_at");
                        if (!expires.isAfter(effective)) throw Json.invalid("price source expires_at must follow effective_at");
                        var stamped = new LinkedHashMap<>(Json.map(source));
                        stamped.put("expired", !expires.isAfter(now));
                        stamped.put("fresh", !effective.isAfter(now) && expires.isAfter(now));
                        stamped.put("measuredAt", observation.measuredAt().toString());
                        stamped.put("endpoint", observation.source());
                        sources.add(stamped);
                    }
                }
            }
            copy.put("priceSources", sources);
            copy.put("measuredAt", observation.measuredAt().toString());
            copy.put("source", observation.source());
            models.add(copy);
        }
        return models;
    }

    /** Select the cheapest explicit fresh FLOP/GFLOP quote. Example: {@code Catalog.cheapest(feed, modelId, now)}. */
    public static BigDecimal cheapest(FlopClient.Observation observation, String modelId, Instant now) {
        rows(observation, now);
        JsonNode selected = null;
        for (JsonNode row : observation.value().get("data")) {
            if (modelId.equals(row.path("id").asText())) {
                if (selected != null) throw Json.invalid("duplicate model id");
                selected = row;
            }
        }
        if (selected == null) throw new IllegalStateException("Requested model is absent from the observed feed");
        BigDecimal cheapest = null;
        for (JsonNode source : selected.path("x-flop").path("price_sources")) {
            if (instant(source, "effective_at").isAfter(now) || !instant(source, "expires_at").isAfter(now.plusSeconds(1))) continue;
            // The current public feed has no GFLOP quote. Only this explicit optional extension is accepted.
            if (!source.has("price_per_gflop") || !"FLOP/GFLOP".equals(source.path("price_unit").asText())) continue;
            BigDecimal price = decimal(Json.text(source, "price_per_gflop"), "price_per_gflop");
            if (cheapest == null || price.compareTo(cheapest) < 0) cheapest = price;
        }
        if (cheapest == null) throw new IllegalStateException("No fresh explicit FLOP/GFLOP price. Token prices and devnet-nominal sources cannot establish this limit");
        return cheapest;
    }

    /** Decimal without floating point. Example: {@code Catalog.decimal("0.01", "maxCostFlop")}. */
    public static BigDecimal decimal(String value, String name) {
        if (value == null || value.length() > 160 || !value.matches("(0|[1-9][0-9]*)(\\.[0-9]+)?")) {
            throw new IllegalArgumentException(name + " must be a nonnegative decimal string");
        }
        return new BigDecimal(value);
    }

    private static Instant instant(JsonNode source, String key) {
        try { return Instant.parse(Json.text(source, key)); }
        catch (java.time.DateTimeException e) { throw Json.invalid(key + " must be an ISO-8601 instant"); }
    }
}
