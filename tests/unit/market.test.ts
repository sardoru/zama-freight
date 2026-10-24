// Drives the real market store headless with a fake clock: the long-session
// and background-tab runs of #8, the bids and ids of #26, and the saved-state
// checks of #5. Math.random is seeded, so every run sees the same market.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CARRIER, CARRIERS, SHIPPER, VEHICLE } from "@/data/companies";
import { route } from "@/data/network";
import { PLACES } from "@/data/places";
import { fitsReturn } from "@/data/seed";
import type { Load } from "@/data/types";
import { runVerdict } from "@/lib/cabotage";
import { jobScope, zbeProblem } from "@/lib/checks";
import { quote } from "@/lib/pricing";

const START = Date.UTC(2026, 9, 24, 8, 0, 0); // 10:00 in Madrid
const MIN = 60_000;
const HOUR = 60 * MIN;
const KEY = "zama-demo-v1";

/** mulberry32 */
function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/** A Map-backed localStorage that counts writes; it survives "reloads" like the real one. */
function storage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  const ls = {
    writes: 0,
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => {
      ls.writes++;
      data.set(k, String(v));
    },
    removeItem: (k: string) => void data.delete(k),
  };
  vi.stubGlobal("localStorage", ls);
  return ls;
}

/** A page load: fresh window and document (so listeners of the last page go quiet) and a fresh store module. */
async function open() {
  const win = new EventTarget();
  const doc = Object.assign(new EventTarget(), { visibilityState: "visible" as DocumentVisibilityState });
  vi.stubGlobal("window", win);
  vi.stubGlobal("document", doc);
  vi.resetModules();
  const { useMarket } = await import("@/store/market");
  useMarket.getState().init();
  const setVisible = (visible: boolean) => {
    doc.visibilityState = visible ? "visible" : "hidden";
    doc.dispatchEvent(new Event("visibilitychange"));
  };
  return { useMarket, win, setVisible };
}

type Store = Awaited<ReturnType<typeof open>>["useMarket"];
type State = ReturnType<Store["getState"]>;

const simNow = (s: State) => s.clock.sim + (Date.now() - s.clock.real) * s.clock.speed;

/** The #8 and #26 numbers for a state, plus the reference checks behind them. */
function audit(s: State) {
  const now = simNow(s);
  const byId = new Map(s.loads.map((l) => [l.id, l]));
  const vehicles = s.loads.filter((l) => l.status === "inTransit" && l.vehicleId).map((l) => l.vehicleId);
  return {
    onRoad: s.loads.filter((l) => l.status === "inTransit").length,
    newestAgeMin: (now - Math.max(...s.loads.map((l) => l.createdAt))) / MIN,
    loads: s.loads.length,
    bids: s.bids.length,
    orphaned: s.bids.filter((b) => !byId.has(b.loadId)).length,
    // A bid older than its load is left over from an earlier load with the same id.
    stale: s.bids.filter((b) => byId.has(b.loadId) && b.at < byId.get(b.loadId)!.createdAt - MIN).length,
    openWithAccepted: s.loads.filter((l) => l.status === "open" && s.bids.some((b) => b.loadId === l.id && b.status === "accepted")).length,
    duplicateLoads: s.loads.length - byId.size,
    duplicateBids: s.bids.length - new Set(s.bids.map((b) => b.id)).size,
    docksToMissingLoads: s.docks.filter((d) => d.loadId && !byId.has(d.loadId)).length,
    feedToMissingLoads: s.feed.filter((e) => e.loadId && !byId.has(e.loadId)).length,
    trucksOnTwoJobs: vehicles.length - new Set(vehicles).size,
    docks: s.docks.length,
    returns: s.returns.length,
    feed: s.feed.length,
  };
}

/**
 * Advances the fake clock by `every` ms at a time for `hours` real hours and
 * ticks the store after each step, as the shell's interval does; checks every
 * invariant once a real minute (or every tick, if ticks are rarer).
 */
