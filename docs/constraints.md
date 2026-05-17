# Constraints

Hard constraints for this codebase. Must be respected unconditionally.

---

## Never Do

### Architecture
- Do not write auth logic in route handlers — middleware handles it
- Do not add Docker or managed cloud services in production — `compose.yml` is local dev only
- Do not call LLM APIs directly in agent files — always route through `src/lib/llm.ts`
- Do not write to the audit log outside of agent functions — audit integrity is the product
- Do not expose `DATABASE_URL` or Postgres credentials in logs or API responses

### Database
- Do not modify Drizzle-generated migration files (`src/db/migrations/`)
- Do not modify Better Auth tables manually — let `bunx auth@latest generate` manage them
- Do not use `bun db:generate` + `migrate` — use `bun run db:push` only

### Code
- Do not invoke `node` for any purpose — Bun only, always
- Do not use `process.env` — use `Bun.env`
- Do not write package versions in `package.json` by hand — `bun add <pkg>@latest` on the CLI
- Do not use the `pg` package — use `drizzle-orm/postgres-js`
- Do not hardcode API keys, tokens, or secrets anywhere in source
- Do not send raw PDF/image bytes to text-only LLMs — document parsing always via Gemini Flash
- Do not use raw LLM output without Zod validation — validate at the boundary
- Do not use deprecated TypeScript APIs — check `@deprecated` diagnostics before use

## Always Do

- Generate Better Auth schema (`bunx auth@latest generate`) before first migration
- Run `bun run check:fix` (Biome) before committing
- Run `bun run typecheck` (`tsgo`) before committing
- Use Conventional Commits format — commitlint enforces this on the `commit-msg` hook
- Write to the audit log in every agent function before returning
- Validate all LLM responses with Zod at the point of parsing
- Keep `docs/llm.md` factual and concise — procedures go in `.claude/skills/`

## External API / Rate Limit Notes

| Service | Limit | Notes |
|---------|-------|-------|
| Gemini 3.1 Pro | RPM/TPM per project | Planner Agent; monitor quota during demos |
| Gemini 3.1 Flash | Higher throughput | Document parsing; multimodal; preferred for volume |
| Featherless.ai | Per-account limits | Fallback only; activate with `LLM_PROVIDER=featherless` |

## Regulatory / Legal

- **CSRD** — ESRS output must conform to official ESRS standards; no invented fields
- **EU AI Act** — AI inventory classifications must be audit-ready and documented
- **GDPR** — Postgres hosted in EU (Vultr nbg1/hel1); no EU personal data leaves EU jurisdiction
- **Audit log** — append-only; retention policy must be defined before production launch

---

*Last updated: 2026-05-14*
