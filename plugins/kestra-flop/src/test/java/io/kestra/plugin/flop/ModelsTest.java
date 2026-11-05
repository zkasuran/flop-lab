// SPDX-License-Identifier: Apache-2.0
package io.kestra.plugin.flop;

import com.fasterxml.jackson.databind.node.ObjectNode;
import io.kestra.core.models.property.Property;
import io.kestra.plugin.flop.models.Catalog;
import io.kestra.plugin.flop.inference.ChatCompletion;
import java.time.Instant;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class ModelsTest extends FlopTest {
    private static final String MODEL = "qwen/qwen2.5-0.5b-instruct";
    private static final Instant NOW = Instant.parse("2026-11-05T10:00:00Z");

    private ObjectNode feed(String price, Instant expires) throws Exception {
        ObjectNode feed = (ObjectNode) Json.parse(Fixtures.read("models.json"));
        var model = (ObjectNode) feed.path("data").get(0);
        var sources = ((ObjectNode) model.path("x-flop")).putArray("price_sources");
        sources.addObject().put("miner_address", "mock-miner").put("source", "synthetic-test-quote")
            .put("effective_at", "2026-01-01T00:00:00Z").put("expires_at", expires.toString())
            .put("price_per_gflop", price).put("price_unit", "FLOP/GFLOP");
        return feed;
    }
    private FlopClient.Observation observation(ObjectNode feed) { return new FlopClient.Observation(feed, NOW, "mock"); }
    private ChatCompletion.ChatCompletionBuilder<?, ?> chat() {
        return ChatCompletion.builder().id("chat").type(ChatCompletion.class.getName()).gatewayUrl(Property.ofValue(server.url() + "/v1"))
            .apiKey(Property.ofValue("mock-key-value")).model(Property.ofValue(MODEL)).prompt(Property.ofValue("Hello"))
            .maxPricePerGflop(Property.ofValue("0.01")).maxCostFlop(Property.ofValue("0.02")).maxTokens(Property.ofValue(32));
    }
    private String completion() {
        return "{\"id\":\"mock\",\"object\":\"chat.completion\",\"created\":1,\"model\":\"" + MODEL + "\",\"choices\":[{\"index\":0,\"message\":{\"role\":\"assistant\",\"content\":\"Hello\"},\"finish_reason\":\"stop\"}],\"usage\":{\"prompt_tokens\":1,\"completion_tokens\":1,\"total_tokens\":2}}";
    }

    @Test void realModelRecordingKeepsMissingPricesAndMarksExpiry() throws Exception {
        var original = (ObjectNode) Json.parse(Fixtures.read("models.json"));
        var rows = Catalog.rows(observation(original), Instant.parse("2099-01-01T00:00:00Z"));
        assertEquals(original.path("data").size(), rows.size());
        var sources = (java.util.List<?>) rows.getFirst().get("priceSources");
        assertFalse(sources.isEmpty());
        assertEquals(true, ((java.util.Map<?, ?>) sources.getFirst()).get("expired"));
        assertThrows(IllegalStateException.class, () -> Catalog.cheapest(observation(original), MODEL, NOW));
        server.reply("/v1/models", 200, original.toString());
        var output = io.kestra.plugin.flop.models.List.builder().id("models").type(io.kestra.plugin.flop.models.List.class.getName())
            .gatewayUrl(Property.ofValue(server.url() + "/v1")).build().run(context());
        assertEquals(rows.size(), output.getCount()); assertEquals(1, output.getRequestCount());
    }

    @Test void refusesExpiredFutureUnknownUnitsAndInvalidPrices() throws Exception {
        assertThrows(IllegalStateException.class, () -> Catalog.cheapest(observation(feed("0.01", NOW)), MODEL, NOW));
        var future = feed("0.01", NOW.plusSeconds(100));
        ((ObjectNode) future.path("data").get(0).path("x-flop").path("price_sources").get(0)).put("effective_at", NOW.plusSeconds(10).toString());
        assertThrows(IllegalStateException.class, () -> Catalog.cheapest(observation(future), MODEL, NOW));
        var wrongUnit = feed("0.01", NOW.plusSeconds(100));
        ((ObjectNode) wrongUnit.path("data").get(0).path("x-flop").path("price_sources").get(0)).put("price_unit", "tokens");
        assertThrows(IllegalStateException.class, () -> Catalog.cheapest(observation(wrongUnit), MODEL, NOW));
        assertThrows(IllegalArgumentException.class, () -> Catalog.cheapest(observation(feed("NaN", NOW.plusSeconds(100))), MODEL, NOW));
    }

    @Test void cheapestQuoteAndExactBoundaryAreUsedBeforeSinglePaidCall() throws Exception {
        var feed = feed("0.01", Instant.now().plusSeconds(60));
        var sources = (com.fasterxml.jackson.databind.node.ArrayNode) feed.path("data").get(0).path("x-flop").path("price_sources");
        var expensive = sources.get(0).deepCopy(); ((ObjectNode) expensive).put("price_per_gflop", "0.02"); sources.add(expensive);
        server.reply("/v1/models", 200, feed.toString());
        server.reply("/v1/chat/completions", 200, completion());
        var output = chat().build().run(context());
        assertEquals("0.01", output.getObservedPricePerGflop()); assertEquals(2, output.getRequestCount());
        assertEquals(2, output.getUsage().get("total_tokens"));
        assertFalse(server.requests.getFirst().headers().containsKey("authorization"));
        assertEquals("Bearer mock-key-value", server.requests.get(1).headers().get("authorization"));
        var body = Json.parse(server.requests.get(1).body());
        assertEquals("0.02", body.path("max_cost_flop").asText()); assertFalse(body.path("stream").asBoolean());
    }

    @Test void oneDecimalUnitAboveCeilingNeverCallsChat() throws Exception {
        server.reply("/v1/models", 200, feed("0.010000000000000000000001", Instant.now().plusSeconds(60)).toString());
        assertThrows(IllegalStateException.class, () -> chat().build().run(context()));
        assertEquals(1, server.requests.size()); assertEquals("/v1/models", server.requests.getFirst().path());
    }

    @Test void missingQuoteAndBadInputNeverCallChat() throws Exception {
        assertThrows(IllegalArgumentException.class, () -> chat().maxCostFlop(Property.ofValue("-1")).build().run(context()));
        assertTrue(server.requests.isEmpty());
        server.reply("/v1/models", 200, Fixtures.read("models.json"));
        assertThrows(IllegalStateException.class, () -> chat().build().run(context()));
        assertEquals(1, server.requests.size());
        assertFalse(chat().build().toString().contains("mock-key-value"));
    }
}
