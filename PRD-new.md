# BGO Games Fantasy Platform - PRD

Working title: BGO Games

First launch product: BGO World Cup Soccer Fantasy

Build strategy: fresh app, soccer-first, multi-game platform-ready.

Reference material: the existing BGO IPL Fantasy app and `bgo-ipl-fantasy-features.md` are feature references only. The new build must not connect to, reuse, migrate, or mutate the existing IPL fantasy database.

---

## 1. Executive Summary

BGO Games is a new internal fantasy and prediction platform for BGO employees and clients. The first product will be a World Cup soccer fantasy league. The long-term product will support multiple competitions and game types from one shared platform.

The existing IPL fantasy league proved the engagement model: squad building, budget strategy, leaderboards, admin-scored matches, predictions, transfer windows, announcements, and mascot identity all work well. The new product should preserve those winning features, but it should not inherit the cricket-specific architecture or the live IPL database risk.

The correct approach is to build a fresh app with a competition-first and sport-adapter-first architecture. Soccer is the first adapter. Cricket, F1, basketball, office prediction games, and other formats can be added later without cloning the app.

---

## 2. Non-Negotiable Safety Requirements

The new app must be fully isolated from the existing IPL fantasy league.

### Database Isolation

- The app must use a new database name, for example `bgo_games_dev`, `bgo_games_staging`, and `bgo_games_prod`.
- The app must require `MONGODB_DB_NAME`.
- The app must fail startup if `MONGODB_DB_NAME` is missing.
- The app must fail startup if `MONGODB_DB_NAME` equals `bgo_fantasy`.
- The MongoDB user for the new app should only have permissions on the new app database.
- No seed, import, diagnostic, or admin script may default to the old IPL database.
- The app must not copy old IPL `.env.local` values.

### Runtime Isolation

- Use a new session cookie name, for example `bgo_games_session`.
- Use a new `JWT_SECRET`.
- Use separate app deployments from the IPL app.
- Use separate data-provider keys where possible.
- Health checks may show the connected database name, but must never expose secrets.

### Repository Isolation

- Treat the IPL repo as read-only reference.
- Do not carry forward IPL one-off scripts such as match patching scripts.
- Do not commit employee CSV files or other PII unless formally approved.
- Add `.env.example` with placeholders only.
- Ignore `.env`, `.env.local`, `.env.*.local`, and all secret files.

---

## 3. Product Goals

### Primary Goals

- Launch a working World Cup soccer fantasy league.
- Build a reusable platform for future competitions and sports.
- Preserve the best IPL fantasy concepts without inheriting cricket-specific constraints.
- Give admins enough tooling to run the competition without engineering intervention.
- Keep the MVP operationally simple: admin-triggered ingestion, preview, publish, recalculate.

### Success Metrics

- 70% or more of registered users create a valid squad.
- 50% or more of users return after the first published scoring update.
- 60% or more of active users submit at least one prediction.
- Admin can publish match scoring in under 10 minutes after stats are available.
- Zero accidental reads or writes to the legacy IPL fantasy database.
- Zero critical scoring defects that cannot be fixed by recalculation.

---

## 4. Product Philosophy

This is not a real-money betting platform and does not need to compete with public fantasy products. It is an internal engagement product.

The product should optimize for:

- Friendly workplace competition.
- Low-friction onboarding.
- Strategy without overwhelming complexity.
- Transparent scoring.
- Social moments and rank swings.
- Admin control and easy correction.
- Reusable platform foundations.

Soccer has fewer scoring events than cricket, so the app should make defensive actions, clean sheets, captain choices, predictions, and live rank movement feel meaningful.

---

## 5. Scope

### Phase 1: World Cup Soccer Fantasy MVP

Users register, join the active soccer competition, create an 11-player fantasy squad within a budget, select captain and vice-captain, lock their squad, submit predictions, earn points from real match stats, and compete on leaderboards.

### Phase 2: Platformization

Admins can create multiple competitions using configurable sport adapters, roster rules, scoring rules, prediction sets, lock windows, transfer windows, and leaderboard rules.

### Phase 3: Multi-Game Expansion

Add additional adapters for cricket, F1, basketball, office prediction games, and other formats while keeping authentication, users, admin, announcements, predictions, scoring runs, and leaderboards shared.

---

## 6. Users and Roles

### Player

- Registers or logs in.
- Joins an active competition.
- Creates and manages a fantasy squad.
- Locks squad before deadline.
- Makes predictions.
- Views dashboard, fixtures, scoring breakdowns, rank, and announcements.

### Admin

