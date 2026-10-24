"use client";

// The whole marketplace runs in the browser: a seeded day, a simulated clock
// (×20 by default, so a 30-minute drive takes 90 seconds) and a "director"
// that keeps the market alive — carriers bid, shippers accept, trucks depart,
// docks fill up. What you do yourself (loads you post, bids you place, return
// trips, dock bookings, bin moves) is saved in this browser.
import { create } from "zustand";
import { CARRIERS, ME, SHIPPERS, VEHICLES } from "@/data/companies";
import { route } from "@/data/network";
import { PLACE_IDS, type PlaceId } from "@/data/places";
import {
  buildBids,
  buildDocks,
  buildFeed,
  buildLoads,
  buildReturns,
  CARRIES,
  driveMs,
  eligibleCarriers,
  fitsReturn,
  HOUR,
  MIN,
  newId,
  vehicleFor,
} from "@/data/seed";
import type { Bid, Bin, DockAppt, FeedEvent, GoodsType, Load, ReturnTrip, Role, VehicleType, WarehouseId } from "@/data/types";
import { buildBins, WAREHOUSE } from "@/data/warehouses";
import { quote } from "@/lib/pricing";
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
    const payload: Saved = {
      v: 1,
      role: s.role,
      settings: s.settings,
      loads: mineLoads,
      bids: s.bids.filter((b) => b.mine || mineIds.has(b.loadId)),
      returns: s.returns.filter((r) => r.mine && r.id.startsWith("rt-me")),
      docks: s.docks.filter((d) => d.mine),
      binPatches: s.binPatches,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* storage full or blocked: the demo still runs, it just won't remember */
  }
}

let loadSeq = 0;
const nextLoadId = () => `ZM-5${String(Date.now() % 1000).padStart(3, "0")}${loadSeq++}`;

