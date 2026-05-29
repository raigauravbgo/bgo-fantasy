"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useRequireAuth } from "@/lib/auth-context";
import { apiFetch } from "@/lib/api";
import type { FixtureDetail, PlayerStatDisplay, PointBreakdown } from "@/lib/types";

type Tab = "match" | "stats" | "points";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function Breakdown({ items }: { items: PointBreakdown[] }) {
  const categories = [...new Set(items.map((i) => i.category))];
  return (
    <div style={{ fontSize: "0.78rem", marginTop: "4px" }}>
      {categories.map((cat) => {
        const catItems = items.filter((i) => i.category === cat);
        return (
          <div key={cat} style={{ marginBottom: "2px" }}>
            {catItems.map((item, idx) => (
              <span
                key={idx}
                style={{
                  marginRight: "8px",
                  color: item.total < 0 ? "var(--error)" : "var(--muted)"
                }}
              >
                {item.label}: {item.total > 0 ? "+" : ""}
                {item.total}
              </span>
            ))}
          </div>
        );
      })}
    </div>
  );
}

function StatCell({ value, label }: { value: number | boolean | undefined; label: string }) {
  if (value === undefined || value === null || value === false || value === 0) {
    return <span style={{ color: "hsl(var(--ink-muted))", fontSize: "0.8rem" }}>—</span>;
  }
  return (
    <span title={label} style={{ fontWeight: 700, fontSize: "0.85rem" }}>
      {typeof value === "boolean" ? "✓" : value}
    </span>
  );
}

