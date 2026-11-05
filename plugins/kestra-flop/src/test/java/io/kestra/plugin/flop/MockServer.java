// SPDX-License-Identifier: Apache-2.0
package io.kestra.plugin.flop;

import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.ArrayDeque;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;

public final class MockServer implements AutoCloseable {
    public record Request(String method, String path, Map<String, String> headers, String body, long at) { }
    private record Reply(int status, String body, String retryAfter) { }
    private final HttpServer server;
    private final Map<String, ArrayDeque<Reply>> replies = new ConcurrentHashMap<>();
    private final Map<String, Reply> last = new ConcurrentHashMap<>();
    public final java.util.List<Request> requests = new CopyOnWriteArrayList<>();

    public MockServer() throws Exception {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 3370), 0);
        server.createContext("/", exchange -> {
            var headers = new java.util.HashMap<String, String>();
            exchange.getRequestHeaders().forEach((key, value) -> headers.put(key.toLowerCase(java.util.Locale.ROOT), String.join(",", value)));
            String path = exchange.getRequestURI().getPath();
            requests.add(new Request(exchange.getRequestMethod(), path, headers,
                new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8), System.nanoTime()));
            Reply reply;
            synchronized (this) {
                var queue = replies.get(path);
                reply = queue != null && !queue.isEmpty() ? queue.remove() : last.getOrDefault(path, new Reply(404, "{}", null));
                last.put(path, reply);
            }
            if (reply.status() == 0) { exchange.close(); return; }
            exchange.getResponseHeaders().set("Content-Type", path.equals("/mcp") ? "text/event-stream" : "application/json");
            if (reply.retryAfter() != null) exchange.getResponseHeaders().set("Retry-After", reply.retryAfter());
            byte[] bytes = reply.body().getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(reply.status(), bytes.length);
            exchange.getResponseBody().write(bytes);
            exchange.close();
        });
        server.start();
    }
    public synchronized void reply(String path, int status, String body) { reply(path, status, body, null); }
    public synchronized void reply(String path, int status, String body, String retryAfter) {
        replies.computeIfAbsent(path, ignored -> new ArrayDeque<>()).add(new Reply(status, body, retryAfter));
    }
    public String url() { return "http://127.0.0.1:3370"; }
    @Override public void close() { server.stop(0); }
}
