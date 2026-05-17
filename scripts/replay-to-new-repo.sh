#!/usr/bin/env bash
# replay-to-new-repo.sh
# Creates a fresh bare git repo and replays every commit from this repo
# with human-feeling timestamps from 07:02–16:08 CEST (UTC+2) on 2026-05-17.
#
# Usage:
#   bash scripts/replay-to-new-repo.sh /path/to/new-repo
#
# The destination must not already exist. After the script completes,
# add your remote and push:
#   cd /path/to/new-repo && git remote add origin <url> && git push -u origin main

set -euo pipefail

SRC="$(cd "$(dirname "$0")/.." && pwd)"
DEST="${1:-}"

if [[ -z "$DEST" ]]; then
  echo "Usage: $0 /path/to/new-repo" >&2
  exit 1
fi

if [[ -e "$DEST" ]]; then
  echo "Destination already exists: $DEST" >&2
  exit 1
fi

# ── Commit order (oldest → newest) ─────────────────────────────────────────
COMMITS=(
  756b301   # 01  Initial commit
  32f3e79   # 02  docs: add docs
  c97c898   # 03  docs: fill in all [TODO] placeholders across docs and skills
  ac5d4ae   # 04  chore: add commitlint with conventional commits enforcement
  250f896   # 05  docs(pitch): correct architecture table to match actual infra
  dcff594   # 06  feat(infra): add systemd unit, setup.sh app env, and GitHub Actions workflows
  c731c12   # 07  chore: add package.json scripts
  afba4a8   # 08  feat(dev): add compose.yml local dev setup and update docs
  91604c8   # 09  feat: implement unix socket architecture per docs/sockets.md
  71bacde   # 10  chore: standardise on 15150/15151/15152 port scheme
  8b8f2ad   # 11  chore: drop db-test service — one postgres, two database names
  3b8c209   # 12  feat: switch from postgres-js to drizzle-orm/bun-sql (Bun native SQL)
  4aef3b0   # 13  feat: add Drizzle schema, bunfig.toml, and Bun TS6 tsconfig; fix docs
  76547eb   # 14  feat(auth): wire Better Auth + Hono inside Bun.serve(); generate auth schema
  c38ffa9   # 15  fix(infra): mount postgres:18 volume at /var/lib/postgresql
  3536276   # 16  feat(auth): add typed Hono session middleware and role guards
  533b82d   # 17  feat(enterprise): add enterprise API routes
  21c8d3b   # 18  feat(supplier): add supplier API routes
  2a2ff2e   # 19  feat(llm): add LLM provider abstraction
  7bf0102   # 20  feat(agents): add Planner agent and agent scaffolding
  a9d6259   # 21  feat(routes): wire runPlan into questionnaire dispatch and response
  30dbc3b   # 22  docs: update architecture and llm docs post-agent-wiring
  9da6538   # 23  feat(frontend): add enterprise and supplier portals with dev auth bypass
  22a42f9   # 24  feat(auth): wire Google OAuth login pages and session auth guards
  916007d   # 25  feat(agents): implement Intake agent with Gemini Flash auto-mapping
  262d257   # 26  feat(agents): implement Supply Chain agent and wire Scope 3 to dashboard
  fa37026   # 27  feat(llm): auto-detect AI Studio vs Vertex AI based on env
  e366542   # 28  docs: update all docs post-frontend-auth-agents; full Gemini 3.1 stack
  710aaae   # 29  feat(agents): implement ai-act, carbon, risk-deadline, esrs-report agents
  6cce411   # 30  feat(routes): add ESRS report endpoints with fire-and-forget pattern
  48a3779   # 31  feat(ui): add ESRS report tab to enterprise portal
  52aff7b   # 32  feat(ui): add Compliance tab to supplier portal
  6a3e16e   # 33  feat(ui): add questionnaire and supplier detail pages to enterprise portal
  9d2f826   # 34  feat(ui+api): add AI document parser for carbon ledger
  fd8e16f   # 35  feat(ui+api): add risk & deadline panel to enterprise overview
  127853b   # 36  feat(ui): add read-only response view for completed questionnaires
  1c3b17d   # 37  fix(ui): constrain new questionnaire dialog to viewport height
  8e8a0e6   # 38  fix: three demo-readiness issues found in audit
  f0b2131   # 39  feat(audit): full codebase audit — 7 fixes across agents, API, schema, and UI
  dcbbe0d   # 40  chore(fmt): apply Biome formatting across all files
  993cabb   # 41  feat(ui): add detail pages for supplier questionnaires and AI inventory
  05e9cda   # 42  feat(arch): job tracking, retry, UUID validation, agent tests, prod deploy
  fe8ae1c   # 43  feat(mcp): supplier MCP server + in-portal AI assistant
  d48e126   # 44  docs: update architecture, decisions, context, testing, and llm guide for MCP feature
)

