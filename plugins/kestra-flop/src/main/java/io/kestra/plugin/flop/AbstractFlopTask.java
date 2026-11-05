// SPDX-License-Identifier: Apache-2.0
package io.kestra.plugin.flop;

import io.kestra.core.models.annotations.PluginProperty;
import io.kestra.core.models.property.Property;
import io.kestra.core.models.tasks.Task;
import io.kestra.core.runners.RunContext;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.*;
import lombok.experimental.SuperBuilder;

@SuperBuilder
@ToString
@EqualsAndHashCode
@Getter
@NoArgsConstructor
public abstract class AbstractFlopTask extends Task {
    @Schema(title = "MCP endpoint", description = "Hosted read-only endpoint by default. HTTPS or loopback HTTP for tests.")
    @PluginProperty(group = "advanced")
    private Property<String> mcpUrl;

    @Schema(title = "Gateway base URL", description = "Defaults to https://api.flop.network/v1. HTTPS or loopback HTTP for tests.")
    @PluginProperty(group = "advanced")
    private Property<String> gatewayUrl;

    /** Render endpoints once. Example: {@code FlopClient client = client(runContext)}. */
    protected FlopClient client(RunContext context) throws Exception {
        return new FlopClient(context, context.render(mcpUrl).as(String.class).orElse(null), context.render(gatewayUrl).as(String.class).orElse(null));
    }
}
