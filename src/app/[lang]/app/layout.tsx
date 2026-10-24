import type { Metadata } from "next";
import { AppShell } from "@/components/app/shell";
import { isLocale } from "@/i18n/config";
import { getDict } from "@/i18n/get-dict";

export async function generateMetadata({ params }: LayoutProps<"/[lang]/app">): Promise<Metadata> {
  const { lang } = await params;
  if (!isLocale(lang)) return {};
  // The demo is an app, not content: keep it out of search results.
  // A plain string here would clear the root layout's "%s · Zama" template for the pages below.
  return { title: { default: getDict(lang).meta.appTitle, template: "%s · Zama" }, robots: { index: false, follow: true } };
}

export default function AppLayout({ children }: LayoutProps<"/[lang]/app">) {
  return <AppShell>{children}</AppShell>;
}
