import { zValidator } from "@hono/zod-validator";
import { and, desc, eq, inArray, lt } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { dispatchPlan } from "../../agents/planner";
import {
  enterpriseSuppliers,
  questionnaireResponses,
  questionnaires,
} from "../../db/schema";
import { authIdToUuid } from "../../lib/auth-helpers";
import { db } from "../../lib/db";
import type { AuthVariables } from "../../middleware/session";

const router = new Hono<{ Variables: AuthVariables }>();

const listQuerySchema = z.object({
  status: z
    .enum(["draft", "sent", "in_progress", "completed", "overdue"])
    .optional(),
});

router.get("/", zValidator("query", listQuerySchema), async (c) => {
  const user = c.get("user")!;
  const enterpriseId = authIdToUuid(user.enterpriseId);
  if (!enterpriseId)
    return c.json({ error: "Not linked to an enterprise" }, 403);

  const { status } = c.req.valid("query");

  // Mark any open questionnaires past their dueAt as overdue before returning.
  await db
    .update(questionnaires)
    .set({ status: "overdue", updatedAt: new Date() })
    .where(
      and(
        eq(questionnaires.enterpriseId, enterpriseId),
        inArray(questionnaires.status, ["sent", "in_progress"]),
        lt(questionnaires.dueAt, new Date()),
      ),
    );

  const rows = await db
    .select()
    .from(questionnaires)
    .where(
      status
        ? and(
            eq(questionnaires.enterpriseId, enterpriseId),
            eq(questionnaires.status, status),
          )
        : eq(questionnaires.enterpriseId, enterpriseId),
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
  const enterpriseId = authIdToUuid(user.enterpriseId);
  if (!enterpriseId)
    return c.json({ error: "Not linked to an enterprise" }, 403);

  const body = c.req.valid("json");

  const [rel] = await db
    .select()
    .from(enterpriseSuppliers)
    .where(
      and(
        eq(enterpriseSuppliers.enterpriseId, enterpriseId),
        eq(enterpriseSuppliers.supplierId, body.supplierId),
      ),
    );

  if (!rel) return c.json({ error: "Supplier not in your network" }, 400);

  const [questionnaire] = await db
    .insert(questionnaires)
    .values({
      enterpriseId,
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
  const enterpriseId = authIdToUuid(user.enterpriseId);
  if (!enterpriseId)
    return c.json({ error: "Not linked to an enterprise" }, 403);

  const [questionnaire] = await db
    .select()
    .from(questionnaires)
    .where(
      and(
        eq(questionnaires.id, c.req.param("id")),
        eq(questionnaires.enterpriseId, enterpriseId),
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
  const enterpriseId = authIdToUuid(user.enterpriseId);
  if (!enterpriseId)
    return c.json({ error: "Not linked to an enterprise" }, 403);

  const [questionnaire] = await db
    .select()
    .from(questionnaires)
    .where(
      and(
        eq(questionnaires.id, c.req.param("id")),
        eq(questionnaires.enterpriseId, enterpriseId),
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

  const { jobId } = await dispatchPlan({
    type: "questionnaire_dispatched",
    questionnaireId: questionnaire.id,
    enterpriseId: questionnaire.enterpriseId,
    supplierId: questionnaire.supplierId,
  });

  return c.json({ ...updated, jobId });
});

export default router;
