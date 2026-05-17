# Paxis — AI Navigation Guide

> This file is the project constitution. It loads in every Claude Code session.
> CLAUDE.md and AGENTS.md symlink here. Procedures belong in `.claude/skills/`, not here.

---

## Project Overview

**What:** Paxis is a two-sided EU compliance OS for enterprise supply chains — enterprises dispatch CSRD questionnaires, track Scope 3 emissions, and generate ESRS reports; suppliers maintain EU AI Act inventory, carbon ledger, and compliance docs for free.
**Why:** EU enterprises must report Scope 3 emissions but can't — their suppliers have no tooling to respond. Paxis gives suppliers free compliance infrastructure funded by enterprises who need the data. Supplier CAC is zero.
**Status:** Hackathon build — AI Agent Olympics, Milan AI Week, May 13–20 2026
**Repo:** github.com/paxishq/paxis | Live: getpaxis.com

---

## Tech Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Language | TypeScript | `tsgo` (`@typescript/native-preview`); no CommonJS |
| Runtime | Bun | Bun only — never `node`; `Bun.env` not `process.env` |
| Server | Bun fullstack | `Bun.serve()` — process boundary, unix socket, binary compilation |
| API routing | Hono | Mounted inside `Bun.serve()` via `routes: { "/api/*": app.fetch }`; typed middleware + RPC |
| Frontend | React + shadcn/ui | `bun init --react=shadcn`; Tailwind; HTML routes in `Bun.serve()` |
| Database | PostgreSQL 18 | Drizzle ORM (`drizzle-orm/bun-sql`); immutable audit log |
| Auth | Better Auth | Role-based: enterprise admin vs supplier node; schema in `src/db/auth-schema.ts` (generated) |
| Agent orchestration | Gemini 3.1 Pro | Multi-step reasoning; async background workflows; Planner Agent |
| Document intelligence | Gemini 3.1 Flash | Multimodal: invoices, energy bills, questionnaires (IT/DE/FR/EN) |
| LLM fallback | Featherless.ai | OpenAI-compatible; switched via `LLM_PROVIDER=featherless` |
| Formatting | Biome.js | Replaces ESLint + Prettier; `bun run check:fix` |
| Commit linting | commitlint + husky | Enforces Conventional Commits on `commit-msg` hook |
| IaC | OpenTofu | Official Vultr provider; native KMS state encryption |
| Infra | Vultr VX1 | Ubuntu 26.04 LTS; Caddy TLS (DNS-01/Cloudflare); no Docker |

---

## Repository Structure

```
/
├── bunfig.toml                        # Bun config (node alias, test preload + coverage)
├── biome.jsonc                        # Biome formatter + linter config
├── tsconfig.json                      # TypeScript config (Bun TS6 recommended)
├── drizzle.config.ts                  # Drizzle Kit config (schema glob: src/db/*.ts)
├── commitlint.config.ts               # Conventional Commits enforcement
├── compose.yml                        # Local dev only (Postgres + app)
├── src/
│   ├── index.ts                   # Bun.serve entry point — unix socket (prod) / port 15150 (dev)
│   │                              # routes: { "/api/*": app.fetch } — delegates all API to Hono
│   ├── app.ts                     # Hono application — all API routes registered here
│   ├── routes/
│   │   ├── enterprise/
│   │   │   ├── index.ts           # GET /me, GET /scope3; mounts suppliers + questionnaires
│   │   │   ├── suppliers.ts       # GET /, POST /, DELETE /:supplierId
│   │   │   └── questionnaires.ts  # GET / (?status=), POST /, GET /:id, POST /:id/send
│   │   └── supplier/
│   │       ├── index.ts           # GET /me; mounts questionnaires + ai-inventory + carbon
│   │       ├── questionnaires.ts  # GET /, GET /:id (with response), POST /:id/respond
│   │       ├── ai-inventory.ts    # GET /, POST /, PATCH /:id, DELETE /:id
│   │       └── carbon.ts          # GET / (?scope=), POST / (manual + audit), POST /parse (Gemini multimodal)
│   ├── agents/                    # Six specialized agents — all fully implemented
│   │   ├── planner.ts             # Coordinates all agents; Gemini 3.1 Pro Preview
│   │   ├── intake.ts              # Maps questionnaire questions to existing supplier data
│   │   ├── ai-act.ts              # EU AI Act risk tier classification (Gemini Flash)
│   │   ├── carbon.ts              # Scope 1 & 2 from documents (multimodal) or summary mode
│   │   ├── supply-chain.ts        # Aggregates Scope 3 from completed responses
│   │   ├── risk-deadline.ts       # CSRD filing readiness + risk flags (Gemini Flash)
│   │   └── esrs-report.ts         # ESRS 2 + ESRS E1 report generation (Gemini Pro)
│   ├── lib/
│   │   ├── llm.ts                 # LLM provider abstraction (Gemini AI Studio / Vertex AI ADC | Featherless)
│   │   ├── auth-client.ts         # Better Auth React client (frontend signIn/signOut)
│   │   ├── audit.ts               # writeAudit() — sole write path to audit_log
│   │   ├── auth.ts                # Better Auth instance + Drizzle adapter + Google OAuth only
│   │   └── db.ts                  # Drizzle + Bun native SQL instance
│   ├── db/
│   │   ├── schema.ts              # Drizzle schema — domain tables, enums, cross-schema relations
│   │   ├── auth-schema.ts         # GENERATED — Better Auth tables; never hand-edit
│   │   └── migrations/            # Drizzle-generated SQL (never hand-edit)
│   ├── test-setup.ts              # Bun test preload — creates paxis_test DB, runs migrations
│   └── frontend/
│       ├── enterprise/            # Enterprise dashboard React app
│       └── supplier/              # Supplier portal React app
├── infra/
│   └── main.tf                    # OpenTofu — Vultr VM + networking
└── scripts/
    ├── cloud-init.yaml            # Vultr instance provisioning (cloud-init)
    ├── setup.sh                   # Post-boot setup (idempotent, 9 steps)
    ├── deploy-key.sh              # One-time GitHub deploy key setup
    └── paxis.service              # systemd unit for the Bun app
```