/** A vehicle of the carrier that is not already on another active job. */
function freeVehicle(carrierId: string, type: VehicleType, loads: Load[], except?: string) {
  const busy = new Set(loads.filter((l) => l.id !== except && (l.status === "assigned" || l.status === "inTransit") && l.vehicleId).map((l) => l.vehicleId));
  return VEHICLES.find((v) => v.carrierId === carrierId && CARRIES[v.type].includes(type) && !busy.has(v.id)) ?? vehicleFor(carrierId, type);
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
    const seeded = seedState(real);
    const saved = readSaved();
    set({
      ready: true,
      clock: { real, sim: real, speed: 20 },
      ...seeded,
      loads: [...seeded.loads, ...(saved?.loads ?? [])],
      bids: [...seeded.bids, ...(saved?.bids ?? []).filter((b) => !seeded.bids.some((x) => x.id === b.id))],
      returns: [...seeded.returns, ...(saved?.returns ?? [])],
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
      id: nextLoadId(),
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
    if (!bid) return;
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
    if (!l) return;
    const now = simNow(s.clock);
    // As a carrier you take it yourself; as a shipper the best-rated free carrier takes it.
    const carrierId = s.role === "carrier" ? ME.carrierId : [...eligibleCarriers(l.vehicle)].sort((a, b) => b.rating - a.rating)[0]?.id;
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
    const l = s.loads.find((x) => x.id === loadId);
    const rt = s.returns.find((r) => r.id === returnId);
    if (!l || !rt) return;
    const now = simNow(s.clock);
    const price = Math.round((l.target * (1 - rt.discount)) / 5) * 5;
    set({
      loads: s.loads.map((x) => (x.id === loadId ? { ...x, status: "booked", carrierId: rt.carrierId, price, returnTripId: rt.id, pickupAt: Math.max(x.pickupAt, rt.departAt - HOUR), ecmr: "draft" } : x)),
      returns: s.returns.map((r) => (r.id === returnId ? { ...r, status: "matched", matchedLoadId: loadId } : r)),
      bids: s.bids.map((b) => (b.loadId === loadId && b.status === "pending" ? { ...b, status: "rejected" } : b)),
      feed: [ev("return", { load: loadId, carrier: rt.carrierId, from: rt.from, to: rt.to, amount: price }, now, loadId), ...s.feed].slice(0, 60),
    });
    get().toast("toast.return", { load: loadId, amount: price });
  },

  assignVehicle: (loadId, vehicleId) => {
    const s = get();
    const now = simNow(s.clock);
    const v = VEHICLES.find((x) => x.id === vehicleId);
    set({
      loads: s.loads.map((l) => (l.id === loadId ? { ...l, vehicleId, carrierId: l.carrierId ?? v?.carrierId, status: l.status === "booked" ? "assigned" : l.status, ecmr: l.ecmr === "draft" ? "shipper" : l.ecmr } : l)),
      feed: [ev("assigned", { load: loadId, plate: v?.plate ?? vehicleId }, now, loadId), ...s.feed].slice(0, 60),
    });
    get().toast("toast.assigned", { load: loadId, plate: v?.plate ?? "" });
  },

  advance: (loadId) => {
    const s = get();
    const now = simNow(s.clock);
    const l = s.loads.find((x) => x.id === loadId);
    if (!l) return;
    let next: Partial<Load> = {};
    let e: FeedEvent | null = null;
    if (l.status === "booked") {
      const v = freeVehicle(l.carrierId ?? ME.carrierId, l.vehicle, s.loads, l.id);
      next = { status: "assigned", vehicleId: v?.id, ecmr: "shipper" };
      e = ev("assigned", { load: l.id, plate: v?.plate ?? "" }, now, l.id);
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
    const rt: ReturnTrip = { ...input, id: `rt-me-${Date.now().toString(36)}`, carrierId: ME.carrierId, status: "open", mine: true };
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
    const bins = buildBins(wh).map((b) => {
      const p = patches[`${w}|${b.loc}`];
      return p ? { ...b, ...p } : b;
    });
    set((s) => ({ bins: { ...s.bins, [w]: bins } }));
    return bins;
  },

  patchBin: (w, loc, patch) => {
    set((s) => {
      const list = s.bins[w];
      const key = `${w}|${loc}`;
      return {
        // The bins cache is filled lazily by getBins; patches always land in binPatches.
        ...(list ? { bins: { ...s.bins, [w]: list.map((b) => (b.loc === loc ? { ...b, ...patch } : b)) } } : {}),
        binPatches: { ...s.binPatches, [key]: { ...s.binPatches[key], ...patch } },
      };
    });
  },

  moveBin: (w, fromLoc, toLoc) => {
    const s = get();
    const list = s.bins[w] ?? s.getBins(w);
    const from = list.find((b) => b.loc === fromLoc);
    if (!from || !from.sku) return;
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
        const v = freeVehicle(l.carrierId, l.vehicle, s.loads, l.id);
        if (v) {
          events.push(ev("assigned", { load: l.id, plate: v.plate }, now, l.id));
          return { ...l, status: "assigned", vehicleId: v.id, ecmr: "shipper" };
        }
      }
      return l;
    }
    if (!changed) loads = s.loads;

    // Carriers bid on open loads they don't have a bid on yet.
    for (const l of loads) {
      if (l.status !== "open" || rand() > 0.012) continue;
      const already = new Set(bids.filter((b) => b.loadId === l.id).map((b) => b.carrierId));
      const pool = eligibleCarriers(l.vehicle).filter((c) => c.id !== ME.carrierId && !already.has(c.id));
      if (!pool.length) continue;
      const c = pool[Math.floor(rand() * pool.length)];
      const v = vehicleFor(c.id, l.vehicle);
      if (!v) continue;
      const amount = Math.round((l.target * (0.85 + rand() * 0.22)) / 5) * 5;
      bids = [...bids, { id: newId("b"), loadId: l.id, carrierId: c.id, vehicleId: v.id, amount, pickupEta: l.pickupAt + Math.round((rand() - 0.4) * 60) * MIN, at: now, status: "pending" }];
      events.push(ev("bid", { carrier: c.id, amount, load: l.id }, now, l.id));
    }

    // Shippers (not you) accept the best bid when pickup gets close.
    const ripe = loads.filter((l) => l.status === "open" && !l.mine && now >= l.pickupAt - 150 * MIN);
    if (ripe.length) loads = loads.map((l) => {
      if (l.status !== "open" || l.mine || now < l.pickupAt - 150 * MIN) return l;
      const pending = bids.filter((b) => b.loadId === l.id && b.status === "pending").sort((a, b) => a.amount - b.amount);
      const best = pending[0];
      if (!best || pending.length < 2) return l;
      bids = bids.map((b) => (b.loadId === l.id ? { ...b, status: b.id === best.id ? "accepted" : "rejected" } : b));
      events.push(ev("booked", { load: l.id, carrier: best.carrierId, amount: best.amount }, now, l.id, best.mine ? "won" : "booked"));
      return { ...l, status: "booked", carrierId: best.carrierId, price: best.amount, ecmr: "draft" };
    });

    // A shipper somewhere books a load on one of the open return trips.
    if (rand() < 0.01) {
      for (const rt of returns) {
        if (rt.status !== "open") continue;
        const v = VEHICLES.find((x) => x.id === rt.vehicleId);
        const l = v && loads.find((x) => !x.mine && fitsReturn(x, rt, v.type));
        if (!l) continue;
        const price = Math.round((l.target * (1 - rt.discount)) / 5) * 5;
        loads = loads.map((x) => (x.id === l.id ? { ...x, status: "booked", carrierId: rt.carrierId, price, returnTripId: rt.id, ecmr: "draft" } : x));
        returns = returns.map((r) => (r.id === rt.id ? { ...r, status: "matched", matchedLoadId: l.id } : r));
        bids = bids.map((b) => (b.loadId === l.id && b.status === "pending" ? { ...b, status: "rejected" } : b));
        events.push(ev("return", { load: l.id, carrier: rt.carrierId, from: rt.from, to: rt.to, amount: price }, now, l.id));
        break;
      }
    }

    // New business keeps arriving.
    if (rand() < 0.018 && loads.filter((l) => l.status === "open").length < 14) {
      const shipper = SHIPPERS[Math.floor(rand() * SHIPPERS.length)];
      const from = shipper.place;
      const options = PLACE_IDS.filter((p) => p !== from && route(from, p).km > 4);
      const to = options[Math.floor(rand() * options.length)];
      const vehicle: VehicleType = shipper.sector === "steel" ? "flatbed" : ["chilled", "frozen", "pharma"].includes(shipper.sector) ? "reefer" : (["van", "rigid", "artic"] as const)[Math.floor(rand() * 3)];
      const pallets = vehicle === "van" ? 1 + Math.floor(rand() * 4) : vehicle === "rigid" ? 4 + Math.floor(rand() * 10) : 10 + Math.floor(rand() * 22);
      const q = quote({ from, to, vehicle });
      const load: Load = {
        id: `ZM-4${String(200 + Math.floor(rand() * 799))}`,
        shipperId: shipper.id,
        from,
        to,
        goods: shipper.sector,
        pallets,
        kg: pallets * (300 + Math.floor(rand() * 400)),
        vehicle,
        pickupAt: now + (2 + rand() * 7) * HOUR,
        deliverBy: now + 12 * HOUR,
        mode: rand() < 0.3 ? "instant" : "bids",
        target: q.fair,
        status: "open",
        ecmr: "none",
        createdAt: now,
      };
      if (!loads.some((l) => l.id === load.id)) {
        loads = [load, ...loads];
        events.push(ev("posted", { load: load.id, from, to, shipper: shipper.id }, now, load.id));
      }
    }

    // Return trips that leave unmatched just go.
    returns = returns.filter((r) => r.status === "matched" || r.departAt > now - HOUR || r.mine);

    // Keep the day readable: drop the oldest finished loads past 60.
    if (loads.length > 60) {
      const old = loads.filter((l) => l.status === "delivered" || l.status === "cancelled").sort((a, b) => (a.deliveredAt ?? a.createdAt) - (b.deliveredAt ?? b.createdAt));
      const drop = new Set(old.slice(0, loads.length - 60).map((l) => l.id));
      loads = loads.filter((l) => !drop.has(l.id));
    }

    if (!events.length && loads === s.loads) return;
    set({ loads, bids, returns, feed: events.length ? [...events.sort((a, b) => b.at - a.at), ...s.feed].slice(0, 60) : s.feed });
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
