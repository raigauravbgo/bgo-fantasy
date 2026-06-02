export const TLA_TO_A2: Record<string, string> = {
  AFG: "AF", ALB: "AL", ALG: "DZ", AND: "AD", ANG: "AO", ARG: "AR",
  ARM: "AM", AUS: "AU", AUT: "AT", AZE: "AZ", BEL: "BE", BEN: "BJ",
  BFA: "BF", BIH: "BA", BLR: "BY", BOL: "BO", BOS: "BA", BRA: "BR",
  BUL: "BG", CAN: "CA", CHI: "CL", CHN: "CN", CIV: "CI", CMR: "CM",
  COD: "CD", COG: "CG", COL: "CO", CPV: "CV", CRC: "CR", CRO: "HR",
  CUB: "CU", CYP: "CY", CZE: "CZ", DEN: "DK", DOM: "DO", ECU: "EC",
  EGY: "EG", ENG: "GB", ESP: "ES", ETH: "ET", FIN: "FI", FRA: "FR",
  GAB: "GA", GEO: "GE", GER: "DE", GHA: "GH", GNB: "GW", GRE: "GR",
  GTM: "GT", GUI: "GN", HON: "HN", HUN: "HU", IDN: "ID", IND: "IN",
  IRL: "IE", IRN: "IR", IRQ: "IQ", ISL: "IS", ISR: "IL", ITA: "IT",
  IVC: "CI", JAM: "JM", JAP: "JP", JOR: "JO", KAZ: "KZ", KEN: "KE",
  KOR: "KR", KSA: "SA", KUW: "KW", LBN: "LB", MAR: "MA", MAS: "MY",
  MEX: "MX", MLI: "ML", MON: "ME", MOZ: "MZ", MRT: "MR", NCA: "NI",
  NED: "NL", NGA: "NG", NOR: "NO", NZL: "NZ", OMA: "OM", PAN: "PA",
  PAR: "PY", PER: "PE", PHI: "PH", POL: "PL", POR: "PT", PRK: "KP",
  QAT: "QA", ROU: "RO", RSA: "ZA", RUS: "RU", SA: "SA", SAU: "SA",
  SCO: "GB", SEN: "SN", SLE: "SL", SLO: "SI", SLV: "SV", SOM: "SO",
  SRB: "RS", SSD: "SS", SUI: "CH", SUR: "SR", SVK: "SK", SVN: "SI",
  SWE: "SE", SYR: "SY", TAN: "TZ", THA: "TH", TRI: "TT", TUN: "TN",
  TUR: "TR", UAE: "AE", UGA: "UG", UKR: "UA", URU: "UY", USA: "US",
  UZB: "UZ", VEN: "VE", VIE: "VN", WAL: "GB", YEM: "YE", ZAM: "ZM",
  ZIM: "ZW",
  // 2-letter passthroughs
  US: "US", SK: "KR",
};

export function flagA2(tla?: string | null): string | null {
  if (!tla) return null;
  return TLA_TO_A2[tla.toUpperCase()] ?? (tla.length === 2 ? tla.toUpperCase() : null);
}

export function flagUrl(tla?: string | null): string | null {
  const a2 = flagA2(tla);
  return a2 ? `https://flagcdn.com/w80/${a2.toLowerCase()}.png` : null;
}
