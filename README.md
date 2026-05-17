# Paxis

> The EU Compliance OS for Enterprise Supply Chains

**getpaxis.com · github.com/paxishq**

---

## Project Overview

**What:** Paxis is a two-sided EU compliance OS for enterprise supply chains. Enterprises use Paxis to dispatch CSRD supplier questionnaires, track Scope 3 emissions data collection, and generate audit-ready ESRS reports. Suppliers use Paxis — free — to maintain their EU AI Act inventory, carbon ledger, and compliance documentation.

**Why:** EU enterprises are legally required to report Scope 3 emissions but can't — their suppliers have no tooling to respond. Paxis solves the data collection problem by giving suppliers free compliance infrastructure, funded by enterprises who need the data. Supplier CAC is zero — enterprises onboard their own supply chains as a byproduct of solving their own mandatory CSRD filing problem.

**Status:** Hackathon build — AI Agent Olympics, Milan AI Week, May 13–20 2026. Six specialized agents, enterprise dashboard, supplier portal, live demo at getpaxis.com.

**Repo:** github.com/paxishq/paxis

---

## Tech Stack

| Layer | Technology | Notes |
|---|---|---|
| Language | TypeScript | `@typescript/native-preview` (`tsgo`); no CommonJS |
| Runtime | Bun | Bun only — never `node`; `Bun.env` not `process.env` |
| Framework | Bun fullstack | `Bun.serve()` — HTML routes + API routes in one process |
| Frontend | React + shadcn/ui | Scaffolded with `bun init --react=shadcn`; Tailwind |
| Database | PostgreSQL 18 | Drizzle ORM (`drizzle-orm/bun-sql`); immutable audit log |
| Auth | Better Auth | Role-based access: enterprise admin vs supplier node; session audit hooks |
| Agent Orchestration | Gemini 3.1 Pro | Multi-step reasoning; async background workflows; Planner Agent |
| Document Intelligence | Gemini 3.1 Flash | Multimodal parsing of invoices, energy bills, questionnaires in IT/DE/FR/EN |
| LLM Fallback | Featherless.ai | OpenAI-compatible; `mistralai/Mistral-Small-3.2-24B-Instruct-2506`; switched via `LLM_PROVIDER=gemini\|featherless` |
| Formatting / Lint | Biome.js | Replaces ESLint + Prettier; `bun run check:fix` to auto-fix |
| IaC | OpenTofu | Official Vultr provider; native state encryption via KMS |
| Infrastructure | Vultr VX1 | Ubuntu 26.04 LTS; Caddy TLS (DNS-01 via Cloudflare); no Docker |
| npm scope | @paxishq | All published packages scoped to `@paxishq` |

---

## Repository Structure

```
/
├── README.md                         # This file
├── CLAUDE.md                         # Claude Code index (symlinks to docs/llm.md)
├── AGENTS.md                         # OpenCode index (symlinks to docs/llm.md)
├── LICENSE                           # MIT
├── bunfig.toml                       # Bun config (node alias, test preload + coverage)
├── biome.jsonc                       # Biome formatter + linter config
├── tsconfig.json                     # TypeScript config (Bun TS6 recommended)
├── drizzle.config.ts                 # Drizzle Kit config
├── commitlint.config.ts              # Conventional Commits enforcement
├── compose.yml                       # Local dev only (Postgres port 15151, app port 15150)
│
├── src/
│   ├── index.ts                      # Bun.serve entry point (unix socket prod / port 15150 dev)
│   ├── test-setup.ts                 # Bun test preload — creates paxis_test, runs migrations
│   ├── routes/                       # API routes
│   │   ├── auth.ts                   # Better Auth routes
│   │   ├── enterprise/               # Enterprise dashboard routes
│   │   └── supplier/                 # Supplier portal routes
│   ├── agents/                       # Six specialized agents
│   │   ├── planner.ts                # Planner Agent — coordinates all agents
│   │   ├── intake.ts                 # Intake Agent — questionnaire router
│   │   ├── ai-act.ts                 # EU AI Act Agent — AI inventory
│   │   ├── carbon.ts                 # Carbon Agent — Scope 1 & 2 emissions
│   │   ├── supply-chain.ts           # Supply Chain Agent — Scope 3 orchestration
│   │   ├── risk-deadline.ts          # Risk & Deadline Agent — compliance calendar
│   │   └── esrs-report.ts            # ESRS Report Agent — audit-ready output
│   ├── lib/
│   │   ├── llm.ts                    # LLM provider abstraction (Gemini | Featherless)
│   │   ├── auth.ts                   # Better Auth instance
│   │   └── db.ts                     # Drizzle + Bun native SQL instance
│   ├── db/
│   │   ├── schema.ts                 # Drizzle schema — all tables and enums
│   │   └── migrations/               # Drizzle-generated SQL (never hand-edit)
│   └── frontend/
│       ├── enterprise/               # Enterprise dashboard React app
│       └── supplier/                 # Supplier portal React app
│
├── infra/
│   └── main.tf                       # OpenTofu — Vultr VM + networking
│
├── scripts/
│   ├── cloud-init.yaml               # Vultr instance provisioning (cloud-init)
│   ├── setup.sh                      # Post-boot server setup (idempotent, 9 steps)
│   ├── deploy-key.sh                 # One-time GitHub deploy key setup
│   └── paxis.service                 # systemd unit for the Bun app
│
└── .github/
    └── workflows/
        ├── deploy.yml                # Build binary + deploy on push to main
        └── setup-server.yml          # Idempotent server setup via SSH
```

