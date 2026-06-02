"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { MapPin, CalendarBlank, Trophy } from "@phosphor-icons/react";
import { useRequireAuth } from "@/lib/auth-context";
import { apiFetch } from "@/lib/api";
import type { Fixture } from "@/lib/types";

// ── Flag helpers ──────────────────────────────────────────────────────────────

const TLA_TO_A2: Record<string, string> = {
  AFG: "AF", ALB: "AL", ALG: "DZ", AND: "AD", ANG: "AO", ARG: "AR",
  ARM: "AM", AUS: "AU", AUT: "AT", AZE: "AZ", BEL: "BE", BEN: "BJ",
  BFA: "BF", BGD: "BD", BIH: "BA", BLR: "BY", BOL: "BO", BOS: "BA",
  BRA: "BR", BUL: "BG", CAM: "KH", CAN: "CA", CHI: "CL", CHN: "CN",
  CIV: "CI", CMR: "CM", COD: "CD", COG: "CG", COL: "CO", CPV: "CV",
  CRC: "CR", CRO: "HR", CUB: "CU", CYP: "CY", CZE: "CZ", DEN: "DK",
  DOM: "DO", ECU: "EC", EGY: "EG", ENG: "GB", ESP: "ES", ETH: "ET",
  FIN: "FI", FRA: "FR", GAB: "GA", GEO: "GE", GER: "DE", GHA: "GH",
  GNB: "GW", GRE: "GR", GTM: "GT", GUI: "GN", HON: "HN", HUN: "HU",
  IDN: "ID", IND: "IN", IRL: "IE", IRN: "IR", IRQ: "IQ", ISL: "IS",
  ISR: "IL", ITA: "IT", IVC: "CI", JAM: "JM", JAP: "JP", JOR: "JO",
  KAZ: "KZ", KEN: "KE", KOR: "KR", KSA: "SA", KUW: "KW", LBN: "LB",
  LIB: "LY", MAD: "MG", MAR: "MA", MAS: "MY", MEX: "MX", MLI: "ML",
  MON: "ME", MOZ: "MZ", MRT: "MR", MTN: "MT", NCA: "NI", NED: "NL",
  NGA: "NG", NOR: "NO", NZL: "NZ", OMA: "OM", PAN: "PA", PAR: "PY",
  PER: "PE", PHI: "PH", POL: "PL", POR: "PT", PRK: "KP", QAT: "QA",
  ROU: "RO", RSA: "ZA", RUS: "RU", SA: "SA", SAU: "SA", SCO: "GB",
  SEN: "SN", SLE: "SL", SLO: "SI", SLV: "SV", SOM: "SO", SRB: "RS",
  SSD: "SS", SUI: "CH", SUR: "SR", SVK: "SK", SVN: "SI", SWE: "SE",
  SYR: "SY", TAN: "TZ", THA: "TH", TRI: "TT", TUN: "TN", TUR: "TR",
  UAE: "AE", UGA: "UG", UKR: "UA", URU: "UY", USA: "US", UZB: "UZ",
  VEN: "VE", VIE: "VN", WAL: "GB", YEM: "YE", ZAM: "ZM", ZIM: "ZW",
  // 2-letter passthroughs sometimes returned by API
  US: "US", SK: "KR",
};

function flagEmoji(tla?: string | null): string {
  if (!tla) return "🏳️";
  const a2 = TLA_TO_A2[tla.toUpperCase()] ?? (tla.length === 2 ? tla.toUpperCase() : null);
  if (!a2) return "🏳️";
  return (
    String.fromCodePoint(0x1f1e6 + a2.charCodeAt(0) - 65) +
    String.fromCodePoint(0x1f1e6 + a2.charCodeAt(1) - 65)
  );
}

// ── Date / time helpers ────────────────────────────────────────────────────────

