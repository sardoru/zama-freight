// The header of each app screen (issue #18). The shell shows it while the market
// starts, so it is in the server HTML and a screen's title and lead paint with the
// first frame (they are its LCP element) instead of after the market is ready; the
// screen shows the same header once it renders. One definition for both, so the
// header doesn't move or change when the screen takes over.
import { CARRIER, ME, VEHICLES } from "@/data/companies";
import type { PlaceId } from "@/data/places";
import type { Dict } from "@/i18n/types";

export type ScreenId = "loads" | "post" | "dispatch" | "fleet" | "warehouse";

export interface ScreenIntro {
  title: string;
  /** Absent when it depends on the market (the load board's count of open loads). */
  lead?: string;
  /** The screen uses the page's full width (no centred column). */
  wide?: boolean;
}

export function screenIntro(id: ScreenId, d: Dict, place: (p: PlaceId) => string): ScreenIntro {
  switch (id) {
    case "loads":
      return { title: d.loads.title };
    case "post":
      return { title: d.post.title, lead: d.post.lead };
    case "dispatch":
      return { title: d.dispatch.title, lead: d.dispatch.lead, wide: true };
    case "fleet": {
      const me = CARRIER.get(ME.carrierId)!;
      const n = VEHICLES.filter((v) => v.carrierId === me.id).length;
      return { title: d.fleet.title, lead: d.fleet.lead.replace("{{carrier}}", me.name).replace("{{n}}", String(n)).replace("{{base}}", place(me.base)) };
    }
    case "warehouse":
      return { title: d.wh.title, lead: d.wh.lead, wide: true };
  }
}
