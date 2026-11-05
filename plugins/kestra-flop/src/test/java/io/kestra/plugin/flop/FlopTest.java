// SPDX-License-Identifier: Apache-2.0
package io.kestra.plugin.flop;

import io.kestra.core.junit.annotations.KestraTest;
import io.kestra.core.runners.RunContext;
import io.kestra.core.runners.RunContextFactory;
import jakarta.inject.Inject;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.AfterEach;

@KestraTest
public abstract class FlopTest {
    @Inject protected RunContextFactory runContextFactory;
    protected MockServer server;
    @BeforeEach void start() throws Exception { server = new MockServer(); }
    @AfterEach void stop() { server.close(); }
    protected RunContext context() { return runContextFactory.of(java.util.Map.of()); }
    protected FlopClient client() { return new FlopClient(context(), server.url() + "/mcp", server.url() + "/v1"); }
}
