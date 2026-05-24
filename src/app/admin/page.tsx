"use client";

import { type FormEvent, useEffect, useState } from "react";
import { useRequireAdmin } from "@/lib/auth-context";
import { apiFetch } from "@/lib/api";
import type { Fixture } from "@/lib/types";

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

type OverviewData = {
  competition: { id: string; name: string; slug: string; registrationOpen: boolean; settings?: { budget?: number; squadSize?: number; maxPlayersPerTeam?: number } };
  teams: unknown[];
  players: AdminPlayer[];
  fixtures: { id: string; team1Name?: string; team2Name?: string; status: string }[];
  entries: AdminEntry[];
  announcements: unknown[];
  auditLogs: { action: string; createdAt: string }[];
  playerPoints: PlayerPoints[];
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
  {
    team1ShortName: "ARG",
    team2ShortName: "BRA",
    startTime: new Date(Date.now() + 86_400_000).toISOString(),
    venue: "BGO Arena"
  },
  {
    team1ShortName: "FRA",
    team2ShortName: "ENG",
    startTime: new Date(Date.now() + 172_800_000).toISOString(),
    venue: "Client Cup Ground"
  }
];

const ALL_STATUSES = ["available", "doubtful", "injured", "suspended", "unavailable"] as const;
const ALL_POSITIONS = ["GK", "DEF", "MID", "FWD"] as const;

