import { and, eq, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { mcpTokens } from "../../db/schema";
import { writeAudit } from "../../lib/audit";
import { authIdToUuid } from "../../lib/auth-helpers";
import { db } from "../../lib/db";
import { generateTokenHash } from "../../mcp/auth";
import type { AuthVariables } from "../../middleware/session";

const router = new Hono<{ Variables: AuthVariables }>();

const CreateSchema = z.object({ name: z.string().min(1).max(100) });

router.post("/", async (c) => {
  const user = c.get("user")!;
  const supplierId = authIdToUuid(user.supplierId);
  if (!supplierId) return c.json({ error: "Not linked to a supplier" }, 403);

  const body = await c.req.json().catch(() => null);
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: "name is required" }, 400);

  const rawToken = crypto.randomUUID();
  const tokenHash = generateTokenHash(rawToken);

  const [row] = await db
    .insert(mcpTokens)
    .values({ supplierId, tokenHash, name: parsed.data.name })
    .returning();

  await writeAudit({
    agentName: "planner",
    action: "mcp_token_issued",
    supplierId,
    entityType: "mcp_tokens",
    entityId: row!.id,
    payload: { name: parsed.data.name },
  });

  return c.json(
    {
      id: row!.id,
      name: row!.name,
      createdAt: row!.createdAt,
      token: rawToken,
    },
    201,
  );
});

router.get("/", async (c) => {
  const user = c.get("user")!;
  const supplierId = authIdToUuid(user.supplierId);
  if (!supplierId) return c.json({ error: "Not linked to a supplier" }, 403);

  const rows = await db
    .select({
      id: mcpTokens.id,
      name: mcpTokens.name,
      createdAt: mcpTokens.createdAt,
      lastUsedAt: mcpTokens.lastUsedAt,
      revokedAt: mcpTokens.revokedAt,
    })
    .from(mcpTokens)
    .where(eq(mcpTokens.supplierId, supplierId));

  return c.json(rows);
});

router.delete("/:id", async (c) => {
  const user = c.get("user")!;
  const supplierId = authIdToUuid(user.supplierId);
  if (!supplierId) return c.json({ error: "Not linked to a supplier" }, 403);

  const [row] = await db
    .update(mcpTokens)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(mcpTokens.id, c.req.param("id")),
        eq(mcpTokens.supplierId, supplierId),
        isNull(mcpTokens.revokedAt),
      ),
    )
    .returning({ id: mcpTokens.id });

  if (!row) return c.json({ error: "Token not found or already revoked" }, 404);

  return c.json({ id: row.id, revoked: true });
});

export default router;
