import { auditLog } from "../db/schema";
import { db } from "./db";

export type AgentName =
  | "planner"
  | "intake"
  | "ai-act"
  | "carbon"
  | "supply-chain"
  | "risk-deadline"
  | "esrs-report";

export interface AuditEntry {
  agentName: AgentName;
  action: string;
  entityType?: string;
  entityId?: string;
  enterpriseId?: string;
  supplierId?: string;
  payload?: Record<string, unknown>;
}

export async function writeAudit(entry: AuditEntry): Promise<void> {
  await db.insert(auditLog).values(entry);
}
