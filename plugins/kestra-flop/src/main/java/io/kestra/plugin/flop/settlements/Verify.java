// SPDX-License-Identifier: Apache-2.0
package io.kestra.plugin.flop.settlements;

import io.kestra.core.models.annotations.Example;
import io.kestra.core.models.annotations.Plugin;
import io.kestra.core.models.property.Property;
import io.kestra.core.models.tasks.RunnableTask;
import io.kestra.core.runners.RunContext;
import io.kestra.core.serializers.JacksonMapper;
import io.kestra.plugin.flop.*;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotNull;
import lombok.*;
import lombok.experimental.SuperBuilder;
import java.math.BigInteger;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.Map;

@SuperBuilder @ToString @EqualsAndHashCode @Getter @NoArgsConstructor
@Schema(title = "Check settlement arithmetic", description = "Checks exact escrow conservation, nonnegative integer amounts and descending settledBlock order. PASS concerns listed fields only. An empty list is NO_DATA.")
@Plugin(examples = @Example(title = "Check the observed tape", full = true, code = """
    id: flop_verify
    namespace: company.flop
    tasks:
      - id: tape
        type: io.kestra.plugin.flop.settlements.List
      - id: verify
        type: io.kestra.plugin.flop.settlements.Verify
        settlements: "{{ outputs.tape.rows }}"
        failOnMismatch: true
    """))
public class Verify extends AbstractFlopTask implements RunnableTask<Verify.Output> {
    @NotNull @Schema(title = "Settlement rows", description = "Pass outputs.tape.rows without sorting. Expected order is newest block first.")
    private Property<java.util.List<Map<String, Object>>> settlements;
    @Schema(title = "Fail on a mismatch", defaultValue = "true") private Property<Boolean> failOnMismatch;

    @Override
    public Output run(RunContext context) throws Exception {
        if (settlements == null) throw new IllegalArgumentException("settlements is required");
        var rows = context.render(settlements).asList(Map.class);
        var output = check(rows);
        if (context.render(failOnMismatch).as(Boolean.class).orElse(true) && "FAIL".equals(output.getStatus())) {
            throw new IllegalStateException("Settlement arithmetic or ordering mismatch: " + output.getResults());
        }
        return output;
    }

    /** Check without HTTP. Example: {@code Verify.check(rows).getStatus()}. */
    public static Output check(java.util.List<? extends Map<?, ?>> rows) {
        var results = new ArrayList<Map<String, Object>>();
        long previous = Long.MAX_VALUE;
        boolean failed = false;
        for (var raw : rows) {
            var row = JacksonMapper.ofJson().valueToTree(raw);
            var reasons = new ArrayList<String>();
            try {
                long block = Json.count(row, "settledBlock");
                if (block > previous) reasons.add("settledBlock is not descending");
                previous = block;
                BigInteger escrow = Json.amount(row, "escrow");
                BigInteger paid = Json.amount(row, "minerPaid");
                BigInteger unused = Json.amount(row, "unusedEscrow");
                BigInteger burned = Json.amount(row, "burned");
                if (escrow.signum() < 0 || paid.signum() < 0 || unused.signum() < 0 || burned.signum() < 0) reasons.add("negative amount");
                if (!paid.add(unused).add(burned).equals(escrow)) reasons.add("minerPaid + unusedEscrow + burned != escrow");
            } catch (FlopClient.FlopException e) { reasons.add(e.getMessage()); }
            var result = new LinkedHashMap<String, Object>();
            result.put("channelId", row.path("channelId").asText("unknown"));
            result.put("status", reasons.isEmpty() ? "PASS" : "FAIL");
            result.put("reasons", reasons);
            result.put("measuredAt", raw.get("measuredAt"));
            result.put("source", raw.get("source"));
            results.add(result);
            failed |= !reasons.isEmpty();
        }
        return Output.builder().status(rows.isEmpty() ? "NO_DATA" : failed ? "FAIL" : "PASS").results(results)
            .checkedAt(Instant.now()).count(rows.size()).build();
    }

    @Builder @Getter
    public static class Output implements io.kestra.core.models.tasks.Output {
        @Schema(title = "Overall result", description = "PASS, FAIL or NO_DATA. This is not a proof check.") private final String status;
        @Schema(title = "Per-row PASS or FAIL with reasons and input provenance") private final java.util.List<Map<String, Object>> results;
        @Schema(title = "Time local arithmetic was checked") private final Instant checkedAt;
        @Schema(title = "Rows checked") private final Integer count;
    }
}
