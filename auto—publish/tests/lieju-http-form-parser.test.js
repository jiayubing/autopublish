"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const parser = require("../src/platforms/lieju/http-form-parser");

function htmlResponse(html, contentType) {
  return {
    body: Buffer.from(html, "utf8"),
    contentType: contentType || "text/html; charset=utf-8",
  };
}

function gbkResponse(prefix, chineseBytes, suffix, contentType) {
  return {
    body: Buffer.concat([
      Buffer.from(prefix, "ascii"),
      Buffer.from(chineseBytes),
      Buffer.from(suffix, "ascii"),
    ]),
    contentType: contentType || "text/html; charset=gbk",
  };
}

function cityDirectory(links) {
  return `<html><head><meta charset="utf-8"></head><body>${links.join("")}</body></html>`;
}

function cityTarget() {
  return Object.freeze({
    cityId: "116",
    url: "https://post.lieju.com/116/239",
  });
}

function publicationForm(body, action) {
  return `
    <html><head><meta charset="utf-8"></head><body>
      <form method="post" enctype="multipart/form-data" action="${
        action || "/116/239?action=postnew"
      }">
        ${body || ""}
      </form>
    </body></html>`;
}

function controlNames(result) {
  return result.controls.map((control) => control.name);
}

test("Lieju HTTP parser decodes declared GBK and UTF-8 responses exactly", () => {
  const gbk = parser.decodeLiejuHttpHtml(
    gbkResponse('<meta charset="gbk"><a>', [0xB1, 0xB1, 0xBE, 0xA9], "</a>"),
  );
  const utf8 = parser.decodeLiejuHttpHtml(
    htmlResponse('<meta charset="utf-8"><a>上海</a>'),
  );

  assert.equal(gbk.charset, "gbk");
  assert.equal(gbk.html, '<meta charset="gbk"><a>北京</a>');
  assert.equal(utf8.charset, "utf-8");
  assert.equal(utf8.html, '<meta charset="utf-8"><a>上海</a>');
  assert.equal(Object.isFrozen(gbk), true);
});

test("Lieju HTTP parser supports the declared GB2312 and GB18030 variants", () => {
  const gb2312 = parser.decodeLiejuHttpHtml(
    gbkResponse(
      '<meta charset="gb2312"><a>',
      [0xB1, 0xB1, 0xBE, 0xA9],
      "</a>",
      "text/html; charset=gb2312",
    ),
  );
  const gb18030 = parser.decodeLiejuHttpHtml(
    gbkResponse(
      '<meta charset="gb18030"><a>',
      [0xB1, 0xB1, 0xBE, 0xA9],
      "</a>",
      "text/html; charset=gb18030",
    ),
  );

  assert.equal(gb2312.charset, "gb2312");
  assert.equal(gb2312.html, '<meta charset="gb2312"><a>北京</a>');
  assert.equal(gb18030.charset, "gb18030");
  assert.equal(gb18030.html, '<meta charset="gb18030"><a>北京</a>');
});

test("Lieju HTTP parser fails closed for charset conflict, unknown charset, and malformed bytes", () => {
  assert.throws(
    () =>
      parser.decodeLiejuHttpHtml({
        body: Buffer.from('<meta charset="gbk">\u4e0a\u6d77', "utf8"),
        contentType: "text/html; charset=utf-8",
      }),
    { code: "LIEJU_HTML_CHARSET_CONFLICT" },
  );
  assert.throws(
    () =>
      parser.decodeLiejuHttpHtml({
        body: Buffer.from('<meta charset="big5">', "ascii"),
        contentType: "text/html; charset=big5",
      }),
    { code: "LIEJU_HTML_CHARSET_UNSUPPORTED" },
  );
  assert.throws(
    () =>
      parser.decodeLiejuHttpHtml({
        body: Buffer.from([0xc3, 0x28]),
        contentType: "text/html; charset=utf-8",
      }),
    { code: "LIEJU_HTML_DECODE_FAILED" },
  );
  assert.throws(
    () => parser.decodeLiejuHttpHtml({ body: Buffer.from("<html>") }),
    { code: "LIEJU_HTML_CHARSET_UNKNOWN" },
  );
});

test("Lieju HTTP parser treats HTTP header names case-insensitively and ignores non-charset meta data", () => {
  const decoded = parser.decodeLiejuHttpHtml({
    body: Buffer.from(
      '<meta data-charset="gbk"><meta charset="utf-8"><a>上海</a>',
      "utf8",
    ),
    headers: { "CONTENT-TYPE": "text/html; charset=utf-8" },
  });

  assert.equal(decoded.charset, "utf-8");
  assert.equal(
    decoded.html,
    '<meta data-charset="gbk"><meta charset="utf-8"><a>上海</a>',
  );
});

