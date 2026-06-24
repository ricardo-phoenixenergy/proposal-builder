// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

describe("render token secret", () => {
  it("throws in production when AUTH_SECRET is unset", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AUTH_SECRET", "");
    const mod = await import("../server/auth/renderToken");
    expect(() => mod.mintRenderToken("p1")).toThrowError(/AUTH_SECRET/i);
  });
});
