const readline = require("node:readline");
const { SqliteAuthRepository } = require("../src/repositories/sqlite-auth-repository");
const { AuthDomain, AuthError } = require("../src/auth-domain");
const { AuthAdministration } = require("../src/auth-administration");

function parseArgs(args) {
  const result = { _: [] };
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (!value.startsWith("--")) { result._.push(value); continue; }
    if (value === "--password" || value === "--current-password" || value === "--new-password") throw new AuthError("AUTH_INPUT_INVALID");
    const key = value.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    const next = args[index + 1];
    if (next === undefined || next.startsWith("--")) result[key] = true;
    else { result[key] = next; index += 1; }
  }
  return result;
}

function readLine(prompt, io) {
  const input = io.input || process.stdin;
  const output = io.output || process.stdout;
  const rl = readline.createInterface({ input, output });
  return new Promise((resolve) => rl.question(prompt, (answer) => { rl.close(); resolve(answer); }));
}

function readSecret(prompt, io) {
  const input = io.input || process.stdin;
  const output = io.output || process.stdout;
  if (!input.isTTY || typeof input.setRawMode !== "function") return readLine(prompt, io);
  return new Promise((resolve, reject) => {
    let value = "";
    const onData = (chunk) => {
      const text = String(chunk);
      for (const character of text) {
        if (character === "\u0003") { cleanup(); reject(new Error("interrupted")); return; }
        if (character === "\r" || character === "\n") { output.write("\n"); cleanup(); resolve(value); return; }
        if (character === "\u007f" || character === "\b") { value = value.slice(0, -1); continue; }
        if (character >= " ") value += character;
      }
    };
    const cleanup = () => { input.off("data", onData); input.setRawMode(false); input.pause(); };
    output.write(prompt);
    input.setRawMode(true);
    input.resume();
    input.on("data", onData);
  });
}

async function confirmedSecret(prompt, io) {
  const first = await readSecret(prompt, io);
  const second = await readSecret("再次输入密码: ", io);
  if (!first || first !== second) throw new AuthError("AUTH_INPUT_INVALID");
  return first;
}

function identifier(options) {
  const value = options.loginName || options.userId || options.user;
  if (!value) throw new AuthError("AUTH_INPUT_INVALID");
  return value;
}

async function run(argv, io) {
  const options = parseArgs(argv || []);
  const positional = options._;
  const area = positional[0];
  const action = positional[1];
  const repository = (io && io.repository) || new SqliteAuthRepository({ filePath: process.env.AUTH_DB_PATH });
  const domain = (io && io.domain) || new AuthDomain({ repository });
  const administration = (io && io.administration) || new AuthAdministration({ repository, domain });
  let result;
  try {
    if ((area === "user" || area === "admin") && (action === "create" || action === "create-user")) {
      const password = await confirmedSecret("密码: ", io || {});
      result = await administration.execute({ type: area === "admin" ? "create-admin" : "create-user", loginName: options.loginName || options.login || process.env.AUTH_ADMIN_LOGIN, password, expiresAt: options.expiresAt, permanent: options.permanent === true, maxDevices: options.maxDevices, note: options.note });
    } else if (area === "user" && ["enable", "disable"].includes(action)) {
      result = await administration.execute({ type: `${action}-user`, loginName: identifier(options) });
    } else if (area === "user" && action === "list") {
      result = await administration.query({ type: "list-users" });
    } else if (area === "user" && action === "show") {
      result = await administration.query({ type: "show-user", loginName: identifier(options) });
    } else if (area === "user" && action === "reset-password") {
      const password = await confirmedSecret("新密码: ", io || {});
      result = await administration.execute({ type: "reset-password", loginName: identifier(options), password });
    } else if (area === "user" && action === "set-expiry") {
      result = await administration.execute({ type: "set-expiry", loginName: identifier(options), expiresAt: options.expiresAt, permanent: options.permanent === true });
    } else if (area === "user" && action === "set-device-limit") {
      result = await administration.execute({ type: "set-device-limit", loginName: identifier(options), maxDevices: options.maxDevices });
    } else if (area === "user" && action === "set-note") {
      result = await administration.execute({ type: "update-note", loginName: identifier(options), note: options.note });
    } else if (area === "device" && action === "list") {
      result = await administration.query({ type: "list-devices", loginName: identifier(options) });
    } else if (area === "device" && action === "revoke") {
      result = await administration.execute({ type: "revoke-device", loginName: identifier(options), deviceId: options.deviceId });
    } else if (area === "session" && action === "revoke-all") {
      result = await administration.execute({ type: "revoke-sessions", loginName: identifier(options) });
    } else if (area === "audit" && action === "list") {
      result = await administration.query({ type: "list-audit", userId: options.userId, limit: options.limit });
    } else {
      throw new AuthError("AUTH_ADMIN_COMMAND_INVALID");
    }
    if (!(io && io.quiet)) (io && io.output || process.stdout).write(`${JSON.stringify(result, null, 2)}\n`);
    return result;
  } finally {
    if (!(io && io.repository) && repository && typeof repository.close === "function") repository.close();
  }
}

if (require.main === module) {
  run(process.argv.slice(2), {}).catch((error) => {
    process.stderr.write(`${error.code || "AUTH_ADMIN_FAILED"}: admin command failed\n`);
    process.exitCode = 1;
  });
}

module.exports = { run, parseArgs, readSecret, confirmedSecret };
