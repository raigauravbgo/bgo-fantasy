"use client";

import { useEffect, useMemo, useState } from "react";
import { useRequireAuth } from "@/lib/auth-context";
import { apiFetch } from "@/lib/api";
import type { FantasyEntry, Player } from "@/lib/types";
import { JerseyIcon } from "@/components/jersey-icon";

const POSITION_ORDER = ["GK", "DEF", "MID", "FWD"] as const;
type Position = (typeof POSITION_ORDER)[number];

const POSITION_LIMITS: Record<Position, { min: number; max: number }> = {
  GK: { min: 1, max: 1 },
  DEF: { min: 3, max: 5 },
  MID: { min: 3, max: 5 },
  FWD: { min: 1, max: 3 }
};

const SQUAD_SIZE = 11;
const DEFAULT_BUDGET = 100;

function positionBadge(pos: string) {
  return (
    <span className={`badge badge-${pos.toLowerCase()}`}>{pos}</span>
  );
}

function statusBadge(status: string) {
  if (status === "available") return null;
  return <span className={`badge badge-${status}`}>{status}</span>;
}

function validateSquadClient(
  players: Player[],
  captainId: string,
  viceCaptainId: string,
  budget: number,
  maxPerTeam: number,
  squadSize: number
) {
  const errors: string[] = [];
  const budgetUsed = players.reduce((s, p) => s + p.price, 0);
  const byCounts: Record<string, number> = {};
  const posCounts: Record<string, number> = {};

  for (const p of players) {
    posCounts[p.position] = (posCounts[p.position] ?? 0) + 1;
    const team = p.teamId;
    byCounts[team] = (byCounts[team] ?? 0) + 1;
  }

  if (players.length !== squadSize)
    errors.push(`Squad must contain exactly ${squadSize} players`);
  if (budgetUsed > budget)
    errors.push(`Over budget by ${(budgetUsed - budget).toFixed(1)}`);

  for (const pos of POSITION_ORDER) {
    const count = posCounts[pos] ?? 0;
    const { min, max } = POSITION_LIMITS[pos];
    if (count < min || count > max)
      errors.push(`${pos}: need ${min}–${max} (have ${count})`);
  }

  for (const [team, count] of Object.entries(byCounts)) {
    if (count > maxPerTeam)
      errors.push(
        `Too many players from one team (max ${maxPerTeam} per team)`
      );
    void team;
  }

  const ids = new Set(players.map((p) => p.id));
  if (!captainId || !ids.has(captainId)) errors.push("Select a captain");
  if (!viceCaptainId || !ids.has(viceCaptainId))
    errors.push("Select a vice-captain");
  if (captainId && viceCaptainId && captainId === viceCaptainId)
    errors.push("Captain and vice-captain must be different");

  return { errors, budgetUsed };
}

