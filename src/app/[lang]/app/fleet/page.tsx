import type { Metadata } from "next";
import { Fleet } from "@/components/screens/fleet";
import { isLocale } from "@/i18n/config";
import { getDict } from "@/i18n/get-dict";

export async function generateMetadata({ params }: PageProps<"/[lang]/app/fleet">): Promise<Metadata> {
  const { lang } = await params;
  return isLocale(lang) ? { title: getDict(lang).nav.fleet } : {};
}

export default function Page() {
  return <Fleet />;
}
