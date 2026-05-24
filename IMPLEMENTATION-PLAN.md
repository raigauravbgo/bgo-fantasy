# BGO Games Fantasy Platform - Implementation Plan

Source PRD: `PRD-new.md`

This plan assumes a greenfield build. The current repository contains only the PRD, so the first implementation step is to scaffold the application and enforce the non-negotiable isolation requirements before building product features.

---

## 1. PRD Review Summary

### What Is Clear And Strong

- The product should be a new application, not a fork or mutation of the existing IPL fantasy app.
- The first launch is soccer fantasy, but the architecture must support future competition types.
- Database and runtime isolation from the legacy IPL app are mandatory launch blockers.
- MVP operations should work with admin-controlled CSV/manual workflows instead of depending on live data feeds.
- Scoring must be reproducible, previewable, publishable, and safely recalculable.
- Competition scope is the central data boundary for almost every domain object.

### Highest-Risk Areas

- Scope creep between "World Cup soccer MVP" and full multi-sport platformization.
- Accidental hard-coding of soccer concepts into shared platform modules.
- Incomplete database isolation or scripts that can point to the legacy IPL database.
- Scoring idempotency defects, especially if recalculation is added late.
- Admin tooling complexity, especially imports, player mapping, preview, publish, and rollback/correction flows.
- Mobile squad builder usability.

### Decisions To Close Before Sprint 1

| Decision | Recommended MVP Default | Why |
| --- | --- | --- |
| First tournament | Configure by admin seed data, do not hard-code a named tournament | Keeps launch flexible. |
| Registration method | Invite code plus admin-created users | Low-friction and controlled for internal use. |
| Stat ingestion | CSV plus manual edit | Matches PRD and avoids provider dependency. |
| Squad lock | Competition-wide lock for MVP | Simplest server-enforced rule. |
| Squad size | 11 players, no bench | Matches recommended MVP. |
| Transfers | Admin-opened windows with configurable max transfers, default 3 | Useful after whole-tournament lock without matchday complexity. |
| Captain changes | Locked with squad unless transfer window is open | Avoids hidden state and scoring disputes. |
| Prediction scoring | Count toward overall by setting; also expose separate prediction leaderboard | Supports engagement and future configurability. |
| Mascot generation | Preset avatars first; generated mascot can be deferred | Prevents external service dependency from blocking launch. |

---

## 2. Recommended Technical Direction

The PRD does not mandate a stack. A practical greenfield stack for this product:

- **App:** Next.js with TypeScript.
- **Backend:** Next.js route handlers or server actions for API boundaries, with server-side role checks.
- **Database:** MongoDB.
- **Validation:** Zod schemas shared by API handlers, services, imports, and forms.
- **Auth:** Email/password, bcrypt password hashing, JWT in HTTP-only cookie named `bgo_games_session`.
- **Styling:** Tailwind CSS or an existing BGO design system if available.
- **Testing:** Vitest for unit/service tests, Playwright for critical browser flows.
- **CSV parsing:** A maintained CSV parser wrapped behind import services.
- **Deployment:** Separate deployment target, separate environment variables, separate MongoDB user scoped only to the new app database.

If the team already has a standard internal app stack, prefer that, but keep the architecture boundaries below.

---

## 3. Architecture Principles

### Core Boundaries

- `platform`: authentication, users, roles, competitions, admin shell, audit logs, settings.
- `competition`: competition-scoped repositories and services.
- `sports`: sport adapter contracts and concrete sport adapters such as soccer.
- `fantasy`: entries, squad validation, lock/transfer behavior.
- `scoring`: raw stats, player points, entry points, scoring runs, recalculation.
- `predictions`: prediction sets, submissions, results, prediction leaderboards.
- `engagement`: announcements, mascots/avatars.

### Adapter Rule

Shared code must not import soccer constants directly. Shared code asks the active sport adapter for:

- display labels
- valid positions
- squad rules
- stat schema
- default scoring rules
- scoring calculator
- fixture result resolver
- prediction templates

### Competition Scope Rule

Every read/write for competition data must include `competitionId` or be resolved through a competition slug before accessing data.

Competition-scoped collections:

