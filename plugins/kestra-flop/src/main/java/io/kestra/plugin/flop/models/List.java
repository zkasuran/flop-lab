// SPDX-License-Identifier: Apache-2.0
package io.kestra.plugin.flop.models;

import io.kestra.core.models.annotations.Example;
import io.kestra.core.models.annotations.Plugin;
import io.kestra.core.models.tasks.RunnableTask;
import io.kestra.core.runners.RunContext;
import io.kestra.plugin.flop.AbstractFlopTask;
import io.kestra.plugin.flop.Json;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.*;
import lombok.experimental.SuperBuilder;
import java.time.Instant;
import java.util.Map;

@SuperBuilder @ToString @EqualsAndHashCode @Getter @NoArgsConstructor
@Schema(title = "Read FLOP models and price source freshness", description = "Returns the gateway model page with raw model fields and annotated priceSources. Missing GFLOP prices stay missing.")
@Plugin(examples = @Example(title = "Observe model sources", full = true, code = """
    id: flop_models
    namespace: company.flop
    tasks:
      - id: models
        type: io.kestra.plugin.flop.models.List
    """))
public class List extends AbstractFlopTask implements RunnableTask<List.Output> {
    @Override
    public Output run(RunContext context) throws Exception {
        var client = client(context);
        var observation = client.models(true);
        var rows = Catalog.rows(observation, Instant.now());
        return Output.builder().models(rows).count(rows.size()).total(Json.count(observation.value(), "total_count"))
            .truncated(!observation.value().path("links").path("next").isNull()).measuredAt(observation.measuredAt())
            .source(observation.source()).requestCount(client.requests()).build();
    }
    @Builder @Getter
    public static class Output implements io.kestra.core.models.tasks.Output {
        @Schema(title = "Models with annotated price sources") private final java.util.List<Map<String, Object>> models;
        @Schema(title = "Models on this page") private final Integer count;
        @Schema(title = "Gateway-reported total") private final Long total;
        @Schema(title = "Another model page exists") private final Boolean truncated;
        @Schema(title = "Response receipt time") private final Instant measuredAt;
        @Schema(title = "Source endpoint") private final String source;
        @Schema(title = "HTTP attempts including retries") private final Integer requestCount;
    }
}
