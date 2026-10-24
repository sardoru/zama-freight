"use client";

import {
  CircleCheck,
  ClipboardList,
  Clock,
  Home,
  Info,
  Map as MapIcon,
  MoreHorizontal,
  Package,
  Radio,
  RotateCcw,
  Send,
  TriangleAlert,
  Truck,
  Warehouse,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { LangSwitcher } from "@/components/lang-switcher";
import { LogoMark } from "@/components/logo";
import { ThemeToggle } from "@/components/theme";
import { Spinner } from "@/components/ui";
import type { Role } from "@/data/types";
import { useI18n } from "@/i18n/client";
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
  const { d } = useI18n();

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
          {ready ? children : <Spinner label={d.app.preparing} className="h-full" />}
        </main>
      </div>
      <BottomNav />
      <Toasts />
    </div>
  );
}

function TopBar() {
  const { lang, d } = useI18n();
  return (
    <header className="glass relative z-30 flex h-14 shrink-0 items-center gap-2 border-b border-line px-3 sm:px-4">
      <Link href={`/${lang}`} className="flex shrink-0 items-center gap-2" aria-label="Zama">
        <LogoMark className="size-7" />
        <span className="hidden text-[1.02rem] font-extrabold tracking-tight text-ink sm:inline">Zama</span>
      </Link>
      <span className="hidden rounded-md bg-signal-soft px-1.5 py-0.5 text-[0.65rem] font-bold tracking-wide text-signal uppercase md:inline">{d.common.demoData}</span>
      <div className="ml-auto flex min-w-0 items-center gap-1.5 sm:gap-2">
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
              {d.roles[r]}
            </button>
          );
        })}
      </div>
      <label className="relative inline-flex h-9 min-w-0 items-center rounded-lg border border-line bg-surface text-sm text-ink transition focus-within:border-accent lg:hidden">
        <Icon className="pointer-events-none absolute left-2.5 size-4 text-accent-text" aria-hidden />
        <span className="sr-only">{d.roles.youAre}</span>
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as Role)}
          className="h-full max-w-[9.5rem] min-w-0 cursor-pointer appearance-none truncate bg-transparent pr-2.5 pl-8 font-semibold outline-none"
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
      aria-label={`${d.app.clock} ${now ? f.time(now) : ""}, ${d.app.speed} ×${speed}`}
      className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-line bg-surface px-2 text-sm text-ink transition hover:border-line-strong"
    >
      <Clock className="size-4 text-signal" aria-hidden />
      <span className="tnum font-mono text-[0.8rem] font-semibold">{now ? f.time(now) : "--:--"}</span>
      <span className="tnum rounded bg-surface-2 px-1 font-mono text-[0.68rem] font-semibold text-ink-3">×{speed}</span>
    </button>
  );
}

function AppMenu() {
  const { lang, d } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const reset = useMarket((s) => s.reset);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", close);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", close);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label={d.common.menu}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex size-9 items-center justify-center rounded-lg border border-line bg-surface text-ink-2 transition hover:border-line-strong hover:text-ink"
      >
        {open ? <X className="size-4" aria-hidden /> : <MoreHorizontal className="size-4" aria-hidden />}
      </button>
      {open ? (
        <div className="absolute top-11 right-0 z-50 w-72 rounded-2xl border border-line bg-surface p-2 shadow-2xl">
          <div className="flex gap-2 p-1 sm:hidden">
            <LangSwitcher className="flex-1" />
            <ThemeToggle />
          </div>
          <Link href={`/${lang}`} onClick={() => setOpen(false)} className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-ink-2 hover:bg-surface-2 hover:text-ink">
            <Home className="size-4" aria-hidden />
            {d.nav.home}
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
  const { t } = useI18n();
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
            <button type="button" onClick={() => dismiss(x.id)} className="text-ink-3 hover:text-ink" aria-label="×">
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
