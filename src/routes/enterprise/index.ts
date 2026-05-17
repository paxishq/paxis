import { desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../../lib/db";
import { enterprises, scope3Aggregates } from "../../db/schema";
import type { AuthVariables } from "../../middleware/session";
import { requireAuth, requireEnterprise } from "../../middleware/session";
import questionnaireRoutes from "./questionnaires";
import supplierRoutes from "./suppliers";

const enterprise = new Hono<{ Variables: AuthVariables }>();

enterprise.use("*", requireAuth, requireEnterprise);

enterprise.get("/me", async (c) => {
	const user = c.get("user")!;
	if (!user.enterpriseId)
		return c.json({ error: "Not linked to an enterprise" }, 403);

	const [ent] = await db
		.select()
		.from(enterprises)
		.where(eq(enterprises.id, user.enterpriseId));

	if (!ent) return c.json({ error: "Enterprise not found" }, 404);

	return c.json(ent);
});

enterprise.route("/suppliers", supplierRoutes);
enterprise.route("/questionnaires", questionnaireRoutes);

enterprise.get("/scope3", async (c) => {
	const user = c.get("user")!;
	if (!user.enterpriseId)
		return c.json({ error: "Not linked to an enterprise" }, 403);

	const rows = await db
		.select()
		.from(scope3Aggregates)
		.where(eq(scope3Aggregates.enterpriseId, user.enterpriseId))
		.orderBy(desc(scope3Aggregates.calculatedAt));

	return c.json(rows);
});

export default enterprise;
