// ============================================================
// DASHBOARD — Main page: Client list with stats
// ============================================================

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Users,
  FolderOpen,
  Clock,
  TrendingUp,
  ChevronRight,
  Building2,
  Search,
  Loader2,
} from "lucide-react";
import type { Client, DashboardStats } from "../../lib/types";

export default function DashboardPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch("/api/clients")
      .then((r) => r.json())
      .then((res) => {
        if (res.success) setClients(res.data);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const stats: DashboardStats = {
    totalClients: clients.length,
    activeProjects: clients.filter((c) => c.status === "active").length,
    pendingInvoices: 0, // calculated per-client on detail page
    totalRevenue: 0,
  };

  const filtered = clients.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.companyName.toLowerCase().includes(search.toLowerCase()) ||
      c.projectTitle.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-surface">
      {/* Header */}
      <header className="border-b border-ink-100 bg-surface-raised">
        <div className="max-w-6xl mx-auto px-6 py-5 flex items-center justify-between">
          <div>
            <h1 className="font-display text-2xl text-ink-950 tracking-tight">
              Invoice Tracker
            </h1>
            <p className="text-sm text-ink-500 mt-0.5">
              Client & project management
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400" />
              <input
                type="text"
                placeholder="Search clients…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 pr-4 py-2 text-sm bg-surface border border-ink-200 rounded-lg
                           placeholder:text-ink-400 focus:outline-none focus:border-accent
                           focus:ring-2 focus:ring-accent/10 w-64 transition-all"
              />
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        {/* Stat cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
          <StatCard
            icon={<Users className="w-5 h-5" />}
            label="Total Clients"
            value={stats.totalClients}
            color="text-accent"
            bg="bg-accent/8"
          />
          <StatCard
            icon={<FolderOpen className="w-5 h-5" />}
            label="Active Projects"
            value={stats.activeProjects}
            color="text-violet-600"
            bg="bg-violet-50"
          />
          <StatCard
            icon={<Clock className="w-5 h-5" />}
            label="Pending Invoices"
            value="—"
            color="text-amber-600"
            bg="bg-amber-50"
          />
          <StatCard
            icon={<TrendingUp className="w-5 h-5" />}
            label="Revenue"
            value="—"
            color="text-emerald-600"
            bg="bg-emerald-50"
          />
        </div>

        {/* Client list */}
        <div>
          <h2 className="font-display text-lg text-ink-900 mb-4">Clients</h2>

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-6 h-6 text-ink-400 animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="card p-12 text-center">
              <p className="text-ink-400 text-sm">
                {search
                  ? "No clients match your search."
                  : "No clients yet. They'll appear here once a proposal is signed."}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map((client, i) => (
                <Link
                  key={client.id}
                  href={`/dashboard/${client.id}`}
                  className="card flex items-center justify-between px-5 py-4
                             hover:shadow-elevated hover:border-ink-200
                             transition-all duration-200 group"
                  style={{ animationDelay: `${i * 50}ms` }}
                >
                  <div className="flex items-center gap-4">
                    <div
                      className="w-10 h-10 rounded-lg bg-accent/8 flex items-center
                                    justify-center text-accent font-display text-lg"
                    >
                      {client.name.charAt(0)}
                    </div>
                    <div>
                      <p className="font-medium text-ink-900 text-sm">
                        {client.name}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <Building2 className="w-3.5 h-3.5 text-ink-400" />
                        <span className="text-xs text-ink-500">
                          {client.companyName}
                        </span>
                        <span className="text-ink-300">·</span>
                        <span className="text-xs text-ink-500">
                          {client.projectTitle}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className={
                        client.status === "active"
                          ? "badge-active"
                          : client.status === "completed"
                          ? "badge-completed"
                          : "badge-draft"
                      }
                    >
                      {client.status}
                    </span>
                    <ChevronRight className="w-4 h-4 text-ink-300 group-hover:text-ink-500 transition-colors" />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

// ---------- Stat Card ----------

function StatCard({
  icon,
  label,
  value,
  color,
  bg,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  color: string;
  bg: string;
}) {
  return (
    <div className="card px-5 py-4">
      <div className="flex items-center gap-3">
        <div className={`w-9 h-9 rounded-lg ${bg} flex items-center justify-center ${color}`}>
          {icon}
        </div>
        <div>
          <p className="text-xs text-ink-500 font-medium uppercase tracking-wide">
            {label}
          </p>
          <p className="text-xl font-display text-ink-900 mt-0.5">{value}</p>
        </div>
      </div>
    </div>
  );
}