- `competition_members`
- `teams`
- `players`
- `fixtures`
- `fantasy_entries`
- `raw_stats`
- `player_points`
- `entry_points`
- `prediction_sets`
- `user_predictions`
- `prediction_results`
- `scoring_rules`
- `announcements`
- `audit_logs` when tied to a competition

### Isolation Rule

The application must fail fast if:

- `MONGODB_DB_NAME` is missing.
- `MONGODB_DB_NAME` equals `bgo_fantasy`.
- `JWT_SECRET` is missing in production.
- required cookie/session config is missing.

All scripts must require explicit environment and database names.

---

## 4. Proposed Repository Structure

```text
src/
  app/
    (auth)/
    (player)/
    admin/
    api/
  components/
    admin/
    fantasy/
    fixtures/
    leaderboard/
    predictions/
    ui/
  config/
    env.ts
    constants.ts
  domain/
    adapters/
      sport-adapter.ts
      soccer/
        index.ts
        labels.ts
        rules.ts
        scoring.ts
        stats-schema.ts
    fantasy/
      squad-validation.ts
      transfer-rules.ts
    scoring/
      scoring-run.ts
      entry-points.ts
    predictions/
      templates.ts
  server/
    auth/
    db/
    repositories/
    services/
    importers/
    audit/
  schemas/
    api/
    csv/
    db/
  tests/
    unit/
    integration/
    e2e/
scripts/
  seed/
  import/
  diagnostics/
docs/
  operations/
```

---

## 5. Milestone Plan

### Milestone 0: Product Decisions And Project Setup

Goal: remove ambiguity and create a safe working foundation.

Deliverables:

- Confirm MVP defaults listed in section 1.
- Create project scaffold.
- Add linting, formatting, test runner, and CI checks.
- Add `.env.example` with placeholders only.
- Add `.gitignore` coverage for `.env`, `.env.local`, `.env.*.local`, secret files, exported CSVs, and generated reports.
- Add deployment environment checklist.

Key tasks:

- Choose final stack and package manager.
- Set up TypeScript strict mode.
- Add base app shell and health endpoint.
- Add initial docs:
  - `docs/operations/environment.md`
  - `docs/operations/imports.md`
  - `docs/operations/scoring-runbook.md`

Acceptance checkpoint:

- A developer can clone the repo, copy `.env.example`, set a new non-IPL database name, and start the app.
- The app refuses to start with missing database config or `MONGODB_DB_NAME=bgo_fantasy`.

---

### Milestone 1: Environment, Database, And Runtime Isolation

Goal: make legacy IPL data access impossible by default.

Deliverables:

- Centralized env loader.
- MongoDB connection module.
- Startup validation and blocked database name guard.
- New session cookie name: `bgo_games_session`.
- Health check that shows safe runtime metadata only.
- Script safety wrapper used by seed/import/diagnostic scripts.

Key tasks:

- Implement `env.ts` validation.
- Implement `connectToDatabase()` that accepts only validated db config.
- Add database indexes for core collections.
- Add a `requireSafeDatabase()` helper for scripts.
- Add tests for env validation and blocked DB names.

Acceptance checkpoint:

- App startup fails when `MONGODB_DB_NAME` is absent.
- App startup fails when `MONGODB_DB_NAME=bgo_fantasy`.
- No scripts default to a database name.
- Health check never exposes secrets.

---

### Milestone 2: Authentication, Users, And Roles

Goal: provide secure access control before building competition features.

Deliverables:

- User model and repository.
- Registration toggle support.
- Invite-code/admin-created registration path.
- Login/logout APIs.
- JWT session cookie with HTTP-only settings.
- Server-side route protection.
- Admin and super admin role checks.

Key tasks:

- Implement password hashing with bcrypt.
- Create `users` collection and indexes for email and employee ID.
- Add auth service with session creation and verification.
- Add middleware or server guard helpers for protected pages and APIs.
- Add admin role guard utilities.
- Add seed script for first super admin.

Acceptance checkpoint:

- Users cannot register when registration is closed.
- Protected player pages reject anonymous users.
- Admin APIs reject non-admin users server-side.
- Session cookie name does not collide with the old IPL app.

---

### Milestone 3: Competition Core And Admin Shell

Goal: establish competition-scoped data and admin operations.

