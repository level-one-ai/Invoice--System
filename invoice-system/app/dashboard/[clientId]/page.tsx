// ============================================================
// CLIENT DETAIL PAGE — Profile, milestones, checklist, actions
// ============================================================

"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Mail,
  Building2,
  FolderOpen,
  ChevronDown,
  ChevronUp,
  Check,
  Send,
  Loader2,
  Circle,
  CheckCircle2,
  Clock,
  CreditCard,
  Zap,
  AlertCircle,
} from "lucide-react";
import type { ClientWithMilestones, Milestone } from "@/lib/types";

export default function ClientDetailPage() {
  const params = useParams();
  const router = useRouter();
  const clientId = params.clientId as string;

  const [client, setClient] = useState<ClientWithMilestones | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedMilestone, setExpandedMilestone] = useState<string | null>(null);
  const [sendingInvoice, setSendingInvoice] = useState<string | null>(null);
  const [togglingItem, setTogglingItem] = useState<string | null>(null);
  const [activatingMaintenance, setActivatingMaintenance] = useState(false);
  const [notification, setNotification] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const fetchClient = useCallback(() => {
    fetch(`/api/clients/${clientId}`)
      .then((r) => r.json())
      .then((res) => {
        if (res.success) setClient(res.data);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [clientId]);

  useEffect(() => {
    fetchClient();
  }, [fetchClient]);

  // --- Show notification ---
  function notify(type: "success" | "error", message: string) {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 4000);
  }

  // --- Send milestone invoice ---
  async function handleSendInvoice(milestone: Milestone) {
    if (milestone.status !== "draft") return;
    setSendingInvoice(milestone.id);
    try {
      const res = await fetch("/api/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "send",
          milestoneId: milestone.id,
          clientId,
        }),
      });
      const data = await res.json();
      if (data.success) {
        notify("success", `Invoice for "${milestone.title}" sent!`);
        fetchClient();
      } else {
        notify("error", data.error || "Failed to send invoice");
      }
    } catch {
      notify("error", "Network error — please try again");
    } finally {
      setSendingInvoice(null);
    }
  }

  // --- Toggle checklist item ---
  async function handleToggleChecklist(
    milestoneId: string,
    checklistItemId: string,
    completed: boolean
  ) {
    setTogglingItem(checklistItemId);
    try {
      const res = await fetch("/api/invoices", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ milestoneId, checklistItemId, completed }),
      });
      const data = await res.json();
      if (data.success) {
        fetchClient();
      }
    } catch {
      notify("error", "Failed to update checklist");
    } finally {
      setTogglingItem(null);
    }
  }

  // --- Activate maintenance subscription ---
  async function handleActivateMaintenance() {
    setActivatingMaintenance(true);
    try {
      const res = await fetch("/api/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "activate-maintenance",
          clientId,
        }),
      });
      const data = await res.json();
      if (data.success) {
        notify("success", "Maintenance subscription activated!");
        fetchClient();
      } else {
        notify("error", data.error || "Failed to activate subscription");
      }
    } catch {
      notify("error", "Network error");
    } finally {
      setActivatingMaintenance(false);
    }
  }

  // --- Helpers ---
  function formatCurrency(amount: number, currency: string) {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency,
    }).format(amount / 100);
  }

  function getStatusBadge(status: string) {
    const map: Record<string, string> = {
      draft: "badge-draft",
      sent: "badge-sent",
      paid: "badge-paid",
      pending: "badge-pending",
      active: "badge-active",
      completed: "badge-completed",
    };
    return map[status] || "badge-draft";
  }

  const allMilestonesPaid =
    client?.milestones.every((m) => m.status === "paid") ?? false;

  if (loading) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-ink-400 animate-spin" />
      </div>
    );
  }

  if (!client) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <p className="text-ink-500">Client not found.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface">
      {/* Notification toast */}
      {notification && (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-elevated text-sm font-medium
            animate-fadeIn ${
              notification.type === "success"
                ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                : "bg-red-50 text-red-800 border border-red-200"
            }`}
        >
          {notification.message}
        </div>
      )}

      {/* Header */}
      <header className="border-b border-ink-100 bg-surface-raised">
        <div className="max-w-4xl mx-auto px-6 py-5">
          <button
            onClick={() => router.push("/dashboard")}
            className="btn-ghost -ml-3 mb-3"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to clients
          </button>

          <div className="flex items-start justify-between">
            <div>
              <h1 className="font-display text-2xl text-ink-950 tracking-tight">
                {client.name}
              </h1>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-sm text-ink-500">
                <span className="flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5" />
                  {client.email}
                </span>
                <span className="flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5" />
                  {client.companyName}
                </span>
                <span className="flex items-center gap-1.5">
                  <FolderOpen className="w-3.5 h-3.5" />
                  {client.projectTitle}
                </span>
              </div>
            </div>
            <span className={getStatusBadge(client.status)}>
              {client.status}
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8 space-y-8">
        {/* -------- Milestones section -------- */}
        <section>
          <h2 className="font-display text-lg text-ink-900 mb-4">
            Milestones & Invoices
          </h2>

          <div className="space-y-2">
            {client.milestones.map((milestone, idx) => {
              const isExpanded = expandedMilestone === milestone.id;
              const completedCount = milestone.checklist.filter(
                (c) => c.completed
              ).length;
              const totalChecklist = milestone.checklist.length;
              const progress =
                totalChecklist > 0
                  ? Math.round((completedCount / totalChecklist) * 100)
                  : 100;

              return (
                <div
                  key={milestone.id}
                  className="card overflow-hidden"
                  style={{ animationDelay: `${idx * 60}ms` }}
                >
                  {/* Milestone header (clickable to expand) */}
                  <button
                    onClick={() =>
                      setExpandedMilestone(isExpanded ? null : milestone.id)
                    }
                    className="w-full flex items-center justify-between px-5 py-4
                               hover:bg-ink-50/50 transition-colors text-left"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex-shrink-0">
                        {milestone.status === "paid" ? (
                          <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                        ) : milestone.status === "sent" ? (
                          <Clock className="w-5 h-5 text-sky-500" />
                        ) : (
                          <Circle className="w-5 h-5 text-ink-300" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-sm text-ink-900 truncate">
                          {milestone.order === 0
                            ? "Initial Deposit"
                            : `${milestone.order}. ${milestone.title}`}
                        </p>
                        <p className="text-xs text-ink-500 mt-0.5">
                          {formatCurrency(milestone.amount, milestone.currency)}
                          {totalChecklist > 0 && (
                            <>
                              {" · "}
                              {completedCount}/{totalChecklist} tasks
                            </>
                          )}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 flex-shrink-0">
                      <span className={getStatusBadge(milestone.status)}>
                        {milestone.status}
                      </span>

                      {/* Send Invoice button */}
                      {milestone.status === "draft" && milestone.order > 0 && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSendInvoice(milestone);
                          }}
                          disabled={sendingInvoice === milestone.id}
                          className="btn-primary text-xs px-3 py-1.5"
                        >
                          {sendingInvoice === milestone.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Send className="w-3.5 h-3.5" />
                          )}
                          Send Invoice
                        </button>
                      )}

                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4 text-ink-400" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-ink-400" />
                      )}
                    </div>
                  </button>

                  {/* Expanded: checklist */}
                  {isExpanded && (
                    <div className="border-t border-ink-100 px-5 py-4 animate-slideDown">
                      {milestone.description && (
                        <p className="text-sm text-ink-600 mb-4">
                          {milestone.description}
                        </p>
                      )}

                      {/* Progress bar */}
                      {totalChecklist > 0 && (
                        <div className="mb-4">
                          <div className="flex items-center justify-between text-xs text-ink-500 mb-1.5">
                            <span>Progress</span>
                            <span>{progress}%</span>
                          </div>
                          <div className="w-full h-1.5 bg-ink-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-accent rounded-full transition-all duration-500 ease-out"
                              style={{ width: `${progress}%` }}
                            />
                          </div>
                        </div>
                      )}

                      {/* Checklist items */}
                      {milestone.checklist.length > 0 ? (
                        <ul className="space-y-2">
                          {milestone.checklist.map((item) => (
                            <li
                              key={item.id}
                              className="flex items-center gap-3 group"
                            >
                              <button
                                onClick={() =>
                                  handleToggleChecklist(
                                    milestone.id,
                                    item.id,
                                    !item.completed
                                  )
                                }
                                disabled={togglingItem === item.id}
                                className={`flex-shrink-0 w-5 h-5 rounded border-2 flex items-center
                                           justify-center transition-all duration-150
                                           ${
                                             item.completed
                                               ? "bg-accent border-accent text-white"
                                               : "border-ink-300 hover:border-accent group-hover:border-ink-400"
                                           }`}
                              >
                                {togglingItem === item.id ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : item.completed ? (
                                  <Check className="w-3 h-3" />
                                ) : null}
                              </button>
                              <span
                                className={`text-sm transition-colors ${
                                  item.completed
                                    ? "text-ink-400 line-through"
                                    : "text-ink-800"
                                }`}
                              >
                                {item.label}
                              </span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-xs text-ink-400">
                          No checklist items for this milestone.
                        </p>
                      )}

                      {/* Meta info */}
                      <div className="mt-4 pt-3 border-t border-ink-100 flex flex-wrap gap-4 text-xs text-ink-500">
                        {milestone.sentAt && (
                          <span>
                            Sent:{" "}
                            {new Date(milestone.sentAt).toLocaleDateString()}
                          </span>
                        )}
                        {milestone.paidAt && (
                          <span>
                            Paid:{" "}
                            {new Date(milestone.paidAt).toLocaleDateString()}
                          </span>
                        )}
                        {milestone.invoiceUrl && (
                          <a
                            href={milestone.invoiceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-accent hover:underline"
                          >
                            View payment page →
                          </a>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* -------- Maintenance Subscription section -------- */}
        {client.maintenance && (
          <section>
            <h2 className="font-display text-lg text-ink-900 mb-4">
              Maintenance Subscription
            </h2>

            <div className="card px-5 py-5">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-violet-50 flex items-center justify-center">
                    <CreditCard className="w-5 h-5 text-violet-600" />
                  </div>
                  <div>
                    <p className="font-medium text-sm text-ink-900">
                      Monthly Maintenance
                    </p>
                    <p className="text-xs text-ink-500 mt-0.5">
                      {formatCurrency(
                        client.maintenance.amount,
                        client.maintenance.currency
                      )}{" "}
                      / month · {client.maintenance.totalMonths} months total
                    </p>
                  </div>
                </div>

                <span className={getStatusBadge(client.maintenance.status)}>
                  {client.maintenance.status}
                </span>
              </div>

              {/* Auto-activate notice */}
              {client.maintenance.status === "pending" && (
                <div className="mt-4 p-3 bg-ink-50 rounded-lg">
                  {allMilestonesPaid ? (
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-sm text-emerald-700">
                        <Zap className="w-4 h-4" />
                        All milestones paid — ready to activate!
                      </div>
                      <button
                        onClick={handleActivateMaintenance}
                        disabled={activatingMaintenance}
                        className="btn-primary text-xs px-3 py-1.5"
                      >
                        {activatingMaintenance ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Zap className="w-3.5 h-3.5" />
                        )}
                        Activate Now
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-sm text-ink-600">
                      <AlertCircle className="w-4 h-4 text-ink-400" />
                      Subscription will auto-activate once all milestones are
                      paid.
                    </div>
                  )}
                </div>
              )}

              {client.maintenance.activatedAt && (
                <p className="mt-3 text-xs text-ink-500">
                  Activated:{" "}
                  {new Date(client.maintenance.activatedAt).toLocaleDateString()}
                </p>
              )}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