- Creates and configures competitions.
- Manages teams, players, fixtures, scoring rules, lock windows, transfer windows, predictions, and announcements.
- Imports or manually enters stats.
- Previews points before publishing.
- Publishes match scoring.
- Recalculates scores.
- Exports users, squads, and leaderboards.

### Super Admin

- Manages global platform settings.
- Creates admins.
- Archives competitions.
- Manages provider configuration where applicable.

---

## 7. Core Platform Concepts

### Competition

A single tournament or league, for example:

- BGO World Cup Soccer Fantasy
- BGO IPL Fantasy 2027
- BGO F1 Predictions
- BGO Office Cup

Every user entry, team, player, fixture, prediction, stat, and point record must be scoped to a competition.

### Sport Adapter

A sport adapter defines the sport-specific rules:

- Positions.
- Squad constraints.
- Stat schema.
- Scoring rules.
- Fixture result logic.
- Prediction question templates.
- Provider mapping.
- UI labels.

### Fantasy Entry

A user's fantasy team, bracket, prediction card, or other playable entry inside a competition.

### Fixture

A real-world match, game, race, or event.

### Scoring Run

A reproducible calculation that transforms raw stats into player points, fantasy entry points, prediction points, and leaderboard standings.

---

## 8. World Cup Soccer MVP Requirements

### 8.1 Authentication and Registration

Features:

- Email, employee ID, invite code, or admin-created registration. Final method is configurable.
- Password login with bcrypt hashing.
- JWT session in an HTTP-only cookie.
- Admin role gating.
- Registration open/closed toggle.

Acceptance criteria:

- Users cannot register when registration is closed.
- Users cannot access protected pages without a valid session.
- Admin pages require admin role server-side.
- Session cookie does not collide with the old IPL app.

### 8.2 Dashboard

Features:

- Active competition overview.
- Squad status.
- Lock deadline.
- Total points.
- Current rank.
- Upcoming fixtures.
- Recent scoring updates.
- Active predictions.
- Announcements.

Acceptance criteria:

- Dashboard clearly shows the active competition.
- Dashboard never uses cricket/IPL labels in soccer mode.
- If user has no squad, primary action is squad creation.

### 8.3 Soccer Player Marketplace

Features:

- Full player roster.
- Player name, country/team, position, price, status.
- Search by player name.
- Filter by position.
- Filter by country/team.
- Sort by price, total points, popularity, and availability.

Soccer positions:

- GK: Goalkeeper
- DEF: Defender
- MID: Midfielder
- FWD: Forward

Player statuses:

- Available
- Doubtful
- Injured
- Suspended
- Unavailable

Acceptance criteria:

- Users can browse the full roster.
- Unavailable players cannot be selected unless admin explicitly allows it.
- The UI shows position counts, country/team counts, and budget impact while selecting.

### 8.4 Squad Builder

Recommended MVP rules:

- Squad size: 11.
- Budget: 100 credits.
- GK: exactly 1.
- DEF: 3 to 5.
- MID: 3 to 5.
- FWD: 1 to 3.
- Max players from one country/team: configurable, default 3.
- Captain earns 2x points.
- Vice-captain earns 1.5x points.

Optional later:

- 15-player squad.
- Bench.
- Formation presets.
- Auto-substitution.
- Matchday-specific lineups.

Acceptance criteria:

- Invalid squads cannot be saved or locked.
- Users see validation feedback in real time.
- Captain and vice-captain must be in the squad.
- Captain and vice-captain cannot be the same player.
- Locked squads cannot be edited unless a transfer window is active.

### 8.5 Locking and Transfers

Features:

- Competition-wide lock deadline for MVP.
- Future support for matchday or fixture-level locks.
- Admin can open a transfer window after lock.
- Transfer window has configurable max transfers.
- Admin can reset transfer usage for a new window.

Acceptance criteria:

- Server enforces lock state.
- Server enforces transfer limits.
- UI shows draft, locked, transfer active, and transfer exhausted states.

### 8.6 Fixtures and Match Center

Features:

- Fixture list with upcoming, live, completed, postponed, and cancelled states.
- Fixture detail page with teams, venue, start time, score, result, fantasy points, and scoring reference.
- Completed fixtures appear prominently after scoring.

Acceptance criteria:

- Fixtures are scoped to one competition.
- Match detail page supports soccer stats.
- No cricket scorecard assumptions appear in soccer mode.

### 8.7 Soccer Scoring Engine

The scoring engine must be configurable and re-runnable.

Recommended MVP scoring:

Appearance:

- Started match: +2.
- Substitute appearance: +1.
- Played 60+ minutes: +2.

Goals:

- Goal by GK or DEF: +6.
- Goal by MID: +5.
- Goal by FWD: +4.