export default function AdminPage() {
  const { competition, refresh: refreshAuth } = useRequireAdmin();
  const [tab, setTab] = useState<"overview" | "competition" | "players" | "scoring" | "transfers" | "announcements">("overview");
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ type: "ok" | "err"; msg: string } | null>(null);
  const [fixtures, setFixtures] = useState<Fixture[]>([]);
  const [selectedFixtureId, setSelectedFixtureId] = useState("");
  const [team1Score, setTeam1Score] = useState(0);
  const [team2Score, setTeam2Score] = useState(0);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvFixtureId, setCsvFixtureId] = useState("");
  const [plImporting, setPlImporting] = useState(false);
  const [plResult, setPlResult] = useState<string | null>(null);

  // Player editing state
  const [editingPlayerId, setEditingPlayerId] = useState<string | null>(null);
  const [editPrice, setEditPrice] = useState(0);
  const [editPosition, setEditPosition] = useState<typeof ALL_POSITIONS[number]>("MID");
  const [editStatus, setEditStatus] = useState<typeof ALL_STATUSES[number]>("available");

  useEffect(() => {
    if (competition?.id) {
      void loadOverview(competition.id);
    }
  }, [competition?.id]);

  async function loadOverview(compId: string) {
    setLoading(true);
    try {
      const d = await apiFetch<OverviewData>(`/api/admin/competitions/${compId}/overview`);
      const ptsByPlayer: Record<string, number> = {};
      for (const pp of d.playerPoints ?? []) {
        ptsByPlayer[pp.playerId] = (ptsByPlayer[pp.playerId] ?? 0) + pp.points;
      }
      d.players = d.players.map((p) => ({ ...p, totalPoints: ptsByPlayer[p.id] ?? 0 }));
      setData(d);
      setFixtures(d.fixtures as Fixture[]);
      if (!selectedFixtureId && d.fixtures[0]) {
        setSelectedFixtureId(d.fixtures[0].id);
      }
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
    const body = data.entries
      .map((e) => {
        const u = userMap.get(e.userId);
        return `"${e.name.replace(/"/g, '""')}","${(u?.name ?? "").replace(/"/g, '""')}","${u?.email ?? ""}",${e.playerIds.length},${e.budgetUsed},${e.locked ? "Yes" : "No"}`;
      })
      .join("\n");
    const blob = new Blob([header + body], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `squads-${data.competition.slug}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function showNotice(msg: string, type: "ok" | "err" = "ok") {
    setNotice({ type, msg });
    setTimeout(() => setNotice(null), 6000);
  }

  async function run(label: string, fn: () => Promise<void>) {
    setNotice(null);
    setRunning(label);
    try {
      await fn();
      showNotice(`${label} — done.`);
      if (competition?.id) void loadOverview(competition.id);
    } catch (err) {
      showNotice(err instanceof Error ? err.message : `${label} failed.`, "err");
    } finally {
      setRunning(null);
    }
  }

  async function createOrUpdateCompetition(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const body = {
      name: form.get("name"),
      slug: form.get("slug"),
      registrationOpen: form.get("registrationOpen") === "true",
      budget: Number(form.get("budget") || 100),
      squadSize: Number(form.get("squadSize") || 15),
      maxPlayersPerTeam: Number(form.get("maxPlayersPerTeam") || 3)
    };

    if (competition?.id && data?.competition) {
      // Update existing
      await run("Competition updated", async () => {
        await apiFetch(`/api/admin/competitions/${competition.id}`, {
          method: "PUT",
          body
        });
        await refreshAuth();
      });
    } else {
      // Create new
      await run("Competition created", async () => {
        await apiFetch("/api/admin/competitions", { method: "POST", body });
        await refreshAuth();
      });
    }
  }

  async function importPremierLeague() {
    if (!competition?.id) { setPlResult("No competition selected — create one first."); return; }
    setPlImporting(true);
    setPlResult(null);
    try {
      const result = await apiFetch<{ imported: { teams: number; players: number; fixtures: number } }>(
        `/api/admin/competitions/${competition.id}/import-pl`,
        { method: "POST" }
      );
      setPlResult(`Done — ${result.imported.teams} teams, ${result.imported.players} players, ${result.imported.fixtures} fixtures.`);
      void loadOverview(competition.id);
    } catch (err) {
      setPlResult(err instanceof Error ? err.message : "Import failed.");
    } finally {
      setPlImporting(false);
    }
  }

  async function importSampleData() {
    if (!competition?.id || !competition.slug) return;
    await run("Sample data imported", async () => {
      await apiFetch(`/api/admin/competitions/${competition.id}/teams/import`, {
        method: "POST",
        body: { items: SAMPLE_TEAMS }
      });
      await apiFetch(`/api/admin/competitions/${competition.id}/players/import`, {
        method: "POST",
        body: { items: SAMPLE_PLAYERS }
      });
      await apiFetch(`/api/admin/competitions/${competition.id}/fixtures/import`, {
        method: "POST",
        body: { items: SAMPLE_FIXTURES }
      });
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
      if (!competition?.slug) return;
      const players = await apiFetch<{ players: { id: string; position: string }[] }>(
        `/api/competitions/${competition.slug}/players`
      );
      const statItems = players.players.slice(0, 11).map((p, i) => ({
        playerId: p.id,
        started: true,
        minutesPlayed: 90,
        goals: i === 8 ? 1 : 0,
        assists: i === 6 ? 1 : 0,
        cleanSheet: i < 4,
        goalsConceded: i < 4 ? 0 : undefined,
        saves: p.position === "GK" ? 4 : 0,
        yellowCards: 0,
        redCards: 0
      }));
      await apiFetch(`/api/admin/fixtures/${fixtureId}/stats/import`, {
        method: "POST",
        body: { items: statItems }
      });
      await apiFetch(`/api/admin/fixtures/${fixtureId}/stats/publish`, {
        method: "POST",
        body: { score: { team1: team1Score, team2: team2Score } }
      });
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
      if (result.unmapped && result.unmapped.length > 0) {
        showNotice(`Imported with ${result.unmapped.length} unmapped player(s): ${result.unmapped.join(", ")}`, "err");
      }
      setCsvFile(null);
    });
  }

  async function recalculateAll() {
    if (!competition?.id) return;
    await run("Competition recalculated", () =>
      apiFetch(`/api/admin/competitions/${competition.id}/recalculate`, { method: "POST" })
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

  function startEdit(player: AdminPlayer) {
    setEditingPlayerId(player.id);
    setEditPrice(player.price);
    setEditPosition(player.position);
    setEditStatus(player.status as typeof ALL_STATUSES[number]);
  }

  async function createAnnouncement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!competition?.id) return;
    const form = new FormData(event.currentTarget);
    await run("Announcement created", () =>
      apiFetch(`/api/admin/competitions/${competition.id}/announcements`, {
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
    if (!competition?.id) return;
    await run(`Transfer window ${active ? "opened" : "closed"}`, () =>
      apiFetch(`/api/admin/competitions/${competition.id}/transfer-window`, {
        method: "POST",
        body: { active, maxTransfers: 3 }
      })
    );
  }

  const TABS = ["overview", "competition", "players", "scoring", "transfers", "announcements"] as const;

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Admin Console</h1>
        <p className="page-subtitle">
          {competition?.name ?? "No competition selected"}
        </p>
      </div>

      {running ? (
        <div className="notice" style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span className="loading-dots" style={{ fontSize: "0.85rem" }}>{running}</span>
        </div>
      ) : notice ? (
        <p className={`notice ${notice.type === "err" ? "notice-error" : ""}`}>
          {notice.msg}
        </p>
      ) : null}

      <div className="admin-tabs">
        {TABS.map((t) => (
          <button
            key={t}
            className={`admin-tab ${tab === t ? "active" : ""}`}
            onClick={() => setTab(t)}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
            {t === "players" && data ? ` (${data.players.length})` : ""}
            {t === "overview" && data ? ` · ${data.entries.length} entries` : ""}
          </button>
        ))}
      </div>

      {/* ── Overview ─────────────────────────────────────────── */}
      {tab === "overview" && (
        loading ? <div className="loading-dots">Loading</div> :
        data ? (
          <>
            <div className="stat-tiles">
              <div className="stat-tile">
                <div className="stat-label">Teams</div>
                <div className="stat-value">{data.teams.length}</div>
              </div>
              <div className="stat-tile">
                <div className="stat-label">Players</div>
                <div className="stat-value">{data.players.length}</div>
              </div>
              <div className="stat-tile">
                <div className="stat-label">Fixtures</div>
                <div className="stat-value">{data.fixtures.length}</div>
              </div>
              <div className="stat-tile">
                <div className="stat-label">Entries</div>
                <div className="stat-value">{data.entries.length}</div>
              </div>
              <div className="stat-tile">
                <div className="stat-label">Announcements</div>
                <div className="stat-value">{data.announcements.length}</div>
              </div>
            </div>
            {data.entries.length > 0 && (
              <div style={{ marginBottom: "20px" }}>
                <button className="btn-outline btn-sm" onClick={exportSquadsCsv}>
                  Export squads CSV
                </button>
              </div>
            )}
            <div className="section-title">Recent Audit Log</div>
            {data.auditLogs.length === 0 ? (
              <p className="card-muted">No audit events yet.</p>
            ) : (
              <div className="card" style={{ padding: 0, overflow: "hidden" }}>
                <table className="lb-table">
                  <thead>
                    <tr>
                      <th>Action</th>
                      <th style={{ textAlign: "right" }}>Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.auditLogs.slice(0, 15).map((log, i) => (
                      <tr key={i}>
                        <td><code style={{ fontSize: "0.8rem" }}>{log.action}</code></td>
                        <td style={{ textAlign: "right", color: "var(--muted)", fontSize: "0.8rem" }}>
                          {new Date(log.createdAt).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        ) : (
          <p className="empty-state">
            No competition selected. Go to the Competition tab to create one.
          </p>
        )
      )}

      {/* ── Competition ──────────────────────────────────────── */}
      {tab === "competition" && (
        <div className="stack">
          <div className="card">
            <div className="card-title">
              {data ? "Update Competition" : "Create Competition"}
            </div>
            <form key={data?.competition.id ?? "new"} style={{ display: "grid", gap: "14px" }} onSubmit={createOrUpdateCompetition}>
              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label required">Competition name</label>
                  <input
                    className="form-input"
                    name="name"
                    defaultValue={data?.competition.name ?? "BGO World Cup Soccer Fantasy"}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label required">Slug</label>
                  <input
                    className="form-input"
                    name="slug"
                    defaultValue={data?.competition.slug ?? "world-cup-soccer"}
                    required
                  />
                </div>
              </div>
              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">Budget (credits)</label>
                  <input
                    className="form-input"
                    name="budget"
                    type="number"
                    defaultValue={data?.competition.settings?.budget ?? 100}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Squad size</label>
                  <input
                    className="form-input"
                    name="squadSize"
                    type="number"
                    defaultValue={data?.competition.settings?.squadSize ?? 15}
                  />
                </div>
              </div>
              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">Max players per team</label>
                  <input
                    className="form-input"
                    name="maxPlayersPerTeam"
                    type="number"
                    defaultValue={data?.competition.settings?.maxPlayersPerTeam ?? 3}
                  />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Registration</label>
                <select
                  className="form-input"
                  name="registrationOpen"
                  defaultValue={data?.competition.registrationOpen !== false ? "true" : "false"}
                >
                  <option value="true">Open</option>
                  <option value="false">Closed</option>
                </select>
              </div>
              <div>
                <button className="btn" type="submit">
                  {data ? "Save changes" : "Create competition"}
                </button>
              </div>
            </form>
          </div>

          <div className="card">
            <div className="card-title">Import Premier League Data</div>
            <p className="card-muted" style={{ marginBottom: "14px" }}>
              Pulls all 20 PL teams, their squads, and upcoming fixtures from
              football-data.org. Requires <code>FOOTBALL_DATA_API_KEY</code> env var.
              Safe to re-run — existing records are updated, not duplicated.
            </p>
            <button className="btn" onClick={importPremierLeague} disabled={plImporting}>
              {plImporting ? "Importing…" : "Import Premier League"}
            </button>
            {plResult && (
              <p className={`notice ${plResult.startsWith("Done") ? "" : "notice-error"}`} style={{ marginTop: "12px" }}>
                {plResult}
              </p>
            )}
          </div>

          <div className="card">
            <div className="card-title">
              Development Tools
              <span style={{
                marginLeft: "8px", fontSize: "0.7rem",
                background: "var(--warn-bg)", color: "var(--warn)",
                border: "1px solid var(--warn)", borderRadius: "4px",
                padding: "1px 6px", fontWeight: 700
              }}>
                DEV ONLY
              </span>
            </div>
            <p className="card-muted" style={{ marginBottom: "14px" }}>
              Populates sample teams, players, and fixtures for testing.
            </p>
            <button className="btn-outline" onClick={importSampleData} disabled={!!running}>
              Import sample roster &amp; fixtures
            </button>
          </div>
        </div>
      )}

      {/* ── Players ──────────────────────────────────────────── */}
      {tab === "players" && (
        <div>
          {loading ? (
            <div className="loading-dots">Loading</div>
          ) : !data || data.players.length === 0 ? (
            <p className="empty-state">
              No players yet. Import a roster from the Competition tab.
            </p>
          ) : (
            <div className="card" style={{ padding: 0, overflow: "hidden" }}>
              <table className="lb-table">
                <thead>
                  <tr>
                    <th>Player</th>
                    <th>Pos</th>
                    <th>Team</th>
                    <th>Status</th>
                    <th style={{ textAlign: "right" }}>Price</th>
                    <th style={{ textAlign: "right" }}>Pts</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {data.players.map((player) => (
                    editingPlayerId === player.id ? (
                      <tr key={player.id} style={{ background: "var(--accent-light)" }}>
                        <td style={{ fontWeight: 700 }}>{player.name}</td>
                        <td>
                          <select
                            className="form-input"
                            style={{ minHeight: 0, padding: "3px 6px", fontSize: "0.8rem" }}
                            value={editPosition}
                            onChange={(e) => setEditPosition(e.target.value as typeof ALL_POSITIONS[number])}
                          >
                            {ALL_POSITIONS.map((p) => <option key={p} value={p}>{p}</option>)}
                          </select>
                        </td>
                        <td style={{ color: "var(--muted)", fontSize: "0.85rem" }}>
                          {player.teamShortName ?? "—"}
                        </td>
                        <td>
                          <select
                            className="form-input"
                            style={{ minHeight: 0, padding: "3px 6px", fontSize: "0.8rem" }}
                            value={editStatus}
                            onChange={(e) => setEditStatus(e.target.value as typeof ALL_STATUSES[number])}
                          >
                            {ALL_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                          </select>
                        </td>
                        <td style={{ textAlign: "right" }}>
                          <input
                            className="form-input"
                            style={{ minHeight: 0, padding: "3px 6px", fontSize: "0.8rem", width: "60px", textAlign: "right" }}
                            type="number"
                            min={1}
                            step={0.5}
                            value={editPrice}
                            onChange={(e) => setEditPrice(Number(e.target.value))}
                          />
                        </td>
                        <td style={{ textAlign: "right" }}>
                          {player.totalPoints ?? 0}
                        </td>
                        <td style={{ whiteSpace: "nowrap" }}>
                          <button className="btn btn-sm" onClick={savePlayerEdit} style={{ marginRight: "6px" }}>
                            Save
                          </button>
                          <button className="btn-outline btn-sm" onClick={() => setEditingPlayerId(null)}>
                            Cancel
                          </button>
                        </td>
                      </tr>
                    ) : (
                      <tr key={player.id}>
                        <td style={{ fontWeight: 700 }}>{player.name}</td>
                        <td>
                          <span className={`badge badge-${player.position.toLowerCase()}`}>
                            {player.position}
                          </span>
                        </td>
                        <td style={{ color: "var(--muted)", fontSize: "0.85rem" }}>
                          {player.teamShortName ?? "—"}
                        </td>
                        <td>
                          <span className={`badge badge-${player.status}`}>
                            {player.status}
                          </span>
                        </td>
                        <td style={{ textAlign: "right", fontWeight: 700 }}>
                          £{player.price}
                        </td>
                        <td style={{ textAlign: "right" }}>
                          {player.totalPoints ?? 0}
                        </td>
                        <td>
                          <button
                            className="btn-outline btn-sm"
                            onClick={() => startEdit(player)}
                          >
                            Edit
                          </button>
                        </td>
                      </tr>
                    )
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Scoring ──────────────────────────────────────────── */}
      {tab === "scoring" && (
        <div className="stack">
          <div className="card">
            <div className="card-title">Publish Match Scoring</div>
            <div style={{ display: "grid", gap: "14px" }}>
              <div className="form-group">
                <label className="form-label">Fixture</label>
                <select
                  className="form-input"
                  value={selectedFixtureId}
                  onChange={(e) => setSelectedFixtureId(e.target.value)}
                >
                  {fixtures.length === 0 ? (
                    <option value="">No fixtures — import first</option>
                  ) : (
                    fixtures.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.team1Name ?? "?"} vs {f.team2Name ?? "?"}
                        {f.status === "completed" ? " ✓" : ""}
                      </option>
                    ))
                  )}
                </select>
              </div>
              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">Team 1 goals</label>
                  <input
                    className="form-input"
                    type="number"
                    min={0}
                    value={team1Score}
                    onChange={(e) => setTeam1Score(Number(e.target.value))}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Team 2 goals</label>
                  <input
                    className="form-input"
                    type="number"
                    min={0}
                    value={team2Score}
                    onChange={(e) => setTeam2Score(Number(e.target.value))}
                  />
                </div>
              </div>
              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                <button className="btn-outline" onClick={openPrediction} disabled={!!running}>
                  Open match-winner prediction
                </button>
                <button className="btn" onClick={publishScoring} disabled={!!running}>
                  {running ? "Running…" : "Import & publish sample scoring"}
                </button>
              </div>
              <p className="form-hint">
                Uses dummy stats for the first 11 players. For real stats, use CSV import.
              </p>
            </div>
          </div>

          <div className="card">
            <div className="card-title">Recalculate All</div>
            <p style={{ color: "var(--muted)", fontSize: "0.875rem", marginBottom: "14px" }}>
              Re-runs scoring for every completed fixture in this competition. Safe to run
              multiple times — existing points are replaced, not doubled.
            </p>
            <button className="btn" onClick={recalculateAll} disabled={!!running}>
              {running ? "Running…" : "Recalculate full competition"}
            </button>
          </div>

          <div className="card">
            <div className="card-title">Import Stats from CSV</div>
            <p style={{ color: "var(--muted)", fontSize: "0.875rem", marginBottom: "14px" }}>
              Upload a CSV with columns: <code>name</code>, <code>goals</code>, <code>assists</code>,{" "}
              <code>minutesPlayed</code>, <code>cleanSheet</code>, <code>saves</code>,{" "}
              <code>yellowCards</code>, <code>redCards</code>, <code>penaltySaves</code>,{" "}
              <code>penaltyMisses</code>. Rows matched by player name (case-insensitive).
            </p>
            <div style={{ display: "grid", gap: "14px" }}>
              <div className="form-group">
                <label className="form-label">Fixture</label>
                <select
                  className="form-input"
                  value={csvFixtureId || selectedFixtureId}
                  onChange={(e) => setCsvFixtureId(e.target.value)}
                >
                  {fixtures.length === 0 ? (
                    <option value="">No fixtures — import first</option>
                  ) : (
                    fixtures.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.team1Name ?? "?"} vs {f.team2Name ?? "?"}
                        {f.status === "completed" ? " ✓" : ""}
                      </option>
                    ))
                  )}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">CSV file</label>
                <input
                  className="form-input"
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(e) => setCsvFile(e.target.files?.[0] ?? null)}
                  style={{ cursor: "pointer" }}
                />
              </div>
              <div>
                <button className="btn" onClick={importStatsCsv} disabled={!csvFile}>
                  Import CSV stats
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Transfers ────────────────────────────────────────── */}
      {tab === "transfers" && (
        <div className="card" style={{ maxWidth: 480 }}>
          <div className="card-title">Transfer Window</div>
          <p style={{ color: "var(--muted)", marginBottom: "16px", fontSize: "0.875rem" }}>
            Opening a transfer window lets locked players make squad changes (up to 3 per window).
          </p>
          <div style={{ display: "flex", gap: "10px" }}>
            <button className="btn" onClick={() => setTransferWindow(true)}>
              Open window (3 transfers)
            </button>
            <button
              className="btn-outline"
              style={{ borderColor: "var(--error)", color: "var(--error)" }}
              onClick={() => setTransferWindow(false)}
            >
              Close window
            </button>
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
              <textarea
                className="form-input"
                name="message"
                required
                rows={3}
                placeholder="Enter announcement text…"
                style={{ resize: "vertical" }}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Priority</label>
              <select className="form-input" name="priority" defaultValue="normal">
                <option value="normal">Normal</option>
                <option value="high">High (highlighted)</option>
              </select>
            </div>
            <div>
              <button className="btn" type="submit">Post announcement</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
