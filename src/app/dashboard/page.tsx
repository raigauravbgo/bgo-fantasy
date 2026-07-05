"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { TrendUp, Medal, Lock, SoccerBall, Trophy } from "@phosphor-icons/react";

import { useRequireAuth } from "@/lib/auth-context";
import { apiFetch } from "@/lib/api";
import type { DashboardData, Fixture, Player } from "@/lib/types";

const POS_COLOR: Record<string, string> = {
  GK: "hsl(var(--pos-gk))", DEF: "hsl(var(--pos-def))",
  MID: "hsl(var(--pos-mid))", FWD: "hsl(var(--pos-fwd))"
};
const POS_BG: Record<string, string> = {
  GK: "hsl(var(--pos-gk-bg))", DEF: "hsl(var(--pos-def-bg))",
  MID: "hsl(var(--pos-mid-bg))", FWD: "hsl(var(--pos-fwd-bg))"
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function FixtureItem({ fixture, pts }: { fixture: Fixture; pts?: number | null }) {
  return (
    <Link
      href={`/fixtures/${fixture.id}`}
      style={{ textDecoration: "none", color: "inherit" }}
    >
      <div className="fixture-row" style={{ cursor: "pointer" }}>
        <div>
          <div className="fixture-team">{fixture.team1Name ?? "TBC"}</div>
          <div className="fixture-meta">{formatDate(fixture.startTime)}</div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div className="fixture-score">
            {fixture.score != null
              ? `${fixture.score.team1 ?? 0} – ${fixture.score.team2 ?? 0}`
              : fixture.status === "upcoming"
              ? "vs"
              : "–"}
          </div>
          {pts != null && (
            <div style={{
              fontSize: "0.72rem", fontWeight: 800,
              color: pts > 0 ? "hsl(var(--brand))" : "hsl(var(--ink-muted))",
              marginTop: 3
            }}>
              {pts > 0 ? "+" : ""}{pts} pts
            </div>
          )}
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
    </Link>
  );
}


function BudgetBar({ used, total }: { used: number; total: number }) {
  const pct = total > 0 ? Math.min((used / total) * 100, 100) : 0;
  const remaining = total - used;
  const overBudget = remaining < 0;
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
        <span style={{ fontSize: "0.8rem", fontWeight: 700, color: "hsl(var(--ink-muted))" }}>Budget</span>
        <span style={{ fontSize: "0.85rem", fontWeight: 800 }}>
          <span style={{ color: overBudget ? "hsl(var(--danger))" : "hsl(var(--ink))" }}>
            £{used.toFixed(1)}m
          </span>
          <span style={{ color: "hsl(var(--ink-muted))", fontWeight: 600 }}> / £{total}m</span>
        </span>
      </div>
      <div style={{
        height: 8, borderRadius: 4,
        background: "hsl(var(--surface-sunken))",
        overflow: "hidden"
      }}>
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          style={{
            height: "100%",
            borderRadius: 4,
            background: overBudget
              ? "hsl(var(--danger))"
              : pct > 85
              ? "hsl(var(--warn))"
              : "hsl(var(--brand))"
          }}
        />
      </div>
      <div style={{ fontSize: "0.75rem", color: "hsl(var(--ink-muted))", marginTop: 4 }}>
        {overBudget
          ? `£${Math.abs(remaining).toFixed(1)}m over budget`
          : `£${remaining.toFixed(1)}m remaining`}
      </div>
    </div>
  );
}