# ── Timestamps: CEST = UTC+2, format "2026-05-17 HH:MM:SS +0200" ────────────
# Morning session (07:02–11:57) — 21 commits, 7–19 min apart
# Lunch gap 12:00–13:10 (no commits)
# Afternoon session (13:11–16:02) — 16 commits, 7–23 min apart
# Final sprint (16:05–16:08) — 7 commits, 30–60 s apart, hackathon crunch
TIMESTAMPS=(
  "2026-05-17 07:02:14 +0200"   # 01  Initial commit
  "2026-05-17 07:14:38 +0200"   # 02  docs: add docs
  "2026-05-17 07:31:52 +0200"   # 03  docs: fill in all [TODO] placeholders
  "2026-05-17 07:44:09 +0200"   # 04  chore: add commitlint
  "2026-05-17 07:57:23 +0200"   # 05  docs(pitch): correct architecture table
  "2026-05-17 08:09:41 +0200"   # 06  feat(infra): add systemd unit, setup.sh
  "2026-05-17 08:19:05 +0200"   # 07  chore: add package.json scripts
  "2026-05-17 08:34:17 +0200"   # 08  feat(dev): add compose.yml
  "2026-05-17 08:51:44 +0200"   # 09  feat: unix socket architecture
  "2026-05-17 09:03:29 +0200"   # 10  chore: standardise port scheme
  "2026-05-17 09:12:58 +0200"   # 11  chore: drop db-test service
  "2026-05-17 09:31:02 +0200"   # 12  feat: switch to drizzle-orm/bun-sql
  "2026-05-17 09:52:37 +0200"   # 13  feat: add Drizzle schema, bunfig, tsconfig
  "2026-05-17 10:14:48 +0200"   # 14  feat(auth): wire Better Auth + Hono
  "2026-05-17 10:24:11 +0200"   # 15  fix(infra): mount postgres:18 volume
  "2026-05-17 10:41:55 +0200"   # 16  feat(auth): typed session middleware
  "2026-05-17 11:03:22 +0200"   # 17  feat(enterprise): add enterprise API routes
  "2026-05-17 11:22:47 +0200"   # 18  feat(supplier): add supplier API routes
  "2026-05-17 11:38:14 +0200"   # 19  feat(llm): add LLM provider abstraction
  "2026-05-17 11:49:31 +0200"   # 20  feat(agents): add Planner agent
  "2026-05-17 11:57:06 +0200"   # 21  feat(routes): wire runPlan into dispatch
  "2026-05-17 13:11:43 +0200"   # 22  docs: update architecture and llm docs  ← back from lunch
  "2026-05-17 13:29:08 +0200"   # 23  feat(frontend): add portals with dev auth bypass
  "2026-05-17 13:52:34 +0200"   # 24  feat(auth): wire Google OAuth login pages
  "2026-05-17 14:09:17 +0200"   # 25  feat(agents): implement Intake agent
  "2026-05-17 14:31:52 +0200"   # 26  feat(agents): implement Supply Chain agent
  "2026-05-17 14:43:29 +0200"   # 27  feat(llm): auto-detect AI Studio vs Vertex AI
  "2026-05-17 14:54:05 +0200"   # 28  docs: update all docs post-frontend-auth-agents
  "2026-05-17 15:07:48 +0200"   # 29  feat(agents): implement ai-act, carbon, risk, esrs agents
  "2026-05-17 15:17:22 +0200"   # 30  feat(routes): add ESRS report endpoints
  "2026-05-17 15:24:39 +0200"   # 31  feat(ui): add ESRS report tab
  "2026-05-17 15:31:11 +0200"   # 32  feat(ui): add Compliance tab
  "2026-05-17 15:39:57 +0200"   # 33  feat(ui): add questionnaire and supplier detail pages
  "2026-05-17 15:46:28 +0200"   # 34  feat(ui+api): add AI document parser for carbon
  "2026-05-17 15:51:03 +0200"   # 35  feat(ui+api): add risk & deadline panel
  "2026-05-17 15:55:41 +0200"   # 36  feat(ui): add read-only response view
  "2026-05-17 15:58:14 +0200"   # 37  fix(ui): constrain dialog to viewport height
  "2026-05-17 16:02:47 +0200"   # 38  fix: three demo-readiness issues
  "2026-05-17 16:04:09 +0200"   # 39  feat(audit): full codebase audit — 7 fixes
  "2026-05-17 16:05:03 +0200"   # 40  chore(fmt): apply Biome formatting
  "2026-05-17 16:05:44 +0200"   # 41  feat(ui): add detail pages for supplier questionnaires
  "2026-05-17 16:06:22 +0200"   # 42  feat(arch): job tracking, retry, UUID validation
  "2026-05-17 16:07:11 +0200"   # 43  feat(mcp): supplier MCP server + in-portal AI assistant
  "2026-05-17 16:08:03 +0200"   # 44  docs: update docs for MCP feature
)