---

## The Six Agents

| Agent | File | Role |
|---|---|---|
| **Planner** | `agents/planner.ts` | Coordinates all agents; maintains shared compliance state; Gemini 3.1 Pro |
| **Intake** | `agents/intake.ts` | Parses incoming questionnaires; maps questions to existing agent data; dispatches to suppliers |
| **EU AI Act** | `agents/ai-act.ts` | Discovers and inventories AI tools; classifies by risk tier; generates technical documentation |
| **Carbon** | `agents/carbon.ts` | Ingests energy bills via Gemini multimodal; calculates Scope 1 & 2; maintains emissions ledger |
| **Supply Chain** | `agents/supply-chain.ts` | Tracks Scope 3 data collection; manages supplier requests; aggregates into consolidated figure |
| **Risk & Deadline** | `agents/risk-deadline.ts` | Monitors filing deadlines; flags threshold breaches; surfaces regulatory changes |
| **ESRS Report** | `agents/esrs-report.ts` | Assembles CSRD-standard ESRS output; generates audit-ready PDFs; one-click supplier responses |

All agents share a single immutable audit log written to Postgres. Every classification, calculation, and agent action is an append-only record.

---

## LLM Provider Abstraction

All LLM calls go through `src/lib/llm.ts`. Switch providers with a single env var — never hardcode provider SDKs in agent files.

```typescript
// src/lib/llm.ts
const provider = Bun.env.LLM_PROVIDER ?? 'gemini' // 'gemini' | 'featherless'
```

| Env var | Default | Values |
|---|---|---|
| `LLM_PROVIDER` | `gemini` | `gemini` \| `featherless` |
| `GEMINI_API_KEY` | — | Google AI Studio API key |
| `FEATHERLESS_API_KEY` | — | Featherless.ai API key |
| `FEATHERLESS_MODEL` | `mistralai/Mistral-Small-3.2-24B-Instruct-2506` | Any Featherless model ID |

Featherless is OpenAI-compatible — use the OpenAI SDK with `baseURL: 'https://api.featherless.ai/v1'`.

---

## Database

PostgreSQL 18 via Drizzle ORM. Connection string from `DATABASE_URL` env var (written to `/etc/paxis.env` by `paxis-setup.sh`).

Key tables:
- `enterprises` — enterprise customers
- `suppliers` — supplier nodes in the network
- `enterprise_suppliers` — supply chain relationships (many-to-many)
- `questionnaires` — dispatched compliance questionnaires
- `questionnaire_responses` — supplier responses
- `ai_inventories` — EU AI Act tool classifications per supplier
- `carbon_entries` — Scope 1/2 emissions ledger (append-only)
- `scope3_aggregates` — enterprise Scope 3 calculations
- `audit_log` — immutable record of every agent action

Schema changes: `bun run db:push` (never hand-edit migration files).

---

## Coding Conventions

