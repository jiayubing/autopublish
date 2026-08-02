const crypto = require("node:crypto");
const { promisify } = require("node:util");
const { AuthError } = require("../auth-errors");

const PASSWORD_SCHEME = "scrypt";
const PASSWORD_COST = 32768;
const PASSWORD_BLOCK_SIZE = 8;
const PASSWORD_PARALLELISM = 1;
const PASSWORD_KEY_LENGTH = 32;
const MIN_PASSWORD_LENGTH = 6;
const PASSWORD_MAX_MEMORY = 64 * 1024 * 1024;
const DUMMY_PASSWORD_HASH = `${PASSWORD_SCHEME}$${PASSWORD_COST}$${PASSWORD_BLOCK_SIZE}$${PASSWORD_PARALLELISM}$autopublish-invalid-salt$${"0".repeat(PASSWORD_KEY_LENGTH * 2)}`;
const scrypt = promisify(crypto.scrypt);

class ScryptLimiter {
  constructor(limit) {
    this.limit = Math.max(1, Number(limit) || 2);
    this.active = 0;
    this.queue = [];
  }

  run(task) {
    return new Promise((resolve, reject) => {
      this.queue.push({ task, resolve, reject });
      this.pump();
    });
  }

  pump() {
    while (this.active < this.limit && this.queue.length) {
      const item = this.queue.shift();
      this.active += 1;
      Promise.resolve()
        .then(item.task)
        .then(item.resolve, item.reject)
        .finally(() => {
          this.active -= 1;
          this.pump();
        });
    }
  }
}

class PasswordPolicy {
  constructor(options) {
    const opts = options || {};
    this.limiter =
      opts.limiter ||
      new ScryptLimiter(Number(opts.maxConcurrentPasswordComputations || 2));
    this.options = {
      cost: Number(opts.passwordCost || PASSWORD_COST),
      blockSize: PASSWORD_BLOCK_SIZE,
      parallelism: PASSWORD_PARALLELISM,
      maxmem: PASSWORD_MAX_MEMORY,
      limiter: this.limiter,
    };
    this.hasher = opts.hasher || createPasswordHash;
    this.verifier = opts.verifier || verifyPassword;
  }

  normalize(value) {
    if (
      typeof value !== "string" ||
      value.length < MIN_PASSWORD_LENGTH ||
      value.length > 256
    )
      throw new AuthError("AUTH_INPUT_INVALID");
    return value;
  }

  validateLoginSecret(value) {
    if (typeof value !== "string" || value.length === 0 || value.length > 256)
      throw new AuthError("AUTH_INPUT_INVALID");
    return value;
  }

  hash(password) {
    return this.hasher(password, this.options);
  }

  verify(password, encoded) {
    return this.verifier(password, encoded, this.options);
  }
}

function createPasswordHash(password, options) {
  const opts = options || {};
  const cost = Number(opts.cost || PASSWORD_COST);
  const blockSize = Number(opts.blockSize || PASSWORD_BLOCK_SIZE);
  const parallelism = Number(opts.parallelism || PASSWORD_PARALLELISM);
  const maxmem = Number(opts.maxmem || PASSWORD_MAX_MEMORY);
  const salt = (opts.randomBytes || crypto.randomBytes)(16).toString(
    "base64url",
  );
  const limiter = opts.limiter || new ScryptLimiter(1);
  return limiter
    .run(() =>
      scrypt(String(password), salt, PASSWORD_KEY_LENGTH, {
        N: cost,
        r: blockSize,
        p: parallelism,
        maxmem,
      }),
    )
    .then(
      (derived) =>
        `${PASSWORD_SCHEME}$${cost}$${blockSize}$${parallelism}$${salt}$${derived.toString("hex")}`,
    );
}

function verifyPassword(password, encoded, options) {
  const parts = String(encoded || "").split("$");
  if (parts.length !== 6 || parts[0] !== PASSWORD_SCHEME)
    return Promise.resolve(false);
  const cost = Number(parts[1]);
  const blockSize = Number(parts[2]);
  const parallelism = Number(parts[3]);
  if (
    !Number.isSafeInteger(cost) ||
    !Number.isSafeInteger(blockSize) ||
    !Number.isSafeInteger(parallelism) ||
    !parts[4] ||
    !/^[0-9a-f]+$/i.test(parts[5])
  )
    return Promise.resolve(false);
  const limiter = (options && options.limiter) || new ScryptLimiter(1);
  return limiter
    .run(() =>
      scrypt(String(password), parts[4], parts[5].length / 2, {
        N: cost,
        r: blockSize,
        p: parallelism,
        maxmem: Number((options && options.maxmem) || PASSWORD_MAX_MEMORY),
      }),
    )
    .then((derived) => {
      const actual = Buffer.from(parts[5], "hex");
      return (
        actual.length === derived.length &&
        crypto.timingSafeEqual(actual, derived)
      );
    })
    .catch(() => false);
}

module.exports = {
  DUMMY_PASSWORD_HASH,
  MIN_PASSWORD_LENGTH,
  PASSWORD_COST,
  PASSWORD_KEY_LENGTH,
  PASSWORD_MAX_MEMORY,
  PasswordPolicy,
  ScryptLimiter,
  createPasswordHash,
  verifyPassword,
};
