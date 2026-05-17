# Architecture

## System Overview

Paxis is a two-sided EU compliance OS: enterprises dispatch CSRD questionnaires and generate ESRS reports; suppliers maintain EU AI Act inventory, carbon ledger, and compliance docs for free. `Bun.serve()` is the process boundary (unix socket, port, binary); it delegates all API traffic to a Hono application via `routes: { "/api/*": app.fetch }`. HTML routes for the React frontends sit alongside in `Bun.serve()`. PostgreSQL 18 backs the system with an immutable append-only audit log. Six specialized AI agents coordinate via the Planner (Gemini 3.1 Pro); all LLM calls route through a provider abstraction switchable via `LLM_PROVIDER`.

## Component Map

```
Browser / Claude Desktop / Cursor
  │
  ├── Bun.serve() (unix:/run/paxis/app.sock prod / port 15150 dev)
  │     ├── routes "/api/*" ──── Hono app (src/app.ts)
  │     │     ├── /api/auth/*              ← Better Auth handler
  │     │     ├── /api/enterprise/*        ← Enterprise dashboard API
  │     │     └── /api/supplier/*          ← Supplier portal API
  │     │           ├── /assistant/chat    ← In-portal AI assistant (POST)
  │     │           └── /mcp-tokens        ← MCP token CRUD
  │     │                 │
  │     │                 └── agents/ + mcp/tools/
  │     │                       ├── planner.ts         (Gemini 3.1 Pro)
  │     │                       ├── intake / ai-act / carbon / supply-chain /
  │     │                       │   risk-deadline / esrs-report
  │     │                       └── mcp/tools/         (shared tool layer)
  │     │                             ├── carbon.ts
  │     │                             ├── ai-inventory.ts
  │     │                             ├── questionnaires.ts
  │     │                             ├── compliance.ts
  │     │                             └── guidance.ts
  │     │
  │     └── HTML routes ──── React frontend (enterprise + supplier portals)
  │                          Supplier portal includes floating Assistant widget
  │
  └── Bun.serve() (unix:/run/paxis/mcp.sock prod / port 15151 dev)   ← MCP Server
        Authorization: Bearer <raw-token> → SHA-256 → mcp_tokens lookup
        Per-request McpServer + WebStandardStreamableHTTPServerTransport
        14 tools (carbon, AI inventory, questionnaires, compliance, guidance)
        LLM tools rate-limited: 20 calls/token/minute
        │
        └── lib/
              ├── llm.ts        (Gemini | Featherless abstraction)
              ├── auth.ts       (Better Auth instance)
              └── db.ts ──────── PostgreSQL 18
                                    ├── user / session / account (Better Auth)
                                    ├── enterprises
                                    ├── suppliers
                                    ├── mcp_tokens
                                    ├── questionnaires
                                    ├── ai_inventories
                                    ├── carbon_entries
                                    ├── scope3_aggregates
                                    ├── agent_jobs (job tracking)
                                    └── audit_log (append-only)
```

## Data Flow

A typical enterprise Scope 3 questionnaire dispatch:

1. Enterprise admin POSTs to `/api/enterprise/questionnaires/:id/send` — Hono session middleware validates Better Auth session; route updates DB status to `sent`
2. Route calls `dispatchPlan({ type: "questionnaire_dispatched", ... })` which creates an `agent_jobs` row (status=`running`) and fires `runPlan` in the background; **returns HTTP response with `jobId` immediately**
3. Planner Agent calls Gemini 3.1 Pro to produce a JSON execution plan (with up to 3 retries + exponential backoff); dispatches to Intake and other sub-agents in sequence (each step retried up to 2×)
4. Supplier receives questionnaire via `/api/supplier/questionnaires`; submits via POST `/:id/respond` with `{ submit: true }`
5. Supplier route calls `dispatchPlan({ type: "questionnaire_responded", ... })`; `agent_jobs` row updates to `completed` or `failed` when `runPlan` resolves
6. Planner dispatches Supply Chain Agent to aggregate responses and write to `scope3_aggregates`
        │                                             ├── agent_jobs (job tracking)
7. ESRS Report Agent assembles audit-ready output on demand
8. **Every agent step** calls `writeAudit()` via `src/lib/audit.ts` before returning — append-only record in `audit_log`

## Package Responsibilities

