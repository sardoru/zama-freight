import { describe, expect, it } from "vitest";
import { VEHICLE } from "@/data/companies";
import { buildLoads, eligibleCarriers } from "@/data/seed";
import type { Load, VehicleEvent } from "@/data/types";
import { cabotageCheck, DAY, endOfMadridDay, historyAnchor, ledgerAt, runVerdict } from "@/lib/cabotage";

// Wednesday 21 October 2026, 10:00 in Madrid.
const T0 = Date.parse("2026-10-21T10:00:00+02:00");
const H = 3_600_000;

const job = (from: Load["from"], to: Load["to"], pickupAt: number, id = "job") => ({ id, from, to, pickupAt });

/** A load that the vehicle has already run (or is running). */
function ran(id: string, vehicleId: string, from: Load["from"], to: Load["to"], deliveredAt: number, status: Load["status"] = "delivered"): Load {
  return {
    id,
    shipperId: "s-itsaso",
    from,
    to,
    goods: "pallets",
    pallets: 10,
    kg: 5_000,
    vehicle: "artic",
    pickupAt: deliveredAt - 2 * H,
    deliverBy: deliveredAt + H,
    mode: "bids",
    target: 200,
    status,
    vehicleId,
    departedAt: deliveredAt - H,
    deliveredAt: status === "delivered" ? deliveredAt : undefined,
    ecmr: "delivered",
    createdAt: deliveredAt - DAY,
  };
}

const hist = (vehicleId: string, ...events: [VehicleEvent["kind"], VehicleEvent["country"], number][]): VehicleEvent[] =>
  events.map(([kind, country, daysAgo]) => ({ vehicleId, kind, country, daysAgo }));

describe("calendar days on the corridor's clock", () => {
  it("counts the 7-day window and the 4-day cooling-off in whole Madrid days", () => {
    const monday = Date.parse("2026-10-19T15:00:00+02:00");
    expect(new Date(endOfMadridDay(monday, 7)).toISOString()).toBe("2026-10-26T22:59:59.999Z"); // next Monday 23:59:59 (after the DST change)
    expect(new Date(endOfMadridDay(monday, 4)).toISOString()).toBe("2026-10-23T21:59:59.999Z"); // Friday 23:59:59
  });
});

describe("cabotage per vehicle and host country", () => {
  it("lets a Spanish truck work inside France after unloading an international load there (ES in FR)", () => {
    const c = cabotageCheck(job("biarritz", "bayonne", T0 + 2 * H), "v-tx2", [], { anchor: T0, history: hist("v-tx2", ["international", "FR", 0.6]) });
    expect(c).toMatchObject({ cabotage: true, country: "FR", used: 0, block: undefined });
    expect(c.windowEnds).toBe(endOfMadridDay(T0 - 0.6 * DAY, 7));
  });

  it("lets a French truck work inside Spain the same way (FR in ES), and not without the incoming carriage", () => {
    const ok = cabotageCheck(job("pasaia", "irun", T0 + H), "v-ad3", [], { anchor: T0, history: hist("v-ad3", ["international", "ES", 0.5]) });
    expect(ok.block).toBeUndefined();
    const none = cabotageCheck(job("pasaia", "irun", T0 + H), "v-ad3", [], { anchor: T0, history: [] });
    expect(none).toMatchObject({ cabotage: true, block: "noIncoming" });
  });

  it("opens the window from the loads in the store: a Lithuanian truck in France (LT in FR)", () => {
    const loads = [ran("L1", "v-br1", "zaisa", "bayonne", T0 - H)];
    const c = cabotageCheck(job("biarritz", "bayonne", T0 + H), "v-br1", loads, { anchor: T0, history: [] });
    expect(c).toMatchObject({ cabotage: true, country: "FR", used: 0, incomingAt: T0 - H, block: undefined });
  });

  it("doesn't count international legs as cabotage", () => {
    for (const [vehicle, from, to] of [
      ["v-tx2", "irun", "bayonne"],
      ["v-ad1", "bayonne", "pasaia"],
      ["v-br1", "zaisa", "bayonne"],
    ] as const)
      expect(cabotageCheck(job(from, to, T0), vehicle, [], { anchor: T0, history: [] }).cabotage).toBe(false);
    // Nor a carrier's own country.
    expect(cabotageCheck(job("biarritz", "bayonne", T0), "v-ad1", [], { anchor: T0, history: [] }).cabotage).toBe(false);
  });

  it("allows 3 operations in 7 days, counting planned ones, and blocks the 4th", () => {
    const history = hist("v-tx3", ["international", "FR", 3], ["cabotage", "FR", 2.5], ["cabotage", "FR", 2]);
    expect(cabotageCheck(job("biarritz", "bayonne", T0 + H), "v-tx3", [], { anchor: T0, history })).toMatchObject({ used: 2, block: undefined });
    const planned = [ran("P1", "v-tx3", "hendaye", "anglet", T0 + 4 * H, "assigned")];
    expect(cabotageCheck(job("biarritz", "bayonne", T0 + 8 * H), "v-tx3", planned, { anchor: T0, history })).toMatchObject({ used: 3, block: "limit" });
  });

  it("counts per vehicle: the same carrier's other truck keeps its own allowance", () => {
    const history = [...hist("v-tx3", ["international", "FR", 3], ["cabotage", "FR", 2.5], ["cabotage", "FR", 2], ["cabotage", "FR", 1.5]), ...hist("v-tx2", ["international", "FR", 0.6])];
    expect(cabotageCheck(job("biarritz", "bayonne", T0 + H), "v-tx3", [], { anchor: T0, history }).block).toBe("limit");
    expect(cabotageCheck(job("biarritz", "bayonne", T0 + H), "v-tx2", [], { anchor: T0, history }).block).toBeUndefined();
  });

  it("closes the window at the end of the 7th day after the incoming unloading", () => {
    const c = cabotageCheck(job("biarritz", "bayonne", T0), "v-tx2", [], { anchor: T0, history: hist("v-tx2", ["international", "FR", 8]) });
    expect(c.block).toBe("window");
  });

  it("runs a 4-day cooling-off per country once the vehicle has left, then lets it start again", () => {
    const history = hist("v-ad1", ["international", "ES", 2.5], ["cabotage", "ES", 1.8], ["cabotage", "ES", 1]);
    // Leaves Spain with a load, comes back with another.
    const loads = [ran("OUT", "v-ad1", "oiartzun", "bayonne", T0 - 0.5 * DAY), ran("IN", "v-ad1", "bayonnePort", "pasaia", T0 - 0.2 * DAY)];
    const now = cabotageCheck(job("pasaia", "irun", T0 + H), "v-ad1", loads, { anchor: T0, history });
    expect(now.block).toBe("coolingOff");
    expect(now.coolingOffUntil).toBe(endOfMadridDay(T0 - DAY, 4));
    // Still in France: cooling-off in Spain doesn't stop cabotage elsewhere, but France has no incoming carriage.
    expect(cabotageCheck(job("biarritz", "bayonne", T0 + H), "v-ad1", loads, { anchor: T0, history }).cabotage).toBe(false);
    const after = cabotageCheck(job("pasaia", "irun", now.coolingOffUntil! + 1), "v-ad1", loads, { anchor: T0, history });
    expect(after).toMatchObject({ block: undefined, used: 0 });
  });

  it("doesn't start a cooling-off while the vehicle stays in the country", () => {
    const history = hist("v-ad1", ["international", "ES", 2.5], ["cabotage", "ES", 1.8], ["cabotage", "ES", 1]);
    expect(cabotageCheck(job("pasaia", "irun", T0 + H), "v-ad1", [], { anchor: T0, history })).toMatchObject({ used: 2, block: undefined });
  });
});

