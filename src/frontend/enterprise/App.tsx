import {
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  Building2,
  CheckCircle2,
  FileText,
  LayoutGrid,
  Leaf,
  Loader2,
  LogOut,
  Plus,
  RefreshCw,
  Send,
  XCircle,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
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
import { authClient } from "@/lib/auth-client";

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

type EnterprisePage =
  | "overview"
  | "suppliers"
  | "questionnaires"
  | "emissions"
  | "esrs";

type EnterpriseCarbonEntry = {
  id: string;
  scope: "scope1" | "scope2";
  co2Tonnes: number;
  periodStart: string;
  periodEnd: string;
  sourceDescription: string | null;
  createdAt: string;
};

type QuestionnaireResponse = {
  id: string;
  questionnaireId: string;
  supplierId: string;
  answers: Record<string, unknown>;
  submittedAt: string | null;
  createdAt: string;
};

type QuestionnaireDetail = Questionnaire & {
  responses: QuestionnaireResponse[];
};

type RiskFlag = {
  type: "deadline" | "data_gap" | "threshold_breach" | "compliance";
  severity: "critical" | "high" | "medium" | "low";
  description: string;
  recommendation: string;
};

type RiskAssessment = {
  assessedAt: string;
  overallRisk: "critical" | "high" | "medium" | "low";
  summary: string;
  flags: RiskFlag[];
  estimatedFilingReadiness: number;
};

type EsrsReport = {
  generatedAt: string;
  report: {
    title: string;
    reportingPeriod: string;
    executiveSummary: string;
    esrs2General: {
      governanceOverview: string;
      strategyAndBusinessModel: string;
      materialTopics: string[];
    };
    esrs1Climate: {
      scope1tCO2e: number | null;
      scope2tCO2e: number | null;
      scope3tCO2e: number | null;
      totalGHG: number | null;
      dataQuality: "high" | "medium" | "low";
      gapsAndLimitations: string;
    };
    supplierDataQuality: {
      totalSuppliersContacted: number;
      responsesReceived: number;
      completionRatePercent: number;
    };
    recommendedActions: string[];
    assuranceReadiness: "ready" | "partial" | "not_ready";
  };
};
type AuthState = "loading" | "authed" | "unauthed";

type Scope3Aggregate = {
  id: string;
  reportingYear: number;
  co2Tonnes: number;
  supplierCount: number;
  completionRate: number;
  calculatedAt: string;
};

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

const STATUS_CONFIG: Record<
  string,
  { label: string; dot: string; chip: string }
> = {
  draft: {
    label: "Draft",
    dot: "bg-zinc-500",
    chip: "bg-zinc-800/70 text-zinc-400 border-zinc-700/50",
  },
  sent: {
    label: "Sent",
    dot: "bg-blue-400",
    chip: "bg-blue-950/50 text-blue-400 border-blue-900/50",
  },
  in_progress: {
    label: "In progress",
    dot: "bg-amber-400",
    chip: "bg-amber-950/50 text-amber-400 border-amber-900/50",
  },
  completed: {
    label: "Completed",
    dot: "bg-emerald-400",
    chip: "bg-emerald-950/50 text-emerald-400 border-emerald-900/50",
  },
  overdue: {
    label: "Overdue",
    dot: "bg-red-400",
    chip: "bg-red-950/50 text-red-400 border-red-900/50",
  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// ── Brand ─────────────────────────────────────────────────────────────────────

function PaxisLogo() {
  return (
    <div className="flex items-center gap-2.5 shrink-0">
      <svg
        width="18"
        height="18"
        viewBox="0 0 18 18"
        fill="none"
        aria-hidden="true"
      >
        <rect x="0" y="0" width="8" height="8" rx="1.5" fill="#4d7ef7" />
        <rect
          x="10"
          y="0"
          width="8"
          height="8"
          rx="1.5"
          fill="#4d7ef7"
          opacity="0.2"
        />
        <rect
          x="0"
          y="10"
          width="8"
          height="8"
          rx="1.5"
          fill="#4d7ef7"
          opacity="0.2"
        />
        <rect x="10" y="10" width="8" height="8" rx="1.5" fill="#4d7ef7" />
      </svg>
      <span className="text-[15px] font-semibold tracking-[-0.02em] text-white">
        Paxis
      </span>
    </div>
  );
}

// ── Status chip ───────────────────────────────────────────────────────────────

function StatusChip({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? {
    label: status,
    dot: "bg-zinc-500",
    chip: "bg-zinc-800/70 text-zinc-400 border-zinc-700/50",
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium border ${cfg.chip}`}
    >
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
        <span
          className={`text-[10px] font-mono px-1.5 py-px rounded ${
            active ? "bg-white/10 text-zinc-300" : "bg-white/5 text-zinc-600"
          }`}
        >
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
        <h1 className="text-[15px] font-semibold text-white tracking-[-0.01em]">
          {title}
        </h1>
        {description && (
          <p className="mt-0.5 text-xs text-zinc-600">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div className="rounded-lg bg-white/[0.025] border border-white/[0.06] px-5 py-4">
      <p className="text-[10px] font-medium text-zinc-600 uppercase tracking-[0.1em] mb-3">
        {label}
      </p>
      <p className="font-mono text-[30px] font-medium text-white leading-none tabular-nums">
        {value}
        {sub && (
          <span className="text-zinc-600 text-base font-normal ml-1.5">
            {sub}
          </span>
        )}
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
      <p className="text-[12px] text-zinc-600 max-w-[260px] leading-relaxed mb-5">
        {description}
      </p>
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
          <svg
            width="28"
            height="28"
            viewBox="0 0 18 18"
            fill="none"
            aria-hidden="true"
          >
            <rect x="0" y="0" width="8" height="8" rx="1.5" fill="#4d7ef7" />
            <rect
              x="10"
              y="0"
              width="8"
              height="8"
              rx="1.5"
              fill="#4d7ef7"
              opacity="0.2"
            />
            <rect
              x="0"
              y="10"
              width="8"
              height="8"
              rx="1.5"
              fill="#4d7ef7"
              opacity="0.2"
            />
            <rect x="10" y="10" width="8" height="8" rx="1.5" fill="#4d7ef7" />
          </svg>
          <div className="text-center">
            <h1 className="text-[17px] font-semibold text-white tracking-[-0.02em]">
              Paxis Enterprise
            </h1>
            <p className="text-[13px] text-zinc-600 mt-1">
              EU compliance OS for your supply chain
            </p>
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
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                fill="#EA4335"
              />
            </svg>
            {loading ? "Redirecting…" : "Continue with Google"}
          </button>
          <p className="text-[11px] text-zinc-700 text-center leading-relaxed">
            Enterprise access only. Contact your administrator if you need
            access.
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Add Supplier Dialog ───────────────────────────────────────────────────────

function AddSupplierDialog({
  onAdded,
  trigger,
}: {
  onAdded: (s: Supplier) => void;
  trigger?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [country, setCountry] = useState("");
  const [vatNumber, setVatNumber] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const res = await fetch("/api/enterprise/suppliers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        country,
        vatNumber: vatNumber || undefined,
      }),
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
          <DialogTitle className="text-[14px] font-semibold">
            Add supplier to network
          </DialogTitle>
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
            <Label className="text-[12px] text-zinc-400">
              VAT number <span className="text-zinc-600">(optional)</span>
            </Label>
            <Input
              value={vatNumber}
              onChange={(e) => setVatNumber(e.target.value)}
              placeholder="DE123456789"
              className="h-8 text-sm font-mono"
            />
          </div>
          <DialogFooter className="pt-2">
            <Button
              type="submit"
              size="sm"
              disabled={loading}
              className="h-8 text-[13px]"
            >
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

  async function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
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
          <Button
            size="sm"
            disabled={suppliers.length === 0}
            className="h-8 gap-1.5 text-[13px]"
          >
            <Plus className="size-3.5" />
            New questionnaire
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle className="text-[14px] font-semibold">
            New CSRD questionnaire
          </DialogTitle>
        </DialogHeader>
        <form
          onSubmit={handleSubmit}
          className="flex flex-col gap-3 pt-1 overflow-y-auto min-h-0"
        >
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
            <Label className="text-[12px] text-zinc-400">
              Due date <span className="text-zinc-600">(optional)</span>
            </Label>
            <Input
              type="date"
              value={dueAt}
              onChange={(e) => setDueAt(e.target.value)}
              className="h-8 text-sm"
            />
          </div>
          <div className="rounded-md border border-white/[0.05] bg-white/[0.02] p-3 overflow-hidden">
            <p className="text-[11px] font-medium text-zinc-500 mb-2">
              Includes {DEFAULT_QUESTIONS.length} standard CSRD questions
            </p>
            <ul className="space-y-1 overflow-hidden">
              {DEFAULT_QUESTIONS.map((q) => (
                <li
                  key={q.id}
                  className="text-[11px] text-zinc-600 truncate min-w-0"
                >
                  <span className="text-zinc-700 mr-1">·</span>
                  {q.text}
                </li>
              ))}
            </ul>
          </div>
          <DialogFooter className="pt-2 shrink-0">
            <Button
              type="submit"
              size="sm"
              disabled={loading || !supplierId}
              className="h-8 text-[13px]"
            >
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
  scope3,
  risk,
  riskAssessing,
  onAssess,
}: {
  enterprise: Enterprise | null;
  suppliers: Supplier[];
  questionnaires: Questionnaire[];
  scope3: Scope3Aggregate | null;
  risk: RiskAssessment | null;
  riskAssessing: boolean;
  onAssess: () => void;
}) {
  const sent = questionnaires.filter((q) => q.status !== "draft").length;
  const completed = questionnaires.filter(
    (q) => q.status === "completed",
  ).length;

  const steps = [
    { n: "01", label: "Add suppliers", done: suppliers.length > 0 },
    { n: "02", label: "Create questionnaire", done: questionnaires.length > 0 },
    { n: "03", label: "Dispatch to suppliers", done: sent > 0 },
    { n: "04", label: "Collect responses", done: completed > 0 },
  ];

  const scope3Display = scope3
    ? scope3.co2Tonnes.toLocaleString("en-GB", { maximumFractionDigits: 1 })
    : "—";

  return (
    <div>
      <PageHeader
        title="Overview"
        description={`Reporting year ${enterprise?.reportingYear ?? "—"}`}
      />
      <div className="grid grid-cols-4 gap-3 mb-8">
        <StatCard
          label="Reporting year"
          value={enterprise?.reportingYear ?? "—"}
        />
        <StatCard label="Suppliers" value={suppliers.length} />
        <StatCard label="Responses" value={completed} sub={`/ ${sent}`} />
        <StatCard label="Scope 3 tCO₂e" value={scope3Display} />
      </div>

      <div className="rounded-lg border border-white/[0.05] bg-white/[0.015] p-5 mb-4">
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
                <span
                  className={`text-[12px] font-medium truncate ${step.done ? "text-zinc-500" : "text-zinc-600"}`}
                >
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

      <RiskPanel risk={risk} assessing={riskAssessing} onAssess={onAssess} />
    </div>
  );
}

function SuppliersPage({
  suppliers,
  onAdded,
  onSelect,
}: {
  suppliers: Supplier[];
  onAdded: (s: Supplier) => void;
  onSelect: (id: string) => void;
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
                <th
                  key={h}
                  className="pb-2.5 text-left text-[10px] font-medium text-zinc-600 uppercase tracking-[0.08em]"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {suppliers.map((s) => (
              <tr
                key={s.id}
                onClick={() => onSelect(s.id)}
                className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors cursor-pointer"
              >
                <td className="py-3 text-[13px] font-medium text-zinc-200">
                  {s.name}
                </td>
                <td className="py-3 text-[13px] text-zinc-500">{s.country}</td>
                <td className="py-3 font-mono text-[12px] text-zinc-600">
                  {s.vatNumber ?? "—"}
                </td>
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
  onSelect,
  sending,
}: {
  questionnaires: Questionnaire[];
  suppliers: Supplier[];
  onCreated: (q: Questionnaire) => void;
  onSend: (id: string) => void;
  onSelect: (id: string) => void;
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
        action={
          <NewQuestionnaireDialog suppliers={suppliers} onCreated={onCreated} />
        }
      />
      {questionnaires.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No questionnaires yet"
          description="Create a CSRD questionnaire and dispatch it to a supplier to start collecting compliance data."
          action={
            <NewQuestionnaireDialog
              suppliers={suppliers}
              onCreated={onCreated}
            />
          }
        />
      ) : (
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/[0.06]">
              {["Title", "Supplier", "Status", "Due", "Sent", ""].map(
                (h, i) => (
                  <th
                    key={i}
                    className={`pb-2.5 text-[10px] font-medium text-zinc-600 uppercase tracking-[0.08em] ${
                      i === 5 ? "text-right" : "text-left"
                    }`}
                  >
                    {h}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {questionnaires.map((q) => (
              <tr
                key={q.id}
                onClick={() => onSelect(q.id)}
                className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors cursor-pointer"
              >
                <td className="py-3 text-[13px] font-medium text-zinc-200">
                  {q.title}
                </td>
                <td className="py-3 text-[13px] text-zinc-500">
                  {supplierName(q.supplierId)}
                </td>
                <td className="py-3">
                  <StatusChip status={q.status} />
                </td>
                <td className="py-3 font-mono text-[12px] text-zinc-600">
                  {formatDate(q.dueAt)}
                </td>
                <td className="py-3 font-mono text-[12px] text-zinc-600">
                  {formatDate(q.sentAt)}
                </td>
                <td
                  className="py-3 text-right"
                  onClick={(e) => e.stopPropagation()}
                >
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

// ── Risk panel ────────────────────────────────────────────────────────────────

const RISK_CFG = {
  critical: {
    label: "Critical",
    color: "text-red-400",
    bg: "bg-red-950/50 border-red-900/50",
    bar: "bg-red-500",
  },
  high: {
    label: "High risk",
    color: "text-orange-400",
    bg: "bg-orange-950/50 border-orange-900/50",
    bar: "bg-orange-500",
  },
  medium: {
    label: "Medium",
    color: "text-amber-400",
    bg: "bg-amber-950/50 border-amber-900/50",
    bar: "bg-amber-500",
  },
  low: {
    label: "Low risk",
    color: "text-emerald-400",
    bg: "bg-emerald-950/50 border-emerald-900/50",
    bar: "bg-emerald-500",
  },
};

const FLAG_TYPE_LABEL: Record<RiskFlag["type"], string> = {
  deadline: "Deadline",
  data_gap: "Data gap",
  threshold_breach: "Threshold",
  compliance: "Compliance",
};

function RiskPanel({
  risk,
  assessing,
  onAssess,
}: {
  risk: RiskAssessment | null;
  assessing: boolean;
  onAssess: () => void;
}) {
  const assessBtn = (
    <button
      type="button"
      onClick={onAssess}
      disabled={assessing}
      className="inline-flex items-center gap-1.5 text-[12px] font-medium text-zinc-400 hover:text-white bg-white/[0.04] hover:bg-white/[0.07] border border-white/[0.07] rounded px-3 py-1.5 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
    >
      {assessing ? (
        <Loader2 className="size-3 animate-spin" />
      ) : (
        <RefreshCw className="size-3" />
      )}
      {assessing ? "Assessing…" : risk ? "Re-assess" : "Run assessment"}
    </button>
  );

  if (!risk) {
    return (
      <div className="rounded-lg border border-white/[0.05] bg-white/[0.015] p-5">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[10px] font-medium text-zinc-600 uppercase tracking-[0.1em]">
            Risk &amp; deadlines
          </p>
          {assessBtn}
        </div>
        {assessing ? (
          <div className="flex items-center gap-2.5 text-[12px] text-zinc-500 py-3">
            <Loader2 className="size-3.5 animate-spin text-amber-500 shrink-0" />
            Gemini is reviewing your compliance data…
          </div>
        ) : (
          <p className="text-[12px] text-zinc-600 py-2">
            Run an AI risk assessment to surface CSRD deadlines, data gaps, and
            filing readiness.
          </p>
        )}
      </div>
    );
  }

  const cfg = RISK_CFG[risk.overallRisk];

  return (
    <div className="rounded-lg border border-white/[0.05] bg-white/[0.015] p-5">
      <div className="flex items-center justify-between mb-4">
        <p className="text-[10px] font-medium text-zinc-600 uppercase tracking-[0.1em]">
          Risk &amp; deadlines
        </p>
        <div className="flex items-center gap-3">
          {assessing && (
            <div className="flex items-center gap-1.5 text-[11px] text-zinc-600">
              <Loader2 className="size-3 animate-spin" />
              Updating…
            </div>
          )}
          <span className="text-[10px] text-zinc-700 font-mono">
            {formatDate(risk.assessedAt)}
          </span>
          {assessBtn}
        </div>
      </div>

      {/* Summary row */}
      <div className="flex items-start gap-4 mb-4">
        <div className="flex-1 min-w-0">
          <p className="text-[12px] text-zinc-400 leading-relaxed">
            {risk.summary}
          </p>
        </div>
        <div className="shrink-0 flex flex-col items-end gap-2">
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded border text-[11px] font-medium ${cfg.bg} ${cfg.color}`}
          >
            {cfg.label}
          </span>
        </div>
      </div>

      {/* Filing readiness bar */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] font-medium text-zinc-600 uppercase tracking-[0.08em]">
            Filing readiness
          </span>
          <span className={`text-[12px] font-mono font-medium ${cfg.color}`}>
            {risk.estimatedFilingReadiness}%
          </span>
        </div>
        <div className="h-1.5 rounded-full bg-white/[0.05] overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${cfg.bar}`}
            style={{ width: `${risk.estimatedFilingReadiness}%` }}
          />
        </div>
      </div>

      {/* Flags */}
      {risk.flags.length > 0 && (
        <div className="space-y-1.5">
          {risk.flags.map((flag, i) => {
            const flagCfg = RISK_CFG[flag.severity];
            return (
              <div
                key={i}
                className="rounded-md border border-white/[0.05] bg-white/[0.02] px-3 py-2.5"
              >
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${flagCfg.bg} ${flagCfg.color}`}
                  >
                    {FLAG_TYPE_LABEL[flag.type]}
                  </span>
                  <span className={`text-[10px] font-medium ${flagCfg.color}`}>
                    {flagCfg.label}
                  </span>
                </div>
                <p className="text-[12px] text-zinc-300 leading-relaxed">
                  {flag.description}
                </p>
                <p className="text-[11px] text-zinc-600 mt-1 leading-relaxed">
                  → {flag.recommendation}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── ESRS Report page ──────────────────────────────────────────────────────────

const READINESS_CONFIG = {
  ready: {
    label: "Assurance ready",
    icon: CheckCircle2,
    color: "text-emerald-400",
    bg: "bg-emerald-950/50 border-emerald-900/50",
  },
  partial: {
    label: "Partially ready",
    icon: AlertTriangle,
    color: "text-amber-400",
    bg: "bg-amber-950/50 border-amber-900/50",
  },
  not_ready: {
    label: "Not ready",
    icon: XCircle,
    color: "text-red-400",
    bg: "bg-red-950/50 border-red-900/50",
  },
};

const QUALITY_COLOR: Record<string, string> = {
  high: "text-emerald-400",
  medium: "text-amber-400",
  low: "text-red-400",
};

function EmissionCell({ value }: { value: number | null }) {
  if (value == null) return <span className="text-zinc-600">—</span>;
  return (
    <span className="font-mono text-white tabular-nums">
      {value.toLocaleString("en-GB", { maximumFractionDigits: 1 })}
      <span className="text-zinc-600 text-[11px] ml-1">tCO₂e</span>
    </span>
  );
}

function EsrsReportPage({
  report,
  generating,
  onGenerate,
}: {
  report: EsrsReport | null;
  generating: boolean;
  onGenerate: () => void;
}) {
  const r = report?.report;

  const generateBtn = (
    <button
      type="button"
      onClick={onGenerate}
      disabled={generating}
      className="inline-flex items-center gap-1.5 text-[12px] font-medium text-zinc-400 hover:text-white bg-white/[0.04] hover:bg-white/[0.07] border border-white/[0.07] rounded px-3 py-1.5 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
    >
      {generating ? (
        <Loader2 className="size-3 animate-spin" />
      ) : (
        <RefreshCw className="size-3" />
      )}
      {generating ? "Generating…" : r ? "Regenerate" : "Generate report"}
    </button>
  );

  if (!r) {
    return (
      <div>
        <PageHeader
          title="ESRS Report"
          description="CSRD-standard annual sustainability report"
          action={generateBtn}
        />
        <EmptyState
          icon={BarChart3}
          title="No report generated yet"
          description="Generate your CSRD-standard ESRS report from aggregated supplier and emissions data."
          action={
            generating ? (
              <div className="flex items-center gap-2 text-[12px] text-zinc-500">
                <Loader2 className="size-3.5 animate-spin" />
                Generating report — this takes ~20 seconds…
              </div>
            ) : (
              <button
                type="button"
                onClick={onGenerate}
                className="inline-flex items-center gap-1.5 text-[13px] font-medium text-white bg-blue-600 hover:bg-blue-500 rounded px-4 py-2 transition-colors"
              >
                <BarChart3 className="size-3.5" />
                Generate ESRS report
              </button>
            )
          }
        />
      </div>
    );
  }

  const readiness = READINESS_CONFIG[r.assuranceReadiness];
  const ReadinessIcon = readiness.icon;

  return (
    <div>
      <PageHeader
        title="ESRS Report"
        description={`${r.reportingPeriod} · Generated ${formatDate(report.generatedAt)}`}
        action={generateBtn}
      />

      {generating && (
        <div className="mb-5 flex items-center gap-2.5 text-[12px] text-zinc-500 bg-white/[0.02] border border-white/[0.05] rounded-lg px-4 py-3">
          <Loader2 className="size-3.5 animate-spin shrink-0" />
          Generating updated report — page will refresh automatically…
        </div>
      )}

      {/* Assurance readiness + title */}
      <div className="mb-5 rounded-lg border border-white/[0.06] bg-white/[0.02] px-5 py-4 flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-medium text-zinc-600 uppercase tracking-[0.1em] mb-1.5">
            Report title
          </p>
          <p className="text-[15px] font-semibold text-white tracking-[-0.01em]">
            {r.title}
          </p>
          <p className="text-[12px] text-zinc-600 mt-1 leading-relaxed max-w-xl">
            {r.executiveSummary}
          </p>
        </div>
        <div
          className={`shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded border text-[11px] font-medium ${readiness.bg} ${readiness.color}`}
        >
          <ReadinessIcon className="size-3" />
          {readiness.label}
        </div>
      </div>

      {/* ESRS E1: Climate emissions */}
      <div className="mb-4">
        <p className="text-[10px] font-medium text-zinc-600 uppercase tracking-[0.1em] mb-3">
          ESRS E1 — Climate change (GHG emissions)
        </p>
        <div className="rounded-lg border border-white/[0.06] bg-white/[0.015] overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/[0.05]">
                {["Scope", "Category", "Emissions", ""].map((h, i) => (
                  <th
                    key={i}
                    className="px-4 py-2.5 text-left text-[10px] font-medium text-zinc-600 uppercase tracking-[0.08em]"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                {
                  scope: "Scope 1",
                  category: "Direct combustion",
                  value: r.esrs1Climate.scope1tCO2e,
                },
                {
                  scope: "Scope 2",
                  category: "Purchased energy",
                  value: r.esrs1Climate.scope2tCO2e,
                },
                {
                  scope: "Scope 3",
                  category: "Supply chain (upstream)",
                  value: r.esrs1Climate.scope3tCO2e,
                },
              ].map((row) => (
                <tr key={row.scope} className="border-b border-white/[0.04]">
                  <td className="px-4 py-3 text-[12px] font-medium text-zinc-300">
                    {row.scope}
                  </td>
                  <td className="px-4 py-3 text-[12px] text-zinc-500">
                    {row.category}
                  </td>
                  <td className="px-4 py-3">
                    <EmissionCell value={row.value} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    {row.value == null && (
                      <span className="text-[10px] text-zinc-700 font-medium">
                        Data missing
                      </span>
                    )}
                  </td>
                </tr>
              ))}
              <tr className="bg-white/[0.015]">
                <td
                  className="px-4 py-3 text-[12px] font-semibold text-zinc-200"
                  colSpan={2}
                >
                  Total GHG
                </td>
                <td className="px-4 py-3">
                  <EmissionCell value={r.esrs1Climate.totalGHG} />
                </td>
                <td className="px-4 py-3 text-right">
                  <span
                    className={`text-[10px] font-medium uppercase tracking-wide ${QUALITY_COLOR[r.esrs1Climate.dataQuality]}`}
                  >
                    {r.esrs1Climate.dataQuality} quality
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
          {r.esrs1Climate.gapsAndLimitations && (
            <div className="px-4 py-3 border-t border-white/[0.04] flex items-start gap-2">
              <AlertTriangle className="size-3.5 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-[11px] text-zinc-500 leading-relaxed">
                {r.esrs1Climate.gapsAndLimitations}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Supplier data quality */}
      <div className="mb-4 grid grid-cols-3 gap-3">
        <StatCard
          label="Suppliers contacted"
          value={r.supplierDataQuality.totalSuppliersContacted}
        />
        <StatCard
          label="Responses received"
          value={r.supplierDataQuality.responsesReceived}
        />
        <StatCard
          label="Completion rate"
          value={`${r.supplierDataQuality.completionRatePercent}%`}
        />
      </div>

      {/* ESRS 2: General */}
      <div className="mb-4">
        <p className="text-[10px] font-medium text-zinc-600 uppercase tracking-[0.1em] mb-3">
          ESRS 2 — General disclosures
        </p>
        <div className="rounded-lg border border-white/[0.06] bg-white/[0.015] divide-y divide-white/[0.04]">
          <div className="px-4 py-3.5">
            <p className="text-[10px] font-medium text-zinc-600 uppercase tracking-[0.08em] mb-1.5">
              Governance
            </p>
            <p className="text-[12px] text-zinc-400 leading-relaxed">
              {r.esrs2General.governanceOverview}
            </p>
          </div>
          <div className="px-4 py-3.5">
            <p className="text-[10px] font-medium text-zinc-600 uppercase tracking-[0.08em] mb-1.5">
              Strategy & business model
            </p>
            <p className="text-[12px] text-zinc-400 leading-relaxed">
              {r.esrs2General.strategyAndBusinessModel}
            </p>
          </div>
          <div className="px-4 py-3.5">
            <p className="text-[10px] font-medium text-zinc-600 uppercase tracking-[0.08em] mb-1.5">
              Material topics
            </p>
            <div className="flex flex-wrap gap-1.5">
              {r.esrs2General.materialTopics.map((t) => (
                <span
                  key={t}
                  className="px-2 py-0.5 rounded text-[11px] text-zinc-400 bg-white/[0.04] border border-white/[0.07]"
                >
                  {t}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Recommended actions */}
      <div>
        <p className="text-[10px] font-medium text-zinc-600 uppercase tracking-[0.1em] mb-3">
          Recommended actions
        </p>
        <div className="rounded-lg border border-white/[0.06] bg-white/[0.015] divide-y divide-white/[0.04]">
          {r.recommendedActions.map((action, i) => (
            <div key={i} className="flex items-start gap-3 px-4 py-3.5">
              <span className="shrink-0 size-5 rounded-full bg-blue-950/60 border border-blue-900/50 text-blue-400 text-[10px] font-mono font-medium flex items-center justify-center mt-0.5">
                {i + 1}
              </span>
              <p className="text-[12px] text-zinc-400 leading-relaxed">
                {action}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Questionnaire detail page ─────────────────────────────────────────────────

function formatAnswer(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

function QuestionnaireDetailPage({
  questionnaireId,
  suppliers,
  onBack,
  onSend,
  sending,
  refreshKey,
}: {
  questionnaireId: string;
  suppliers: Supplier[];
  onBack: () => void;
  onSend: (id: string) => void;
  sending: string | null;
  refreshKey: number;
}) {
  const [detail, setDetail] = useState<QuestionnaireDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/enterprise/questionnaires/${questionnaireId}`)
      .then((r) => r.json())
      .then((data) => {
        setDetail(data as QuestionnaireDetail);
        setLoading(false);
      });
  }, [questionnaireId, refreshKey]);

  const supplierName = (id: string) =>
    suppliers.find((s) => s.id === id)?.name ?? id.slice(0, 8) + "…";

  const response = detail?.responses[0] ?? null;
  const answers = response?.answers ?? {};

  return (
    <div>
      <div className="flex items-center gap-3 py-5 border-b border-white/[0.05] mb-6">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 text-[12px] text-zinc-600 hover:text-zinc-300 transition-colors"
        >
          <ArrowLeft className="size-3.5" />
          Questionnaires
        </button>
        <span className="text-zinc-700">/</span>
        {loading ? (
          <span className="text-[13px] text-zinc-600">Loading…</span>
        ) : (
          <>
            <h1 className="text-[15px] font-semibold text-white tracking-[-0.01em] flex-1 truncate">
              {detail?.title ?? "—"}
            </h1>
            <div className="flex items-center gap-3 shrink-0">
              {detail && <StatusChip status={detail.status} />}
              {detail?.status === "draft" && (
                <button
                  type="button"
                  onClick={() => onSend(detail.id)}
                  disabled={sending === detail?.id}
                  className="inline-flex items-center gap-1.5 text-[12px] font-medium text-zinc-400 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.07] rounded px-2.5 py-1.5 transition-all disabled:opacity-40"
                >
                  <Send className="size-3" />
                  {sending === detail?.id ? "Sending…" : "Send to supplier"}
                </button>
              )}
            </div>
          </>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="size-4 animate-spin text-zinc-600" />
        </div>
      ) : detail ? (
        <div className="space-y-6">
          {/* Metadata cards */}
          <div className="grid grid-cols-4 gap-3">
            <div className="rounded-lg border border-white/[0.06] bg-white/[0.025] px-4 py-3">
              <p className="text-[10px] font-medium text-zinc-600 uppercase tracking-[0.1em] mb-1.5">
                Supplier
              </p>
              <p className="text-[13px] font-medium text-zinc-200">
                {supplierName(detail.supplierId)}
              </p>
            </div>
            <div className="rounded-lg border border-white/[0.06] bg-white/[0.025] px-4 py-3">
              <p className="text-[10px] font-medium text-zinc-600 uppercase tracking-[0.1em] mb-1.5">
                Due date
              </p>
              <p className="text-[13px] font-mono text-zinc-200">
                {formatDate(detail.dueAt)}
              </p>
            </div>
            <div className="rounded-lg border border-white/[0.06] bg-white/[0.025] px-4 py-3">
              <p className="text-[10px] font-medium text-zinc-600 uppercase tracking-[0.1em] mb-1.5">
                Sent
              </p>
              <p className="text-[13px] font-mono text-zinc-200">
                {formatDate(detail.sentAt)}
              </p>
            </div>
            <div className="rounded-lg border border-white/[0.06] bg-white/[0.025] px-4 py-3">
              <p className="text-[10px] font-medium text-zinc-600 uppercase tracking-[0.1em] mb-1.5">
                Responses
              </p>
              <p className="text-[13px] font-medium text-zinc-200">
                {detail.responses.length > 0 ? (
                  <span>
                    Submitted{" "}
                    <span className="text-zinc-500">
                      {formatDate(response?.submittedAt ?? null)}
                    </span>
                  </span>
                ) : (
                  <span className="text-zinc-600">None yet</span>
                )}
              </p>
            </div>
          </div>

          {/* Questions + answers */}
          <div>
            <p className="text-[10px] font-medium text-zinc-600 uppercase tracking-[0.1em] mb-3">
              Questions ({detail.questions.length})
            </p>
            <div className="rounded-lg border border-white/[0.06] bg-white/[0.015] overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/[0.05]">
                    <th className="px-4 py-2.5 text-left text-[10px] font-medium text-zinc-600 uppercase tracking-[0.08em] w-6">
                      #
                    </th>
                    <th className="px-4 py-2.5 text-left text-[10px] font-medium text-zinc-600 uppercase tracking-[0.08em]">
                      Question
                    </th>
                    <th className="px-4 py-2.5 text-left text-[10px] font-medium text-zinc-600 uppercase tracking-[0.08em] w-16">
                      Type
                    </th>
                    <th className="px-4 py-2.5 text-left text-[10px] font-medium text-zinc-600 uppercase tracking-[0.08em] w-48">
                      Supplier answer
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {detail.questions.map((q, i) => {
                    const ans = answers[q.id];
                    const hasAnswer = ans !== null && ans !== undefined;
                    return (
                      <tr
                        key={q.id}
                        className="border-b border-white/[0.04] last:border-0"
                      >
                        <td className="px-4 py-3.5 text-[11px] font-mono text-zinc-600">
                          {i + 1}
                        </td>
                        <td className="px-4 py-3.5">
                          <p className="text-[13px] text-zinc-300 leading-relaxed">
                            {q.text}
                          </p>
                          {q.required && (
                            <span className="text-[10px] text-zinc-700 mt-0.5 inline-block">
                              Required
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3.5">
                          <span className="text-[11px] font-mono text-zinc-600 bg-white/[0.03] border border-white/[0.05] px-1.5 py-0.5 rounded">
                            {q.type}
                          </span>
                        </td>
                        <td className="px-4 py-3.5">
                          {hasAnswer ? (
                            <span className="text-[13px] text-zinc-200 font-medium">
                              {formatAnswer(ans)}
                            </span>
                          ) : (
                            <span className="text-[12px] text-zinc-700 italic">
                              {detail.responses.length > 0
                                ? "Not answered"
                                : "Awaiting response"}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        <p className="text-sm text-zinc-600">Questionnaire not found.</p>
      )}
    </div>
  );
}

// ── Supplier detail page ──────────────────────────────────────────────────────

function SupplierDetailPage({
  supplier,
  questionnaires,
  onBack,
  onSelectQuestionnaire,
  onSend,
  sending,
}: {
  supplier: Supplier;
  questionnaires: Questionnaire[];
  onBack: () => void;
  onSelectQuestionnaire: (id: string) => void;
  onSend: (id: string) => void;
  sending: string | null;
}) {
  const qs = questionnaires.filter((q) => q.supplierId === supplier.id);
  const completed = qs.filter((q) => q.status === "completed").length;
  const sent = qs.filter((q) => q.status !== "draft").length;
  const overdue = qs.filter((q) => q.status === "overdue").length;

  return (
    <div>
      <div className="flex items-center gap-3 py-5 border-b border-white/[0.05] mb-6">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 text-[12px] text-zinc-600 hover:text-zinc-300 transition-colors"
        >
          <ArrowLeft className="size-3.5" />
          Suppliers
        </button>
        <span className="text-zinc-700">/</span>
        <h1 className="text-[15px] font-semibold text-white tracking-[-0.01em] flex-1">
          {supplier.name}
        </h1>
        <span className="text-[11px] font-mono text-zinc-600 bg-white/[0.03] border border-white/[0.05] px-2 py-0.5 rounded">
          {supplier.country}
        </span>
        {supplier.vatNumber && (
          <span className="text-[11px] font-mono text-zinc-600">
            {supplier.vatNumber}
          </span>
        )}
      </div>

      <div className="grid grid-cols-4 gap-3 mb-8">
        <StatCard label="Questionnaires sent" value={sent} />
        <StatCard label="Completed" value={completed} />
        <StatCard label="Overdue" value={overdue} />
        <StatCard
          label="Completion rate"
          value={sent > 0 ? `${Math.round((completed / sent) * 100)}%` : "—"}
        />
      </div>

      {qs.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No questionnaires for this supplier"
          description="Create a CSRD questionnaire and dispatch it to this supplier."
        />
      ) : (
        <div>
          <p className="text-[10px] font-medium text-zinc-600 uppercase tracking-[0.1em] mb-3">
            Questionnaires
          </p>
          <div className="rounded-lg border border-white/[0.06] bg-white/[0.015] overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/[0.05]">
                  {["Title", "Status", "Due", "Sent", ""].map((h, i) => (
                    <th
                      key={i}
                      className={`px-4 py-2.5 text-[10px] font-medium text-zinc-600 uppercase tracking-[0.08em] ${
                        i === 4 ? "text-right" : "text-left"
                      }`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {qs.map((q) => (
                  <tr
                    key={q.id}
                    onClick={() => onSelectQuestionnaire(q.id)}
                    className="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02] transition-colors cursor-pointer"
                  >
                    <td className="px-4 py-3 text-[13px] font-medium text-zinc-200">
                      {q.title}
                    </td>
                    <td className="px-4 py-3">
                      <StatusChip status={q.status} />
                    </td>
                    <td className="px-4 py-3 font-mono text-[12px] text-zinc-600">
                      {formatDate(q.dueAt)}
                    </td>
                    <td className="px-4 py-3 font-mono text-[12px] text-zinc-600">
                      {formatDate(q.sentAt)}
                    </td>
                    <td
                      className="px-4 py-3 text-right"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {q.status === "draft" && (
                        <button
                          type="button"
                          onClick={() => onSend(q.id)}
                          disabled={sending === q.id}
                          className="inline-flex items-center gap-1.5 text-[12px] font-medium text-zinc-400 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.07] rounded px-2.5 py-1.5 transition-all disabled:opacity-40"
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
          </div>
        </div>
      )}
    </div>
  );
}

// ── Add Enterprise Carbon Dialog ──────────────────────────────────────────────

function AddEnterpriseCarbonDialog({
  onAdded,
}: {
  onAdded: (e: EnterpriseCarbonEntry) => void;
}) {
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
    const res = await fetch("/api/enterprise/carbon", {
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
      onAdded(entry as EnterpriseCarbonEntry);
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
          <DialogTitle className="text-[14px] font-semibold">
            Add emissions entry
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3 pt-1">
          <div className="space-y-1.5">
            <Label className="text-[12px] text-zinc-400">Scope</Label>
            <Select
              value={scope}
              onValueChange={(v) => setScope(v as "scope1" | "scope2")}
            >
              <SelectTrigger className="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="scope1" className="text-sm">
                  Scope 1 — Direct emissions
                </SelectItem>
                <SelectItem value="scope2" className="text-sm">
                  Scope 2 — Purchased energy
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-[12px] text-zinc-400">
              CO₂ equivalent (tonnes)
            </Label>
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
            <Label className="text-[12px] text-zinc-400">
              Source <span className="text-zinc-600">(optional)</span>
            </Label>
            <Input
              value={sourceDescription}
              onChange={(e) => setSourceDescription(e.target.value)}
              placeholder="Natural gas — boiler"
              className="h-8 text-sm"
            />
          </div>
          <DialogFooter className="pt-2">
            <Button
              type="submit"
              size="sm"
              disabled={loading}
              className="h-8 text-[13px]"
            >
              {loading ? "Adding…" : "Add entry"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Emissions Page ────────────────────────────────────────────────────────────

function EmissionsPage({
  entries,
  onAdded,
}: {
  entries: EnterpriseCarbonEntry[];
  onAdded: (e: EnterpriseCarbonEntry) => void;
}) {
  const scope1Total = entries
    .filter((e) => e.scope === "scope1")
    .reduce((s, e) => s + e.co2Tonnes, 0);
  const scope2Total = entries
    .filter((e) => e.scope === "scope2")
    .reduce((s, e) => s + e.co2Tonnes, 0);

  return (
    <div>
      <PageHeader
        title="Own Emissions"
        description="Scope 1 & 2 direct and purchased-energy emissions for ESRS reporting"
        action={<AddEnterpriseCarbonDialog onAdded={onAdded} />}
      />

      <div className="grid grid-cols-2 gap-3 mb-4">
        <StatCard
          label="Total Scope 1"
          value={scope1Total.toLocaleString("en-GB", {
            maximumFractionDigits: 2,
          })}
          sub="tCO₂e"
        />
        <StatCard
          label="Total Scope 2"
          value={scope2Total.toLocaleString("en-GB", {
            maximumFractionDigits: 2,
          })}
          sub="tCO₂e"
        />
      </div>

      <p className="text-[11px] text-zinc-600 mb-6">
        These figures populate the ESRS report's Scope 1 &amp; 2 fields. Add one
        entry per billing period or source.
      </p>

      {entries.length === 0 ? (
        <EmptyState
          icon={Leaf}
          title="No emissions recorded"
          description="Add your organisation's direct (Scope 1) and purchased-energy (Scope 2) emissions to complete your ESRS report."
          action={<AddEnterpriseCarbonDialog onAdded={onAdded} />}
        />
      ) : (
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/[0.06]">
              {["Scope", "CO₂e (tonnes)", "Period", "Source"].map((h) => (
                <th
                  key={h}
                  className="pb-2.5 text-left text-[10px] font-medium text-zinc-600 uppercase tracking-[0.08em]"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr
                key={e.id}
                className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors"
              >
                <td className="py-3">
                  <span
                    className={`text-[11px] font-medium px-2 py-0.5 rounded border ${
                      e.scope === "scope1"
                        ? "bg-blue-950/50 text-blue-400 border-blue-900/50"
                        : "bg-purple-950/50 text-purple-400 border-purple-900/50"
                    }`}
                  >
                    {e.scope === "scope1" ? "Scope 1" : "Scope 2"}
                  </span>
                </td>
                <td className="py-3 font-mono text-[13px] font-medium text-white tabular-nums">
                  {e.co2Tonnes.toLocaleString("en-GB", {
                    maximumFractionDigits: 2,
                  })}
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
  );
}

// ── App ───────────────────────────────────────────────────────────────────────

export default function EnterpriseApp() {
  const [authState, setAuthState] = useState<AuthState>("loading");
  const [enterprise, setEnterprise] = useState<Enterprise | null>(null);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [questionnaires, setQuestionnaires] = useState<Questionnaire[]>([]);
  const [scope3, setScope3] = useState<Scope3Aggregate | null>(null);
  const [enterpriseCarbonEntries, setEnterpriseCarbonEntries] = useState<
    EnterpriseCarbonEntry[]
  >([]);
  const [esrsReport, setEsrsReport] = useState<EsrsReport | null>(null);
  const [esrsGenerating, setEsrsGenerating] = useState(false);
  const [riskAssessment, setRiskAssessment] = useState<RiskAssessment | null>(
    null,
  );
  const [riskAssessing, setRiskAssessing] = useState(false);
  const [sending, setSending] = useState<string | null>(null);
  const [page, setPage] = useState<EnterprisePage>("overview");
  const [selectedQuestionnaireId, setSelectedQuestionnaireId] = useState<
    string | null
  >(null);
  const [selectedSupplierId, setSelectedSupplierId] = useState<string | null>(
    null,
  );
  const [detailRefreshKey, setDetailRefreshKey] = useState(0);
  const esrsPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const riskPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function navigate(p: EnterprisePage) {
    setPage(p);
    setSelectedQuestionnaireId(null);
    setSelectedSupplierId(null);
  }

  useEffect(() => {
    fetch("/api/enterprise/me")
      .then((r) => {
        if (r.status === 401 || r.status === 403) {
          setAuthState("unauthed");
          return null;
        }
        return r.json();
      })
      .then((data) => {
        if (data) {
          setEnterprise(data as Enterprise);
          setAuthState("authed");
        }
      });
    fetch("/api/enterprise/suppliers")
      .then((r) => (r.ok ? r.json() : []))
      .then(setSuppliers);
    fetch("/api/enterprise/questionnaires")
      .then((r) => (r.ok ? r.json() : []))
      .then(setQuestionnaires);
    fetch("/api/enterprise/scope3")
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: Scope3Aggregate[]) => {
        if (rows.length > 0) setScope3(rows[0] ?? null);
      });
    fetch("/api/enterprise/carbon")
      .then((r) => (r.ok ? r.json() : []))
      .then(setEnterpriseCarbonEntries);
    fetch("/api/enterprise/reports/esrs/latest")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) setEsrsReport(data as EsrsReport);
      });
    fetch("/api/enterprise/risk/latest")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) setRiskAssessment(data as RiskAssessment);
        else assessRisk();
      });
    return () => {
      if (esrsPollRef.current) clearInterval(esrsPollRef.current);
      if (riskPollRef.current) clearInterval(riskPollRef.current);
    };
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

  async function generateEsrsReport() {
    if (esrsGenerating) return;
    setEsrsGenerating(true);
    const triggeredAt = new Date().toISOString();
    await fetch("/api/enterprise/reports/esrs", { method: "POST" });
    if (esrsPollRef.current) clearInterval(esrsPollRef.current);
    esrsPollRef.current = setInterval(async () => {
      const r = await fetch("/api/enterprise/reports/esrs/latest");
      if (!r.ok) return;
      const data = (await r.json()) as EsrsReport;
      if (data.generatedAt > triggeredAt) {
        setEsrsReport(data);
        setEsrsGenerating(false);
        if (esrsPollRef.current) clearInterval(esrsPollRef.current);
      }
    }, 4000);
  }

  async function assessRisk() {
    if (riskAssessing) return;
    setRiskAssessing(true);
    const triggeredAt = new Date().toISOString();
    await fetch("/api/enterprise/risk/assess", { method: "POST" });
    if (riskPollRef.current) clearInterval(riskPollRef.current);
    riskPollRef.current = setInterval(async () => {
      const r = await fetch("/api/enterprise/risk/latest");
      if (!r.ok) return;
      const data = (await r.json()) as RiskAssessment;
      if (data.assessedAt > triggeredAt) {
        setRiskAssessment(data);
        setRiskAssessing(false);
        if (riskPollRef.current) clearInterval(riskPollRef.current);
      }
    }, 2000);
  }

  async function sendQuestionnaire(id: string) {
    setSending(id);
    const res = await fetch(`/api/enterprise/questionnaires/${id}/send`, {
      method: "POST",
    });
    if (res.ok) {
      const updated = await res.json();
      setQuestionnaires((prev) =>
        prev.map((q) => (q.id === id ? (updated as Questionnaire) : q)),
      );
      setDetailRefreshKey((k) => k + 1);
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
          <NavBtn
            active={page === "overview"}
            onClick={() => navigate("overview")}
          >
            <LayoutGrid className="size-3.5" />
            Overview
          </NavBtn>
          <NavBtn
            active={page === "suppliers"}
            onClick={() => navigate("suppliers")}
            badge={suppliers.length}
          >
            <Building2 className="size-3.5" />
            Suppliers
          </NavBtn>
          <NavBtn
            active={page === "questionnaires"}
            onClick={() => navigate("questionnaires")}
            badge={questionnaires.length}
          >
            <FileText className="size-3.5" />
            Questionnaires
          </NavBtn>
          <NavBtn
            active={page === "emissions"}
            onClick={() => navigate("emissions")}
          >
            <Leaf className="size-3.5" />
            Emissions
          </NavBtn>
          <NavBtn active={page === "esrs"} onClick={() => navigate("esrs")}>
            <BarChart3 className="size-3.5" />
            ESRS Report
            {esrsGenerating && (
              <Loader2 className="size-3 animate-spin text-blue-400 ml-0.5" />
            )}
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
            scope3={scope3}
            risk={riskAssessment}
            riskAssessing={riskAssessing}
            onAssess={assessRisk}
          />
        )}
        {page === "suppliers" && !selectedSupplierId && (
          <SuppliersPage
            suppliers={suppliers}
            onAdded={(s) => setSuppliers((prev) => [...prev, s])}
            onSelect={setSelectedSupplierId}
          />
        )}
        {page === "suppliers" &&
          selectedSupplierId &&
          (() => {
            const supplier = suppliers.find((s) => s.id === selectedSupplierId);
            if (!supplier) return null;
            return (
              <SupplierDetailPage
                supplier={supplier}
                questionnaires={questionnaires}
                onBack={() => setSelectedSupplierId(null)}
                onSelectQuestionnaire={(id) => {
                  setSelectedSupplierId(null);
                  setPage("questionnaires");
                  setSelectedQuestionnaireId(id);
                }}
                onSend={sendQuestionnaire}
                sending={sending}
              />
            );
          })()}
        {page === "questionnaires" && !selectedQuestionnaireId && (
          <QuestionnairesPage
            questionnaires={questionnaires}
            suppliers={suppliers}
            onCreated={(q) => setQuestionnaires((prev) => [q, ...prev])}
            onSend={sendQuestionnaire}
            onSelect={setSelectedQuestionnaireId}
            sending={sending}
          />
        )}
        {page === "questionnaires" && selectedQuestionnaireId && (
          <QuestionnaireDetailPage
            questionnaireId={selectedQuestionnaireId}
            suppliers={suppliers}
            onBack={() => setSelectedQuestionnaireId(null)}
            onSend={sendQuestionnaire}
            sending={sending}
            refreshKey={detailRefreshKey}
          />
        )}
        {page === "emissions" && (
          <EmissionsPage
            entries={enterpriseCarbonEntries}
            onAdded={(e) => setEnterpriseCarbonEntries((prev) => [...prev, e])}
          />
        )}
        {page === "esrs" && (
          <EsrsReportPage
            report={esrsReport}
            generating={esrsGenerating}
            onGenerate={generateEsrsReport}
          />
        )}
      </main>
    </div>
  );
}
