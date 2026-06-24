// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { updateProposalMeta, duplicateProposal, deleteProposal } from "../client/persistence";
import { fetchFolders, createFolder, deleteFolder } from "../client/folders";

afterEach(() => vi.unstubAllGlobals());
const ok = (body: unknown, status = 200) =>
  Promise.resolve(
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }),
  );

describe("client proposals meta", () => {
  it("updateProposalMeta PATCHes and returns the summary", async () => {
    const f = vi.fn(() =>
      ok({ proposal: { id: "p1", title: "T", client: "C", folderId: null, updatedAt: "t" } }),
    );
    vi.stubGlobal("fetch", f);
    expect((await updateProposalMeta("p1", { title: "T" })).title).toBe("T");
    expect(f).toHaveBeenCalledWith(
      "/api/proposals/p1",
      expect.objectContaining({ method: "PATCH" }),
    );
  });

  it("duplicateProposal POSTs to the duplicate route", async () => {
    const f = vi.fn(() =>
      ok(
        { proposal: { id: "p2", title: "Copy", client: "C", folderId: null, updatedAt: "t" } },
        201,
      ),
    );
    vi.stubGlobal("fetch", f);
    expect((await duplicateProposal("p1")).id).toBe("p2");
    expect(f).toHaveBeenCalledWith(
      "/api/proposals/p1/duplicate",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("deleteProposal DELETEs", async () => {
    const f = vi.fn(() => Promise.resolve(new Response(null, { status: 204 })));
    vi.stubGlobal("fetch", f);
    await deleteProposal("p1");
    expect(f).toHaveBeenCalledWith(
      "/api/proposals/p1",
      expect.objectContaining({ method: "DELETE" }),
    );
  });
});

describe("client folders", () => {
  it("fetchFolders unwraps { folders }", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => ok({ folders: [{ id: "f1", ownerId: "o", name: "Sales", createdAt: "t" }] })),
    );
    expect((await fetchFolders())[0]!.name).toBe("Sales");
  });
  it("createFolder POSTs name; deleteFolder DELETEs", async () => {
    const f = vi.fn(() =>
      ok({ folder: { id: "f1", ownerId: "o", name: "Sales", createdAt: "t" } }, 201),
    );
    vi.stubGlobal("fetch", f);
    await createFolder("Sales");
    expect(f).toHaveBeenCalledWith("/api/folders", expect.objectContaining({ method: "POST" }));
    const d = vi.fn(() => Promise.resolve(new Response(null, { status: 204 })));
    vi.stubGlobal("fetch", d);
    await deleteFolder("f1");
    expect(d).toHaveBeenCalledWith(
      "/api/folders/f1",
      expect.objectContaining({ method: "DELETE" }),
    );
  });
});
