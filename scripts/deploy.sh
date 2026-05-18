#!/usr/bin/env bash
set -euo pipefail

BUN="${HOME}/.bun/bin/bun"
APP="/home/paxis/app"

cd "$APP"

echo ">>> Pulling latest code..."
git pull

echo ">>> Installing dependencies..."
"$BUN" install --frozen-lockfile

echo ">>> Applying schema migrations..."
source /etc/paxis.env
"$BUN" x drizzle-kit push

echo ">>> Building binary..."
"$BUN" run build

echo ">>> Restarting service..."
sudo systemctl restart paxis
sudo systemctl status paxis --no-pager

echo ""
echo "✅ Deploy complete."
