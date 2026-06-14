import type { SoccerRawStats } from "@/domain/adapters/soccer/stats-schema";
import type { CompetitionStatus, SportType } from "@/domain/competition/types";
import type { UserRole } from "@/server/auth/types";

export type AppId = string;

export type User = {
  id: AppId;
  name: string;
  email?: string | null;
  employeeId?: string;
  passwordHash: string;
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
};

export type Competition = {
  id: AppId;
  name: string;
  slug: string;
  sportType: SportType;
  status: CompetitionStatus;
  registrationOpen: boolean;
  lockMode: "competition" | "matchday" | "fixture";
  lockDeadline: Date | null;
  settings: {
    budget?: number;
    squadSize?: number;
    maxPlayersPerTeam?: number;
    leagueCode?: string;
    predictionPointsMode?: "overall" | "separate";
    transferWindow?: TransferWindow | null;
    allowUnavailablePlayers?: boolean;
  };
  createdAt: Date;
  updatedAt: Date;
};

export type Team = {
  id: AppId;
  competitionId: AppId;
  name: string;
  shortName: string;
  countryCode?: string;
  logoUrl?: string;
  metadata?: Record<string, unknown>;
};

export type PlayerStatus =
  | "available"
  | "doubtful"
  | "injured"
  | "suspended"
  | "unavailable";

export type Player = {
  id: AppId;
  competitionId: AppId;
  providerIds?: Record<string, string>;
  name: string;
  teamId: AppId;
  teamName?: string;
  teamShortName?: string;
  position: "GK" | "DEF" | "MID" | "FWD";
  price: number;
  status: PlayerStatus;
  metadata?: Record<string, unknown>;
};

export type FixtureStatus =
  | "upcoming"
  | "live"
  | "completed"
  | "postponed"
  | "cancelled";

export type Fixture = {
  id: AppId;
  competitionId: AppId;
  providerIds?: Record<string, string>;
  team1Id: AppId;
  team2Id: AppId;
  team1Name?: string;
  team2Name?: string;
  team1ShortName?: string;
  team2ShortName?: string;
  status: FixtureStatus;
  startTime: Date;
  venue?: string;
  score?: {
    team1?: number;
    team2?: number;
  };
  result?: {
    winnerTeamId?: AppId | "draw";
  };
  metadata?: Record<string, unknown>;
};

export type TransferWindow = {
  active: boolean;
  maxTransfers: number;
  openedAt?: Date;
  closesAt?: Date;
};

export type FantasyEntry = {
  id: AppId;
  competitionId: AppId;
  userId: AppId;
  name: string;
  mascotUrl?: string;
  playerIds: AppId[];
  captainId: AppId | null;
  viceCaptainId: AppId | null;
  budgetUsed: number;
  locked: boolean;
  lockedAt: Date | null;
  transferUsage: number;
  createdAt: Date;
  updatedAt: Date;
};

export type RawStat = {
  id: AppId;
  competitionId: AppId;
  fixtureId: AppId;
  playerId: AppId;
  source: "manual" | "csv" | "provider";
  stats: SoccerRawStats;
  importedAt: Date;
};

export type PointBreakdown = {
  category: string;
  label: string;
  quantity: number;
  pointsPerUnit: number;
  total: number;
};

export type ScoringRun = {
  id: AppId;
  competitionId: AppId;
  fixtureId?: AppId;
  status: "preview" | "published";
  createdBy: AppId;
  createdAt: Date;
  summary: Record<string, unknown>;
};

export type PlayerPoints = {
  id: AppId;
  competitionId: AppId;
  fixtureId: AppId;
  playerId: AppId;
  points: number;
  breakdown: PointBreakdown[];
  scoringRunId: AppId;
};

export type EntryPoints = {
  id: AppId;
  competitionId: AppId;
  fixtureId: AppId;
  entryId: AppId;
  userId: AppId;
  points: number;
  breakdown: Array<{
    playerId: AppId;
    basePoints: number;
    multiplier: number;
    finalPoints: number;
    captaincyRole?: "captain" | "vice_captain";
  }>;
  scoringRunId: AppId;
};

export type PredictionSet = {
  id: AppId;
  competitionId: AppId;
  fixtureId: AppId;
  type: "match_winner";
  status: "open" | "closed" | "scored";
  closesAt: Date;
  questions: Array<{
    id: AppId;
    prompt: string;
    type?: "match_winner" | "btts" | "over_under_2_5" | "exact_score" | "red_card";
    voteMode?: "fixed" | "dynamic";
    points: number;
    basePoints?: number;
    minPoints?: number;
    maxPoints?: number;
    options: Array<{ label: string; value: string }>;
  }>;
};

export type UserPrediction = {
  id: AppId;
  competitionId: AppId;
  predictionSetId: AppId;
  questionId: AppId;
  userId: AppId;
  value: string;
  submittedAt: Date;
};

export type PredictionResult = {
  id: AppId;
  competitionId: AppId;
  predictionSetId: AppId;
  questionId: AppId;
  userId: AppId;
  pointsAwarded: number;
};

export type Announcement = {
  id: AppId;
  competitionId?: AppId;
  title?: string;
  message: string;
  icon?: string;
  priority: "normal" | "high";
  expiresAt?: Date;
  createdAt: Date;
};

export type AuditLog = {
  id: AppId;
  actorUserId: AppId | null;
  action: string;
  entityType: string;
  entityId?: AppId;
  competitionId?: AppId;
  before?: unknown;
  after?: unknown;
  createdAt: Date;
};
