"use client";

import { type FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { useAuth } from "@/lib/auth-context";
import { apiFetch } from "@/lib/api";

type Step = "identity" | "password";

export default function RegisterPage() {
  const { refresh } = useAuth();
  const router = useRouter();

  const [step, setStep] = useState<Step>("identity");
  const [employeeId, setEmployeeId] = useState("");
  const [fullName, setFullName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleIdentity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);
    const form = new FormData(event.currentTarget);
    const eid = (form.get("employeeId") as string).trim();
    const lastName = (form.get("lastName") as string).trim();
    const hireDate = form.get("hireDate") as string;

    try {
      const res = await apiFetch<{ valid: boolean; fullName: string }>("/api/auth/register", {
        method: "POST",
        body: { action: "validate", employeeId: eid, lastName, hireDate }
      });
      setEmployeeId(eid);
      setFullName(res.fullName);
      setStep("password");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Validation failed.");
    } finally {
      setLoading(false);
    }
  }

  async function handlePassword(event: FormEvent<HTMLFormElement>) {
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
        body: { action: "register", employeeId, password }
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
        <h1 className="auth-title">Create your account</h1>
        <p className="auth-subtitle">
          {step === "identity"
            ? "Verify your identity using your employee details."
            : `Welcome, ${fullName}. Choose a password to complete registration.`}
        </p>

        {error ? <p className="notice notice-error">{error}</p> : null}

        {step === "identity" ? (
          <form className="auth-form" onSubmit={handleIdentity}>
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
              <label className="form-label required" htmlFor="lastName">
                Last name
              </label>
              <input
                className="form-input"
                id="lastName"
                name="lastName"
                placeholder="Your last name"
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label required" htmlFor="hireDate">
                Date of joining
              </label>
              <input
                className="form-input"
                id="hireDate"
                name="hireDate"
                type="date"
                required
              />
              <span className="form-hint">As recorded in HR</span>
            </div>
            <button className="btn" disabled={loading} type="submit">
              {loading ? "Checking…" : "Verify identity →"}
            </button>
          </form>
        ) : (
          <form className="auth-form" onSubmit={handlePassword}>
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
                autoFocus
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
            <button
              type="button"
              className="btn-outline"
              style={{ marginTop: "4px" }}
              onClick={() => { setStep("identity"); setError(""); }}
            >
              ← Back
            </button>
          </form>
        )}

        <p className="auth-footer">
          Already registered?{" "}
          <Link href="/login">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
