import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Interpolates a {{name}} template. Unknown keys are left as they are. */
export function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

const pluralRules = new Map<string, Intl.PluralRules>();

/**
 * Plural-aware count text. A template may hold forms separated by "|" (first =
 * "one", last = everything else), e.g. "{{n}} bid|{{n}} bids"; a template with
 * a single form is used as is. {{n}} is replaced by `shown` (defaults to n).
 */
export function plural(template: string, n: number, locale: string, shown: string | number = n): string {
  const forms = template.split("|");
  let form = forms[forms.length - 1];
  if (forms.length > 1) {
    let rules = pluralRules.get(locale);
    if (!rules) pluralRules.set(locale, (rules = new Intl.PluralRules(locale)));
    if (rules.select(n) === "one") form = forms[0];
  }
  return form.replace(/\{\{n\}\}/g, String(shown));
}
