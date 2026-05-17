# Paxis

> The EU Compliance OS for Enterprise Supply Chains

**getpaxis.com · github.com/paxishq/paxis**

---

## Project Overview

**What:** Paxis is a two-sided EU compliance OS for enterprise supply chains. Enterprises use Paxis to dispatch CSRD supplier questionnaires, track Scope 3 emissions, and generate audit-ready ESRS reports. Suppliers use Paxis — free — to maintain their EU AI Act inventory, carbon ledger, and compliance documentation. An MCP server exposes 14 supplier compliance tools to any external AI agent, and an in-portal AI assistant guides suppliers through their obligations.

**Why:** EU enterprises are legally required to report Scope 3 emissions but can't — their suppliers have no tooling to respond. Paxis solves the data collection problem by giving suppliers free compliance infrastructure, funded by enterprises who need the data. Supplier CAC is zero — enterprises onboard their own supply chains as a byproduct of solving their own mandatory CSRD filing problem.

**Status:** Hackathon build — AI Agent Olympics, Milan AI Week, May 13–20 2026. Six specialized agents, enterprise dashboard, supplier portal, MCP server, in-portal AI assistant. Live demo at getpaxis.com.

---

## Tech Stack

| Layer | Technology | Notes |
|---|---|---|
| Language | TypeScript | `@typescript/native-preview` (`tsgo`); no CommonJS |
| Runtime | Bun | Bun only — never `node`; `Bun.env` not `process.env` |
| Server | Bun fullstack | `Bun.serve()` — port 15150 main app, port 15151 MCP server |
| API routing | Hono | Mounted inside `Bun.serve()` via `routes: { "/api/*": app.fetch }` |
| Frontend | React + shadcn/ui | Scaffolded with `bun init --react=shadcn`; Tailwind; dark-first |
| Database | PostgreSQL 18 | Drizzle ORM (`drizzle-orm/bun-sql`); immutable audit log |
| Auth | Better Auth | Role-based: enterprise admin vs supplier node; Google OAuth only |
| Agent orchestration | Gemini 3.1 Pro | Multi-step reasoning; async background workflows; Planner Agent |
| Document intelligence | Gemini 3.1 Flash | Multimodal parsing of invoices, energy bills, questionnaires (IT/DE/FR/EN) |
| LLM fallback | Featherless.ai | OpenAI-compatible; switched via `LLM_PROVIDER=featherless` |
| MCP | Model Context Protocol | 14 supplier compliance tools; Bearer token auth; Streamable HTTP |
| Formatting / Lint | Biome.js | Replaces ESLint + Prettier; `bun run check:fix` |
| Commit linting | commitlint + husky | Conventional Commits enforced on `commit-msg` hook |
| IaC | OpenTofu | Official Vultr provider; native state encryption via KMS |
| Infrastructure | Vultr VX1 | Ubuntu 26.04 LTS; Caddy TLS (DNS-01/Cloudflare); no Docker |

---

## Repository Structure

