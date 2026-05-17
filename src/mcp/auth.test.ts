import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { eq } from "drizzle-orm";
import { mcpTokens, suppliers } from "../db/schema";
import { db } from "../lib/db";
import { checkLlmRateLimit, generateTokenHash, resolveMcpToken } from "./auth";

const TEST_SUPPLIER_ID = "00000000-0000-0000-0000-000000000050";
const RAW_TOKEN = "test-mcp-token-raw-value-unique-abc123";
const REVOKED_TOKEN = "test-mcp-token-revoked-xyz456";
let insertedTokenId: string;
let revokedTokenId: string;

beforeAll(async () => {
  await db
    .insert(suppliers)
    .values({ id: TEST_SUPPLIER_ID, name: "Auth Test Supplier", country: "DE" })
    .onConflictDoNothing();

  const [active] = await db
    .insert(mcpTokens)
    .values({
      supplierId: TEST_SUPPLIER_ID,
      tokenHash: generateTokenHash(RAW_TOKEN),
      name: "Test active token",
    })
    .returning();
  insertedTokenId = active!.id;

  const [revoked] = await db
    .insert(mcpTokens)
    .values({
      supplierId: TEST_SUPPLIER_ID,
      tokenHash: generateTokenHash(REVOKED_TOKEN),
      name: "Test revoked token",
      revokedAt: new Date(),
    })
    .returning();
  revokedTokenId = revoked!.id;
});

afterAll(async () => {
  await db.delete(mcpTokens).where(eq(mcpTokens.supplierId, TEST_SUPPLIER_ID));
  await db.delete(suppliers).where(eq(suppliers.id, TEST_SUPPLIER_ID));
});

describe("resolveMcpToken", () => {
  it("resolves a valid token and returns supplierId + tokenId", async () => {
    const result = await resolveMcpToken(RAW_TOKEN);
    expect(result).not.toBeNull();
    expect(result!.supplierId).toBe(TEST_SUPPLIER_ID);
    expect(result!.tokenId).toBe(insertedTokenId);
  });

  it("stamps lastUsedAt after resolve", async () => {
    await resolveMcpToken(RAW_TOKEN);
    // Give the fire-and-forget a tick to settle
    await new Promise((r) => setTimeout(r, 50));

    const [row] = await db
      .select()
      .from(mcpTokens)
      .where(eq(mcpTokens.id, insertedTokenId));

    expect(row!.lastUsedAt).not.toBeNull();
  });

  it("returns null for a revoked token", async () => {
    const result = await resolveMcpToken(REVOKED_TOKEN);
    expect(result).toBeNull();
    // Ensure revokedTokenId exists in the DB (just to satisfy linter)
    expect(revokedTokenId).toBeDefined();
  });

  it("returns null for an unknown token", async () => {
    const result = await resolveMcpToken("totally-unknown-token-value");
    expect(result).toBeNull();
  });
});

describe("checkLlmRateLimit", () => {
  it("allows the first 20 calls within the window", () => {
    const tokenId = "rate-limit-test-" + Math.random();
    for (let i = 0; i < 20; i++) {
      expect(checkLlmRateLimit(tokenId)).toBe(true);
    }
  });

  it("blocks the 21st call within the window", () => {
    const tokenId = "rate-limit-block-" + Math.random();
    for (let i = 0; i < 20; i++) checkLlmRateLimit(tokenId);
    expect(checkLlmRateLimit(tokenId)).toBe(false);
  });

  it("allows calls again after the window resets", () => {
    const realNow = Date.now;
    const start = Date.now();

    const tokenId = "rate-limit-reset-" + Math.random();
    for (let i = 0; i < 20; i++) checkLlmRateLimit(tokenId);
    expect(checkLlmRateLimit(tokenId)).toBe(false);

    // Simulate window expiry
    Date.now = () => start + 61_000;
    expect(checkLlmRateLimit(tokenId)).toBe(true);

    Date.now = realNow;
  });
});
