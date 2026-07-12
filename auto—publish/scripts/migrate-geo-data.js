const { createLegacyMigrator } = require("../src/content/legacy-migration");

function parseArguments(argv) {
  const options = { dryRun: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--dry-run") {
      options.dryRun = true;
      continue;
    }
    if (argument !== "--source" && argument !== "--workspace") throw new Error("Unknown argument: " + argument);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(argument + " requires a value");
    options[argument.slice(2)] = value;
    index += 1;
  }
  if (!options.source) throw new Error("--source is required");
  if (!options.workspace) throw new Error("--workspace is required");
  return options;
}

function main(argv) {
  const options = parseArguments(argv);
  const migrator = createLegacyMigrator({ sourceRoot: options.source, workspaceRoot: options.workspace });
  return options.dryRun ? migrator.dryRun() : migrator.migrate();
}

if (require.main === module) {
  try {
    process.stdout.write(JSON.stringify(main(process.argv.slice(2))) + "\n");
  } catch (error) {
    process.stderr.write((error.message || "Legacy migration failed") + "\n");
    process.exitCode = 1;
  }
}

module.exports = { main, parseArguments };
