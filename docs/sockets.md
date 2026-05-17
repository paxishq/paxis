# Paxis — Unix Socket Architecture

> Instructions for Claude Code: implement unix socket communication across the full
> Bun + Caddy + Postgres stack on the production Vultr instance.
> Local dev (Docker Compose) continues to use TCP — unix sockets are prod-only.

---

## Overview

Replace all internal TCP communication with unix sockets on production:

```
Internet → Caddy (443) → unix socket → Bun → unix socket → Postgres
```

Zero TCP ports used internally. Faster, more secure, no port conflicts on shared VPS.

---

## Socket Paths

| Service | Socket Path |
|---|---|
| Bun app | `/run/paxis/app.sock` |
| Postgres | `/var/run/postgresql/.s.PGSQL.5432` (Ubuntu default, already exists) |

---

## 1. Caddyfile

Update `/etc/caddy/Caddyfile` on the production server:

```
{
  acme_dns cloudflare {env.CF_API_TOKEN}
}

getpaxis.com {
  reverse_proxy unix//run/paxis/app.sock
}
```

Note: Caddy uses `unix//path` (double slash) not `unix:///path`.

---

## 2. Bun Server — `src/index.ts`

```typescript
const isProd = Bun.env.NODE_ENV === "production"

Bun.serve({
  ...(isProd
    ? { unix: "/run/paxis/app.sock" }
    : { port: Number(Bun.env.PORT ?? 15150) }),
  fetch(req) {
    // your routes
  },
})
```

This keeps local dev on TCP port 15150 and prod on the unix socket automatically.

---

## 3. Drizzle / Postgres Connection — `src/lib/db.ts`

`drizzle-orm/bun-sql` uses Bun's native SQL driver. Pass `DATABASE_URL` directly —
the correct value (unix socket in prod, TCP in dev) is injected via the environment:

```typescript
import { drizzle } from "drizzle-orm/bun-sql"

export const db = drizzle(Bun.env.DATABASE_URL!)
```

On prod, `DATABASE_URL=postgres:///paxis?host=/var/run/postgresql` (written by
`setup.sh`) tells Bun SQL to use the Postgres unix socket — no TCP, no password
needed (peer auth on the unix socket).

---

## 4. Socket Directory — `setup.sh`

Add this block to `scripts/setup.sh` before the Caddy restart step:

```bash
echo ">>> Setting up unix socket directory..."
mkdir -p /run/paxis
chown paxis:caddy /run/paxis
chmod 750 /run/paxis
```

The `paxis` user (Bun process owner) writes the socket.
The `caddy` user needs read/execute on the directory to proxy to it.

---

## 5. Systemd Socket Persistence

`/run/paxis/` is a tmpfs — it is wiped on reboot. The socket file itself is
recreated when Bun starts, but the directory needs to exist first.

Add a systemd tmpfiles.d rule so the directory is recreated automatically on boot:

Create `/etc/tmpfiles.d/paxis.conf`:

```
d /run/paxis 0750 paxis caddy -
```

Add to `setup.sh`:

```bash
echo ">>> Writing tmpfiles.d rule for socket directory..."
echo "d /run/paxis 0750 paxis caddy -" > /etc/tmpfiles.d/paxis.conf
systemd-tmpfiles --create /etc/tmpfiles.d/paxis.conf
```

---

## 6. Postgres Peer Auth

On Ubuntu 26.04 with Postgres 18, the default `pg_hba.conf` allows peer auth for
local unix socket connections. The `paxis` OS user connecting to the `paxis` database
as the `paxis` Postgres role will be authenticated automatically — no password required
on the unix socket connection.

Verify in `/etc/postgresql/18/main/pg_hba.conf`:

```
# TYPE  DATABASE  USER    ADDRESS   METHOD
local   all       all               peer
```

This line should already be present. No changes needed.

---

## 7. Update DATABASE_URL in setup.sh

The `DATABASE_URL` written to `/etc/paxis.env` should use the unix socket path for prod:

```bash
cat > /etc/paxis.env << APPENV
PAXIS_DB_PASSWORD=${DB_PASS}
DATABASE_URL=postgres:///paxis?host=/var/run/postgresql
NODE_ENV=production
APPENV
```

Note: no username/password in the unix socket URL — peer auth handles it.

---

## 8. compose.yml — No Changes Needed

Local dev continues to use TCP. The `DATABASE_URL` in `compose.yml` stays as:

```
DATABASE_URL: postgres://paxis:paxis@db:5432/paxis
```

`NODE_ENV` defaults to `development` in Compose, so `src/index.ts` and `src/lib/db.ts`
will automatically use TCP ports locally and unix sockets on prod.

---

## 9. UFW — No Changes Needed

Port 15150 and 15151 were never opened in UFW (they were localhost-only). Unix sockets
don't touch the network stack at all so no firewall changes are needed.

---

## Verification

After deploying, verify the stack on the server:

```bash
# Check Bun created the socket
ls -la /run/paxis/app.sock

# Check Caddy is proxying to it
sudo systemctl status caddy

# Check the site is live
curl -I https://getpaxis.com

# Check Postgres unix socket exists
ls -la /var/run/postgresql/.s.PGSQL.5432
```

---

## Summary of File Changes

| File | Change |
|---|---|
| `src/index.ts` | `unix:` in prod, `port:` in dev based on `NODE_ENV` |
| `src/lib/db.ts` | `drizzle-orm/bun-sql`; reads `DATABASE_URL` — unix socket in prod, TCP in dev |
| `scripts/paxis-setup.sh` | Add socket dir creation + tmpfiles.d rule + updated `DATABASE_URL` |
| `/etc/caddy/Caddyfile` | `reverse_proxy unix//run/paxis/app.sock` |
| `compose.yml` | No changes — TCP stays for local dev |
