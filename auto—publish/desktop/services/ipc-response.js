function ok(data) {
  return { ok: true, data: data };
}

function fail(error) {
  return {
    ok: false,
    error: error && error.message ? error.message : String(error || "Unknown error")
  };
}

async function wrap(handler) {
  try {
    return ok(await handler());
  } catch (error) {
    return fail(error);
  }
}

module.exports = { ok, fail, wrap };