```
/
├── README.md
├── CLAUDE.md / AGENTS.md          # Symlinks to docs/llm.md — loaded in every AI session
├── DEPLOY.md                      # 10-step manual production deploy guide
├── LICENSE                        # MIT
├── bunfig.toml                    # Bun config (test preload + coverage)
├── biome.jsonc                    # Biome formatter + linter config
├── tsconfig.json                  # TypeScript config (Bun TS6 recommended)
├── drizzle.config.ts              # Drizzle Kit config (schema glob: src/db/*.ts)
├── commitlint.config.ts           # Conventional Commits enforcement
├── compose.yml                    # Local dev only (Postgres port 15151, app port 15150)
├── .mcp.json                      # MCP client config — paxis-supplier entry
│
├── src/
│   ├── index.ts                   # Bun.serve entry point (unix socket prod / port 15150 dev)
│   │                              # Also starts MCP server via startMcpServer()
│   ├── app.ts                     # Hono application — all API routes registered here
│   ├── test-setup.ts              # Bun test preload — validates DATABASE_URL, sets test env
│   │
│   ├── routes/
│   │   ├── enterprise/
│   │   │   ├── index.ts           # GET /me, GET /scope3, GET /jobs/:id
│   │   │   ├── suppliers.ts       # GET /, POST /, DELETE /:supplierId
│   │   │   ├── questionnaires.ts  # GET /, POST /, GET /:id, POST /:id/send
│   │   │   └── carbon.ts          # GET /, POST / — enterprise Scope 1/2 entries
│   │   └── supplier/
│   │       ├── index.ts           # GET /me; mounts all supplier sub-routes
│   │       ├── questionnaires.ts  # GET /, GET /:id, POST /:id/respond
│   │       ├── ai-inventory.ts    # GET /, POST /, PATCH /:id, DELETE /:id
│   │       ├── carbon.ts          # GET /, POST /, POST /parse (Gemini multimodal)
│   │       ├── assistant.ts       # POST /chat — page-aware AI assistant
│   │       └── mcp-tokens.ts      # GET /, POST /, DELETE /:id — MCP token CRUD
│   │
│   ├── mcp/                       # MCP server (port 15151 dev / unix socket prod)
│   │   ├── server.ts              # startMcpServer() — per-request stateless McpServer
│   │   ├── auth.ts                # resolveMcpToken() + checkLlmRateLimit() (20/token/min)
│   │   └── tools/
│   │       ├── carbon.ts          # getCarbonSummary, getCarbonEntries, addCarbonEntry
│   │       ├── ai-inventory.ts    # getAiInventory, addAiSystem, classifyAiTool
│   │       ├── questionnaires.ts  # getPendingQuestionnaires, getQuestionnaire,
│   │       │                      # submitQuestionnaireResponse, suggestQuestionnaireAnswers
│   │       ├── compliance.ts      # getComplianceStatus, getDeadlineCalendar
│   │       └── guidance.ts        # askComplianceQuestion, explainQuestionnaireField
│   │
│   ├── agents/
│   │   ├── planner.ts             # Coordinates all agents; Gemini Pro; dispatchPlan(); withRetry()
│   │   ├── intake.ts              # Maps questionnaire questions to existing supplier data
│   │   ├── ai-act.ts              # EU AI Act risk tier classification (Gemini Flash)
│   │   ├── carbon.ts              # Scope 1 & 2 from documents (multimodal) or summary mode
│   │   ├── supply-chain.ts        # Aggregates Scope 3 from completed responses
│   │   ├── risk-deadline.ts       # CSRD filing readiness + risk flags (Gemini Flash)
│   │   └── esrs-report.ts         # ESRS 2 + ESRS E1 report generation (Gemini Pro)
│   │
│   ├── lib/
│   │   ├── llm.ts                 # LLM provider abstraction (Gemini AI Studio / Vertex AI | Featherless)
│   │   ├── audit.ts               # writeAudit() — sole write path to audit_log
│   │   ├── auth-helpers.ts        # authIdToUuid() — validates Better Auth IDs before DB joins
│   │   ├── auth.ts                # Better Auth instance + Drizzle adapter + Google OAuth
│   │   ├── auth-client.ts         # Better Auth React client (signIn/signOut)
│   │   └── db.ts                  # Drizzle + Bun native SQL instance
│   │
│   ├── db/
│   │   ├── schema.ts              # Drizzle schema — all domain tables and enums
│   │   ├── auth-schema.ts         # GENERATED — Better Auth tables; never hand-edit
│   │   └── migrations/            # Drizzle-generated SQL (never hand-edit)
│   │
│   ├── middleware/
│   │   └── session.ts             # sessionMiddleware, requireAuth, requireEnterprise, requireSupplier
│   │
│   └── frontend/
│       ├── enterprise/            # Enterprise dashboard (blue accent #4d7ef7)
│       │   └── App.tsx            # Overview, Suppliers, Questionnaires, Emissions, ESRS Report tabs
│       └── supplier/              # Supplier portal (emerald accent #10b981)
│           ├── App.tsx            # Questionnaires, Carbon, AI Inventory, Compliance, Settings tabs
│           └── components/
│               └── Assistant.tsx  # Floating AI assistant — pendingAction confirm/dismiss
│
├── infra/
│   └── main.tf                    # OpenTofu — Vultr VM + networking
│
└── scripts/
    ├── cloud-init.yaml            # Vultr instance provisioning (cloud-init)
    ├── setup.sh                   # Post-boot server setup (idempotent)
    ├── deploy.sh                  # Repeatable deploy (git pull → build → restart)
    ├── deploy-key.sh              # One-time GitHub deploy key setup
    ├── link-account.ts            # Assign role + IDs to OAuth user after first sign-in
    ├── seed-dev.ts                # Idempotent dev fixture data
    ├── seed-demo.ts               # Full demo data (4 suppliers, varied states)
    ├── replay-to-new-repo.sh      # Replay commits with human-feeling timestamps
    └── paxis.service              # systemd unit for the Bun app
```

