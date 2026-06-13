"use client";

import { useEffect, useState } from "react";
import { useRequireAuth } from "@/lib/auth-context";
import { apiFetch } from "@/lib/api";
import type { PredictionSet } from "@/lib/types";

type HistoryQuestion = {
  id: string;
  prompt: string;
  points: number;
  options: Array<{ label: string; value: string }>;
  myAnswer: string | null;
};

type HistoryEntry = {
  id: string;
  fixtureId: string;
  fixtureName?: string;
  closesAt: string;
  status: string;
  pointsEarned: number | null;
  questions: HistoryQuestion[];
};

function timeLeft(iso: string) {
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return "Locked";
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  if (h > 24) return `${Math.floor(h / 24)}d left`;
  if (h > 0) return `${h}h ${m}m left`;
  return `${m}m left`;
}

function calcImpliedPts(q: PredictionSet["questions"][0], value: string): number {
  const { voteMode, basePoints, minPoints, maxPoints, points, voteCounts, totalVotes } = q;
  if ((voteMode ?? "fixed") !== "dynamic" || basePoints == null) return points;
  const count = voteCounts?.[value] ?? 0;
  const total = totalVotes ?? 0;
  const fraction = total > 0 ? count / total : 0;
  if (fraction <= 0) return maxPoints ?? points;
  return Math.max(minPoints ?? 2, Math.min(maxPoints ?? 50, Math.floor(basePoints / fraction)));
}

function VoteBar({ pct, isMyPick }: { pct: number; isMyPick: boolean }) {
  return (
    <div style={{
      height: 4,
      borderRadius: 2,
      background: "rgba(255,255,255,0.07)",
      marginTop: 6,
      overflow: "hidden",
    }}>
      <div style={{
        height: "100%",
        width: `${pct}%`,
        background: isMyPick ? "hsl(var(--brand))" : "rgba(255,255,255,0.3)",
        borderRadius: 2,
        transition: "width 0.5s ease",
      }} />
    </div>
  );
}

