"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRequireAdmin } from "@/lib/auth-context";
import { apiFetch } from "@/lib/api";

type CompetitionSummary = {
  id: string;
  name: string;
  slug: string;
  status: string;
  registrationOpen: boolean;
  settings?: { budget?: number; squadSize?: number; leagueCode?: string };
  createdAt: string;
};

type Stats = {
  players: number;
  entries: number;
  fixtures: number;
};

const LEAGUE_LABELS: Record<string, string> = {
  PL: "Premier League", BL1: "Bundesliga", PD: "La Liga",
  SA: "Serie A", FL1: "Ligue 1", DED: "Eredivisie",
  PPL: "Primeira Liga", ELC: "Championship", BSA: "Brasileirão"
};

export default function AdminPage() {
  useRequireAdmin();
  const router = useRouter();

  const [competitions, setCompetitions] = useState<CompetitionSummary[]>([]);
  const [statsMap, setStatsMap] = useState<Record<string, Stats>>({});
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Employee roster
  const [employeeCount, setEmployeeCount] = useState<number | null>(null);
  const [showEmployeeImport, setShowEmployeeImport] = useState(false);
  const [importingEmployees, setImportingEmployees] = useState(false);
  const [clearingEmployees, setClearingEmployees] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  useEffect(() => { void load(); void loadEmployeeCount(); }, []);

  async function loadEmployeeCount() {
    try {
      const d = await apiFetch<{ total: number }>("/api/admin/employees/import");
      setEmployeeCount(d.total);
    } catch { /* silent */ }
  }

  async function handleEmployeeUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const file = fileInputRef.current?.files?.[0];
    if (!file) return;
    setImportingEmployees(true);
    setImportResult(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/admin/employees/import", {
        method: "POST",
        body: form
      });
      const data = await res.json() as { imported?: number; total?: number; error?: string };
      if (!res.ok) throw new Error((data as { error?: string }).error ?? "Import failed");
      setImportResult(`Imported ${(data.imported ?? 0).toLocaleString()} new records — ${(data.total ?? 0).toLocaleString()} total in DB`);
      setEmployeeCount(data.total ?? null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err) {
      setImportResult(err instanceof Error ? err.message : "Import failed");
    } finally {
      setImportingEmployees(false);
    }
  }

  async function clearEmployees() {
    if (!confirm(`Delete all ${employeeCount?.toLocaleString() ?? ""} employee records? Users who registered will still be able to log in, but new registrations will fail until you re-upload the roster.`)) return;
    setClearingEmployees(true);
    setImportResult(null);
    try {
      const d = await apiFetch<{ deleted: number }>("/api/admin/employees/import", { method: "DELETE" });
      setEmployeeCount(0);
      setImportResult(`Cleared ${d.deleted.toLocaleString()} employee records.`);
    } catch (err) {
      setImportResult(err instanceof Error ? err.message : "Clear failed.");
    } finally {
      setClearingEmployees(false);
    }
  }

  async function toggleLive(e: React.MouseEvent, comp: CompetitionSummary) {
    e.stopPropagation();
    setTogglingId(comp.id);
    const newStatus = comp.status === "active" ? "draft" : "active";
    try {
      await apiFetch(`/api/admin/competitions/${comp.id}`, {
        method: "PUT",
        body: { status: newStatus }
      });
      setCompetitions((prev) => prev.map((c) => c.id === comp.id ? { ...c, status: newStatus } : c));
    } catch { /* silent */ } finally {
      setTogglingId(null);
    }
  }

  async function load() {
    setLoading(true);
    try {
      const data = await apiFetch<{ competitions: CompetitionSummary[] }>("/api/admin/competitions");
      setCompetitions(data.competitions);
      const entries = await Promise.allSettled(
        data.competitions.map((c) =>
          apiFetch<{ teams: unknown[]; players: unknown[]; fixtures: unknown[]; entries: unknown[] }>(
            `/api/admin/competitions/${c.id}/overview`
          ).then((d) => [c.id, { players: d.players.length, entries: d.entries.length, fixtures: d.fixtures.length }] as const)
        )
      );
      const map: Record<string, Stats> = {};
      for (const r of entries) {
        if (r.status === "fulfilled") map[r.value[0]] = r.value[1];
      }
      setStatsMap(map);
    } catch {
      // silently fail — user sees empty state
    } finally {
      setLoading(false);
    }
  }

  async function createCompetition(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreating(true); setCreateError(null);
    const form = new FormData(event.currentTarget);
    try {
      const result = await apiFetch<{ competition: CompetitionSummary }>("/api/admin/competitions", {
        method: "POST",
        body: {
          name: form.get("name"),
          slug: (form.get("slug") as string).toLowerCase().replace(/[^a-z0-9-]/g, "-"),
          registrationOpen: true,
          budget: Number(form.get("budget") || 100),
          squadSize: Number(form.get("squadSize") || 15),
          maxPlayersPerTeam: Number(form.get("maxPlayersPerTeam") || 3)
        }
      });
      router.push(`/admin/competitions/${result.competition.id}`);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to create competition.");
      setCreating(false);
    }
  }

  return (
    <div className="page">
      <div className="page-header" style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "16px" }}>
        <div>
          <h1 className="page-title">Admin Console</h1>
          <p className="page-subtitle">Manage competitions, import data, publish scoring</p>
        </div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center", flexShrink: 0, marginTop: "6px" }}>
          <Link href="/admin/bug-reports" className="btn-outline btn-sm">🐞 Bug reports</Link>
          <button
            className="btn-outline btn-sm"
            onClick={() => { setShowEmployeeImport(!showEmployeeImport); setImportResult(null); }}
          >
            👥 {employeeCount !== null ? `${employeeCount.toLocaleString()} employees` : "Employee roster"}
          </button>
          <button className="btn" onClick={() => setShowCreate(!showCreate)}>
            {showCreate ? "Cancel" : "+ New competition"}
          </button>
        </div>
      </div>

      {/* ── Employee roster import ─────────────────────────────── */}
      {showEmployeeImport && (
        <div className="card" style={{ marginBottom: "28px" }}>
          <div className="card-title">Employee Roster</div>
          <p style={{ fontSize: "0.85rem", color: "hsl(var(--ink-muted))", marginBottom: "14px" }}>
            Upload the employee roster (.xlsx or .csv) to allow employees to self-register.
            Columns required: <strong>Employee ID</strong>, <strong>Legal Name - Last Name</strong>,
            <strong> Legal Name - First Name</strong>, <strong>Full Legal Name</strong>, <strong>Hire Date</strong>.
            Existing records are updated in place (safe to re-upload).
          </p>
          {importResult && (
            <p className={`notice ${importResult.includes("failed") || importResult.includes("error") ? "notice-error" : "notice-success"}`} style={{ marginBottom: "14px" }}>
              {importResult}
            </p>
          )}
          <form style={{ display: "flex", gap: "10px", alignItems: "flex-end" }} onSubmit={handleEmployeeUpload}>
            <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
              <label className="form-label required">Roster file (.xlsx or .csv)</label>
              <input
                ref={fileInputRef}
                className="form-input"
                type="file"
                accept=".xlsx,.xls,.csv"
                required
              />
            </div>
            <button className="btn" type="submit" disabled={importingEmployees} style={{ flexShrink: 0 }}>
              {importingEmployees ? "Importing…" : "Upload & import"}
            </button>
          </form>
          {employeeCount !== null && (
            <div style={{ marginTop: "12px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
              <p style={{ fontSize: "0.8rem", color: "hsl(var(--ink-muted))", margin: 0 }}>
                Currently {employeeCount.toLocaleString()} employees in the database.
              </p>
              {employeeCount > 0 && (
                <button
                  style={{ fontSize: "0.78rem", padding: "4px 12px", background: "none", border: "1px solid hsl(var(--danger))", color: "hsl(var(--danger))", borderRadius: 6, cursor: clearingEmployees ? "not-allowed" : "pointer", fontWeight: 700 }}
                  disabled={clearingEmployees}
                  onClick={() => void clearEmployees()}
                >
                  {clearingEmployees ? "Clearing…" : "Clear all employees"}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Create competition form ────────────────────────────── */}
      {showCreate && (
        <div className="card" style={{ marginBottom: "28px" }}>
          <div className="card-title">Create Competition</div>
          {createError && <p className="notice notice-error" style={{ marginBottom: "14px" }}>{createError}</p>}
          <form style={{ display: "grid", gap: "14px" }} onSubmit={createCompetition}>
            <div className="grid-2">
              <div className="form-group">
                <label className="form-label required">Competition name</label>
                <input className="form-input" name="name" placeholder="e.g. BGO Premier League 2025" required />
              </div>
              <div className="form-group">
                <label className="form-label required">Slug</label>
                <input
                  className="form-input" name="slug"
                  placeholder="e.g. bgo-pl-2025"
                  title="Lowercase letters, numbers and hyphens only"
                  onChange={(e) => { e.target.value = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"); }}
                  required
                />
                <span className="form-hint">Lowercase letters, numbers and hyphens only</span>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "14px" }}>
              <div className="form-group">
                <label className="form-label">Budget (credits)</label>
                <input className="form-input" name="budget" type="number" defaultValue={100} />
              </div>
              <div className="form-group">
                <label className="form-label">Squad size</label>
                <input className="form-input" name="squadSize" type="number" defaultValue={15} />
              </div>
              <div className="form-group">
                <label className="form-label">Max per team</label>
                <input className="form-input" name="maxPlayersPerTeam" type="number" defaultValue={3} />
              </div>
            </div>
            <div>
              <button className="btn" type="submit" disabled={creating}>
                {creating ? "Creating…" : "Create & go to admin"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── Competition list ──────────────────────────────────── */}
      {loading ? (
        <div className="loading-dots">Loading</div>
      ) : competitions.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: "48px 24px" }}>
          <p style={{ fontSize: "2rem", marginBottom: "12px" }}>⚽</p>
          <p className="page-subtitle" style={{ marginBottom: "20px" }}>No competitions yet. Create your first one above.</p>
          <button className="btn" onClick={() => setShowCreate(true)}>+ New competition</button>
        </div>
      ) : (
        <div style={{ display: "grid", gap: "14px" }}>
          {competitions.map((comp) => {
            const stats = statsMap[comp.id];
            const leagueCode = comp.settings?.leagueCode;
            return (
              <div
                key={comp.id}
                className="card card-hover"
                style={{ cursor: "pointer", display: "grid", gridTemplateColumns: "1fr auto", alignItems: "center", gap: "16px" }}
                onClick={() => router.push(`/admin/competitions/${comp.id}`)}
              >
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}>
                    <span style={{ fontWeight: 800, fontSize: "1.05rem" }}>{comp.name}</span>
                    <span className={`badge ${comp.status === "active" ? "badge-available" : "badge-unavailable"}`}>
                      {comp.status === "active" ? "● Live" : "Draft"}
                    </span>
                    <span className={`badge ${comp.registrationOpen ? "badge-available" : "badge-unavailable"}`} style={{ opacity: 0.7 }}>
                      {comp.registrationOpen ? "Reg. open" : "Reg. closed"}
                    </span>
                    {leagueCode && (
                      <span className="badge badge-mid">{LEAGUE_LABELS[leagueCode] ?? leagueCode}</span>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: "20px", fontSize: "0.8rem", color: "hsl(var(--ink-muted))" }}>
                    <span>/{comp.slug}</span>
                    {stats ? (
                      <>
                        <span>{stats.players} players</span>
                        <span>{stats.fixtures} fixtures</span>
                        <span>{stats.entries} entries</span>
                      </>
                    ) : (
                      <span>Loading stats…</span>
                    )}
                    {comp.settings?.budget && <span>£{comp.settings.budget} budget</span>}
                    {comp.settings?.squadSize && <span>{comp.settings.squadSize}-man squad</span>}
                  </div>
                </div>
                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  <button
                    className={`btn-sm ${comp.status === "active" ? "btn-outline" : "btn"}`}
                    style={{ minWidth: "82px" }}
                    disabled={togglingId === comp.id}
                    onClick={(e) => void toggleLive(e, comp)}
                  >
                    {togglingId === comp.id ? "…" : comp.status === "active" ? "Take offline" : "Go live"}
                  </button>
                  <button
                    className="btn-outline btn-sm"
                    onClick={(e) => { e.stopPropagation(); router.push(`/admin/competitions/${comp.id}`); }}
                  >
                    Manage →
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
