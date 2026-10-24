import type { Metadata } from "next";
import { WarehouseScreen } from "@/components/screens/warehouse";
import { isLocale } from "@/i18n/config";
import { getDict } from "@/i18n/get-dict";

export async function generateMetadata({ params }: PageProps<"/[lang]/app/warehouse">): Promise<Metadata> {
  const { lang } = await params;
  return isLocale(lang) ? { title: getDict(lang).nav.warehouse } : {};
}

export default function Page() {
  return <WarehouseScreen />;
}
