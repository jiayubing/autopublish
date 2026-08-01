const { runRecoveryDrill } = require("../src/recovery-fixtures");

function parseArgs(argv) {
  const args = argv || [];
  if (args.length !== 2 || args[0] !== "--temp-root" || !args[1]) throw Object.assign(new Error("AUTH_RECOVERY_TEMP_ROOT_REQUIRED"), { code: "AUTH_RECOVERY_TEMP_ROOT_REQUIRED" });
  return args[1];
}

async function main(argv) {
  const root = parseArgs(argv);
  const result = await runRecoveryDrill(root);
  process.stdout.write(`${JSON.stringify({
    ok: true,
    operation: "recovery-drill",
    temporaryOnly: result.temporaryOnly,
    walPresentBeforeCheck: result.walPresentBeforeCheck,
    restoreWhileOpen: result.restoreWhileOpen,
    backup: result.backup,
    restoredBackup: result.restoredBackup,
    corruptCode: result.corruptCode,
  })}\n`);
  return result;
}

if (require.main === module) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${error.code || "AUTH_RECOVERY_DRILL_FAILED"}: recovery drill failed\n`);
    process.exitCode = 1;
  });
}

module.exports = { main, parseArgs };
