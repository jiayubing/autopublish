const {
  parseSafeOperationalError,
} = require("../../../src/domain/safe-operational-error");

const SCHEMA_VERSION = 1;
const SAFE_TOKEN = /^[A-Za-z0-9._:-]+$/;
const SAFE_DIAGNOSTIC_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const CONTRACT_ERROR = Symbol("ipcContractError");

function contractError(code, message) {
  const error = new Error(message || "IPC contract validation failed");
  error.code = code;
  Object.defineProperty(error, CONTRACT_ERROR, { value: true });
  return error;
}

function safeDiagnosticId(value) {
  return typeof value === "string" &&
    SAFE_DIAGNOSTIC_ID.test(value) &&
    value !== "." &&
    value !== ".."
    ? value
    : null;
}

function rethrowContractError(error, code) {
  if (error && error[CONTRACT_ERROR] === true) throw error;
  throw contractError(code);
}

function plainObjectDescriptors(value, code) {
  try {
    if (
      !value ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      Object.getPrototypeOf(value) !== Object.prototype
    )
      throw contractError(code);
    const descriptors = Object.getOwnPropertyDescriptors(value);
    for (const key of Reflect.ownKeys(descriptors)) {
      const descriptor = descriptors[key];
      if (
        typeof key !== "string" ||
        !descriptor.enumerable ||
        !("value" in descriptor)
      )
        throw contractError(code);
    }
    return descriptors;
  } catch (error) {
    rethrowContractError(error, code);
  }
}

function arrayValues(value, code) {
  try {
    if (
      !Array.isArray(value) ||
      Object.getPrototypeOf(value) !== Array.prototype
    )
      throw contractError(code);
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Reflect.ownKeys(descriptors);
    if (
      keys.some(
        (key) =>
          typeof key !== "string" ||
          (key !== "length" && !/^(0|[1-9][0-9]*)$/.test(key)),
      )
    )
      throw contractError(code);
    const result = [];
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = descriptors[String(index)];
      if (!descriptor || !descriptor.enumerable || !("value" in descriptor))
        throw contractError(code);
      result.push(descriptor.value);
    }
    return result;
  } catch (error) {
    rethrowContractError(error, code);
  }
}

function copyPlainDataObject(value, code) {
  const descriptors = plainObjectDescriptors(value, code);
  const result = {};
  for (const key of Object.keys(descriptors))
    result[key] = descriptors[key].value;
  return result;
}

const INTERNAL_SAFE_ERROR = Object.freeze({
  code: "IPC_INTERNAL",
  category: "internal",
  retryability: "manual-check",
  userMessage: "操作未能安全完成，请稍后重试或检查诊断信息。",
});

function schemaOptions(options, allowed) {
  if (options === undefined) return {};
  const values = copyPlainDataObject(options, "IPC_CONTRACT_INVALID");
  if (Object.keys(values).some((key) => !allowed.includes(key)))
    throw contractError("IPC_CONTRACT_INVALID");
  return values;
}

function assertBounds(min, max, integer) {
  const validNumber = integer ? Number.isSafeInteger : Number.isFinite;
  if (!validNumber(min) || !validNumber(max) || min > max)
    throw contractError("IPC_CONTRACT_INVALID");
}

function assertLiteral(value) {
  if (!(
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value)) ||
    (typeof value === "string" &&
      value.length <= 512 &&
      !/[\x00-\x1f\x7f]/.test(value))
  ))
    throw contractError("IPC_CONTRACT_INVALID");
}

