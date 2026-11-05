// SPDX-License-Identifier: Apache-2.0
package io.kestra.plugin.flop;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.Map;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import io.kestra.core.serializers.JacksonMapper;

public final class Fixtures {
    private static final Map<String, String> HASHES = Map.of(
        "call-flop_get_stats.sse", "3391ad83a48082770eb6fbe6f5cd99a1ced3fd654512cf203253295acd9c1072",
        "call-flop_list_settlements.sse", "50b0e491b1facb994963b38cf95c9814a7f450dde1446a2aacb26b85c7099812",
        "call-bad-tool.sse", "3210d723d5d02b7e0fcc950782d32d31dc42988a64a1339d13c0fd39440f2f42");

    public static String read(String name) throws Exception {
        Path root = Path.of("../../packages/mcp/fixtures", name);
        byte[] bytes;
        if (Files.isRegularFile(root)) bytes = Files.readAllBytes(root);
        else try (var input = Fixtures.class.getResourceAsStream("/fixtures/" + name)) {
            if (input == null) throw new IllegalStateException("Missing fixture " + name);
            bytes = input.readAllBytes();
        }
        if (HASHES.containsKey(name) && !HASHES.get(name).equals(HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes)))) {
            throw new IllegalStateException("Fixture bytes changed: " + name);
        }
        return new String(bytes, StandardCharsets.UTF_8);
    }

    public static ObjectNode row(String id, long block) throws Exception {
        ObjectNode row = FlopClient.decode(read("call-flop_list_settlements.sse"), "flop_list_settlements").get("data").get(0).deepCopy();
        row.put("channelId", id); row.put("settledBlock", block);
        return row;
    }

    public static String sse(JsonNode value) throws Exception {
        return "event: message\ndata: " + JacksonMapper.ofJson().writeValueAsString(Map.of("jsonrpc", "2.0", "id", 1,
            "result", Map.of("content", java.util.List.of(Map.of("type", "text", "text", value.toString()))))) + "\n\n";
    }

    public static String page(int limit, int offset, boolean more, JsonNode... rows) throws Exception {
        var value = JacksonMapper.ofJson().createObjectNode();
        var array = value.putArray("data");
        for (var row : rows) array.add(row);
        value.set("pagination", JacksonMapper.ofJson().valueToTree(Map.of("limit", limit, "offset", offset, "total", offset + rows.length + (more ? 1 : 0), "hasMore", more)));
        return sse(value);
    }
}
