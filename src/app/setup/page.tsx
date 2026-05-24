"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";

export default function SetupPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiFetch<{ setupRequired: boolean }>("/api/setup")
      .then((d) => {
        if (!d.setupRequired) setDone(true);
      })
      .catch(() => setDone(true))
      .finally(() => setChecking(false));
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const name = form.get("name") as string;
    const email = form.get("email") as string;
    const password = form.get("password") as string;

    if (password !== form.get("confirm")) {
      setError("Passwords do not match.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      await apiFetch("/api/setup", { method: "POST", body: { name, email, password } });
      router.push("/login");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Setup failed.");
    } finally {
      setSaving(false);
    }
  }

  if (checking) {
    return <div className="page"><div className="loading-dots">Checking</div></div>;
  }

  if (done) {
    return (
      <div className="page" style={{ maxWidth: 480, margin: "80px auto", textAlign: "center" }}>
        <h1 className="page-title">Setup complete</h1>
        <p className="page-subtitle" style={{ marginBottom: 24 }}>
          An admin account already exists.
        </p>
        <a className="btn" href="/login">Go to login</a>
      </div>
    );
  }

  return (
    <div className="page" style={{ maxWidth: 480, margin: "80px auto" }}>
      <div className="card">
        <div style={{ marginBottom: 24 }}>
          <div className="bgo-logo" style={{ marginBottom: 16 }}>BGO</div>
          <h1 style={{ fontSize: "1.4rem", fontWeight: 800, marginBottom: 4 }}>First-time setup</h1>
          <p style={{ color: "var(--muted)", fontSize: "0.9rem" }}>Create your admin account to get started.</p>
        </div>

        {error && <p className="notice notice-error" style={{ marginBottom: 16 }}>{error}</p>}

        <form onSubmit={handleSubmit} style={{ display: "grid", gap: 14 }}>
          <div className="form-group">
            <label className="form-label required">Full name</label>
            <input className="form-input" name="name" required placeholder="e.g. Gaurav Rai" />
          </div>
          <div className="form-group">
            <label className="form-label required">Email</label>
            <input className="form-input" name="email" type="email" required placeholder="you@bgo.com" />
          </div>
          <div className="form-group">
            <label className="form-label required">Password</label>
            <input className="form-input" name="password" type="password" required minLength={8} />
          </div>
          <div className="form-group">
            <label className="form-label required">Confirm password</label>
            <input className="form-input" name="confirm" type="password" required />
          </div>
          <button className="btn" type="submit" disabled={saving}>
            {saving ? "Creating account…" : "Create admin account"}
          </button>
        </form>
      </div>
    </div>
  );
}
