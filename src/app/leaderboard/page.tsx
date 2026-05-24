"use client";

import { useEffect, useState } from "react";
import { useRequireAuth } from "@/lib/auth-context";
import { apiFetch } from "@/lib/api";
import type { Fixture, LeaderboardRow } from "@/lib/types";

function downloadCsv(rows: LeaderboardRow[], filename: string) {
  const header = "Rank,Team,Points,Budget Used\n";
  const body = rows
    .map((r) => `${r.rank},"${r.name.replace(/"/g, '""')}",${r.totalPoints},${r.budgetUsed}`)
    .join("\n");
  const blob = new Blob([header + body], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function LeaderboardTable({
  rows,
  myUserId
}: {
  rows: LeaderboardRow[];
  myUserId?: string;
}) {
  if (rows.length === 0) {
    return (
      <p className="empty-state">
        No entries yet. Be the first to lock your squad!
      </p>
    );
  }

  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      <table className="lb-table">
        <thead>
          <tr>
            <th style={{ width: 48 }}>#</th>
            <th>Team</th>
            <th style={{ textAlign: "right" }}>Budget used</th>
            <th style={{ textAlign: "right" }}>Points</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const isMe = row.userId === myUserId;
            return (
              <tr key={row.entryId} className={isMe ? "me" : ""}>
                <td>
                  <span className={`lb-rank ${row.rank <= 3 ? "top3" : ""}`}>
                    {row.rank === 1 ? "🥇" : row.rank === 2 ? "🥈" : row.rank === 3 ? "🥉" : `#${row.rank}`}
                  </span>
                </td>
                <td>
                  <div style={{ fontWeight: 700 }}>
                    {row.name}
                    {isMe ? (
                      <span style={{
                        marginLeft: "8px", fontSize: "0.72rem",
                        background: "var(--accent)", color: "var(--accent-ink)",
                        borderRadius: "4px", padding: "1px 5px", fontWeight: 800
                      }}>You</span>
                    ) : null}
                  </div>
                </td>
                <td style={{ textAlign: "right", color: "var(--muted)" }}>
                  £{row.budgetUsed}
                </td>
                <td style={{ textAlign: "right" }}>
                  <span className="lb-pts">{row.totalPoints}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function LeaderboardPage() {
  const { user, competition, loading: authLoading } = useRequireAuth();
  const [tab, setTab] = useState<"overall" | "matchday">("overall");
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [matchdayRows, setMatchdayRows] = useState<LeaderboardRow[]>([]);
  const [fixtures, setFixtures] = useState<Fixture[]>([]);
  const [selectedFixtureId, setSelectedFixtureId] = useState("");
  const [loading, setLoading] = useState(false);
  const [matchdayLoading, setMatchdayLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!competition?.slug) return;
    setLoading(true);
    Promise.all([
      apiFetch<{ leaderboard: LeaderboardRow[] }>(
        `/api/competitions/${competition.slug}/leaderboard`
      ),
      apiFetch<{ fixtures: Fixture[] }>(
        `/api/competitions/${competition.slug}/fixtures`
      )
    ])
      .then(([lb, fx]) => {
        setRows(lb.leaderboard);
        const completed = fx.fixtures.filter((f) => f.status === "completed");
        setFixtures(completed);
        if (completed[0]) setSelectedFixtureId(completed[0].id);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load."))
      .finally(() => setLoading(false));
  }, [competition?.slug]);

  useEffect(() => {
    if (!competition?.slug || !selectedFixtureId) return;
    setMatchdayLoading(true);
    apiFetch<{ leaderboard: LeaderboardRow[] }>(
      `/api/competitions/${competition.slug}/leaderboard?fixtureId=${selectedFixtureId}`
    )
      .then((d) => setMatchdayRows(d.leaderboard))
      .catch(() => setMatchdayRows([]))
      .finally(() => setMatchdayLoading(false));
  }, [competition?.slug, selectedFixtureId]);

  if (authLoading || loading) {
    return (
      <div className="page">
        <div className="loading-dots">Loading</div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-header">
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "16px", flexWrap: "wrap" }}>
          <div>
            <h1 className="page-title">Leaderboard</h1>
            <p className="page-subtitle">
              {competition?.name ?? "Competition"} · {rows.length} entries
            </p>
          </div>
          {rows.length > 0 && (
            <button
              className="btn-outline btn-sm"
              onClick={() => downloadCsv(rows, `leaderboard-${competition?.slug ?? "export"}.csv`)}
            >
              Export CSV
            </button>
          )}
        </div>
      </div>

      {error ? <p className="notice notice-error">{error}</p> : null}

      <div className="admin-tabs">
        <button
          className={`admin-tab ${tab === "overall" ? "active" : ""}`}
          onClick={() => setTab("overall")}
        >
          Overall
        </button>
        <button
          className={`admin-tab ${tab === "matchday" ? "active" : ""}`}
          onClick={() => setTab("matchday")}
          disabled={fixtures.length === 0}
          title={fixtures.length === 0 ? "No scored fixtures yet" : undefined}
        >
          By fixture
          {fixtures.length === 0 ? " (none scored)" : ""}
        </button>
      </div>

      {tab === "overall" && (
        <LeaderboardTable rows={rows} myUserId={user?.id} />
      )}

      {tab === "matchday" && (
        <div>
          <div className="filter-bar" style={{ marginBottom: "16px" }}>
            <select
              className="form-input"
              style={{ minHeight: "38px" }}
              value={selectedFixtureId}
              onChange={(e) => setSelectedFixtureId(e.target.value)}
            >
              {fixtures.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.team1Name ?? "?"} vs {f.team2Name ?? "?"}
                </option>
              ))}
            </select>
          </div>
          {matchdayLoading ? (
            <div className="loading-dots">Loading</div>
          ) : (
            <LeaderboardTable rows={matchdayRows} myUserId={user?.id} />
          )}
        </div>
      )}
    </div>
  );
}
