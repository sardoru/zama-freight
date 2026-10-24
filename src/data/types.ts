import type { Locale } from "@/i18n/config";
import type { PlaceId } from "./places";

export type Role = "shipper" | "carrier" | "dispatcher" | "warehouse";

export type VehicleType = "van" | "rigid" | "artic" | "reefer" | "flatbed";

export type GoodsType =
  | "pallets"
  | "food"
  | "chilled"
  | "frozen"
  | "steel"
  | "paper"
  | "furniture"
  | "beverages"
  | "pharma"
  | "surf"
  | "agri"
  | "parts";

export type LoadStatus = "open" | "booked" | "assigned" | "inTransit" | "delivered" | "cancelled";

/** Spanish DGT environmental label (Donostia's ZBE admits 0, ECO and C). */
export type EcoLabel = "0" | "ECO" | "C" | "B";

export type EcmrState = "none" | "draft" | "shipper" | "carrier" | "delivered";

export interface Shipper {
  id: string;
  name: string;
  sector: GoodsType;
  place: PlaceId;
}

export interface Carrier {
  id: string;
  name: string;
  country: "ES" | "FR" | "LT";
  base: PlaceId;
  rating: number;
  jobs: number;
  /** MDL ≤3.5 t national, MDP heavy national, community = EU licence (cross-border). */
  licence: "MDL" | "MDP" | "community";
  languages: Locale[];
  founded: number;
}

export interface Driver {
  id: string;
  name: string;
  carrierId: string;
  languages: Locale[];
}

export interface Vehicle {
  id: string;
  carrierId: string;
  plate: string;
  type: VehicleType;
  eco: EcoLabel;
  driverId: string;
  home: PlaceId;
  /** Electric drivetrain (shown on the map and in ZBE checks). */
  electric?: boolean;
}

export interface Load {
  id: string;
  shipperId: string;
  from: PlaceId;
  to: PlaceId;
  goods: GoodsType;
  pallets: number;
  kg: number;
  vehicle: VehicleType;
  /** Pickup window start (epoch ms, sim time). */
  pickupAt: number;
  deliverBy: number;
  mode: "bids" | "instant";
  /** The instant price (€, IVA excluded). */
  target: number;
  status: LoadStatus;
  carrierId?: string;
  vehicleId?: string;
  /** Agreed price once booked. */
  price?: number;
  express?: boolean;
  tailLift?: boolean;
  adr?: boolean;
  ecmr: EcmrState;
  departedAt?: number;
  deliveredAt?: number;
  createdAt: number;
  /** Posted from this browser. */
  mine?: boolean;
  /** Booked on a carrier's empty return trip. */
  returnTripId?: string;
  /** Cross-docked through a warehouse on the way. */
  viaWarehouse?: WarehouseId;
}

export interface Bid {
  id: string;
  loadId: string;
  carrierId: string;
  vehicleId: string;
  amount: number;
  /** Earliest pickup the carrier offers (epoch ms). */
  pickupEta: number;
  note?: string;
  at: number;
  status: "pending" | "accepted" | "rejected";
  mine?: boolean;
}

export interface ReturnTrip {
  id: string;
  carrierId: string;
  vehicleId: string;
  from: PlaceId;
  to: PlaceId;
  departAt: number;
  freePallets: number;
  /** Discount on the instant price for loads on this leg (0.2 = 20 % off). */
  discount: number;
  status: "open" | "matched";
  matchedLoadId?: string;
  mine?: boolean;
}

export type WarehouseId = "w-zaisa" | "w-oiartzun" | "w-pasaia" | "w-lezo" | "w-belartza" | "w-bayonne";

export type WarehouseKind = "crossdock" | "dc" | "port" | "cold" | "urban" | "depot";

export type TempZone = "ambient" | "chilled" | "frozen" | "bonded";

export interface Warehouse {
  id: WarehouseId;
  name: string;
  place: PlaceId;
  operator: string;
  kind: WarehouseKind;
  sqm: number;
  doors: number;
  rows: number;
  bays: number;
  levels: number;
  amr: number;
  /** Temperature zone of each rack row (index = row). */
  rowZones: TempZone[];
  hours: string;
  /** SKU ids stored here. */
  assortment: string[];
}

export type BinStatus = "empty" | "stored" | "reserved" | "picking" | "blocked" | "quarantine";

export type Abc = "A" | "B" | "C";

export interface Bin {
  /** "R03-B07-L2" */
  loc: string;
  row: number;
  bay: number;
  level: number;
  zone: TempZone;
  status: BinStatus;
  sku?: string;
  qty?: number;
  lot?: string;
  /** Days until expiry (food and pharma). */
  expiryDays?: number;
  abc?: Abc;
  picksPerDay?: number;
  /** Days since the last cycle count. */
  countedDaysAgo?: number;
  tempC?: number;
  /** Status to restore when a block is lifted. */
  heldFrom?: BinStatus;
}

export interface Sku {
  id: string;
  name: string;
  goods: GoodsType;
  ownerId: string;
  /** Typical picks a day for a pallet position of this SKU. */
  velocity: number;
  unit: string;
  perPallet: number;
  temp: TempZone;
  shelfLifeDays?: number;
}

export interface DockAppt {
  id: string;
  warehouseId: WarehouseId;
  door: number;
  start: number;
  end: number;
  direction: "in" | "out";
  carrierId: string;
  loadId?: string;
  pallets: number;
  status: "scheduled" | "arrived" | "loading" | "done" | "late";
  mine?: boolean;
}

export interface FeedEvent {
  id: string;
  at: number;
  kind: "bid" | "booked" | "assigned" | "departed" | "delivered" | "ecmr" | "dock" | "return" | "posted" | "alert" | "wms";
  /** Dictionary key under feed.* and its variables. */
  key: string;
  vars: Record<string, string | number>;
  loadId?: string;
}