function PlayerStatsTable({ playerStats }: { playerStats: PlayerStatDisplay[] }) {
  const posOrder: Record<string, number> = { GK: 0, DEF: 1, MID: 2, FWD: 3 };
  const sorted = [...playerStats].sort(
    (a, b) => (posOrder[a.position] ?? 4) - (posOrder[b.position] ?? 4)
  );

  if (sorted.length === 0) {
    return <p className="card-muted">No match stats available for this fixture.</p>;
  }

  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      <table className="lb-table">
        <thead>
          <tr>
            <th>Player</th>
            <th style={{ textAlign: "center" }}>Min</th>
            <th style={{ textAlign: "center" }}>G</th>
            <th style={{ textAlign: "center" }}>A</th>
            <th style={{ textAlign: "center" }}>YC</th>
            <th style={{ textAlign: "center" }}>RC</th>
            <th style={{ textAlign: "center" }}>Sv</th>
            <th style={{ textAlign: "center" }}>CS</th>
            <th style={{ textAlign: "center" }}>GA</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((ps) => (
            <tr key={ps.playerId}>
              <td>
                <div style={{ fontWeight: 700, fontSize: "0.85rem" }}>{ps.playerName}</div>
                <div style={{ display: "flex", gap: 5, marginTop: 2, alignItems: "center" }}>
                  <span
                    className={`badge badge-${ps.position.toLowerCase()}`}
                    style={{ fontSize: "0.65rem" }}
                  >
                    {ps.position}
                  </span>
                  {ps.teamShortName ? (
                    <span style={{ fontSize: "0.72rem", color: "hsl(var(--ink-muted))" }}>
                      {ps.teamShortName}
                    </span>
                  ) : null}
                  {ps.stats.started === false && (
                    <span style={{ fontSize: "0.65rem", color: "hsl(var(--ink-muted))" }}>Sub</span>
                  )}
                </div>
              </td>
              <td style={{ textAlign: "center" }}>
                <StatCell value={ps.stats.minutesPlayed} label="Minutes played" />
              </td>
              <td style={{ textAlign: "center" }}>
                <StatCell value={ps.stats.goals} label="Goals" />
              </td>
              <td style={{ textAlign: "center" }}>
                <StatCell value={ps.stats.assists} label="Assists" />
              </td>
              <td style={{ textAlign: "center" }}>
                <StatCell value={ps.stats.yellowCards} label="Yellow cards" />
              </td>
              <td style={{ textAlign: "center" }}>
                <StatCell value={ps.stats.redCards} label="Red cards" />
              </td>
              <td style={{ textAlign: "center" }}>
                <StatCell value={ps.stats.saves} label="Saves" />
              </td>
              <td style={{ textAlign: "center" }}>
                <StatCell value={ps.stats.cleanSheet} label="Clean sheet" />
              </td>
              <td style={{ textAlign: "center" }}>
                <StatCell value={ps.stats.goalsConceded} label="Goals allowed" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function FixtureDetailPage() {
  const { competition, loading: authLoading } = useRequireAuth();
  const params = useParams();
  const fixtureId = params.id as string;

  const [data, setData] = useState<FixtureDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<Tab>("match");

  useEffect(() => {
    if (!competition?.slug || !fixtureId) return;
    setLoading(true);
    apiFetch<FixtureDetail>(
      `/api/competitions/${competition.slug}/fixtures/${fixtureId}`
    )
      .then(setData)
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Failed to load fixture.")
      )
      .finally(() => setLoading(false));
  }, [competition?.slug, fixtureId]);

  if (authLoading || loading) {
    return (
      <div className="page">
        <div className="loading-dots">Loading</div>
      </div>
    );
  }

  const fixture = data?.fixture;
  const hasStats = (data?.playerStats?.length ?? 0) > 0;
  const hasPoints = (data?.playerPoints?.length ?? 0) > 0;

  return (
    <div className="page">
      <div style={{ marginBottom: "20px" }}>
        <Link
          href="/fixtures"
          style={{ color: "var(--muted)", fontSize: "0.85rem", fontWeight: 600 }}
        >
          ← Back to fixtures
        </Link>
      </div>

      {error ? <p className="notice notice-error">{error}</p> : null}

      {fixture ? (
        <>
          {/* Match header — always visible */}
          <div className="card" style={{ marginBottom: "20px", textAlign: "center" }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr auto 1fr",
                gap: "20px",
                alignItems: "center",
                padding: "8px 0"
              }}
            >
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: "1.5rem", fontWeight: 900 }}>
                  {fixture.team1Name ?? "TBC"}
                </div>
              </div>
              <div>
                {fixture.status === "completed" && fixture.score != null ? (
                  <div
                    style={{
                      fontSize: "2.5rem",
                      fontWeight: 900,
                      lineHeight: 1,
                      padding: "8px 16px",
                      background: "var(--surface-strong)",
                      borderRadius: "10px"
                    }}
                  >
                    {fixture.score.team1 ?? 0} – {fixture.score.team2 ?? 0}
                  </div>
                ) : (
                  <div style={{ fontSize: "1.2rem", color: "var(--muted)", fontWeight: 700 }}>
                    vs
                  </div>
                )}
                <div style={{ marginTop: "8px" }}>
                  <span className={`badge badge-${fixture.status}`}>
                    {fixture.status}
                  </span>
                </div>
              </div>
              <div style={{ textAlign: "left" }}>
                <div style={{ fontSize: "1.5rem", fontWeight: 900 }}>
                  {fixture.team2Name ?? "TBC"}
                </div>
              </div>
            </div>
            <div
              style={{ color: "var(--muted)", fontSize: "0.85rem", marginTop: "12px" }}
            >
              {formatDate(fixture.startTime)}
              {fixture.venue ? ` · ${fixture.venue}` : ""}
            </div>
            {fixture.result?.winnerTeamId ? (
              <div
                style={{ fontWeight: 700, marginTop: "6px", color: "var(--success)" }}
              >
                {fixture.result.winnerTeamId === "draw"
                  ? "Full-time: Draw"
                  : fixture.result.winnerTeamId === fixture.team1Id
                  ? `${fixture.team1Name ?? "Team 1"} win`
                  : `${fixture.team2Name ?? "Team 2"} win`}
              </div>
            ) : null}
          </div>

          {/* Tabs — only show when there's something to tab between */}
          {(hasStats || hasPoints) && (
            <div className="admin-tabs" style={{ marginBottom: "16px" }}>
              <button
                className={`admin-tab ${activeTab === "match" ? "active" : ""}`}
                onClick={() => setActiveTab("match")}
              >
                Match Info
              </button>
              {hasStats && (
                <button
                  className={`admin-tab ${activeTab === "stats" ? "active" : ""}`}
                  onClick={() => setActiveTab("stats")}
                >
                  Player Stats
                </button>
              )}
              {hasPoints && (
                <button
                  className={`admin-tab ${activeTab === "points" ? "active" : ""}`}
                  onClick={() => setActiveTab("points")}
                >
                  Fantasy Points
                </button>
              )}
            </div>
          )}

          {/* Tab: Match Info */}
          {activeTab === "match" && (
            <div>
              {!hasStats && !hasPoints && fixture.status !== "completed" && (
                <p className="card-muted">
                  Stats and fantasy points will appear here after the match is completed and scored.
                </p>
              )}
              {!hasStats && !hasPoints && fixture.status === "completed" && (
                <p className="card-muted">
                  No stats have been published for this fixture yet.
                </p>
              )}
            </div>
          )}

          {/* Tab: Player Stats */}
          {activeTab === "stats" && hasStats && (
            <>
              <div style={{
                fontSize: "0.72rem", color: "hsl(var(--ink-muted))", marginBottom: 10,
                fontWeight: 600, letterSpacing: "0.03em"
              }}>
                G = Goals · A = Assists · YC = Yellow cards · RC = Red cards · Sv = Saves · CS = Clean sheet · GA = Goals allowed
              </div>
              <PlayerStatsTable playerStats={data?.playerStats ?? []} />
            </>
          )}

          {/* Tab: Fantasy Points */}
          {activeTab === "points" && hasPoints && (
            <div className="card" style={{ padding: 0, overflow: "hidden" }}>
              <table className="lb-table">
                <thead>
                  <tr>
                    <th>Player</th>
                    <th>Pos</th>
                    <th>Club</th>
                    <th style={{ textAlign: "right" }}>Points</th>
                  </tr>
                </thead>
                <tbody>
                  {data!.playerPoints.map((pp) => (
                    <tr key={pp.id}>
                      <td>
                        <div style={{ fontWeight: 700 }}>{pp.player.name}</div>
                        {pp.breakdown.length > 0 ? (
                          <Breakdown items={pp.breakdown} />
                        ) : null}
                      </td>
                      <td>
                        <span
                          className={`badge badge-${pp.player.position.toLowerCase()}`}
                        >
                          {pp.player.position}
                        </span>
                      </td>
                      <td style={{ color: "var(--muted)", fontSize: "0.85rem" }}>
                        {pp.player.teamShortName ?? "—"}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <span
                          className="lb-pts"
                          style={{ color: pp.points < 0 ? "var(--error)" : undefined }}
                        >
                          {pp.points > 0 ? "+" : ""}
                          {pp.points}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : !error ? (
        <p className="empty-state">Fixture not found.</p>
      ) : null}
    </div>
  );
}
