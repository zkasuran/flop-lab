// SPDX-License-Identifier: Apache-2.0
package io.kestra.plugin.flop.settlements;

import com.fasterxml.jackson.databind.JsonNode;
import io.kestra.core.models.annotations.Example;
import io.kestra.core.models.annotations.Plugin;
import io.kestra.core.models.conditions.ConditionContext;
import io.kestra.core.models.executions.Execution;
import io.kestra.core.models.property.Property;
import io.kestra.core.models.triggers.*;
import io.kestra.core.serializers.JacksonMapper;
import io.kestra.core.storages.kv.*;
import io.kestra.plugin.flop.*;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.*;
import lombok.experimental.SuperBuilder;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

@SuperBuilder @ToString @EqualsAndHashCode @Getter @NoArgsConstructor
@Schema(title = "Start a flow for new FLOP settlements", description = "First poll records the current block and event keys without replay. Later polls emit newer blocks and unseen events at the cursor block. The namespace KV cursor moves only after execution creation. Deduplicate event keys downstream. Indexer backfills below the cursor are outside this trigger.")
@Plugin(examples = @Example(title = "Check newly indexed settlements", full = true, code = """
    id: flop_on_settlement
    namespace: company.flop
    triggers:
      - id: tape
        type: io.kestra.plugin.flop.settlements.NewSettlement
        interval: PT1M
        maxResults: 1000
    tasks:
      - id: verify
        type: io.kestra.plugin.flop.settlements.Verify
        settlements: "{{ trigger.rows }}"
    """))
public class NewSettlement extends AbstractTrigger implements PollingTriggerInterface, TriggerOutput<NewSettlement.Output> {
    @Builder.Default @Schema(title = "Poll interval", defaultValue = "PT1M") private final Duration interval = Duration.ofMinutes(1);
    @Schema(title = "MCP endpoint", description = "Hosted endpoint by default. HTTPS or loopback HTTP.") private Property<String> mcpUrl;
    @Schema(title = "Maximum rows per poll", description = "1 to 10000. If a poll cannot reach the cursor it fails without advancing it. Increase this bound to catch up.", defaultValue = "1000") private Property<Integer> maxResults;

    @Override
    public Optional<Execution> evaluate(ConditionContext condition, TriggerContext trigger) throws Exception {
        if (interval == null || interval.compareTo(Duration.ofSeconds(10)) < 0) throw new IllegalArgumentException("interval must be at least PT10S");
        var context = condition.getRunContext();
        var client = new FlopClient(context, context.render(mcpUrl).as(String.class).orElse(null), null);
        KVStore kv = context.namespaceKv(trigger.getNamespace());
        String key = StatefulTriggerService.defaultKey(trigger.getNamespace(), trigger.getFlowId(), trigger.getTriggerId());
        Cursor cursor = read(kv, key);
        Settlements.Batch batch;
        try {
            batch = Settlements.collect(client, Map.of(), context.render(maxResults).as(Integer.class).orElse(1000), 0);
        } catch (FlopClient.FlopException e) {
            if (e.getStatus() == 429 || e.getStatus() >= 500 || "network".equals(e.getKind())) {
                context.logger().warn("FLOP poll skipped; cursor retained: {}", e.getMessage());
                return Optional.empty();
            }
            throw e;
        }
        Cursor newest = position(batch.rows());
        if (cursor == null) {
            write(kv, key, newest);
            context.logger().info("FLOP first poll recorded position at block {}", newest.block());
            return Optional.empty();
        }
        if (newest.block() < cursor.block()) throw new IllegalStateException("Settlement tape moved behind the cursor. Check for a devnet reset before deleting this trigger's KV cursor");
        if (batch.truncated()) {
            long oldest = ((Number) batch.rows().getLast().get("settledBlock")).longValue();
            if (oldest >= cursor.block()) throw new IllegalStateException("Poll limit cannot reach below the cursor. Increase maxResults; cursor retained");
        }
        var changed = new ArrayList<Map<String, Object>>();
        for (var row : batch.rows()) {
            JsonNode node = JacksonMapper.ofJson().valueToTree(row);
            long block = Json.count(node, "settledBlock");
            if (block > cursor.block() || block == cursor.block() && !cursor.keys().contains(Settlements.eventKey(node))) changed.add(row);
        }
        if (changed.isEmpty()) return Optional.empty();
        if (newest.block() == cursor.block()) newest.keys().addAll(cursor.keys());
        var output = Output.builder().rows(changed).count(changed.size()).measuredAt(batch.measuredAt())
            .source(batch.source()).requestCount(client.requests()).build();
        // Creation failures preserve the cursor. A KV write failure can replay the same events.
        Execution execution = createExecution(condition, trigger, output);
        write(kv, key, newest);
        return Optional.of(execution);
    }

    /** Execution creation boundary, separated for failure injection. Example: override to test a failed creation. */
    protected Execution createExecution(ConditionContext condition, TriggerContext trigger, Output output) throws Exception {
        return TriggerService.generateExecution(this, condition, trigger, output);
    }

    private static Cursor position(java.util.List<Map<String, Object>> rows) {
        long newest = -1;
        long previous = Long.MAX_VALUE;
        Set<String> keys = new HashSet<>();
        for (var row : rows) {
            JsonNode node = JacksonMapper.ofJson().valueToTree(row);
            long block = Json.count(node, "settledBlock");
            if (block > previous) throw Json.invalid("settlement tape is not descending");
            previous = block;
            if (newest == -1) newest = block;
            if (block == newest) keys.add(Settlements.eventKey(node));
        }
        return new Cursor(newest, keys);
    }

    private static Cursor read(KVStore kv, String key) throws Exception {
        var stored = kv.getValue(key);
        if (stored.isEmpty()) return null;
        Object value = stored.get().value();
        JsonNode json = switch (value) {
            case byte[] bytes -> Json.parse(new String(bytes, java.nio.charset.StandardCharsets.UTF_8));
            case String text -> Json.parse(text);
            default -> JacksonMapper.ofJson().valueToTree(value);
        };
        if (!json.path("block").isIntegralNumber() || !json.path("block").canConvertToLong() || json.path("block").longValue() < -1) throw Json.invalid("invalid trigger cursor block");
        Set<String> keys = new HashSet<>();
        for (JsonNode event : Json.array(json.get("keys"), "cursor.keys")) {
            if (!event.isTextual()) throw Json.invalid("invalid trigger event key");
            keys.add(event.textValue());
        }
        return new Cursor(json.get("block").longValue(), keys);
    }

    private static void write(KVStore kv, String key, Cursor cursor) throws Exception {
        byte[] bytes = JacksonMapper.ofJson().writeValueAsBytes(Map.of("block", cursor.block(), "keys", cursor.keys()));
        kv.put(key, new KVValueAndMetadata(new KVMetadata("FLOP NewSettlement cursor", (Duration) null), bytes));
    }
    private record Cursor(long block, Set<String> keys) { }

    @Builder @Getter
    public static class Output implements io.kestra.core.models.tasks.Output {
        @Schema(title = "New settlement rows", description = "Newest block first. Deduplicate by channelId, settledBlock and eventIndex.") private final java.util.List<Map<String, Object>> rows;
        @Schema(title = "New row count") private final Integer count;
        @Schema(title = "Final page receipt time") private final Instant measuredAt;
        @Schema(title = "Source endpoint and tool") private final String source;
        @Schema(title = "HTTP attempts including retries") private final Integer requestCount;
    }
}
