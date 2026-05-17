import { useEffect, useState } from "react";
import { Building2, FileText, LayoutGrid, LogOut, Plus, Send } from "lucide-react";
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

// ── Types ─────────────────────────────────────────────────────────────────────

type Enterprise = {
	id: string;
	name: string;
	country: string;
	reportingYear: number;
	vatNumber: string | null;
};

type Supplier = {
	id: string;
	name: string;
	country: string;
	vatNumber: string | null;
};

type Question = {
	id: string;
	text: string;
	type: "text" | "number" | "boolean" | "select";
	required: boolean;
};

type Questionnaire = {
	id: string;
	title: string;
	status: "draft" | "sent" | "in_progress" | "completed" | "overdue";
	supplierId: string;
	dueAt: string | null;
	sentAt: string | null;
	createdAt: string;
	questions: Question[];
};

type EnterprisePage = "overview" | "suppliers" | "questionnaires";
type AuthState = "loading" | "authed" | "unauthed";

// ── Constants ─────────────────────────────────────────────────────────────────

const DEFAULT_QUESTIONS: Question[] = [
	{
		id: "q1",
		text: "What are your total Scope 1 direct emissions (tCO₂e) for the reporting year?",
		type: "number",
		required: true,
	},
	{
		id: "q2",
		text: "What are your total Scope 2 energy-related emissions (tCO₂e) for the reporting year?",
		type: "number",
		required: true,
	},
	{
		id: "q3",
		text: "Do you have a certified energy management system (e.g. ISO 50001)?",
		type: "text",
		required: true,
	},
	{
		id: "q4",
		text: "Describe the primary measures taken to reduce your carbon footprint.",
		type: "text",
		required: false,
	},
];

const STATUS_CONFIG: Record<string, { label: string; dot: string; chip: string }> = {
	draft:       { label: "Draft",       dot: "bg-zinc-500",    chip: "bg-zinc-800/70 text-zinc-400 border-zinc-700/50" },
	sent:        { label: "Sent",        dot: "bg-blue-400",    chip: "bg-blue-950/50 text-blue-400 border-blue-900/50" },
	in_progress: { label: "In progress", dot: "bg-amber-400",   chip: "bg-amber-950/50 text-amber-400 border-amber-900/50" },
	completed:   { label: "Completed",   dot: "bg-emerald-400", chip: "bg-emerald-950/50 text-emerald-400 border-emerald-900/50" },
	overdue:     { label: "Overdue",     dot: "bg-red-400",     chip: "bg-red-950/50 text-red-400 border-red-900/50" },
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
				<rect x="0"  y="0"  width="8" height="8" rx="1.5" fill="#4d7ef7" />
				<rect x="10" y="0"  width="8" height="8" rx="1.5" fill="#4d7ef7" opacity="0.2" />
				<rect x="0"  y="10" width="8" height="8" rx="1.5" fill="#4d7ef7" opacity="0.2" />
				<rect x="10" y="10" width="8" height="8" rx="1.5" fill="#4d7ef7" />
			</svg>
			<span className="text-[15px] font-semibold tracking-[-0.02em] text-white">Paxis</span>
		</div>
	);
}

// ── Status chip ───────────────────────────────────────────────────────────────

