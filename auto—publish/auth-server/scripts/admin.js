const readline = require("readline");
const { createAuthStore } = require("../src/auth-store");

const store = createAuthStore({ filePath: process.env.AUTH_DB_PATH });
const command = process.argv[2];
const loginName = process.env.AUTH_ADMIN_LOGIN || "admin";

function ask(prompt) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(prompt, (answer) => { rl.close(); resolve(answer); }));
}

(async () => {
  if (command === "create") {
    const password = await ask("Admin password: ");
    if (!password) throw new Error("password is required");
    store.createAdmin(loginName, password);
  } else if (command === "disable") {
    store.setEnabled(loginName, false);
  } else if (command === "revoke-sessions") {
    const user = store.findUser(loginName);
    if (user) store.revokeAllSessions(user.id);
  } else {
    throw new Error("unsupported admin command");
  }
})().catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
