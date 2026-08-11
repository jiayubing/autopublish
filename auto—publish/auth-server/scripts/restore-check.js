const path = require("node:path");
const { checkAuthRestore } = require("../src/auth-recovery-check");

function main(argv) {
  const filePath =
    (argv && argv[0]) ||
    process.env.AUTH_DB_PATH ||
    path.join(process.cwd(), "data", "auth.db");
  const result = checkAuthRestore(filePath);
  process.stdout.write(
    `${JSON.stringify({
      ok: true,
      operation: "restore-check",
      isolated: result.isolated,
      copiedWal: result.copiedWal,
      copiedShm: result.copiedShm,
      schemaVersion: result.verification.schemaVersion,
      rowCounts: result.verification.rowCounts,
      integrity: result.verification.integrity,
      contentHash: result.verification.contentHash,
    })}\n`,
  );
  return result;
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
        : "AUTH_RESTORE_CHECK_FAILED";
    process.stderr.write(`${code}: database restore check failed\n`);
    process.exitCode = 1;
  }
}

module.exports = { main };
