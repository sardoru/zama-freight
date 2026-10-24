"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { useI18n } from "@/i18n/client";

export default function NotFound() {
  const { lang, d } = useI18n();
  return (
    <main className="grid min-h-dvh place-items-center px-6">
      <div className="max-w-md text-center">
        <Logo className="justify-center" />
        <p className="mt-8 font-mono text-sm font-semibold text-signal">404</p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-ink">{d.notFound.title}</h1>
        <p className="mt-3 text-ink-2">{d.notFound.body}</p>
        <Link
          href={`/${lang}`}
          className="mt-8 inline-flex h-11 items-center gap-2 rounded-xl bg-accent px-5 font-semibold text-accent-ink transition hover:bg-accent-hover"
        >
          <ArrowLeft className="size-4" aria-hidden />
          {d.notFound.back}
        </Link>
      </div>
    </main>
  );
}
