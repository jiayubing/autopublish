const path = require("node:path");
const { SqliteAuthRepository } = require("../src/repositories/sqlite-auth-repository");

function main(argv) {
  const filePath = (argv && argv[0]) || process.env.AUTH_DB_PATH || path.join(process.cwd(), "data", "auth.db");
  const repository = new SqliteAuthRepository({ filePath });
  try {
    repository.healthCheck();
    process.stdout.write("SQLite auth restore check passed\n");
  } finally {
    repository.close();
  }
}

if (require.main === module) {
  try { main(process.argv.slice(2)); } catch (error) { process.stderr.write(`${error.code || "AUTH_RESTORE_CHECK_FAILED"}: database restore check failed\n`); process.exitCode = 1; }
}

module.exports = { main };
