const assert = require("node:assert/strict");
const { describe, it } = require("node:test");
const { Readable, PassThrough } = require("node:stream");
const { AuthError } = require("../src/auth-domain");
const { createMemoryAuth } = require("./helpers");
const authctl = require("../scripts/authctl");

describe("SSH administration adapter", () => {
  it("rejects password command-line arguments", () => {
    assert.throws(() => authctl.parseArgs(["user", "create", "--login-name", "x", "--password", "secret"]), (error) => error instanceof AuthError && error.code === "AUTH_INPUT_INVALID");
  });

  it("collects passwords interactively and exposes only safe management output", async () => {
    const { repository, domain, administration } = createMemoryAuth();
    const output = new PassThrough();
    let outputText = "";
    output.on("data", (chunk) => { outputText += String(chunk); });
    await authctl.run(["user", "create", "--login-name", "cli-user", "--expires-at", new Date(Date.now() + 86400000).toISOString()], {
      repository,
      domain,
      administration,
      input: Readable.from(["cli-password\n", "cli-password\n"]),
      output,
    });
    const users = await administration.query({ type: "list-users" });
    assert.equal(users[0].loginName, "cli-user");
    assert.equal(Object.prototype.hasOwnProperty.call(users[0], "passwordHash"), false);
    assert.equal(outputText.includes("cli-password"), false);
    await authctl.run(["user", "set-device-limit", "--login-name", "cli-user", "--max-devices", "2"], { repository, domain, administration, input: Readable.from([]), output, quiet: true });
    assert.equal((await administration.query({ type: "show-user", loginName: "cli-user" })).maxDevices, 2);
  });
});
