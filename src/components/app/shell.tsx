"use client";

import {
  CircleCheck,
  ClipboardList,
  Clock,
  FileText,
  Home,
  Info,
  Map as MapIcon,
  MoreHorizontal,
  Package,
  Radio,
  RotateCcw,
  Send,
  ShieldCheck,
  TriangleAlert,
  Truck,
  Warehouse,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { LangSwitcher } from "@/components/lang-switcher";
import { screenIntro } from "@/components/app/intro";
import { LogoMark } from "@/components/logo";
import { ThemeToggle } from "@/components/theme";
import { Spinner, useModalFocus } from "@/components/ui";
import type { Role } from "@/data/types";
import { useI18n } from "@/i18n/client";
import { docHref } from "@/lib/doc-routes";
import { cn } from "@/lib/utils";
import { useMarket } from "@/store/market";
import { refreshSimNow, useSimNow } from "@/store/use-sim-now";

export const ROLES: Role[] = ["shipper", "carrier", "dispatcher", "warehouse"];
const ROLE_ICON = { shipper: Package, carrier: Truck, dispatcher: Radio, warehouse: Warehouse } as const;

const NAV = [
  { id: "map", href: "", icon: MapIcon },
  { id: "loads", href: "/loads", icon: ClipboardList },
  { id: "post", href: "/post", icon: Send },
  { id: "dispatch", href: "/dispatch", icon: Radio },
  { id: "fleet", href: "/fleet", icon: Truck },
  { id: "warehouse", href: "/warehouse", icon: Warehouse },
] as const;

function useActive() {
  const { lang } = useI18n();
  const pathname = usePathname();
  const base = `/${lang}/app`;
  return (href: string) => (href ? pathname.startsWith(base + href) : pathname === base || pathname === `${base}/`);
}

export function AppShell({ children }: { children: ReactNode }) {
  const ready = useMarket((s) => s.ready);

  useEffect(() => {
    const s = useMarket.getState();
    s.init();
    refreshSimNow();
    const as = new URLSearchParams(window.location.search).get("as") as Role | null;
    if (as && ROLES.includes(as)) {
      s.setRole(as);
      const url = new URL(window.location.href);
      url.searchParams.delete("as");
      window.history.replaceState(window.history.state, "", url);
    }
    const id = setInterval(() => useMarket.getState().tick(), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="flex h-dvh flex-col">
      <TopBar />
      <div className="flex min-h-0 flex-1">
        <SideNav />
        <main id="main" className="relative min-h-0 min-w-0 flex-1 overflow-y-auto scrollbar-thin">
          {ready ? children : <Preparing />}
        </main>
      </div>
      <BottomNav />
      <Toasts />
    </div>
  );
}

/**
 * Before the market is ready: the screen's own header over a spinner. It is in the server HTML, so the title and lead
 * paint with the first frame (issue #18); the map has no header, only its credits (also in the server HTML).
 */
function Preparing() {
  const { d, lang, place } = useI18n();
  const pathname = usePathname();
  const base = `/${lang}/app`;
  const screen = NAV.find((n) => n.href && pathname.startsWith(base + n.href))?.id;
  if (!screen || screen === "map") return <Spinner label={d.app.preparing} className="h-full" />;
  const intro = screenIntro(screen, d, place);
  return (
    <Page className={intro.wide ? "max-w-none" : undefined}>
      <PageHeader title={intro.title} lead={intro.lead} />
      <Spinner label={d.app.preparing} className="py-16" />
    </Page>
  );
}

/** "Demo · simulated data", visible at every width (issue #3). */
function DemoChip({ className }: { className?: string }) {
  const { d } = useI18n();
  return (
    <span className={cn("inline-flex max-w-full shrink-0 items-center gap-1.5 rounded-md bg-signal-soft px-1.5 py-0.5 text-[0.65rem] leading-4 font-bold tracking-wide text-signal uppercase", className)}>
      <span className="size-1.5 shrink-0 rounded-full bg-current" aria-hidden />
      <span className="min-w-0 truncate">{d.common.demoData}</span>
    </span>
  );
}

function TopBar() {
  const { lang } = useI18n();
  return (
    // One row from md up; below that the controls fill the first row and the chip gets a row of its own.
    <header className="glass relative z-30 grid shrink-0 grid-cols-[auto_minmax(0,1fr)] grid-rows-[3.5rem_auto] items-center gap-x-2 border-b border-line px-3 sm:px-4 md:grid-cols-[auto_auto_minmax(0,1fr)] md:grid-rows-[3.5rem]">
      <Link href={`/${lang}`} className="col-start-1 row-start-1 -m-1.5 flex shrink-0 items-center gap-2 rounded-lg p-1.5" aria-label="Zama">
        <LogoMark className="size-7" />
        <span className="hidden text-[1.02rem] font-extrabold tracking-tight text-ink sm:inline">Zama</span>
      </Link>
      <DemoChip className="col-span-2 col-start-1 row-start-2 -mt-1.5 mb-1.5 justify-self-start md:col-span-1 md:col-start-2 md:row-start-1 md:m-0" />
      <div className="col-start-2 row-start-1 flex min-w-0 items-center justify-end gap-1.5 sm:gap-2 md:col-start-3">
        <RoleSwitcher />
        <SimClock />
        <LangSwitcher className="hidden sm:inline-flex" />
        <ThemeToggle className="hidden sm:inline-flex" />
        <AppMenu />
      </div>
    </header>
  );
}

function RoleSwitcher() {
  const { d } = useI18n();
  const role = useMarket((s) => s.role);
  const setRole = useMarket((s) => s.setRole);
  const Icon = ROLE_ICON[role];
  return (
    <>
      <div role="radiogroup" aria-label={d.roles.title} className="hidden items-center gap-0.5 rounded-xl border border-line bg-surface-2 p-0.5 lg:flex">
        {ROLES.map((r) => {
          const I = ROLE_ICON[r];
          return (
            <button
              key={r}
              type="button"
              role="radio"
              aria-checked={role === r}
              onClick={() => setRole(r)}
              title={d.roles[`${r}Desc` as const]}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-[0.6rem] px-2.5 text-[0.8rem] font-semibold text-ink-2 transition hover:text-ink",
                role === r && "bg-surface text-ink shadow-sm ring-1 ring-line",
              )}
            >
              <I className="size-4" aria-hidden />
              {/* Below xl only the current role is spelled out, so the demo chip fits next to the logo. */}
              <span className={cn(role !== r && "sr-only xl:not-sr-only")}>{d.roles[r]}</span>
            </button>
          );
        })}
      </div>
      <label className="relative inline-flex h-10 min-w-0 items-center rounded-lg border border-line bg-surface text-sm text-ink transition focus-within:border-accent lg:hidden">
        <Icon className="pointer-events-none absolute left-2.5 size-4 text-accent-text" aria-hidden />
        <span className="sr-only">{d.roles.youAre}</span>
        {/* No outline-none: keyboard focus gets the global focus ring, not just a border tint. */}
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as Role)}
          className="h-full max-w-[11rem] min-w-0 cursor-pointer appearance-none truncate rounded-lg bg-transparent pr-2.5 pl-8 font-semibold"
        >
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {d.roles[r]}
            </option>
          ))}
        </select>
      </label>
    </>
  );
}

