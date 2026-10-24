import type { Metadata } from "next";
import { AppShell } from "@/components/app/shell";
import { MapCredits } from "@/components/map/credits";
import { MapHost } from "@/components/map/map-host";
import { isLocale } from "@/i18n/config";
import { getDict } from "@/i18n/get-dict";

export async function generateMetadata({ params }: LayoutProps<"/[lang]/app">): Promise<Metadata> {
  const { lang } = await params;
  if (!isLocale(lang)) return {};
  // The demo is an app, not content: keep it out of search results.
  // An object, not a string: a plain string here would drop the root "%s · {siteName}" template for the screens below.
  const d = getDict(lang);
  return { title: { default: d.meta.appTitle, template: `%s · ${d.meta.siteName}` }, robots: { index: false, follow: true } };
}

export default function AppLayout({ children }: LayoutProps<"/[lang]/app">) {
  return (
    <>
      <AppShell>
        {/* The live map lives here, not in /app/page.tsx, so it survives visits to the other screens. */}
        <MapHost />
        {children}
      </AppShell>
      {/* Its credits are in the server HTML, so they show from the first paint (credits.tsx). */}
      <MapCredits />
    </>
  );
}
