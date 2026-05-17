import { z } from "zod";
import { writeAudit } from "../lib/audit";
import { generate } from "../lib/llm";

// ── Task types ────────────────────────────────────────────────────────────────

export type PlannerTask =
	| {
			type: "questionnaire_dispatched";
			questionnaireId: string;
			enterpriseId: string;
			supplierId: string;
	  }
	| {
			type: "questionnaire_responded";
			questionnaireId: string;
			responseId: string;
			enterpriseId: string;
			supplierId: string;
	  }
	| { type: "ai_inventory_updated"; inventoryId: string; supplierId: string }
	| { type: "carbon_entry_added"; entryId: string; supplierId: string }
	| {
			type: "esrs_report_requested";
			enterpriseId: string;
			reportingYear: number;
	  }
	| { type: "scope3_recalculate"; enterpriseId: string };

export interface StepResult {
	agent: string;
	action: string;
	success: boolean;
	output: unknown;
}

export interface PlannerResult {
	success: boolean;
	taskType: string;
	steps: StepResult[];
}

// ── LLM plan schema ───────────────────────────────────────────────────────────

const PlanSchema = z.object({
	reasoning: z.string(),
	steps: z.array(
		z.object({
			agent: z.enum([
				"intake",
				"ai-act",
				"carbon",
				"supply-chain",
				"risk-deadline",
				"esrs-report",
			]),
			action: z.string(),
			params: z.record(z.string(), z.unknown()).default({}),
		}),
	),
});

type Plan = z.infer<typeof PlanSchema>;
type PlanStep = Plan["steps"][number];

// ── System prompt ─────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are the Paxis Planner — an orchestration agent for an EU compliance OS.
You coordinate six specialist agents to fulfil compliance tasks. Given a task, produce a JSON plan.

Available agents:
- intake: Parses incoming CSRD questionnaires, maps questions to existing supplier data, identifies gaps.
- ai-act: Discovers and inventories supplier AI tools, classifies by EU AI Act risk tier (unacceptable/high/limited/minimal), generates documentation.
- carbon: Ingests energy bills and manual entries, calculates Scope 1 & 2 CO₂ figures per supplier.
- supply-chain: Aggregates Scope 3 data from supplier responses, calculates enterprise-level totals, updates scope3_aggregates.
- risk-deadline: Monitors CSRD/EU AI Act filing deadlines, flags threshold breaches, surfaces regulatory changes.
- esrs-report: Assembles CSRD-standard ESRS output from all aggregated data, generates audit-ready report.

Respond with ONLY valid JSON matching this schema:
{
  "reasoning": "<one sentence explaining your plan>",
  "steps": [
    { "agent": "<agent-name>", "action": "<verb_noun>", "params": { "<key>": "<value>" } }
  ]
}

Keep steps minimal — only what is necessary for the task. Order matters: steps execute sequentially.`;

// ── LLM planning ──────────────────────────────────────────────────────────────

function taskPrompt(task: PlannerTask): string {
	return `Task: ${task.type}\nContext: ${JSON.stringify(task, null, 2)}`;
}

function extractJson(text: string): string {
	const match = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
	return match?.[1]?.trim() ?? text.trim();
}

async function planWithLLM(task: PlannerTask): Promise<Plan> {
	const raw = await generate([{ role: "user", content: taskPrompt(task) }], {
		model: "pro",
		system: SYSTEM_PROMPT,
		temperature: 0.2,
	});

	const parsed = PlanSchema.safeParse(JSON.parse(extractJson(raw)));

	if (!parsed.success) {
		throw new Error(`Planner LLM returned invalid plan: ${parsed.error.message}`);
	}

	return parsed.data;
}

// ── Agent dispatch ────────────────────────────────────────────────────────────

async function executeStep(
	step: PlanStep,
	task: PlannerTask,
): Promise<StepResult> {
	const context = {
		enterpriseId: "enterpriseId" in task ? task.enterpriseId : undefined,
		supplierId: "supplierId" in task ? task.supplierId : undefined,
		questionnaireId: "questionnaireId" in task ? task.questionnaireId : undefined,
		responseId: "responseId" in task ? task.responseId : undefined,
	};

	try {
		let output: unknown;

		switch (step.agent) {
			case "intake": {
				const { runIntake } = await import("./intake");
				output = await runIntake(step.params, context);
				break;
			}
			case "ai-act": {
				const { runAiAct } = await import("./ai-act");
				output = await runAiAct(step.params, context);
				break;
			}
			case "carbon": {
				const { runCarbon } = await import("./carbon");
				output = await runCarbon(step.params, context);
				break;
			}
			case "supply-chain": {
				const { runSupplyChain } = await import("./supply-chain");
				output = await runSupplyChain(step.params, context);
				break;
			}
			case "risk-deadline": {
				const { runRiskDeadline } = await import("./risk-deadline");
				output = await runRiskDeadline(step.params, context);
				break;
			}
			case "esrs-report": {
				const { runEsrsReport } = await import("./esrs-report");
				output = await runEsrsReport(step.params, context);
				break;
			}
			default:
				output = { skipped: true };
		}

		return { agent: step.agent, action: step.action, success: true, output };
	} catch (err) {
		return {
			agent: step.agent,
			action: step.action,
			success: false,
			output: { error: err instanceof Error ? err.message : String(err) },
		};
	}
}

// ── Public entry point ────────────────────────────────────────────────────────

export async function runPlan(task: PlannerTask): Promise<PlannerResult> {
	const enterpriseId =
		"enterpriseId" in task ? task.enterpriseId : undefined;
	const supplierId = "supplierId" in task ? task.supplierId : undefined;

	let plan: Plan;

	try {
		plan = await planWithLLM(task);
	} catch (err) {
		await writeAudit({
			agentName: "planner",
			action: "plan_failed",
			enterpriseId,
			supplierId,
			payload: {
				taskType: task.type,
				error: err instanceof Error ? err.message : String(err),
			},
		});
		throw err;
	}

	await writeAudit({
		agentName: "planner",
		action: "plan_created",
		enterpriseId,
		supplierId,
		payload: { taskType: task.type, reasoning: plan.reasoning, stepCount: plan.steps.length },
	});

	const results: StepResult[] = [];

	for (const step of plan.steps) {
		const result = await executeStep(step, task);
		results.push(result);

		await writeAudit({
			agentName: "planner",
			action: `step_${result.success ? "succeeded" : "failed"}`,
			enterpriseId,
			supplierId,
			payload: { agent: step.agent, action: step.action, output: result.output },
		});
	}

	const success = results.every((r) => r.success);

	await writeAudit({
		agentName: "planner",
		action: "plan_completed",
		enterpriseId,
		supplierId,
		payload: { taskType: task.type, success, stepCount: results.length },
	});

	return { success, taskType: task.type, steps: results };
}