const SPEEDS = [1, 20, 60];

function SimClock() {
  const { d, f } = useI18n();
  const now = useSimNow();
  const speed = useMarket((s) => s.clock.speed);
  const setSpeed = useMarket((s) => s.setSpeed);
  const next = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length] ?? 20;
  return (
    <button
      type="button"
      onClick={() => {
        setSpeed(next);
        refreshSimNow();
      }}
      title={`${d.app.clock} · ${d.app.speed} ×${speed}`}
      // The name starts with what is on the button (WCAG 2.5.3), then says what it is.
      aria-label={`${now ? f.time(now) : "--:--"} ×${speed} · ${d.app.clock}, ${d.app.speed}`}
      className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg border border-line bg-surface px-2 text-sm text-ink transition hover:border-line-strong"
    >
      <Clock className="size-4 text-signal" aria-hidden />
      {/* Tabular Manrope rather than the mono font: this is in the first frame of every screen, and the mono font
          would then be fetched before it (issue #18). A fixed width, so "--:--" becoming the time moves nothing. */}
      <span className="tnum inline-block w-[4.6ch] text-center text-[0.8rem] font-semibold">{now ? f.time(now) : "--:--"}</span>
      {/* Hidden on the narrowest phones to leave room for the role name; the speed stays in the label. */}
      <span className="tnum hidden rounded bg-surface-2 px-1 text-[0.68rem] font-semibold text-ink-3 min-[25rem]:inline">×{speed}</span>
    </button>
  );
}

function AppMenu() {
  const { lang, d } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const reset = useMarket((s) => s.reset);
  // Same focus handling as the sheets: focus moves in, Tab stays in, Escape closes and returns to ⋯.
  const { keepFocus } = useModalFocus(open, panel, () => setOpen(false), "first");

  useEffect(() => {
    if (!open) return;
    // A press outside closes the menu and leaves focus where the user pressed.
    const close = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) {
        keepFocus();
        setOpen(false);
      }
    };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [open, keepFocus]);

  const item = "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-ink-2 hover:bg-surface-2 hover:text-ink";
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label={d.common.menu}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex size-10 items-center justify-center rounded-lg border border-line bg-surface text-ink-2 transition hover:border-line-strong hover:text-ink"
      >
        {open ? <X className="size-4" aria-hidden /> : <MoreHorizontal className="size-4" aria-hidden />}
      </button>
      {open ? (
        <div ref={panel} role="dialog" aria-modal="true" aria-label={d.common.menu} tabIndex={-1} className="absolute top-12 right-0 z-50 w-72 rounded-2xl border border-line bg-surface p-2 shadow-2xl outline-none">
          <div className="flex gap-2 p-1 sm:hidden">
            <LangSwitcher className="flex-1" />
            <ThemeToggle />
          </div>
          <Link href={`/${lang}`} onClick={() => setOpen(false)} className={item}>
            <Home className="size-4" aria-hidden />
            {d.nav.home}
          </Link>
          <Link href={docHref(lang, "privacy")} onClick={() => setOpen(false)} className={item}>
            <ShieldCheck className="size-4" aria-hidden />
            {d.privacy.title}
          </Link>
          <Link href={docHref(lang, "legal")} onClick={() => setOpen(false)} className={item}>
            <FileText className="size-4" aria-hidden />
            {d.legal.title}
          </Link>
          <button
            type="button"
            onClick={() => {
              if (window.confirm(d.common.resetConfirm)) {
                reset();
                refreshSimNow();
                setOpen(false);
              }
            }}
            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-danger hover:bg-danger-soft"
          >
            <RotateCcw className="size-4" aria-hidden />
            {d.common.reset}
          </button>
          <p className="mt-1 flex gap-2 border-t border-line px-2.5 pt-2.5 pb-1 text-xs leading-relaxed text-ink-3">
            <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            {d.app.demoNote}
          </p>
        </div>
      ) : null}
    </div>
  );
}

