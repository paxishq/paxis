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
set -a; source /etc/paxis.env; set +a
"$BUN" x drizzle-kit push

echo ">>> Building binary..."
"$BUN" run build

echo ">>> Updating service file..."
sudo cp "${APP}/scripts/paxis.service" /etc/systemd/system/paxis.service
sudo systemctl daemon-reload

echo ">>> Restarting service..."
nohup sudo systemctl restart paxis &>/dev/null &
sleep 3
sudo systemctl is-active paxis || { sudo journalctl -u paxis -n 20 --no-pager; exit 1; }
sudo journalctl -u paxis -n 5 --no-pager

echo ""
echo "✅ Deploy complete."
