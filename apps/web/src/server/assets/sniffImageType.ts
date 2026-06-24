export type RasterImageType = "png" | "jpeg" | "gif" | "webp";

/** MIME type for each recognised raster format (used to namespace/label uploads). */
export const RASTER_MIME: Record<RasterImageType, string> = {
  png: "image/png",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
};

const startsWith = (bytes: Uint8Array, sig: readonly number[]): boolean =>
  bytes.length >= sig.length && sig.every((b, i) => bytes[i] === b);

/**
 * Identify a raster image from its leading bytes (5a). The client-declared
 * content-type is untrusted — this magic-byte check is authoritative. Returns the
 * format or null for anything unrecognised (SVG, HTML, spoofed types, garbage),
 * which the upload route rejects. Vector/scriptable formats (SVG) have no binary
 * signature and so are intentionally excluded.
 */
export function sniffImageType(bytes: Uint8Array): RasterImageType | null {
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  // JPEG: FF D8 FF
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "jpeg";
  // GIF: "GIF87a" / "GIF89a"
  if (startsWith(bytes, [0x47, 0x49, 0x46, 0x38])) return "gif";
  // WebP: "RIFF" <4-byte size> "WEBP"
  if (
    startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    bytes.length >= 12 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "webp";
  }
  return null;
}
