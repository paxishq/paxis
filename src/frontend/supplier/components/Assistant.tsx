import { Bot, Check, Loader2, Send, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/button";

// ── Types ─────────────────────────────────────────────────────────────────────

type SupplierPage =
  | "questionnaires"
  | "carbon"
  | "ai-inventory"
  | "compliance"
  | "settings";

interface PendingAction {
  type: "submit_questionnaire" | "add_carbon_entry" | "add_ai_system";
  [key: string]: unknown;
}

interface Message {
  role: "user" | "assistant";
  content: string;
  toolsUsed?: string[];
  pendingAction?: PendingAction;
  pendingDismissed?: boolean;
  pendingConfirmed?: boolean;
}

interface AssistantResponse {
  reply: string;
  toolsUsed: string[];
  pendingAction?: PendingAction;
}

// ── Pending action descriptions ───────────────────────────────────────────────

function describeAction(action: PendingAction): string {
  switch (action.type) {
    case "submit_questionnaire":
      return `Submit questionnaire response`;
    case "add_carbon_entry":
      return `Add carbon entry (${action.scope ?? "scope"}: ${action.co2Tonnes ?? "?"} tCO₂e)`;
    case "add_ai_system":
      return `Register AI system "${action.toolName ?? "?"}" as ${action.riskTier ?? "?"} risk`;
    default:
      return action.type;
  }
}

async function executeAction(action: PendingAction): Promise<boolean> {
  try {
    let res: Response;
    if (action.type === "submit_questionnaire") {
      res = await fetch(
        `/api/supplier/questionnaires/${action.questionnaireId}/respond`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ answers: action.answers ?? {}, submit: true }),
        },
      );
    } else if (action.type === "add_carbon_entry") {
      res = await fetch("/api/supplier/carbon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scope: action.scope,
          periodStart: action.periodStart,
          periodEnd: action.periodEnd,
          co2Tonnes: action.co2Tonnes,
          sourceDescription: action.sourceDescription,
        }),
      });
    } else if (action.type === "add_ai_system") {
      res = await fetch("/api/supplier/ai-inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          toolName: action.toolName,
          description: action.description,
          riskTier: action.riskTier,
          justification: action.justification,
        }),
      });
    } else {
      return false;
    }
    return res.ok;
  } catch {
    return false;
  }
}

// ── Pending action card ───────────────────────────────────────────────────────

