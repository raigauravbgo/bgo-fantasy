"use client";

import { type FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";

type Step = "identity" | "password" | "done";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("identity");
  const [employeeId, setEmployeeId] = useState("");
  const [lastName, setLastName] = useState("");
  const [hireDate, setHireDate] = useState("");
  const [fullName, setFullName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleIdentity(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const form = new FormData(e.currentTarget);
    const eid = (form.get("employeeId") as string).trim();
    const ln = (form.get("lastName") as string).trim();
    const hd = form.get("hireDate") as string;

    try {
      const res = await apiFetch<{ valid: boolean; fullName: string }>("/api/auth/reset-password", {
        method: "POST",
        body: { action: "validate", employeeId: eid, lastName: ln, hireDate: hd }
      });
      setEmployeeId(eid);
      setLastName(ln);
      setHireDate(hd);
      setFullName(res.fullName);
      setStep("password");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed.");
    } finally {
      setLoading(false);
    }
  }

  async function handleReset(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const form = new FormData(e.currentTarget);
    const newPassword = form.get("newPassword") as string;
    const confirm = form.get("confirm") as string;

    if (newPassword !== confirm) {
      setError("Passwords do not match.");
      setLoading(false);
      return;
    }

    try {
      await apiFetch("/api/auth/reset-password", {
        method: "POST",
        body: { action: "reset", employeeId, lastName, hireDate, newPassword }
      });
      setStep("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Password reset failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <span className="auth-logo">BGO</span>
        <h1 className="auth-title">Reset password</h1>
        <p className="auth-subtitle">
          {step === "identity" && "Verify your identity using your employee details."}
          {step === "password" && `Identity confirmed, ${fullName}. Choose a new password.`}
          {step === "done" && "Your password has been updated."}
        </p>

        {error ? <p className="notice notice-error">{error}</p> : null}

        {step === "identity" && (
          <form className="auth-form" onSubmit={handleIdentity}>
            <div className="form-group">
              <label className="form-label required" htmlFor="employeeId">Employee ID</label>
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
              <label className="form-label required" htmlFor="lastName">Last name</label>
              <input
                className="form-input"
                id="lastName"
                name="lastName"
                placeholder="Your last name"
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label required" htmlFor="hireDate">Date of joining</label>
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
        )}

        {step === "password" && (
          <form className="auth-form" onSubmit={handleReset}>
            <div className="form-group">
              <label className="form-label required" htmlFor="newPassword">New password</label>
              <input
                className="form-input"
                id="newPassword"
                name="newPassword"
                type="password"
                placeholder="Minimum 8 characters"
                minLength={8}
                required
                autoFocus
              />
            </div>
            <div className="form-group">
              <label className="form-label required" htmlFor="confirm">Confirm new password</label>
              <input
                className="form-input"
                id="confirm"
                name="confirm"
                type="password"
                placeholder="Repeat your new password"
                required
              />
            </div>
            <button className="btn" disabled={loading} type="submit">
              {loading ? "Saving…" : "Set new password"}
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

        {step === "done" && (
          <div style={{ marginTop: "8px" }}>
            <button className="btn" onClick={() => router.push("/login")}>
              Sign in with new password
            </button>
          </div>
        )}

        <p className="auth-footer">
          <Link href="/login">← Back to sign in</Link>
        </p>
      </div>
    </div>
  );
}