Assists:

- Assist: +3.

Defense:

- Clean sheet by GK or DEF: +4.
- Clean sheet by MID: +1.
- Goal conceded by GK or DEF: -1 per 2 goals conceded.

Goalkeeping:

- 3 saves: +1.
- Penalty save: +5.

Discipline:

- Yellow card: -1.
- Red card: -3.

Penalties and own goals:

- Penalty miss: -2.
- Own goal: -2.

Bonus:

- Player of the match: configurable.

Acceptance criteria:

- Raw stats and computed points are stored separately.
- Admin can preview points before publishing.
- Recalculating a fixture replaces prior computed points for that fixture instead of double-awarding.
- Captain and vice-captain multipliers are applied at fantasy-entry scoring time.
- Every published score has a visible breakdown.

### 8.8 Data Ingestion

MVP should not depend on fully automated live ingestion.

Supported MVP ingestion:

- CSV import for rosters.
- CSV import for fixtures.
- CSV import for match stats.
- Manual stat editing in admin.
- Provider adapter can be added after provider selection.

Provider abstraction should eventually support:

- Fetch fixtures.
- Fetch teams.
- Fetch players.
- Fetch lineups.
- Fetch player stats.
- Fetch match events.

Acceptance criteria:

- Provider-specific IDs are stored separately from internal IDs.
- Unmapped players are shown before publish.
- Admin can fix mappings.
- Admin can re-run scoring after corrections.
- The competition can operate with manual/CSV stats if provider integration is delayed.

### 8.9 Predictions

Prediction system should be sport-neutral.

MVP prediction:

- Match winner question per fixture.
- Prediction closes before fixture start.
- Results scored after fixture publish.

Additional soccer prediction templates:

- Draw/no draw.
- Correct score.
- First goal scorer.
- Anytime goal scorer.
- Total goals.
- Total yellow cards.
- Clean sheet.
- Player of the match.

Acceptance criteria:

- Users cannot submit after close.
- Users cannot edit after close.
- Admin can rescore prediction sets.
- Predictions can contribute to overall points or a separate prediction leaderboard, based on competition settings.

### 8.10 Leaderboards

Leaderboard types:

- Overall competition leaderboard.
- Matchday leaderboard.
- Player leaderboard.
- Prediction leaderboard.

Recommended tie-breakers:

- Higher total points.
- Lower budget used.
- Earlier squad lock time.

Acceptance criteria:

- Leaderboards are scoped by competition.
- Overall leaderboard updates after scoring publish.
- Player leaderboard shows soccer positions and country/team.
- Leaderboard rows show squad name, mascot/avatar, rank, and total points.

### 8.11 Mascots and Team Identity

Features:

- User names their fantasy squad.
- User chooses a preset mascot/avatar or generates one.
- Generation attempts are limited per entry.
- Fallback avatar is always available.

Acceptance criteria:

- Mascot generation is optional.
- If external image generation fails, squad creation still works.
- External image-generation keys are not shared with the IPL app.

### 8.12 Announcements

Features:

- Admin can create multiple active announcements.
- Announcements can be global or competition-scoped.
- Announcements support message, optional title, icon/emoji, priority, and expiry.

Acceptance criteria:

- Users see active announcements on dashboard.
- Competition-scoped announcements do not leak into unrelated competitions.

### 8.13 Mobile Experience

Features:

- Mobile-first responsive layout.
- Touch-friendly squad builder.
- Compact marketplace filters.
- Sticky budget and validation summary while selecting players.
- Simple navigation between dashboard, marketplace, my squad, fixtures, predictions, and leaderboard.

Acceptance criteria:

- Squad creation is usable on mobile.
- Tables have mobile alternatives where needed.
- Text does not overflow buttons, cards, or tabs.

---

## 9. Admin Console Requirements

Admin sections:

- Overview.
- Competitions.
- Users.
- Teams/Countries.
- Players.
- Fixtures.
- Stats Import.
- Scoring Rules.
- Predictions.
- Squads/Entries.
- Leaderboards.
- Transfers.
- Announcements.
- Settings.
- Audit Log.

Admin capabilities:

- Create and edit competitions.
- Configure sport type.
- Configure registration.
- Import teams/countries.
- Import players.
- Import fixtures.
- Edit player price, position, team, and status.
- Configure squad rules.
- Configure scoring rules.
- Lock and unlock squads.
- Open and close transfer windows.
- Import or manually enter stats.
- Preview fixture scoring.
- Publish fixture scoring.
- Recalculate one fixture.
- Recalculate the full competition.
- Open prediction sets.
- Score or rescore predictions.
- Export leaderboards and squads.

