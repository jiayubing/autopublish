"use strict";

const cheerio = require("cheerio");

const CITY_DIRECTORY_URL = "https://www.lieju.com/city.php?post=239";
const DEFAULT_CITY = "北京";
const CITY_TARGET_PATH = /^\/(\d{1,20})\/239$/;
const FORM_ACTION = "postnew";
const SUPPORTED_CHARSETS = new Map([
  ["utf-8", "utf-8"],
  ["utf8", "utf-8"],
  ["gbk", "gbk"],
  ["cp936", "gbk"],
  ["ms936", "gbk"],
  ["windows-936", "gbk"],
  ["gb2312", "gb2312"],
  ["gb_2312-80", "gb2312"],
  ["gb18030", "gb18030"],
]);
const EXCLUDED_INPUT_TYPES = new Set(["button", "image", "reset", "submit"]);
const PAID_PROMOTION_IDENTIFIER_PATTERN =
  /(?:^|[_\[-])(?:paid|pay|promot(?:ion)?|advert(?:isement)?|tuiguang|istop|is_top|topday|top_days|recommend|isrecommend|is_recommend)(?:$|[_\]-])/i;
const PAID_PROMOTION_LABEL_PATTERN =
  /(?:付费(?:推广|广告|置顶|推荐)?|(?:推广|广告|置顶)(?:服务|套餐|天数|版位|设置)?)/;

function parserError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function forbidSerialization() {
  throw parserError("LIEJU_HTTP_FORM_SERIALIZATION_FORBIDDEN");
}

function frozenArray(values) {
  return Object.freeze(values.map((value) => Object.freeze(value)));
}

function bytesFrom(value) {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array)
    return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  if (value instanceof ArrayBuffer) return Buffer.from(value);
  throw parserError("LIEJU_HTML_BYTES_INVALID");
}

function headerValue(response) {
  if (typeof response.contentType === "string") return response.contentType;
  const headers = response.headers;
  if (!headers || typeof headers !== "object") return "";
  if (typeof headers.get === "function") {
    const value = headers.get("content-type");
    return typeof value === "string" ? value : "";
  }
  for (const [name, value] of Object.entries(headers)) {
    if (name.toLowerCase() === "content-type" && typeof value === "string")
      return value;
  }
  return "";
}

function declaredCharset(value) {
  const normalized = String(value || "")
    .trim()
    .replace(/^['"]|['"]$/g, "")
    .toLowerCase();
  return SUPPORTED_CHARSETS.get(normalized) || null;
}

function charsetDeclarations(value) {
  const values = [];
  const pattern =
    /(?:^|[;,])\s*charset\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s;,>]+))/gi;
  for (const match of String(value || "").matchAll(pattern)) {
    const charset = declaredCharset(match[1] || match[2] || match[3]);
    if (!charset) throw parserError("LIEJU_HTML_CHARSET_UNSUPPORTED");
    values.push(charset);
  }
  return values;
}

function metaAttributeValue(tag, name) {
  const pattern = new RegExp(
    `(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`,
    "i",
  );
  const match = tag.match(pattern);
  return match ? match[1] || match[2] || match[3] : null;
}

function metaCharsetDeclarations(bytes) {
  const source = bytes.toString("latin1");
  const values = [];
  const tags = source.match(/<meta\b[^>]*>/gi) || [];
  for (const tag of tags) {
    const direct = metaAttributeValue(tag, "charset");
    if (direct !== null) {
      const charset = declaredCharset(direct);
      if (!charset) throw parserError("LIEJU_HTML_CHARSET_UNSUPPORTED");
      values.push(charset);
    }
    const content = metaAttributeValue(tag, "content");
    if (content !== null) values.push(...charsetDeclarations(content));
  }
  return values;
}

function resolveCharset(response, bytes) {
  const declarations = [
    ...charsetDeclarations(headerValue(response)),
    ...metaCharsetDeclarations(bytes),
  ];
  if (!declarations.length) throw parserError("LIEJU_HTML_CHARSET_UNKNOWN");
  if (new Set(declarations).size !== 1)
    throw parserError("LIEJU_HTML_CHARSET_CONFLICT");
  return declarations[0];
}

