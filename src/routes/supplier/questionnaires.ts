import { zValidator } from "@hono/zod-validator";
import { and, eq, inArray } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { runPlan } from "../../agents/planner";
import { questionnaireResponses, questionnaires } from "../../db/schema";
import { db } from "../../lib/db";
import type { AuthVariables } from "../../middleware/session";

const router = new Hono<{ Variables: AuthVariables }>();

router.get("/", async (c) => {
  const user = c.get("user")!;
  if (!user.supplierId)
    return c.json({ error: "Not linked to a supplier" }, 403);

  const rows = await db
    .select()
    .from(questionnaires)
    .where(
      and(
        eq(questionnaires.supplierId, user.supplierId),
        inArray(questionnaires.status, [
          "sent",
          "in_progress",
          "completed",
          "overdue",
        ]),
      ),
    );

  return c.json(rows);
});

router.get("/:id", async (c) => {
  const user = c.get("user")!;
  if (!user.supplierId)
    return c.json({ error: "Not linked to a supplier" }, 403);

  const [questionnaire] = await db
    .select()
    .from(questionnaires)
    .where(
      and(
        eq(questionnaires.id, c.req.param("id")),
        eq(questionnaires.supplierId, user.supplierId),
      ),
    );

  if (!questionnaire) return c.json({ error: "Not found" }, 404);

  const [response] = await db
    .select()
    .from(questionnaireResponses)
    .where(
      and(
        eq(questionnaireResponses.questionnaireId, questionnaire.id),
        eq(questionnaireResponses.supplierId, user.supplierId),
      ),
    );

  return c.json({ ...questionnaire, response: response ?? null });
});

const respondSchema = z.object({
  answers: z.record(z.string(), z.unknown()),
  submit: z.boolean().default(false),
});

router.post("/:id/respond", zValidator("json", respondSchema), async (c) => {
  const user = c.get("user")!;
  if (!user.supplierId)
    return c.json({ error: "Not linked to a supplier" }, 403);

  const body = c.req.valid("json");

  const [questionnaire] = await db
    .select()
    .from(questionnaires)
    .where(
      and(
        eq(questionnaires.id, c.req.param("id")),
        eq(questionnaires.supplierId, user.supplierId),
      ),
    );

  if (!questionnaire) return c.json({ error: "Not found" }, 404);
  if (!["sent", "in_progress"].includes(questionnaire.status))
    return c.json({ error: "Questionnaire is not open for responses" }, 400);

  const now = new Date();

  const [existing] = await db
    .select()
    .from(questionnaireResponses)
    .where(
      and(
        eq(questionnaireResponses.questionnaireId, questionnaire.id),
        eq(questionnaireResponses.supplierId, user.supplierId),
      ),
    );

  const [response] = existing
    ? await db
        .update(questionnaireResponses)
        .set({
          answers: body.answers,
          submittedAt: body.submit ? now : existing.submittedAt,
          updatedAt: now,
        })
        .where(eq(questionnaireResponses.id, existing.id))
        .returning()
    : await db
        .insert(questionnaireResponses)
        .values({
          questionnaireId: questionnaire.id,
          supplierId: user.supplierId,
          answers: body.answers,
          submittedAt: body.submit ? now : null,
        })
        .returning();

  if (questionnaire.status === "sent") {
    await db
      .update(questionnaires)
      .set({ status: "in_progress", updatedAt: now })
      .where(eq(questionnaires.id, questionnaire.id));
  }

  if (body.submit && questionnaire.status !== "completed") {
    await db
      .update(questionnaires)
      .set({ status: "completed", completedAt: now, updatedAt: now })
      .where(eq(questionnaires.id, questionnaire.id));
  }

  if (body.submit && response) {
    runPlan({
      type: "questionnaire_responded",
      questionnaireId: questionnaire.id,
      responseId: response.id,
      enterpriseId: questionnaire.enterpriseId,
      supplierId: questionnaire.supplierId,
    }).catch(console.error);

    // Always recalculate Scope 3 deterministically — don't rely solely on LLM planning.
    const { runSupplyChain } = await import("../../agents/supply-chain");
    runSupplyChain(
      {},
      {
        enterpriseId: questionnaire.enterpriseId,
        supplierId: questionnaire.supplierId,
      },
    ).catch(console.error);
  }

  return c.json(response);
});

export default router;
