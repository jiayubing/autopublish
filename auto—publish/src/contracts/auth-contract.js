const contract = require("./auth-contract.json");

const AUTH_ERROR_CODES = new Set(contract.codes);
const AUTH_ERRORS = Object.freeze(Object.assign({}, contract.messages));

function authError(code) {
  const safeCode = AUTH_ERROR_CODES.has(code) ? code : "AUTH_SERVER_ERROR";
  const error = new Error(AUTH_ERRORS[safeCode]);
  error.code = safeCode;
  return error;
}

module.exports = { AUTH_ERROR_CODES, AUTH_ERRORS, authError };
