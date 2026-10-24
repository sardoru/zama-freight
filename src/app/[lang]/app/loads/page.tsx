import type { Metadata } from "next";
import { LoadBoard } from "@/components/screens/loads";
import { isLocale } from "@/i18n/config";
import { getDict } from "@/i18n/get-dict";

export async function generateMetadata({ params }: PageProps<"/[lang]/app/loads">): Promise<Metadata> {
  const { lang } = await params;
  return isLocale(lang) ? { title: getDict(lang).nav.loads } : {};
}

export default function Page() {
  return <LoadBoard />;
}