function SideNav() {
  const { lang, d } = useI18n();
  const active = useActive();
  return (
    <nav aria-label="Zama" className="hidden w-[4.5rem] shrink-0 flex-col gap-1 border-r border-line bg-surface p-2 md:flex xl:w-56">
      {NAV.map((n) => {
        const on = active(n.href);
        return (
          <Link
            key={n.id}
            href={`/${lang}/app${n.href}`}
            aria-current={on ? "page" : undefined}
            title={d.nav[n.id]}
            className={cn(
              "group flex flex-col items-center gap-1 rounded-xl px-1 py-2 text-[0.65rem] font-semibold text-ink-3 transition hover:bg-surface-2 hover:text-ink xl:flex-row xl:gap-3 xl:px-3 xl:py-2.5 xl:text-sm",
              on && "bg-accent-soft text-accent-text hover:bg-accent-soft hover:text-accent-text",
            )}
          >
            <n.icon className="size-5 shrink-0" aria-hidden />
            <span className="max-w-full truncate xl:hidden">{d.nav.short[n.id]}</span>
            <span className="hidden truncate xl:inline">{d.nav[n.id]}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function BottomNav() {
  const { lang, d } = useI18n();
  const active = useActive();
  return (
    <nav aria-label="Zama" className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 backdrop-blur-xl md:hidden">
      <div className="grid h-16 grid-cols-6">
        {NAV.map((n) => {
          const on = active(n.href);
          return (
            <Link
              key={n.id}
              href={`/${lang}/app${n.href}`}
              aria-current={on ? "page" : undefined}
              className={cn("flex min-w-0 flex-col items-center justify-center gap-1 text-[0.62rem] font-semibold text-ink-3", on && "text-accent-text")}
            >
              <span className={cn("flex h-7 w-11 items-center justify-center rounded-full transition", on && "bg-accent-soft")}>
                <n.icon className="size-5" aria-hidden />
              </span>
              <span className="max-w-full truncate px-0.5">{d.nav.short[n.id]}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

function Toasts() {
  const { t, d } = useI18n();
  const toasts = useMarket((s) => s.toasts);
  const dismiss = useMarket((s) => s.dismissToast);
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 top-16 z-[60] flex flex-col items-center gap-2 px-3 md:inset-x-auto md:top-auto md:right-4 md:bottom-4 md:items-end">
      {toasts.map((x) => {
        const Icon = x.tone === "warn" ? TriangleAlert : x.tone === "info" ? Info : CircleCheck;
        return (
          <div key={x.id} className="z-rise pointer-events-auto flex w-full max-w-sm items-start gap-2.5 rounded-xl border border-line bg-surface px-3.5 py-3 text-sm text-ink shadow-2xl">
            <Icon className={cn("mt-0.5 size-4 shrink-0", x.tone === "warn" ? "text-warn" : x.tone === "info" ? "text-blue" : "text-green")} aria-hidden />
            <span className="min-w-0 flex-1">{t(x.key, x.vars)}</span>
            <button
              type="button"
              onClick={() => dismiss(x.id)}
              className="-my-2 -mr-2 inline-flex size-10 shrink-0 items-center justify-center rounded-lg text-ink-3 hover:text-ink"
              aria-label={d.common.close}
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>
        );
      })}
    </div>
  );
}

/** Page header used by every app screen. */
export function PageHeader({ title, lead, actions }: { title: ReactNode; lead?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-extrabold tracking-tight text-ink">{title}</h1>
        {lead ? <p className="mt-1 text-sm text-ink-3">{lead}</p> : null}
      </div>
      {actions}
    </div>
  );
}

/** Standard padded page body with room for the phone's bottom nav. */
export function Page({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("mx-auto w-full max-w-[90rem] px-3 pt-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] sm:px-5 md:pt-6 md:pb-10", className)}>{children}</div>;
}
