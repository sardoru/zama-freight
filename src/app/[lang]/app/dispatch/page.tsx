import type { Metadata } from "next";
import { Dispatch } from "@/components/screens/dispatch";
import { isLocale } from "@/i18n/config";
import { getDict } from "@/i18n/get-dict";

export async function generateMetadata({ params }: PageProps<"/[lang]/app/dispatch">): Promise<Metadata> {
  const { lang } = await params;
  return isLocale(lang) ? { title: getDict(lang).nav.dispatch } : {};
}

export default function Page() {
  return <Dispatch />;
}
