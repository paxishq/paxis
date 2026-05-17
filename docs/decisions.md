# Decision Log

Architectural Decision Records (ADRs) — listed newest first.

Run `/decision` to add an entry.

---

## ADR-012: MCP Server — Per-Request Stateless Pattern with Bun-Native Transport

**Date:** 2026-05-17
**Status:** Accepted

**Context:**
Suppliers need to expose their compliance data to external AI agents (Claude Desktop, Cursor) via the Model Context Protocol. The MCP SDK supports two transport implementations: `StreamableHTTPServerTransport` (Node.js `IncomingMessage` / `ServerResponse`) and `WebStandardStreamableHTTPServerTransport` (web-standard `Request` / `Response`). Bun's `Bun.serve()` uses web-standard APIs, not Node.js `http`. The SDK's `server.tool()` API was deprecated in v1.29.0 in favour of `server.registerTool()`.

**Options Considered:**
- Stateful sessions per-token: complex, requires session cleanup, memory leak risk
- Per-request stateless `McpServer` + transport: slight overhead per request, no session state to manage
- Node.js-compatible transport with polyfill: brittle, defeats Bun's purpose

**Decision:**
Per-request stateless pattern: each HTTP request creates a new `McpServer`, calls `registerAllTools()`, connects a `WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined })`, and returns `transport.handleRequest(req)`. Auth resolves via SHA-256 hash lookup before any server creation. All 14 tools registered with `server.registerTool()` (not deprecated `server.tool()`). Rate limit enforced in the handler for MCP requests; `checkLlmRateLimit(tokenId)` is also exported for use in standalone tool functions called from the assistant route.

**Consequences:**
- ✅ Bun-native: zero Node.js polyfills, uses web-standard Request/Response
- ✅ No session cleanup — every request is self-contained
- ✅ Stateless: safe to run behind any load balancer without sticky sessions
- ✅ `registerTool()` API is forward-compatible with MCP SDK v1.29.0+
- ⚠️ McpServer + transport instantiation per request has minor overhead — acceptable for compliance tooling (not high-throughput)

---

## ADR-011: Gemini Dual-Mode Auth — AI Studio Dev, Vertex AI ADC Prod

**Date:** 2026-05-14
**Status:** Accepted

**Context:**
Agents require Gemini API access. In dev, the simplest path is an AI Studio API key. In prod on a non-GCP Vultr host, using a service account + Application Default Credentials is more secure (no key in env files, IAM-controlled).

**Options Considered:**
- AI Studio API key everywhere: simple but requires a long-lived secret in prod env
- Vertex AI ADC everywhere: requires GCP project setup even for local dev
- Auto-detect based on whether `GEMINI_API_KEY` is set: zero friction in both environments

**Decision:**
`src/lib/llm.ts` checks `Bun.env.GEMINI_API_KEY` at runtime. If set → AI Studio (dev). If blank → `GoogleGenAI({ vertexai: true, project, location })` using ADC (prod). Model names configurable via `GEMINI_PRO_MODEL` / `GEMINI_FLASH_MODEL` env vars. Defaults: `gemini-3.1-pro-preview` (Planner) / `gemini-3.1-flash-lite` (sub-agents) — full Gemini 3.1 stack.

**Consequences:**
- ✅ Dev: one env var, no GCP project required
- ✅ Prod: no API key in `/etc/paxis.env`; IAM-controlled via service account
- ✅ Model names upgradeable without code changes
- ⚠️ Non-GCP hosts (Vultr) need a service account JSON key + `GOOGLE_APPLICATION_CREDENTIALS`

---

## ADR-010: Google OAuth Only — Microsoft Entra Removed

**Date:** 2026-05-14
**Status:** Accepted

**Context:**
Better Auth was initially configured with both Google and Microsoft OAuth providers. Microsoft Entra adds complexity (tenant ID handling, Azure AD app registration) with no clear hackathon-phase need.

**Options Considered:**
- Keep both: more enterprise coverage but extra config surface
- Google only: simpler, covers the demo audience, can be re-added post-hackathon

**Decision:**
Remove `microsoft` block from `src/lib/auth.ts`. `bun run auth:generate` regenerated the schema. Only Google OAuth is wired.

**Consequences:**
- ✅ Fewer env vars, less auth surface to maintain
- ✅ `bun run auth:generate` output is cleaner
- ⚠️ Microsoft-only enterprise users cannot log in (acceptable for hackathon)

---

## ADR-009: React Frontend with Dark-First Design System and Dev Auth Bypass

**Date:** 2026-05-14
**Status:** Accepted

**Context:**
The project needed working React portals (enterprise + supplier) with real API wiring, a production-grade design, and a frictionless local dev experience without requiring OAuth setup.

