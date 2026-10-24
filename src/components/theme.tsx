"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";
import { useI18n } from "@/i18n/client";
import { cn } from "@/lib/utils";

export const THEME_KEY = "zama-theme";
type Pref = "light" | "dark" | "system";

/** Runs before first paint (inlined in <head>) so the page never flashes the wrong theme. */
export const themeScript = `try{var t=localStorage.getItem("${THEME_KEY}");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

const EVENT = "zama-theme-change";

function readPref(): Pref {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

function subscribePref(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

function setPref(p: Pref) {
  try {
    if (p === "system") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, p);
  } catch {
    /* private mode: the choice lasts for this page only */
  }
  const el = document.documentElement;
  if (p === "system") delete el.dataset.theme;
  else el.dataset.theme = p;
  window.dispatchEvent(new Event(EVENT));
}

const isDarkNow = () => {
  const t = document.documentElement.dataset.theme;
  if (t === "dark") return true;
  if (t === "light") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
};

function subscribeDark(cb: () => void) {
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  const mo = new MutationObserver(cb);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  mq.addEventListener("change", cb);
  return () => {
    mo.disconnect();
    mq.removeEventListener("change", cb);
  };
}

/** The theme actually on screen (toggle first, then the OS). */
export function useIsDark(): boolean {
  return useSyncExternalStore(subscribeDark, isDarkNow, () => false);
}

const ORDER: Pref[] = ["system", "light", "dark"];

export function ThemeToggle({ className }: { className?: string }) {
  const { d } = useI18n();
  const pref = useSyncExternalStore(subscribePref, readPref, () => "system" as Pref);
  const next = ORDER[(ORDER.indexOf(pref) + 1) % ORDER.length];
  const Icon = pref === "light" ? Sun : pref === "dark" ? Moon : Monitor;
  const label = { system: d.common.themeSystem, light: d.common.themeLight, dark: d.common.themeDark }[pref];
  return (
    <button
      type="button"
      onClick={() => setPref(next)}
      className={cn(
        "inline-flex h-10 items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 text-sm text-ink-2 transition hover:border-line-strong hover:text-ink",
        className,
      )}
      aria-label={`${d.common.theme}: ${label}`}
      title={`${d.common.theme}: ${label}`}
    >
      <Icon className="size-4" aria-hidden />
      <span className="hidden xl:inline">{label}</span>
    </button>
  );
}