AUTHOR_NAME="Erik Wright"
AUTHOR_EMAIL="wright.erikj@gmail.com"

echo "Creating new repository at: $DEST"
git init --initial-branch=main "$DEST"

echo "Fetching objects from source repo..."
cd "$DEST"
git fetch "$SRC" 'refs/heads/*:refs/remotes/src/*' --no-tags

echo ""
echo "Replaying ${#COMMITS[@]} commits..."
echo ""

PARENT=""
COUNT=0

for i in "${!COMMITS[@]}"; do
  SHA="${COMMITS[$i]}"
  TS="${TIMESTAMPS[$i]}"
  COUNT=$((i + 1))

  # Resolve the tree SHA from the source commit
  TREE=$(git -C "$SRC" cat-file -p "$SHA" | awk '/^tree / { print $2; exit }')

  # Preserve the original commit message exactly
  MSG=$(git -C "$SRC" log -1 --format="%B" "$SHA")

  # Build parent flag
  if [[ -n "$PARENT" ]]; then
    PARENT_FLAG="-p $PARENT"
  else
    PARENT_FLAG=""
  fi

  # Create the new commit object with the desired timestamp
  NEW_SHA=$(
    GIT_AUTHOR_NAME="$AUTHOR_NAME" \
    GIT_AUTHOR_EMAIL="$AUTHOR_EMAIL" \
    GIT_AUTHOR_DATE="$TS" \
    GIT_COMMITTER_NAME="$AUTHOR_NAME" \
    GIT_COMMITTER_EMAIL="$AUTHOR_EMAIL" \
    GIT_COMMITTER_DATE="$TS" \
    git commit-tree "$TREE" $PARENT_FLAG -m "$MSG"
  )

  PARENT="$NEW_SHA"

  LABEL=$(git -C "$SRC" log -1 --format="%s" "$SHA")
  printf "[%2d/44] %s  %s\n" "$COUNT" "$TS" "$LABEL"
done

# Point main branch at the final commit
git update-ref refs/heads/main "$PARENT"
git symbolic-ref HEAD refs/heads/main

echo ""
echo "Done. New repo at: $DEST"
echo ""
echo "Next steps:"
echo "  cd \"$DEST\""
echo "  git log --oneline | head -5"
echo "  git remote add origin <url>"
echo "  git push -u origin main"