**Options Considered:**
- Standard light shadcn/ui defaults: fast but generic
- Full dark redesign with custom nav and accent system: more work, distinctive
- Dev auth bypass via real OAuth mock: complex; bypass via session middleware + seeded UUIDs: simple

**Decision:**
Both portals built with Bun fullstack HTML routes. Dark-first design (Outfit + JetBrains Mono fonts, blue enterprise / emerald supplier accent bars). Custom page-state nav replaces shadcn Tabs. `sessionMiddleware` in `src/middleware/session.ts` injects fixed-UUID dev users when `NODE_ENV !== production` and `DEV_ENTERPRISE_ID` / `DEV_SUPPLIER_ID` are set. Login pages with Google OAuth for production.

**Consequences:**
- ✅ Zero OAuth setup required for local dev
- ✅ Both portals fully functional end-to-end without credentials
- ✅ Production login screens are already wired and ready
- ⚠️ Dev bypass must never activate in prod — `NODE_ENV !== production` gate is the only guard

---

## ADR-008: Better Auth CLI Run via `bun` to Avoid jiti/bun-sql Incompatibility

**Date:** 2026-05-14
**Status:** Accepted

**Context:**
`bunx auth@latest generate` downloads and runs the Better Auth CLI under Node.js, which uses `jiti` to import our auth config. `jiti` uses Node's CJS module loader, which cannot resolve the native `bun` module required by `drizzle-orm/bun-sql`. The CLI fails with `Cannot find module 'bun'`.

**Options Considered:**
- `bunx auth@latest generate`: Convenient but runs under Node/jiti — fails for bun-sql projects
- Write schema manually: Works but diverges from the generated source of truth
- Install `@better-auth/cli` locally, run via `bun node_modules/.bin/better-auth`: Bun owns all module resolution, including the `bun` native module that jiti would otherwise fail on

**Decision:**
Install `@better-auth/cli` as a dev dependency. Run it via `bun node_modules/.bin/better-auth generate` — aliased as `bun run auth:generate`. Output goes to `src/db/auth-schema.ts`, which is never hand-edited. `drizzle.config.ts` uses `schema: "./src/db/*.ts"` to pick up both schema files.

**Consequences:**
- ✅ Generate command works correctly with `drizzle-orm/bun-sql`
- ✅ `src/db/auth-schema.ts` is always authoritative — no drift from manual edits
- ⚠️ `@better-auth/cli` must be kept in sync with `better-auth` version

---

## ADR-007: Hono Inside `Bun.serve()` for API Routing

**Date:** 2026-05-14
**Status:** Accepted

**Context:**
`Bun.serve()` was chosen as the process boundary (ADR-004) but raw `fetch` handler routing is verbose and untyped. Better Auth's integration story is first-class with framework routers. Hono on Bun is near-zero overhead and provides typed middleware, route composition, and RPC.

**Options Considered:**
- Raw `Bun.serve()` fetch handler with manual routing: Minimal, but tedious and untyped
- Full Hono server replacing `Bun.serve()`: Loses the binary compilation and unix socket benefits of `Bun.serve()`
- Hono mounted inside `Bun.serve()` via `routes`: Keeps `Bun.serve()` as the process boundary; Hono handles all API routing internally

**Decision:**
`Bun.serve()` remains the entry point. `routes: { "/api/*": app.fetch }` delegates all API traffic to a Hono app (`src/app.ts`). React frontend HTML routes sit alongside in `Bun.serve()`. Better Auth mounts at `/api/auth/*` via `app.on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw))`.

**Consequences:**
- ✅ `Bun.serve()` still owns the process — unix socket, port binding, `bun build --compile` all work unchanged
- ✅ Hono provides typed middleware, session guards, and clean route composition across enterprise/supplier portals
- ✅ Better Auth integrates naturally via `auth.handler(c.req.raw)`
- ⚠️ All API routes must live under `/api/*` — bare paths are reserved for HTML routes

---

## ADR-006: Immutable Audit Log as Core Product

**Date:** 2026-05-14
**Status:** Accepted

**Context:**
EU compliance requires enterprises to prove that reported data is accurate and unaltered. Every agent classification, calculation, and action must be traceable.

**Options Considered:**
- Application-level logging only: cheap but not audit-grade
- Separate audit service: strong isolation but operational overhead
- Append-only Postgres table: ACID, co-located, queryable

**Decision:**
Every agent function writes an append-only record to `audit_log` before returning. No direct table access from routes. The audit log is the compliance product, not a debugging aid.

**Consequences:**
- ✅ Audit-ready by construction — no retroactive logging
- ✅ Queryable alongside domain data in the same Postgres instance
- ⚠️ Agents must never skip the audit write — enforced by convention and tests

---

## ADR-005: LLM Provider Abstraction via `src/lib/llm.ts`

