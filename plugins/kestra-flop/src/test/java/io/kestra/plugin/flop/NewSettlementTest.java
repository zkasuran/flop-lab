// SPDX-License-Identifier: Apache-2.0
package io.kestra.plugin.flop;

import io.kestra.core.models.conditions.ConditionContext;
import io.kestra.core.models.executions.Execution;
import io.kestra.core.models.property.Property;
import io.kestra.core.models.triggers.TriggerContext;
import io.kestra.core.utils.TestsUtils;
import io.kestra.plugin.flop.settlements.NewSettlement;
import org.junit.jupiter.api.Test;
import java.util.Optional;
import static org.junit.jupiter.api.Assertions.*;

class NewSettlementTest extends FlopTest {
    private record Poll(NewSettlement trigger, ConditionContext condition, TriggerContext context) {
        Optional<Execution> run() throws Exception { return trigger.evaluate(condition, context); }
    }
    private NewSettlement.NewSettlementBuilder<?, ?> builder() {
        return NewSettlement.builder().id("poll_" + java.util.UUID.randomUUID()).type(NewSettlement.class.getName())
            .mcpUrl(Property.ofValue(server.url() + "/mcp")).maxResults(Property.ofValue(100));
    }
    private Poll poll(NewSettlement trigger) {
        var mock = TestsUtils.mockTrigger(runContextFactory, trigger);
        return new Poll(trigger, mock.getKey(), mock.getValue());
    }
    @Test void firstPollSeedsThenSameBlockEventsAreReturnedOnce() throws Exception {
        var poll = poll(builder().build());
        server.reply("/mcp", 200, Fixtures.page(100, 0, false, Fixtures.row("a", 10)));
        assertTrue(poll.run().isEmpty());
        server.reply("/mcp", 200, Fixtures.page(100, 0, false, Fixtures.row("b", 10), Fixtures.row("a", 10)));
        var execution = poll.run().orElseThrow();
        assertEquals(1, ((Number) execution.getTrigger().getVariables().get("count")).intValue());
        assertTrue(poll.run().isEmpty());
        server.reply("/mcp", 200, Fixtures.page(100, 0, false, Fixtures.row("c", 11), Fixtures.row("b", 10), Fixtures.row("a", 10)));
        assertTrue(poll.run().isPresent());
    }
    @Test void anEmptyInitialTapeStillSeesTheFirstEvent() throws Exception {
        var poll = poll(builder().build());
        server.reply("/mcp", 200, Fixtures.page(100, 0, false)); assertTrue(poll.run().isEmpty());
        server.reply("/mcp", 200, Fixtures.page(100, 0, false, Fixtures.row("a", 10))); assertTrue(poll.run().isPresent());
    }
    @Test void rateLimitsAndOutagesKeepTheCursor() throws Exception {
        var poll = poll(builder().build());
        server.reply("/mcp", 200, Fixtures.page(100, 0, false, Fixtures.row("a", 10))); poll.run();
        server.reply("/mcp", 429, "busy", "120"); assertTrue(poll.run().isEmpty());
        server.reply("/mcp", 503, "down"); assertTrue(poll.run().isEmpty());
        server.reply("/mcp", 200, Fixtures.page(100, 0, false, Fixtures.row("b", 11), Fixtures.row("a", 10)));
        assertTrue(poll.run().isPresent());
    }
    @Test void resetAndOverflowFailWithoutAdvancing() throws Exception {
        var poll = poll(builder().maxResults(Property.ofValue(1)).build());
        server.reply("/mcp", 200, Fixtures.page(1, 0, false, Fixtures.row("a", 10))); poll.run();
        server.reply("/mcp", 200, Fixtures.page(1, 0, true, Fixtures.row("b", 11)));
        assertThrows(IllegalStateException.class, poll::run);
        server.reply("/mcp", 200, Fixtures.page(1, 0, false, Fixtures.row("c", 9)));
        assertThrows(IllegalStateException.class, poll::run);
        server.reply("/mcp", 200, Fixtures.page(1, 0, false, Fixtures.row("b", 11))); assertTrue(poll.run().isPresent());
    }
    private static final class FailingCreation extends NewSettlement {
        boolean fail = true;
        FailingCreation(NewSettlementBuilder<?, ?> builder) { super(builder); }
        @Override protected Execution createExecution(ConditionContext condition, TriggerContext trigger, Output output) throws Exception {
            if (fail) throw new IllegalStateException("injected creation failure");
            return super.createExecution(condition, trigger, output);
        }
    }
    @Test void creationFailureReplaysOnTheNextPoll() throws Exception {
        var trigger = new FailingCreation(builder());
        var poll = poll(trigger);
        server.reply("/mcp", 200, Fixtures.page(100, 0, false, Fixtures.row("a", 10))); poll.run();
        server.reply("/mcp", 200, Fixtures.page(100, 0, false, Fixtures.row("b", 11), Fixtures.row("a", 10)));
        assertThrows(IllegalStateException.class, poll::run);
        trigger.fail = false;
        assertTrue(poll.run().isPresent()); assertTrue(poll.run().isEmpty());
    }
}
