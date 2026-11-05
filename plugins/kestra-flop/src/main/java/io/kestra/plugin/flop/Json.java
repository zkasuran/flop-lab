// SPDX-License-Identifier: Apache-2.0
package io.kestra.plugin.flop;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.core.type.TypeReference;
import io.kestra.core.serializers.JacksonMapper;
import java.math.BigInteger;
import java.util.Map;

/** Runtime checks at JSON boundaries. Example: {@code Json.text(row, "channelId")}. */
public final class Json {
    private Json() { }

    /** Parse one JSON value. Example: {@code Json.parse("{}")}. */
    public static JsonNode parse(String text) {
        try {
            JsonNode value = JacksonMapper.ofJson().reader()
                .with(com.fasterxml.jackson.databind.DeserializationFeature.FAIL_ON_TRAILING_TOKENS)
                .with(com.fasterxml.jackson.core.JsonParser.Feature.STRICT_DUPLICATE_DETECTION).readTree(text);
            if (value == null) throw invalid("empty JSON");
            return value;
        } catch (java.io.IOException e) {
            throw invalid("invalid JSON");
        }
    }

    /** Require an object. Example: {@code Json.object(answer.get("stats"), "stats")}. */
    public static JsonNode object(JsonNode node, String path) {
        if (node == null || !node.isObject()) throw invalid(path + " must be an object");
        return node;
    }

    /** Require an array. Example: {@code Json.array(answer.get("data"), "data")}. */
    public static JsonNode array(JsonNode node, String path) {
        if (node == null || !node.isArray()) throw invalid(path + " must be an array");
        return node;
    }

    /** Require a nonblank string. Example: {@code Json.text(row, "miner")}. */
    public static String text(JsonNode node, String key) {
        JsonNode value = object(node, key).get(key);
        if (value == null || !value.isTextual() || value.textValue().isBlank()) throw invalid(key + " must be a nonblank string");
        return value.textValue();
    }

    /** Require a nonnegative long integer. Example: {@code Json.count(row, "settledBlock")}. */
    public static long count(JsonNode node, String key) {
        JsonNode value = object(node, key).get(key);
        if (value == null || !value.isIntegralNumber() || !value.canConvertToLong() || value.longValue() < 0) {
            throw invalid(key + " must be a nonnegative long integer");
        }
        return value.longValue();
    }

    /** Require a boolean. Example: {@code Json.bool(page, "hasMore")}. */
    public static boolean bool(JsonNode node, String key) {
        JsonNode value = object(node, key).get(key);
        if (value == null || !value.isBoolean()) throw invalid(key + " must be a boolean");
        return value.booleanValue();
    }

    /** Parse an exact signed integer string. Example: {@code Json.amount(row, "escrow")}. */
    public static BigInteger amount(JsonNode node, String key) {
        String value = text(node, key);
        if (!value.matches("-?(0|[1-9][0-9]*)") || value.length() > 160) throw invalid(key + " must be an integer string");
        return new BigInteger(value);
    }

    /** Convert a validated object to Kestra output. Example: {@code Json.map(stats)}. */
    public static Map<String, Object> map(JsonNode node) {
        return JacksonMapper.ofJson().convertValue(object(node, "output"), new TypeReference<>() { });
    }

    /** Typed boundary error. Example: {@code throw Json.invalid("missing pagination")}. */
    public static FlopClient.FlopException invalid(String message) {
        return new FlopClient.FlopException("protocol", 0, message);
    }
}
