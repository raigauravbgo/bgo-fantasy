import { z } from "zod";
import { hashPassword } from "@/server/auth/password";
import { handleApiError, json, parseJson, requireAdminUser, RequestError } from "@/server/api/http";
import { platformRepository } from "@/server/repositories/platform";
import { usersRepository } from "@/server/repositories/users";
import type { NextRequest } from "next/server";

const schema = z.object({ competitionId: z.string() });

const DUMMY_USERS = [
  { name: "Alice Hartley",  email: "alice@bgo-test.local"  },
  { name: "Ben Okafor",     email: "ben@bgo-test.local"    },
  { name: "Chloe Nair",     email: "chloe@bgo-test.local"  },
  { name: "Diego Vargas",   email: "diego@bgo-test.local"  },
  { name: "Emma Lindqvist", email: "emma@bgo-test.local"   },
];

// Pick n players seeded by index so squads differ but are deterministic
function pickPlayers(players: { id: string; position: string; price: number }[], seed: number, budget: number, squadSize: number) {
  // Ensure at least 1 GK, 3 DEF, 3 MID, 1 FWD then fill remainder
  const byPos: Record<string, typeof players> = { GK: [], DEF: [], MID: [], FWD: [] };
  for (const p of players) {
    byPos[p.position]?.push(p);
  }

  // Rotate starting index by seed so each squad gets different players
  const rotate = <T>(arr: T[], n: number) => [...arr.slice(n % arr.length), ...arr.slice(0, n % arr.length)];

  const gks  = rotate(byPos.GK,  seed * 3).slice(0, 1);
  const defs = rotate(byPos.DEF, seed * 7).slice(0, 5);
  const mids = rotate(byPos.MID, seed * 5).slice(0, 5);
  const fwds = rotate(byPos.FWD, seed * 4).slice(0, 4);

  let squad = [...gks, ...defs, ...mids, ...fwds].slice(0, squadSize);

  // Trim to budget (drop most expensive until within budget)
  let cost = squad.reduce((s, p) => s + p.price, 0);
  squad.sort((a, b) => b.price - a.price);
  while (cost > budget && squad.length > 1) {
    cost -= squad[0].price;
    squad = squad.slice(1);
  }

  return squad;
}

export async function POST(request: NextRequest) {
  try {
    await requireAdminUser();
    const { competitionId } = await parseJson(request, schema);

    const repo = platformRepository();
    const usersRepo = usersRepository();

    const competition = await repo.competitions.findById(competitionId);
    if (!competition) throw new RequestError("Competition not found", 404);

    const budget = competition.settings?.budget ?? 100;
    const squadSize = competition.settings?.squadSize ?? 15;
    const players = await repo.players.list(competitionId);
    if (players.length < squadSize) throw new RequestError(`Need at least ${squadSize} players imported first`, 400);

    const passwordHash = await hashPassword("password123");
    const created: string[] = [];

    for (let i = 0; i < DUMMY_USERS.length; i++) {
      const u = DUMMY_USERS[i];

      // Create user if not exists
      const existing = await usersRepo.findByEmail(u.email);
      const user = existing ?? await usersRepo.create({
        name: u.name, email: u.email, passwordHash, role: "player"
      });

      const squad = pickPlayers(players, i + 1, budget, squadSize);
      if (squad.length < 2) continue;

      const captainId = squad[squad.length - 1].id;
      const viceCaptainId = squad[squad.length - 2].id;
      const budgetUsed = squad.reduce((s, p) => s + p.price, 0);

      await repo.entries.save({
        competitionId,
        userId: user.id,
        name: `${u.name.split(" ")[0]}'s XI`,
        playerIds: squad.map((p) => p.id),
        captainId,
        viceCaptainId,
        budgetUsed,
        locked: false,
        lockedAt: null,
        transferUsage: 0,
      });

      created.push(u.name);
    }

    await repo.audit.create({
      actorUserId: null,
      action: "dev.seed-squads",
      entityType: "competition",
      entityId: competitionId,
      competitionId,
      after: { created }
    });

    return json({ created, password: "password123" });
  } catch (error) {
    return handleApiError(error);
  }
}
