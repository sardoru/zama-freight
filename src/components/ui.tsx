"use client";

// Small shared building blocks. Colours come from the theme tokens in
// globals.css, so everything here works in light and dark.
import { Loader2, X } from "lucide-react";
import { forwardRef, useEffect, useEffectEvent, useId, useRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import type { EcoLabel, LoadStatus } from "@/data/types";
import { useI18n } from "@/i18n/client";
import { cn } from "@/lib/utils";

type Tone = "neutral" | "accent" | "signal" | "lime" | "violet" | "green" | "warn" | "danger" | "blue";

const CHIP: Record<Tone, string> = {
  neutral: "bg-surface-2 text-ink-2 border-line",
  accent: "bg-accent-soft text-accent-text border-transparent",
  signal: "bg-signal-soft text-signal border-transparent",
  lime: "bg-lime-soft text-lime border-transparent",
  violet: "bg-violet-soft text-violet border-transparent",
  green: "bg-green-soft text-green border-transparent",
  warn: "bg-warn-soft text-warn border-transparent",
  danger: "bg-danger-soft text-danger border-transparent",
  blue: "bg-blue-soft text-blue border-transparent",
};

export function Chip({ tone = "neutral", className, children, title }: { tone?: Tone; className?: string; children: ReactNode; title?: string }) {
  return (
    <span title={title} className={cn("inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-[0.72rem] leading-4 font-semibold whitespace-nowrap", CHIP[tone], className)}>
      {children}
    </span>
  );
}

const STATUS_TONE: Record<LoadStatus, Tone> = {
  open: "accent",
  booked: "blue",
  assigned: "warn",
  inTransit: "signal",
  delivered: "green",
  cancelled: "neutral",
};

export function StatusChip({ status, className }: { status: LoadStatus; className?: string }) {
  const { d } = useI18n();
  return (
    <Chip tone={STATUS_TONE[status]} className={className}>
      <span className={cn("size-1.5 rounded-full bg-current", status === "inTransit" && "animate-pulse")} />
      {d.status[status]}
    </Chip>
  );
}

const ECO: Record<EcoLabel, string> = {
  "0": "bg-[#1f6fd6] text-white",
  ECO: "bg-[linear-gradient(90deg,#1f9e4a_50%,#1f6fd6_50%)] text-white",
  C: "bg-[#1f9e4a] text-white",
  B: "bg-[#f1c40f] text-[#3b2f00]",
  none: "bg-surface-3 text-ink-2",
};

/** The Spanish DGT environmental sticker. Only Spanish plates carry one: check hasDgtLabel(vehicle) first. */
export function EcoBadge({ label, className }: { label: EcoLabel; className?: string }) {
  const { d } = useI18n();
  return (
    <span
      title={label === "none" ? d.common.noEcoLabel : d.common.ecoLabel.replace("{{label}}", label)}
      className={cn("inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[0.62rem] font-extrabold tracking-tight shadow-sm ring-1 ring-black/10", ECO[label], className)}
    >
      {label === "none" ? "–" : label}
    </span>
  );
}

type Variant = "primary" | "secondary" | "ghost" | "danger" | "lime";
const VARIANT: Record<Variant, string> = {
  primary: "bg-accent text-accent-ink hover:bg-accent-hover border-transparent shadow-sm",
  secondary: "bg-surface text-ink border-line-strong hover:border-ink-3",
  ghost: "bg-transparent text-ink-2 border-transparent hover:bg-surface-2 hover:text-ink",
  danger: "bg-surface text-danger border-line-strong hover:border-danger",
  lime: "bg-lime text-lime-ink border-transparent hover:brightness-110 shadow-sm",
};
// Small buttons grow to 40px on touch screens.
const SIZE = {
  sm: "h-8 pointer-coarse:h-10 px-2.5 text-[0.8rem] gap-1.5 rounded-lg",
  md: "h-10 px-3.5 text-sm gap-2 rounded-xl",
  lg: "h-12 px-5 text-[0.95rem] gap-2 rounded-xl",
};

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: keyof typeof SIZE; busy?: boolean }>(
  function Button({ variant = "secondary", size = "md", busy, className, children, disabled, ...rest }, ref) {
    return (
      <button
        ref={ref}
        type="button"
        disabled={disabled || busy}
        className={cn(
          "inline-flex shrink-0 items-center justify-center border font-semibold whitespace-nowrap transition select-none disabled:cursor-not-allowed disabled:opacity-50",
          VARIANT[variant],
          SIZE[size],
          className,
        )}
        {...rest}
      >
        {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
        {children}
      </button>
    );
  },
);

export function Card({ className, children, as: As = "div" }: { className?: string; children: ReactNode; as?: "div" | "section" | "article" | "aside" }) {
  return <As className={cn("rounded-2xl border border-line bg-surface shadow-card", className)}>{children}</As>;
}

export function SectionTitle({ children, aside, className }: { children: ReactNode; aside?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-center justify-between gap-3", className)}>
      <h2 className="text-[0.8rem] font-bold tracking-wide text-ink-3 uppercase">{children}</h2>
      {aside}
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  className,
  size = "md",
  label,
}: {
  value: T;
  options: { value: T; label: ReactNode; title?: string }[];
  onChange: (v: T) => void;
  className?: string;
  size?: "sm" | "md";
  label?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn("inline-flex max-w-full gap-0.5 overflow-x-auto rounded-xl border border-line bg-surface-2 p-0.5 scrollbar-thin", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          title={o.title}
          onClick={() => onChange(o.value)}
          className={cn(
            // Inset focus ring: the scrolling container would clip one drawn outside.
            "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-[0.6rem] font-semibold whitespace-nowrap text-ink-2 transition hover:text-ink focus-visible:outline-offset-[-2px]",
            size === "sm" ? "h-7 px-2.5 text-[0.75rem] pointer-coarse:h-10" : "h-8 px-3 text-[0.8rem] pointer-coarse:h-10",
            o.value === value && "bg-surface text-ink shadow-sm ring-1 ring-line",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Switch({ checked, onChange, label, icon, className }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; icon?: ReactNode; className?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn("flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm text-ink-2 transition hover:bg-surface-2 hover:text-ink pointer-coarse:py-2.5", className)}
    >
      {icon}
      {/* Wraps rather than truncates: labels carry surcharges like "(+25%)". */}
      <span className="min-w-0 flex-1 leading-snug text-pretty">{label}</span>
      {/* The off track stays visible (3:1) on white and dark surfaces. */}
      <span className={cn("relative h-5 w-9 shrink-0 rounded-full transition", checked ? "bg-accent" : "bg-ink-3/70")}>
        <span className={cn("absolute top-0.5 left-0.5 size-4 rounded-full bg-white shadow transition", checked && "translate-x-4")} />
      </span>
    </button>
  );
}

export function Field({ label, hint, children, className }: { label: ReactNode; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={cn("block min-w-0", className)}>
      <span className="mb-1.5 block text-[0.8rem] font-semibold text-ink-2">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-ink-3">{hint}</span> : null}
    </label>
  );
}

export const inputClass =
  "h-10 w-full min-w-0 rounded-xl border border-line-strong bg-surface px-3 text-sm text-ink outline-none transition placeholder:text-ink-3 focus:border-accent focus:ring-2 focus:ring-accent/25";

const TEXT: Record<Tone, string> = {
  neutral: "text-ink",
  accent: "text-accent-text",
  signal: "text-signal",
  lime: "text-lime",
  violet: "text-violet",
  green: "text-green",
  warn: "text-warn",
  danger: "text-danger",
  blue: "text-blue",
};

export function Stat({ label, value, sub, tone, className }: { label: ReactNode; value: ReactNode; sub?: ReactNode; tone?: Tone; className?: string }) {
  return (
    <div className={cn("min-w-0 rounded-xl border border-line bg-surface px-3 py-2.5", className)}>
      <div className="truncate text-[0.72rem] font-semibold text-ink-3">{label}</div>
      <div className={cn("tnum mt-0.5 truncate text-xl font-extrabold tracking-tight text-ink", tone && TEXT[tone])}>{value}</div>
      {sub ? <div className="truncate text-xs text-ink-3">{sub}</div> : null}
    </div>
  );
}

export function Spinner({ label, className }: { label?: string; className?: string }) {
  return (
    <div className={cn("flex items-center justify-center gap-2 text-sm text-ink-3", className)}>
      <Loader2 className="size-4 animate-spin" aria-hidden />
      {label}
    </div>
  );
}

export function Empty({ children, icon, className }: { children: ReactNode; icon?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-line-strong px-4 py-10 text-center text-sm text-ink-3", className)}>
      {icon}
      {children}
    </div>
  );
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** A panel that slides up from the bottom on phones and sits on the right on desktop. */
export function Sheet({ open, onClose, title, children, className }: { open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode; className?: string }) {
  const { d } = useI18n();
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  // Callers pass inline closures and re-render every second with the market clock;
  // an effect event reads the latest one without re-running the effect below.
  const close = useEffectEvent(() => onClose());
  useEffect(() => {
    if (!open) return;
    // Focus moves in once when the sheet opens and goes back to whatever opened it when it closes.
    const opener = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
    const onKey = (e: KeyboardEvent) => {
      const box = ref.current;
      if (e.key === "Escape") close();
      else if (e.key === "Tab" && box) {
        // aria-modal: Tab and Shift+Tab cycle inside the sheet.
        const items = [...box.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.getClientRects().length > 0);
        const first = items[0];
        const last = items[items.length - 1];
        const at = document.activeElement;
        if (!first || !last) {
          e.preventDefault();
          box.focus();
        } else if (e.shiftKey && (at === first || at === box || !box.contains(at))) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && (at === last || !box.contains(at))) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    ref.current?.focus();
    return () => {
      window.removeEventListener("keydown", onKey);
      if (opener?.isConnected) opener.focus();
    };
  }, [open]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-stretch md:justify-end">
      <button type="button" tabIndex={-1} aria-label={d.common.close} className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} />
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        className={cn(
          "relative flex max-h-[88dvh] w-full flex-col overflow-hidden rounded-t-3xl border border-line bg-surface shadow-2xl outline-none md:max-h-none md:w-[30rem] md:rounded-none md:rounded-l-3xl",
          className,
        )}
      >
        <div className="flex items-center gap-3 border-b border-line px-5 py-2">
          <div id={titleId} className="min-w-0 flex-1 truncate font-bold text-ink">
            {title}
          </div>
          <button type="button" onClick={onClose} className="-mr-1.5 rounded-lg p-2.5 text-ink-3 transition hover:bg-surface-2 hover:text-ink" aria-label={d.common.close}>
            <X className="size-5" aria-hidden />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain scrollbar-thin">{children}</div>
      </div>
    </div>
  );
}

/** Thin progress bar. */
export function Progress({ value, tone = "signal", className }: { value: number; tone?: "signal" | "accent" | "lime" | "violet"; className?: string }) {
  const bg = { signal: "bg-signal", accent: "bg-accent", lime: "bg-lime", violet: "bg-violet" }[tone];
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-surface-3", className)}>
      <div className={cn("h-full rounded-full transition-[width] duration-700", bg)} style={{ width: `${Math.round(Math.min(1, Math.max(0, value)) * 100)}%` }} />
    </div>
  );
}