describe("the seeded demo day", () => {
  const loads = buildLoads(T0);
  const check = (vehicleId: string, from: Load["from"], to: Load["to"], at = T0 + 3 * H) => cabotageCheck(job(from, to, at), vehicleId, loads, { anchor: T0 });

  it("shows every case on the board", () => {
    expect(check("v-tx2", "biarritz", "bayonne")).toMatchObject({ used: 0, block: undefined });
    expect(check("v-tx3", "biarritz", "bayonne").block).toBe("limit");
    expect(check("v-kf2", "biarritz", "bayonne").block).toBeUndefined();
    expect(check("v-ad3", "pasaia", "irun").block).toBeUndefined();
    expect(check("v-br3", "pasaia", "irun").block).toBeUndefined();
    for (const id of ["v-ad1", "v-lb1", "v-br1"]) expect(check(id, "pasaia", "irun").block, id).toBe("coolingOff");
    expect(check("v-br2", "biarritz", "bayonne").block).toBe("coolingOff");
    expect(check("v-ai3", "biarritz", "bayonne").block).toBe("noIncoming");
  });

  it("feeds the Dispatch overview and the carrier pool", () => {
    expect(ledgerAt("v-tx2", "FR", T0, loads, { anchor: T0 })).toMatchObject({ used: 0 });
    expect(ledgerAt("v-tx2", "ES", T0, loads, { anchor: T0 })).toBeNull();
    const pool = eligibleCarriers({ vehicle: "artic", from: "biarritz", to: "bayonne", pickupAt: T0 + 3 * H }, { loads, at: T0, anchor: T0 }).map((c) => c.id);
    expect(pool).toEqual(expect.arrayContaining(["c-txingudi", "c-adour", "c-kantauri"]));
    expect(pool).not.toContain("c-urumea");
    expect(pool).not.toContain("c-aiako");
  });

  it("combines licence and cabotage for a vehicle", () => {
    const verdict = runVerdict(job("biarritz", "bayonne", T0 + 3 * H), VEHICLE.get("v-ur4")!, loads, { anchor: T0 });
    expect(verdict.ok).toBe(false);
    expect(verdict.licence).toEqual(["communityLicence"]);
    expect(runVerdict(job("biarritz", "bayonne", T0 + 3 * H), VEHICLE.get("v-tx2")!, loads, { anchor: T0 })).toMatchObject({ ok: true, posting: true });
  });

  it("anchors the history on the first market time, and again after a reset", () => {
    const a = historyAnchor(T0 + 100 * DAY);
    expect(historyAnchor(T0 + 101 * DAY)).toBe(a);
    expect(historyAnchor(0)).toBe(a);
    expect(historyAnchor(T0 + 50 * DAY)).toBe(T0 + 50 * DAY);
  });
});
