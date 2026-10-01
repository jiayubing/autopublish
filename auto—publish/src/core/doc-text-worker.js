"use strict";

const { parentPort, workerData } = require("node:worker_threads");
const WordExtractor = require("word-extractor");
const OleCompoundDoc = require("word-extractor/lib/ole-compound-doc");
const BufferReader = require("word-extractor/lib/buffer-reader");

async function wordHeader(buffer) {
  const reader = new BufferReader(buffer);
  await reader.open();
  const compound = new OleCompoundDoc(reader);
  await compound.read();
  const stream = compound.stream("WordDocument");
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    stream.on("data", (chunk) => {
      size += chunk.length;
      if (size > 8 * 1024 * 1024) stream.destroy();
      else chunks.push(chunk);
    });
    stream.on("error", reject);
    stream.on("end", () => resolve(Buffer.concat(chunks)));
  });
}

async function extract(buffer) {
  if (
    buffer.length < 512 ||
    buffer.length > 8 * 1024 * 1024 ||
    !buffer.subarray(0, 8).equals(Buffer.from("d0cf11e0a1b11ae1", "hex"))
  )
    return { code: "MATERIAL_DOC_INVALID" };
  let header;
  try {
    header = await wordHeader(buffer);
  } catch {
    return { code: "MATERIAL_DOC_INVALID" };
  }
  if (header.length < 12 || header.readUInt16LE(0) !== 0xa5ec)
    return { code: "MATERIAL_DOC_INVALID" };
  if ((header.readUInt16LE(0x0a) & 0x0100) !== 0)
    return { code: "MATERIAL_DOC_ENCRYPTED" };
  let body;
  try {
    body = (await new WordExtractor().extract(buffer)).getBody();
  } catch {
    return { code: "MATERIAL_DOC_INVALID" };
  }
  if (typeof body !== "string" || !body.trim())
    return { code: "MATERIAL_DOC_EMPTY" };
  if (body.length > 200000) return { code: "MATERIAL_DOC_TOO_LARGE" };
  return { content: body.replace(/\r\n?/gu, "\n") };
}

extract(Buffer.from(workerData)).then(
  (result) => parentPort.postMessage(result),
  () => parentPort.postMessage({ code: "MATERIAL_DOC_INVALID" }),
);