function QuestionBlock({
  set, q, onPick, saving,
}: {
  set: PredictionSet;
  q: PredictionSet["questions"][0];
  onPick: (value: string) => void;
  saving: boolean;
}) {
  const myAnswer = q.myAnswer ?? null;
  const answered = myAnswer !== null;
  const total = q.totalVotes ?? 0;
  const isDynamic = (q.voteMode ?? "fixed") === "dynamic";
  const isExactScore = q.type === "exact_score";

  return (
    <div style={{
      padding: "16px 0",
      borderBottom: "1px solid rgba(255,255,255,0.06)",
    }}>
      {/* Question header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginBottom: 10 }}>
        <div style={{ fontSize: "0.9rem", fontWeight: 700, color: "hsl(var(--ink))", lineHeight: 1.3 }}>
          {q.prompt}
        </div>
        <div style={{
          flexShrink: 0,
          fontSize: "0.7rem",
          fontWeight: 700,
          letterSpacing: "0.04em",
          textTransform: "uppercase",
          color: isDynamic ? "hsl(var(--brand))" : "hsl(var(--ink-muted))",
          background: isDynamic ? "rgba(99,102,241,0.12)" : "rgba(255,255,255,0.06)",
          borderRadius: 6,
          padding: "3px 8px",
          whiteSpace: "nowrap",
        }}>
          {isDynamic ? `Dynamic · up to ${q.maxPoints ?? q.points}pts` : `${q.points}pts`}
        </div>
      </div>

      {/* Exact score: compact grid */}
      {isExactScore ? (
        answered ? (
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              padding: "8px 16px",
              borderRadius: 8,
              border: "1.5px solid hsl(var(--brand))",
              fontSize: "0.95rem",
              fontWeight: 800,
              color: "hsl(var(--ink))",
              background: "rgba(99,102,241,0.08)",
            }}>
              {myAnswer}
            </div>
            <span style={{ fontSize: "0.8rem", color: "hsl(var(--ink-muted))" }}>
              your pick ·{" "}
              {total > 0
                ? `${(((q.voteCounts?.[myAnswer] ?? 0) / total) * 100).toFixed(0)}% agree`
                : "no votes yet"}
            </span>
          </div>
        ) : (
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(60px, 1fr))",
            gap: 5,
          }}>
            {q.options.map((opt) => (
              <button
                key={opt.value}
                disabled={saving}
                onClick={() => onPick(opt.value)}
                style={{
                  padding: "8px 4px",
                  borderRadius: 7,
                  border: "1px solid rgba(255,255,255,0.1)",
                  background: "rgba(255,255,255,0.04)",
                  color: "hsl(var(--ink-muted))",
                  fontSize: "0.83rem",
                  fontWeight: 600,
                  cursor: saving ? "default" : "pointer",
                  transition: "background 120ms ease, border-color 120ms ease, color 120ms ease",
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )
      ) : answered ? (
        /* Post-submission: vote bars */
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {q.options.map((opt) => {
            const count = q.voteCounts?.[opt.value] ?? 0;
            const pct = total > 0 ? (count / total) * 100 : 0;
            const isMyPick = opt.value === myAnswer;
            return (
              <div key={opt.value} style={{ padding: "2px 0" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{
                    fontSize: "0.83rem",
                    fontWeight: isMyPick ? 700 : 500,
                    color: isMyPick ? "hsl(var(--ink))" : "hsl(var(--ink-muted))",
                    display: "flex",
                    alignItems: "center",
                    gap: 5,
                  }}>
                    {isMyPick && (
                      <span style={{ fontSize: "0.65rem", color: "hsl(var(--brand))", fontWeight: 900 }}>✓</span>
                    )}
                    {opt.label}
                  </span>
                  <span style={{ fontSize: "0.78rem", color: "hsl(var(--ink-muted))", fontWeight: 600 }}>
                    {pct.toFixed(0)}%
                  </span>
                </div>
                <VoteBar pct={pct} isMyPick={isMyPick} />
              </div>
            );
          })}
          {total > 0 && (
            <div style={{ fontSize: "0.72rem", color: "hsl(var(--ink-muted))", marginTop: 4 }}>
              {total} vote{total !== 1 ? "s" : ""}
            </div>
          )}
        </div>
      ) : (
        /* Pre-submission: option buttons with implied pts */
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {q.options.map((opt) => {
            const pts = calcImpliedPts(q, opt.value);
            const count = q.voteCounts?.[opt.value] ?? 0;
            const pct = total > 0 ? (count / total) * 100 : 0;
            return (
              <button
                key={opt.value}
                disabled={saving}
                onClick={() => onPick(opt.value)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  width: "100%",
                  padding: "11px 14px",
                  borderRadius: 9,
                  border: "1px solid rgba(255,255,255,0.09)",
                  background: "rgba(255,255,255,0.04)",
                  color: "hsl(var(--ink))",
                  fontSize: "0.875rem",
                  fontWeight: 500,
                  cursor: saving ? "default" : "pointer",
                  gap: 10,
                  textAlign: "left",
                  transition: "background 120ms ease, border-color 120ms ease",
                }}
              >
                <span style={{ flex: 1 }}>{opt.label}</span>
                {isDynamic && total > 0 && (
                  <span style={{ fontSize: "0.72rem", color: "hsl(var(--ink-muted))" }}>
                    {pct.toFixed(0)}% backing
                  </span>
                )}
                <span style={{
                  fontSize: "0.75rem",
                  fontWeight: 800,
                  color: "hsl(var(--brand))",
                  background: "rgba(99,102,241,0.14)",
                  borderRadius: 6,
                  padding: "2px 8px",
                  flexShrink: 0,
                }}>
                  {pts}pt{pts !== 1 ? "s" : ""}
                </span>
              </button>
            );
          })}
          {isDynamic && (
            <div style={{ fontSize: "0.72rem", color: "hsl(var(--ink-muted))", marginTop: 2 }}>
              Points shown update live as votes come in — locked at kick-off.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function PredictionsPage() {
  const { competition, loading: authLoading } = useRequireAuth();
  const [tab, setTab] = useState<"active" | "history">("active");
  const [sets, setSets] = useState<PredictionSet[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    if (!competition?.slug) return;
    setLoading(true);
    apiFetch<{ predictionSets: PredictionSet[] }>(
      `/api/competitions/${competition.slug}/predictions/active`
    )
      .then((d) => setSets(d.predictionSets))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load predictions."))
      .finally(() => setLoading(false));
  }, [competition?.slug]);

  useEffect(() => {
    if (!competition?.slug || tab !== "history") return;
    setHistoryLoading(true);
    apiFetch<{ history: HistoryEntry[] }>(
      `/api/competitions/${competition.slug}/predictions/history`
    )
      .then((d) => setHistory(d.history))
      .catch(() => setHistory([]))
      .finally(() => setHistoryLoading(false));
  }, [competition?.slug, tab]);

  async function pick(set: PredictionSet, questionId: string, value: string) {
    if (!competition?.slug) return;
    const saveKey = `${set.id}-${questionId}`;
    setSaving(saveKey);
    try {
      await apiFetch(
        `/api/competitions/${competition.slug}/predictions/${set.id}/submit`,
        { method: "POST", body: { questionId, value } }
      );
      // Optimistically update local state
      setSets((prev) =>
        prev.map((s) =>
          s.id !== set.id
            ? s
            : {
                ...s,
                questions: s.questions.map((q) =>
                  q.id !== questionId
                    ? q
                    : {
                        ...q,
                        myAnswer: value,
                        totalVotes: (q.totalVotes ?? 0) + (q.myAnswer ? 0 : 1),
                        voteCounts: {
                          ...q.voteCounts,
                          [value]: ((q.voteCounts?.[value] ?? 0) + 1),
                        },
                      }
                ),
              }
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submission failed.");
    } finally {
      setSaving(null);
    }
  }

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
        <h1 className="page-title">Predictions</h1>
        <p className="page-subtitle">Predict outcomes — rare picks pay more.</p>
      </div>

      {error ? <p className="notice notice-error">{error}</p> : null}

      <div className="admin-tabs" style={{ marginBottom: 20 }}>
        <button
          className={`admin-tab ${tab === "active" ? "active" : ""}`}
          onClick={() => setTab("active")}
        >
          Open{sets.length > 0 ? ` (${sets.length})` : ""}
        </button>
        <button
          className={`admin-tab ${tab === "history" ? "active" : ""}`}
          onClick={() => setTab("history")}
        >
          History
        </button>
      </div>

      {tab === "active" && (
        sets.length === 0 ? (
          <p className="empty-state">No open predictions right now. Check back before kick-off.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {sets.map((set) => {
              const locked = new Date(set.closesAt) <= new Date();
              const remaining = timeLeft(set.closesAt);
              const answeredCount = set.questions.filter((q) => q.myAnswer != null).length;
              const totalQ = set.questions.length;

              return (
                <div key={set.id} style={{
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: 14,
                  overflow: "hidden",
                }}>
                  {/* Fixture header */}
                  <div style={{
                    padding: "14px 20px",
                    borderBottom: "1px solid rgba(255,255,255,0.06)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                    background: "rgba(255,255,255,0.02)",
                  }}>
                    <div>
                      <div style={{ fontSize: "0.95rem", fontWeight: 800, color: "hsl(var(--ink))" }}>
                        {set.fixtureName ?? "Match Predictions"}
                      </div>
                      {set.fixtureStartTime && (
                        <div style={{ fontSize: "0.75rem", color: "hsl(var(--ink-muted))", marginTop: 2 }}>
                          Kick-off{" "}
                          {new Date(set.fixtureStartTime).toLocaleDateString("en-GB", {
                            weekday: "short", day: "numeric", month: "short",
                          })}{" "}
                          ·{" "}
                          {new Date(set.fixtureStartTime).toLocaleTimeString("en-GB", {
                            hour: "2-digit", minute: "2-digit",
                          })}
                        </div>
                      )}
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <div style={{
                        fontSize: "0.78rem",
                        fontWeight: 700,
                        color: locked ? "hsl(var(--danger))" : "hsl(var(--success))",
                      }}>
                        {remaining}
                      </div>
                      <div style={{ fontSize: "0.72rem", color: "hsl(var(--ink-muted))", marginTop: 2 }}>
                        {answeredCount}/{totalQ} answered
                      </div>
                    </div>
                  </div>

                  {/* Questions */}
                  <div style={{ padding: "0 20px" }}>
                    {set.questions.map((q) => (
                      <QuestionBlock
                        key={q.id}
                        set={set}
                        q={q}
                        onPick={(value) => { void pick(set, q.id, value); }}
                        saving={saving === `${set.id}-${q.id}`}
                      />
                    ))}
                  </div>

                  {locked && (
                    <div style={{
                      padding: "10px 20px",
                      background: "rgba(239,68,68,0.06)",
                      borderTop: "1px solid rgba(239,68,68,0.15)",
                      fontSize: "0.78rem",
                      color: "hsl(var(--danger))",
                      fontWeight: 600,
                    }}>
                      Predictions locked — awaiting result
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )
      )}

      {tab === "history" && (
        historyLoading ? (
          <div className="loading-dots">Loading</div>
        ) : history.length === 0 ? (
          <p className="empty-state">No past predictions yet.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {history.map((entry) => (
              <div key={entry.id} style={{
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 14,
                overflow: "hidden",
              }}>
                <div style={{
                  padding: "12px 18px",
                  borderBottom: "1px solid rgba(255,255,255,0.06)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 10,
                }}>
                  <div>
                    <div style={{ fontSize: "0.875rem", fontWeight: 700, color: "hsl(var(--ink))" }}>
                      {entry.fixtureName ?? "Past Predictions"}
                    </div>
                    <div style={{ fontSize: "0.75rem", color: "hsl(var(--ink-muted))", marginTop: 1 }}>
                      {new Date(entry.closesAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                    </div>
                  </div>
                  {entry.pointsEarned !== null ? (
                    <div style={{
                      fontSize: "1rem",
                      fontWeight: 800,
                      color: entry.pointsEarned > 0 ? "hsl(var(--success))" : "hsl(var(--ink-muted))",
                    }}>
                      +{entry.pointsEarned}pts
                    </div>
                  ) : (
                    <div style={{ fontSize: "0.78rem", color: "hsl(var(--ink-muted))" }}>Not scored</div>
                  )}
                </div>

                <div style={{ padding: "10px 18px" }}>
                  {entry.questions.map((q) => (
                    <div key={q.id} style={{
                      padding: "8px 0",
                      borderBottom: "1px solid rgba(255,255,255,0.04)",
                    }}>
                      <div style={{ fontSize: "0.8rem", color: "hsl(var(--ink-muted))", marginBottom: 3 }}>
                        {q.prompt}
                      </div>
                      {q.myAnswer ? (
                        <div style={{ fontSize: "0.85rem", fontWeight: 600, color: "hsl(var(--ink))" }}>
                          {q.options.find((o) => o.value === q.myAnswer)?.label ?? q.myAnswer}
                        </div>
                      ) : (
                        <div style={{ fontSize: "0.8rem", color: "hsl(var(--ink-muted))", fontStyle: "italic" }}>
                          No answer
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}