---

## Local Development

`compose.yml` provides Postgres for local dev and testing. The production server runs Bun directly — no Docker.

```sh
# start DB + app (hot reload)
docker compose up

# run tests (same DB service, separate database name)
DATABASE_URL=postgres://paxis:paxis@localhost:15151/paxis_test bun test

# regenerate Better Auth schema after changing src/lib/auth.ts
bun run auth:generate
```

Copy `.env` and set `GEMINI_API_KEY` (from aistudio.google.com) for local dev. The dev auth bypass activates automatically when `NODE_ENV !== production` — no Google OAuth credentials needed locally. Set `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` only when testing real OAuth flows.

---

## The Six Agents

| Agent | File | Status | Role |
|-------|------|--------|------|
| **Planner** | `agents/planner.ts` | **Implemented** | Coordinates all agents; Gemini 3.1 Pro Preview at temp 0.2; Zod-validated JSON plan; dynamic dispatch |
| **Intake** | `agents/intake.ts` | **Implemented** | Fetches questionnaire + supplier carbon/AI data; Gemini 3.1 Flash Lite maps existing data to questions; upserts draft response; marks questionnaire in_progress |
| **EU AI Act** | `agents/ai-act.ts` | **Implemented** | Classifies AI inventory items by EU AI Act risk tier; skips items reviewed in last 30 days; updates justification + reviewedAt |
| **Carbon** | `agents/carbon.ts` | **Implemented** | Document mode: Gemini multimodal extracts Scope 1 & 2 from energy bills, inserts `carbonEntries`; summary mode: aggregates existing entries |
| **Supply Chain** | `agents/supply-chain.ts` | **Implemented** | Aggregates completed questionnaire responses; Gemini 3.1 Flash Lite extracts emission figures per supplier; upserts `scope3_aggregates` |
| **Risk & Deadline** | `agents/risk-deadline.ts` | **Implemented** | Builds compliance snapshot; Gemini Flash assesses filing readiness 0–100%; surfaces deadline/gap/threshold/compliance flags |
| **ESRS Report** | `agents/esrs-report.ts` | **Implemented** | Pulls Scope 3 aggregates + questionnaire data; Gemini Pro generates structured ESRS 2 + ESRS E1 report; stored in audit log payload |

All agents share a single immutable audit log written to Postgres via `src/lib/audit.ts`. Every agent function calls `writeAudit()` before returning. Routes fire agents with `runPlan(...).catch(console.error)` and return the HTTP response immediately; agent orchestration runs in the background.

`AgentContext` is exported from `agents/intake.ts` and imported by all other agents:
```typescript
export interface AgentContext {
  enterpriseId?: string;
  supplierId?: string;
  [key: string]: unknown;
}
```

---

## LLM Provider Abstraction

All LLM calls go through `src/lib/llm.ts`. Switch providers with a single env var — never hardcode provider SDKs in agent files.

### Gemini auth (auto-detected)

| Env var | When set | Effect |
|---------|----------|--------|
| `GEMINI_API_KEY` | Dev | AI Studio (API key). Get one at aistudio.google.com |
| `GOOGLE_CLOUD_PROJECT` | Prod | Vertex AI ADC — triggered when `GEMINI_API_KEY` is blank |
| `GOOGLE_CLOUD_LOCATION` | Prod | Vertex AI region (default: `us-central1`) |
| `GOOGLE_APPLICATION_CREDENTIALS` | Prod (non-GCP host) | Path to service account JSON key file |

### All LLM env vars

