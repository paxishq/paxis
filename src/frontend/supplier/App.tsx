import { useEffect, useState } from "react";
import { AlertTriangle, Bot, CheckCircle2, ClipboardCheck, FileText, Leaf, LogOut, Plus, XCircle } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	Sheet,
	SheetContent,
	SheetFooter,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";

// ── Types ─────────────────────────────────────────────────────────────────────

type Supplier = { id: string; name: string; country: string };

type Question = {
	id: string;
	text: string;
	type: "text" | "number" | "boolean" | "select";
	required: boolean;
	options?: string[];
};

type Questionnaire = {
	id: string;
	title: string;
	status: "sent" | "in_progress" | "completed" | "overdue";
	dueAt: string | null;
	questions: Question[];
};

type QuestionnaireWithResponse = Questionnaire & {
	response: { answers: Record<string, unknown>; submittedAt: string | null } | null;
};

type CarbonEntry = {
	id: string;
	scope: "scope1" | "scope2";
	co2Tonnes: number;
	periodStart: string;
	periodEnd: string;
	sourceDescription: string | null;
};

type AiInventory = {
	id: string;
	toolName: string;
	riskTier: "unacceptable" | "high" | "limited" | "minimal";
	description: string | null;
	justification: string | null;
};

type SupplierPage = "questionnaires" | "carbon" | "ai-inventory" | "compliance";
type AuthState = "loading" | "authed" | "unauthed";

// ── Constants ─────────────────────────────────────────────────────────────────

const Q_STATUS: Record<string, { label: string; dot: string; chip: string }> = {
	sent:        { label: "Sent",        dot: "bg-blue-400",    chip: "bg-blue-950/50 text-blue-400 border-blue-900/50" },
	in_progress: { label: "In progress", dot: "bg-amber-400",   chip: "bg-amber-950/50 text-amber-400 border-amber-900/50" },
	completed:   { label: "Completed",   dot: "bg-emerald-400", chip: "bg-emerald-950/50 text-emerald-400 border-emerald-900/50" },
	overdue:     { label: "Overdue",     dot: "bg-red-400",     chip: "bg-red-950/50 text-red-400 border-red-900/50" },
};

const RISK: Record<string, { label: string; chip: string }> = {
	unacceptable: { label: "Unacceptable", chip: "bg-red-950/50 text-red-400 border-red-900/50" },
	high:         { label: "High",         chip: "bg-orange-950/50 text-orange-400 border-orange-900/50" },
	limited:      { label: "Limited",      chip: "bg-amber-950/50 text-amber-400 border-amber-900/50" },
	minimal:      { label: "Minimal",      chip: "bg-emerald-950/50 text-emerald-400 border-emerald-900/50" },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string | null) {
	if (!iso) return "—";
	return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

// ── Brand ─────────────────────────────────────────────────────────────────────

function PaxisLogo() {
	return (
		<div className="flex items-center gap-2.5 shrink-0">
			<svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
				<rect x="0"  y="0"  width="8" height="8" rx="1.5" fill="#10b981" />
				<rect x="10" y="0"  width="8" height="8" rx="1.5" fill="#10b981" opacity="0.2" />
				<rect x="0"  y="10" width="8" height="8" rx="1.5" fill="#10b981" opacity="0.2" />
				<rect x="10" y="10" width="8" height="8" rx="1.5" fill="#10b981" />
			</svg>
			<span className="text-[15px] font-semibold tracking-[-0.02em] text-white">Paxis</span>
		</div>
	);
}

// ── Chips ─────────────────────────────────────────────────────────────────────

function StatusChip({ status }: { status: string }) {
	const cfg = Q_STATUS[status] ?? { label: status, dot: "bg-zinc-500", chip: "bg-zinc-800/70 text-zinc-400 border-zinc-700/50" };
	return (
		<span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium border ${cfg.chip}`}>
			<span className={`size-1.5 rounded-full ${cfg.dot}`} />
			{cfg.label}
		</span>
	);
}

function RiskChip({ tier }: { tier: string }) {
	const cfg = RISK[tier] ?? { label: tier, chip: "bg-zinc-800/70 text-zinc-400 border-zinc-700/50" };
	return (
		<span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium border ${cfg.chip}`}>
			{cfg.label}
		</span>
	);
}

// ── Navigation button ─────────────────────────────────────────────────────────

function NavBtn({
	active,
	onClick,
	children,
	badge,
}: {
	active: boolean;
	onClick: () => void;
	children: React.ReactNode;
	badge?: number;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={`relative flex items-center gap-2 px-3.5 h-[52px] text-sm font-medium transition-colors ${
				active ? "text-white" : "text-zinc-500 hover:text-zinc-300"
			}`}
		>
			{children}
			{badge !== undefined && badge > 0 && (
				<span className="text-[10px] font-mono px-1.5 py-px rounded bg-emerald-950/60 text-emerald-500 border border-emerald-900/50">
					{badge}
				</span>
			)}
			{active && (
				<span className="absolute bottom-0 inset-x-0 h-[2px] bg-emerald-500 rounded-t" />
			)}
		</button>
	);
}

