"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

const PLAYER_LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/squad", label: "My Squad" },
  { href: "/fixtures", label: "Fixtures" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/predictions", label: "Predictions" }
];

const ADMIN_LINK = { href: "/admin", label: "Admin" };

export function Nav() {
  const { user, competition, competitions, setCompetition, logout } = useAuth();
  const pathname = usePathname();

  if (!user) return null;

  const isAdmin = user.role === "admin" || user.role === "super_admin";
  const links = isAdmin ? [...PLAYER_LINKS, ADMIN_LINK] : PLAYER_LINKS;

  return (
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
      </div>
    </nav>
  );
}
