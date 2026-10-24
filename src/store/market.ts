"use client";

// The whole marketplace runs in the browser: a seeded day, a simulated clock
// (×20 by default, so a 30-minute drive takes 90 seconds) and a "director"
// (director.ts) that keeps the market alive — carriers bid, shippers accept,
// trucks depart, docks fill up. What you do yourself (loads you post, bids you
// place, return trips, dock bookings, bin moves) is saved in this browser with
// the market clock (saved.ts), so a reload carries on where you left off.
import { create } from "zustand";
import { CARRIERS, ME, VEHICLE } from "@/data/companies";
import type { PlaceId } from "@/data/places";
import { buildBids, buildDocks, buildFeed, buildLoads, buildReturns, DOCKS_SEEDED_AHEAD, eligibleCarriers, fitsReturn, HOUR, MIN, newId } from "@/data/seed";
import type { Bid, Bin, DockAppt, FeedEvent, GoodsType, Load, ReturnTrip, Role, VehicleType, WarehouseId } from "@/data/types";
import { applyBinPatch, buildBins, WAREHOUSE } from "@/data/warehouses";
import { quote } from "@/lib/pricing";
import type { TimePreset } from "@/lib/sun";
import { advanceWorld, cabotageFull, ev, FIRST_WORLD_SEQ, freeVehicle, MAX_CATCH_UP, onReturnTrip, settle, worldLoadId, type World } from "./director";
import { isUserReturnId, readSaved, STORAGE_KEY, toSaved, userLoadId, userLoadNumber, yours, type SavedClock, type Yours } from "./saved";

export interface MapLayers {
  trucks: boolean;
  lanes: boolean;
  returns: boolean;
  warehouses: boolean;
  network: boolean;
  buildings: boolean;
}

export interface Settings {
  layers: MapLayers;
  terrain: boolean;
  time: TimePreset;
}

export interface Toast {
  id: number;
  key: string;
  vars?: Record<string, string | number>;
  tone?: "ok" | "info" | "warn";
}

interface Clock {
  real: number;
  sim: number;
  speed: number;
}

export interface PostLoadInput {
  from: PlaceId;
  to: PlaceId;
  goods: GoodsType;
  pallets: number;
  kg: number;
  vehicle: VehicleType;
  pickupAt: number;
  mode: "bids" | "instant";
  express?: boolean;
  tailLift?: boolean;
  adr?: boolean;
}

interface MarketState {
  ready: boolean;
  role: Role;
  clock: Clock;
  loads: Load[];
  bids: Bid[];
  returns: ReturnTrip[];
  docks: DockAppt[];
  feed: FeedEvent[];
  bins: Partial<Record<WarehouseId, Bin[]>>;
  binPatches: Record<string, Partial<Bin>>;
  settings: Settings;
  toasts: Toast[];
  focusLoadId: string | null;
  /** Sim time the director has run the market up to. */
  simAt: number;
  /** Number of the next director load (ZM-4<n>). */
  worldSeq: number;
  /** Number of the next load you post (ZM-5<n>); saved, so an id is never handed out twice. */
  userSeq: number;
  /** Sim time up to which regular dock traffic is scheduled. */
  docksUntil: number;

  init: () => void;
  setRole: (r: Role) => void;
  setSpeed: (s: number) => void;
  setLayer: (k: keyof MapLayers, v: boolean) => void;
  setTerrain: (v: boolean) => void;
  setTime: (t: TimePreset) => void;
  focusLoad: (id: string | null) => void;
  toast: (key: string, vars?: Toast["vars"], tone?: Toast["tone"]) => void;
  dismissToast: (id: number) => void;

  postLoad: (input: PostLoadInput) => Load;
  placeBid: (loadId: string, amount: number, vehicleId: string, pickupEta: number, note?: string) => void;
  acceptBid: (bidId: string) => void;
  bookInstant: (loadId: string) => void;
  bookOnReturn: (loadId: string, returnId: string) => void;
  assignVehicle: (loadId: string, vehicleId: string) => void;
  advance: (loadId: string) => void;
  cancelLoad: (loadId: string) => void;
  postReturn: (input: Omit<ReturnTrip, "id" | "status" | "carrierId" | "mine">) => void;
  bookDock: (input: Omit<DockAppt, "id" | "status" | "mine">) => void;
  getBins: (w: WarehouseId) => Bin[];
  patchBin: (w: WarehouseId, loc: string, patch: Partial<Bin>) => void;
  moveBin: (w: WarehouseId, fromLoc: string, toLoc: string) => void;
  tick: () => void;
  reset: () => void;
}

