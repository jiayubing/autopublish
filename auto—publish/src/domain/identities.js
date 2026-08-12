const CONTROL_OR_PATH = /[<>:"/\\|?*\x00-\x1f\x7f]/;
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const CLIENT_ID_PATTERN = /^(?!\.{1,2}$)(?=\S)[^<>:"/\\|?*\x00-\x1f\x7f]*\S$/u;

function domainError(code) {
  const error = new Error("Domain identity is invalid");
  error.code = code;
  return error;
}

function createIdentity(kind, maxLength, pattern) {
  function parse(value) {
    if (typeof value !== "string") throw domainError("DOMAIN_ID_INVALID");
    const normalized = value.normalize("NFKC").trim();
    if (
      !normalized ||
      normalized === "." ||
      normalized === ".." ||
      normalized.length > maxLength ||
      CONTROL_OR_PATH.test(normalized) ||
      !(pattern || ID_PATTERN).test(normalized)
    )
      throw domainError("DOMAIN_ID_INVALID");
    return Object.freeze({ kind, value: normalized });
  }
  function serialize(value) {
    if (!value || value.kind !== kind || typeof value.value !== "string")
      throw domainError("DOMAIN_ID_KIND");
    return parse(value.value).value;
  }
  function validate(value) {
    try {
      return { ok: true, value: parse(value) };
    } catch (error) {
      return { ok: false, code: error.code };
    }
  }
  return Object.freeze({ parse, serialize, validate });
}

module.exports = Object.freeze({
  ApplicationAccountId: createIdentity("ApplicationAccountId", 128),
  ClientId: createIdentity("ClientId", 128, CLIENT_ID_PATTERN),
  ArticleId: createIdentity("ArticleId", 128),
  PublicationId: createIdentity("PublicationId", 128),
  AttemptId: createIdentity("AttemptId", 128),
  BatchId: createIdentity("BatchId", 128),
  AccountProfileId: createIdentity("AccountProfileId", 128),
  MediaResourceId: createIdentity("MediaResourceId", 128),
  RemoteId: createIdentity("RemoteId", 512),
});