function dateKey(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth()).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatDateHeader(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

// ── Filters ───────────────────────────────────────────────────────────────────

const FILTERS = [
  { key: "all",       label: "All" },
  { key: "live",      label: "Live" },
  { key: "upcoming",  label: "Upcoming" },
  { key: "completed", label: "Completed" },
] as const;
type FilterKey = (typeof FILTERS)[number]["key"];

// ── Sub-components ─────────────────────────────────────────────────────────────

function TeamBlock({
  name,
  shortName,
  align,
}: {
  name: string;
  shortName?: string | null;
  align: "left" | "right";
}) {
  const flag = flagEmoji(shortName);
  const isRight = align === "right";
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: isRight ? "flex-end" : "flex-start",
        gap: 7,
        flex: 1,
        minWidth: 0,
      }}
    >
      <span
        style={{
          fontSize: "2.6rem",
          lineHeight: 1,
          filter: "drop-shadow(0 2px 6px rgba(0,0,0,0.45))",
          userSelect: "none",
        }}
      >
        {flag}
      </span>
      <span
        style={{
          fontWeight: 700,
          fontSize: "0.92rem",
          color: "hsl(var(--ink))",
          textAlign: isRight ? "right" : "left",
          lineHeight: 1.25,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          maxWidth: "100%",
        }}
      >
        {name}
      </span>
    </div>
  );
}

function MatchCenter({ fixture }: { fixture: Fixture }) {
  const isLive = fixture.status === "live";
  const isDone = fixture.status === "completed";
  const hasScore = fixture.score != null;

  if (isLive) {
    return (
      <div style={{ textAlign: "center", flexShrink: 0, padding: "0 8px" }}>
        <div
          style={{
            fontSize: "2rem",
            fontWeight: 900,
            color: "hsl(var(--live))",
            lineHeight: 1,
            fontVariantNumeric: "tabular-nums",
            letterSpacing: "-0.02em",
          }}
        >
          {hasScore ? `${fixture.score!.team1} – ${fixture.score!.team2}` : "– –"}
        </div>
        <div
          className="live-dot"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            fontSize: "0.62rem",
            fontWeight: 800,
            color: "hsl(var(--live))",
            letterSpacing: "0.09em",
            textTransform: "uppercase",
            marginTop: 5,
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: "hsl(var(--live))",
              display: "inline-block",
            }}
          />
          LIVE
        </div>
      </div>
    );
  }

  if (isDone && hasScore) {
    return (
      <div style={{ textAlign: "center", flexShrink: 0, padding: "0 8px" }}>
        <div
          style={{
            fontSize: "2rem",
            fontWeight: 900,
            color: "hsl(var(--ink))",
            lineHeight: 1,
            fontVariantNumeric: "tabular-nums",
            letterSpacing: "-0.02em",
          }}
        >
          {fixture.score!.team1} – {fixture.score!.team2}
        </div>
        <div
          style={{
            fontSize: "0.62rem",
            fontWeight: 700,
            color: "hsl(var(--ink-muted))",
            letterSpacing: "0.07em",
            textTransform: "uppercase",
            marginTop: 5,
          }}
        >
          {fixture.result?.winnerTeamId === "draw"
            ? "Draw"
            : fixture.result?.winnerTeamId === fixture.team1Id
            ? "Home win"
            : fixture.result?.winnerTeamId
            ? "Away win"
            : "FT"}
        </div>
      </div>
    );
  }

  return (
    <div
      style={{ textAlign: "center", flexShrink: 0, padding: "0 10px" }}
    >
      <div
        style={{
          fontSize: "0.95rem",
          fontWeight: 800,
          color: "hsl(var(--ink-muted))",
          letterSpacing: "0.1em",
          lineHeight: 1,
        }}
      >
        VS
      </div>
      <div
        style={{
          fontSize: "0.78rem",
          fontWeight: 600,
          color: "hsl(var(--ink-secondary))",
          marginTop: 6,
          letterSpacing: "0.02em",
        }}
      >
        {formatTime(fixture.startTime)}
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const isLive = status === "live";
  const isDone = status === "completed";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "3px 10px",
        borderRadius: 20,
        fontSize: "0.65rem",
        fontWeight: 800,
        letterSpacing: "0.07em",
        textTransform: "uppercase",
        whiteSpace: "nowrap",
        flexShrink: 0,
        background: isLive
          ? "hsl(var(--live-bg))"
          : isDone
          ? "hsl(220 18% 20%)"
          : "hsl(220 18% 17%)",
        color: isLive
          ? "hsl(var(--live))"
          : isDone
          ? "hsl(var(--ink-secondary))"
          : "hsl(var(--ink-muted))",
        border: `1px solid ${
          isLive ? "hsl(var(--live) / 0.35)" : "hsl(var(--line))"
        }`,
        boxShadow: isLive ? "0 0 10px hsl(var(--live) / 0.18)" : "none",
      }}
    >
      {isLive && (
        <span
          className="live-dot"
          style={{
            width: 5,
            height: 5,
            borderRadius: "50%",
            background: "hsl(var(--live))",
            display: "inline-block",
            flexShrink: 0,
          }}
        />
      )}
      {status}
    </span>
  );
}