export const DEFAULT_SETTINGS: Settings = {
  layers: { trucks: true, lanes: true, returns: true, warehouses: true, network: true, buildings: true },
  terrain: false,
  time: "live",
};

export const simNow = (c: Clock, real = Date.now()) => c.sim + (real - c.real) * c.speed;

/** Saves happen at most this often (real ms), and only when what is saved changed… */
const SAVE_EVERY = 5_000;
/** …or, for the market clock alone, this long after the last save. */
const CLOCK_EVERY = 60_000;
let saveTimer: ReturnType<typeof setTimeout> | undefined;
let lastSaved: string | null = null;
let lastSavedAt = 0;

function scheduleSave() {
  if (saveTimer === undefined) saveTimer = setTimeout(() => saveNow(useMarket.getState()), SAVE_EVERY);
}

/** Writes the save if your data or the speed changed, the clock is due, or `force` (the tab is going away). */
function saveNow(s: MarketState, force = false) {
  clearTimeout(saveTimer);
  saveTimer = undefined;
  if (!s.ready) return;
  try {
    const body = toSaved(s);
    const key = `${JSON.stringify(body)}@${s.clock.speed}`;
    const real = Date.now();
    if (!force && key === lastSaved && real - lastSavedAt < CLOCK_EVERY) return;
    const clock: SavedClock = { real, sim: simNow(s.clock, real), speed: s.clock.speed };
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...body, clock }));
    lastSaved = key;
    lastSavedAt = real;
  } catch {
    /* storage full or blocked: the demo still runs, it just won't remember */
  }
}

/** The parts of the state that end up in storage. */
const savedParts = (s: MarketState) => [s.role, s.settings, s.clock.speed, s.userSeq, s.loads, s.bids, s.returns, s.docks, s.binPatches];

/** The demo day around t0. With `seq` (a re-seed mid-session) its loads get fresh ids from the director's series. */
function seedWorld(t0: number, seq?: number): World {
  let n = seq ?? FIRST_WORLD_SEQ;
  const loads = buildLoads(t0, seq === undefined ? undefined : () => worldLoadId(n++));
  const bids = buildBids(loads, t0);
  return { loads, bids, returns: buildReturns(t0), docks: buildDocks(loads, t0), feed: buildFeed(loads, bids, t0), seq: n, docksUntil: t0 + DOCKS_SEEDED_AHEAD };
}

/**
 * Your records on top of a freshly seeded day: your loads caught up to `now`, the seeded jobs moved off the trucks
 * your loads are using, and nothing left pointing at a load or a return trip that isn't there.
 */
function withYours(world: World, mine: Yours, now: number): World {
  const seededIds = new Set(world.loads.map((l) => l.id));
  const saved = mine.loads.filter((l) => !seededIds.has(l.id)).map((l) => settle(l, now));
  const savedIds = new Set(saved.map((l) => l.id));
  // Your trips while open, and a seeded trip that carries one of your loads in place of its fresh, empty copy.
  const trips = mine.returns.filter((r) => (r.status === "open" ? isUserReturnId(r.id) && r.departAt > now : savedIds.has(r.matchedLoadId ?? "")));
  const tripIds = new Set(trips.map((r) => r.id));
  const returns = [...world.returns.filter((r) => !tripIds.has(r.id)), ...trips];
  // The fresh day may have put one of your loads' trucks on another job: that job moves to another free truck, or
  // goes back to "booked" to wait for one.
  const active = (l: Load) => (l.status === "assigned" || l.status === "inTransit") && !!l.vehicleId;
  const taken = new Set(saved.filter(active).map((l) => l.vehicleId as string));
  const every = [...world.loads, ...saved];
  const seeded = world.loads.map((l): Load => {
    if (!active(l) || !taken.has(l.vehicleId as string)) return l;
    const v = l.carrierId ? freeVehicle(l.carrierId, l, { loads: every, returns, bids: world.bids }, taken) : undefined;
    if (!v) return { ...l, status: "booked", vehicleId: undefined, departedAt: undefined, ecmr: "draft" };
    taken.add(v.id);
    return { ...l, vehicleId: v.id };
  });
  const returnIds = new Set(returns.map((r) => r.id));
  const loads = [...seeded, ...saved].map((l) => {
    if (!l.returnTripId || returnIds.has(l.returnTripId)) return l;
    const { returnTripId: _gone, ...rest } = l;
    return rest;
  });
  const byId = new Map(loads.map((l) => [l.id, l]));
  // The bids on your loads, and your open bids on loads that are open again; never one older than its load (that
  // would be a bid on an earlier load with the same id).
  const bidIds = new Set(world.bids.map((b) => b.id));
  const bids = [...world.bids];
  for (const b of mine.bids) {
    const l = byId.get(b.loadId);
    if (!l || bidIds.has(b.id) || b.at < l.createdAt - MIN) continue;
    if (savedIds.has(l.id)) bids.push(l.status === "open" || b.status !== "pending" ? b : { ...b, status: "rejected" });
    else if (b.mine && b.status === "pending" && l.status === "open") bids.push(b);
    else continue;
    bidIds.add(b.id);
  }
  const dockIds = new Set(world.docks.map((d) => d.id));
  const docks = [...world.docks];
  for (const d of mine.docks) {
    if (dockIds.has(d.id)) continue;
    if (!d.loadId || byId.has(d.loadId)) docks.push(d);
    else {
      const { loadId: _gone, ...rest } = d;
      docks.push(rest);
    }
  }
  return { ...world, loads, bids, returns, docks: docks.sort((a, b) => a.start - b.start) };
}

