"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useRequireAuth } from "@/lib/auth-context";
import { apiFetch } from "@/lib/api";
import type { FixtureDetail, PointBreakdown } from "@/lib/types";

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

export default function FixtureDetailPage() {
  const { competition, loading: authLoading } = useRequireAuth();
  const params = useParams();
  const fixtureId = params.id as string;

  const [data, setData] = useState<FixtureDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

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
          {/* Match header */}
          <div className="card" style={{ marginBottom: "24px", textAlign: "center" }}>
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

          {/* Player points */}
          {data && data.playerPoints.length > 0 ? (
            <>
              <div className="section-title">Player Points</div>
              <div className="card" style={{ padding: 0, overflow: "hidden" }}>
                <table className="lb-table">
                  <thead>
                    <tr>
                      <th>Player</th>
                      <th>Pos</th>
                      <th>Country</th>
                      <th style={{ textAlign: "right" }}>Points</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.playerPoints.map((pp) => (
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
            </>
          ) : fixture.status === "completed" ? (
            <p className="card-muted">
              No player points have been published for this fixture yet.
            </p>
          ) : (
            <p className="card-muted">
              Points will appear here after the match is completed and scored.
            </p>
          )}
        </>
      ) : !error ? (
        <p className="empty-state">Fixture not found.</p>
      ) : null}
    </div>
  );
}
