"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { MapPin, CalendarBlank, Trophy } from "@phosphor-icons/react";
import { useRequireAuth } from "@/lib/auth-context";
import { apiFetch } from "@/lib/api";
import type { Fixture } from "@/lib/types";

const STATUS_ORDER = ["live", "upcoming", "completed", "postponed", "cancelled"];

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/* Derive a 2-3 char abbreviation + deterministic hue from any team name/id */
function teamAbbr(name: string): string {
  const words = name.trim().split(/\s+/);
  if (words.length === 1) return name.slice(0, 3).toUpperCase();
  return words
    .filter((w) => !["FC", "SC", "CA", "CR", "EC", "FR", "FBPA"].includes(w.toUpperCase()))
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

const TEAM_HUES: Record<string, number> = {};
function teamHue(id: string): number {
  if (TEAM_HUES[id] != null) return TEAM_HUES[id];
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) & 0xffff;
  TEAM_HUES[id] = (h % 300) + 10; // avoid pure red collision with danger
  return TEAM_HUES[id];
}

function TeamChip({ name, id, align = "left" }: { name: string; id?: string; align?: "left" | "right" }) {
  const abbr = teamAbbr(name ?? "");
  const hue = teamHue(id ?? name ?? "");
  const bg = `hsl(${hue} 60% 22%)`;
  const border = `hsl(${hue} 60% 36%)`;
  const fg = `hsl(${hue} 80% 80%)`;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "10px",
        flexDirection: align === "right" ? "row-reverse" : "row",
      }}
    >
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: "50%",
          background: bg,
          border: `1.5px solid ${border}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "0.6rem",
          fontWeight: 900,
          color: fg,
          letterSpacing: "0.04em",
          flexShrink: 0,
        }}
      >
        {abbr}
      </div>
      <span
        style={{
          fontWeight: 700,
          fontSize: "0.9rem",
          textAlign: align === "right" ? "right" : "left",
          lineHeight: 1.2,
        }}
      >
        {name ?? "TBC"}
      </span>
    </div>
  );
}

function ScoreChip({ fixture }: { fixture: Fixture }) {
  const isLive = fixture.status === "live";
  const isCompleted = fixture.status === "completed";

  if (isLive) {
    return (
      <div style={{ textAlign: "center" }}>
        <div
          style={{
            background: "hsl(var(--live-bg))",
            border: "1px solid hsl(var(--live) / 0.5)",
            borderRadius: 8,
            padding: "6px 14px",
            boxShadow: "0 0 16px hsl(var(--live) / 0.35)",
            display: "inline-block",
          }}
        >
          <div
            className="live-dot"
            style={{
              color: "hsl(var(--live))",
              fontSize: "0.75rem",
              fontWeight: 800,
              letterSpacing: "0.06em",
            }}
          >
            LIVE
          </div>
          {fixture.score != null && (
            <div
              style={{
                color: "hsl(var(--live))",
                fontSize: "1.4rem",
                fontWeight: 900,
                lineHeight: 1,
                fontVariantNumeric: "tabular-nums",
                marginTop: 2,
              }}
            >
              {fixture.score.team1} – {fixture.score.team2}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (isCompleted && fixture.score != null) {
    return (
      <div style={{ textAlign: "center" }}>
        <div
          style={{
            background: "hsl(var(--surface-sunken))",
            border: "1px solid hsl(var(--line-strong))",
            borderRadius: 8,
            padding: "6px 18px",
            display: "inline-block",
          }}
        >
          <div
            style={{
              fontSize: "1.5rem",
              fontWeight: 900,
              color: "hsl(var(--ink))",
              fontVariantNumeric: "tabular-nums",
              letterSpacing: "-0.02em",
              lineHeight: 1,
            }}
          >
            {fixture.score.team1} – {fixture.score.team2}
          </div>
          {fixture.result?.winnerTeamId && (
            <div
              style={{
                fontSize: "0.6rem",
                fontWeight: 700,
                color: "hsl(var(--ink-muted))",
                letterSpacing: "0.05em",
                textTransform: "uppercase",
                marginTop: 3,
                textAlign: "center",
              }}
            >
              {fixture.result.winnerTeamId === "draw"
                ? "Draw"
                : fixture.result.winnerTeamId === fixture.team1Id
                ? "Home win"
                : "Away win"}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{ textAlign: "center" }}>
      <div
        style={{
          background: "hsl(var(--surface-overlay))",
          border: "1px solid hsl(var(--line))",
          borderRadius: 8,
          padding: "6px 16px",
          display: "inline-block",
          color: "hsl(var(--ink-muted))",
          fontSize: "0.8rem",
          fontWeight: 700,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
        }}
      >
        vs
      </div>
    </div>
  );
}

function FixtureCard({ fixture, index }: { fixture: Fixture; index: number }) {
  const isLive = fixture.status === "live";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, delay: index * 0.03, ease: [0.16, 1, 0.3, 1] }}
    >
      <Link href={`/fixtures/${fixture.id}`} style={{ display: "block", textDecoration: "none" }}>
        <div
          style={{
            background: "hsl(var(--surface-raised))",
            border: `1px solid ${isLive ? "hsl(var(--live) / 0.4)" : "hsl(var(--line))"}`,
            borderRadius: 12,
            marginBottom: 10,
            overflow: "hidden",
            transition: "border-color 140ms ease, transform 140ms cubic-bezier(0.16,1,0.3,1), box-shadow 140ms ease",
            boxShadow: isLive
              ? "0 0 24px hsl(var(--live) / 0.15), 0 1px 0 0 hsl(var(--surface-overlay)) inset"
              : "0 1px 0 0 hsl(var(--surface-overlay)) inset, 0 4px 12px hsl(220 40% 3% / 0.35)",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLDivElement).style.transform = "translateY(-2px)";
            (e.currentTarget as HTMLDivElement).style.borderColor = isLive
              ? "hsl(var(--live) / 0.7)"
              : "hsl(var(--brand) / 0.4)";
            (e.currentTarget as HTMLDivElement).style.boxShadow = "0 8px 28px hsl(220 40% 3% / 0.5)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLDivElement).style.transform = "";
            (e.currentTarget as HTMLDivElement).style.borderColor = isLive
              ? "hsl(var(--live) / 0.4)"
              : "hsl(var(--line))";
            (e.currentTarget as HTMLDivElement).style.boxShadow = isLive
              ? "0 0 24px hsl(var(--live) / 0.15), 0 1px 0 0 hsl(var(--surface-overlay)) inset"
              : "0 1px 0 0 hsl(var(--surface-overlay)) inset, 0 4px 12px hsl(220 40% 3% / 0.35)";
          }}
        >
          {/* Meta bar */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "8px 16px",
              background: "hsl(var(--surface-sunken))",
              borderBottom: "1px solid hsl(var(--line))",
              gap: 12,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <CalendarBlank
                size={13}
                weight="bold"
                style={{ color: "hsl(var(--ink-muted))", flexShrink: 0 }}
              />
              <span
                style={{
                  fontSize: "0.72rem",
                  color: "hsl(var(--ink-secondary))",
                  fontWeight: 600,
                }}
              >
                {formatDate(fixture.startTime)}
              </span>
              {fixture.venue && (
                <>
                  <span style={{ color: "hsl(var(--line-strong))" }}>·</span>
                  <MapPin
                    size={11}
                    weight="bold"
                    style={{ color: "hsl(var(--ink-muted))", flexShrink: 0 }}
                  />
                  <span
                    style={{
                      fontSize: "0.72rem",
                      color: "hsl(var(--ink-muted))",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      maxWidth: 200,
                    }}
                  >
                    {fixture.venue}
                  </span>
                </>
              )}
            </div>
            <span className={`badge badge-${fixture.status}`}>{fixture.status}</span>
          </div>

          {/* Matchup row */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr auto 1fr",
              alignItems: "center",
              gap: 16,
              padding: "16px 20px",
            }}
          >
            <TeamChip name={fixture.team1Name ?? "TBC"} id={fixture.team1Id} align="left" />
            <ScoreChip fixture={fixture} />
            <TeamChip name={fixture.team2Name ?? "TBC"} id={fixture.team2Id} align="right" />
          </div>
        </div>
      </Link>
    </motion.div>
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
        <div
          style={{
            display: "grid",
            gap: 10,
          }}
        >
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="skeleton"
              style={{ height: 96, borderRadius: 12 }}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <motion.div
        className="page-header"
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
      >
        <h1 className="page-title">Fixtures</h1>
        <p className="page-subtitle">
          {competition?.name ?? "Competition"} · {fixtures.length} matches
        </p>
      </motion.div>

      {error ? <p className="notice notice-error">{error}</p> : null}

      {sorted.length === 0 ? (
        <div
          style={{
            textAlign: "center",
            padding: "60px 24px",
            color: "hsl(var(--ink-muted))",
          }}
        >
          <Trophy size={40} weight="thin" style={{ marginBottom: 12, opacity: 0.4 }} />
          <p style={{ fontSize: "0.9rem" }}>No fixtures have been added yet.</p>
        </div>
      ) : (
        sorted.map((f, i) => <FixtureCard key={f.id} fixture={f} index={i} />)
      )}
    </div>
  );
}