---

## The Six Agents

All agents are fully implemented. Every agent function writes to the immutable `audit_log` before returning — no silent failures.

| Agent | File | Role |
|---|---|---|
| **Planner** | `agents/planner.ts` | Coordinates all agents; Gemini 3.1 Pro Preview at temp 0.2; Zod-validated JSON plan; `withRetry()` (3× plan, 2× step) |
| **Intake** | `agents/intake.ts` | Fetches questionnaire + supplier carbon/AI data; Gemini Flash maps existing data to questions; upserts draft response |
| **EU AI Act** | `agents/ai-act.ts` | Classifies AI inventory items by risk tier; skips items reviewed in last 30 days; updates justification + reviewedAt |
| **Carbon** | `agents/carbon.ts` | Document mode: Gemini multimodal extracts Scope 1 & 2 from energy bills; summary mode: aggregates existing entries |
| **Supply Chain** | `agents/supply-chain.ts` | Aggregates completed questionnaire responses; Gemini Flash extracts emission figures; upserts scope3_aggregates |
| **Risk & Deadline** | `agents/risk-deadline.ts` | Builds compliance snapshot; Gemini Flash assesses filing readiness 0–100%; surfaces deadline/gap/threshold flags |
| **ESRS Report** | `agents/esrs-report.ts` | Pulls Scope 3 aggregates + enterprise Scope 1/2; Gemini Pro generates ESRS 2 + ESRS E1 report; stored in audit log |

Routes dispatch agents via `dispatchPlan(task)` — creates a tracked `agent_jobs` row, fires `runPlan` in the background, returns `{ jobId }` immediately. Never await agent calls in route handlers.

---

## MCP Server

A second `Bun.serve()` instance on port 15151 (dev) / unix socket (prod) exposes 14 supplier compliance tools via the Model Context Protocol.

**Auth:** Bearer token — SHA-256 hash stored, raw token shown once on creation. Revocation immediate.

**Rate limiting:** LLM-backed tools capped at 20 calls/token/minute (in-memory). Read tools and non-LLM write tools are uncapped.

| Category | Tools |
|---|---|
| Carbon (read) | `get_carbon_summary`, `get_carbon_entries` |
| Carbon (write) | `add_carbon_entry` |
| AI inventory (read) | `get_ai_inventory` |
| AI inventory (write/LLM) | `add_ai_system`, `classify_ai_tool` ★ |
| Questionnaires (read) | `get_pending_questionnaires`, `get_questionnaire` |
| Questionnaires (write/LLM) | `submit_questionnaire_response`, `suggest_questionnaire_answers` ★ |
| Compliance (read) | `get_compliance_status`, `get_deadline_calendar` |
| Guidance (LLM) | `ask_compliance_question` ★, `explain_questionnaire_field` ★ |

★ Rate-limited (20 LLM calls/token/minute)

To use from Claude Code or Claude Desktop, set `PAXIS_MCP_TOKEN` and the `.mcp.json` entry will connect automatically:

