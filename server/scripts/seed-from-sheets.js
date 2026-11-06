/**
 * One-shot: pull Sheets into SQLite and push merged state back.
 * Requires GOOGLE_APPLICATION_CREDENTIALS and SHEET_ID in .env.
 */
process.env.SCHEVETOREN_SEED_ONCE = "1";

const { openDb } = require("../src/db");
const { startSheetsSync, getSyncStatus } = require("../src/sheets-sync");

async function main() {
  openDb();
  await startSheetsSync();
  const status = getSyncStatus();
  if (!status.enabled) {
    console.error("Sheets sync not enabled (check credentials).");
    process.exit(1);
  }
  console.log("Seed/reconcile OK:", status);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
