import { describe, it, expect } from "vitest";
import { getBorderReason } from "../src/jobs/constants.js";

describe("getBorderReason", () => {
  it("returns highest priority reason", () => {
    expect(getBorderReason(["applied", "noSponsor"])).toBe("noSponsor");
    expect(getBorderReason(["unpaid", "reposted"])).toBe("reposted");
  });

  it("returns the only reason when single", () => {
    expect(getBorderReason(["applied"])).toBe("applied");
    expect(getBorderReason(["unpaid"])).toBe("unpaid");
  });

  it("follows full priority order", () => {
    const allReasons = [
      "unpaid",
      "applied",
      "skippedTitle",
      "skippedCompany",
      "reposted",
      "noSponsor",
    ];
    expect(getBorderReason(allReasons)).toBe("noSponsor");
  });

  it("falls back to first element for unknown reasons", () => {
    expect(getBorderReason(["unknown"])).toBe("unknown");
  });

  it("treats goodMatch as the lowest priority so any negative signal owns the border", () => {
    expect(getBorderReason(["goodMatch", "noSponsor"])).toBe("noSponsor");
    expect(getBorderReason(["goodMatch", "applied"])).toBe("applied");
    expect(getBorderReason(["goodMatch"])).toBe("goodMatch");
  });
});
