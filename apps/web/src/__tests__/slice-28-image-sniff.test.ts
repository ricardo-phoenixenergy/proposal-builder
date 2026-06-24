import { describe, expect, it } from "vitest";
import { sniffImageType } from "../server/assets/sniffImageType";

const bytes = (...b: number[]) => new Uint8Array(b);
const PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0);
const JPEG = bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0);
const GIF87 = bytes(0x47, 0x49, 0x46, 0x38, 0x37, 0x61, 0, 0);
const GIF89 = bytes(0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0, 0);
// "RIFF" .... "WEBP"
const WEBP = bytes(0x52, 0x49, 0x46, 0x46, 0x1a, 0, 0, 0, 0x57, 0x45, 0x42, 0x50);
// "RIFF" .... "WAVE" — a non-image RIFF container must NOT be accepted as webp.
const WAVE = bytes(0x52, 0x49, 0x46, 0x46, 0x1a, 0, 0, 0, 0x57, 0x41, 0x56, 0x45);
const SVG = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
const HTML = new TextEncoder().encode("<!doctype html><script>alert(1)</script>");

describe("sniffImageType (5a magic-byte gate)", () => {
  it("recognises raster image signatures", () => {
    expect(sniffImageType(PNG)).toBe("png");
    expect(sniffImageType(JPEG)).toBe("jpeg");
    expect(sniffImageType(GIF87)).toBe("gif");
    expect(sniffImageType(GIF89)).toBe("gif");
    expect(sniffImageType(WEBP)).toBe("webp");
  });

  it("rejects SVG (text/XML, scriptable) and other non-raster content", () => {
    expect(sniffImageType(SVG)).toBeNull();
    expect(sniffImageType(HTML)).toBeNull();
    expect(sniffImageType(WAVE)).toBeNull(); // RIFF but not WEBP
  });

  it("rejects garbage and too-short buffers", () => {
    expect(sniffImageType(bytes(0x00, 0x01, 0x02, 0x03))).toBeNull();
    expect(sniffImageType(bytes(0x89, 0x50))).toBeNull();
    expect(sniffImageType(new Uint8Array(0))).toBeNull();
  });
});