function decodeLiejuHttpHtml(response) {
  const value = response && typeof response === "object" ? response : {};
  const bytes = bytesFrom(value.body);
  const charset = resolveCharset(value, bytes);
  let html;
  try {
    html = new TextDecoder(charset, { fatal: true }).decode(bytes);
  } catch (_) {
    throw parserError("LIEJU_HTML_DECODE_FAILED");
  }
  return Object.freeze({
    charset,
    html,
    toSafeMetadata: () => Object.freeze({ charset, htmlLength: html.length }),
    toJSON: forbidSerialization,
  });
}

function normalizedText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizedFormCharset(value) {
  if (value === undefined) return "utf-8";
  const charset = declaredCharset(value);
  if (!charset) throw parserError("LIEJU_FORM_CHARSET_INVALID");
  return charset;
}

function cityTargetFromUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch (_) {
    return null;
  }
  const match = url.pathname.match(CITY_TARGET_PATH);
  if (
    url.protocol !== "https:" ||
    url.hostname.toLowerCase() !== "post.lieju.com" ||
    url.port ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !match
  )
    return null;
  return Object.freeze({ cityId: match[1], url: url.toString() });
}

function cityTargetFromHref(href) {
  try {
    return cityTargetFromUrl(new URL(href, CITY_DIRECTORY_URL).toString());
  } catch (_) {
    return null;
  }
}

function resolveLiejuCityTarget(html, customerCity) {
  if (typeof html !== "string")
    throw parserError("LIEJU_CITY_DIRECTORY_INVALID");
  const requestedCity = normalizedText(customerCity) || DEFAULT_CITY;
  const $ = cheerio.load(html);
  const links = $("a[href]").toArray();

  function select(city, selection) {
    for (const link of links) {
      if (!normalizedText($(link).text()).includes(city)) continue;
      const target = cityTargetFromHref($(link).attr("href"));
      if (!target) throw parserError("LIEJU_CITY_TARGET_INVALID");
      return Object.freeze({ ...target, selection });
    }
    return null;
  }

  const matched = select(requestedCity, "matched");
  if (matched) return matched;
  const fallback = select(DEFAULT_CITY, "beijing_fallback");
  if (fallback) return fallback;
  throw parserError("LIEJU_CITY_TARGET_UNAVAILABLE");
}

function normalizedCityTarget(value) {
  const target = cityTargetFromUrl(value && value.url);
  if (!target || !value || String(value.cityId) !== target.cityId)
    throw parserError("LIEJU_CITY_TARGET_INVALID");
  return target;
}

function validatedFormAction(rawAction, cityTarget) {
  if (typeof rawAction !== "string" || rawAction.trim() === "") return null;
  let url;
  try {
    url = new URL(rawAction, cityTarget.url);
  } catch (_) {
    return null;
  }
  const path = url.pathname.match(CITY_TARGET_PATH);
  if (
    url.protocol !== "https:" ||
    url.hostname.toLowerCase() !== "post.lieju.com" ||
    url.port ||
    url.username ||
    url.password ||
    url.hash ||
    !path ||
    path[1] !== cityTarget.cityId ||
    url.searchParams.size !== 1 ||
    url.searchParams.getAll("action").length !== 1 ||
    url.searchParams.get("action") !== FORM_ACTION
  )
    return null;
  return url.toString();
}

function isFirstLegendDescendant(control, fieldset) {
  const firstLegend = (fieldset.children || []).find(
    (child) => child.type === "tag" && child.name === "legend",
  );
  if (!firstLegend) return false;
  for (let current = control; current; current = current.parent) {
    if (current === firstLegend) return true;
    if (current === fieldset) return false;
  }
  return false;
}

function isDisabled($, control) {
  if ($(control).attr("disabled") !== undefined) return true;
  for (let current = control.parent; current; current = current.parent) {
    if (
      current.type === "tag" &&
      current.name === "fieldset" &&
      $(current).attr("disabled") !== undefined &&
      !isFirstLegendDescendant(control, current)
    )
      return true;
  }
  return false;
}

function optionIsDisabled($, option) {
  if ($(option).attr("disabled") !== undefined) return true;
  return $(option).parents("optgroup[disabled]").length > 0;
}

function associatedLabelText($, control) {
  const id = $(control).attr("id");
  const ownLabel = $(control).closest("label").text();
  if (!id) return ownLabel;
  const matchingLabel = $("label").filter(function () {
    return $(this).attr("for") === id;
  });
  return `${ownLabel} ${matchingLabel.text()}`;
}

