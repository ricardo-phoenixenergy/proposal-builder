import { describe, expect, it } from "vitest";
import { interpretAnthropicResponse } from "../server/anthropicResponse";

const txt = (s: string) => ({ type: "text", text: s });

describe("interpretAnthropicResponse", () => {
  it("returns joined text for a normal end_turn", () => {
    expect(interpretAnthropicResponse({ stop_reason: "end_turn", content: [txt('{"a":1}')] })).toBe(
      '{"a":1}',
    );
  });
  it("throws a length-limit message on max_tokens", () => {
    expect(() =>
      interpretAnthropicResponse({ stop_reason: "max_tokens", content: [txt("{trunc")] }),
    ).toThrowError(/length limit/i);
  });
  it("throws a refusal message on refusal", () => {
    expect(() => interpretAnthropicResponse({ stop_reason: "refusal", content: [] })).toThrowError(
      /declined/i,
    );
  });
  it("throws on empty text content", () => {
    expect(() => interpretAnthropicResponse({ stop_reason: "end_turn", content: [] })).toThrowError(
      /empty/i,
    );
  });
});
