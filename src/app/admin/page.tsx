"use client";

import { type FormEvent, useEffect, useState } from "react";
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

  useEffect(() => { void load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const data = await apiFetch<{ competitions: CompetitionSummary[] }>("/api/admin/competitions");
      setCompetitions(data.competitions);
      // Load overview stats for each competition in parallel
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
          slug: form.get("slug"),
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
        <button className="btn" style={{ flexShrink: 0, marginTop: "6px" }} onClick={() => setShowCreate(!showCreate)}>
          {showCreate ? "Cancel" : "+ New competition"}
        </button>
      </div>

      {/* ── Create form ───────────────────────────────────────── */}
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
                  pattern="[a-z0-9-]+"
                  title="Lowercase letters, numbers and hyphens only"
                  required
                />
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
                    <span className={`badge ${comp.registrationOpen ? "badge-available" : "badge-unavailable"}`}>
                      {comp.registrationOpen ? "Open" : "Closed"}
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
