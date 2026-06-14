// One-time cleanup: removes duplicate WC fixture rows created by double-imports.
// For each duplicate pair (same team1, team2, startTime), keeps the row with the
// earliest created ID and deletes the other. Only removes rows with no data
// (rawStats = 0, entryPoints = 0) to avoid touching published fixtures.
//
// Usage: node scripts/dedup-fixtures.mjs <DB_URL> [--dry-run]

import pg from "pg";

const dbUrl = process.argv[2];
const dryRun = process.argv.includes("--dry-run");

if (!dbUrl) {
  console.error("Usage: node scripts/dedup-fixtures.mjs <DB_URL> [--dry-run]");
  process.exit(1);
}

const client = new pg.Client({ connectionString: dbUrl });
await client.connect();

// Find duplicate groups: same competition, team pair, startTime
const dupes = await client.query(`
  SELECT
    f."competitionId",
    f."team1Id", f."team2Id", f."startTime",
    array_agg(f.id ORDER BY f.id ASC) as ids,
    COUNT(*) as cnt
  FROM "Fixture" f
  GROUP BY f."competitionId", f."team1Id", f."team2Id", f."startTime"
  HAVING COUNT(*) > 1
  ORDER BY f."startTime"
`);

console.log(`Found ${dupes.rows.length} duplicate fixture groups${dryRun ? " (DRY RUN — no deletions)" : ""}\n`);

let totalDeleted = 0;
let skipped = 0;

for (const group of dupes.rows) {
  const ids = group.ids; // sorted ASC — first is the canonical one to keep
  const toDelete = ids.slice(1);  // delete all but the first

  // Safety: only delete rows that have zero data
  const safe = await client.query(`
    SELECT id FROM "Fixture" f
    WHERE f.id = ANY($1::text[])
      AND (SELECT COUNT(*) FROM "RawStat" rs WHERE rs."fixtureId" = f.id) = 0
      AND (SELECT COUNT(*) FROM "EntryPoints" ep WHERE ep."fixtureId" = f.id) = 0
      AND (SELECT COUNT(*) FROM "PlayerPoints" pp WHERE pp."fixtureId" = f.id) = 0
  `, [toDelete]);

  const safeIds = safe.rows.map((r) => r.id);
  const unsafeCount = toDelete.length - safeIds.length;

  if (unsafeCount > 0) {
    console.log(`  SKIPPING ${unsafeCount} row(s) — have data: ${toDelete.filter(id => !safeIds.includes(id)).join(", ")}`);
    skipped += unsafeCount;
  }

  if (safeIds.length > 0 && !dryRun) {
    const del = await client.query(`DELETE FROM "Fixture" WHERE id = ANY($1::text[])`, [safeIds]);
    totalDeleted += del.rowCount;
  } else if (safeIds.length > 0 && dryRun) {
    totalDeleted += safeIds.length;
  }
}

if (dryRun) {
  console.log(`\nDRY RUN: would delete ${totalDeleted} duplicate rows, skip ${skipped} with data`);
} else {
  console.log(`\nDeleted ${totalDeleted} duplicate fixture rows. Skipped ${skipped} rows with data.`);
}

await client.end();
