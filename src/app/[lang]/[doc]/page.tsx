// "Privacy & data" and "Legal & contact" (issue #15), one localized slug per
// language (see src/lib/doc-routes.ts). Anything else one level under a
// language is a 404, as before.
import { ArrowLeft, ExternalLink } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import { INTL_LOCALE, isLocale, OG_LOCALE, type Locale } from "@/i18n/config";
import { getDict } from "@/i18n/get-dict";
import type { Dict } from "@/i18n/types";
import { DOC_SLUGS, DOCS, docAlternates, docFromSlug, docHref, ISSUES_URL, type Doc } from "@/lib/doc-routes";
import { fill } from "@/lib/utils";

/** When the text of these pages last changed. */
const UPDATED = Date.UTC(2026, 9, 24, 12);

export const dynamicParams = false;

export function generateStaticParams({ params }: { params: { lang: string } }) {
  return isLocale(params.lang) ? DOCS.map((doc) => ({ doc: DOC_SLUGS[params.lang as Locale][doc] })) : [];
}

async function resolve(params: Promise<{ lang: string; doc: string }>): Promise<{ lang: Locale; doc: Doc }> {
  const { lang, doc: slug } = await params;
  if (!isLocale(lang)) notFound();
  const doc = docFromSlug(lang, slug);
  if (!doc) notFound();
  return { lang, doc };
}

export async function generateMetadata({ params }: PageProps<"/[lang]/[doc]">): Promise<Metadata> {
  const { lang, doc } = await resolve(params);
  const d = getDict(lang);
  const text = d[doc];
  const title = `${text.title} · ${d.meta.siteName}`;
  // A page's openGraph replaces the layout's whole object, so the share card is named again here
  // (the per-language card from opengraph-image.tsx's generateImageMetadata, id "card").
  const card = { url: `/${lang}/opengraph-image/card`, width: 1200, height: 630, alt: d.meta.ogAlt };
  return {
    title: text.title,
    description: text.lead,
    alternates: { canonical: docHref(lang, doc), languages: { ...docAlternates(doc), "x-default": docHref("es", doc) } },
    openGraph: { type: "website", siteName: d.meta.siteName, url: docHref(lang, doc), title, description: text.lead, locale: OG_LOCALE[lang], images: [card] },
    twitter: { card: "summary_large_image", title, description: text.lead, images: [card.url] },
  };
}

export default async function DocRoute({ params }: PageProps<"/[lang]/[doc]">) {
  const { lang, doc } = await resolve(params);
  const d = getDict(lang);
  const text = d[doc];
  const updated = new Intl.DateTimeFormat(INTL_LOCALE[lang], { dateStyle: "long", timeZone: "Europe/Madrid" }).format(UPDATED);
  const other: Doc = doc === "privacy" ? "legal" : "privacy";

  return (
    <div className="relative">
      <SiteHeader lang={lang} d={d} />
      <main className="mx-auto max-w-3xl px-4 pt-8 pb-16 sm:px-6 sm:pt-12">
        <Link href={`/${lang}`} className="flex w-fit items-center gap-1.5 text-sm font-semibold text-accent-text hover:underline">
          <ArrowLeft className="size-4" aria-hidden />
          {d.notFound.back}
        </Link>
        <p className="mt-6 flex w-fit rounded-full bg-signal-soft px-2.5 py-0.5 text-[0.7rem] font-bold tracking-wide text-signal uppercase">{d.meta.badge}</p>
        <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-balance text-ink sm:text-4xl">{text.title}</h1>
        <p className="mt-4 text-base leading-relaxed text-pretty text-ink-2 sm:text-lg">{text.lead}</p>
        <p className="mt-3 text-sm text-ink-3">{fill(d.privacy.updated, { date: updated })}</p>

        <div className="mt-10 space-y-10">{doc === "privacy" ? <Privacy lang={lang} d={d} /> : <Legal d={d} />}</div>

        <p className="mt-12 border-t border-line pt-6 text-sm">
          <Link href={docHref(lang, other)} className="font-semibold text-accent-text hover:underline">
            {d[other].title}
          </Link>
        </p>
      </main>
      <SiteFooter lang={lang} d={d} />
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-xl font-extrabold tracking-tight text-ink">{title}</h2>
      <div className="mt-3 space-y-3 text-[0.95rem] leading-relaxed text-ink-2">{children}</div>
    </section>
  );
}

