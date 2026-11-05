// SPDX-License-Identifier: Apache-2.0
package io.kestra.plugin.flop;

import org.junit.jupiter.api.Test;
import java.util.Map;
import static org.junit.jupiter.api.Assertions.*;

class FlopClientTest extends FlopTest {
    @Test void replaysExactRecordedBytesAndCachesWithOriginalProvenance() throws Exception {
        server.reply("/mcp", 200, Fixtures.read("call-flop_get_stats.sse"));
        var client = client();
        var result = client.call("flop_get_stats", Map.of(), 10);
        assertEquals(2947039, result.value().path("stats").path("latestBlockNumber").longValue());
        assertSame(result, client.call("flop_get_stats", Map.of(), 10));
        assertEquals(1, client.requests());
        var request = server.requests.getFirst();
        assertEquals("flop-lab-kestra/0.1", request.headers().get("user-agent"));
        assertTrue(request.headers().get("accept").contains("text/event-stream"));
        assertTrue(request.headers().get("content-type").contains("application/json"));
        assertEquals("tools/call", Json.parse(request.body()).path("method").asText());
        assertFalse(request.headers().containsKey("authorization"));
        assertEquals(server.url() + "/mcp#flop_get_stats", result.source());
        client.call("flop_get_stats", Map.of(), 0);
        assertEquals(2, client.requests());
        assertTrue((server.requests.get(1).at() - request.at()) / 1_000_000 >= 200);
    }

    @Test void replaysSettlementAndToolErrorRecordings() throws Exception {
        server.reply("/mcp", 200, Fixtures.read("call-flop_list_settlements.sse"));
        assertTrue(client().call("flop_list_settlements", Map.of(), 0).value().path("data").isArray());
        server.reply("/mcp", 200, Fixtures.read("call-bad-tool.sse"));
        var error = assertThrows(FlopClient.FlopException.class, () -> client().call("flop_get_stats", Map.of(), 0));
        assertTrue(error.getMessage().contains("flop_get_stats"));
    }

    @Test void retriesOnlyTransientReadErrorsWithBoundedAttempts() throws Exception {
        server.reply("/mcp", 429, "busy", "0");
        server.reply("/mcp", 503, "down");
        server.reply("/mcp", 200, Fixtures.read("call-flop_get_stats.sse"));
        var client = client();
        client.call("flop_get_stats", Map.of(), 0);
        assertEquals(3, client.requests());
        assertTrue((server.requests.get(1).at() - server.requests.get(0).at()) / 1_000_000 >= 450);
        assertTrue((server.requests.get(2).at() - server.requests.get(1).at()) / 1_000_000 >= 950);
    }

    @Test void stopsOnLongRetryAfterAndOnForbidden() {
        server.reply("/mcp", 429, "busy", "120");
        var error = assertThrows(FlopClient.FlopException.class, () -> client().call("flop_get_stats", Map.of(), 0));
        assertEquals(429, error.getStatus());
        assertEquals(1, server.requests.size());
        server.reply("/mcp", 403, "forbidden");
        assertEquals(403, assertThrows(FlopClient.FlopException.class, () -> client().call("flop_get_stats", Map.of(), 0)).getStatus());
        assertEquals(2, server.requests.size());
        assertEquals(Long.MAX_VALUE, FlopClient.retryDelay("99999999999999999999999999", 0));
    }

    @Test void paidFailureIsSentOnceAndDoesNotEchoCredentials() {
        server.reply("/v1/chat/completions", 503, "do-not-echo-key");
        var error = assertThrows(FlopClient.FlopException.class, () -> client().chat(Map.of("model", "mock"), "do-not-echo-key"));
        assertEquals(1, server.requests.size());
        assertFalse(error.toString().contains("do-not-echo-key"));
        assertNull(error.getCause());
    }

    @Test void transportFailureIsBounded() {
        server.reply("/mcp", 0, "");
        var client = client();
        var error = assertThrows(FlopClient.FlopException.class, () -> client.call("flop_get_stats", Map.of(), 0));
        assertEquals("network", error.getKind());
        assertEquals(3, client.requests());
    }

    @Test void rejectsInvalidEndpointsAndRpcFrames() throws Exception {
        for (String url : java.util.List.of("http://example.com/mcp", "https://u:p@example.com/mcp", "https://example.com/mcp?x=1", "file:///x")) {
            assertThrows(IllegalArgumentException.class, () -> new FlopClient(context(), url, null));
        }
        String raw = Fixtures.read("call-flop_get_stats.sse");
        assertEquals(FlopClient.decode(raw, "stats"), FlopClient.decode(": heartbeat\r\n\r\n" + raw.replace("\n", "\r\n"), "stats"));
        for (String bad : java.util.List.of("", "data: {}\n\n", raw.stripTrailing(), raw.stripTrailing() + "\n", raw.replace("\"id\":1", "\"id\":2"), raw + raw, raw.replace("\"jsonrpc\":\"2.0\"", "\"jsonrpc\":\"1.0\""))) {
            assertThrows(FlopClient.FlopException.class, () -> FlopClient.decode(bad, "stats"));
        }
        assertThrows(FlopClient.FlopException.class, () -> Json.parse("{} {}"));
        assertThrows(FlopClient.FlopException.class, () -> Json.parse("{\"x\":1,\"x\":2}"));
    }
}
