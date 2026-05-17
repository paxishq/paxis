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
| Framework | Bun fullstack | `Bun.serve()` — HTML routes + API routes in one process |
| Frontend | React + shadcn/ui | `bun init --react=shadcn`; Tailwind |
| Database | PostgreSQL 18 | Drizzle ORM (`drizzle-orm/postgres-js`); immutable audit log |
| Auth | Better Auth | Role-based: enterprise admin vs supplier node; session audit hooks |
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
├── src/
│   ├── index.ts                   # Bun.serve entry point (port 15150)
│   ├── routes/                    # API routes
│   │   ├── auth.ts                # Better Auth routes
│   │   ├── enterprise/            # Enterprise dashboard API
│   │   └── supplier/              # Supplier portal API
│   ├── agents/                    # Six specialized agents
│   │   ├── planner.ts             # Coordinates all agents; Gemini 3.1 Pro
│   │   ├── intake.ts              # Questionnaire routing + dispatch
│   │   ├── ai-act.ts              # EU AI Act inventory & risk classification
│   │   ├── carbon.ts              # Scope 1 & 2 emissions ledger
│   │   ├── supply-chain.ts        # Scope 3 orchestration
│   │   ├── risk-deadline.ts       # Compliance calendar & alerts
│   │   └── esrs-report.ts         # Audit-ready ESRS output
│   ├── lib/
│   │   ├── llm.ts                 # LLM provider abstraction (Gemini | Featherless)
│   │   ├── auth.ts                # Better Auth instance
│   │   └── db.ts                  # Drizzle + postgres-js instance
│   ├── db/
│   │   ├── schema.ts              # Drizzle schema
│   │   └── migrations/            # Drizzle-generated SQL (never hand-edit)
│   └── frontend/
│       ├── enterprise/            # Enterprise dashboard React app
│       └── supplier/              # Supplier portal React app
├── infra/
│   └── main.tf                    # OpenTofu — Vultr VM + networking
└── scripts/
    ├── paxis-cloud-init.yaml      # Vultr instance provisioning
    ├── paxis-setup.sh             # Post-boot setup (idempotent)
    └── paxis-deploy-key.sh        # One-time GitHub deploy key setup
```

---

## Local Development

`compose.yml` provides Postgres for local dev and testing. The production server runs Bun directly — no Docker.

```sh
# start DB + app (hot reload)
docker compose up

# run tests (same DB service, separate database name)
DATABASE_URL=postgres://paxis:paxis@localhost:15151/paxis_test bun test
```

Copy `.env` and set at minimum `GEMINI_API_KEY`. `BETTER_AUTH_SECRET` defaults to a dev placeholder in compose — override it in `.env` for any auth testing.

---

## The Six Agents

| Agent | File | Role |
|-------|------|------|
| **Planner** | `agents/planner.ts` | Coordinates all agents; maintains shared compliance state; Gemini 3.1 Pro |
| **Intake** | `agents/intake.ts` | Parses incoming questionnaires; maps to existing data; dispatches to suppliers |
| **EU AI Act** | `agents/ai-act.ts` | Discovers and inventories AI tools; classifies by risk tier; generates documentation |
| **Carbon** | `agents/carbon.ts` | Ingests energy bills via Gemini multimodal; calculates Scope 1 & 2 |
| **Supply Chain** | `agents/supply-chain.ts` | Tracks Scope 3 collection; manages supplier requests; aggregates figures |
| **Risk & Deadline** | `agents/risk-deadline.ts` | Monitors filing deadlines; flags threshold breaches; surfaces regulatory changes |
| **ESRS Report** | `agents/esrs-report.ts` | Assembles CSRD-standard ESRS output; generates audit-ready PDFs |

All agents share a single immutable audit log written to Postgres. Every classification, calculation, and agent action is an append-only record.

---

## LLM Provider Abstraction

All LLM calls go through `src/lib/llm.ts`. Switch providers with a single env var — never hardcode provider SDKs in agent files.

| Env var | Default | Values |
|---------|---------|--------|
| `LLM_PROVIDER` | `gemini` | `gemini` \| `featherless` |
| `GEMINI_API_KEY` | — | Google AI Studio API key |
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
- kebab-case filenames; PascalCase types and React components
- All agent functions must write to the audit log before returning — no silent failures
- Document parsing always via Gemini Flash — never attempt to parse PDF/image with text-only models
- Zod validation on all LLM responses — never trust raw model output
- No deprecated APIs — check TypeScript diagnostics before using any `@deprecated` symbol

---

## Architecture Principles

- **Two-sided network** — enterprises are paying customers; suppliers are free nodes; network effects compound with every enterprise deal
- **Zero-CAC supplier acquisition** — enterprises onboard their own supply chains; Paxis never pays to acquire supplier nodes
- **Immutable audit trail** — every agent action is append-only; the audit log is the product
- **Agent pattern is regulation-agnostic** — intake, classify, measure, track, report, alert applies to any compliance requirement; new modules drop in without re-onboarding
- **Provider abstraction** — LLM calls never hardcode a provider; `LLM_PROVIDER` env var switches the entire stack
- **Single process** — `Bun.serve()` serves both HTML routes and API routes; no separate frontend server in production
- **No Docker** — single Bun binary, Caddy TLS, Postgres on the same Vultr instance

---

## Hard Constraints

- Never modify Drizzle-generated migration files (`src/db/migrations/`)
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

*Last updated: 2026-05-14*
