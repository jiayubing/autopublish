// Kept as a compatibility wrapper for the old npm admin scripts. All real
// command parsing and hidden password input live in authctl.js.
const authctl = require("./authctl");

const command = process.argv[2];
const loginName = process.env.AUTH_ADMIN_LOGIN || "admin";
const args =
  command === "create"
    ? ["admin", "create", "--login-name", loginName, "--permanent"]
    : command === "disable"
      ? ["user", "disable", "--login-name", loginName]
      : command === "revoke-sessions"
        ? ["session", "revoke-all", "--login-name", loginName]
        : [];

authctl.run(args, {}).catch((error) => {
  const code =
    error &&
    typeof error.code === "string" &&
    /^AUTH_[A-Z0-9_]{1,72}$/.test(error.code)
      ? error.code
      : "AUTH_ADMIN_FAILED";
  process.stderr.write(`${code}: admin command failed\n`);
  process.exitCode = 1;
});
