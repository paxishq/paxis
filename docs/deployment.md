# Deployment

## Platform

Bun HTTP server on Vultr VX1 (Ubuntu 26.04 LTS). OpenTofu manages infrastructure. Caddy handles TLS (DNS-01 via Cloudflare) + reverse proxy. No Docker.

## Environments

| Environment | URL / Host | Branch | Deploy trigger |
|-------------|------------|--------|----------------|
| Production | getpaxis.com | `main` | GitHub Actions on push |

## Data Residency

| Region | Provider | Use for |
|--------|----------|---------|
| nbg1 | Vultr | EU GDPR |
| hel1 | Vultr | EU + likely UK GDPR adequate |
| lhr | Vultr | UK GDPR mandatory (healthcare, financial) |

## Prerequisites

- OpenTofu CLI installed
- Bun installed locally
- VPS SSH key (Ed25519)
- GitHub repo with Actions enabled
- Cloudflare API token (DNS-01 TLS challenge)

## Provision VPS

```bash
cd infra
tofu init
tofu workspace new prod
tofu apply
```

## DNS

Point `getpaxis.com` at the Vultr instance IP. Cloudflare DNS, grey cloud (not proxied).

```bash
tofu output instance_ip
```

## First Deploy

Push to `main` — GitHub Actions handles it via `scripts/paxis-setup.sh` (idempotent).

Required GitHub Actions secrets: `SERVER_SSH_KEY`, `VULTR_INSTANCE_IP`, `CF_API_TOKEN`.

## Connect to Server

```bash
ssh paxis@getpaxis.com
# key-based only; root login and password auth disabled
```

## Deploy Process

```bash
# build binary
bun build --compile --target=bun src/index.ts --outfile=paxis

# deploy via GitHub Actions on push to main
# workflow calls scripts/paxis-setup.sh over SSH
```

## Environment Variables

> Never commit values. On server: `/etc/paxis.env` (600, root only).

| Key | Required | Description |
|-----|----------|-------------|
| `DATABASE_URL` | Yes | Postgres connection string (localhost) |
| `BETTER_AUTH_SECRET` | Yes | Secret for signing sessions |
| `LLM_PROVIDER` | No | `gemini` (default) or `featherless` |
| `GEMINI_API_KEY` | Yes | Google AI Studio API key |
| `FEATHERLESS_API_KEY` | No | Featherless.ai API key (fallback) |
| `FEATHERLESS_MODEL` | No | Featherless model ID (default: `mistralai/Mistral-Small-3.2-24B-Instruct-2506`) |
| `GOOGLE_CLIENT_ID` | No | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | No | Google OAuth client secret |
| `MICROSOFT_CLIENT_ID` | No | Microsoft Entra ID client ID |
| `MICROSOFT_CLIENT_SECRET` | No | Microsoft Entra ID client secret |
| `MICROSOFT_TENANT_ID` | No | Client's Azure AD tenant ID |

## Health Check

`GET /health` → `{ status: "ok" }`

---

*Last updated: 2026-05-14*