function drive(useMarket: Store, hours: number, every: number) {
  const seen = new Map<string, number>(useMarket.getState().loads.map((l) => [l.id, l.createdAt]));
  let reused = 0;
  const worst = { minOnRoad: Infinity, maxNewestAgeMin: 0, maxBids: 0, maxLoads: 0, maxDocks: 0, maxReturns: 0, maxOrphaned: 0, maxStale: 0, maxBidsPerLoadSlot: 0 };
  const sampleEvery = Math.max(1, Math.round(MIN / every));
  const steps = (hours * HOUR) / every;
  for (let i = 1; i <= steps; i++) {
    vi.advanceTimersByTime(every);
    useMarket.getState().tick();
    const s = useMarket.getState();
    for (const l of s.loads) {
      const first = seen.get(l.id);
      if (first === undefined) seen.set(l.id, l.createdAt);
      else if (first !== l.createdAt) reused++;
    }
    if (i % sampleEvery) continue;
    const a = audit(s);
    expect(a.onRoad, `trucks on the road after ${i * every} ms`).toBeGreaterThanOrEqual(5);
    expect(a.newestAgeMin, `newest load age after ${i * every} ms`).toBeLessThanOrEqual(60);
    expect(a.orphaned).toBe(0);
    expect(a.stale).toBe(0);
    expect(a.bids).toBeLessThan(a.loads * CARRIERS.length);
    expect(a.openWithAccepted).toBe(0);
    expect(a.duplicateLoads + a.duplicateBids).toBe(0);
    expect(a.docksToMissingLoads + a.feedToMissingLoads).toBe(0);
    expect(a.trucksOnTwoJobs).toBe(0);
    expect(a.feed).toBeLessThanOrEqual(60);
    worst.minOnRoad = Math.min(worst.minOnRoad, a.onRoad);
    worst.maxNewestAgeMin = Math.max(worst.maxNewestAgeMin, Math.round(a.newestAgeMin));
    worst.maxBids = Math.max(worst.maxBids, a.bids);
    worst.maxLoads = Math.max(worst.maxLoads, a.loads);
    worst.maxDocks = Math.max(worst.maxDocks, a.docks);
    worst.maxReturns = Math.max(worst.maxReturns, a.returns);
    worst.maxOrphaned = Math.max(worst.maxOrphaned, a.orphaned);
    worst.maxStale = Math.max(worst.maxStale, a.stale);
    worst.maxBidsPerLoadSlot = Math.max(worst.maxBidsPerLoadSlot, Math.round((a.bids / (a.loads * CARRIERS.length)) * 100) / 100);
  }
  return { ...worst, reused, end: audit(useMarket.getState()) };
}

