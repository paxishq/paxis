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

**One-time manual step:** run `scripts/paxis-deploy-key.sh` as the `paxis` user to register the GitHub deploy key.

Then trigger `setup-server.yml` (manually via `workflow_dispatch` or push a change to `scripts/`) — it runs `setup.sh` over SSH with all required secrets.

After setup completes, push any app code to `main` — `deploy.yml` builds the binary and deploys it.

**Schema migrations are manual:** `ssh paxis@getpaxis.com` then `bun run db:push` (drizzle-kit is not included in the compiled binary).

## GitHub Actions Secrets

Set all of these in **Settings → Secrets → Actions** before running any workflow:

| Secret | Required by | Description |
|--------|------------|-------------|
| `SERVER_SSH_KEY` | both workflows | Ed25519 private key with access to the `paxis` user |
| `VULTR_INSTANCE_IP` | both workflows | Server IP address |
| `CF_API_TOKEN` | `setup-server.yml` | Cloudflare API token for Caddy DNS-01 challenge |
| `BETTER_AUTH_SECRET` | `setup-server.yml` | Secret for signing auth sessions (generate with `openssl rand -base64 32`) |
| `GEMINI_API_KEY` | `setup-server.yml` | Google AI Studio API key |
| `FEATHERLESS_API_KEY` | `setup-server.yml` | Featherless.ai API key (optional fallback) |

## Connect to Server

```bash
ssh paxis@getpaxis.com
# key-based only; root login and password auth disabled
```

## Deploy Process

`deploy.yml` runs on every push to `main` (excluding docs/infra/scripts changes):

1. `bun install --frozen-lockfile`
2. `bun run typecheck` + `bun run check`
3. `bun build --compile --target=bun-linux-x64 src/index.ts --outfile=paxis`
4. `scp` binary to `/home/paxis/app/paxis`
5. `sudo systemctl restart paxis`
6. `GET /health` smoke test

To deploy manually:
```bash
bun build --compile --target=bun-linux-x64 src/index.ts --outfile=paxis
scp paxis paxis@getpaxis.com:~/app/paxis
ssh paxis@getpaxis.com "chmod +x ~/app/paxis && sudo systemctl restart paxis"
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