**Date:** 2026-05-14
**Status:** Accepted

**Context:**
The hackathon uses Gemini 3.1 Pro/Flash as primary LLMs. Rate limits, API availability, and cost may require switching providers mid-demo or post-launch.

**Options Considered:**
- Hardcode Gemini SDK in each agent: fast to write, brittle
- Abstract at agent level: inconsistent, partial
- Single abstraction module with env-var switching: one place to change

**Decision:**
All LLM calls route through `src/lib/llm.ts`. `LLM_PROVIDER=gemini|featherless` switches the entire stack. Featherless is OpenAI-compatible — use the OpenAI SDK with `baseURL: 'https://api.featherless.ai/v1'`.

**Consequences:**
- ✅ Provider swap without touching agent files
- ✅ Featherless fallback available for quota exhaustion or offline demos
- ⚠️ `llm.ts` abstraction must cover all capabilities agents need (streaming, multimodal)

---

## ADR-004: Bun Fullstack (`Bun.serve()`) — No Separate Frontend Server

**Date:** 2026-05-14
**Status:** Accepted

**Context:**
A React frontend needs to be served alongside API routes. The typical approach is a separate Vite/Node dev server and a CDN/static host for production.

**Options Considered:**
- Separate Vite dev server + static hosting: conventional, more moving parts
- Hono on Bun: typed RPC, good DX, but adds a framework dependency
- `Bun.serve()` fullstack with HTML routes: built-in, single binary, single process

**Decision:**
Use `Bun.serve()` HTML routes for the React frontend and API routes for the backend — all in one process, one compiled binary. Frontend scaffolded with `bun init --react=shadcn`.

**Consequences:**
- ✅ Single `bun build --compile` produces one deployable binary
- ✅ No Nginx, no CDN, no separate Node process
- ⚠️ Bun fullstack HTML routes are a newer API — fewer examples than Vite

---

## ADR-003: OpenTofu + Vultr for Infrastructure

**Date:** 2026-05-14
**Status:** Accepted

**Context:**
Infrastructure must be reproducible, EU-hosted, and not locked into a managed cloud (AWS/GCP/Azure) given the compliance and data residency requirements.

**Options Considered:**
- Pulumi + Hetzner: programmatic IaC, good EU coverage, proprietary state backend
- Terraform + AWS: broad ecosystem, US company, GDPR complexity
- OpenTofu + Vultr: open-source Terraform fork, native Vultr provider, KMS state encryption

**Decision:**
OpenTofu for IaC (`infra/main.tf`). Vultr VX1 instance in EU region. Caddy handles TLS via DNS-01 challenge (Cloudflare). No Docker — single Bun binary on bare Ubuntu 26.04 LTS.

**Consequences:**
- ✅ Full control, EU data residency, no managed lock-in
- ✅ OpenTofu is drop-in Terraform — familiar tooling
- ⚠️ Self-managed Postgres — no automated failover; acceptable for hackathon scope

---

## ADR-002: Better Auth for Role-Based Access

**Date:** 2026-05-14
**Status:** Accepted

**Context:**
Paxis has two distinct user types — enterprise admins and supplier nodes — with different data access and permissions. Auth must be framework-agnostic to work with `Bun.serve()`.

**Options Considered:**
- Clerk: hosted, fast to integrate, US-based SaaS
- Auth.js (NextAuth): React/Next-centric
- Better Auth: framework-agnostic, self-hosted, org plugin available

**Decision:**
Better Auth with role-based access: `enterprise` and `supplier` roles. Session audit hooks log auth events to `audit_log`. Schema managed via `bunx auth@latest generate`.

**Consequences:**
- ✅ Framework-agnostic — works with `Bun.serve()`
- ✅ Self-hosted — no third-party data processor for credentials
- ⚠️ Must never manually edit Better Auth tables — always use `bunx auth@latest generate`

---

## ADR-001: Bun Runtime — No Node.js

**Date:** 2026-05-14
**Status:** Accepted

**Context:**
The project requires a TypeScript-native runtime with fast startup, a single compiled binary for deployment, and native Postgres bindings. Node.js with a bundler adds build complexity.

**Options Considered:**
- Node.js + esbuild/tsx: conventional, broad ecosystem, extra tooling
- Deno: TypeScript-native but different ecosystem, no `bun:sqlite` equivalent
- Bun: TypeScript-native, `bun build --compile` produces a single binary, native SQL bindings

**Decision:**
Bun as the exclusive runtime. Never invoke `node`. Use `Bun.env` instead of `process.env`. `tsgo` (`@typescript/native-preview`) for type checking.

**Consequences:**
- ✅ Single binary deployment — no Node on the server
- ✅ TypeScript runs natively — no transpile step in development
- ⚠️ Some npm packages assume Node built-ins — check compatibility before adding dependencies

---
