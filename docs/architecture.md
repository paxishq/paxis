# Architecture

## System Overview

Paxis is a two-sided EU compliance OS: enterprises dispatch CSRD questionnaires and generate ESRS reports; suppliers maintain EU AI Act inventory, carbon ledger, and compliance docs for free. A `Bun.serve()` single-process server handles both HTML (React + shadcn/ui) and API routes, backed by PostgreSQL 18 with an immutable append-only audit log. Six specialized AI agents coordinate via the Planner (Gemini 3.1 Pro); all LLM calls route through a provider abstraction switchable via `LLM_PROVIDER`.

## Component Map

```
Browser
  └── Bun.serve() (port 15150 dev / unix socket prod)
        ├── HTML routes ──────────── React frontend (enterprise + supplier)
        └── API routes
              ├── /auth/*            ← Better Auth (sessions, OAuth)
              ├── /enterprise/*      ← Enterprise dashboard API
              └── /supplier/*        ← Supplier portal API
                    │
                    └── agents/
                          ├── planner.ts         (Gemini 3.1 Pro — orchestrator)
                          │     ├── intake.ts
                          │     ├── ai-act.ts
                          │     ├── carbon.ts     (Gemini Flash multimodal)
                          │     ├── supply-chain.ts
                          │     ├── risk-deadline.ts
                          │     └── esrs-report.ts
                          │
                          └── lib/
                                ├── llm.ts        (Gemini | Featherless abstraction)
                                ├── auth.ts       (Better Auth instance)
                                └── db.ts ──────── PostgreSQL 18
                                                      ├── enterprises
                                                      ├── suppliers
                                                      ├── questionnaires
                                                      ├── ai_inventories
                                                      ├── carbon_entries
                                                      ├── scope3_aggregates
                                                      └── audit_log (append-only)
```

## Data Flow

A typical enterprise Scope 3 questionnaire dispatch:

1. Enterprise admin POSTs to `/enterprise/questionnaires` — authenticated via Better Auth session
2. Intake Agent parses the questionnaire, maps questions to existing supplier data, identifies gaps
3. Planner Agent determines which supplier nodes need to respond and schedules requests
4. Suppliers receive questionnaire via portal; respond through `/supplier/*` routes
5. Supply Chain Agent aggregates responses, calculates Scope 3 figure, writes to `scope3_aggregates`
6. ESRS Report Agent assembles audit-ready output; enterprise downloads PDF
7. Every agent action writes an append-only record to `audit_log` before returning

## Package Responsibilities

| Package | Responsibility |
|---------|---------------|
| `src/index.ts` | `Bun.serve()` entry; registers all routes; starts server on port 15150 |
| `src/routes/auth.ts` | Better Auth handler — sessions, OAuth, role assignment |
| `src/routes/enterprise/` | Questionnaire dispatch, Scope 3 dashboard, ESRS export |
| `src/routes/supplier/` | Questionnaire responses, AI Act inventory, carbon entries |
| `src/agents/planner.ts` | Coordinates all agents; maintains shared compliance state; Gemini 3.1 Pro |
| `src/agents/intake.ts` | Parses questionnaires; maps to existing data; dispatches to suppliers |
| `src/agents/ai-act.ts` | Discovers AI tools; classifies by EU AI Act risk tier; generates documentation |
| `src/agents/carbon.ts` | Ingests energy bills via Gemini multimodal; calculates Scope 1 & 2 |
| `src/agents/supply-chain.ts` | Tracks Scope 3 collection; manages supplier requests; aggregates figures |
| `src/agents/risk-deadline.ts` | Monitors filing deadlines; flags threshold breaches; surfaces regulatory changes |
| `src/agents/esrs-report.ts` | Assembles CSRD-standard ESRS output; generates audit-ready PDFs |
| `src/lib/llm.ts` | LLM provider abstraction — Gemini or Featherless via `LLM_PROVIDER` |
| `src/lib/auth.ts` | Better Auth instance configuration |
| `src/lib/db.ts` | Drizzle + postgres-js connection; exports `db` |
| `src/db/schema.ts` | Drizzle schema: all tables |
| `src/frontend/` | React + shadcn/ui apps for enterprise and supplier portals |
| `infra/main.tf` | OpenTofu: Vultr VM + networking + floating IP |
| `scripts/` | Cloud-init, idempotent server setup, deploy-key bootstrap |

## Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Runtime | Bun | Single binary, TypeScript-native, native Postgres bindings |
| HTTP + frontend | `Bun.serve()` fullstack | One process for HTML + API routes; no separate frontend server |
| Database | PostgreSQL 18 + Drizzle (`drizzle-orm/postgres-js`) | ACID, audit log integrity, Drizzle type safety |
| Auth | Better Auth | Framework-agnostic; role-based enterprise/supplier access |
| Agent orchestration | Gemini 3.1 Pro (Planner) | Multi-step reasoning for coordinating 6 specialized agents |
| Document parsing | Gemini 3.1 Flash | Multimodal: invoices, energy bills, questionnaires in multiple languages |
| LLM abstraction | `src/lib/llm.ts` + `LLM_PROVIDER` env var | Swap providers without touching agent code |
| Infra | Vultr VX1 + OpenTofu + Caddy | Full control; EU data residency; no managed lock-in; no Docker |
| Audit log | Append-only Postgres table | Immutable record is the compliance product; every agent action logged |
| IaC | OpenTofu | Native Vultr provider; KMS state encryption; open-source Terraform fork |

Full decision records: `docs/decisions.md`

## External Integrations

| Service | Purpose | Auth method |
|---------|---------|-------------|
| Google AI (Gemini 3.1 Pro/Flash) | Agent orchestration + document parsing | `GEMINI_API_KEY` |
| Featherless.ai | LLM fallback (OpenAI-compatible) | `FEATHERLESS_API_KEY` |
| Google OAuth | Enterprise/supplier SSO | `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` |
| Microsoft Entra ID | Enterprise SSO | `MICROSOFT_CLIENT_ID` + `MICROSOFT_CLIENT_SECRET` + `MICROSOFT_TENANT_ID` |
| Cloudflare DNS | DNS-01 TLS challenge for Caddy | `CF_API_TOKEN` |
| Vultr | VPS hosting | OpenTofu provider; `SERVER_SSH_KEY` for GitHub Actions |

## Security Considerations

- Auth at middleware boundary — route handlers never contain auth logic
- Enterprise/supplier role isolation — enterprise data not accessible from supplier routes
- Audit log integrity — only agent functions write to `audit_log`; no direct table access from routes
- Secrets in `/etc/paxis.env` (600, root only) on the server — never in source or logs
- `DATABASE_URL` and Postgres credentials never exposed in API responses or logs
- Port 80 intentionally closed — Caddy uses DNS-01 challenge only

---

*Last updated: 2026-05-14*