```json
"paxis-supplier": {
  "type": "http",
  "url": "http://localhost:15151/mcp",
  "headers": { "Authorization": "Bearer ${PAXIS_MCP_TOKEN}" }
}
```

---

## LLM Provider Abstraction

All LLM calls go through `src/lib/llm.ts`. Switch providers with a single env var.

**Gemini auth (auto-detected):**

| Condition | Mode |
|---|---|
| `GEMINI_API_KEY` set | AI Studio (dev) |
| `GEMINI_API_KEY` blank + `GOOGLE_CLOUD_PROJECT` set | Vertex AI ADC (prod) |

**All LLM env vars:**

| Env var | Default | Notes |
|---|---|---|
| `LLM_PROVIDER` | `gemini` | `gemini` \| `featherless` |
| `GEMINI_API_KEY` | — | AI Studio key; leave blank for Vertex AI ADC |
| `GEMINI_PRO_MODEL` | `gemini-3.1-pro-preview` | Planner model |
| `GEMINI_FLASH_MODEL` | `gemini-3.1-flash-lite` | Sub-agent / document model |
| `GOOGLE_CLOUD_PROJECT` | — | GCP project ID (Vertex AI prod) |
| `GOOGLE_CLOUD_LOCATION` | `us-central1` | Vertex AI region |
| `GOOGLE_APPLICATION_CREDENTIALS` | — | Service account JSON path (non-GCP hosts) |
| `FEATHERLESS_API_KEY` | — | Featherless.ai API key |
| `FEATHERLESS_MODEL` | `mistralai/Mistral-Small-3.2-24B-Instruct-2506` | Any Featherless model ID |

---

## Database

PostgreSQL 18 via Drizzle ORM (`drizzle-orm/bun-sql`). Schema changes via `bun run db:push` only — never hand-edit migration files.

| Table | Purpose |
|---|---|
| `enterprises` | Enterprise customers |
| `suppliers` | Supplier nodes in the network |
| `enterprise_suppliers` | Supply chain relationships (many-to-many) |
| `mcp_tokens` | Supplier-issued Bearer tokens for MCP access (SHA-256 hash only) |
| `questionnaires` | Dispatched CSRD questionnaires |
| `questionnaire_responses` | Supplier answers |
| `ai_inventories` | EU AI Act tool classifications per supplier |
| `carbon_entries` | Supplier Scope 1/2 emissions ledger |
| `enterprise_carbon_entries` | Enterprise Scope 1/2 emissions |
| `scope3_aggregates` | Enterprise Scope 3 calculations |
| `agent_jobs` | Background job tracking for all dispatchPlan() calls |
| `audit_log` | Immutable append-only record of every agent action |

---

## Local Development

```sh
# start DB (Postgres on port 15151)
docker compose up db -d

# apply schema to dev DB
bun run db:push

# start app with hot reload (port 15150)
bun run --hot src/index.ts

# run tests (paxis_test database must exist)
DATABASE_URL=postgres://paxis:paxis@localhost:15151/paxis_test bun test
```

Set `DEV_ENTERPRISE_ID` and/or `DEV_SUPPLIER_ID` in `.env` to bypass Google OAuth in development — the session middleware injects a fixed-UUID user automatically when `NODE_ENV !== production`.

**One-time test DB setup:**
```sh
docker exec paxis-db-1 psql -U paxis -c "CREATE DATABASE paxis_test OWNER paxis;"
DATABASE_URL=postgres://paxis:paxis@localhost:15151/paxis_test bun run db:push
```

---

## Coding Conventions

- TypeScript — `tsgo` for type-checking; `bun run typecheck`
- Biome.js for all formatting and linting — `bun run check:fix`
- Conventional Commits enforced by commitlint on every `git commit`
- ESM imports everywhere; no `.ts` extension in import paths; no CommonJS
- **Bun only** — never invoke `node`; use `Bun.env` not `process.env`
- `bun add <pkg>@latest` on the CLI — never write versions in `package.json` by hand
- All agent functions must write to the audit log before returning — no silent failures
- Routes dispatch agents via `dispatchPlan()` — never `await` agent calls in handlers
- Document parsing always via Gemini Flash — never send images/PDFs to text-only models
- Zod validation on all LLM responses — never trust raw model output
- Zod 4 API: `z.uuid()` not `z.string().uuid()`; `z.iso.datetime()` for datetimes

