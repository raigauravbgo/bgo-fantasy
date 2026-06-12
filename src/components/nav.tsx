"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, BellRinging, X } from "@phosphor-icons/react";
import { useAuth } from "@/lib/auth-context";
import { apiFetch } from "@/lib/api";
import type { Announcement } from "@/lib/types";

const PLAYER_LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/squad", label: "My Squad" },
  { href: "/fixtures", label: "Fixtures" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/predictions", label: "Predictions" }
];

const ADMIN_LINK = { href: "/admin", label: "Admin" };
const SEEN_KEY = "bgo_seen_announcements";

function getSeenIds(): Set<string> {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function markSeen(ids: string[]) {
  try {
    const existing = getSeenIds();
    ids.forEach((id) => existing.add(id));
    localStorage.setItem(SEEN_KEY, JSON.stringify([...existing]));
  } catch {
    // ignore
  }
}

export function Nav() {
  const { user, competition, competitions, setCompetition, logout } = useAuth();
  const pathname = usePathname();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!competition?.slug) return;
    apiFetch<{ announcements: Announcement[] }>(`/api/competitions/${competition.slug}/dashboard`)
      .then((d) => {
        const items = d.announcements ?? [];
        setAnnouncements(items);
        const seen = getSeenIds();
        setUnread(items.filter((a) => !seen.has(a.id)).length);
      })
      .catch(() => {});
  }, [competition?.slug]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  function togglePanel() {
    if (!open && announcements.length > 0) {
      markSeen(announcements.map((a) => a.id));
      setUnread(0);
    }
    setOpen((v) => !v);
  }

  if (!user) return null;

  const isAdmin = user.role === "admin" || user.role === "super_admin";
  const links = isAdmin ? [...PLAYER_LINKS, ADMIN_LINK] : PLAYER_LINKS;

  const BellBtn = (
    <button
      onClick={togglePanel}
      title="Announcements"
      style={{
        position: "relative",
        width: 34,
        height: 34,
        borderRadius: "50%",
        border: "1px solid hsl(var(--line-strong))",
        background: open ? "hsl(var(--brand-muted))" : "transparent",
        color: open ? "hsl(var(--brand))" : "hsl(var(--ink-muted))",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        flexShrink: 0,
        transition: "all 120ms ease",
      }}
    >
      {unread > 0
        ? <BellRinging size={17} weight="fill" />
        : <Bell size={17} weight={open ? "fill" : "regular"} />}
      {unread > 0 && (
        <span style={{
          position: "absolute",
          top: -2,
          right: -2,
          minWidth: 16,
          height: 16,
          borderRadius: 8,
          background: "hsl(var(--danger))",
          color: "#fff",
          fontSize: "0.6rem",
          fontWeight: 900,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "0 3px",
          lineHeight: 1,
        }}>
          {unread > 9 ? "9+" : unread}
        </span>
      )}
    </button>
  );

  const Panel = open ? (
    <div
      ref={panelRef}
      style={{
        position: "fixed",
        top: 62,
        right: 16,
        width: "min(360px, calc(100vw - 32px))",
        maxHeight: "min(480px, calc(100vh - 80px))",
        overflowY: "auto",
        background: "rgba(10, 16, 26, 0.92)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        border: "1px solid rgba(255,255,255,0.1)",
        borderRadius: 14,
        boxShadow: "0 8px 40px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04)",
        zIndex: 300,
        padding: "12px 0",
      }}
    >
      {/* Header */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 16px 10px",
        borderBottom: "1px solid rgba(255,255,255,0.07)",
        marginBottom: 8,
      }}>
        <span style={{ fontSize: "0.78rem", fontWeight: 800, color: "hsl(var(--ink))", letterSpacing: "0.04em", textTransform: "uppercase" }}>
          Announcements
        </span>
        <button
          onClick={() => setOpen(false)}
          style={{ background: "none", border: "none", color: "hsl(var(--ink-muted))", cursor: "pointer", padding: 2 }}
        >
          <X size={14} weight="bold" />
        </button>
      </div>

      {/* Items */}
      {announcements.length === 0 ? (
        <p style={{ color: "hsl(var(--ink-muted))", fontSize: "0.8rem", textAlign: "center", padding: "20px 16px" }}>
          No announcements yet.
        </p>
      ) : (
        announcements.map((a) => (
          <div
            key={a.id}
            style={{
              padding: "10px 16px",
              borderLeft: `3px solid ${a.priority === "high" ? "hsl(var(--warn))" : "hsl(var(--brand))"}`,
              marginLeft: 12,
              marginRight: 12,
              marginBottom: 8,
              borderRadius: "0 8px 8px 0",
              background: a.priority === "high"
                ? "rgba(245,158,11,0.08)"
                : "rgba(255,255,255,0.04)",
            }}
          >
            {a.title && (
              <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "hsl(var(--ink))", marginBottom: 3 }}>
                {a.icon ? `${a.icon} ` : ""}{a.title}
              </div>
            )}
            <div style={{ fontSize: "0.8rem", color: "hsl(var(--ink-muted))", lineHeight: 1.5 }}>
              {!a.title && a.icon ? `${a.icon} ` : ""}{a.message}
            </div>
          </div>
        ))
      )}
    </div>
  ) : null;

  return (
    <>
      <nav className="nav">
        <div className="nav-inner">
          <div className="nav-brand">
            <span className="nav-logo">BGO</span>
            {competitions.length > 1 ? (
              <select
                className="nav-comp-select"
                value={competition?.id ?? ""}
                onChange={(e) => {
                  const found = competitions.find((c) => c.id === e.target.value);
                  if (found) setCompetition(found);
                }}
              >
                {competitions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            ) : (
              <span className="nav-comp-name">{competition?.name}</span>
            )}
          </div>

          <div className="nav-links">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={
                  pathname.startsWith(link.href) ? "nav-link active" : "nav-link"
                }
              >
                {link.label}
              </Link>
            ))}
          </div>

          <div className="nav-user">
            {BellBtn}
            <span className="nav-user-name">{user.name}</span>
            <button
              className="btn-ghost"
              onClick={() => {
                void logout().then(() => {
                  window.location.href = "/login";
                });
              }}
            >
              Sign out
            </button>
          </div>
        </div>

        <div className="nav-links-mobile">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={
                pathname.startsWith(link.href)
                  ? "nav-link-mobile active"
                  : "nav-link-mobile"
              }
            >
              {link.label}
            </Link>
          ))}
          {/* Bell in mobile strip */}
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", paddingRight: 4 }}>
            {BellBtn}
          </div>
        </div>
      </nav>

      {Panel}
    </>
  );
}