function FixtureCard({ fixture, index }: { fixture: Fixture; index: number }) {
  const isLive = fixture.status === "live";

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, delay: Math.min(index * 0.025, 0.4), ease: [0.16, 1, 0.3, 1] }}
      style={{ marginBottom: 10 }}
    >
      <Link href={`/fixtures/${fixture.id}`} style={{ display: "block", textDecoration: "none" }}>
        <div
          style={{
            background: "hsl(var(--surface-raised))",
            border: `1px solid ${isLive ? "hsl(var(--live) / 0.45)" : "hsl(var(--line))"}`,
            borderRadius: 14,
            overflow: "hidden",
            transition:
              "transform 140ms ease, border-color 140ms ease, box-shadow 140ms ease",
            boxShadow: isLive
              ? "0 0 32px hsl(var(--live) / 0.14), 0 2px 14px hsl(220 40% 2% / 0.45)"
              : "0 2px 14px hsl(220 40% 2% / 0.35)",
          }}
          onMouseEnter={(e) => {
            const el = e.currentTarget as HTMLDivElement;
            el.style.transform = "translateY(-2px)";
            el.style.borderColor = isLive
              ? "hsl(var(--live) / 0.7)"
              : "hsl(var(--brand) / 0.5)";
            el.style.boxShadow = "0 8px 30px hsl(220 40% 2% / 0.6)";
          }}
          onMouseLeave={(e) => {
            const el = e.currentTarget as HTMLDivElement;
            el.style.transform = "";
            el.style.borderColor = isLive
              ? "hsl(var(--live) / 0.45)"
              : "hsl(var(--line))";
            el.style.boxShadow = isLive
              ? "0 0 32px hsl(var(--live) / 0.14), 0 2px 14px hsl(220 40% 2% / 0.45)"
              : "0 2px 14px hsl(220 40% 2% / 0.35)";
          }}
        >
          {/* Matchup */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 16,
              padding: "20px 24px 16px",
            }}
          >
            <TeamBlock
              name={fixture.team1Name ?? "TBC"}
              shortName={fixture.team1ShortName}
              align="left"
            />
            <MatchCenter fixture={fixture} />
            <TeamBlock
              name={fixture.team2Name ?? "TBC"}
              shortName={fixture.team2ShortName}
              align="right"
            />
          </div>

          {/* Footer */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "8px 20px 10px",
              borderTop: "1px solid hsl(var(--line))",
              background: "hsl(var(--surface-sunken))",
              gap: 12,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                minWidth: 0,
                overflow: "hidden",
              }}
            >
              <CalendarBlank
                size={12}
                style={{ color: "hsl(var(--ink-muted))", flexShrink: 0 }}
              />
              <span
                style={{
                  fontSize: "0.72rem",
                  color: "hsl(var(--ink-secondary))",
                  fontWeight: 600,
                  whiteSpace: "nowrap",
                }}
              >
                {formatTime(fixture.startTime)}
              </span>
              {fixture.venue && (
                <>
                  <span
                    style={{
                      color: "hsl(var(--line-strong))",
                      fontSize: "0.8rem",
                    }}
                  >
                    ·
                  </span>
                  <MapPin
                    size={11}
                    style={{ color: "hsl(var(--ink-muted))", flexShrink: 0 }}
                  />
                  <span
                    style={{
                      fontSize: "0.72rem",
                      color: "hsl(var(--ink-muted))",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {fixture.venue}
                  </span>
                </>
              )}
            </div>
            <StatusPill status={fixture.status} />
          </div>
        </div>
      </Link>
    </motion.div>
  );
}

