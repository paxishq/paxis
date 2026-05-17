import { describe, expect, it } from "bun:test";
import type { AgentName, AuditEntry } from "./audit";

describe("AuditEntry type", () => {
  it("accepts a minimal valid entry", () => {
    const entry: AuditEntry = {
      agentName: "planner",
      action: "plan_created",
    };
    expect(entry.agentName).toBe("planner");
    expect(entry.action).toBe("plan_created");
  });

  it("accepts all valid agent names", () => {
    const names: AgentName[] = [
      "planner",
      "intake",
      "ai-act",
      "carbon",
      "supply-chain",
      "risk-deadline",
      "esrs-report",
    ];
    for (const name of names) {
      const entry: AuditEntry = { agentName: name, action: "test" };
      expect(entry.agentName).toBe(name);
    }
  });

  it("accepts optional fields", () => {
    const entry: AuditEntry = {
      agentName: "supply-chain",
      action: "supply_chain_completed",
      enterpriseId: "ent-123",
      supplierId: "sup-456",
      entityType: "questionnaire",
      entityId: "q-789",
      payload: { co2Tonnes: 42.5, supplierCount: 3 },
    };
    expect(entry.payload?.co2Tonnes).toBe(42.5);
  });
});
