# FLOP Kestra plugin

Java 21. Kestra API 1.3.39. The build uses the reference plugin conventions.

- Use `FlopClient` for Kestra HTTP requests and SSE decoding.
- Keep amounts as integer strings. Use BigInteger for settlement checks.
- Record `measuredAt`, source and request count. Empty data is not a passing verification.
- Test local HTTP responses using shared MCP recordings. Do not call live chat.
- Run `./gradlew --no-daemon check` including `lintPluginDocs` in the assigned Java Docker slot.
- Use neutral icons. Do not use the FLOP logo.
- Never log API keys or request bodies on failure.
