"use client";

// The whole marketplace runs in the browser: a seeded day, a simulated clock
// (×20 by default, so a 30-minute drive takes 90 seconds) and a "director"
// that keeps the market alive — carriers bid, shippers accept, trucks depart,
// docks fill up. What you do yourself (loads you post, bids you place, return
// trips, dock bookings, bin moves) is saved in this browser with the market
// clock, so a reload carries on where you left off.
import { create } from "zustand";
import { CARRIERS, ME, SHIPPERS, VEHICLE, VEHICLES } from "@/data/companies";
import { route } from "@/data/network";
import { PLACE_IDS, type PlaceId } from "@/data/places";
import {
  buildBids,
  buildDocks,
  buildFeed,
  buildLoads,
  buildReturns,
  canCarry,
  driveMs,
  eligibleCarriers,
  fitsReturn,
  HOUR,
  MIN,
  newId,
} from "@/data/seed";
import type { Bid, Bin, DockAppt, FeedEvent, GoodsType, Load, ReturnTrip, Role, VehicleType, WarehouseId } from "@/data/types";
import { applyBinPatch, buildBins, WAREHOUSE } from "@/data/warehouses";
import { CABOTAGE_LIMIT, cabotageUsed, isCabotage } from "@/lib/checks";
import { quote, VEHICLE_SPECS } from "@/lib/pricing";
import type { TimePreset } from "@/lib/sun";

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

const STORAGE_KEY = "zama-demo-v1";

export const DEFAULT_SETTINGS: Settings = {
  layers: { trucks: true, lanes: true, returns: true, warehouses: true, network: true, buildings: true },
  terrain: false,
  time: "live",
};

export const simNow = (c: Clock, real = Date.now()) => c.sim + (real - c.real) * c.speed;

const ev = (kind: FeedEvent["kind"], vars: FeedEvent["vars"], at: number, loadId?: string, key: string = kind): FeedEvent => ({
  id: newId("f"),
  at,
  kind,
  key,
  vars,
  loadId,
});

interface Saved {
  v: 1;
  /** The market clock when this was saved: every time below is market time. */
  clock?: { real: number; sim: number; speed?: number };
  role: Role;
  settings: Settings;
  loads: Load[];
  bids: Bid[];
  returns: ReturnTrip[];
  docks: DockAppt[];
  binPatches: Record<string, Partial<Bin>>;
}

function readSaved(): Saved | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Saved;
    return s?.v === 1 ? s : null;
  } catch {
    return null;
  }
}

let saveTimer: ReturnType<typeof setTimeout> | undefined;
function save(s: MarketState) {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveNow(s), 800);
}

