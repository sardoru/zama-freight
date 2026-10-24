// /llms.txt (https://llmstxt.org): a plain-text briefing for language models and
// other machine readers, so nobody summarises the demo as a live market (issue #3).
// The rule facts match the corrected rules of issues #2, #4 and #9.
import { CARRIERS } from "@/data/companies";
import { PLACE_IDS } from "@/data/places";
import { LOCALE_NAMES, LOCALES } from "@/i18n/config";
import { getDict } from "@/i18n/get-dict";
import { docHref, REPO_URL } from "@/lib/doc-routes";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-static";

const LANGUAGE = { es: "Spanish", eu: "Basque", fr: "French", en: "English", ru: "Russian" } as const;

export function GET() {
  const url = (path: string) => `${SITE_URL}${path}`;
  const en = getDict("en");
  const text = `# Zama

> Zama is a non-commercial prototype of a freight and warehouse marketplace for the Basque cross-border corridor: San Sebastián / Donostia, the port of Pasaia, Irun, Hendaye and Biarritz–Anglet–Bayonne. It is a simulation. Every company, person, vehicle, plate, price, bid and route in it is invented or approximate. Zama offers no services, takes no bookings or payments, and is not a transport operator, freight forwarder or warehouse keeper.

The whole market runs in the visitor's browser. There is no backend: what a visitor does is saved in their browser's local storage only. The live map loads tiles from OpenFreeMap and terrain tiles from AWS.

## The four roles

- Shipper: posts a load, sees an instant price from the demo's price model, compares carrier bids and accepts one, or books an empty return trip.
- Carrier: bids on loads with a vehicle from its fleet, takes instant-price loads, and posts its empty drive home as a return trip.
- Dispatcher: follows every truck on a live 3D map, assigns vehicles, marks departures and deliveries, and clears compliance alerts.
- Warehouse: runs six warehouses as 3D digital twins: stock, slotting, cycle counts, dock-door bookings and cross-dock.

## Rules the demo checks (simplified; not legal advice)

- Donostia / San Sebastián low-emission zone (ZBE): vehicles with the DGT 0, ECO, C and B labels may enter; vehicles without a label are banned (regular deliveries can apply for an authorisation). B-label vehicles lose access from phase 2, which the city expects in 2028.
- Transport documents depend on where the trip runs:
  - Inside Spain: the electronic control document DeCA is mandatory for domestic road freight from 5 October 2026.
  - Between Spain and France: a CMR consignment note, on paper or as an e-CMR. The e-CMR is optional; Spain and France both accept it.
  - Inside France: a lettre de voiture.
- EU cabotage (Regulation (EC) No 1072/2009 as amended by the Mobility Package): counted per vehicle. After an international delivery, a vehicle may make at most 3 cabotage operations within 7 days in the host country, then must wait a 4-day cooling-off period before doing cabotage in that country again.

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
