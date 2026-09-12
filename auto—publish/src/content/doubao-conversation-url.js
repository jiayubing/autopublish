function validConversationUrl(value) {
  if (typeof value !== "string" || !value) return null;
  try {
    const url = new URL(value);
    if (url.origin !== "https://www.doubao.com" || url.username || url.password) return null;
    if (!/^\/chat\/\d+\/?$/.test(url.pathname)) return null;
    url.hash = "";
    return url.toString();
  } catch (_) {
    return null;
  }
}

module.exports = { validConversationUrl };
