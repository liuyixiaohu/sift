import { describe, it, expect } from "vitest";

// formatNumber is defined inside popup.js IIFE, so we extract the logic here for testing.
// This tests the same algorithm that popup.js uses.
function formatNumber(n) {
  if (typeof n !== "number" || !isFinite(n) || n < 0) return "0";
  if (n < 1000) return String(Math.floor(n));
  if (n < 999500) {
    return n < 9950 ? (n / 1000).toFixed(1) + "k" : Math.round(n / 1000) + "k";
  }
  return n < 9950000
    ? (n / 1000000).toFixed(1) + "M"
    : Math.round(n / 1000000) + "M";
}

describe("formatNumber", () => {
  it("returns plain integer for values under 1000", () => {
    expect(formatNumber(0)).toBe("0");
    expect(formatNumber(1)).toBe("1");
    expect(formatNumber(999)).toBe("999");
  });

  it("shows one decimal in 1.0k..9.9k", () => {
    expect(formatNumber(1000)).toBe("1.0k");
    expect(formatNumber(1500)).toBe("1.5k");
    expect(formatNumber(8400)).toBe("8.4k");
    expect(formatNumber(9949)).toBe("9.9k");
  });

  it("drops the decimal at 9950 and above", () => {
    expect(formatNumber(9950)).toBe("10k");
    expect(formatNumber(10000)).toBe("10k");
    expect(formatNumber(14267)).toBe("14k");
    expect(formatNumber(999499)).toBe("999k");
  });

  it("transitions to M cleanly at 999500, no '1000k' artifact", () => {
    expect(formatNumber(999500)).toBe("1.0M");
    expect(formatNumber(1000000)).toBe("1.0M");
    expect(formatNumber(1500000)).toBe("1.5M");
    expect(formatNumber(9949000)).toBe("9.9M");
  });

  it("drops the decimal at 9.95M and above", () => {
    expect(formatNumber(9950000)).toBe("10M");
    expect(formatNumber(15000000)).toBe("15M");
  });

  it("clamps negatives, NaN, and Infinity to '0'", () => {
    expect(formatNumber(-5)).toBe("0");
    expect(formatNumber(NaN)).toBe("0");
    expect(formatNumber(Infinity)).toBe("0");
  });
});
