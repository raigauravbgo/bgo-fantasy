"use client";

import { type FormEvent, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useRequireAdmin } from "@/lib/auth-context";
import { apiFetch } from "@/lib/api";

type AdminPlayer = {
  id: string;
  name: string;
  position: "GK" | "DEF" | "MID" | "FWD";
  teamShortName?: string;
  price: number;
  status: string;
  totalPoints?: number;
};

type PlayerPoints = { playerId: string; points: number };
type AdminEntry = { id: string; userId: string; name: string; budgetUsed: number; locked: boolean; playerIds: string[] };
type AdminUser = { id: string; name: string; email: string; role: string };

type AdminFixture = {
  id: string;
  team1Name?: string;
  team2Name?: string;
  status: string;
  startTime: string;
  score?: { team1?: number; team2?: number };
};

type OverviewData = {
  competition: { id: string; name: string; slug: string; registrationOpen: boolean; settings?: { budget?: number; squadSize?: number; maxPlayersPerTeam?: number } };
  teams: unknown[];
  players: AdminPlayer[];
  fixtures: AdminFixture[];
  entries: AdminEntry[];
  announcements: unknown[];
  auditLogs: { action: string; createdAt: string }[];
  playerPoints: PlayerPoints[];
  entryPoints: { fixtureId: string; entryId: string; points: number }[];
  users: AdminUser[];
};

const SAMPLE_TEAMS = [
  { name: "Argentina", shortName: "ARG", countryCode: "AR" },
  { name: "Brazil", shortName: "BRA", countryCode: "BR" },
  { name: "France", shortName: "FRA", countryCode: "FR" },
  { name: "England", shortName: "ENG", countryCode: "GB" },
  { name: "Spain", shortName: "ESP", countryCode: "ES" }
];

const SAMPLE_PLAYERS = [
  { name: "Emiliano Martinez", teamShortName: "ARG", position: "GK", price: 8, status: "available" },
  { name: "Nahuel Molina", teamShortName: "ARG", position: "DEF", price: 8, status: "available" },
  { name: "Nicolas Otamendi", teamShortName: "ARG", position: "DEF", price: 8, status: "available" },
  { name: "Marquinhos", teamShortName: "BRA", position: "DEF", price: 8, status: "available" },
  { name: "Casemiro", teamShortName: "BRA", position: "MID", price: 9, status: "available" },
  { name: "Bruno Guimaraes", teamShortName: "BRA", position: "MID", price: 9, status: "available" },
  { name: "Antoine Griezmann", teamShortName: "FRA", position: "MID", price: 9, status: "available" },
  { name: "Jude Bellingham", teamShortName: "ENG", position: "MID", price: 10, status: "available" },
  { name: "Kylian Mbappe", teamShortName: "FRA", position: "FWD", price: 12, status: "available" },
  { name: "Harry Kane", teamShortName: "ENG", position: "FWD", price: 11, status: "available" },
  { name: "Alvaro Morata", teamShortName: "ESP", position: "FWD", price: 8, status: "available" },
  { name: "Unai Simon", teamShortName: "ESP", position: "GK", price: 7, status: "available" },
  { name: "John Stones", teamShortName: "ENG", position: "DEF", price: 8, status: "available" },
  { name: "Rodri", teamShortName: "ESP", position: "MID", price: 10, status: "available" },
  { name: "Vinicius Junior", teamShortName: "BRA", position: "FWD", price: 11, status: "available" }
];

const SAMPLE_FIXTURES = [
  { team1ShortName: "ARG", team2ShortName: "BRA", startTime: new Date(Date.now() + 86_400_000).toISOString(), venue: "BGO Arena" },
  { team1ShortName: "FRA", team2ShortName: "ENG", startTime: new Date(Date.now() + 172_800_000).toISOString(), venue: "Client Cup Ground" }
];

const ALL_STATUSES = ["available", "doubtful", "injured", "suspended", "unavailable"] as const;
const ALL_POSITIONS = ["GK", "DEF", "MID", "FWD"] as const;

