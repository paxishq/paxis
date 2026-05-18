#!/bin/bash
# paxis-deploy-key.sh
# One-time manual setup — run this ONCE before paxis-setup.sh
# Must be run interactively over SSH as the paxis user (not root)
# Usage: bash paxis-deploy-key.sh

set -euo pipefail

if [ "$EUID" -eq 0 ]; then
  echo "❌ Run this as the paxis user, not root."
  echo "   SSH in as paxis and run: bash paxis-deploy-key.sh"
  exit 1
fi

if [ -f ~/.ssh/github_deploy ]; then
  echo "✅ Deploy key already exists at ~/.ssh/github_deploy"
  echo ""
  echo "Public key:"
  cat ~/.ssh/github_deploy.pub
  echo ""
  echo "If you need to re-add it to GitHub, copy the key above."
  exit 0
fi

echo ">>> Generating GitHub deploy key..."
ssh-keygen -t ed25519 -C "paxis-server-deploy" -f ~/.ssh/github_deploy -N ""

echo ">>> Writing SSH config..."
cat > ~/.ssh/config << 'SSHCONFIG'
Host github-paxis
  HostName github.com
  IdentityFile ~/.ssh/github_deploy
  IdentityOnly yes
  StrictHostKeyChecking accept-new
SSHCONFIG
chmod 600 ~/.ssh/config

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Add this deploy key to GitHub before continuing"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
cat ~/.ssh/github_deploy.pub
echo ""
echo "  → github.com/paxishq/<repo> → Settings → Deploy keys → Add deploy key"
echo "  → Title: paxis-server"
echo "  → Allow write access: NO (read-only)"
echo ""
read -p "Press ENTER once the deploy key has been added to GitHub..."

echo ">>> Verifying GitHub SSH connection..."
ssh -T git@github.com || true
# GitHub returns exit code 1 even on success

echo ""
echo "✅ Deploy key setup complete. You can now run paxis-setup.sh."