- TypeScript — `tsgo` for type-checking; `bun run typecheck`
- Biome.js for all formatting and linting — no ESLint, no Prettier; `bun run check:fix`
- ESM imports everywhere; no `.ts` extension in import paths; no CommonJS
- **Bun only** — never invoke `node` for any purpose; use `bun -e` instead
- `Bun.env` instead of `process.env`
- `bun add <pkg>@latest` on the CLI — never write versions in `package.json` by hand
- kebab-case filenames; PascalCase types and React components
- All agent functions must write to audit log before returning — no silent failures
- Document parsing always via Gemini Flash — never attempt to parse PDF/image with text-only models
- Zod validation on all LLM responses — never trust raw model output
- **No deprecated APIs** — check TypeScript diagnostics before using any `@deprecated` symbol

---

## Architecture Principles

- **Two-sided network** — enterprises are paying customers; suppliers are free nodes; network effects compound with every enterprise deal
- **Zero-CAC supplier acquisition** — enterprises onboard their own supply chains; Paxis never pays to acquire supplier nodes
- **Immutable audit trail** — every agent action is append-only; the audit log is the product
- **Agent pattern is regulation-agnostic** — intake, classify, measure, track, report, alert applies to any compliance requirement; new modules drop in without re-onboarding
- **Provider abstraction** — LLM calls never hardcode a provider; `LLM_PROVIDER` env var switches the entire stack
- **Single process** — `Bun.serve()` serves both HTML routes (frontend) and API routes; no separate frontend server in production
- **No Docker** — single Bun binary, Caddy TLS, Postgres on the same Vultr instance

---

## Infrastructure

- **Instance:** Vultr VX1, Ubuntu 26.04 LTS x86_64
- **TLS:** Caddy with DNS-01 challenge via Cloudflare API token — port 80 intentionally closed
- **Domain:** getpaxis.com → Cloudflare DNS (grey cloud, not proxied) → Vultr instance IP
- **Reverse proxy:** Caddy → `unix//run/paxis/app.sock` (Bun server)
- **Database:** PostgreSQL 18 (Ubuntu 26.04 default), localhost only
- **Secrets:** `/etc/paxis.env` (600, root only); `/etc/caddy/env` (600, caddy:caddy)
- **Provisioning:** cloud-init on first boot → `paxis-deploy-key.sh` (manual, once) → `paxis-setup.sh` (idempotent, via GitHub Actions)
- **GitHub Actions secrets required:** `SERVER_SSH_KEY`, `VULTR_INSTANCE_IP`, `CF_API_TOKEN`

Deploy: `ssh paxis@getpaxis.com` — key-based only; root login and password auth disabled.

---

## Hard Constraints

- Never modify Drizzle-generated migration files (`src/db/migrations/`)
- Never hardcode API keys, tokens, or secrets anywhere in source
- Never invoke `node` — Bun only, always
- Never use `process.env` — use `Bun.env`
- Never call LLM APIs directly in agent files — always go through `src/lib/llm.ts`
- Never write to the audit log outside of agent functions — audit integrity is the product
- Never expose `DATABASE_URL` or Postgres credentials in logs or API responses
- Document parsing must always use multimodal models — never send raw PDF bytes to text-only models
- All Zod schemas must be validated at the boundary — never assume LLM output is valid JSON

---

## Domain Glossary

- **CSRD** — Corporate Sustainability Reporting Directive; EU law requiring large enterprises to report ESG data annually
- **ESRS** — European Sustainability Reporting Standards; the reporting format mandated by CSRD
- **Scope 1** — Direct emissions from owned/controlled sources
- **Scope 2** — Indirect emissions from purchased energy
- **Scope 3** — All other indirect emissions across the value chain (requires supplier primary data)
- **EU AI Act** — EU regulation classifying AI systems by risk tier; requires documentation and audit trails
- **CSDDD** — Corporate Sustainability Due Diligence Directive; human rights and environmental due diligence in supply chains (2027)
- **CBAM** — Carbon Border Adjustment Mechanism; carbon cost on imports, requires supplier emissions certificates
- **Enterprise node** — A paying enterprise customer using Paxis to collect Scope 3 data
- **Supplier node** — A free supplier account onboarded by an enterprise to respond to questionnaires
- **Compliance module** — A pluggable regulation handler (CSRD, EU AI Act, CSDDD, CBAM…) that runs on the existing supplier network

---

## Key References

- Scripts: `scripts/`
- Infrastructure: `infra/`
- GitHub Actions: `.github/workflows/`
- Live demo: https://getpaxis.com

---

*Last updated: 2026-05-14*
