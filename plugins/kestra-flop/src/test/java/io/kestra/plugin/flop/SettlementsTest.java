// SPDX-License-Identifier: Apache-2.0
package io.kestra.plugin.flop;

import io.kestra.core.models.property.Property;
import io.kestra.core.serializers.FileSerde;
import io.kestra.plugin.flop.settlements.Settlements;
import io.kestra.plugin.flop.settlements.Verify;
import io.kestra.plugin.flop.network.Stats;
import org.junit.jupiter.api.Test;
import java.util.Map;
import static org.junit.jupiter.api.Assertions.*;

class SettlementsTest extends FlopTest {
    @Test void statsTaskMapsRecordedCounters() throws Exception {
        server.reply("/mcp", 200, Fixtures.read("call-flop_get_stats.sse"));
        var output = Stats.builder().id("stats").type(Stats.class.getName()).mcpUrl(Property.ofValue(server.url() + "/mcp")).build().run(context());
        assertEquals(5958L, output.getAccounts()); assertEquals(0L, output.getProofs());
        assertNotNull(output.getMeasuredAt()); assertEquals(1, output.getRequestCount());
    }

    @Test void listPagesFiltersAndIonStoreAgree() throws Exception {
        server.reply("/mcp", 200, Fixtures.page(100, 0, true, Fixtures.row("a", 12)));
        server.reply("/mcp", 200, Fixtures.page(99, 1, false, Fixtures.row("b", 11)));
        var context = context();
        var output = io.kestra.plugin.flop.settlements.List.builder().id("tape").type(io.kestra.plugin.flop.settlements.List.class.getName())
            .mcpUrl(Property.ofValue(server.url() + "/mcp")).miner(Property.ofValue("miner-filter"))
            .store(Property.ofValue(true)).build().run(context);
        assertEquals(2, output.getCount()); assertEquals(2, output.getRequestCount()); assertFalse(output.getTruncated());
        assertEquals("miner-filter", Json.parse(server.requests.getFirst().body()).path("params").path("arguments").path("miner").asText());
        assertEquals(1, Json.parse(server.requests.get(1).body()).path("params").path("arguments").path("offset").intValue());
        assertNotNull(output.getUri());
        try (var input = context.storage().getFile(output.getUri())) {
            var stored = new java.util.ArrayList<Object>();
            FileSerde.read(input, stored::add);
            assertEquals(2, stored.size());
            assertEquals("a", ((Map<?, ?>) stored.get(0)).get("channelId"));
            assertEquals("b", ((Map<?, ?>) stored.get(1)).get("channelId"));
        }
        assertNotNull(output.getRows().getFirst().get("measuredAt"));
    }

    @Test void boundsEmptyAndHostilePages() throws Exception {
        server.reply("/mcp", 200, Fixtures.page(1, 0, true, Fixtures.row("a", 12)));
        assertTrue(Settlements.collect(client(), Map.of(), 1, 0).truncated());
        server.reply("/mcp", 200, Fixtures.page(100, 0, false));
        assertTrue(Settlements.collect(client(), Map.of(), 100, 0).rows().isEmpty());
        assertThrows(IllegalArgumentException.class, () -> Settlements.collect(client(), Map.of(), 0, 0));
        server.reply("/mcp", 200, Fixtures.page(100, 0, true));
        assertThrows(FlopClient.FlopException.class, () -> Settlements.collect(client(), Map.of(), 100, 0));
        server.reply("/mcp", 200, Fixtures.page(100, 0, true, Fixtures.row("a", 12)));
        server.reply("/mcp", 200, Fixtures.page(99, 1, false, Fixtures.row("a", 12)));
        assertThrows(FlopClient.FlopException.class, () -> Settlements.collect(client(), Map.of(), 100, 0));
    }

    @Test void exactArithmeticRejectsOneRawUnitNegativeAndOrdering() throws Exception {
        var row = Fixtures.row("a", 12);
        assertEquals("PASS", Verify.check(java.util.List.of(Json.map(row))).getStatus());
        row.put("minerPaid", Json.amount(row, "minerPaid").add(java.math.BigInteger.ONE).toString());
        assertEquals("FAIL", Verify.check(java.util.List.of(Json.map(row))).getStatus());
        row.put("escrow", "0"); row.put("minerPaid", "-1"); row.put("unusedEscrow", "1"); row.put("burned", "0");
        assertEquals("FAIL", Verify.check(java.util.List.of(Json.map(row))).getStatus());
        assertEquals("FAIL", Verify.check(java.util.List.of(Json.map(Fixtures.row("a", 11)), Json.map(Fixtures.row("b", 12)))).getStatus());
        row.put("escrow", 0.1);
        assertEquals("FAIL", Verify.check(java.util.List.of(Json.map(row))).getStatus());
        assertEquals("NO_DATA", Verify.check(java.util.List.of()).getStatus());
    }

    @Test void mismatchFailsTheTaskUnlessExplicitlyDisabled() throws Exception {
        var row = Fixtures.row("a", 12); row.put("burned", "1");
        var rows = Property.ofValue(java.util.List.of(Json.map(row)));
        assertThrows(IllegalStateException.class, () -> Verify.builder().id("v").type(Verify.class.getName()).settlements(rows).build().run(context()));
        assertEquals("FAIL", Verify.builder().id("v").type(Verify.class.getName()).settlements(rows).failOnMismatch(Property.ofValue(false)).build().run(context()).getStatus());
    }
}
