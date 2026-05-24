"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRequireAuth } from "@/lib/auth-context";
import { apiFetch } from "@/lib/api";
import type { Fixture } from "@/lib/types";

const STATUS_ORDER = ["live", "upcoming", "completed", "postponed", "cancelled"];

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function FixtureCard({ fixture }: { fixture: Fixture }) {
  const isCompleted = fixture.status === "completed";

  return (
    <Link href={`/fixtures/${fixture.id}`} style={{ display: "block", textDecoration: "none" }}>
    <div className="fixture-row">
      <div>
        <div className="fixture-team">{fixture.team1Name ?? "TBC"}</div>
        <div className="fixture-meta">{formatDate(fixture.startTime)}</div>
        {fixture.venue ? (
          <div className="fixture-meta">{fixture.venue}</div>
        ) : null}
      </div>

      <div style={{ textAlign: "center" }}>
        <div className="fixture-score">
          {isCompleted && fixture.score != null
            ? `${fixture.score.team1 ?? 0} – ${fixture.score.team2 ?? 0}`
            : fixture.status === "live"
            ? "LIVE"
            : "vs"}
        </div>
        <div style={{ marginTop: "6px" }}>
          <span className={`badge badge-${fixture.status}`}>
            {fixture.status}
          </span>
        </div>
      </div>

      <div style={{ textAlign: "right" }}>
        <div className="fixture-team fixture-team-away">
          {fixture.team2Name ?? "TBC"}
        </div>
        {isCompleted && fixture.result?.winnerTeamId ? (
          <div className="fixture-meta">
            {fixture.result.winnerTeamId === "draw"
              ? "Draw"
              : fixture.result.winnerTeamId === fixture.team1Id
              ? `${fixture.team1Name ?? "Team 1"} win`
              : `${fixture.team2Name ?? "Team 2"} win`}
          </div>
        ) : null}
      </div>
    </div>
    </Link>
  );
}

export default function FixturesPage() {
  const { competition, loading: authLoading } = useRequireAuth();
  const [fixtures, setFixtures] = useState<Fixture[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!competition?.slug) return;
    setLoading(true);
    apiFetch<{ fixtures: Fixture[] }>(`/api/competitions/${competition.slug}/fixtures`)
      .then((d) => setFixtures(d.fixtures))
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Failed to load fixtures.")
      )
      .finally(() => setLoading(false));
  }, [competition?.slug]);

  const sorted = [...fixtures].sort((a, b) => {
    const ai = STATUS_ORDER.indexOf(a.status);
    const bi = STATUS_ORDER.indexOf(b.status);
    if (ai !== bi) return ai - bi;
    return new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
  });

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
        <h1 className="page-title">Fixtures</h1>
        <p className="page-subtitle">
          {competition?.name ?? "Competition"} · {fixtures.length} matches
        </p>
      </div>

      {error ? <p className="notice notice-error">{error}</p> : null}

      {sorted.length === 0 ? (
        <p className="empty-state">No fixtures have been added yet.</p>
      ) : (
        sorted.map((f) => <FixtureCard key={f.id} fixture={f} />)
      )}
    </div>
  );
}
