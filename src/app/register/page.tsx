"use client";

import { type FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { useAuth } from "@/lib/auth-context";
import { apiFetch } from "@/lib/api";

export default function RegisterPage() {
  const { refresh } = useAuth();
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);

    const form = new FormData(event.currentTarget);
    const password = form.get("password") as string;
    const confirm = form.get("confirm") as string;

    if (password !== confirm) {
      setError("Passwords do not match.");
      setLoading(false);
      return;
    }

    try {
      await apiFetch("/api/auth/register", {
        method: "POST",
        body: {
          name: form.get("name"),
          email: form.get("email"),
          password
        }
      });
      await refresh();
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <span className="auth-logo">BGO</span>
        <h1 className="auth-title">Create an account</h1>
        <p className="auth-subtitle">
          Join the BGO Games fantasy platform.
        </p>

        {error ? <p className="notice notice-error">{error}</p> : null}

        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label required" htmlFor="name">
              Full name
            </label>
            <input
              className="form-input"
              id="name"
              name="name"
              placeholder="Your name"
              required
              type="text"
            />
          </div>

          <div className="form-group">
            <label className="form-label required" htmlFor="email">
              Email
            </label>
            <input
              className="form-input"
              id="email"
              name="email"
              placeholder="you@company.com"
              required
              type="email"
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
              placeholder="Minimum 8 characters"
              required
              minLength={8}
              type="password"
            />
          </div>

          <div className="form-group">
            <label className="form-label required" htmlFor="confirm">
              Confirm password
            </label>
            <input
              className="form-input"
              id="confirm"
              name="confirm"
              placeholder="Repeat your password"
              required
              type="password"
            />
          </div>

          <button className="btn" disabled={loading} type="submit">
            {loading ? "Creating account…" : "Create account"}
          </button>
        </form>

        <p className="auth-footer">
          Already have an account?{" "}
          <Link href="/login">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
