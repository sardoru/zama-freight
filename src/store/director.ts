// The market director: what the other shippers and carriers do while you
// watch. It runs on simulated time. Every rate below is per simulated minute
// and is applied over the sim time that passed since the last call, in steps
// of at most STEP, so a background tab that the browser throttles to one tick
// a minute sees the same market as a foreground tab ticking every second.
// Trucks follow the market's rules: one job at a time, a return trip holds its
// truck, the right type and payload, and the cabotage limits.
import { ME, SHIPPERS, VEHICLE, VEHICLES } from "@/data/companies";
import { route } from "@/data/network";
import { PLACE_IDS, type PlaceId } from "@/data/places";
import { canCarry, driveMs, eligibleCarriers, fitsReturn, HOUR, loadDocks, MIN, newId, regularDocks, vehicleFor } from "@/data/seed";
import type { Bid, Carrier, DockAppt, FeedEvent, Load, ReturnTrip, Shipper, Vehicle, VehicleType } from "@/data/types";
import { WAREHOUSES } from "@/data/warehouses";
import { CABOTAGE_LIMIT, cabotageUsed, isCabotage } from "@/lib/checks";
import { quote, VEHICLE_SPECS } from "@/lib/pricing";
import type { rng } from "@/lib/random";

/** The longest stretch of sim time one director step covers. */
export const STEP = 5 * MIN;
/** Longer gaps (a sleeping laptop, a frozen tab) re-seed the day around now instead of replaying it. */
export const MAX_CATCH_UP = 6 * HOUR;
/** Trucks the director keeps on the road. */
export const MIN_ON_ROAD = 6;
/** The seed uses ZM-4101…4130; director loads continue the same series and never reuse a number. */
export const FIRST_WORLD_SEQ = 131;
export const worldLoadId = (n: number) => `ZM-4${n}`;

const FEED_MAX = 60;
/** Finished market loads that stay on the board (done tab, dispatch); older ones are pruned with everything that points at them. Yours stay. */
const KEEP_FINISHED = 24;
/** A truck is assigned to a job, and held for it, this long before pickup. */
const ASSIGN_LEAD = 30 * MIN;
/** Shippers take the best of two or more offers once pickup is this close… */
const ACCEPT_LEAD = 150 * MIN;
/** …and any offer at all once it is this close. */
const LAST_CALL = 60 * MIN;
/** With no offer they can use this close to pickup, a shipper books at the instant price. */
const FALLBACK = 45 * MIN;
/** Open loads nobody booked expire this long after their pickup time… */
const EXPIRE_AFTER = 45 * MIN;
/** …unless the shipper still moves the pickup on: other shippers do that while a load is younger than this. */
const ROLL_FOR = 8 * HOUR;
/** To keep trucks on the road, one may leave up to this long before its pickup. */
const PULL_AHEAD = 30 * MIN;
/** The board never goes this long without a new load. */
const MAX_QUIET = 30 * MIN;
/** Share of new loads posted at short notice (pickup within two hours). */
const SPOT_SHARE = 0.4;
/** Empty legs the other carriers post at once (each holds its truck until it leaves). */
const MAX_OPEN_RETURNS = 4;
const RETURN_POST_CHANCE = 0.3;
/** Matched return trips stay listed this long after they leave. */
const RETURNS_KEEP = 6 * HOUR;
/** Regular dock traffic is scheduled this far ahead (the timeline shows 12 hours)… */
const DOCKS_AHEAD = 12 * HOUR;
/** …and appointments leave it this long after they end (it shows 2 hours back). */
const DOCKS_KEEP = 3 * HOUR;

// Rates per simulated minute.
const POST_RATE = 16 / 60;
const BID_RATE = 1 / 30;
const BID_RATE_URGENT = 1 / 10;
const INSTANT_RATE = 1 / 12;
const RETURN_MATCH_RATE = 1 / 30;

const Q5 = 5 * MIN;
const Q15 = 15 * MIN;
const round5 = (v: number) => Math.round(v / 5) * 5;
/** Probability that an event with this rate (per minute) happens within dt minutes. */
const chance = (rate: number, dt: number) => 1 - Math.exp(-rate * dt);

export const ev = (kind: FeedEvent["kind"], vars: FeedEvent["vars"], at: number, loadId?: string, key: string = kind): FeedEvent => ({
  id: newId("f"),
  at,
  kind,
  key,
  vars,
  loadId,
});