function StatusChip({ status }: { status: string }) {
	const cfg = STATUS_CONFIG[status] ?? { label: status, dot: "bg-zinc-500", chip: "bg-zinc-800/70 text-zinc-400 border-zinc-700/50" };
	return (
		<span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium border ${cfg.chip}`}>
			<span className={`size-1.5 rounded-full ${cfg.dot}`} />
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
			{badge !== undefined && (
				<span className={`text-[10px] font-mono px-1.5 py-px rounded ${
					active ? "bg-white/10 text-zinc-300" : "bg-white/5 text-zinc-600"
				}`}>
					{badge}
				</span>
			)}
			{active && (
				<span className="absolute bottom-0 inset-x-0 h-[2px] bg-blue-500 rounded-t" />
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

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
	return (
		<div className="rounded-lg bg-white/[0.025] border border-white/[0.06] px-5 py-4">
			<p className="text-[10px] font-medium text-zinc-600 uppercase tracking-[0.1em] mb-3">{label}</p>
			<p className="font-mono text-[30px] font-medium text-white leading-none tabular-nums">
				{value}
				{sub && <span className="text-zinc-600 text-base font-normal ml-1.5">{sub}</span>}
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
		await authClient.signIn.social({ provider: "google", callbackURL: "/" });
	}

	return (
		<div className="min-h-screen bg-background flex flex-col items-center justify-center">
			<div className="h-[2px] bg-gradient-to-r from-blue-600 via-blue-500 to-blue-600/0 fixed top-0 inset-x-0" />
			<div className="w-full max-w-[320px] space-y-8">
				<div className="flex flex-col items-center gap-3">
					<svg width="28" height="28" viewBox="0 0 18 18" fill="none" aria-hidden="true">
						<rect x="0"  y="0"  width="8" height="8" rx="1.5" fill="#4d7ef7" />
						<rect x="10" y="0"  width="8" height="8" rx="1.5" fill="#4d7ef7" opacity="0.2" />
						<rect x="0"  y="10" width="8" height="8" rx="1.5" fill="#4d7ef7" opacity="0.2" />
						<rect x="10" y="10" width="8" height="8" rx="1.5" fill="#4d7ef7" />
					</svg>
					<div className="text-center">
						<h1 className="text-[17px] font-semibold text-white tracking-[-0.02em]">Paxis Enterprise</h1>
						<p className="text-[13px] text-zinc-600 mt-1">EU compliance OS for your supply chain</p>
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
						Enterprise access only. Contact your administrator if you need access.
					</p>
				</div>
			</div>
		</div>
	);
}

// ── Add Supplier Dialog ───────────────────────────────────────────────────────

function AddSupplierDialog({ onAdded, trigger }: { onAdded: (s: Supplier) => void; trigger?: React.ReactNode }) {
	const [open, setOpen] = useState(false);
	const [name, setName] = useState("");
	const [country, setCountry] = useState("");
	const [vatNumber, setVatNumber] = useState("");
	const [loading, setLoading] = useState(false);

	async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
		e.preventDefault();
		setLoading(true);
		const res = await fetch("/api/enterprise/suppliers", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ name, country, vatNumber: vatNumber || undefined }),
		});
		const supplier = await res.json();
		setLoading(false);
		if (res.ok) {
			onAdded(supplier as Supplier);
			setOpen(false);
			setName("");
			setCountry("");
			setVatNumber("");
		}
	}

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				{trigger ?? (
					<Button size="sm" className="h-8 gap-1.5 text-[13px]">
						<Plus className="size-3.5" />
						Add supplier
					</Button>
				)}
			</DialogTrigger>
			<DialogContent className="sm:max-w-sm">
				<DialogHeader>
					<DialogTitle className="text-[14px] font-semibold">Add supplier to network</DialogTitle>
				</DialogHeader>
				<form onSubmit={handleSubmit} className="space-y-3 pt-1">
					<div className="space-y-1.5">
						<Label className="text-[12px] text-zinc-400">Company name</Label>
						<Input
							value={name}
							onChange={(e) => setName(e.target.value)}
							required
							placeholder="Acme GmbH"
							className="h-8 text-sm"
						/>
					</div>
					<div className="space-y-1.5">
						<Label className="text-[12px] text-zinc-400">Country (ISO 2)</Label>
						<Input
							value={country}
							onChange={(e) => setCountry(e.target.value.toUpperCase())}
							required
							maxLength={2}
							placeholder="DE"
							className="h-8 text-sm"
						/>
					</div>
					<div className="space-y-1.5">
						<Label className="text-[12px] text-zinc-400">VAT number <span className="text-zinc-600">(optional)</span></Label>
						<Input
							value={vatNumber}
							onChange={(e) => setVatNumber(e.target.value)}
							placeholder="DE123456789"
							className="h-8 text-sm font-mono"
						/>
					</div>
					<DialogFooter className="pt-2">
						<Button type="submit" size="sm" disabled={loading} className="h-8 text-[13px]">
							{loading ? "Adding…" : "Add supplier"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

// ── New Questionnaire Dialog ──────────────────────────────────────────────────

function NewQuestionnaireDialog({
	suppliers,
	onCreated,
	trigger,
}: {
	suppliers: Supplier[];
	onCreated: (q: Questionnaire) => void;
	trigger?: React.ReactNode;
}) {
	const [open, setOpen] = useState(false);
	const [title, setTitle] = useState("");
	const [supplierId, setSupplierId] = useState("");
	const [dueAt, setDueAt] = useState("");
	const [loading, setLoading] = useState(false);

	async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
		e.preventDefault();
		setLoading(true);
		const res = await fetch("/api/enterprise/questionnaires", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				title,
				supplierId,
				questions: DEFAULT_QUESTIONS,
				dueAt: dueAt || undefined,
			}),
		});
		const q = await res.json();
		setLoading(false);
		if (res.ok) {
			onCreated(q as Questionnaire);
			setOpen(false);
			setTitle("");
			setSupplierId("");
			setDueAt("");
		}
	}

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				{trigger ?? (
					<Button size="sm" disabled={suppliers.length === 0} className="h-8 gap-1.5 text-[13px]">
						<Plus className="size-3.5" />
						New questionnaire
					</Button>
				)}
			</DialogTrigger>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle className="text-[14px] font-semibold">New CSRD questionnaire</DialogTitle>
				</DialogHeader>
				<form onSubmit={handleSubmit} className="space-y-3 pt-1">
					<div className="space-y-1.5">
						<Label className="text-[12px] text-zinc-400">Title</Label>
						<Input
							value={title}
							onChange={(e) => setTitle(e.target.value)}
							required
							placeholder="CSRD Scope 3 — 2025"
							className="h-8 text-sm"
						/>
					</div>
					<div className="space-y-1.5">
						<Label className="text-[12px] text-zinc-400">Supplier</Label>
						<Select value={supplierId} onValueChange={setSupplierId} required>
							<SelectTrigger className="h-8 text-sm">
								<SelectValue placeholder="Select a supplier…" />
							</SelectTrigger>
							<SelectContent>
								{suppliers.map((s) => (
									<SelectItem key={s.id} value={s.id} className="text-sm">
										{s.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
					<div className="space-y-1.5">
						<Label className="text-[12px] text-zinc-400">Due date <span className="text-zinc-600">(optional)</span></Label>
						<Input
							type="date"
							value={dueAt}
							onChange={(e) => setDueAt(e.target.value)}
							className="h-8 text-sm"
						/>
					</div>
					<div className="rounded-md border border-white/[0.05] bg-white/[0.02] p-3">
						<p className="text-[11px] font-medium text-zinc-500 mb-2">
							Includes {DEFAULT_QUESTIONS.length} standard CSRD questions
						</p>
						<ul className="space-y-1">
							{DEFAULT_QUESTIONS.map((q) => (
								<li key={q.id} className="text-[11px] text-zinc-600 truncate">
									<span className="text-zinc-700 mr-1">·</span>{q.text}
								</li>
							))}
						</ul>
					</div>
					<DialogFooter className="pt-2">
						<Button type="submit" size="sm" disabled={loading || !supplierId} className="h-8 text-[13px]">
							{loading ? "Creating…" : "Create questionnaire"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

// ── Pages ─────────────────────────────────────────────────────────────────────

function OverviewPage({
	enterprise,
	suppliers,
	questionnaires,
}: {
	enterprise: Enterprise | null;
	suppliers: Supplier[];
	questionnaires: Questionnaire[];
}) {
	const sent = questionnaires.filter((q) => q.status !== "draft").length;
	const completed = questionnaires.filter((q) => q.status === "completed").length;

	const steps = [
		{ n: "01", label: "Add suppliers",        done: suppliers.length > 0 },
		{ n: "02", label: "Create questionnaire",  done: questionnaires.length > 0 },
		{ n: "03", label: "Dispatch to suppliers", done: sent > 0 },
		{ n: "04", label: "Collect responses",     done: completed > 0 },
	];

	return (
		<div>
			<PageHeader
				title="Overview"
				description={`Reporting year ${enterprise?.reportingYear ?? "—"}`}
			/>
			<div className="grid grid-cols-3 gap-3 mb-8">
				<StatCard label="Reporting year" value={enterprise?.reportingYear ?? "—"} />
				<StatCard label="Suppliers" value={suppliers.length} />
				<StatCard label="Responses" value={completed} sub={`/ ${sent}`} />
			</div>

			<div className="rounded-lg border border-white/[0.05] bg-white/[0.015] p-5">
				<p className="text-[10px] font-medium text-zinc-600 uppercase tracking-[0.1em] mb-5">
					Getting started
				</p>
				<div className="flex items-center">
					{steps.map((step, i) => (
						<div key={step.n} className="flex items-center flex-1 min-w-0">
							<div className="flex items-center gap-2.5 min-w-0">
								<div
									className={`shrink-0 size-7 rounded-full flex items-center justify-center border text-[10px] font-mono font-medium ${
										step.done
											? "bg-emerald-950/60 border-emerald-900/50 text-emerald-400"
											: "bg-white/[0.02] border-white/[0.07] text-zinc-600"
									}`}
								>
									{step.done ? "✓" : step.n}
								</div>
								<span className={`text-[12px] font-medium truncate ${step.done ? "text-zinc-500" : "text-zinc-600"}`}>
									{step.label}
								</span>
							</div>
							{i < steps.length - 1 && (
								<div className="flex-1 mx-3 h-px bg-white/[0.05] shrink min-w-[12px]" />
							)}
						</div>
					))}
				</div>
			</div>
		</div>
	);
}

function SuppliersPage({
	suppliers,
	onAdded,
}: {
	suppliers: Supplier[];
	onAdded: (s: Supplier) => void;
}) {
	return (
		<div>
			<PageHeader
				title="Suppliers"
				description="Companies linked to your enterprise"
				action={<AddSupplierDialog onAdded={onAdded} />}
			/>
			{suppliers.length === 0 ? (
				<EmptyState
					icon={Building2}
					title="No suppliers yet"
					description="Add your first supplier to start collecting Scope 3 data across your supply chain."
					action={<AddSupplierDialog onAdded={onAdded} />}
				/>
			) : (
				<table className="w-full">
					<thead>
						<tr className="border-b border-white/[0.06]">
							{["Company", "Country", "VAT number"].map((h) => (
								<th key={h} className="pb-2.5 text-left text-[10px] font-medium text-zinc-600 uppercase tracking-[0.08em]">
									{h}
								</th>
							))}
						</tr>
					</thead>
					<tbody>
						{suppliers.map((s) => (
							<tr key={s.id} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
								<td className="py-3 text-[13px] font-medium text-zinc-200">{s.name}</td>
								<td className="py-3 text-[13px] text-zinc-500">{s.country}</td>
								<td className="py-3 font-mono text-[12px] text-zinc-600">{s.vatNumber ?? "—"}</td>
							</tr>
						))}
					</tbody>
				</table>
			)}
		</div>
	);
}

function QuestionnairesPage({
	questionnaires,
	suppliers,
	onCreated,
	onSend,
	sending,
}: {
	questionnaires: Questionnaire[];
	suppliers: Supplier[];
	onCreated: (q: Questionnaire) => void;
	onSend: (id: string) => void;
	sending: string | null;
}) {
	function supplierName(id: string) {
		return suppliers.find((s) => s.id === id)?.name ?? id.slice(0, 8) + "…";
	}

	return (
		<div>
			<PageHeader
				title="Questionnaires"
				description="CSRD data collection requests sent to suppliers"
				action={<NewQuestionnaireDialog suppliers={suppliers} onCreated={onCreated} />}
			/>
			{questionnaires.length === 0 ? (
				<EmptyState
					icon={FileText}
					title="No questionnaires yet"
					description="Create a CSRD questionnaire and dispatch it to a supplier to start collecting compliance data."
					action={<NewQuestionnaireDialog suppliers={suppliers} onCreated={onCreated} />}
				/>
			) : (
				<table className="w-full">
					<thead>
						<tr className="border-b border-white/[0.06]">
							{["Title", "Supplier", "Status", "Due", "Sent", ""].map((h, i) => (
								<th
									key={i}
									className={`pb-2.5 text-[10px] font-medium text-zinc-600 uppercase tracking-[0.08em] ${
										i === 5 ? "text-right" : "text-left"
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
								<td className="py-3 text-[13px] text-zinc-500">{supplierName(q.supplierId)}</td>
								<td className="py-3"><StatusChip status={q.status} /></td>
								<td className="py-3 font-mono text-[12px] text-zinc-600">{formatDate(q.dueAt)}</td>
								<td className="py-3 font-mono text-[12px] text-zinc-600">{formatDate(q.sentAt)}</td>
								<td className="py-3 text-right">
									{q.status === "draft" && (
										<button
											type="button"
											onClick={() => onSend(q.id)}
											disabled={sending === q.id}
											className="inline-flex items-center gap-1.5 text-[12px] font-medium text-zinc-400 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.07] rounded px-2.5 py-1.5 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
										>
											<Send className="size-3" />
											{sending === q.id ? "Sending…" : "Send"}
										</button>
									)}
								</td>
							</tr>
						))}
					</tbody>
				</table>
			)}
		</div>
	);
}

