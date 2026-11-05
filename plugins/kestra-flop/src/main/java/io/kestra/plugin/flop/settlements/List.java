// SPDX-License-Identifier: Apache-2.0
package io.kestra.plugin.flop.settlements;

import io.kestra.core.models.annotations.Example;
import io.kestra.core.models.annotations.Plugin;
import io.kestra.core.models.property.Property;
import io.kestra.core.models.tasks.RunnableTask;
import io.kestra.core.runners.RunContext;
import io.kestra.core.serializers.FileSerde;
import io.kestra.plugin.flop.*;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.*;
import lombok.experimental.SuperBuilder;
import java.io.BufferedOutputStream;
import java.nio.file.Files;
import java.net.URI;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;

@SuperBuilder @ToString @EqualsAndHashCode @Getter @NoArgsConstructor
@Schema(title = "List FLOP settlements", description = "Reads descending settlement pages up to maxResults. Each row retains source and measuredAt. Pagination is not an atomic chain snapshot.")
@Plugin(examples = @Example(title = "Read a bounded settlement tape", full = true, code = """
    id: flop_settlements
    namespace: company.flop
    tasks:
      - id: tape
        type: io.kestra.plugin.flop.settlements.List
        maxResults: 100
        store: true
    """))
public class List extends AbstractFlopTask implements RunnableTask<List.Output> {
    @Schema(title = "Miner address filter") private Property<String> miner;
    @Schema(title = "Agent address filter") private Property<String> agent;
    @Schema(title = "Model filter", description = "Passed to the hosted tool as model.") private Property<String> model;
    @Schema(title = "GPU SKU filter") private Property<String> sku;
    @Schema(title = "Assurance tier filter") private Property<String> tier;
    @Schema(title = "Maximum rows", description = "From 1 to 10000.", defaultValue = "100") private Property<Integer> maxResults;
    @Schema(title = "Starting offset", defaultValue = "0") private Property<Integer> offset;
    @Schema(title = "Write an ION file", description = "Rows remain available as output. The URI points to Kestra internal storage.", defaultValue = "false") private Property<Boolean> store;

    @Override
    public Output run(RunContext context) throws Exception {
        Map<String, Object> filters = new LinkedHashMap<>();
        add(context, filters, "miner", miner); add(context, filters, "agent", agent); add(context, filters, "model", model);
        add(context, filters, "sku", sku); add(context, filters, "tier", tier);
        var client = client(context);
        var batch = Settlements.collect(client, filters, context.render(maxResults).as(Integer.class).orElse(100), context.render(offset).as(Integer.class).orElse(0));
        URI uri = null;
        if (context.render(store).as(Boolean.class).orElse(false)) {
            var file = context.workingDir().createTempFile(".ion");
            try (var writer = new BufferedOutputStream(Files.newOutputStream(file))) {
                for (var row : batch.rows()) FileSerde.write(writer, row);
            }
            uri = context.storage().putFile(file.toFile());
        }
        return Output.builder().rows(batch.rows()).count(batch.rows().size()).total(batch.total()).truncated(batch.truncated())
            .nextOffset(batch.nextOffset()).uri(uri).measuredAt(batch.measuredAt()).source(batch.source()).requestCount(client.requests()).build();
    }

    private static void add(RunContext ctx, Map<String, Object> filters, String key, Property<String> value) throws Exception {
        ctx.render(value).as(String.class).filter(v -> !v.isBlank()).ifPresent(v -> filters.put(key, v));
    }

    @Builder @Getter
    public static class Output implements io.kestra.core.models.tasks.Output {
        @Schema(title = "Observed settlement rows") private final java.util.List<Map<String, Object>> rows;
        @Schema(title = "Returned row count") private final Integer count;
        @Schema(title = "Server-reported total on the final page") private final Long total;
        @Schema(title = "More rows existed on the final page") private final Boolean truncated;
        @Schema(title = "Next offset", description = "The live tape can move between calls.") private final Integer nextOffset;
        @Schema(title = "Optional ION file URI") private final URI uri;
        @Schema(title = "Last page receipt time") private final Instant measuredAt;
        @Schema(title = "Source endpoint and tool") private final String source;
        @Schema(title = "HTTP attempts including retries") private final Integer requestCount;
    }
}
