// SPDX-License-Identifier: Apache-2.0
package io.kestra.plugin.flop;

import com.fasterxml.jackson.databind.JsonNode;
import io.kestra.core.http.HttpRequest;
import io.kestra.core.http.HttpResponse;
import io.kestra.core.http.client.HttpClient;
import io.kestra.core.http.client.HttpClientException;
import io.kestra.core.http.client.configurations.HttpConfiguration;
import io.kestra.core.http.client.configurations.TimeoutConfiguration;
import io.kestra.core.http.client.configurations.AbstractAuthConfiguration;
import io.kestra.core.models.property.Property;
import io.kestra.core.runners.RunContext;
import java.io.IOException;
import java.net.URI;
import java.time.Duration;
import java.time.Instant;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.util.HashMap;
import java.util.Map;

/** Session-less read client. Example: {@code new FlopClient(ctx, null, null).call("flop_get_stats", Map.of(), 10)}. */
public final class FlopClient {
    public static final String MCP = "https://mcp.flop.network/mcp";
    public static final String GATEWAY = "https://api.flop.network/v1";
    private final RunContext context;
    private final String mcp;
    private final String gateway;
    private final Map<String, Observation> cache = new HashMap<>();
    private long lastRequest;
    private int requests;

    /** Public endpoints by default. Overrides accept HTTP on loopback only. Example: {@code new FlopClient(ctx, null, null)}. */
    public FlopClient(RunContext context, String mcp, String gateway) {
        this.context = context;
        this.mcp = endpoint(mcp, MCP);
        this.gateway = endpoint(gateway, GATEWAY);
    }

    private static String endpoint(String override, String fallback) {
        String value = override == null || override.isBlank() ? fallback : override.replaceAll("/+$", "");
        URI uri = URI.create(value);
        boolean local = "127.0.0.1".equals(uri.getHost()) || "localhost".equals(uri.getHost()) || "[::1]".equals(uri.getHost());
        if (uri.getHost() == null || uri.getUserInfo() != null || uri.getQuery() != null || uri.getFragment() != null ||
            !("https".equals(uri.getScheme()) || local && "http".equals(uri.getScheme()))) {
            throw new IllegalArgumentException("Endpoint must be HTTPS or loopback HTTP without credentials, query or fragment");
        }
        return value;
    }

    /** Call a read tool with a per-client TTL in seconds. Example: {@code client.call("flop_get_stats", Map.of(), 10)}. */
    public synchronized Observation call(String tool, Map<String, Object> arguments, int ttlSeconds) throws Exception {
        if (!java.util.Set.of("flop_get_stats", "flop_list_settlements").contains(tool)) {
            throw new IllegalArgumentException("Unsupported read tool: " + tool);
        }
        String key = tool + arguments;
        Observation old = cache.get(key);
        if (old != null && Instant.now().isBefore(old.measuredAt().plusSeconds(ttlSeconds))) return old;
        Raw response = exchange(mcp, "POST", Map.of("jsonrpc", "2.0", "id", 1, "method", "tools/call",
            "params", Map.of("name", tool, "arguments", arguments)), null, true);
        Observation result = new Observation(decode(response.body(), tool), response.at(), mcp + "#" + tool);
        if (ttlSeconds > 0) cache.put(key, result);
        return result;
    }

    /** Read uncached model prices before a paid request. Example: {@code client.models(false)}. */
    public synchronized Observation models(boolean cached) throws Exception {
        Observation old = cache.get("models");
        if (cached && old != null && Instant.now().isBefore(old.measuredAt().plusSeconds(10))) return old;
        Raw response = exchange(gateway + "/models", "GET", null, null, true);
        Observation result = new Observation(Json.object(Json.parse(response.body()), "models"), response.at(), gateway + "/models");
        cache.put("models", result);
        return result;
    }

    /** Send paid chat once. Example: {@code client.chat(body, apiKey)}. No automatic replay. */
    public synchronized Observation chat(Map<String, Object> body, String apiKey) throws Exception {
        if (apiKey == null || apiKey.isBlank() || apiKey.contains("\r") || apiKey.contains("\n")) {
            throw new IllegalArgumentException("apiKey must be a nonblank single-line value");
        }
        Raw response = exchange(gateway + "/chat/completions", "POST", body, apiKey, false);
        return new Observation(Json.object(Json.parse(response.body()), "completion"), response.at(), gateway + "/chat/completions");
    }

    /** Actual HTTP attempts including retries. Example: {@code client.requests()}. */
    public int requests() { return requests; }

