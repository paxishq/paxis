import { zValidator } from "@hono/zod-validator";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { db } from "../../lib/db";
import { enterpriseSuppliers, suppliers } from "../../db/schema";
import type { AuthVariables } from "../../middleware/session";

const router = new Hono<{ Variables: AuthVariables }>();

router.get("/", async (c) => {
	const user = c.get("user")!;
	if (!user.enterpriseId)
		return c.json({ error: "Not linked to an enterprise" }, 403);

	const rows = await db
		.select({ supplier: suppliers })
		.from(enterpriseSuppliers)
		.innerJoin(suppliers, eq(enterpriseSuppliers.supplierId, suppliers.id))
		.where(eq(enterpriseSuppliers.enterpriseId, user.enterpriseId));

	return c.json(rows.map((r) => r.supplier));
});

const createSchema = z.object({
	name: z.string().min(1),
	vatNumber: z.string().optional(),
	country: z.string().min(2),
});

router.post("/", zValidator("json", createSchema), async (c) => {
	const user = c.get("user")!;
	if (!user.enterpriseId)
		return c.json({ error: "Not linked to an enterprise" }, 403);

	const body = c.req.valid("json");

	const [supplier] = await db
		.insert(suppliers)
		.values({ name: body.name, vatNumber: body.vatNumber, country: body.country })
		.returning();

	if (!supplier) return c.json({ error: "Failed to create supplier" }, 500);

	await db.insert(enterpriseSuppliers).values({
		enterpriseId: user.enterpriseId,
		supplierId: supplier.id,
	});

	return c.json(supplier, 201);
});

router.delete("/:supplierId", async (c) => {
	const user = c.get("user")!;
	if (!user.enterpriseId)
		return c.json({ error: "Not linked to an enterprise" }, 403);

	const { supplierId } = c.req.param();

	const deleted = await db
		.delete(enterpriseSuppliers)
		.where(
			and(
				eq(enterpriseSuppliers.enterpriseId, user.enterpriseId),
				eq(enterpriseSuppliers.supplierId, supplierId),
			),
		)
		.returning();

	if (!deleted.length) return c.json({ error: "Not found" }, 404);

	return c.body(null, 204);
});

export default router;
