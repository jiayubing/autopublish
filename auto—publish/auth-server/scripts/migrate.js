const path = require("node:path");
const {
  SqliteAuthRepository,
} = require("../src/repositories/sqlite-auth-repository");

function databasePath(argument) {
  const filePath =
    argument ||
    process.env.AUTH_DB_PATH ||
    path.join(process.cwd(), "data", "auth.db");
  if (path.basename(filePath).toLowerCase() === "auth.json")
    throw new Error(
      "auth.json is not migrated; choose a new SQLite database path",
    );
  return filePath;
}

function main(argv) {
  const repository = new SqliteAuthRepository({
    filePath: databasePath(argv && argv[0]),
  });
  try {
    const result = repository.migrationResult || {
      migrated: false,
      schemaVersion: 2,
    };
    process.stdout.write(
      `${JSON.stringify({
        ok: true,
        operation: "migration",
        migrated: result.migrated === true,
        schemaVersion: result.schemaVersion,
        integrity: result.verification && result.verification.integrity,
      })}\n`,
    );
    return result;
  } finally {
    repository.close();
  }
}

if (require.main === module) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    const code =
      error &&
      typeof error.code === "string" &&
      /^AUTH_[A-Z0-9_]{1,72}$/.test(error.code)
        ? error.code
        : "AUTH_DB_INIT_FAILED";
    process.stderr.write(`${code}: database migration failed\n`);
    process.exitCode = 1;
  }
}

module.exports = { main, databasePath };
