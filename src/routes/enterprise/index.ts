import { and, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { runPlan } from "../../agents/planner";
import { db } from "../../lib/db";
import { auditLog, enterprises, scope3Aggregates } from "../../db/schema";
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

// ── ESRS Report ───────────────────────────────────────────────────────────────

enterprise.post("/reports/esrs", async (c) => {
	const user = c.get("user")!;
	if (!user.enterpriseId)
		return c.json({ error: "Not linked to an enterprise" }, 403);

	const [ent] = await db
		.select()
		.from(enterprises)
		.where(eq(enterprises.id, user.enterpriseId));

	if (!ent) return c.json({ error: "Enterprise not found" }, 404);

	runPlan({
		type: "esrs_report_requested",
		enterpriseId: user.enterpriseId,
		reportingYear: ent.reportingYear,
	}).catch(console.error);

	return c.json({ status: "generating", message: "Report generation started. Poll GET /reports/esrs/latest for the result." }, 202);
});

enterprise.get("/reports/esrs/latest", async (c) => {
	const user = c.get("user")!;
	if (!user.enterpriseId)
		return c.json({ error: "Not linked to an enterprise" }, 403);

	const [entry] = await db
		.select()
		.from(auditLog)
		.where(
			and(
				eq(auditLog.enterpriseId, user.enterpriseId),
				eq(auditLog.agentName, "esrs-report"),
				eq(auditLog.action, "esrs_report_generated"),
			),
		)
		.orderBy(desc(auditLog.createdAt))
		.limit(1);

	if (!entry) return c.json({ error: "No report generated yet" }, 404);

	const payload = entry.payload as { report: unknown; [k: string]: unknown };
	return c.json({ generatedAt: entry.createdAt, ...payload });
});

export default enterprise;
