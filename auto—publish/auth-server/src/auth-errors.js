class AuthError extends Error {
  constructor(code, details) {
    super(code);
    this.name = "AuthError";
    this.code = code;
    this.details = details || undefined;
  }
}

module.exports = { AuthError };
