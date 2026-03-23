import { describe, it, expect } from "vitest";
import { parsePostAgeDays } from "../src/shared/matching.js";

describe("parsePostAgeDays", () => {
  it("returns 0 for minutes", () => {
    expect(parsePostAgeDays("5m")).toBe(0);
    expect(parsePostAgeDays("30m")).toBe(0);
  });

  it("returns 0 for hours", () => {
    expect(parsePostAgeDays("1h")).toBe(0);
    expect(parsePostAgeDays("23h")).toBe(0);
  });

  it("returns exact days for day format", () => {
    expect(parsePostAgeDays("1d")).toBe(1);
    expect(parsePostAgeDays("3d")).toBe(3);
    expect(parsePostAgeDays("7d")).toBe(7);
  });

  it("returns weeks as days", () => {
    expect(parsePostAgeDays("1w")).toBe(7);
    expect(parsePostAgeDays("2w")).toBe(14);
    expect(parsePostAgeDays("4w")).toBe(28);
  });

  it("returns months as ~30 days", () => {
    expect(parsePostAgeDays("1mo")).toBe(30);
    expect(parsePostAgeDays("3mo")).toBe(90);
  });

  it("returns years as ~365 days", () => {
    expect(parsePostAgeDays("1y")).toBe(365);
    expect(parsePostAgeDays("1yr")).toBe(365);
  });

  it("returns 0 for unrecognized formats", () => {
    expect(parsePostAgeDays("Just now")).toBe(0);
    expect(parsePostAgeDays("Edited")).toBe(0);
    expect(parsePostAgeDays("")).toBe(0);
  });
});
