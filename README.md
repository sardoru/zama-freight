# Zama · freight & warehouse marketplace for the Basque coast

**Every truck on the Basque coast, full both ways.**

Zama is a working prototype of a freight and warehouse marketplace for the 50 km cross-border corridor between
**San Sebastián / Donostia**, the **port of Pasaia**, **Irun** (and the Zaisa logistics area), **Hendaye** and the
**Biarritz – Anglet – Bayonne** coast. One market, seen from four seats:

| Role | What they do in Zama |
| --- | --- |
| **Shipper** (*cargador*) | Post a load, get an instant fair price, compare carrier bids, accept one, or book an empty return trip 25–35 % cheaper. |
| **Carrier** (*transportista*) | Bid on loads with a vehicle from their fleet, take instant-price loads, post their empty way home as a return trip. |
| **Dispatcher** (*jefe de tráfico*) | Watch every truck live on a 3D map, assign vehicles, depart and deliver, clear compliance alerts. |
| **Warehouse** (*almacén*) | Run six warehouses as 3D digital twins: stock, slotting, cycle counts, dock-door bookings, cross-dock. |

The UI speaks **Spanish, Basque, French, English and Russian**, has **light and dark** themes, and is built
**mobile-first** (bottom navigation, sheets and touch-friendly 3D on phones).

![Zama share card](docs/screens/share-card-en.png)

> **Prototype.** Every company, driver, plate and price is simulated; routes come from a hand-traced road graph and
> are approximate. Nothing is sent to a server: the whole market runs in the browser.

---

## Screens

| | |
| --- | --- |
| ![Landing (desktop, dark)](docs/screens/landing-dark.png) | ![Live 3D map](docs/screens/map-dark.png) |
| Landing page with the corridor drawn from our own coast outline and road graph. | Live map: trucks with trails, open loads as arcs, return trips, warehouses as columns as tall as they are full.* |
| ![Load board](docs/screens/loads-light.png) | ![Warehouse twin](docs/screens/warehouse-dark.png) |
| Load board with route map, price range, bids, return-trip offers, ZBE / cabotage / DeCA checks. | Warehouse digital twin (three.js): racks, pallets coloured by status, AMRs, dock doors with trucks. |
| ![Dispatch (French)](docs/screens/dispatch-light.png) | |
| Dispatch board in French: needs a carrier → needs a vehicle → ready → on the road → delivered, with alerts. | |

<p>
<img src="docs/screens/landing-phone-light.png" width="200" alt="Landing on a phone (Spanish)">
<img src="docs/screens/post-phone-dark.png" width="200" alt="Post a load on a phone (Basque)">
<img src="docs/screens/fleet-phone-light.png" width="200" alt="Fleet and return trips on a phone (Russian)">
</p>

\* The screenshots were taken in a sandbox without access to the vector-tile server, so the map shows its built-in
**schematic fallback** (our coast outline + real relief). In a normal browser the full OpenFreeMap basemap loads
underneath: streets, land use and 3D buildings lit by the sun.

---

## Features

### Marketplace

- **Instant fair price** for every lane and vehicle, shown before anyone bids: handling + distance + tolls (AP-8 / A-63)
  + border handling + extras (express +25 %, tail-lift +€18, ADR +15 %), with a market range and €/km
  (`src/lib/pricing.ts`, a hand-calibrated demo model, not a tariff).
- **Two ways to book**: *take bids* (carriers send prices; the shipper accepts) or *instant price* (first carrier to accept).
- **Bids** with vehicle, driver, DGT eco label, pickup ETA and a note; the carrier sees whether a bid is strong or weak
  against the fair range.
- **Return trips (backhaul)**: carriers post an empty leg (vehicle, from, to, departure, free pallets, discount). Loads
  are matched when pickup is ≤ 15 km from the leg's start, delivery ≤ 18 km from its end, departure within ±6 h and the
  vehicle can carry it. Shippers can post-and-book in one step; carriers can pull a matching load onto their way home.
- **Electronic consignment note** timeline: draft → shipper → carrier (pickup) → consignee (delivery).
- **Live feed** of what the market is doing, and toasts for everything you do.

### Rules checked before booking

- **Donostia ZBE** (low-emission zone): trips into or out of the zone need a DGT **0, ECO or C** label; a B-label
  vehicle is flagged (`src/lib/checks.ts`).