const worldState = (w: World) => ({ loads: w.loads, bids: w.bids, returns: w.returns, docks: w.docks, feed: w.feed, worldSeq: w.seq, docksUntil: w.docksUntil });
const worldOf = (s: MarketState): World => ({ loads: s.loads, bids: s.bids, returns: s.returns, docks: s.docks, feed: s.feed, seq: s.worldSeq, docksUntil: s.docksUntil });

export const useMarket = create<MarketState>()((set, get) => ({
  ready: false,
  role: "dispatcher",
  clock: { real: 0, sim: 0, speed: 20 },
  loads: [],
  bids: [],
  returns: [],
  docks: [],
  feed: [],
  bins: {},
  binPatches: {},
  settings: DEFAULT_SETTINGS,
  toasts: [],
  focusLoadId: null,

  simAt: 0,
  worldSeq: FIRST_WORLD_SEQ,
  userSeq: 1,
  docksUntil: 0,

  init: () => {
    if (get().ready) return;
    const real = Date.now();
    // Checked record by record: a bad saved record is dropped, it can't take the app down.
    const saved = readSaved();
    // Carry on from the saved market clock, so saved times still mean what they did. It runs ahead of the wall clock
    // while the demo is open, and at wall-clock speed while it is closed.
    const c = saved?.clock;
    const t0 = c ? c.sim + Math.max(0, real - c.real) : real;
    const world = withYours(seedWorld(t0), saved ?? { loads: [], bids: [], returns: [], docks: [] }, t0);
    set({
      ready: true,
      clock: { real, sim: t0, speed: c?.speed ?? 20 },
      ...worldState(world),
      simAt: t0,
      userSeq: Math.max(saved?.seq ?? 1, ...(saved?.loads ?? []).map((l) => userLoadNumber(l.id) + 1)),
      role: saved?.role ?? "dispatcher",
      settings: { ...DEFAULT_SETTINGS, ...saved?.settings, layers: { ...DEFAULT_SETTINGS.layers, ...saved?.settings.layers } },
      binPatches: saved?.binPatches ?? {},
    });
    useMarket.subscribe((s, prev) => {
      const before = savedParts(prev);
      if (savedParts(s).some((x, i) => x !== before[i]) || Date.now() - lastSavedAt >= CLOCK_EVERY) scheduleSave();
    });
    // Don't lose the last few seconds (or the clock) when the tab is closed, reloaded or hidden.
    if (typeof window !== "undefined") window.addEventListener("pagehide", () => saveNow(useMarket.getState(), true));
    if (typeof document !== "undefined")
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") saveNow(useMarket.getState(), true);
        // Back from the background: catch up (or re-seed) now rather than at the next tick.
        else useMarket.getState().tick();
      });
  },

  setRole: (role) => set({ role }),
  setSpeed: (speed) => {
    const c = get().clock;
    const real = Date.now();
    set({ clock: { real, sim: simNow(c, real), speed } });
  },
  setLayer: (k, v) => set((s) => ({ settings: { ...s.settings, layers: { ...s.settings.layers, [k]: v } } })),
  setTerrain: (terrain) => set((s) => ({ settings: { ...s.settings, terrain } })),
  setTime: (time) => set((s) => ({ settings: { ...s.settings, time } })),
  focusLoad: (focusLoadId) => set({ focusLoadId }),

  toast: (key, vars, tone = "ok") => {
    const id = Date.now() + Math.random();
    set((s) => ({ toasts: [...s.toasts.slice(-2), { id, key, vars, tone }] }));
    setTimeout(() => get().dismissToast(id), 4200);
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  postLoad: (input) => {
    const s = get();
    const now = simNow(s.clock);
    const q = quote({ from: input.from, to: input.to, vehicle: input.vehicle, express: input.express, tailLift: input.tailLift, adr: input.adr });
    let n = s.userSeq;
    while (s.loads.some((l) => l.id === userLoadId(n))) n++;
    const load: Load = {
      id: userLoadId(n),
      shipperId: ME.shipperId,
      from: input.from,
      to: input.to,
      goods: input.goods,
      pallets: input.pallets,
      kg: input.kg,
      vehicle: input.vehicle,
      pickupAt: input.pickupAt,
      deliverBy: input.pickupAt + q.route.minutes * MIN + 3 * HOUR,
      mode: input.mode,
      target: q.fair,
      status: "open",
      express: input.express,
      tailLift: input.tailLift,
      adr: input.adr,
      ecmr: "none",
      createdAt: now,
      mine: true,
    };
    set((st) => ({ userSeq: n + 1, loads: [load, ...st.loads], feed: [ev("posted", { load: load.id, from: load.from, to: load.to, shipper: load.shipperId }, now, load.id), ...st.feed].slice(0, 60) }));
    get().toast("toast.posted", { load: load.id });
    return load;
  },

  placeBid: (loadId, amount, vehicleId, pickupEta, note) => {
    const now = simNow(get().clock);
    const bid: Bid = { id: newId("b"), loadId, carrierId: ME.carrierId, vehicleId, amount, pickupEta, note, at: now, status: "pending", mine: true };
    set((s) => ({
      bids: [...s.bids.filter((b) => !(b.mine && b.loadId === loadId && b.status === "pending")), bid],
      feed: [ev("bid", { carrier: ME.carrierId, amount, load: loadId }, now, loadId), ...s.feed].slice(0, 60),
    }));
    get().toast("toast.bid", { load: loadId, amount });
  },

  acceptBid: (bidId) => {
    const s = get();
    const bid = s.bids.find((b) => b.id === bidId);
    const l = bid && s.loads.find((x) => x.id === bid.loadId);
    if (!bid || bid.status !== "pending" || l?.status !== "open") return;
    const now = simNow(s.clock);
    set({
      bids: s.bids.map((b) => (b.loadId !== bid.loadId ? b : { ...b, status: b.id === bidId ? "accepted" : "rejected" })),
      loads: s.loads.map((l) => (l.id === bid.loadId ? { ...l, status: "booked", carrierId: bid.carrierId, price: bid.amount, ecmr: "draft" } : l)),
      feed: [ev("booked", { load: bid.loadId, carrier: bid.carrierId, amount: bid.amount }, now, bid.loadId), ...s.feed].slice(0, 60),
    });
    get().toast("toast.accepted", { load: bid.loadId });
  },

  bookInstant: (loadId) => {
    const s = get();
    const l = s.loads.find((x) => x.id === loadId);
    if (!l || l.status !== "open") return;
    const now = simNow(s.clock);
    // As a carrier you take it yourself. Otherwise another carrier does (cabotage allowing): the best-rated one with a
    // truck free for it, or, when every truck is out, the best-rated one, which sends the first truck back.
    const others = eligibleCarriers(l.vehicle, l.kg)
      .filter((c) => c.id !== ME.carrierId && !cabotageFull(l, c.id, s.loads))
      .sort((a, b) => b.rating - a.rating);
    const carrierId = s.role === "carrier" ? ME.carrierId : (others.find((c) => freeVehicle(c.id, l, s)) ?? others[0])?.id;
    if (!carrierId) return;
    set({
      loads: s.loads.map((x) => (x.id === loadId ? { ...x, status: "booked", carrierId, price: x.target, ecmr: "draft" } : x)),
      bids: s.bids.map((b) => (b.loadId === loadId && b.status === "pending" ? { ...b, status: "rejected" } : b)),
      feed: [ev("booked", { load: loadId, carrier: carrierId, amount: l.target }, now, loadId), ...s.feed].slice(0, 60),
    });
    get().toast("toast.instant", { load: loadId, amount: l.target });
  },

  bookOnReturn: (loadId, returnId) => {
    const s = get();
    const now = simNow(s.clock);
    const l = s.loads.find((x) => x.id === loadId);
    const rt = s.returns.find((r) => r.id === returnId);
    const v = rt && VEHICLE.get(rt.vehicleId);
    // Both still open, the load fits, and the truck hasn't left yet.
    if (!l || !rt || !v || !fitsReturn(l, rt, v.type) || rt.departAt <= now) return;
    const booked = onReturnTrip(l, rt);
    set({
      loads: s.loads.map((x) => (x.id === loadId ? booked : x)),
      returns: s.returns.map((r) => (r.id === returnId ? { ...r, status: "matched", matchedLoadId: loadId } : r)),
      bids: s.bids.map((b) => (b.loadId === loadId && b.status === "pending" ? { ...b, status: "rejected" } : b)),
      feed: [ev("return", { load: loadId, carrier: rt.carrierId, from: rt.from, to: rt.to, amount: booked.price }, now, loadId), ...s.feed].slice(0, 60),
    });
    get().toast("toast.return", { load: loadId, amount: booked.price });
  },

  assignVehicle: (loadId, vehicleId) => {
    const s = get();
    const l = s.loads.find((x) => x.id === loadId);
    const v = VEHICLE.get(vehicleId);
    if (!l || !v || (l.status !== "booked" && l.status !== "assigned")) return;
    // A truck does one job at a time.
    if (s.loads.some((x) => x.id !== loadId && x.vehicleId === vehicleId && (x.status === "assigned" || x.status === "inTransit"))) return;
    const now = simNow(s.clock);
    set({
      loads: s.loads.map((x) => (x.id === loadId ? { ...x, vehicleId, carrierId: x.carrierId ?? v.carrierId, status: x.status === "booked" ? "assigned" : x.status, ecmr: x.ecmr === "draft" ? "shipper" : x.ecmr } : x)),
      feed: [ev("assigned", { load: loadId, plate: v.plate }, now, loadId), ...s.feed].slice(0, 60),
    });
    get().toast("toast.assigned", { load: loadId, plate: v.plate });
  },

  advance: (loadId) => {
    const s = get();
    const now = simNow(s.clock);
    const l = s.loads.find((x) => x.id === loadId);
    if (!l) return;
    let next: Partial<Load> = {};
    let e: FeedEvent | null = null;
    if (l.status === "booked") {
      const v = freeVehicle(l.carrierId ?? ME.carrierId, l, s);
      if (!v) return;
      next = { status: "assigned", vehicleId: v.id, ecmr: "shipper" };
      e = ev("assigned", { load: l.id, plate: v.plate }, now, l.id);
    } else if (l.status === "assigned") {
      next = { status: "inTransit", departedAt: now, pickupAt: Math.min(l.pickupAt, now), ecmr: "carrier" };
      e = ev("departed", { load: l.id, from: l.from, to: l.to }, now, l.id);
    } else if (l.status === "inTransit") {
      next = { status: "delivered", deliveredAt: now, ecmr: "delivered" };
      e = ev("delivered", { load: l.id, to: l.to }, now, l.id);
    } else return;
    set({ loads: s.loads.map((x) => (x.id === loadId ? { ...x, ...next } : x)), feed: e ? [e, ...s.feed].slice(0, 60) : s.feed });
  },

  cancelLoad: (loadId) => {
    set((s) => ({ loads: s.loads.map((l) => (l.id === loadId ? { ...l, status: "cancelled" } : l)), bids: s.bids.map((b) => (b.loadId === loadId ? { ...b, status: "rejected" } : b)) }));
    get().toast("toast.cancelled", { load: loadId }, "info");
  },

  postReturn: (input) => {
    const now = simNow(get().clock);
    const rt: ReturnTrip = { ...input, id: newId("rt-me"), carrierId: ME.carrierId, status: "open", mine: true };
    set((s) => ({ returns: [rt, ...s.returns], feed: [ev("return", { carrier: ME.carrierId, from: rt.from, to: rt.to }, now, undefined, "returnPosted"), ...s.feed].slice(0, 60) }));
    get().toast("toast.returnPosted", { from: rt.from, to: rt.to });
  },

  bookDock: (input) => {
    const appt: DockAppt = { ...input, id: newId("dk"), status: "scheduled", mine: true };
    const now = simNow(get().clock);
    set((s) => ({ docks: [...s.docks, appt].sort((a, b) => a.start - b.start), feed: [ev("dock", { door: input.door + 1, warehouse: input.warehouseId, carrier: input.carrierId }, now), ...s.feed].slice(0, 60) }));
    get().toast("toast.dock", { door: input.door + 1 });
  },

  getBins: (w) => {
    const have = get().bins[w];
    if (have) return have;
    const wh = WAREHOUSE.get(w);
    if (!wh) return [];
    const patches = get().binPatches;
    const bins = buildBins(wh).map((b) => applyBinPatch(b, patches[`${w}|${b.loc}`]));
    set((s) => ({ bins: { ...s.bins, [w]: bins } }));
    return bins;
  },

  patchBin: (w, loc, patch) => {
    set((s) => {
      const list = s.bins[w];
      const key = `${w}|${loc}`;
      return {
        // The bins cache is filled lazily by getBins; patches always land in binPatches.
        ...(list ? { bins: { ...s.bins, [w]: list.map((b) => (b.loc === loc ? applyBinPatch(b, patch) : b)) } } : {}),
        binPatches: { ...s.binPatches, [key]: { ...s.binPatches[key], ...patch } },
      };
    });
  },

  moveBin: (w, fromLoc, toLoc) => {
    const s = get();
    const list = s.bins[w] ?? s.getBins(w);
    const from = list.find((b) => b.loc === fromLoc);
    const to = list.find((b) => b.loc === toLoc);
    // Only into an empty position of the same temperature zone, and never stock that is blocked or in quarantine.
    if (!from?.sku || !to || to.status !== "empty" || to.zone !== from.zone || from.status === "blocked" || from.status === "quarantine") return;
    const carry: Partial<Bin> = { status: "stored", sku: from.sku, qty: from.qty, lot: from.lot, expiryDays: from.expiryDays, abc: from.abc, picksPerDay: from.picksPerDay, countedDaysAgo: 0 };
    const clear: Partial<Bin> = { status: "empty", sku: undefined, qty: undefined, lot: undefined, expiryDays: undefined, abc: undefined, picksPerDay: undefined };
    get().patchBin(w, toLoc, carry);
    get().patchBin(w, fromLoc, clear);
    const now = simNow(get().clock);
    set((st) => ({ feed: [ev("wms", { from: fromLoc, to: toLoc, warehouse: w }, now, undefined, "moved"), ...st.feed].slice(0, 60) }));
    get().toast("toast.moved", { from: fromLoc, to: toLoc });
  },

  /**
   * Runs the market up to now (called every real second, about once a minute
   * in a background tab, and when the tab comes back). The director covers
   * the sim time since the last call in bounded steps; after a longer absence
   * the day is re-seeded around now, with your own records caught up.
   */
  tick: () => {
    const s = get();
    if (!s.ready) return;
    const now = simNow(s.clock);
    if (now <= s.simAt) return;
    if (now - s.simAt > MAX_CATCH_UP) {
      set({ ...worldState(withYours(seedWorld(now, s.worldSeq), yours(s), now)), simAt: now });
      return;
    }
    const { world, events } = advanceWorld(worldOf(s), s.simAt, now);
    set({ ...worldState(world), simAt: now });
    if (events.some((e) => e.key === "won")) get().toast("toast.won", {}, "ok");
  },

  reset: () => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    lastSaved = null;
    const real = Date.now();
    const s = get();
    // The canonical demo day again; director and user load numbers keep counting up.
    const world = seedWorld(real);
    set({ ...worldState(world), worldSeq: Math.max(world.seq, s.worldSeq), simAt: real, clock: { real, sim: real, speed: s.clock.speed }, bins: {}, binPatches: {} });
    get().toast("toast.reset", {}, "info");
  },
}));

/** Carriers list re-exported for UI pickers. */
export { CARRIERS };
