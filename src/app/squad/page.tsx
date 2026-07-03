"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Minus, Star, MagnifyingGlass } from "@phosphor-icons/react";
import { useRequireAuth } from "@/lib/auth-context";
import { apiFetch } from "@/lib/api";
import type { FantasyEntry, Player } from "@/lib/types";
import { JerseyIcon } from "@/components/jersey-icon";
import { flagUrl } from "@/lib/flags";

type Position = "GK" | "DEF" | "MID" | "FWD";
const POSITION_ORDER: Position[] = ["GK", "DEF", "MID", "FWD"];

// Fixed 15-man squad layout — 2 GK, 5 DEF, 5 MID, 3 FWD
const PITCH_SLOTS: Record<Position, number> = { GK: 2, DEF: 5, MID: 5, FWD: 3 };
const POSITION_LIMITS: Record<Position, { min: number; max: number }> = {
  GK:  { min: 2, max: 2 },
  DEF: { min: 5, max: 5 },
  MID: { min: 5, max: 5 },
  FWD: { min: 3, max: 3 },
};

const POS_LABELS: Record<Position, string> = {
  GK: "Goalkeepers", DEF: "Defenders", MID: "Midfielders", FWD: "Forwards"
};

const DEFAULT_BUDGET = 100;
const SQUAD_SIZE = 15;

type SortKey = "pts" | "price";

function validateSquad(
  players: Player[],
  captainId: string,
  vcId: string,
  budget: number,
  maxPerTeam: number,
  squadSize: number
) {
  const errors: string[] = [];
  const budgetUsed = players.reduce((s, p) => s + p.price, 0);
  const posCounts: Record<string, number> = {};
  const teamCounts: Record<string, number> = {};
  for (const p of players) {
    posCounts[p.position] = (posCounts[p.position] ?? 0) + 1;
    teamCounts[p.teamId] = (teamCounts[p.teamId] ?? 0) + 1;
  }
  if (players.length !== squadSize)
    errors.push(`Select exactly ${squadSize} players (${players.length} chosen)`);
  if (budgetUsed > budget)
    errors.push(`Over budget by £${(budgetUsed - budget).toFixed(1)}m`);
  for (const pos of POSITION_ORDER) {
    const count = posCounts[pos] ?? 0;
    const { min, max } = POSITION_LIMITS[pos];
    if (count < min || count > max)
      errors.push(`${pos}: need ${min}–${max} (have ${count})`);
  }
  for (const count of Object.values(teamCounts)) {
    if (count > maxPerTeam) {
      errors.push(`Max ${maxPerTeam} players from one club`);
      break;
    }
  }
  if (!captainId || !players.find((p) => p.id === captainId))
    errors.push("Select a captain");
  if (!vcId || !players.find((p) => p.id === vcId))
    errors.push("Select a vice-captain");
  if (captainId && vcId && captainId === vcId)
    errors.push("Captain and vice-captain must be different");
  return { errors, budgetUsed };
}

