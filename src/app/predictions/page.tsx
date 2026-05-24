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
  closesAt: string;
  status: string;
  pointsEarned: number | null;
  questions: HistoryQuestion[];
};

function timeLeft(iso: string) {
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return "Closed";
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  if (h > 24) return `${Math.floor(h / 24)}d left`;
  if (h > 0) return `${h}h ${m}m left`;
  return `${m}m left`;
}

export default function PredictionsPage() {
  const { competition, loading: authLoading } = useRequireAuth();
  const [tab, setTab] = useState<"active" | "history">("active");
  const [sets, setSets] = useState<PredictionSet[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    if (!competition?.slug) return;
    setLoading(true);
    apiFetch<{ predictionSets: PredictionSet[] }>(
      `/api/competitions/${competition.slug}/predictions/active`
    )
      .then((d) => setSets(d.predictionSets))
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Failed to load predictions.")
      )
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

  async function submit(set: PredictionSet, question: PredictionSet["questions"][0], value: string) {
    if (!competition?.slug) return;
    setSaving(`${set.id}-${question.id}`);
    try {
      await apiFetch(
        `/api/competitions/${competition.slug}/predictions/${set.id}/submit`,
        { method: "POST", body: { questionId: question.id, value } }
      );
      setSubmitted((prev) => ({ ...prev, [`${set.id}-${question.id}`]: value }));
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
        <p className="page-subtitle">
          Predict match outcomes to earn bonus points.
        </p>
      </div>

      {error ? <p className="notice notice-error">{error}</p> : null}

      <div className="admin-tabs">
        <button
          className={`admin-tab ${tab === "active" ? "active" : ""}`}
          onClick={() => setTab("active")}
        >
          Active{sets.length > 0 ? ` (${sets.length})` : ""}
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
          <p className="empty-state">No active predictions right now. Check back before kick-off.</p>
        ) : (
          sets.map((set) => (
            <div key={set.id} className="prediction-card">
              <div className="prediction-header">
                <span style={{ fontSize: "0.8rem", color: "var(--muted)", fontWeight: 600 }}>
                  Prediction
                </span>
                <span
                  style={{
                    fontSize: "0.8rem",
                    fontWeight: 700,
                    color: new Date(set.closesAt) < new Date() ? "var(--error)" : "var(--success)"
                  }}
                >
                  {timeLeft(set.closesAt)}
                </span>
              </div>

              <div className="prediction-body">
                {set.questions.map((question) => {
                  const key = `${set.id}-${question.id}`;
                  const myAnswer = submitted[key];
                  const isSaving = saving === key;

                  return (
                    <div key={question.id} style={{ marginBottom: "16px" }}>
                      <div className="prediction-question">{question.prompt}</div>
                      <div
                        style={{
                          fontSize: "0.78rem",
                          color: "var(--muted)",
                          marginBottom: "10px"
                        }}
                      >
                        Correct answer is worth {question.points} point
                        {question.points !== 1 ? "s" : ""}
                      </div>

                      {myAnswer ? (
                        <p className="notice" style={{ marginBottom: 0 }}>
                          Submitted: <strong>{myAnswer}</strong>
                        </p>
                      ) : (
                        <div className="prediction-options">
                          {question.options.map((option) => (
                            <button
                              key={option.value}
                              className="prediction-option"
                              disabled={isSaving}
                              onClick={() => submit(set, question, option.value)}
                            >
                              {isSaving ? "…" : option.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )
      )}

      {tab === "history" && (
        historyLoading ? (
          <div className="loading-dots">Loading</div>
        ) : history.length === 0 ? (
          <p className="empty-state">No past predictions yet.</p>
        ) : (
          history.map((entry) => (
            <div key={entry.id} className="prediction-card">
              <div className="prediction-header">
                <span style={{ fontSize: "0.8rem", color: "var(--muted)", fontWeight: 600 }}>
                  Closed · {new Date(entry.closesAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                </span>
                {entry.pointsEarned !== null ? (
                  <span style={{ fontSize: "0.85rem", fontWeight: 700, color: entry.pointsEarned > 0 ? "var(--success)" : "var(--muted)" }}>
                    +{entry.pointsEarned} pts
                  </span>
                ) : (
                  <span style={{ fontSize: "0.8rem", color: "var(--muted)" }}>Not scored yet</span>
                )}
              </div>

              <div className="prediction-body">
                {entry.questions.map((q) => (
                  <div key={q.id} style={{ marginBottom: "12px" }}>
                    <div className="prediction-question">{q.prompt}</div>
                    {q.myAnswer ? (
                      <p style={{ margin: "6px 0 0", fontSize: "0.85rem", color: "var(--muted)" }}>
                        Your answer: <strong style={{ color: "var(--ink)" }}>{
                          q.options.find((o) => o.value === q.myAnswer)?.label ?? q.myAnswer
                        }</strong>
                      </p>
                    ) : (
                      <p style={{ margin: "6px 0 0", fontSize: "0.85rem", color: "var(--muted)" }}>
                        No answer submitted
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))
        )
      )}
    </div>
  );
}