- **EU cabotage** (Reg. 1072/2009 as amended by the Mobility Package): a foreign carrier may run at most **3 domestic
  operations in 7 days** after an international delivery; bids and assignments show the counter.
- **DeCA / e-CMR**: from **5 October 2026** Spain requires an electronic control document (DeCA) for domestic road
  freight; cross-border trips travel on an e-CMR. Every load shows which one applies.

### Live 3D map (`src/components/map`)

- **MapLibre GL 6** with Zama's own light and dark styles on **OpenFreeMap** vector tiles (OpenMapTiles schema):
  3D building extrusions, motorway refs, logistics land tinted violet, place names in the reader's language.
- **Relief** from the Mapzen / AWS Terrain Tiles: hillshade always, optional **3D terrain**.
- **The real sun**: light direction, colour and sky follow the solar position over the corridor for the market clock,
  or for a preset (dawn, morning, midday, golden hour, dusk, night).
- **deck.gl 9.4**, interleaved in MapLibre's WebGL context: `TripsLayer` trucks with trails moving along their routes,
  pulsing truck heads (electric vans in green), `ArcLayer` open loads (teal = bids, blue = instant price), return trips
  in lime, `ColumnLayer` warehouses whose height is their fill, the corridor road graph, and labels.
- Click anything for a card (load progress and arrival, driver and plate, bids, return-trip matches, warehouse fill)
  with links to the load board or the digital twin. Fly-to presets for the corridor, San Sebastián, Pasaia, the
  Irun–Hendaye border and Biarritz–Bayonne.
- If the tiles can't be reached the map switches to a **schematic fallback** drawn from `src/data/coast.ts`.

### Warehouse digital twin (`src/components/warehouse`, `src/components/screens/warehouse.tsx`)

Six warehouses on the real logistics sites: Zaisa cross-dock (bonded rows), Ugaldetxo DC, Herrera port warehouse,
Lezo cold store (chilled + frozen), Belartza urban hub and the Adour depot in the port of Bayonne.

- **3D twin** with `@react-three/fiber`: instanced pallet positions inside pallet racking (blue uprights, orange
  beams), AMR robots driving the aisles, dock doors with the trucks that are at them right now, temperature and
  customs zones on the floor. **Explode** lifts levels and spreads rows apart.
- **Colour by** status, ABC velocity, fill, temperature or expiry; tap a pallet for its SKU, owner, lot, expiry, class,
  picks per day, last count and walking distance from the dock.
- **Actions**: pick, cycle count, block / release, move to the suggested slot.
- **Inventory** search, **dock-door timeline** with booking and clash detection, **slotting suggestions** (fast movers
  far from the doors or up high → free low positions near the dock, with metres saved per day), **cross-dock** pairing
  of inbound and outbound loads, and KPIs (occupancy, A movers, counts due, expiring stock, doors busy now).

### Everything else

- **Five languages** with locale-aware money, numbers, units and relative times (`Intl`), plurals, hreflang and a
  remembered choice (cookie read by `src/proxy.ts`). Places use the names people use in each language
  (Donostia / San Sebastián / Saint-Sébastien / Сан-Себастьян, Baiona / Bayona / Bayonne / Байонна…).
- **Light and dark themes** (system, light, dark) without a flash on load; the map, the twin and the share cards each
  have their own palettes.
- **Share cards**: a custom 1200×630 Open Graph image per language, rendered at build time with `next/og`.
- **App icon, web manifest, robots and sitemap**; the demo app itself is `noindex`.

---

## How the simulation works

The market is seeded relative to the moment you open the demo (`src/data/seed.ts`), so trucks are already on the road
and pickups are always a few hours away. A **simulated clock** runs at ×20 by default (click the clock for ×1 or ×60),
and a director (`tick()` in `src/store/market.ts`) keeps the market alive every second: carriers bid, other shippers
accept the best bid as pickup nears, booked loads get vehicles, trucks depart and arrive, new loads appear, empty
return trips get filled.

What you create yourself (loads you post, your bids, return trips, dock bookings, warehouse changes, role and map
settings) is saved in your browser (`localStorage`, key `zama-demo-v1`). *Reset demo* in the ⋯ menu clears it.

