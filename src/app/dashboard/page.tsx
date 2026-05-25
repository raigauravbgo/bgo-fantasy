"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { TrendUp, Medal, UsersThree, Lock, SoccerBall } from "@phosphor-icons/react";

import { useRequireAuth } from "@/lib/auth-context";
import { apiFetch } from "@/lib/api";
import type { Announcement, DashboardData, Fixture } from "@/lib/types";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function FixtureItem({ fixture }: { fixture: Fixture }) {
  return (
    <div className="fixture-row">
      <div>
        <div className="fixture-team">{fixture.team1Name ?? "TBC"}</div>
        <div className="fixture-meta">{formatDate(fixture.startTime)}</div>
      </div>
      <div className="fixture-score">
        {fixture.score != null
          ? `${fixture.score.team1 ?? 0} – ${fixture.score.team2 ?? 0}`
          : fixture.status === "upcoming"
          ? "vs"
          : "–"}
      </div>
      <div>
        <div className="fixture-team fixture-team-away">
          {fixture.team2Name ?? "TBC"}
        </div>
        <div className="fixture-meta" style={{ textAlign: "right" }}>
          {fixture.venue ?? ""}
        </div>
      </div>
    </div>
  );
}

function AnnouncementItem({ item }: { item: Announcement }) {
  return (
    <div className={`announcement ${item.priority === "high" ? "high" : ""}`}>
      {item.title ? (
        <div className="announcement-title">
          {item.icon ? `${item.icon} ` : ""}
          {item.title}
        </div>
      ) : null}
      <div className="announcement-body">{item.message}</div>
    </div>
  );
}

