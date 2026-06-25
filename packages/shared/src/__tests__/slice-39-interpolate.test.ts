import { describe, expect, it } from "vitest";
import { interpolate } from "../template/interpolate";

describe("interpolate", () => {
  it("substitutes and HTML-escapes a field", () => {
    expect(interpolate("<h1>{{title}}</h1>", { title: "A & B <x>" })).toBe(
      "<h1>A &amp; B &lt;x&gt;</h1>",
    );
  });
  it("renders empty for an unknown key", () => {
    expect(interpolate("[{{nope}}]", {})).toBe("[]");
  });
  it("loops a list with {{this}}", () => {
    expect(
      interpolate("{{#each bullets}}<li>{{this}}</li>{{/each}}", { bullets: ["a", "b"] }),
    ).toBe("<li>a</li><li>b</li>");
  });
  it("loops dataset rows resolving bare keys against the row", () => {
    const data = {
      ds: {
        rows: [
          { label: "2024", value: "42" },
          { label: "2025", value: "58" },
        ],
      },
    };
    expect(interpolate("{{#each ds.rows}}{{label}}:{{value}};{{/each}}", data)).toBe(
      "2024:42;2025:58;",
    );
  });
  it("renders #if branch by presence, else otherwise", () => {
    expect(interpolate("{{#if a}}Y{{else}}N{{/if}}", { a: "x" })).toBe("Y");
    expect(interpolate("{{#if a}}Y{{else}}N{{/if}}", {})).toBe("N");
  });
  it("handles an each nested inside an if", () => {
    const tpl = "{{#if items}}<ul>{{#each items}}<li>{{this}}</li>{{/each}}</ul>{{/if}}";
    expect(interpolate(tpl, { items: ["a"] })).toBe("<ul><li>a</li></ul>");
  });
  it("handles two sibling each blocks", () => {
    expect(
      interpolate("{{#each a}}{{this}},{{/each}}|{{#each b}}{{this}};{{/each}}", {
        a: ["1", "2"],
        b: ["x"],
      }),
    ).toBe("1,2,|x;");
  });
  it("handles {{this}} for a string list", () => {
    expect(interpolate("{{#each tags}}[{{this}}]{{/each}}", { tags: ["foo", "bar"] })).toBe(
      "[foo][bar]",
    );
  });
  it("renders #if with no else (absent branch = empty)", () => {
    expect(interpolate("{{#if flag}}yes{{/if}}", { flag: true })).toBe("yes");
    expect(interpolate("{{#if flag}}yes{{/if}}", {})).toBe("");
  });
  it("does not traverse inherited/prototype properties", () => {
    expect(interpolate("[{{constructor}}]", {})).toBe("[]");
    expect(interpolate("[{{__proto__}}]", {})).toBe("[]");
    expect(interpolate("[{{hasOwnProperty}}]", {})).toBe("[]");
  });
});