---

## Tech stack

| | |
| --- | --- |
| Framework | Next.js 16 (App Router, Turbopack, `proxy.ts`), React 19, TypeScript |
| Styling | Tailwind CSS 4, design tokens in `src/app/globals.css`, Manrope + JetBrains Mono (`next/font`) |
| State | zustand 5 |
| Map | MapLibre GL JS 6.15, deck.gl 9.4 (`@deck.gl/maplibre` interleaved overlay) |
| 3D twin | three.js 0.186, @react-three/fiber 9, @react-three/drei 10 |
| Share cards | `next/og` (satori) with WOFF fonts from `assets/fonts` |

```
src/
  app/[lang]/            pages per language: landing, app/{map, loads, post, dispatch, fleet, warehouse}, OG image
  components/            app shell, UI kit, map (style + deck layers), warehouse twin, screens
  data/                  places, road graph & routing, coast outline, companies, warehouses & bins, seeded market
  i18n/                  locales, dictionaries (en is the source; the others are type-checked against it)
  lib/                   pricing, compliance checks, solar position, geodesy, formatting
  store/                 the market store (actions + simulation) and the shared clock
  proxy.ts               sends / and any un-prefixed path to the reader's language
scripts/                 copy-worker.mjs (MapLibre worker → public/vendor), screens.mjs (README screenshots)
```

Notes:

- MapLibre 6 loads its web worker from a URL next to its own module, which a bundler can't follow, so
  `scripts/copy-worker.mjs` copies it to `public/vendor/` (run automatically on install, `dev` and `build`).
- Data-driven screens render on the client after the market opens, so server HTML never disagrees with the simulated
  clock.

---

## Run it

```bash
npm install          # also copies the MapLibre worker into public/vendor
npm run dev          # http://localhost:3000 → redirects to your language
npm run build && npm start
npm run check        # eslint + next typegen + tsc
```

Screenshots for this README:

```bash
npm run build && npm start &
npx playwright install chromium   # once
npm run screens                   # writes docs/screens/*.png (BASE=… to point elsewhere)
```

## Deploy

Vercel, framework preset **Next.js**, no environment variables required. Optional: `NEXT_PUBLIC_SITE_URL` to force the
canonical origin used in Open Graph tags, hreflang and the sitemap (otherwise Vercel's production URL is used).

---

## Assumptions

- **"Bari's area"** in the brief is read as **Biarritz–Anglet–Bayonne** ("BAB"), the French end of the corridor.
  Changing it is a matter of the places in `src/data/places.ts`.
- **Zama** is a working name.
- The first service area is the Basque border corridor; the expansion path in the copy is Bilbao, Vitoria-Gasteiz,
  Pamplona and Bordeaux.

## Limitations (it's a prototype)

- No backend, accounts, payments or real carriers: the market is simulated in each browser.
- Routing uses a hand-traced graph of the A-8/AP-8, A-63, N-1/GI-636, D-810 and urban links (Dijkstra on travel time),
  not a routing engine; times and distances are close at regional scale, approximate street by street.
- Prices, tolls and CO₂ are a demo model. ZBE, cabotage and DeCA logic is simplified to what a dispatcher needs to see.
- The e-CMR / DeCA flow is a status timeline, not an integration with a certified provider.

## Roadmap

1. Backend (Postgres + realtime) with accounts and carrier verification (licence, insurance, cabotage history).
2. A routing engine (Valhalla or OSRM) with HGV profiles, tolls and live traffic.
3. Certified e-CMR / DeCA provider and payments with escrow.
4. Telematics for live positions and arrival times; EV charging for vans in the ZBE.
5. Expand along the corridor: Bilbao, Vitoria-Gasteiz, Pamplona, Bordeaux.

---

## Data & credits

- Map data © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors, tiles by
  [OpenFreeMap](https://openfreemap.org), schema by [OpenMapTiles](https://openmaptiles.org).
- Terrain: [Mapzen Terrain Tiles](https://github.com/tilezen/joerd/blob/master/docs/attribution.md) on AWS Open Data.
- Fonts: Manrope and JetBrains Mono, SIL Open Font License 1.1 (`assets/fonts/OFL.txt`).
- The coast outline, road graph, companies, people and plates were drawn or invented for this prototype.
