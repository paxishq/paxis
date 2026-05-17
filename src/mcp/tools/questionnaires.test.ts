import { afterAll, beforeAll, describe, expect, it, mock } from "bun:test";
import { and, eq } from "drizzle-orm";
import {
  auditLog,
  enterprises,
  questionnaireResponses,
  questionnaires,
  suppliers,
} from "../../db/schema";
import { db } from "../../lib/db";

const TEST_SUPPLIER_ID = "00000000-0000-0000-0000-000000000052";
const TEST_ENTERPRISE_ID = "00000000-0000-0000-0000-000000000053";

mock.module("../../lib/llm", () => ({
  generate: async () => "{}",
  extractJson: (raw: string) => raw,
}));

const {
  getPendingQuestionnaires,
  getQuestionnaire,
  submitQuestionnaireResponse,
} = await import("./questionnaires");

let pendingQuestionnaireId: string;
let completedQuestionnaireId: string;

beforeAll(async () => {
  await db
    .insert(enterprises)
    .values({
      id: TEST_ENTERPRISE_ID,
      name: "Q-Test Enterprise",
      country: "DE",
      reportingYear: 2025,
    })
    .onConflictDoNothing();

  await db
    .insert(suppliers)
    .values({ id: TEST_SUPPLIER_ID, name: "Q-Test Supplier", country: "IT" })
    .onConflictDoNothing();

  const [pending] = await db
    .insert(questionnaires)
    .values({
      enterpriseId: TEST_ENTERPRISE_ID,
      supplierId: TEST_SUPPLIER_ID,
      title: "CSRD 2025 Q1",
      status: "sent",
      questions: [
        { id: "q1", text: "Scope 1?", type: "number", required: true },
      ],
    })
    .returning();
  pendingQuestionnaireId = pending!.id;

  const [completed] = await db
    .insert(questionnaires)
    .values({
      enterpriseId: TEST_ENTERPRISE_ID,
      supplierId: TEST_SUPPLIER_ID,
      title: "CSRD 2024 Annual",
      status: "completed",
      questions: [],
    })
    .returning();
  completedQuestionnaireId = completed!.id;
});

afterAll(async () => {
  await db
    .delete(questionnaireResponses)
    .where(eq(questionnaireResponses.supplierId, TEST_SUPPLIER_ID));
  await db
    .delete(questionnaires)
    .where(eq(questionnaires.supplierId, TEST_SUPPLIER_ID));
  await db.delete(auditLog).where(eq(auditLog.supplierId, TEST_SUPPLIER_ID));
  await db.delete(suppliers).where(eq(suppliers.id, TEST_SUPPLIER_ID));
  await db.delete(enterprises).where(eq(enterprises.id, TEST_ENTERPRISE_ID));
});

describe("getPendingQuestionnaires", () => {
  it("returns only sent/in_progress/overdue — excludes completed", async () => {
    const pending = await getPendingQuestionnaires(TEST_SUPPLIER_ID);
    const ids = pending.map((q) => q.id);
    expect(ids).toContain(pendingQuestionnaireId);
    expect(ids).not.toContain(completedQuestionnaireId);
  });
});

describe("getQuestionnaire", () => {
  it("returns null when questionnaireId belongs to another supplier", async () => {
    const result = await getQuestionnaire(
      "00000000-0000-0000-0000-000000000099",
      {
        questionnaireId: pendingQuestionnaireId,
      },
    );
    expect(result).toBeNull();
  });

  it("returns questionnaire data including gapCount for the correct supplier", async () => {
    const result = await getQuestionnaire(TEST_SUPPLIER_ID, {
      questionnaireId: pendingQuestionnaireId,
    });
    expect(result).not.toBeNull();
    expect(result!.questionnaire.id).toBe(pendingQuestionnaireId);
    expect(result!.gapCount).toBe(1); // q1 required, no answer yet
  });
});

describe("submitQuestionnaireResponse", () => {
  it("marks questionnaire as completed and writes an mcp audit entry", async () => {
    await submitQuestionnaireResponse(TEST_SUPPLIER_ID, {
      questionnaireId: pendingQuestionnaireId,
      answers: { q1: "150" },
    });

    const [updated] = await db
      .select()
      .from(questionnaires)
      .where(eq(questionnaires.id, pendingQuestionnaireId));

    expect(updated!.status).toBe("completed");

    const [entry] = await db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.supplierId, TEST_SUPPLIER_ID),
          eq(auditLog.action, "questionnaire_submitted"),
        ),
      )
      .orderBy(auditLog.createdAt)
      .limit(1);

    expect(entry).toBeDefined();
    expect(entry!.agentName).toBe("mcp");
  });
});
