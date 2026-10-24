"use client";

// The live map is mounted here, by the app layout, the first time /{lang}/app is
// opened, and then kept: on the other app screens it is hidden with
// <Activity mode="hidden">, which keeps its state and DOM but unmounts its
// effects (so the map pauses). Coming back shows the same map, with its tiles,
// camera and overlay, instead of building a new one. Each new map used to leave
// the previous one reachable through deck.gl's overlay, about 1 MB a visit.
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { Activity, Suspense, useState } from "react";
import { useI18n } from "@/i18n/client";

// Its own chunk, so the other screens don't download the map screen's code.
const MapScreen = dynamic(() => import("./map-screen").then((m) => m.MapScreen), { ssr: false });

export function MapHost() {
  const { lang } = useI18n();
  const pathname = usePathname();
  const onMap = pathname === `/${lang}/app` || pathname === `/${lang}/app/`;
  const [visited, setVisited] = useState(onMap);
  if (onMap && !visited) setVisited(true);
  if (!visited) return null;
  return (
    <Activity mode={onMap ? "visible" : "hidden"} name="live-map">
      {/* MapScreen reads ?focus= with useSearchParams. */}
      <Suspense>
        <MapScreen />
      </Suspense>
    </Activity>
  );
}
