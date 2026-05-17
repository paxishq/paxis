import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ModelTier = "pro" | "flash";

export interface LLMMessage {
	role: "user" | "assistant";
	content: string;
}

export interface GenerateOptions {
	model?: ModelTier;
	system?: string;
	temperature?: number;
}

// ── Model IDs — override via env to match what's live in your GCP project ─────

const GEMINI_MODELS: Record<ModelTier, string> = {
	pro:   Bun.env.GEMINI_PRO_MODEL   ?? "gemini-3.1-pro-preview",
	flash: Bun.env.GEMINI_FLASH_MODEL ?? "gemini-3.1-flash-lite",
};

// ── Provider clients (lazy) ───────────────────────────────────────────────────

function gemini() {
	// Dev: GEMINI_API_KEY set → AI Studio (API key, no GCP project needed)
	if (Bun.env.GEMINI_API_KEY) {
		return new GoogleGenAI({ apiKey: Bun.env.GEMINI_API_KEY });
	}
	// Prod: no API key → Vertex AI with Application Default Credentials
	return new GoogleGenAI({
		vertexai: true,
		project:  Bun.env.GOOGLE_CLOUD_PROJECT,
		location: Bun.env.GOOGLE_CLOUD_LOCATION ?? "us-central1",
	});
}

function featherless() {
	return new OpenAI({
		apiKey: Bun.env.FEATHERLESS_API_KEY!,
		baseURL: "https://api.featherless.ai/v1",
	});
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Generate a text response from the active LLM provider.
 * Use model: "pro" for the Planner Agent; "flash" (default) for all others.
 * All agent files must call this — never import provider SDKs directly.
 */
export async function generate(
	messages: LLMMessage[],
	options: GenerateOptions = {},
): Promise<string> {
	const { model = "flash", system, temperature = 0.7 } = options;
	const provider = Bun.env.LLM_PROVIDER ?? "gemini";

	if (provider === "featherless") {
		const sysMessages: OpenAI.Chat.ChatCompletionMessageParam[] = system
			? [{ role: "system", content: system }]
			: [];

		const res = await featherless().chat.completions.create({
			model:
				Bun.env.FEATHERLESS_MODEL ??
				"mistralai/Mistral-Small-3.2-24B-Instruct-2506",
			messages: [
				...sysMessages,
				...messages.map((m) => ({
					role: m.role as "user" | "assistant",
					content: m.content,
				})),
			],
			temperature,
		});

		return res.choices[0]?.message.content ?? "";
	}

	const res = await gemini().models.generateContent({
		model: GEMINI_MODELS[model],
		contents: messages.map((m) => ({
			role: m.role === "assistant" ? "model" : "user",
			parts: [{ text: m.content }],
		})),
		config: {
			systemInstruction: system,
			temperature,
		},
	});

	return res.text ?? "";
}

/**
 * Parse a document using Gemini Flash multimodal.
 * Always uses Flash regardless of model tier — Flash handles multimodal.
 * Only available when LLM_PROVIDER=gemini; throws for Featherless.
 */
export async function parseDocument(
	document: { data: string; mimeType: string },
	prompt: string,
): Promise<string> {
	if ((Bun.env.LLM_PROVIDER ?? "gemini") === "featherless") {
		throw new Error(
			"Document parsing requires Gemini — set LLM_PROVIDER=gemini",
		);
	}

	const res = await gemini().models.generateContent({
		model: GEMINI_MODELS.flash,
		contents: [
			{
				role: "user",
				parts: [
					{ inlineData: { data: document.data, mimeType: document.mimeType } },
					{ text: prompt },
				],
			},
		],
	});

	return res.text ?? "";
}