/** What decides which trucks are free: the loads, the return trips and the bids. */
export interface Bookings {
  loads: Load[];
  returns: ReturnTrip[];
  bids: Bid[];
}

/** The truck a booked load was promised: its return trip's, else the one named in the accepted bid, else the one planned when it was booked. */
export function promisedVehicle(l: Pick<Load, "id" | "returnTripId" | "status" | "vehicleId">, m: Bookings) {
  return (
    (l.returnTripId ? m.returns.find((r) => r.id === l.returnTripId)?.vehicleId : undefined) ??
    m.bids.find((b) => b.loadId === l.id && b.status === "accepted")?.vehicleId ??
    (l.status === "booked" ? l.vehicleId : undefined)
  );
}

/**
 * A truck of the carrier that can take the load (type and weight) and is free for it: not on another active job and
 * not held for a return trip other than the load's own. The load's promised truck if that one is free, else rather
 * not a truck promised to another of the carrier's booked loads; undefined when none is free. `taken` holds trucks
 * already handed out elsewhere.
 */
export function freeVehicle(carrierId: string, load: Load, m: Bookings, taken?: Set<string>) {
  const busy = new Set<string>(taken);
  const waiting = new Set<string>();
  for (const l of m.loads) {
    if (l.id !== load.id && (l.status === "assigned" || l.status === "inTransit") && l.vehicleId) busy.add(l.vehicleId);
    if (l.status === "booked") waiting.add(l.id);
  }
  // A return trip holds its truck while it waits for a load, and until that load has been given its truck.
  for (const r of m.returns) if (r.id !== load.returnTripId && (r.status === "open" || waiting.has(r.matchedLoadId ?? ""))) busy.add(r.vehicleId);
  const free = VEHICLES.filter((v) => v.carrierId === carrierId && canCarry(v, load.vehicle, load.kg) && !busy.has(v.id));
  const own = promisedVehicle(load, m);
  const others = new Set(m.loads.filter((l) => l.id !== load.id && l.status === "booked" && l.carrierId === carrierId).map((l) => promisedVehicle(l, m)));
  return free.find((v) => v.id === own) ?? free.find((v) => !others.has(v.id)) ?? free[0];
}

/** The job would be cabotage for a carrier that has used up this week's operations. */
export const cabotageFull = (l: Pick<Load, "from" | "to">, carrierId: string, loads: Load[]) => isCabotage(l, carrierId) && cabotageUsed(carrierId, loads) >= CABOTAGE_LIMIT;

/**
 * A load booked on a return trip: the trip's carrier at its discount, picked up no earlier than an hour before the
 * truck leaves, and due as much later as the pickup moved.
 */
export function onReturnTrip(l: Load, rt: ReturnTrip): Load & { price: number } {
  const pickupAt = Math.max(l.pickupAt, rt.departAt - HOUR);
  const price = Math.round((l.target * (1 - rt.discount)) / 5) * 5;
  return { ...l, status: "booked", carrierId: rt.carrierId, price, returnTripId: rt.id, pickupAt, deliverBy: l.deliverBy + (pickupAt - l.pickupAt), ecmr: "draft" };
}

/** Everything the director moves. */
export interface World {
  loads: Load[];
  bids: Bid[];
  returns: ReturnTrip[];
  docks: DockAppt[];
  feed: FeedEvent[];
  /** Number of the next director load (its id is ZM-4<seq>). */
  seq: number;
  /** Sim time up to which regular dock traffic is scheduled. */
  docksUntil: number;
}

/** Who can serve a load (one call site, so carrier rules apply everywhere the director picks a carrier). */
const carriersFor = (l: Pick<Load, "vehicle" | "kg">): Carrier[] => eligibleCarriers(l.vehicle, l.kg).filter((c) => c.id !== ME.carrierId);

const OTHER_SHIPPERS = SHIPPERS.filter((s) => s.id !== ME.shipperId);
/** Steel goes on flatbeds and the cold chain in reefers; dry goods are 40 % van, 35 % rigid and 25 % artic loads. */
function vehicleTypeFor(s: Shipper, rand: () => number): VehicleType {
  if (s.sector === "steel") return "flatbed";
  if (["chilled", "frozen", "pharma"].includes(s.sector)) return "reefer";
  const x = rand();
  return x < 0.4 ? "van" : x < 0.75 ? "rigid" : "artic";
}