function assertFieldSpec(spec, seen) {
  if (spec === "boolean") return;
  const visited = seen || new WeakSet();
  if (!spec || typeof spec !== "object" || visited.has(spec))
    throw contractError("IPC_CONTRACT_INVALID");
  visited.add(spec);
  const values = copyPlainDataObject(spec, "IPC_CONTRACT_INVALID");
  if (values.type === "custom") {
    if (
      Object.keys(values).some((key) => !["type", "validate"].includes(key)) ||
      typeof values.validate !== "function"
    )
      throw contractError("IPC_CONTRACT_INVALID");
    visited.delete(spec);
    return;
  }
  if (values.type === "string") {
    assertBounds(values.min, values.max, true);
    if (
      !(values.pattern instanceof RegExp) ||
      Object.getPrototypeOf(values.pattern) !== RegExp.prototype
    )
      throw contractError("IPC_CONTRACT_INVALID");
    if (values.values !== null) {
      const choices = arrayValues(values.values, "IPC_CONTRACT_INVALID");
      if (!choices.length || choices.some((value) => typeof value !== "string"))
        throw contractError("IPC_CONTRACT_INVALID");
    }
    if (values.multiline !== undefined && typeof values.multiline !== "boolean")
      throw contractError("IPC_CONTRACT_INVALID");
    visited.delete(spec);
    return;
  }
  if (values.type === "integer") {
    assertBounds(values.min, values.max, true);
    visited.delete(spec);
    return;
  }
  if (values.type === "number") {
    assertBounds(values.min, values.max, false);
    visited.delete(spec);
    return;
  }
  if (values.type === "literal") {
    assertLiteral(values.value);
    visited.delete(spec);
    return;
  }
  if (values.type === "enum") {
    const choices = arrayValues(values.values, "IPC_CONTRACT_INVALID");
    if (!choices.length) throw contractError("IPC_CONTRACT_INVALID");
    for (const value of choices) assertLiteral(value);
    visited.delete(spec);
    return;
  }
  if (values.type === "optional" || values.type === "nullable") {
    assertFieldSpec(values.field, visited);
    visited.delete(spec);
    return;
  }
  if (values.type === "oneOf") {
    const fields = arrayValues(values.fields, "IPC_CONTRACT_INVALID");
    if (!fields.length) throw contractError("IPC_CONTRACT_INVALID");
    for (const field of fields) assertFieldSpec(field, visited);
    visited.delete(spec);
    return;
  }
  if (values.type === "array" || values.arrayOf) {
    const allowed =
      values.type === "array"
        ? ["type", "field", "min", "max"]
        : ["arrayOf", "min", "max"];
    if (Object.keys(values).some((key) => !allowed.includes(key)))
      throw contractError("IPC_CONTRACT_INVALID");
    assertBounds(
      values.min === undefined ? 0 : values.min,
      values.max === undefined ? 1000 : values.max,
      true,
    );
    assertFieldSpec(
      values.type === "array" ? values.field : values.arrayOf,
      visited,
    );
    visited.delete(spec);
    return;
  }
  if (values.type === "object") {
    const fields = copyPlainDataObject(values.fields, "IPC_CONTRACT_INVALID");
    for (const key of Object.keys(fields)) {
      if (["__proto__", "prototype", "constructor"].includes(key))
        throw contractError("IPC_CONTRACT_INVALID");
      assertFieldSpec(fields[key], visited);
    }
    visited.delete(spec);
    return;
  }
  throw contractError("IPC_CONTRACT_INVALID");
}

function stringField(options) {
  const values = schemaOptions(options, ["min", "max", "values", "pattern"]);
  const field = Object.freeze({
    type: "string",
    min: values.min === undefined ? 1 : values.min,
    max: values.max === undefined ? 512 : values.max,
    values: values.values
      ? Object.freeze(arrayValues(values.values, "IPC_CONTRACT_INVALID"))
      : null,
    pattern: values.pattern || SAFE_TOKEN,
    multiline: false,
  });
  assertFieldSpec(field);
  return field;
}

function multilineStringField(options) {
  const values = schemaOptions(options, ["min", "max", "values", "pattern"]);
  const field = Object.freeze({
    type: "string",
    min: values.min === undefined ? 1 : values.min,
    max: values.max === undefined ? 512 : values.max,
    values: values.values
      ? Object.freeze(arrayValues(values.values, "IPC_CONTRACT_INVALID"))
      : null,
    pattern:
      values.pattern || /^[^\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]*$/u,
    multiline: true,
  });
  assertFieldSpec(field);
  return field;
}

function integerField(options) {
  const values = schemaOptions(options, ["min", "max"]);
  const field = Object.freeze({
    type: "integer",
    min: values.min === undefined ? Number.MIN_SAFE_INTEGER : values.min,
    max: values.max === undefined ? Number.MAX_SAFE_INTEGER : values.max,
  });
  assertFieldSpec(field);
  return field;
}

function optionalField(field) {
  const spec = Object.freeze({ type: "optional", field });
  assertFieldSpec(spec);
  return spec;
}

function nullableField(field) {
  const spec = Object.freeze({ type: "nullable", field });
  assertFieldSpec(spec);
  return spec;
}

