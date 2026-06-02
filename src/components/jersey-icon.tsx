import { flagUrl } from "@/lib/flags";

// Primary + secondary colours for all 20 PL clubs
const TEAM_COLORS: Record<string, { primary: string; secondary: string; pattern?: "stripes" | "hoops" | "sash" | "plain" }> = {
  // ── Premier League ──────────────────────────────────────────────────────────
  ARS: { primary: "#EF0107", secondary: "#ffffff", pattern: "plain" },
  AVL: { primary: "#670E36", secondary: "#95BFE5", pattern: "plain" },
  BOU: { primary: "#000000", secondary: "#DA291C", pattern: "stripes" },
  BHA: { primary: "#0057B8", secondary: "#ffffff", pattern: "stripes" },
  BRE: { primary: "#e30613", secondary: "#ffffff", pattern: "stripes" },
  CHE: { primary: "#034694", secondary: "#ffffff", pattern: "plain" },
  CRY: { primary: "#1B458F", secondary: "#C4122E", pattern: "sash" },
  EVE: { primary: "#003399", secondary: "#ffffff", pattern: "plain" },
  FUL: { primary: "#ffffff", secondary: "#000000", pattern: "plain" },
  IPS: { primary: "#0044A9", secondary: "#ffffff", pattern: "plain" },
  LEI: { primary: "#003090", secondary: "#fdbe11", pattern: "plain" },
  LIV: { primary: "#C8102E", secondary: "#ffffff", pattern: "plain" },
  MCI: { primary: "#6CABDD", secondary: "#1C2C5B", pattern: "plain" },
  MUN: { primary: "#DA291C", secondary: "#000000", pattern: "plain" },
  NEW: { primary: "#241F20", secondary: "#ffffff", pattern: "stripes" },
  NOT: { primary: "#DD0000", secondary: "#ffffff", pattern: "plain" },
  SOU: { primary: "#D71920", secondary: "#ffffff", pattern: "stripes" },
  TOT: { primary: "#132257", secondary: "#ffffff", pattern: "plain" },
  WHU: { primary: "#7A263A", secondary: "#1BB1E7", pattern: "plain" },
  WOL: { primary: "#FDB913", secondary: "#231F20", pattern: "plain" },

  // ── Brasileirão Série A ─────────────────────────────────────────────────────
  // Flamengo
  FLA: { primary: "#CC0000", secondary: "#000000", pattern: "hoops" },
  // Palmeiras
  PAL: { primary: "#006437", secondary: "#ffffff", pattern: "plain" },
  // Corinthians
  COR: { primary: "#000000", secondary: "#ffffff", pattern: "plain" },
  // São Paulo
  SAO: { primary: "#CC0000", secondary: "#ffffff", pattern: "plain" },
  // Santos
  SAN: { primary: "#000000", secondary: "#ffffff", pattern: "stripes" },
  // Grêmio
  GRE: { primary: "#0B4D9F", secondary: "#000000", pattern: "stripes" },
  // Internacional
  INT: { primary: "#CC0000", secondary: "#ffffff", pattern: "plain" },
  // Atlético Mineiro
  CAM: { primary: "#000000", secondary: "#ffffff", pattern: "plain" },
  // Fluminense
  FLU: { primary: "#8B0000", secondary: "#006400", pattern: "stripes" },
  // Vasco
  VAS: { primary: "#000000", secondary: "#ffffff", pattern: "sash" },
  // Botafogo
  BOT: { primary: "#000000", secondary: "#ffffff", pattern: "stripes" },
  // Cruzeiro
  CRU: { primary: "#003087", secondary: "#ffffff", pattern: "plain" },
  // Bahia
  BAH: { primary: "#0052A1", secondary: "#CC0000", pattern: "stripes" },
  // Fortaleza
  FOR: { primary: "#CC0000", secondary: "#003087", pattern: "stripes" },
  // Athletico Paranaense (CAP)
  CAP: { primary: "#CC0000", secondary: "#000000", pattern: "plain" },
  // Coritiba
  COT: { primary: "#006437", secondary: "#ffffff", pattern: "stripes" },
  // Mirassol
  MIR: { primary: "#FFD700", secondary: "#000000", pattern: "plain" },
  // Red Bull Bragantino
  RBB: { primary: "#CC0000", secondary: "#ffffff", pattern: "plain" },
  // Juventude
  JUV: { primary: "#006437", secondary: "#ffffff", pattern: "plain" },
  // Criciúma
  CRI: { primary: "#FFD700", secondary: "#000000", pattern: "stripes" },
  // Sport Recife
  SPO: { primary: "#CC0000", secondary: "#000000", pattern: "stripes" },
  // América Mineiro
  AME: { primary: "#006437", secondary: "#000000", pattern: "plain" },
  // Ceará
  CEA: { primary: "#000000", secondary: "#ffffff", pattern: "stripes" },
  // Goiás
  GOI: { primary: "#006437", secondary: "#ffffff", pattern: "plain" },
  // Cuiabá
  CUI: { primary: "#FFD700", secondary: "#006437", pattern: "plain" },
  // Avaí
  AVA: { primary: "#003087", secondary: "#ffffff", pattern: "plain" },
};