Deliverables:

- Competition model and repository.
- Competition member model.
- Admin shell navigation.
- Admin competition create/edit screens.
- Active competition resolution.
- Global and competition-scoped settings.
- Audit log service.

Key tasks:

- Create `competitions`, `competition_members`, and `audit_logs` collections.
- Implement competition lookup by slug.
- Implement admin APIs:
  - `POST /api/admin/competitions`
  - `PUT /api/admin/competitions/:id`
- Add audit logging for admin competition mutations.
- Build initial dashboard shell for player and admin views.

Acceptance checkpoint:

- Admin can create a soccer competition.
- Competition-scoped services require a competition ID.
- Audit logs are written for admin mutations.
- Player dashboard clearly identifies the active competition.

---

### Milestone 4: Soccer Adapter And Reference Data

Goal: introduce soccer as the first sport without baking it into the platform core.

Deliverables:

- Sport adapter interface.
- Soccer adapter implementation.
- Soccer labels, positions, squad rules, stat schema, default scoring rules.
- Team/country admin management.
- Player roster admin management.
- CSV imports for teams and players.

Key tasks:

- Define `SportAdapter` contract.
- Implement `soccerAdapter`.
- Create `teams` and `players` collections.
- Add CSV schema validation for teams and players.
- Add provider ID mapping fields.
- Add admin screens for teams and players.
- Add player status management.

Acceptance checkpoint:

- Soccer positions are adapter-defined: `GK`, `DEF`, `MID`, `FWD`.
- Admin can import teams and players for a competition.
- Invalid import rows produce readable errors.
- Shared UI does not hard-code cricket/IPL terminology.

---

### Milestone 5: Player Marketplace And Squad Builder

Goal: let users create valid fantasy entries.

Deliverables:

- Player marketplace page.
- Search, filter, and sort.
- Fantasy entry model.
- Squad builder with budget and rule validation.
- Captain and vice-captain selection.
- Save draft and lock squad.
- Server-side squad validation.
- Mobile-friendly selection workflow.

Key tasks:

- Create `fantasy_entries` collection.
- Implement `GET /api/competitions/:slug/players`.
- Implement `GET /api/competitions/:slug/my-entry`.
- Implement `POST /api/competitions/:slug/my-entry`.
- Implement `POST /api/competitions/:slug/my-entry/lock`.
- Build squad validation service:
  - exactly 11 players
  - budget max 100
  - exactly 1 goalkeeper
  - 3 to 5 defenders
  - 3 to 5 midfielders
  - 1 to 3 forwards
  - max players per team, default 3
  - captain and vice-captain in squad
  - captain and vice-captain distinct
- Add lock deadline enforcement server-side.

Acceptance checkpoint:

- Invalid squads cannot be saved as locked.
- Locked squads cannot be edited outside an active transfer window.
- Unavailable players cannot be selected unless competition settings allow it.
- The mobile squad builder shows budget, selected count, and validation feedback without layout overflow.

---

### Milestone 6: Fixtures And Match Center

Goal: model real-world fixtures and expose them to users and admins.

Deliverables:

- Fixture model and repository.
- Admin fixture import.
- Fixture list page.
- Fixture detail page.
- Status support for upcoming, live, completed, postponed, and cancelled.
- Soccer-aware match display.

Key tasks:

- Create `fixtures` collection and indexes.
- Implement fixture CSV import.
- Implement `GET /api/competitions/:slug/fixtures`.
- Add admin fixture edit screen.
- Add player fixture list/detail pages.
- Add safe display for venue, start time, score, result, and scoring status.

Acceptance checkpoint:

- Fixtures are scoped to one competition.
- Fixture detail pages use soccer labels and stats.
- Completed fixtures surface published scoring references.

---

### Milestone 7: Raw Stats, Scoring Preview, Publish, And Recalculation

Goal: provide the core operational scoring workflow.

Deliverables:

- Raw stats model.
- Scoring rules model.
- Scoring run model.
- Player points and entry points models.
- CSV match stats import.
- Manual stat editing.
- Scoring preview.
- Publish scoring.
- Recalculate fixture.
- Recalculate competition.

Key tasks:

- Create collections:
  - `raw_stats`
  - `scoring_rules`
  - `scoring_runs`
  - `player_points`
  - `entry_points`
- Implement soccer stats schema:
  - started
  - substitute appearance
  - minutes played
  - goals
  - assists
  - clean sheet
  - goals conceded
  - saves
  - penalty saves
  - yellow cards
  - red cards
  - penalty misses
  - own goals
  - player of the match
- Implement soccer scoring calculator.
- Implement entry scoring with captain and vice-captain multipliers.
- Implement idempotent publish:
  - create new scoring run
  - replace prior points for fixture
  - write player points
  - write entry points
  - update leaderboard materialization if used
- Show unmapped player warnings before publish.
- Add audit logs for publish and recalculate actions.

Acceptance checkpoint:

- Raw stats and computed points are stored separately.
- Admin can preview points without mutating published scores.
- Recalculating a fixture replaces previous computed points for that fixture.
- Captain and vice-captain multipliers are visible in entry breakdowns.
- Every published score has a readable breakdown.

---

### Milestone 8: Leaderboards And Scoring Breakdowns

Goal: make competition results transparent and engaging.

Deliverables:

- Overall leaderboard.
- Matchday/fixture leaderboard.
- Player leaderboard.
- Prediction leaderboard placeholder or early integration.
- Rank and total points on dashboard.
- Entry scoring breakdown pages.

Key tasks:

- Implement leaderboard query services.
- Decide whether to materialize leaderboard snapshots or compute on read for MVP.
- Apply tie-breakers:
  - higher total points
  - lower budget used
  - earlier squad lock time
- Add `GET /api/competitions/:slug/leaderboard`.
- Add player leaderboard filtered by position/team.
- Add dashboard widgets for rank changes and recent scoring updates.

Acceptance checkpoint:

- Overall leaderboard updates after publish.
- Leaderboards are competition-scoped.
- Rows show squad name, mascot/avatar, rank, and total points.
- Player leaderboard shows soccer positions and country/team.

---

### Milestone 9: Predictions

Goal: add sport-neutral prediction engagement with match-winner MVP.

Deliverables:

- Prediction set model.
- User prediction model.
- Prediction result model.
- Admin prediction set creation.
- Active prediction player UI.
- Prediction close enforcement.
- Prediction scoring and rescore.
- Prediction leaderboard.

Key tasks:

- Create collections:
  - `prediction_sets`
  - `user_predictions`
  - `prediction_results`
- Implement match-winner prediction template for soccer fixtures.
- Implement `GET /api/competitions/:slug/predictions/active`.
- Implement `POST /api/competitions/:slug/predictions/:id/submit`.
- Add admin scoring/rescoring flow.
- Add competition setting for whether prediction points count toward overall leaderboard.

Acceptance checkpoint:

- Users cannot submit or edit predictions after close.
- Admin can rescore predictions.
- Prediction points appear in the selected leaderboard mode.
- Prediction APIs are competition-scoped.

---

### Milestone 10: Transfers, Announcements, And Team Identity

Goal: complete launch engagement and admin-control features.

Deliverables:

- Transfer window admin controls.
- Transfer usage tracking.
- Announcement model and admin management.
- Dashboard announcement display.
- Squad name and preset mascot/avatar selection.
- Optional generated mascot integration behind feature flag.

Key tasks:

- Implement transfer window settings on competition.
- Enforce max transfers server-side.
- Add transfer state UI:
  - draft
  - locked
  - transfer active
  - transfer exhausted
- Create `announcements` collection.
- Implement global and competition-scoped announcements.
- Add announcement priority and expiry behavior.
- Add preset mascot assets.
- Add mascot generation attempt limits if image generation is enabled.

Acceptance checkpoint:

- Locked squads can only change inside transfer windows.
- Server enforces transfer limits.
- Users see active announcements on dashboard.
- Competition-scoped announcements do not leak into other competitions.
- Squad creation works even if external mascot generation is unavailable.

---

### Milestone 11: Admin Exports, Operations, And Hardening

Goal: make the product tournament-ready.

Deliverables:

- Exports for users, squads, leaderboards, raw stats, and scoring breakdowns.
- Error states and empty states.
- Import run history.
- Audit log viewer.
- Admin runbooks.
- Mobile QA pass.
- Security and isolation QA pass.
- Production deployment checklist.

