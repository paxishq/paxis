#!/usr/bin/env bun
/**
 * Assign a role + enterprise/supplier ID to a Google OAuth user.
 * Run after the user has signed in at least once (creates their auth record).
 *
 * Usage:
 *   bun scripts/link-account.ts --email=user@example.com --role=enterprise_admin --enterprise-id=<uuid>
 *   bun scripts/link-account.ts --email=user@example.com --role=supplier_node --supplier-id=<uuid>
 *
 * On the production server:
 *   DATABASE_URL="postgres:///paxis?host=/var/run/postgresql" bun scripts/link-account.ts ...
 */

import { eq } from "drizzle-orm";
import { user } from "../src/db/auth-schema";
import { db } from "../src/lib/db";

const args = Bun.argv.slice(2);

function arg(name: string): string | undefined {
  const prefix = `--${name}=`;
  return args.find((a) => a.startsWith(prefix))?.slice(prefix.length);
}

const email = arg("email");
const role = arg("role");
const enterpriseId = arg("enterprise-id") ?? null;
const supplierId = arg("supplier-id") ?? null;

if (!email || !role) {
  console.error(
    "Usage: bun scripts/link-account.ts --email=<email> --role=<role> [--enterprise-id=<uuid>] [--supplier-id=<uuid>]",
  );
  process.exit(1);
}

if (role !== "enterprise_admin" && role !== "supplier_node") {
  console.error(
    `Invalid role "${role}". Must be enterprise_admin or supplier_node.`,
  );
  process.exit(1);
}

if (role === "enterprise_admin" && !enterpriseId) {
  console.error("enterprise_admin role requires --enterprise-id");
  process.exit(1);
}

if (role === "supplier_node" && !supplierId) {
  console.error("supplier_node role requires --supplier-id");
  process.exit(1);
}

const [existing] = await db
  .select({ id: user.id, email: user.email })
  .from(user)
  .where(eq(user.email, email));

if (!existing) {
  console.error(
    `No user found with email "${email}". Have them sign in first.`,
  );
  process.exit(1);
}

await db
  .update(user)
  .set({ role, enterpriseId, supplierId })
  .where(eq(user.email, email));

console.log(
  `✓ ${email} → role=${role}${enterpriseId ? ` enterpriseId=${enterpriseId}` : ""}${supplierId ? ` supplierId=${supplierId}` : ""}`,
);