const LEAGUE_OPTIONS = [
  { value: "PL",  label: "🏴󠁧󠁢󠁥󠁮󠁧󠁿 Premier League (England)" },
  { value: "BL1", label: "🇩🇪 Bundesliga (Germany)" },
  { value: "PD",  label: "🇪🇸 La Liga (Spain)" },
  { value: "SA",  label: "🇮🇹 Serie A (Italy)" },
  { value: "FL1", label: "🇫🇷 Ligue 1 (France)" },
  { value: "DED", label: "🇳🇱 Eredivisie (Netherlands)" },
  { value: "PPL", label: "🇵🇹 Primeira Liga (Portugal)" },
  { value: "ELC", label: "🏴󠁧󠁢󠁥󠁮󠁧󠁿 Championship (England)" },
  { value: "BSA", label: "🇧🇷 Brasileirão (Brazil)" },
];

function fixtureLabel(f: AdminFixture): string {
  const date = new Date(f.startTime);
  const dateStr = date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  const status = f.status === "completed" ? " ✓" : f.status === "live" ? " 🔴" : "";
  const score = f.status === "completed" && f.score != null
    ? ` (${f.score.team1 ?? "?"}–${f.score.team2 ?? "?"})`
    : "";
  return `${f.team1Name ?? "?"} vs ${f.team2Name ?? "?"} · ${dateStr}${score}${status}`;
}

