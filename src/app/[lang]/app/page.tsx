import type { Metadata } from "next";
import { isLocale } from "@/i18n/config";
import { getDict } from "@/i18n/get-dict";

export async function generateMetadata({ params }: PageProps<"/[lang]/app">): Promise<Metadata> {
  const { lang } = await params;
  return isLocale(lang) ? { title: getDict(lang).nav.map } : {};
}

// The live map is drawn by the app layout (MapHost), which keeps it mounted while
// the other screens are open; this route only has to exist and name the page.
export default function Page() {
  return null;
}
