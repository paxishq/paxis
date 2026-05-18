# Production Deploy — Manual Prerequisites

Everything in this file must be done by hand before running `scripts/setup.sh` on the server. None of it can be scripted because it requires clicking through external dashboards and copying credentials.

Do these in order — each step produces something the next step needs.

---

## 1. Provision the Vultr Server

Go to [vultr.com](https://my.vultr.com) → **Deploy New Server**.

- **Type:** Cloud Compute — Optimized Cloud Compute (VX1)
- **Location:** Amsterdam or Frankfurt (lowest latency for EU users)
- **OS:** Upload ISO → Ubuntu 26.04 LTS, or pick from Marketplace if available
- **User Data:** Paste the entire contents of `scripts/cloud-init.yaml` into the User Data field

  This script does the heavy lifting: installs PostgreSQL 18, builds Caddy with the Cloudflare DNS plugin, hardens SSH, sets up the firewall, and creates the `paxis` system user. It runs once on first boot and takes about 5–10 minutes.

- **SSH Key:** Add your public key so you can SSH in as root after boot

Deploy the instance and note the assigned **public IPv4 address** — you'll need it for DNS.

> **Verify cloud-init finished:** SSH in as root and run `cloud-init status --wait`. It should print `status: done`. If it prints `status: error`, check `cat /var/log/cloud-init-output.log`.

---

## 2. Point DNS to the Server

In [Cloudflare](https://dash.cloudflare.com), go to the `getpaxis.com` zone → **DNS** → **Records**.

Add two A records:

| Type | Name | Content | Proxy status |
|------|------|---------|--------------|
| A | `@` | `<Vultr IP>` | **DNS only** (grey cloud) |
| A | `mcp` | `<Vultr IP>` | **DNS only** (grey cloud) |

Both proxy settings must be **off** (grey cloud, not orange). Caddy handles TLS directly via DNS-01 challenge — Cloudflare proxying would break this.

`mcp.getpaxis.com` exposes the MCP server for external agents (Claude Desktop, Cursor). Caddy reverse-proxies it to the MCP unix socket at `/run/paxis/mcp.sock`.

Propagation is usually instant through Cloudflare but can take a few minutes. You can verify with:

```sh
dig +short getpaxis.com
```

It should return your Vultr IP.

---

## 3. Create a Cloudflare API Token

Caddy needs this to answer DNS-01 ACME challenges and issue TLS certificates for `getpaxis.com`.

In Cloudflare → **My Profile** → **API Tokens** → **Create Token**:

- Use the **"Edit zone DNS"** template
- Under **Zone Resources**, select **Specific zone** → `getpaxis.com`
- Leave everything else as-is and create the token

Copy the token — it's shown once. This is your **`CF_API_TOKEN`**.

---

## 4. Create Google OAuth Credentials

The app uses Google OAuth exclusively (no password login). You need a Google Cloud project with OAuth configured.

### 4a. Create a Google Cloud Project (if you don't have one)

Go to [console.cloud.google.com](https://console.cloud.google.com) → **Select a project** → **New Project**.

Name it `paxis` or similar. Note the **Project ID** (not the display name).

### 4b. Enable the required APIs

In the project, go to **APIs & Services** → **Library** and enable:

- **Google+ API** (or **Google Identity**) — required for OAuth sign-in

### 4c. Configure the OAuth consent screen

Go to **APIs & Services** → **OAuth consent screen**:

- **User type:** External
- **App name:** Paxis
- **User support email:** your email
- **Authorized domains:** `getpaxis.com`
- **Developer contact:** your email

Save and continue through the scopes step (no extra scopes needed — just the defaults).

### 4d. Create the OAuth Client ID

Go to **APIs & Services** → **Credentials** → **Create Credentials** → **OAuth client ID**:

- **Application type:** Web application
- **Name:** Paxis Production
- **Authorized JavaScript origins:** `https://getpaxis.com`
- **Authorized redirect URIs:** `https://getpaxis.com/api/auth/callback/google`

Create it. You'll get a **Client ID** and **Client Secret**. Copy both — these are your **`GOOGLE_CLIENT_ID`** and **`GOOGLE_CLIENT_SECRET`**.

---

## 5. Get Your Gemini API Key

The app uses Gemini 3.1 Pro Preview (Planner, ESRS Report) and Gemini 3.1 Flash Lite (all other agents) via AI Studio.

Go to [aistudio.google.com/apikey](https://aistudio.google.com/apikey) → **Create API key**.

You likely already have one from local development. This is your **`GEMINI_API_KEY`**.

---

## 6. Generate a Better Auth Secret

This is a random 32-byte secret used to sign auth tokens. Generate one locally:

```sh
openssl rand -hex 32
```

Copy the output. This is your **`BETTER_AUTH_SECRET`**.

---

## 7. Set Up the GitHub Deploy Key

The server pulls code from GitHub using an SSH deploy key. This must be done as the `paxis` user on the server **before** cloning the repo.

SSH into the server:

```sh
ssh root@<server-ip>
su - paxis
```

Run the deploy key script:

```sh
bash ~/scripts/deploy-key.sh
```

It generates an Ed25519 SSH key and prints the public key. Copy the printed public key, then:

1. Go to [github.com/paxishq/paxis](https://github.com/paxishq/paxis) → **Settings** → **Deploy keys** → **Add deploy key**
2. Title: `Vultr Production`
3. Key: paste the public key
4. **Allow write access:** off (read-only is enough)

---

## 8. Run setup.sh

You now have all five secrets. Still as the `paxis` user on the server, clone the repo and run setup:

```sh
git clone git@github-paxis:paxishq/paxis.git ~/app

CF_API_TOKEN="<token>" \
BETTER_AUTH_SECRET="<secret>" \
GOOGLE_CLIENT_ID="<client-id>" \
GOOGLE_CLIENT_SECRET="<client-secret>" \
GEMINI_API_KEY="<api-key>" \
bash ~/app/scripts/setup.sh
```

This configures Caddy, PostgreSQL, the systemd service, and writes all secrets to `/etc/paxis.env`. It's idempotent — safe to re-run if something fails.

---

## 9. Build and Start the App

```sh
cd ~/app
bun install --frozen-lockfile
bun run db:push
bun run build
sudo systemctl enable --now paxis
sudo systemctl status paxis
```

Caddy will obtain a TLS certificate on the first HTTPS request. Give it 30–60 seconds on first boot.

Verify:

```sh
curl https://getpaxis.com/api/auth/session
# should return: {"session":null}
```

---

## 10. Link Demo Accounts

After a user signs in with Google for the first time, their account exists in the database but has no role or enterprise/supplier assignment. Run this on the server to link them:

```sh
cd ~/app
source /etc/paxis.env

# Enterprise user
bun scripts/link-account.ts \
  --email=user@example.com \
  --role=enterprise_admin \
  --enterprise-id=<uuid-from-seed>

# Supplier user
bun scripts/link-account.ts \
  --email=supplier@example.com \
  --role=supplier_node \
  --supplier-id=<uuid-from-seed>
```

To find the seeded enterprise/supplier UUIDs:

```sh
psql -d paxis -c "SELECT id, name FROM enterprises;"
psql -d paxis -c "SELECT id, name FROM suppliers;"
```

---

## Summary Checklist

- [ ] Vultr VX1 provisioned with `cloud-init.yaml`, cloud-init finished successfully
- [ ] `getpaxis.com` A record → Vultr IP, DNS-only (grey cloud)
- [ ] `mcp.getpaxis.com` A record → Vultr IP, DNS-only (grey cloud)
- [ ] Cloudflare API token created, scoped to `getpaxis.com` zone DNS
- [ ] Google Cloud OAuth credentials created with `https://getpaxis.com/api/auth/callback/google` redirect URI
- [ ] Gemini API key ready
- [ ] `BETTER_AUTH_SECRET` generated
- [ ] GitHub deploy key added to `paxishq/paxis` repo
- [ ] `setup.sh` completed without errors
- [ ] `bun run db:push` applied schema
- [ ] `paxis.service` running, `curl https://getpaxis.com/api/auth/session` returns 200
- [ ] Demo accounts linked via `scripts/link-account.ts`
