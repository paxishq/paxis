---
name: tdd
description: |
  Test-driven development: red-green-refactor loop.
  Use when building a feature or fixing a bug with tests as the driver.
  Writes a failing test first, then makes it pass, then refactors.
argument-hint: [feature or bug to implement]
---

# TDD Loop

Work in vertical slices. One slice = one failing test → pass → refactor.
Never write implementation code before a failing test exists.

## Before Starting

1. Read `docs/testing.md` to confirm the test runner and conventions
2. Read `docs/context.md` to use the correct domain vocabulary in test names
3. Confirm the scope with the user if $ARGUMENTS is ambiguous

## Paxis-Specific Setup

- Tests run with `bun test`; test files co-located with source (`foo.ts` → `foo.test.ts`)
- Database: never mock Postgres — tests hit the real test instance (`DATABASE_URL` must contain `"test"`)
- LLM calls: mock at `src/lib/llm.ts` — return typed Zod-validated fixtures, never hit real APIs in tests
- Every agent test must assert that an `audit_log` entry was written — this is non-negotiable
- Use domain language in test names: `it('writes audit log entry when carbon entry is submitted')`

## The Loop

Repeat for each slice:

### 1. Red — Write a failing test

- Write the smallest test that captures one behaviour
- Name it descriptively using domain language from `docs/context.md`
- Run `bun test <file>` and confirm it **fails** for the right reason
- Do not proceed if the test passes immediately — it means the test is wrong or already covered

### 2. Green — Make it pass

- Write the minimum implementation to pass the test
- Do not over-engineer — no abstractions yet, just make it green
- Run `bun test <file>` again and confirm **only the new test changed state**

### 3. Refactor

- Clean up: extract duplication, rename for clarity, improve structure
- Run `bun test` — **all tests must still pass**
- Check `docs/context.md`: are variable/function names consistent with domain language?
- Run `bun run check:fix` and `bun run typecheck` — both must pass before the slice is done

### 4. Confirm slice

Before the next slice, say:
> "Slice complete: [test name]. Tests passing. Ready for next slice."

Ask the user what to tackle next, or propose the next logical slice.

## What Makes a Good Test

✅ Tests one behaviour, not one function
✅ Name describes the scenario, not the implementation
✅ Fails for the right reason before the fix
✅ Does not test private implementation details
✅ Fast enough to run on every save

❌ No `expect(true).toBe(true)` placeholders
❌ No tests that always pass
❌ No real LLM API calls — mock at `src/lib/llm.ts`
❌ No agent test without an `audit_log` assertion

## When to Stop

Stop and surface a question if:
- You're unsure what the correct behaviour should be → ask before testing
- A test requires mocking something complex → discuss the design first
- The failing test reveals an unexpected dependency → flag it before proceeding
