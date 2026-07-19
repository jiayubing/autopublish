const path = require("node:path");
const { SqliteAuthRepository } = require("../src/repositories/sqlite-auth-repository");

function databasePath(argument) {
  const filePath = argument || process.env.AUTH_DB_PATH || path.join(process.cwd(), "data", "auth.db");
  if (path.basename(filePath).toLowerCase() === "auth.json") throw new Error("auth.json is not migrated; choose a new SQLite database path");
  return filePath;
}

function main(argv) {
  const repository = new SqliteAuthRepository({ filePath: databasePath(argv && argv[0]) });
  try {
    repository.healthCheck();
    process.stdout.write("SQLite auth schema is current\n");
  } finally {
    repository.close();
  }
}

if (require.main === module) {
  try { main(process.argv.slice(2)); } catch (error) { process.stderr.write(`${error.code || "AUTH_DB_INIT_FAILED"}: database migration failed\n`); process.exitCode = 1; }
}

module.exports = { main, databasePath };
