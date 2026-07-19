const path = require("node:path");
const { SqliteAuthRepository } = require("../src/repositories/sqlite-auth-repository");

async function main(argv) {
  const args = argv || [];
  const source = args[0] || process.env.AUTH_DB_PATH || path.join(process.cwd(), "data", "auth.db");
  const destination = args[1];
  if (!destination) throw new Error("backup destination is required");
  const repository = new SqliteAuthRepository({ filePath: source });
  try {
    await repository.backupTo(destination);
    repository.healthCheck();
    process.stdout.write("SQLite auth backup completed\n");
  } finally {
    repository.close();
  }
}

if (require.main === module) {
  main(process.argv.slice(2)).catch((error) => { process.stderr.write(`${error.code || "AUTH_BACKUP_FAILED"}: database backup failed\n`); process.exitCode = 1; });
}

module.exports = { main };