// ── Page header ───────────────────────────────────────────────────────────────

function PageHeader({
	title,
	description,
	action,
}: {
	title: string;
	description?: string;
	action?: React.ReactNode;
}) {
	return (
		<div className="flex items-start justify-between py-5 border-b border-white/[0.05] mb-6">
			<div>
				<h1 className="text-[15px] font-semibold text-white tracking-[-0.01em]">{title}</h1>
				{description && <p className="mt-0.5 text-xs text-zinc-600">{description}</p>}
			</div>
			{action}
		</div>
	);
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, unit }: { label: string; value: string | number; unit?: string }) {
	return (
		<div className="rounded-lg bg-white/[0.025] border border-white/[0.06] px-5 py-4">
			<p className="text-[10px] font-medium text-zinc-600 uppercase tracking-[0.1em] mb-3">{label}</p>
			<p className="font-mono text-[26px] font-medium text-white leading-none tabular-nums">
				{typeof value === "number" ? value.toLocaleString() : value}
				{unit && <span className="text-zinc-600 text-sm font-normal ml-1.5">{unit}</span>}
			</p>
		</div>
	);
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState({
	icon: Icon,
	title,
	description,
	action,
}: {
	icon: React.ComponentType<{ className?: string }>;
	title: string;
	description: string;
	action?: React.ReactNode;
}) {
	return (
		<div className="flex flex-col items-center justify-center py-24 text-center">
			<div className="mb-4 flex size-11 items-center justify-center rounded-xl border border-white/[0.06] bg-white/[0.02]">
				<Icon className="size-[18px] text-zinc-600" />
			</div>
			<p className="text-[13px] font-medium text-zinc-300 mb-1">{title}</p>
			<p className="text-[12px] text-zinc-600 max-w-[260px] leading-relaxed mb-5">{description}</p>
			{action}
		</div>
	);
}

// ── Login page ────────────────────────────────────────────────────────────────

function LoginPage() {
	const [loading, setLoading] = useState(false);

	async function signIn() {
		setLoading(true);
		await authClient.signIn.social({ provider: "google", callbackURL: "/supplier" });
	}

	return (
		<div className="min-h-screen bg-background flex flex-col items-center justify-center">
			<div className="h-[2px] bg-gradient-to-r from-emerald-600 via-emerald-500 to-emerald-600/0 fixed top-0 inset-x-0" />
			<div className="w-full max-w-[320px] space-y-8">
				<div className="flex flex-col items-center gap-3">
					<svg width="28" height="28" viewBox="0 0 18 18" fill="none" aria-hidden="true">
						<rect x="0"  y="0"  width="8" height="8" rx="1.5" fill="#10b981" />
						<rect x="10" y="0"  width="8" height="8" rx="1.5" fill="#10b981" opacity="0.2" />
						<rect x="0"  y="10" width="8" height="8" rx="1.5" fill="#10b981" opacity="0.2" />
						<rect x="10" y="10" width="8" height="8" rx="1.5" fill="#10b981" />
					</svg>
					<div className="text-center">
						<h1 className="text-[17px] font-semibold text-white tracking-[-0.02em]">Paxis Supplier</h1>
						<p className="text-[13px] text-zinc-600 mt-1">Free EU compliance tools for your business</p>
					</div>
				</div>
				<div className="rounded-lg border border-white/[0.07] bg-white/[0.025] p-5 space-y-3">
					<button
						type="button"
						onClick={signIn}
						disabled={loading}
						className="w-full flex items-center justify-center gap-2.5 h-9 rounded-md border border-white/[0.1] bg-white/[0.04] hover:bg-white/[0.07] text-[13px] font-medium text-zinc-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
					>
						<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
							<path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
							<path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
							<path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
							<path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
						</svg>
						{loading ? "Redirecting…" : "Continue with Google"}
					</button>
					<p className="text-[11px] text-zinc-700 text-center leading-relaxed">
						Your enterprise partner will have sent you an invitation link.
					</p>
				</div>
			</div>
		</div>
	);
}

// ── Respond Sheet ─────────────────────────────────────────────────────────────

function RespondSheet({
	questionnaireId,
	onDone,
}: {
	questionnaireId: string;
	onDone: () => void;
}) {
	const [open, setOpen] = useState(false);
	const [data, setData] = useState<QuestionnaireWithResponse | null>(null);
	const [answers, setAnswers] = useState<Record<string, string>>({});
	const [saving, setSaving] = useState(false);
	const [submitting, setSubmitting] = useState(false);

	useEffect(() => {
		if (!open) return;
		fetch(`/api/supplier/questionnaires/${questionnaireId}`)
			.then((r) => r.json())
			.then((d: QuestionnaireWithResponse) => {
				setData(d);
				if (d.response?.answers) {
					const existing: Record<string, string> = {};
					for (const [k, v] of Object.entries(d.response.answers)) {
						existing[k] = String(v);
					}
					setAnswers(existing);
				}
			});
	}, [open, questionnaireId]);

	async function save(submit: boolean) {
		submit ? setSubmitting(true) : setSaving(true);
		await fetch(`/api/supplier/questionnaires/${questionnaireId}/respond`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ answers, submit }),
		});
		submit ? setSubmitting(false) : setSaving(false);
		if (submit) {
			setOpen(false);
			onDone();
		}
	}

	const allAnswered =
		data?.questions.filter((q) => q.required).every((q) => answers[q.id]?.trim()) ?? false;

	return (
		<>
			<button
				type="button"
				onClick={() => setOpen(true)}
				className="inline-flex items-center gap-1.5 text-[12px] font-medium text-zinc-300 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.07] rounded px-2.5 py-1.5 transition-all"
			>
				Respond
			</button>
			<Sheet open={open} onOpenChange={setOpen}>
				<SheetContent className="w-full sm:max-w-lg overflow-y-auto flex flex-col gap-0 p-0">
					<SheetHeader className="px-6 py-5 border-b border-white/[0.06]">
						<SheetTitle className="text-[14px] font-semibold text-white">
							{data?.title ?? "Loading…"}
						</SheetTitle>
						{data?.dueAt && (
							<p className="text-[12px] text-zinc-600 mt-0.5">
								Due {formatDate(data.dueAt)}
							</p>
						)}
					</SheetHeader>

					<div className="flex-1 overflow-y-auto px-6 py-5">
						{data ? (
							<div className="space-y-5">
								{data.questions.map((q, i) => (
									<div key={q.id} className="space-y-2">
										<label className="block text-[12px] font-medium text-zinc-300">
											<span className="font-mono text-zinc-600 mr-1.5">{String(i + 1).padStart(2, "0")}</span>
											{q.text}
											{q.required && <span className="text-red-500 ml-1">*</span>}
										</label>
										{q.type === "number" ? (
											<Input
												type="number"
												value={answers[q.id] ?? ""}
												onChange={(e) =>
													setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))
												}
												placeholder="e.g. 1500"
												className="h-8 text-sm font-mono"
											/>
										) : q.type === "boolean" ? (
											<Select
												value={answers[q.id] ?? ""}
												onValueChange={(v) =>
													setAnswers((prev) => ({ ...prev, [q.id]: v }))
												}
											>
												<SelectTrigger className="h-8 text-sm">
													<SelectValue placeholder="Select…" />
												</SelectTrigger>
												<SelectContent>
													<SelectItem value="yes">Yes</SelectItem>
													<SelectItem value="no">No</SelectItem>
												</SelectContent>
											</Select>
										) : q.type === "select" && q.options ? (
											<Select
												value={answers[q.id] ?? ""}
												onValueChange={(v) =>
													setAnswers((prev) => ({ ...prev, [q.id]: v }))
												}
											>
												<SelectTrigger className="h-8 text-sm">
													<SelectValue placeholder="Select…" />
												</SelectTrigger>
												<SelectContent>
													{q.options.map((opt) => (
														<SelectItem key={opt} value={opt} className="text-sm">
															{opt}
														</SelectItem>
													))}
												</SelectContent>
											</Select>
										) : (
											<Textarea
												value={answers[q.id] ?? ""}
												onChange={(e) =>
													setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))
												}
												rows={3}
												className="text-sm resize-none"
											/>
										)}
									</div>
								))}
							</div>
						) : (
							<div className="flex items-center justify-center h-32">
								<p className="text-[13px] text-zinc-600">Loading questionnaire…</p>
							</div>
						)}
					</div>

					<SheetFooter className="px-6 py-4 border-t border-white/[0.06] flex gap-2">
						<Button
							variant="outline"
							size="sm"
							onClick={() => save(false)}
							disabled={saving || submitting}
							className="h-8 text-[13px]"
						>
							{saving ? "Saving…" : "Save draft"}
						</Button>
						<Button
							size="sm"
							onClick={() => save(true)}
							disabled={!allAnswered || saving || submitting}
							className="h-8 text-[13px]"
						>
							{submitting ? "Submitting…" : "Submit response"}
						</Button>
					</SheetFooter>
				</SheetContent>
			</Sheet>
		</>
	);
}

