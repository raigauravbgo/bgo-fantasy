"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useRequireAuth } from "@/lib/auth-context";
import { apiFetch } from "@/lib/api";

type BumperQuestion = {
  id: string;
  prompt: string;
  type?: string;
  points: number;
  options: Array<{ label: string; value: string }>;
  myAnswer: string | null;
  pointsAwarded: number | null;
};

type BumperSet = {
  id: string;
  label: string | null;
  status: string;
  closesAt: string;
  questions: BumperQuestion[];
};

function timeLeft(iso: string) {
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return "Closed";
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  if (h > 24) return `${Math.floor(h / 24)}d ${h % 24}h left`;
  if (h > 0) return `${h}h ${m}m left`;
  return `${m}m left`;
}

function BumperCard({
  set,
  onPick,
  saving,
}: {
  set: BumperSet;
  onPick: (setId: string, questionId: string, value: string) => void;
  saving: string | null;
}) {
  const q = set.questions[0];
  if (!q) return null;

  const isPairType = q.type === "finalists" || q.type === "third_place_match";
  const isClosed = new Date(set.closesAt) <= new Date() || set.status === "scored" || set.status === "closed";
  const isScored = set.status === "scored";
  const myAnswer = q.myAnswer;
  const [search, setSearch] = useState("");
  const [pairSelected, setPairSelected] = useState<string[]>(() =>
    isPairType && myAnswer ? myAnswer.split("|") : []
  );

  useEffect(() => {
    if (isPairType && myAnswer) setPairSelected(myAnswer.split("|"));
  }, [isPairType, myAnswer]);

  const filteredOptions = q.type === "golden_boot" && search
    ? q.options.filter((o) => o.label.toLowerCase().includes(search.toLowerCase()))
    : q.options;

  const savingThis = saving === `${set.id}-${q.id}`;

  const pairValue = pairSelected.length === 2 ? [...pairSelected].sort().join("|") : null;
  const pairDirty = pairValue !== null && pairValue !== myAnswer;

  function togglePair(teamId: string) {
    setPairSelected((prev) => {
      if (prev.includes(teamId)) return prev.filter((x) => x !== teamId);
      if (prev.length >= 2) return [prev[1], teamId];
      return [...prev, teamId];
    });
  }

  // For pair types: decode myAnswer → team names
  const pairLabels = isPairType && myAnswer
    ? myAnswer.split("|").map((id) => q.options.find((o) => o.value === id)?.label ?? id)
    : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      style={{
        borderRadius: 16,
        border: "1px solid hsl(45 100% 55% / 0.3)",
        background: "linear-gradient(135deg, hsl(45 100% 55% / 0.08), hsl(38 100% 50% / 0.04))",
        overflow: "hidden",
        marginBottom: 20,
      }}
    >
      {/* Header */}
      <div style={{
        padding: "16px 20px",
        borderBottom: "1px solid hsl(45 100% 55% / 0.15)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
      }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: "1.05rem", color: "hsl(45 100% 60%)" }}>
            {set.label ?? "Bumper Prediction"}
          </div>
          <div style={{ fontSize: "0.78rem", color: "hsl(var(--ink-muted))", marginTop: 2 }}>
            {q.points} pts · {isClosed ? "Closed" : timeLeft(set.closesAt)}
          </div>
        </div>
        {isScored && myAnswer != null && (
          <div style={{
            fontSize: "0.8rem",
            fontWeight: 700,
            padding: "5px 12px",
            borderRadius: 20,
            background: (q.pointsAwarded ?? 0) > 0 ? "rgba(34,197,94,0.15)" : "rgba(255,255,255,0.06)",
            color: (q.pointsAwarded ?? 0) > 0 ? "hsl(var(--success))" : "hsl(var(--ink-muted))",
          }}>
            {(q.pointsAwarded ?? 0) > 0 ? `+${q.pointsAwarded} pts` : "0 pts"}
          </div>
        )}
        {!isScored && myAnswer != null && (
          <div style={{
            fontSize: "0.75rem",
            fontWeight: 700,
            padding: "4px 10px",
            borderRadius: 20,
            background: "rgba(99,102,241,0.12)",
            color: "hsl(var(--brand))",
          }}>
            Submitted
          </div>
        )}
      </div>

      {/* Body */}
      <div style={{ padding: "18px 20px" }}>
        <div style={{ fontSize: "0.925rem", fontWeight: 600, marginBottom: 14, color: "hsl(var(--ink))" }}>
          {q.prompt}
        </div>

        {myAnswer != null ? (
          <div style={{
            padding: "12px 16px",
            borderRadius: 10,
            background: "rgba(99,102,241,0.1)",
            border: "1px solid rgba(99,102,241,0.3)",
            fontSize: "0.9rem",
          }}>
            <div style={{ fontSize: "0.75rem", color: "hsl(var(--ink-muted))", marginBottom: 4 }}>Your pick</div>
            <div style={{ fontWeight: 700 }}>
              {pairLabels
                ? pairLabels.join(" & ")
                : (q.options.find((o) => o.value === myAnswer)?.label ?? myAnswer)}
            </div>
            {!isClosed && (
              <div style={{ fontSize: "0.75rem", color: "hsl(var(--ink-muted))", marginTop: 6 }}>
                You can change your pick before it closes.
              </div>
            )}
          </div>
        ) : isClosed ? (
          <div style={{ fontSize: "0.85rem", color: "hsl(var(--ink-muted))" }}>
            This prediction is now closed. No answer submitted.
          </div>
        ) : null}

        {!isClosed && (
          <div style={{ marginTop: myAnswer != null ? 14 : 0 }}>
            {q.type === "golden_boot" ? (
              <>
                <input
                  className="form-input"
                  placeholder="Search players…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  style={{ marginBottom: 10 }}
                />
                <div style={{ maxHeight: 260, overflowY: "auto", display: "grid", gap: 6 }}>
                  {filteredOptions.slice(0, 30).map((opt) => (
                    <button
                      key={opt.value}
                      disabled={savingThis}
                      onClick={() => onPick(set.id, q.id, opt.value)}
                      style={{
                        textAlign: "left",
                        padding: "10px 14px",
                        borderRadius: 10,
                        border: myAnswer === opt.value ? "1.5px solid hsl(45 100% 55%)" : "1px solid rgba(255,255,255,0.08)",
                        background: myAnswer === opt.value ? "hsl(45 100% 55% / 0.12)" : "rgba(255,255,255,0.03)",
                        color: "hsl(var(--ink))",
                        fontWeight: myAnswer === opt.value ? 700 : 400,
                        cursor: "pointer",
                        fontSize: "0.875rem",
                        transition: "all 0.15s",
                      }}
                    >
                      {opt.label}
                      {myAnswer === opt.value && <span style={{ color: "hsl(45 100% 60%)", marginLeft: 8 }}>✓ your pick</span>}
                    </button>
                  ))}
                  {filteredOptions.length === 0 && (
                    <div style={{ fontSize: "0.8rem", color: "hsl(var(--ink-muted))", padding: "8px 0" }}>No players found.</div>
                  )}
                </div>
              </>
            ) : q.type === "final_score" ? (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                {q.options.map((opt) => (
                  <button
                    key={opt.value}
                    disabled={savingThis}
                    onClick={() => onPick(set.id, q.id, opt.value)}
                    style={{
                      width: 52,
                      height: 52,
                      borderRadius: 12,
                      border: myAnswer === opt.value ? "2px solid hsl(45 100% 55%)" : "1px solid rgba(255,255,255,0.1)",
                      background: myAnswer === opt.value ? "hsl(45 100% 55% / 0.2)" : "rgba(255,255,255,0.04)",
                      color: myAnswer === opt.value ? "hsl(45 100% 60%)" : "hsl(var(--ink))",
                      fontWeight: myAnswer === opt.value ? 800 : 500,
                      fontSize: "1.05rem",
                      cursor: "pointer",
                      transition: "all 0.15s",
                    }}
                  >
                    {opt.value}
                  </button>
                ))}
              </div>
            ) : isPairType ? (
              /* Pick exactly 2 teams */
              <>
                <div style={{ fontSize: "0.8rem", color: "hsl(var(--ink-muted))", marginBottom: 10 }}>
                  Pick 2 teams ({pairSelected.length}/2 selected)
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 8, marginBottom: 12 }}>
                  {q.options.map((opt) => {
                    const isSelected = pairSelected.includes(opt.value);
                    return (
                      <button
                        key={opt.value}
                        disabled={savingThis}
                        onClick={() => togglePair(opt.value)}
                        style={{
                          padding: "10px 12px",
                          borderRadius: 10,
                          border: isSelected ? "2px solid hsl(45 100% 55%)" : "1px solid rgba(255,255,255,0.08)",
                          background: isSelected ? "hsl(45 100% 55% / 0.15)" : "rgba(255,255,255,0.03)",
                          color: isSelected ? "hsl(45 100% 60%)" : "hsl(var(--ink))",
                          fontWeight: isSelected ? 700 : 400,
                          cursor: "pointer",
                          fontSize: "0.85rem",
                          textAlign: "left",
                          transition: "all 0.15s",
                        }}
                      >
                        {opt.label}
                        {isSelected && <span style={{ marginLeft: 6 }}>✓</span>}
                      </button>
                    );
                  })}
                </div>
                {pairDirty && pairValue && (
                  <button
                    className="btn"
                    disabled={savingThis}
                    onClick={() => onPick(set.id, q.id, pairValue)}
                    style={{ background: "hsl(45 100% 55%)", color: "#000", fontWeight: 700 }}
                  >
                    {savingThis ? "Saving…" : "Confirm Selection"}
                  </button>
                )}
              </>
            ) : (
              /* Champion / third_place_winner — single team grid */
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 8 }}>
                {q.options.map((opt) => (
                  <button
                    key={opt.value}
                    disabled={savingThis}
                    onClick={() => onPick(set.id, q.id, opt.value)}
                    style={{
                      padding: "10px 12px",
                      borderRadius: 10,
                      border: myAnswer === opt.value ? "2px solid hsl(45 100% 55%)" : "1px solid rgba(255,255,255,0.08)",
                      background: myAnswer === opt.value ? "hsl(45 100% 55% / 0.15)" : "rgba(255,255,255,0.03)",
                      color: myAnswer === opt.value ? "hsl(45 100% 60%)" : "hsl(var(--ink))",
                      fontWeight: myAnswer === opt.value ? 700 : 400,
                      cursor: "pointer",
                      fontSize: "0.85rem",
                      textAlign: "left",
                      transition: "all 0.15s",
                    }}
                  >
                    {opt.label}
                    {myAnswer === opt.value && <span style={{ marginLeft: 6 }}>✓</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}

export default function BumperPage() {
  const { competition, loading: authLoading } = useRequireAuth();
  const [sets, setSets] = useState<BumperSet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    if (!competition?.slug) return;
    setLoading(true);
    apiFetch<{ bumperSets: BumperSet[] }>(
      `/api/competitions/${competition.slug}/bumper-predictions`
    )
      .then((d) => setSets(d.bumperSets))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load."))
      .finally(() => setLoading(false));
  }, [competition?.slug]);

  async function onPick(setId: string, questionId: string, value: string) {
    if (!competition?.slug) return;
    const saveKey = `${setId}-${questionId}`;
    setSaving(saveKey);
    try {
      await apiFetch(
        `/api/competitions/${competition.slug}/predictions/${setId}/submit`,
        { method: "POST", body: { questionId, value } }
      );
      setSets((prev) =>
        prev.map((s) =>
          s.id !== setId ? s : {
            ...s,
            questions: s.questions.map((q) =>
              q.id !== questionId ? q : { ...q, myAnswer: value }
            ),
          }
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save.");
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

  const openSets = sets.filter((s) => s.status === "open" && new Date(s.closesAt) > new Date());
  const otherSets = sets.filter((s) => !(s.status === "open" && new Date(s.closesAt) > new Date()));

  return (
    <div className="page">
      <style>{`
        @keyframes bumper-glow {
          0%, 100% { opacity: 0.7; }
          50% { opacity: 1; }
        }
      `}</style>

      <div className="page-header">
        <h1 className="page-title" style={{ color: "hsl(45 100% 60%)" }}>
          🏆 Bumper Predictions
        </h1>
        <p className="page-subtitle">
          Predict the Champion, Golden Boot, Final Score, Finalists, and 3rd place — up to 650 bonus points!
        </p>
      </div>

      {/* Points summary */}
      <div style={{ display: "flex", gap: 10, marginBottom: 24, flexWrap: "wrap" }}>
        {[
          { label: "Champion", pts: 100 },
          { label: "Golden Boot", pts: 100 },
          { label: "Final Score", pts: 200, note: "50 off-by-1" },
          { label: "Finalists", pts: 100 },
          { label: "3rd Place Match", pts: 100 },
          { label: "3rd Place Winner", pts: 150 },
        ].map((item) => (
          <div
            key={item.label}
            style={{
              flex: "1 1 100px",
              minWidth: 95,
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid hsl(45 100% 55% / 0.25)",
              background: "hsl(45 100% 55% / 0.06)",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: "1.15rem", fontWeight: 800, color: "hsl(45 100% 60%)" }}>
              {item.pts}
            </div>
            <div style={{ fontSize: "0.72rem", color: "hsl(var(--ink))", fontWeight: 600, marginTop: 2 }}>
              {item.label}
            </div>
            {item.note && (
              <div style={{ fontSize: "0.65rem", color: "hsl(var(--ink-muted))", marginTop: 2 }}>
                {item.note}
              </div>
            )}
          </div>
        ))}
      </div>

      {error && <p className="notice notice-error">{error}</p>}

      {sets.length === 0 && !loading && (
        <div className="empty-state">
          <div style={{ fontSize: "2.5rem", marginBottom: 12 }}>🏆</div>
          <div>Bumper predictions aren&apos;t open yet. Check back soon!</div>
        </div>
      )}

      {openSets.map((set) => (
        <BumperCard key={set.id} set={set} onPick={onPick} saving={saving} />
      ))}

      {otherSets.length > 0 && (
        <>
          <div className="section-title" style={{ marginTop: 8 }}>Closed / Scored</div>
          {otherSets.map((set) => (
            <BumperCard key={set.id} set={set} onPick={onPick} saving={saving} />
          ))}
        </>
      )}
    </div>
  );
}