export default function SquadPage() {
  const { competition } = useRequireAuth();

  const [allPlayers, setAllPlayers] = useState<Player[]>([]);
  const [entry, setEntry] = useState<FantasyEntry | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [captainId, setCaptainId] = useState("");
  const [vcId, setVcId] = useState("");
  const [squadName, setSquadName] = useState("My BGO XI");
  const [search, setSearch] = useState("");
  const [posFilter, setPosFilter] = useState<Position | "ALL">("ALL");
  const [sortKey, setSortKey] = useState<SortKey>("pts");
  const [saving, setSaving] = useState(false);
  const [renameSaving, setRenameSaving] = useState(false);
  const [notice, setNotice] = useState<{ type: "ok" | "err"; msg: string } | null>(null);
  const [mobileTab, setMobileTab] = useState<"market" | "squad">("market");

  const budget = competition?.settings?.budget ?? DEFAULT_BUDGET;
  const maxPerTeam = competition?.settings?.maxPlayersPerTeam ?? 3;
  const squadSize = competition?.settings?.squadSize ?? SQUAD_SIZE;

  useEffect(() => {
    if (!competition?.slug) return;
    Promise.all([
      apiFetch<{ players: Player[] }>(`/api/competitions/${competition.slug}/players`),
      apiFetch<{ entry: FantasyEntry | null }>(`/api/competitions/${competition.slug}/my-entry`)
    ]).then(([pData, eData]) => {
      setAllPlayers(pData.players);
      if (eData.entry) {
        setEntry(eData.entry);
        setSelectedIds(eData.entry.playerIds);
        setCaptainId(eData.entry.captainId ?? "");
        setVcId(eData.entry.viceCaptainId ?? "");
        setSquadName(eData.entry.name);
      }
    }).catch((err) =>
      setNotice({ type: "err", msg: err instanceof Error ? err.message : "Failed to load." })
    );
  }, [competition?.slug]);

  const playerMap = useMemo(() => new Map(allPlayers.map((p) => [p.id, p])), [allPlayers]);
  const selectedPlayers = useMemo(
    () => selectedIds.map((id) => playerMap.get(id)).filter(Boolean) as Player[],
    [selectedIds, playerMap]
  );
  const { errors, budgetUsed } = useMemo(
    () => validateSquad(selectedPlayers, captainId, vcId, budget, maxPerTeam, squadSize),
    [selectedPlayers, captainId, vcId, budget, maxPerTeam, squadSize]
  );
  const tw = competition?.settings?.transferWindow;
  const transfersRemaining = tw?.active ? Math.max(0, (tw.maxTransfers ?? 0) - (entry?.transferUsage ?? 0)) : 0;
  const isInTransferMode = !!(entry?.locked && tw?.active && transfersRemaining > 0);
  const isLocked = !!(entry?.locked && !isInTransferMode);
  const bankLeft = budget - budgetUsed;

  const squadByPos = useMemo(() => {
    const g: Record<Position, Player[]> = { GK: [], DEF: [], MID: [], FWD: [] };
    for (const id of selectedIds) {
      const p = playerMap.get(id);
      if (p) g[p.position as Position].push(p);
    }
    return g;
  }, [selectedIds, playerMap]);

  const filteredPlayers = useMemo(() => {
    return allPlayers
      .filter((p) => {
        if (posFilter !== "ALL" && p.position !== posFilter) return false;
        if (search && !p.name.toLowerCase().includes(search.toLowerCase()) &&
            !(p.teamShortName ?? "").toLowerCase().includes(search.toLowerCase())) return false;
        return true;
      })
      .sort((a, b) => sortKey === "pts"
        ? ((b.totalPoints ?? 0) - (a.totalPoints ?? 0)) || (b.price - a.price)
        : (b.price - a.price) || ((b.totalPoints ?? 0) - (a.totalPoints ?? 0))
      );
  }, [allPlayers, posFilter, search, sortKey]);

  // Group filtered players by position for display
  const groupedFiltered = useMemo(() => {
    if (posFilter !== "ALL") return { [posFilter]: filteredPlayers } as Record<string, Player[]>;
    const g: Record<string, Player[]> = {};
    for (const pos of POSITION_ORDER) {
      const pp = filteredPlayers.filter((p) => p.position === pos);
      if (pp.length > 0) g[pos] = pp;
    }
    return g;
  }, [filteredPlayers, posFilter]);

  function togglePlayer(player: Player) {
    if (isLocked) return;
    if (player.status === "unavailable") return;
    setSelectedIds((curr) => {
      if (curr.includes(player.id)) {
        if (captainId === player.id) setCaptainId("");
        if (vcId === player.id) setVcId("");
        return curr.filter((id) => id !== player.id);
      }
      if (curr.length >= squadSize) return curr;
      return [...curr, player.id];
    });
  }

  async function renameTeam() {
    if (!competition?.slug) return;
    setRenameSaving(true); setNotice(null);
    try {
      await apiFetch(`/api/competitions/${competition.slug}/my-entry`, {
        method: "PATCH",
        body: { name: squadName }
      });
      const updated = await apiFetch<{ entry: FantasyEntry | null }>(`/api/competitions/${competition.slug}/my-entry`);
      setEntry(updated.entry);
      setNotice({ type: "ok", msg: "Team name updated." });
    } catch (err) {
      setNotice({ type: "err", msg: err instanceof Error ? err.message : "Rename failed." });
    } finally {
      setRenameSaving(false);
    }
  }

  async function saveSquad(lock = false) {
    if (!competition?.slug) return;
    setSaving(true); setNotice(null);
    try {
      await apiFetch(`/api/competitions/${competition.slug}/my-entry`, {
        method: "POST",
        body: { name: squadName, playerIds: selectedIds, captainId, viceCaptainId: vcId }
      });
      if (lock) {
        await apiFetch(`/api/competitions/${competition.slug}/my-entry/lock`, { method: "POST" });
      }
      const updated = await apiFetch<{ entry: FantasyEntry | null }>(`/api/competitions/${competition.slug}/my-entry`);
      setEntry(updated.entry);
      setNotice({ type: "ok", msg: lock ? "Squad locked." : "Squad saved." });
    } catch (err) {
      setNotice({ type: "err", msg: err instanceof Error ? err.message : "Save failed." });
    } finally {
      setSaving(false);
    }
  }

  // ── Player list row ─────────────────────────────────────────────────────────
  function PlayerRow({ player }: { player: Player }) {
    const isSelected = selectedIds.includes(player.id);
    const isCap = captainId === player.id;
    const isVC = vcId === player.id;
    const full = !isSelected && selectedIds.length >= squadSize;
    const unavailable = player.status === "unavailable" || (full && !isSelected);
    const clickable = !isLocked && !(unavailable && !isSelected);

    const posColor: Record<string, string> = {
      GK: "hsl(var(--pos-gk))", DEF: "hsl(var(--pos-def))",
      MID: "hsl(var(--pos-mid))", FWD: "hsl(var(--pos-fwd))",
    };
    const posBg: Record<string, string> = {
      GK: "hsl(var(--pos-gk-bg))", DEF: "hsl(var(--pos-def-bg))",
      MID: "hsl(var(--pos-mid-bg))", FWD: "hsl(var(--pos-fwd-bg))",
    };

    return (
      <motion.div
        layout
        initial={{ opacity: 0 }}
        animate={{ opacity: unavailable && !isSelected ? 0.4 : 1 }}
        transition={{ duration: 0.12 }}
        style={{
          display: "grid",
          gridTemplateColumns: "36px 1fr auto auto 36px",
          alignItems: "center",
          gap: 8,
          padding: "8px 12px",
          borderBottom: "1px solid hsl(var(--line))",
          background: isSelected
            ? "hsl(var(--brand-muted))"
            : "transparent",
          cursor: clickable ? "pointer" : "default",
          transition: "background 120ms ease",
        }}
        whileHover={clickable ? { backgroundColor: isSelected ? undefined : "hsl(var(--surface-overlay))" } : {}}
        onClick={() => clickable && togglePlayer(player)}
      >
        {/* Jersey */}
        <JerseyIcon tla={player.teamShortName ?? ""} size={30} />

        {/* Name + meta */}
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
            <span style={{ fontWeight: 700, fontSize: "0.84rem", lineHeight: 1.25 }}>
              {player.name}
            </span>
            {isCap && (
              <span style={{
                fontSize: "0.58rem", fontWeight: 900, letterSpacing: "0.04em",
                background: "hsl(var(--accent2))", color: "hsl(var(--accent2-fg))",
                borderRadius: 3, padding: "1px 5px",
              }}>C</span>
            )}
            {isVC && (
              <span style={{
                fontSize: "0.58rem", fontWeight: 900,
                background: "hsl(var(--brand))", color: "hsl(var(--brand-fg))",
                borderRadius: 3, padding: "1px 5px",
              }}>V</span>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 2 }}>
            {flagUrl(player.teamShortName) ? (
              <img
                src={flagUrl(player.teamShortName)!}
                alt={player.teamShortName ?? ""}
                height={13}
                style={{ borderRadius: 2, objectFit: "cover", display: "block" }}
              />
            ) : (
              <span style={{ fontSize: "0.7rem", color: "hsl(var(--ink-muted))", fontWeight: 600 }}>
                {player.teamShortName ?? "—"}
              </span>
            )}
            <span style={{
              fontSize: "0.6rem", fontWeight: 800, letterSpacing: "0.04em",
              background: posBg[player.position] ?? "hsl(var(--surface-overlay))",
              color: posColor[player.position] ?? "hsl(var(--ink-muted))",
              borderRadius: 3, padding: "0 4px",
            }}>
              {player.position}
            </span>
            {player.status !== "available" && (
              <span className={`badge badge-${player.status}`} style={{ fontSize: "0.58rem", padding: "0 3px" }}>
                {player.status}
              </span>
            )}
          </div>
        </div>

        {/* Price */}
        <div style={{
          fontWeight: 700, fontSize: "0.8rem", textAlign: "right",
          color: "hsl(var(--ink))", fontVariantNumeric: "tabular-nums", minWidth: 36,
        }}>
          £{player.price}m
        </div>

        {/* Points */}
        <div style={{
          fontWeight: 700, fontSize: "0.85rem", textAlign: "right",
          color: "hsl(var(--brand))", fontVariantNumeric: "tabular-nums", minWidth: 32,
        }}>
          {player.totalPoints != null ? player.totalPoints : "—"}
        </div>

        {/* Add/remove button */}
        <motion.button
          whileTap={{ scale: 0.88 }}
          style={{
            width: 30, height: 30, borderRadius: "50%",
            border: `2px solid ${isSelected ? "hsl(var(--danger))" : "hsl(var(--brand))"}`,
            background: isSelected ? "hsl(var(--danger) / 0.12)" : "hsl(var(--brand) / 0.1)",
            color: isSelected ? "hsl(var(--danger))" : "hsl(var(--brand))",
            cursor: isLocked || (unavailable && !isSelected) ? "not-allowed" : "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0, transition: "all 120ms ease",
          }}
          disabled={!!isLocked || (unavailable && !isSelected)}
          onClick={(e) => { e.stopPropagation(); togglePlayer(player); }}
        >
          {isSelected
            ? <Minus size={14} weight="bold" />
            : <Plus size={14} weight="bold" />}
        </motion.button>
      </motion.div>
    );
  }

  // ── Pitch player token ──────────────────────────────────────────────────────
  function PitchSlot({ player, pos }: { player?: Player; pos: Position }) {
    if (!player) {
      return (
        <div
          onClick={() => setPosFilter(pos)}
          style={{
            display: "flex", flexDirection: "column", alignItems: "center",
            gap: "3px", cursor: "pointer", minWidth: "56px", maxWidth: "68px"
          }}
        >
          <div style={{
            width: "44px", height: "44px", borderRadius: "50%",
            background: "rgba(0,0,0,0.3)", border: "2px dashed rgba(255,255,255,0.4)",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "rgba(255,255,255,0.6)", fontSize: "1.2rem", fontWeight: 300
          }}>
            +
          </div>
          <div style={{ fontSize: "0.62rem", fontWeight: 800, color: "rgba(255,255,255,0.5)", letterSpacing: "0.05em" }}>{pos}</div>
        </div>
      );
    }

    const isCap = captainId === player.id;
    const isVC = vcId === player.id;
    const shortName = player.name.split(" ").slice(-1)[0] ?? player.name;
    const multiplier = isCap ? 2 : isVC ? 1.5 : 1;
    const pts = player.totalPoints != null ? player.totalPoints * multiplier : null;

    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "2px", minWidth: "56px", maxWidth: "72px", position: "relative" }}>
        {/* Armband */}
        {(isCap || isVC) && (
          <div style={{
            position: "absolute", top: 0, right: "6px",
            width: "16px", height: "16px", borderRadius: "50%",
            background: isCap ? "hsl(var(--accent2))" : "hsl(var(--brand))",
            color: isCap ? "hsl(var(--accent2-fg))" : "hsl(var(--brand-fg))",
            fontSize: "0.55rem", fontWeight: 900,
            display: "flex", alignItems: "center", justifyContent: "center",
            zIndex: 2
          }}>
            {isCap ? "C" : "V"}
          </div>
        )}

        <JerseyIcon tla={player.teamShortName ?? ""} size={42} />

        {/* Name */}
        <div style={{
          fontSize: "0.67rem", fontWeight: 700, color: "#fff",
          textShadow: "0 1px 4px rgba(0,0,0,0.9)",
          maxWidth: "68px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          textAlign: "center"
        }}>
          {shortName}
        </div>

        {/* Price / pts */}
        <div style={{
          fontSize: "0.62rem", fontWeight: 700, color: "#fff",
          background: "rgba(0,0,0,0.65)", borderRadius: "3px", padding: "1px 5px",
          fontVariantNumeric: "tabular-nums"
        }}>
          {`£${player.price}m`}
        </div>

        {/* Actions */}
        {!isLocked && (
          <div style={{ display: "flex", gap: "2px", marginTop: "2px" }}>
            <button
              onClick={() => setCaptainId(isCap ? "" : player.id)}
              title="Captain"
              style={{
                fontSize: "0.58rem", fontWeight: 900, padding: "1px 4px",
                borderRadius: "2px", border: "1px solid rgba(255,255,255,0.3)",
                background: isCap ? "hsl(var(--accent2))" : "rgba(0,0,0,0.5)",
                color: isCap ? "hsl(var(--accent2-fg))" : "#fff",
                cursor: "pointer"
              }}
            >C</button>
            <button
              onClick={() => setVcId(isVC ? "" : player.id)}
              title="Vice-captain"
              style={{
                fontSize: "0.58rem", fontWeight: 900, padding: "1px 4px",
                borderRadius: "2px", border: "1px solid rgba(255,255,255,0.3)",
                background: isVC ? "hsl(var(--brand))" : "rgba(0,0,0,0.5)",
                color: "#fff", cursor: "pointer"
              }}
            >V</button>
            <button
              onClick={() => togglePlayer(player)}
              title="Remove"
              style={{
                fontSize: "0.75rem", fontWeight: 900, padding: "1px 4px",
                borderRadius: "2px", border: "none",
                background: "rgba(185,28,28,0.7)", color: "#fff", cursor: "pointer"
              }}
            >×</button>
          </div>
        )}
      </div>
    );
  }

  function PitchRow({ pos }: { pos: Position }) {
    const slots = PITCH_SLOTS[pos];
    const players = squadByPos[pos];
    return (
      <div style={{ display: "flex", justifyContent: "center", gap: "6px", margin: "6px 0" }}>
        {Array.from({ length: slots }).map((_, i) => (
          <PitchSlot key={i} player={players[i]} pos={pos} />
        ))}
      </div>
    );
  }

  // ── Market panel ─────────────────────────────────────────────────────────────
  const MarketPanel = (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Search */}
      <div style={{ position: "relative", marginBottom: "10px" }}>
        <MagnifyingGlass size={14} weight="bold" style={{ position: "absolute", left: "11px", top: "50%", transform: "translateY(-50%)", color: "hsl(var(--ink-muted))", pointerEvents: "none" }} />
        <input
          className="filter-search"
          style={{ paddingLeft: "32px", width: "100%" }}
          placeholder="Search by name or club…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Filters + sort */}
      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "8px", alignItems: "center" }}>
        <div className="pos-tabs" style={{ flex: 1 }}>
          {(["ALL", ...POSITION_ORDER] as const).map((pos) => (
            <button key={pos} className={`pos-tab ${posFilter === pos ? "active" : ""}`} onClick={() => setPosFilter(pos)}>
              {pos === "ALL" ? "All" : pos}
            </button>
          ))}
        </div>
        <select
          className="form-input"
          style={{ minHeight: 0, height: "32px", padding: "0 8px", fontSize: "0.78rem", width: "auto" }}
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value as SortKey)}
        >
          <option value="pts">Sort: Total points</option>
          <option value="price">Sort: Price</option>
        </select>
      </div>

      {/* Column headers */}
      <div style={{
        display: "grid", gridTemplateColumns: "36px 1fr auto auto 36px",
        gap: "8px", padding: "5px 10px",
        fontSize: "0.68rem", fontWeight: 700, color: "hsl(var(--ink-muted))",
        textTransform: "uppercase", letterSpacing: "0.06em",
        borderBottom: "1px solid hsl(var(--line-strong))"
      }}>
        <div />
        <div>Player</div>
        <div style={{ textAlign: "right" }}>Price</div>
        <div style={{ textAlign: "right" }}>Pts</div>
        <div />
      </div>

      {/* Player rows grouped by position */}
      <div style={{ overflow: "auto", flex: 1 }}>
        {Object.entries(groupedFiltered).map(([pos, players]) => (
          <div key={pos}>
            <div style={{
              padding: "6px 10px 4px",
              fontSize: "0.72rem", fontWeight: 800,
              color: "hsl(var(--ink-secondary))",
              background: "hsl(var(--surface-sunken))",
              borderBottom: "1px solid hsl(var(--line))",
              display: "flex", justifyContent: "space-between", alignItems: "center"
            }}>
              <span>{POS_LABELS[pos as Position]}</span>
              <span style={{ color: "hsl(var(--ink-muted))", fontWeight: 600 }}>
                {squadByPos[pos as Position]?.length ?? 0} / {PITCH_SLOTS[pos as Position]} selected
              </span>
            </div>
            {players.map((p) => <PlayerRow key={p.id} player={p} />)}
          </div>
        ))}
        {filteredPlayers.length === 0 && (
          <p className="empty-state">No players match your filters.</p>
        )}
      </div>
    </div>
  );

  // ── Squad / pitch panel ───────────────────────────────────────────────────────
  const SquadPanel = (
    <div style={{ position: "sticky", top: "68px" }}>
      {/* Header bar */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px", flexWrap: "wrap" }}>
        <input
          className="squad-name-input"
          style={{ flex: 1, minWidth: "120px" }}
          placeholder="Team name"
          value={squadName}
          onChange={(e) => setSquadName(e.target.value)}
        />
        {isLocked && (
          <button
            className="btn-outline"
            style={{ whiteSpace: "nowrap", fontSize: "0.78rem", minHeight: 34, padding: "0 12px" }}
            disabled={renameSaving}
            onClick={() => void renameTeam()}
          >
            {renameSaving ? "…" : "Rename"}
          </button>
        )}
        <div style={{
          background: selectedIds.length === 0 ? "hsl(var(--danger))" : selectedIds.length === squadSize ? "hsl(var(--ok))" : "hsl(var(--warn))",
          color: "#fff", borderRadius: "6px", padding: "4px 10px",
          fontSize: "0.78rem", fontWeight: 800, whiteSpace: "nowrap"
        }}>
          {selectedIds.length} / {squadSize}
        </div>
        <div style={{
          background: bankLeft < 0 ? "hsl(var(--danger))" : "hsl(142 64% 30%)",
          color: "#fff", borderRadius: "6px", padding: "4px 10px",
          fontSize: "0.78rem", fontWeight: 800, whiteSpace: "nowrap"
        }}>
          £{bankLeft.toFixed(1)}m
        </div>
      </div>

      {isLocked && (
        <p className="notice" style={{ marginBottom: "8px", fontSize: "0.8rem" }}>
          {tw?.active && transfersRemaining === 0
            ? `All ${tw.maxTransfers} transfers used — squad locked until next window.`
            : "Squad locked — transfers open when admin opens a window."}
        </p>
      )}

      {/* Pitch */}
      <div style={{
        borderRadius: "12px", overflow: "hidden",
        border: "2px solid #166534",
        boxShadow: "0 0 0 4px rgba(0,0,0,0.4), 0 16px 48px rgba(0,0,0,0.6)"
      }}>
        {/* Goal net */}
        <div style={{
          background: "linear-gradient(180deg, #a3c4bc 0%, #4ade80 40%)",
          padding: "6px 8px 0",
          borderBottom: "2px solid rgba(255,255,255,0.15)"
        }}>
          <div style={{
            width: "40%", margin: "0 auto",
            border: "2px solid rgba(255,255,255,0.5)",
            borderBottom: "none", borderRadius: "4px 4px 0 0",
            height: "18px",
            background: "repeating-linear-gradient(90deg, transparent, transparent 4px, rgba(255,255,255,0.15) 4px, rgba(255,255,255,0.15) 5px)"
          }} />
        </div>

        {/* Pitch surface */}
        <div style={{
          background: "linear-gradient(180deg, #16a34a 0%, #15803d 10%, #16a34a 10%, #16a34a 20%, #15803d 20%, #15803d 30%, #16a34a 30%, #16a34a 40%, #15803d 40%, #15803d 50%, #16a34a 50%, #16a34a 60%, #15803d 60%, #15803d 70%, #16a34a 70%, #16a34a 80%, #15803d 80%, #15803d 90%, #16a34a 90%, #16a34a 100%)",
          padding: "10px 4px 14px", position: "relative"
        }}>
          {/* Centre line */}
          <div style={{ position: "absolute", top: "50%", left: "6%", right: "6%", height: "1px", background: "rgba(255,255,255,0.2)" }} />
          {/* Centre circle */}
          <div style={{
            position: "absolute", top: "50%", left: "50%",
            transform: "translate(-50%, -50%)",
            width: "60px", height: "60px", borderRadius: "50%",
            border: "1px solid rgba(255,255,255,0.2)"
          }} />

          <PitchRow pos="GK" />
          <PitchRow pos="DEF" />
          <PitchRow pos="MID" />
          <PitchRow pos="FWD" />
        </div>
      </div>

      {/* Validation errors */}
      {errors.length > 0 && !isLocked && (
        <ul className="validation-list" style={{ marginTop: "10px" }}>
          {errors.map((e, i) => <li key={i}>{e}</li>)}
        </ul>
      )}

      {/* Notice */}
      {notice && (
        <p className={`notice ${notice.type === "err" ? "notice-error" : ""}`} style={{ marginTop: "8px" }}>
          {notice.msg}
        </p>
      )}

      {/* Actions */}
      {!isLocked && (
        <div style={{ display: "flex", gap: "8px", marginTop: "10px" }}>
          {isInTransferMode ? (
            <button
              className="btn" style={{ flex: 1 }}
              disabled={saving || errors.length > 0}
              onClick={() => saveSquad(false)}
            >
              {saving ? "Saving…" : `Save transfers (${transfersRemaining} left)`}
            </button>
          ) : (
            <>
              <button className="btn-outline" style={{ flex: 1 }} disabled={saving} onClick={() => saveSquad(false)}>
                {saving ? "Saving…" : "Save"}
              </button>
              <button
                className="btn" style={{ flex: 1 }}
                disabled={saving || errors.length > 0}
                onClick={() => {
                  if (confirm("Lock your squad? You won't be able to change it without a transfer window.")) {
                    void saveSquad(true);
                  }
                }}
              >
                {saving ? "…" : "Lock squad"}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );

  return (
    <div className="page-wide">
      <div className="page-header">
        <h1 className="page-title">Squad Builder</h1>
        <p className="page-subtitle">
          Pick {squadSize} players within £{budget}m · Captain earns 2× · Vice-captain earns 1.5×
        </p>
      </div>

      {/* Mobile tabs */}
      <div className="admin-tabs" style={{ marginBottom: "16px" }}>
        <button className={`admin-tab ${mobileTab === "market" ? "active" : ""}`} onClick={() => setMobileTab("market")}>
          Players ({allPlayers.length})
        </button>
        <button className={`admin-tab ${mobileTab === "squad" ? "active" : ""}`} onClick={() => setMobileTab("squad")}>
          My Squad ({selectedIds.length}/{squadSize})
        </button>
      </div>

      <div className="squad-layout">
        <div className={mobileTab === "squad" ? "mobile-hide" : ""}>
          {MarketPanel}
        </div>
        <div className={mobileTab === "market" ? "mobile-hide" : ""}>
          {SquadPanel}
        </div>
      </div>
    </div>
  );
}