function literalField(value) {
  const field = Object.freeze({ type: "literal", value });
  assertFieldSpec(field);
  return field;
}

function enumField(values) {
  const field = Object.freeze({
    type: "enum",
    values: Object.freeze(arrayValues(values, "IPC_CONTRACT_INVALID")),
  });
  assertFieldSpec(field);
  return field;
}

function numberField(options) {
  const values = schemaOptions(options, ["min", "max"]);
  const field = Object.freeze({
    type: "number",
    min: values.min === undefined ? -Number.MAX_VALUE : values.min,
    max: values.max === undefined ? Number.MAX_VALUE : values.max,
  });
  assertFieldSpec(field);
  return field;
}

function arrayField(field, options) {
  const values = schemaOptions(options, ["min", "max"]);
  const spec = Object.freeze({
    type: "array",
    field,
    min: values.min === undefined ? 0 : values.min,
    max: values.max === undefined ? 1000 : values.max,
  });
  assertFieldSpec(spec);
  return spec;
}

function oneOf(fields) {
  const spec = Object.freeze({
    type: "oneOf",
    fields: Object.freeze(arrayValues(fields, "IPC_CONTRACT_INVALID")),
  });
  assertFieldSpec(spec);
  return spec;
}

function customField(validate) {
  if (typeof validate !== "function")
    throw contractError("IPC_CONTRACT_INVALID");
  const spec = Object.freeze({ type: "custom", validate });
  assertFieldSpec(spec);
  return spec;
}

function exactObject(fields) {
  const values = copyPlainDataObject(fields, "IPC_CONTRACT_INVALID");
  const spec = Object.freeze({
    type: "object",
    fields: Object.freeze({ ...values }),
  });
  assertFieldSpec(spec);
  return spec;
}

function validateValue(spec, value, code) {
  if (spec && spec.type === "optional")
    return validateValue(spec.field, value, code);
  if (spec && spec.type === "nullable")
    return value === null ? null : validateValue(spec.field, value, code);
  if (spec && spec.type === "literal") {
    if (!Object.is(value, spec.value)) throw contractError(code);
    return value;
  }
  if (spec && spec.type === "enum") {
    if (!spec.values.some((candidate) => Object.is(candidate, value)))
      throw contractError(code);
    return value;
  }
  if (spec && spec.type === "oneOf") {
    const objectFields =
      value && typeof value === "object" && !Array.isArray(value)
        ? spec.fields.filter((field) => {
            let candidate = field;
            while (
              candidate &&
              (candidate.type === "optional" || candidate.type === "nullable")
            )
              candidate = candidate.field;
            return candidate && candidate.type === "object";
          })
        : [];
    const candidates = objectFields.length ? objectFields : spec.fields;
    let unknownFieldCount = 0;
    for (const field of candidates) {
      try {
        return validateValue(field, value, code);
      } catch (error) {
        if (error && error.code === "IPC_UNKNOWN_FIELD") unknownFieldCount += 1;
      }
    }
    throw contractError(
      unknownFieldCount === candidates.length ? "IPC_UNKNOWN_FIELD" : code,
    );
  }
  if (spec && spec.type === "custom") {
    try {
      return spec.validate(value);
    } catch (_) {
      throw contractError(code);
    }
  }
  if (spec === "boolean") {
    if (typeof value !== "boolean") throw contractError(code);
    return value;
  }
  if (spec && spec.type === "string") {
    if (
      typeof value !== "string" ||
      value.length < spec.min ||
      value.length > spec.max ||
      (spec.multiline
        ? /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value)
        : /[\x00-\x1f\x7f]/.test(value)) ||
      (spec.values && !spec.values.includes(value)) ||
      (spec.pattern && !spec.pattern.test(value))
    )
      throw contractError(code);
    return value;
  }
  if (spec && spec.type === "integer") {
    if (!Number.isSafeInteger(value) || value < spec.min || value > spec.max)
      throw contractError(code);
    return value;
  }
  if (spec && spec.type === "number") {
    if (!Number.isFinite(value) || value < spec.min || value > spec.max)
      throw contractError(code);
    return value;
  }
  if (spec && spec.type === "object") return validateObject(spec, value, code);
  if (spec && (spec.type === "array" || spec.arrayOf)) {
    const field = spec.type === "array" ? spec.field : spec.arrayOf;
    const min = spec.min === undefined ? 0 : spec.min;
    const max = spec.max === undefined ? 1000 : spec.max;
    const values = arrayValues(value, code);
    if (values.length < min || values.length > max) throw contractError(code);
    return values.map((item) => validateValue(field, item, code));
  }
  throw contractError("IPC_CONTRACT_INVALID");
}

