const path = require("node:path");
const { backupAuthDatabase } = require("../src/auth-backup-orchestrator");

async function main(argv) {
  const args = argv || [];
  const source = args[0] || process.env.AUTH_DB_PATH || path.join(process.cwd(), "data", "auth.db");
  const destination = args[1];
  if (!destination) throw new Error("backup destination is required");
  const result = await backupAuthDatabase({ source, destination });
  process.stdout.write(`${JSON.stringify({
    ok: true,
    operation: "backup",
    schemaVersion: result.verification.schemaVersion,
    rowCounts: result.verification.rowCounts,
    integrity: result.verification.integrity,
    contentHash: result.verification.contentHash,
  })}\n`);
  return result;
}

if (require.main === module) {
  main(process.argv.slice(2)).catch((error) => { process.stderr.write(`${error.code || "AUTH_BACKUP_FAILED"}: database backup failed\n`); process.exitCode = 1; });
}

module.exports = { main };
