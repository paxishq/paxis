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

Tests run against `paxis_test` on the same `db` service as local dev (port 15151). One Postgres instance, two database names. `test-setup.ts` creates `paxis_test` on first run if it doesn't exist.

Start the DB before running tests:

```sh
docker compose up db -d
```

## test-setup.ts

Loaded via `bunfig.toml` preload. Creates `paxis_test` if needed, runs migrations, and truncates between tests.

**Critical:** `DATABASE_URL` must contain `"test"` — `test-setup.ts` throws otherwise.

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

## What Must Always Be Tested

- Auth middleware — session derivation and rejection for enterprise and supplier roles
- Every agent function — must write an audit log entry on every code path
- Zod validation — invalid LLM output must throw before hitting any downstream logic
- Supply chain aggregation — Scope 3 math must be deterministically tested with known fixtures
- ESRS report generation — output must match expected ESRS schema structure

---

*Last updated: 2026-05-14*
