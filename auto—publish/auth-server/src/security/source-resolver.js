const crypto = require("node:crypto");
const net = require("node:net");

class SourceResolver {
  constructor(configuration) {
    if (!configuration || !configuration.diagnostic) throw new TypeError("SourceResolver requires proxy configuration");
    this.configuration = configuration;
    this.trustedRanges = configuration.enabled ? configuration.rules.trustedProxyCidrs.map(parseCidr) : [];
  }

  resolve(request) {
    const directAddress = request && request.socket ? request.socket.remoteAddress : null;
    const directIp = parseIp(directAddress);
    const directFingerprint = fingerprint(directIp ? directIp.bytes : null);
    if (!this.configuration.enabled) return this.directResult(directFingerprint, true);
    if (!directIp || !this.trustedRanges.some((range) => contains(range, directIp))) return this.directResult(directFingerprint, true);

    const raw = readHeader(request && request.headers, this.configuration.rules.header);
    const candidates = parseSourceHeader(this.configuration.rules.header, raw);
    const source = selectTrustedSource(candidates, this.configuration.rules.trustedHops, this.trustedRanges);
    if (!source) return this.directResult(directFingerprint, true);
    return {
      sourceFingerprint: fingerprint(source.bytes),
      sourceConfidence: "trusted-forwarded",
      forwardedIgnored: false,
      proxyConfigStatus: this.configuration.diagnostic.status,
    };
  }

  directResult(sourceFingerprint, forwardedIgnored) {
    return {
      sourceFingerprint,
      sourceConfidence: "direct",
      forwardedIgnored,
      proxyConfigStatus: this.configuration.diagnostic.status,
    };
  }
}

function readHeader(headers, name) {
  if (!headers || typeof headers !== "object") return "";
  let value = headers[name];
  if (value === undefined) {
    const key = Object.keys(headers).find((candidate) => candidate.toLowerCase() === name);
    value = key ? headers[key] : undefined;
  }
  return typeof value === "string" ? value.slice(0, 4096) : "";
}

function parseSourceHeader(header, raw) {
  if (!raw) return [];
  if (header === "cf-connecting-ip") return toCandidateList([raw]);
  if (header === "x-forwarded-for") return toCandidateList(raw.split(","));
  return toCandidateList(raw.split(",").map((item) => {
    const match = /(?:^|;)\s*for\s*=\s*(?:"([^"]*)"|([^;\s,]*))/i.exec(item);
    return match ? (match[1] || match[2]) : "";
  }));
}

function toCandidateList(values) {
  return values.map((value) => parseIp(cleanForwardedValue(value)));
}

function cleanForwardedValue(value) {
  let result = String(value || "").trim();
  if (result.startsWith("[") && result.includes("]")) result = result.slice(1, result.indexOf("]"));
  else if (/^[^:]+:\d+$/.test(result)) result = result.replace(/:\d+$/, "");
  return result.replace(/^"|"$/g, "");
}

function selectTrustedSource(candidates, trustedHops, trustedRanges) {
  if (candidates.length < trustedHops || candidates.some((candidate) => !candidate)) return null;
  const sourceIndex = candidates.length - trustedHops;
  for (let index = candidates.length - 1; index > sourceIndex; index -= 1) {
    if (!trustedRanges.some((range) => contains(range, candidates[index]))) return null;
  }
  return candidates[sourceIndex] || null;
}

function fingerprint(bytes) {
  const value = bytes ? Buffer.concat([Buffer.from([bytes.length]), bytes]) : Buffer.from("unknown");
  return crypto.createHash("sha256").update("autopublish-source\0").update(value).digest("hex").slice(0, 32);
}

function validateProxyCidr(value) {
  try { parseCidr(value); return true; } catch (_) { return false; }
}

function parseCidr(value) {
  if (typeof value !== "string") throw new TypeError("CIDR must be a string");
  const parts = value.trim().split("/");
  if (parts.length !== 2) throw new TypeError("CIDR must include a prefix");
  const ip = parseIp(parts[0]);
  const prefix = Number(parts[1]);
  const max = ip && ip.family === 4 ? 32 : 128;
  if (!ip || !Number.isSafeInteger(prefix) || prefix < 0 || prefix > max) throw new TypeError("invalid CIDR");
  return { family: ip.family, bytes: ip.bytes, prefix };
}

function parseIp(value) {
  if (typeof value !== "string") return null;
  let input = value.trim().replace(/^"|"$/g, "");
  if (!input || input.includes("%")) return null;
  if (input.startsWith("[") && input.endsWith("]")) input = input.slice(1, -1);
  const family = net.isIP(input);
  if (family === 4) return { family, bytes: Buffer.from(input.split(".").map(Number)) };
  if (family !== 6) return null;
  const bytes = ipv6Bytes(input);
  if (!bytes) return null;
  if (bytes.slice(0, 10).every((byte) => byte === 0) && bytes[10] === 255 && bytes[11] === 255) return { family: 4, bytes: bytes.slice(12) };
  return { family, bytes };
}

function ipv6Bytes(value) {
  const pieces = value.split("::");
  if (pieces.length > 2) return null;
  const left = pieces[0] ? pieces[0].split(":") : [];
  const right = pieces.length === 2 && pieces[1] ? pieces[1].split(":") : [];
  const last = right.length ? right[right.length - 1] : left[left.length - 1];
  if (last && last.includes(".")) {
    const ipv4 = last.split(".").map(Number);
    if (ipv4.length !== 4 || ipv4.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return null;
    const replacement = [((ipv4[0] << 8) | ipv4[1]).toString(16), ((ipv4[2] << 8) | ipv4[3]).toString(16)];
    if (right.length) right.splice(right.length - 1, 1, ...replacement);
    else left.splice(left.length - 1, 1, ...replacement);
  }
  const expanded = [];
  for (const piece of left) expanded.push(piece);
  const missing = 8 - left.length - right.length;
  if (pieces.length === 1 && missing !== 0) return null;
  if (pieces.length === 2 && missing < 1) return null;
  for (let index = 0; index < missing; index += 1) expanded.push("0");
  for (const piece of right) expanded.push(piece);
  if (expanded.length !== 8 || expanded.some((piece) => !/^[0-9a-f]{1,4}$/i.test(piece))) return null;
  const bytes = Buffer.alloc(16);
  expanded.forEach((piece, index) => bytes.writeUInt16BE(parseInt(piece, 16), index * 2));
  return bytes;
}

function contains(range, ip) {
  if (range.family !== ip.family) return false;
  const fullBytes = Math.floor(range.prefix / 8);
  const remainingBits = range.prefix % 8;
  for (let index = 0; index < fullBytes; index += 1) if (range.bytes[index] !== ip.bytes[index]) return false;
  if (remainingBits === 0) return true;
  const mask = 0xff << (8 - remainingBits) & 0xff;
  return (range.bytes[fullBytes] & mask) === (ip.bytes[fullBytes] & mask);
}

module.exports = { SourceResolver, parseIp, parseCidr, validateProxyCidr };
