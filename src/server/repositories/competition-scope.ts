export type CompetitionScope = {
  competitionId: string;
};

export function requireCompetitionScope(scope: CompetitionScope): string {
  if (!scope.competitionId) {
    throw new Error("competitionId is required for competition-scoped data");
  }

  return scope.competitionId;
}
