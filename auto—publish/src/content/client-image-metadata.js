const path = require("node:path");

const SUPPORTED_IMAGE_EXTENSIONS = Object.freeze([
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
]);
const MIME_TYPES = Object.freeze({
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
});

function metadataError(code, message) {
  const error = new Error(message || code);
  error.code = code;
  return error;
}

function supportedImageExtension(filename) {
  const extension = path.extname(filename).toLowerCase();
  return SUPPORTED_IMAGE_EXTENSIONS.includes(extension) ? extension : null;
}

function jpegMetadata(buffer) {
  if (
    buffer.length < 4 ||
    buffer[0] !== 0xff ||
    buffer[1] !== 0xd8 ||
    buffer.lastIndexOf(Buffer.from([0xff, 0xd9])) === -1
  ) {
    throw metadataError("IMAGE_FORMAT_INVALID", "JPEG content is invalid");
  }

  let offset = 2;
  while (offset + 1 < buffer.length) {
    if (buffer[offset] !== 0xff)
      throw metadataError("IMAGE_FORMAT_INVALID", "JPEG marker is invalid");
    while (offset < buffer.length && buffer[offset] === 0xff) offset += 1;
    if (offset >= buffer.length) break;
    const marker = buffer[offset];
    offset += 1;
    if (marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > buffer.length)
      throw metadataError("IMAGE_FORMAT_INVALID", "JPEG segment is truncated");
    const length = buffer.readUInt16BE(offset);
    if (length < 2 || offset + length > buffer.length)
      throw metadataError("IMAGE_FORMAT_INVALID", "JPEG segment is invalid");
    if (isJpegFrameMarker(marker)) {
      if (offset + 7 > buffer.length)
        throw metadataError(
          "IMAGE_FORMAT_INVALID",
          "JPEG dimensions are missing",
        );
      const height = buffer.readUInt16BE(offset + 3);
      const width = buffer.readUInt16BE(offset + 5);
      if (!width || !height)
        throw metadataError(
          "IMAGE_FORMAT_INVALID",
          "JPEG dimensions are invalid",
        );
      return {
        format: "jpeg",
        mimeType: MIME_TYPES.jpeg,
        width: width,
        height: height,
      };
    }
    offset += length;
  }
  throw metadataError("IMAGE_FORMAT_INVALID", "JPEG dimensions are missing");
}

function isJpegFrameMarker(marker) {
  return (
    (marker >= 0xc0 && marker <= 0xc3) ||
    (marker >= 0xc5 && marker <= 0xc7) ||
    (marker >= 0xc9 && marker <= 0xcb) ||
    (marker >= 0xcd && marker <= 0xcf)
  );
}

function pngMetadata(buffer) {
  const signature = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ]);
  if (buffer.length < 33 || !buffer.subarray(0, 8).equals(signature)) {
    throw metadataError("IMAGE_FORMAT_INVALID", "PNG content is invalid");
  }
  let width;
  let height;
  let offset = 8;
  let foundEnd = false;
  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const end = offset + 12 + length;
    if (end > buffer.length) {
      throw metadataError("IMAGE_FORMAT_INVALID", "PNG chunk is truncated");
    }
    if (offset === 8 && (type !== "IHDR" || length !== 13)) {
      throw metadataError("IMAGE_FORMAT_INVALID", "PNG header is invalid");
    }
    if (type === "IHDR") {
      if (offset !== 8 || length !== 13)
        throw metadataError("IMAGE_FORMAT_INVALID", "PNG header is invalid");
      width = buffer.readUInt32BE(offset + 8);
      height = buffer.readUInt32BE(offset + 12);
    }
    if (type === "IEND") {
      if (length !== 0)
        throw metadataError(
          "IMAGE_FORMAT_INVALID",
          "PNG end marker is invalid",
        );
      foundEnd = true;
      break;
    }
    offset = end;
  }
  if (!foundEnd || !width || !height)
    throw metadataError("IMAGE_FORMAT_INVALID", "PNG structure is incomplete");
  return {
    format: "png",
    mimeType: MIME_TYPES.png,
    width: width,
    height: height,
  };
}

function webpMetadata(buffer) {
  if (
    buffer.length < 20 ||
    buffer.toString("ascii", 0, 4) !== "RIFF" ||
    buffer.toString("ascii", 8, 12) !== "WEBP"
  ) {
    throw metadataError("IMAGE_FORMAT_INVALID", "WebP content is invalid");
  }
  if (buffer.readUInt32LE(4) + 8 > buffer.length)
    throw metadataError("IMAGE_FORMAT_INVALID", "WebP content is truncated");

  const chunk = buffer.toString("ascii", 12, 16);
  let width;
  let height;
  if (
    chunk === "VP8X" &&
    buffer.length >= 30 &&
    buffer.readUInt32LE(16) >= 10
  ) {
    width = 1 + buffer.readUIntLE(24, 3);
    height = 1 + buffer.readUIntLE(27, 3);
  } else if (
    chunk === "VP8 " &&
    buffer.length >= 30 &&
    buffer[23] === 0x9d &&
    buffer[24] === 0x01 &&
    buffer[25] === 0x2a
  ) {
    width = buffer.readUInt16LE(26) & 0x3fff;
    height = buffer.readUInt16LE(28) & 0x3fff;
  } else if (chunk === "VP8L" && buffer.length >= 26 && buffer[21] === 0x2f) {
    width = 1 + (buffer[22] | ((buffer[23] & 0x3f) << 8));
    height =
      1 +
      (((buffer[23] >> 6) | (buffer[24] << 2) | ((buffer[25] & 0xf) << 10)) &
        0x3fff);
  }
  if (!width || !height)
    throw metadataError("IMAGE_FORMAT_INVALID", "WebP dimensions are missing");
  return {
    format: "webp",
    mimeType: MIME_TYPES.webp,
    width: width,
    height: height,
  };
}

function readImageMetadata(filename, fsApi) {
  const extension = supportedImageExtension(filename);
  if (!extension)
    throw metadataError(
      "IMAGE_FORMAT_UNSUPPORTED",
      "Image format is unsupported",
    );
  const buffer = (fsApi || require("node:fs")).readFileSync(filename);
  if (!Buffer.isBuffer(buffer) || buffer.length === 0)
    throw metadataError("IMAGE_FORMAT_INVALID", "Image content is empty");
  const parsed =
    extension === ".png"
      ? pngMetadata(buffer)
      : extension === ".webp"
        ? webpMetadata(buffer)
        : jpegMetadata(buffer);
  const expectedFormat =
    extension === ".png" ? "png" : extension === ".webp" ? "webp" : "jpeg";
  if (parsed.format !== expectedFormat)
    throw metadataError(
      "IMAGE_FORMAT_MISMATCH",
      "Image extension does not match its content",
    );
  return {
    extension: extension,
    mimeType: parsed.mimeType,
    width: parsed.width,
    height: parsed.height,
    size: buffer.length,
  };
}

module.exports = {
  SUPPORTED_IMAGE_EXTENSIONS,
  supportedImageExtension,
  readImageMetadata,
  metadataError,
};