Key tasks:

- Add CSV export endpoints with admin-only access.
- Add import preview and import result records.
- Add user-friendly admin errors for bad imports and unmapped players.
- Add e2e tests for critical user/admin journeys.
- Add accessibility checks for forms, tables, and squad builder.
- Add deployment smoke tests.

Acceptance checkpoint:

- Admin can operate roster import, fixture import, stat import, preview, publish, correction, and republish without engineering intervention.
- All launch checklist items from the PRD pass.
- No visible soccer MVP screens contain cricket/IPL labels.
- Mobile squad creation is usable.

---

## 6. Suggested Sprint Breakdown

This is an indicative sequence, not a date commitment. It assumes a small team of 2 full-stack engineers with part-time design/QA support.

| Sprint | Focus | Target Outcome |
| --- | --- | --- |
| Sprint 0 | Decisions, scaffold, isolation | Safe app foundation starts locally and blocks legacy DB. |
| Sprint 1 | Auth, users, roles, competition core | Admin can create competition; users can register/login. |
| Sprint 2 | Soccer adapter, teams, players, imports | Admin can load tournament roster. |
| Sprint 3 | Marketplace and squad builder | Users can create and lock valid squads. |
| Sprint 4 | Fixtures, raw stats, scoring preview | Admin can import fixtures/stats and preview points. |
| Sprint 5 | Publish, recalculation, leaderboards | Published scoring updates rankings safely. |
| Sprint 6 | Predictions, announcements, transfers | Engagement features and post-lock operations work. |
| Sprint 7 | Exports, audit, mobile QA, launch hardening | Product is tournament-operable. |

If time compresses, defer generated mascots, full rule-editor UI, player popularity sorting, and matchday leaderboards. Do not defer isolation, server-side validation, scoring preview/publish/recalculate, or audit logging for admin scoring actions.

---

## 7. MVP Backlog By Priority

### P0 Launch Blockers

- Environment validation with legacy DB block.
- New session cookie and JWT secret.
- User registration/login/logout.
- Admin role gating.
- Competition-scoped data access.
- Soccer adapter.
- Team/player/fixture imports.
- Marketplace and squad builder.
- Server-side squad validation.
- Squad lock.
- Raw stat import/manual correction.
- Scoring preview, publish, and recalculate.
- Overall leaderboard.
- Admin audit logs for critical mutations.
- Mobile-usable squad creation.

### P1 Strong MVP

- Predictions.
- Announcements.
- Transfer windows.
- Admin exports.
- Player leaderboard.
- Fixture detail scoring breakdowns.
- Import preview and row-level error reporting.
- Preset mascot/avatar selection.

### P2 Post-MVP

- Generated mascots.
- Data provider integration.
- Matchday-specific locks.
- Bench and auto-substitution.
- Full scoring rule editor.
- Private mini-leagues.
- Websocket/live scoring.
- Multi-sport adapters beyond soccer.

---

## 8. Data Model Implementation Notes

### Required Indexes

- `users.email` unique where present.
- `users.employeeId` unique where present.
- `competitions.slug` unique.
- `competition_members`: unique compound index on `competitionId + userId`.
- `teams`: compound index on `competitionId + shortName`.
- `players`: indexes on `competitionId`, `competitionId + teamId`, `competitionId + position`.
- `fixtures`: indexes on `competitionId + startTime`, `competitionId + status`.
- `fantasy_entries`: unique compound index on `competitionId + userId`.
- `raw_stats`: unique compound index on `competitionId + fixtureId + playerId + source`.
- `player_points`: compound index on `competitionId + fixtureId + scoringRunId`.
- `entry_points`: compound index on `competitionId + fixtureId + entryId`.
- `prediction_sets`: indexes on `competitionId + fixtureId`, `competitionId + status + closesAt`.
- `user_predictions`: unique compound index on `competitionId + predictionSetId + questionId + userId`.
- `audit_logs`: index on `competitionId + createdAt`.

### Collection Guardrails

