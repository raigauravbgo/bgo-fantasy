"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRequireAdmin } from "@/lib/auth-context";
import { apiFetch } from "@/lib/api";

type Report = {
  id: string;
  description: string;
  pageUrl: string | null;
  screenshotData: string | null;
  status: string;
  createdAt: string;
  user: { id: string; name: string; employeeId: string | null };
};

const STATUS_LABELS: Record<string, { label: string; class: string }> = {
  "open":        { label: "Open",        class: "badge-unavailable" },
  "in-progress": { label: "In progress", class: "badge-mid" },
  "resolved":    { label: "Resolved",    class: "badge-available" },
  "wont-fix":    { label: "Won't fix",   class: "badge-unavailable" }
};

const NEXT_STATUS: Record<string, string> = {
  "open": "in-progress",
  "in-progress": "resolved",
  "resolved": "open"
};

export default function BugReportsPage() {
  useRequireAdmin();

  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("open");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => { void load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const data = await apiFetch<{ reports: Report[] }>("/api/admin/bug-reports");
      setReports(data.reports);
    } catch { /* silent */ } finally {
      setLoading(false);
    }
  }

  async function updateStatus(report: Report, newStatus: string) {
    setUpdating(report.id);
    try {
      await apiFetch(`/api/admin/bug-reports/${report.id}`, {
        method: "PATCH",
        body: { status: newStatus }
      });
      setReports((prev) => prev.map((r) => r.id === report.id ? { ...r, status: newStatus } : r));
    } catch { /* silent */ } finally {
      setUpdating(null);
    }
  }

  function claudePrompt(report: Report) {
    return `## Bug Report #${report.id.slice(0, 8)}

**Reported by:** ${report.user.name} (${report.user.employeeId ?? report.user.id})
**Page:** ${report.pageUrl ?? "unknown"}
**Submitted:** ${new Date(report.createdAt).toLocaleString()}

### Description
${report.description}

### Task
Investigate and fix this issue in the BGO Fantasy Platform codebase (Next.js 16, TypeScript, Prisma/PostgreSQL). The working directory is \`c:\\Dev\\bgo-fantasy-platform\`.`;
  }

  async function copyPrompt(report: Report) {
    await navigator.clipboard.writeText(claudePrompt(report));
    setCopied(report.id);
    setTimeout(() => setCopied(null), 2000);
  }

  const visible = reports.filter((r) => filter === "all" || r.status === filter);
  const counts = reports.reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="page">
      <div className="page-header" style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div>
          <Link href="/admin" style={{ fontSize: "0.8rem", color: "hsl(var(--ink-muted))" }}>← All competitions</Link>
          <h1 className="page-title" style={{ marginTop: "4px" }}>Bug Reports</h1>
          <p className="page-subtitle">Issues submitted by users. Copy the prompt to fix with Claude Code.</p>
        </div>
      </div>

      {/* Filter tabs */}
      <div style={{ display: "flex", gap: "8px", marginBottom: "20px", flexWrap: "wrap" }}>
        {(["open", "in-progress", "resolved", "wont-fix", "all"] as const).map((s) => (
          <button
            key={s}
            className={filter === s ? "btn btn-sm" : "btn-outline btn-sm"}
            onClick={() => setFilter(s)}
          >
            {s === "all" ? "All" : STATUS_LABELS[s]?.label ?? s}
            {s !== "all" && counts[s] ? ` (${counts[s]})` : ""}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="loading-dots">Loading</div>
      ) : visible.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: "48px 24px" }}>
          <p style={{ fontSize: "1.5rem", marginBottom: "8px" }}>🎉</p>
          <p className="page-subtitle">No {filter === "all" ? "" : filter} reports.</p>
        </div>
      ) : (
        <div style={{ display: "grid", gap: "12px" }}>
          {visible.map((report) => {
            const statusMeta = STATUS_LABELS[report.status] ?? { label: report.status, class: "badge-mid" };
            const isExpanded = expanded === report.id;
            return (
              <div key={report.id} className="card" style={{ padding: "16px 20px" }}>
                {/* Header row */}
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px", flexWrap: "wrap" }}>
                      <span className={`badge ${statusMeta.class}`}>{statusMeta.label}</span>
                      <span style={{ fontSize: "0.8rem", color: "hsl(var(--ink-muted))" }}>
                        {report.user.name} · {new Date(report.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                      </span>
                      {report.pageUrl && (
                        <code style={{ fontSize: "0.72rem", color: "hsl(var(--ink-muted))", background: "hsl(var(--surface-2))", padding: "1px 5px", borderRadius: "4px" }}>
                          {report.pageUrl}
                        </code>
                      )}
                    </div>
                    <p style={{ fontSize: "0.9rem", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: isExpanded ? "normal" : "nowrap" }}>
                      {report.description}
                    </p>
                  </div>
                  <button
                    className="btn-ghost"
                    style={{ fontSize: "0.75rem", flexShrink: 0 }}
                    onClick={() => setExpanded(isExpanded ? null : report.id)}
                  >
                    {isExpanded ? "Collapse ▲" : "Expand ▼"}
                  </button>
                </div>

                {/* Expanded content */}
                {isExpanded && (
                  <div style={{ marginTop: "16px", display: "grid", gap: "14px" }}>
                    {report.screenshotData && (
                      <div>
                        <p style={{ fontSize: "0.75rem", color: "hsl(var(--ink-muted))", marginBottom: "6px" }}>Screenshot</p>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={report.screenshotData}
                          alt="Bug screenshot"
                          style={{ maxWidth: "100%", borderRadius: "6px", border: "1px solid hsl(var(--border))" }}
                        />
                      </div>
                    )}

                    {/* Claude Code prompt */}
                    <div>
                      <p style={{ fontSize: "0.75rem", color: "hsl(var(--ink-muted))", marginBottom: "6px" }}>Claude Code prompt</p>
                      <pre style={{
                        background: "hsl(var(--surface-2))", border: "1px solid hsl(var(--border))",
                        borderRadius: "6px", padding: "12px", fontSize: "0.75rem",
                        whiteSpace: "pre-wrap", wordBreak: "break-word", margin: 0
                      }}>
                        {claudePrompt(report)}
                      </pre>
                    </div>

                    {/* Actions */}
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                      <button
                        className="btn btn-sm"
                        onClick={() => void copyPrompt(report)}
                      >
                        {copied === report.id ? "✓ Copied!" : "📋 Copy prompt"}
                      </button>
                      {NEXT_STATUS[report.status] && (
                        <button
                          className="btn-outline btn-sm"
                          disabled={updating === report.id}
                          onClick={() => void updateStatus(report, NEXT_STATUS[report.status])}
                        >
                          {updating === report.id ? "…" : `Mark as ${NEXT_STATUS[report.status]}`}
                        </button>
                      )}
                      {report.status !== "wont-fix" && (
                        <button
                          className="btn-outline btn-sm"
                          style={{ color: "hsl(var(--ink-muted))" }}
                          disabled={updating === report.id}
                          onClick={() => void updateStatus(report, "wont-fix")}
                        >
                          Won&apos;t fix
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
