import { describe, expect, it } from "vitest";
import { applyNoteEnter, prefixFirstNoteLine } from "./noteList";

describe("note list typing", () => {
  it("starts an empty note with a bullet", () => {
    expect(applyNoteEnter("", 0, 0)).toEqual({ value: "- ", cursor: 2 });
  });

  it("inserts a bullet on the next line", () => {
    expect(applyNoteEnter("- Call", 6, 6)).toEqual({ value: "- Call\n- ", cursor: 9 });
  });

  it("removes an empty bullet instead of adding another", () => {
    expect(applyNoteEnter("- Call\n- ", 9, 9)).toEqual({ value: "- Call\n", cursor: 7 });
  });

  it("prefixes the first typed line", () => {
    expect(prefixFirstNoteLine("", "hello")).toBe("- hello");
    expect(prefixFirstNoteLine("- ", "- hello")).toBe("- hello");
  });
});
