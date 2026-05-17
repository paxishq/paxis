import { and, eq, isNull } from "drizzle-orm";
import { mcpTokens } from "../db/schema";
import { db } from "../lib/db";

// ── Token resolution ──────────────────────────────────────────────────────────

function hashToken(raw: string): string {
  return new Bun.CryptoHasher("sha256").update(raw).digest("hex");
}

export async function resolveMcpToken(
  rawToken: string,
): Promise<{ supplierId: string; tokenId: string } | null> {
  const hash = hashToken(rawToken);

  const [row] = await db
    .select()
    .from(mcpTokens)
    .where(and(eq(mcpTokens.tokenHash, hash), isNull(mcpTokens.revokedAt)));

  if (!row) return null;

  // Stamp lastUsedAt fire-and-forget
  db.update(mcpTokens)
    .set({ lastUsedAt: new Date() })
    .where(eq(mcpTokens.id, row.id))
    .catch(() => {});

  return { supplierId: row.supplierId, tokenId: row.id };
}

export function generateTokenHash(raw: string): string {
  return hashToken(raw);
}

// ── LLM rate limiter (in-memory, resets on restart) ──────────────────────────
// Applied only to LLM-backed tools; read tools and write tools are uncapped.

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const LIMIT = 20;
const WINDOW_MS = 60_000;

export function checkLlmRateLimit(tokenId: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(tokenId);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(tokenId, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }

  if (entry.count >= LIMIT) return false;

  entry.count++;
  return true;
}