| Package | Responsibility |
|---------|---------------|
| `src/index.ts` | `Bun.serve()` entry — unix socket (prod) / port 15150 (dev); routes `/api/*` to Hono; calls `startMcpServer()` |
| `src/app.ts` | Hono application — all API routes, auth handler, session middleware |
| `src/routes/enterprise/` | Enterprise dashboard API handlers (Hono) |
| `src/routes/supplier/` | Supplier portal API handlers (Hono) |
| `src/routes/supplier/assistant.ts` | `POST /api/supplier/assistant/chat` — page-aware snapshots via MCP tools, `generate()` call, `<PENDING_ACTION>` block parsing |
| `src/routes/supplier/mcp-tokens.ts` | MCP token CRUD — `POST /` (create + return raw token once), `GET /` (list), `DELETE /:id` (revoke) |
| `src/mcp/server.ts` | Second `Bun.serve()` on port 15151 (dev) / unix socket (prod); per-request stateless `McpServer`; 14 registered tools |
| `src/mcp/auth.ts` | `resolveMcpToken()` — SHA-256 hash lookup against `mcp_tokens`; stamps `lastUsedAt` fire-and-forget; `checkLlmRateLimit()` — 20 LLM calls/token/minute in-memory |
| `src/mcp/tools/carbon.ts` | `getCarbonSummary`, `getCarbonEntries`, `addCarbonEntry` — no rate limit |
| `src/mcp/tools/ai-inventory.ts` | `getAiInventory`, `addAiSystem` (no rate limit); `classifyAiTool` (rate-limited, LLM) |
| `src/mcp/tools/questionnaires.ts` | `getPendingQuestionnaires`, `getQuestionnaire`, `submitQuestionnaireResponse` (no rate limit); `suggestQuestionnaireAnswers` (rate-limited, LLM) |
| `src/mcp/tools/compliance.ts` | `getComplianceStatus`, `getDeadlineCalendar` — read-only, no LLM, no rate limit |
| `src/mcp/tools/guidance.ts` | `askComplianceQuestion`, `explainQuestionnaireField` — both rate-limited, both LLM |
| `src/agents/planner.ts` | Coordinates all agents; Gemini 3.1 Pro Preview; `dispatchPlan()` creates `agent_jobs` rows; `withRetry()` for resilience |
| `src/agents/intake.ts` | Fetches questionnaire + supplier carbon/AI data; Gemini Flash maps existing data to questions; upserts draft response |
| `src/agents/ai-act.ts` | Discovers AI tools; classifies by EU AI Act risk tier; generates documentation |
| `src/agents/carbon.ts` | Ingests energy bills via Gemini multimodal; calculates Scope 1 & 2 |
| `src/agents/supply-chain.ts` | Aggregates completed questionnaire responses; Gemini Flash extracts emission figures; writes to `scope3_aggregates` |
| `src/agents/risk-deadline.ts` | Monitors filing deadlines; flags threshold breaches; surfaces regulatory changes |
| `src/agents/esrs-report.ts` | Assembles CSRD-standard ESRS output; generates audit-ready PDFs |
| `src/lib/llm.ts` | LLM provider abstraction — Gemini (AI Studio dev / Vertex AI ADC prod) or Featherless via `LLM_PROVIDER` |
| `src/lib/auth-client.ts` | Better Auth React client — used by frontend portals for `signIn.social` and `signOut` |
| `src/lib/audit.ts` | `writeAudit()` — sole write path to `audit_log`; used by all agents and MCP tools; never called from routes |
| `src/lib/auth.ts` | Better Auth instance — Drizzle adapter, social providers, custom user fields |
| `src/lib/auth-helpers.ts` | `authIdToUuid()` — validates Better Auth text IDs against UUID regex before use in domain joins |
| `src/lib/db.ts` | Drizzle + Bun native SQL connection; reads `DATABASE_URL`; exports `db` |
| `src/db/schema.ts` | Drizzle schema — domain tables (incl. `agent_jobs`, `mcp_tokens`), enums, cross-schema relations to `user` |
| `src/db/auth-schema.ts` | **Generated — do not edit.** Better Auth tables + custom fields. Regenerate with `bun run auth:generate`. |
| `src/frontend/supplier/components/Assistant.tsx` | Floating chat widget — toggled by emerald Bot button; page-aware context; `PendingActionCard` with Confirm/Dismiss |
| `src/frontend/` | React + shadcn/ui apps for enterprise and supplier portals |
| `infra/main.tf` | OpenTofu: Vultr VM + networking + floating IP |
| `scripts/` | Cloud-init, idempotent server setup (`setup.sh`), deploy script (`deploy.sh`), deploy-key bootstrap, account-linking CLI (`link-account.ts`) |

## Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Runtime | Bun | Single binary, TypeScript-native, native Postgres bindings |
| Process boundary | `Bun.serve()` | Unix socket, port binding, binary compilation — keeps infra simple |
| API routing | Hono (inside `Bun.serve()`) | Typed middleware, RPC, clean route composition — mounted via `routes: { "/api/*": app.fetch }` |
| Frontend serving | `Bun.serve()` HTML routes | Static React apps served from the same process; no separate server |
| Frontend design | Dark-first, shadcn/ui new-york, Outfit + JetBrains Mono | Production-grade B2B aesthetic; blue accent (enterprise) / emerald accent (supplier) |
| Database | PostgreSQL 18 + Drizzle (`drizzle-orm/bun-sql`) | ACID, audit log integrity, Drizzle type safety |
| Auth | Better Auth + Google OAuth only | Framework-agnostic handler works with Hono; role-based enterprise/supplier access; no Microsoft |
| Auth schema | Generated (`bun run auth:generate`) | `@better-auth/cli` installed locally and run via `bun` to avoid jiti/bun-sql incompatibility |
| Dev auth bypass | Session middleware route-sniff, fixed-UUID seed records | Zero-friction local dev without OAuth; gated on `NODE_ENV !== production` |
| Agent orchestration | Gemini 3.1 Pro Preview (Planner) | Latest greatest for multi-step agentic reasoning; coordinating 6 specialized agents |
| Agent intelligence | Gemini 3.1 Flash Lite (sub-agents) | Latest Gemini 3.1 generation for document parsing, emission extraction, question mapping |
| Gemini auth | AI Studio API key (dev) / Vertex AI ADC (prod) | `GEMINI_API_KEY` set → AI Studio; blank → Vertex AI ADC + `GOOGLE_CLOUD_PROJECT` |
| LLM abstraction | `src/lib/llm.ts` + `LLM_PROVIDER` env var | Swap providers without touching agent code; model names overridable via env |
| Infra | Vultr VX1 + OpenTofu + Caddy | Full control; EU data residency; no managed lock-in; no Docker |
| Audit log | Append-only Postgres table | Immutable record is the compliance product; every agent action logged |
| IaC | OpenTofu | Native Vultr provider; KMS state encryption; open-source Terraform fork |

Full decision records: `docs/decisions.md`

## External Integrations

| Service | Purpose | Auth method |
|---------|---------|-------------|
| Google AI (Gemini 3.1 Pro Preview / 2.5 Flash) | Agent orchestration + document parsing | Dev: `GEMINI_API_KEY` (AI Studio) · Prod: Vertex AI ADC (`GOOGLE_CLOUD_PROJECT` + service account) |
| Featherless.ai | LLM fallback (OpenAI-compatible) | `FEATHERLESS_API_KEY` |
| Google OAuth | Enterprise/supplier SSO | `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` |
| Claude Desktop / Cursor / any MCP client | External agent access via MCP server | `Authorization: Bearer <raw-token>` → SHA-256 → `mcp_tokens` lookup |
| Cloudflare DNS | DNS-01 TLS challenge for Caddy | `CF_API_TOKEN` |
| Vultr | VPS hosting | OpenTofu provider; `SERVER_SSH_KEY` for GitHub Actions |

## Security Considerations

- Auth at Hono middleware boundary — route handlers never contain auth logic
- Enterprise/supplier role isolation — enterprise data not accessible from supplier routes
- Audit log integrity — only agent functions and MCP tools write to `audit_log`; no direct table access from routes
- MCP token auth — raw tokens never stored; SHA-256 hash only; revocation via `revokedAt` timestamp; token visible once on creation
- MCP rate limiting — 20 LLM calls/token/minute enforced in-memory (`src/mcp/auth.ts`); non-LLM tools uncapped
- Secrets in `/etc/paxis.env` (600, root only) on the server — never in source or logs
- `DATABASE_URL` and Postgres credentials never exposed in API responses or logs
- Port 80 intentionally closed — Caddy uses DNS-01 challenge only

---

*Last updated: 2026-05-17 (MCP server, in-portal AI assistant, Settings tab, mcp_tokens table)*