Acceptance criteria:

- Admin write actions are role-gated server-side.
- Important admin mutations are audit logged.
- Publish flows show readable errors and unmapped-player warnings.
- Admin can fix bad stats and republish.

---

## 10. Unified Platform Requirements

The platform must be designed so that future sports do not require a clone.

### Shared Core

Shared across all competitions:

- Authentication.
- Users.
- Roles.
- Competitions.
- Admin shell.
- Fantasy entries.
- Predictions.
- Announcements.
- Audit logs.
- Leaderboards.
- Scoring runs.
- Provider adapter interface.

### Sport Adapter Contract

Each adapter defines:

- `sportType`.
- Display labels.
- Player positions.
- Squad constraints.
- Default scoring rules.
- Raw stat schema.
- Points calculation function.
- Fixture result resolver.
- Prediction question templates.
- Provider mapping functions.

Initial adapters:

- `soccer`.

Future adapters:

- `cricket`.
- `basketball`.
- `formula_1`.
- `american_football`.
- `custom_predictions`.

### Adapter Design Principle

The UI should ask the adapter for labels and constraints instead of hard-coding sport language. For example:

- Soccer says "position", "country", "fixture", "goals".
- Cricket says "role", "team", "match", "runs/wickets".
- F1 says "driver", "constructor", "race", "qualifying".

---

## 11. Data Model

MongoDB is acceptable for the MVP, but all documents must be competition-scoped.

### `users`

- `id`
- `name`
- `email`
- `employeeId`
- `passwordHash`
- `role`
- `createdAt`
- `updatedAt`

### `competitions`

- `id`
- `name`
- `slug`
- `sportType`
- `status`
- `registrationOpen`
- `lockMode`
- `lockDeadline`
- `settings`
- `createdAt`
- `updatedAt`

### `competition_members`

- `id`
- `competitionId`
- `userId`
- `role`
- `joinedAt`

### `teams`

- `id`
- `competitionId`
- `name`
- `shortName`
- `countryCode`
- `logoUrl`
- `metadata`

### `players`

- `id`
- `competitionId`
- `providerIds`
- `name`
- `teamId`
- `position`
- `price`
- `status`
- `metadata`

### `fixtures`

- `id`
- `competitionId`
- `providerIds`
- `team1Id`
- `team2Id`
- `status`
- `startTime`
- `venue`
- `score`
- `result`
- `metadata`

### `fantasy_entries`

- `id`
- `competitionId`
- `userId`
- `name`
- `mascotUrl`
- `playerIds`
- `captainId`
- `viceCaptainId`
- `budgetUsed`
- `locked`
- `lockedAt`
- `transferUsage`
- `createdAt`
- `updatedAt`

### `raw_stats`

- `id`
- `competitionId`
- `fixtureId`
- `playerId`
- `source`
- `stats`
- `importedAt`

### `player_points`

- `id`
- `competitionId`
- `fixtureId`
- `playerId`
- `points`
- `breakdown`
- `scoringRunId`

### `entry_points`

- `id`
- `competitionId`
- `fixtureId`
- `entryId`
- `points`
- `breakdown`
- `scoringRunId`

### `prediction_sets`

- `id`
- `competitionId`
- `fixtureId`
- `type`
- `status`
- `closesAt`
- `questions`

### `user_predictions`

- `id`
- `competitionId`
- `predictionSetId`
- `questionId`
- `userId`
- `value`
- `submittedAt`

### `prediction_results`

- `id`
- `competitionId`
- `predictionSetId`
- `questionId`
- `userId`
- `pointsAwarded`
- `rank`

### `scoring_rules`

- `id`
- `competitionId`
- `sportType`
- `version`
- `rules`
- `active`

### `audit_logs`

- `id`
- `actorUserId`
- `action`
- `entityType`
- `entityId`
- `competitionId`
- `before`
- `after`
- `createdAt`

---

## 12. API Requirements

All competition data APIs must be scoped by competition slug or ID.

