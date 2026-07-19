const authctl = require("./authctl");

function commandError(message) {
  const error = new Error(message);
  error.code = "AUTH_ADMIN_COMMAND_INVALID";
  return error;
}

function requireName(args, index, label) {
  const value = args[index];
  if (!value || value.startsWith("-")) throw commandError(`${label} is required`);
  return value;
}

function translate(argv) {
  const args = Array.isArray(argv) ? argv.slice() : [];
  const command = args.shift();
  if (!command) throw commandError("command is required");

  switch (command) {
    case "create": {
      const loginName = requireName(args, 0, "login name");
      return ["user", "create", "--login-name", loginName].concat(args.slice(1));
    }
    case "list": return ["user", "list"].concat(args);
    case "show": return ["user", "show", "--login-name", requireName(args, 0, "login name")].concat(args.slice(1));
    case "enable": return ["user", "enable", "--login-name", requireName(args, 0, "login name")];
    case "disable":
    case "revoke": return ["user", "disable", "--login-name", requireName(args, 0, "login name")];
    case "renew": {
      const loginName = requireName(args, 0, "login name");
      const expiry = requireName(args, 1, "expiry or permanent");
      if (expiry === "permanent") return ["user", "set-expiry", "--login-name", loginName, "--permanent"];
      return ["user", "set-expiry", "--login-name", loginName, "--expires-at", expiry];
    }
    case "reset": return ["user", "reset-password", "--login-name", requireName(args, 0, "login name")];
    case "limit": {
      const loginName = requireName(args, 0, "login name");
      const maxDevices = requireName(args, 1, "device limit");
      return ["user", "set-device-limit", "--login-name", loginName, "--max-devices", maxDevices];
    }
    case "note": {
      const loginName = requireName(args, 0, "login name");
      const note = requireName(args, 1, "note");
      return ["user", "set-note", "--login-name", loginName, "--note", note];
    }
    case "devices": return ["device", "list", "--login-name", requireName(args, 0, "login name")];
    case "device-revoke": {
      const loginName = requireName(args, 0, "login name");
      const deviceId = requireName(args, 1, "device id");
      return ["device", "revoke", "--login-name", loginName, "--device-id", deviceId];
    }
    case "sessions-revoke": return ["session", "revoke-all", "--login-name", requireName(args, 0, "login name")];
    case "audit": return ["audit", "list"].concat(args);
    default: throw commandError(`unsupported command: ${command}`);
  }
}

async function main(argv, io) {
  return authctl.run(translate(argv), io);
}

if (require.main === module) {
  main(process.argv.slice(2), {}).catch((error) => {
    process.stderr.write(`${error.code || "AUTH_ADMIN_FAILED"}: admin command failed\n`);
    process.exitCode = 1;
  });
}

module.exports = { main, translate };
