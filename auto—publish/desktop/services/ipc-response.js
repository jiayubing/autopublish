function ok(data) {
  return { ok: true, data: data };
}

function fail(error) {
  const response = {
    ok: false,
    error: {
      code: error && typeof error.code === "string" && error.code ? error.code : "IPC_ERROR",
      message: error && error.message ? error.message : String(error || "Unknown error")
    }
  };
  ["platformId", "templateId", "diagnosticCode"].forEach(function(key) {
    if (error && typeof error[key] === "string" && error[key].length <= 200 && !/[\\/\u0000-\u001F]/.test(error[key])) response.error[key] = error[key];
  });
  return response;
}

async function wrap(handler) {
  try {
    return ok(await handler());
  } catch (error) {
    return fail(error);
  }
}

module.exports = { ok, fail, wrap };
