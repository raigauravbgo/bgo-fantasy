"use client";

import { type FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { useAuth } from "@/lib/auth-context";
import { apiFetch } from "@/lib/api";

export default function LoginPage() {
  const { refresh } = useAuth();
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);

    const form = new FormData(event.currentTarget);
    try {
      await apiFetch("/api/auth/login", {
        method: "POST",
        body: {
          employeeId: (form.get("employeeId") as string).trim(),
          password: form.get("password")
        }
      });
      await refresh();
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <span className="auth-logo">BGO</span>
        <h1 className="auth-title">Welcome back</h1>
        <p className="auth-subtitle">Sign in with your Employee ID and password.</p>

        {error ? <p className="notice notice-error">{error}</p> : null}

        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label required" htmlFor="employeeId">
              Employee ID
            </label>
            <input
              className="form-input"
              id="employeeId"
              name="employeeId"
              placeholder="e.g. 00283"
              required
              autoFocus
            />
          </div>

          <div className="form-group">
            <label className="form-label required" htmlFor="password">
              Password
            </label>
            <input
              className="form-input"
              id="password"
              name="password"
              placeholder="••••••••"
              required
              type="password"
            />
          </div>

          <button className="btn" disabled={loading} type="submit">
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p className="auth-footer">
          No account?{" "}
          <Link href="/register">Register with your Employee ID</Link>
        </p>
        <p className="auth-footer">
          <Link href="/reset-password">Forgot your password?</Link>
        </p>
      </div>
    </div>
  );
}
