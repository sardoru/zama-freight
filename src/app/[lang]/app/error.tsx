"use client";

// Fallback for a screen that throws while rendering (issue #5). It renders
// inside the app shell, so the top bar, the navigation and the ⋯ menu stay
// usable. "Reset demo" is the way out when a bad saved state makes the screen
// throw again on every retry.
import { Home, RotateCcw, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import { Button } from "@/components/ui";
import { useI18n } from "@/i18n/client";
import { fill } from "@/lib/utils";

/** Saved demo state: "zama-demo-v1" today; any later version shares the prefix. */
const DEMO_PREFIX = "zama-demo-";

function clearSavedDemo() {
  try {
    for (const key of Object.keys(localStorage)) if (key.startsWith(DEMO_PREFIX)) localStorage.removeItem(key);
  } catch {
    /* storage blocked: nothing was saved, so there is nothing to clear */
  }
}

export default function AppError({ error, retry }: { error: unknown; retry: () => void }) {
  const { lang, d } = useI18n();
  const digest = error instanceof Error && "digest" in error && typeof error.digest === "string" ? error.digest : null;

  useEffect(() => {
    console.error(error);
  }, [error]);

  const reset = () => {
    clearSavedDemo();
    // The store writes its state back on `pagehide`; this listener runs after it.
    window.addEventListener("pagehide", clearSavedDemo);
    window.location.reload();
  };

  return (
    <div className="grid min-h-full place-items-center px-4 py-12 pb-[calc(6rem+env(safe-area-inset-bottom))] md:pb-12">
      <div role="alert" className="w-full max-w-md rounded-2xl border border-line bg-surface p-6 text-center shadow-card">
        <span className="mx-auto inline-flex size-12 items-center justify-center rounded-2xl bg-warn-soft text-warn">
          <TriangleAlert className="size-6" aria-hidden />
        </span>
        <h1 className="mt-4 text-xl font-extrabold tracking-tight text-balance text-ink">{d.errorPage.title}</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-2">{d.errorPage.body}</p>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Button variant="primary" onClick={() => retry()}>
            <RotateCcw className="size-4" aria-hidden />
            {d.errorPage.retry}
          </Button>
          <Button variant="danger" onClick={reset}>
            {d.common.reset}
          </Button>
        </div>
        <Link href={`/${lang}`} className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-accent-text hover:underline">
          <Home className="size-4" aria-hidden />
          {d.nav.home}
        </Link>
        {digest ? <p className="mt-4 font-mono text-[0.7rem] text-ink-3">{fill(d.errorPage.code, { digest })}</p> : null}
      </div>
    </div>
  );
}