function PendingActionCard({
  action,
  onConfirm,
  onDismiss,
  confirmed,
  dismissed,
}: {
  action: PendingAction;
  onConfirm: () => Promise<void>;
  onDismiss: () => void;
  confirmed: boolean;
  dismissed: boolean;
}) {
  const [executing, setExecuting] = useState(false);

  if (dismissed) return null;

  async function handleConfirmClick() {
    setExecuting(true);
    await onConfirm();
  }

  return (
    <div className="mt-2 rounded-lg border border-emerald-900/50 bg-emerald-950/30 px-3 py-2.5">
      <p className="text-[11px] font-medium text-emerald-400 mb-1.5">
        Proposed action
      </p>
      <p className="text-[12px] text-zinc-300 mb-2.5 leading-relaxed">
        {describeAction(action)}
      </p>
      {confirmed ? (
        <div className="flex items-center gap-1.5 text-[11px] text-emerald-500">
          <Check className="size-3" />
          Done
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleConfirmClick}
            disabled={executing}
            className="flex items-center gap-1 text-[11px] font-medium text-emerald-400 bg-emerald-950/60 hover:bg-emerald-900/50 border border-emerald-800/50 rounded px-2 py-1 transition-colors disabled:opacity-50"
          >
            {executing ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <Check className="size-3" />
            )}
            {executing ? "Confirming…" : "Confirm"}
          </button>
          <button
            type="button"
            onClick={onDismiss}
            disabled={executing}
            className="text-[11px] text-zinc-600 hover:text-zinc-400 transition-colors disabled:opacity-50"
          >
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}

// ── Assistant widget ──────────────────────────────────────────────────────────

export function Assistant({
  page,
  context,
}: {
  page: SupplierPage;
  context?: Record<string, unknown>;
}) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  function updateMessage(index: number, patch: Partial<Message>) {
    setMessages((prev) =>
      prev.map((m, i) => (i === index ? { ...m, ...patch } : m)),
    );
  }

  async function handleConfirm(index: number) {
    const msg = messages[index];
    if (!msg?.pendingAction) return;
    await executeAction(msg.pendingAction);
    updateMessage(index, { pendingConfirmed: true });
  }

  async function send() {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    setLoading(true);

    setMessages((prev) => [...prev, { role: "user", content: text }]);

    try {
      const res = await fetch("/api/supplier/assistant/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, page, context }),
      });
      const data = (await res.json()) as AssistantResponse;
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: data.reply,
          toolsUsed: data.toolsUsed,
          pendingAction: data.pendingAction,
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Sorry, I couldn't reach the server. Please try again.",
        },
      ]);
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }

  return (
    <>
      {/* Toggle button */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-5 right-5 size-12 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white flex items-center justify-center shadow-lg shadow-emerald-900/40 transition-colors z-50"
        title="Open AI assistant"
      >
        {open ? <X className="size-5" /> : <Bot className="size-5" />}
      </button>

      {/* Panel */}
      {open && (
        <div className="fixed bottom-20 right-5 w-[360px] h-[480px] rounded-xl bg-zinc-900 border border-white/[0.08] shadow-2xl flex flex-col z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.06] shrink-0">
            <Bot className="size-4 text-emerald-500" />
            <span className="text-[13px] font-semibold text-white">
              Paxis AI
            </span>
            <span className="ml-auto text-[10px] text-zinc-600 capitalize">
              {page}
            </span>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {messages.length === 0 && (
              <p className="text-[12px] text-zinc-600 text-center mt-8 leading-relaxed px-2">
                Ask me anything about your compliance data, CSRD obligations, or
                EU AI Act requirements.
              </p>
            )}
            {messages.map((msg, i) => (
              <div
                key={`msg-${i}`}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] ${msg.role === "user" ? "w-auto" : "w-full"}`}
                >
                  {msg.role === "user" ? (
                    <div className="rounded-xl px-3 py-2 text-[12px] leading-relaxed bg-emerald-600 text-white">
                      {msg.content}
                    </div>
                  ) : (
                    <div className="rounded-xl px-3 py-2 text-[12px] leading-relaxed bg-zinc-800 text-zinc-200 prose-assistant">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          p: ({ children }) => (
                            <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>
                          ),
                          ul: ({ children }) => (
                            <ul className="mb-2 last:mb-0 pl-4 space-y-0.5 list-disc">{children}</ul>
                          ),
                          ol: ({ children }) => (
                            <ol className="mb-2 last:mb-0 pl-4 space-y-0.5 list-decimal">{children}</ol>
                          ),
                          li: ({ children }) => (
                            <li className="leading-relaxed">{children}</li>
                          ),
                          strong: ({ children }) => (
                            <strong className="font-semibold text-white">{children}</strong>
                          ),
                          em: ({ children }) => (
                            <em className="italic text-zinc-300">{children}</em>
                          ),
                          code: ({ children, className }) => {
                            const isBlock = className?.includes("language-");
                            return isBlock ? (
                              <code className="block bg-zinc-900 rounded px-2 py-1.5 text-[11px] font-mono text-emerald-300 my-2 whitespace-pre-wrap overflow-x-auto">
                                {children}
                              </code>
                            ) : (
                              <code className="bg-zinc-900 rounded px-1 py-0.5 text-[11px] font-mono text-emerald-300">
                                {children}
                              </code>
                            );
                          },
                          pre: ({ children }) => (
                            <pre className="my-2">{children}</pre>
                          ),
                          h1: ({ children }) => (
                            <p className="font-semibold text-white mb-1">{children}</p>
                          ),
                          h2: ({ children }) => (
                            <p className="font-semibold text-white mb-1">{children}</p>
                          ),
                          h3: ({ children }) => (
                            <p className="font-medium text-zinc-200 mb-1">{children}</p>
                          ),
                          blockquote: ({ children }) => (
                            <blockquote className="border-l-2 border-emerald-700 pl-2 text-zinc-400 my-2">
                              {children}
                            </blockquote>
                          ),
                          a: ({ href, children }) => (
                            <a
                              href={href}
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                if (href) window.open(href, "_blank", "noreferrer");
                              }}
                              className="text-emerald-400 underline underline-offset-2 hover:text-emerald-300 cursor-pointer"
                            >
                              {children}
                            </a>
                          ),
                          hr: () => (
                            <hr className="border-zinc-700 my-2" />
                          ),
                          table: ({ children }) => (
                            <div className="overflow-x-auto my-2">
                              <table className="text-[11px] border-collapse w-full">{children}</table>
                            </div>
                          ),
                          th: ({ children }) => (
                            <th className="border border-zinc-700 px-2 py-1 text-left font-semibold text-zinc-300 bg-zinc-900">
                              {children}
                            </th>
                          ),
                          td: ({ children }) => (
                            <td className="border border-zinc-700 px-2 py-1 text-zinc-400">
                              {children}
                            </td>
                          ),
                        }}
                      >
                        {msg.content}
                      </ReactMarkdown>
                    </div>
                  )}
                  {msg.pendingAction && (
                    <PendingActionCard
                      action={msg.pendingAction}
                      confirmed={!!msg.pendingConfirmed}
                      dismissed={!!msg.pendingDismissed}
                      onConfirm={() => handleConfirm(i)}
                      onDismiss={() =>
                        updateMessage(i, { pendingDismissed: true })
                      }
                    />
                  )}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-zinc-800 rounded-xl px-3 py-2">
                  <Loader2 className="size-3.5 text-emerald-500 animate-spin" />
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="shrink-0 border-t border-white/[0.06] px-3 py-3 flex items-center gap-2">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder="Ask a compliance question…"
              className="flex-1 bg-zinc-800 border border-white/[0.07] rounded-lg px-3 py-1.5 text-[12px] text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-emerald-700/50 transition-colors"
            />
            <Button
              size="sm"
              onClick={send}
              disabled={!input.trim() || loading}
              className="h-8 w-8 p-0 bg-emerald-600 hover:bg-emerald-500 shrink-0"
            >
              <Send className="size-3.5" />
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
