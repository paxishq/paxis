import { describe, expect, it } from "bun:test";
import type { PlannerTask } from "./planner";

describe("PlannerTask discriminated union", () => {
  it("questionnaire_dispatched has required fields", () => {
    const task: PlannerTask = {
      type: "questionnaire_dispatched",
      questionnaireId: "q-1",
      enterpriseId: "e-1",
      supplierId: "s-1",
    };
    expect(task.type).toBe("questionnaire_dispatched");
    if (task.type === "questionnaire_dispatched") {
      expect(task.questionnaireId).toBe("q-1");
    }
  });

  it("questionnaire_responded includes responseId", () => {
    const task: PlannerTask = {
      type: "questionnaire_responded",
      questionnaireId: "q-1",
      responseId: "r-1",
      enterpriseId: "e-1",
      supplierId: "s-1",
    };
    if (task.type === "questionnaire_responded") {
      expect(task.responseId).toBe("r-1");
    }
  });

  it("scope3_recalculate only requires enterpriseId", () => {
    const task: PlannerTask = {
      type: "scope3_recalculate",
      enterpriseId: "e-1",
    };
    expect(task.type).toBe("scope3_recalculate");
  });

  it("esrs_report_requested requires reportingYear", () => {
    const task: PlannerTask = {
      type: "esrs_report_requested",
      enterpriseId: "e-1",
      reportingYear: 2025,
    };
    if (task.type === "esrs_report_requested") {
      expect(task.reportingYear).toBe(2025);
    }
  });

  it("carbon_entry_added requires entryId and supplierId", () => {
    const task: PlannerTask = {
      type: "carbon_entry_added",
      entryId: "ce-1",
      supplierId: "s-1",
    };
    if (task.type === "carbon_entry_added") {
      expect(task.entryId).toBe("ce-1");
    }
  });

  it("ai_inventory_updated requires inventoryId and supplierId", () => {
    const task: PlannerTask = {
      type: "ai_inventory_updated",
      inventoryId: "inv-1",
      supplierId: "s-1",
    };
    if (task.type === "ai_inventory_updated") {
      expect(task.inventoryId).toBe("inv-1");
    }
  });
});