    private Raw exchange(String url, String method, Object body, String apiKey, boolean retry) throws Exception {
        for (int attempt = 0; ; attempt++) {
            long gap = 250 - Duration.ofNanos(System.nanoTime() - lastRequest).toMillis();
            if (lastRequest != 0 && gap > 0) Thread.sleep(gap);
            HttpRequest.HttpRequestBuilder request = HttpRequest.builder().uri(URI.create(url)).method(method)
                .addHeader("User-Agent", "flop-lab-kestra/0.1")
                .addHeader("Accept", "application/json, text/event-stream");
            if (body != null) request.body(HttpRequest.JsonRequestBody.of(body));
            if (apiKey != null) request.addHeader("Authorization", "Bearer " + apiKey);
            HttpResponse<String> response;
            lastRequest = System.nanoTime();
            requests++;
            try (HttpClient client = HttpClient.builder().runContext(context)
                .configuration(HttpConfiguration.builder().allowFailed(Property.ofValue(true)).auth(new SingleAttemptTransport())
                    .followRedirects(Property.ofValue(false)).timeout(TimeoutConfiguration.builder()
                        .connectTimeout(Property.ofValue(Duration.ofSeconds(10)))
                        .readIdleTimeout(Property.ofValue(Duration.ofSeconds(30))).build()).build()).build()) {
                response = client.request(request.build(), String.class);
            } catch (HttpClientException | IOException e) {
                if (retry && attempt < 2) { Thread.sleep(500L << attempt); continue; }
                // Do not expose underlying HTTP exceptions: they can include authenticated request headers.
                throw new FlopException("network", 0, "FLOP transport failed after " + (attempt + 1) + " attempt(s)");
            } catch (RuntimeException e) {
                // Kestra wraps some transport failures in RuntimeException instead of HttpClientException.
                if (!(e.getCause() instanceof IOException)) throw e;
                if (retry && attempt < 2) { Thread.sleep(500L << attempt); continue; }
                throw new FlopException("network", 0, "FLOP transport failed after " + (attempt + 1) + " attempt(s)");
            }
            int status = response.getStatus().getCode();
            if (status < 200 || status >= 300) {
                if (retry && (status == 429 || status >= 500) && attempt < 2) {
                    long delay = retryDelay(response.getHeaders().firstValue("Retry-After").orElse(null), attempt);
                    if (delay <= 30_000) { Thread.sleep(delay); continue; }
                }
                throw new FlopException("http", status, "FLOP answered HTTP " + status);
            }
            String raw = response.getBody();
            if (raw == null || raw.isBlank() || raw.length() > 2_000_000) throw Json.invalid("empty or oversized response");
            return new Raw(raw, Instant.now());
        }
    }

    static long retryDelay(String header, int attempt) {
        long minimum = 500L << attempt;
        if (header == null) return minimum;
        try { return Math.max(minimum, Math.multiplyExact(Long.parseLong(header), 1000)); }
        catch (NumberFormatException | ArithmeticException ignored) {
            try { return Math.max(minimum, Duration.between(Instant.now(), ZonedDateTime.parse(header, DateTimeFormatter.RFC_1123_DATE_TIME)).toMillis()); }
            catch (java.time.DateTimeException e) { return header.matches("[0-9]+") ? Long.MAX_VALUE : minimum; }
        }
    }

    /** Parse JSON-RPC JSON or complete SSE events. Example: {@code FlopClient.decode(raw, "flop_get_stats")}. */
    public static JsonNode decode(String raw, String tool) {
        JsonNode message = null;
        if (raw.stripLeading().startsWith("{")) message = Json.parse(raw);
        else {
            StringBuilder data = new StringBuilder();
            String[] lines = raw.replace("\r\n", "\n").replace('\r', '\n').split("\n", -1);
            // The last split element is an unterminated line, not an SSE event delimiter.
            for (int index = 0; index < lines.length - 1; index++) {
                String line = lines[index];
                if (line.isEmpty() && !data.isEmpty()) {
                    JsonNode frame = Json.parse(data.toString());
                    if (frame.path("id").isIntegralNumber() && frame.path("id").longValue() == 1) {
                        if (message != null) throw Json.invalid("duplicate JSON-RPC response");
                        message = frame;
                    }
                    data.setLength(0);
                } else if (line.startsWith("data:")) {
                    if (!data.isEmpty()) data.append('\n');
                    data.append(line.substring(5).replaceFirst("^ ", ""));
                }
            }
        }
        Json.object(message, "JSON-RPC response");
        if (!"2.0".equals(message.path("jsonrpc").asText()) || !message.path("id").isIntegralNumber() || message.path("id").longValue() != 1) {
            throw Json.invalid("JSON-RPC version or id mismatch");
        }
        if (message.has("error")) throw new FlopException("rpc", 0, tool + " JSON-RPC error: " + message.path("error").path("code").asText("unknown"));
        JsonNode result = Json.object(message.get("result"), "result");
        if (result.has("isError") && Json.bool(result, "isError")) throw new FlopException("tool", 0, tool + " returned isError=true");
        JsonNode content = Json.array(result.get("content"), "content");
        if (content.size() != 1 || !"text".equals(content.get(0).path("type").asText())) throw Json.invalid("expected one tool text result");
        return Json.object(Json.parse(Json.text(content.get(0), "text")), tool);
    }

    /** Observed bytes decoded as JSON, with receipt time and endpoint. Example: {@code observation.measuredAt()}. */
    public record Observation(JsonNode value, Instant measuredAt, String source) { }
    private record Raw(String body, Instant at) { }

    // Kestra 1.3 exposes builder customization through this public hook only.
    // Headers supply auth separately. Disable Apache retries for reads and paid calls so requestCount is exact.
    private static final class SingleAttemptTransport extends AbstractAuthConfiguration {
        @Override public AuthType getType() { return AuthType.BEARER; }
        @Override public void configure(org.apache.hc.client5.http.impl.classic.HttpClientBuilder builder, RunContext context) {
            builder.disableAutomaticRetries();
        }
    }

    /** Distinguishes HTTP, network, protocol and tool failures. Example: {@code error.getStatus() == 429}. */
    public static final class FlopException extends IllegalStateException {
        private final String kind;
        private final int status;
        public FlopException(String kind, int status, String message) { super(message); this.kind = kind; this.status = status; }
        public String getKind() { return kind; }
        public int getStatus() { return status; }
    }
}
