import { unlinkSync } from "node:fs";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import { checkLlmRateLimit, resolveMcpToken } from "./auth";
import {
  addAiSystem,
  classifyAiTool,
  getAiInventory,
} from "./tools/ai-inventory";
import {
  addCarbonEntry,
  getCarbonEntries,
  getCarbonSummary,
} from "./tools/carbon";
import { getComplianceStatus, getDeadlineCalendar } from "./tools/compliance";
import {
  askComplianceQuestion,
  explainQuestionnaireField,
} from "./tools/guidance";
import {
  getPendingQuestionnaires,
  getQuestionnaire,
  submitQuestionnaireResponse,
  suggestQuestionnaireAnswers,
} from "./tools/questionnaires";

// ── Helpers ───────────────────────────────────────────────────────────────────

function ok(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data) }] };
}

function rateLimitError() {
  return {
    content: [
      {
        type: "text" as const,
        text: "Rate limit exceeded: 20 LLM calls per minute per token. Try again shortly.",
      },
    ],
    isError: true,
  };
}

// ── Tool registration ─────────────────────────────────────────────────────────

function registerAllTools(
  server: McpServer,
  supplierId: string,
  tokenId: string,
) {
  // ── Carbon (no rate limit) ────────────────────────────────────────────────

  server.registerTool(
    "get_carbon_summary",
    {
      description:
        "Get total Scope 1 and Scope 2 CO₂ emissions for your organisation.",
    },
    async () => ok(await getCarbonSummary(supplierId)),
  );

  server.registerTool(
    "get_carbon_entries",
    {
      description:
        "List individual carbon ledger entries, optionally filtered by scope.",
      inputSchema: {
        scope: z
          .enum(["scope1", "scope2"])
          .optional()
          .describe("Filter by Scope 1 or Scope 2"),
        limit: z
          .number()
          .int()
          .min(1)
          .max(200)
          .optional()
          .describe("Max rows (default 50)"),
      },
    },
    async ({ scope, limit }) =>
      ok(await getCarbonEntries(supplierId, { scope, limit })),
  );

  server.registerTool(
    "add_carbon_entry",
    {
      description: "Record a new Scope 1 or Scope 2 carbon emission entry.",
      inputSchema: {
        scope: z
          .enum(["scope1", "scope2"])
          .describe("scope1 = direct, scope2 = purchased energy"),
        periodStart: z.string().describe("ISO date, e.g. 2024-01-01"),
        periodEnd: z.string().describe("ISO date, e.g. 2024-03-31"),
        co2Tonnes: z
          .number()
          .positive()
          .describe("CO₂ equivalent in metric tonnes"),
        sourceDescription: z
          .string()
          .optional()
          .describe("e.g. Natural gas boiler"),
      },
    },
    async (params) => ok(await addCarbonEntry(supplierId, params)),
  );

  // ── AI inventory ──────────────────────────────────────────────────────────

  server.registerTool(
    "get_ai_inventory",
    { description: "List all AI systems in your EU AI Act inventory." },
    async () => ok(await getAiInventory(supplierId)),
  );

  server.registerTool(
    "add_ai_system",
    {
      description:
        "Register an AI system in your EU AI Act compliance inventory.",
      inputSchema: {
        toolName: z.string().describe("Name of the AI system"),
        description: z.string().optional().describe("What the system does"),
        riskTier: z
          .enum(["unacceptable", "high", "limited", "minimal"])
          .describe("EU AI Act risk tier"),
        justification: z
          .string()
          .optional()
          .describe("Why you assigned this tier"),
      },
    },
    async (params) => ok(await addAiSystem(supplierId, params)),
  );

  server.registerTool(
    "classify_ai_tool",
    {
      description:
        "Get an AI-generated EU AI Act risk classification. Read-only — does not save. Review before using add_ai_system.",
      inputSchema: {
        toolName: z.string().describe("Name of the AI system"),
        description: z.string().optional().describe("What the system does"),
        useCase: z
          .string()
          .optional()
          .describe("How your organisation uses it"),
      },
    },
    async (params) => {
      if (!checkLlmRateLimit(tokenId)) return rateLimitError();
      return ok(await classifyAiTool(supplierId, tokenId, params));
    },
  );

  // ── Questionnaires ────────────────────────────────────────────────────────

  server.registerTool(
    "get_pending_questionnaires",
    { description: "List questionnaires awaiting your response." },
    async () => ok(await getPendingQuestionnaires(supplierId)),
  );

  server.registerTool(
    "get_questionnaire",
    {
      description:
        "Get a questionnaire with its questions, current response, and gap count.",
      inputSchema: { questionnaireId: z.uuid().describe("Questionnaire ID") },
    },
    async ({ questionnaireId }) => {
      const result = await getQuestionnaire(supplierId, { questionnaireId });
      if (!result)
        return {
          content: [{ type: "text" as const, text: "Not found" }],
          isError: true,
        };
      return ok(result);
    },
  );

  server.registerTool(
    "suggest_questionnaire_answers",
    {
      description:
        "Get AI-suggested answers based on your existing data. Read-only — does not submit.",
      inputSchema: { questionnaireId: z.uuid().describe("Questionnaire ID") },
    },
    async ({ questionnaireId }) => {
      if (!checkLlmRateLimit(tokenId)) return rateLimitError();
      return ok(
        await suggestQuestionnaireAnswers(supplierId, tokenId, {
          questionnaireId,
        }),
      );
    },
  );

  server.registerTool(
    "submit_questionnaire_response",
    {
      description:
        "Submit answers for a questionnaire. This marks it completed and notifies the enterprise. Confirm all answers are reviewed before calling.",
      inputSchema: {
        questionnaireId: z.uuid().describe("Questionnaire ID"),
        answers: z
          .record(z.string(), z.unknown())
          .describe("Map of question ID → answer"),
      },
    },
    async (params) => ok(await submitQuestionnaireResponse(supplierId, params)),
  );

  // ── Compliance (no LLM, no rate limit) ───────────────────────────────────

  server.registerTool(
    "get_compliance_status",
    { description: "Get your overall CSRD and EU AI Act readiness status." },
    async () => ok(await getComplianceStatus(supplierId)),
  );

  server.registerTool(
    "get_deadline_calendar",
    { description: "List upcoming CSRD and EU AI Act compliance deadlines." },
    async () => ok(await getDeadlineCalendar(supplierId)),
  );

  // ── Guidance (both rate-limited) ──────────────────────────────────────────

  server.registerTool(
    "ask_compliance_question",
    {
      description:
        "Ask a free-form question about CSRD, EU AI Act, or carbon accounting, grounded in your actual compliance data.",
      inputSchema: {
        question: z.string().describe("Your compliance question"),
        context: z
          .enum(["csrd", "eu-ai-act", "carbon", "general"])
          .optional()
          .describe("Regulatory domain"),
      },
    },
    async (params) => {
      if (!checkLlmRateLimit(tokenId)) return rateLimitError();
      const result = await askComplianceQuestion(supplierId, tokenId, params);
      return { content: [{ type: "text" as const, text: result.answer }] };
    },
  );

  server.registerTool(
    "explain_questionnaire_field",
    {
      description:
        "Get an explanation of what a specific questionnaire field is asking for and how to answer it.",
      inputSchema: {
        questionnaireId: z.uuid().describe("Questionnaire ID"),
        questionId: z.string().describe("Question ID within the questionnaire"),
      },
    },
    async (params) => {
      if (!checkLlmRateLimit(tokenId)) return rateLimitError();
      return ok(await explainQuestionnaireField(supplierId, tokenId, params));
    },
  );
}

// ── Server entry point ────────────────────────────────────────────────────────

export function startMcpServer() {
  const isProd = Bun.env.NODE_ENV === "production";
  const port = Number(Bun.env.MCP_PORT ?? 15151);

  if (isProd) {
    try { unlinkSync("/run/paxis/mcp.sock"); } catch {}
  }

  const serveOptions = isProd
    ? { unix: "/run/paxis/mcp.sock" as const }
    : { port };

  Bun.serve({
    ...serveOptions,
    async fetch(req) {
      const authHeader = req.headers.get("Authorization") ?? "";
      const rawToken = authHeader.startsWith("Bearer ")
        ? authHeader.slice(7).trim()
        : null;

      if (!rawToken) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }

      const resolved = await resolveMcpToken(rawToken);
      if (!resolved) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }

      const server = new McpServer({
        name: "paxis-supplier",
        version: "1.0.0",
      });
      registerAllTools(server, resolved.supplierId, resolved.tokenId);

      const transport = new WebStandardStreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
      });
      await server.connect(transport);
      return transport.handleRequest(req);
    },
  });
}
