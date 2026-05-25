"use client";

import { type FormEvent, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

type Status = "idle" | "open" | "submitting" | "done" | "error";

export function ReportIssue() {
  const { user } = useAuth();
  const pathname = usePathname();
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  if (!user) return null;

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) { setPreview(null); return; }
    const reader = new FileReader();
    reader.onload = () => setPreview(reader.result as string);
    reader.readAsDataURL(file);
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("submitting");
    setErrorMsg("");
    const form = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/bug-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: form.get("description") as string,
          pageUrl: pathname,
          screenshotData: preview ?? undefined
        })
      });
      if (!res.ok) {
        const d = await res.json() as { error?: string };
        throw new Error(d.error ?? "Submit failed");
      }
      setStatus("done");
      setPreview(null);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to submit.");
      setStatus("error");
    }
  }

  function open() { setStatus("open"); setErrorMsg(""); setPreview(null); }
  function close() { setStatus("idle"); setPreview(null); }

  return (
    <>
      {/* Floating trigger button */}
      <button
        onClick={open}
        aria-label="Report an issue"
        style={{
          position: "fixed",
          bottom: "24px",
          right: "24px",
          zIndex: 1000,
          width: "44px",
          height: "44px",
          borderRadius: "50%",
          background: "hsl(var(--surface-2))",
          border: "1px solid hsl(var(--border))",
          color: "hsl(var(--ink-muted))",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "1.1rem",
          boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
          transition: "opacity 0.2s"
        }}
        title="Report an issue"
      >
        🐞
      </button>

      {/* Modal backdrop + panel */}
      {(status === "open" || status === "submitting" || status === "done" || status === "error") && (
        <div
          onClick={close}
          style={{
            position: "fixed", inset: 0, zIndex: 1001,
            background: "rgba(0,0,0,0.55)", display: "flex",
            alignItems: "center", justifyContent: "center", padding: "16px"
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "hsl(var(--surface-1))",
              border: "1px solid hsl(var(--border))",
              borderRadius: "12px",
              padding: "28px",
              width: "100%",
              maxWidth: "480px",
              maxHeight: "90vh",
              overflowY: "auto"
            }}
          >
            {status === "done" ? (
              <div style={{ textAlign: "center", padding: "16px 0" }}>
                <p style={{ fontSize: "2rem", marginBottom: "12px" }}>✅</p>
                <p style={{ fontWeight: 700, marginBottom: "6px" }}>Thanks for the report!</p>
                <p style={{ fontSize: "0.85rem", color: "hsl(var(--ink-muted))", marginBottom: "20px" }}>
                  We&apos;ll look into it shortly.
                </p>
                <button className="btn" onClick={close}>Close</button>
              </div>
            ) : (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "18px" }}>
                  <h2 style={{ fontWeight: 800, fontSize: "1.1rem" }}>Report an issue</h2>
                  <button onClick={close} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "1.2rem", color: "hsl(var(--ink-muted))" }}>✕</button>
                </div>

                {status === "error" && (
                  <p className="notice notice-error" style={{ marginBottom: "14px" }}>{errorMsg}</p>
                )}

                <form onSubmit={handleSubmit} style={{ display: "grid", gap: "16px" }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label required">What went wrong?</label>
                    <textarea
                      name="description"
                      className="form-input"
                      placeholder="Describe the issue — what you were doing, what you expected, what happened instead…"
                      required
                      minLength={5}
                      rows={4}
                      style={{ resize: "vertical" }}
                    />
                  </div>

                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Screenshot (optional)</label>
                    <input
                      ref={fileRef}
                      type="file"
                      accept="image/*"
                      className="form-input"
                      onChange={handleFileChange}
                    />
                    <span className="form-hint">PNG, JPG or WebP, max ~2 MB</span>
                  </div>

                  {preview && (
                    <div style={{ position: "relative" }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={preview}
                        alt="Screenshot preview"
                        style={{ width: "100%", borderRadius: "6px", border: "1px solid hsl(var(--border))" }}
                      />
                      <button
                        type="button"
                        onClick={() => { setPreview(null); if (fileRef.current) fileRef.current.value = ""; }}
                        style={{
                          position: "absolute", top: "6px", right: "6px",
                          background: "rgba(0,0,0,0.6)", color: "#fff",
                          border: "none", borderRadius: "50%",
                          width: "24px", height: "24px", cursor: "pointer", fontSize: "0.8rem"
                        }}
                      >✕</button>
                    </div>
                  )}

                  <p style={{ fontSize: "0.75rem", color: "hsl(var(--ink-muted))" }}>
                    Reporting from: <code>{pathname}</code>
                  </p>

                  <button className="btn" type="submit" disabled={status === "submitting"}>
                    {status === "submitting" ? "Submitting…" : "Submit report"}
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