export default function DashboardPage() {
  const { user, competition, loading: authLoading } = useRequireAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (competition?.slug) {
      setLoading(true);
      setError("");
      apiFetch<DashboardData>(`/api/competitions/${competition.slug}/dashboard`)
        .then(setData)
        .catch((err) =>
          setError(err instanceof Error ? err.message : "Failed to load dashboard.")
        )
        .finally(() => setLoading(false));
    }
  }, [competition?.slug]);

  if (authLoading || loading) {
    return (
      <div className="page">
        <div className="loading-dots">Loading</div>
      </div>
    );
  }

  if (!competition) {
    return (
      <div className="page">
        <p className="empty-state">No active competition found. Ask an admin to create one.</p>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Dashboard</h1>
        <p className="page-subtitle">
          {competition.name} · Welcome back, {user?.name}
        </p>
      </div>

      {error ? <p className="notice notice-error">{error}</p> : null}

      {/* Stat tiles */}
      <div className="stat-tiles">
        {/* Points */}
        <motion.div
          className="stat-tile"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05, duration: 0.2 }}
          style={{ borderTop: "3px solid hsl(var(--brand))", position: "relative", overflow: "hidden" }}
        >
          <div style={{ position: "absolute", top: 14, right: 14, color: "hsl(var(--brand) / 0.25)" }}>
            <TrendUp size={32} weight="bold" />
          </div>
          <div className="stat-label">Total Points</div>
          <div className="stat-value" style={{ color: "hsl(var(--ink))" }}>
            {data?.totalPoints ?? 0}
          </div>
          <div className="stat-sub">competition total</div>
        </motion.div>

        {/* Rank */}
        <motion.div
          className="stat-tile"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.2 }}
          style={{ borderTop: "3px solid hsl(var(--accent2))", position: "relative", overflow: "hidden" }}
        >
          <div style={{ position: "absolute", top: 14, right: 14, color: "hsl(var(--accent2) / 0.25)" }}>
            <Medal size={32} weight="bold" />
          </div>
          <div className="stat-label">Rank</div>
          <div className="stat-value" style={{ color: data?.rank != null && data.rank <= 3 ? "hsl(var(--accent2))" : "hsl(var(--ink))" }}>
            {data?.rank != null ? `#${data.rank}` : "—"}
          </div>
          <div className="stat-sub">overall leaderboard</div>
        </motion.div>

        {/* Squad */}
        <motion.div
          className="stat-tile"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.2 }}
          style={{ borderTop: "3px solid hsl(var(--pos-def))", position: "relative", overflow: "hidden" }}
        >
          <div style={{ position: "absolute", top: 14, right: 14, color: "hsl(var(--pos-def) / 0.25)" }}>
            <UsersThree size={32} weight="bold" />
          </div>
          <div className="stat-label">Squad</div>
          <div className="stat-value">
            {data?.entry ? data.entry.playerIds.length : 0}
            <span style={{ fontSize: "1rem", fontWeight: 500, color: "hsl(var(--ink-muted))" }}>/11</span>
          </div>
          <div className="stat-sub">players selected</div>
        </motion.div>

        {/* Status */}
        <motion.div
          className="stat-tile"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.2 }}
          style={{
            borderTop: `3px solid ${data?.entry?.locked ? "hsl(var(--ok))" : "hsl(var(--warn))"}`,
            position: "relative", overflow: "hidden",
          }}
        >
          <div style={{ position: "absolute", top: 14, right: 14, color: data?.entry?.locked ? "hsl(var(--ok) / 0.25)" : "hsl(var(--warn) / 0.2)" }}>
            <Lock size={32} weight="bold" />
          </div>
          <div className="stat-label">Status</div>
          <div className="stat-value" style={{ fontSize: "1.1rem", marginTop: 4 }}>
            {data?.entry?.locked ? (
              <span className="badge badge-locked">Locked</span>
            ) : (
              <span className="badge badge-draft">Draft</span>
            )}
          </div>
          <div className="stat-sub">
            {data?.entry?.locked ? "squad is locked" : "squad not yet locked"}
          </div>
        </motion.div>
      </div>

      {/* Announcements */}
      {data?.announcements && data.announcements.length > 0 ? (
        <div style={{ marginBottom: "24px" }}>
          <div className="section-title">Announcements</div>
          {data.announcements.map((a) => (
            <AnnouncementItem key={a.id} item={a} />
          ))}
        </div>
      ) : null}

      <div className="dashboard-grid">
        {/* Main column */}
        <div>
          {/* Call-to-action if no squad */}
          {!data?.entry ? (
            competition.registrationOpen ? (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.25 }}
                style={{
                  marginBottom: 20,
                  background: "hsl(var(--surface-raised))",
                  border: "1px solid hsl(var(--brand) / 0.3)",
                  borderRadius: 16,
                  padding: "36px 32px",
                  textAlign: "center",
                  position: "relative",
                  overflow: "hidden",
                  boxShadow: "0 0 40px hsl(var(--brand) / 0.08), 0 1px 0 0 hsl(var(--surface-overlay)) inset",
                }}
              >
                {/* Background glow */}
                <div style={{
                  position: "absolute", inset: 0, pointerEvents: "none",
                  background: "radial-gradient(ellipse 70% 60% at 50% 0%, hsl(var(--brand-muted) / 0.35), transparent)",
                }} />
                <div style={{ position: "relative" }}>
                  <SoccerBall
                    size={44}
                    weight="duotone"
                    style={{ color: "hsl(var(--brand))", marginBottom: 12 }}
                  />
                  <div style={{ fontSize: "1.2rem", fontWeight: 800, marginBottom: 8, letterSpacing: "-0.01em" }}>
                    Join the competition
                  </div>
                  <p style={{ color: "hsl(var(--ink-muted))", fontSize: "0.875rem", marginBottom: 24, lineHeight: 1.6 }}>
                    Pick {competition.settings?.squadSize ?? 11} players within the £{competition.settings?.budget ?? 100}m budget,
                    choose your captain, and lock your squad before the deadline.
                  </p>
                  <Link className="btn" href="/squad" style={{ fontSize: "0.9rem", minHeight: 42, padding: "0 28px" }}>
                    Build my squad
                  </Link>
                </div>
              </motion.div>
            ) : (
              <div
                className="card"
                style={{ marginBottom: 20, textAlign: "center", padding: 32, borderColor: "hsl(var(--line-strong))" }}
              >
                <Lock size={36} weight="thin" style={{ color: "hsl(var(--ink-muted))", marginBottom: 12 }} />
                <div style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: 8 }}>
                  Registration is closed
                </div>
                <p className="card-muted">
                  New entries are not being accepted right now. Contact an admin if you think this is a mistake.
                </p>
              </div>
            )
          ) : null}

          {/* Upcoming fixtures */}
          <div className="section-title">Upcoming Fixtures</div>
          {data?.upcomingFixtures && data.upcomingFixtures.length > 0 ? (
            data.upcomingFixtures.map((f) => (
              <FixtureItem key={f.id} fixture={f} />
            ))
          ) : (
            <p className="card-muted" style={{ marginBottom: "20px" }}>
              No upcoming fixtures.
            </p>
          )}

          {/* Recent results */}
          {data?.recentFixtures && data.recentFixtures.length > 0 ? (
            <>
              <div className="section-title" style={{ marginTop: "24px" }}>
                Recent Results
              </div>
              {data.recentFixtures.map((f) => (
                <FixtureItem key={f.id} fixture={f} />
              ))}
            </>
          ) : null}
        </div>

        {/* Sidebar */}
        <div className="stack">
          {data?.entry ? (
            <div className="card">
              <div className="card-title">My Squad</div>
              <dl style={{ display: "grid", gap: "10px", margin: 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <dt style={{ color: "var(--muted)", fontSize: "0.85rem" }}>
                    Squad name
                  </dt>
                  <dd style={{ margin: 0, fontWeight: 700 }}>
                    {data.entry.name}
                  </dd>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <dt style={{ color: "var(--muted)", fontSize: "0.85rem" }}>
                    Budget used
                  </dt>
                  <dd style={{ margin: 0, fontWeight: 700 }}>
                    {data.entry.budgetUsed}/100
                  </dd>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <dt style={{ color: "var(--muted)", fontSize: "0.85rem" }}>
                    Players
                  </dt>
                  <dd style={{ margin: 0, fontWeight: 700 }}>
                    {data.entry.playerIds.length}/11
                  </dd>
                </div>
              </dl>
              <hr className="divider" />
              <Link className="btn-outline" href="/squad" style={{ display: "block", textAlign: "center" }}>
                {data.entry.locked ? "View squad" : "Edit squad"}
              </Link>
            </div>
          ) : null}

          {competition.lockDeadline ? (
            <div className="card">
              <div className="card-title">Lock Deadline</div>
              <p style={{ fontWeight: 700, fontSize: "1rem" }}>
                {formatDate(competition.lockDeadline)}
              </p>
              <p className="card-muted" style={{ marginTop: "6px" }}>
                Lock your squad before this deadline.
              </p>
            </div>
          ) : null}

          {competition.settings?.transferWindow?.active ? (
            <div className="card" style={{ borderColor: "var(--warn)" }}>
              <div className="card-title">Transfer Window Open</div>
              <p style={{ color: "var(--muted)", fontSize: "0.875rem" }}>
                You can make up to{" "}
                <strong>
                  {competition.settings.transferWindow.maxTransfers}
                </strong>{" "}
                transfers.
                {data?.entry
                  ? ` You have used ${data.entry.transferUsage} so far.`
                  : ""}
              </p>
              <Link
                className="btn-outline"
                href="/squad"
                style={{ display: "block", textAlign: "center", marginTop: "12px" }}
              >
                Make transfers
              </Link>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
