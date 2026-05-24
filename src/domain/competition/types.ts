export type CompetitionStatus = "draft" | "active" | "completed" | "archived";
export type SportType = "soccer";

export type Competition = {
  id: string;
  name: string;
  slug: string;
  sportType: SportType;
  status: CompetitionStatus;
  registrationOpen: boolean;
  lockMode: "competition" | "matchday" | "fixture";
  lockDeadline: Date | null;
  settings: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
};
