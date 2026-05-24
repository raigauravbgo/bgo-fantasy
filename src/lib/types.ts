export type User = {
  id: string;
  name: string;
  email: string;
  role: "player" | "admin" | "super_admin";
};

export type Competition = {
  id: string;
  name: string;
  slug: string;
  status: string;
  registrationOpen: boolean;
  lockDeadline: string | null;
  settings?: {
    budget?: number;
    maxPlayersPerTeam?: number;
    transferWindow?: {
      active: boolean;
      maxTransfers: number;
      closesAt?: string;
    } | null;
    predictionPointsMode?: "overall" | "separate";
  };
};

export type Player = {
  id: string;
  name: string;
  teamId: string;
  teamName?: string;
  teamShortName?: string;
  position: "GK" | "DEF" | "MID" | "FWD";
  price: number;
  status: "available" | "doubtful" | "injured" | "suspended" | "unavailable";
  totalPoints?: number;
};

export type Fixture = {
  id: string;
  team1Id: string;
  team2Id: string;
  team1Name?: string;
  team2Name?: string;
  status: "upcoming" | "live" | "completed" | "postponed" | "cancelled";
  startTime: string;
  venue?: string;
  score?: { team1?: number; team2?: number };
  result?: { winnerTeamId?: string };
};

export type FantasyEntry = {
  id: string;
  name: string;
  playerIds: string[];
  captainId: string | null;
  viceCaptainId: string | null;
  budgetUsed: number;
  locked: boolean;
  lockedAt: string | null;
  transferUsage: number;
};

export type LeaderboardRow = {
  rank: number;
  entryId: string;
  userId: string;
  name: string;
  mascotUrl?: string;
  totalPoints: number;
  budgetUsed: number;
};

export type PredictionSet = {
  id: string;
  fixtureId: string;
  status: string;
  closesAt: string;
  questions: Array<{
    id: string;
    prompt: string;
    options: Array<{ label: string; value: string }>;
    points: number;
  }>;
};

export type Announcement = {
  id: string;
  title?: string;
  message: string;
  icon?: string;
  priority: "normal" | "high";
  expiresAt?: string;
  createdAt: string;
};

export type PointBreakdown = {
  category: string;
  label: string;
  quantity: number;
  pointsPerUnit: number;
  total: number;
};

export type PlayerPointDetail = {
  id: string;
  playerId: string;
  points: number;
  breakdown: PointBreakdown[];
  player: {
    id: string;
    name: string;
    position: string;
    teamShortName?: string;
  };
};

export type FixtureDetail = {
  fixture: Fixture;
  playerPoints: PlayerPointDetail[];
};

export type DashboardData = {
  competition: Competition;
  entry: FantasyEntry | null;
  rank?: number;
  totalPoints?: number;
  upcomingFixtures: Fixture[];
  recentFixtures: Fixture[];
  announcements: Announcement[];
};