// ── App ───────────────────────────────────────────────────────────────────────

export default function EnterpriseApp() {
	const [authState, setAuthState] = useState<AuthState>("loading");
	const [enterprise, setEnterprise] = useState<Enterprise | null>(null);
	const [suppliers, setSuppliers] = useState<Supplier[]>([]);
	const [questionnaires, setQuestionnaires] = useState<Questionnaire[]>([]);
	const [sending, setSending] = useState<string | null>(null);
	const [page, setPage] = useState<EnterprisePage>("overview");

	useEffect(() => {
		fetch("/api/enterprise/me").then((r) => {
			if (r.status === 401 || r.status === 403) { setAuthState("unauthed"); return null; }
			return r.json();
		}).then((data) => {
			if (data) { setEnterprise(data as Enterprise); setAuthState("authed"); }
		});
		fetch("/api/enterprise/suppliers").then((r) => r.ok ? r.json() : []).then(setSuppliers);
		fetch("/api/enterprise/questionnaires").then((r) => r.ok ? r.json() : []).then(setQuestionnaires);
	}, []);

	async function signOut() {
		await authClient.signOut();
		setAuthState("unauthed");
		setEnterprise(null);
	}

	if (authState === "loading") {
		return (
			<div className="min-h-screen bg-background flex items-center justify-center">
				<div className="h-[2px] bg-gradient-to-r from-blue-600 via-blue-500 to-blue-600/0 fixed top-0 inset-x-0" />
				<span className="text-[13px] text-zinc-600">Loading…</span>
			</div>
		);
	}

	if (authState === "unauthed") return <LoginPage />;

	async function sendQuestionnaire(id: string) {
		setSending(id);
		const res = await fetch(`/api/enterprise/questionnaires/${id}/send`, { method: "POST" });
		if (res.ok) {
			const updated = await res.json();
			setQuestionnaires((prev) =>
				prev.map((q) => (q.id === id ? (updated as Questionnaire) : q)),
			);
		}
		setSending(null);
	}

	return (
		<div className="min-h-screen bg-background text-foreground">
			{/* Enterprise accent bar */}
			<div className="h-[2px] bg-gradient-to-r from-blue-600 via-blue-500 to-blue-600/0" />

			{/* Header */}
			<header className="flex items-center border-b border-white/[0.06] px-6 h-[52px]">
				<PaxisLogo />
				<div className="w-px h-4 bg-white/[0.08] mx-5" />
				<nav className="flex items-center -mb-px">
					<NavBtn active={page === "overview"} onClick={() => setPage("overview")}>
						<LayoutGrid className="size-3.5" />
						Overview
					</NavBtn>
					<NavBtn
						active={page === "suppliers"}
						onClick={() => setPage("suppliers")}
						badge={suppliers.length}
					>
						<Building2 className="size-3.5" />
						Suppliers
					</NavBtn>
					<NavBtn
						active={page === "questionnaires"}
						onClick={() => setPage("questionnaires")}
						badge={questionnaires.length}
					>
						<FileText className="size-3.5" />
						Questionnaires
					</NavBtn>
				</nav>
				<div className="ml-auto flex items-center gap-3">
					<span className="text-[12px] text-zinc-600 truncate max-w-[160px]">
						{enterprise?.name ?? "…"}
					</span>
					<span className="text-[10px] px-2 py-0.5 rounded border border-blue-900/60 text-blue-500 font-medium tracking-wide">
						ENTERPRISE
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
				{page === "overview" && (
					<OverviewPage
						enterprise={enterprise}
						suppliers={suppliers}
						questionnaires={questionnaires}
					/>
				)}
				{page === "suppliers" && (
					<SuppliersPage
						suppliers={suppliers}
						onAdded={(s) => setSuppliers((prev) => [...prev, s])}
					/>
				)}
				{page === "questionnaires" && (
					<QuestionnairesPage
						questionnaires={questionnaires}
						suppliers={suppliers}
						onCreated={(q) => setQuestionnaires((prev) => [q, ...prev])}
						onSend={sendQuestionnaire}
						sending={sending}
					/>
				)}
			</main>
		</div>
	);
}
