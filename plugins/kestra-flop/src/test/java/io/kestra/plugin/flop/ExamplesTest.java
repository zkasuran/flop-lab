// SPDX-License-Identifier: Apache-2.0
package io.kestra.plugin.flop;

import io.kestra.core.models.annotations.Plugin;
import io.kestra.core.serializers.JacksonMapper;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class ExamplesTest {
    @Test void everyExampleIsACompleteYamlFlow() throws Exception {
        for (Class<?> type : java.util.List.of(io.kestra.plugin.flop.network.Stats.class, io.kestra.plugin.flop.models.List.class,
            io.kestra.plugin.flop.settlements.List.class, io.kestra.plugin.flop.settlements.Verify.class,
            io.kestra.plugin.flop.settlements.NewSettlement.class, io.kestra.plugin.flop.inference.ChatCompletion.class)) {
            for (var example : type.getAnnotation(Plugin.class).examples()) {
                assertTrue(example.full());
                var flow = JacksonMapper.ofYaml().readTree(String.join("\n", example.code()));
                assertFalse(flow.path("id").asText().isBlank()); assertFalse(flow.path("namespace").asText().isBlank());
                assertTrue(flow.path("tasks").isArray()); assertFalse(flow.path("tasks").isEmpty());
                for (var task : flow.path("tasks")) assertNotNull(Class.forName(task.path("type").asText()));
            }
        }
    }
}
