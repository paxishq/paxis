#!/bin/bash
# paxis-setup.sh
# Idempotent server setup — safe to re-run
# Reads secrets from environment variables — never hardcode values here
# Run directly:        sudo -E bash paxis-setup.sh
# Run via CI:          see .github/workflows/setup-server.yml
# GitHub deploy key:   run paxis-deploy-key.sh manually BEFORE this script

set -euo pipefail

# ── REQUIRED ENV VARS ─────────────────────────────────────────────────────────
: "${CF_API_TOKEN:?CF_API_TOKEN is required}"
: "${BETTER_AUTH_SECRET:?BETTER_AUTH_SECRET is required}"
# ── OPTIONAL ENV VARS ─────────────────────────────────────────────────────────
# LLM: set GEMINI_API_KEY for AI Studio (dev/hackathon) OR leave blank and set
# GOOGLE_CLOUD_PROJECT to use Vertex AI ADC (production GCP).
GEMINI_API_KEY="${GEMINI_API_KEY:-}"
GOOGLE_CLOUD_PROJECT="${GOOGLE_CLOUD_PROJECT:-}"
# Path to GCP service account key JSON — required on non-GCP hosts using Vertex AI.
GOOGLE_APPLICATION_CREDENTIALS="${GOOGLE_APPLICATION_CREDENTIALS:-}"
GOOGLE_CLOUD_LOCATION="${GOOGLE_CLOUD_LOCATION:-us-central1}"
GOOGLE_CLIENT_ID="${GOOGLE_CLIENT_ID:-}"
GOOGLE_CLIENT_SECRET="${GOOGLE_CLIENT_SECRET:-}"
FEATHERLESS_API_KEY="${FEATHERLESS_API_KEY:-}"
FEATHERLESS_MODEL="${FEATHERLESS_MODEL:-mistralai/Mistral-Small-3.2-24B-Instruct-2506}"
LLM_PROVIDER="${LLM_PROVIDER:-gemini}"
# ─────────────────────────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo ">>> [1/9] Installing Bun for paxis user..."
if [ ! -f /home/paxis/.bun/bin/bun ]; then
  su - paxis -c 'curl -fsSL https://bun.sh/install | bash'
else
  echo "    Bun already installed, skipping."
fi

echo ">>> [2/9] Writing Bun to PATH for paxis user..."
if ! grep -q "BUN_INSTALL" /home/paxis/.bashrc; then
  cat >> /home/paxis/.bashrc << 'BUNRC'
export BUN_INSTALL="$HOME/.bun"
export PATH="$BUN_INSTALL/bin:$PATH"
BUNRC
  chown paxis:paxis /home/paxis/.bashrc
else
  echo "    Bun PATH already set, skipping."
fi

echo ">>> [3/9] Writing Caddy env..."
cat > /etc/caddy/env << CADDYENV
CF_API_TOKEN=${CF_API_TOKEN}
CADDYENV
chmod 600 /etc/caddy/env
chown caddy:caddy /etc/caddy/env

echo ">>> [4/9] Setting up Postgres..."
if [ ! -f /etc/paxis.env ]; then
  DB_PASS=$(openssl rand -base64 32)

  # Write DB vars first — step 6 will read and extend this file
  cat > /etc/paxis.env << DBENV
PAXIS_DB_PASSWORD=${DB_PASS}
DATABASE_URL=postgres://paxis:${DB_PASS}@localhost:5432/paxis
DBENV
  chmod 600 /etc/paxis.env

  sudo -u postgres psql -c "DO \$\$ BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'paxis') THEN
      CREATE USER paxis WITH PASSWORD '${DB_PASS}';
    END IF;
  END \$\$;"
  sudo -u postgres psql -c "CREATE DATABASE paxis OWNER paxis;" 2>/dev/null || true
  sudo -u postgres psql -c "REVOKE ALL ON DATABASE paxis FROM public;"
else
  echo "    Postgres already configured, skipping."
fi

echo ">>> [5/9] Locking Postgres to localhost..."
if ! grep -q "^listen_addresses = 'localhost'" /etc/postgresql/18/main/postgresql.conf; then
  sed -i "s/#listen_addresses = 'localhost'/listen_addresses = 'localhost'/" /etc/postgresql/18/main/postgresql.conf
  systemctl restart postgresql
else
  echo "    Postgres already locked to localhost, skipping."
fi

echo ">>> [6/9] Writing app environment..."
# Source existing file to preserve the generated DB password
# shellcheck source=/dev/null
source /etc/paxis.env

cat > /etc/paxis.env << APPENV
# Database — generated on first run, do not modify
PAXIS_DB_PASSWORD=${PAXIS_DB_PASSWORD}
# Unix socket connection — peer auth, no password needed on prod
DATABASE_URL=postgres:///paxis?host=/var/run/postgresql

# Runtime
NODE_ENV=production

# Auth
BETTER_AUTH_SECRET=${BETTER_AUTH_SECRET}
BETTER_AUTH_URL=https://getpaxis.com
GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID}
GOOGLE_CLIENT_SECRET=${GOOGLE_CLIENT_SECRET}

# LLM — set GEMINI_API_KEY for AI Studio, or leave blank for Vertex AI ADC
LLM_PROVIDER=${LLM_PROVIDER}
GEMINI_API_KEY=${GEMINI_API_KEY}
GOOGLE_CLOUD_PROJECT=${GOOGLE_CLOUD_PROJECT}
GOOGLE_CLOUD_LOCATION=${GOOGLE_CLOUD_LOCATION}
GOOGLE_APPLICATION_CREDENTIALS=${GOOGLE_APPLICATION_CREDENTIALS}
FEATHERLESS_API_KEY=${FEATHERLESS_API_KEY}
FEATHERLESS_MODEL=${FEATHERLESS_MODEL}
APPENV
chmod 600 /etc/paxis.env
echo "    App environment written to /etc/paxis.env"

echo ">>> [7/9] Installing systemd unit..."
mkdir -p /home/paxis/app
chown paxis:paxis /home/paxis/app

cp "${SCRIPT_DIR}/paxis.service" /etc/systemd/system/paxis.service
systemctl daemon-reload
systemctl enable paxis
# Only start if the binary exists; first deploy will start it otherwise
if [ -f /home/paxis/app/paxis ]; then
  systemctl restart paxis
  echo "    paxis.service restarted."
else
  echo "    Binary not deployed yet — paxis.service enabled but not started."
fi

echo ">>> [8/9] Setting up unix socket directory..."
# /run is tmpfs — directory must be recreated on every boot via tmpfiles.d
echo "d /run/paxis 0750 paxis caddy -" > /etc/tmpfiles.d/paxis.conf
systemd-tmpfiles --create /etc/tmpfiles.d/paxis.conf
echo "    Socket directory: /run/paxis (0750 paxis:caddy)"

echo ">>> [9/9] Restarting Caddy..."
systemctl restart caddy

echo ""
echo "✅ Paxis setup complete."
echo ""
echo "Next steps:"
echo "  1. Push to main — GitHub Actions will build and deploy the binary"
echo "  2. To run schema migrations: ssh paxis@getpaxis.com and run 'bun run db:push' manually"