/** A definition list of "what · where · why" rows. */
function Rows({ rows }: { rows: { term: ReactNode; body: string }[] }) {
  return (
    <dl className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
      {rows.map((r, i) => (
        <div key={i} className="grid gap-1 px-4 py-3.5 sm:grid-cols-[12rem_minmax(0,1fr)] sm:gap-5">
          <dt className="min-w-0 font-semibold break-words text-ink">{r.term}</dt>
          <dd className="min-w-0 text-ink-2">{r.body}</dd>
        </div>
      ))}
    </dl>
  );
}

const code = "rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[0.85em] font-semibold text-ink";

function IssuesLink() {
  return (
    <a href={ISSUES_URL} rel="noopener noreferrer" target="_blank" className="inline-flex items-center gap-1.5 font-semibold break-all text-accent-text underline underline-offset-4">
      github.com/sardoru/zama-freight/issues
      <ExternalLink className="size-3.5 shrink-0" aria-hidden />
    </a>
  );
}

function Privacy({ lang, d }: { lang: Locale; d: Dict }) {
  const p = d.privacy;
  return (
    <>
      <Section title={p.storedTitle}>
        <p>{p.storedLead}</p>
        <Rows
          rows={[
            { term: <code className={code}>zama-demo-v1</code>, body: p.demoKey },
            { term: <code className={code}>zama-theme</code>, body: p.themeKey },
            { term: <code className={code}>zama-lang</code>, body: p.langKey },
          ]}
        />
        <p>{fill(p.clear, { reset: d.common.reset })}</p>
      </Section>
      <Section title={p.hostsTitle}>
        <p>{p.hostsLead}</p>
        <Rows
          rows={[
            { term: p.ofmName, body: p.ofm },
            { term: p.awsName, body: p.aws },
          ]}
        />
        <p>{p.hostsWhy}</p>
      </Section>
      <Section title={p.hostingTitle}>
        <p>{p.hosting}</p>
      </Section>
      <Section title={p.noneTitle}>
        <p>{p.none}</p>
      </Section>
      <Section title={p.contactTitle}>
        <p>{p.contact}</p>
        <p>
          <IssuesLink />
        </p>
        <p>
          <Link href={docHref(lang, "legal")} className="font-semibold text-accent-text underline underline-offset-4">
            {d.legal.title}
          </Link>
        </p>
      </Section>
    </>
  );
}

function Legal({ d }: { d: Dict }) {
  const l = d.legal;
  return (
    <>
      <Section title={l.serviceTitle}>
        <p>{l.service}</p>
      </Section>
      <Section title={l.simTitle}>
        <p>{l.sim}</p>
      </Section>
      <Section title={l.operatorTitle}>
        <p>{l.operator}</p>
        {/* Deliberately not filled in: no personal name, email or address is published here. */}
        <p className="rounded-xl border-2 border-dashed border-line-strong bg-surface-2 px-4 py-3 font-mono text-sm text-ink-2">{l.operatorPlaceholder}</p>
      </Section>
      <Section title={l.contactTitle}>
        <p>{l.contact}</p>
        <p>
          <IssuesLink />
        </p>
      </Section>
      <Section title={l.hostingTitle}>
        <p>{l.hosting}</p>
      </Section>
      <Section title={l.creditsTitle}>
        <p>{l.credits}</p>
        {/* The sources inside the terrain tiles, credited as on the map (issue #17). */}
        <p>{[d.map.credits.eudem, d.map.credits.usgs, d.map.credits.noaa].join(". ")}.</p>
      </Section>
    </>
  );
}