/** Destinations from a place, weighted towards the longer runs (the corridor's business is cross-border). */
const destinations = new Map<PlaceId, { to: PlaceId; w: number }[]>();
function destination(from: PlaceId, rand: () => number): PlaceId {
  let opts = destinations.get(from);
  if (!opts) {
    opts = PLACE_IDS.filter((p) => p !== from && route(from, p).km > 4).map((to) => ({ to, w: route(from, to).minutes ** 1.5 }));
    destinations.set(from, opts);
  }
  let x = rand() * opts.reduce((a, o) => a + o.w, 0);
  for (const o of opts) if ((x -= o.w) <= 0) return o.to;
  return opts[opts.length - 1].to;
}

const FLEETS = new Map<string, Vehicle[]>();
for (const v of VEHICLES) FLEETS.set(v.carrierId, [...(FLEETS.get(v.carrierId) ?? []), v]);

function poisson(mean: number, rand: () => number): number {
  const limit = Math.exp(-mean);
  let k = 0;
  for (let p = rand(); p > limit; p *= rand()) k++;
  return k;
}

const same = <T>(a: readonly T[], b: readonly T[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/**
 * Moves a load through what must have happened by `now`, at the times it would
 * have happened: used for your own loads after a reload or a long absence.
 */
export function settle(l: Load, now: number): Load {
  let x = l;
  for (;;) {
    if (x.status === "open" && now > x.pickupAt + EXPIRE_AFTER) x = { ...x, status: "cancelled" };
    else if (x.status === "booked" && x.carrierId && x.carrierId !== ME.carrierId && now >= x.pickupAt - ASSIGN_LEAD) {
      const v = (x.vehicleId ? VEHICLE.get(x.vehicleId) : undefined) ?? vehicleFor(x.carrierId, x.vehicle, x.kg);
      if (!v) break;
      x = { ...x, status: "assigned", vehicleId: v.id, ecmr: "shipper" };
    } else if (x.status === "assigned" && now >= x.pickupAt) x = { ...x, status: "inTransit", departedAt: x.pickupAt, ecmr: "carrier" };
    else if (x.status === "inTransit" && x.departedAt !== undefined && now >= x.departedAt + driveMs(x)) x = { ...x, status: "delivered", deliveredAt: x.departedAt + driveMs(x), ecmr: "delivered" };
    else break;
  }
  return x;
}

/**
 * Runs the market from sim time `from` to `to`. Returns the new world (arrays
 * that did not change keep their identity) and the events it produced.
 */
export function advanceWorld(w: World, from: number, to: number, rand: () => number = Math.random): { world: World; events: FeedEvent[] } {
  const d = new Director(w, rand);
  for (let t = from; t < to; ) {
    const t1 = Math.min(to, t + STEP);
    d.step(t, t1);
    t = t1;
  }
  return d.result(w);
}

class Director implements Bookings {
  loads: Load[];
  bids: Bid[];
  returns: ReturnTrip[];
  docks: DockAppt[];
  events: FeedEvent[] = [];
  seq: number;
  docksUntil: number;
  private docksAdded = false;
  private readonly r: ReturnType<typeof rng>;

  constructor(
    w: World,
    private readonly rand: () => number,
  ) {
    this.loads = [...w.loads];
    this.bids = [...w.bids];
    this.returns = [...w.returns];
    this.docks = [...w.docks];
    this.seq = w.seq;
    this.docksUntil = w.docksUntil;
    this.r = {
      next: rand,
      int: (min, max) => Math.floor(rand() * (max - min + 1)) + min,
      pick: (arr) => arr[Math.floor(rand() * arr.length)],
      chance: (p) => rand() < p,
    };
  }

  step(t0: number, t1: number) {
    const dt = (t1 - t0) / MIN;
    this.move(t0, t1);
    this.expire(t0, t1);
    this.bid(t1, dt);
    this.book(t1, dt);
    this.matchReturns(t1, dt);
    this.post(t1, dt);
    this.keepOnRoad(t1);
    this.tidy(t1);
  }

  result(w: World): { world: World; events: FeedEvent[] } {
    if (this.docksAdded) this.docks.sort((a, b) => a.start - b.start);
    const ids = new Set(this.loads.map((l) => l.id));
    const live = (e: FeedEvent) => !e.loadId || ids.has(e.loadId);
    // Nothing in the feed points at a load that is gone. Newest first: of two at the same minute, the one that
    // happened later; and events can be older than what is already there (a delivery found after a reload).
    const fresh = this.events
      .map((e, i) => ({ e, i }))
      .filter(({ e }) => live(e))
      .sort((a, b) => b.e.at - a.e.at || b.i - a.i)
      .map(({ e }) => e);
    const feed = [...fresh, ...w.feed.filter(live)].sort((a, b) => b.at - a.at).slice(0, FEED_MAX);
    return {
      world: {
        loads: same(this.loads, w.loads) ? w.loads : this.loads,
        bids: same(this.bids, w.bids) ? w.bids : this.bids,
        returns: same(this.returns, w.returns) ? w.returns : this.returns,
        docks: same(this.docks, w.docks) ? w.docks : this.docks,
        feed: same(feed, w.feed) ? w.feed : feed,
        seq: this.seq,
        docksUntil: this.docksUntil,
      },
      events: this.events,
    };
  }

  private driving(): Set<string> {
    return new Set(this.loads.filter((l) => l.status === "inTransit" && l.vehicleId).map((l) => l.vehicleId!));
  }

  /**
   * Whether a carrier has a truck for a load picked up at `start`: fewer of its
   * jobs and waiting return trips overlap that run than it has vehicles able to
   * carry the load. A job holds its truck from assignment to delivery. Carriers
   * don't take on work they can't move.
   */
  private hasRoom(carrierId: string, l: Pick<Load, "vehicle" | "kg" | "from" | "to">, start: number, now: number): boolean {
    const fleet = (FLEETS.get(carrierId) ?? []).filter((v) => canCarry(v, l.vehicle, l.kg));
    if (!fleet.length) return false;
    const ids = new Set(fleet.map((v) => v.id));
    const from = start - ASSIGN_LEAD;
    const to = start + driveMs(l);
    let jobs = 0;
    for (const x of this.loads) {
      if (x.carrierId !== carrierId || (x.status !== "booked" && x.status !== "assigned" && x.status !== "inTransit")) continue;
      if (x.vehicleId ? !ids.has(x.vehicleId) : !fleet.some((v) => canCarry(v, x.vehicle, x.kg))) continue;
      // A late job still needs its truck from now.
      const leaves = x.departedAt ?? Math.max(x.pickupAt, now);
      if (leaves - ASSIGN_LEAD < to && from < leaves + driveMs(x) && ++jobs >= fleet.length) return false;
    }
    // An empty leg waiting for a load holds its truck until it leaves.
    for (const r of this.returns) if (r.carrierId === carrierId && r.status === "open" && ids.has(r.vehicleId) && from < r.departAt && ++jobs >= fleet.length) return false;
    return true;
  }

  /** A carrier for the load among those with a truck for it (and cabotage left), starting at a random one. */
  private carrierWithRoom(l: Load, start: number, now: number): Carrier | undefined {
    const pool = carriersFor(l);
    const first = Math.floor(this.rand() * pool.length);
    return pool.map((_, k) => pool[(first + k) % pool.length]).find((c) => !cabotageFull(l, c.id, this.loads) && this.hasRoom(c.id, l, start, now));
  }

  private bidsByLoad(): Map<string, Bid[]> {
    const m = new Map<string, Bid[]>();
    for (const b of this.bids) {
      const list = m.get(b.loadId);
      if (list) list.push(b);
      else m.set(b.loadId, [b]);
    }
    return m;
  }

  /** Deliveries, departures and truck assignments that fall due. */
  private move(t0: number, t1: number) {
    // Deliveries first: they free trucks for the assignments below.
    for (let i = 0; i < this.loads.length; i++) {
      const l = this.loads[i];
      if (l.status !== "inTransit" || l.departedAt === undefined) continue;
      const at = l.departedAt + driveMs(l);
      if (at > t1) continue;
      this.loads[i] = { ...l, status: "delivered", deliveredAt: at, ecmr: "delivered" };
      this.events.push(ev("delivered", { load: l.id, to: l.to }, at, l.id));
      this.maybePostReturn(l, at);
    }
    const driving = this.driving();
    for (let i = 0; i < this.loads.length; i++) {
      const l = this.loads[i];
      if (l.status === "assigned" && l.pickupAt <= t1) {
        // A truck still on another job (only after a restore) leaves once that one is delivered.
        if (l.vehicleId && driving.has(l.vehicleId)) continue;
        const at = Math.max(l.pickupAt, t0);
        this.loads[i] = { ...l, status: "inTransit", departedAt: at, ecmr: "carrier" };
        if (l.vehicleId) driving.add(l.vehicleId);
        this.events.push(ev("departed", { load: l.id, from: l.from, to: l.to }, at, l.id));
      } else if (l.status === "booked" && l.carrierId && l.carrierId !== ME.carrierId) {
        // Your own carrier's jobs wait for you to dispatch them.
        if (t1 < l.pickupAt - ASSIGN_LEAD) {
          // Booked without a truck named (your accepted bid, a seeded booking): plan the one it was promised.
          const planned = l.vehicleId ? undefined : (promisedVehicle(l, this) ?? vehicleFor(l.carrierId, l.vehicle, l.kg)?.id);
          if (planned) this.loads[i] = { ...l, vehicleId: planned };
          continue;
        }
        // One truck per job: a truck that is free now, the promised one if possible; otherwise it waits.
        const v = freeVehicle(l.carrierId, l, this);
        if (!v) continue;
        this.loads[i] = { ...l, status: "assigned", vehicleId: v.id, ecmr: "shipper" };
        this.events.push(ev("assigned", { load: l.id, plate: v.plate }, Math.max(l.pickupAt - ASSIGN_LEAD, t0), l.id));
      }
    }
  }

  /** A carrier that delivered far from its base sometimes posts the empty leg home. */
  private maybePostReturn(l: Load, at: number) {
    if (!l.carrierId || l.carrierId === ME.carrierId || !l.vehicleId || this.rand() >= RETURN_POST_CHANCE) return;
    const v = VEHICLE.get(l.vehicleId);
    if (!v || v.home === l.to || route(l.to, v.home).km < 8) return;
    if (this.returns.filter((r) => r.status === "open" && !r.mine).length >= MAX_OPEN_RETURNS) return;
    const rt: ReturnTrip = {
      id: newId("rt"),
      carrierId: v.carrierId,
      vehicleId: v.id,
      from: l.to,
      to: v.home,
      departAt: Math.ceil((at + (30 + this.rand() * 60) * MIN) / Q15) * Q15,
      freePallets: Math.max(2, Math.round(VEHICLE_SPECS[v.type].pallets * (0.4 + this.rand() * 0.6))),
      discount: Math.round((0.24 + this.rand() * 0.12) * 100) / 100,
      status: "open",
    };
    this.returns.push(rt);
    this.events.push(ev("return", { carrier: rt.carrierId, from: rt.from, to: rt.to }, at, undefined, "returnPosted"));
  }

  /**
   * Open loads nobody booked in time: another shipper moves the pickup two to
   * three hours on while the load is young, otherwise it comes off the board.
   */
  private expire(t0: number, t1: number) {
    const gone = new Set<string>();
    for (let i = 0; i < this.loads.length; i++) {
      const l = this.loads[i];
      if (l.status !== "open" || t1 <= l.pickupAt + EXPIRE_AFTER) continue;
      if (!l.mine && t1 - l.createdAt < ROLL_FOR) {
        const pickupAt = Math.ceil((t1 + (2 + this.rand()) * HOUR) / Q5) * Q5;
        this.loads[i] = { ...l, pickupAt, deliverBy: l.deliverBy + (pickupAt - l.pickupAt) };
        this.redock(this.loads[i]);
        continue;
      }
      this.loads[i] = { ...l, status: "cancelled" };
      gone.add(l.id);
      this.events.push(ev("alert", { load: l.id }, Math.max(t0, l.pickupAt + EXPIRE_AFTER), l.id, "expired"));
    }
    if (!gone.size) return;
    this.bids = this.bids.map((b) => (gone.has(b.loadId) && b.status === "pending" ? { ...b, status: "rejected" } : b));
    // Its dock slots that haven't happened yet are released.
    this.docks = this.docks.filter((d) => !d.loadId || !gone.has(d.loadId) || d.end <= t1);
  }

  /** Carriers with a truck for it (and cabotage left) bid on open loads they haven't bid on yet, more eagerly as pickup nears. */
  private bid(t1: number, dt: number) {
    const byLoad = this.bidsByLoad();
    for (const l of this.loads) {
      if (l.status !== "open") continue;
      if (this.rand() >= chance(l.pickupAt - t1 <= ACCEPT_LEAD ? BID_RATE_URGENT : BID_RATE, dt)) continue;
      const have = byLoad.get(l.id) ?? [];
      const pool = carriersFor(l).filter((c) => !have.some((b) => b.carrierId === c.id) && !cabotageFull(l, c.id, this.loads) && this.hasRoom(c.id, l, l.pickupAt, t1));
      if (!pool.length) continue;
      const c = pool[Math.floor(this.rand() * pool.length)];
      // The bid names the truck: one that is free now if there is one, else the carrier's usual one.
      const v = freeVehicle(c.id, l, this) ?? vehicleFor(c.id, l.vehicle, l.kg);
      if (!v) continue;
      const amount = round5(l.target * (0.85 + this.rand() * 0.22));
      const bid: Bid = { id: newId("b"), loadId: l.id, carrierId: c.id, vehicleId: v.id, amount, pickupEta: l.pickupAt + Math.round((this.rand() - 0.4) * 60) * MIN, at: t1, status: "pending" };
      this.bids.push(bid);
      byLoad.set(l.id, [...have, bid]);
      this.events.push(ev("bid", { carrier: c.id, amount, load: l.id }, t1, l.id));
    }
  }

  private booked(l: Load, carrierId: string, price: number, vehicleId?: string): Load {
    // The truck it was promised is planned on the load; your carrier's wins wait for you to pick the truck.
    return { ...l, status: "booked", carrierId, price, ecmr: "draft", vehicleId: carrierId === ME.carrierId ? undefined : vehicleId };
  }

  /** Shippers (not you) accept the best usable bid as pickup gets close; instant loads go to the first carrier who takes them. */
  private book(t1: number, dt: number) {
    const byLoad = this.bidsByLoad();
    const decided = new Map<string, string | null>();
    for (let i = 0; i < this.loads.length; i++) {
      const l = this.loads[i];
      if (l.status !== "open") continue;
      const toPickup = l.pickupAt - t1;
      const by = Math.max(l.pickupAt, t1);
      const pending = (byLoad.get(l.id) ?? []).filter((b) => b.status === "pending").sort((a, b) => a.amount - b.amount);
      // The cheapest offer from a carrier that can still move it and has cabotage left (your own trucks are yours to manage).
      const best = l.mine || toPickup > ACCEPT_LEAD ? undefined : pending.find((b) => !cabotageFull(l, b.carrierId, this.loads) && (b.mine || this.hasRoom(b.carrierId, l, by, t1)));
      if (best && ((pending.length >= 2 && toPickup <= ACCEPT_LEAD) || toPickup <= LAST_CALL)) {
        this.loads[i] = this.booked(l, best.carrierId, best.amount, best.vehicleId);
        decided.set(l.id, best.id);
        this.events.push(ev("booked", { load: l.id, carrier: best.carrierId, amount: best.amount }, t1, l.id, best.mine ? "won" : "booked"));
        continue;
      }
      // "The first carrier to accept takes it at this price"; a shipper with no offer it can use by the last call pays it too.
      const take = l.mode === "instant" ? this.rand() < chance(INSTANT_RATE, dt) : !l.mine && !best && toPickup <= FALLBACK;
      if (!take) continue;
      const carrier = this.carrierWithRoom(l, by, t1);
      if (!carrier) continue;
      const v = freeVehicle(carrier.id, l, this) ?? vehicleFor(carrier.id, l.vehicle, l.kg);
      this.loads[i] = this.booked(l, carrier.id, l.target, v?.id);
      decided.set(l.id, null);
      this.events.push(ev("booked", { load: l.id, carrier: carrier.id, amount: l.target }, t1, l.id));
    }
    if (!decided.size) return;
    this.bids = this.bids.map((b) => (b.status !== "pending" || !decided.has(b.loadId) ? b : { ...b, status: b.id === decided.get(b.loadId) ? "accepted" : "rejected" }));
  }

  /** A shipper somewhere books a load on one of the open return trips that hasn't left yet. */
  private matchReturns(t1: number, dt: number) {
    if (this.rand() >= chance(RETURN_MATCH_RATE, dt)) return;
    for (let j = 0; j < this.returns.length; j++) {
      const rt = this.returns[j];
      if (rt.status !== "open" || rt.departAt <= t1) continue;
      const v = VEHICLE.get(rt.vehicleId);
      const i = v ? this.loads.findIndex((x) => !x.mine && fitsReturn(x, rt, v.type) && !cabotageFull(x, rt.carrierId, this.loads)) : -1;
      if (i < 0) continue;
      const l = this.loads[i];
      const booked = onReturnTrip(l, rt);
      this.loads[i] = rt.carrierId === ME.carrierId ? booked : { ...booked, vehicleId: rt.vehicleId };
      this.returns[j] = { ...rt, status: "matched", matchedLoadId: l.id };
      this.bids = this.bids.map((b) => (b.loadId === l.id && b.status === "pending" ? { ...b, status: "rejected" } : b));
      this.events.push(ev("return", { load: l.id, carrier: rt.carrierId, from: rt.from, to: rt.to, amount: booked.price }, t1, l.id));
      return;
    }
  }

  /** A new load from one of the other shippers, sized for the vehicle it asks for, picked up `lead` from `at` (no id yet). */
  private draft(at: number, lead: number): Omit<Load, "id"> {
    const shipper = OTHER_SHIPPERS[Math.floor(this.rand() * OTHER_SHIPPERS.length)];
    const from = shipper.place;
    const to = destination(from, this.rand);
    const vehicle = vehicleTypeFor(shipper, this.rand);
    const spec = VEHICLE_SPECS[vehicle];
    const pallets = Math.min(spec.pallets, vehicle === "van" ? 1 + Math.floor(this.rand() * 4) : vehicle === "rigid" ? 4 + Math.floor(this.rand() * 10) : 10 + Math.floor(this.rand() * 22));
    const q = quote({ from, to, vehicle });
    const pickupAt = Math.ceil((at + lead) / Q5) * Q5;
    return {
      shipperId: shipper.id,
      from,
      to,
      goods: shipper.sector,
      pallets,
      kg: Math.min(spec.kg, pallets * (300 + Math.floor(this.rand() * 400))),
      vehicle,
      pickupAt,
      deliverBy: pickupAt + q.route.minutes * MIN + 3 * HOUR,
      mode: this.rand() < 0.3 ? "instant" : "bids",
      target: q.fair,
      status: "open",
      ecmr: "none",
      createdAt: at,
    };
  }

  /** A load's dock slots move with its new pickup (it never came to the old one). */
  private redock(l: Load) {
    this.docks = this.docks.filter((d) => d.loadId !== l.id);
    this.dock(l);
  }

  private add(l: Load) {
    this.loads.unshift(l);
    this.dock(l);
  }

  /** The dock slots a load needs at the warehouses on its route. */
  private dock(l: Load) {
    for (const w of WAREHOUSES) {
      if (w.place !== l.from && w.place !== l.to) continue;
      const add = loadDocks(
        l,
        w,
        this.docks.filter((d) => d.warehouseId === w.id),
        this.r,
      );
      if (!add.length) continue;
      this.docks.push(...add);
      this.docksAdded = true;
    }
  }

  /** New business keeps arriving, faster when the board is thin and slower when it is full. */
  private post(t1: number, dt: number) {
    let open = 0;
    let newest = -Infinity;
    for (const l of this.loads) {
      if (l.status === "open") open++;
      if (l.createdAt > newest) newest = l.createdAt;
    }
    const pace = open < 10 ? 1.4 : open < 18 ? 1 : open < 24 ? 0.5 : 0.2;
    let n = poisson(POST_RATE * pace * dt, this.rand);
    if (!n && t1 - newest >= MAX_QUIET) n = 1;
    for (let k = 0; k < n; k++) {
      const lead = this.rand() < SPOT_SHARE ? (40 + this.rand() * 60) * MIN : (2 + this.rand() * 4) * HOUR;
      const l: Load = { id: worldLoadId(this.seq++), ...this.draft(t1, lead) };
      this.add(l);
      this.events.push(ev("posted", { load: l.id, from: l.from, to: l.to, shipper: l.shipperId }, t1, l.id));
    }
  }

  /**
   * Keeps MIN_ON_ROAD trucks moving: first a truck due to leave within
   * PULL_AHEAD goes early, then a shipper books a truck that is free right now
   * at the instant price for a load that leaves straight away.
   */
  private keepOnRoad(t1: number) {
    let onRoad = this.loads.reduce((n, l) => n + (l.status === "inTransit" ? 1 : 0), 0);
    if (onRoad >= MIN_ON_ROAD) return;
    const driving = this.driving();
    const due = this.loads
      .map((l, i) => ({ l, i }))
      .filter(({ l }) => (l.status === "assigned" || l.status === "booked") && l.carrierId && l.carrierId !== ME.carrierId && l.pickupAt <= t1 + PULL_AHEAD)
      .sort((a, b) => a.l.pickupAt - b.l.pickupAt);
    for (const { l, i } of due) {
      if (onRoad >= MIN_ON_ROAD) return;
      let v: Vehicle | undefined;
      if (l.status === "assigned") {
        if (l.vehicleId && driving.has(l.vehicleId)) continue;
        v = l.vehicleId ? VEHICLE.get(l.vehicleId) : undefined;
      } else {
        v = freeVehicle(l.carrierId!, l, this);
        if (!v) continue;
        this.events.push(ev("assigned", { load: l.id, plate: v.plate }, t1, l.id));
      }
      this.loads[i] = { ...l, status: "inTransit", vehicleId: v?.id ?? l.vehicleId, pickupAt: Math.min(l.pickupAt, t1), departedAt: t1, ecmr: "carrier" };
      if (v) driving.add(v.id);
      this.events.push(ev("departed", { load: l.id, from: l.from, to: l.to }, t1, l.id));
      onRoad++;
    }
    for (let tries = 0; onRoad < MIN_ON_ROAD && tries < 8; tries++) if (this.spot(t1)) onRoad++;
  }

  /** A short-notice load booked at the instant price on a truck that is free right now. */
  private spot(at: number): boolean {
    const draft: Load = { ...this.draft(at, 0), id: "", pickupAt: at };
    const pool = carriersFor(draft);
    const first = Math.floor(this.rand() * Math.max(1, pool.length));
    for (let k = 0; k < pool.length; k++) {
      const carrier = pool[(first + k) % pool.length];
      if (cabotageFull(draft, carrier.id, this.loads) || !this.hasRoom(carrier.id, draft, at, at)) continue;
      const v = freeVehicle(carrier.id, draft, this);
      if (!v) continue;
      const l: Load = {
        ...draft,
        id: worldLoadId(this.seq++),
        mode: "instant",
        status: "inTransit",
        carrierId: carrier.id,
        vehicleId: v.id,
        price: draft.target,
        deliverBy: at + driveMs(draft) + 3 * HOUR,
        departedAt: at,
        ecmr: "carrier",
      };
      this.add(l);
      this.events.push(
        ev("posted", { load: l.id, from: l.from, to: l.to, shipper: l.shipperId }, at, l.id),
        ev("booked", { load: l.id, carrier: carrier.id, amount: l.target }, at, l.id),
        ev("departed", { load: l.id, from: l.from, to: l.to }, at, l.id),
      );
      return true;
    }
    return false;
  }

  /** Rolls the dock schedule forward, lets old return trips go and prunes the oldest finished market loads. */
  private tidy(t1: number) {
    if (this.docksUntil < t1 + DOCKS_AHEAD) {
      const from = this.docksUntil;
      const to = t1 + DOCKS_AHEAD;
      for (const w of WAREHOUSES) {
        const add = regularDocks(
          w,
          from,
          to,
          this.docks.filter((d) => d.warehouseId === w.id && d.end > from - HOUR),
          this.r,
        );
        if (!add.length) continue;
        this.docks.push(...add);
        this.docksAdded = true;
      }
      this.docksUntil = to;
    }
    if (this.docks.some((d) => !d.mine && d.end < t1 - DOCKS_KEEP)) this.docks = this.docks.filter((d) => d.mine || d.end >= t1 - DOCKS_KEEP);
    // Return trips that leave unmatched just go (yours too): a truck that has left can't be booked any more. Matched
    // trips of the other carriers stay listed a while after they leave.
    const goneTrip = (r: ReturnTrip) => (r.status === "open" ? r.departAt <= t1 : !r.mine && r.departAt <= t1 - RETURNS_KEEP);
    if (this.returns.some(goneTrip)) this.returns = this.returns.filter((r) => !goneTrip(r));

    const doneAt = (l: Load) => l.deliveredAt ?? l.pickupAt;
    const finished = this.loads.filter((l) => !l.mine && (l.status === "delivered" || l.status === "cancelled")).sort((a, b) => doneAt(a) - doneAt(b));
    if (finished.length <= KEEP_FINISHED) return;
    const drop = new Set(finished.slice(0, finished.length - KEEP_FINISHED).map((l) => l.id));
    // A pruned load takes its bids, dock slots and return trip with it, in the same update.
    this.loads = this.loads.filter((l) => !drop.has(l.id));
    this.bids = this.bids.filter((b) => !drop.has(b.loadId));
    this.docks = this.docks.filter((d) => !d.loadId || !drop.has(d.loadId));
    this.returns = this.returns.filter((r) => !r.matchedLoadId || !drop.has(r.matchedLoadId));
  }
}
