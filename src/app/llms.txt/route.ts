// /llms.txt (https://llmstxt.org): a plain-text briefing for language models and
// other machine readers, so nobody summarises the demo as a live market (issue #3).
// The rule facts are the ones the app checks (issues #2, #4, #9, #10): dates and
// limits come from the same constants as lib/checks.ts and lib/cabotage.ts.
import { CARRIERS } from "@/data/companies";
import { PLACE_IDS } from "@/data/places";
import { LOCALE_NAMES, LOCALES } from "@/i18n/config";
import { getDict } from "@/i18n/get-dict";
import { CABOTAGE_LIMIT, CABOTAGE_WINDOW_DAYS, COOLING_OFF_DAYS } from "@/lib/cabotage";
import { COMMUNITY_LICENCE_ABOVE_KG, DECA_MANDATORY, LIGHT_VAN_TACHOGRAPH_FROM, ZBE_PHASE2 } from "@/lib/checks";
import { docHref, REPO_URL } from "@/lib/doc-routes";
import { TZ } from "@/lib/format";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-static";

const LANGUAGE = { es: "Spanish", eu: "Basque", fr: "French", en: "English", ru: "Russian" } as const;

const day = (t: number) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: TZ }).format(t);

export function GET() {
  const url = (path: string) => `${SITE_URL}${path}`;
  const en = getDict("en");
  const text = `# Zama

> Zama is a non-commercial prototype of a freight and warehouse marketplace for the Basque cross-border corridor: San Sebastián / Donostia, the port of Pasaia, Irun, Hendaye and Biarritz–Anglet–Bayonne. It is a simulation. Every company, person, vehicle, plate, price, bid and route in it is invented or approximate. Zama offers no services, takes no bookings or payments, and is not a transport operator, freight forwarder or warehouse keeper.

The whole market runs in the visitor's browser. There is no backend: what a visitor does is saved in their browser's local storage only. The live map loads tiles from OpenFreeMap (tiles.openfreemap.org) and terrain tiles from AWS (the elevation-tiles-prod bucket, us-east-1).

## The four roles

- Shipper: posts a load, sees an instant price from the demo's price model, compares carrier bids and accepts one, or books an empty return trip.
- Carrier: bids on loads with a vehicle from its fleet, takes instant-price loads, and posts its empty drive home as a return trip.
- Dispatcher: follows every truck on a live 3D map, assigns vehicles, marks departures and deliveries, and clears compliance alerts.
- Warehouse: runs six warehouses as 3D digital twins: stock, slotting, cycle counts, dock-door bookings and cross-dock.

## Rules the demo checks (simplified; not legal advice)

- Donostia / San Sebastián low-emission zone (ZBE Donostia Centro: the Parte Vieja, Centro and part of Amara; Gros and Egia are outside). Vehicles with the DGT 0, ECO and C labels may enter. B-label vehicles may enter until ${day(ZBE_PHASE2 - 1)} and are banned from phase 2, which starts on ${day(ZBE_PHASE2)} under the ordinance (the city's website says 2028). Vehicles without a label are banned, except regular delivery vehicles with an authorisation, which lasts until phase 2. Foreign-plated vehicles have no DGT label and need the city's authorisation before they enter.
- Licences: international jobs and cabotage need a Community licence for vehicles over ${COMMUNITY_LICENCE_ABOVE_KG / 1000} t, and light vans (${COMMUNITY_LICENCE_ABOVE_KG / 1000}–3.5 t) on them need a tachograph from ${day(LIGHT_VAN_TACHOGRAPH_FROM)}.
- Transport documents depend on where the trip runs:
  - Inside Spain: the control document DeCA, issued by the contracting shipper and the carrier, electronic and mandatory from ${day(DECA_MANDATORY)}, cabotage included. Transport that needs no licence, house removals and parcels are exempt.
  - Between Spain and France: a CMR consignment note made out by the sender, on paper, or as an e-CMR by agreement: only if both parties agree. Spain and France both ratified the e-CMR protocol; neither requires it.
  - Inside France: a lettre de voiture, drawn up by the carrier; on a cabotage leg it also shows the vehicle's plate and the unloading date.
- EU cabotage (Regulation (EC) No 1072/2009 as amended by Regulation (EU) 2020/1055), counted per vehicle and per host country: after unloading an incoming international carriage in a country, a vehicle may make at most ${CABOTAGE_LIMIT} cabotage operations there, the last one unloaded by the end of the ${CABOTAGE_WINDOW_DAYS}th day after that unloading. Once it has left that country, a ${COOLING_OFF_DAYS}-day cooling-off applies there to that vehicle. Drivers on cabotage and cross-trade jobs count as posted and need a posting declaration.

## Prices and numbers

- Prices, the "market range", surcharges and the return-trip discount (about 30 %) come from a hand-tuned demo model. They are not market rates or tariffs.
- The demo has ${PLACE_IDS.length} places, ${CARRIERS.length} simulated carriers and ${LOCALES.length} languages. None of this is usage or traction data.

## Pages

${LOCALES.map((l) => `- [${LOCALE_NAMES[l]}](${url(`/${l}`)}): landing page in ${LANGUAGE[l]}`).join("\n")}
- [Live demo](${url("/en/app")}): the simulated market (English; replace "en" with es, eu, fr or ru)
- [${en.privacy.title}](${url(docHref("en", "privacy"))}): what is stored in the browser and which servers the map contacts
- [${en.legal.title}](${url(docHref("en", "legal"))}): non-commercial prototype, no services; contact through GitHub issues

## Optional

- [Source code](${REPO_URL}): Next.js, MapLibre GL, deck.gl and three.js
`;
  return new Response(text, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