- Store external provider IDs in `providerIds`, never as primary IDs.
- Store raw stats exactly enough to reproduce scoring, plus source/import metadata.
- Store scoring breakdowns as structured data, not only display text.
- Store scoring rule version on scoring runs.
- Avoid deleting scoring history; replace active published points for a fixture while retaining scoring run metadata.

---

## 9. API Implementation Order

### Auth

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`

### Player

- `GET /api/competitions`
- `GET /api/competitions/:slug/dashboard`
- `GET /api/competitions/:slug/players`
- `GET /api/competitions/:slug/fixtures`
- `GET /api/competitions/:slug/my-entry`
- `POST /api/competitions/:slug/my-entry`
- `POST /api/competitions/:slug/my-entry/lock`
- `GET /api/competitions/:slug/leaderboard`
- `GET /api/competitions/:slug/predictions/active`
- `POST /api/competitions/:slug/predictions/:id/submit`

### Admin

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

Implementation rule:

- API handlers should be thin.
- Handlers validate input, resolve auth/competition, call services, and return typed responses.
- Business rules live in services and domain modules so they can be unit tested.

---

## 10. Frontend Page Plan

### Player Pages

- Login
- Register
- Competition dashboard
- Marketplace
- My squad
- Fixtures
- Fixture detail
- Predictions
- Leaderboard
- Account/profile

### Admin Pages

- Admin overview
- Competitions
- Users
- Teams/countries
- Players
- Fixtures
- Stats import
- Scoring preview/publish
- Scoring rules
- Predictions
- Squads/entries
- Leaderboards
- Transfers
- Announcements
- Settings
- Audit log

### Mobile UX Priorities

- Squad builder must keep budget and validation visible.
- Marketplace filters should collapse into compact controls.
- Tables need card/list alternatives on small screens.
- Main navigation should make dashboard, squad, fixtures, predictions, and leaderboard reachable in one tap.

---

## 11. Scoring Workflow Design

### Admin Workflow

1. Select competition.
2. Select fixture.
3. Import match stats CSV or edit stats manually.
4. Review unmapped players and validation errors.
5. Preview player points.
6. Preview entry points and multiplier effects.
7. Publish scoring.
8. Verify leaderboard update.
9. Correct stats and recalculate if needed.

### Idempotency Rules

- Preview never writes `player_points` or `entry_points`.
- Publish creates a new `scoringRun`.
- Publish replaces active computed points for the fixture.
- Entry scoring reads the locked entry snapshot or current locked squad state, based on the selected MVP rule.
- Recalculation uses raw stats plus scoring rule version unless admin explicitly chooses a new active rule version.

### Breakdown Requirements

Player breakdown example fields:

- category
- stat
- quantity
- pointsPerUnit
- total
- label

Entry breakdown example fields:

- playerId
- basePoints
- multiplier
- finalPoints
- captaincyRole
- playerBreakdownRef

---

## 12. Import Contracts

### Team CSV

Required columns:

- `name`
- `shortName`
- `countryCode`

Optional columns:

- `logoUrl`
- `providerId`

### Player CSV

Required columns:

- `name`
- `teamShortName`
- `position`
- `price`

Optional columns:

- `status`
- `providerId`
- `metadata`

### Fixture CSV

Required columns:

- `team1ShortName`
- `team2ShortName`
- `startTime`

Optional columns:

- `venue`
- `status`
- `providerId`

### Match Stats CSV

Required columns:

- `fixtureProviderId` or `fixtureId`
- `playerProviderId` or `playerId`
- soccer stat columns used by the active scoring rules

Import behavior:

- Validate headers before row processing.
- Validate each row and return row-level errors.
- Show unmapped players before allowing publish.
- Store import source and timestamp.
- Avoid partial publish; import may be partial, but scoring publish must be explicit.

---

## 13. Testing Strategy

### Unit Tests

- Env validation and blocked DB name.
- Sport adapter contract.
- Soccer squad validation.
- Soccer scoring rules.
- Captain and vice-captain multiplier logic.
- Prediction close enforcement.
- Tie-breaker logic.

### Integration Tests

- Auth registration/login/logout.
- Admin role gate.
- Competition-scoped repository helpers.
- CSV import validation.
- Scoring preview.
- Scoring publish idempotency.
- Fixture recalculation.
- Prediction scoring/rescoring.

### End-To-End Tests

- User registers, creates squad, locks squad.
- Admin imports roster and fixtures.
- Admin imports stats, previews, publishes.
- User sees leaderboard update.
- User submits prediction before close.
- User cannot submit prediction after close.
- Non-admin cannot access admin pages.

### Manual QA

- Mobile squad builder on common phone viewport widths.
- Long names in players, teams, squads, and buttons.
- Empty states before roster/fixtures/scoring exist.
- Error states for bad CSV files.
- Admin correction and republish runbook.

---

## 14. Security And Privacy Checklist

- No old IPL secrets copied into the new repo.
- `.env` and local secret files ignored.
- New MongoDB app user scoped only to the new database.
- Passwords are bcrypt-hashed.
- JWT secret required in production.
- HTTP-only cookie used for session.
- Admin role verified server-side on every admin route and API.
- All write operations validate competition scope.
- User exports are admin-only.
- PII is not committed.
- Health checks expose no secrets.
- Audit logs capture critical admin mutations.

---

## 15. Deployment And Operations Plan

### Environments

- `development`: `bgo_games_dev`
- `staging`: `bgo_games_staging`
- `production`: `bgo_games_prod`

### Deployment Readiness

- Separate deployment project from IPL app.
- Separate env vars and secrets.
- Separate MongoDB user.
- Separate session cookie name.
- Smoke test for health check, login, admin access, dashboard, and DB name.

### Tournament Operations Runbooks

- Roster import.
- Fixture import.
- Squad lock monitoring.
- Stat import and scoring publish.
- Correcting bad stats.
- Recalculating one fixture.
- Recalculating full competition.
- Exporting leaderboards.
- Emergency admin access recovery.

---

## 16. Risk Register

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Legacy DB accidentally used | Critical | Startup block, DB user permissions, script guardrails, tests. |
| Scoring recalculation double-awards points | Critical | Idempotent publish design and integration tests. |
| Soccer logic leaks into platform core | High | Sport adapter contract and import boundary checks. |
| Admin import UX slows operations | High | Row-level errors, preview, unmapped-player warnings, runbook. |
| Mobile squad builder is hard to use | High | Build mobile-first and test early. |
| Data provider not selected in time | Medium | CSV/manual import is MVP path. |
| Mascot generation fails | Low | Preset avatar fallback; feature flag generated mascots. |
| Full platformization delays MVP | High | Keep configurable foundations, defer full rule editors and non-soccer adapters. |

---

## 17. Definition Of Done

An implementation item is done when:

- It has server-side validation for all trust boundaries.
- It is competition-scoped where applicable.
- Admin-only behavior is role-gated server-side.
- Important mutations are audit logged.
- User-facing errors are understandable.
- Relevant unit/integration tests pass.
- Mobile layout has been checked when UI is affected.
- No cricket/IPL terminology appears in soccer MVP UI.
- It does not introduce access to the legacy IPL database.

---

## 18. Launch Acceptance Gates

The MVP should not launch until all gates pass:

- App cannot start with `MONGODB_DB_NAME=bgo_fantasy`.
- App requires a new database name.
- App uses `bgo_games_session` or another approved new cookie name.
- No IPL production secrets are present.
- No legacy IPL one-off scripts are present.
- Every competition-scoped collection includes `competitionId`.
- Soccer squad validation works server-side.
- Admin can import roster, fixtures, and stats.
- Admin can preview, publish, and recalculate scoring.
- Leaderboards update after publish.
- Predictions close and score correctly if predictions are included in launch.
- Mobile squad creation is usable.
- All soccer MVP screens are free of cricket/IPL terminology.

---

## 19. Recommended First Engineering Tasks

1. Scaffold the app and commit `.env.example`, `.gitignore`, lint/test config, and health endpoint.
2. Implement environment validation and blocked database name tests.
3. Implement MongoDB connection using only validated config.
4. Implement auth/session foundation with `bgo_games_session`.
5. Implement competition model and repository helpers that require competition scope.
6. Implement the sport adapter contract and soccer adapter skeleton.
7. Add the first admin seed script with explicit database safety checks.

These tasks intentionally front-load safety and data boundaries. Once they are complete, feature work can move quickly without risking the existing IPL fantasy application.
