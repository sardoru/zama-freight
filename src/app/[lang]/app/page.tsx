import type { Metadata } from "next";
import { Suspense } from "react";
import { MapScreen } from "@/components/map/map-screen";
import { isLocale } from "@/i18n/config";
import { getDict } from "@/i18n/get-dict";

export async function generateMetadata({ params }: PageProps<"/[lang]/app">): Promise<Metadata> {
  const { lang } = await params;
  return isLocale(lang) ? { title: getDict(lang).nav.map } : {};
}

export default function Page() {
  // MapScreen reads ?focus= with useSearchParams, which needs a Suspense boundary on a prerendered route.
  return (
    <Suspense>
      <MapScreen />
    </Suspense>
  );
}
