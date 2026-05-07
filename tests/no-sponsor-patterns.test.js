import { describe, it, expect } from "vitest";
import { NO_SPONSOR_RE, UNPAID_RE } from "../src/jobs/constants.js";

describe("NO_SPONSOR_RE", () => {
  it("matches common no-sponsor phrases", () => {
    expect(NO_SPONSOR_RE.test("This company does not sponsor work visas.")).toBe(true);
    expect(NO_SPONSOR_RE.test("No visa sponsorship is provided")).toBe(true);
    expect(NO_SPONSOR_RE.test("Must be authorized to work in the US")).toBe(true);
    expect(NO_SPONSOR_RE.test("We are unable to sponsor at this time")).toBe(true);
  });

  it("does not match sponsor-friendly text", () => {
    expect(NO_SPONSOR_RE.test("We offer visa sponsorship")).toBe(false);
    expect(NO_SPONSOR_RE.test("Sponsorship available for qualified candidates")).toBe(false);
    expect(NO_SPONSOR_RE.test("Great benefits package and relocation assistance")).toBe(false);
  });

  it("is case-insensitive", () => {
    expect(NO_SPONSOR_RE.test("DOES NOT SPONSOR")).toBe(true);
    expect(NO_SPONSOR_RE.test("Without Sponsorship")).toBe(true);
  });
});

describe("UNPAID_RE", () => {
  it("matches unpaid/volunteer patterns", () => {
    expect(UNPAID_RE.test("This is an unpaid internship")).toBe(true);
    expect(UNPAID_RE.test("Volunteer opportunity in marketing")).toBe(true);
    expect(UNPAID_RE.test("Pro bono legal work")).toBe(true);
  });

  it("does not match paid positions", () => {
    expect(UNPAID_RE.test("Competitive salary and benefits")).toBe(false);
    expect(UNPAID_RE.test("Paid internship with growth opportunities")).toBe(false);
  });
});