function SquadPlayerRow({ player, isCaptain, isViceCaptain }: { player: Player; isCaptain: boolean; isViceCaptain: boolean }) {
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "auto 1fr auto",
      gap: 8,
      alignItems: "center",
      padding: "7px 0",
      borderBottom: "1px solid hsl(var(--line))"
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{
          fontSize: "0.6rem", fontWeight: 800, padding: "1px 5px", borderRadius: 3,
          background: POS_BG[player.position] ?? "hsl(var(--surface-overlay))",
          color: POS_COLOR[player.position] ?? "hsl(var(--ink-muted))",
          minWidth: 28, textAlign: "center"
        }}>
          {player.position}
        </span>
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ fontWeight: 700, fontSize: "0.84rem" }}>{player.name}</span>
          {isCaptain && (
            <span style={{
              fontSize: "0.58rem", fontWeight: 900,
              background: "hsl(var(--accent2))", color: "hsl(var(--accent2-fg))",
              borderRadius: 3, padding: "1px 4px"
            }}>C</span>
          )}
          {isViceCaptain && (
            <span style={{
              fontSize: "0.58rem", fontWeight: 900,
              background: "hsl(var(--brand))", color: "hsl(var(--brand-fg))",
              borderRadius: 3, padding: "1px 4px"
            }}>V</span>
          )}
        </div>
        <div style={{ fontSize: "0.72rem", color: "hsl(var(--ink-muted))" }}>
          {player.teamShortName ?? "—"} · £{player.price}m
        </div>
      </div>
      <div style={{
        fontWeight: 800, fontSize: "0.9rem", fontVariantNumeric: "tabular-nums",
        color: (player.totalPoints ?? 0) > 0 ? "hsl(var(--brand))" : "hsl(var(--ink-muted))"
      }}>
        {player.totalPoints ?? 0}
      </div>
    </div>
  );
}

const POS_ORDER: Record<string, number> = { GK: 0, DEF: 1, MID: 2, FWD: 3 };

