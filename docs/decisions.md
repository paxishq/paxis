# Decision Log

Architectural Decision Records (ADRs) — listed newest first.

Run `/decision` to add an entry.

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
