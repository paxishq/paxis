import { zValidator } from "@hono/zod-validator";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { db } from "../../lib/db";
import { carbonEntries } from "../../db/schema";
import type { AuthVariables } from "../../middleware/session";

const router = new Hono<{ Variables: AuthVariables }>();

const scopeEnum = z.enum(["scope1", "scope2"]);

router.get("/", async (c) => {
	const user = c.get("user")!;
	if (!user.supplierId)
		return c.json({ error: "Not linked to a supplier" }, 403);

	const scope = c.req.query("scope");
	const where =
		scope === "scope1" || scope === "scope2"
			? and(
					eq(carbonEntries.supplierId, user.supplierId),
					eq(carbonEntries.scope, scope),
				)
			: eq(carbonEntries.supplierId, user.supplierId);

	const rows = await db.select().from(carbonEntries).where(where);

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
	if (!user.supplierId)
		return c.json({ error: "Not linked to a supplier" }, 403);

	const body = c.req.valid("json");

	const [entry] = await db
		.insert(carbonEntries)
		.values({
			supplierId: user.supplierId,
			scope: body.scope,
			periodStart: new Date(body.periodStart),
			periodEnd: new Date(body.periodEnd),
			co2Tonnes: body.co2Tonnes,
			sourceDescription: body.sourceDescription,
			evidenceUrl: body.evidenceUrl,
			parsedFromDocument: false,
		})
		.returning();

	if (!entry) return c.json({ error: "Failed to create entry" }, 500);

	// TODO: trigger Carbon Agent for audit log

	return c.json(entry, 201);
});

router.post("/parse", async (c) => {
	const user = c.get("user")!;
	if (!user.supplierId)
		return c.json({ error: "Not linked to a supplier" }, 403);

	const body = await c.req.parseBody();
	const file = body["file"];

	if (!file || !(file instanceof File))
		return c.json({ error: "No file provided" }, 400);

	const allowed = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
	if (!allowed.includes(file.type))
		return c.json({ error: "Unsupported file type. Use PDF, JPEG, PNG, or WebP." }, 400);

	const documentData = Buffer.from(await file.arrayBuffer()).toString("base64");

	const { runCarbon } = await import("../../agents/carbon");
	const result = await runCarbon(
		{ documentData, mimeType: file.type },
		{ supplierId: user.supplierId },
	);

	return c.json(result);
});

export default router;