| Env var | Default | Values |
|---------|---------|--------|
| `LLM_PROVIDER` | `gemini` | `gemini` \| `featherless` |
| `GEMINI_API_KEY` | — | AI Studio key (dev); leave blank for Vertex AI ADC (prod) |
| `GEMINI_PRO_MODEL` | `gemini-3.1-pro-preview` | Override the Planner model ID |
| `GEMINI_FLASH_MODEL` | `gemini-3.1-flash-lite` | Override the sub-agent / document model ID |
| `GOOGLE_CLOUD_PROJECT` | — | GCP project ID (prod Vertex AI) |
| `GOOGLE_CLOUD_LOCATION` | `us-central1` | Vertex AI region |
| `GOOGLE_APPLICATION_CREDENTIALS` | — | Service account JSON path (non-GCP hosts) |
| `FEATHERLESS_API_KEY` | — | Featherless.ai API key |
| `FEATHERLESS_MODEL` | `mistralai/Mistral-Small-3.2-24B-Instruct-2506` | Any Featherless model ID |

---

## Coding Conventions

- TypeScript — `tsgo` for type-checking; `bun run typecheck`
- Biome.js for all formatting and linting — no ESLint, no Prettier; `bun run check:fix`
- Conventional Commits enforced by commitlint — `<type>(<scope>): <description>` format required
- ESM imports everywhere; no `.ts` extension in import paths; no CommonJS
- Bun only — never invoke `node` for any purpose; use `bun -e` instead
- `Bun.env` instead of `process.env`
- `bun add <pkg>@latest` on the CLI — never write versions in `package.json` by hand
- Drizzle schema changes via `bun run db:push` only — never hand-edit migration files
- Better Auth schema changes via `bun run auth:generate` only — never hand-edit `src/db/auth-schema.ts`
- All API routes are Hono handlers registered in `src/app.ts` or imported route files
- kebab-case filenames; PascalCase types and React components
- All agent functions must write to the audit log before returning — no silent failures; stubs must also call `writeAudit()`
- Routes dispatch agents fire-and-forget: `runPlan(...).catch(console.error)` — return HTTP response immediately; never await agent calls in route handlers
- Document parsing always via Gemini Flash — never attempt to parse PDF/image with text-only models
- Zod validation on all LLM responses — never trust raw model output
- Zod 4 API: use `z.uuid()` not deprecated `z.string().uuid()`; use `z.iso.datetime()` for datetime strings
- No deprecated APIs — check TypeScript diagnostics before using any `@deprecated` symbol

---

## Architecture Principles

- **Two-sided network** — enterprises are paying customers; suppliers are free nodes; network effects compound with every enterprise deal
- **Zero-CAC supplier acquisition** — enterprises onboard their own supply chains; Paxis never pays to acquire supplier nodes
- **Immutable audit trail** — every agent action is append-only; the audit log is the product
- **Agent pattern is regulation-agnostic** — intake, classify, measure, track, report, alert applies to any compliance requirement; new modules drop in without re-onboarding
- **Provider abstraction** — LLM calls never hardcode a provider; `LLM_PROVIDER` env var switches the entire stack
- **Single process** — `Bun.serve()` is the process boundary; Hono handles API routing inside it; no separate frontend server in production
- **No Docker** — single Bun binary, Caddy TLS, Postgres on the same Vultr instance

---

## Hard Constraints

- Never modify Drizzle-generated migration files (`src/db/migrations/`)
- Never hand-edit `src/db/auth-schema.ts` — it is fully managed by Better Auth; run `bun run auth:generate` to regenerate it when the auth config changes
- Never hardcode API keys, tokens, or secrets anywhere in source
- Never invoke `node` — Bun only, always
- Never use `process.env` — use `Bun.env`
- Never call LLM APIs directly in agent files — always go through `src/lib/llm.ts`
- Never write to the audit log outside of agent functions — audit integrity is the product
- Never expose `DATABASE_URL` or Postgres credentials in logs or API responses
- Document parsing must always use multimodal models (Gemini Flash)
- All Zod schemas must be validated at the boundary — never assume LLM output is valid JSON

---

## Key Contacts & Decisions

- Decisions log: `docs/decisions.md`
- Open specs: `.claude/specs/`
- Architecture doc: `docs/architecture.md`
- Domain glossary: `docs/context.md`

---

## Skills Available

| Skill          | When to invoke                          |
|----------------|-----------------------------------------|
| `/align`       | Before any non-trivial work             |
| `/spec-create` | Starting a formal feature spec          |
| `/spec-review` | Before implementing a spec              |
| `/tdd`         | Building or fixing with tests as driver |
| `/diagnose`    | Stuck on a bug or unexpected behaviour  |
| `/zoom-out`    | Losing the big picture; pre-refactor    |
| `/decision`    | Logging an architectural decision       |
| `/commit`      | Creating a well-formed commit           |

---

*Last updated: 2026-05-15 (all agents implemented; carbon audit fixed)*