export default function DashboardPage() {
  const { user, competition, loading: authLoading } = useRequireAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showFullSquad, setShowFullSquad] = useState(false);

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

  const budget = competition.settings?.budget ?? 100;
  const squadSize = competition.settings?.squadSize ?? 15;
  const squadPlayers = (data?.squadPlayers ?? []).sort(
    (a, b) => (POS_ORDER[a.position] ?? 4) - (POS_ORDER[b.position] ?? 4)
  );
  const fixturePointsMap = new Map(
    (data?.fixturePoints ?? []).map((fp) => [fp.fixtureId, fp.points])
  );

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Dashboard</h1>
        <p className="page-subtitle">
          {competition.name} · Welcome back, {user?.name}
        </p>
      </div>

      {error ? <p className="notice notice-error">{error}</p> : null}

      {/* Transfer window banner — pinned at top, always visible on mobile */}
      {competition.settings?.transferWindow?.active && (() => {
        const tw = competition.settings.transferWindow;
        const used = data?.entry?.transferUsage ?? 0;
        const remaining = tw.maxTransfers - used;
        let countdown: string | null = null;
        if (tw.closesAt) {
          const msLeft = new Date(tw.closesAt).getTime() - Date.now();
          if (msLeft > 0) {
            const hrs = Math.floor(msLeft / 3_600_000);
            const mins = Math.floor((msLeft % 3_600_000) / 60_000);
            countdown = hrs > 0 ? `${hrs}h ${mins}m remaining` : `${mins}m remaining`;
          } else {
            countdown = "Closing soon";
          }
        }
        return (
          <>
            <style>{`
              @keyframes tw-glow {
                0%, 100% { box-shadow: 0 0 0 0 hsl(142 60% 45% / 0.5), 0 2px 16px hsl(142 60% 45% / 0.15); }
                50%       { box-shadow: 0 0 0 5px hsl(142 60% 45% / 0), 0 4px 32px hsl(142 60% 45% / 0.35); }
              }
              @keyframes tw-shimmer {
                0%   { transform: translateX(-100%); }
                100% { transform: translateX(200%); }
              }
              .tw-banner { animation: tw-glow 2s ease-in-out infinite; }
              .tw-shimmer { animation: tw-shimmer 2.4s ease-in-out infinite; }
              @keyframes bumper-glow {
                0%, 100% { box-shadow: 0 0 0 0 hsl(45 100% 55% / 0.4), 0 4px 24px hsl(45 100% 55% / 0.15); }
                50% { box-shadow: 0 0 0 6px hsl(45 100% 55% / 0), 0 4px 32px hsl(45 100% 55% / 0.3); }
              }
              @keyframes bumper-shimmer {
                0% { transform: translateX(-100%) skewX(-15deg); }
                100% { transform: translateX(250%) skewX(-15deg); }
              }
              .bumper-banner { animation: bumper-glow 2.2s ease-in-out infinite; }
              .bumper-shimmer { animation: bumper-shimmer 2.8s ease-in-out infinite; }
            `}</style>
            <motion.a
              href="/squad"
              className="tw-banner"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                padding: "14px 18px",
                marginBottom: 16,
                background: "linear-gradient(135deg, hsl(142 55% 38% / 0.18) 0%, hsl(142 60% 50% / 0.08) 100%)",
                border: "2px solid hsl(142 55% 42%)",
                borderRadius: 14,
                textDecoration: "none",
                color: "inherit",
                cursor: "pointer",
                position: "relative",
                overflow: "hidden",
              }}
            >
              {/* shimmer sweep */}
              <div className="tw-shimmer" style={{
                position: "absolute", top: 0, bottom: 0, width: "40%",
                background: "linear-gradient(90deg, transparent, hsl(142 80% 85% / 0.18), transparent)",
                pointerEvents: "none",
              }} />
              <div style={{ display: "flex", alignItems: "center", gap: 12, position: "relative" }}>
                <span style={{ fontSize: 26, lineHeight: 1 }}>🔄</span>
                <div>
                  <div style={{ fontWeight: 800, fontSize: "0.97rem", color: "hsl(142 55% 36%)" }}>
                    Transfer Window Open
                  </div>
                  <div style={{ fontSize: "0.8rem", color: "hsl(var(--ink-muted))", marginTop: 2 }}>
                    {remaining > 0
                      ? `${remaining} transfer${remaining !== 1 ? "s" : ""} remaining (${used} of ${tw.maxTransfers} used)`
                      : `All ${tw.maxTransfers} transfers used`}
                    {countdown ? ` · ⏱ ${countdown}` : ""}
                  </div>
                </div>
              </div>
              <span style={{ fontSize: "1.2rem", color: "hsl(142 55% 42%)", flexShrink: 0, position: "relative" }}>→</span>
            </motion.a>
          </>
        );
      })()}

      {/* Stat tiles */}
      <div className="stat-tiles">
        {/* Rank — prominent */}
        <motion.div
          className="stat-tile"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05, duration: 0.2 }}
          style={{ borderTop: "3px solid hsl(var(--accent2))", position: "relative", overflow: "hidden" }}
        >
          <div style={{ position: "absolute", top: 14, right: 14, color: "hsl(var(--accent2) / 0.25)" }}>
            <Medal size={32} weight="bold" />
          </div>
          <div className="stat-label">Rank</div>
          <div className="stat-value" style={{
            color: data?.rank != null && data.rank <= 3 ? "hsl(var(--accent2))" : "hsl(var(--ink))",
            fontSize: data?.rank != null && data.rank <= 10 ? "2.8rem" : undefined
          }}>
            {data?.rank != null ? `#${data.rank}` : "—"}
          </div>
          <div className="stat-sub">overall leaderboard</div>
        </motion.div>

        {/* Points */}
        <motion.div
          className="stat-tile"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.2 }}
          style={{ borderTop: "3px solid hsl(var(--brand))", position: "relative", overflow: "hidden" }}
        >
          <div style={{ position: "absolute", top: 14, right: 14, color: "hsl(var(--brand) / 0.25)" }}>
            <TrendUp size={32} weight="bold" />
          </div>
          <div className="stat-label">Total Points</div>
          <div className="stat-value" style={{ color: "hsl(var(--ink))" }}>
            {data?.totalPoints ?? 0}
          </div>
          {data?.lastMatchPoints != null && (
            <div className="stat-sub" style={{ color: "hsl(var(--brand))" }}>
              +{data.lastMatchPoints} last match
            </div>
          )}
          {data?.lastMatchPoints == null && (
            <div className="stat-sub">competition total</div>
          )}
        </motion.div>

        {/* Status */}
        <motion.div
          className="stat-tile"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.2 }}
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
            {data?.entry
              ? `${data.entry.playerIds.length}/${squadSize} players`
              : "no squad yet"}
          </div>
        </motion.div>
      </div>

      {/* Bumper predictions banner */}
      {(data?.activeBumperCount ?? 0) > 0 && (
        <motion.a
          href="/bumper"
          className="bumper-banner"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.13, duration: 0.2 }}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "12px",
            padding: "14px 20px",
            marginBottom: 12,
            background: "linear-gradient(135deg, hsl(45 100% 55% / 0.18), hsl(38 100% 50% / 0.08))",
            border: "1px solid hsl(45 100% 55% / 0.5)",
            borderRadius: "14px",
            textDecoration: "none",
            color: "inherit",
            cursor: "pointer",
            overflow: "hidden",
            position: "relative",
          }}
        >
          {/* Shimmer overlay */}
          <div
            className="bumper-shimmer"
            style={{
              position: "absolute",
              inset: 0,
              background: "linear-gradient(90deg, transparent 0%, hsl(45 100% 80% / 0.2) 50%, transparent 100%)",
              width: "40%",
              pointerEvents: "none",
            }}
          />
          <div style={{ display: "flex", alignItems: "center", gap: "12px", position: "relative" }}>
            <span style={{ fontSize: "26px" }}>🏆</span>
            <div>
              <div style={{ fontWeight: 800, fontSize: "1rem", color: "hsl(45 100% 60%)" }}>
                Bumper Predictions — Win up to 400 pts!
              </div>
              <div style={{ fontSize: "0.8rem", color: "hsl(var(--ink-muted))", marginTop: 2 }}>
                Champion · Golden Boot · Final Score — all closing before QF
              </div>
            </div>
          </div>
          <span style={{ fontSize: "1.3rem", color: "hsl(45 100% 60%)", flexShrink: 0, position: "relative" }}>→</span>
        </motion.a>
      )}

      {/* Active predictions banner */}
      {(data?.activePredictionCount ?? 0) > 0 && (
        <motion.a
          href="/predictions"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.2 }}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "12px",
            padding: "14px 18px",
            marginBottom: 16,
            background: "linear-gradient(135deg, hsl(var(--accent) / 0.15), hsl(var(--accent) / 0.05))",
            border: "1px solid hsl(var(--accent) / 0.4)",
            borderRadius: "12px",
            textDecoration: "none",
            color: "inherit",
            cursor: "pointer",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{ fontSize: "22px" }}>🔮</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: "0.95rem" }}>
                Predictions open — {data!.activePredictionCount} {data!.activePredictionCount === 1 ? "match" : "matches"}
              </div>
              <div style={{ fontSize: "0.8rem", color: "hsl(var(--ink-muted))" }}>
                Make your predictions before kick-off to earn bonus points
              </div>
            </div>
          </div>
          <span style={{ fontSize: "1.2rem", color: "hsl(var(--accent))", flexShrink: 0 }}>→</span>
        </motion.a>
      )}

      {/* Budget bar — only if entry exists */}
      {data?.entry && (
        <motion.div
          className="card"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.2 }}
          style={{ marginBottom: 20 }}
        >
          <BudgetBar used={data.entry.budgetUsed} total={budget} />
        </motion.div>
      )}

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
                    Pick {squadSize} players within the £{budget}m budget,
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

          {/* My Squad player list */}
          {data?.entry && squadPlayers.length > 0 && (
            <>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <div className="section-title" style={{ margin: 0 }}>My Squad</div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={{ fontSize: "0.78rem", color: "hsl(var(--ink-muted))" }}>
                    {squadPlayers.length}/{squadSize} · Total pts: {squadPlayers.reduce((s, p) => s + (p.totalPoints ?? 0), 0)}
                  </span>
                  <button
                    className="btn-outline"
                    style={{ fontSize: "0.72rem", padding: "3px 10px", minHeight: 0 }}
                    onClick={() => setShowFullSquad((v) => !v)}
                  >
                    {showFullSquad ? "Hide" : "Show all"}
                  </button>
                </div>
              </div>
              <div className="card" style={{ padding: "4px 16px", marginBottom: 20 }}>
                {(showFullSquad ? squadPlayers : squadPlayers.slice(0, 5)).map((p) => (
                  <SquadPlayerRow
                    key={p.id}
                    player={p}
                    isCaptain={p.id === data.entry!.captainId}
                    isViceCaptain={p.id === data.entry!.viceCaptainId}
                  />
                ))}
                {!showFullSquad && squadPlayers.length > 5 && (
                  <button
                    onClick={() => setShowFullSquad(true)}
                    style={{
                      width: "100%", textAlign: "center", padding: "10px 0",
                      fontSize: "0.8rem", fontWeight: 700,
                      color: "hsl(var(--brand))", background: "none", border: "none",
                      cursor: "pointer"
                    }}
                  >
                    Show {squadPlayers.length - 5} more players
                  </button>
                )}
                {showFullSquad && (
                  <div style={{ paddingBottom: 8 }}>
                    <Link href="/squad" className="btn-outline" style={{ display: "block", textAlign: "center", marginTop: 10, fontSize: "0.85rem" }}>
                      {data.entry.locked ? "View full squad" : "Edit squad"}
                    </Link>
                  </div>
                )}
              </div>
            </>
          )}

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
                <FixtureItem key={f.id} fixture={f} pts={fixturePointsMap.get(f.id)} />
              ))}
            </>
          ) : null}
        </div>

        {/* Sidebar */}
        <div className="stack">
          {/* Last match summary */}
          {data?.lastFixture && data.lastMatchPoints != null && (
            <div className="card" style={{ borderColor: "hsl(var(--brand) / 0.3)" }}>
              <div className="card-title" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <Trophy size={16} weight="bold" style={{ color: "hsl(var(--brand))" }} />
                Last Match
              </div>
              <div style={{ fontSize: "0.85rem", fontWeight: 700, marginBottom: 4 }}>
                {data.lastFixture.team1Name} {data.lastFixture.score?.team1 ?? "–"}–{data.lastFixture.score?.team2 ?? "–"} {data.lastFixture.team2Name}
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                <span style={{
                  fontSize: "2rem", fontWeight: 900,
                  color: data.lastMatchPoints > 0 ? "hsl(var(--brand))" : "hsl(var(--ink-muted))"
                }}>
                  {data.lastMatchPoints > 0 ? "+" : ""}{data.lastMatchPoints}
                </span>
                <span style={{ fontSize: "0.85rem", color: "hsl(var(--ink-muted))" }}>points</span>
              </div>
              <Link
                href={`/fixtures/${data.lastFixture.id}`}
                style={{ fontSize: "0.8rem", color: "hsl(var(--brand))", fontWeight: 600 }}
              >
                View details →
              </Link>
            </div>
          )}

          {/* My Squad quick card — only if no player list shown above or squad is empty */}
          {data?.entry && squadPlayers.length === 0 && (
            <div className="card">
              <div className="card-title">My Squad</div>
              <dl style={{ display: "grid", gap: "10px", margin: 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <dt style={{ color: "var(--muted)", fontSize: "0.85rem" }}>Squad name</dt>
                  <dd style={{ margin: 0, fontWeight: 700 }}>{data.entry.name}</dd>
                </div>
              </dl>
              <hr className="divider" />
              <Link className="btn-outline" href="/squad" style={{ display: "block", textAlign: "center" }}>
                {data.entry.locked ? "View squad" : "Edit squad"}
              </Link>
            </div>
          )}

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

        </div>
      </div>
    </div>
  );
}