beforeEach(() => {
  vi.useFakeTimers({ now: START, toFake: ["Date", "setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
  vi.spyOn(Math, "random").mockImplementation(seeded(8));
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("the simulated market stays alive (#8) with bounded bids and fresh ids (#26)", () => {
  it("8 hours at ×20, ticking every second", { timeout: 120_000 }, async () => {
    storage();
    const { useMarket } = await open();
    const r = drive(useMarket, 8, 1000);
    console.info("8 h at ×20:", JSON.stringify(r));
    expect(r.reused).toBe(0);
    // Everything stays bounded: nothing grows with the length of the session.
    expect(r.maxLoads).toBeLessThan(120);
    expect(r.maxDocks).toBeLessThan(300);
    expect(r.maxReturns).toBeLessThan(40);
  });

  it("2 hours at ×20 in a background tab ticking once a minute", { timeout: 120_000 }, async () => {
    storage();
    const { useMarket, setVisible } = await open();
    setVisible(false);
    const r = drive(useMarket, 2, MIN);
    console.info("2 h at ×20, one tick a minute:", JSON.stringify(r));
    expect(r.reused).toBe(0);
    expect(r.maxLoads).toBeLessThan(120);
  });

  it("catches up in bounded steps after a gap, and re-seeds around now after a long one", async () => {
    storage();
    const { useMarket, setVisible } = await open();
    vi.advanceTimersByTime(5_000);
    useMarket.getState().tick();
    const mine = useMarket.getState().postLoad({ from: "lezo", to: "bayonne", goods: "food", pallets: 10, kg: 4_000, vehicle: "artic", pickupAt: simNow(useMarket.getState()) + 3 * HOUR, mode: "bids" });

    // Hidden for 15 minutes with no ticks at all (5 sim hours at ×20): replayed on return.
    setVisible(false);
    vi.advanceTimersByTime(15 * MIN);
    const before = new Set(useMarket.getState().loads.map((l) => l.id));
    const t = performance.now();
    setVisible(true);
    expect(performance.now() - t).toBeLessThan(500);
    let s = useMarket.getState();
    expect(s.simAt).toBe(simNow(s));
    expect(audit(s).onRoad).toBeGreaterThanOrEqual(5);
    expect(audit(s).newestAgeMin).toBeLessThanOrEqual(60);
    expect(s.loads.some((l) => before.has(l.id))).toBe(true);
    // Nobody accepted a bid on your load while you were away, so it expired after its pickup time.
    expect(s.loads.find((l) => l.id === mine.id)?.status).toBe("cancelled");

    // Asleep for 3 hours (60 sim hours): a fresh day around now with ids never seen before; your load is kept.
    const seen = new Set([...before, ...s.loads.map((l) => l.id)]);
    setVisible(false);
    vi.advanceTimersByTime(3 * HOUR);
    setVisible(true);
    s = useMarket.getState();
    const a = audit(s);
    expect(a.onRoad).toBeGreaterThanOrEqual(5);
    expect(a.newestAgeMin).toBeLessThanOrEqual(60);
    expect(a.orphaned + a.stale + a.docksToMissingLoads + a.feedToMissingLoads).toBe(0);
    expect(s.loads.filter((l) => l.id !== mine.id).every((l) => !seen.has(l.id))).toBe(true);
    expect(s.loads.find((l) => l.id === mine.id)?.status).toBe("cancelled");
    expect(s.loads.filter((l) => l.status === "open").every((l) => l.pickupAt > simNow(s))).toBe(true);
  });

  it("issues load ids from a counter: yours are saved with their sequence and never handed out twice", async () => {
    const ls = storage();
    let { useMarket, win } = await open();
    const post = () => useMarket.getState().postLoad({ from: "lezo", to: "bayonne", goods: "food", pallets: 10, kg: 4_000, vehicle: "artic", pickupAt: simNow(useMarket.getState()) + 3 * HOUR, mode: "bids" }).id;
    const first = [post(), post()];
    expect(first).toEqual(["ZM-5001", "ZM-5002"]);
    win.dispatchEvent(new Event("pagehide"));
    const saved = JSON.parse(ls.data.get(KEY)!);
    expect(saved).toMatchObject({ v: 2, seq: 3 });

    vi.advanceTimersByTime(10 * MIN);
    ({ useMarket, win } = await open());
    // The market clock carried on from the save, at wall-clock speed while the page was closed.
    expect(useMarket.getState().clock.sim).toBe(saved.clock.sim + 10 * MIN);
    useMarket.getState().cancelLoad("ZM-5002");
    useMarket.getState().reset();
    expect(post()).toBe("ZM-5003");
    expect(useMarket.getState().loads.filter((l) => l.mine && l.id.startsWith("ZM-5"))).toHaveLength(1);
  });

  it("saves at most every few seconds, and only when your data changed", async () => {
    const ls = storage();
    const { useMarket } = await open();
    for (let i = 0; i < 120; i++) {
      vi.advanceTimersByTime(1000);
      useMarket.getState().tick();
    }
    // Two minutes of market activity: the first save, then only the market clock once a minute.
    expect(ls.writes).toBeGreaterThanOrEqual(1);
    expect(ls.writes).toBeLessThanOrEqual(3);
    const before = ls.writes;
    // Change something of yours every second for half a minute: one write per 5 s at most.
    for (let i = 0; i < 30; i++) {
      useMarket.getState().setRole(i % 2 ? "carrier" : "shipper");
      vi.advanceTimersByTime(1000);
      useMarket.getState().tick();
    }
    vi.advanceTimersByTime(5000);
    expect(ls.writes - before).toBeGreaterThanOrEqual(6);
    expect(ls.writes - before).toBeLessThanOrEqual(7);
    const saved = JSON.parse(ls.data.get(KEY)!);
    expect(saved.role).toBe("carrier");
    // The market clock travels with the save, so a reload carries on where you left off.
    expect(saved.clock).toMatchObject({ speed: 20 });
    expect(saved.clock.sim).toBeGreaterThan(saved.clock.real);
  });
});

/**
 * What the screens would mark as not allowed: a pending bid whose truck may not run the load at the pickup it offers
 * (the bid's rule chip), and a booked or assigned job whose truck may not run it (Dispatch's rule and ZBE alerts).
 */
function notAllowed(s: State): string[] {
  const ctx = { anchor: s.anchor, past: s.ledger };
  const byId = new Map(s.loads.map((l) => [l.id, l]));
  const out: string[] = [];
  for (const b of s.bids) {
    const l = byId.get(b.loadId);
    const v = VEHICLE.get(b.vehicleId);
    if (b.status !== "pending" || !l || !v) continue;
    if (!runVerdict({ ...l, pickupAt: b.pickupEta }, v, s.loads, ctx).ok) out.push(`bid ${b.id}: ${v.id} on ${l.id} ${l.from}→${l.to}`);
  }
  for (const l of s.loads) {
    const v = l.vehicleId ? VEHICLE.get(l.vehicleId) : undefined;
    if (!v || (l.status !== "booked" && l.status !== "assigned")) continue;
    if (!runVerdict(l, v, s.loads, ctx).ok || zbeProblem(l, v, l.departedAt ?? l.pickupAt)) out.push(`${l.status} ${l.id}: ${v.id} ${l.from}→${l.to}`);
  }
  return out;
}

const isCabotageFor = (l: Pick<Load, "from" | "to" | "vehicleId">) => {
  const c = CARRIER.get(VEHICLE.get(l.vehicleId ?? "")?.carrierId ?? "");
  return !!c && jobScope(l, c.country) === "cabotage";
};

/**
 * Runs the market like drive() and checks the rules after every tick: nothing the screens would mark as not allowed,
 * and every truck that leaves may run its job at the moment it leaves. Keeps every load that was ever delivered, so
 * at the end each cabotage operation can be judged against the vehicle's whole history, not just what the board
 * still shows.
 */
function driveLegal(useMarket: Store, hours: number, every: number) {
  const seenMoving = new Set<string>();
  const delivered = new Map<string, Load>();
  const problems: string[] = [];
  let cabotageBids = 0;
  const bidsSeen = new Set<string>();
  const anchor = useMarket.getState().anchor;
  const steps = (hours * HOUR) / every;
  let maxLedger = 0;
  for (let i = 0; i <= steps; i++) {
    if (i) {
      vi.advanceTimersByTime(every);
      useMarket.getState().tick();
    }
    const s = useMarket.getState();
    expect(s.anchor, "the market day never re-opened").toBe(anchor);
    for (const p of notAllowed(s)) problems.push(`${i * every} ms: ${p}`);
    const byId = new Map(s.loads.map((l) => [l.id, l]));
    for (const b of s.bids) {
      if (bidsSeen.has(b.id)) continue;
      bidsSeen.add(b.id);
      const l = byId.get(b.loadId);
      if (b.status === "pending" && l && isCabotageFor({ ...l, vehicleId: b.vehicleId })) cabotageBids++;
    }
    for (const l of s.loads) {
      if (l.status === "inTransit" && !seenMoving.has(l.id)) {
        seenMoving.add(l.id);
        const v = l.vehicleId ? VEHICLE.get(l.vehicleId) : undefined;
        if (v && !runVerdict(l, v, s.loads, { anchor: s.anchor, past: s.ledger }).ok) problems.push(`${i * every} ms: ${l.id} left on ${v.id} though not allowed`);
      }
      if (l.status === "delivered") delivered.set(l.id, l);
    }
    maxLedger = Math.max(maxLedger, s.ledger.length);
  }
  // Every cabotage operation, judged with everything its vehicle ever did (the board prunes old loads; the ledger must not forget them).
  const s = useMarket.getState();
  const all = [...delivered.values(), ...s.loads.filter((l) => !delivered.has(l.id))];
  const cabotage = [...delivered.values()].filter(isCabotageFor);
  const unfair = cabotage.filter((l) => !runVerdict(l, VEHICLE.get(l.vehicleId!)!, all, { anchor }).ok).map((l) => `${l.id} on ${l.vehicleId}`);
  // Operations per vehicle and host country, for the report.
  const perVehicle: Record<string, number> = {};
  for (const l of cabotage) perVehicle[`${l.vehicleId}@${PLACES[l.from].country}`] = (perVehicle[`${l.vehicleId}@${PLACES[l.from].country}`] ?? 0) + 1;
  return { problems, unfair, cabotageBids, cabotageRun: cabotage.length, perVehicle, delivered: delivered.size, maxLedger, ledger: s.ledger.length };
}

describe("the simulated market keeps the per-vehicle rules (licence, tachograph, cabotage, ZBE)", () => {
  it("8 hours at ×20: no bid or booking the screens would mark as not allowed, at any tick", { timeout: 300_000 }, async () => {
    storage();
    const { useMarket } = await open();
    const r = driveLegal(useMarket, 8, 1000);
    console.info("rules, 8 h at ×20:", JSON.stringify({ ...r, problems: r.problems.slice(0, 5), unfair: r.unfair.slice(0, 5), problemCount: r.problems.length, unfairCount: r.unfair.length }));
    expect(r.problems).toEqual([]);
    expect(r.unfair).toEqual([]);
    // The rules were exercised, not dodged: carriers did bid and run cabotage.
    expect(r.cabotageBids).toBeGreaterThanOrEqual(5);
    expect(r.cabotageRun).toBeGreaterThanOrEqual(5);
    // The ledger of pruned jobs stays small.
    expect(r.maxLedger).toBeLessThan(300);
  });

  it("2 hours at ×20 in a background tab: the same, ticking once a minute", { timeout: 120_000 }, async () => {
    storage();
    const { useMarket, setVisible } = await open();
    setVisible(false);
    const r = driveLegal(useMarket, 2, MIN);
    console.info("rules, 2 h at ×20, one tick a minute:", JSON.stringify({ ...r, problems: r.problems.slice(0, 5), unfair: r.unfair.slice(0, 5) }));
    expect(r.problems).toEqual([]);
    expect(r.unfair).toEqual([]);
  });

  it("anchors the cabotage history when the market opens, and again on a reset or a fresh day", async () => {
    storage();
    const { useMarket, setVisible } = await open();
    let s = useMarket.getState();
    expect(s.anchor).toBe(START);
    expect(s.ledger).toEqual([]);
    // A fresh day after a long sleep starts its own history.
    setVisible(false);
    vi.advanceTimersByTime(3 * HOUR);
    setVisible(true);
    s = useMarket.getState();
    expect(s.anchor).toBe(simNow(s));
    expect(s.ledger).toEqual([]);
    expect(notAllowed(s)).toEqual([]);
    // A reset moves the clock back to the wall clock: the history is anchored there.
    s.reset();
    s = useMarket.getState();
    expect(s.anchor).toBe(Date.now());
    expect(notAllowed(s)).toEqual([]);
  });

  it("books an instant load on a carrier and truck the rules allow", async () => {
    storage();
    const { useMarket } = await open();
    const s = useMarket.getState();
    s.setRole("shipper");
    // Cabotage in Spain: only trucks with an open window may take it (and the French or Lithuanian carriers' ones in a cooling-off may not).
    const l = s.postLoad({ from: "pasaia", to: "irun", goods: "food", pallets: 20, kg: 9_000, vehicle: "artic", pickupAt: simNow(s) + 3 * HOUR, mode: "instant" });
    useMarket.getState().bookInstant(l.id);
    const booked = useMarket.getState().loads.find((x) => x.id === l.id)!;
    expect(booked.status).toBe("booked");
    expect(booked.vehicleId).toBeDefined();
    expect(notAllowed(useMarket.getState())).toEqual([]);
  });
});

describe("a bad saved state (#5) costs the bad records, never the app", () => {
  /** A saved load record; `over` may break it on purpose. */
  const load = (over: Record<string, unknown> = {}) => ({
    id: "ZM-5001",
    shipperId: "s-itsaso",
    from: "lezo",
    to: "bayonne",
    goods: "food",
    pallets: 10,
    kg: 4_000,
    vehicle: "artic",
    pickupAt: START + 3 * HOUR,
    deliverBy: START + 6 * HOUR,
    mode: "bids",
    target: 300,
    status: "open",
    ecmr: "none",
    createdAt: START - HOUR,
    mine: true,
    ...over,
  });
  const bid = (over: Record<string, unknown> = {}) => ({ id: "b-ok", loadId: "ZM-5001", carrierId: "c-adour", vehicleId: "v-ad1", amount: 280, pickupEta: START + 3 * HOUR, at: START - 30 * MIN, status: "pending", ...over });

  it("drops records that don't match the catalogues and keeps the rest", async () => {
    const corrupt = {
      v: 1,
      role: "pirate",
      settings: { layers: { trucks: "yes", lanes: false }, terrain: 1, time: "eclipse" },
      loads: [
        load(),
        // The record from the audit: an unknown place used to crash /es/app/loads on every reload.
        load({ id: "ZM-5002", from: "atlantis" }),
        load({ id: "ZM-5003", vehicle: "zeppelin" }),
        load({ id: "ZM-5004", status: "inTransit", carrierId: "c-ghost", vehicleId: "v-ad1", departedAt: START }),
        load({ id: "ZM-5005", pickupAt: "soon" }),
        load({ id: "ZM-5006", status: "booked" }),
        load({ id: "ZM-4106" }),
        "not a load",
        null,
      ],
      bids: [bid(), bid({ id: "b-orphan", loadId: "ZM-5002" }), bid({ id: "b-wrong-truck", vehicleId: "v-kf1" }), bid({ id: "b-nan", amount: Number.NaN })],
      returns: [
        { id: "rt-me-ok", carrierId: "c-txingudi", vehicleId: "v-tx2", from: "bayonne", to: "irun", departAt: START + 4 * HOUR, freePallets: 20, discount: 0.3, status: "open", mine: true },
        { id: "rt-me-gone", carrierId: "c-txingudi", vehicleId: "v-tx2", from: "bayonne", to: "irun", departAt: START + 4 * HOUR, freePallets: 20, discount: 0.3, status: "matched", matchedLoadId: "ZM-9999", mine: true },
        { id: "rt-me-bad", carrierId: "c-txingudi", vehicleId: "v-tx2", from: "bayonne", to: "nowhere", departAt: START, freePallets: 20, discount: 0.3, status: "open", mine: true },
      ],
      docks: [
        { id: "dk-ok", warehouseId: "w-zaisa", door: 2, start: START + HOUR, end: START + 2 * HOUR, direction: "in", carrierId: "c-baltic", loadId: "ZM-gone", pallets: 10, status: "scheduled", mine: true },
        { id: "dk-moon", warehouseId: "w-moon", door: 0, start: START, end: START + HOUR, direction: "in", carrierId: "c-baltic", pallets: 10, status: "scheduled", mine: true },
        { id: "dk-door", warehouseId: "w-zaisa", door: 99, start: START, end: START + HOUR, direction: "in", carrierId: "c-baltic", pallets: 10, status: "scheduled", mine: true },
      ],
      binPatches: {
        "w-zaisa|R01-B02-L1": { status: "blocked" },
        "w-zaisa|R01-B03-L1": { status: "empty" },
        "w-zaisa|R01-B05-L1": { status: "blocked", heldFrom: "stored" },
        "w-zaisa|R01-B06-L1": { status: "empty", sku: null },
        "w-zaisa|R01-B01-L1": { status: "stored", sku: "sku-unobtainium" },
        "w-zaisa|R99-B01-L1": { status: "empty" },
        "w-moon|R01-B01-L1": { status: "empty" },
        "w-zaisa|R01-B04-L1": { row: 7 },
      },
    };
    storage({ [KEY]: JSON.stringify(corrupt) });
    const { useMarket } = await open();
    const s = useMarket.getState();
    expect(s.ready).toBe(true);
    expect(s.loads.filter((l) => l.id.startsWith("ZM-5")).map((l) => l.id)).toEqual(["ZM-5001"]);
    expect(s.loads.filter((l) => l.id === "ZM-4106")).toHaveLength(1);
    expect(s.bids.filter((b) => b.loadId === "ZM-5001").map((b) => b.id)).toEqual(["b-ok"]);
    // Your open trip comes back; one matched to a load that is gone, or to an unknown place, doesn't.
    expect(s.returns.filter((r) => r.id.startsWith("rt-me")).map((r) => [r.id, r.status])).toEqual([["rt-me-ok", "open"]]);
    expect(s.docks.filter((d) => d.mine).map((d) => [d.id, d.loadId])).toEqual([["dk-ok", undefined]]);
    expect(Object.keys(s.binPatches).sort()).toEqual(["w-zaisa|R01-B02-L1", "w-zaisa|R01-B03-L1", "w-zaisa|R01-B05-L1"]);
    expect(s.role).toBe("dispatcher");
    expect(s.settings).toEqual({ layers: { trucks: true, lanes: false, returns: true, warehouses: true, network: true, buildings: true }, terrain: false, time: "live" });
    expect(s.userSeq).toBe(2);

    // What the loads screen computes for every load and return trip: none of it throws now.
    expect(() => {
      for (const l of s.loads) {
        void PLACES[l.from].lnglat;
        void PLACES[l.to].lnglat;
        void route(l.from, l.to).path;
        void quote({ from: l.from, to: l.to, vehicle: l.vehicle }).fair;
        void SHIPPER.get(l.shipperId)!.name;
        for (const rt of s.returns) fitsReturn(l, rt, VEHICLE.get(rt.vehicleId)!.type);
      }
      for (let i = 0; i < 60; i++) {
        vi.advanceTimersByTime(1000);
        useMarket.getState().tick();
      }
    }).not.toThrow();

    // The next save replaces the bad payload with a clean one of the current version.
    vi.advanceTimersByTime(6000);
    const saved = JSON.parse(localStorage.getItem(KEY)!);
    expect(saved.v).toBe(2);
    expect(Number.isFinite(saved.clock.sim)).toBe(true);
    expect(saved.loads.map((l: Load) => l.id)).toEqual(["ZM-5001"]);
  });

  it("ignores a payload it can't read at all", async () => {
    for (const raw of ["{not json", JSON.stringify({ v: 99, loads: [load({ from: "atlantis" })] }), JSON.stringify([1, 2]), "null"]) {
      storage({ [KEY]: raw });
      const { useMarket } = await open();
      expect(useMarket.getState().ready).toBe(true);
      expect(useMarket.getState().loads.some((l) => l.id.startsWith("ZM-5"))).toBe(false);
    }
  });

  it("migrates a version 1 payload and keeps old load ids clear of new ones", async () => {
    storage({ [KEY]: JSON.stringify({ v: 1, role: "carrier", settings: { terrain: true }, loads: [load({ id: "ZM-54210" })], bids: [bid({ loadId: "ZM-54210" })], returns: [], docks: [], binPatches: {} }) });
    const { useMarket } = await open();
    const s = useMarket.getState();
    expect(s.role).toBe("carrier");
    expect(s.settings.terrain).toBe(true);
    expect(s.loads.find((l) => l.id === "ZM-54210")).toBeDefined();
    expect(s.bids.find((b) => b.loadId === "ZM-54210")).toBeDefined();
    const next = s.postLoad({ from: "lezo", to: "bayonne", goods: "food", pallets: 10, kg: 4_000, vehicle: "artic", pickupAt: START + 3 * HOUR, mode: "bids" });
    expect(next.id).toBe("ZM-54211");
  });

  it("keeps a pallet move across a reload", async () => {
    storage();
    let { useMarket, win } = await open();
    const bins = useMarket.getState().getBins("w-zaisa");
    const from = bins.find((b) => b.sku && b.status === "stored")!;
    const to = bins.find((b) => b.status === "empty" && b.zone === from.zone)!;
    useMarket.getState().moveBin("w-zaisa", from.loc, to.loc);
    win.dispatchEvent(new Event("pagehide"));
    ({ useMarket, win } = await open());
    const after = useMarket.getState().getBins("w-zaisa");
    const emptied = after.find((b) => b.loc === from.loc)!;
    expect([emptied.status, emptied.sku, emptied.qty]).toEqual(["empty", undefined, undefined]);
    expect(after.find((b) => b.loc === to.loc)).toMatchObject({ status: "stored", sku: from.sku, qty: from.qty });
  });
});
