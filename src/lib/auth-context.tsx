"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode
} from "react";
import { useRouter } from "next/navigation";

import { apiFetch } from "./api";
import type { Competition, User } from "./types";

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  competitions: Competition[];
  competition: Competition | null;
  setCompetition: (competition: Competition) => void;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [competition, setCompetitionState] = useState<Competition | null>(null);
  const initialized = useRef(false);

  useEffect(() => {
    if (!initialized.current) {
      initialized.current = true;
      void init();
    }
  }, []);

  async function init() {
    setLoading(true);
    try {
      const [sessionData, compData] = await Promise.all([
        apiFetch<{ user: User | null }>("/api/auth/me"),
        apiFetch<{ competitions: Competition[] }>("/api/competitions")
      ]);
      setUser(sessionData.user);
      setCompetitions(compData.competitions);

      const stored =
        typeof localStorage !== "undefined"
          ? localStorage.getItem("bgo_competition_slug")
          : null;
      const initial =
        (stored
          ? compData.competitions.find((c) => c.slug === stored)
          : undefined) ?? compData.competitions[0];
      if (initial) setCompetitionState(initial);
    } catch {
      // network/DB not ready — leave loading=false so the page can render
    } finally {
      setLoading(false);
    }
  }

  function setCompetition(c: Competition) {
    setCompetitionState(c);
    localStorage.setItem("bgo_competition_slug", c.slug);
  }

  async function logout() {
    await apiFetch("/api/auth/logout", { method: "POST" });
    setUser(null);
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        competitions,
        competition,
        setCompetition,
        logout,
        refresh: init
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export function useRequireAuth() {
  const auth = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!auth.loading && !auth.user) {
      router.push("/login");
    }
  }, [auth.loading, auth.user, router]);

  return auth;
}

export function useRequireAdmin() {
  const auth = useRequireAuth();
  const router = useRouter();

  useEffect(() => {
    if (
      !auth.loading &&
      auth.user &&
      auth.user.role !== "admin" &&
      auth.user.role !== "super_admin"
    ) {
      router.push("/dashboard");
    }
  }, [auth.loading, auth.user, router]);

  return auth;
}
