// SPDX-License-Identifier: Apache-2.0
package io.kestra.plugin.flop.inference;

import io.kestra.core.models.annotations.Example;
import io.kestra.core.models.annotations.Plugin;
import io.kestra.core.models.annotations.PluginProperty;
import io.kestra.core.models.property.Property;
import io.kestra.core.models.tasks.RunnableTask;
import io.kestra.core.runners.RunContext;
import io.kestra.plugin.flop.*;
import io.kestra.plugin.flop.models.Catalog;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotNull;
import lombok.*;
import lombok.experimental.SuperBuilder;
import java.time.Instant;
import java.util.Map;

@SuperBuilder @ToString @EqualsAndHashCode @Getter @NoArgsConstructor
@Schema(title = "Request guarded FLOP chat completion", description = "Not run against the live gateway. Requires an explicit fresh FLOP/GFLOP quote. The current devnet-nominal feed has none and is refused. Sends paid chat once with max_cost_flop. The discovery price is not a routing or settlement guarantee.")
@Plugin(examples = @Example(title = "Use a gateway with explicit GFLOP quotes", full = true, code = """
    id: flop_chat
    namespace: company.flop
    tasks:
      - id: chat
        type: io.kestra.plugin.flop.inference.ChatCompletion
        apiKey: "{{ secret('FLOP_API_KEY') }}"
        model: qwen/qwen2.5-0.5b-instruct
        prompt: Say hello.
        maxPricePerGflop: "0.01"
        maxCostFlop: "0.01"
        maxTokens: 32
    """))
public class ChatCompletion extends AbstractFlopTask implements RunnableTask<ChatCompletion.Output> {
    @NotNull @PluginProperty(secret = true, group = "connection") @ToString.Exclude
    @Schema(title = "Gateway API key", description = "Use a Kestra secret. Only sent to the configured gateway on the paid request.") private Property<String> apiKey;
    @NotNull @Schema(title = "Model id") private Property<String> model;
    @NotNull @Schema(title = "User prompt") private Property<String> prompt;
    @NotNull @Schema(title = "Maximum discovery price in FLOP per GFLOP", description = "Exact decimal string. Requires price_per_gflop and price_unit: FLOP/GFLOP on a fresh source.") private Property<String> maxPricePerGflop;
    @NotNull @Schema(title = "Total FLOP ceiling", description = "Positive decimal sent as max_cost_flop. Gateway enforcement is not independently verified.") private Property<String> maxCostFlop;
    @Schema(title = "Maximum completion tokens", defaultValue = "128") private Property<Integer> maxTokens;

    @Override
    public Output run(RunContext context) throws Exception {
        String key = context.render(apiKey).as(String.class).filter(v -> !v.isBlank()).orElseThrow(() -> new IllegalArgumentException("apiKey is required"));
        String modelId = context.render(model).as(String.class).filter(v -> !v.isBlank()).orElseThrow(() -> new IllegalArgumentException("model is required"));
        String text = context.render(prompt).as(String.class).filter(v -> !v.isBlank()).orElseThrow(() -> new IllegalArgumentException("prompt is required"));
        var maxPrice = Catalog.decimal(context.render(maxPricePerGflop).as(String.class).orElse(null), "maxPricePerGflop");
        var ceiling = Catalog.decimal(context.render(maxCostFlop).as(String.class).orElse(null), "maxCostFlop");
        if (ceiling.signum() <= 0) throw new IllegalArgumentException("maxCostFlop must be positive");
        int tokens = context.render(maxTokens).as(Integer.class).orElse(128);
        if (tokens < 1 || tokens > 8192) throw new IllegalArgumentException("maxTokens must be 1 to 8192");
        var client = client(context);
        var feed = client.models(false);
        var price = Catalog.cheapest(feed, modelId, Instant.now());
        if (price.compareTo(maxPrice) > 0) throw new IllegalStateException("Cheapest fresh price exceeds maxPricePerGflop");
        var observation = client.chat(Map.of("model", modelId, "messages", java.util.List.of(Map.of("role", "user", "content", text)),
            "stream", false, "max_tokens", tokens, "max_cost_flop", ceiling), key);
        var completion = observation.value();
        Json.text(completion, "id"); Json.count(completion, "created");
        if (!"chat.completion".equals(Json.text(completion, "object")) || !modelId.equals(Json.text(completion, "model"))) throw Json.invalid("completion identity mismatch");
        var choices = Json.array(completion.get("choices"), "choices");
        if (choices.isEmpty()) throw Json.invalid("completion has no choices");
        for (var choice : choices) {
            Json.count(choice, "index"); Json.text(choice, "finish_reason");
            var message = Json.object(choice.get("message"), "message");
            if (!"assistant".equals(Json.text(message, "role")) || !message.has("content") || !(message.get("content").isTextual() || message.get("content").isNull())) throw Json.invalid("invalid assistant message");
        }
        var usage = Json.object(completion.get("usage"), "usage");
        for (String field : java.util.List.of("prompt_tokens", "completion_tokens", "total_tokens")) Json.count(usage, field);
        return Output.builder().completion(Json.map(completion)).usage(Json.map(usage)).observedPricePerGflop(price.toPlainString())
            .priceMeasuredAt(feed.measuredAt()).measuredAt(observation.measuredAt()).source(observation.source()).requestCount(client.requests()).build();
    }

    @Builder @Getter
    public static class Output implements io.kestra.core.models.tasks.Output {
        @Schema(title = "Gateway completion", description = "Receipt extensions are unverified.") private final Map<String, Object> completion;
        @Schema(title = "Gateway-reported usage") private final Map<String, Object> usage;
        @Schema(title = "Cheapest fresh discovery price in FLOP per GFLOP") private final String observedPricePerGflop;
        @Schema(title = "Price feed receipt time") private final Instant priceMeasuredAt;
        @Schema(title = "Completion receipt time") private final Instant measuredAt;
        @Schema(title = "Source endpoint") private final String source;
        @Schema(title = "HTTP attempts including discovery retries") private final Integer requestCount;
    }
}