---

## Architecture Principles

- **Two-sided network** — enterprises are paying customers; suppliers are free nodes; network effects compound with every enterprise deal
- **Zero-CAC supplier acquisition** — enterprises onboard their own supply chains; Paxis never pays to acquire supplier nodes
- **Immutable audit trail** — every agent action is append-only; the audit log is the product
- **Agent pattern is regulation-agnostic** — intake, classify, measure, track, report, alert applies to any compliance requirement; new modules drop in without re-onboarding
- **Provider abstraction** — LLM calls never hardcode a provider; `LLM_PROVIDER` env var switches the entire stack
- **Single process** — `Bun.serve()` is the process boundary; a second `Bun.serve()` handles MCP on port 15151
- **No Docker** — single Bun binary, Caddy TLS, Postgres on the same Vultr instance

---

## Infrastructure

- **Instance:** Vultr VX1, Ubuntu 26.04 LTS x86_64
- **TLS:** Caddy with DNS-01 challenge via Cloudflare API token
- **Domain:** getpaxis.com → Cloudflare DNS → Vultr instance IP
- **Reverse proxy:** Caddy → `unix//run/paxis/app.sock` (main app) + `unix//run/paxis/mcp.sock` (MCP server)
- **Database:** PostgreSQL 18, localhost only
- **Secrets:** `/etc/paxis.env` (600, root only)
- **Provisioning:** `scripts/cloud-init.yaml` on first boot → `scripts/setup.sh` (idempotent) → `scripts/deploy.sh` (repeatable)

Production deploy guide: `DEPLOY.md`

---

## Hard Constraints

- Never modify Drizzle-generated migration files (`src/db/migrations/`)
- Never hand-edit `src/db/auth-schema.ts` — run `bun run auth:generate` to regenerate
- Never hardcode API keys, tokens, or secrets anywhere in source
- Never invoke `node` — Bun only, always
- Never use `process.env` — use `Bun.env`
- Never call LLM APIs directly in agent files — always go through `src/lib/llm.ts`
- Never write to the audit log outside of agent functions — audit integrity is the product
- Never expose `DATABASE_URL` or Postgres credentials in logs or API responses
- Document parsing must always use multimodal models (Gemini Flash)
- All Zod schemas must be validated at the boundary — never assume LLM output is valid JSON

---

## Domain Glossary

- **CSRD** — Corporate Sustainability Reporting Directive; EU law requiring large enterprises to report ESG data annually
- **ESRS** — European Sustainability Reporting Standards; the reporting format mandated by CSRD
- **Scope 1** — Direct emissions from owned/controlled sources
- **Scope 2** — Indirect emissions from purchased energy
- **Scope 3** — All other indirect emissions across the value chain (requires supplier primary data)
- **EU AI Act** — EU regulation classifying AI systems by risk tier; requires documentation and audit trails
- **CSDDD** — Corporate Sustainability Due Diligence Directive; human rights and environmental due diligence (2027)
- **CBAM** — Carbon Border Adjustment Mechanism; carbon cost on imports, requires supplier emissions certificates
- **Enterprise node** — A paying enterprise customer using Paxis to collect Scope 3 data
- **Supplier node** — A free supplier account onboarded by an enterprise to respond to questionnaires
- **Compliance module** — A pluggable regulation handler (CSRD, EU AI Act, CSDDD, CBAM…) that runs on the existing supplier network
- **MCP token** — A supplier-issued Bearer token for external AI agent access; raw token shown once, SHA-256 hash stored only
- **Pending action** — A proposed write operation emitted by the in-portal assistant as a `<PENDING_ACTION>` block; requires explicit supplier confirmation before execution

---

*Last updated: 2026-05-17*
