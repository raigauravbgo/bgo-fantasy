// Team jersey colors for PL clubs (primary, sleeve)
const TEAM_COLORS: Record<string, [string, string]> = {
  ARS: ["#EF0107", "#ffffff"],
  AVL: ["#95BFE5", "#670E36"],
  BOU: ["#DA291C", "#000000"],
  BHA: ["#0057B8", "#ffffff"],
  BRE: ["#e30613", "#ffffff"],
  CHE: ["#034694", "#ffffff"],
  CRY: ["#1B458F", "#C4122E"],
  EVE: ["#003399", "#ffffff"],
  FUL: ["#ffffff", "#000000"],
  IPS: ["#0044A9", "#ffffff"],
  LEI: ["#003090", "#fdbe11"],
  LIV: ["#C8102E", "#ffffff"],
  MCI: ["#6CABDD", "#1C2C5B"],
  MUN: ["#DA291C", "#FBE122"],
  NEW: ["#241F20", "#ffffff"],
  NOT: ["#DD0000", "#ffffff"],
  SOU: ["#D71920", "#ffffff"],
  TOT: ["#132257", "#ffffff"],
  WHU: ["#7A263A", "#1BB1E7"],
  WOL: ["#FDB913", "#231F20"],
  // fallback
  DEFAULT: ["#888888", "#cccccc"],
};

export function JerseyIcon({ tla, size = 36 }: { tla: string; size?: number }) {
  const [primary, sleeve] = TEAM_COLORS[tla] ?? TEAM_COLORS.DEFAULT;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 36 36"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {/* body */}
      <path
        d="M10 8 L4 14 L8 16 L8 30 L28 30 L28 16 L32 14 L26 8 C24 11 20 12 18 12 C16 12 12 11 10 8Z"
        fill={primary}
      />
      {/* sleeves */}
      <path d="M4 14 L8 16 L10 8 Z" fill={sleeve} />
      <path d="M32 14 L28 16 L26 8 Z" fill={sleeve} />
      {/* collar */}
      <path
        d="M14 8 Q18 13 22 8"
        stroke="#00000033"
        strokeWidth="1"
        fill="none"
      />
    </svg>
  );
}