function saveNow(s: MarketState) {
  clearTimeout(saveTimer);
  try {
    const mineLoads = s.loads.filter((l) => l.id.startsWith("ZM-5"));
    const mineIds = new Set(mineLoads.map((l) => l.id));
    const underway = new Set(mineLoads.filter((l) => l.status === "booked" || l.status === "assigned" || l.status === "inTransit").map((l) => l.id));
    const payload: Saved = {
      v: 1,
      clock: { real: Date.now(), sim: simNow(s.clock), speed: s.clock.speed },
      role: s.role,
      settings: s.settings,
      loads: mineLoads,
      // Seeded and market loads are rebuilt on the next visit (open again), so only your open bids on them can come back.
      bids: s.bids.filter((b) => mineIds.has(b.loadId) || (b.mine && b.status === "pending")),
      // Your own trips, and a seeded trip while it carries one of your loads (the fresh day would bring it back empty).
      returns: s.returns.filter((r) => (r.mine && r.id.startsWith("rt-me") && (r.status === "open" || mineIds.has(r.matchedLoadId ?? ""))) || underway.has(r.matchedLoadId ?? "")),
      docks: s.docks.filter((d) => d.mine),
      binPatches: s.binPatches,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* storage full or blocked: the demo still runs, it just won't remember */
  }
}

let loadSeq = 0;
/** An id for a load you post; the counter restarts on every visit, so skip any id a saved load already has. */
const nextLoadId = (loads: Load[]) => {
  let id: string;
  do id = `ZM-5${String(Date.now() % 1000).padStart(3, "0")}${loadSeq++}`;
  while (loads.some((l) => l.id === id));
  return id;
};

/** What decides which trucks are free: the loads, the return trips and the bids. */
type Bookings = Pick<MarketState, "loads" | "returns" | "bids">;

/** The truck a booked load was promised: its return trip's, else the one named in the accepted bid. */
function promisedVehicle(l: Pick<Load, "id" | "returnTripId">, m: Bookings) {
  return (l.returnTripId ? m.returns.find((r) => r.id === l.returnTripId)?.vehicleId : undefined) ?? m.bids.find((b) => b.loadId === l.id && b.status === "accepted")?.vehicleId;
}

/**
 * A truck of the carrier that can take the load (type and weight) and is free for it: not on another active job and
 * not held for a return trip other than the load's own. The load's promised truck if that one is free, else rather
 * not a truck promised to another of the carrier's booked loads; undefined when none is free. `taken` holds the
 * trucks already handed out in this tick.
 */
function freeVehicle(carrierId: string, load: Load, m: Bookings, taken?: Set<string>) {
  const busy = new Set<string>(taken);
  for (const l of m.loads) if (l.id !== load.id && (l.status === "assigned" || l.status === "inTransit") && l.vehicleId) busy.add(l.vehicleId);
  // A return trip holds its truck while it waits for a load, and until that load has been given its truck.
  for (const r of m.returns) if (r.id !== load.returnTripId && (r.status === "open" || m.loads.some((l) => l.id === r.matchedLoadId && l.status === "booked"))) busy.add(r.vehicleId);
  const free = VEHICLES.filter((v) => v.carrierId === carrierId && canCarry(v, load.vehicle, load.kg) && !busy.has(v.id));
  const own = promisedVehicle(load, m);
  const others = new Set(m.loads.filter((l) => l.id !== load.id && l.status === "booked" && l.carrierId === carrierId).map((l) => promisedVehicle(l, m)));
  return free.find((v) => v.id === own) ?? free.find((v) => !others.has(v.id)) ?? free[0];
}

/** The job would be cabotage for a carrier that has used up this week's operations. */
const cabotageFull = (l: Pick<Load, "from" | "to">, carrierId: string, loads: Load[]) => isCabotage(l, carrierId) && cabotageUsed(carrierId, loads) >= CABOTAGE_LIMIT;

/**
 * A load booked on a return trip: the trip's carrier at its discount, picked up no earlier than an hour before the
 * truck leaves, and due as much later as the pickup moved.
 */
function onReturnTrip(l: Load, rt: ReturnTrip): Load & { price: number } {
  const pickupAt = Math.max(l.pickupAt, rt.departAt - HOUR);
  const price = Math.round((l.target * (1 - rt.discount)) / 5) * 5;
  return { ...l, status: "booked", carrierId: rt.carrierId, price, returnTripId: rt.id, pickupAt, deliverBy: l.deliverBy + (pickupAt - l.pickupAt), ecmr: "draft" };
}

function seedState(real: number) {
  const loads = buildLoads(real);
  const bids = buildBids(loads, real);
  return {
    loads,
    bids,
    returns: buildReturns(real),
    docks: buildDocks(loads, real),
    feed: buildFeed(loads, bids, real),
  };
}

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

  init: () => {
    if (get().ready) return;
    const real = Date.now();
    const saved = readSaved();
    // Carry on from the saved market clock, so saved times still mean what they did. It runs ahead of the wall clock
    // while the demo is open, and at wall-clock speed while it is closed.
    const c = saved?.clock;
    const t0 = c && Number.isFinite(c.sim) && Number.isFinite(c.real) ? c.sim + Math.max(0, real - c.real) : real;
    const speed = c?.speed && Number.isFinite(c.speed) && c.speed > 0 ? c.speed : 20;
    const seeded = seedState(t0);
    const savedLoads = saved?.loads ?? [];
    const savedIds = new Set(savedLoads.map((l) => l.id));

    // The fresh day may have put one of your loads' trucks on another job: that job moves to another free truck, or
    // goes back to "booked" to wait for one.
    const active = (l: Load) => (l.status === "assigned" || l.status === "inTransit") && !!l.vehicleId;
    const yours = new Set(savedLoads.filter(active).map((l) => l.vehicleId as string));
    const every = [...seeded.loads, ...savedLoads];
    const loads = [
      ...seeded.loads.map((l): Load => {
        if (!active(l) || !yours.has(l.vehicleId as string)) return l;
        const v = l.carrierId ? freeVehicle(l.carrierId, l, { loads: every, returns: seeded.returns, bids: seeded.bids }, yours) : undefined;
        if (!v) return { ...l, status: "booked", vehicleId: undefined, departedAt: undefined, ecmr: "draft" };
        yours.add(v.id);
        return { ...l, vehicleId: v.id };
      }),
      ...savedLoads,
    ];
    // What belongs with them: the bids on your saved loads and your open bids on loads that are open again; your
    // trips, and a seeded trip that carries one of your loads in place of its fresh, empty copy.
    const open = new Set(loads.filter((l) => l.status === "open").map((l) => l.id));
    const bids = (saved?.bids ?? []).filter((b) => savedIds.has(b.loadId) || (b.mine && b.status === "pending" && open.has(b.loadId)));
    const returns = (saved?.returns ?? []).filter((r) => (r.status === "open" ? r.id.startsWith("rt-me") : savedIds.has(r.matchedLoadId ?? "")));
    set({
      ready: true,
      clock: { real, sim: t0, speed },
      ...seeded,
      loads,
      bids: [...seeded.bids, ...bids.filter((b) => !seeded.bids.some((x) => x.id === b.id))],
      returns: [...seeded.returns.filter((r) => !returns.some((x) => x.id === r.id)), ...returns],
      docks: [...seeded.docks, ...(saved?.docks ?? [])].sort((a, b) => a.start - b.start),
      role: saved?.role ?? "dispatcher",
      settings: { ...DEFAULT_SETTINGS, ...saved?.settings, layers: { ...DEFAULT_SETTINGS.layers, ...saved?.settings?.layers } },
      binPatches: saved?.binPatches ?? {},
    });
    useMarket.subscribe((s) => save(s));
    // Don't lose the last 800 ms of changes when the tab is closed or reloaded.
    window.addEventListener("pagehide", () => saveNow(useMarket.getState()));
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
    const now = simNow(get().clock);
    const q = quote({ from: input.from, to: input.to, vehicle: input.vehicle, express: input.express, tailLift: input.tailLift, adr: input.adr });
    const load: Load = {
      id: nextLoadId(get().loads),
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
    set((s) => ({ loads: [load, ...s.loads], feed: [ev("posted", { load: load.id, from: load.from, to: load.to, shipper: load.shipperId }, now, load.id), ...s.feed].slice(0, 60) }));
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

  /** One step of the simulated market (called every real second). */
  tick: () => {
    const s = get();
    if (!s.ready) return;
    const now = simNow(s.clock);
    const rand = Math.random;
    const events: FeedEvent[] = [];
    let bids = s.bids;
    let returns = s.returns;

    // Trucks handed out in this tick: the busy check in step() reads the loads as they were before it.
    const taken = new Set<string>();
    let changed = false;
    let loads = s.loads.map((l): Load => {
      const next = step(l);
      if (next !== l) changed = true;
      return next;
    });
    function step(l: Load): Load {
      if (l.status === "inTransit" && l.departedAt && now >= l.departedAt + driveMs(l)) {
        const at = l.departedAt + driveMs(l);
        events.push(ev("delivered", { load: l.id, to: l.to }, at, l.id));
        return { ...l, status: "delivered", deliveredAt: at, ecmr: "delivered" };
      }
      if (l.status === "assigned" && now >= l.pickupAt) {
        events.push(ev("departed", { load: l.id, from: l.from, to: l.to }, now, l.id));
        return { ...l, status: "inTransit", departedAt: now, ecmr: "carrier" };
      }
      if (l.status === "booked" && l.carrierId && l.carrierId !== ME.carrierId && now >= l.pickupAt - 2 * HOUR) {
        const v = freeVehicle(l.carrierId, l, s, taken);
        if (v) {
          taken.add(v.id);
          events.push(ev("assigned", { load: l.id, plate: v.plate }, now, l.id));
          return { ...l, status: "assigned", vehicleId: v.id, ecmr: "shipper" };
        }
      }
      return l;
    }
    if (!changed) loads = s.loads;

    // Carriers bid on open loads they don't have a bid on yet, with a truck that is free for it (and not on cabotage
    // they have no operations left for).
    for (const l of loads) {
      if (l.status !== "open" || rand() > 0.012) continue;
      const already = new Set(bids.filter((b) => b.loadId === l.id).map((b) => b.carrierId));
      const pool = CARRIERS.flatMap((c) => {
        if (c.id === ME.carrierId || already.has(c.id) || cabotageFull(l, c.id, loads)) return [];
        const v = freeVehicle(c.id, l, { loads, returns, bids });
        return v ? [{ c, v }] : [];
      });
      if (!pool.length) continue;
      const { c, v } = pool[Math.floor(rand() * pool.length)];
      const amount = Math.round((l.target * (0.85 + rand() * 0.22)) / 5) * 5;
      bids = [...bids, { id: newId("b"), loadId: l.id, carrierId: c.id, vehicleId: v.id, amount, pickupEta: l.pickupAt + Math.round((rand() - 0.4) * 60) * MIN, at: now, status: "pending" }];
      events.push(ev("bid", { carrier: c.id, amount, load: l.id }, now, l.id));
    }

    // Shippers (not you) take the cheapest bid when pickup gets close and they have two to compare, or whatever they
    // have an hour before pickup: a bid from a carrier with a truck free for it and, if it is cabotage, operations
    // left this week.
    for (const l of loads.filter((x) => x.status === "open" && !x.mine && now >= x.pickupAt - 150 * MIN)) {
      const pending = bids.filter((b) => b.loadId === l.id && b.status === "pending");
      const best = pending
        .filter((b) => !cabotageFull(l, b.carrierId, loads) && (b.mine || freeVehicle(b.carrierId, l, { loads, returns, bids })))
        .sort((a, b) => a.amount - b.amount)[0];
      if (!best || (pending.length < 2 && now < l.pickupAt - HOUR)) continue;
      bids = bids.map((b) => (b.loadId === l.id ? { ...b, status: b.id === best.id ? "accepted" : "rejected" } : b));
      events.push(ev("booked", { load: l.id, carrier: best.carrierId, amount: best.amount }, now, l.id, best.mine ? "won" : "booked"));
      loads = loads.map((x) => (x.id === l.id ? { ...x, status: "booked", carrierId: best.carrierId, price: best.amount, ecmr: "draft" } : x));
    }

    // A shipper somewhere books a load on one of the open return trips that hasn't left yet.
    if (rand() < 0.01) {
      for (const rt of returns) {
        if (rt.status !== "open" || rt.departAt <= now) continue;
        const v = VEHICLE.get(rt.vehicleId);
        const l = v && loads.find((x) => !x.mine && fitsReturn(x, rt, v.type) && !cabotageFull(x, rt.carrierId, loads));
        if (!l) continue;
        const booked = onReturnTrip(l, rt);
        loads = loads.map((x) => (x.id === l.id ? booked : x));
        returns = returns.map((r) => (r.id === rt.id ? { ...r, status: "matched", matchedLoadId: l.id } : r));
        bids = bids.map((b) => (b.loadId === l.id && b.status === "pending" ? { ...b, status: "rejected" } : b));
        events.push(ev("return", { load: l.id, carrier: rt.carrierId, from: rt.from, to: rt.to, amount: booked.price }, now, l.id));
        break;
      }
    }

    // New business keeps arriving, from the other shippers, sized for the vehicle it asks for.
    if (rand() < 0.018 && loads.filter((l) => l.status === "open").length < 14) {
      const others = SHIPPERS.filter((x) => x.id !== ME.shipperId);
      const shipper = others[Math.floor(rand() * others.length)];
      const from = shipper.place;
      const options = PLACE_IDS.filter((p) => p !== from && route(from, p).km > 4);
      const to = options[Math.floor(rand() * options.length)];
      const vehicle: VehicleType = shipper.sector === "steel" ? "flatbed" : ["chilled", "frozen", "pharma"].includes(shipper.sector) ? "reefer" : (["van", "rigid", "artic"] as const)[Math.floor(rand() * 3)];
      const spec = VEHICLE_SPECS[vehicle];
      const pallets = Math.min(spec.pallets, vehicle === "van" ? 1 + Math.floor(rand() * 4) : vehicle === "rigid" ? 4 + Math.floor(rand() * 10) : 10 + Math.floor(rand() * 22));
      const q = quote({ from, to, vehicle });
      // An id nothing points at any more: no load, and no old load's bids, trip, dock slot or feed line.
      const inUse = (id: string) => loads.some((l) => l.id === id) || bids.some((b) => b.loadId === id) || returns.some((r) => r.matchedLoadId === id) || s.docks.some((a) => a.loadId === id) || s.feed.some((e) => e.loadId === id);
      let id = "";
      for (let k = 0; k < 5 && (!id || inUse(id)); k++) id = `ZM-4${200 + Math.floor(rand() * 799)}`;
      const load: Load = {
        id,
        shipperId: shipper.id,
        from,
        to,
        goods: shipper.sector,
        pallets,
        kg: Math.min(spec.kg, pallets * (300 + Math.floor(rand() * 400))),
        vehicle,
        pickupAt: now + (2 + rand() * 7) * HOUR,
        deliverBy: now + 12 * HOUR,
        mode: rand() < 0.3 ? "instant" : "bids",
        target: q.fair,
        status: "open",
        ecmr: "none",
        createdAt: now,
      };
      if (!inUse(id)) {
        loads = [load, ...loads];
        events.push(ev("posted", { load: load.id, from, to, shipper: shipper.id }, now, load.id));
      }
    }

    // Return trips that leave unmatched just go (yours too): a truck that has left can't be booked any more.
    if (returns.some((r) => r.status === "open" && r.departAt <= now)) returns = returns.filter((r) => r.status === "matched" || r.departAt > now);

    // Keep the day readable: drop the oldest finished market loads past 60, with their bids. Yours stay.
    if (loads.length > 60) {
      const old = loads.filter((l) => !l.mine && (l.status === "delivered" || l.status === "cancelled")).sort((a, b) => (a.deliveredAt ?? a.createdAt) - (b.deliveredAt ?? b.createdAt));
      const drop = new Set(old.slice(0, loads.length - 60).map((l) => l.id));
      if (drop.size) {
        loads = loads.filter((l) => !drop.has(l.id));
        bids = bids.filter((b) => !drop.has(b.loadId));
      }
    }

    if (!events.length && loads === s.loads && returns === s.returns) return;
    // Events can be older than what is already in the feed (a delivery found late after a reload), so keep it in order.
    set({ loads, bids, returns, feed: events.length ? [...events, ...s.feed].sort((a, b) => b.at - a.at).slice(0, 60) : s.feed });
    if (events.some((e) => e.key === "won")) get().toast("toast.won", {}, "ok");
  },

  reset: () => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    const real = Date.now();
    set({ ...seedState(real), clock: { real, sim: real, speed: get().clock.speed }, bins: {}, binPatches: {} });
    get().toast("toast.reset", {}, "info");
  },
}));

/** Carriers list re-exported for UI pickers. */
export { CARRIERS };
