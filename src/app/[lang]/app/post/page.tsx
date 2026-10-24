import type { Metadata } from "next";
import { PostLoad } from "@/components/screens/post";
import { isLocale } from "@/i18n/config";
import { getDict } from "@/i18n/get-dict";

export async function generateMetadata({ params }: PageProps<"/[lang]/app/post">): Promise<Metadata> {
  const { lang } = await params;
  return isLocale(lang) ? { title: getDict(lang).nav.post } : {};
}

export default function Page() {
  return <PostLoad />;
}