function validateObject(spec, input, code) {
  const descriptors = plainObjectDescriptors(input, code);
  const allowed = Object.keys(spec.fields);
  for (const key of Object.keys(descriptors))
    if (!allowed.includes(key)) throw contractError("IPC_UNKNOWN_FIELD");
  const result = {};
  for (const key of allowed) {
    if (!Object.prototype.hasOwnProperty.call(descriptors, key)) {
      if (spec.fields[key] && spec.fields[key].type === "optional") continue;
      throw contractError(code);
    }
    result[key] = validateValue(spec.fields[key], descriptors[key].value, code);
  }
  return result;
}

function defineContract(input) {
  if (
    !input ||
    !stringField({ max: 128 }).pattern.test(input.capability || "") ||
    typeof input.channel !== "string" ||
    typeof input.feature !== "string" ||
    !["query", "command", "event"].includes(input.kind)
  )
    throw contractError("IPC_CONTRACT_INVALID");
  if (input.kind === "event" && !input.event)
    throw contractError("IPC_CONTRACT_INVALID");
  if (input.kind !== "event" && (!input.request || !input.success))
    throw contractError("IPC_CONTRACT_INVALID");
  return Object.freeze({
    schemaVersion: SCHEMA_VERSION,
    capability: input.capability,
    channel: input.channel,
    feature: input.feature,
    kind: input.kind,
    request: input.request || null,
    success: input.success || null,
    event: input.event || null,
    eventFields: Object.freeze([...(input.eventFields || [])]),
    validateEvent:
      typeof input.validateEvent === "function" ? input.validateEvent : null,
    errorCodes: Object.freeze([...(input.errorCodes || [])]),
    errors: Object.freeze({ ...(input.errors || {}) }),
    fromArgs: typeof input.fromArgs === "function" ? input.fromArgs : null,
    toArgs: typeof input.toArgs === "function" ? input.toArgs : null,
  });
}

function envelope(input, fields, code) {
  const descriptors = plainObjectDescriptors(input, code);
  for (const key of Object.keys(descriptors))
    if (!fields.includes(key)) throw contractError("IPC_UNKNOWN_FIELD");
  const parsed = {};
  for (const key of Object.keys(descriptors))
    parsed[key] = descriptors[key].value;
  if (parsed.schemaVersion !== SCHEMA_VERSION)
    throw contractError("IPC_SCHEMA_UNSUPPORTED");
  return parsed;
}

