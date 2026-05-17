import { zValidator } from "@hono/zod-validator";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { dispatchPlan } from "../../agents/planner";
import { enterpriseCarbonEntries } from "../../db/schema";
import { authIdToUuid } from "../../lib/auth-helpers";
import { db } from "../../lib/db";
import type { AuthVariables } from "../../middleware/session";

const router = new Hono<{ Variables: AuthVariables }>();

const scopeEnum = z.enum(["scope1", "scope2"]);

router.get("/", async (c) => {
  const user = c.get("user")!;
  const enterpriseId = authIdToUuid(user.enterpriseId);
  if (!enterpriseId)
    return c.json({ error: "Not linked to an enterprise" }, 403);

  const scope = c.req.query("scope");
  const where =
    scope === "scope1" || scope === "scope2"
      ? and(
          eq(enterpriseCarbonEntries.enterpriseId, enterpriseId),
          eq(enterpriseCarbonEntries.scope, scope),
        )
      : eq(enterpriseCarbonEntries.enterpriseId, enterpriseId);

  const rows = await db.select().from(enterpriseCarbonEntries).where(where);
  return c.json(rows);
});

const createSchema = z.object({
  scope: scopeEnum,
  periodStart: z.string(),
  periodEnd: z.string(),
  co2Tonnes: z.number().positive(),
  sourceDescription: z.string().optional(),
  evidenceUrl: z.string().optional(),
});

router.post("/", zValidator("json", createSchema), async (c) => {
  const user = c.get("user")!;
  const enterpriseId = authIdToUuid(user.enterpriseId);
  if (!enterpriseId)
    return c.json({ error: "Not linked to an enterprise" }, 403);

  const body = c.req.valid("json");

  const [entry] = await db
    .insert(enterpriseCarbonEntries)
    .values({
      enterpriseId,
      scope: body.scope,
      periodStart: new Date(body.periodStart),
      periodEnd: new Date(body.periodEnd),
      co2Tonnes: body.co2Tonnes,
      sourceDescription: body.sourceDescription,
      evidenceUrl: body.evidenceUrl,
    })
    .returning();

  if (!entry) return c.json({ error: "Failed to create entry" }, 500);

  const { jobId } = await dispatchPlan({
    type: "scope3_recalculate",
    enterpriseId,
  });

  return c.json({ ...entry, jobId }, 201);
});

router.delete("/:id", async (c) => {
  const user = c.get("user")!;
  const enterpriseId = authIdToUuid(user.enterpriseId);
  if (!enterpriseId)
    return c.json({ error: "Not linked to an enterprise" }, 403);

  const deleted = await db
    .delete(enterpriseCarbonEntries)
    .where(
      and(
        eq(enterpriseCarbonEntries.id, c.req.param("id")),
        eq(enterpriseCarbonEntries.enterpriseId, enterpriseId),
      ),
    )
    .returning();

  if (!deleted.length) return c.json({ error: "Not found" }, 404);
  return c.body(null, 204);
});

export default router;
