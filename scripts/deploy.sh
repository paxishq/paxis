#!/usr/bin/env bash
# Idempotent deploy — run on the server as the paxis user.
# Pulls latest code, rebuilds binary, and restarts the service.
set -euo pipefail

cd /home/paxis/app

echo ">>> Pulling latest code..."
git pull

echo ">>> Installing dependencies..."
bun install --frozen-lockfile

echo ">>> Applying schema migrations..."
bun run db:push

echo ">>> Building binary..."
bun run build

echo ">>> Restarting service..."
sudo systemctl restart paxis
sudo systemctl status paxis --no-pager

echo ""
echo "✅ Deploy complete."
