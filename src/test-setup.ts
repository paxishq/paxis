// Test preload — sets env vars required for module imports to not crash.
// Integration tests that need a real DB should set DATABASE_URL explicitly.

Bun.env.DATABASE_URL ??= "postgres://paxis:paxis@localhost:15151/paxis_test";
Bun.env.BETTER_AUTH_SECRET ??= "test-secret-not-used-in-unit-tests";
Bun.env.GOOGLE_CLIENT_ID ??= "test-client-id";
Bun.env.GOOGLE_CLIENT_SECRET ??= "test-client-secret";
Bun.env.NODE_ENV ??= "test";
