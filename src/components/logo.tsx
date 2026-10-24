import { cn } from "@/lib/utils";

/** The mark: a route that zig-zags like a Z, orange where it starts, lime where it ends. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("size-8", className)} aria-hidden>
      <rect width="32" height="32" rx="9" className="fill-accent" />
      <path d="M9.5 10.5h13L9.5 21.5h13" fill="none" stroke="var(--z-accent-ink)" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="9.5" cy="10.5" r="2.6" fill="var(--z-signal)" stroke="var(--z-accent-ink)" strokeWidth="1.2" />
      <circle cx="22.5" cy="21.5" r="2.6" fill="var(--z-lime)" stroke="var(--z-accent-ink)" strokeWidth="1.2" />
    </svg>
  );
}

export function Logo({ className, tagline }: { className?: string; tagline?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark />
      <span className="flex flex-col leading-none">
        <span className="text-[1.05rem] font-extrabold tracking-tight text-ink">Zama</span>
        {tagline ? <span className="mt-1 hidden text-[0.68rem] font-medium text-ink-3 sm:block">{tagline}</span> : null}
      </span>
    </span>
  );
}
