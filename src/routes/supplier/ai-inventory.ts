import { zValidator } from "@hono/zod-validator";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { runPlan } from "../../agents/planner";
import { aiInventories } from "../../db/schema";
import { db } from "../../lib/db";
import type { AuthVariables } from "../../middleware/session";

const router = new Hono<{ Variables: AuthVariables }>();

router.get("/", async (c) => {
  const user = c.get("user")!;
  if (!user.supplierId)
    return c.json({ error: "Not linked to a supplier" }, 403);

  const rows = await db
    .select()
    .from(aiInventories)
    .where(eq(aiInventories.supplierId, user.supplierId));

  return c.json(rows);
});

const riskTierEnum = z.enum(["unacceptable", "high", "limited", "minimal"]);

const createSchema = z.object({
  toolName: z.string().min(1),
  description: z.string().optional(),
  riskTier: riskTierEnum,
  justification: z.string().optional(),
  documentationUrl: z.string().optional(),
});

router.post("/", zValidator("json", createSchema), async (c) => {
  const user = c.get("user")!;
  if (!user.supplierId)
    return c.json({ error: "Not linked to a supplier" }, 403);

  const body = c.req.valid("json");

  const [entry] = await db
    .insert(aiInventories)
    .values({ supplierId: user.supplierId, ...body })
    .returning();

  if (!entry) return c.json({ error: "Failed to create entry" }, 500);

  runPlan({
    type: "ai_inventory_updated",
    inventoryId: entry.id,
    supplierId: user.supplierId,
  }).catch(console.error);

  return c.json(entry, 201);
});

const updateSchema = createSchema.partial();

router.patch("/:id", zValidator("json", updateSchema), async (c) => {
  const user = c.get("user")!;
  if (!user.supplierId)
    return c.json({ error: "Not linked to a supplier" }, 403);

  const body = c.req.valid("json");
  const now = new Date();

  const [updated] = await db
    .update(aiInventories)
    .set({ ...body, updatedAt: now })
    .where(
      and(
        eq(aiInventories.id, c.req.param("id")),
        eq(aiInventories.supplierId, user.supplierId),
      ),
    )
    .returning();

  if (!updated) return c.json({ error: "Not found" }, 404);

  runPlan({
    type: "ai_inventory_updated",
    inventoryId: updated.id,
    supplierId: user.supplierId,
  }).catch(console.error);

  return c.json(updated);
});

router.delete("/:id", async (c) => {
  const user = c.get("user")!;
  if (!user.supplierId)
    return c.json({ error: "Not linked to a supplier" }, 403);

  const deleted = await db
    .delete(aiInventories)
    .where(
      and(
        eq(aiInventories.id, c.req.param("id")),
        eq(aiInventories.supplierId, user.supplierId),
      ),
    )
    .returning();

  if (!deleted.length) return c.json({ error: "Not found" }, 404);

  return c.body(null, 204);
});

export default router;