// ── Add Carbon Entry Dialog ───────────────────────────────────────────────────

function AddCarbonDialog({ onAdded }: { onAdded: (e: CarbonEntry) => void }) {
	const [open, setOpen] = useState(false);
	const [scope, setScope] = useState<"scope1" | "scope2">("scope1");
	const [co2Tonnes, setCo2Tonnes] = useState("");
	const [periodStart, setPeriodStart] = useState("");
	const [periodEnd, setPeriodEnd] = useState("");
	const [sourceDescription, setSourceDescription] = useState("");
	const [loading, setLoading] = useState(false);

	async function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
		e.preventDefault();
		setLoading(true);
		const res = await fetch("/api/supplier/carbon", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				scope,
				co2Tonnes: Number(co2Tonnes),
				periodStart,
				periodEnd,
				sourceDescription: sourceDescription || undefined,
			}),
		});
		const entry = await res.json();
		setLoading(false);
		if (res.ok) {
			onAdded(entry as CarbonEntry);
			setOpen(false);
			setCo2Tonnes("");
			setPeriodStart("");
			setPeriodEnd("");
			setSourceDescription("");
		}
	}

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button size="sm" className="h-8 gap-1.5 text-[13px]">
					<Plus className="size-3.5" />
					Add entry
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-sm">
				<DialogHeader>
					<DialogTitle className="text-[14px] font-semibold">Add carbon entry</DialogTitle>
				</DialogHeader>
				<form onSubmit={handleSubmit} className="space-y-3 pt-1">
					<div className="space-y-1.5">
						<Label className="text-[12px] text-zinc-400">Scope</Label>
						<Select value={scope} onValueChange={(v) => setScope(v as "scope1" | "scope2")}>
							<SelectTrigger className="h-8 text-sm">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="scope1" className="text-sm">Scope 1 — Direct emissions</SelectItem>
								<SelectItem value="scope2" className="text-sm">Scope 2 — Purchased energy</SelectItem>
							</SelectContent>
						</Select>
					</div>
					<div className="space-y-1.5">
						<Label className="text-[12px] text-zinc-400">CO₂ equivalent (tonnes)</Label>
						<Input
							type="number"
							min="0"
							step="0.01"
							value={co2Tonnes}
							onChange={(e) => setCo2Tonnes(e.target.value)}
							required
							placeholder="1500"
							className="h-8 text-sm font-mono"
						/>
					</div>
					<div className="grid grid-cols-2 gap-2">
						<div className="space-y-1.5">
							<Label className="text-[12px] text-zinc-400">Period start</Label>
							<Input
								type="date"
								value={periodStart}
								onChange={(e) => setPeriodStart(e.target.value)}
								required
								className="h-8 text-sm"
							/>
						</div>
						<div className="space-y-1.5">
							<Label className="text-[12px] text-zinc-400">Period end</Label>
							<Input
								type="date"
								value={periodEnd}
								onChange={(e) => setPeriodEnd(e.target.value)}
								required
								className="h-8 text-sm"
							/>
						</div>
					</div>
					<div className="space-y-1.5">
						<Label className="text-[12px] text-zinc-400">Source <span className="text-zinc-600">(optional)</span></Label>
						<Input
							value={sourceDescription}
							onChange={(e) => setSourceDescription(e.target.value)}
							placeholder="Natural gas — boiler"
							className="h-8 text-sm"
						/>
					</div>
					<DialogFooter className="pt-2">
						<Button type="submit" size="sm" disabled={loading} className="h-8 text-[13px]">
							{loading ? "Adding…" : "Add entry"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

// ── Register AI System Dialog ─────────────────────────────────────────────────

function RegisterAiDialog({ onAdded }: { onAdded: (item: AiInventory) => void }) {
	const [open, setOpen] = useState(false);
	const [toolName, setToolName] = useState("");
	const [description, setDescription] = useState("");
	const [riskTier, setRiskTier] = useState<AiInventory["riskTier"]>("minimal");
	const [justification, setJustification] = useState("");
	const [loading, setLoading] = useState(false);

	async function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
		e.preventDefault();
		setLoading(true);
		const res = await fetch("/api/supplier/ai-inventory", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				toolName,
				description: description || undefined,
				riskTier,
				justification: justification || undefined,
			}),
		});
		const item = await res.json();
		setLoading(false);
		if (res.ok) {
			onAdded(item as AiInventory);
			setOpen(false);
			setToolName("");
			setDescription("");
			setRiskTier("minimal");
			setJustification("");
		}
	}

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button size="sm" className="h-8 gap-1.5 text-[13px]">
					<Plus className="size-3.5" />
					Register system
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-sm">
				<DialogHeader>
					<DialogTitle className="text-[14px] font-semibold">Register AI system</DialogTitle>
				</DialogHeader>
				<form onSubmit={handleSubmit} className="space-y-3 pt-1">
					<div className="space-y-1.5">
						<Label className="text-[12px] text-zinc-400">System / tool name</Label>
						<Input
							value={toolName}
							onChange={(e) => setToolName(e.target.value)}
							required
							placeholder="ChatGPT, Copilot, custom model…"
							className="h-8 text-sm"
						/>
					</div>
					<div className="space-y-1.5">
						<Label className="text-[12px] text-zinc-400">Description <span className="text-zinc-600">(optional)</span></Label>
						<Textarea
							value={description}
							onChange={(e) => setDescription(e.target.value)}
							rows={2}
							placeholder="What does this system do?"
							className="text-sm resize-none"
						/>
					</div>
					<div className="space-y-1.5">
						<Label className="text-[12px] text-zinc-400">EU AI Act risk tier</Label>
						<Select value={riskTier} onValueChange={(v) => setRiskTier(v as AiInventory["riskTier"])}>
							<SelectTrigger className="h-8 text-sm">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="minimal"      className="text-sm">Minimal risk</SelectItem>
								<SelectItem value="limited"      className="text-sm">Limited risk</SelectItem>
								<SelectItem value="high"         className="text-sm">High risk</SelectItem>
								<SelectItem value="unacceptable" className="text-sm">Unacceptable risk</SelectItem>
							</SelectContent>
						</Select>
					</div>
					<div className="space-y-1.5">
						<Label className="text-[12px] text-zinc-400">Justification <span className="text-zinc-600">(optional)</span></Label>
						<Textarea
							value={justification}
							onChange={(e) => setJustification(e.target.value)}
							rows={2}
							placeholder="Why this tier?"
							className="text-sm resize-none"
						/>
					</div>
					<DialogFooter className="pt-2">
						<Button type="submit" size="sm" disabled={loading} className="h-8 text-[13px]">
							{loading ? "Registering…" : "Register system"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

// ── Compliance Report page ────────────────────────────────────────────────────

function ComplianceReportPage({
	questionnaires,
	carbonEntries,
	aiInventory,
}: {
	questionnaires: Questionnaire[];
	carbonEntries: CarbonEntry[];
	aiInventory: AiInventory[];
}) {
	const scope1Total = carbonEntries.filter((e) => e.scope === "scope1").reduce((s, e) => s + e.co2Tonnes, 0);
	const scope2Total = carbonEntries.filter((e) => e.scope === "scope2").reduce((s, e) => s + e.co2Tonnes, 0);
	const hasScope1 = carbonEntries.some((e) => e.scope === "scope1");
	const hasScope2 = carbonEntries.some((e) => e.scope === "scope2");

	const hasHighRisk = aiInventory.some((a) => a.riskTier === "unacceptable" || a.riskTier === "high");
	const aiByTier = {
		unacceptable: aiInventory.filter((a) => a.riskTier === "unacceptable").length,
		high:         aiInventory.filter((a) => a.riskTier === "high").length,
		limited:      aiInventory.filter((a) => a.riskTier === "limited").length,
		minimal:      aiInventory.filter((a) => a.riskTier === "minimal").length,
	};

	const totalQ = questionnaires.length;
	const completedQ = questionnaires.filter((q) => q.status === "completed").length;
	const pendingQ = questionnaires.filter((q) => q.status === "sent" || q.status === "in_progress").length;
	const overdueQ = questionnaires.filter((q) => q.status === "overdue").length;
	const allResponded = totalQ > 0 && pendingQ === 0 && overdueQ === 0;

	const checks = [
		{ label: "Scope 1 emissions logged",       done: hasScope1,                          detail: hasScope1 ? `${scope1Total.toLocaleString()} tCO₂e recorded` : "Add at least one Scope 1 entry" },
		{ label: "Scope 2 emissions logged",        done: hasScope2,                          detail: hasScope2 ? `${scope2Total.toLocaleString()} tCO₂e recorded` : "Add at least one Scope 2 entry" },
		{ label: "AI inventory registered",         done: aiInventory.length > 0,             detail: aiInventory.length > 0 ? `${aiInventory.length} system${aiInventory.length !== 1 ? "s" : ""} registered` : "Register any AI tools your org uses" },
		{ label: "No unacceptable or high-risk AI", done: !hasHighRisk,                       detail: !hasHighRisk ? "All systems within acceptable tiers" : `${aiByTier.unacceptable + aiByTier.high} system(s) need review` },
		{ label: "All questionnaires responded",    done: totalQ > 0 && allResponded,         detail: totalQ === 0 ? "No questionnaires received yet" : allResponded ? `${completedQ} of ${totalQ} completed` : `${pendingQ} pending, ${overdueQ} overdue` },
	];

	const passCount = checks.filter((c) => c.done).length;
	const readiness: "ready" | "partial" | "not_ready" =
		passCount === checks.length ? "ready" : passCount >= 3 ? "partial" : "not_ready";

	const readinessCfg = {
		ready:     { label: "Reporting ready",   color: "text-emerald-400", bar: "bg-emerald-500", bg: "bg-emerald-950/50 border-emerald-900/50" },
		partial:   { label: "Partially ready",   color: "text-amber-400",  bar: "bg-amber-500",   bg: "bg-amber-950/50 border-amber-900/50" },
		not_ready: { label: "Action required",   color: "text-red-400",    bar: "bg-red-500",     bg: "bg-red-950/50 border-red-900/50" },
	}[readiness];

	const AI_TIER_CFG: Record<"unacceptable" | "high" | "limited" | "minimal", { label: string; color: string }> = {
		unacceptable: { label: "Unacceptable", color: "text-red-400" },
		high:         { label: "High",         color: "text-orange-400" },
		limited:      { label: "Limited",      color: "text-amber-400" },
		minimal:      { label: "Minimal",      color: "text-emerald-400" },
	};

	return (
		<div>
			<PageHeader
				title="Compliance overview"
				description="Your CSRD & EU AI Act readiness snapshot"
			/>

			{/* Readiness header */}
			<div className="mb-5 rounded-lg border border-white/[0.06] bg-white/[0.02] px-5 py-4 flex items-center justify-between gap-4">
				<div className="flex-1 min-w-0">
					<div className="flex items-center gap-2 mb-2">
						<span className={`text-[11px] font-medium px-2 py-0.5 rounded border ${readinessCfg.bg} ${readinessCfg.color}`}>
							{readinessCfg.label}
						</span>
						<span className="text-[12px] text-zinc-500">{passCount} of {checks.length} checks passing</span>
					</div>
					<div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
						<div
							className={`h-full rounded-full transition-all ${readinessCfg.bar}`}
							style={{ width: `${(passCount / checks.length) * 100}%` }}
						/>
					</div>
				</div>
			</div>

			{/* Checklist */}
			<div className="mb-5">
				<p className="text-[10px] font-medium text-zinc-600 uppercase tracking-[0.1em] mb-3">Readiness checklist</p>
				<div className="rounded-lg border border-white/[0.06] bg-white/[0.015] divide-y divide-white/[0.04]">
					{checks.map((check) => (
						<div key={check.label} className="flex items-center gap-3 px-4 py-3">
							{check.done
								? <CheckCircle2 className="size-4 text-emerald-500 shrink-0" />
								: <XCircle className="size-4 text-zinc-700 shrink-0" />
							}
							<div className="flex-1 min-w-0">
								<span className={`text-[13px] font-medium ${check.done ? "text-zinc-300" : "text-zinc-500"}`}>
									{check.label}
								</span>
							</div>
							<span className={`text-[11px] shrink-0 ${check.done ? "text-zinc-600" : "text-amber-500/80"}`}>
								{check.detail}
							</span>
						</div>
					))}
				</div>
			</div>

			<div className="grid grid-cols-2 gap-4">
				{/* Carbon summary */}
				<div>
					<p className="text-[10px] font-medium text-zinc-600 uppercase tracking-[0.1em] mb-3">Carbon emissions (tCO₂e)</p>
					<div className="rounded-lg border border-white/[0.06] bg-white/[0.015] divide-y divide-white/[0.04]">
						{(["scope1", "scope2"] as const).map((scope) => {
							const total = scope === "scope1" ? scope1Total : scope2Total;
							const has   = scope === "scope1" ? hasScope1 : hasScope2;
							const label = scope === "scope1" ? "Scope 1 — Direct" : "Scope 2 — Purchased energy";
							const color = scope === "scope1" ? "text-blue-400" : "text-purple-400";
							return (
								<div key={scope} className="flex items-center justify-between px-4 py-3">
									<span className={`text-[11px] font-medium ${color}`}>{label}</span>
									{has
										? <span className="font-mono text-[13px] text-white tabular-nums">{total.toLocaleString()} <span className="text-zinc-600 text-[11px]">tCO₂e</span></span>
										: <span className="text-[11px] text-zinc-600">Not recorded</span>
									}
								</div>
							);
						})}
						<div className="flex items-center justify-between px-4 py-3 bg-white/[0.015]">
							<span className="text-[11px] font-semibold text-zinc-300">Total</span>
							<span className="font-mono text-[13px] font-medium text-white tabular-nums">
								{(scope1Total + scope2Total).toLocaleString()} <span className="text-zinc-600 text-[11px]">tCO₂e</span>
							</span>
						</div>
					</div>
				</div>

				{/* AI Act summary */}
				<div>
					<p className="text-[10px] font-medium text-zinc-600 uppercase tracking-[0.1em] mb-3">EU AI Act inventory</p>
					<div className="rounded-lg border border-white/[0.06] bg-white/[0.015] divide-y divide-white/[0.04]">
						{(["unacceptable", "high", "limited", "minimal"] as const).map((tier) => {
							const count = aiByTier[tier];
							const cfg = AI_TIER_CFG[tier];
							return (
								<div key={tier} className="flex items-center justify-between px-4 py-3">
									<div className="flex items-center gap-2">
										{(tier === "unacceptable" || tier === "high") && count > 0 && (
											<AlertTriangle className="size-3 text-amber-500 shrink-0" />
										)}
										<span className={`text-[11px] font-medium ${cfg.color}`}>{cfg.label} risk</span>
									</div>
									<span className={`font-mono text-[13px] ${count > 0 ? "text-white" : "text-zinc-700"}`}>
										{count}
									</span>
								</div>
							);
						})}
						<div className="flex items-center justify-between px-4 py-3 bg-white/[0.015]">
							<span className="text-[11px] font-semibold text-zinc-300">Total systems</span>
							<span className="font-mono text-[13px] font-medium text-white">{aiInventory.length}</span>
						</div>
					</div>
				</div>
			</div>

			{/* Questionnaire summary */}
			{totalQ > 0 && (
				<div className="mt-4">
					<p className="text-[10px] font-medium text-zinc-600 uppercase tracking-[0.1em] mb-3">Questionnaire status</p>
					<div className="rounded-lg border border-white/[0.06] bg-white/[0.015] overflow-hidden">
						<div className="flex">
							{[
								{ label: "Completed", value: completedQ,                    color: "bg-emerald-950/60 text-emerald-400 border-r border-white/[0.04]" },
								{ label: "Pending",   value: pendingQ,                      color: "bg-amber-950/40 text-amber-400 border-r border-white/[0.04]" },
								{ label: "Overdue",   value: overdueQ,                      color: "bg-red-950/40 text-red-400 border-r border-white/[0.04]" },
								{ label: "Total",     value: totalQ,                        color: "text-zinc-300" },
							].map((stat) => (
								<div key={stat.label} className={`flex-1 px-4 py-3 ${stat.color}`}>
									<p className="text-[10px] font-medium opacity-70 uppercase tracking-wide mb-1">{stat.label}</p>
									<p className="font-mono text-[20px] font-medium leading-none">{stat.value}</p>
								</div>
							))}
						</div>
					</div>
				</div>
			)}
		</div>
	);
}

// ── App ───────────────────────────────────────────────────────────────────────

export default function SupplierApp() {
	const [authState, setAuthState] = useState<AuthState>("loading");
	const [supplier, setSupplier] = useState<Supplier | null>(null);
	const [questionnaires, setQuestionnaires] = useState<Questionnaire[]>([]);
	const [carbonEntries, setCarbonEntries] = useState<CarbonEntry[]>([]);
	const [aiInventory, setAiInventory] = useState<AiInventory[]>([]);
	const [page, setPage] = useState<SupplierPage>("questionnaires");

	function loadQuestionnaires() {
		fetch("/api/supplier/questionnaires")
			.then((r) => r.ok ? r.json() : [])
			.then(setQuestionnaires);
	}

	useEffect(() => {
		fetch("/api/supplier/me").then((r) => {
			if (r.status === 401 || r.status === 403) { setAuthState("unauthed"); return null; }
			return r.json();
		}).then((data) => {
			if (data) { setSupplier(data as Supplier); setAuthState("authed"); }
		});
		loadQuestionnaires();
		fetch("/api/supplier/carbon").then((r) => r.ok ? r.json() : []).then(setCarbonEntries);
		fetch("/api/supplier/ai-inventory").then((r) => r.ok ? r.json() : []).then(setAiInventory);
	}, []);

	async function signOut() {
		await authClient.signOut();
		setAuthState("unauthed");
		setSupplier(null);
	}

	if (authState === "loading") {
		return (
			<div className="min-h-screen bg-background flex items-center justify-center">
				<div className="h-[2px] bg-gradient-to-r from-emerald-600 via-emerald-500 to-emerald-600/0 fixed top-0 inset-x-0" />
				<span className="text-[13px] text-zinc-600">Loading…</span>
			</div>
		);
	}

	if (authState === "unauthed") return <LoginPage />;

	const pending = questionnaires.filter(
		(q) => q.status === "sent" || q.status === "in_progress",
	).length;

	const scope1Total = carbonEntries.filter((e) => e.scope === "scope1").reduce((s, e) => s + e.co2Tonnes, 0);
	const scope2Total = carbonEntries.filter((e) => e.scope === "scope2").reduce((s, e) => s + e.co2Tonnes, 0);

	return (
		<div className="min-h-screen bg-background text-foreground">
			{/* Supplier accent bar */}
			<div className="h-[2px] bg-gradient-to-r from-emerald-600 via-emerald-500 to-emerald-600/0" />

			{/* Header */}
			<header className="flex items-center border-b border-white/[0.06] px-6 h-[52px]">
				<PaxisLogo />
				<div className="w-px h-4 bg-white/[0.08] mx-5" />
				<nav className="flex items-center -mb-px">
					<NavBtn
						active={page === "questionnaires"}
						onClick={() => setPage("questionnaires")}
						badge={pending}
					>
						<FileText className="size-3.5" />
						Questionnaires
					</NavBtn>
					<NavBtn
						active={page === "carbon"}
						onClick={() => setPage("carbon")}
					>
						<Leaf className="size-3.5" />
						Carbon
					</NavBtn>
					<NavBtn
						active={page === "ai-inventory"}
						onClick={() => setPage("ai-inventory")}
					>
						<Bot className="size-3.5" />
						AI Inventory
					</NavBtn>
					<NavBtn
						active={page === "compliance"}
						onClick={() => setPage("compliance")}
					>
						<ClipboardCheck className="size-3.5" />
						Compliance
					</NavBtn>
				</nav>
				<div className="ml-auto flex items-center gap-3">
					<span className="text-[12px] text-zinc-600 truncate max-w-[160px]">
						{supplier?.name ?? "…"}
					</span>
					<span className="text-[10px] px-2 py-0.5 rounded border border-emerald-900/60 text-emerald-600 font-medium tracking-wide">
						SUPPLIER
					</span>
					<button
						type="button"
						onClick={signOut}
						className="flex items-center gap-1.5 text-[12px] text-zinc-600 hover:text-zinc-400 transition-colors"
						title="Sign out"
					>
						<LogOut className="size-3.5" />
					</button>
				</div>
			</header>

			{/* Main */}
			<main className="max-w-5xl mx-auto px-6">

				{/* ── Questionnaires ── */}
				{page === "questionnaires" && (
					<div>
						<PageHeader
							title="Questionnaires"
							description="Data requests from your enterprise partners"
						/>
						{questionnaires.length === 0 ? (
							<EmptyState
								icon={FileText}
								title="No questionnaires yet"
								description="Your enterprise partners will send CSRD data requests here once you're onboarded."
							/>
						) : (
							<table className="w-full">
								<thead>
									<tr className="border-b border-white/[0.06]">
										{["Title", "Status", "Due", ""].map((h, i) => (
											<th
												key={i}
												className={`pb-2.5 text-[10px] font-medium text-zinc-600 uppercase tracking-[0.08em] ${
													i === 3 ? "text-right" : "text-left"
												}`}
											>
												{h}
											</th>
										))}
									</tr>
								</thead>
								<tbody>
									{questionnaires.map((q) => (
										<tr key={q.id} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
											<td className="py-3 text-[13px] font-medium text-zinc-200">{q.title}</td>
											<td className="py-3"><StatusChip status={q.status} /></td>
											<td className="py-3 font-mono text-[12px] text-zinc-600">{formatDate(q.dueAt)}</td>
											<td className="py-3 text-right">
												{(q.status === "sent" || q.status === "in_progress") && (
													<RespondSheet questionnaireId={q.id} onDone={loadQuestionnaires} />
												)}
												{q.status === "completed" && (
													<span className="text-[11px] text-zinc-600 font-medium">Submitted</span>
												)}
											</td>
										</tr>
									))}
								</tbody>
							</table>
						)}
					</div>
				)}

				{/* ── Carbon ── */}
				{page === "carbon" && (
					<div>
						<PageHeader
							title="Carbon ledger"
							description="Scope 1 and 2 emissions for CSRD reporting"
							action={<AddCarbonDialog onAdded={(e) => setCarbonEntries((prev) => [...prev, e])} />}
						/>
						<div className="grid grid-cols-2 gap-3 mb-6">
							<StatCard label="Total scope 1" value={scope1Total} unit="tCO₂e" />
							<StatCard label="Total scope 2" value={scope2Total} unit="tCO₂e" />
						</div>
						{carbonEntries.length === 0 ? (
							<EmptyState
								icon={Leaf}
								title="No carbon entries yet"
								description="Log your Scope 1 and Scope 2 emissions to build your carbon ledger for CSRD reporting."
								action={<AddCarbonDialog onAdded={(e) => setCarbonEntries((prev) => [...prev, e])} />}
							/>
						) : (
							<table className="w-full">
								<thead>
									<tr className="border-b border-white/[0.06]">
										{["Scope", "CO₂e (tonnes)", "Period", "Source"].map((h) => (
											<th key={h} className="pb-2.5 text-left text-[10px] font-medium text-zinc-600 uppercase tracking-[0.08em]">
												{h}
											</th>
										))}
									</tr>
								</thead>
								<tbody>
									{carbonEntries.map((e) => (
										<tr key={e.id} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
											<td className="py-3">
												<span className={`text-[11px] font-medium px-2 py-0.5 rounded border ${
													e.scope === "scope1"
														? "bg-blue-950/50 text-blue-400 border-blue-900/50"
														: "bg-purple-950/50 text-purple-400 border-purple-900/50"
												}`}>
													{e.scope === "scope1" ? "Scope 1" : "Scope 2"}
												</span>
											</td>
											<td className="py-3 font-mono text-[13px] font-medium text-white">
												{e.co2Tonnes.toLocaleString()}
											</td>
											<td className="py-3 font-mono text-[12px] text-zinc-600">
												{formatDate(e.periodStart)} – {formatDate(e.periodEnd)}
											</td>
											<td className="py-3 text-[13px] text-zinc-500">
												{e.sourceDescription ?? "—"}
											</td>
										</tr>
									))}
								</tbody>
							</table>
						)}
					</div>
				)}

				{/* ── Compliance ── */}
				{page === "compliance" && (
					<ComplianceReportPage
						questionnaires={questionnaires}
						carbonEntries={carbonEntries}
						aiInventory={aiInventory}
					/>
				)}

				{/* ── AI Inventory ── */}
				{page === "ai-inventory" && (
					<div>
						<PageHeader
							title="AI inventory"
							description="EU AI Act compliance registry for AI systems in use"
							action={<RegisterAiDialog onAdded={(item) => setAiInventory((prev) => [...prev, item])} />}
						/>
						{aiInventory.length === 0 ? (
							<EmptyState
								icon={Bot}
								title="No AI systems registered"
								description="Register all AI systems your organisation uses to maintain your EU AI Act compliance inventory."
								action={<RegisterAiDialog onAdded={(item) => setAiInventory((prev) => [...prev, item])} />}
							/>
						) : (
							<table className="w-full">
								<thead>
									<tr className="border-b border-white/[0.06]">
										{["System", "Risk tier", "Description", "Justification"].map((h) => (
											<th key={h} className="pb-2.5 text-left text-[10px] font-medium text-zinc-600 uppercase tracking-[0.08em]">
												{h}
											</th>
										))}
									</tr>
								</thead>
								<tbody>
									{aiInventory.map((item) => (
										<tr key={item.id} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
											<td className="py-3 text-[13px] font-medium text-zinc-200">{item.toolName}</td>
											<td className="py-3"><RiskChip tier={item.riskTier} /></td>
											<td className="py-3 text-[13px] text-zinc-500 max-w-[200px] truncate">
												{item.description ?? "—"}
											</td>
											<td className="py-3 text-[13px] text-zinc-600 max-w-[200px] truncate">
												{item.justification ?? "—"}
											</td>
										</tr>
									))}
								</tbody>
							</table>
						)}
					</div>
				)}
			</main>
		</div>
	);
}