export default function CompetitionAdminPage() {
  useRequireAdmin();
  const params = useParams();
  const router = useRouter();
  const competitionId = params.id as string;

  const [tab, setTab] = useState<"overview" | "competition" | "players" | "scoring" | "transfers" | "announcements">("overview");
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ type: "ok" | "err"; msg: string } | null>(null);
  const [fixtures, setFixtures] = useState<AdminFixture[]>([]);
  const [selectedFixtureId, setSelectedFixtureId] = useState("");
  const [team1Score, setTeam1Score] = useState(0);
  const [team2Score, setTeam2Score] = useState(0);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvFixtureId, setCsvFixtureId] = useState("");
  const [plImporting, setPlImporting] = useState(false);
  const [plResult, setPlResult] = useState<string | null>(null);
  const [selectedLeague, setSelectedLeague] = useState("PL");
  const [editingPlayerId, setEditingPlayerId] = useState<string | null>(null);
  const [editPrice, setEditPrice] = useState(0);
  const [editPosition, setEditPosition] = useState<typeof ALL_POSITIONS[number]>("MID");
  const [editStatus, setEditStatus] = useState<typeof ALL_STATUSES[number]>("available");

  useEffect(() => {
    void loadOverview();
  }, [competitionId]);

  async function loadOverview() {
    setLoading(true);
    try {
      const d = await apiFetch<OverviewData>(`/api/admin/competitions/${competitionId}/overview`);
      const ptsByPlayer: Record<string, number> = {};
      for (const pp of d.playerPoints ?? []) {
        ptsByPlayer[pp.playerId] = (ptsByPlayer[pp.playerId] ?? 0) + pp.points;
      }
      d.players = d.players.map((p) => ({ ...p, totalPoints: ptsByPlayer[p.id] ?? 0 }));
      setData(d);
      setFixtures(d.fixtures);
      if (!selectedFixtureId && d.fixtures[0]) setSelectedFixtureId(d.fixtures[0].id);
    } catch (err) {
      setNotice({ type: "err", msg: err instanceof Error ? err.message : "Failed to load." });
    } finally {
      setLoading(false);
    }
  }

  function exportSquadsCsv() {
    if (!data) return;
    const userMap = new Map(data.users.map((u) => [u.id, u]));
    const header = "Squad Name,User Name,Email,Players,Budget Used,Locked\n";
    const body = data.entries.map((e) => {
      const u = userMap.get(e.userId);
      return `"${e.name.replace(/"/g, '""')}","${(u?.name ?? "").replace(/"/g, '""')}","${u?.email ?? ""}",${e.playerIds.length},${e.budgetUsed},${e.locked ? "Yes" : "No"}`;
    }).join("\n");
    const blob = new Blob([header + body], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `squads-${data.competition.slug}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  function showNotice(msg: string, type: "ok" | "err" = "ok") {
    setNotice({ type, msg });
    setTimeout(() => setNotice(null), 6000);
  }

  async function run(label: string, fn: () => Promise<void>) {
    setNotice(null); setRunning(label);
    try {
      await fn();
      showNotice(`${label} — done.`);
      void loadOverview();
    } catch (err) {
      showNotice(err instanceof Error ? err.message : `${label} failed.`, "err");
    } finally {
      setRunning(null);
    }
  }

  async function updateCompetition(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await run("Competition updated", async () => {
      await apiFetch(`/api/admin/competitions/${competitionId}`, {
        method: "PUT",
        body: {
          name: form.get("name"),
          slug: form.get("slug"),
          registrationOpen: form.get("registrationOpen") === "true",
          budget: Number(form.get("budget") || 100),
          squadSize: Number(form.get("squadSize") || 15),
          maxPlayersPerTeam: Number(form.get("maxPlayersPerTeam") || 3)
        }
      });
    });
  }

  async function importLeague() {
    setPlImporting(true); setPlResult(null);
    try {
      const result = await apiFetch<{ leagueName: string; imported: { teams: number; players: number; fixtures: number } }>(
        `/api/admin/competitions/${competitionId}/import-league`,
        { method: "POST", body: { leagueCode: selectedLeague } }
      );
      setPlResult(`${result.leagueName} — ${result.imported.teams} teams, ${result.imported.players} players, ${result.imported.fixtures} fixtures.`);
      void loadOverview();
    } catch (err) {
      setPlResult(err instanceof Error ? err.message : "Import failed.");
    } finally {
      setPlImporting(false);
    }
  }

  async function seedSquads() {
    await run("Dummy squads seeded", async () => {
      const result = await apiFetch<{ created: string[]; password: string }>(
        "/api/admin/seed-squads",
        { method: "POST", body: { competitionId } }
      );
      showNotice(`Created: ${result.created.join(", ")} — password: ${result.password}`);
    });
  }

  async function importSampleData() {
    await run("Sample data imported", async () => {
      await apiFetch(`/api/admin/competitions/${competitionId}/teams/import`, { method: "POST", body: { items: SAMPLE_TEAMS } });
      await apiFetch(`/api/admin/competitions/${competitionId}/players/import`, { method: "POST", body: { items: SAMPLE_PLAYERS } });
      await apiFetch(`/api/admin/competitions/${competitionId}/fixtures/import`, { method: "POST", body: { items: SAMPLE_FIXTURES } });
    });
  }

  async function fetchLiveStats() {
    const fixtureId = selectedFixtureId || fixtures[0]?.id;
    if (!fixtureId) { showNotice("Select a fixture first.", "err"); return; }
    await run("Live stats fetched from API-Football", async () => {
      const result = await apiFetch<{ afFixtureId: number; mapped: number; unmapped: number; unmappedNames: string[]; score: { home: number; away: number } }>(
        `/api/admin/fixtures/${fixtureId}/stats/fetch-live`,
        { method: "POST" }
      );
      const msg = `Mapped ${result.mapped} players. Score: ${result.score.home}–${result.score.away}.` +
        (result.unmapped > 0 ? ` ${result.unmapped} unmapped: ${result.unmappedNames.slice(0, 5).join(", ")}` : "");
      showNotice(msg);
    });
  }

  async function openPrediction() {
    const fixtureId = selectedFixtureId || fixtures[0]?.id;
    if (!fixtureId) { showNotice("Select a fixture first.", "err"); return; }
    await run("Prediction opened", () =>
      apiFetch(`/api/admin/fixtures/${fixtureId}/predictions/match-winner`, { method: "POST" })
    );
  }

  async function publishScoring() {
    const fixtureId = selectedFixtureId || fixtures[0]?.id;
    if (!fixtureId) { showNotice("Select a fixture first.", "err"); return; }
    await run("Scoring published", async () => {
      if (!data?.competition.slug) return;
      const players = await apiFetch<{ players: { id: string; position: string; price: number }[] }>(
        `/api/competitions/${data.competition.slug}/players`
      );
      const entries = data.entries ?? [];
      const ownerCount: Record<string, number> = {};
      for (const e of entries) for (const id of e.playerIds) ownerCount[id] = (ownerCount[id] ?? 0) + 1;

      const pool = entries.length > 0
        ? [...players.players].filter((p) => ownerCount[p.id]).sort((a, b) => (ownerCount[b.id] ?? 0) - (ownerCount[a.id] ?? 0)).slice(0, 44)
        : [...players.players].sort((a, b) => b.price - a.price).slice(0, 22);

      const statItems = pool.map((p, i) => ({
        playerId: p.id, started: true, minutesPlayed: i < 22 ? 90 : 60,
        goals: p.position === "FWD" && i < 6 ? (i === 0 ? 2 : 1) : p.position === "MID" && i < 4 ? 1 : 0,
        assists: p.position === "MID" && i >= 4 && i < 8 ? 1 : p.position === "DEF" && i < 3 ? 1 : 0,
        cleanSheet: (p.position === "GK" || p.position === "DEF") && i < 10,
        goalsConceded: (p.position === "GK" || p.position === "DEF") && i >= 10 ? 1 : undefined,
        saves: p.position === "GK" ? 4 : 0, yellowCards: i === 15 ? 1 : 0, redCards: 0
      }));
      await apiFetch(`/api/admin/fixtures/${fixtureId}/stats/import`, { method: "POST", body: { items: statItems } });
      await apiFetch(`/api/admin/fixtures/${fixtureId}/stats/publish`, { method: "POST", body: { score: { team1: team1Score, team2: team2Score } } });
    });
  }

  async function importStatsCsv() {
    const fixtureId = csvFixtureId || selectedFixtureId;
    if (!fixtureId) { showNotice("Select a fixture first.", "err"); return; }
    if (!csvFile) { showNotice("Select a CSV file first.", "err"); return; }
    const text = await csvFile.text();
    await run("Stats imported from CSV", async () => {
      const result = await apiFetch<{ unmapped?: string[] }>(
        `/api/admin/fixtures/${fixtureId}/stats/import`,
        { method: "POST", body: { csv: text } }
      );
      if (result.unmapped?.length) showNotice(`Imported with ${result.unmapped.length} unmapped player(s): ${result.unmapped.join(", ")}`, "err");
      setCsvFile(null);
    });
  }

  async function recalculateAll() {
    await run("Competition recalculated", () =>
      apiFetch(`/api/admin/competitions/${competitionId}/recalculate`, { method: "POST" })
    );
  }

  async function savePlayerEdit() {
    if (!editingPlayerId) return;
    await run("Player updated", async () => {
      await apiFetch(`/api/admin/players/${editingPlayerId}`, {
        method: "PATCH",
        body: { price: editPrice, position: editPosition, status: editStatus }
      });
      setEditingPlayerId(null);
    });
  }

  async function createAnnouncement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await run("Announcement created", () =>
      apiFetch(`/api/admin/competitions/${competitionId}/announcements`, {
        method: "POST",
        body: {
          title: (form.get("title") as string) || undefined,
          message: form.get("message"),
          icon: (form.get("icon") as string) || undefined,
          priority: form.get("priority") || "normal"
        }
      })
    );
    (event.target as HTMLFormElement).reset();
  }

  async function setTransferWindow(active: boolean) {
    await run(`Transfer window ${active ? "opened" : "closed"}`, () =>
      apiFetch(`/api/admin/competitions/${competitionId}/transfer-window`, {
        method: "POST",
        body: { active, maxTransfers: 3 }
      })
    );
  }

  const TABS = ["overview", "competition", "players", "scoring", "transfers", "announcements"] as const;

  return (
    <div className="page">
      <div className="page-header" style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "16px" }}>
        <div>
          <div style={{ marginBottom: "6px" }}>
            <button className="btn-ghost btn-sm" onClick={() => router.push("/admin")} style={{ padding: "4px 8px", fontSize: "0.78rem" }}>
              ← All competitions
            </button>
          </div>
          <h1 className="page-title">{data?.competition.name ?? "Loading…"}</h1>
          <p className="page-subtitle">Competition admin · {competitionId}</p>
        </div>
        {data && (
          <div style={{ display: "flex", gap: "8px", flexShrink: 0, paddingTop: "28px" }}>
            <span className={`badge ${data.competition.registrationOpen ? "badge-available" : "badge-unavailable"}`}>
              {data.competition.registrationOpen ? "Registration open" : "Registration closed"}
            </span>
          </div>
        )}
      </div>

      {running ? (
        <div className="notice" style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span className="loading-dots" style={{ fontSize: "0.85rem" }}>{running}</span>
        </div>
      ) : notice ? (
        <p className={`notice ${notice.type === "err" ? "notice-error" : ""}`}>{notice.msg}</p>
      ) : null}

      <div className="admin-tabs">
        {TABS.map((t) => (
          <button key={t} className={`admin-tab ${tab === t ? "active" : ""}`} onClick={() => setTab(t)}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
            {t === "players" && data ? ` (${data.players.length})` : ""}
            {t === "overview" && data ? ` · ${data.entries.length} entries` : ""}
          </button>
        ))}
      </div>

      {/* ── Overview ─────────────────────────────────────────── */}
      {tab === "overview" && (
        loading ? <div className="loading-dots">Loading</div> : data ? (
          <>
            <div className="stat-tiles">
              <div className="stat-tile"><div className="stat-label">Teams</div><div className="stat-value">{data.teams.length}</div></div>
              <div className="stat-tile"><div className="stat-label">Players</div><div className="stat-value">{data.players.length}</div></div>
              <div className="stat-tile"><div className="stat-label">Fixtures</div><div className="stat-value">{data.fixtures.length}</div></div>
              <div className="stat-tile"><div className="stat-label">Entries</div><div className="stat-value">{data.entries.length}</div></div>
              <div className="stat-tile"><div className="stat-label">Announcements</div><div className="stat-value">{data.announcements.length}</div></div>
            </div>
            {data.entries.length > 0 && (
              <div style={{ marginBottom: "20px" }}>
                <button className="btn-outline btn-sm" onClick={exportSquadsCsv}>Export squads CSV</button>
              </div>
            )}
            <div className="section-title">Fixture Scoring Status</div>
            {data.fixtures.length === 0 ? (
              <p className="card-muted" style={{ marginBottom: "24px" }}>No fixtures imported yet.</p>
            ) : (() => {
              const scoredFixtureIds = new Set(data.entryPoints?.map((ep) => ep.fixtureId) ?? []);
              const completed = data.fixtures.filter((f) => f.status === "completed");
              const upcoming = data.fixtures.filter((f) => f.status !== "completed");
              return (
                <div style={{ marginBottom: "28px" }}>
                  <div style={{ display: "flex", gap: "12px", marginBottom: "10px", fontSize: "0.8rem" }}>
                    <span style={{ color: "hsl(var(--ok))" }}>● Scored</span>
                    <span style={{ color: "hsl(var(--warn))" }}>● Completed, not scored</span>
                    <span style={{ color: "hsl(var(--ink-muted))" }}>● Upcoming</span>
                  </div>
                  <div className="card" style={{ padding: 0, overflow: "hidden" }}>
                    <table className="lb-table">
                      <thead>
                        <tr>
                          <th>Fixture</th>
                          <th>Date</th>
                          <th>Score</th>
                          <th style={{ textAlign: "right" }}>Scoring</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...completed, ...upcoming].slice(0, 20).map((f) => {
                          const isScored = scoredFixtureIds.has(f.id);
                          const isCompleted = f.status === "completed";
                          return (
                            <tr key={f.id}>
                              <td style={{ fontWeight: 600 }}>{f.team1Name ?? "?"} vs {f.team2Name ?? "?"}</td>
                              <td style={{ fontSize: "0.82rem", color: "hsl(var(--ink-muted))" }}>
                                {new Date(f.startTime).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                              </td>
                              <td style={{ fontSize: "0.85rem" }}>
                                {isCompleted && f.score != null
                                  ? `${f.score.team1 ?? "?"}–${f.score.team2 ?? "?"}`
                                  : isCompleted ? "—" : <span style={{ color: "hsl(var(--ink-muted))" }}>upcoming</span>}
                              </td>
                              <td style={{ textAlign: "right" }}>
                                {isScored
                                  ? <span className="badge badge-available">Scored</span>
                                  : isCompleted
                                    ? <span className="badge badge-doubtful">Not scored</span>
                                    : <span className="badge badge-upcoming">Upcoming</span>}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  {data.fixtures.length > 20 && (
                    <p style={{ fontSize: "0.78rem", color: "hsl(var(--ink-muted))", marginTop: "6px" }}>
                      Showing 20 of {data.fixtures.length} fixtures (completed first)
                    </p>
                  )}
                </div>
              );
            })()}

            <div className="section-title">Recent Audit Log</div>
            {data.auditLogs.length === 0 ? (
              <p className="card-muted">No audit events yet.</p>
            ) : (
              <div className="card" style={{ padding: 0, overflow: "hidden" }}>
                <table className="lb-table">
                  <thead><tr><th>Action</th><th style={{ textAlign: "right" }}>Time</th></tr></thead>
                  <tbody>
                    {data.auditLogs.slice(0, 15).map((log, i) => (
                      <tr key={i}>
                        <td><code style={{ fontSize: "0.8rem" }}>{log.action}</code></td>
                        <td style={{ textAlign: "right", fontSize: "0.8rem" }}>{new Date(log.createdAt).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        ) : <p className="empty-state">Failed to load competition data.</p>
      )}

      {/* ── Competition settings ──────────────────────────────── */}
      {tab === "competition" && (
        <div className="stack">
          <div className="card">
            <div className="card-title">Competition Settings</div>
            <form key={data?.competition.id} style={{ display: "grid", gap: "14px" }} onSubmit={updateCompetition}>
              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label required">Competition name</label>
                  <input className="form-input" name="name" defaultValue={data?.competition.name ?? ""} required />
                </div>
                <div className="form-group">
                  <label className="form-label required">Slug</label>
                  <input className="form-input" name="slug" defaultValue={data?.competition.slug ?? ""} required />
                </div>
              </div>
              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">Budget (credits)</label>
                  <input className="form-input" name="budget" type="number" defaultValue={data?.competition.settings?.budget ?? 100} />
                </div>
                <div className="form-group">
                  <label className="form-label">Squad size</label>
                  <input className="form-input" name="squadSize" type="number" defaultValue={data?.competition.settings?.squadSize ?? 15} />
                </div>
              </div>
              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">Max players per team</label>
                  <input className="form-input" name="maxPlayersPerTeam" type="number" defaultValue={data?.competition.settings?.maxPlayersPerTeam ?? 3} />
                </div>
                <div className="form-group">
                  <label className="form-label">Registration</label>
                  <select className="form-input" name="registrationOpen" defaultValue={data?.competition.registrationOpen !== false ? "true" : "false"}>
                    <option value="true">Open</option>
                    <option value="false">Closed</option>
                  </select>
                </div>
              </div>
              <div><button className="btn" type="submit">Save changes</button></div>
            </form>
          </div>

          <div className="card">
            <div className="card-title">Import League Data</div>
            <p className="card-muted" style={{ marginBottom: "14px" }}>
              Pulls teams, squads, and fixtures from football-data.org. Safe to re-run — existing records are updated, not duplicated.
            </p>
            <div style={{ display: "flex", gap: "10px", alignItems: "flex-end", flexWrap: "wrap" }}>
              <div className="form-group" style={{ flex: "1", minWidth: "200px", marginBottom: 0 }}>
                <label className="form-label">League</label>
                <select className="form-input" value={selectedLeague} onChange={(e) => { setSelectedLeague(e.target.value); setPlResult(null); }}>
                  {LEAGUE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <button className="btn" onClick={importLeague} disabled={plImporting}>
                {plImporting ? "Importing…" : "Import"}
              </button>
            </div>
            {plResult && (
              <p className={`notice ${plResult.includes("teams") ? "" : "notice-error"}`} style={{ marginTop: "12px" }}>{plResult}</p>
            )}
          </div>

          <div className="card">
            <div className="card-title">
              Development Tools
              <span style={{ marginLeft: "8px", fontSize: "0.7rem", background: "var(--warn-bg)", color: "var(--warn)", border: "1px solid var(--warn)", borderRadius: "4px", padding: "1px 6px", fontWeight: 700 }}>
                DEV ONLY
              </span>
            </div>
            <p className="card-muted" style={{ marginBottom: "14px" }}>
              Populates sample teams, players, and fixtures. Seed squads creates 5 dummy users (password: <code>password123</code>).
            </p>
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              <button className="btn-outline" onClick={importSampleData} disabled={!!running}>Import sample roster &amp; fixtures</button>
              <button className="btn-outline" onClick={seedSquads} disabled={!!running}>Seed 5 dummy squads</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Players ──────────────────────────────────────────── */}
      {tab === "players" && (
        loading ? <div className="loading-dots">Loading</div> :
        !data || data.players.length === 0 ? (
          <p className="empty-state">No players yet. Import a roster from the Competition tab.</p>
        ) : (
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            <table className="lb-table">
              <thead>
                <tr><th>Player</th><th>Pos</th><th>Team</th><th>Status</th><th style={{ textAlign: "right" }}>Price</th><th style={{ textAlign: "right" }}>Pts</th><th /></tr>
              </thead>
              <tbody>
                {data.players.map((player) =>
                  editingPlayerId === player.id ? (
                    <tr key={player.id}>
                      <td style={{ fontWeight: 700 }}>{player.name}</td>
                      <td>
                        <select className="form-input" style={{ minHeight: 0, padding: "3px 6px", fontSize: "0.8rem" }} value={editPosition} onChange={(e) => setEditPosition(e.target.value as typeof ALL_POSITIONS[number])}>
                          {ALL_POSITIONS.map((p) => <option key={p} value={p}>{p}</option>)}
                        </select>
                      </td>
                      <td style={{ fontSize: "0.85rem" }}>{player.teamShortName ?? "—"}</td>
                      <td>
                        <select className="form-input" style={{ minHeight: 0, padding: "3px 6px", fontSize: "0.8rem" }} value={editStatus} onChange={(e) => setEditStatus(e.target.value as typeof ALL_STATUSES[number])}>
                          {ALL_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <input className="form-input" style={{ minHeight: 0, padding: "3px 6px", fontSize: "0.8rem", width: "60px", textAlign: "right" }} type="number" min={1} step={0.5} value={editPrice} onChange={(e) => setEditPrice(Number(e.target.value))} />
                      </td>
                      <td style={{ textAlign: "right" }}>{player.totalPoints ?? 0}</td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        <button className="btn btn-sm" onClick={savePlayerEdit} style={{ marginRight: "6px" }}>Save</button>
                        <button className="btn-outline btn-sm" onClick={() => setEditingPlayerId(null)}>Cancel</button>
                      </td>
                    </tr>
                  ) : (
                    <tr key={player.id}>
                      <td style={{ fontWeight: 700 }}>{player.name}</td>
                      <td><span className={`badge badge-${player.position.toLowerCase()}`}>{player.position}</span></td>
                      <td style={{ fontSize: "0.85rem" }}>{player.teamShortName ?? "—"}</td>
                      <td><span className={`badge badge-${player.status}`}>{player.status}</span></td>
                      <td style={{ textAlign: "right", fontWeight: 700 }}>£{player.price}</td>
                      <td style={{ textAlign: "right" }}>{player.totalPoints ?? 0}</td>
                      <td>
                        <button className="btn-outline btn-sm" onClick={() => { setEditingPlayerId(player.id); setEditPrice(player.price); setEditPosition(player.position); setEditStatus(player.status as typeof ALL_STATUSES[number]); }}>Edit</button>
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>
        )
      )}

      {/* ── Scoring ──────────────────────────────────────────── */}
      {tab === "scoring" && (
        <div className="stack">
          <div className="card">
            <div className="card-title">Publish Match Scoring</div>
            <div style={{ display: "grid", gap: "14px" }}>
              <div className="form-group">
                <label className="form-label">Fixture</label>
                <select className="form-input" value={selectedFixtureId} onChange={(e) => setSelectedFixtureId(e.target.value)}>
                  {fixtures.length === 0 ? <option value="">No fixtures — import first</option> :
                    fixtures.map((f) => <option key={f.id} value={f.id}>{fixtureLabel(f)}</option>)}
                </select>
              </div>
              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">Team 1 goals</label>
                  <input className="form-input" type="number" min={0} value={team1Score} onChange={(e) => setTeam1Score(Number(e.target.value))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Team 2 goals</label>
                  <input className="form-input" type="number" min={0} value={team2Score} onChange={(e) => setTeam2Score(Number(e.target.value))} />
                </div>
              </div>
              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                <button className="btn-outline" onClick={openPrediction} disabled={!!running}>Open match-winner prediction</button>
                <button className="btn" onClick={fetchLiveStats} disabled={!!running}>{running ? "Running…" : "⚡ Fetch real stats (API-Football)"}</button>
                <button className="btn-outline" onClick={publishScoring} disabled={!!running}>{running ? "Running…" : "Import & publish dummy scoring"}</button>
              </div>
              <p className="form-hint">
                <strong>Fetch real stats</strong> pulls live player data from API-Football (goals, assists, cards, saves, minutes) and imports automatically.
                After fetching, click Publish below to calculate and publish points.
                <br />Dummy scoring generates fake stats for testing only.
              </p>
              <div style={{ marginTop: "10px" }}>
                <button className="btn btn-sm" onClick={async () => {
                  const fixtureId = selectedFixtureId || fixtures[0]?.id;
                  if (!fixtureId) { showNotice("Select a fixture first.", "err"); return; }
                  await run("Scoring published", () =>
                    apiFetch(`/api/admin/fixtures/${fixtureId}/stats/publish`, {
                      method: "POST",
                      body: { score: { team1: team1Score, team2: team2Score } }
                    })
                  );
                }} disabled={!!running}>
                  Publish points from imported stats
                </button>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-title">Import Stats from CSV</div>
            <p style={{ fontSize: "0.875rem", marginBottom: "14px" }}>
              Upload a CSV with columns: <code>name</code>, <code>goals</code>, <code>assists</code>, <code>minutesPlayed</code>, <code>cleanSheet</code>, <code>saves</code>, <code>yellowCards</code>, <code>redCards</code>.
            </p>
            <div style={{ display: "grid", gap: "14px" }}>
              <div className="form-group">
                <label className="form-label">Fixture</label>
                <select className="form-input" value={csvFixtureId || selectedFixtureId} onChange={(e) => setCsvFixtureId(e.target.value)}>
                  {fixtures.length === 0 ? <option value="">No fixtures</option> :
                    fixtures.map((f) => <option key={f.id} value={f.id}>{fixtureLabel(f)}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">CSV file</label>
                <input className="form-input" type="file" accept=".csv,text/csv" onChange={(e) => setCsvFile(e.target.files?.[0] ?? null)} style={{ cursor: "pointer" }} />
              </div>
              <div><button className="btn" onClick={importStatsCsv} disabled={!csvFile}>Import CSV stats</button></div>
            </div>
          </div>

          <div className="card">
            <div className="card-title">Recalculate All</div>
            <p style={{ fontSize: "0.875rem", marginBottom: "14px" }}>
              Re-runs scoring for every completed fixture. Safe to run multiple times — existing points are replaced, not doubled.
            </p>
            <button className="btn" onClick={recalculateAll} disabled={!!running}>{running ? "Running…" : "Recalculate full competition"}</button>
          </div>
        </div>
      )}

      {/* ── Transfers ────────────────────────────────────────── */}
      {tab === "transfers" && (
        <div className="card" style={{ maxWidth: 480 }}>
          <div className="card-title">Transfer Window</div>
          <p style={{ marginBottom: "16px", fontSize: "0.875rem" }}>
            Opening a transfer window lets locked players make squad changes (up to 3 per window).
          </p>
          <div style={{ display: "flex", gap: "10px" }}>
            <button className="btn" onClick={() => setTransferWindow(true)}>Open window (3 transfers)</button>
            <button className="btn-outline" style={{ borderColor: "hsl(var(--danger))", color: "hsl(var(--danger))" }} onClick={() => setTransferWindow(false)}>Close window</button>
          </div>
        </div>
      )}

      {/* ── Announcements ────────────────────────────────────── */}
      {tab === "announcements" && (
        <div className="card" style={{ maxWidth: 560 }}>
          <div className="card-title">Create Announcement</div>
          <form style={{ display: "grid", gap: "14px" }} onSubmit={createAnnouncement}>
            <div className="grid-2">
              <div className="form-group">
                <label className="form-label">Title (optional)</label>
                <input className="form-input" name="title" placeholder="e.g. Scoring published!" />
              </div>
              <div className="form-group">
                <label className="form-label">Icon (emoji, optional)</label>
                <input className="form-input" name="icon" placeholder="e.g. ⚽" />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label required">Message</label>
              <textarea className="form-input" name="message" required rows={3} placeholder="Enter announcement text…" style={{ resize: "vertical" }} />
            </div>
            <div className="form-group">
              <label className="form-label">Priority</label>
              <select className="form-input" name="priority" defaultValue="normal">
                <option value="normal">Normal</option>
                <option value="high">High (highlighted)</option>
              </select>
            </div>
            <div><button className="btn" type="submit">Post announcement</button></div>
          </form>
        </div>
      )}
    </div>
  );
}