const DEFAULT = { primary: "#6b7280", secondary: "#d1d5db", pattern: "plain" as const };

export function JerseyIcon({ tla, size = 44 }: { tla: string; size?: number }) {
  // For national teams (WC etc.) without known jersey colours, show a round flag badge
  if (!TEAM_COLORS[tla]) {
    const url = flagUrl(tla);
    if (url) {
      return (
        <div
          style={{
            width: size,
            height: size,
            borderRadius: "50%",
            overflow: "hidden",
            border: "2px solid rgba(255,255,255,0.25)",
            flexShrink: 0,
          }}
        >
          <img
            src={url}
            alt={tla}
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
        </div>
      );
    }
  }

  const cfg = TEAM_COLORS[tla] ?? DEFAULT;
  const { primary, secondary, pattern } = cfg;
  const s = size;
  const r = s / 44; // scale ratio

  return (
    <svg width={s} height={s} viewBox="0 0 44 44" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        {pattern === "stripes" && (
          <pattern id={`stripe-${tla}`} patternUnits="userSpaceOnUse" width="4" height="44">
            <rect width="2" height="44" fill={primary} />
            <rect x="2" width="2" height="44" fill={secondary} />
          </pattern>
        )}
        {pattern === "hoops" && (
          <pattern id={`hoops-${tla}`} patternUnits="userSpaceOnUse" width="44" height="6">
            <rect width="44" height="3" fill={primary} />
            <rect y="3" width="44" height="3" fill={secondary} />
          </pattern>
        )}
      </defs>

      {/* ── body ── */}
      <path
        d="M13 10 L5 18 L10 20 L10 37 L34 37 L34 20 L39 18 L31 10 C29 14 25.5 15.5 22 15.5 C18.5 15.5 15 14 13 10Z"
        fill={
          pattern === "stripes" ? `url(#stripe-${tla})` :
          pattern === "hoops"   ? `url(#hoops-${tla})` :
          primary
        }
        stroke={secondary === "#ffffff" ? "#e5e7eb" : secondary}
        strokeWidth="0.5"
      />

      {/* ── sash overlay ── */}
      {pattern === "sash" && (
        <path
          d="M13 10 L31 10 L34 37 L22 37 Z"
          fill={secondary}
          opacity="0.45"
        />
      )}

      {/* ── sleeves ── */}
      <path d="M5 18 L10 20 L13 10 Z" fill={secondary} stroke={secondary === "#ffffff" ? "#e5e7eb" : secondary} strokeWidth="0.4" />
      <path d="M39 18 L34 20 L31 10 Z" fill={secondary} stroke={secondary === "#ffffff" ? "#e5e7eb" : secondary} strokeWidth="0.4" />

      {/* ── collar ── */}
      <path
        d="M17 10 Q22 16 27 10"
        stroke={secondary}
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="round"
      />

      {/* ── sleeve cuffs ── */}
      <line x1="5.5" y1="18" x2="9.5" y2="19.5" stroke={primary} strokeWidth="1.2" strokeLinecap="round" />
      <line x1="38.5" y1="18" x2="34.5" y2="19.5" stroke={primary} strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}
