import { zValidator } from "@hono/zod-validator";
import { and, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { runPlan } from "../../agents/planner";
import { db } from "../../lib/db";
import {
	enterpriseSuppliers,
	questionnaireResponses,
	questionnaires,
} from "../../db/schema";
import type { AuthVariables } from "../../middleware/session";

const router = new Hono<{ Variables: AuthVariables }>();

const listQuerySchema = z.object({
	status: z
		.enum(["draft", "sent", "in_progress", "completed", "overdue"])
		.optional(),
});

router.get("/", zValidator("query", listQuerySchema), async (c) => {
	const user = c.get("user")!;
	if (!user.enterpriseId)
		return c.json({ error: "Not linked to an enterprise" }, 403);

	const { status } = c.req.valid("query");

	const rows = await db
		.select()
		.from(questionnaires)
		.where(
			status
				? and(
						eq(questionnaires.enterpriseId, user.enterpriseId),
						eq(questionnaires.status, status),
					)
				: eq(questionnaires.enterpriseId, user.enterpriseId),
		)
		.orderBy(desc(questionnaires.createdAt));

	return c.json(rows);
});

const questionSchema = z.object({
	id: z.string().min(1),
	text: z.string().min(1),
	type: z.enum(["text", "number", "boolean", "select"]),
	required: z.boolean().default(false),
	options: z.array(z.string()).optional(),
});

const createSchema = z.object({
	supplierId: z.uuid(),
	title: z.string().min(1),
	questions: z.array(questionSchema).min(1),
	dueAt: z.string().optional(),
});

router.post("/", zValidator("json", createSchema), async (c) => {
	const user = c.get("user")!;
	if (!user.enterpriseId)
		return c.json({ error: "Not linked to an enterprise" }, 403);

	const body = c.req.valid("json");

	const [rel] = await db
		.select()
		.from(enterpriseSuppliers)
		.where(
			and(
				eq(enterpriseSuppliers.enterpriseId, user.enterpriseId),
				eq(enterpriseSuppliers.supplierId, body.supplierId),
			),
		);

	if (!rel) return c.json({ error: "Supplier not in your network" }, 400);

	const [questionnaire] = await db
		.insert(questionnaires)
		.values({
			enterpriseId: user.enterpriseId,
			supplierId: body.supplierId,
			title: body.title,
			questions: body.questions,
			dueAt: body.dueAt ? new Date(body.dueAt) : null,
		})
		.returning();

	return c.json(questionnaire, 201);
});

router.get("/:id", async (c) => {
	const user = c.get("user")!;
	if (!user.enterpriseId)
		return c.json({ error: "Not linked to an enterprise" }, 403);

	const [questionnaire] = await db
		.select()
		.from(questionnaires)
		.where(
			and(
				eq(questionnaires.id, c.req.param("id")),
				eq(questionnaires.enterpriseId, user.enterpriseId),
			),
		);

	if (!questionnaire) return c.json({ error: "Not found" }, 404);

	const responses = await db
		.select()
		.from(questionnaireResponses)
		.where(eq(questionnaireResponses.questionnaireId, questionnaire.id));

	return c.json({ ...questionnaire, responses });
});

router.post("/:id/send", async (c) => {
	const user = c.get("user")!;
	if (!user.enterpriseId)
		return c.json({ error: "Not linked to an enterprise" }, 403);

	const [questionnaire] = await db
		.select()
		.from(questionnaires)
		.where(
			and(
				eq(questionnaires.id, c.req.param("id")),
				eq(questionnaires.enterpriseId, user.enterpriseId),
			),
		);

	if (!questionnaire) return c.json({ error: "Not found" }, 404);
	if (questionnaire.status !== "draft")
		return c.json({ error: "Only draft questionnaires can be sent" }, 400);

	const [updated] = await db
		.update(questionnaires)
		.set({ status: "sent", sentAt: new Date(), updatedAt: new Date() })
		.where(eq(questionnaires.id, questionnaire.id))
		.returning();

	runPlan({
		type: "questionnaire_dispatched",
		questionnaireId: questionnaire.id,
		enterpriseId: questionnaire.enterpriseId,
		supplierId: questionnaire.supplierId,
	}).catch(console.error);

	return c.json(updated);
});

export default router;
