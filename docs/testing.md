# Testing

## Strategy

Unit tests for pure functions and agent logic; integration tests for routes and database queries. No E2E framework yet — the hackathon timeline prioritizes coverage of auth middleware, agent audit-log writes, and Zod validation boundaries.

Core principle: no mocking the database. Tests hit a real Postgres test instance.

External LLM calls (Gemini, Featherless) are mocked at the `src/lib/llm.ts` abstraction boundary — never in individual agent files.

## Tools

| Layer | Tool | Notes |
|-------|------|-------|
| Unit / Integration | Bun test runner | Built-in; no Jest needed |
| Coverage | Bun coverage | 80% threshold in `bunfig.toml` |
| Type checking | `tsgo` (`bun run typecheck`) | Run before committing |
| Linting | Biome.js (`bun run check:fix`) | Run before committing |

## Local Test DB

Tests run against `paxis_test` on the same `db` service as local dev (port 15151). One Postgres instance, two database names.

**`paxis_test` must be created manually** — `test-setup.ts` does not create the database, only validates `DATABASE_URL` contains `"test"` and runs migrations:

```sh
# one-time: create the test database
docker exec paxis-db-1 psql -U paxis -c "CREATE DATABASE paxis_test OWNER paxis;"
```

Start the DB before running tests:

```sh
docker compose up db -d
```

## test-setup.ts

Loaded via `bunfig.toml` preload. Validates that `DATABASE_URL` contains `"test"` (throws otherwise) and sets test environment variables.

**Critical:** `DATABASE_URL` must contain `"test"` — `test-setup.ts` throws otherwise. After creating `paxis_test`, run `bun run db:push` with the test `DATABASE_URL` to apply the schema.

## Running Tests

```sh
# start DB (if not already running)
docker compose up db -d

# apply schema to test DB (required on first run or after schema changes)
DATABASE_URL=postgres://paxis:paxis@localhost:15151/paxis_test bun run db:push

# all tests
DATABASE_URL=postgres://paxis:paxis@localhost:15151/paxis_test bun test

# watch mode
DATABASE_URL=postgres://paxis:paxis@localhost:15151/paxis_test bun test --watch

# single file or directory
DATABASE_URL=postgres://paxis:paxis@localhost:15151/paxis_test bun test src/agents/carbon
```

## Conventions

- Test files co-located with source: `foo.ts` → `foo.test.ts`
- Use domain language from `docs/context.md` in test descriptions
- No mocking the database — tests hit the real test Postgres instance
- Mock external LLM calls at `src/lib/llm.ts` — never in individual agent files
- Agent test names should reference domain objects: `it('writes audit log entry when supplier responds')`
- **`mock.module` leaks across test files** in the same Bun test run. Agent test files that mock `../lib/llm` must include the real `extractJson` implementation in the mock object — do not use an identity function or omit it, or `llm.test.ts` will fail when it runs after agent tests
- Dynamic imports (`const { runX } = await import("./x")`) must come **after** `mock.module()` calls to pick up the mock

## What Must Always Be Tested

- Auth middleware — session derivation and rejection for enterprise and supplier roles
- Every agent function — must write an audit log entry on every code path
- Zod validation — invalid LLM output must throw before hitting any downstream logic
- Supply chain aggregation — Scope 3 math must be deterministically tested with known fixtures
- ESRS report generation — output must match expected ESRS schema structure

---

*Last updated: 2026-05-17 (44 tests across 9 files; added mcp/auth.test.ts, mcp/tools/carbon.test.ts, mcp/tools/questionnaires.test.ts, routes/supplier/assistant.test.ts)*
