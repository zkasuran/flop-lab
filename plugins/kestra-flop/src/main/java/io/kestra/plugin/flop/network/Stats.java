// SPDX-License-Identifier: Apache-2.0
package io.kestra.plugin.flop.network;

import io.kestra.core.models.annotations.Example;
import io.kestra.core.models.annotations.Plugin;
import io.kestra.core.models.tasks.RunnableTask;
import io.kestra.core.runners.RunContext;
import io.kestra.plugin.flop.*;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.*;
import lombok.experimental.SuperBuilder;
import java.time.Instant;

@SuperBuilder @ToString @EqualsAndHashCode @Getter @NoArgsConstructor
@Schema(title = "Read FLOP network counters", description = "Reads the hosted indexer counters. These are observations rather than independently verified chain state.")
@Plugin(examples = @Example(title = "Observe the devnet", full = true, code = """
    id: flop_stats
    namespace: company.flop
    tasks:
      - id: stats
        type: io.kestra.plugin.flop.network.Stats
    """))
public class Stats extends AbstractFlopTask implements RunnableTask<Stats.Output> {
    @Override
    public Output run(RunContext context) throws Exception {
        FlopClient client = client(context);
        var observation = client.call("flop_get_stats", java.util.Map.of(), 10);
        var stats = Json.object(observation.value().get("stats"), "stats");
        return Output.builder().blockHeight(Json.count(stats, "latestBlockNumber"))
            .accounts(Json.count(stats, "totalAccounts")).operators(Json.count(stats, "activeOperators"))
            .proofs(Json.count(stats, "proofs24h")).measuredAt(observation.measuredAt())
            .source(observation.source()).requestCount(client.requests()).build();
    }

    @Builder @Getter
    public static class Output implements io.kestra.core.models.tasks.Output {
        @Schema(title = "Latest indexed block") private final Long blockHeight;
        @Schema(title = "Total accounts") private final Long accounts;
        @Schema(title = "Active operators") private final Long operators;
        @Schema(title = "Proofs in the indexer's last day") private final Long proofs;
        @Schema(title = "Response receipt time") private final Instant measuredAt;
        @Schema(title = "Source endpoint and tool") private final String source;
        @Schema(title = "HTTP attempts including retries") private final Integer requestCount;
    }
}
