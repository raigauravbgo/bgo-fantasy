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
  announcements: { id: string; title?: string; message: string; icon?: string; priority: string; createdAt: string; expiresAt?: string }[];
  auditLogs: { action: string; createdAt: string }[];
  playerPoints: PlayerPoints[];
  entryPoints: { fixtureId: string; entryId: string; points: number }[];
  users: AdminUser[];
};

type AdminPredictionSet = {
  id: string;
  fixtureId: string | null;
  label?: string | null;
  fixtureName?: string;
  fixtureStartTime?: string;
  fixtureStatus?: string;
  type: string;
  status: string;
  closesAt: string;
  totalParticipants: number;
  questions: Array<{ id: string; prompt: string; type?: string; points: number; options?: Array<{ label: string; value: string }> }>;
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
  { value: "WC",  label: "🌍 FIFA World Cup 2026" },
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

  const [tab, setTab] = useState<"overview" | "competition" | "players" | "scoring" | "transfers" | "announcements" | "predictions" | "bumper">("overview");
  const [predictions, setPredictions] = useState<AdminPredictionSet[]>([]);
  const [predLoading, setPredLoading] = useState(false);
  const [mappingPreview, setMappingPreview] = useState<{
    score: { home: number; away: number };
    mapped: number;
    unmapped: number;
    unmappedNames: string[];
    fuzzyCount: number;
    mappings: Array<{
      apiName: string; apiTeamName: string; side: string;
      minutes: number; goals: number; assists: number;
      yellowCards: number; redCards: number;
      dbName: string; dbTeamShortName?: string; matchType: string;
    }>;
  } | null>(null);
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
  const [bulkCsvFile, setBulkCsvFile] = useState<File | null>(null);
  const [plImporting, setPlImporting] = useState(false);
  const [plResult, setPlResult] = useState<string | null>(null);
  const [syncingIds, setSyncingIds] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [selectedLeague, setSelectedLeague] = useState("PL");
  const [editingPlayerId, setEditingPlayerId] = useState<string | null>(null);
  const [editPrice, setEditPrice] = useState(0);
  const [editPosition, setEditPosition] = useState<typeof ALL_POSITIONS[number]>("MID");
  const [editStatus, setEditStatus] = useState<typeof ALL_STATUSES[number]>("available");

  useEffect(() => {
    void loadOverview();
  }, [competitionId]);

  useEffect(() => {
    if (tab === "predictions") void loadPredictions();
    if (tab === "bumper") void loadBumperSets();
  }, [tab]);

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

  async function deleteCompetition() {
    if (!confirm(`Delete "${data?.competition.name}" and ALL its data (teams, players, fixtures, entries, stats)? This cannot be undone.`)) return;
    if (!confirm("Are you sure? This permanently deletes everything.")) return;
    setDeleting(true);
    try {
      await apiFetch(`/api/admin/competitions/${competitionId}`, { method: "DELETE" });
      router.push("/admin");
    } catch (err) {
      setNotice({ type: "err", msg: err instanceof Error ? err.message : "Delete failed." });
      setDeleting(false);
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
      const result = await apiFetch<{
        leagueName: string;
        imported: { teams: number; players: number; fixtures: number };
        skippedFixtures?: Array<{ home: string; away: string; date: string; reason: string }>;
      }>(
        `/api/admin/competitions/${competitionId}/import-league`,
        { method: "POST", body: { leagueCode: selectedLeague } }
      );
      let msg = `${result.leagueName} — ${result.imported.teams} teams, ${result.imported.players} players, ${result.imported.fixtures} fixtures.`;
      if (result.skippedFixtures?.length) {
        msg += ` ⚠️ ${result.skippedFixtures.length} fixtures skipped (unknown teams): ${result.skippedFixtures.map((f) => `${f.home} vs ${f.away}`).join(", ")}`;
      }
      setPlResult(msg);
      void loadOverview();
    } catch (err) {
      setPlResult(err instanceof Error ? err.message : "Import failed.");
    } finally {
      setPlImporting(false);
    }
  }

  async function syncFixtureIds() {
    setSyncingIds(true); setSyncResult(null);
    try {
      const r = await apiFetch<{ total: number; matched: number; alreadyMapped: number; unmatched: number; unmatchedList: string[] }>(
        `/api/admin/competitions/${competitionId}/sync-fixture-ids`,
        { method: "POST" }
      );
      const msg = `Mapped ${r.matched} fixtures. Already mapped: ${r.alreadyMapped}. Unmatched: ${r.unmatched}.` +
        (r.unmatchedList.length ? ` Unmatched: ${r.unmatchedList.join(", ")}` : "");
      setSyncResult(msg);
    } catch (err) {
      setSyncResult(`Error: ${err instanceof Error ? err.message : "Sync failed."}`);
    } finally {
      setSyncingIds(false);
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

  // Step 1: fetch from API-Football, save raw stats, show review panel
  async function fetchStatsForReview() {
    const fixtureId = selectedFixtureId || fixtures[0]?.id;
    if (!fixtureId) { showNotice("Select a fixture first.", "err"); return; }
    setMappingPreview(null);
    await run("Fetching stats from API-Football…", async () => {
      const result = await apiFetch<NonNullable<typeof mappingPreview> & { statsSaved: boolean }>(
        `/api/admin/fixtures/${fixtureId}/stats/fetch-live`,
        { method: "POST" }
      );
      setMappingPreview(result);
    });
  }

  // Step 2: admin has reviewed — publish points and mark fixture complete
  async function confirmAndPublish() {
    const fixtureId = selectedFixtureId || fixtures[0]?.id;
    if (!fixtureId || !mappingPreview) return;
    const { home, away } = mappingPreview.score;
    await run("Publishing points…", async () => {
      await apiFetch(`/api/admin/fixtures/${fixtureId}/stats/publish`, {
        method: "POST",
        body: { score: { team1: home, team2: away } },
      });
    });
    setMappingPreview(null);
    void loadOverview();
    showNotice(`Published! Score: ${home}–${away}. Leaderboard updated.`);
  }

  async function publishImportedStats() {
    const fixtureId = selectedFixtureId || fixtures[0]?.id;
    if (!fixtureId) { showNotice("Select a fixture first.", "err"); return; }
    const score = team1Score || team2Score ? { team1: team1Score, team2: team2Score } : undefined;
    await run("Imported stats published", async () => {
      await apiFetch(`/api/admin/fixtures/${fixtureId}/stats/publish`, {
        method: "POST",
        body: score ? { score } : {}
      });
    });
    void loadOverview();
  }

  async function markFixtureCompleted() {
    const fixtureId = selectedFixtureId || fixtures[0]?.id;
    if (!fixtureId) { showNotice("Select a fixture first.", "err"); return; }
    await run("Fixture marked as completed", async () => {
      await apiFetch(`/api/admin/fixtures/${fixtureId}`, { method: "PATCH", body: { status: "completed" } });
      setFixtures((prev) => prev.map((f) => f.id === fixtureId ? { ...f, status: "completed" } : f));
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

  async function bulkImportStats() {
    if (!bulkCsvFile) { showNotice("Select a CSV file first.", "err"); return; }
    const text = await bulkCsvFile.text();
    await run("Bulk stats imported", async () => {
      type BulkResult = { fixture: string; mapped: number; unmapped: string[]; score?: { home: number; away: number }; noFixtureMatch: boolean };
      const result = await apiFetch<{ results: BulkResult[]; totalStats: number }>(
        `/api/admin/competitions/${competitionId}/stats/bulk-import`,
        { method: "POST", body: { csv: text } }
      );
      const noMatch = result.results.filter((r) => r.noFixtureMatch).map((r) => r.fixture);
      const withUnmapped = result.results.filter((r) => r.unmapped.length > 0);
      let msg = `Imported ${result.totalStats} player stats across ${result.results.filter((r) => !r.noFixtureMatch).length} fixture(s).`;
      if (noMatch.length) msg += ` No fixture match for: ${noMatch.join(", ")}.`;
      if (withUnmapped.length) msg += ` Unmapped players in: ${withUnmapped.map((r) => `${r.fixture} (${r.unmapped.join(", ")})`).join("; ")}.`;
      showNotice(msg, noMatch.length || withUnmapped.length ? "err" : "ok");
      setBulkCsvFile(null);
      void loadOverview();
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

  async function deleteAnnouncement(announcementId: string) {
    await run("Announcement deleted", () =>
      apiFetch(`/api/admin/competitions/${competitionId}/announcements/${announcementId}`, {
        method: "DELETE"
      })
    );
  }

  const [twCount, setTwCount] = useState(3);
  const [twHours, setTwHours] = useState(24);

  // Bumper predictions state
  const [bumperSets, setBumperSets] = useState<AdminPredictionSet[]>([]);
  const [bumperLoading, setBumperLoading] = useState(false);
  const [bumperClosesAt, setBumperClosesAt] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() + 7); return d.toISOString().slice(0, 16);
  });
  const [bumperScoreInputs, setBumperScoreInputs] = useState<Record<string, string>>({});

  async function setTransferWindow(active: boolean, resetUsage = false) {
    await run(`Transfer window ${active ? "opened" : "closed"}`, () =>
      apiFetch(`/api/admin/competitions/${competitionId}/transfer-window`, {
        method: "POST",
        body: { active, maxTransfers: twCount, durationHours: active ? twHours : undefined, resetUsage }
      })
    );
  }

  async function loadPredictions() {
    setPredLoading(true);
    try {
      const d = await apiFetch<{ predictionSets: AdminPredictionSet[] }>(
        `/api/admin/competitions/${competitionId}/predictions`
      );
      setPredictions(d.predictionSets);
    } catch {
      // silent
    } finally {
      setPredLoading(false);
    }
  }

  async function scorePredSet(setId: string) {
    await run("Predictions scored", () =>
      apiFetch(`/api/admin/predictions/${setId}/score`, { method: "POST" })
    );
    void loadPredictions();
  }

  async function loadBumperSets() {
    setBumperLoading(true);
    try {
      const d = await apiFetch<{ bumperSets: AdminPredictionSet[] }>(
        `/api/admin/competitions/${competitionId}/bumper-predictions`
      );
      setBumperSets(d.bumperSets);
    } catch {
      // silent
    } finally {
      setBumperLoading(false);
    }
  }

  async function createBumperSet(bumperType: "champion" | "golden_boot" | "final_score") {
    const LABELS: Record<string, string> = { champion: "Champion Predictor", golden_boot: "Golden Boot", final_score: "Final Score Predictor" };
    const closesAt = new Date(bumperClosesAt).toISOString();
    await run(`${LABELS[bumperType]} created`, async () => {
      await apiFetch(`/api/admin/competitions/${competitionId}/bumper-predictions`, { method: "POST", body: { bumperType, label: LABELS[bumperType], closesAt } });
      void loadBumperSets();
    });
  }

  async function scoreBumperSet(setId: string, questionId: string, correctValue: string) {
    await run("Bumper predictions scored", () =>
      apiFetch(`/api/admin/predictions/${setId}/score`, {
        method: "POST",
        body: { correctValues: { [questionId]: correctValue } }
      })
    );
    void loadBumperSets();
  }

  const TABS = ["overview", "competition", "players", "scoring", "predictions", "bumper", "transfers", "announcements"] as const;

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
            <div className="card-title">Sync API-Football Fixture IDs</div>
            <p className="card-muted" style={{ marginBottom: "14px" }}>
              Maps every fixture to its API-Football ID so stats can be fetched without fragile name matching. Run this once after importing a league.
            </p>
            <button className="btn" onClick={syncFixtureIds} disabled={syncingIds}>
              {syncingIds ? "Syncing…" : "Sync fixture IDs"}
            </button>
            {syncResult && (
              <p className={`notice ${syncResult.startsWith("Error") ? "notice-error" : ""}`} style={{ marginTop: "12px" }}>{syncResult}</p>
            )}
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

          <div className="card" style={{ borderColor: "hsl(var(--danger))" }}>
            <div className="card-title" style={{ color: "hsl(var(--danger))" }}>Danger Zone</div>
            <p className="card-muted" style={{ marginBottom: "14px" }}>
              Permanently deletes this competition and <strong>all</strong> associated data — teams, players, fixtures, entries, stats, and scoring runs. Cannot be undone.
            </p>
            <button
              style={{ background: "hsl(var(--danger))", color: "#fff", border: "none", borderRadius: 8, padding: "8px 18px", fontWeight: 700, cursor: deleting ? "not-allowed" : "pointer", opacity: deleting ? 0.6 : 1 }}
              disabled={deleting}
              onClick={() => void deleteCompetition()}
            >
              {deleting ? "Deleting…" : "Delete competition & all data"}
            </button>
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
            <div className="card-title">Bulk Import Stats (All Fixtures)</div>
            <p style={{ fontSize: "0.875rem", marginBottom: "14px" }}>
              Upload the CSV exported from the <code>scripts/pull-fbref-stats.py</code> script. Stats for all fixtures are imported in one go — fixtures with scores are automatically marked completed. Then publish each fixture individually below.
            </p>
            <div style={{ display: "grid", gap: "14px" }}>
              <div className="form-group">
                <label className="form-label">Bulk stats CSV</label>
                <input className="form-input" type="file" accept=".csv,text/csv" onChange={(e) => setBulkCsvFile(e.target.files?.[0] ?? null)} style={{ cursor: "pointer" }} />
              </div>
              <div><button className="btn" onClick={bulkImportStats} disabled={!bulkCsvFile || !!running}>{running === "Bulk stats imported" ? "Importing…" : "Import all stats"}</button></div>
            </div>
          </div>

          <div className="card">
            <div className="card-title">Publish Match Scoring</div>
            <div style={{ display: "grid", gap: "14px" }}>
              <div className="form-group">
                <label className="form-label">Fixture</label>
                {(() => {
                  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
                  const relevant = fixtures.filter((f) => new Date(f.startTime) >= cutoff);
                  const hidden = fixtures.length - relevant.length;
                  const sorted = [...relevant].sort((a, b) =>
                    a.status === "completed" && b.status !== "completed" ? 1 :
                    a.status !== "completed" && b.status === "completed" ? -1 :
                    new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
                  );
                  return (
                    <>
                      <select className="form-input" value={selectedFixtureId} onChange={(e) => setSelectedFixtureId(e.target.value)}>
                        {sorted.length === 0
                          ? <option value="">No recent fixtures — import league data first</option>
                          : sorted.map((f) => <option key={f.id} value={f.id}>{fixtureLabel(f)}</option>)}
                      </select>
                      {hidden > 0 && (
                        <p className="form-hint">{hidden} older fixture{hidden !== 1 ? "s" : ""} from before the last 30 days are hidden.</p>
                      )}
                    </>
                  );
                })()}
              </div>

              {(() => {
                const sel = fixtures.find((f) => f.id === selectedFixtureId);
                if (sel && sel.status !== "completed") {
                  return (
                    <div className="notice notice-error" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
                      <span>This fixture is marked <strong>{sel.status}</strong> — mark it completed before fetching stats.</span>
                      <button className="btn btn-sm" style={{ flexShrink: 0 }} onClick={markFixtureCompleted} disabled={!!running}>
                        Mark as completed
                      </button>
                    </div>
                  );
                }
                return null;
              })()}

              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                <button className="btn-outline" onClick={openPrediction} disabled={!!running}>Open predictions</button>
                <button className="btn" onClick={publishImportedStats} disabled={!!running}>{running ? "Running…" : "✅ Publish imported stats"}</button>
                <button className="btn-outline" onClick={fetchStatsForReview} disabled={!!running}>{running ? "Running…" : "⚡ Fetch stats from API"}</button>
                <button className="btn-outline" onClick={publishScoring} disabled={!!running}>{running ? "Running…" : "Publish dummy scoring (testing)"}</button>
              </div>
              <p className="form-hint">
                <strong>Fetch stats from API</strong> — pulls player stats from API-Football, saves them, and shows a full review table. <em>Nothing is published until you confirm.</em>
                <br />Dummy scoring generates fake stats for testing only.
              </p>

              {/* ── Stats review panel (shown after fetch, before publish) ── */}
              {mappingPreview && (
                <div style={{
                  marginTop: 20,
                  border: "1px solid rgba(255,255,255,0.12)",
                  borderRadius: 12,
                  overflow: "hidden",
                }}>
                  {/* Panel header */}
                  <div style={{
                    padding: "14px 18px",
                    background: "rgba(255,255,255,0.03)",
                    borderBottom: "1px solid rgba(255,255,255,0.08)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                    flexWrap: "wrap",
                  }}>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: "1rem", color: "hsl(var(--ink))" }}>
                        Review before publishing
                      </div>
                      <div style={{ fontSize: "0.78rem", color: "hsl(var(--ink-muted))", marginTop: 3 }}>
                        Score from API: <strong style={{ color: "hsl(var(--ink))" }}>{mappingPreview.score.home} – {mappingPreview.score.away}</strong>
                        {" · "}{mappingPreview.mapped} players matched
                        {mappingPreview.unmapped > 0 && (
                          <span style={{ color: "hsl(var(--danger))", marginLeft: 6 }}>· {mappingPreview.unmapped} unmapped</span>
                        )}
                        {mappingPreview.fuzzyCount > 0 && (
                          <span style={{ color: "hsl(var(--warn))", marginLeft: 6 }}>· {mappingPreview.fuzzyCount} fuzzy matches</span>
                        )}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                      <button
                        className="btn-ghost btn-sm"
                        onClick={() => setMappingPreview(null)}
                        disabled={!!running}
                      >
                        Discard
                      </button>
                      <button
                        className="btn btn-sm"
                        onClick={confirmAndPublish}
                        disabled={!!running}
                        style={{ background: "hsl(var(--success))", borderColor: "hsl(var(--success))" }}
                      >
                        {running ? "Publishing…" : `✅ Confirm & publish (${mappingPreview.score.home}–${mappingPreview.score.away})`}
                      </button>
                    </div>
                  </div>

                  {/* Warnings */}
                  {mappingPreview.unmappedNames.length > 0 && (
                    <div style={{
                      padding: "10px 18px",
                      background: "rgba(239,68,68,0.08)",
                      borderBottom: "1px solid rgba(239,68,68,0.15)",
                      fontSize: "0.8rem",
                      color: "hsl(var(--danger))",
                    }}>
                      <strong>Unmapped players (will score 0 pts):</strong> {mappingPreview.unmappedNames.join(", ")}
                    </div>
                  )}
                  {mappingPreview.fuzzyCount > 0 && (
                    <div style={{
                      padding: "10px 18px",
                      background: "rgba(245,158,11,0.07)",
                      borderBottom: "1px solid rgba(245,158,11,0.15)",
                      fontSize: "0.8rem",
                      color: "hsl(var(--warn))",
                    }}>
                      <strong>⚠ Fuzzy matches below are highlighted</strong> — verify the API name maps to the correct player before confirming.
                    </div>
                  )}

                  {/* Mapping table */}
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
                      <thead>
                        <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.02)" }}>
                          {["API name", "Team", "Min", "G", "A", "Y", "R", "→ DB name (team)", "Match"].map((h) => (
                            <th key={h} style={{ padding: "8px 10px", textAlign: "left", color: "hsl(var(--ink-muted))", fontWeight: 600, whiteSpace: "nowrap" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {mappingPreview.mappings.map((m, i) => (
                          <tr
                            key={i}
                            style={{
                              borderBottom: "1px solid rgba(255,255,255,0.04)",
                              background: m.matchType === "lastname" ? "rgba(245,158,11,0.06)" : undefined,
                            }}
                          >
                            <td style={{ padding: "6px 10px", color: "hsl(var(--ink))", whiteSpace: "nowrap" }}>{m.apiName}</td>
                            <td style={{ padding: "6px 10px", color: "hsl(var(--ink-muted))", fontSize: "0.75rem" }}>{m.apiTeamName}</td>
                            <td style={{ padding: "6px 10px" }}>{m.minutes}</td>
                            <td style={{ padding: "6px 10px", fontWeight: m.goals > 0 ? 700 : undefined, color: m.goals > 0 ? "hsl(var(--success))" : "hsl(var(--ink-muted))" }}>{m.goals || "–"}</td>
                            <td style={{ padding: "6px 10px", color: m.assists > 0 ? "hsl(var(--brand))" : "hsl(var(--ink-muted))" }}>{m.assists || "–"}</td>
                            <td style={{ padding: "6px 10px", color: m.yellowCards > 0 ? "hsl(var(--warn))" : "hsl(var(--ink-muted))" }}>{m.yellowCards || "–"}</td>
                            <td style={{ padding: "6px 10px", color: m.redCards > 0 ? "hsl(var(--danger))" : "hsl(var(--ink-muted))", fontWeight: m.redCards > 0 ? 700 : undefined }}>{m.redCards || "–"}</td>
                            <td style={{ padding: "6px 10px", color: "hsl(var(--ink))", whiteSpace: "nowrap" }}>
                              {m.dbName}
                              {m.dbTeamShortName && <span style={{ color: "hsl(var(--ink-muted))", marginLeft: 4 }}>({m.dbTeamShortName})</span>}
                            </td>
                            <td style={{ padding: "6px 10px", whiteSpace: "nowrap" }}>
                              {m.matchType === "lastname"
                                ? <span style={{ color: "hsl(var(--warn))", fontWeight: 700, fontSize: "0.72rem" }}>⚠ fuzzy</span>
                                : <span style={{ color: "hsl(var(--ink-muted))", fontSize: "0.72rem" }}>exact</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Confirm footer */}
                  <div style={{
                    padding: "12px 18px",
                    borderTop: "1px solid rgba(255,255,255,0.08)",
                    display: "flex",
                    justifyContent: "flex-end",
                    gap: 8,
                    background: "rgba(255,255,255,0.02)",
                  }}>
                    <button className="btn-ghost btn-sm" onClick={() => setMappingPreview(null)} disabled={!!running}>Discard</button>
                    <button
                      className="btn btn-sm"
                      onClick={confirmAndPublish}
                      disabled={!!running}
                      style={{ background: "hsl(var(--success))", borderColor: "hsl(var(--success))" }}
                    >
                      {running ? "Publishing…" : `✅ Confirm & publish (${mappingPreview.score.home}–${mappingPreview.score.away})`}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="card">
            <div className="card-title">Import Stats from CSV</div>
            <p style={{ fontSize: "0.875rem", marginBottom: "14px" }}>
              Select a fixture, download the pre-filled template, fill in stats from FBref/SofaScore, then re-upload.
            </p>
            <div style={{ display: "grid", gap: "14px" }}>
              <div className="form-group">
                <label className="form-label">Fixture</label>
                <select className="form-input" value={csvFixtureId || selectedFixtureId} onChange={(e) => setCsvFixtureId(e.target.value)}>
                  {fixtures.length === 0 ? <option value="">No fixtures</option> : (() => {
                    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
                    return fixtures
                      .filter((f) => new Date(f.startTime) >= cutoff)
                      .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
                      .map((f) => <option key={f.id} value={f.id}>{fixtureLabel(f)}</option>);
                  })()}
                </select>
              </div>
              <div>
                <button
                  className="btn btn-secondary"
                  disabled={!(csvFixtureId || selectedFixtureId)}
                  onClick={() => {
                    const fid = csvFixtureId || selectedFixtureId;
                    if (fid) window.open(`/api/admin/fixtures/${fid}/stats/template`, "_blank");
                  }}
                >
                  Download player template
                </button>
                <span style={{ fontSize: "0.8rem", color: "var(--muted)", marginLeft: "10px" }}>
                  Opens a CSV pre-filled with player names for both teams
                </span>
              </div>
              <div className="form-group">
                <label className="form-label">Filled CSV file</label>
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
        <div className="card" style={{ maxWidth: 520 }}>
          <div className="card-title">Transfer Window</div>
          <p style={{ marginBottom: "16px", fontSize: "0.875rem" }}>
            Opening a transfer window lets locked players make squad changes within the set limits.
          </p>
          <div style={{ display: "flex", gap: "16px", marginBottom: "20px", flexWrap: "wrap" }}>
            <label style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "0.875rem" }}>
              Max transfers (1–15)
              <input
                type="number" min={1} max={15} value={twCount}
                onChange={(e) => setTwCount(Math.min(15, Math.max(1, Number(e.target.value))))}
                className="form-input" style={{ width: 80 }}
              />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "0.875rem" }}>
              Window duration (hours)
              <input
                type="number" min={1} max={168} value={twHours}
                onChange={(e) => setTwHours(Math.min(168, Math.max(1, Number(e.target.value))))}
                className="form-input" style={{ width: 80 }}
              />
            </label>
          </div>
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <button className="btn" onClick={() => setTransferWindow(true)} disabled={!!running}>
              Open window
            </button>
            <button className="btn" onClick={() => setTransferWindow(true, true)} disabled={!!running}
              style={{ background: "hsl(var(--accent))" }}>
              Re-open for new round
            </button>
            <button className="btn-outline" disabled={!!running}
              style={{ borderColor: "hsl(var(--danger))", color: "hsl(var(--danger))" }}
              onClick={() => setTransferWindow(false)}>
              Close window
            </button>
          </div>
          <p style={{ marginTop: "12px", fontSize: "0.8rem", color: "var(--muted)" }}>
            &ldquo;Re-open for new round&rdquo; resets every player&apos;s transfer usage back to 0.
          </p>
        </div>
      )}

      {/* ── Predictions ──────────────────────────────────────── */}
      {tab === "predictions" && (
        <div className="stack">
          <div className="card">
            <div className="card-title">Open Predictions for Fixture</div>
            <p style={{ fontSize: "0.875rem", marginBottom: "14px" }}>
              Opens 5 prediction questions (match winner, BTTS, over/under 2.5, exact score, red card) for a fixture. Predictions lock at kick-off and are auto-scored when you publish stats.
            </p>
            <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
              <select
                className="form-input"
                style={{ maxWidth: 340 }}
                value={selectedFixtureId}
                onChange={(e) => setSelectedFixtureId(e.target.value)}
              >
                {fixtures.length === 0
                  ? <option value="">No fixtures — import league data first</option>
                  : fixtures
                      .slice()
                      .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
                      .map((f) => <option key={f.id} value={f.id}>{fixtureLabel(f)}</option>)}
              </select>
              <button className="btn" onClick={openPrediction} disabled={!!running}>
                Open predictions
              </button>
            </div>
          </div>

          <div className="card">
            <div className="card-title">All Prediction Sets</div>
            {predLoading ? (
              <div className="loading-dots">Loading</div>
            ) : predictions.length === 0 ? (
              <p style={{ fontSize: "0.875rem", color: "hsl(var(--ink-muted))" }}>
                No prediction sets yet. Open predictions for a fixture above.
              </p>
            ) : (
              <div style={{ display: "grid", gap: "10px" }}>
                {predictions.map((ps) => (
                  <div key={ps.id} style={{
                    padding: "14px 16px",
                    borderRadius: 10,
                    border: "1px solid rgba(255,255,255,0.08)",
                    background: "rgba(255,255,255,0.02)",
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                    flexWrap: "wrap",
                  }}>
                    <div style={{ flex: 1, minWidth: 180 }}>
                      <div style={{ fontSize: "0.875rem", fontWeight: 700, color: "hsl(var(--ink))" }}>
                        {ps.fixtureName ?? ps.fixtureId}
                      </div>
                      <div style={{ fontSize: "0.75rem", color: "hsl(var(--ink-muted))", marginTop: 2 }}>
                        {ps.fixtureStartTime
                          ? new Date(ps.fixtureStartTime).toLocaleString("en-GB", {
                              day: "numeric", month: "short", hour: "2-digit", minute: "2-digit"
                            })
                          : "–"
                        }
                        {" · "}{ps.questions.length} questions · {ps.totalParticipants} participant{ps.totalParticipants !== 1 ? "s" : ""}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <span style={{
                        fontSize: "0.72rem",
                        fontWeight: 700,
                        letterSpacing: "0.05em",
                        textTransform: "uppercase",
                        padding: "3px 9px",
                        borderRadius: 6,
                        background: ps.status === "scored"
                          ? "rgba(34,197,94,0.12)"
                          : ps.status === "closed"
                            ? "rgba(239,68,68,0.12)"
                            : "rgba(99,102,241,0.12)",
                        color: ps.status === "scored"
                          ? "hsl(var(--success))"
                          : ps.status === "closed"
                            ? "hsl(var(--danger))"
                            : "hsl(var(--brand))",
                      }}>
                        {ps.status}
                      </span>
                      {ps.status !== "scored" && (
                        <button
                          className="btn btn-sm btn-outline"
                          disabled={!!running}
                          onClick={() => { void scorePredSet(ps.id); }}
                        >
                          Score now
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Bumper Predictions ───────────────────────────────── */}
      {tab === "bumper" && (
        <div className="stack">
          {/* Existing bumper sets */}
          {!bumperLoading && bumperSets.length > 0 && (
            <div className="card">
              <div className="card-title">Bumper Prediction Sets</div>
              <div style={{ display: "grid", gap: "12px" }}>
                {bumperSets.map((bs) => {
                  const q = bs.questions[0];
                  const scoreInput = bumperScoreInputs[bs.id] ?? "";
                  return (
                    <div key={bs.id} style={{ padding: "14px 16px", borderRadius: 10, border: "1px solid rgba(255,200,0,0.2)", background: "rgba(255,200,0,0.04)", display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
                      <div style={{ flex: 1, minWidth: 180 }}>
                        <div style={{ fontSize: "0.9rem", fontWeight: 700 }}>
                          {bs.label ?? "Bumper"}
                          {" "}
                          <span style={{ fontSize: "0.75rem", color: "hsl(var(--ink-muted))", fontWeight: 400 }}>
                            ({bs.totalParticipants} participant{bs.totalParticipants !== 1 ? "s" : ""})
                          </span>
                        </div>
                        <div style={{ fontSize: "0.78rem", color: "hsl(var(--ink-muted))", marginTop: 2 }}>
                          {q?.type} · closes {new Date(bs.closesAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        <span style={{ fontSize: "0.72rem", fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", padding: "3px 9px", borderRadius: 6, background: bs.status === "scored" ? "rgba(34,197,94,0.12)" : "rgba(255,200,0,0.12)", color: bs.status === "scored" ? "hsl(var(--success))" : "hsl(50,100%,60%)" }}>
                          {bs.status}
                        </span>
                        {bs.status !== "scored" && q && (
                          <>
                            <select
                              className="form-input"
                              style={{ minHeight: 0, padding: "3px 8px", fontSize: "0.8rem", maxWidth: 200 }}
                              value={scoreInput}
                              onChange={(e) => setBumperScoreInputs((prev) => ({ ...prev, [bs.id]: e.target.value }))}
                            >
                              <option value="">— pick correct answer —</option>
                              {q.options?.map((opt: { label: string; value: string }) => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                              ))}
                            </select>
                            <button
                              className="btn btn-sm"
                              disabled={!scoreInput || !!running}
                              onClick={() => scoreBumperSet(bs.id, q.id, scoreInput)}
                            >
                              Score
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Shared closesAt */}
          <div className="card">
            <div className="card-title">Create Bumper Predictions</div>
            <p className="card-muted" style={{ marginBottom: "16px" }}>
              All bumper predictions automatically close before the Quarter Finals. Set the closes-at time once and create each predictor below.
            </p>
            <div className="form-group" style={{ maxWidth: 320, marginBottom: 20 }}>
              <label className="form-label">Closes at (local time)</label>
              <input
                className="form-input"
                type="datetime-local"
                value={bumperClosesAt}
                onChange={(e) => setBumperClosesAt(e.target.value)}
              />
            </div>

            {/* Champion */}
            {!bumperSets.some((b) => b.label === "Champion Predictor") && (
              <div style={{ padding: "14px 16px", borderRadius: 10, border: "1px solid rgba(255,200,0,0.15)", marginBottom: 12, background: "rgba(255,200,0,0.03)" }}>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>Champion Predictor — 100 pts</div>
                <p className="card-muted" style={{ marginBottom: 10 }}>
                  Users pick which team will win the World Cup. Options are auto-populated from all teams in this competition.
                </p>
                <button className="btn" disabled={!!running} onClick={() => createBumperSet("champion")}>
                  Create Champion Predictor
                </button>
              </div>
            )}

            {/* Golden Boot */}
            {!bumperSets.some((b) => b.label === "Golden Boot") && (
              <div style={{ padding: "14px 16px", borderRadius: 10, border: "1px solid rgba(255,200,0,0.15)", marginBottom: 12, background: "rgba(255,200,0,0.03)" }}>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>Golden Boot — 100 pts</div>
                <p className="card-muted" style={{ marginBottom: 10 }}>
                  All players in the competition are auto-populated. Users search from the full list to pick their top scorer.
                </p>
                <button className="btn" disabled={!!running} onClick={() => createBumperSet("golden_boot")}>
                  Create Golden Boot
                </button>
              </div>
            )}

            {/* Final Score */}
            {!bumperSets.some((b) => b.label === "Final Score Predictor") && (
              <div style={{ padding: "14px 16px", borderRadius: 10, border: "1px solid rgba(255,200,0,0.15)", background: "rgba(255,200,0,0.03)" }}>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>Final Score Predictor — 200 pts</div>
                <p className="card-muted" style={{ marginBottom: 10 }}>
                  Users pick total goals in the final (0–10). Exact = 200 pts, off-by-1 = 50 pts. Auto-generated options.
                </p>
                <button className="btn" disabled={!!running} onClick={() => createBumperSet("final_score")}>
                  Create Final Score Predictor
                </button>
              </div>
            )}

            {bumperSets.length === 3 && (
              <p className="notice" style={{ marginTop: 16 }}>All 3 bumper prediction sets are active.</p>
            )}
          </div>
        </div>
      )}

      {/* ── Announcements ────────────────────────────────────── */}
      {tab === "announcements" && (
        <div style={{ display: "grid", gap: "20px", maxWidth: 600 }}>
          {/* Existing announcements */}
          {(data?.announcements.length ?? 0) > 0 && (
            <div className="card">
              <div className="card-title">Active Announcements</div>
              <div style={{ display: "grid", gap: "10px" }}>
                {data!.announcements.map((a) => (
                  <div key={a.id} style={{ display: "flex", alignItems: "flex-start", gap: "12px", padding: "12px", background: "var(--surface-2)", borderRadius: "8px", border: a.priority === "high" ? "1px solid var(--accent)" : "1px solid var(--border)" }}>
                    {a.icon && <span style={{ fontSize: "20px", flexShrink: 0 }}>{a.icon}</span>}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {a.title && <div style={{ fontWeight: 600, marginBottom: "2px" }}>{a.title}</div>}
                      <div style={{ color: "var(--text-2)", fontSize: "14px" }}>{a.message}</div>
                      <div style={{ color: "var(--text-3)", fontSize: "12px", marginTop: "4px" }}>
                        {a.priority === "high" && <span style={{ color: "var(--accent)", marginRight: "8px" }}>HIGH</span>}
                        {new Date(a.createdAt).toLocaleString()}
                      </div>
                    </div>
                    <button
                      className="btn btn-danger"
                      style={{ padding: "4px 10px", fontSize: "12px", flexShrink: 0 }}
                      onClick={() => deleteAnnouncement(a.id)}
                    >
                      Delete
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Create form */}
          <div className="card">
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
        </div>
      )}
    </div>
  );
}