Player APIs:

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/competitions`
- `GET /api/competitions/:slug/dashboard`
- `GET /api/competitions/:slug/players`
- `GET /api/competitions/:slug/fixtures`
- `GET /api/competitions/:slug/leaderboard`
- `GET /api/competitions/:slug/my-entry`
- `POST /api/competitions/:slug/my-entry`
- `POST /api/competitions/:slug/my-entry/lock`
- `GET /api/competitions/:slug/predictions/active`
- `POST /api/competitions/:slug/predictions/:id/submit`

Admin APIs:

- `POST /api/admin/competitions`
- `PUT /api/admin/competitions/:id`
- `POST /api/admin/competitions/:id/teams/import`
- `POST /api/admin/competitions/:id/players/import`
- `POST /api/admin/competitions/:id/fixtures/import`
- `POST /api/admin/fixtures/:id/stats/preview`
- `POST /api/admin/fixtures/:id/stats/publish`
- `POST /api/admin/fixtures/:id/recalculate`
- `POST /api/admin/competitions/:id/recalculate`
- `POST /api/admin/competitions/:id/transfer-window`
- `POST /api/admin/competitions/:id/announcements`

---

## 13. Non-Functional Requirements

### Performance

- Dashboard loads in under 2 seconds for expected internal usage.
- Leaderboard loads in under 2 seconds for expected internal usage.
- Squad save completes in under 1 second under normal load.

### Reliability

- Scoring is idempotent.
- Recalculation is safe.
- Admin can recover from bad stats by correcting and republishing.
- Provider failures do not block manual scoring.

### Security

- Passwords are bcrypt-hashed.
- JWT secret is required in production.
- Admin routes verify role server-side.
- All write operations validate competition scope.
- Legacy IPL database name is blocked.
- Secrets are never committed.
- Admin mutations are audit logged.

### Maintainability

- Sport-specific code lives in adapters.
- Shared core does not import soccer-specific constants directly.
- Data access helpers require competition scope for competition data.
- Seed/import scripts require explicit environment and DB name.

---

## 14. MVP Build Plan

### Milestone 0: Foundation and Isolation

- Create new app.
- Add environment validation.
- Add DB connection with required `MONGODB_DB_NAME`.
- Add blocklist for `bgo_fantasy`.
- Add auth/session with unique cookie name.
- Add protected routes and admin role gate.
- Add `.env.example`.

### Milestone 1: Competition Core

- Competition model.
- Competition-scoped data access.
- Admin competition setup.
- Dashboard shell.
- Global and competition-scoped settings.

### Milestone 2: Soccer Fantasy

- Soccer adapter.
- Teams/countries.
- Player roster.
- Marketplace.
- Squad builder.
- Squad validation.
- Squad lock.

### Milestone 3: Fixtures and Scoring

- Fixture model and screens.
- CSV/manual stat import.
- Soccer scoring adapter.
- Preview scoring.
- Publish scoring.
- Recalculate fixture and competition.

### Milestone 4: Leaderboards and Match Views

- Overall leaderboard.
- Matchday leaderboard.
- Player leaderboard.
- Fixture detail page.
- Scoring breakdowns.

### Milestone 5: Predictions and Engagement

- Match winner predictions.
- Daily question sets.
- Prediction scoring.
- Announcements.
- Mascots/avatars.

### Milestone 6: Hardening

- Audit logs.
- Admin exports.
- Mobile QA.
- Error states.
- Production deployment checklist.

---

## 15. Out of Scope for MVP

- Real-money contests.
- Betting or wagering.
- Payments.
- Native mobile apps.
- Fully automated live scoring.
- Websocket scoring.
- Complex bench auto-substitution.
- Private mini-leagues.
- Public social feed.
- AI commentary.
- Multi-language support.

---

## 16. Open Questions

- Which exact World Cup-style soccer tournament is the first launch target?
- Should registration use employee verification, invite code, email allowlist, or admin-created accounts?
- Is manual/CSV stat import acceptable for launch?
- Which soccer data provider should be selected after vendor review?
- Should squads lock for the whole tournament or per matchday?
- Should the MVP use 11-player squads only, or 15-player squads with bench?
- Should captain changes be allowed between matchdays?
- How many transfers should be allowed after lock?
- Should prediction points count toward the main leaderboard or a separate leaderboard?
- Who owns production admin operations during the tournament?

---

## 17. Launch Acceptance Checklist

- App cannot start with `MONGODB_DB_NAME=bgo_fantasy`.
- App uses a new session cookie name.
- No IPL production secrets are present.
- No IPL one-off scripts are present.
- Every competition-scoped collection includes `competitionId`.
- Soccer squad validation works server-side.
- Admin can import roster, fixtures, and stats.
- Admin can preview, publish, and recalculate scoring.
- Leaderboards update after publish.
- Predictions close and score correctly.
- Mobile squad creation is usable.
- All visible soccer MVP screens are free of cricket/IPL terminology.

---

## 18. Direct Recommendation

Start fresh. Use the IPL app as a reference for feature behavior and admin workflows, not as the codebase foundation.

The first engineering task should be environment and database isolation. The second should be the competition-scoped data model. Only after those two are in place should the team build soccer fantasy features.