function createContractRegistry(contracts) {
  const byCapabilityMap = new Map();
  const byChannelMap = new Map();
  for (const contract of contracts || []) {
    if (
      byCapabilityMap.has(contract.capability) ||
      byChannelMap.has(contract.channel)
    )
      throw contractError("IPC_CONTRACT_DUPLICATE");
    byCapabilityMap.set(contract.capability, contract);
    byChannelMap.set(contract.channel, contract);
  }
  return Object.freeze({
    byCapability(capability) {
      return byCapabilityMap.get(capability) || null;
    },
    byChannel(channel) {
      return byChannelMap.get(channel) || null;
    },
    list() {
      return Object.freeze([...byCapabilityMap.values()]);
    },
    encodeRequest(contract, payload) {
      return {
        schemaVersion: SCHEMA_VERSION,
        payload: validateObject(
          contract.request,
          payload,
          "IPC_REQUEST_INVALID",
        ),
      };
    },
    parseRequest(contract, input) {
      const parsed = envelope(
        input,
        ["schemaVersion", "payload"],
        "IPC_REQUEST_INVALID",
      );
      return validateObject(
        contract.request,
        parsed.payload,
        "IPC_REQUEST_INVALID",
      );
    },
    success(contract, data) {
      return {
        schemaVersion: SCHEMA_VERSION,
        ok: true,
        data: validateValue(contract.success, data, "IPC_RESULT_INVALID"),
      };
    },
    parseSuccess(contract, input) {
      const parsed = envelope(
        input,
        ["schemaVersion", "ok", "data"],
        "IPC_RESULT_INVALID",
      );
      if (parsed.ok !== true) throw contractError("IPC_RESULT_INVALID");
      return validateValue(contract.success, parsed.data, "IPC_RESULT_INVALID");
    },
    failure(contract, error) {
      let safe = null;
      let errorCode = null;
      let diagnosticId = null;
      try {
        if (error && !(error instanceof Error)) {
          const plainError = copyPlainDataObject(error, "IPC_RESULT_INVALID");
          errorCode =
            typeof plainError.code === "string" ? plainError.code : null;
          diagnosticId = safeDiagnosticId(plainError.diagnosticId);
          const parsed = parseSafeOperationalError(plainError);
          if (contract.errorCodes.includes(parsed.code)) {
            safe = Object.freeze({
              code: parsed.code,
              ...contract.errors[parsed.code],
              ...(parsed.diagnosticId
                ? { diagnosticId: parsed.diagnosticId }
                : {}),
            });
          }
        } else if (error instanceof Error) {
          const descriptor = Object.getOwnPropertyDescriptor(error, "code");
          if (
            descriptor &&
            "value" in descriptor &&
            typeof descriptor.value === "string"
          )
            errorCode = descriptor.value;
          diagnosticId = safeDiagnosticId(error.diagnosticId);
        }
      } catch (_) {}
      if (
        !safe &&
        errorCode &&
        Object.prototype.hasOwnProperty.call(contract.errors, errorCode)
      ) {
        safe = Object.freeze({
          code: errorCode,
          ...contract.errors[errorCode],
          ...(diagnosticId ? { diagnosticId } : {}),
        });
      }
      return {
        schemaVersion: SCHEMA_VERSION,
        ok: false,
        error: safe || INTERNAL_SAFE_ERROR,
      };
    },
    parseResult(contract, input) {
      const base = envelope(
        input,
        ["schemaVersion", "ok", "data", "error"],
        "IPC_RESULT_INVALID",
      );
      if (base.ok === true) return this.parseSuccess(contract, input);
      const parsed = envelope(
        input,
        ["schemaVersion", "ok", "error"],
        "IPC_RESULT_INVALID",
      );
      if (parsed.ok !== false) throw contractError("IPC_RESULT_INVALID");
      let safe;
      try {
        safe = parseSafeOperationalError(
          copyPlainDataObject(parsed.error, "IPC_RESULT_INVALID"),
        );
      } catch (_) {
        throw contractError("IPC_RESULT_INVALID");
      }
      if (!contract.errorCodes.includes(safe.code))
        throw contractError("IPC_RESULT_INVALID");
      return Object.freeze({ code: safe.code, ...contract.errors[safe.code] });
    },
    parseEvent(contract, input) {
      if (contract.kind !== "event") throw contractError("IPC_EVENT_INVALID");
      if (contract.validateEvent) {
        try {
          const payload = envelope(
            input,
            ["schemaVersion", ...contract.eventFields],
            "IPC_EVENT_INVALID",
          );
          delete payload.schemaVersion;
          return contract.validateEvent(payload);
        } catch (_) {
          throw contractError("IPC_EVENT_INVALID");
        }
      }
      const payload = envelope(
        input,
        ["schemaVersion", ...Object.keys(contract.event.fields)],
        "IPC_EVENT_INVALID",
      );
      delete payload.schemaVersion;
      try {
        return validateObject(contract.event, payload, "IPC_EVENT_INVALID");
      } catch (error) {
        if (error && error.code === "IPC_UNKNOWN_FIELD")
          throw contractError("IPC_EVENT_INVALID");
        throw error;
      }
    },
    event(contract, payload) {
      if (!contract || contract.kind !== "event")
        throw contractError("IPC_EVENT_INVALID");
      const parsed = contract.validateEvent
        ? contract.validateEvent(payload)
        : validateObject(contract.event, payload, "IPC_EVENT_INVALID");
      return { schemaVersion: SCHEMA_VERSION, ...parsed };
    },
  });
}

module.exports = {
  SCHEMA_VERSION,
  createContractRegistry,
  defineContract,
  exactObject,
  stringField,
  multilineStringField,
  integerField,
  optionalField,
  nullableField,
  literalField,
  enumField,
  numberField,
  arrayField,
  oneOf,
  customField,
};