function isPaidPromotionControl($, control) {
  const element = $(control);
  const name = element.attr("name") || "";
  if (/top_photo\]?$/i.test(name)) return false;
  const attributes = [
    name,
    element.attr("id"),
    element.attr("class"),
    element.attr("data-role"),
  ].join(" ");
  return (
    PAID_PROMOTION_IDENTIFIER_PATTERN.test(attributes) ||
    PAID_PROMOTION_LABEL_PATTERN.test(associatedLabelText($, control))
  );
}

function addControl(controls, name, type, value) {
  controls.push({ name, type, value: value == null ? "" : String(value) });
}

function optionValue($, option) {
  const value = $(option).attr("value");
  return value === undefined ? normalizedText($(option).text()) : value;
}

function selectedOptions($, control) {
  const options = $(control).find("option").toArray();
  const selected = options.filter(
    (option) => $(option).attr("selected") !== undefined,
  );
  if ($(control).attr("multiple") !== undefined) return selected;
  if (selected.length) return [selected[0]];
  const defaultOption = options.find((option) => !optionIsDisabled($, option));
  return defaultOption ? [defaultOption] : [];
}

function successfulControls($, form) {
  const controls = [];
  $(form)
    .find("input, select, textarea")
    .each(function () {
      const element = $(this);
      const name = element.attr("name");
      if (!name || isDisabled($, this) || isPaidPromotionControl($, this))
        return;

      if (this.name === "input") {
        const type = (element.attr("type") || "text").toLowerCase();
        if (EXCLUDED_INPUT_TYPES.has(type)) return;
        if (
          (type === "checkbox" || type === "radio") &&
          element.attr("checked") === undefined
        )
          return;
        addControl(
          controls,
          name,
          type,
          type === "checkbox" || type === "radio"
            ? element.attr("value") || "on"
            : element.attr("value"),
        );
        return;
      }

      if (this.name === "textarea") {
        addControl(controls, name, "textarea", element.text());
        return;
      }

      const options = selectedOptions($, this);
      for (const option of options) {
        if (!optionIsDisabled($, option))
          addControl(controls, name, "select", optionValue($, option));
      }
    });
  return frozenArray(controls);
}

function lastNonEmptyZoneId($, form) {
  const zone = $(form)
    .find("select[name='postdb[zone_id]']")
    .filter(function () {
      return !isDisabled($, this) && !isPaidPromotionControl($, this);
    })
    .first();
  if (!zone.length) return null;
  const values = zone
    .find("option")
    .toArray()
    .filter((option) => !optionIsDisabled($, option))
    .map((option) => normalizedText(optionValue($, option)))
    .filter(Boolean);
  return values.length ? values.at(-1) : null;
}

function safeFormMetadata(result) {
  return Object.freeze({
    method: result.method,
    enctype: result.enctype,
    action: result.action,
    controlCount: result.controls.length,
    fileControlNames: Object.freeze(
      result.controls
        .filter((control) => control.type === "file")
        .map((control) => control.name),
    ),
    hasZoneId: result.zoneId !== null,
  });
}

function parseLiejuPublicationForm(html, cityTarget, options) {
  if (typeof html !== "string")
    throw parserError("LIEJU_PUBLICATION_FORM_INVALID");
  const charset = normalizedFormCharset(options && options.charset);
  const target = normalizedCityTarget(cityTarget);
  const $ = cheerio.load(html);
  let parsed = null;
  $("form").each(function () {
    if (parsed) return;
    const form = $(this);
    const action = validatedFormAction(form.attr("action"), target);
    const method = (form.attr("method") || "get").trim().toUpperCase();
    const enctype = (
      form.attr("enctype") || "application/x-www-form-urlencoded"
    )
      .trim()
      .toLowerCase();
    if (!action || method !== "POST" || enctype !== "multipart/form-data")
      return;
    parsed = { form: this, action, method, enctype };
  });
  if (!parsed) throw parserError("LIEJU_PUBLICATION_FORM_INVALID");

  const result = {
    method: parsed.method,
    enctype: parsed.enctype,
    action: parsed.action,
    charset,
    controls: successfulControls($, parsed.form),
    zoneId: lastNonEmptyZoneId($, parsed.form),
  };
  return Object.freeze({
    ...result,
    toSafeMetadata: () => safeFormMetadata(result),
    toJSON: forbidSerialization,
  });
}

module.exports = {
  CITY_DIRECTORY_URL,
  decodeLiejuHttpHtml,
  parseLiejuPublicationForm,
  resolveLiejuCityTarget,
};
