import type {
  Announcement,
  AuditLog,
  Competition,
  EntryPoints,
  FantasyEntry,
  Fixture,
  Player,
  PlayerPoints,
  PredictionResult,
  PredictionSet,
  RawStat,
  ScoringRun,
  Team,
  UserPrediction
} from "@/domain/models";
import { newId } from "@/server/db/collection";
import { prisma } from "@/server/db/prisma";

// Prisma returns Json fields as unknown; cast helpers avoid repeated `as` casts at call sites.
function j<T>(v: unknown): T {
  return v as T;
}

export function platformRepository() {
  return {
    competitions: {
      async list(): Promise<Competition[]> {
        const rows = await prisma.competition.findMany({ orderBy: { createdAt: "desc" } });
        return rows.map((r) => ({ ...r, settings: j(r.settings) }) as unknown as Competition);
      },
      async findBySlug(slug: string): Promise<Competition | null> {
        const r = await prisma.competition.findUnique({ where: { slug } });
        return r ? ({ ...r, settings: j(r.settings) } as unknown as Competition) : null;
      },
      async findById(id: string): Promise<Competition | null> {
        const r = await prisma.competition.findUnique({ where: { id } });
        return r ? ({ ...r, settings: j(r.settings) } as unknown as Competition) : null;
      },
      async upsert(input: Partial<Competition> & Pick<Competition, "name" | "slug">) {
        const now = new Date();
        const existing = await prisma.competition.findUnique({ where: { slug: input.slug } });
        const id = existing?.id ?? newId();
        const data = {
          name: input.name,
          slug: input.slug,
          sportType: input.sportType ?? "soccer",
          status: input.status ?? "active",
          registrationOpen: input.registrationOpen ?? true,
          lockMode: input.lockMode ?? "competition",
          lockDeadline: input.lockDeadline ?? null,
          settings: (input.settings ?? {}) as object
        };
        const r = await prisma.competition.upsert({
          where: { slug: input.slug },
          update: { ...data, updatedAt: now },
          create: { id, ...data, createdAt: now, updatedAt: now }
        });
        return { ...r, settings: j(r.settings) } as unknown as Competition;
      }
    },

    teams: {
      async list(competitionId: string): Promise<Team[]> {
        return prisma.team.findMany({ where: { competitionId }, orderBy: { name: "asc" } }) as Promise<Team[]>;
      },
      async upsertMany(items: Array<Omit<Team, "id"> & { id?: string }>) {
        const results = await Promise.all(
          items.map((item) => {
            const id = item.id ?? newId();
            return prisma.team.upsert({
              where: { competitionId_shortName: { competitionId: item.competitionId, shortName: item.shortName } },
              update: { name: item.name, countryCode: item.countryCode, logoUrl: item.logoUrl },
              create: { id, competitionId: item.competitionId, name: item.name, shortName: item.shortName, countryCode: item.countryCode, logoUrl: item.logoUrl }
            });
          })
        );
        return results as Team[];
      }
    },

    players: {
      async list(competitionId: string): Promise<Player[]> {
        return prisma.player.findMany({
          where: { competitionId },
          orderBy: [{ position: "asc" }, { price: "desc" }, { name: "asc" }]
        }) as Promise<Player[]>;
      },
      async findMany(ids: string[]): Promise<Player[]> {
        return prisma.player.findMany({ where: { id: { in: ids } } }) as Promise<Player[]>;
      },
      async upsertMany(items: Array<Omit<Player, "id"> & { id?: string }>) {
        const results = await Promise.all(
          items.map((item) => {
            const id = item.id ?? newId();
            return prisma.player.upsert({
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              where: { competitionId_name: { competitionId: item.competitionId, name: item.name } } as any,
              update: { teamId: item.teamId, teamName: item.teamName, teamShortName: item.teamShortName },
              create: { id, competitionId: item.competitionId, teamId: item.teamId, name: item.name, teamName: item.teamName, teamShortName: item.teamShortName, position: item.position, price: item.price, status: item.status }
            });
          })
        );
        return results as Player[];
      },
      async update(id: string, patch: Partial<Pick<Player, "price" | "position" | "status">>) {
        return prisma.player.update({ where: { id }, data: patch }) as Promise<Player>;
      }
    },

    fixtures: {
      async list(competitionId: string): Promise<Fixture[]> {
        const rows = await prisma.fixture.findMany({
          where: { competitionId },
          orderBy: { startTime: "asc" },
          include: { team1: { select: { shortName: true } }, team2: { select: { shortName: true } } }
        });
        return rows.map((r) => ({
          ...r,
          team1ShortName: r.team1?.shortName ?? undefined,
          team2ShortName: r.team2?.shortName ?? undefined,
          score: j(r.score),
          result: j(r.result)
        }) as unknown as Fixture);
      },
      async findById(id: string): Promise<Fixture | null> {
        const r = await prisma.fixture.findUnique({
          where: { id },
          include: { team1: { select: { shortName: true } }, team2: { select: { shortName: true } } }
        });
        return r ? ({
          ...r,
          team1ShortName: r.team1?.shortName ?? undefined,
          team2ShortName: r.team2?.shortName ?? undefined,
          score: j(r.score),
          result: j(r.result)
        } as unknown as Fixture) : null;
      },
      async upsertMany(items: Array<Omit<Fixture, "id"> & { id?: string }>) {
        const docs = items.map((item) => ({ ...item, id: item.id ?? newId() }));
        await Promise.all(
          docs.map((f) =>
            prisma.fixture.upsert({
              where: { id: f.id },
              update: { team1Name: f.team1Name, team2Name: f.team2Name, status: f.status, startTime: f.startTime, venue: f.venue, score: f.score as object, result: f.result as object },
              create: { id: f.id, competitionId: f.competitionId, team1Id: f.team1Id, team2Id: f.team2Id, team1Name: f.team1Name, team2Name: f.team2Name, status: f.status, startTime: f.startTime, venue: f.venue }
            })
          )
        );
        return docs as Fixture[];
      },
      async update(id: string, patch: Partial<Fixture>) {
        const r = await prisma.fixture.update({
          where: { id },
          data: {
            ...(patch.status !== undefined && { status: patch.status }),
            ...(patch.score !== undefined && { score: patch.score as object }),
            ...(patch.result !== undefined && { result: patch.result as object }),
            ...(patch.startTime !== undefined && { startTime: patch.startTime }),
            ...(patch.venue !== undefined && { venue: patch.venue })
          }
        });
        return { ...r, score: j(r.score), result: j(r.result) } as unknown as Fixture;
      }
    },

    entries: {
      async findByUser(competitionId: string, userId: string): Promise<FantasyEntry | null> {
        return prisma.fantasyEntry.findUnique({ where: { competitionId_userId: { competitionId, userId } } }) as Promise<FantasyEntry | null>;
      },
      async list(competitionId: string): Promise<FantasyEntry[]> {
        return prisma.fantasyEntry.findMany({ where: { competitionId } }) as Promise<FantasyEntry[]>;
      },
      async save(input: Omit<FantasyEntry, "id" | "createdAt" | "updatedAt">) {
        const now = new Date();
        const existing = await prisma.fantasyEntry.findUnique({
          where: { competitionId_userId: { competitionId: input.competitionId, userId: input.userId } }
        });
        const id = existing?.id ?? newId();
        return prisma.fantasyEntry.upsert({
          where: { competitionId_userId: { competitionId: input.competitionId, userId: input.userId } },
          update: { ...input, updatedAt: now },
          create: { id, ...input, createdAt: now, updatedAt: now }
        }) as Promise<FantasyEntry>;
      },
      async resetTransferUsage(competitionId: string) {
        const { count } = await prisma.fantasyEntry.updateMany({
          where: { competitionId },
          data: { transferUsage: 0 }
        });
        return count;
      }
    },

    rawStats: {
      async listByFixture(fixtureId: string): Promise<RawStat[]> {
        const rows = await prisma.rawStat.findMany({ where: { fixtureId } });
        return rows.map((r) => ({ ...r, stats: j(r.stats) }) as unknown as RawStat);
      },
      async deleteByFixture(fixtureId: string) {
        await prisma.rawStat.deleteMany({ where: { fixtureId } });
      },
      async upsertMany(items: Array<Omit<RawStat, "id" | "importedAt">>) {
        const now = new Date();
        await Promise.all(
          items.map((item) =>
            prisma.rawStat.upsert({
              where: { competitionId_fixtureId_playerId_source: { competitionId: item.competitionId, fixtureId: item.fixtureId, playerId: item.playerId, source: item.source } },
              update: { stats: item.stats as object, importedAt: now },
              create: { id: newId(), ...item, stats: item.stats as object, importedAt: now }
            })
          )
        );
        return items.map((item) => ({ id: newId(), importedAt: now, ...item })) as RawStat[];
      }
    },

    points: {
      async listPlayerPoints(competitionId: string, fixtureId?: string): Promise<PlayerPoints[]> {
        const rows = await prisma.playerPoints.findMany({
          where: { competitionId, ...(fixtureId && { fixtureId }) }
        });
        return rows.map((r) => ({ ...r, breakdown: j(r.breakdown) }) as unknown as PlayerPoints);
      },
      async listEntryPoints(competitionId: string, fixtureId?: string): Promise<EntryPoints[]> {
        const rows = await prisma.entryPoints.findMany({
          where: { competitionId, ...(fixtureId && { fixtureId }) }
        });
        return rows.map((r) => ({ ...r, breakdown: j(r.breakdown) }) as unknown as EntryPoints);
      },
      async replaceFixturePoints(input: {
        competitionId: string;
        fixtureId: string;
        run: ScoringRun;
        playerPoints: PlayerPoints[];
        entryPoints: EntryPoints[];
      }) {
        await prisma.$transaction(async (tx) => {
          await tx.scoringRun.create({ data: { ...input.run, summary: input.run.summary as object } });
          await tx.playerPoints.deleteMany({ where: { competitionId: input.competitionId, fixtureId: input.fixtureId } });
          await tx.entryPoints.deleteMany({ where: { competitionId: input.competitionId, fixtureId: input.fixtureId } });
          if (input.playerPoints.length) {
            await tx.playerPoints.createMany({
              data: input.playerPoints.map((pp) => ({ ...pp, breakdown: pp.breakdown as object[] }))
            });
          }
          if (input.entryPoints.length) {
            await tx.entryPoints.createMany({
              data: input.entryPoints.map((ep) => ({ ...ep, breakdown: ep.breakdown as object[] }))
            });
          }
        });
      }
    },

    predictions: {
      async listActive(competitionId: string): Promise<PredictionSet[]> {
        const now = new Date();
        const rows = await prisma.predictionSet.findMany({
          where: { competitionId, status: "open", closesAt: { gt: now } },
          orderBy: { closesAt: "asc" }
        });
        return rows.map((r) => ({ ...r, questions: j(r.questions) }) as unknown as PredictionSet);
      },
      async listSets(competitionId: string): Promise<PredictionSet[]> {
        const rows = await prisma.predictionSet.findMany({ where: { competitionId }, orderBy: { closesAt: "asc" } });
        return rows.map((r) => ({ ...r, questions: j(r.questions) }) as unknown as PredictionSet);
      },
      async upsertSet(set: PredictionSet): Promise<PredictionSet> {
        const r = await prisma.predictionSet.upsert({
          where: { id: set.id },
          update: { status: set.status, closesAt: set.closesAt, questions: set.questions as object[], label: set.label ?? undefined },
          create: { id: set.id, competitionId: set.competitionId, fixtureId: set.fixtureId ?? undefined, label: set.label ?? undefined, type: set.type, status: set.status, closesAt: set.closesAt, questions: set.questions as object[] }
        });
        return { ...r, questions: j(r.questions) } as unknown as PredictionSet;
      },
      async findSet(id: string): Promise<PredictionSet | null> {
        const r = await prisma.predictionSet.findUnique({ where: { id } });
        return r ? ({ ...r, questions: j(r.questions) } as unknown as PredictionSet) : null;
      },
      async submit(prediction: Omit<UserPrediction, "id" | "submittedAt">): Promise<UserPrediction> {
        const item = { id: newId(), ...prediction, submittedAt: new Date() };
        await prisma.userPrediction.upsert({
          where: { competitionId_predictionSetId_questionId_userId: { competitionId: item.competitionId, predictionSetId: item.predictionSetId, questionId: item.questionId, userId: item.userId } },
          update: { value: item.value, submittedAt: item.submittedAt },
          create: item
        });
        return item;
      },
      async listUserPredictions(competitionId: string): Promise<UserPrediction[]> {
        return prisma.userPrediction.findMany({ where: { competitionId } }) as Promise<UserPrediction[]>;
      },
      async replaceResults(competitionId: string, predictionSetId: string, results: PredictionResult[]) {
        await prisma.$transaction(async (tx) => {
          await tx.predictionResult.deleteMany({ where: { competitionId, predictionSetId } });
          if (results.length) await tx.predictionResult.createMany({ data: results });
        });
      },
      async listResults(competitionId: string): Promise<PredictionResult[]> {
        return prisma.predictionResult.findMany({ where: { competitionId } }) as Promise<PredictionResult[]>;
      }
    },

    announcements: {
      async listActive(competitionId?: string): Promise<Announcement[]> {
        const now = new Date();
        return prisma.announcement.findMany({
          where: {
            AND: [
              competitionId
                ? { OR: [{ competitionId: null }, { competitionId }] }
                : {},
              { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }
            ]
          },
          orderBy: [{ priority: "desc" }, { createdAt: "desc" }]
        }) as Promise<Announcement[]>;
      },
      async create(input: Omit<Announcement, "id" | "createdAt">): Promise<Announcement> {
        return prisma.announcement.create({
          data: { id: newId(), createdAt: new Date(), ...input }
        }) as Promise<Announcement>;
      },
      async findById(id: string): Promise<Announcement | null> {
        return prisma.announcement.findUnique({ where: { id } }) as Promise<Announcement | null>;
      },
      async delete(id: string): Promise<void> {
        await prisma.announcement.delete({ where: { id } });
      }
    },

    audit: {
      async create(input: Omit<AuditLog, "id" | "createdAt">): Promise<AuditLog> {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (prisma.auditLog.create({
          data: { id: newId(), createdAt: new Date(), ...input, before: input.before as object, after: input.after as object } as any
        })) as Promise<AuditLog>;
      },
      async list(competitionId?: string): Promise<AuditLog[]> {
        return prisma.auditLog.findMany({
          where: competitionId ? { competitionId } : {},
          orderBy: { createdAt: "desc" },
          take: 100
        }) as Promise<AuditLog[]>;
      }
    }
  };
}
