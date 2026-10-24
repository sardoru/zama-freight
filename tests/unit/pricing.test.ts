import { describe, expect, it } from "vitest";
import { route } from "@/data/network";
import { PLACE_IDS } from "@/data/places";
import { legFare } from "@/data/tolls";
import type { VehicleType } from "@/data/types";
import { DEMO_ASSUMPTIONS, quote } from "@/lib/pricing";

const tollSum = (from: Parameters<typeof route>[0], to: Parameters<typeof route>[1], vehicle: VehicleType) => quote({ from, to, vehicle }).tolls.reduce((s, t) => s + t.amount, 0);
const within10 = (value: number, published: number) => {
  expect(value).toBeGreaterThanOrEqual(published * 0.9);
  expect(value).toBeLessThanOrEqual(published * 1.1);
};

describe("tolls from the published tariffs", () => {
  it("prices Pasaia → Bayonne for an artic within ±10 % of Bidegi 2026 + ASF (€6.53 + €14.40)", () => {
    const published = 6.53 + 14.4;
    within10(tollSum("pasaia", "bayonne", "artic"), published);
    expect(tollSum("pasaia", "bayonne", "artic")).toBeCloseTo(20.93, 2);
    const legs = quote({ from: "pasaia", to: "bayonne", vehicle: "artic" }).tolls;
    expect(legs.map((t) => [t.road, t.from, t.to, t.amount])).toEqual([
      ["AP-8", "Donostia E", "Behobia", 6.53],
      ["A-63", "Biriatou", "Bayonne nord", 14.4],
    ]);
  });

  it("prices Donostia E → Irun within ±10 % of the Bidegi 2026 fares, by class", () => {
    within10(tollSum("donostia", "irun", "van"), 2.24);
    within10(tollSum("donostia", "irun", "rigid"), 3.83);
    within10(tollSum("donostia", "irun", "artic"), 4.57);
    within10(tollSum("hernani", "zaisa", "artic"), 4.57);
  });

  it("charges from Donostia E, not per km from Errenteria", () => {
    // The GI-20 ring through Donostia is free; the AP-8 leg begins where it ends and pays Bidegi's Donostia E fare.
    const r = route("donostia", "irun");
    expect(r.roads).toContain("GI-20");
    expect(r.tolls).toHaveLength(1);
    expect(r.tolls[0]).toMatchObject({ road: "AP-8", entry: "j_errenteria", exit: "j_irun_s" });
    expect(quote({ from: "donostia", to: "irun", vehicle: "van" }).tolls[0].from).toBe("Donostia E");
    expect(tollSum("pasaia", "oiartzun", "artic")).toBeCloseTo(3.06, 2);
  });

  it("charges nothing where no published fare applies", () => {
    expect(tollSum("donostia", "pasaia", "artic")).toBe(0);
    expect(tollSum("bidart", "biarritz", "artic")).toBe(0);
    expect(legFare("A-63", "j_border", "j_biriatou", "heavy2")).toBe(0);
  });

  it("uses the right half of the Biarritz interchange", () => {
    expect(legFare("A-63", "j_negresse", "j_bayonne_n", "heavy2")).toBe(3.8);
    expect(legFare("A-63", "j_border", "j_negresse", "heavy2")).toBe(9.6);
    expect(legFare("A-63", "j_border", "j_negresse", "light")).toBe(5);
  });

  it("labels each toll with its operator and tariff year", () => {
    const years = Object.fromEntries(quote({ from: "pasaia", to: "bayonne", vehicle: "rigid" }).tolls.map((t) => [t.operator, t.year]));
    expect(years).toEqual({ Bidegi: 2026, ASF: 2024 });
  });
});

describe("price breakdown", () => {
  const options = [{}, { express: true }, { tailLift: true }, { adr: true }, { express: true, tailLift: true, adr: true }];

  it("adds up to the price on every lane, vehicle and option", () => {
    for (const from of PLACE_IDS)
      for (const to of PLACE_IDS) {
        if (from === to) continue;
        for (const vehicle of ["van", "rigid", "artic", "reefer", "flatbed"] as const)
          for (const opt of options) {
            const q = quote({ from, to, vehicle, ...opt });
            expect(
              q.lines.reduce((s, l) => s + l.amount, 0),
              `${from}→${to} ${vehicle} ${JSON.stringify(opt)}`,
            ).toBe(q.fair);
          }
      }
  });

  it("marks every surcharge as a demo assumption, and only the surcharges", () => {
    const q = quote({ from: "irun", to: "bayonne", vehicle: "artic", express: true, tailLift: true, adr: true });
    const demo = q.lines.filter((l) => l.demo).map((l) => l.key);
    expect(demo).toEqual(["crossBorder", "express", "tailLift", "adr"]);
    expect(q.lines.find((l) => l.key === "crossBorder")?.amount).toBe(DEMO_ASSUMPTIONS.crossBorder);
    expect(quote({ from: "pasaia", to: "irun", vehicle: "artic" }).lines.some((l) => l.key === "crossBorder")).toBe(false);
  });

  it("keeps the demo range and the return-trip price as the documented assumptions", () => {
    const q = quote({ from: "pasaia", to: "bayonne", vehicle: "artic" });
    expect(q.low).toBe(Math.round((q.fair * 0.88) / 5) * 5);
    expect(q.high).toBe(Math.round((q.fair * 1.14) / 5) * 5);
    expect(q.returnPrice).toBe(Math.round((q.fair * DEMO_ASSUMPTIONS.returnTrip) / 5) * 5);
  });
});