test("Lieju city resolution uses the first DOM-order fuzzy match and falls back to Beijing", () => {
  const direct = parser.resolveLiejuCityTarget(
    cityDirectory([
      '<a href="https://post.lieju.com/116/239">焦作市</a>',
      '<a href="https://post.lieju.com/117/239">焦作新区</a>',
    ]),
    "焦作",
  );
  const fallback = parser.resolveLiejuCityTarget(
    cityDirectory([
      '<a href="https://post.lieju.com/117/239">上海</a>',
      '<a href="https://post.lieju.com/1/239">北京</a>',
    ]),
    "不存在的城市",
  );

  assert.deepEqual(direct, {
    cityId: "116",
    url: "https://post.lieju.com/116/239",
    selection: "matched",
  });
  assert.deepEqual(fallback, {
    cityId: "1",
    url: "https://post.lieju.com/1/239",
    selection: "beijing_fallback",
  });
  assert.equal(Object.isFrozen(direct), true);
});

test("Lieju city resolution rejects unsafe selected city targets", () => {
  assert.throws(
    () =>
      parser.resolveLiejuCityTarget(
        cityDirectory(['<a href="https://attacker.invalid/116/239">焦作</a>']),
        "焦作",
      ),
    { code: "LIEJU_CITY_TARGET_INVALID" },
  );
  assert.throws(
    () =>
      parser.resolveLiejuCityTarget(
        cityDirectory(['<a href="https://post.lieju.com/116/239/extra">北京</a>']),
        "无匹配",
      ),
    { code: "LIEJU_CITY_TARGET_INVALID" },
  );
});

test("Lieju form parser returns real successful controls, opaque hidden values, and last available zone", () => {
  const result = parser.parseLiejuPublicationForm(
    publicationForm(`
      <input type="hidden" name="fid" value="opaque-server-value">
      <input type="hidden" name="top_photo" value="opaque-photo-state">
      <input name="postdb[title]" value="">
      <input type="checkbox" name="postdb[featured]" value="1" checked>
      <input type="checkbox" name="postdb[ordinary]" value="1">
      <input type="radio" name="postdb[kind]" value="one">
      <input type="radio" name="postdb[kind]" value="two" checked>
      <input disabled name="postdb[disabled]" value="nope">
      <input type="checkbox" name="postdb[istop]" value="1" checked>
      <input name="postdb[tags][]" value="first">
      <input name="postdb[tags][]" value="second">
      <select name="postdb[zone_id]" id="atc_zone_id">
        <option value="">请选择</option>
        <option value="7">城区</option>
        <option value="1019">其他</option>
      </select>
      <textarea name="postdb[content]">正文</textarea>
      <input type="file" name="local_file1">
      <script>var template = '<input name="local_file' + totalnum + '">';</script>
    `),
    cityTarget(),
  );

  assert.deepEqual(controlNames(result), [
    "fid",
    "top_photo",
    "postdb[title]",
    "postdb[featured]",
    "postdb[kind]",
    "postdb[tags][]",
    "postdb[tags][]",
    "postdb[zone_id]",
    "postdb[content]",
    "local_file1",
  ]);
  assert.deepEqual(result.controls[0], {
    name: "fid",
    type: "hidden",
    value: "opaque-server-value",
  });
  assert.deepEqual(result.controls.at(-1), {
    name: "local_file1",
    type: "file",
    value: "",
  });
  assert.equal(result.zoneId, "1019");
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.controls), true);
  assert.equal(Object.isFrozen(result.controls[0]), true);
  assert.deepEqual(result.toSafeMetadata(), {
    method: "POST",
    enctype: "multipart/form-data",
    action: "https://post.lieju.com/116/239?action=postnew",
    controlCount: 10,
    fileControlNames: ["local_file1"],
    hasZoneId: true,
  });
  assert.throws(() => JSON.stringify(result), {
    code: "LIEJU_HTTP_FORM_SERIALIZATION_FORBIDDEN",
  });
});

test("Lieju form parser preserves no fake zone when every option is empty and rejects unsafe actions", () => {
  const noZone = parser.parseLiejuPublicationForm(
    publicationForm(`
      <select name="postdb[zone_id]"><option value="">请选择</option></select>
    `),
    cityTarget(),
  );
  assert.equal(noZone.zoneId, null);

  assert.throws(
    () =>
      parser.parseLiejuPublicationForm(
        publicationForm("", "https://attacker.invalid/116/239?action=postnew"),
        cityTarget(),
      ),
    { code: "LIEJU_PUBLICATION_FORM_INVALID" },
  );
});

test("Lieju form parser preserves browser option values and excludes only actual paid promotion controls", () => {
  const result = parser.parseLiejuPublicationForm(
    publicationForm(`
      <select name="postdb[region]"><option selected>城区</option></select>
      <label for="referrer">推荐人</label>
      <input id="referrer" name="postdb[referrer]" value="李四">
      <input name="postdb[isrecommend]" value="1">
      <label for="paid">付费推广</label>
      <input id="paid" name="postdb[premium]" value="1">
    `),
    cityTarget(),
  );

  assert.deepEqual(result.controls, [
    { name: "postdb[region]", type: "select", value: "城区" },
    { name: "postdb[referrer]", type: "text", value: "李四" },
  ]);
});

test("Cheerio is an explicit production dependency and Lieju adapter exposes only the pure parser seam", () => {
  const packageJson = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, "..", "package.json"), "utf8"),
  );
  const adapter = require("../src/platforms/lieju/adapter");

  assert.equal(packageJson.dependencies.cheerio, "1.1.2");
  assert.doesNotThrow(() => require.resolve("cheerio"));
  assert.equal(adapter.httpFormParser, parser);
});