export default function SquadPage() {
  const { competition } = useRequireAuth();

  const [allPlayers, setAllPlayers] = useState<Player[]>([]);
  const [entry, setEntry] = useState<FantasyEntry | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [captainId, setCaptainId] = useState("");
  const [viceCaptainId, setViceCaptainId] = useState("");
  const [squadName, setSquadName] = useState("My BGO XI");
  const [search, setSearch] = useState("");
  const [posFilter, setPosFilter] = useState<Position | "ALL">("ALL");
  const [saving, setSaving] = useState(false);
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
        setViceCaptainId(eData.entry.viceCaptainId ?? "");
        setSquadName(eData.entry.name);
      }
    }).catch((err) =>
      setNotice({ type: "err", msg: err instanceof Error ? err.message : "Failed to load." })
    );
  }, [competition?.slug]);

  const playerMap = useMemo(
    () => new Map(allPlayers.map((p) => [p.id, p])),
    [allPlayers]
  );

  const selectedPlayers = useMemo(
    () => selectedIds.map((id) => playerMap.get(id)).filter(Boolean) as Player[],
    [selectedIds, playerMap]
  );

  const { errors, budgetUsed } = useMemo(
    () => validateSquadClient(selectedPlayers, captainId, viceCaptainId, budget, maxPerTeam, squadSize),
    [selectedPlayers, captainId, viceCaptainId, budget, maxPerTeam]
  );

  const isValid = errors.length === 0;

  const filteredPlayers = useMemo(() => {
    return allPlayers.filter((p) => {
      if (posFilter !== "ALL" && p.position !== posFilter) return false;
      if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [allPlayers, posFilter, search]);

  function togglePlayer(player: Player) {
    if (entry?.locked && !competition?.settings?.transferWindow?.active) return;
    if (player.status === "unavailable") return;

    setSelectedIds((curr) => {
      if (curr.includes(player.id)) {
        // Deselect — also clear C/VC if this was them
        if (captainId === player.id) setCaptainId("");
        if (viceCaptainId === player.id) setViceCaptainId("");
        return curr.filter((id) => id !== player.id);
      }
      if (curr.length >= squadSize) return curr;
      return [...curr, player.id];
    });
  }

  async function saveSquad(lock = false) {
    if (!competition?.slug) return;
    setSaving(true);
    setNotice(null);
    try {
      await apiFetch(`/api/competitions/${competition.slug}/my-entry`, {
        method: "POST",
        body: { name: squadName, playerIds: selectedIds, captainId, viceCaptainId }
      });
      if (lock) {
        await apiFetch(`/api/competitions/${competition.slug}/my-entry/lock`, {
          method: "POST"
        });
      }
      const updated = await apiFetch<{ entry: FantasyEntry | null }>(
        `/api/competitions/${competition.slug}/my-entry`
      );
      setEntry(updated.entry);
      setNotice({ type: "ok", msg: lock ? "Squad locked." : "Squad saved." });
    } catch (err) {
      setNotice({ type: "err", msg: err instanceof Error ? err.message : "Save failed." });
    } finally {
      setSaving(false);
    }
  }

  const isLocked = entry?.locked && !competition?.settings?.transferWindow?.active;

  // Squad grouped by position
  const squadByPosition = useMemo(() => {
    const grouped: Record<Position, Player[]> = {
      GK: [], DEF: [], MID: [], FWD: []
    };
    for (const id of selectedIds) {
      const p = playerMap.get(id);
      if (p) grouped[p.position as Position].push(p);
    }
    return grouped;
  }, [selectedIds, playerMap]);

  // Constraint checklist items
  const constraints = [
    { label: `Players: ${selectedIds.length}/${squadSize}`, met: selectedIds.length === squadSize },
    { label: `Budget: ${budgetUsed}/${budget}`, met: budgetUsed <= budget },
    ...POSITION_ORDER.map((pos) => {
      const count = squadByPosition[pos].length;
      const { min, max } = POSITION_LIMITS[pos];
      return { label: `${pos}: ${count} (need ${min}–${max})`, met: count >= min && count <= max };
    }),
    { label: "Captain selected", met: !!captainId && selectedIds.includes(captainId) },
    { label: "Vice-captain selected", met: !!viceCaptainId && selectedIds.includes(viceCaptainId) }
  ];

  const MarketPanel = (
    <div>
      <div className="card-title">Player Marketplace</div>
      <div className="filter-bar">
        <input
          className="filter-search"
          placeholder="Search players…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="pos-tabs">
          {(["ALL", ...POSITION_ORDER] as const).map((pos) => (
            <button
              key={pos}
              className={`pos-tab ${posFilter === pos ? "active" : ""}`}
              onClick={() => setPosFilter(pos)}
            >
              {pos}
            </button>
          ))}
        </div>
      </div>

      {filteredPlayers.length === 0 ? (
        <p className="empty-state">No players match your filters.</p>
      ) : (
        <div className="player-grid">
          {filteredPlayers.map((player) => {
            const isSelected = selectedIds.includes(player.id);
            const isCap = captainId === player.id;
            const isVC = viceCaptainId === player.id;
            const unavailable =
              player.status === "unavailable" ||
              (!isSelected && selectedIds.length >= squadSize);

            return (
              <button
                key={player.id}
                className={`player-card ${isSelected ? "selected" : ""}`}
                disabled={!!isLocked || (unavailable && !isSelected)}
                onClick={() => togglePlayer(player)}
              >
                <div className="player-card-top">
                  {positionBadge(player.position)}
                  <div style={{ display: "flex", gap: "4px", flexShrink: 0 }}>
                    {isCap && <span className="player-cap-label">C</span>}
                    {isVC && <span className="player-cap-label">VC</span>}
                  </div>
                </div>
                <div style={{ display: "flex", justifyContent: "center", margin: "4px 0 2px" }}>
                  <JerseyIcon tla={player.teamShortName ?? ""} size={34} />
                </div>
                <div className="player-name">{player.name}</div>
                <div className="player-meta">
                  <span>{player.teamShortName ?? "—"}</span>
                  {statusBadge(player.status)}
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: "6px" }}>
                  <span className="player-price">£{player.price}</span>
                  {player.totalPoints != null ? (
                    <span className="player-pts">{player.totalPoints} pts</span>
                  ) : null}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );

  const SquadPanel = (
    <div className="squad-panel">
      <div className="card-title">My Squad</div>

      {isLocked ? (
        <p className="notice" style={{ marginBottom: "12px" }}>
          Squad is locked. Transfers open when admin opens a window.
        </p>
      ) : null}

      <div className="squad-name-row">
        <input
          className="squad-name-input"
          disabled={!!isLocked}
          placeholder="Squad name"
          value={squadName}
          onChange={(e) => setSquadName(e.target.value)}
        />
      </div>

      {/* Budget bar */}
      <div className="budget-bar-wrap">
        <div className="budget-bar-label">
          <span>Budget used: £{budgetUsed}</span>
          <span>£{budget} total</span>
        </div>
        <div className="budget-bar-track">
          <div
            className={`budget-bar-fill ${budgetUsed > budget ? "over" : ""}`}
            style={{ width: `${Math.min((budgetUsed / budget) * 100, 100)}%` }}
          />
        </div>
      </div>

      {/* Squad by position */}
      {POSITION_ORDER.map((pos) => {
        const { min } = POSITION_LIMITS[pos];
        const players = squadByPosition[pos];
        const slots = Math.max(players.length, min);

        return (
          <div key={pos} className="squad-section">
            <div className="squad-section-label">{pos}</div>
            {Array.from({ length: slots }).map((_, i) => {
              const p = players[i];
              if (!p) {
                return (
                  <div key={i} className="squad-slot-empty">
                    + Add {pos}
                  </div>
                );
              }
              const isCap = captainId === p.id;
              const isVC = viceCaptainId === p.id;
              const multiplier = isCap ? 2 : isVC ? 1.5 : 1;
              const effectivePts = p.totalPoints != null ? p.totalPoints * multiplier : null;
              return (
                <div key={p.id} className="squad-player-row">
                  {positionBadge(p.position)}
                  <div className="player-name">{p.name}</div>
                  {effectivePts != null && (
                    <span style={{
                      marginLeft: "auto",
                      fontSize: "0.78rem",
                      fontWeight: 700,
                      color: effectivePts > 0 ? "var(--success)" : effectivePts < 0 ? "var(--error)" : "var(--muted)",
                      whiteSpace: "nowrap"
                    }}>
                      {effectivePts % 1 !== 0 ? effectivePts.toFixed(1) : effectivePts} pts
                      {multiplier > 1 && (
                        <span style={{ fontSize: "0.68rem", color: "var(--muted)", marginLeft: "3px" }}>
                          ×{multiplier}
                        </span>
                      )}
                    </span>
                  )}
                  {!isLocked && (
                    <>
                      <button
                        className={`cap-btn ${isCap ? "is-cap" : ""}`}
                        title="Set as captain (2× points)"
                        onClick={() =>
                          setCaptainId(isCap ? "" : p.id)
                        }
                      >
                        C
                      </button>
                      <button
                        className={`cap-btn ${isVC ? "is-vc" : ""}`}
                        title="Set as vice-captain (1.5× points)"
                        onClick={() =>
                          setViceCaptainId(isVC ? "" : p.id)
                        }
                      >
                        VC
                      </button>
                      <button
                        className="squad-remove-btn"
                        onClick={() => togglePlayer(p)}
                        title="Remove"
                      >
                        ×
                      </button>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}

      {/* Points total */}
      {selectedPlayers.some((p) => p.totalPoints != null) && (() => {
        const total = selectedPlayers.reduce((sum, p) => {
          if (p.totalPoints == null) return sum;
          const m = p.id === captainId ? 2 : p.id === viceCaptainId ? 1.5 : 1;
          return sum + p.totalPoints * m;
        }, 0);
        return (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderTop: "1px solid var(--border)", marginTop: "8px" }}>
            <span style={{ fontSize: "0.85rem", color: "var(--muted)" }}>Total squad points</span>
            <span style={{ fontWeight: 800, fontSize: "1.05rem", color: "var(--accent)" }}>
              {total % 1 !== 0 ? total.toFixed(1) : total}
            </span>
          </div>
        );
      })()}

      {/* Constraint checklist */}
      <div className="constraint-checklist">
        {constraints.map((c, i) => (
          <div key={i} className={`constraint-item ${c.met ? "met" : ""}`}>
            {c.label}
          </div>
        ))}
      </div>

      {notice ? (
        <p className={`notice ${notice.type === "err" ? "notice-error" : ""}`}>
          {notice.msg}
        </p>
      ) : null}

      {!isLocked && (
        <div className="squad-actions">
          <button
            className="btn-outline"
            disabled={saving}
            onClick={() => saveSquad(false)}
          >
            {saving ? "Saving…" : "Save"}
          </button>
          <button
            className="btn"
            disabled={saving || !isValid}
            onClick={() => {
              if (confirm("Are you sure you want to lock your squad? This cannot be undone without an admin transfer window.")) {
                void saveSquad(true);
              }
            }}
          >
            {saving ? "…" : "Lock squad"}
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div className="page-wide">
      <div className="page-header">
        <h1 className="page-title">Squad Builder</h1>
        <p className="page-subtitle">
          Pick {squadSize} players within £{budget} · Captain earns 2× · Vice-captain earns 1.5×
        </p>
      </div>

      {/* Mobile tab toggle */}
      <div className="admin-tabs" style={{ marginBottom: "16px" }}>
        <button
          className={`admin-tab ${mobileTab === "market" ? "active" : ""}`}
          onClick={() => setMobileTab("market")}
        >
          Marketplace ({allPlayers.length})
        </button>
        <button
          className={`admin-tab ${mobileTab === "squad" ? "active" : ""}`}
          onClick={() => setMobileTab("squad")}
        >
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
