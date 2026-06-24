// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchTemplates,
  createTemplate,
  updateTemplate,
  setTemplateDeprecated,
} from "../client/templates";

afterEach(() => vi.unstubAllGlobals());

const ok = (body: unknown) =>
  Promise.resolve(
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  );
const err = (status: number, body: unknown) =>
  Promise.resolve(
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }),
  );
const tmpl = {
  id: "tmpl_x",
  name: "X",
  themeId: "theme_phoenix_default",
  locked: false,
  slots: [],
};

describe("client/templates", () => {
  it("fetchTemplates unwraps { templates }", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => ok({ templates: [tmpl] })),
    );
    expect(await fetchTemplates()).toEqual([tmpl]);
  });

  it("createTemplate POSTs to /api/templates", async () => {
    const f = vi.fn(() => ok({ template: tmpl }));
    vi.stubGlobal("fetch", f);
    await createTemplate(tmpl as never);
    expect(f).toHaveBeenCalledWith("/api/templates", expect.objectContaining({ method: "POST" }));
  });

  it("updateTemplate PUTs to /api/templates/:id", async () => {
    const f = vi.fn(() => ok({ template: tmpl }));
    vi.stubGlobal("fetch", f);
    await updateTemplate("tmpl_x", tmpl as never);
    expect(f).toHaveBeenCalledWith(
      "/api/templates/tmpl_x",
      expect.objectContaining({ method: "PUT" }),
    );
  });

  it("setTemplateDeprecated POSTs to the deprecate sub-route", async () => {
    const f = vi.fn(() => ok({ template: tmpl }));
    vi.stubGlobal("fetch", f);
    await setTemplateDeprecated("tmpl_x", true);
    expect(f).toHaveBeenCalledWith(
      "/api/templates/tmpl_x/deprecate",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("throws the server error message on failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => err(409, { error: "dup" })),
    );
    await expect(createTemplate(tmpl as never)).rejects.toThrow("dup");
  });
});