function DateHeader({ iso }: { iso: string }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        margin: "28px 0 12px",
      }}
    >
      <span
        style={{
          fontSize: "0.72rem",
          fontWeight: 800,
          color: "hsl(var(--ink-secondary))",
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          whiteSpace: "nowrap",
        }}
      >
        {formatDateHeader(iso)}
      </span>
      <div
        style={{ flex: 1, height: 1, background: "hsl(var(--line))" }}
      />
    </motion.div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function FixturesPage() {
  const { competition, loading: authLoading } = useRequireAuth();
  const [fixtures, setFixtures] = useState<Fixture[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");

  useEffect(() => {
    if (!competition?.slug) return;
    setLoading(true);
    apiFetch<{ fixtures: Fixture[] }>(
      `/api/competitions/${competition.slug}/fixtures`
    )
      .then((d) => setFixtures(d.fixtures))
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Failed to load fixtures.")
      )
      .finally(() => setLoading(false));
  }, [competition?.slug]);

  const filtered = useMemo(() => {
    if (filter === "all") return fixtures;
    return fixtures.filter((f) => f.status === filter);
  }, [fixtures, filter]);

  // Sort: chronological within each status group (live → upcoming → completed)
  const STATUS_ORDER = ["live", "upcoming", "completed", "postponed", "cancelled"];
  const sorted = useMemo(
    () =>
      [...filtered].sort((a, b) => {
        const ai = STATUS_ORDER.indexOf(a.status);
        const bi = STATUS_ORDER.indexOf(b.status);
        if (ai !== bi) return ai - bi;
        return new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
      }),
    [filtered]
  );

  // Group by calendar date for "all" view
  const grouped = useMemo(() => {
    if (filter !== "all") return null;
    const map = new Map<string, Fixture[]>();
    for (const f of sorted) {
      const key = dateKey(f.startTime);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(f);
    }
    return [...map.entries()];
  }, [sorted, filter]);

  const liveCnt = fixtures.filter((f) => f.status === "live").length;
  const upcomingCnt = fixtures.filter((f) => f.status === "upcoming").length;
  const completedCnt = fixtures.filter((f) => f.status === "completed").length;

  const counts: Record<string, number> = { live: liveCnt, upcoming: upcomingCnt, completed: completedCnt };

  if (authLoading || loading) {
    return (
      <div className="page">
        <div style={{ display: "grid", gap: 10 }}>
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="skeleton" style={{ height: 112, borderRadius: 14 }} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <motion.div
        className="page-header"
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
      >
        <h1 className="page-title">Fixtures</h1>
        <p className="page-subtitle">
          {competition?.name ?? "Competition"} · {fixtures.length} matches
        </p>
      </motion.div>

      {/* Filter bar */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.08 }}
        style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}
      >
        {FILTERS.map(({ key, label }) => {
          const cnt = counts[key] ?? 0;
          const isActive = filter === key;
          return (
            <button
              key={key}
              onClick={() => setFilter(key)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "6px 14px",
                borderRadius: 20,
                border: `1px solid ${
                  isActive ? "hsl(var(--brand) / 0.6)" : "hsl(var(--line))"
                }`,
                background: isActive
                  ? "hsl(var(--brand) / 0.15)"
                  : "hsl(var(--surface-raised))",
                color: isActive
                  ? "hsl(var(--brand-light))"
                  : "hsl(var(--ink-secondary))",
                fontSize: "0.78rem",
                fontWeight: 700,
                cursor: "pointer",
                transition: "all 120ms ease",
                letterSpacing: "0.03em",
              }}
            >
              {key === "live" && liveCnt > 0 && (
                <span
                  className="live-dot"
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: "hsl(var(--live))",
                    display: "inline-block",
                  }}
                />
              )}
              {label}
              {key !== "all" && cnt > 0 && (
                <span
                  style={{
                    fontSize: "0.62rem",
                    fontWeight: 800,
                    background:
                      key === "live"
                        ? "hsl(var(--live-bg))"
                        : "hsl(var(--surface-sunken))",
                    color:
                      key === "live"
                        ? "hsl(var(--live))"
                        : "hsl(var(--ink-muted))",
                    borderRadius: 10,
                    padding: "1px 6px",
                  }}
                >
                  {cnt}
                </span>
              )}
            </button>
          );
        })}
      </motion.div>

      {error ? <p className="notice notice-error">{error}</p> : null}

      {sorted.length === 0 ? (
        <div
          style={{
            textAlign: "center",
            padding: "60px 24px",
            color: "hsl(var(--ink-muted))",
          }}
        >
          <Trophy size={40} weight="thin" style={{ marginBottom: 12, opacity: 0.4 }} />
          <p style={{ fontSize: "0.9rem" }}>No fixtures found.</p>
        </div>
      ) : grouped ? (
        grouped.map(([_key, group]) => (
          <div key={_key}>
            <DateHeader iso={group[0].startTime} />
            {group.map((f, i) => (
              <FixtureCard key={f.id} fixture={f} index={i} />
            ))}
          </div>
        ))
      ) : (
        sorted.map((f, i) => <FixtureCard key={f.id} fixture={f} index={i} />)
      )}
    </div>
  );
}
